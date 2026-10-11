import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  AlertTriangle, 
  Download, 
  Check, 
  Trash2, 
  Loader2, 
  AlertCircle,
  ShieldAlert
} from 'lucide-react';
import { User, auth, googleAuthProvider, deleteUser, reauthenticateWithPopup } from '../services/firebase';
import { dataStore } from '../services/dataStore';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountDeleted: () => void;
  user: User | null;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountDeleted,
  user,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [hasDownloadedBackup, setHasDownloadedBackup] = useState(false);
  const [downloadBlocked, setDownloadBlocked] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Recent login verification states
  const [needsReauth, setNeedsReauth] = useState(false);
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
      setHasDownloadedBackup(false);
      setDownloadBlocked(false);
      setIsDownloading(false);
      setIsDeleting(false);
      setDeleteError(null);
      setNeedsReauth(false);
      setIsReauthenticating(false);
      setReauthError(null);

      setTimeout(() => {
        cancelBtnRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Accessibility keyboard listeners (Escape, focus trap)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting && !isReauthenticating) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, isReauthenticating, onClose]);

  if (!isOpen || !user) return null;

  // Handle Download Backup first
  const handleDownloadBackup = async () => {
    setDownloadBlocked(false);
    setIsDownloading(true);
    try {
      const backup = await dataStore.createBackup();
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const filename = `semester-backup-before-deletion-${year}-${month}-${day}.json`;

      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);

      let clickSucceeded = false;
      try {
        link.click();
        clickSucceeded = true;
      } catch (clickErr) {
        console.warn('Backup download trigger failed:', clickErr);
        clickSucceeded = false;
      } finally {
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }

      if (clickSucceeded) {
        setHasDownloadedBackup(true);
      } else {
        setDownloadBlocked(true);
      }
    } catch (err) {
      console.error('Backup creation before deletion failed:', err);
      setDownloadBlocked(true);
    } finally {
      setIsDownloading(false);
    }
  };

  // Execute Deletion: First Firestore data, then Firebase user account
  const executeDelete = async () => {
    if (confirmText !== 'DELETE') return;
    setIsDeleting(true);
    setDeleteError(null);
    setNeedsReauth(false);
    setReauthError(null);

    // 1. Delete all of the student's data from Firestore FIRST
    try {
      await dataStore.deleteAllUserData(user.uid);
    } catch (dataErr: any) {
      console.error('Data deletion failed:', dataErr);
      setIsDeleting(false);
      // If deleting the data fails, do NOT delete the account, and show an inline error with a retry option
      setDeleteError(
        'Failed to delete your academic records from cloud storage. Your account has NOT been deleted. Please try again.'
      );
      return;
    }

    // 2. Delete the account itself
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setIsDeleting(false);
      dataStore.clearUserCourses();
      dataStore.clearUserPlans();
      onClose();
      onAccountDeleted();
      return;
    }

    try {
      await deleteUser(currentUser);
      dataStore.clearUserCourses();
      dataStore.clearUserPlans();
      onClose();
      onAccountDeleted();
    } catch (authErr: any) {
      console.error('Firebase account deletion error:', authErr);
      setIsDeleting(false);

      const code = authErr?.code;
      if (
        code === 'auth/requires-recent-login' ||
        authErr?.message?.includes('requires-recent-login') ||
        authErr?.message?.includes('CREDENTIAL_TOO_OLD')
      ) {
        // Ask student to sign in with Google again first, then continue
        setNeedsReauth(true);
        setDeleteError(
          'For security, Google requires you to verify your sign-in before deleting your account.'
        );
      } else {
        setDeleteError(
          authErr?.message || 'Failed to delete your user account. Please check your connection and try again.'
        );
      }
    }
  };

  // Re-authenticate with Google popup and then continue deletion
  const handleReauthAndContinue = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setIsReauthenticating(true);
    setReauthError(null);

    try {
      await reauthenticateWithPopup(currentUser, googleAuthProvider);
      setNeedsReauth(false);
      setDeleteError(null);

      // Successfully reauthenticated! Continue deleting the user account
      await deleteUser(currentUser);
      dataStore.clearUserCourses();
      dataStore.clearUserPlans();
      onClose();
      onAccountDeleted();
    } catch (reErr: any) {
      console.error('Reauthentication with Google failed:', reErr);
      setIsReauthenticating(false);
      const code = reErr?.code;
      if (code === 'auth/popup-closed-by-user') {
        setReauthError('Verification was cancelled. Please click "Verify with Google & Delete" to complete account deletion.');
      } else if (code === 'auth/popup-blocked') {
        setReauthError('The verification popup was blocked by your browser. Please allow popups and try again.');
      } else {
        setReauthError('Could not verify your Google credentials. Please try again.');
      }
    }
  };

  const isDeleteButtonEnabled = confirmText === 'DELETE' && !isDeleting && !isReauthenticating && !needsReauth;

  return (
    <div
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl max-w-lg w-full text-slate-900 dark:text-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 id="delete-account-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Delete My Account
              </h2>
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                Permanent deletion of account and cloud data
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isDeleting || isReauthenticating}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Warning Message */}
          <div className="p-4 rounded-2xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 space-y-2">
            <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-semibold text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>Warning: This action is permanent and cannot be undone</span>
            </div>
            <p className="text-xs text-rose-900/90 dark:text-rose-200/90 leading-relaxed">
              Deleting your account will permanently wipe all your saved courses, deadlines, grades, and Planner milestone roadmaps from cloud storage.
            </p>
          </div>

          {/* Download backup first button */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              Save your data before deleting?
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              We strongly suggest downloading a backup file first so you have a copy of your course syllabi, assignments, and grades on your device.
            </p>

            <button
              type="button"
              onClick={handleDownloadBackup}
              disabled={isDownloading || isDeleting}
              className="py-2 px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {hasDownloadedBackup ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Backup downloaded</span>
                </>
              ) : isDownloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Preparing backup...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Download backup first</span>
                </>
              )}
            </button>

            {downloadBlocked && (
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-xs">
                Download was blocked by your browser. Please allow popups or open the app in its own tab.
              </div>
            )}
          </div>

          {/* Inline Error with Retry Option */}
          {deleteError && !needsReauth && (
            <div 
              className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs space-y-2.5 animate-in fade-in duration-200"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{deleteError}</span>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={executeDelete}
                  disabled={isDeleting}
                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isDeleting ? 'Retrying...' : 'Retry deletion'}
                </button>
              </div>
            </div>
          )}

          {/* Recent Sign-In Prompt (if Firebase requires recent login) */}
          {needsReauth && (
            <div 
              className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs space-y-3 animate-in fade-in duration-200"
              role="alert"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold block text-amber-950 dark:text-amber-100 mb-1">
                    Sign in with Google required
                  </span>
                  Firebase requires a recent sign-in before deleting your account. Please sign in with Google again first, then continue.
                </div>
              </div>

              {reauthError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-[11px]">
                  {reauthError}
                </div>
              )}

              <button
                type="button"
                onClick={handleReauthAndContinue}
                disabled={isReauthenticating}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isReauthenticating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing in with Google...</span>
                  </>
                ) : (
                  <>
                    <span>Sign in with Google again &amp; delete</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Type DELETE to confirm */}
          {!needsReauth && (
            <div className="space-y-2">
              <label 
                htmlFor="confirm-delete-input" 
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                To confirm, please type <strong className="font-mono text-rose-600 dark:text-rose-400 tracking-wider">DELETE</strong> in the box below:
              </label>
              <input
                id="confirm-delete-input"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type DELETE"
                disabled={isDeleting}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500 disabled:opacity-50"
              />
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 flex items-center justify-end gap-2.5">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onClose}
            disabled={isDeleting || isReauthenticating}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>

          {!needsReauth && (
            <button
              type="button"
              onClick={executeDelete}
              disabled={!isDeleteButtonEnabled}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
              aria-label="Permanently delete account"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Deleting account...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Permanently delete account</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
