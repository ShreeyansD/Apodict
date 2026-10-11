import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ShieldCheck, 
  Layers, 
  Settings2, 
  ExternalLink, 
  Lock, 
  Check, 
  Trash2, 
  Info,
  CalendarDays,
  BellRing
} from 'lucide-react';
import { Course } from '../types/academic';
import { dataStore } from '../services/dataStore';
import { 
  calendarSyncService, 
  CalendarSyncSettings, 
  DEFAULT_CALENDAR_SETTINGS,
  hasValidToken,
  subscribeCalendarSync,
  SyncRunMode
} from '../services/calendarSyncService';

interface CalendarSyncProps {
  courses: Course[];
  onCoursesUpdated?: (updated: Course[]) => void;
}

const MAX_REMINDER_DAYS = 28; // Google allows reminders up to 4 weeks ahead

const STATUS_LABELS: Record<string, string> = {
  connected: 'Connected',
  syncing: 'Syncing',
  up_to_date: 'Up to date',
  needs_reconnecting: 'Needs reconnecting',
  disconnected: 'Disconnected',
  error: 'Error',
};

// Stored value (reminderMinutes): null = none; >= 0 = all-day event, popup that many minutes before midnight;
// < 0 = day-of reminder, which Google only allows on a timed event starting that many minutes after midnight.
function decodeReminder(m: number | null): { on: boolean; days: number; time: string } {
  if (m === null || m === undefined) return { on: false, days: 1, time: '09:00' };
  let days: number;
  let t: number;
  if (m < 0) { days = 0; t = -m; } else { days = Math.ceil(m / 1440); t = days * 1440 - m; }
  const hh = String(Math.floor(t / 60)).padStart(2, '0');
  const mm = String(t % 60).padStart(2, '0');
  return { on: true, days, time: `${hh}:${mm}` };
}

function encodeReminder(days: number, time: string): number {
  const [h, mi] = time.split(':').map((x) => parseInt(x, 10) || 0);
  const t = h * 60 + mi;
  if (days <= 0) return t > 0 ? -t : 0;
  return days * 1440 - t;
}

function formatTime12(time: string): string {
  const [h, mi] = time.split(':').map((x) => parseInt(x, 10) || 0);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mi).padStart(2, '0')} ${suffix}`;
}

export const CalendarSync: React.FC<CalendarSyncProps> = ({
  courses,
  onCoursesUpdated,
}) => {
  const [settings, setSettings] = useState<CalendarSyncSettings>(DEFAULT_CALENDAR_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [recreatedNotice, setRecreatedNotice] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [reminderOn, setReminderOn] = useState(true);
  const [reminderDays, setReminderDays] = useState('1');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [progressText, setProgressText] = useState<string | null>(null);
  
  // Disconnect confirmation state
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [deleteSecondaryCalendarOnDisconnect, setDeleteSecondaryCalendarOnDisconnect] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Load settings on mount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const loaded = await calendarSyncService.loadSettings();
        if (mounted) {
          setSettings(loaded);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) setIsLoading(false);
      }
    };
    load();

    const unsubscribe = subscribeCalendarSync((updated) => {
      if (mounted) {
        setSettings(updated);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Keep the reminder editor in step with the saved value
  useEffect(() => {
    const d = decodeReminder(settings.reminderMinutes);
    setReminderOn(d.on);
    if (d.on) {
      setReminderDays(String(d.days));
      setReminderTime(d.time);
    }
  }, [settings.reminderMinutes]);

  const isConnected = settings.status !== 'disconnected' && Boolean(settings.calendarId || settings.accountEmail);

  // Connect Google Calendar
  const handleConnect = async () => {
    setIsConnecting(true);
    setStatusMessage(null);
    setRecreatedNotice(null);

    try {
      const { email, isReconnect } = await calendarSyncService.connect();
      setStatusMessage({
        type: 'success',
        text: isReconnect 
          ? `Reconnected to Google Calendar as ${email}.`
          : `Connected to Google Calendar as ${email}. Syncing Apodict...`,
      });

      // Trigger automatic full sync upon connect/reconnect
      await handleSyncNow();
    } catch (err: any) {
      console.error('Error connecting Google Calendar:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Could not connect Google Calendar. Please try again.',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  // Reconcile and Sync Now
  // mode: 'replace' | 'add' come from the Sync button; plain calls (toggles, connect) do a normal safe reconcile
  const handleSyncNow = async (mode: SyncRunMode = 'reconcile') => {
    if (isSyncing) return;
    setIsSyncing(true);
    setProgressText(null);
    setShowReplaceConfirm(false);
    setStatusMessage(null);
    setRecreatedNotice(null);

    try {
      // 1. Await any in-flight course mutations in dataStore before reconciling
      await dataStore.awaitCourseStabilization();

      // 2. Read canonical courses directly from dataStore to avoid reading stale or empty React props
      let coursesToSync = await dataStore.getCourses();

      // 3. Strict Data Protection Guard:
      // If dataStore returns 0 or fewer courses than React props or local storage has,
      // use the most complete, populated dataset to prevent destroying calendar events or local storage!
      const browserData = dataStore.getBrowserSavedData();
      if (courses.length > coursesToSync.length) {
        coursesToSync = courses;
      }
      if (browserData.courses.length > coursesToSync.length) {
        coursesToSync = browserData.courses;
      }

      // If courses are completely empty while browser storage has data, abort sync
      if (coursesToSync.length === 0 && browserData.courses.length > 0) {
        console.warn('[CalendarSync] Aborting sync: courses list is empty while browser storage is populated. Data loss prevented.');
        return;
      }

      const allPlans = await dataStore.getPlans();
      const result = await calendarSyncService.syncAll(coursesToSync, allPlans, undefined, {
        mode,
        onProgress: (t) => setProgressText(t),
      });

      setSettings({ ...result.settings });
      if (result.recreatedNotice) {
        setRecreatedNotice(result.recreatedNotice);
      }

      // 4. Update dataStore safely with the synced event IDs
      if (result.updatedCourses && result.updatedCourses.length > 0) {
        await dataStore.updateCoursesWithCalendarEvents(result.updatedCourses);
      }

      // 5. Update parent state ONLY if result.updatedCourses is non-empty,
      // NEVER pass an empty array to parent if the existing courses or browser storage has courses!
      if (result.updatedCourses && onCoursesUpdated) {
        if (result.updatedCourses.length > 0) {
          onCoursesUpdated(result.updatedCourses);
        } else if (courses.length === 0 && browserData.courses.length === 0) {
          onCoursesUpdated([]);
        } else {
          console.warn('[CalendarSync] Guarded parent state: sync returned 0 courses while courses exist. UI wipe prevented.');
        }
      }

      const st = result.stats;
      let okText = 'All deadlines and events are up to date on your Google Calendar.';
      if (mode === 'replace' && st) {
        okText = `Synced ${st.created} event(s). Removed ${st.removed} old one(s)${st.calendarsRemoved ? ` and ${st.calendarsRemoved} extra calendar(s)` : ''}.`;
        if (st.removeFailed) okText += ` ${st.removeFailed} old item(s) could not be removed; press Sync again to retry.`;
        if (st.listUnavailable) okText += ' To find older extra Apodict calendars, disconnect and reconnect Google Calendar below and approve the new permission, then run Replace again.';
      } else if (mode === 'add' && st) {
        okText = `Added ${st.created}, skipped ${st.skipped} already synced.`;
      }
      setStatusMessage({ type: 'success', text: okText });
    } catch (err: any) {
      console.error('Error syncing calendar:', err);
      if (err.isApiDisabled) {
        setStatusMessage({
          type: 'error',
          text: 'The Google Calendar API is not enabled in your Google Cloud project. Please enable it in Google Cloud Console.',
        });
      } else if (err.isAuthError) {
        setStatusMessage({
          type: 'error',
          text: 'Google authorization expired. Please click Reconnect to continue syncing.',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: err.message || 'Sync failed. Please check your internet connection and try again.',
        });
      }
    } finally {
      setIsSyncing(false);
      setProgressText(null);
    }
  };

  // Sync button: Replace asks for confirmation first; Add runs right away
  const handleSyncClick = () => {
    if (isSyncing) return;
    if ((settings.syncMode || 'replace') === 'replace') {
      setShowReplaceConfirm(true);
    } else {
      handleSyncNow('add');
    }
  };

  const handleChangeSyncMode = async (m: 'replace' | 'add') => {
    setShowReplaceConfirm(false);
    const newSettings = { ...settings, syncMode: m };
    setSettings(newSettings);
    await calendarSyncService.saveSettings(newSettings);
  };

  // Toggle sync for a course
  const handleToggleCourse = async (courseId: string) => {
    const currentVal = settings.courseToggles[courseId] !== false; // default true
    const updatedToggles = {
      ...settings.courseToggles,
      [courseId]: !currentVal,
    };

    const newSettings = {
      ...settings,
      courseToggles: updatedToggles,
    };
    setSettings(newSettings);
    await calendarSyncService.saveSettings(newSettings);

    // If connected with valid token, reconcile in background
    if (hasValidToken()) {
      handleSyncNow();
    }
  };

  // Toggle study plan milestones
  const handleToggleMilestones = async () => {
    const newVal = !settings.includeMilestones;
    const newSettings = {
      ...settings,
      includeMilestones: newVal,
    };
    setSettings(newSettings);
    await calendarSyncService.saveSettings(newSettings);

    if (hasValidToken()) {
      handleSyncNow();
    }
  };

  // Change reminder preference
  const handleChangeReminder = async (minutes: number | null) => {
    const newSettings = {
      ...settings,
      reminderMinutes: minutes,
    };
    setSettings(newSettings);
    await calendarSyncService.saveSettings(newSettings);

    if (hasValidToken()) {
      handleSyncNow();
    }
  };

  // Disconnect Google Calendar
  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    setStatusMessage(null);
    setRecreatedNotice(null);

    try {
      await calendarSyncService.disconnect(deleteSecondaryCalendarOnDisconnect);
      setSettings({ ...DEFAULT_CALENDAR_SETTINGS });
      setShowDisconnectConfirm(false);
      setDeleteSecondaryCalendarOnDisconnect(false);
      setStatusMessage({
        type: 'info',
        text: deleteSecondaryCalendarOnDisconnect
          ? 'Disconnected from Google Calendar. The Apodict calendar and events were removed.'
          : 'Disconnected from Google Calendar. Your Apodict calendar was left intact.',
      });
    } catch (err: any) {
      console.error('Error disconnecting calendar:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to disconnect.',
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Format last synced timestamp
  const formatLastSync = (isoString: string | null) => {
    if (!isoString) return 'Never';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return 'Recently';
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="text-xs text-slate-500 dark:text-slate-400">Loading Calendar Sync preferences...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-[#f7faff] dark:bg-slate-900/60 border border-[#cfdcee] dark:border-slate-800 shadow-xs">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-[#0f1b33] dark:text-white tracking-tight">
                Google Calendar Live Sync
              </h2>
              {/* Status Badge */}
              {isConnected ? (
                settings.status === 'syncing' || isSyncing ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Syncing
                  </span>
                ) : settings.status === 'needs_reconnecting' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800">
                    <AlertCircle className="w-3 h-3" />
                    Needs reconnecting
                  </span>
                ) : settings.status === 'error' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800">
                    <AlertCircle className="w-3 h-3" />
                    Sync Error
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                    <CheckCircle2 className="w-3 h-3" />
                    Up to date
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#eef4fc] text-[#526580] border border-[#cfdcee] dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                  Not connected
                </span>
              )}
            </div>
            <p className="text-xs text-[#526580] dark:text-slate-400 mt-1">
              One-way live synchronization: deadlines you add, edit, complete, or delete update your Google Calendar automatically.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          {isConnected ? (
            <button
              onClick={handleSyncClick}
              disabled={isSyncing || settings.status === 'needs_reconnecting'}
              className="px-4 py-2 min-h-[36px] rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? (progressText || 'Syncing...') : 'Sync now'}</span>
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="px-4 py-2 min-h-[36px] rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs flex items-center gap-2.5 transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {/* Official Google 'G' icon */}
              <svg className="w-4 h-4 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isConnecting ? 'Opening Google...' : 'Connect Google Calendar'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Recreated notice if calendar was deleted externally in Google Calendar */}
      {recreatedNotice && (
        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Notice</div>
            <div>{recreatedNotice}</div>
          </div>
        </div>
      )}

      {/* Status banner messages */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
            statusMessage.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
              : statusMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
          }`}
        >
          {statusMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          )}
          <div className="flex-1">{statusMessage.text}</div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Needs reconnecting alert banner */}
      {isConnected && settings.status === 'needs_reconnecting' && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold">Authorization Expired:</span> Google tokens expire after about one hour. Changes are queued and will automatically sync once reconnected.
            </div>
          </div>
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shrink-0 cursor-pointer transition-colors"
          >
            {isConnecting ? 'Reconnecting...' : 'Reconnect Google Calendar'}
          </button>
        </div>
      )}

      {/* BEFORE CONNECTING: Explanation & Safety Highlights */}
      {!isConnected ? (
        <div className="space-y-6">
          <div className="p-6 sm:p-8 rounded-2xl bg-[#f7faff] dark:bg-slate-900/60 border border-[#cfdcee] dark:border-slate-800 shadow-xs space-y-6">
            <div className="space-y-3">
              <h3 className="text-base font-bold text-[#0f1b33] dark:text-white">
                How Calendar Sync Works
              </h3>
              <p className="text-sm text-[#3b4d69] dark:text-slate-300 leading-relaxed">
                Your deadlines appear in a separate calendar called <strong className="text-[#0f1b33] dark:text-white">Apodict</strong>, and changes in the app update it. The app can only change calendars it created itself. Edits made in Google Calendar do not come back into the app.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-[#eef4fc] dark:bg-slate-800/50 border border-[#cfdcee] dark:border-slate-700/60 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-[#0f1b33] dark:text-white">Narrow Permissions</h4>
                <p className="text-[11px] text-[#526580] dark:text-slate-400 leading-relaxed">
                  Can create and manage only its own Apodict calendars (<span className="font-mono text-[10px]">calendar.app.created</span>), and read just the names of your calendars, never their events (<span className="font-mono text-[10px]">calendar.calendarlist.readonly</span>), so it can remove duplicate Apodict calendars. It cannot view or change events on your personal calendars.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#eef4fc] dark:bg-slate-800/50 border border-[#cfdcee] dark:border-slate-700/60 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-[#0f1b33] dark:text-white">Memory-Only Token</h4>
                <p className="text-[11px] text-[#526580] dark:text-slate-400 leading-relaxed">
                  Your Google access token is kept in active memory only. It is never saved to disk, databases, or sent to backend servers.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#eef4fc] dark:bg-slate-800/50 border border-[#cfdcee] dark:border-slate-700/60 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-[#0f1b33] dark:text-white">Clean Isolated Calendar</h4>
                <p className="text-[11px] text-[#526580] dark:text-slate-400 leading-relaxed">
                  All dates go to a dedicated secondary calendar that can be toggled on or off in Google Calendar without cluttering your schedule.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-start">
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="px-5 py-2.5 min-h-[36px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs flex items-center gap-2.5 transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <svg className="w-4 h-4 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{isConnecting ? 'Connecting...' : 'Connect Google Calendar'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* AFTER CONNECTING: Account Details, Controls, Toggles, Preferences */
        <div className="space-y-6">
          {/* Summary KPI Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[#f7faff] dark:bg-slate-900/60 border border-[#cfdcee] dark:border-slate-800 shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#526580] dark:text-slate-400">
                Connected Account
              </span>
              <div className="text-xs font-semibold text-[#0f1b33] dark:text-white truncate" title={settings.accountEmail || ''}>
                {settings.accountEmail || 'Google Account'}
              </div>
              <div className="text-[11px] text-[#526580] dark:text-slate-400 truncate">
                Calendar: Apodict
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#f7faff] dark:bg-slate-900/60 border border-[#cfdcee] dark:border-slate-800 shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#526580] dark:text-slate-400">
                Last Synced
              </span>
              <div className="text-xs font-semibold text-[#0f1b33] dark:text-white">
                {formatLastSync(settings.lastSyncedAt)}
              </div>
              <div className="text-[11px] text-[#526580] dark:text-slate-400">
                {courses.length} enrolled course(s)
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#f7faff] dark:bg-slate-900/60 border border-[#cfdcee] dark:border-slate-800 shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#526580] dark:text-slate-400">
                Sync Status
              </span>
              <div className="text-xs font-semibold text-[#0f1b33] dark:text-white">
                {STATUS_LABELS[settings.status] || settings.status}
              </div>
              <div className="text-[11px] text-[#526580] dark:text-slate-400">
                {settings.skippedDeadlinesCount && settings.skippedDeadlinesCount > 0
                  ? `${settings.skippedDeadlinesCount} deadline(s) without date skipped`
                  : 'All dated deadlines synced'}
              </div>
            </div>
          </div>

          {/* Sync mode: Replace vs Add (prevents duplicate events stacking up) */}
          <div className="p-6 rounded-2xl bg-[#f7faff] dark:bg-slate-900/60 border border-[#cfdcee] dark:border-slate-800 shadow-xs space-y-4">
            <h4 className="text-sm font-bold text-[#0f1b33] dark:text-white">How should "Sync now" work?</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Sync mode">
              {([
                { v: 'replace', title: 'Replace previous synced events', help: 'Clears the Apodict calendar and creates fresh events.' },
                { v: 'add', title: 'Add to existing events', help: 'Adds new items and skips ones already synced.' },
              ] as const).map((o) => {
                const selected = (settings.syncMode || 'replace') === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={isSyncing}
                    onClick={() => handleChangeSyncMode(o.v)}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer disabled:opacity-60 ${
                      selected
                        ? 'bg-[#dbe7f8] dark:bg-indigo-950/60 border-indigo-500 text-indigo-900 dark:text-indigo-200'
                        : 'bg-[#fbfdff] dark:bg-slate-900 border-[#cfdcee] dark:border-slate-700 text-[#3b4d69] dark:text-slate-300 hover:bg-[#e3ecf9] dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                      <span>{o.title}</span>
                      {selected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                    </div>
                    <div className="text-[11px] mt-1 opacity-80">{o.help}</div>
                  </button>
                );
              })}
            </div>

            {showReplaceConfirm && (
              <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 space-y-3 animate-in fade-in duration-150">
                <div className="text-xs text-slate-900 dark:text-white">
                  This will clear the "Apodict" calendar, delete any extra Apodict calendars this app created, and create fresh events. Your other Google calendars are not touched.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReplaceConfirm(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSyncNow('replace')}
                    disabled={isSyncing}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    Replace
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Event Popup Reminder (own section) */}
          <div className="p-6 rounded-2xl bg-[#f7faff] dark:bg-slate-900/60 border border-[#cfdcee] dark:border-slate-800 shadow-xs space-y-2.5">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-bold text-[#0f1b33] dark:text-white">
                Event Popup Reminder
              </span>
            </div>
            <p className="text-[11px] text-[#526580] dark:text-slate-400">
              Choose when Google Calendar shows a popup reminder for each deadline.
            </p>

            {(() => {
              const parsedDays = Math.min(MAX_REMINDER_DAYS, Math.max(0, Math.floor(Number(reminderDays) || 0)));
              const encoded = reminderOn ? encodeReminder(parsedDays, reminderTime || '09:00') : null;
              const isDirty = encoded !== settings.reminderMinutes;
              const dayOfTimed = reminderOn && encoded !== null && encoded < 0;
              return (
                <div className="space-y-3 pt-1">
                  <div className="flex gap-2" role="radiogroup" aria-label="Reminder on or off">
                    {[{ v: true, label: 'Remind me' }, { v: false, label: 'No reminder' }].map((o) => (
                      <button
                        key={String(o.v)}
                        type="button"
                        role="radio"
                        aria-checked={reminderOn === o.v}
                        onClick={() => setReminderOn(o.v)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                          reminderOn === o.v
                            ? 'bg-[#dbe7f8] dark:bg-indigo-950/60 border-indigo-500 text-indigo-900 dark:text-indigo-200'
                            : 'bg-[#fbfdff] dark:bg-slate-900 border-[#cfdcee] dark:border-slate-700 text-[#3b4d69] dark:text-slate-300 hover:bg-[#e3ecf9] dark:hover:bg-slate-800'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>

                  {reminderOn && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#3b4d69] dark:text-slate-300">
                      <input
                        type="number"
                        min={0}
                        max={MAX_REMINDER_DAYS}
                        step={1}
                        value={reminderDays}
                        onChange={(e) => setReminderDays(e.target.value)}
                        aria-label="Days before the deadline"
                        className="w-16 px-2 py-1.5 rounded-lg border border-[#cfdcee] dark:border-slate-700 bg-[#fbfdff] dark:bg-slate-900 text-[#0f1b33] dark:text-white"
                      />
                      <span>days before (0 = the day of), at</span>
                      <input
                        type="time"
                        step={300}
                        value={reminderTime}
                        onChange={(e) => setReminderTime(e.target.value)}
                        aria-label="Reminder time"
                        className="px-2 py-1.5 rounded-lg border border-[#cfdcee] dark:border-slate-700 bg-[#fbfdff] dark:bg-slate-900 text-[#0f1b33] dark:text-white"
                      />
                    </div>
                  )}

                  {reminderOn && !dayOfTimed && (
                    <p className="text-[11px] text-[#526580] dark:text-slate-400">
                      {parsedDays === 0
                        ? 'Reminder at the start of the day. Deadlines stay all-day events.'
                        : `Reminder ${parsedDays} day${parsedDays === 1 ? '' : 's'} before at ${formatTime12(reminderTime || '09:00')}. Deadlines stay all-day events.`}
                    </p>
                  )}

                  {dayOfTimed && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        Google can't send a reminder partway through the day for an all-day event. With a day-of reminder at {formatTime12(reminderTime)}, each deadline will show up as a
                        {' '}<strong>30-minute event at {formatTime12(reminderTime)}</strong> instead of an all-day event. Choose 1 or more days before to keep all-day events.
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!isDirty || isSyncing}
                    onClick={() => handleChangeReminder(encoded)}
                    className="px-3.5 py-1.5 min-h-[34px] rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    {isSyncing ? 'Syncing...' : isDirty ? 'Save reminder and update calendar' : 'Reminder saved'}
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Sync Preferences & Course Selection */}
          <div className="p-6 rounded-2xl bg-[#f7faff] dark:bg-slate-900/60 border border-[#cfdcee] dark:border-slate-800 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#cfdcee] dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-[#0f1b33] dark:text-white">
                  Courses Synchronized to Calendar
                </h3>
                <p className="text-xs text-[#526580] dark:text-slate-400 mt-0.5">
                  Choose which courses publish deadlines to your Apodict calendar.
                </p>
              </div>
            </div>

            {/* Course Toggles */}
            <div className="space-y-2.5">
              {courses.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-2">
                  No courses added yet. Add courses on the Courses tab to sync them.
                </div>
              ) : (
                courses.map((course) => {
                  const isEnabled = settings.courseToggles[course.id] !== false; // on by default
                  const datedDeadlines = course.deadlines.filter((d) => d.date).length;

                  return (
                    <div
                      key={course.id}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-[#eef4fc] dark:bg-slate-800/50 border border-[#cfdcee] dark:border-slate-700/60 hover:bg-[#e3ecf9] dark:hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: course.color || '#3b82f6' }}
                        />
                        <div>
                          <div className="text-xs font-bold text-[#0f1b33] dark:text-white">
                            {course.code ? `${course.code}: ` : ''}{course.name}
                          </div>
                          <div className="text-[11px] text-[#526580] dark:text-slate-400">
                            {datedDeadlines} dated deadline(s) • {course.term || 'Fall 2026'}
                          </div>
                        </div>
                      </div>

                      {/* Custom Toggle Switch */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isEnabled}
                        onClick={() => handleToggleCourse(course.id)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${
                          isEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            isEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Study Plan Milestones Toggle */}
            <div className="pt-4 border-t border-[#cfdcee] dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#eef4fc] dark:bg-slate-800/50 border border-[#cfdcee] dark:border-slate-700/60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#0f1b33] dark:text-white">
                      Include study plan milestones
                    </div>
                    <div className="text-[11px] text-[#526580] dark:text-slate-400">
                      Sync backward assignment breakdown milestones from the Planner tab (off by default)
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.includeMilestones}
                  onClick={handleToggleMilestones}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${
                    settings.includeMilestones ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.includeMilestones ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Disconnect Section with in-page confirmation */}
          <div className="p-6 rounded-2xl bg-[#f7faff] dark:bg-slate-900/60 border border-[#cfdcee] dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-[#0f1b33] dark:text-white">
                  Disconnect Google Calendar
                </h4>
                <p className="text-xs text-[#526580] dark:text-slate-400 mt-0.5">
                  Stop synchronization and revoke permissions. No changes will be pushed to Google Calendar.
                </p>
              </div>

              {!showDisconnectConfirm && (
                <button
                  type="button"
                  onClick={() => setShowDisconnectConfirm(true)}
                  className="px-3.5 py-1.5 min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors self-start sm:self-center cursor-pointer"
                >
                  Disconnect
                </button>
              )}
            </div>

            {/* In-Page Disconnect Confirmation */}
            {showDisconnectConfirm && (
              <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 space-y-3 animate-in fade-in duration-150">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Are you sure you want to disconnect Google Calendar?
                </div>
                
                {/* Secondary Option: Also remove the Apodict calendar and events */}
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteSecondaryCalendarOnDisconnect}
                    onChange={(e) => setDeleteSecondaryCalendarOnDisconnect(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>Also remove the Apodict calendar and its events from Google Calendar</span>
                </label>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDisconnectConfirm(false);
                      setDeleteSecondaryCalendarOnDisconnect(false);
                    }}
                    disabled={isDisconnecting}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5"
                  >
                    {isDisconnecting ? 'Disconnecting...' : 'Confirm Disconnect'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};