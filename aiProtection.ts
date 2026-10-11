import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { verifyFirebaseIdToken, FirebaseServerConfig } from './phoneVerification.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Per-Student AI Rate Limits Configuration
// Configure your AI usage limits here in one place:
// ============================================================================
export const AI_RATE_LIMITS = {
  MAX_REQUESTS_PER_10_MINUTES: 30, // Primary rate limit: 30 requests per 10 minutes
  WINDOW_10_MIN_MS: 10 * 60 * 1000,
  MAX_REQUESTS_PER_MINUTE: 10, // Burst limit: 10 requests per minute
  WINDOW_1_MIN_MS: 60 * 1000,
  MAX_REQUESTS_PER_DAY: 100, // Daily quota: 100 requests per day
  WINDOW_1_DAY_MS: 24 * 60 * 60 * 1000,
};

export const EXAM_PREP_RATE_LIMITS = {
  MAX_REQUESTS_PER_HOUR: 10, // 10 generations per hour per student
  WINDOW_1_HOUR_MS: 60 * 60 * 1000,
};

interface StudentAiUsage {
  timestamps: number[];
}

const usageByStudent = new Map<string, StudentAiUsage>();
const examPrepUsageByStudent = new Map<string, StudentAiUsage>();

export interface RateLimitCheckResult {
  allowed: boolean;
  message?: string;
  retryAfterSeconds?: number;
}

/**
 * Checks if the student is within the AI rate limits and records the request if allowed.
 * Returns a friendly, informative message stating when they can try again if a limit is hit.
 */
export function checkAndRecordAiRequest(
  studentId: string,
  nowMs: number = Date.now()
): RateLimitCheckResult {
  const usage = usageByStudent.get(studentId) || { timestamps: [] };

  // Retain only requests within the 24-hour window
  const dayTimestamps = usage.timestamps.filter((t) => nowMs - t < AI_RATE_LIMITS.WINDOW_1_DAY_MS);
  const tenMinuteTimestamps = dayTimestamps.filter((t) => nowMs - t < AI_RATE_LIMITS.WINDOW_10_MIN_MS);
  const minuteTimestamps = tenMinuteTimestamps.filter((t) => nowMs - t < AI_RATE_LIMITS.WINDOW_1_MIN_MS);

  // 1. Check 1-minute burst limit
  if (minuteTimestamps.length >= AI_RATE_LIMITS.MAX_REQUESTS_PER_MINUTE) {
    const oldestInMinute = Math.min(...minuteTimestamps);
    const waitMs = oldestInMinute + AI_RATE_LIMITS.WINDOW_1_MIN_MS - nowMs;
    const secondsLeft = Math.max(1, Math.ceil(waitMs / 1000));
    return {
      allowed: false,
      retryAfterSeconds: secondsLeft,
      message: `You've reached your burst limit of ${AI_RATE_LIMITS.MAX_REQUESTS_PER_MINUTE} AI requests per minute. Please try again in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}.`,
    };
  }

  // 2. Check 10-minute rate limit (30 requests per 10 minutes)
  if (tenMinuteTimestamps.length >= AI_RATE_LIMITS.MAX_REQUESTS_PER_10_MINUTES) {
    const oldestIn10Min = Math.min(...tenMinuteTimestamps);
    const waitMs = oldestIn10Min + AI_RATE_LIMITS.WINDOW_10_MIN_MS - nowMs;
    const retrySeconds = Math.max(1, Math.ceil(waitMs / 1000));
    const minutesLeft = Math.ceil(retrySeconds / 60);
    const timeStr =
      retrySeconds < 60
        ? `${retrySeconds} second${retrySeconds === 1 ? '' : 's'}`
        : `${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}`;

    return {
      allowed: false,
      retryAfterSeconds: retrySeconds,
      message: `You've reached your limit of ${AI_RATE_LIMITS.MAX_REQUESTS_PER_10_MINUTES} AI requests per 10 minutes. Please try again in ${timeStr}.`,
    };
  }

  // 3. Check 24-hour daily limit
  if (dayTimestamps.length >= AI_RATE_LIMITS.MAX_REQUESTS_PER_DAY) {
    const oldestInDay = Math.min(...dayTimestamps);
    const waitMs = oldestInDay + AI_RATE_LIMITS.WINDOW_1_DAY_MS - nowMs;
    const retrySeconds = Math.max(1, Math.ceil(waitMs / 1000));
    const hoursLeft = Math.floor(waitMs / (60 * 60 * 1000));
    const minutesLeft = Math.ceil((waitMs % (60 * 60 * 1000)) / (60 * 1000));
    const timeStr =
      hoursLeft > 0
        ? `${hoursLeft} hour${hoursLeft === 1 ? '' : 's'} and ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}`
        : `${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}`;

    return {
      allowed: false,
      retryAfterSeconds: retrySeconds,
      message: `You've reached your daily limit of ${AI_RATE_LIMITS.MAX_REQUESTS_PER_DAY} AI requests. Please try again in ${timeStr}.`,
    };
  }

  // Record this request
  dayTimestamps.push(nowMs);
  usageByStudent.set(studentId, { timestamps: dayTimestamps });

  return { allowed: true };
}

export function checkAndRecordExamPrepLimit(
  studentId: string,
  nowMs: number = Date.now()
): RateLimitCheckResult {
  const usage = examPrepUsageByStudent.get(studentId) || { timestamps: [] };
  const hourTimestamps = usage.timestamps.filter((t) => nowMs - t < EXAM_PREP_RATE_LIMITS.WINDOW_1_HOUR_MS);

  if (hourTimestamps.length >= EXAM_PREP_RATE_LIMITS.MAX_REQUESTS_PER_HOUR) {
    const oldest = Math.min(...hourTimestamps);
    const waitMs = oldest + EXAM_PREP_RATE_LIMITS.WINDOW_1_HOUR_MS - nowMs;
    const retrySeconds = Math.max(1, Math.ceil(waitMs / 1000));
    const minutesLeft = Math.ceil(retrySeconds / 60);

    return {
      allowed: false,
      retryAfterSeconds: retrySeconds,
      message: `You've reached your limit of ${EXAM_PREP_RATE_LIMITS.MAX_REQUESTS_PER_HOUR} exam prep generations per hour. Please try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
    };
  }

  hourTimestamps.push(nowMs);
  examPrepUsageByStudent.set(studentId, { timestamps: hourTimestamps });
  return { allowed: true };
}

export function resetStudentAiLimits(studentId?: string): void {
  if (studentId) {
    usageByStudent.delete(studentId);
    examPrepUsageByStudent.delete(studentId);
  } else {
    usageByStudent.clear();
    examPrepUsageByStudent.clear();
  }
}

let cachedCfg: FirebaseServerConfig | null = null;
export function getFirebaseConfig(): FirebaseServerConfig {
  if (cachedCfg) return cachedCfg;
  const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8'));
  cachedCfg = { projectId: raw.projectId, firestoreDatabaseId: raw.firestoreDatabaseId || '(default)' };
  return cachedCfg;
}

/**
 * Initializes and returns the Firebase Admin Auth instance.
 */
function getAdminAuth() {
  const cfg = getFirebaseConfig();
  const app = getApps().length
    ? getApp()
    : initializeApp({ projectId: cfg.projectId });
  return getAuth(app);
}

/**
 * Verifies a Firebase ID token using the Firebase Admin SDK.
 * Throws a 401 error with a friendly message if missing, invalid, or expired.
 */
export async function authenticateStudent(
  token: string | undefined | null
): Promise<{ uid: string }> {
  if (!token || typeof token !== 'string' || !token.trim()) {
    const err: any = new Error('Please sign in to use Apodict AI features.');
    err.status = 401;
    err.code = 'unauthorized';
    throw err;
  }
  const cleanToken = token.trim();
  try {
    const decodedToken = await getAdminAuth().verifyIdToken(cleanToken);
    return { uid: decodedToken.uid };
  } catch (adminErr: any) {
    // If Firebase Admin throws an auth error, try fallback public key verification before rejecting
    try {
      return await verifyFirebaseIdToken(cleanToken, getFirebaseConfig());
    } catch {
      const error: any = new Error(adminErr.message || 'Your sign-in has expired or is invalid. Please sign in again.');
      error.status = 401;
      error.code = 'unauthorized';
      throw error;
    }
  }
}

/**
 * Express middleware to protect HTTP routes calling Gemini.
 * Verifies the student's Firebase ID token via Firebase Admin SDK and applies per-student rate limits.
 */
export const requireStudentAiAuthAndRateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Please sign in to use Apodict AI features. Missing Authorization Bearer token.',
      code: 'unauthorized',
    });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({
      error: 'Please sign in to use Apodict AI features. Bearer token is empty.',
      code: 'unauthorized',
    });
  }

  let studentId: string;
  try {
    const authResult = await authenticateStudent(token);
    studentId = authResult.uid;
    (req as any).studentId = studentId;
  } catch (err: any) {
    return res.status(err.status || 401).json({
      error: err.message || 'Your sign-in has expired or is invalid. Please sign in again.',
      code: 'unauthorized',
    });
  }

  const check = checkAndRecordAiRequest(studentId);
  if (!check.allowed) {
    if (check.retryAfterSeconds) {
      res.setHeader('Retry-After', String(check.retryAfterSeconds));
    }
    return res.status(429).json({
      error: check.message,
      code: 'rate_limited',
      retryAfterSeconds: check.retryAfterSeconds,
    });
  }

  next();
};
