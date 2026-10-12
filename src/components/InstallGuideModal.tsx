import React, { useState } from 'react';
import { 
  X, 
  Smartphone, 
  Share, 
  PlusSquare, 
  Download, 
  CheckCircle2, 
  MoreVertical, 
  ArrowRight,
  Sparkles,
  Info
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface InstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallGuideModal: React.FC<InstallGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [activePlatform, setActivePlatform] = useState<'ios' | 'android' | 'desktop'>(() => {
    if (isIOS) return 'ios';
    if (isAndroid) return 'android';
    return 'ios'; // default to mobile since prompt requested instructions for mobile
  });

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="install-modal-title"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 id="install-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                Add to Home Screen
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Install Apodict for instant offline access and native feel
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status banner if already installed or 1-click install is ready */}
        <div className="px-5 pt-4">
          {isInstalled ? (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span><strong>Apodict is already installed!</strong> You are currently running the standalone app on your device.</span>
            </div>
          ) : isInstallable ? (
            <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-indigo-900 dark:text-indigo-200">
                <Sparkles className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span>Your browser is ready to install with a single click.</span>
              </div>
              <button
                onClick={install}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install Now</span>
              </button>
            </div>
          ) : null}
        </div>

        {/* Platform tabs */}
        <div className="px-5 pt-4">
          <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-xs font-medium">
            <button
              onClick={() => setActivePlatform('ios')}
              className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                activePlatform === 'ios'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              iPhone / iPad (iOS)
            </button>
            <button
              onClick={() => setActivePlatform('android')}
              className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                activePlatform === 'android'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Android (Chrome)
            </button>
            <button
              onClick={() => setActivePlatform('desktop')}
              className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                activePlatform === 'desktop'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Mac / PC / Chrome
            </button>
          </div>
        </div>

        {/* Step-by-step instructions */}
        <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
          {activePlatform === 'ios' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Open in Safari</p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    Make sure you are browsing in Apple Safari (iOS home screen installation requires Safari).
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    Tap the Share button
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-normal">
                      <Share className="w-3 h-3 mr-1" /> Share
                    </span>
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    Look for the square icon with an upward arrow at the bottom of your Safari toolbar (or top right on iPad).
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    Select "Add to Home Screen"
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-normal">
                      <PlusSquare className="w-3 h-3 mr-1" /> Add
                    </span>
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    Scroll down through the share sheet options and tap <strong>Add to Home Screen</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  4
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Tap "Add" in the top-right</p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    Confirm the app name <strong>Apodict</strong>. The icon will appear right on your iPhone/iPad home screen like a native app!
                  </p>
                </div>
              </div>
            </div>
          )}

          {activePlatform === 'android' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Open in Chrome for Android</p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    Visit the app in Google Chrome on your Android smartphone or tablet.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    Tap the Chrome menu
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-normal">
                      <MoreVertical className="w-3 h-3" />
                    </span>
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    Tap the three vertical dots located in the upper-right corner of Chrome.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Tap "Install app" or "Add to Home screen"</p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    Select <strong>Install app</strong> (or <em>Add to Home screen</em>). Chrome will download the PWA wrapper and pin Apodict to your launcher.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  4
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Confirm Installation</p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    Tap <strong>Install</strong>. You can now launch Apodict directly from your app drawer without the browser address bar.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activePlatform === 'desktop' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Look at the URL / Address Bar</p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    In Chrome, Edge, or Brave, an <strong>Install Apodict</strong> icon appears on the right edge of the address bar.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Click "Install"</p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    Confirm in the popup. The app will launch in its own standalone window with its own dock/taskbar icon.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Benefits summary card */}
          <div className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 text-[11px] text-slate-600 dark:text-slate-300">
            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1 text-xs">
              <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Why add Apodict to your home screen?</span>
            </div>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Full-screen experience with no browser URL bar taking up space.</li>
              <li>Faster loading and cached assets so your schedule is always quick to check.</li>
              <li>One-tap access between lectures, labs, and study sessions.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
