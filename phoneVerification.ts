import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Express, Request, Response } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Limits (change them here) ----
export const CODE_TTL_MS = 10 * 60 * 1000; // a code is valid for 10 minutes
export const MAX_ATTEMPTS = 5; // wrong guesses allowed per code
export const MAX_CODES_PER_USER_PER_HOUR = 3;
export const MAX_CODES_PER_USER_PER_DAY = 10;
export const MAX_CODES_PER_PHONE_PER_HOUR = 3;
export const MAX_CODES_PER_DAY_OVERALL = 100; // protects your Twilio balance

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const E164 = /^\+[1-9]\d{6,14}$/;

export interface FirebaseServerConfig {
  projectId: string;
  firestoreDatabaseId: string;
}

export interface PhoneVerificationOptions {
  firebase?: FirebaseServerConfig;
  now?: () => number;
  env?: Record<string, string | undefined>;
}

class HttpError extends Error {
  status: number;
  code: string;
  extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  new HttpError(status, code, message, extra);

// ---------------------------------------------------------------------------
// Firebase ID token verification (RS256 against Google's public certificates)
// ---------------------------------------------------------------------------
let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;
let lastForcedCertFetch = 0;

export function resetCertCache(): void {
  certCache = null;
  lastForcedCertFetch = 0;
}

async function getCerts(force: boolean, nowMs: number): Promise<Record<string, string>> {
  if (!force && certCache && certCache.expiresAt > nowMs) return certCache.certs;
  if (force && nowMs - lastForcedCertFetch < 60_000 && certCache) return certCache.certs;
  if (force) lastForcedCertFetch = nowMs;
  const res = await fetch(CERT_URL);
  if (!res.ok) throw fail(503, 'auth_unavailable', 'Could not check your sign-in right now. Please try again.');
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] ?? 3600);
  const certs = (await res.json()) as Record<string, string>;
  certCache = { certs, expiresAt: nowMs + maxAge * 1000 };
  return certs;
}

export async function verifyFirebaseIdToken(
  token: string,
  cfg: FirebaseServerConfig,
  nowMs: number = Date.now()
): Promise<{ uid: string }> {
  const bad = (msg: string) => fail(401, 'unauthorized', msg);
  const parts = token.split('.');
  if (parts.length !== 3) throw bad('Please sign in again.');
  let header: any;
  let payload: any;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw bad('Please sign in again.');
  }
  if (header?.alg !== 'RS256' || typeof header?.kid !== 'string') throw bad('Please sign in again.');

  let cert = (await getCerts(false, nowMs))[header.kid];
  if (!cert) cert = (await getCerts(true, nowMs))[header.kid];
  if (!cert) throw bad('Please sign in again.');

  let valid = false;
  try {
    valid = crypto.createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(cert, Buffer.from(parts[2], 'base64url'));
  } catch {
    valid = false;
  }
  if (!valid) throw bad('Please sign in again.');

  const nowSec = Math.floor(nowMs / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) throw bad('Your sign-in has expired. Please sign in again.');
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 60) throw bad('Please sign in again.');
  if (payload.aud !== cfg.projectId) throw bad('Please sign in again.');
  if (payload.iss !== `https://securetoken.google.com/${cfg.projectId}`) throw bad('Please sign in again.');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw bad('Please sign in again.');
  return { uid: payload.sub };
}

// ---------------------------------------------------------------------------
// Signed challenges and proofs (no server-side storage needed)
// ---------------------------------------------------------------------------
const signingKey = (env: Record<string, string | undefined>) =>
  crypto.createHmac('sha256', 'semester-phone-verify-v1').update(env.TWILIO_AUTH_TOKEN || '').digest();
const sign = (key: Buffer, label: string, data: string) =>
  crypto.createHmac('sha256', key).update(`${label}|${data}`).digest('base64url');
const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');

interface ChallengePayload { v: 1; cid: string; uid: string; phone: string; exp: number; h: string }

function makeChallenge(key: Buffer, p: { cid: string; uid: string; phone: string; exp: number; code: string }): string {
  const payload: ChallengePayload = { v: 1, cid: p.cid, uid: p.uid, phone: p.phone, exp: p.exp, h: sign(key, 'code', `${p.cid}|${p.code}`) };
  const body = b64(payload);
  return `${body}.${sign(key, 'challenge', body)}`;
}

function readChallenge(key: Buffer, token: unknown): ChallengePayload | null {
  if (typeof token !== 'string') return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || !safeEqual(sig, sign(key, 'challenge', body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p?.v === 1 && typeof p.cid === 'string' && typeof p.uid === 'string' && typeof p.phone === 'string' && typeof p.exp === 'number' && typeof p.h === 'string' ? p : null;
  } catch {
    return null;
  }
}

function createProof(key: Buffer, uid: string, phone: string, at: number): string {
  const body = b64({ v: 1, uid, phone, at });
  return `${body}.${sign(key, 'proof', body)}`;
}

/** For the future reminder sender: true only if this proof was issued by this server for this account and number. */
export function verifyPhoneProof(proof: unknown, uid: string, phone: string, env: Record<string, string | undefined> = process.env): boolean {
  if (typeof proof !== 'string' || !env.TWILIO_AUTH_TOKEN) return false;
  const [body, sig, extra] = proof.split('.');
  if (!body || !sig || extra !== undefined || !safeEqual(sig, sign(signingKey(env), 'proof', body))) return false;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p?.v === 1 && p.uid === uid && p.phone === phone;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Twilio (called directly over HTTPS; the credentials never leave the server)
// ---------------------------------------------------------------------------
function twilioMessage(code: number | undefined, raw: string | undefined): string {
  switch (code) {
    case 21608: return 'Twilio could not text this number. A trial Twilio account can only text numbers you have verified in the Twilio console.';
    case 21211: return 'Twilio says this phone number is not valid. Check the number in your settings.';
    case 21614: return 'Twilio says this number cannot receive text messages.';
    case 21408: return 'Twilio has not enabled texting to this country for your account. Check Geo permissions in the Twilio console.';
    case 21610: return 'This number has opted out of texts from your Twilio number (it replied STOP).';
    case 20003: return 'Twilio rejected the account credentials. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Secrets.';
    case 21606:
    case 21212:
    case 21659: return 'Twilio says the sending number cannot send texts. Check TWILIO_PHONE_NUMBER in Secrets.';
    default: return `Twilio could not send the text${raw ? `: ${String(raw).slice(0, 200)}` : '.'}`;
  }
}

async function sendSms(env: Record<string, string | undefined>, to: string, body: string): Promise<void> {
  const names = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
  const missing = names.filter((n) => !env[n]);
  if (missing.length) {
    throw fail(503, 'twilio_not_configured', `Texting is not set up yet. Missing secret${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  }
  const sid = env.TWILIO_ACCOUNT_SID as string;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: env.TWILIO_PHONE_NUMBER as string, Body: body }).toString(),
  });
  if (!res.ok) {
    const data: any = await res.json().catch(() => ({}));
    throw fail(502, 'twilio_error', `${twilioMessage(data?.code, data?.message)}${data?.code ? ` (Twilio error ${data.code})` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Reading the student's saved number with THEIR OWN token (database rules apply)
// ---------------------------------------------------------------------------
async function readSavedSettings(cfg: FirebaseServerConfig, uid: string, idToken: string): Promise<{ phoneNumber: string; consent: boolean } | null> {
  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}` +
    `/databases/${encodeURIComponent(cfg.firestoreDatabaseId)}/documents/users/${encodeURIComponent(uid)}/notificationSettings/settings`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw fail(502, 'settings_unreadable', `Could not read your saved settings (status ${res.status}). Please try again.`);
  const doc: any = await res.json();
  const f = doc?.fields || {};
  return { phoneNumber: f.phoneNumber?.stringValue ?? '', consent: f.consent?.booleanValue === true };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
function loadFirebaseConfig(): FirebaseServerConfig {
  const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8'));
  return { projectId: raw.projectId, firestoreDatabaseId: raw.firestoreDatabaseId || '(default)' };
}

export function registerPhoneRoutes(app: Express, options: PhoneVerificationOptions = {}): void {
  const now = options.now ?? (() => Date.now());
  const getEnv = () => options.env ?? process.env;
  let cfg: FirebaseServerConfig | undefined = options.firebase;

  const attempts = new Map<string, { n: number; exp: number }>();
  const byUser = new Map<string, number[]>();
  const byPhone = new Map<string, number[]>();
  let overall: number[] = [];

  const within = (list: number[] | undefined, windowMs: number, t: number) => (list ?? []).filter((x) => t - x < windowMs);
  const retryAfter = (list: number[], windowMs: number, t: number) => Math.max(1, Math.ceil((Math.min(...list) + windowMs - t) / 1000));

  const handle = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await fn(req, res);
    } catch (err: any) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
      } else {
        console.error('Phone verification error:', err?.message || err);
        res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'server_error' });
      }
    }
  };

  const authenticate = async (req: Request) => {
    cfg = cfg ?? loadFirebaseConfig();
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) throw fail(401, 'unauthorized', 'Please sign in to verify your number.');
    const { uid } = await verifyFirebaseIdToken(m[1], cfg, now());
    return { uid, idToken: m[1], cfg };
  };

  app.post('/api/phone/start', handle(async (req, res) => {
    const { uid } = await authenticate(req);
    const env = getEnv();
    const t = now();

    const rawPhone = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim() : '';
    if (!rawPhone || !E164.test(rawPhone)) {
      throw fail(400, 'invalid_phone_number', 'Please provide a valid phone number in international format (e.g. +15551234567).');
    }
    const phone = rawPhone;

    // Rate limits
    const userList = within(byUser.get(uid), DAY, t);
    const userHour = within(userList, HOUR, t);
    const phoneHour = within(byPhone.get(phone), HOUR, t);
    overall = within(overall, DAY, t);
    if (userHour.length >= MAX_CODES_PER_USER_PER_HOUR) throw fail(429, 'rate_limited', 'You have requested too many codes this hour. Please try again later.', { retryAfterSeconds: retryAfter(userHour, HOUR, t) });
    if (userList.length >= MAX_CODES_PER_USER_PER_DAY) throw fail(429, 'rate_limited', 'You have reached the daily limit for verification codes. Please try again tomorrow.', { retryAfterSeconds: retryAfter(userList, DAY, t) });
    if (phoneHour.length >= MAX_CODES_PER_PHONE_PER_HOUR) throw fail(429, 'rate_limited', 'Too many codes have been sent to this number. Please try again later.', { retryAfterSeconds: retryAfter(phoneHour, HOUR, t) });
    if (overall.length >= MAX_CODES_PER_DAY_OVERALL) throw fail(429, 'rate_limited', 'Verification texts are paused for today. Please try again tomorrow.', { retryAfterSeconds: retryAfter(overall, DAY, t) });

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const cid = crypto.randomBytes(12).toString('hex');
    const exp = t + CODE_TTL_MS;
    await sendSms(env, phone, `Your verification code is ${code}. It expires in 10 minutes.`);

    byUser.set(uid, [...userList, t]);
    byPhone.set(phone, [...phoneHour, t]);
    overall.push(t);
    res.json({
      challenge: makeChallenge(signingKey(env), { cid, uid, phone, exp, code }),
      expiresInSeconds: Math.round(CODE_TTL_MS / 1000),
      phoneLast4: phone.slice(-4),
    });
  }));

  app.post('/api/phone/check', handle(async (req, res) => {
    const { uid } = await authenticate(req);
    const env = getEnv();
    const t = now();
    const key = signingKey(env);
    const { challenge, code } = (req.body ?? {}) as { challenge?: unknown; code?: unknown };

    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw fail(400, 'bad_code_format', 'Enter the 6-digit code from the text message.');
    if (!env.TWILIO_AUTH_TOKEN) throw fail(503, 'twilio_not_configured', 'Texting is not set up yet. Missing secret: TWILIO_AUTH_TOKEN.');
    const p = readChallenge(key, challenge);
    if (!p || p.uid !== uid) throw fail(400, 'invalid_challenge', 'This code request is not valid. Please request a new code.');
    if (t > p.exp) throw fail(400, 'expired', 'That code has expired. Please request a new one.');

    // Forget old entries, then count this attempt
    for (const [k, v] of attempts) if (v.exp < t) attempts.delete(k);
    const used = attempts.get(p.cid)?.n ?? 0;
    if (used >= MAX_ATTEMPTS) throw fail(429, 'too_many_attempts', 'Too many incorrect attempts. Please request a new code.');
    attempts.set(p.cid, { n: used + 1, exp: p.exp });

    if (!safeEqual(sign(key, 'code', `${p.cid}|${code}`), p.h)) {
      const left = MAX_ATTEMPTS - (used + 1);
      throw fail(400, 'wrong_code', left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect attempts. Please request a new code.', { attemptsLeft: left });
    }

    attempts.delete(p.cid);
    res.json({ verified: true, proof: createProof(key, uid, p.phone, t), phoneLast4: p.phone.slice(-4), phone: p.phone });
  }));
}