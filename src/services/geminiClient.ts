import { 
  Course, 
  ExtractedSyllabusData, 
  AcademicSearchResult, 
  SemesterAnalysis, 
  GradeFocusAnalysis,
  ExamPrepMode,
  PracticeQuestion,
  StudyGuideData,
} from '../types/academic';
import { auth } from './firebase';

export interface ExamPrepApiResponse {
  mode: ExamPrepMode;
  notesTooThin: boolean;
  notesFeedback: string | null;
  questions: PracticeQuestion[];
  studyGuide: StudyGuideData | null;
  generatedAt: string;
}

export interface AudioBriefingResponse {
  audio?: string | null; // base64 encoded wav
  mimeType?: string;
  transcript: string;
  fallbackToSpeechSynthesis?: boolean;
}

/**
 * Helper to retrieve authentication headers containing the signed-in student's Firebase ID token.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  if (typeof auth.authStateReady === 'function') {
    try {
      await auth.authStateReady();
    } catch {
      // Continue if auth ready check errors
    }
  }
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Please sign in to use Apodict AI features.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export const geminiClient = {
  /**
   * Parse syllabus text and/or PDF documents using Gemini 3.1 Flash Lite via backend API
   */
  async parseSyllabus(
    courseName: string,
    syllabusText?: string,
    pdfFiles?: Array<{ name: string; base64: string; size: number }>
  ): Promise<ExtractedSyllabusData> {
    const hasText = syllabusText && syllabusText.trim().length > 0;
    const hasPdfs = Array.isArray(pdfFiles) && pdfFiles.length > 0;

    if (!hasText && !hasPdfs) {
      throw new Error('Please upload at least one PDF syllabus or paste the syllabus text.');
    }

    const headers = await getAuthHeaders();
    const response = await fetch('/api/parse-syllabus', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        courseName: courseName ? courseName.trim() : '',
        syllabusText: syllabusText ? syllabusText.trim() : '',
        pdfFiles: pdfFiles || [],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to analyze syllabus (${response.status} ${response.statusText})`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.categories) || !Array.isArray(data.deadlines)) {
      throw new Error('Unexpected data format returned from syllabus parser. Please review and edit manually.');
    }

    return data;
  },

  /**
   * Generate an energetic, clear spoken audio briefing of the course using Gemini 3.8 Flash Lite TTS
   */
  async generateCourseAudioBriefing(course: Course, voice: string = 'Kore'): Promise<AudioBriefingResponse> {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/course-audio', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        course,
        voice,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (errorData.transcript) {
        return {
          audio: null,
          transcript: errorData.transcript,
          fallbackToSpeechSynthesis: true,
        };
      }
      throw new Error(errorData.error || `Audio generation failed (${response.status})`);
    }

    return await response.json();
  },

  /**
   * Perform academic search grounding using Gemini 3.1 Flash Lite with googleSearch
   */
  async searchCourseResources(courseName: string, query: string): Promise<AcademicSearchResult> {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/academic-search', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        courseName,
        query,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Search grounding failed (${response.status})`);
    }

    return await response.json();
  },

  /**
   * Analyze semester collision and crunch periods using Gemini 3.1 Flash Lite
   */
  async analyzeSemester(courses: Course[]): Promise<SemesterAnalysis> {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/analyze-semester', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        courses,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Semester analysis failed (${response.status})`);
    }

    return await response.json();
  },

  /**
   * Break an assignment into 4-8 backward milestones with Gemini 3.1 Flash Lite
   */
  async generatePlan(params: {
    assignmentTitle: string;
    promptText?: string;
    dueDate: string;
    hoursPerDay: number;
    currentDate?: string;
  }): Promise<{
    milestones: Array<{
      id: string;
      title: string;
      estimatedHours: number;
      targetDate: string;
      isStartHere: boolean;
      completed: boolean;
    }>;
    timeWarning?: {
      isTooShort: boolean;
      warningMessage: string;
      suggestion: string;
    } | null;
  }> {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/generate-plan', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        assignmentTitle: params.assignmentTitle.trim(),
        promptText: params.promptText ? params.promptText.trim() : '',
        dueDate: params.dueDate.trim(),
        hoursPerDay: params.hoursPerDay,
        currentDate: params.currentDate || '2026-10-02',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Plan generation failed (${response.status})`);
    }

    return await response.json();
  },

  /**
   * Get ranked effort focus advice using Gemini 3.1 Flash Lite
   */
  async getGradeFocusAdvice(data: {
    courseName: string;
    targetGrade: number;
    currentWeightedGrade: number | null;
    pointsEarnedSoFar: number;
    maxPossibleGrade?: number;
    gradedWeight: number;
    remainingWeight: number;
    status: 'secured' | 'out_of_reach' | 'achievable' | 'no_grades';
    neededScoreOnRemaining: number | null;
    categories: Array<{
      name: string;
      weight: number | null;
      currentScore: number | null;
      gradedWeight?: number;
      remainingWeight?: number;
      status?: 'graded' | 'ungraded' | 'partially_graded';
      items?: Array<{
        name: string;
        weight: number | null;
        currentScore: number | null;
        status: 'graded' | 'ungraded';
      }>;
    }>;
  }): Promise<GradeFocusAnalysis> {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/grade-focus', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to analyze grade focus (${response.status})`);
    }

    return await response.json();
  },

  /**
   * Generate exam practice questions or study guide from pasted notes or client-extracted PDF text using Gemini 3.1 Flash Lite
   */
  async generateExamPrep(params: {
    courseName: string;
    examTitle: string;
    examDate?: string | null;
    mode: ExamPrepMode;
    notes?: string;
    extractedText?: string;
    pdfFiles?: Array<{ name: string; pageCount?: number; pageRange?: string }>;
    questionCount?: number;
    questionMix?: 'mixed' | 'multiple_choice' | 'short_answer';
  }): Promise<ExamPrepApiResponse> {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/exam-prep', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        courseName: params.courseName.trim(),
        examTitle: params.examTitle.trim(),
        examDate: params.examDate || '',
        mode: params.mode,
        notes: typeof params.notes === 'string' ? params.notes : '',
        extractedText: typeof params.extractedText === 'string' ? params.extractedText : '',
        pdfFiles: params.pdfFiles || [],
        questionCount: params.questionCount || 10,
        questionMix: params.questionMix || 'mixed',
      }),
    });

        const rawBody = await response.text();
    let payload: any = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      // body was not JSON
    }

    if (!response.ok) {
      if (response.status === 413) {
        throw new Error(
          payload?.error ||
            'The request payload exceeds the server limit of 1 MB. Combined text must be under 150,000 characters. Please trim notes or select a smaller page range.'
        );
      }
      throw new Error(
        payload?.error || `Exam prep generation failed (${response.status}). ${rawBody.slice(0, 120)}`
      );
    }

    if (!payload) {
      throw new Error(
        `The server returned an unexpected response (${response.status}): ${rawBody.slice(0, 120)}`
      );
    }

    return payload;
  },
};