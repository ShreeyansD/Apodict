export type DeadlineType = 'exam' | 'paper' | 'homework' | 'project' | 'quiz' | 'other';

export interface GradedCategory {
  id: string;
  name: string;
  weight: number | null; // e.g. 40 for 40%, null if not stated
  description?: string | null;
  currentScore?: number | null; // e.g. 92 for 92%, null if not yet graded
}

export interface Deadline {
  id: string;
  title: string;
  date: string | null; // 'YYYY-MM-DD' or null
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