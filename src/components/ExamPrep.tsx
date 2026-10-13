import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileQuestion, 
  ArrowLeft, 
  Sparkles, 
  BookOpen, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  RotateCcw, 
  Copy, 
  Check, 
  ChevronRight, 
  ChevronLeft,
  List, 
  Maximize2, 
  GraduationCap,
  Loader2,
  FileText,
  BookmarkCheck,
  AlertTriangle,
  UploadCloud,
  X,
  File
} from 'lucide-react';
import { Course, ExamPrepData, ExamPrepMode, PracticeQuestion } from '../types/academic';
import { dataStore } from '../services/dataStore';
import { geminiClient } from '../services/geminiClient';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

interface SelectedPdfItem {
  id: string;
  name: string;
  file: File;
  pageCount: number;
  pageRangeInput: string;
  extractedText: string;
  charCount: number;
  isExtracting: boolean;
  currentPage: number;
  totalPagesToRead: number;
  warning: string | null;
}

interface ExamPrepProps {
  courses: Course[];
  onOpenCourses?: () => void;
  onOpenAddCourse?: () => void;
}

interface FlattenedExam {
  courseId: string;
  courseName: string;
  courseCode?: string | null;
  courseColor?: string;
  deadlineId: string;
  title: string;
  date: string | null;
  weight: number | null;
  completed?: boolean;
  prepId: string; // `${courseId}_${deadlineId}`
}

function parsePageRange(rangeStr: string, totalPages: number): { start: number; end: number } {
  const trimmed = (rangeStr || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') {
    return { start: 1, end: totalPages };
  }
  const match = trimmed.match(/^(\d+)(?:\s*[-–—]\s*(\d+))?$/);
  if (!match) {
    return { start: 1, end: totalPages };
  }
  let start = parseInt(match[1], 10);
  if (isNaN(start) || start < 1) start = 1;
  if (start > totalPages) start = totalPages;

  let end = match[2] ? parseInt(match[2], 10) : start;
  if (isNaN(end) || end < start) end = start;
  if (end > totalPages) end = totalPages;

  return { start, end };
}

// Join pdf.js text items by position instead of always inserting spaces
function joinTextItems(items: any[]): string {
  let out = '';
  let prev: any = null;
  for (const item of items) {
    if (!item || !('str' in item)) continue;
    const str: string = item.str;
    if (str === '') {
      if (item.hasEOL && out && !out.endsWith('\n')) out += '\n';
      continue;
    }
    if (prev) {
      const fontSize = Math.abs(prev.transform?.[3]) || Math.abs(prev.height) || 10;
      const sameLine = Math.abs(item.transform[5] - prev.transform[5]) < fontSize * 0.5;
      if (prev.hasEOL || !sameLine) {
        if (!out.endsWith('\n')) out += '\n';
      } else {
        const gap = item.transform[4] - (prev.transform[4] + (prev.width || 0));
        if (gap > fontSize * 0.2 && !out.endsWith(' ') && !str.startsWith(' ')) out += ' ';
      }
    }
    out += str;
    prev = item;
  }
  return out;
}

function cleanPageText(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

function looksGarbled(text: string): boolean {
  const tokens = text.split(/\s+/).filter((t) => /[A-Za-z]/.test(t));
  if (tokens.length < 50) return false;
  const stray = tokens.filter((t) => t.length === 1 && !/^[aAI]$/.test(t)).length;
  const short = tokens.filter((t) => t.length <= 2).length;
  return stray / tokens.length > 0.12 || short / tokens.length > 0.45;
}

// Returns a copy of an object without the given keys
function omitKeys<T>(obj: Record<string, T>, keys: string[]): Record<string, T> {
  const next = { ...obj };
  keys.forEach((k) => delete next[k]);
  return next;
}

// A multiple-choice option is correct when its leading letter matches the answer key's leading letter
function isCorrectOption(opt: string, q: PracticeQuestion): boolean {
  const optLetter = (opt || '').trim().charAt(0).toUpperCase();
  const keyLetter = (q.correctAnswer || '').trim().charAt(0).toUpperCase();
  return optLetter !== '' && optLetter === keyLetter;
}

export const ExamPrep: React.FC<ExamPrepProps> = ({ 
  courses, 
  onOpenCourses,
  onOpenAddCourse 
}) => {
  // Step navigation: null = Step 1 (List of Exams), FlattenedExam = Step 2 (Prep Screen)
  const [selectedExam, setSelectedExam] = useState<FlattenedExam | null>(null);

  // Saved prep cache mapped by prepId
  const [savedPreps, setSavedPreps] = useState<Record<string, ExamPrepData>>({});
  const [isLoadingSavedPreps, setIsLoadingSavedPreps] = useState(true);

  // Prep generation form state
  const [notes, setNotes] = useState('');
  const [selectedPdfs, setSelectedPdfs] = useState<SelectedPdfItem[]>([]);
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<ExamPrepMode>('questions');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [questionMix, setQuestionMix] = useState<'mixed' | 'multiple_choice' | 'short_answer'>('mixed');

  // Generation status state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [retryAfterSec, setRetryAfterSec] = useState<number | null>(null);

  // Current active result (from saved prep or newly generated)
  const [activePrep, setActivePrep] = useState<ExamPrepData | null>(null);

  // UI view toggles for Practice Questions
  const [questionViewMode, setQuestionViewMode] = useState<'list' | 'one_by_one'>('list');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});
  const [selectedUserOptions, setSelectedUserOptions] = useState<Record<string, string>>({});
  const [shortAnswers, setShortAnswers] = useState<Record<string, string>>({});
  const [checkedShort, setCheckedShort] = useState<Record<string, boolean>>({});

  // Score tracking and retry-missed state
  const [selfGrades, setSelfGrades] = useState<Record<string, 'right' | 'wrong'>>({});
  const [retryIds, setRetryIds] = useState<string[] | null>(null);

  // Flashcards (built from study guide key terms)
  const [guideView, setGuideView] = useState<'guide' | 'flashcards'>('guide');
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [cardStatus, setCardStatus] = useState<Record<string, 'known' | 'learning'>>({});
  const [onlyLearning, setOnlyLearning] = useState(false);
  const [cardOrder, setCardOrder] = useState<number[] | null>(null);

  // Study Guide Copy Feedback
  const [copiedGuide, setCopiedGuide] = useState(false);
  const [showPastExams, setShowPastExams] = useState(true);

  const MAX_PDF_COUNT = 10;
  const MAX_COMBINED_LIMIT = 150000;

  // Clears quiz scoring, retry mode and flashcard progress
  const resetStudyState = () => {
    setRevealedAnswers({});
    setSelectedUserOptions({});
    setShortAnswers({});
    setCheckedShort({});
    setSelfGrades({});
    setRetryIds(null);
    setCurrentQuestionIndex(0);
    setGuideView('guide');
    setCardIndex(0);
    setCardFlipped(false);
    setCardStatus({});
    setOnlyLearning(false);
    setCardOrder(null);
  };

  // Extract text from a selected PDF page-by-page in the browser
  const extractTextForPdf = async (
    pdfId: string,
    file: File,
    pageCount: number,
    rangeInput: string
  ) => {
    const range = parsePageRange(rangeInput, pageCount);
    const totalPagesToRead = Math.max(1, range.end - range.start + 1);

    setSelectedPdfs((prev) =>
      prev.map((item) =>
        item.id === pdfId
          ? {
              ...item,
              isExtracting: true,
              currentPage: 1,
              totalPagesToRead,
              warning: null,
            }
          : item
      )
    );

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        useSystemFonts: true,
      });
      const pdfDoc = await loadingTask.promise;
      const pagesText: string[] = [];

      for (let p = range.start; p <= range.end; p++) {
        const step = p - range.start + 1;
        setSelectedPdfs((prev) =>
          prev.map((item) =>
            item.id === pdfId
              ? { ...item, currentPage: step, totalPagesToRead }
              : item
          )
        );

        try {
          const page = await pdfDoc.getPage(p);
          const textContent = await page.getTextContent();
          const pageString = cleanPageText(joinTextItems(textContent.items as any[]));
          if (pageString) {
            pagesText.push(pageString);
          }
        } catch (pageErr) {
          console.warn(`Error reading page ${p} of ${file.name}:`, pageErr);
        }

        // Keep UI responsive while extracting page-by-page
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const combinedText = pagesText.join('\n\n').trim();
      const charCount = combinedText.length;
      const isAlmostEmpty = charCount < 50;
      const warning = isAlmostEmpty
        ? 'No readable text found. This may be a scanned PDF.'
        : looksGarbled(combinedText)
        ? "This PDF's text came out garbled. Results may be poor. Try pasting the notes instead."
        : null;

      setSelectedPdfs((prev) =>
        prev.map((item) =>
          item.id === pdfId
            ? {
                ...item,
                extractedText: combinedText,
                charCount,
                isExtracting: false,
                warning,
              }
            : item
        )
      );
    } catch (err: any) {
      console.error(`Failed to extract text from ${file.name}:`, err);
      setSelectedPdfs((prev) =>
        prev.map((item) =>
          item.id === pdfId
            ? {
                ...item,
                isExtracting: false,
                warning: err.message || 'Could not read PDF. It may be corrupt or encrypted.',
              }
            : item
        )
      );
    }
  };

  const handlePdfFiles = async (files: FileList | File[]) => {
    setGenerationError(null);
    const validFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
      if (!isPdf) {
        setGenerationError(`"${file.name}" is not a PDF file. Please upload PDF files only.`);
        continue;
      }

      if (selectedPdfs.length + validFiles.length >= MAX_PDF_COUNT) {
        setGenerationError(`You can attach a maximum of ${MAX_PDF_COUNT} PDFs. Please remove a file to add another.`);
        break;
      }

      validFiles.push(file);
    }

    for (const file of validFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
          useSystemFonts: true,
        });
        const pdfDoc = await loadingTask.promise;
        const totalPages = pdfDoc.numPages;

        const newId = `pdf-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const newItem: SelectedPdfItem = {
          id: newId,
          name: file.name,
          file,
          pageCount: totalPages,
          pageRangeInput: '',
          extractedText: '',
          charCount: 0,
          isExtracting: true,
          currentPage: 1,
          totalPagesToRead: totalPages,
          warning: null,
        };

        setSelectedPdfs((prev) => [...prev, newItem]);
        extractTextForPdf(newId, file, totalPages, '');
      } catch (err: any) {
        setGenerationError(`Could not read "${file.name}": ${err.message || 'Invalid or encrypted PDF.'}`);
      }
    }
  };

  const handleRemovePdf = (id: string) => {
    setSelectedPdfs((prev) => prev.filter((p) => p.id !== id));
  };

  const handlePageRangeChange = (id: string, value: string) => {
    setSelectedPdfs((prev) =>
      prev.map((item) => (item.id === id ? { ...item, pageRangeInput: value } : item))
    );
  };

  const handleApplyPageRange = (id: string) => {
    const item = selectedPdfs.find((p) => p.id === id);
    if (!item || item.isExtracting) return;
    extractTextForPdf(item.id, item.file, item.pageCount, item.pageRangeInput);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPdf(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPdf(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPdf(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handlePdfFiles(e.dataTransfer.files);
    }
  };

  // Load all saved exam preps on mount
  useEffect(() => {
    let isMounted = true;
    async function loadPreps() {
      setIsLoadingSavedPreps(true);
      try {
        const preps = await dataStore.getAllExamPreps();
        if (isMounted) {
          setSavedPreps(preps);
        }
      } catch (err) {
        console.error('Failed to load saved exam preps:', err);
      } finally {
        if (isMounted) {
          setIsLoadingSavedPreps(false);
        }
      }
    }
    loadPreps();
    return () => {
      isMounted = false;
    };
  }, []);

  // Flatten and organize exams across all courses
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const { upcomingExams, pastExams, allExams } = useMemo(() => {
    const exams: FlattenedExam[] = [];

    for (const course of courses) {
      if (!Array.isArray(course.deadlines)) continue;
      for (const deadline of course.deadlines) {
        if (deadline.type === 'exam') {
          exams.push({
            courseId: course.id,
            courseName: course.name,
            courseCode: course.code,
            courseColor: course.color || '#4f46e5',
            deadlineId: deadline.id,
            title: deadline.title,
            date: deadline.date,
            weight: deadline.weight,
            completed: deadline.completed,
            prepId: `${course.id}_${deadline.id}`.replace(/[^a-zA-Z0-9_\-.]/g, '_'),
          });
        }
      }
    }

    const upcoming: FlattenedExam[] = [];
    const past: FlattenedExam[] = [];

    for (const exam of exams) {
      if (!exam.date) {
        upcoming.push(exam);
      } else if (exam.date >= todayStr) {
        upcoming.push(exam);
      } else {
        past.push(exam);
      }
    }

    // Sort upcoming soonest first (ascending by date)
    upcoming.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1; // undated goes to end of upcoming
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    // Sort past most recent first
    past.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    return {
      upcomingExams: upcoming,
      pastExams: past,
      allExams: [...upcoming, ...past],
    };
  }, [courses, todayStr]);

  // When an exam is clicked in Step 1
  const handleSelectExam = (exam: FlattenedExam) => {
    setSelectedExam(exam);
    setGenerationError(null);
    resetStudyState();
    setSelectedPdfs([]);

    const existing = savedPreps[exam.prepId];
    if (existing) {
      setActivePrep(existing);
      setNotes(existing.notes || '');
      setMode(existing.mode || 'questions');
    } else {
      setActivePrep(null);
      setNotes('');
      setMode('questions');
    }
  };

  const handleBackToExams = () => {
    setSelectedExam(null);
    setActivePrep(null);
    setGenerationError(null);
    resetStudyState();
    setSelectedPdfs([]);
  };

  // Compute aggregated extracted text from attached PDFs with 150,000 character cap
  const {
    combinedExtractedText,
    rawExtractedCharCount,
    isExtractedTruncated,
  } = useMemo(() => {
    const parts: string[] = [];
    for (const pdf of selectedPdfs) {
      if (pdf.extractedText && pdf.extractedText.trim()) {
        parts.push(pdf.extractedText.trim());
      }
    }
    const combined = parts.join('\n\n');
    const rawCount = combined.length;

    if (rawCount > MAX_COMBINED_LIMIT) {
      return {
        combinedExtractedText: combined.slice(0, Math.max(0, MAX_COMBINED_LIMIT - notes.length)),
        rawExtractedCharCount: rawCount,
        isExtractedTruncated: true,
      };
    }

    return {
      combinedExtractedText: combined,
      rawExtractedCharCount: rawCount,
      isExtractedTruncated: false,
    };
  }, [selectedPdfs, notes.length]);

  const totalCombinedChars = notes.length + combinedExtractedText.length;
  const isOverLimit = totalCombinedChars > MAX_COMBINED_LIMIT;
  const isAnyExtracting = selectedPdfs.some((p) => p.isExtracting);

  // Generate or Regenerate Exam Prep
  const handleGenerate = async () => {
    if (!selectedExam) return;

    if (isAnyExtracting) {
      setGenerationError('Please wait for PDF text extraction to complete before generating.');
      return;
    }

    const hasNotes = notes.trim().length > 0;
    const hasExtractedText = combinedExtractedText.trim().length > 0;

    if (!hasNotes && !hasExtractedText) {
      if (selectedPdfs.length > 0) {
        setGenerationError('No readable text found in the attached PDF(s). Please paste notes or select an unlocked text PDF.');
      } else {
        setGenerationError('Please paste your study notes or select a PDF document before generating.');
      }
      return;
    }

    if (totalCombinedChars > MAX_COMBINED_LIMIT) {
      setGenerationError(`Combined text (${totalCombinedChars.toLocaleString()} characters) exceeds the 150,000 character maximum. Please trim notes or adjust page ranges.`);
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setRetryAfterSec(null);

    try {
      const response = await geminiClient.generateExamPrep({
        courseName: selectedExam.courseName,
        examTitle: selectedExam.title,
        examDate: selectedExam.date,
        mode,
        notes: notes.trim(),
        extractedText: combinedExtractedText,
        pdfFiles: selectedPdfs.map((p) => ({
          name: p.name,
          pageCount: p.pageCount,
          pageRange: p.pageRangeInput ? p.pageRangeInput : `1-${p.pageCount}`,
        })),
        questionCount,
        questionMix,
      });

      const prepRecord: ExamPrepData = {
        id: selectedExam.prepId,
        courseId: selectedExam.courseId,
        courseName: selectedExam.courseName,
        examId: selectedExam.deadlineId,
        examTitle: selectedExam.title,
        examDate: selectedExam.date,
        mode,
        notes: notes.trim(),
        pdfNames: selectedPdfs.length > 0 ? selectedPdfs.map((p) => p.name) : activePrep?.pdfNames || [],
        notesTooThin: response.notesTooThin,
        notesFeedback: response.notesFeedback,
        questions: response.questions,
        studyGuide: response.studyGuide,
        generatedAt: response.generatedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Persist to user's Firestore data linked to that exam (and local cache)
      try {
        await dataStore.saveExamPrep(prepRecord);
      } catch (saveErr) {
        console.warn('Firestore sync note for exam prep (saved to local cache):', saveErr);
      }

      // Update state
      setActivePrep(prepRecord);
      setSavedPreps((prev) => ({
        ...prev,
        [prepRecord.id]: prepRecord,
      }));

      // Fresh result: reset answers, scores, retry mode and flashcard progress
      resetStudyState();
    } catch (err: any) {
      console.error('Error generating exam prep:', err);
      setGenerationError(err.message || 'Failed to generate exam prep. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleRevealAnswer = (questionId: string) => {
    setRevealedAnswers((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  const toggleRevealAllAnswers = (shouldReveal: boolean, ids: string[]) => {
    setRevealedAnswers((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = shouldReveal;
      });
      return next;
    });
  };

  const handleCopyStudyGuide = async () => {
    if (!activePrep?.studyGuide) return;
    const g = activePrep.studyGuide;
    let text = `# Study Guide: ${activePrep.examTitle}\n`;
    text += `Course: ${activePrep.courseName}\n`;
    if (activePrep.examDate) text += `Date: ${activePrep.examDate}\n\n`;

    if (g.overview) {
      text += `## Overview\n${g.overview}\n\n`;
    }

    if (g.likelyTopics && g.likelyTopics.length > 0) {
      text += `## Likely Exam Topics\n`;
      g.likelyTopics.forEach((t) => {
        text += `- ${t}\n`;
      });
      text += `\n`;
    }

    if (g.keyTerms && g.keyTerms.length > 0) {
      text += `## Key Terms & Definitions\n`;
      g.keyTerms.forEach((kt) => {
        text += `- **${kt.term}**: ${kt.definition}\n`;
      });
      text += `\n`;
    }

    if (g.sections && g.sections.length > 0) {
      g.sections.forEach((s) => {
        text += `## ${s.heading}\n`;
        text += `${s.summary}\n\n`;
        if (s.bulletPoints && s.bulletPoints.length > 0) {
          s.bulletPoints.forEach((b) => {
            text += `- ${b}\n`;
          });
          text += `\n`;
        }
      });
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedGuide(true);
      setTimeout(() => setCopiedGuide(false), 2500);
    } catch {
      // Fallback
    }
  };

  const formatDateDisplay = (dateStr: string | null) => {
    if (!dateStr) return 'No date set';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        return d.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const calculateDaysUntil = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const now = new Date(todayStr).getTime();
      const target = new Date(dateStr).getTime();
      const diffDays = Math.round((target - now) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Tomorrow';
      if (diffDays > 1) return `In ${diffDays} days`;
      if (diffDays === -1) return 'Yesterday';
      return `${Math.abs(diffDays)} days ago`;
    } catch {
      return null;
    }
  };

  // ==========================================================================
  // Scoring helpers (practice questions)
  // ==========================================================================
  const questionList: PracticeQuestion[] = activePrep?.questions ?? [];

  const getQuestionResult = (q: PracticeQuestion): 'correct' | 'wrong' | null => {
    if (q.type === 'multiple_choice') {
      const choice = selectedUserOptions[q.id];
      if (!choice) return null;
      return isCorrectOption(choice, q) ? 'correct' : 'wrong';
    }
    const g = selfGrades[q.id];
    return g === 'right' ? 'correct' : g === 'wrong' ? 'wrong' : null;
  };

  const answeredCount = questionList.filter((q) => getQuestionResult(q) !== null).length;
  const correctCount = questionList.filter((q) => getQuestionResult(q) === 'correct').length;
  const missedIds = questionList.filter((q) => getQuestionResult(q) === 'wrong').map((q) => q.id);
  const scorePct = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
  const displayQuestions = retryIds ? questionList.filter((q) => retryIds.includes(q.id)) : questionList;

  const handleRetryMissed = () => {
    if (missedIds.length === 0) return;
    setSelectedUserOptions((prev) => omitKeys(prev, missedIds));
    setRevealedAnswers((prev) => omitKeys(prev, missedIds));
    setShortAnswers((prev) => omitKeys(prev, missedIds));
    setCheckedShort((prev) => omitKeys(prev, missedIds));
    setSelfGrades((prev) => omitKeys(prev, missedIds));
    setRetryIds(missedIds);
    setCurrentQuestionIndex(0);
  };

  const handleRestartQuiz = () => {
    setSelectedUserOptions({});
    setRevealedAnswers({});
    setShortAnswers({});
    setCheckedShort({});
    setSelfGrades({});
    setRetryIds(null);
    setCurrentQuestionIndex(0);
  };

  const renderShortAnswerBox = (q: PracticeQuestion) => {
    const typed = shortAnswers[q.id] || '';
    const checked = !!checkedShort[q.id];
    const grade = selfGrades[q.id];
    return (
      <div className="space-y-2 pt-1">
        <textarea
          value={typed}
          onChange={(e) => setShortAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
          placeholder="Type your answer here..."
          rows={3}
          className="w-full p-3 rounded-lg text-xs leading-relaxed bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-y"
        />
        <button
          type="button"
          disabled={!typed.trim()}
          onClick={() => {
            setCheckedShort((prev) => ({ ...prev, [q.id]: true }));
            setRevealedAnswers((prev) => ({ ...prev, [q.id]: true }));
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Check answer</span>
        </button>
        {checked && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/80">
                <div className="font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Your answer</div>
                <div className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{typed}</div>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/40">
                <div className="font-semibold text-emerald-700 dark:text-emerald-400 mb-1">Model answer</div>
                <div className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{q.correctAnswer}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">How did you do?</span>
              <button
                type="button"
                onClick={() => setSelfGrades((prev) => ({ ...prev, [q.id]: 'right' }))}
                className={`px-2.5 py-1 rounded-md border font-medium cursor-pointer transition-colors ${
                  grade === 'right'
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                }`}
              >
                Got it right
              </button>
              <button
                type="button"
                onClick={() => setSelfGrades((prev) => ({ ...prev, [q.id]: 'wrong' }))}
                className={`px-2.5 py-1 rounded-md border font-medium cursor-pointer transition-colors ${
                  grade === 'wrong'
                    ? 'bg-rose-600 border-rose-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                }`}
              >
                Missed it
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // ==========================================================================
  // STEP 2: PREP SCREEN FOR SELECTED EXAM
  // ==========================================================================
  if (selectedExam) {
    const isSaved = !!savedPreps[selectedExam.prepId];
    const daysLabel = calculateDaysUntil(selectedExam.date);

    return (
      <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleBackToExams}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            <span>Back to exams</span>
          </button>

          {isSaved && activePrep && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>Saved in Cloud</span>
            </span>
          )}
        </div>

        {/* Exam Context Banner */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: selectedExam.courseColor }}
                />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {selectedExam.courseCode || selectedExam.courseName}
                </span>
                {selectedExam.weight !== null && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                    {selectedExam.weight}% of grade
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {selectedExam.title}
              </h1>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{formatDateDisplay(selectedExam.date)}</span>
                {daysLabel && (
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">
                    ({daysLabel})
                  </span>
                )}
              </div>
            </div>

            {/* Quick status badge if saved */}
            {isSaved && activePrep && (
              <div className="text-left sm:text-right text-xs text-slate-500 dark:text-slate-400">
                <span className="block font-medium text-slate-700 dark:text-slate-300">
                  {activePrep.mode === 'questions' ? 'Practice Questions' : 'Study Guide'}
                </span>
                <span className="text-[11px]">
                  Generated {new Date(activePrep.updatedAt || activePrep.generatedAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Input & Generation Panel */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
          {/* Upload PDF Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <File className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Select PDF Materials (Optional)</span>
              </label>
              <span className="text-[11px] text-slate-400">
                Up to 10 PDFs • In-browser text extraction
              </span>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handlePdfFiles(e.target.files);
                  e.target.value = '';
                }
              }}
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
            />

            {/* Drag & Drop Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-4 rounded-xl border-2 border-dashed text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                isDraggingPdf
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                  : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 bg-slate-50/60 dark:bg-slate-950/40'
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Click to select or drag &amp; drop PDF files
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Text is extracted page-by-page directly in your browser without uploading the file
                </p>
              </div>
            </div>

            {/* Selected PDF Cards & Progress */}
            {selectedPdfs.length > 0 && (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
                  <span>
                    {selectedPdfs.length} of {MAX_PDF_COUNT} PDFs attached
                  </span>
                  <span>
                    Extracted text: {rawExtractedCharCount.toLocaleString()} chars
                  </span>
                </div>

                <div className="space-y-2">
                  {selectedPdfs.map((pdf) => (
                    <div
                      key={pdf.id}
                      className="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/80 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <File className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-[340px]" title={pdf.name}>
                            {pdf.name}
                          </span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-medium shrink-0">
                            {pdf.pageCount} page{pdf.pageCount === 1 ? '' : 's'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemovePdf(pdf.id)}
                          className="p-1 rounded hover:bg-indigo-200/60 dark:hover:bg-indigo-900/60 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer shrink-0"
                          title="Remove PDF"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Optional Page-Range Input */}
                      <div className="flex flex-wrap items-center gap-2 text-xs pt-0.5">
                        <span className="text-slate-600 dark:text-slate-400 text-[11px]">Pages to read:</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={pdf.pageRangeInput}
                            onChange={(e) => handlePageRangeChange(pdf.id, e.target.value)}
                            onBlur={() => handleApplyPageRange(pdf.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleApplyPageRange(pdf.id);
                            }}
                            placeholder={`All (1-${pdf.pageCount})`}
                            disabled={pdf.isExtracting}
                            className="w-28 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                          />
                          <button
                            type="button"
                            onClick={() => handleApplyPageRange(pdf.id)}
                            disabled={pdf.isExtracting}
                            className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                            title="Apply page range"
                          >
                            Apply
                          </button>
                        </div>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          (e.g. 45-120 • Default is all pages)
                        </span>
                      </div>

                      {/* Progress Bar when Extracting */}
                      {pdf.isExtracting && (
                        <div className="space-y-1 pt-1">
                          <div className="flex items-center justify-between text-[11px] text-indigo-700 dark:text-indigo-300 font-medium">
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Reading page {pdf.currentPage} of {pdf.totalPagesToRead}
                            </span>
                            <span className="tabular-nums">
                              {Math.round((pdf.currentPage / Math.max(1, pdf.totalPagesToRead)) * 100)}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-indigo-100 dark:bg-indigo-950/60 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-600 rounded-full transition-all duration-150"
                              style={{
                                width: `${Math.min(100, Math.round((pdf.currentPage / Math.max(1, pdf.totalPagesToRead)) * 100))}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Extracted stats when ready */}
                      {!pdf.isExtracting && !pdf.warning && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>
                            {pdf.charCount.toLocaleString()} readable characters extracted
                          </span>
                        </div>
                      )}

                      {/* Scanned / garbled PDF warning */}
                      {!pdf.isExtracting && pdf.warning && (
                        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-900/50">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                          <span>{pdf.warning}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Truncation warning if over 150,000 */}
                {isExtractedTruncated && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      Total extracted text exceeded 150,000 characters. Truncated to 150,000 characters (used 150,000 of {rawExtractedCharCount.toLocaleString()} characters).
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Saved Previously Used PDF Indicator */}
            {isSaved && activePrep?.pdfNames && activePrep.pdfNames.length > 0 && selectedPdfs.length === 0 && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-1">
                <File className="w-3 h-3 text-slate-400" />
                <span>Previously generated with: {activePrep.pdfNames.join(', ')}</span>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="exam-notes-input" className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Pasted Study Notes {selectedPdfs.length > 0 ? '(Optional)' : ''}</span>
              </label>
              <div
                className={`text-xs tabular-nums font-medium ${
                  isOverLimit
                    ? 'text-rose-600 dark:text-rose-400 font-bold'
                    : totalCombinedChars > 135000
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {totalCombinedChars.toLocaleString()} / 150,000 characters combined
              </div>
            </div>
            <textarea
              id="exam-notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                selectedPdfs.length > 0
                  ? "Optional: Add any specific topics, lecture takeaways, or instructor review points along with your extracted PDF text..."
                  : "Paste your lecture notes, textbook chapters, professor review slides, study outlines, or key takeaways here. Or select a PDF above..."
              }
              rows={6}
              className={`w-full p-3.5 rounded-lg text-xs leading-relaxed bg-slate-50 dark:bg-slate-950/60 border ${
                isOverLimit
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500'
                  : 'border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-indigo-500'
              } text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-1 transition-all resize-y`}
            />
            {isOverLimit && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Combined text exceeds 150,000 characters. Please trim slightly or adjust page ranges.</span>
              </p>
            )}
          </div>

          {/* Controls: Mode & Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/60">
            {/* Mode Toggle */}
            <div>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Output Mode
              </span>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setMode('questions')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 ${
                    mode === 'questions'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <FileQuestion className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Practice Questions</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('guide')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 ${
                    mode === 'guide'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Study Guide</span>
                </button>
              </div>
            </div>

            {/* Questions Specific Settings */}
            {mode === 'questions' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Count
                  </span>
                  <div className="flex gap-1">
                    {[5, 10, 15].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setQuestionCount(cnt)}
                        className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer border ${
                          questionCount === cnt
                            ? 'bg-indigo-600 text-white border-indigo-600 font-semibold shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="question-mix-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Question Style
                  </label>
                  <select
                    id="question-mix-select"
                    value={questionMix}
                    onChange={(e: any) => setQuestionMix(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="mixed">Mixed (MCQ + Short)</option>
                    <option value="multiple_choice">Multiple Choice only</option>
                    <option value="short_answer">Short Answer only</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="flex items-end">
                <div className="text-xs text-slate-500 dark:text-slate-400 pb-2">
                  Generates executive overview, high-probability topics, key vocabulary terms with definitions, and thematic study sections.
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {generationError && (
            <div
              className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-900 dark:text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in duration-150"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{generationError}</p>
                {retryAfterSec && (
                  <p className="text-[11px] mt-1 text-rose-700 dark:text-rose-300">
                    Quota protected. Please retry in {retryAfterSec} seconds.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {selectedPdfs.length > 0
                ? `${selectedPdfs.length} PDF${selectedPdfs.length === 1 ? '' : 's'} attached • Extracted in browser`
                : 'Strictly grounded on your materials • Saves automatically to your account'}
            </span>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || isAnyExtracting || isOverLimit || (!notes.trim() && combinedExtractedText.trim().length === 0)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-xs transition-all duration-150 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing with Gemini...</span>
                </>
              ) : isAnyExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Reading PDF pages...</span>
                </>
              ) : isSaved ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Regenerate {mode === 'questions' ? 'Questions' : 'Study Guide'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate {mode === 'questions' ? 'Practice Questions' : 'Study Guide'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Thin Notes Feedback Alert */}
        {activePrep?.notesTooThin && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-1">Notes are too thin for this exam</div>
              <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                {activePrep.notesFeedback ||
                  'The provided text lacked enough academic concepts or depth to generate reliable questions. Paste additional lecture details or review notes above and click Regenerate.'}
              </p>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* RESULT SECTION: PRACTICE QUESTIONS */}
        {/* ================================================================== */}
        {activePrep && !activePrep.notesTooThin && activePrep.mode === 'questions' && activePrep.questions && (
          <div className="space-y-4">
            {/* Score summary */}
            {answeredCount > 0 && (
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      Score: {correctCount} / {answeredCount} correct ({scorePct}%)
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {answeredCount === questionList.length
                        ? `All ${questionList.length} questions answered`
                        : `${questionList.length - answeredCount} of ${questionList.length} not answered yet`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {missedIds.length > 0 && (
                      <button
                        type="button"
                        onClick={handleRetryMissed}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Retry missed ({missedIds.length})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleRestartQuiz}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
                    >
                      Restart
                    </button>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500" style={{ width: `${(correctCount / questionList.length) * 100}%` }} />
                  <div className="h-full bg-rose-500" style={{ width: `${((answeredCount - correctCount) / questionList.length) * 100}%` }} />
                </div>
              </div>
            )}

            {/* Retry banner */}
            {retryIds && (
              <div className="p-3 rounded-lg bg-indigo-500/5 dark:bg-indigo-950/20 border border-indigo-500/20 text-xs flex items-center justify-between gap-3">
                <span className="text-indigo-900 dark:text-indigo-200 font-medium">
                  Retrying {displayQuestions.length} missed question{displayQuestions.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRetryIds(null);
                    setCurrentQuestionIndex(0);
                  }}
                  className="px-2.5 py-1 rounded-md border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-medium hover:bg-indigo-100/60 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer"
                >
                  Show all questions
                </button>
              </div>
            )}

            {/* Questions Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
              <div className="flex items-center gap-2">
                <FileQuestion className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  {displayQuestions.length} Practice Questions
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">•</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {displayQuestions.filter((q) => revealedAnswers[q.id]).length} of {displayQuestions.length} revealed
                </span>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                {/* View Mode Toggle */}
                <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200/60 dark:border-slate-700/60 text-xs">
                  <button
                    type="button"
                    onClick={() => setQuestionViewMode('list')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                      questionViewMode === 'list'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>List</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionViewMode('one_by_one')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                      questionViewMode === 'one_by_one'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>One at a time</span>
                  </button>
                </div>

                {/* Show/Hide All Answers */}
                <button
                  type="button"
                  onClick={() => {
                    const allRevealed = displayQuestions.every((q) => revealedAnswers[q.id]);
                    toggleRevealAllAnswers(!allRevealed, displayQuestions.map((q) => q.id));
                  }}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 transition-colors cursor-pointer"
                >
                  {displayQuestions.every((q) => revealedAnswers[q.id]) ? 'Hide all answers' : 'Show all answers'}
                </button>
              </div>
            </div>

            {/* List Mode View */}
            {questionViewMode === 'list' && (
              <div className="space-y-4">
                {displayQuestions.map((q) => {
                  const isRevealed = !!revealedAnswers[q.id];
                  const userChoice = selectedUserOptions[q.id];
                  const qNum = questionList.indexOf(q) + 1;

                  return (
                    <div
                      key={q.id}
                      className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3.5 transition-all"
                    >
                      {/* Question Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-400 text-xs font-bold flex items-center justify-center shrink-0">
                            {qNum}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                            {q.type === 'multiple_choice' ? 'Multiple Choice' : 'Short Answer'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleRevealAnswer(q.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                        >
                          {isRevealed ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                              <span>Hide answer</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                              <span>Show answer</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Question Text */}
                      <p className="text-sm font-medium text-slate-900 dark:text-white leading-relaxed">
                        {q.question}
                      </p>

                      {/* Multiple Choice Options (if present) */}
                      {q.type === 'multiple_choice' && Array.isArray(q.options) && q.options.length > 0 && (
                        <div className="space-y-2 pt-1">
                          {q.options.map((opt, optIdx) => {
                            const isSelected = userChoice === opt;
                            const isCorrectOpt = isRevealed && isCorrectOption(opt, q);
                            const isWrongPick = isRevealed && isSelected && !isCorrectOpt;

                            return (
                              <button
                                key={optIdx}
                                type="button"
                                disabled={isRevealed}
                                onClick={() =>
                                  setSelectedUserOptions((prev) => ({
                                    ...prev,
                                    [q.id]: opt,
                                  }))
                                }
                                className={`w-full text-left p-3 rounded-lg text-xs leading-relaxed border transition-all flex items-start gap-2.5 ${
                                  isRevealed ? 'cursor-default' : 'cursor-pointer'
                                } ${
                                  isCorrectOpt
                                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/50 text-emerald-950 dark:text-emerald-200 font-medium'
                                    : isWrongPick
                                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-500/50 text-rose-950 dark:text-rose-200'
                                    : isSelected
                                    ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-500/50 text-indigo-950 dark:text-indigo-200'
                                    : 'bg-slate-50 dark:bg-slate-950/40 border-slate-200/80 dark:border-slate-800/80 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                                }`}
                              >
                                <span className="font-semibold shrink-0 text-slate-400 dark:text-slate-500">
                                  {opt.slice(0, 2)}
                                </span>
                                <span className="flex-1">{opt.slice(2).trim()}</span>
                                {isCorrectOpt && (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                )}
                                {isWrongPick && (
                                  <X className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Short answer box */}
                      {q.type !== 'multiple_choice' && renderShortAnswerBox(q)}

                      {/* Revealed Answer Box */}
                      {isRevealed && (
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 text-xs space-y-2 animate-in fade-in duration-150">
                          <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Correct Answer: {q.correctAnswer}</span>
                          </div>
                          <div className="text-slate-600 dark:text-slate-300 leading-relaxed">
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              Explanation:{' '}
                            </span>
                            {q.explanation}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* One-by-One Mode View */}
            {questionViewMode === 'one_by_one' && (
              <div className="p-6 sm:p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-6">
                {(() => {
                  const q = displayQuestions[currentQuestionIndex];
                  if (!q) return null;
                  const isRevealed = !!revealedAnswers[q.id];
                  const userChoice = selectedUserOptions[q.id];

                  return (
                    <>
                      {/* Header Counter & Type */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                          Question {currentQuestionIndex + 1} of {displayQuestions.length}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                          {q.type === 'multiple_choice' ? 'Multiple Choice' : 'Short Answer'}
                        </span>
                      </div>

                      {/* Question Text */}
                      <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white leading-relaxed">
                        {q.question}
                      </h3>

                      {/* Options */}
                      {q.type === 'multiple_choice' && Array.isArray(q.options) && (
                        <div className="space-y-2.5">
                          {q.options.map((opt, optIdx) => {
                            const isSelected = userChoice === opt;
                            const isCorrectOpt = isRevealed && isCorrectOption(opt, q);
                            const isWrongPick = isRevealed && isSelected && !isCorrectOpt;

                            return (
                              <button
                                key={optIdx}
                                type="button"
                                disabled={isRevealed}
                                onClick={() =>
                                  setSelectedUserOptions((prev) => ({
                                    ...prev,
                                    [q.id]: opt,
                                  }))
                                }
                                className={`w-full text-left p-3.5 rounded-xl text-xs sm:text-sm border transition-all flex items-center justify-between gap-3 ${
                                  isRevealed ? 'cursor-default' : 'cursor-pointer'
                                } ${
                                  isCorrectOpt
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-950 dark:text-emerald-200 font-medium'
                                    : isWrongPick
                                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 text-rose-950 dark:text-rose-200'
                                    : isSelected
                                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-950 dark:text-indigo-200'
                                    : 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                                }`}
                              >
                                <span>{opt}</span>
                                {isCorrectOpt && (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                )}
                                {isWrongPick && (
                                  <X className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Short answer box */}
                      {q.type !== 'multiple_choice' && renderShortAnswerBox(q)}

                      {/* Reveal Answer Section */}
                      <div className="pt-2">
                        {!isRevealed ? (
                          <button
                            type="button"
                            onClick={() => toggleRevealAnswer(q.id)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Show answer &amp; explanation</span>
                          </button>
                        ) : (
                          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 text-xs space-y-2 animate-in fade-in duration-150">
                            <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Correct Answer: {q.correctAnswer}</span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                              <span className="font-semibold text-slate-700 dark:text-slate-200">
                                Explanation:{' '}
                              </span>
                              {q.explanation}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Pagination Controls */}
                      <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                          disabled={currentQuestionIndex === 0}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          <span>Previous</span>
                        </button>

                        <span className="text-xs text-slate-400">
                          {currentQuestionIndex + 1} / {displayQuestions.length}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            setCurrentQuestionIndex((prev) => Math.min(displayQuestions.length - 1, prev + 1))
                          }
                          disabled={currentQuestionIndex >= displayQuestions.length - 1}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <span>Next</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ================================================================== */}
        {/* STUDY GUIDE VIEW SWITCH + FLASHCARDS */}
        {/* ================================================================== */}
        {activePrep && !activePrep.notesTooThin && activePrep.mode === 'guide' && activePrep.studyGuide && (
          <div className="space-y-4">
            <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200/60 dark:border-slate-700/60 text-xs">
              {(['guide', 'flashcards'] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => {
                    setGuideView(view);
                    setCardFlipped(false);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    guideView === view
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  {view === 'guide' ? <BookOpen className="w-3.5 h-3.5" /> : <GraduationCap className="w-3.5 h-3.5" />}
                  <span>{view === 'guide' ? 'Study guide' : 'Flashcards'}</span>
                </button>
              ))}
            </div>

            {guideView === 'flashcards' &&
              (() => {
                const terms = activePrep.studyGuide?.keyTerms ?? [];
                if (terms.length === 0) {
                  return (
                    <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
                      This study guide has no key terms to turn into flashcards. Regenerate it with more detailed notes.
                    </div>
                  );
                }

                const baseOrder =
                  cardOrder && cardOrder.length === terms.length ? cardOrder : terms.map((_, i) => i);
                const deck = baseOrder.filter((i) => !onlyLearning || cardStatus[String(i)] !== 'known');
                const knownCount = terms.filter((_, i) => cardStatus[String(i)] === 'known').length;
                const safeIndex = Math.min(cardIndex, Math.max(0, deck.length - 1));
                const origIdx = deck[safeIndex];
                const card = origIdx !== undefined ? terms[origIdx] : null;
                const status = origIdx !== undefined ? cardStatus[String(origIdx)] : undefined;

                const markCard = (next: 'known' | 'learning') => {
                  if (origIdx === undefined) return;
                  setCardStatus((prev) => ({ ...prev, [String(origIdx)]: next }));
                  setCardFlipped(false);
                  if (onlyLearning && next === 'known') {
                    // The card leaves the deck, so the next card slides into this position
                    setCardIndex(safeIndex);
                  } else {
                    setCardIndex(Math.min(safeIndex + 1, deck.length - 1));
                  }
                };

                const shuffleCards = () => {
                  const order = terms.map((_, i) => i);
                  for (let i = order.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [order[i], order[j]] = [order[j], order[i]];
                  }
                  setCardOrder(order);
                  setCardIndex(0);
                  setCardFlipped(false);
                };

                const smallBtn =
                  'px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer';

                return (
                  <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {knownCount} of {terms.length} known
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={shuffleCards} className={smallBtn}>
                          Shuffle
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOnlyLearning((v) => !v);
                            setCardIndex(0);
                            setCardFlipped(false);
                          }}
                          className={`${smallBtn} ${onlyLearning ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300' : ''}`}
                        >
                          {onlyLearning ? 'Showing unknown only' : 'Only unknown'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCardStatus({});
                            setOnlyLearning(false);
                            setCardIndex(0);
                            setCardFlipped(false);
                          }}
                          className={smallBtn}
                        >
                          Reset progress
                        </button>
                      </div>
                    </div>

                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-150"
                        style={{ width: `${(knownCount / terms.length) * 100}%` }}
                      />
                    </div>

                    {!card ? (
                      <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 space-y-3">
                        <p>Every card is marked as known.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setOnlyLearning(false);
                            setCardIndex(0);
                          }}
                          className={smallBtn}
                        >
                          Show all cards
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setCardFlipped((f) => !f)}
                          className="w-full min-h-[200px] p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 hover:border-indigo-300 dark:hover:border-indigo-800 transition-colors cursor-pointer flex flex-col items-center justify-center text-center gap-3"
                        >
                          <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {cardFlipped ? 'Definition' : 'Term'}
                            {status === 'known' ? ' • Known' : status === 'learning' ? ' • Still learning' : ''}
                          </span>
                          <span
                            className={
                              cardFlipped
                                ? 'text-sm leading-relaxed text-slate-800 dark:text-slate-200'
                                : 'text-xl font-bold text-slate-900 dark:text-white'
                            }
                          >
                            {cardFlipped ? card.definition : card.term}
                          </span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">Click the card to flip</span>
                        </button>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCardIndex(Math.max(0, safeIndex - 1));
                              setCardFlipped(false);
                            }}
                            disabled={safeIndex === 0}
                            className={`${smallBtn} disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1`}
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span>Previous</span>
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => markCard('learning')}
                              className="px-3 py-1.5 rounded-lg border border-amber-400/60 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors cursor-pointer"
                            >
                              Still learning
                            </button>
                            <button
                              type="button"
                              onClick={() => markCard('known')}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                            >
                              Got it
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setCardIndex(Math.min(deck.length - 1, safeIndex + 1));
                              setCardFlipped(false);
                            }}
                            disabled={safeIndex >= deck.length - 1}
                            className={`${smallBtn} disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1`}
                          >
                            <span>Next</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <p className="text-center text-[11px] text-slate-400">
                          Card {safeIndex + 1} of {deck.length}
                        </p>
                      </>
                    )}
                  </div>
                );
              })()}
          </div>
        )}

        {/* ================================================================== */}
        {/* RESULT SECTION: STUDY GUIDE */}
        {/* ================================================================== */}
        {activePrep && !activePrep.notesTooThin && activePrep.mode === 'guide' && activePrep.studyGuide && guideView === 'guide' && (
          <div className="space-y-6">
            {/* Guide Header Banner */}
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Synthesized Study Guide</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Extracted directly from your provided notes for {selectedExam.courseName}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopyStudyGuide}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 text-xs font-medium transition-colors cursor-pointer self-start sm:self-auto"
              >
                {copiedGuide ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy to clipboard</span>
                  </>
                )}
              </button>
            </div>

            {/* High-Level Overview */}
            {activePrep.studyGuide.overview && (
              <div className="p-5 rounded-xl bg-indigo-500/5 dark:bg-indigo-950/20 border border-indigo-500/20 space-y-1.5">
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                  Executive Synthesis
                </span>
                <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-normal">
                  {activePrep.studyGuide.overview}
                </p>
              </div>
            )}

            {/* Likely Exam Topics */}
            {Array.isArray(activePrep.studyGuide.likelyTopics) &&
              activePrep.studyGuide.likelyTopics.length > 0 && (
                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>High-Probability Exam Topics</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {activePrep.studyGuide.likelyTopics.map((topic, tIdx) => (
                      <div
                        key={tIdx}
                        className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 text-xs text-slate-800 dark:text-slate-200 flex items-start gap-2.5"
                      >
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{topic}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Key Terms & Definitions */}
            {Array.isArray(activePrep.studyGuide.keyTerms) &&
              activePrep.studyGuide.keyTerms.length > 0 && (
                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Key Terminology &amp; Definitions</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activePrep.studyGuide.keyTerms.map((term, kIdx) => (
                      <div
                        key={kIdx}
                        className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 space-y-1 text-xs"
                      >
                        <div className="font-semibold text-indigo-700 dark:text-indigo-300">
                          {term.term}
                        </div>
                        <div className="text-slate-600 dark:text-slate-300 leading-relaxed">
                          {term.definition}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Thematic Sections */}
            {Array.isArray(activePrep.studyGuide.sections) &&
              activePrep.studyGuide.sections.length > 0 && (
                <div className="space-y-4">
                  {activePrep.studyGuide.sections.map((section, sIdx) => (
                    <div
                      key={sIdx}
                      className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3"
                    >
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center shrink-0">
                          {sIdx + 1}
                        </span>
                        <span>{section.heading}</span>
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {section.summary}
                      </p>

                      {Array.isArray(section.bulletPoints) && section.bulletPoints.length > 0 && (
                        <ul className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                          {section.bulletPoints.map((bp, bIdx) => (
                            <li
                              key={bIdx}
                              className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2 leading-relaxed"
                            >
                              <span className="text-indigo-500 font-bold shrink-0 mt-0.5">•</span>
                              <span>{bp}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}
      </div>
    );
  }

  // ==========================================================================
  // STEP 1: EXAMS LIST VIEW
  // ==========================================================================
  const totalExamsCount = allExams.length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <FileQuestion className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>Exam Prep</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Convert lecture notes and study materials into interactive flashcards, multiple-choice questions, short-answer prompts, and structured study guides.
          </p>
        </div>

        {totalExamsCount > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-medium">
              {upcomingExams.length} upcoming {upcomingExams.length === 1 ? 'exam' : 'exams'}
            </span>
          </div>
        )}
      </div>

      {/* Empty State: No Exams Across Courses */}
      {totalExamsCount === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              No exams found on your schedule
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Exams are automatically detected when you parse syllabi or add deadlines marked as &ldquo;Exam&rdquo;.
              Add your courses or check your course deadlines to get started with exam prep.
            </p>
          </div>
          <div className="pt-2 flex justify-center gap-3">
            {onOpenCourses && (
              <button
                type="button"
                onClick={onOpenCourses}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>Go to Courses</span>
              </button>
            )}
            {onOpenAddCourse && (
              <button
                type="button"
                onClick={onOpenAddCourse}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors cursor-pointer"
              >
                <span>Add Syllabus</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Exams Table / Cards List */
        <div className="space-y-6">
          {/* Upcoming Exams Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Upcoming Exams ({upcomingExams.length})
              </h2>
              <span className="text-[11px] text-slate-400">
                Sorted by soonest first
              </span>
            </div>

            {upcomingExams.length === 0 ? (
              <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 text-center text-xs text-slate-500">
                No upcoming exams scheduled. All your exams may have already passed.
              </div>
            ) : (
              <div className="space-y-2.5">
                {upcomingExams.map((exam) => {
                  const hasSaved = !!savedPreps[exam.prepId];
                  const daysLabel = calculateDaysUntil(exam.date);

                  return (
                    <button
                      key={exam.prepId}
                      type="button"
                      onClick={() => handleSelectExam(exam)}
                      className="w-full text-left p-4 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/70 border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-300 dark:hover:border-indigo-800 shadow-xs hover:shadow-sm transition-all duration-150 cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start sm:items-center gap-3.5">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 mt-1 sm:mt-0"
                          style={{ backgroundColor: exam.courseColor }}
                        />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                              {exam.courseCode || exam.courseName}
                            </span>
                            {exam.weight !== null && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                                {exam.weight}%
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {exam.title}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                        {/* Saved Badge */}
                        {hasSaved && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Saved</span>
                          </span>
                        )}

                        {/* Date & Days indicator */}
                        <div className="text-right">
                          <div className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 justify-end">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatDateDisplay(exam.date)}</span>
                          </div>
                          {daysLabel && (
                            <div className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                              {daysLabel}
                            </div>
                          )}
                        </div>

                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past Exams Section (Greyed out) */}
          {pastExams.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-200/60 dark:border-slate-800/60">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowPastExams(!showPastExams)}
                  className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>Past Exams ({pastExams.length})</span>
                  <span className="text-[10px] text-slate-400 lowercase">
                    ({showPastExams ? 'click to hide' : 'click to show'})
                  </span>
                </button>
              </div>

              {showPastExams && (
                <div className="space-y-2 opacity-60 hover:opacity-85 transition-opacity">
                  {pastExams.map((exam) => {
                    const hasSaved = !!savedPreps[exam.prepId];

                    return (
                      <button
                        key={exam.prepId}
                        type="button"
                        onClick={() => handleSelectExam(exam)}
                        className="w-full text-left p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 shadow-xs transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-500 dark:text-slate-400"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 grayscale"
                            style={{ backgroundColor: exam.courseColor }}
                          />
                          <div>
                            <span className="text-[11px] uppercase tracking-wider block">
                              {exam.courseCode || exam.courseName}
                            </span>
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 line-through">
                              {exam.title}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto">
                          {hasSaved && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              Saved
                            </span>
                          )}
                          <span className="text-xs">{formatDateDisplay(exam.date)}</span>
                          <span className="text-[10px] text-slate-400 font-medium">Past</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};