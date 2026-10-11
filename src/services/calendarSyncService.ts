import { Course, Deadline, AssignmentPlan, Milestone } from '../types/academic';
import { 
  auth, 
  db, 
  doc, 
  getDoc, 
  setDoc, 
  GoogleAuthProvider, 
  signInWithPopup 
} from './firebase';

export type CalendarSyncStatus = 
  | 'connected' 
  | 'syncing' 
  | 'up_to_date' 
  | 'needs_reconnecting' 
  | 'disconnected' 
  | 'error';

export interface CalendarSyncSettings {
  calendarId: string | null;
  accountEmail: string | null;
  lastSyncedAt: string | null;
  courseToggles: Record<string, boolean>; // courseId -> boolean (default true)
  includeMilestones: boolean; // default false
  reminderMinutes: number | null; // null = None, 900 = 1 day 9am, 2340 = 2 days 9am, 9540 = 1 week 9am
  status: CalendarSyncStatus;
  errorMessage?: string | null;
  skippedDeadlinesCount?: number;
  syncMode?: 'replace' | 'add';
  knownCalendarIds?: string[]; // every Apodict calendar this app has created (so extras can be cleaned up)
}

export type SyncRunMode = 'replace' | 'add' | 'reconcile';

export interface SyncRunOptions {
  mode?: SyncRunMode; // 'reconcile' = normal background update (default)
  onProgress?: (text: string) => void;
}

export interface SyncStats {
  created: number;
  skipped: number;
  removed: number;
  removeFailed?: number;
  calendarsRemoved?: number;
  listUnavailable?: boolean; // Google would not let us read the calendar list (permission not granted yet)
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSyncSettings = {
  calendarId: null,
  accountEmail: null,
  lastSyncedAt: null,
  courseToggles: {},
  includeMilestones: false,
  reminderMinutes: 900, // Default: 1 day before at 9:00 AM
  status: 'disconnected',
  errorMessage: null,
  skippedDeadlinesCount: 0,
  syncMode: 'replace',
  knownCalendarIds: [],
};

export const CALENDAR_OAUTH_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
// Read-only list of calendar names (no events), used to find and remove duplicate Apodict calendars
export const CALENDAR_LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';

// IN-MEMORY ACCESS TOKEN: Never written to localStorage, Firestore, or logs. Never sent to backend.
let inMemoryAccessToken: string | null = null;
let tokenExpiresAt = 0;
let pendingQueuedChanges = false;

// Listeners for sync status updates
type SyncListener = (settings: CalendarSyncSettings) => void;
const listeners = new Set<SyncListener>();

// DataStore synchronization hooks to prevent race conditions
let dataStoreStabilizationHook: (() => Promise<void>) | null = null;
let dataStoreCoursesProvider: (() => Promise<Course[]>) | null = null;
let activeSyncAllPromise: Promise<any> | null = null;

export function registerDataStoreHooks(hooks: {
  awaitStabilization: () => Promise<void>;
  getCourses: () => Promise<Course[]>;
}) {
  dataStoreStabilizationHook = hooks.awaitStabilization;
  dataStoreCoursesProvider = hooks.getCourses;
}

// In-memory copy of the settings so the Calendar tab opens instantly and updates immediately.
let settingsCache: { uid: string; data: CalendarSyncSettings } | null = null;

function notifyListeners(settings: CalendarSyncSettings) {
  listeners.forEach((fn) => {
    try {
      fn({ ...settings });
    } catch (e) {
      console.error('Error notifying sync listener:', e);
    }
  });
}

export function subscribeCalendarSync(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Checks if the in-memory access token is present and not expired
 */
export function hasValidToken(): boolean {
  return Boolean(inMemoryAccessToken && Date.now() < tokenExpiresAt - 60000);
}

export function getInMemoryAccessToken(): string | null {
  return hasValidToken() ? inMemoryAccessToken : null;
}

/**
 * Helper to calculate exclusive end-date for an all-day event
 */
function getNextDay(dateStr: string): string {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const date = new Date(Date.UTC(y, m, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split('T')[0];
}

/**
 * Direct Google Calendar API fetch from browser with retry & rate limiting
 */
async function calendarApiFetch(
  endpoint: string,
  options: RequestInit = {},
  attempt = 1
): Promise<Response> {
  if (!inMemoryAccessToken) {
    const err = new Error('No access token in memory. Needs reconnecting.');
    (err as any).isAuthError = true;
    throw err;
  }

  const url = endpoint.startsWith('https://') 
    ? endpoint 
    : `https://www.googleapis.com/calendar/v3${endpoint}`;

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  headers.set('Content-Type', 'application/json');

  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (netErr: any) {
    clearTimeout(timer);
    if (netErr?.name === 'AbortError') {
      throw new Error('Google Calendar did not respond in time. Please try again.');
    }
    if (attempt <= 2) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return calendarApiFetch(endpoint, options, attempt + 1);
    }
    throw netErr;
  }
  clearTimeout(timer);

  // Handle 401 Unauthorized (token expired)
  if (res.status === 401) {
    inMemoryAccessToken = null;
    tokenExpiresAt = 0;
    pendingQueuedChanges = true;
    const err = new Error('Google authorization expired. Needs reconnecting.');
    (err as any).isAuthError = true;
    throw err;
  }

  // Handle 403 or 429 Rate Limits / API not enabled
  if (res.status === 403 || res.status === 429) {
    const text = await res.text().catch(() => '');
    if (text.includes('accessNotConfigured') || text.includes('not been used in project') || text.includes('has not enabled')) {
      const err = new Error('Google Calendar API is not enabled in your Google Cloud project.');
      (err as any).isApiDisabled = true;
      throw err;
    }

    const isRateLimit = res.status === 429 || /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(text);
    if (!isRateLimit) {
      // A real permission problem: retrying won't help, so show Google's reason right away
      let reason = '';
      try { reason = JSON.parse(text)?.error?.message || ''; } catch {}
      throw new Error(`Google Calendar refused this request${reason ? `: ${reason}` : ''} [403]`);
    }

    if (attempt <= 3) {
      // Exponential backoff
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 600));
      return calendarApiFetch(endpoint, options, attempt + 1);
    }

    throw new Error(`Google Calendar service rate limit: ${res.statusText}`);
  }

  return res;
}

/**
 * Time + reminder fields for an event.
 * reminderMinutes >= 0 : all-day event, reminder that many minutes before midnight (e.g. 900 = 9 AM the day before)
 * reminderMinutes < 0  : Google's API cannot remind "after midnight" on all-day events, so the event becomes a short
 *                        timed event at (-minutes) after midnight (e.g. -540 = 9:00 AM) with a reminder at start time.
 */
function buildTimeAndReminders(date: string, reminderMinutes: number | null) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  if (reminderMinutes !== null && reminderMinutes < 0) {
    const startMin = -reminderMinutes;
    const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
    return {
      start: { dateTime: `${date}T${fmt(startMin)}`, timeZone: tz },
      end: { dateTime: `${date}T${fmt(Math.min(startMin + 30, 23 * 60 + 59))}`, timeZone: tz },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
    };
  }
  return {
    start: { date },
    end: { date: getNextDay(date) },
    reminders: reminderMinutes !== null
      ? { useDefault: false, overrides: [{ method: 'popup', minutes: reminderMinutes }] }
      : { useDefault: false, overrides: [] },
  };
}

/**
 * For PATCH requests: explicitly clear the fields of the other event kind (all-day vs timed),
 * so switching reminder style never leaves an event with both `date` and `dateTime`.
 */
function withClearedTimeFields(payload: any) {
  const timed = Boolean(payload?.start?.dateTime);
  return {
    ...payload,
    start: timed ? { ...payload.start, date: null } : { ...payload.start, dateTime: null, timeZone: null },
    end: timed ? { ...payload.end, date: null } : { ...payload.end, dateTime: null, timeZone: null },
  };
}

/**
 * Update an event; if Google refuses the update, replace it (delete + create) so it still ends up correct.
 */
async function patchEventOrRecreate(calendarId: string, eventId: string, payload: any): Promise<string> {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  try {
    const r = await calendarApiFetch(`${base}/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(withClearedTimeFields(payload)),
    });
    if (r.ok) return eventId;
  } catch (e: any) {
    if (e?.isAuthError) throw e;
  }
  try { await calendarApiFetch(`${base}/${encodeURIComponent(eventId)}`, { method: 'DELETE' }); } catch (e: any) { if (e?.isAuthError) throw e; }
  try {
    const c = await calendarApiFetch(base, { method: 'POST', body: JSON.stringify(payload) });
    if (c.ok) return (await c.json()).id || eventId;
  } catch (e: any) {
    if (e?.isAuthError) throw e;
  }
  return eventId;
}

/**
 * Weight text for calendar descriptions. If the item has no weight of its own, split its category's weight
 * evenly across the (non-excluded) items in that category.
 */
function describeWeight(course: Course, deadline: Deadline): string {
  if (deadline.weight !== null && deadline.weight !== undefined) {
    return `Weight: ${deadline.weight}% of final grade`;
  }
  const cat = deadline.categoryId ? (course.categories || []).find((c) => c.id === deadline.categoryId) : undefined;
  if (cat && cat.weight !== null && cat.weight !== undefined) {
    const items = course.deadlines.filter((d) => d.categoryId === cat.id && !d.excludedFromGrading);
    const n = Math.max(items.length, 1);
    const each = Math.round((cat.weight / n) * 100) / 100;
    return n > 1
      ? `Weight: about ${each}% of final grade (${cat.name}: ${cat.weight}% split across ${n} items)`
      : `Weight: ${each}% of final grade (${cat.name})`;
  }
  return 'Weight: Unstated weight';
}

/**
 * Turn a failed Google response into a readable message (includes Google's own reason)
 */
async function googleErrorText(res: Response, fallback: string): Promise<string> {
  try {
    const j = await res.clone().json();
    const msg = j?.error?.message;
    return msg ? `${fallback} (Google said: ${msg} [${res.status}])` : `${fallback} [${res.status}]`;
  } catch {
    return `${fallback} [${res.status}]`;
  }
}

/**
 * Small delay helper to pace calls in small groups
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const calendarSyncService = {
  /**
   * Load student's calendar sync settings from Firestore
   */
  async loadSettings(): Promise<CalendarSyncSettings> {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      return { ...DEFAULT_CALENDAR_SETTINGS };
    }

    const withLiveStatus = (data: CalendarSyncSettings): CalendarSyncSettings => ({
      ...DEFAULT_CALENDAR_SETTINGS,
      ...data,
      // If we lost memory token across page refresh, status shows needs_reconnecting if previously connected
      status: (data.status === 'connected' || data.status === 'up_to_date') && !hasValidToken()
        ? 'needs_reconnecting'
        : (data.status || 'disconnected'),
    });

    // Instant path: already loaded or saved this session
    if (settingsCache && settingsCache.uid === userId) {
      return withLiveStatus(settingsCache.data);
    }

    try {
      const docRef = doc(db, 'users', userId, 'calendarSync', 'config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = { ...DEFAULT_CALENDAR_SETTINGS, ...(snap.data() as Partial<CalendarSyncSettings>) };
        settingsCache = { uid: userId, data };
        return withLiveStatus(data);
      }
      settingsCache = { uid: userId, data: { ...DEFAULT_CALENDAR_SETTINGS } };
    } catch (e: any) {
      console.warn('Notice: Calendar sync settings could not be loaded from cloud (using defaults):', e?.message || e);
    }

    return { ...DEFAULT_CALENDAR_SETTINGS };
  },

  /**
   * Save student's calendar sync settings. The screen and memory update immediately;
   * the cloud write continues in the background (the Firebase SDK retries it).
   */
  async saveSettings(settings: CalendarSyncSettings): Promise<void> {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const clean = JSON.parse(JSON.stringify(settings));
    settingsCache = { uid: userId, data: clean };
    notifyListeners(settings);

    try {
      const docRef = doc(db, 'users', userId, 'calendarSync', 'config');
      setDoc(docRef, clean).catch((e) => {
        console.warn('Notice: Could not save calendar sync settings to cloud:', e);
      });
    } catch (e) {
      console.warn('Notice: Could not save calendar sync settings to cloud:', e);
    }
  },

  /**
   * Connect to Google Calendar using Google OAuth popup with minimum scope calendar.app.created
   */
  async connect(): Promise<{ email: string; isReconnect: boolean }> {
    const provider = new GoogleAuthProvider();
    provider.addScope(CALENDAR_OAUTH_SCOPE);
    provider.addScope(CALENDAR_LIST_SCOPE);
    provider.setCustomParameters({
      prompt: 'consent',
      access_type: 'online',
    });

    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);

      if (!credential?.accessToken) {
        throw new Error('Google did not grant calendar access. Please allow permission to proceed.');
      }

      inMemoryAccessToken = credential.accessToken;
      tokenExpiresAt = Date.now() + 3500 * 1000; // ~1 hour validity

      const email = result.user.email || auth.currentUser?.email || 'Student Account';
      const current = await this.loadSettings();

      const isReconnect = Boolean(current.calendarId);

      const updated: CalendarSyncSettings = {
        ...current,
        accountEmail: email,
        status: 'connected',
        errorMessage: null,
      };

      await this.saveSettings(updated);

      if (pendingQueuedChanges || isReconnect) {
        pendingQueuedChanges = false;
      }

      return { email, isReconnect };
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        throw new Error('Connection cancelled. You closed the Google sign-in window.');
      }
      if (err.code === 'auth/popup-blocked') {
        throw new Error('Sign-in popup was blocked by your browser. Please allow popups for this site and try again.');
      }
      if (err.code === 'auth/network-request-failed') {
        throw new Error('Network error during Google Calendar connection. Please check your internet connection and try again.');
      }
      throw new Error(err.message || 'Failed to authenticate with Google Calendar.');
    }
  },

  /**
   * Get or create the dedicated secondary calendar "Apodict"
   */
  async getOrCreateCalendar(existingId: string | null): Promise<{ calendarId: string; wasRecreated: boolean }> {
    if (existingId) {
      try {
        // Check via the events endpoint (always allowed for this app's own calendar)
        const checkRes = await calendarApiFetch(`/calendars/${encodeURIComponent(existingId)}/events?maxResults=1`);
        if (checkRes.ok) {
          return { calendarId: existingId, wasRecreated: false };
        }
        if (checkRes.status !== 404 && checkRes.status !== 410) {
          // Not "deleted": do NOT create another calendar (that is how duplicates pile up)
          throw new Error(await googleErrorText(checkRes, 'Could not check your Apodict calendar.'));
        }
      } catch (err: any) {
        throw err;
      }
    }

    // Create a new secondary calendar
    const createRes = await calendarApiFetch('/calendars', {
      method: 'POST',
      body: JSON.stringify({
        summary: 'Apodict',
        description: 'Academic deadlines and study plan milestones managed by Apodict.',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      }),
    });

    if (!createRes.ok) {
      const errJson = await createRes.json().catch(() => ({}));
      throw new Error(errJson.error?.message || 'Could not create Apodict calendar in Google Calendar.');
    }

    const created = await createRes.json();
    const wasRecreated = Boolean(existingId);
    return { calendarId: created.id, wasRecreated };
  },

  /**
   * Build event payload for a deadline
   */
  buildDeadlineEventPayload(course: Course, deadline: Deadline, reminderMinutes: number | null) {
    const courseLabel = (course.code && course.code.trim()) ? course.code.trim() : course.name.trim();
    const baseSummary = `${courseLabel}: ${deadline.title.trim()}`;
    const summary = deadline.completed ? `Done: ${baseSummary}` : baseSummary;

    const typeStr = (deadline.type || 'assignment').toUpperCase();
    const weightStr = describeWeight(course, deadline);

    const description = `${course.name.trim()}
Type: ${typeStr}
${weightStr}

Managed by Apodict. Changes made in the app will replace edits made here.`;

    const tr = buildTimeAndReminders(deadline.date!, reminderMinutes);

    return {
      summary,
      description,
      start: tr.start,
      end: tr.end,
      extendedProperties: {
        private: {
          courseId: course.id,
          deadlineId: deadline.id,
          app: 'semester_planner',
        },
      },
      reminders: tr.reminders,
    };
  },

  /**
   * Build event payload for a study plan milestone
   */
  buildMilestoneEventPayload(plan: AssignmentPlan, milestone: Milestone, reminderMinutes: number | null) {
    const baseSummary = `${plan.title.trim()}: ${milestone.title.trim()}`;
    const summary = milestone.completed ? `Done: ${baseSummary}` : baseSummary;

    const description = `${plan.courseName || 'Assignment Roadmap'}
Estimated Time: ${milestone.estimatedHours} hour(s)

Managed by Apodict. Changes made in the app will replace edits made here.`;

    const tr = buildTimeAndReminders(milestone.targetDate, reminderMinutes);

    return {
      summary,
      description,
      start: tr.start,
      end: tr.end,
      extendedProperties: {
        private: {
          planId: plan.id,
          milestoneId: milestone.id,
          app: 'semester_planner_milestone',
        },
      },
      reminders: tr.reminders,
    };
  },

  /**
   * Full Reconciliation (Sync Now)
   * Creates missing events, updates changed ones, removes events for deleted/disabled deadlines,
   * skips dateless deadlines, and handles study plan milestones if enabled.
   */
  async syncAll(
    courses: Course[],
    plans: AssignmentPlan[] = [],
    settingsUpdate?: Partial<CalendarSyncSettings>,
    options: SyncRunOptions = {}
  ): Promise<{ 
    updatedCourses: Course[]; 
    updatedPlans: AssignmentPlan[]; 
    settings: CalendarSyncSettings;
    recreatedNotice?: string;
    stats: SyncStats;
  }> {
    const mode: SyncRunMode = options.mode || 'reconcile';
    const progress = (t: string) => { try { options.onProgress?.(t); } catch {} };
    // If a sync is already running, wait for it rather than racing with an arbitrary delay
    while (activeSyncAllPromise) {
      try {
        await activeSyncAllPromise;
      } catch {}
    }

    const executeSync = async () => {
      // 1. Stabilize: await any in-flight course edits before reading or reconciling
      if (dataStoreStabilizationHook) {
        await dataStoreStabilizationHook();
      }

      // 2. Data Protection: If caller provided an empty courses array, check canonical provider
      let coursesToSync = courses;
      if ((!coursesToSync || coursesToSync.length === 0) && dataStoreCoursesProvider) {
        try {
          const canonical = await dataStoreCoursesProvider();
          if (canonical && canonical.length > 0) {
            coursesToSync = canonical;
          }
        } catch {}
      }

      let currentSettings = await this.loadSettings();
      if (settingsUpdate) {
        currentSettings = { ...currentSettings, ...settingsUpdate };
      }

      if (!hasValidToken()) {
        currentSettings.status = 'needs_reconnecting';
        await this.saveSettings(currentSettings);
        throw new Error('Google authorization is required. Please click Reconnect.');
      }

      // Set status to syncing
      currentSettings.status = 'syncing';
      currentSettings.errorMessage = null;
      notifyListeners(currentSettings);

      let recreatedNotice: string | undefined;

      try {
        // 1. Ensure secondary calendar exists
        const { calendarId, wasRecreated } = await this.getOrCreateCalendar(currentSettings.calendarId);
        currentSettings.calendarId = calendarId;
        const known = Array.isArray(currentSettings.knownCalendarIds) ? currentSettings.knownCalendarIds : [];
        if (!known.includes(calendarId)) {
          currentSettings.knownCalendarIds = [...known, calendarId];
        }
        if (calendarId !== settingsCache?.data.calendarId || !known.includes(calendarId)) {
          await this.saveSettings({ ...currentSettings, status: 'syncing' });
        }
        if (wasRecreated) {
          recreatedNotice = 'The Apodict calendar was recreated because it was deleted in Google Calendar.';
        }

        // 2. Fetch all existing events from the secondary calendar
        let allCalendarEvents: any[] = [];
        let pageToken: string | undefined;
        do {
          const queryParams = new URLSearchParams({
            maxResults: '250',
            singleEvents: 'true',
          });
          if (pageToken) queryParams.set('pageToken', pageToken);

          const listRes = await calendarApiFetch(
            `/calendars/${encodeURIComponent(calendarId)}/events?${queryParams.toString()}`
          );

          if (listRes.ok) {
            const data = await listRes.json();
            if (Array.isArray(data.items)) {
              allCalendarEvents = allCalendarEvents.concat(data.items);
            }
            pageToken = data.nextPageToken;
          } else {
            // Never treat a failed list as "no events": that would re-create everything and stack duplicates.
            throw new Error(await googleErrorText(listRes, 'Could not read the existing events from Google Calendar. Nothing was changed.'));
          }
        } while (pageToken);


        // ---- Replace / Add modes (user-chosen from the Calendar tab) ----
        if (mode === 'replace' || mode === 'add') {
          // Build the list of events this run wants to exist
          type Task = { kind: 'deadline' | 'milestone'; refId: string; payload: any; existingId?: string };
          const tasks: Task[] = [];
          let skippedNoDate = 0;

          const byId = new Map<string, any>();
          const byDeadline = new Map<string, any>();
          const byMilestone = new Map<string, any>();
          allCalendarEvents.forEach((ev) => {
            if (ev.id) byId.set(ev.id, ev);
            const d = ev.extendedProperties?.private?.deadlineId;
            if (d) byDeadline.set(d, ev);
            const m = ev.extendedProperties?.private?.milestoneId;
            if (m) byMilestone.set(m, ev);
          });

          for (const course of coursesToSync) {
            if (currentSettings.courseToggles[course.id] === false) continue;
            for (const dl of course.deadlines) {
              if (!dl.date) { skippedNoDate++; continue; }
              const ex = (dl.calendarEventId && byId.get(dl.calendarEventId)) || byDeadline.get(dl.id);
              tasks.push({
                kind: 'deadline',
                refId: dl.id,
                payload: this.buildDeadlineEventPayload(course, dl, currentSettings.reminderMinutes),
                existingId: ex?.id,
              });
            }
          }
          if (currentSettings.includeMilestones) {
            for (const plan of plans) {
              for (const ms of plan.milestones) {
                if (!ms.targetDate) continue;
                const ex = (ms.calendarEventId && byId.get(ms.calendarEventId)) || byMilestone.get(ms.id);
                tasks.push({
                  kind: 'milestone',
                  refId: ms.id,
                  payload: this.buildMilestoneEventPayload(plan, ms, currentSettings.reminderMinutes),
                  existingId: ex?.id,
                });
              }
            }
          }

          if (mode === 'replace' && tasks.length === 0) {
            // Never wipe the calendar when there is nothing to put back (protects against empty/stale data)
            throw new Error('No dated deadlines were found to sync, so nothing was changed. Check that your courses have dates and are switched on below.');
          }

          const newIdByRef = new Map<string, string>(); // refId -> calendar event id
          const createdThisRun: string[] = [];
          const stats: SyncStats = { created: 0, skipped: 0, removed: 0, removeFailed: 0 };
          const calPath = (id: string) => `/calendars/${encodeURIComponent(id)}/events`;
          const deleteEvent = async (calId: string, id: string): Promise<boolean> => {
            try {
              const r = await calendarApiFetch(`${calPath(calId)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
              return r.ok || r.status === 404 || r.status === 410;
            } catch (e: any) {
              if (e?.isAuthError) throw e;
              return false;
            }
          };
          // Run fn over items a few at a time (faster than one by one, still gentle on Google's limits)
          const runPool = async <T,>(items: T[], size: number, fn: (item: T, index: number) => Promise<void>) => {
            let next = 0;
            const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
              while (next < items.length) {
                const i = next++;
                await fn(items[i], i);
              }
            });
            await Promise.all(workers);
          };

          // Add mode: reuse existing; otherwise queue for creation
          const toCreate: Task[] = [];
          for (const t of tasks) {
            if (mode === 'add' && t.existingId) {
              newIdByRef.set(t.refId, t.existingId);
              stats.skipped++;
            } else {
              toCreate.push(t);
            }
          }

          let createFailure: any = null;
          let doneCount = 0;
          await runPool(toCreate, 4, async (t) => {
            if (createFailure) return; // stop starting new ones after a failure
            try {
              const r = await calendarApiFetch(calPath(calendarId), { method: 'POST', body: JSON.stringify(t.payload) });
              if (!r.ok) throw new Error(await googleErrorText(r, 'Google Calendar rejected an event.'));
              const newId = (await r.json()).id;
              if (!newId) throw new Error('Google Calendar did not return an event id.');
              createdThisRun.push(newId);
              newIdByRef.set(t.refId, newId);
              stats.created++;
              doneCount++;
              progress(`Creating events (${doneCount} of ${toCreate.length})...`);
            } catch (e: any) {
              createFailure = e || new Error('Event creation failed.');
            }
          });

          if (createFailure) {
            if (mode === 'replace') {
              // Roll back what this run created so nothing stacks; old events stay untouched.
              progress('Something went wrong. Undoing partial changes...');
              await runPool(createdThisRun, 4, async (id) => { try { await deleteEvent(calendarId, id); } catch {} });
              if (createFailure.isAuthError) throw createFailure;
              throw new Error(`Sync failed. Your previous events were kept and nothing was removed. ${createFailure.message || ''}`.trim());
            }
            if (createFailure.isAuthError) throw createFailure;
            throw new Error(`${createFailure.message || ''} Only ${stats.created} event(s) could be added. Existing events were not changed. Press Sync again to retry; already-added events will be skipped.`);
          }

          // Replace: only after every new event exists, clear the old ones.
          // "Apodict" is a calendar this app created and manages, so everything old in it is cleared,
          // including leftovers in any extra calendars with the same name (created by earlier failed syncs).
          if (mode === 'replace') {
            const keep = new Set(createdThisRun);
            const oldList: { calId: string; id: string }[] = allCalendarEvents
              .filter((ev) => ev.id && !keep.has(ev.id))
              .map((ev) => ({ calId: calendarId, id: ev.id }));

            let removedCount = 0;
            await runPool(oldList, 4, async (o) => {
              const ok = await deleteEvent(o.calId, o.id);
              if (ok) stats.removed++; else stats.removeFailed = (stats.removeFailed || 0) + 1;
              removedCount++;
              progress(`Removing old events (${removedCount} of ${oldList.length})...`);
            });

            // Extra "Apodict" or "Semester Planner" calendars made by earlier syncs: delete the whole calendar.
            // Found two ways: calendars this app recorded, plus the calendar list if Google allows reading it.
            const extraIds = new Set<string>(
              (currentSettings.knownCalendarIds || []).filter((id) => id && id !== calendarId)
            );
            try {
              const clRes = await calendarApiFetch('/users/me/calendarList?maxResults=250');
              if (clRes.ok) {
                const cl = await clRes.json();
                (Array.isArray(cl.items) ? cl.items : []).forEach((c: any) => {
                  if (c.id !== calendarId && ((c.summary || '').trim() === 'Apodict' || (c.summary || '').trim() === 'Semester Planner') && c.accessRole === 'owner') {
                    extraIds.add(c.id);
                  }
                });
              } else {
                stats.listUnavailable = true;
              }
            } catch (e: any) {
              if (e?.isAuthError) throw e; // listing is optional; other problems are ignored
              stats.listUnavailable = true;
            }

            const extras = Array.from(extraIds);
            let extraDone = 0;
            const stillThere: string[] = [];
            await runPool(extras, 2, async (calId) => {
              progress(`Removing extra calendars (${++extraDone} of ${extras.length})...`);
              try {
                // Count the events first so the final message is accurate
                let tok: string | undefined;
                let count = 0;
                do {
                  const q = new URLSearchParams({ maxResults: '250', singleEvents: 'true' });
                  if (tok) q.set('pageToken', tok);
                  const er = await calendarApiFetch(`${calPath(calId)}?${q.toString()}`);
                  if (!er.ok) break;
                  const ed = await er.json();
                  count += (ed.items || []).length;
                  tok = ed.nextPageToken;
                } while (tok);

                const dr = await calendarApiFetch(`/calendars/${encodeURIComponent(calId)}`, { method: 'DELETE' });
                if (dr.ok || dr.status === 404 || dr.status === 410) {
                  stats.calendarsRemoved = (stats.calendarsRemoved || 0) + 1;
                  stats.removed += count;
                } else {
                  stillThere.push(calId);
                  stats.removeFailed = (stats.removeFailed || 0) + 1;
                }
              } catch (e: any) {
                if (e?.isAuthError) throw e;
                stillThere.push(calId);
                stats.removeFailed = (stats.removeFailed || 0) + 1;
              }
            });
            // Keep only calendars that still exist in the recorded list
            currentSettings.knownCalendarIds = [calendarId, ...stillThere];
          }

          // Map new event ids back onto deadlines/milestones
          const outCourses: Course[] = coursesToSync.map((course) => ({
            ...course,
            deadlines: course.deadlines.map((dl) => {
              const id = newIdByRef.get(dl.id);
              if (id) return { ...dl, calendarEventId: id };
              return mode === 'replace' ? { ...dl, calendarEventId: undefined } : dl;
            }),
          }));
          const outPlans: AssignmentPlan[] = plans.map((plan) => ({
            ...plan,
            milestones: plan.milestones.map((ms) => {
              const id = newIdByRef.get(ms.id);
              if (id) return { ...ms, calendarEventId: id };
              return mode === 'replace' ? { ...ms, calendarEventId: undefined } : ms;
            }),
          }));

          currentSettings.lastSyncedAt = new Date().toISOString();
          currentSettings.status = 'up_to_date';
          currentSettings.skippedDeadlinesCount = skippedNoDate;
          currentSettings.errorMessage = null;
          await this.saveSettings(currentSettings);

          return {
            updatedCourses: outCourses,
            updatedPlans: outPlans,
            settings: currentSettings,
            recreatedNotice,
            stats,
          };
        }

        // Index events by ID and by private extended properties
        const eventById = new Map<string, any>();
        const eventByDeadlineId = new Map<string, any>();
        const eventByMilestoneId = new Map<string, any>();

        allCalendarEvents.forEach((ev) => {
          if (ev.id) eventById.set(ev.id, ev);
          const deadlineId = ev.extendedProperties?.private?.deadlineId;
          if (deadlineId) eventByDeadlineId.set(deadlineId, ev);
          const milestoneId = ev.extendedProperties?.private?.milestoneId;
          if (milestoneId) eventByMilestoneId.set(milestoneId, ev);
        });

        const matchedEventIds = new Set<string>();
        let skippedDeadlinesCount = 0;

        // 3. Process each course and deadline
        const updatedCourses: Course[] = [];

        for (const course of coursesToSync) {
          const isCourseEnabled = currentSettings.courseToggles[course.id] !== false; // on by default
          const updatedDeadlines: Deadline[] = [];

          for (const deadline of course.deadlines) {
            // Existing event reference
            const existingEvent = (deadline.calendarEventId && eventById.get(deadline.calendarEventId))
              || eventByDeadlineId.get(deadline.id);

            if (!isCourseEnabled || !deadline.date) {
              if (!deadline.date && isCourseEnabled) {
                skippedDeadlinesCount++;
              }

              // If an event existed, remove it
              if (existingEvent) {
                matchedEventIds.add(existingEvent.id);
                await calendarApiFetch(
                  `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEvent.id)}`,
                  { method: 'DELETE' }
                ).catch(() => {});
                await delay(80);
              }

              updatedDeadlines.push({
                ...deadline,
                calendarEventId: undefined,
              });
              continue;
            }

            // Build payload
            const payload = this.buildDeadlineEventPayload(course, deadline, currentSettings.reminderMinutes);

            if (existingEvent) {
              matchedEventIds.add(existingEvent.id);
              // Update existing event
              const keptId = await patchEventOrRecreate(calendarId, existingEvent.id, payload);
              if (keptId !== existingEvent.id) matchedEventIds.add(keptId);

              updatedDeadlines.push({
                ...deadline,
                calendarEventId: keptId,
              });
            } else {
              // Create new event
              const createRes = await calendarApiFetch(
                `/calendars/${encodeURIComponent(calendarId)}/events`,
                {
                  method: 'POST',
                  body: JSON.stringify(payload),
                }
              ).catch(() => null);

              let createdId = deadline.calendarEventId;
              if (createRes && createRes.ok) {
                const created = await createRes.json();
                createdId = created.id;
                if (createdId) matchedEventIds.add(createdId);
              }

              updatedDeadlines.push({
                ...deadline,
                calendarEventId: createdId,
              });
            }

            await delay(80);
          }

          updatedCourses.push({
            ...course,
            deadlines: updatedDeadlines,
          });
        }

        // 4. Process study plan milestones if enabled
        const updatedPlans: AssignmentPlan[] = [];

        for (const plan of plans) {
          const updatedMilestones: Milestone[] = [];

          for (const milestone of plan.milestones) {
            const existingMilestoneEvent = (milestone.calendarEventId && eventById.get(milestone.calendarEventId))
              || eventByMilestoneId.get(milestone.id);

            if (!currentSettings.includeMilestones || !milestone.targetDate) {
              if (existingMilestoneEvent) {
                matchedEventIds.add(existingMilestoneEvent.id);
                await calendarApiFetch(
                  `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingMilestoneEvent.id)}`,
                  { method: 'DELETE' }
                ).catch(() => {});
                await delay(80);
              }

              updatedMilestones.push({
                ...milestone,
                calendarEventId: undefined,
              });
              continue;
            }

            const milestonePayload = this.buildMilestoneEventPayload(plan, milestone, currentSettings.reminderMinutes);

            if (existingMilestoneEvent) {
              matchedEventIds.add(existingMilestoneEvent.id);
              const keptMsId = await patchEventOrRecreate(calendarId, existingMilestoneEvent.id, milestonePayload);
              if (keptMsId !== existingMilestoneEvent.id) matchedEventIds.add(keptMsId);

              updatedMilestones.push({
                ...milestone,
                calendarEventId: keptMsId,
              });
            } else {
              const createRes = await calendarApiFetch(
                `/calendars/${encodeURIComponent(calendarId)}/events`,
                {
                  method: 'POST',
                  body: JSON.stringify(milestonePayload),
                }
              ).catch(() => null);

              let createdId = milestone.calendarEventId;
              if (createRes && createRes.ok) {
                const created = await createRes.json();
                createdId = created.id;
                if (createdId) matchedEventIds.add(createdId);
              }

              updatedMilestones.push({
                ...milestone,
                calendarEventId: createdId,
              });
            }

            await delay(80);
          }

          updatedPlans.push({
            ...plan,
            milestones: updatedMilestones,
          });
        }

        // 5. Clean up orphaned events created by our app that are no longer part of any active deadline
        // STRICT PROTECTION: Only remove orphaned events if coursesToSync is populated
        // This completely prevents catastrophic deletion of all events during race conditions!
        if (coursesToSync.length > 0) {
          for (const [id, ev] of eventById.entries()) {
            if (!matchedEventIds.has(id)) {
              const isOurAppEvent = ev.extendedProperties?.private?.app === 'semester_planner' 
                || ev.extendedProperties?.private?.app === 'semester_planner_milestone';
              if (isOurAppEvent) {
                await calendarApiFetch(
                  `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`,
                  { method: 'DELETE' }
                ).catch(() => {});
                await delay(60);
              }
            }
          }
        }

        // Update sync state
        currentSettings.lastSyncedAt = new Date().toISOString();
        currentSettings.status = 'up_to_date';
        currentSettings.skippedDeadlinesCount = skippedDeadlinesCount;
        currentSettings.errorMessage = null;

        await this.saveSettings(currentSettings);

        return {
          updatedCourses,
          updatedPlans,
          settings: currentSettings,
          recreatedNotice,
          stats: { created: 0, skipped: 0, removed: 0 },
        };
      } catch (err: any) {
        if (err.isAuthError) {
          currentSettings.status = 'needs_reconnecting';
          currentSettings.errorMessage = 'Google authorization expired. Click Reconnect to resume sync.';
        } else {
          currentSettings.status = 'error';
          currentSettings.errorMessage = err.message || 'Sync failed. Please check your connection and try again.';
        }
        await this.saveSettings(currentSettings);
        throw err;
      }
    };

    activeSyncAllPromise = executeSync();
    try {
      return await activeSyncAllPromise;
    } finally {
      activeSyncAllPromise = null;
    }
  },

  /**
   * Incremental single deadline sync (create or update)
   */
  async syncDeadline(course: Course, deadline: Deadline): Promise<string | undefined> {
    if (!hasValidToken()) {
      pendingQueuedChanges = true;
      return undefined;
    }

    const settings = await this.loadSettings();
    if (settings.status === 'disconnected' || !settings.calendarId) return undefined;
    if (settings.courseToggles[course.id] === false) return undefined;

    if (!deadline.date) {
      // If deadline has no date, remove existing calendar event if any
      if (deadline.calendarEventId) {
        await calendarApiFetch(
          `/calendars/${encodeURIComponent(settings.calendarId)}/events/${encodeURIComponent(deadline.calendarEventId)}`,
          { method: 'DELETE' }
        ).catch(() => {});
      }
      return undefined;
    }

    const payload = this.buildDeadlineEventPayload(course, deadline, settings.reminderMinutes);

    try {
      if (deadline.calendarEventId) {
        const patchRes = await calendarApiFetch(
          `/calendars/${encodeURIComponent(settings.calendarId)}/events/${encodeURIComponent(deadline.calendarEventId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify(withClearedTimeFields(payload)),
          }
        );
        if (patchRes.ok) return deadline.calendarEventId;
      }

      // If no ID or patch failed, look for an existing event for this deadline before creating (prevents stacking)
      const lookup = await calendarApiFetch(
        `/calendars/${encodeURIComponent(settings.calendarId)}/events?privateExtendedProperty=${encodeURIComponent('deadlineId=' + deadline.id)}&maxResults=10`
      ).catch(() => null);
      if (!lookup || !lookup.ok) return undefined; // can't verify, so don't risk a duplicate
      const found = await lookup.json().catch(() => ({ items: [] }));
      const existing = Array.isArray(found.items) ? found.items.filter((e: any) => e.status !== 'cancelled') : [];
      if (existing.length > 0) {
        const patchExisting = await calendarApiFetch(
          `/calendars/${encodeURIComponent(settings.calendarId)}/events/${encodeURIComponent(existing[0].id)}`,
          { method: 'PATCH', body: JSON.stringify(withClearedTimeFields(payload)) }
        );
        return patchExisting.ok ? existing[0].id : undefined;
      }

      const createRes = await calendarApiFetch(
        `/calendars/${encodeURIComponent(settings.calendarId)}/events`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (createRes.ok) {
        const data = await createRes.json();
        return data.id;
      }
    } catch (err: any) {
      if (err.isAuthError) {
        settings.status = 'needs_reconnecting';
        await this.saveSettings(settings);
      }
    }

    return undefined;
  },

  /**
   * Incremental single deadline delete
   */
  async deleteDeadlineEvent(calendarEventId?: string): Promise<void> {
    if (!calendarEventId || !hasValidToken()) {
      if (!hasValidToken()) pendingQueuedChanges = true;
      return;
    }

    const settings = await this.loadSettings();
    if (settings.status === 'disconnected' || !settings.calendarId) return;

    try {
      await calendarApiFetch(
        `/calendars/${encodeURIComponent(settings.calendarId)}/events/${encodeURIComponent(calendarEventId)}`,
        { method: 'DELETE' }
      );
    } catch (err: any) {
      if (err.isAuthError) {
        settings.status = 'needs_reconnecting';
        await this.saveSettings(settings);
      }
    }
  },

  /**
   * Delete all calendar events for a deleted course
   */
  async deleteCourseEvents(course: Course): Promise<void> {
    if (!hasValidToken()) {
      pendingQueuedChanges = true;
      return;
    }

    const settings = await this.loadSettings();
    if (settings.status === 'disconnected' || !settings.calendarId) return;

    for (const d of course.deadlines) {
      if (d.calendarEventId) {
        await calendarApiFetch(
          `/calendars/${encodeURIComponent(settings.calendarId)}/events/${encodeURIComponent(d.calendarEventId)}`,
          { method: 'DELETE' }
        ).catch(() => {});
        await delay(50);
      }
    }
  },

  /**
   * Sync all deadlines for a saved/updated course
   */
  async syncCourseDeadlines(course: Course): Promise<void> {
    if (!hasValidToken()) {
      pendingQueuedChanges = true;
      return;
    }

    // Await active mutations before starting background deadline sync
    if (dataStoreStabilizationHook) {
      await dataStoreStabilizationHook();
    }

    const settings = await this.loadSettings();
    if (settings.status === 'disconnected' || !settings.calendarId) return;
    if (settings.courseToggles[course.id] === false) return;

    for (const d of course.deadlines) {
      await this.syncDeadline(course, d);
      await delay(50);
    }
  },

  /**
   * Disconnect Google Calendar sync
   * Stops syncing, revokes token, clears saved connection details.
   * If removeSecondaryCalendar is true, deletes the "Apodict" secondary calendar from Google Calendar.
   */
  async disconnect(removeSecondaryCalendar = false): Promise<void> {
    const settings = await this.loadSettings();
    const token = inMemoryAccessToken;
    const calendarId = settings.calendarId;

    // 1. Optionally delete secondary calendar in Google Calendar
    if (removeSecondaryCalendar && calendarId && token) {
      try {
        await calendarApiFetch(`/calendars/${encodeURIComponent(calendarId)}`, {
          method: 'DELETE',
        });
      } catch (e) {
        console.warn('Notice: Could not delete secondary calendar during disconnect:', e);
      }
    }

    // 2. Revoke token
    if (token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } catch (e) {
        // revoke error ignored
      }
    }

    // 3. Clear in-memory token
    inMemoryAccessToken = null;
    tokenExpiresAt = 0;
    pendingQueuedChanges = false;

    // 4. Update saved config in Firestore
    const updated: CalendarSyncSettings = {
      ...DEFAULT_CALENDAR_SETTINGS,
      calendarId: removeSecondaryCalendar ? null : settings.calendarId,
      status: 'disconnected',
    };

    await this.saveSettings(updated);
  },
};