export type DeadlineType = 'exam' | 'paper' | 'homework' | 'project' | 'quiz' | 'other';

export interface GradedCategory {
  id: string;
  name: string;
  weight: number | null; // e.g. 40 for 40%, null if not stated
  description?: string | null;
  currentScore?: number | null; // e.g. 92 for 92%, null if not yet graded
}

export type DateStatus = 'exact' | 'range' | 'ambiguous' | 'missing';
export type DateSource = 'syllabus' | 'manual';

export interface Deadline {
  id: string;
  title: string;
  date: string | null; // 'YYYY-MM-DD' or null
  dateStatus?: DateStatus;
  dateEnd?: string | null; // 'YYYY-MM-DD' or null, only for ranges
  dateEvidence?: string | null; // Exact snippet from syllabus up to 120 chars
  dateSource?: DateSource; // 'syllabus' | 'manual', optional (defaults to 'syllabus')
  type: DeadlineType;
  weight: number | null; // e.g. 15 for 15%, null if not stated
  completed?: boolean;
  score?: number | null; // e.g. 92 for 92%, null if not yet graded
  categoryId?: string | null; // Link to GradedCategory.id
  categoryLocked?: boolean; // true when the student placed this item (including "Unassigned"); never auto-matched
  excludedFromGrading?: boolean;
  calendarEventId?: string; // Google Calendar event ID
}

export interface Course {
  id: string;
  name: string;
  code?: string | null;
  instructor?: string | null;
  term?: string | null;
  color?: string;
  rawSyllabus?: string;
  conflicts?: string[];
  targetGrade?: number | null; // e.g. 90 for 90% (A), default 90
  categories: GradedCategory[];
  deadlines: Deadline[];
  notes?: string | null;
  order?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedSyllabusData {
  courseName: string;
  courseCode?: string | null;
  instructor?: string | null;
  term?: string | null;
  conflicts?: string[];
  categories: Array<{
    name: string;
    weight: number | null;
    description?: string | null;
  }>;
  deadlines: Array<{
    title: string;
    date: string | null;
    dateStatus?: DateStatus;
    dateEnd?: string | null;
    dateEvidence?: string | null;
    dateSource?: DateSource;
    type: DeadlineType;
    weight: number | null;
  }>;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface AcademicSearchResult {
  query: string;
  answer: string;
  sources: GroundingSource[];
}

export interface EarlyStartRecommendation {
  assignment: string;
  course: string;
  recommendation: string;
}

export interface CrunchPeriod {
  title: string;
  dateRange: string;
  severity: 'critical' | 'high' | 'moderate';
  description: string;
  startEarly: EarlyStartRecommendation[];
}

export interface SemesterAnalysis {
  crunchPeriods: CrunchPeriod[];
  overallStrategy: string;
}

export interface Milestone {
  id: string;
  title: string;
  estimatedHours: number; // e.g. 0.25 (15 mins), 1.5, 2.0
  targetDate: string; // YYYY-MM-DD
  isStartHere?: boolean;
  completed: boolean;
  calendarEventId?: string; // Google Calendar event ID
}

export interface AssignmentPlan {
  id: string;
  title: string;
  courseName?: string | null;
  courseId?: string | null;
  promptText: string;
  dueDate: string; // YYYY-MM-DD
  hoursPerDay: number;
  milestones: Milestone[];
  timeWarning?: {
    isTooShort: boolean;
    warningMessage: string;
    suggestion: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface GradeFocusItem {
  categoryName: string;
  weight: number | null;
  currentScore: number | null;
  priority: 'Highest Leverage' | 'High Impact' | 'Diminishing Returns - Cap Effort' | 'Maintain Standing';
  actionableAdvice: string;
}

export interface GradeFocusAnalysis {
  courseName: string;
  summary: string;
  prioritizedActions: GradeFocusItem[];
  honestAdvice: string;
}

export type ExamPrepMode = 'questions' | 'guide';
export type QuestionType = 'multiple_choice' | 'short_answer';

export interface PracticeQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

export interface StudyGuideSection {
  heading: string;
  summary: string;
  bulletPoints?: string[];
}

export interface KeyTerm {
  term: string;
  definition: string;
}

export interface StudyGuideData {
  overview?: string;
  likelyTopics: string[];
  keyTerms: KeyTerm[];
  sections: StudyGuideSection[];
}

export interface ExamPrepData {
  id: string; // `${courseId}_${examId}`
  courseId: string;
  courseName: string;
  examId: string;
  examTitle: string;
  examDate?: string | null;
  mode: ExamPrepMode;
  notes: string;
  pdfNames?: string[];
  notesTooThin?: boolean;
  notesFeedback?: string | null;
  questions?: PracticeQuestion[];
  studyGuide?: StudyGuideData | null;
  generatedAt: string;
  updatedAt: string;
}