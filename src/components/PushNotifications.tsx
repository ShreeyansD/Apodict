import React, { useState, useEffect } from 'react';
import { 
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
  Loader2 
} from 'lucide-react';
import { getMessagingInstance, getToken, deleteToken, isSupported } from '../services/firebase';
import { dataStore, PushPreferences, DEFAULT_PUSH_PREFERENCES } from '../services/dataStore';

const PUSH_VAPID_KEY = 'BI3Pp0TuX3nDLT1Uvp3P_VgK8Ev7rXIj6I_3iWKfczc0xzAcOtrQ5JhoPOSdq7KW46_nXwnZrE1c5g-iLljQyHM';
const LOCAL_STORAGE_TOKEN_KEY = 'apodict_current_push_token';

export const PushNotifications: React.FC = () => {
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
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Push preferences state (When to remind me)
  const [prefs, setPrefs] = useState<PushPreferences>(DEFAULT_PUSH_PREFERENCES);
  const [isSavingPrefs, setIsSavingPrefs] = useState<boolean>(false);
  const [prefsMessage, setPrefsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check device capabilities and saved preferences on mount
  useEffect(() => {
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
      .then((supported) => setIsFirebaseSupported(supported))
      .catch(() => setIsFirebaseSupported(false));

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

    // Load preferences
    dataStore.getPushPreferences()
      .then((loadedPrefs) => {
        setPrefs(loadedPrefs);
      })
      .catch((err) => {
        console.warn('Failed to load push preferences:', err);
      });
  }, []);

  // Compute overall support status
  const isFullySupported = hasNotificationApi && hasServiceWorkerApi && (isFirebaseSupported ?? true);

  // Enable notifications handler
  const handleEnableNotifications = async () => {
    setActionMessage(null);
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
        text: 'Push notifications are now enabled on this device! You will receive reminder alerts.',
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
        text: 'Test notification triggered! Look for the system notification banner.',
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

  // Save "When to remind me" preferences
  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPrefs(true);
    setPrefsMessage(null);

    try {
      const saved = await dataStore.savePushPreferences(prefs);
      setPrefs(saved);
      setPrefsMessage({
        type: 'success',
        text: 'Reminder lead times saved successfully to your cloud profile.',
      });
    } catch (err: any) {
      console.error('Error saving push preferences:', err);
      setPrefsMessage({
        type: 'error',
        text: err?.message || 'Failed to save reminder preferences. Please try again.',
      });
    } finally {
      setIsSavingPrefs(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 flex items-center justify-center text-slate-700 dark:text-slate-300">
              <BellRing className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Push Notifications
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configure browser and mobile push alerts for upcoming assignment milestones.
              </p>
            </div>
          </div>
        </div>
      </div>

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

      {/* Section A: Device & Permission Status Card */}
      <section className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <ShieldCheck className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                Device & Browser Support
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Check whether this browser environment supports Web Push and view current permissions.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Feature support pill */}
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

            {/* Permission state pill */}
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
        </div>
      </section>

      {/* Section B: Device Activation Card */}
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
                      This device is receiving notifications based on your reminder schedule.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleShowTestNotification}
                    disabled={isSendingTest}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all duration-150 ease-in-out shadow-xs cursor-pointer disabled:opacity-50"
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
                    onClick={handleDisableNotifications}
                    disabled={isDisabling}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-medium transition-all duration-150 ease-in-out shadow-xs cursor-pointer disabled:opacity-50"
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
          )}
        </div>
      </section>

      {/* Section C: When to remind me Card */}
      <section className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <Clock className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                When to Remind Me
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Choose the advance notice lead times for upcoming exams, papers, and assignments.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSavePreferences} className="p-6 sm:p-8 space-y-6">
          {prefsMessage && (
            <div
              className={`p-3 sm:p-4 rounded-xl flex items-center gap-2.5 text-xs ${
                prefsMessage.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300'
              }`}
            >
              {prefsMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              )}
              <span>{prefsMessage.text}</span>
            </div>
          )}

          <div className="space-y-3">
            {/* 1 day before */}
            <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={prefs.oneDayBefore}
                onChange={(e) => setPrefs({ ...prefs, oneDayBefore: e.target.checked })}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
              />
              <div className="flex-1">
                <div className="text-xs font-medium text-slate-900 dark:text-white">
                  1 day before
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Sends an alert 24 hours prior to deadline time.
                </div>
              </div>
            </label>

            {/* 3 hours before */}
            <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={prefs.threeHoursBefore}
                onChange={(e) => setPrefs({ ...prefs, threeHoursBefore: e.target.checked })}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
              />
              <div className="flex-1">
                <div className="text-xs font-medium text-slate-900 dark:text-white">
                  3 hours before
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Sends a midday reminder for final checks and submissions.
                </div>
              </div>
            </label>

            {/* 1 hour before */}
            <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={prefs.oneHourBefore}
                onChange={(e) => setPrefs({ ...prefs, oneHourBefore: e.target.checked })}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
              />
              <div className="flex-1">
                <div className="text-xs font-medium text-slate-900 dark:text-white">
                  1 hour before
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Final countdown alert before the assignment lock or exam start.
                </div>
              </div>
            </label>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSavingPrefs}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium transition-all duration-150 ease-in-out shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSavingPrefs ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Preferences</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
