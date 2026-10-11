import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Download, 
  Upload, 
  HardDrive, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  FileJson,
  Calendar,
  Check,
  RotateCcw,
  ArrowRight
} from 'lucide-react';
import { Course, AssignmentPlan } from '../types/academic';
import { dataStore } from '../services/dataStore';

const LAST_BACKUP_STORAGE_KEY = 'semester_backup_last_date';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess: (updatedCourses: Course[]) => void;
}

interface StagedBackup {
  courses: Course[];
  plans: AssignmentPlan[];
  summary: string;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess,
}) => {
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [downloadBlocked, setDownloadBlocked] = useState(false);
  const [downloadSuccessMsg, setDownloadSuccessMsg] = useState<string | null>(null);
  // Restore flow states
  const [stagedBackup, setStagedBackup] = useState<StagedBackup | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);
  const [browserImportMsg, setBrowserImportMsg] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [hasDownloadedCurrentBeforeReplace, setHasDownloadedCurrentBeforeReplace] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const downloadBtnRef = useRef<HTMLButtonElement | null>(null);

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Load last backup timestamp from localStorage
  useEffect(() => {
    if (isOpen) {
      resetFileInput();
      try {
        const saved = localStorage.getItem(LAST_BACKUP_STORAGE_KEY);
        setLastBackupDate(saved || null);
      } catch (e) {
        console.error('Error reading last backup timestamp:', e);
      }
      setDownloadBlocked(false);
      setDownloadSuccessMsg(null);
      setRestoreError(null);
      setRestoreSuccessMsg(null);
      setBrowserImportMsg(null);
      setStagedBackup(null);
      setShowReplaceConfirm(false);
      setHasDownloadedCurrentBeforeReplace(false);

      // Focus initial control
      setTimeout(() => {
        downloadBtnRef.current?.focus();
      }, 50);
    } else {
      resetFileInput();
    }
  }, [isOpen]);

  // Keyboard navigation & accessibility (Escape to close, focus trap)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Format date helper for "Last backup: <date>"
  const formatLastBackupDisplay = (isoStr: string | null): string => {
    if (!isoStr) return 'Never';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return 'Never';
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return 'Never';
    }
  };

  // Format date helper for staged summary
  const formatExportDate = (isoStr?: string | null): string => {
    if (!isoStr) return 'Unknown date';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return 'Unknown date';
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Unknown date';
    }
  };

  // Trigger file download
  const handleDownloadBackup = async (): Promise<boolean> => {
    setDownloadBlocked(false);
    setDownloadSuccessMsg(null);
    try {
      const backup = await dataStore.createBackup();
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const filename = `semester-backup-${year}-${month}-${day}.json`;

      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.download = filename;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      
      let clickSucceeded = false;
      try {
        link.click();
        clickSucceeded = true;
      } catch (clickErr) {
        console.warn('Direct link click threw exception:', clickErr);
        clickSucceeded = false;
      } finally {
        // Delay node removal slightly to ensure browser executes the click stream
        setTimeout(() => {
          if (document.body.contains(link)) {
            document.body.removeChild(link);
          }
          URL.revokeObjectURL(url);
        }, 100);
      }

      if (!clickSucceeded) {
        setDownloadBlocked(true);
        return false;
      }

      // Record last backup date and persist
      const nowIso = now.toISOString();
      try {
        localStorage.setItem(LAST_BACKUP_STORAGE_KEY, nowIso);
      } catch (e) {
        console.error('Error saving last backup timestamp to localStorage:', e);
      }
      setLastBackupDate(nowIso);
      setDownloadSuccessMsg(`Saved backup as ${filename}`);
      return true;
    } catch (err) {
      console.error('Download backup failed:', err);
      setDownloadBlocked(true);
      return false;
    }
  };

  // Download current data first from inside the Replace confirmation
  const handleDownloadBeforeReplace = async () => {
    const success = await handleDownloadBackup();
    if (success) {
      setHasDownloadedCurrentBeforeReplace(true);
    }
  };

  // Process uploaded JSON file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    resetFileInput();
    if (!file) return;

    setRestoreError(null);
    setRestoreSuccessMsg(null);
    setStagedBackup(null);
    setShowReplaceConfirm(false);

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          resetFileInput();
          setRestoreError('Invalid JSON file. The selected file could not be parsed.');
          return;
        }

        // Validate App Identifier
        const hasValidApp =
          parsed &&
          (parsed.app === 'apodict' ||
            parsed.appIdentifier === 'apodict' ||
            parsed.app === 'semester-command-center' ||
            parsed.appIdentifier === 'semester-command-center' ||
            parsed.appId === 'semester-command-center' ||
            parsed.app === 'semester-center' ||
            (typeof parsed.app === 'string' &&
              (parsed.app.toLowerCase().includes('semester') || parsed.app.toLowerCase().includes('apodict'))));

        // Validate supported format version
        const hasValidVersion =
          parsed &&
          (parsed.version === 1 || parsed.version === '1' || parsed.formatVersion === 1);

        if (!hasValidApp || !hasValidVersion) {
          resetFileInput();
          setRestoreError(
            'Unsupported or unrecognized backup file. File must have the app identifier and supported format version (1).'
          );
          return;
        }

        // Validate expected shapes: a list of courses and a list of plans
        let parsedCourses: Course[] | null = null;
        let parsedPlans: AssignmentPlan[] | null = null;

        if (Array.isArray(parsed.courses)) {
          parsedCourses = parsed.courses;
        } else if (parsed.data && Array.isArray(parsed.data.courses)) {
          parsedCourses = parsed.data.courses;
        } else if (
          parsed.storage &&
          typeof parsed.storage['semester_command_center_courses_v1'] === 'string'
        ) {
          try {
            const arr = JSON.parse(parsed.storage['semester_command_center_courses_v1']);
            if (Array.isArray(arr)) parsedCourses = arr;
          } catch {}
        }

        if (Array.isArray(parsed.plans)) {
          parsedPlans = parsed.plans;
        } else if (parsed.data && Array.isArray(parsed.data.plans)) {
          parsedPlans = parsed.data.plans;
        } else if (
          parsed.storage &&
          typeof parsed.storage['semester_command_center_plans_v1'] === 'string'
        ) {
          try {
            const arr = JSON.parse(parsed.storage['semester_command_center_plans_v1']);
            if (Array.isArray(arr)) parsedPlans = arr;
          } catch {}
        }

        if (!parsedCourses || !parsedPlans) {
          resetFileInput();
          setRestoreError(
            'The backup file does not have the expected data shape. It must contain a list of courses and a list of roadmaps/plans.'
          );
          return;
        }

        // Summary format: "12 courses and 3 roadmaps, exported Oct 4, 2026"
        const courseWord = parsedCourses.length === 1 ? 'course' : 'courses';
        const planWord = parsedPlans.length === 1 ? 'roadmap' : 'roadmaps';
        const exportDateStr = formatExportDate(parsed.exportedAt);
        const summary = `${parsedCourses.length} ${courseWord} and ${parsedPlans.length} ${planWord}, exported ${exportDateStr}`;

        setStagedBackup({
          courses: parsedCourses,
          plans: parsedPlans,
          summary,
        });
      } catch (err: any) {
        resetFileInput();
        setRestoreError(`Failed to process backup file: ${err?.message || 'Unknown error'}`);
      }
    };

    reader.onerror = () => {
      resetFileInput();
      setRestoreError('Failed to read the selected file from disk.');
    };

    reader.readAsText(file);
  };

  // Choice 1: Execute Replace Everything
  const handleConfirmReplace = async () => {
    if (!stagedBackup) return;
    setIsProcessing(true);
    setRestoreError(null);
    try {
      const result = await dataStore.restoreReplace(stagedBackup.courses, stagedBackup.plans);
      onRestoreSuccess(result.courses);

      const courseCount = result.courses.length;
      const planCount = result.plans.length;
      setRestoreSuccessMsg(
        `Successfully replaced all data with ${courseCount} ${
          courseCount === 1 ? 'course' : 'courses'
        } and ${planCount} ${planCount === 1 ? 'roadmap' : 'roadmaps'}.`
      );
      setStagedBackup(null);
      setShowReplaceConfirm(false);
      setHasDownloadedCurrentBeforeReplace(false);
    } catch (err: any) {
      setRestoreError(`Failed to restore data: ${err?.message || 'Unknown error'}`);
    } finally {
      resetFileInput();
      setIsProcessing(false);
    }
  };

  // Choice 2: Execute Add Only What's Missing
  const handleAddOnlyMissing = async () => {
    if (!stagedBackup) return;
    setIsProcessing(true);
    setRestoreError(null);
    try {
      const result = await dataStore.restoreAddMissing(stagedBackup.courses, stagedBackup.plans);
      onRestoreSuccess(result.courses);

      const { addedCourses, skippedCourses, addedPlans, skippedPlans } = result.stats;

      const courseAddedPart = `${addedCourses} ${addedCourses === 1 ? 'course' : 'courses'}`;
      const planAddedPart = `${addedPlans} ${addedPlans === 1 ? 'roadmap' : 'roadmaps'}`;
      const courseSkippedPart = `${skippedCourses} ${skippedCourses === 1 ? 'course' : 'courses'}`;
      const planSkippedPart = `${skippedPlans} ${skippedPlans === 1 ? 'roadmap' : 'roadmaps'}`;

      let msg = `Added ${courseAddedPart} and ${planAddedPart}.`;
      if (skippedCourses > 0 || skippedPlans > 0) {
        msg += ` Skipped ${courseSkippedPart} and ${planSkippedPart} that already exist.`;
      }

      setRestoreSuccessMsg(msg);
      setStagedBackup(null);
      setShowReplaceConfirm(false);
    } catch (err: any) {
      setRestoreError(`Failed to add missing data: ${err?.message || 'Unknown error'}`);
    } finally {
      resetFileInput();
      setIsProcessing(false);
    }
  };

  // Choice 3: Import Legacy Browser Data into Account
  const handleImportFromBrowser = async () => {
    setIsProcessing(true);
    setRestoreError(null);
    setRestoreSuccessMsg(null);
    setBrowserImportMsg(null);
    try {
      const browserData = dataStore.getBrowserSavedData();
      if (browserData.courses.length === 0 && browserData.plans.length === 0) {
        setBrowserImportMsg('No legacy browser data found to import.');
        return;
      }

      const result = await dataStore.importBrowserDataToAccount();
      onRestoreSuccess(result.courses);

      const { addedCourses, skippedCourses, addedPlans, skippedPlans } = result.stats;
      const courseAddedPart = `${addedCourses} ${addedCourses === 1 ? 'course' : 'courses'}`;
      const planAddedPart = `${addedPlans} ${addedPlans === 1 ? 'roadmap' : 'roadmaps'}`;

      let msg = `Successfully imported ${courseAddedPart} and ${planAddedPart} from this browser.`;
      if (skippedCourses > 0 || skippedPlans > 0) {
        msg += ` (${skippedCourses} courses and ${skippedPlans} roadmaps already existed in your account).`;
      }
      setBrowserImportMsg(msg);
    } catch (err: any) {
      setRestoreError(`Failed to import browser data: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-restore-title"
    >
      <div 
        ref={modalRef}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl max-w-xl w-full text-slate-900 dark:text-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-500/30">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 id="backup-restore-title" className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Backup & Restore
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Download your academic records or restore from an export file
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close Backup and Restore window"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Section 1: Backup (Download) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Create Backup</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Saves all courses, graded categories, deadlines, scores, exclusions, and Planner roadmaps to a secure JSON file.
                </p>
              </div>
            </div>

            {/* Last backup info display */}
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-mono bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Last backup: <strong className="text-slate-900 dark:text-slate-200">{formatLastBackupDisplay(lastBackupDate)}</strong>
              </span>
            </div>

            {/* Download button */}
            <button
              type="button"
              ref={downloadBtnRef}
              onClick={handleDownloadBackup}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2"
              aria-label="Download backup JSON file"
            >
              <Download className="w-4 h-4" />
              <span>Download backup</span>
            </button>

            {/* Inline message if browser blocked the download */}
            {downloadBlocked && (
              <div 
                className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2.5 animate-in fade-in duration-200"
                role="alert"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold block">Download blocked by browser</span>
                  Download was blocked by the browser. Please open the app in its own tab and try again.
                </div>
              </div>
            )}

            {/* Inline download success message */}
            {downloadSuccessMsg && (
              <div 
                className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in duration-200"
                role="status"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{downloadSuccessMsg}</span>
              </div>
            )}
          </div>

          {/* Section 2: Restore from file */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Restore Data</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Restore saved courses and roadmaps from a previously exported JSON backup file.
              </p>
            </div>

            {/* 
              FIX: Replaced direct button + hidden input ref activation with a native HTML <label> setup.
              This treats element activation natively, bypassing iOS WebKit and Chrome strict pointer blocks.
            */}
            <label 
              className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200 text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              aria-label="Restore from file"
            >
              <Upload className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Restore from file</span>
              <input
                type="file"
                ref={fileInputRef}
                accept=".json,application/json"
                className="sr-only" // screen-reader only styling is physically layout-present, bypassing security blocking
                onChange={handleFileChange}
                onClick={(e) => {
                  (e.currentTarget as HTMLInputElement).value = '';
                  resetFileInput();
                }}
                // onCancel fires when the user dismisses the file picker without selecting.
                // React typings don't include it yet; spread-cast silences the false-positive TS error.
                {...({ onCancel: () => { resetFileInput(); } } as React.InputHTMLAttributes<HTMLInputElement>)}
              />
            </label>

            {/* Inline Error Message */}
            {restoreError && (
              <div 
                className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in duration-200"
                role="alert"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold block">Could not restore backup</span>
                  {restoreError}
                </div>
              </div>
            )}

            {/* Inline Success Message */}
            {restoreSuccessMsg && (
              <div 
                className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 text-xs flex items-start gap-2.5 animate-in fade-in duration-200"
                role="status"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold block">Restore completed</span>
                  {restoreSuccessMsg}
                </div>
              </div>
            )}

            {/* Staged file summary and choices */}
            {stagedBackup && (
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/60 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                    <FileJson className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      Valid backup detected
                    </div>
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
                      {stagedBackup.summary}
                    </div>
                  </div>
                </div>

                {/* Two choices if replace confirmation is not showing */}
                {!showReplaceConfirm ? (
                  <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Select restore method
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setShowReplaceConfirm(true)}
                        disabled={isProcessing}
                        className="py-2.5 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                        aria-label="Replace everything with backup data"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Replace everything</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleAddOnlyMissing}
                        disabled={isProcessing}
                        className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5"
                        aria-label="Add only what's missing from backup"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>Add only what&apos;s missing</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Inline confirmation for "Replace everything" */
                  <div 
                    className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-3 animate-in fade-in duration-150"
                    role="alertdialog"
                    aria-labelledby="replace-confirm-title"
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <div id="replace-confirm-title" className="text-xs font-bold text-amber-900 dark:text-amber-200">
                          This replaces all current data. Download current data first?
                        </div>
                        <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 mt-0.5">
                          Existing courses, grades, and study plans will be overwritten with the contents of this backup.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleDownloadBeforeReplace}
                        className="py-2 px-3 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700/60 hover:bg-amber-50 dark:hover:bg-amber-950 text-amber-900 dark:text-amber-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                        aria-label="Download current data first"
                      >
                        {hasDownloadedCurrentBeforeReplace ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Current data downloaded</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>Download current data first</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center gap-2 sm:ml-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setShowReplaceConfirm(false);
                            setHasDownloadedCurrentBeforeReplace(false);
                            resetFileInput();
                          }}
                          disabled={isProcessing}
                          className="flex-1 sm:flex-none py-2 px-3 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          aria-label="Cancel replace"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmReplace}
                          disabled={isProcessing}
                          className="flex-1 sm:flex-none py-2 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors shadow-xs"
                          aria-label="Confirm replace all current data"
                        >
                          Replace
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Import Legacy Browser Data */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3.5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Import data from this browser</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Copy any courses or roadmaps saved in this browser before signing in directly into your account. Existing account items are kept, and the browser copy is not deleted.
              </p>
            </div>

            <button
              type="button"
              onClick={handleImportFromBrowser}
              disabled={isProcessing}
              className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              aria-label="Import data from this browser"
            >
              <HardDrive className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Import data from this browser</span>
            </button>

            {browserImportMsg && (
              <div 
                className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-indigo-900 dark:text-indigo-200 text-xs flex items-center gap-2 animate-in fade-in duration-200"
                role="status"
              >
                <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>{browserImportMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 flex items-center justify-end">
          <button
            type="button"
            onClick={() => {
              resetFileInput();
              onClose();
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
