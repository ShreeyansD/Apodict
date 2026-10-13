import type { Express, Request, Response } from 'express';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirebaseConfig, authenticateStudent } from './aiProtection.ts';
import { LEAD_TIME_OPTIONS } from './src/constants/reminders.ts';

// ---- Lead time to days mapping ----
const LEAD_TIME_DAYS_MAP: Record<string, number> = {
  morning_of: 0,
  '1_day_before': 1,
  '2_days_before': 2,
  '3_days_before': 3,
  '1_week_before': 7,
};

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
export function getZonedTargetDate(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    for (let i = 0; i < 2; i++) {
      const parts = formatter.formatToParts(guess);
      let y = year, m = month, d = day, h = hours, min = minutes, s = 0;
      for (const p of parts) {
        if (p.type === 'year') y = parseInt(p.value, 10);
        if (p.type === 'month') m = parseInt(p.value, 10);
        if (p.type === 'day') d = parseInt(p.value, 10);
        if (p.type === 'hour') {
          const val = parseInt(p.value, 10);
          h = val === 24 ? 0 : val;
        }
        if (p.type === 'minute') min = parseInt(p.value, 10);
        if (p.type === 'second') s = parseInt(p.value, 10);
      }
      const tzAsUtc = Date.UTC(y, m - 1, d, h, min, s, 0);
      const diff = tzAsUtc - guess.getTime();
      guess = new Date(guess.getTime() - diff);
    }
  } catch {
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }
  return guess;
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
        return res.json({ lastRun: null });
      }
      return res.json({ lastRun: snap.data() });
    } catch (err: any) {
      return res.json({ lastRun: null, info: err?.message || 'Server check not yet performed' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/push/test: Send a live test notification to the user's devices
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

      // Load all saved tokens for this user
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

      // Send multicast data-only push
      const sendResult = await messaging.sendEachForMulticast({
        tokens,
        data: {
          title: 'Apodict',
          body: 'Test from the server. Push reminders are working.',
          url: '/',
        },
      });

      // Cleanup any unregistered/invalid tokens
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
  // POST /api/send-push-reminders: Cron endpoint to find due reminders & send
  // Protected by header x-cron-secret matching process.env.CRON_SECRET
  // -------------------------------------------------------------------------
  app.post('/api/send-push-reminders', async (req: Request, res: Response) => {
    const cronSecret = req.headers['x-cron-secret'];
    if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized: missing or invalid x-cron-secret header.' });
    }

    const { db, messaging } = getAdminServices();
    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000;
    const errors: string[] = [];
    let usersChecked = 0;
    let pushesSent = 0;

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

      // Also list documents in /users if collection group returned empty or for safety
      try {
        const userDocRefs = await db.collection('users').listDocuments();
        for (const ref of userDocRefs) {
          userIds.add(ref.id);
        }
      } catch {}

      // 2. Process each user
      for (const userId of userIds) {
        try {
          // A) Check user tokens
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

          // B) Check enabled push rules
          const rulesSnap = await db.collection(`users/${userId}/pushRules`).get();
          if (rulesSnap.empty) continue;

          const enabledRules = rulesSnap.docs
            .map((d: any) => d.data())
            .filter((r: any) => r && r.enabled === true && Array.isArray(r.leadTimes) && r.leadTimes.length > 0);

          if (enabledRules.length === 0) continue;

          usersChecked++;

          // C) Load user push settings (time zone and default reminder time)
          const settingsSnap = await db.doc(`users/${userId}/pushSettings/settings`).get();
          const userSettings = settingsSnap.exists ? settingsSnap.data() : {};
          const userTimeZone = userSettings?.timeZone || 'America/New_York';
          const defaultReminderTime = userSettings?.defaultReminderTime || '09:00';

          // D) Load user's courses and active deadlines
          const coursesSnap = await db.collection(`users/${userId}/courses`).get();
          const courses = coursesSnap.docs.map((d: any) => d.data());

          const activeDeadlines: Array<{ deadline: any; course: any }> = [];
          for (const course of courses) {
            if (Array.isArray(course?.deadlines)) {
              for (const dl of course.deadlines) {
                if (!dl.completed && dl.date) {
                  activeDeadlines.push({ deadline: dl, course });
                }
              }
            }
          }

          if (activeDeadlines.length === 0) continue;

          // E) Check for reminders due now (capped at 10 pushes per user per run)
          let userPushCount = 0;
          const MAX_PUSHES_PER_USER = 10;

          // Clean up sent-logs older than 30 days for this user
          try {
            const cutoff = now - 30 * 24 * 60 * 60 * 1000;
            const oldLogs = await db
              .collection(`users/${userId}/pushSentLogs`)
              .where('timestamp', '<', cutoff)
              .limit(25)
              .get();
            for (const oldDoc of oldLogs.docs) {
              await oldDoc.ref.delete().catch(() => {});
            }
          } catch {}

          for (const rule of enabledRules) {
            if (userPushCount >= MAX_PUSHES_PER_USER) break;

            const reminderTimeOfDay = rule.customReminderTime || defaultReminderTime;
            const [remHours, remMinutes] = (reminderTimeOfDay || '09:00')
              .split(':')
              .map((s: string) => parseInt(s, 10) || 0);

            // Filter deadlines matching this rule's scope
            const matchingItems = activeDeadlines.filter(({ deadline, course }) =>
              isDeadlineMatchingScope(deadline, course, rule.scope)
            );

            for (const { deadline, course } of matchingItems) {
              if (userPushCount >= MAX_PUSHES_PER_USER) break;
              if (!deadline.date) continue;

              const [year, month, day] = deadline.date.split('-').map((v: string) => parseInt(v, 10));
              if (!year || !month || !day) continue;

              for (const leadTime of rule.leadTimes) {
                if (userPushCount >= MAX_PUSHES_PER_USER) break;

                const daysToSubtract = LEAD_TIME_DAYS_MAP[leadTime] ?? 0;
                const baseUtcDate = new Date(Date.UTC(year, month - 1, day - daysToSubtract));
                const targetYear = baseUtcDate.getUTCFullYear();
                const targetMonth = baseUtcDate.getUTCMonth() + 1;
                const targetDay = baseUtcDate.getUTCDate();

                // Exact reminder instant in user's saved time zone
                const reminderTargetDate = getZonedTargetDate(
                  targetYear,
                  targetMonth,
                  targetDay,
                  remHours,
                  remMinutes,
                  userTimeZone
                );

                const instant = reminderTargetDate.getTime();

                // Due if instant is within the last 30 minutes and not in the future
                const isDue = instant <= now && instant >= thirtyMinutesAgo;
                if (!isDue) continue;

                // Deduplicate with sent-log doc per user per key (deadlineId + leadTime + deadlineDate)
                const logKey = `${deadline.id}_${leadTime}_${deadline.date}`.replace(/[^a-zA-Z0-9_-]/g, '_');
                const logRef = db.doc(`users/${userId}/pushSentLogs/${logKey}`);
                const logSnap = await logRef.get();

                if (logSnap.exists) {
                  // Already sent previously
                  continue;
                }

                // Write sent-log before sending to prevent duplicate runs
                await logRef.set({
                  deadlineId: deadline.id,
                  leadTime,
                  deadlineDate: deadline.date,
                  sentAt: new Date().toISOString(),
                  timestamp: now,
                });

                // Format data-only push notification
                const title = formatNotificationTitle(deadline.title, leadTime);
                const body = formatNotificationBody(course, deadline, userTimeZone);

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
                  errors.push(`User ${userId}: ${sendErr?.message || 'Send error'}`);
                }
              }
            }
          }
        } catch (userErr: any) {
          console.error(`[push/cron] Error processing user ${userId}:`, userErr);
          errors.push(`User ${userId}: ${userErr?.message || 'Processing error'}`);
        }
      }

      // Write summary doc system/pushLastRun
      const summary = {
        time: new Date().toISOString(),
        usersChecked,
        pushesSent,
        errors,
        timestamp: now,
      };

      try {
        await db.doc('system/pushLastRun').set(summary);
      } catch (sumErr: any) {
        console.error('[push/cron] Error writing summary doc:', sumErr);
      }

      return res.json(summary);
    } catch (cronErr: any) {
      console.error('[push/cron] Fatal cron error:', cronErr);
      return res.status(500).json({
        error: cronErr?.message || 'Failed to execute push reminders cron.',
        usersChecked,
        pushesSent,
        errors,
      });
    }
  });
}
