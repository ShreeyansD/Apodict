import type { Express, Request, Response } from 'express';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirebaseConfig, authenticateStudent } from './aiProtection.ts';
import { computeReminderInstant, formatReminderInstantLocal } from './src/utils/reminderInstant.ts';

export { computeReminderInstant, formatReminderInstantLocal };

// ---- Lead time to days mapping ----
const LEAD_TIME_DAYS_MAP: Record<string, number> = {
  morning_of: 0,
  '1_day_before': 1,
  '2_days_before': 2,
  '3_days_before': 3,
  '1_week_before': 7,
};

const DUE_WINDOW_MINUTES = 180; // 3 hours window (180 minutes)

// ---- Initialize Firebase Admin and Services ----
let adminAppInstance: any = null;
let adminDbInstance: any = null;
let adminMessagingInstance: any = null;

export function getAdminServices() {
  if (adminAppInstance && adminDbInstance && adminMessagingInstance) {
    return { app: adminAppInstance, db: adminDbInstance, messaging: adminMessagingInstance };
  }

  const cfg = getFirebaseConfig();

  if (getApps().length > 0) {
    adminAppInstance = getApp();
  } else {
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        credential = cert(sa);
      } catch (e) {
        console.warn('[push] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e);
      }
    }

    adminAppInstance = initializeApp({
      projectId: cfg.projectId,
      ...(credential ? { credential } : {}),
    });
  }

  const databaseId = cfg.firestoreDatabaseId && cfg.firestoreDatabaseId !== '(default)'
    ? cfg.firestoreDatabaseId
    : undefined;

  adminDbInstance = databaseId
    ? getFirestore(adminAppInstance, databaseId)
    : getFirestore(adminAppInstance);

  adminMessagingInstance = getMessaging(adminAppInstance);

  return { app: adminAppInstance, db: adminDbInstance, messaging: adminMessagingInstance };
}

/**
 * Calculates exact target timestamp interpreted in user's saved time zone.
 */
/**
 * Legacy compatibility wrapper: delegates to Luxon's computeReminderInstant
 */
export function getZonedTargetDate(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string
): Date {
  return computeReminderInstant(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    0,
    timeZone
  ).toJSDate();
}

/**
 * Scope matching: mirrors Notifications.tsx and PushNotifications.tsx preview
 */
function isDeadlineMatchingScope(deadline: any, course: any, scope: any): boolean {
  if (!scope) return false;
  if (scope.type === 'specific_assignment') {
    return deadline.id === scope.deadlineId;
  }
  if (scope.type === 'all_in_course') {
    return course.id === scope.courseId;
  }
  if (scope.type === 'assignment_type') {
    if (deadline.type !== scope.deadlineType) return false;
    if (scope.courseId) {
      return course.id === scope.courseId;
    }
    return true;
  }
  return false;
}

/**
 * Notification title: "Exam 1 due tomorrow" / "Exam 1 due today" / "Exam 1 due in N days"
 */
function formatNotificationTitle(title: string, leadTime: string): string {
  const cleanTitle = (title || 'Assignment').trim();
  if (leadTime === 'morning_of') {
    return `${cleanTitle} due today`;
  }
  if (leadTime === '1_day_before') {
    return `${cleanTitle} due tomorrow`;
  }
  const days = LEAD_TIME_DAYS_MAP[leadTime] ?? 1;
  return `${cleanTitle} due in ${days} days`;
}

/**
 * Notification body: e.g. "CLCS 23500 - Intr To Classical Myth - due Fri, Oct 16"
 */
function formatNotificationBody(course: any, deadline: any, timeZone: string): string {
  const code = (course?.code || '').trim();
  const name = (course?.name || 'Course').trim();
  const courseStr = code ? `${code} - ${name}` : name;

  let dueStr = deadline?.date || '';
  if (deadline?.date) {
    try {
      const [y, m, d] = deadline.date.split('-').map(Number);
      if (y && m && d) {
        dueStr = new Intl.DateTimeFormat('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          timeZone: timeZone || 'America/New_York',
        }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
      }
    } catch {}
  }
  return `${courseStr} - due ${dueStr}`;
}

export interface DeadlineEvaluationItem {
  deadlineId: string;
  deadlineTitle: string;
  deadlineDate: string | null;
  courseName: string;
  leadTime: string;
  reminderInstantUtc: string | null;
  reminderInstantLocal: string | null;
  status: string;
}

export interface RuleEvaluationItem {
  ruleId: string;
  ruleName: string;
  scope: any;
  leadTimes: string[];
  deadlines: DeadlineEvaluationItem[];
}

export interface UserDiagnosticsBreakdown {
  userId: string;
  tokenCount: number;
  enabledRuleCount: number;
  timeZoneUsed: string;
  defaultReminderTimeUsed: string;
  rules: RuleEvaluationItem[];
  dueReminders: Array<{
    deadline: any;
    course: any;
    rule: any;
    leadTime: string;
    logKey: string;
  }>;
}

/**
 * Evaluates reminder rules for a single user, resolving deadline statuses and identifying due items.
 */
async function evaluateUserReminders(
  db: any,
  userId: string,
  nowMs: number,
  windowMs: number
): Promise<UserDiagnosticsBreakdown> {
  // A) Tokens
  const tokensSnap = await db.collection(`users/${userId}/pushTokens`).get();
  const tokenCount = tokensSnap.docs.filter((d: any) => !!d.data()?.token).length;

  // B) Push settings
  const settingsSnap = await db.doc(`users/${userId}/pushSettings/settings`).get();
  const hasSettings = settingsSnap.exists;
  const settingsData = hasSettings ? settingsSnap.data() : null;

  const timeZoneUsed = (hasSettings && settingsData?.timeZone)
    ? settingsData.timeZone
    : 'none saved, defaulting to America/New_York';
  const effectiveZone = (hasSettings && settingsData?.timeZone)
    ? settingsData.timeZone
    : 'America/New_York';

  const defaultReminderTimeUsed = (hasSettings && settingsData?.defaultReminderTime)
    ? settingsData.defaultReminderTime
    : 'none saved, defaulting to 09:00';
  const effectiveDefaultTime = (hasSettings && settingsData?.defaultReminderTime)
    ? settingsData.defaultReminderTime
    : '09:00';

  // C) Push rules
  const rulesSnap = await db.collection(`users/${userId}/pushRules`).get();
  const allRules = rulesSnap.docs.map((d: any) => d.data());
  const enabledRules = allRules.filter(
    (r: any) => r && r.enabled === true && Array.isArray(r.leadTimes) && r.leadTimes.length > 0
  );

  // D) Courses & Deadlines
  const coursesSnap = await db.collection(`users/${userId}/courses`).get();
  const courses = coursesSnap.docs.map((d: any) => d.data());

  const allDeadlines: Array<{ deadline: any; course: any }> = [];
  for (const c of courses) {
    if (Array.isArray(c?.deadlines)) {
      for (const d of c.deadlines) {
        allDeadlines.push({ deadline: d, course: c });
      }
    }
  }

  const ruleEvaluations: RuleEvaluationItem[] = [];
  const dueReminders: Array<{
    deadline: any;
    course: any;
    rule: any;
    leadTime: string;
    logKey: string;
  }> = [];

  for (const rule of enabledRules) {
    const ruleEval: RuleEvaluationItem = {
      ruleId: rule.id,
      ruleName: rule.name,
      scope: rule.scope,
      leadTimes: rule.leadTimes,
      deadlines: [],
    };

    const reminderTimeOfDay = rule.customReminderTime || effectiveDefaultTime;
    const [remHours, remMinutes] = (reminderTimeOfDay || '09:00')
      .split(':')
      .map((s: string) => parseInt(s, 10) || 0);

    const matchingItems = allDeadlines.filter(({ deadline, course }) =>
      isDeadlineMatchingScope(deadline, course, rule.scope)
    );

    if (matchingItems.length === 0) {
      ruleEval.deadlines.push({
        deadlineId: '',
        deadlineTitle: 'No deadlines matching rule criteria',
        deadlineDate: null,
        courseName: '',
        leadTime: '',
        reminderInstantUtc: null,
        reminderInstantLocal: null,
        status: 'no matching deadlines',
      });
      ruleEvaluations.push(ruleEval);
      continue;
    }

    for (const { deadline, course } of matchingItems) {
      if (deadline.completed) {
        ruleEval.deadlines.push({
          deadlineId: deadline.id,
          deadlineTitle: deadline.title,
          deadlineDate: deadline.date || null,
          courseName: course?.name || 'Course',
          leadTime: 'all',
          reminderInstantUtc: null,
          reminderInstantLocal: null,
          status: 'skipped: completed',
        });
        continue;
      }

      const isExact = (deadline.dateStatus === 'exact' || !deadline.dateStatus) && !!deadline.date;
      if (!isExact) {
        ruleEval.deadlines.push({
          deadlineId: deadline.id,
          deadlineTitle: deadline.title,
          deadlineDate: deadline.date || null,
          courseName: course?.name || 'Course',
          leadTime: 'all',
          reminderInstantUtc: null,
          reminderInstantLocal: null,
          status: deadline.dateStatus === 'range' ? 'skipped: date range (awaiting exact date)' : 'skipped: no date',
        });
        continue;
      }

      for (const leadTime of rule.leadTimes) {
        const daysToSubtract = LEAD_TIME_DAYS_MAP[leadTime] ?? 0;
        const instantUtcDt = computeReminderInstant(
          deadline.date,
          reminderTimeOfDay,
          daysToSubtract,
          effectiveZone
        );

        const instantMs = instantUtcDt.toMillis();
        const reminderInstantUtc = instantUtcDt.toISO()!;
        const reminderInstantLocal = formatReminderInstantLocal(instantUtcDt, effectiveZone);

        const logKey = `${deadline.id}_${leadTime}_${deadline.date}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        let isAlreadySent = false;
        try {
          const logSnap = await db.doc(`users/${userId}/pushSentLogs/${logKey}`).get();
          isAlreadySent = logSnap.exists;
        } catch {}

        let status = '';
        if (isAlreadySent) {
          status = 'already sent';
        } else if (instantMs > nowMs) {
          const min = Math.max(1, Math.round((instantMs - nowMs) / 60000));
          status = `too early (in ${min} min)`;
        } else if (instantMs < nowMs - windowMs) {
          const min = Math.max(1, Math.round((nowMs - instantMs) / 60000));
          status = `too late (${min} min ago, outside window)`;
        } else {
          status = 'due now';
          dueReminders.push({
            deadline,
            course,
            rule,
            leadTime,
            logKey,
          });
        }

        ruleEval.deadlines.push({
          deadlineId: deadline.id,
          deadlineTitle: deadline.title,
          deadlineDate: deadline.date,
          courseName: course?.name || 'Course',
          leadTime,
          reminderInstantUtc,
          reminderInstantLocal,
          status,
        });
      }
    }

    ruleEvaluations.push(ruleEval);
  }

  return {
    userId: userId.length > 6 ? userId.slice(0, 6) : userId,
    tokenCount,
    enabledRuleCount: enabledRules.length,
    timeZoneUsed,
    defaultReminderTimeUsed,
    rules: ruleEvaluations,
    dueReminders,
  };
}

/**
 * Register push reminder routes on Express app
 */
export function registerPushReminderRoutes(app: Express) {
  // -------------------------------------------------------------------------
  // GET /api/push/status: Retrieve status of the last server push cron check
  // -------------------------------------------------------------------------
  app.get('/api/push/status', async (_req: Request, res: Response) => {
    try {
      const { db } = getAdminServices();
      const snap = await db.doc('system/pushLastRun').get();
      if (!snap.exists) {
        return res.json({ lastRun: null, lastRunTime: null });
      }
      const data = snap.data();
      return res.json({
        lastRun: data,
        lastRunTime: data?.time || null,
      });
    } catch (err: any) {
      return res.json({ lastRun: null, lastRunTime: null, info: err?.message || 'Server check not yet performed' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/push/test: Send a live test notification to all of user's devices
  // Authenticated via Firebase ID token Bearer header
  // -------------------------------------------------------------------------
  app.post('/api/push/test', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization || '';
      const match = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!match) {
        return res.status(401).json({ error: 'Please sign in to test push notifications.' });
      }

      const { uid } = await authenticateStudent(match[1]);
      const { db, messaging } = getAdminServices();

      const tokensSnap = await db.collection(`users/${uid}/pushTokens`).get();
      if (tokensSnap.empty) {
        return res.status(400).json({
          error: 'No registered push devices found for your account. Please enable notifications on this device first.',
        });
      }

      const tokenDocs = tokensSnap.docs;
      const tokens = tokenDocs
        .map((d: any) => (d.data() as any).token)
        .filter((t: any): t is string => typeof t === 'string' && t.trim().length > 0);

      if (tokens.length === 0) {
        return res.status(400).json({
          error: 'No valid push notification tokens found. Please re-enable notifications on this device.',
        });
      }

      const sendResult = await messaging.sendEachForMulticast({
        tokens,
        data: {
          title: 'Apodict',
          body: 'Test from the server. Push reminders are working.',
          url: '/',
        },
      });

      // Cleanup unregistered/invalid tokens
      for (let i = 0; i < sendResult.responses.length; i++) {
        const resp = sendResult.responses[i];
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            await tokenDocs[i].ref.delete().catch(() => {});
          }
        }
      }

      return res.json({
        success: true,
        tokensFound: tokens.length,
        successCount: sendResult.successCount,
        failureCount: sendResult.failureCount,
        message: `Test push sent to ${sendResult.successCount} of ${tokens.length} device(s).`,
      });
    } catch (err: any) {
      console.error('[push/test] Error sending test push:', err);
      const status = err.status || 500;
      return res.status(status).json({
        error: err.message || 'Failed to send test push notification from server.',
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/push/test-rule: Test dispatch for a specific reminder rule
  // Picks next upcoming matching reminder (or first matching), sends immediately
  // -------------------------------------------------------------------------
  app.post('/api/push/test-rule', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization || '';
      const match = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!match) {
        return res.status(401).json({ error: 'Please sign in to test reminder rules.' });
      }

      const { uid } = await authenticateStudent(match[1]);
      const { ruleId } = req.body || {};
      if (!ruleId || typeof ruleId !== 'string') {
        return res.status(400).json({ error: 'Missing ruleId in request body.' });
      }

      const { db, messaging } = getAdminServices();

      // 1. Load rule
      const ruleSnap = await db.doc(`users/${uid}/pushRules/${ruleId}`).get();
      if (!ruleSnap.exists) {
        return res.status(404).json({ error: 'Reminder rule not found.' });
      }
      const rule = ruleSnap.data();

      // 2. Load push settings
      const settingsSnap = await db.doc(`users/${uid}/pushSettings/settings`).get();
      const settingsData = settingsSnap.exists ? settingsSnap.data() : null;
      const effectiveZone = settingsData?.timeZone || 'America/New_York';
      const effectiveDefaultTime = settingsData?.defaultReminderTime || '09:00';

      // 3. Load courses & deadlines
      const coursesSnap = await db.collection(`users/${uid}/courses`).get();
      const courses = coursesSnap.docs.map((d: any) => d.data());

      const matchingItems: Array<{ deadline: any; course: any }> = [];
      for (const course of courses) {
        if (Array.isArray(course?.deadlines)) {
          for (const dl of course.deadlines) {
            if (isDeadlineMatchingScope(dl, course, rule.scope)) {
              matchingItems.push({ deadline: dl, course });
            }
          }
        }
      }

      if (matchingItems.length === 0) {
        return res.json({
          success: false,
          message: 'This rule has no matching deadlines across your courses.',
        });
      }

      // 4. Find the next upcoming matching reminder (or fallback to first matching)
      const nowMs = Date.now();
      const upcomingReminders: Array<{
        deadline: any;
        course: any;
        leadTime: string;
        instantMs: number;
      }> = [];

      for (const item of matchingItems) {
        if (!item.deadline.date || item.deadline.completed) continue;

        const remTime = rule.customReminderTime || effectiveDefaultTime;
        const leadTimes = Array.isArray(rule.leadTimes) && rule.leadTimes.length > 0
          ? rule.leadTimes
          : ['morning_of'];

        for (const lt of leadTimes) {
          const days = LEAD_TIME_DAYS_MAP[lt] ?? 0;
          const instantUtcDt = computeReminderInstant(
            item.deadline.date,
            remTime,
            days,
            effectiveZone
          );
          const instantMs = instantUtcDt.toMillis();
          if (instantMs > nowMs) {
            upcomingReminders.push({
              deadline: item.deadline,
              course: item.course,
              leadTime: lt,
              instantMs,
            });
          }
        }
      }

      let chosen: { deadline: any; course: any; leadTime: string };
      if (upcomingReminders.length > 0) {
        upcomingReminders.sort((a, b) => a.instantMs - b.instantMs);
        chosen = upcomingReminders[0];
      } else {
        const first = matchingItems[0];
        chosen = {
          deadline: first.deadline,
          course: first.course,
          leadTime: (Array.isArray(rule.leadTimes) && rule.leadTimes[0]) || 'morning_of',
        };
      }

      const title = formatNotificationTitle(chosen.deadline.title, chosen.leadTime);
      const body = formatNotificationBody(chosen.course, chosen.deadline, effectiveZone);

      // 5. Load user tokens
      const tokensSnap = await db.collection(`users/${uid}/pushTokens`).get();
      if (tokensSnap.empty) {
        return res.status(400).json({
          error: 'No registered push devices found. Please enable notifications on this device first.',
        });
      }

      const tokenDocs = tokensSnap.docs;
      const tokens = tokenDocs
        .map((d: any) => d.data()?.token)
        .filter((t: any): t is string => typeof t === 'string' && t.trim().length > 0);

      if (tokens.length === 0) {
        return res.status(400).json({
          error: 'No valid push notification tokens registered.',
        });
      }

      // 6. Send immediately ignoring window and sent-log
      const sendResult = await messaging.sendEachForMulticast({
        tokens,
        data: {
          title,
          body,
          url: '/',
        },
      });

      // Cleanup invalid tokens
      for (let i = 0; i < sendResult.responses.length; i++) {
        const resp = sendResult.responses[i];
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            await tokenDocs[i].ref.delete().catch(() => {});
          }
        }
      }

      return res.json({
        success: true,
        title,
        body,
        tokenCount: tokens.length,
        successCount: sendResult.successCount,
        failureCount: sendResult.failureCount,
      });
    } catch (err: any) {
      console.error('[push/test-rule] Error testing rule push:', err);
      return res.status(500).json({
        error: err.message || 'Failed to send test push for rule.',
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/push/check-me: Dry-run evaluation for the signed-in user
  // Returns diagnostic breakdown for the user's rules and deadlines
  // -------------------------------------------------------------------------
  app.post('/api/push/check-me', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization || '';
      const match = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!match) {
        return res.status(401).json({ error: 'Please sign in to run push diagnostics.' });
      }

      const { uid } = await authenticateStudent(match[1]);
      const { db } = getAdminServices();

      const nowMs = Date.now();
      const windowMs = DUE_WINDOW_MINUTES * 60 * 1000;

      const userEval = await evaluateUserReminders(db, uid, nowMs, windowMs);

      // Clean up internal references before responding
      const { dueReminders, ...userBreakdown } = userEval;

      return res.json({
        success: true,
        serverTime: new Date(nowMs).toISOString(),
        windowMinutes: DUE_WINDOW_MINUTES,
        user: userBreakdown,
      });
    } catch (err: any) {
      console.error('[push/check-me] Error evaluating user:', err);
      return res.status(500).json({
        error: err.message || 'Failed to evaluate push diagnostics.',
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/send-push-reminders: Cron endpoint to find due reminders & send
  // Supports ?dryRun=1
  // Protected by header x-cron-secret matching process.env.CRON_SECRET
  // -------------------------------------------------------------------------
  app.post('/api/send-push-reminders', async (req: Request, res: Response) => {
    const cronSecret = req.headers['x-cron-secret'];
    if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized: missing or invalid x-cron-secret header.' });
    }

    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
    const { db, messaging } = getAdminServices();
    const nowMs = Date.now();
    const windowMs = DUE_WINDOW_MINUTES * 60 * 1000;
    const errors: string[] = [];
    let usersChecked = 0;
    let pushesSent = 0;

    const userBreakdowns: any[] = [];

    try {
      // 1. Gather all unique user IDs that have push tokens
      const userIds = new Set<string>();

      try {
        const tokenDocsGroup = await db.collectionGroup('pushTokens').get();
        for (const d of tokenDocsGroup.docs) {
          const parentUser = d.ref.parent.parent;
          if (parentUser && parentUser.id) {
            userIds.add(parentUser.id);
          }
        }
      } catch (cgErr: any) {
        console.warn('[push/cron] collectionGroup pushTokens warning:', cgErr?.message);
      }

      try {
        const userDocRefs = await db.collection('users').listDocuments();
        for (const ref of userDocRefs) {
          userIds.add(ref.id);
        }
      } catch {}

      // 2. Evaluate each user
      for (const userId of userIds) {
        try {
          // Check if user has tokens
          const tokensSnap = await db.collection(`users/${userId}/pushTokens`).get();
          if (tokensSnap.empty) continue;

          const tokenDocs = tokensSnap.docs;
          const tokens: string[] = [];
          const tokenDocMap: Record<string, any> = {};

          for (const td of tokenDocs) {
            const tok = td.data()?.token;
            if (typeof tok === 'string' && tok.trim().length > 0) {
              tokens.push(tok);
              tokenDocMap[tok] = td;
            }
          }

          if (tokens.length === 0) continue;

          // Check if user has enabled rules
          const rulesSnap = await db.collection(`users/${userId}/pushRules`).get();
          const hasEnabledRule = rulesSnap.docs.some(
            (d: any) => d.data()?.enabled === true
          );
          if (!hasEnabledRule) continue;

          usersChecked++;

          const userEval = await evaluateUserReminders(db, userId, nowMs, windowMs);
          const { dueReminders, ...userBreakdown } = userEval;
          userBreakdowns.push(userBreakdown);

          if (dryRun) {
            // In dryRun, do not send and do not write sent-logs
            continue;
          }

          // Capped at 10 pushes per user per run
          let userPushCount = 0;
          const MAX_PUSHES_PER_USER = 10;

          // Clean up sent-logs older than 30 days
          try {
            const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
            const oldLogs = await db
              .collection(`users/${userId}/pushSentLogs`)
              .where('timestamp', '<', cutoff)
              .limit(20)
              .get();
            for (const oldDoc of oldLogs.docs) {
              await oldDoc.ref.delete().catch(() => {});
            }
          } catch {}

          // Send due reminders
          for (const due of dueReminders) {
            if (userPushCount >= MAX_PUSHES_PER_USER) break;

            const logRef = db.doc(`users/${userId}/pushSentLogs/${due.logKey}`);
            // Atomic write before sending to prevent double-sends
            await logRef.set({
              deadlineId: due.deadline.id,
              leadTime: due.leadTime,
              deadlineDate: due.deadline.date,
              sentAt: new Date().toISOString(),
              timestamp: nowMs,
            });

            const effectiveZone = userBreakdown.timeZoneUsed.includes('defaulting')
              ? 'America/New_York'
              : userBreakdown.timeZoneUsed;
            const title = formatNotificationTitle(due.deadline.title, due.leadTime);
            const body = formatNotificationBody(due.course, due.deadline, effectiveZone);

            try {
              const sendResult = await messaging.sendEachForMulticast({
                tokens,
                data: {
                  title,
                  body,
                  url: '/',
                },
              });

              pushesSent += sendResult.successCount;
              userPushCount++;

              // Remove invalid tokens if returned
              for (let i = 0; i < sendResult.responses.length; i++) {
                const resp = sendResult.responses[i];
                if (!resp.success && resp.error) {
                  const code = resp.error.code;
                  if (
                    code === 'messaging/registration-token-not-registered' ||
                    code === 'messaging/invalid-registration-token'
                  ) {
                    const badTok = tokens[i];
                    if (badTok && tokenDocMap[badTok]) {
                      await tokenDocMap[badTok].ref.delete().catch(() => {});
                    }
                  }
                }
              }
            } catch (sendErr: any) {
              console.error(`[push/cron] Send error for user ${userId}:`, sendErr);
              errors.push(`User ${userBreakdown.userId}: ${sendErr?.message || 'Send error'}`);
            }
          }
        } catch (userErr: any) {
          console.error(`[push/cron] Error processing user ${userId}:`, userErr);
          errors.push(`User ${userId.slice(0, 6)}: ${userErr?.message || 'Processing error'}`);
        }
      }

      const responsePayload = {
        dryRun,
        serverTime: new Date(nowMs).toISOString(),
        windowMinutes: DUE_WINDOW_MINUTES,
        usersChecked,
        pushesSent,
        errors,
        users: userBreakdowns,
      };

      if (!dryRun) {
        // Write summary doc system/pushLastRun
        try {
          await db.doc('system/pushLastRun').set({
            time: new Date(nowMs).toISOString(),
            usersChecked,
            pushesSent,
            errors,
            timestamp: nowMs,
          });
        } catch (sumErr: any) {
          console.error('[push/cron] Error writing summary doc:', sumErr);
        }
      }

      return res.json(responsePayload);
    } catch (cronErr: any) {
      console.error('[push/cron] Fatal cron error:', cronErr);
      return res.status(500).json({
        error: cronErr?.message || 'Failed to execute push reminders cron.',
        serverTime: new Date(nowMs).toISOString(),
        windowMinutes: DUE_WINDOW_MINUTES,
        usersChecked,
        pushesSent,
        errors,
      });
    }
  });
}
