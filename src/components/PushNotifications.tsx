import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bell,
  BellRing, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  ShieldCheck, 
  Smartphone, 
  Globe, 
  Clock, 
  Send, 
  BellOff, 
  Check, 
  Loader2,
  CalendarDays,
  Plus,
  Edit3,
  Trash2,
  X,
  Server,
  HelpCircle
} from 'lucide-react';
import { Course, Deadline, DeadlineType } from '../types/academic';
import { ReminderLeadTime, NotificationRuleScope } from '../types/notifications';
import { PushSettings, PushRule, UpcomingPushReminderPreview } from '../types/push';
import { COMMON_TIMEZONES, LEAD_TIME_OPTIONS, DEADLINE_TYPES } from '../constants/reminders';
import { 
  getMessagingInstance, 
  getToken, 
  deleteToken, 
  isSupported, 
  auth,
  db,
  collection,
  getDocs,
  deleteDoc,
  doc,
  onAuthStateChanged
} from '../services/firebase';
import { dataStore, DEFAULT_PUSH_SETTINGS } from '../services/dataStore';
import { computeReminderInstant, formatReminderInstantLocal } from '../utils/reminderInstant';

const PUSH_VAPID_KEY = 'BI3Pp0TuX3nDLT1Uvp3P_VgK8Ev7rXIj6I_3iWKfczc0xzAcOtrQ5JhoPOSdq7KW46_nXwnZrE1c5g-iLljQyHM';
const LOCAL_STORAGE_TOKEN_KEY = 'apodict_current_push_token';

interface SavedDevice {
  id: string;
  token: string;
  userAgent?: string;
  createdAt?: string;
}

interface PushNotificationsProps {
  courses: Course[];
  onOpenAddCourse?: () => void;
}

function parseUserAgent(ua: string): { browser: string; os: string } {
  if (!ua) return { browser: 'Unknown Browser', os: 'Unknown OS' };
  
  let os = 'Unknown OS';
  if (/iPhone/i.test(ua)) os = 'iOS (iPhone)';
  else if (/iPad/i.test(ua)) os = 'iPadOS';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';

  let browser = 'Unknown Browser';
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome\//i.test(ua) && !/Chromium\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Opera|OPR\//i.test(ua)) browser = 'Opera';

  return { browser, os };
}

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}


export const PushNotifications: React.FC<PushNotificationsProps> = ({ courses }) => {
  // Support and permissions state
  const [hasNotificationApi, setHasNotificationApi] = useState<boolean>(false);
  const [hasServiceWorkerApi, setHasServiceWorkerApi] = useState<boolean>(false);
  const [isFirebaseSupported, setIsFirebaseSupported] = useState<boolean | null>(null);
  const [currentPermission, setCurrentPermission] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('unsupported');
  const [isIosNotStandalone, setIsIosNotStandalone] = useState<boolean>(false);

  // Push token / device state
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [isEnabledOnDevice, setIsEnabledOnDevice] = useState<boolean>(false);
  const [isEnabling, setIsEnabling] = useState<boolean>(false);
  const [isDisabling, setIsDisabling] = useState<boolean>(false);
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [isSendingServerTest, setIsSendingServerTest] = useState<boolean>(false);
  const [lastServerCheck, setLastServerCheck] = useState<{ time: string; pushesSent?: number; usersChecked?: number } | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Saved devices state
  const [devices, setDevices] = useState<SavedDevice[]>([]);
  const [isRemovingDevice, setIsRemovingDevice] = useState<string | null>(null);

  // Diagnostics check state
  const [isCheckingWhy, setIsCheckingWhy] = useState<boolean>(false);
  const [diagnosticsResult, setDiagnosticsResult] = useState<any | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

  // Rule test state
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);
  const [ruleTestResults, setRuleTestResults] = useState<Record<string, {
    success: boolean;
    title?: string;
    body?: string;
    tokenCount?: number;
    message?: string;
  }>>({});

  // Push Settings State (Time Zone & Default Time)
  const [settings, setSettings] = useState<PushSettings>(DEFAULT_PUSH_SETTINGS);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Push Rules State
  const [rules, setRules] = useState<PushRule[]>([]);
  const [, setIsLoadingRules] = useState(true);
  const [deviceWarning, setDeviceWarning] = useState<string | null>(null);

  // Rule Modal / Form State
  const [isRuleFormOpen, setIsRuleFormOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [ruleScopeType, setRuleScopeType] = useState<'specific_assignment' | 'assignment_type' | 'all_in_course'>('assignment_type');
  const [ruleDeadlineId, setRuleDeadlineId] = useState<string>('');
  const [ruleDeadlineType, setRuleDeadlineType] = useState<DeadlineType>('exam');
  const [ruleCourseId, setRuleCourseId] = useState<string>('');
  const [ruleLeadTimes, setRuleLeadTimes] = useState<ReminderLeadTime[]>(['1_day_before', 'morning_of']);
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [ruleCustomTime, setRuleCustomTime] = useState('09:00');
  const [ruleFormError, setRuleFormError] = useState<string | null>(null);
  const [isSavingRule, setIsSavingRule] = useState(false);

  // In-page delete confirmation
  const [ruleIdToDelete, setRuleIdToDelete] = useState<string | null>(null);
  const [isDeletingRule, setIsDeletingRule] = useState(false);

  // Check device capabilities and load settings & rules on mount
  useEffect(() => {
    let isMounted = true;
    const hasNotification = typeof window !== 'undefined' && 'Notification' in window;
    const hasSw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    setHasNotificationApi(hasNotification);
    setHasServiceWorkerApi(hasSw);

    if (hasNotification) {
      setCurrentPermission(Notification.permission as 'default' | 'granted' | 'denied');
    } else {
      setCurrentPermission('unsupported');
    }

    // Check Firebase messaging support
    isSupported()
      .then((supported) => {
        if (isMounted) setIsFirebaseSupported(supported);
      })
      .catch(() => {
        if (isMounted) setIsFirebaseSupported(false);
      });

    // Detect iOS not in standalone mode
    if (typeof navigator !== 'undefined' && typeof window !== 'undefined') {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
        (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
        Boolean((navigator as any).standalone);
      setIsIosNotStandalone(isIos && !isStandalone);
    }

    // Check local token
    const savedToken = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY) : null;
    if (savedToken && hasNotification && Notification.permission === 'granted') {
      setCurrentToken(savedToken);
      setIsEnabledOnDevice(true);
    }

    // Load Push Settings & Push Rules
    const loadData = async () => {
      try {
        const [savedSettings, savedRules] = await Promise.all([
          dataStore.getPushSettings(),
          dataStore.getPushRules(),
        ]);
        if (isMounted) {
          const detectedZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
          setSettings({
            ...savedSettings,
            timeZone: savedSettings.timeZone || detectedZone,
          });
          setRules(savedRules);
        }
      } catch (err) {
        console.error('Failed to load push settings or rules:', err);
      } finally {
        if (isMounted) setIsLoadingRules(false);
      }
    };

    const loadDevices = async () => {
      const user = auth.currentUser;
      if (!user) {
        if (isMounted) setDevices([]);
        return;
      }
      try {
        const snap = await getDocs(collection(db, 'users', user.uid, 'pushTokens'));
        const list: SavedDevice[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            token: data.token || '',
            userAgent: data.userAgent || '',
            createdAt: data.createdAt || '',
          });
        });
        if (isMounted) setDevices(list);
      } catch (e) {
        console.error('Failed to load devices:', e);
      }
    };

    loadData();
    loadDevices();

    const unsubscribeAuth = onAuthStateChanged(auth, () => {
      if (isMounted) {
        loadData();
        loadDevices();
      }
    });

    const fetchServerStatus = async () => {
      try {
        const res = await fetch('/api/push/status');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.lastRun) {
            setLastServerCheck({
              time: data.lastRun.time,
              pushesSent: data.lastRun.pushesSent ?? 0,
              usersChecked: data.lastRun.usersChecked ?? 0,
            });
          }
        }
      } catch {}
    };

    fetchServerStatus();

    const handleRulesUpdated = async () => {
      try {
        const updated = await dataStore.getPushRules();
        if (isMounted) setRules(updated);
      } catch (err) {
        console.error('Failed to refresh push rules:', err);
      }
    };

    window.addEventListener('push-rules-updated', handleRulesUpdated);
    return () => {
      isMounted = false;
      unsubscribeAuth();
      window.removeEventListener('push-rules-updated', handleRulesUpdated);
    };
  }, []);

  const isFullySupported = hasNotificationApi && hasServiceWorkerApi && (isFirebaseSupported ?? true);

  // Enable notifications handler
  const handleEnableNotifications = async () => {
    setActionMessage(null);
    setDeviceWarning(null);
    setIsEnabling(true);

    try {
      if (!('Notification' in window)) {
        throw new Error('Push notifications are not supported on this browser.');
      }

      // Step 1: Request permission
      const perm = await Notification.requestPermission();
      setCurrentPermission(perm as 'default' | 'granted' | 'denied');

      if (perm !== 'granted') {
        if (perm === 'denied') {
          throw new Error('Notification permission was blocked. Please enable notifications in your browser settings.');
        } else {
          throw new Error('Notification permission was dismissed. Please tap Enable again to allow notifications.');
        }
      }

      // Step 2: Ensure Service Worker is ready
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service Worker is not available in this browser.');
      }
      const swRegistration = await navigator.serviceWorker.ready;

      // Step 3: Lazy load messaging and request token
      const messaging = await getMessagingInstance();
      if (!messaging) {
        throw new Error('Firebase Messaging is not supported on this browser.');
      }

      const token = await getToken(messaging, {
        vapidKey: PUSH_VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });

      if (!token) {
        throw new Error('Could not retrieve push registration token. Please try again.');
      }

      // Step 4: Save to Firestore and Local Storage
      await dataStore.savePushToken(token);
      localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, token);

      setCurrentToken(token);
      setIsEnabledOnDevice(true);
      setActionMessage({
        type: 'success',
        text: 'Push notifications are now enabled on this device! You can now turn on reminder rules.',
      });
    } catch (err: any) {
      console.error('Error enabling push notifications:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to enable push notifications on this device.',
      });
    } finally {
      setIsEnabling(false);
    }
  };

  // Turn off notifications on this device
  const handleDisableNotifications = async () => {
    setActionMessage(null);
    setIsDisabling(true);

    try {
      const messaging = await getMessagingInstance();
      if (messaging) {
        try {
          await deleteToken(messaging);
        } catch (e) {
          console.warn('deleteToken warning:', e);
        }
      }

      if (currentToken) {
        await dataStore.removePushToken(currentToken);
      }

      localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
      setCurrentToken(null);
      setIsEnabledOnDevice(false);
      setActionMessage({
        type: 'success',
        text: 'Push notifications have been disabled on this device.',
      });
    } catch (err: any) {
      console.error('Error disabling push notifications:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to disable notifications. Please try again.',
      });
    } finally {
      setIsDisabling(false);
    }
  };

  // Show test notification locally
  const handleShowTestNotification = async () => {
    setActionMessage(null);
    setIsSendingTest(true);

    try {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service Worker not supported.');
      }
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('Apodict', {
        body: 'Notifications are working.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: '/' },
      });
      setActionMessage({
        type: 'success',
        text: 'Test notification triggered! Check your notification center or system banner.',
      });
    } catch (err: any) {
      console.error('Error showing test notification:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || 'Could not show test notification. Check if notification permissions are allowed.',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  // Send test notification via server FCM endpoint
  const handleSendServerTest = async () => {
    setActionMessage(null);
    setIsSendingServerTest(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Please sign in to send a test notification from the server.');
      }

      const idToken = await user.getIdToken();
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server test request failed.');
      }

      setActionMessage({
        type: 'success',
        text: data.message || `Test notification dispatched from server! Reached ${data.successCount ?? 1} device(s).`,
      });

      // Refresh server check status
      try {
        const statusRes = await fetch('/api/push/status');
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.lastRun) {
            setLastServerCheck({
              time: statusData.lastRun.time,
              pushesSent: statusData.lastRun.pushesSent ?? 0,
              usersChecked: statusData.lastRun.usersChecked ?? 0,
            });
          }
        }
      } catch {}
    } catch (err: any) {
      console.error('Error sending server test push:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || 'Could not send test notification from server.',
      });
    } finally {
      setIsSendingServerTest(false);
    }
  };

  // Remove a saved device from Firestore
  const handleRemoveSavedDevice = async (device: SavedDevice) => {
    const user = auth.currentUser;
    if (!user) return;
    setIsRemovingDevice(device.id);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'pushTokens', device.id));
      setDevices((prev) => prev.filter((d) => d.id !== device.id));
      if (currentToken && device.token === currentToken) {
        localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
        setCurrentToken(null);
        setIsEnabledOnDevice(false);
      }
      setActionMessage({
        type: 'success',
        text: 'Device registration removed.',
      });
    } catch (err: any) {
      console.error('Failed to remove device:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to remove device.',
      });
    } finally {
      setIsRemovingDevice(null);
    }
  };

  // Check why a reminder hasn't sent (runs dry-run diagnostics on server)
  const handleCheckWhyNotSent = async () => {
    setIsCheckingWhy(true);
    setDiagnosticsError(null);
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Please sign in to run reminder diagnostics.');
      }
      const idToken = await user.getIdToken();
      const res = await fetch('/api/push/check-me', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to evaluate reminders.');
      }
      setDiagnosticsResult(data);
    } catch (err: any) {
      console.error('Diagnostics error:', err);
      setDiagnosticsError(err?.message || 'Could not evaluate reminders.');
    } finally {
      setIsCheckingWhy(false);
    }
  };

  // Send a test reminder for a specific rule
  const handleTestRule = async (ruleId: string) => {
    setTestingRuleId(ruleId);
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Please sign in to test reminder rules.');
      }
      const idToken = await user.getIdToken();
      const res = await fetch('/api/push/test-rule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ ruleId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch test notification for rule.');
      }
      if (data.success === false) {
        setRuleTestResults((prev) => ({
          ...prev,
          [ruleId]: {
            success: false,
            message: data.message || 'No matching deadlines found for this rule.',
          },
        }));
      } else {
        setRuleTestResults((prev) => ({
          ...prev,
          [ruleId]: {
            success: true,
            title: data.title,
            body: data.body,
            tokenCount: data.tokenCount,
          },
        }));
      }
    } catch (err: any) {
      console.error('Test rule error:', err);
      setRuleTestResults((prev) => ({
        ...prev,
        [ruleId]: {
          success: false,
          message: err?.message || 'Failed to dispatch test notification.',
        },
      }));
    } finally {
      setTestingRuleId(null);
    }
  };

  // Save Push Settings (time zone & default reminder time)
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setSettingsMessage(null);

    try {
      const updated = await dataStore.savePushSettings({
        timeZone: settings.timeZone,
        defaultReminderTime: settings.defaultReminderTime || '09:00',
      });
      setSettings(updated);
      setSettingsMessage({
        type: 'success',
        text: 'Push reminder settings saved successfully.',
      });
    } catch (err: any) {
      console.error('Failed to save push settings:', err);
      setSettingsMessage({
        type: 'error',
        text: err?.message || 'Failed to save settings. Please try again.',
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Toggle push rule enabled/disabled
  const handleToggleRule = async (rule: PushRule) => {
    setDeviceWarning(null);

    // If trying to turn on while push is off, disallow and show notice
    if (!rule.enabled && !isEnabledOnDevice) {
      setDeviceWarning('Turn on notifications on this device first.');
      return;
    }

    try {
      const updated = await dataStore.togglePushRuleEnabled(rule.id, !rule.enabled);
      if (updated) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
      }
    } catch (err) {
      console.error('Failed to toggle push rule:', err);
    }
  };

  // Open modal to add rule
  const handleOpenAddRule = () => {
    setRuleFormError(null);
    setEditingRuleId(null);
    setRuleName('Push Deadline Alert');
    setRuleScopeType('assignment_type');
    setRuleDeadlineType('exam');
    setRuleCourseId('');
    setRuleDeadlineId('');
    setRuleLeadTimes(['1_day_before', 'morning_of']);
    setUseCustomTime(false);
    setRuleCustomTime(settings.defaultReminderTime || '09:00');
    setIsRuleFormOpen(true);
  };

  // Open modal to edit rule
  const handleOpenEditRule = (rule: PushRule) => {
    setRuleFormError(null);
    setEditingRuleId(rule.id);
    setRuleName(rule.name);
    setRuleScopeType(rule.scope.type);
    setRuleDeadlineType(rule.scope.deadlineType || 'exam');
    setRuleCourseId(rule.scope.courseId || '');
    setRuleDeadlineId(rule.scope.deadlineId || '');
    setRuleLeadTimes(rule.leadTimes.length > 0 ? rule.leadTimes : ['morning_of']);
    if (rule.customReminderTime) {
      setUseCustomTime(true);
      setRuleCustomTime(rule.customReminderTime);
    } else {
      setUseCustomTime(false);
      setRuleCustomTime(settings.defaultReminderTime || '09:00');
    }
    setIsRuleFormOpen(true);
  };

  // Save rule (Create or Edit)
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setRuleFormError(null);

    if (!ruleName.trim()) {
      setRuleFormError('Please enter a name for this reminder rule.');
      return;
    }

    if (ruleLeadTimes.length === 0) {
      setRuleFormError('Please select at least one lead time.');
      return;
    }

    if (ruleScopeType === 'specific_assignment' && !ruleDeadlineId) {
      setRuleFormError('Please select a specific assignment.');
      return;
    }

    if (ruleScopeType === 'all_in_course' && !ruleCourseId) {
      setRuleFormError('Please select a course for this rule.');
      return;
    }

    setIsSavingRule(true);

    const scope: NotificationRuleScope = {
      type: ruleScopeType,
      deadlineId: ruleScopeType === 'specific_assignment' ? ruleDeadlineId : undefined,
      deadlineType: ruleScopeType === 'assignment_type' ? ruleDeadlineType : undefined,
      courseId: ruleScopeType === 'assignment_type' 
        ? (ruleCourseId.trim() ? ruleCourseId : null) 
        : ruleScopeType === 'all_in_course' 
        ? ruleCourseId 
        : undefined,
    };

    // If editing, preserve current enabled state; if creating, enable only if push is turned on
    let willBeEnabled = isEnabledOnDevice;
    if (editingRuleId) {
      const existing = rules.find((r) => r.id === editingRuleId);
      willBeEnabled = existing ? existing.enabled : isEnabledOnDevice;
    }

    try {
      const saved = await dataStore.savePushRule({
        id: editingRuleId || undefined,
        name: ruleName.trim(),
        enabled: willBeEnabled,
        scope,
        leadTimes: ruleLeadTimes,
        customReminderTime: useCustomTime ? ruleCustomTime : null,
      });

      setRules((prev) => {
        const filtered = prev.filter((r) => r.id !== saved.id);
        return [saved, ...filtered];
      });

      setIsRuleFormOpen(false);

      if (!isEnabledOnDevice) {
        setDeviceWarning('Turn on notifications on this device first.');
      }
    } catch (err: any) {
      setRuleFormError(err?.message || 'Failed to save rule. Please try again.');
    } finally {
      setIsSavingRule(false);
    }
  };

  // Delete rule
  const handleExecuteDeleteRule = async () => {
    if (!ruleIdToDelete) return;
    setIsDeletingRule(true);
    try {
      const success = await dataStore.deletePushRule(ruleIdToDelete);
      if (success) {
        setRules((prev) => prev.filter((r) => r.id !== ruleIdToDelete));
      }
      setRuleIdToDelete(null);
    } catch (err) {
      console.error('Failed to delete push rule:', err);
    } finally {
      setIsDeletingRule(false);
    }
  };

  // Collect all saved deadlines across all courses
  const allDeadlinesWithCourse = useMemo(() => {
    const list: Array<{ deadline: Deadline; course: Course }> = [];
    courses.forEach((c) => {
      c.deadlines.forEach((d) => {
        list.push({ deadline: d, course: c });
      });
    });
    return list;
  }, [courses]);

  const undatedDeadlinesCount = useMemo(() => {
    return allDeadlinesWithCourse.filter((item) => !item.deadline.date).length;
  }, [allDeadlinesWithCourse]);

  // Generate Upcoming Reminders Preview (Next 15)
  // Computed in the selected time zone (date + time of day interpreted in settings.timeZone)
  const upcomingReminders = useMemo(() => {
    const activeRules = rules.filter((r) => r.enabled);
    if (activeRules.length === 0) return [];

    const nowTime = Date.now();
    const reminders: UpcomingPushReminderPreview[] = [];
    const seenDeduplicationKeys = new Set<string>();

    for (const rule of activeRules) {
      const reminderTimeOfDay = rule.customReminderTime || settings.defaultReminderTime || '09:00';
      const [remHours, remMinutes] = reminderTimeOfDay.split(':').map((s) => parseInt(s, 10) || 0);

      const matchingItems = allDeadlinesWithCourse.filter(({ deadline, course }) => {
        if (deadline.completed) return false;
        if (!deadline.date) return false;

        if (rule.scope.type === 'specific_assignment') {
          return deadline.id === rule.scope.deadlineId;
        }

        if (rule.scope.type === 'all_in_course') {
          return course.id === rule.scope.courseId;
        }

        if (rule.scope.type === 'assignment_type') {
          const typeMatches = deadline.type === rule.scope.deadlineType;
          if (!typeMatches) return false;
          if (rule.scope.courseId) {
            return course.id === rule.scope.courseId;
          }
          return true;
        }

        return false;
      });

      for (const { deadline, course } of matchingItems) {
        if (!deadline.date) continue;

        for (const leadTime of rule.leadTimes) {
          const leadOption = LEAD_TIME_OPTIONS.find((opt) => opt.id === leadTime);
          const daysToSubtract = leadOption ? leadOption.daysBefore : 0;

          // Compute exact reminder timestamp using luxon
          const instantUtcDt = computeReminderInstant(
            deadline.date,
            reminderTimeOfDay,
            daysToSubtract,
            settings.timeZone
          );
          const instantMs = instantUtcDt.toMillis();

          if (instantMs <= nowTime) {
            continue;
          }

          const reminderIso = instantUtcDt.toISO()!;
          const deduplicationKey = `${deadline.id}-${reminderIso}`;
          if (seenDeduplicationKeys.has(deduplicationKey)) {
            continue;
          }
          seenDeduplicationKeys.add(deduplicationKey);

          const formattedDateTime = formatReminderInstantLocal(instantUtcDt, settings.timeZone);

          reminders.push({
            id: `${rule.id}-${deadline.id}-${leadTime}`,
            deadlineId: deadline.id,
            deadlineTitle: deadline.title,
            deadlineDate: deadline.date,
            deadlineType: deadline.type,
            courseId: course.id,
            courseName: course.name,
            courseColor: course.color || 'indigo',
            reminderDateTime: reminderIso,
            reminderFormattedTime: formattedDateTime,
            leadTime,
            leadTimeLabel: leadOption ? leadOption.label : leadTime,
            ruleId: rule.id,
            ruleName: rule.name,
          });
        }
      }
    }

    reminders.sort((a, b) => new Date(a.reminderDateTime).getTime() - new Date(b.reminderDateTime).getTime());
    return reminders.slice(0, 15);
  }, [rules, settings, allDeadlinesWithCourse]);

  const step1Done = isEnabledOnDevice;
  const step2Done = rules.some((r) => r.enabled);
  const allStepsDone = step1Done && step2Done;

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 flex items-center justify-center text-slate-700 dark:text-slate-300">
              <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Notifications
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Get deadline alerts on this phone or computer.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenAddRule}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium transition-all duration-150 ease-in-out shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Rule</span>
          </button>
        </div>
      </div>

      {/* Setup Strip */}
      {!allStepsDone && (
        <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/40 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Step 1 */}
            <div className={`flex items-center gap-2.5 p-3 rounded-lg border transition-colors ${
              step1Done 
                ? 'border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200' 
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-slate-700 dark:text-slate-300'
            }`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                step1Done 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}>
                {step1Done ? <Check className="w-3 h-3 stroke-[3]" /> : '1'}
              </div>
              <span className="text-xs font-medium">1. Enable on this device</span>
            </div>

            {/* Step 2 */}
            <div className={`flex items-center gap-2.5 p-3 rounded-lg border transition-colors ${
              step2Done 
                ? 'border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200' 
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-slate-700 dark:text-slate-300'
            }`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                step2Done 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}>
                {step2Done ? <Check className="w-3 h-3 stroke-[3]" /> : '2'}
              </div>
              <span className="text-xs font-medium">2. Create a rule</span>
            </div>

            {/* Step 3 */}
            <div className={`flex items-center gap-2.5 p-3 rounded-lg border transition-colors ${
              allStepsDone 
                ? 'border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200' 
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-slate-700 dark:text-slate-300'
            }`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                allStepsDone 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}>
                {allStepsDone ? <Check className="w-3 h-3 stroke-[3]" /> : '3'}
              </div>
              <span className="text-xs font-medium">3. You're set</span>
            </div>
          </div>
        </div>
      )}

      {/* iOS Standalone Warning Notice */}
      {isIosNotStandalone && (
        <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3">
          <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
            <strong>On iPhone</strong>, add Apodict to your Home Screen and open it from there to get notifications.
          </div>
        </div>
      )}

      {/* Permission Blocked Notice */}
      {currentPermission === 'denied' && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <strong>Notifications are blocked.</strong> Your browser settings currently prevent Apodict from sending notifications. To receive alerts, please open your browser or device site permissions and change Notifications to <strong>Allow</strong>.
          </div>
        </div>
      )}

      {/* Inline Device Warning Notice */}
      {deviceWarning && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 animate-in fade-in duration-150">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            {deviceWarning}
          </div>
          <button
            onClick={() => setDeviceWarning(null)}
            className="text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-100 p-0.5 rounded transition-all duration-150 ease-in-out cursor-pointer"
            aria-label="Dismiss warning"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SECTION A: Device & Permission Status Card */}
      <section className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <ShieldCheck className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                Device &amp; Browser Support
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Check whether this browser environment supports Web Push and view current permissions.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Feature support */}
            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/40 flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Push Capability</span>
                  {isFullySupported ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" /> Supported
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                      <AlertCircle className="w-3 h-3" /> Limited
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center justify-between">
                    <span>Notification API:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {hasNotificationApi ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Service Worker:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {hasServiceWorkerApi ? 'Active' : 'Unavailable'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Firebase Messaging:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {isFirebaseSupported === null ? 'Checking...' : isFirebaseSupported ? 'Supported' : 'Unsupported'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Permission state */}
            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/40 flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Current Permission</span>
                  {currentPermission === 'granted' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" /> Allowed
                    </span>
                  )}
                  {currentPermission === 'denied' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                      <AlertCircle className="w-3 h-3" /> Blocked
                    </span>
                  )}
                  {currentPermission === 'default' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
                      Not asked
                    </span>
                  )}
                  {currentPermission === 'unsupported' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
                      Unsupported
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {currentPermission === 'granted' && 'This device has granted permission to receive background push notifications from Apodict.'}
                  {currentPermission === 'denied' && 'Permission is blocked in this browser. To unblock, tap the lock or site settings icon in your address bar.'}
                  {currentPermission === 'default' && 'Permission has not been requested yet on this device. Click Enable below to grant access.'}
                  {currentPermission === 'unsupported' && 'This browser does not support standard web notification APIs.'}
                </p>
              </div>
            </div>
          </div>

          {/* Server Health Status */}
          <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
            {(() => {
              const isDelayed = !lastServerCheck?.time || (Date.now() - new Date(lastServerCheck.time).getTime() > 30 * 60 * 1000);
              return isDelayed ? (
                <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-start gap-2.5 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-semibold flex items-center gap-2">
                      <span>Server Health: Delayed</span>
                      {lastServerCheck?.time && (
                        <span className="font-normal text-[11px] opacity-80">
                          (Last check: {formatTimeAgo(new Date(lastServerCheck.time))})
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90">
                      Reminder checks may be delayed. Reminders will still send once checks resume.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Last server check: <strong className="text-slate-900 dark:text-white font-medium">{formatTimeAgo(new Date(lastServerCheck.time))}</strong></span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" /> Healthy
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Check Why A Reminder Hasn't Sent Diagnostics */}
          <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                  Reminder Dispatch Diagnostics
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Troubleshoot why an alert hasn't delivered or preview exact server schedule timings.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCheckWhyNotSent}
                disabled={isCheckingWhy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all duration-150 ease-in-out shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isCheckingWhy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <HelpCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                )}
                <span>Check why a reminder hasn't sent</span>
              </button>
            </div>

            {diagnosticsError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{diagnosticsError}</span>
              </div>
            )}

            {diagnosticsResult && (
              <div className="p-4 sm:p-5 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-slate-900/60 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                      Server Reminder Evaluation Report
                    </h4>
                  </div>
                  <button
                    onClick={() => setDiagnosticsResult(null)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title="Close diagnostics"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Summary grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-800/40">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Push Tokens</div>
                    <div className="font-semibold text-slate-900 dark:text-white mt-0.5">{diagnosticsResult.user.tokenCount} registered</div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-800/40">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Enabled Rules</div>
                    <div className="font-semibold text-slate-900 dark:text-white mt-0.5">{diagnosticsResult.user.enabledRuleCount} active</div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-800/40">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Time Zone</div>
                    <div className="font-semibold text-slate-900 dark:text-white mt-0.5 truncate" title={diagnosticsResult.user.timeZoneUsed}>
                      {diagnosticsResult.user.timeZoneUsed}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-800/40">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Default Dispatch</div>
                    <div className="font-semibold text-slate-900 dark:text-white mt-0.5">{diagnosticsResult.user.defaultReminderTimeUsed}</div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>Server Time (UTC): <strong className="font-mono text-slate-700 dark:text-slate-300">{diagnosticsResult.serverTime}</strong></span>
                  <span>Evaluation Window: <strong className="text-slate-700 dark:text-slate-300">{diagnosticsResult.windowMinutes} minutes</strong></span>
                </div>

                {/* Rules & Deadlines list */}
                <div className="space-y-3 pt-1">
                  {diagnosticsResult.user.rules.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic">No enabled rules found for this user.</p>
                  ) : (
                    diagnosticsResult.user.rules.map((r: any) => (
                      <div key={r.ruleId} className="p-3 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-white">
                          <span>Rule: {r.ruleName}</span>
                          <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                            {r.deadlines.length} deadline check{r.deadlines.length === 1 ? '' : 's'}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {r.deadlines.map((dl: any, idx: number) => {
                            const isDue = dl.status === 'due now';
                            const isSent = dl.status === 'already sent';
                            const isEarly = dl.status.startsWith('too early');
                            const isLate = dl.status.startsWith('too late');

                            let badgeColor = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
                            if (isDue) badgeColor = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
                            else if (isSent) badgeColor = 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20';
                            else if (isEarly) badgeColor = 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20';
                            else if (isLate) badgeColor = 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';

                            return (
                              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 p-2 rounded-md bg-slate-50/50 dark:bg-slate-800/30 text-xs">
                                <div className="min-w-0">
                                  <span className="font-medium text-slate-800 dark:text-slate-200">
                                    {dl.deadlineTitle || 'No matching deadlines'}
                                  </span>
                                  {dl.courseName && (
                                    <span className="text-slate-500 dark:text-slate-400 ml-1.5">({dl.courseName})</span>
                                  )}
                                  {dl.reminderInstantLocal && (
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                      Reminder time: {dl.reminderInstantLocal} ({dl.leadTime})
                                    </div>
                                  )}
                                </div>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border shrink-0 ${badgeColor}`}>
                                  {dl.status}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Saved Devices List */}
          <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                  <span>Registered Devices ({devices.length})</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Phones and computers configured to receive your deadline notifications.
                </p>
              </div>
            </div>

            {devices.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                No devices currently registered. Tap "Enable notifications on this device" below to register this device.
              </div>
            ) : (
              <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60 border border-slate-200/80 dark:border-slate-800/80 rounded-xl overflow-hidden bg-slate-50/30 dark:bg-slate-900/20">
                {devices.map((device) => {
                  const parsed = parseUserAgent(device.userAgent || '');
                  const isThis = currentToken && device.token === currentToken;
                  return (
                    <div key={device.id} className="p-3.5 sm:p-4 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/40 flex items-center justify-center shrink-0 text-indigo-600 dark:text-indigo-400">
                          <Smartphone className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900 dark:text-white truncate">
                              {parsed.browser} on {parsed.os}
                            </span>
                            {isThis && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                                This device
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Added {device.createdAt ? new Date(device.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveSavedDevice(device)}
                        disabled={isRemovingDevice === device.id}
                        className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isRemovingDevice === device.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          'Remove'
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION B: Device Activation Card */}
      <section className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <BellRing className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                Device Notification Activation
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Register this device with Apodict Cloud to receive deadline reminders.
              </p>
            </div>
          </div>

          {isEnabledOnDevice && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Enabled on this device
            </span>
          )}
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {actionMessage && (
            <div
              className={`p-3 sm:p-4 rounded-xl flex items-center gap-2.5 text-xs ${
                actionMessage.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300'
              }`}
            >
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              )}
              <span>{actionMessage.text}</span>
            </div>
          )}

          {!isEnabledOnDevice ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Enable notifications on this device
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Allow Apodict to send alerts directly to your browser or lock screen.
                </p>
              </div>

              <button
                type="button"
                onClick={handleEnableNotifications}
                disabled={isEnabling || currentPermission === 'denied'}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium transition-all duration-150 ease-in-out shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {isEnabling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Enabling...</span>
                  </>
                ) : (
                  <>
                    <BellRing className="w-3.5 h-3.5" />
                    <span>Enable notifications on this device</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20 flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                    <Check className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      Active and Registered
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      This device is receiving notifications based on your reminder rules.
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full sm:w-auto">
                  <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleShowTestNotification}
                      disabled={isSendingTest || isSendingServerTest}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all duration-150 ease-in-out shadow-xs cursor-pointer disabled:opacity-50"
                      title="Show a local test notification in this browser"
                    >
                      {isSendingTest ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      )}
                      <span>Show test notification</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSendServerTest}
                      disabled={isSendingServerTest || isSendingTest}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-medium transition-all duration-150 ease-in-out shadow-xs cursor-pointer disabled:opacity-50"
                      title="Send a real test push notification from the server"
                    >
                      {isSendingServerTest ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Server className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      )}
                      <span>Send test from server</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDisableNotifications}
                      disabled={isDisabling}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-medium transition-all duration-150 ease-in-out shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      {isDisabling ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <BellOff className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      )}
                      <span>Turn off on this device</span>
                    </button>
                  </div>
                </div>
              </div>

              {lastServerCheck && (
                <div className="flex items-center gap-2 px-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>
                    Last server check:{' '}
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {new Date(lastServerCheck.time).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {typeof lastServerCheck.pushesSent === 'number' && (
                      <span className="ml-1 text-slate-500 dark:text-slate-400">
                        ({lastServerCheck.pushesSent} push{lastServerCheck.pushesSent === 1 ? '' : 'es'} sent)
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 1: Push Settings Card (Timezone & Default Reminder Time) */}
      <section className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <Clock className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                Push Notification Settings
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configure your alert time zone and default daily dispatch time.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Time Zone Selection */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Time Zone
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={settings.timeZone}
                  onChange={(e) => setSettings({ ...settings, timeZone: e.target.value })}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-xs text-slate-900 dark:text-white font-medium focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out cursor-pointer"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                All push reminders and preview schedules will be calculated in this zone.
              </p>
            </div>

            {/* Default Reminder Time */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Default Alert Time
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="time"
                  value={settings.defaultReminderTime || '09:00'}
                  onChange={(e) => setSettings({ ...settings, defaultReminderTime: e.target.value })}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-xs text-slate-900 dark:text-white font-medium focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Default time for alerts (default 9:00 AM). Individual rules can override this.
              </p>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
            <div>
              {settingsMessage && (
                <div className={`inline-flex items-center gap-2 text-xs font-medium ${
                  settingsMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {settingsMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{settingsMessage.text}</span>
                </div>
              )}
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium transition-all duration-150 ease-in-out shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 self-end sm:self-auto cursor-pointer"
            >
              {isSavingSettings ? 'Saving Settings...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 2: Push Reminder Rules */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <span>Reminder Rules</span>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/70 dark:border-slate-700/70">
                {rules.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Rules follow your course deadlines automatically. If a deadline date changes, push reminders adjust.
            </p>
          </div>

          <button
            onClick={handleOpenAddRule}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium transition-all duration-150 ease-in-out shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Rule</span>
          </button>
        </div>

        {/* Delete Confirmation Alert Banner */}
        {ruleIdToDelete && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <div className="text-xs font-medium text-rose-900 dark:text-rose-200">
                Are you sure you want to permanently delete this push reminder rule?
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() => setRuleIdToDelete(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-950/40 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-150 ease-in-out cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDeleteRule}
                disabled={isDeletingRule}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-xs transition-all duration-150 ease-in-out cursor-pointer"
              >
                {isDeletingRule ? 'Deleting...' : 'Delete Rule'}
              </button>
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <div className="p-8 sm:p-12 rounded-xl bg-white dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3">
            <div className="w-10 h-10 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 flex items-center justify-center mx-auto">
              <BellRing className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">No Reminder Rules Configured</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                Add your first rule to receive automated push alerts before exams, projects, or homework deadlines.
              </p>
            </div>
            <button
              onClick={handleOpenAddRule}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium shadow-xs inline-flex items-center gap-1.5 transition-all duration-150 ease-in-out cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Rule</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {rules.map((rule) => {
              let scopeLabel = '';
              let scopeDetail = '';

              if (rule.scope.type === 'specific_assignment') {
                const foundItem = allDeadlinesWithCourse.find((i) => i.deadline.id === rule.scope.deadlineId);
                scopeLabel = 'Specific Assignment';
                scopeDetail = foundItem 
                  ? `${foundItem.deadline.title} (${foundItem.course.name})` 
                  : 'Assignment Deadline';
              } else if (rule.scope.type === 'all_in_course') {
                const foundCourse = courses.find((c) => c.id === rule.scope.courseId);
                scopeLabel = 'All Course Deadlines';
                scopeDetail = foundCourse ? foundCourse.name : 'Selected Course';
              } else {
                const typeName = DEADLINE_TYPES.find((t) => t.id === rule.scope.deadlineType)?.label || rule.scope.deadlineType;
                if (rule.scope.courseId) {
                  const foundCourse = courses.find((c) => c.id === rule.scope.courseId);
                  scopeLabel = `All ${typeName}s`;
                  scopeDetail = `In ${foundCourse ? foundCourse.name : 'Selected Course'}`;
                } else {
                  scopeLabel = `All ${typeName}s`;
                  scopeDetail = 'Across all courses';
                }
              }

              return (
                <div
                  key={rule.id}
                  className={`p-6 rounded-xl border transition-all duration-150 ease-in-out ${
                    rule.enabled
                      ? 'bg-white dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/80 shadow-xs'
                      : 'bg-slate-50/50 dark:bg-slate-900/20 border-slate-200/60 dark:border-slate-800/50 opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${rule.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white truncate">
                          {rule.name}
                        </h3>
                      </div>

                      <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-400 dark:text-slate-500">Scope:</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {scopeLabel}
                          </span>
                          <span className="truncate text-slate-500 dark:text-slate-400">({scopeDetail})</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-slate-400 dark:text-slate-500">Lead Times:</span>
                          {rule.leadTimes.map((lt, idx) => {
                            const opt = LEAD_TIME_OPTIONS.find((o) => o.id === lt);
                            return (
                              <React.Fragment key={lt}>
                                {idx > 0 && <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>}
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {opt ? opt.label : lt}
                                </span>
                              </React.Fragment>
                            );
                          })}
                        </div>

                        <div className="text-slate-500 dark:text-slate-400 pt-0.5 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            Time: {rule.customReminderTime || `${settings.defaultReminderTime || '09:00'} (default)`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Toggle and Action Buttons */}
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule)}
                        className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-150 ${
                          rule.enabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                        title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                        aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform duration-150 ${
                            rule.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>

                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleTestRule(rule.id)}
                          disabled={testingRuleId === rule.id}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all duration-150 ease-in-out shadow-xs cursor-pointer disabled:opacity-50"
                          title="Send a sample reminder now for this rule"
                        >
                          {testingRuleId === rule.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Send className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                          )}
                          <span>Send test now</span>
                        </button>
                        <button
                          onClick={() => handleOpenEditRule(rule)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150 ease-in-out cursor-pointer"
                          title="Edit rule"
                          aria-label="Edit rule"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setRuleIdToDelete(rule.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150 ease-in-out cursor-pointer"
                          title="Delete rule"
                          aria-label="Delete rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {ruleTestResults[rule.id] && (
                    <div
                      className={`mt-3.5 p-3 rounded-lg text-xs border ${
                        ruleTestResults[rule.id].success
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-900 dark:text-emerald-200'
                          : 'bg-rose-500/10 border-rose-500/20 text-rose-900 dark:text-rose-200'
                      }`}
                    >
                      {ruleTestResults[rule.id].success ? (
                        <div className="space-y-1">
                          <div className="font-semibold flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>
                              Test push dispatched to {ruleTestResults[rule.id].tokenCount ?? 1} device{ruleTestResults[rule.id].tokenCount === 1 ? '' : 's'}!
                            </span>
                          </div>
                          <div className="text-[11px] space-y-0.5 pl-5 opacity-90 text-emerald-950 dark:text-emerald-100">
                            <div><strong className="font-medium">Title:</strong> {ruleTestResults[rule.id].title}</div>
                            <div><strong className="font-medium">Body:</strong> {ruleTestResults[rule.id].body}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                          <span>{ruleTestResults[rule.id].message}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 3: Preview Upcoming Reminders */}
      <section className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-700 dark:text-slate-300">
              <CalendarDays className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>Upcoming Reminders</span>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/70 dark:border-slate-700/70">
                  {upcomingReminders.length} / 15
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                The next 15 scheduled reminders produced by your enabled rules in time zone: <strong className="text-slate-700 dark:text-slate-300">{settings.timeZone}</strong>.
              </p>
            </div>
          </div>

          {undatedDeadlinesCount > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800/70 text-xs text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/80">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                <strong>{undatedDeadlinesCount}</strong> {undatedDeadlinesCount === 1 ? 'deadline was' : 'deadlines were'} ignored because they have no date.
              </span>
            </div>
          )}
        </div>

        <div className="p-6 sm:p-8">
          {upcomingReminders.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-10 h-10 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-800/50 text-slate-400 flex items-center justify-center mx-auto">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white">No Upcoming Reminders Scheduled</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                  {rules.filter((r) => r.enabled).length === 0
                    ? 'All rules are currently disabled or no rules exist yet. Turn on a rule above to preview scheduled alerts.'
                    : 'There are no future matching deadlines found for your active rules. Completed deadlines and past dates are automatically skipped.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingReminders.map((preview, index) => (
                <div
                  key={preview.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/20 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all duration-150 ease-in-out gap-4"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <span className="w-7 text-center text-xs font-mono font-medium text-slate-400 shrink-0">
                      #{index + 1}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {preview.deadlineTitle}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {preview.courseName}
                        </span>
                        <span className="tracking-wider text-[10px] font-bold uppercase text-slate-400 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                          {preview.deadlineType}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>Due <strong className="font-medium text-slate-700 dark:text-slate-300">{preview.deadlineDate}</strong></span>
                        <span aria-hidden="true">·</span>
                        <span>Lead: <strong className="font-medium text-indigo-600 dark:text-indigo-400">{preview.leadTimeLabel}</strong></span>
                        <span aria-hidden="true">·</span>
                        <span>Rule: <span className="text-slate-600 dark:text-slate-300">{preview.ruleName}</span></span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-left sm:text-right pl-10 sm:pl-0">
                    <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center sm:justify-end gap-1.5 font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{preview.reminderFormattedTime}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Push notification
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* RULE MODAL: Add / Edit Push Rule */}
      {isRuleFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-md max-w-lg w-full p-6 sm:p-8 space-y-6 my-8 transition-all duration-150 ease-in-out">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                  {editingRuleId ? 'Edit Push Reminder Rule' : 'Create Push Reminder Rule'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure the scope, lead times, and alert time for this rule.
                </p>
              </div>
              <button
                onClick={() => setIsRuleFormOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150 ease-in-out cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {ruleFormError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{ruleFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveRule} className="space-y-6">
              {/* Rule Name */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Rule Name
                </label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. Midterm & Final Exams alert"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out"
                  required
                />
              </div>

              {/* Rule Scope Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Scope
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setRuleScopeType('assignment_type')}
                    className={`p-2.5 rounded-lg border text-xs font-medium text-center transition-all duration-150 ease-in-out cursor-pointer ${
                      ruleScopeType === 'assignment_type'
                        ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    Assignment Type
                  </button>

                  <button
                    type="button"
                    onClick={() => setRuleScopeType('all_in_course')}
                    className={`p-2.5 rounded-lg border text-xs font-medium text-center transition-all duration-150 ease-in-out cursor-pointer ${
                      ruleScopeType === 'all_in_course'
                        ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    All in Course
                  </button>

                  <button
                    type="button"
                    onClick={() => setRuleScopeType('specific_assignment')}
                    className={`p-2.5 rounded-lg border text-xs font-medium text-center transition-all duration-150 ease-in-out cursor-pointer ${
                      ruleScopeType === 'specific_assignment'
                        ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    Specific Item
                  </button>
                </div>
              </div>

              {/* Scope Detail */}
              {ruleScopeType === 'assignment_type' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Assignment Type
                    </label>
                    <select
                      value={ruleDeadlineType}
                      onChange={(e) => setRuleDeadlineType(e.target.value as DeadlineType)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out cursor-pointer"
                    >
                      {DEADLINE_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Course Filter
                    </label>
                    <select
                      value={ruleCourseId}
                      onChange={(e) => setRuleCourseId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out cursor-pointer"
                    >
                      <option value="">All Courses</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {ruleScopeType === 'all_in_course' && (
                <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Select Course
                  </label>
                  <select
                    value={ruleCourseId}
                    onChange={(e) => setRuleCourseId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out cursor-pointer"
                    required
                  >
                    <option value="">-- Choose a Course --</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.deadlines.length} deadlines)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {ruleScopeType === 'specific_assignment' && (
                <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Select Specific Assignment
                  </label>
                  <select
                    value={ruleDeadlineId}
                    onChange={(e) => setRuleDeadlineId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out cursor-pointer"
                    required
                  >
                    <option value="">-- Choose from saved deadlines --</option>
                    {allDeadlinesWithCourse.map(({ deadline, course }) => (
                      <option key={deadline.id} value={deadline.id}>
                        {course.name} - {deadline.title} ({deadline.date || 'No Date'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Lead Times Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Lead Times (pick one or more)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {LEAD_TIME_OPTIONS.map((opt) => {
                    const isChecked = ruleLeadTimes.includes(opt.id);
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-all duration-150 ease-in-out ${
                          isChecked
                            ? 'border-indigo-600/70 dark:border-indigo-500/70 bg-indigo-50/40 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200 font-medium'
                            : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setRuleLeadTimes([...ruleLeadTimes, opt.id]);
                            } else {
                              setRuleLeadTimes(ruleLeadTimes.filter((lt) => lt !== opt.id));
                            }
                          }}
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Reminder Time Override */}
              <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 space-y-2.5">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomTime}
                    onChange={(e) => setUseCustomTime(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Set a custom time of day for this rule
                  </span>
                </label>

                {useCustomTime ? (
                  <div className="pt-2 pl-6 flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <input
                      type="time"
                      value={ruleCustomTime}
                      onChange={(e) => setRuleCustomTime(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out cursor-pointer"
                    />
                    <span className="text-xs text-slate-500">
                      Overrides the default {settings.defaultReminderTime || '09:00'} setting.
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 pl-6">
                    Will use your account default reminder time: <strong>{settings.defaultReminderTime || '09:00'}</strong>.
                  </p>
                )}
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setIsRuleFormOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-950/40 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-150 ease-in-out cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRule}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium transition-all duration-150 ease-in-out shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingRule ? 'Saving Rule...' : editingRuleId ? 'Update Rule' : 'Save Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
