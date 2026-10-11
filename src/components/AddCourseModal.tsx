import React, { useState, useRef } from 'react';
import { 
  X, 
  
  FileText, 
  AlertCircle, 
  Loader2, 
  ArrowRight, 
  PlusCircle, 
  Upload, 
  File, 
  Trash2,
  CheckCircle2
} from 'lucide-react';
import { geminiClient } from '../services/geminiClient';
import { ExtractedSyllabusData } from '../types/academic';

interface AddCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExtracted: (data: ExtractedSyllabusData, rawSyllabus?: string) => void;
  onManualCreate: (courseName: string) => void;
}

interface UploadedPdfItem {
  id: string;
  name: string;
  size: number;
  base64: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB total

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AddCourseModal: React.FC<AddCourseModalProps> = ({
  isOpen,
  onClose,
  onExtracted,
  onManualCreate,
}) => {
  const [courseName, setCourseName] = useState('');
  const [syllabusText, setSyllabusText] = useState('');
  const [uploadedPdfs, setUploadedPdfs] = useState<UploadedPdfItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const validateAndProcessFiles = async (files: FileList | File[]) => {
    setErrorMessage(null);
    const newItems: UploadedPdfItem[] = [];

    // Calculate current total size
    let currentTotal = uploadedPdfs.reduce((acc, p) => acc + p.size, 0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate PDF format
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
      if (!isPdf) {
        setErrorMessage(`"${file.name}" is not a PDF file. Please upload PDF documents only.`);
        return;
      }

      // Validate single file size
      if (file.size > MAX_FILE_SIZE) {
        setErrorMessage(
          `"${file.name}" exceeds the 10MB limit (${formatFileSize(file.size)}). Please upload a smaller PDF.`
        );
        return;
      }

      // Validate total size
      if (currentTotal + file.size > MAX_TOTAL_SIZE) {
        setErrorMessage('Total upload size exceeds the 25MB limit. Please remove some files or upload a smaller PDF.');
        return;
      }

      currentTotal += file.size;

      // Read file as base64
      try {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Strip data URL prefix if present
            const commaIndex = result.indexOf(',');
            const base64 = commaIndex !== -1 ? result.substring(commaIndex + 1) : result;
            resolve(base64);
          };
          reader.onerror = () => reject(new Error(`Failed to read "${file.name}"`));
          reader.readAsDataURL(file);
        });

        // Quick client-side check for password-protected / encrypted PDF
        const sample = atob(base64Data.substring(0, Math.min(base64Data.length, 6000)));
        if (!sample.includes('%PDF-')) {
          setErrorMessage(`"${file.name}" does not appear to be a valid readable PDF.`);
          return;
        }
        if (sample.includes('/Encrypt')) {
          setErrorMessage(
            `"${file.name}" is password-protected or encrypted. Please upload an unlocked PDF or paste the text.`
          );
          return;
        }

        newItems.push({
          id: `pdf-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          size: file.size,
          base64: base64Data,
        });
      } catch (err: any) {
        setErrorMessage(`Could not read file "${file.name}". ${err.message || ''}`);
        return;
      }
    }

    if (newItems.length > 0) {
      setUploadedPdfs((prev) => [...prev, ...newItems]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await validateAndProcessFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await validateAndProcessFiles(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePdf = (id: string) => {
    setUploadedPdfs((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const hasText = syllabusText.trim().length > 0;
    const hasPdfs = uploadedPdfs.length > 0;

    if (!hasText && !hasPdfs) {
      setErrorMessage('Please upload at least one PDF syllabus or paste syllabus text.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const pdfCountText = hasPdfs ? `${uploadedPdfs.length} PDF${uploadedPdfs.length > 1 ? 's' : ''}` : '';
    const sourceText = hasPdfs && hasText ? `${pdfCountText} & pasted text` : hasPdfs ? pdfCountText : 'pasted syllabus';

    setLoadingStep(`Processing ${sourceText}...`);

    try {
      const timer1 = setTimeout(() => {
        setLoadingStep('Cross-referencing files & checking for conflicting dates/weights...');
      }, 1100);
      const timer2 = setTimeout(() => {
        setLoadingStep('Extracting grade categories and deduplicating assignment deadlines...');
      }, 2300);

      const pdfPayload = uploadedPdfs.map((p) => ({
        name: p.name,
        base64: p.base64,
        size: p.size,
      }));

      const extracted = await geminiClient.parseSyllabus(courseName, syllabusText, pdfPayload);

      clearTimeout(timer1);
      clearTimeout(timer2);

      // Pass extracted data to parent to open the editable review screen
      onExtracted(extracted, syllabusText);
    } catch (err: any) {
      console.error('Extraction error:', err);
      setErrorMessage(
        err.message ||
          'Could not analyze the syllabus materials. You can check your files or continue with manual entry.'
      );
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleSkipToManual = () => {
    const finalName = courseName.trim() || 'New Course';
    onManualCreate(finalName);
  };

  const canSubmit = uploadedPdfs.length > 0 || syllabusText.trim().length > 0;
  const totalUploadedSize = uploadedPdfs.reduce((acc, p) => acc + p.size, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-course-title"
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div>
              <h2 id="add-course-title" className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Add Course from Syllabus
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload PDFs, paste text, or both. Everything is combined into a single course.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* PDF Upload Area (exact spot where sample syllabi buttons previously were) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Upload PDF Syllabi & Schedules
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {uploadedPdfs.length > 0
                  ? `${uploadedPdfs.length} file${uploadedPdfs.length > 1 ? 's' : ''} (${formatFileSize(totalUploadedSize)})`
                  : 'PDFs only • Up to 10MB/file'}
              </span>
            </div>

            {/* Drag & Drop Box */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-5 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-2 ${
                isDragging
                  ? 'border-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/30 scale-[1.01]'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-950/50 hover:bg-slate-50/80 dark:hover:bg-slate-950/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                onChange={handleFileChange}
                className="hidden"
                disabled={isLoading}
              />
              <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <span className="text-indigo-600 dark:text-indigo-400 hover:underline">Click to browse</span> or drag & drop PDF files here
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Select multiple files if needed (e.g. grading breakdown PDF + schedule PDF)
                </p>
              </div>
            </div>

            {/* Uploaded File List */}
            {uploadedPdfs.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                  Selected Course Documents ({uploadedPdfs.length}):
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {uploadedPdfs.map((pdf) => (
                    <div
                      key={pdf.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <File className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span className="text-slate-900 dark:text-white font-medium truncate max-w-[320px] sm:max-w-md">
                          {pdf.name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                          ({formatFileSize(pdf.size)})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePdf(pdf.id);
                        }}
                        disabled={isLoading}
                        className="p-1 rounded text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Course Name Input */}
          <div>
            <label htmlFor="course-name-input" className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              Course Name <span className="text-slate-500 dark:text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="course-name-input"
              type="text"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="e.g. CS 106B: Programming Abstractions"
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-500 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all disabled:opacity-50"
            />
          </div>

          {/* Syllabus Text Area (Kept in its existing spot) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="syllabus-text-area" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Paste Syllabus Text <span className="text-slate-500 dark:text-slate-400 font-normal">(optional if PDF uploaded)</span>
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {syllabusText.length.toLocaleString()} characters
              </span>
            </div>
            <textarea
              id="syllabus-text-area"
              value={syllabusText}
              onChange={(e) => setSyllabusText(e.target.value)}
              rows={6}
              placeholder="Paste syllabus text here (course policy, grading scheme, exam schedule, weekly assignments)..."
              disabled={isLoading}
              className="w-full px-3.5 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-500 text-sm leading-relaxed font-sans focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all disabled:opacity-50 resize-y"
            />
          </div>

          {/* Loading status indicator */}
          {isLoading && (
            <div className="p-4 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Extracting Course Intelligence</div>
                <div className="text-xs text-indigo-700/80 dark:text-indigo-300/80">{loadingStep}</div>
              </div>
            </div>
          )}

          {/* Error message */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-50/40 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs leading-relaxed">
                <div className="font-semibold mb-0.5">Could not process syllabus</div>
                <div>{errorMessage}</div>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={handleSkipToManual}
                    className="text-xs font-semibold text-rose-700 dark:text-rose-300 underline hover:text-slate-900 dark:hover:text-white"
                  >
                    Or enter course details manually &rarr;
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleSkipToManual}
              disabled={isLoading}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Enter Manually</span>
            </button>

            <div className="w-full sm:w-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || !canSubmit}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>Extract & Review</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};