import { Course, GradedCategory, Deadline, DeadlineType, DateStatus, AssignmentPlan, Milestone, ExamPrepData } from '../types/academic';
import { NotificationSettings, NotificationRule, NotificationRuleScope, ReminderLeadTime } from '../types/notifications';
import { PushSettings, PushRule } from '../types/push';
import { calendarSyncService, registerDataStoreHooks } from './calendarSyncService';
import { 
  auth, 
  db, 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  writeBatch, 
  handleFirestoreError, 
  OperationType 
} from './firebase';

const STORAGE_KEY = 'semester_command_center_courses_v1';
const PLANS_STORAGE_KEY = 'semester_command_center_plans_v1';
const NOTIFICATION_SETTINGS_STORAGE_KEY = 'semester_command_center_notification_settings_v1';
const NOTIFICATION_RULES_STORAGE_KEY = 'semester_command_center_notification_rules_v1';
const EXAM_PREPS_STORAGE_KEY = 'semester_command_center_exam_preps_v1';
const PUSH_PREFERENCES_STORAGE_KEY = 'apodict_push_preferences_v1';
const PUSH_SETTINGS_STORAGE_KEY = 'apodict_push_settings_v1';
const PUSH_RULES_STORAGE_KEY = 'apodict_push_rules_v1';

export const DEFAULT_PUSH_SETTINGS: PushSettings = {
  timeZone: typeof Intl !== 'undefined' ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York') : 'America/New_York',
  defaultReminderTime: '09:00',
  updatedAt: new Date().toISOString(),
};

let inMemoryPushSettings: PushSettings | null = null;
let hasLoadedPushSettingsForUserId: string | null = null;
let inMemoryPushRules: PushRule[] = [];
let hasLoadedPushRulesForUserId: string | null = null;

export interface PushPreferences {
  oneDayBefore: boolean;
  threeHoursBefore: boolean;
  oneHourBefore: boolean;
  updatedAt?: string;
}

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  oneDayBefore: true,
  threeHoursBefore: true,
  oneHourBefore: false,
};

export interface PushTokenRecord {
  token: string;
  userAgent: string;
  createdAt: string;
  updatedAt: string;
}

function readLocalPushPreferencesSafe(): PushPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PUSH_PREFERENCES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeSavePushPreferencesToLocalStorage(prefs: PushPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PUSH_PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}

function readLocalPushSettingsSafe(): PushSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PUSH_SETTINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeSavePushSettingsToLocalStorage(settings: PushSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PUSH_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

function readLocalPushRulesSafe(): PushRule[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PUSH_RULES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function safeSavePushRulesToLocalStorage(rules: PushRule[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PUSH_RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {}
}

function getPushTokenDocId(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
  }
  const cleanSuffix = token.replace(/[^a-zA-Z0-9_-]/g, '').slice(-20);
  return `push_${Math.abs(hash)}_${cleanSuffix || 'tok'}`;
}

// Initial sample assignment plan for collegiate demo
const INITIAL_PLANS: AssignmentPlan[] = [];
const INITIAL_COURSES: Course[] = [];
const DEMO_PLANS: AssignmentPlan[] = [  
  {
    id: 'plan-cs106b-a3',
    title: 'Assignment 3: Meta-Recursion Puzzles',
    courseName: 'CS 106B: Programming Abstractions',
    courseId: 'course-cs106b',
    promptText: 'Implement recursive backtracking algorithms for the Boggle word game and generate all valid permutations. Must pass all Stanford unit tests and handle recursive base cases cleanly without memory leaks.',
    dueDate: '2026-10-09',
    hoursPerDay: 1.5,
    milestones: [
      {
        id: 'ms-1',
        title: 'Start here: Open starter code in VS Code & write 3 base-case assertions on scratch paper',
        estimatedHours: 0.25,
        targetDate: '2026-10-03',
        isStartHere: true,
        completed: true,
      },
      {
        id: 'ms-2',
        title: 'Warm-up: Implement recursive maze exploration helper function',
        estimatedHours: 1.5,
        targetDate: '2026-10-04',
        completed: true,
      },
      {
        id: 'ms-3',
        title: 'Core Algorithm: Build recursive backtracking decision tree for Boggle board',
        estimatedHours: 2.5,
        targetDate: '2026-10-05',
        completed: false,
      },
      {
        id: 'ms-4',
        title: 'Lexicon Optimization: Integrate Lexicon prefix pruning to eliminate invalid paths',
        estimatedHours: 2.0,
        targetDate: '2026-10-06',
        completed: false,
      },
      {
        id: 'ms-5',
        title: 'Edge Cases: Run custom torture tests with edge boards (empty cells, loops)',
        estimatedHours: 1.5,
        targetDate: '2026-10-07',
        completed: false,
      },
      {
        id: 'ms-6',
        title: 'Buffer Day & Submission: Run Valgrind memory leak checks and submit via Paperless',
        estimatedHours: 1.0,
        targetDate: '2026-10-08',
        completed: false,
      },
    ],
    timeWarning: null,
    createdAt: new Date('2026-10-02').toISOString(),
    updatedAt: new Date('2026-10-02').toISOString(),
  },
];

// Initial sample courses for realistic collegiate experience
const DEMO_COURSES: Course[] = [
  {
    id: 'course-cs106b',
    name: 'CS 106B: Programming Abstractions',
    code: 'CS 106B',
    instructor: 'Dr. Julie Zelenski',
    term: null,
    color: '#3B82F6', // Blue
    targetGrade: 90,
    categories: [
      { id: 'cat-1', name: 'Programming Assignments', weight: 45, currentScore: 94, description: '7 bi-weekly coding projects' },
      { id: 'cat-2', name: 'Midterm Examination', weight: 20, currentScore: null, description: 'Covers recursion, ADTs, pointer mechanics' },
      { id: 'cat-3', name: 'Final Examination', weight: 30, currentScore: null, description: 'Comprehensive 3-hour exam' },
      { id: 'cat-4', name: 'Section Participation', weight: 5, currentScore: 100, description: 'Weekly small group problem solving' },
    ],
    deadlines: [
      { id: 'dl-1', title: 'Assignment 3: Meta-Recursion Puzzles', date: '2026-10-09', type: 'project', weight: 7, score: 94, categoryId: 'cat-1' },
      { id: 'dl-2', title: 'Midterm Diagnostic Exam', date: '2026-10-22', type: 'exam', weight: 20, score: null, categoryId: 'cat-2' },
      { id: 'dl-3', title: 'Assignment 4: Priority Queues & Heaps', date: '2026-10-30', type: 'homework', weight: 7, score: null, categoryId: 'cat-1' },
      { id: 'dl-4', title: 'Assignment 5: Huffman Data Compression', date: '2026-11-12', type: 'project', weight: 8, score: null, categoryId: 'cat-1' },
      { id: 'dl-5', title: 'Final Comprehensive Exam', date: '2026-12-08', type: 'exam', weight: 30, score: null, categoryId: 'cat-3' },
    ],
    createdAt: new Date('2026-09-15').toISOString(),
    updatedAt: new Date('2026-09-15').toISOString(),
  },
  {
    id: 'course-econ50',
    name: 'ECON 50: Economic Analysis I',
    code: 'ECON 50',
    instructor: 'Prof. Mark Duggan',
    term: null,
    color: '#10B981', // Emerald
    targetGrade: 85,
    categories: [
      { id: 'cat-5', name: 'Problem Sets (Drop lowest 1)', weight: 20, currentScore: 88, description: '8 quantitative problem sets' },
      { id: 'cat-6', name: 'Midterm 1', weight: 20, currentScore: 81, description: 'Consumer theory and utility maximization' },
      { id: 'cat-7', name: 'Midterm 2', weight: 20, currentScore: null, description: 'Production functions and cost curves' },
      { id: 'cat-8', name: 'Final Exam', weight: 35, currentScore: null, description: 'General equilibrium and market failure' },
      { id: 'cat-9', name: 'Poll Everywhere Participation', weight: 5, currentScore: 100, description: 'In-lecture responses' },
    ],
    deadlines: [
      { id: 'dl-6', title: 'Problem Set 3: Utility & Indifference Curves', date: '2026-10-08', type: 'homework', weight: 2.5, score: 88, categoryId: 'cat-5' },
      { id: 'dl-7', title: 'Midterm 1: Consumer Behavior & Demand', date: '2026-10-16', type: 'exam', weight: 20, score: 81, categoryId: 'cat-6' },
      { id: 'dl-8', title: 'Problem Set 5: Cost Minimization', date: '2026-11-05', type: 'homework', weight: 2.5, score: null, categoryId: 'cat-5' },
      { id: 'dl-9', title: 'Midterm 2: Competitive Firms & Monopoly', date: '2026-11-19', type: 'exam', weight: 20, score: null, categoryId: 'cat-7' },
      { id: 'dl-10', title: 'Final Exam', date: '2026-12-10', type: 'exam', weight: 35, score: null, categoryId: 'cat-8' },
    ],
    createdAt: new Date('2026-09-16').toISOString(),
    updatedAt: new Date('2026-09-16').toISOString(),
  },
  {
    id: 'course-psyc1',
    name: 'PSYC 1: Introduction to Psychology',
    code: 'PSYC 1',
    instructor: 'Dr. James Gross',
    term: null,
    color: '#8B5CF6', // Purple
    targetGrade: 93,
    categories: [
      { id: 'cat-10', name: 'Research Paper', weight: 30, currentScore: null, description: 'Empirical review on cognitive biases' },
      { id: 'cat-11', name: 'Quizzes (Bi-weekly)', weight: 25, currentScore: 95, description: 'Short online checks' },
      { id: 'cat-12', name: 'Midterm Exam', weight: 20, currentScore: null, description: 'Neuroscience and Perception' },
      { id: 'cat-13', name: 'Final Exam', weight: 25, currentScore: null, description: 'Non-cumulative core topics' },
    ],
    deadlines: [
      { id: 'dl-11', title: 'Quiz 2: Neural Transmission & Brain Anatomy', date: '2026-10-12', type: 'quiz', weight: 5, score: 95, categoryId: 'cat-11' },
      { id: 'dl-12', title: 'Research Paper Topic & Abstract', date: '2026-10-26', type: 'paper', weight: 5, score: 90, categoryId: 'cat-10' },
      { id: 'dl-13', title: 'Midterm Exam', date: '2026-11-02', type: 'exam', weight: 20, score: null, categoryId: 'cat-12' },
      { id: 'dl-14', title: 'Final Research Paper Submission', date: '2026-11-23', type: 'paper', weight: 25, score: null, categoryId: 'cat-10' },
      { id: 'dl-15', title: 'Final Psychology Exam', date: '2026-12-07', type: 'exam', weight: 25, score: null, categoryId: 'cat-13' },
    ],
    createdAt: new Date('2026-09-18').toISOString(),
    updatedAt: new Date('2026-09-18').toISOString(),
  },
];

const COURSE_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#6366F1', // Indigo
  '#14B8A6', // Teal
];

function getRandomColor(): string {
  const index = Math.floor(Math.random() * COURSE_COLORS.length);
  return COURSE_COLORS[index];
}

export function matchTitleToCategory(
  itemTitle: string,
  categories: GradedCategory[]
): GradedCategory | null {
  if (!itemTitle || !categories || categories.length === 0) return null;

  const t = itemTitle.toLowerCase().trim();
  const tWords = t.split(/[^a-z0-9]+/).filter(Boolean);

  const isAgreementItem =
    t.includes('agreement') || t.includes('honor code') || t.includes('integrity');

  // Check for Midterm numbering in item title
  // Midterm Exam 1, Midterm Exam 2, Midterm Exam 3, and the Final Exam each belong to their own category, not to Exam Agreement.
  const isMidterm1 =
    t.includes('midterm 1') ||
    t.includes('midterm exam 1') ||
    t.includes('midterm i') ||
    (t.includes('midterm') && tWords.includes('1'));

  const isMidterm2 =
    t.includes('midterm 2') ||
    t.includes('midterm exam 2') ||
    t.includes('midterm ii') ||
    (t.includes('midterm') && tWords.includes('2'));

  const isMidterm3 =
    t.includes('midterm 3') ||
    t.includes('midterm exam 3') ||
    t.includes('midterm iii') ||
    (t.includes('midterm') && tWords.includes('3'));

  const isFinal =
    t.includes('final') &&
    (t.includes('exam') || t.includes('test') || t.includes('comprehensive') || tWords.includes('final'));

  // 1. Exact numbered midterms & final: each belongs to its own category, never to Exam Agreement
  if (isMidterm1) {
    const cat = categories.find((c) => {
      const cName = c.name.toLowerCase();
      return (
        !cName.includes('agreement') &&
        (cName.includes('midterm 1') ||
          cName.includes('midterm exam 1') ||
          (cName.includes('midterm') && cName.split(/[^a-z0-9]+/).includes('1')))
      );
    });
    if (cat) return cat;
  }

  if (isMidterm2) {
    const cat = categories.find((c) => {
      const cName = c.name.toLowerCase();
      return (
        !cName.includes('agreement') &&
        (cName.includes('midterm 2') ||
          cName.includes('midterm exam 2') ||
          (cName.includes('midterm') && cName.split(/[^a-z0-9]+/).includes('2')))
      );
    });
    if (cat) return cat;
  }

  if (isMidterm3) {
    const cat = categories.find((c) => {
      const cName = c.name.toLowerCase();
      return (
        !cName.includes('agreement') &&
        (cName.includes('midterm 3') ||
          cName.includes('midterm exam 3') ||
          (cName.includes('midterm') && cName.split(/[^a-z0-9]+/).includes('3')))
      );
    });
    if (cat) return cat;
  }

  if (isFinal) {
    const cat = categories.find((c) => {
      const cName = c.name.toLowerCase();
      return (
        !cName.includes('agreement') &&
        (cName.includes('final') ||
          cName.includes('final exam') ||
          cName.includes('final examination'))
      );
    });
    if (cat) return cat;
  }

  // 1.5 Clear match: if a deadline's title clearly matches a category name (e.g. "Exam Agreement 2" clearly matches "Exam Agreement")
  const cleanTitle = t.replace(/\b(no|num|number|#)?\s*\d+\b/gi, '').replace(/[^a-z0-9\s]/g, '').trim();

  for (const cat of categories) {
    const cName = cat.name.toLowerCase().trim();
    const cleanCatName = cName.replace(/\b(no|num|number|#)?\s*\d+\b/gi, '').replace(/[^a-z0-9\s]/g, '').trim();

    if (cName.includes('agreement') && !isAgreementItem) continue;

    // Exact match or cleaned title exact match (e.g. "Exam Agreement 2" cleaned is "exam agreement")
    if (t === cName || (cleanTitle && cleanCatName && cleanTitle === cleanCatName)) {
      return cat;
    }

    // Title clearly contains category name as phrase or prefix (e.g. "Exam Agreement 2" contains "Exam Agreement")
    if (cName.length >= 3 && (t.startsWith(cName) || t.includes(cName))) {
      return cat;
    }

    // Singular / Plural phrase match (e.g. "Quizzes" vs "Quiz 2", "Assignments" vs "Assignment 1")
    const singularCat = cName.replace(/ies$/, 'y').replace(/s$/, '');
    const singularTitle = t.replace(/ies$/, 'y').replace(/s$/, '');
    if (singularCat.length >= 3 && (t.includes(singularCat) || singularTitle.includes(singularCat))) {
      return cat;
    }
  }

  // 2. Generic single midterm (only when course has one midterm category)
  if (t.includes('midterm') && !isMidterm2 && !isMidterm3) {
    const cat = categories.find((c) => {
      const cName = c.name.toLowerCase();
      return (
        !cName.includes('agreement') &&
        cName.includes('midterm') &&
        !cName.includes('midterm 2') &&
        !cName.includes('midterm 3')
      );
    });
    if (cat) return cat;
  }

  // 3. Quiz matching: e.g. "Quiz 3" belongs to Quizzes
  if (t.includes('quiz')) {
    if (t.includes('reading')) {
      const readingCat = categories.find(
        (c) => c.name.toLowerCase().includes('reading') && c.name.toLowerCase().includes('quiz')
      );
      if (readingCat) return readingCat;
    }
    const cat = categories.find((c) => c.name.toLowerCase().includes('quiz'));
    if (cat) return cat;
  }

  // 4. Problem sets / Psets: e.g. "Problem Set 3" belongs to Problem Sets
  if (t.includes('problem set') || t.includes('pset')) {
    const cat = categories.find((c) => {
      const cName = c.name.toLowerCase();
      return cName.includes('problem set') || cName.includes('pset');
    });
    if (cat) return cat;
  }

  // 5. Programming assignments / Assignments: e.g. "Assignment 3" belongs to Programming Assignments
  if (t.includes('assignment')) {
    if (t.includes('programming') || t.includes('coding')) {
      const progCat = categories.find((c) => {
        const cName = c.name.toLowerCase();
        return (
          (cName.includes('programming') || cName.includes('coding')) &&
          cName.includes('assignment')
        );
      });
      if (progCat) return progCat;
    }
    const cat = categories.find((c) => c.name.toLowerCase().includes('assignment'));
    if (cat) return cat;
  }

  // 6. Paper / Research Paper: e.g. "Research Paper Topic" belongs to Research Paper
  if (t.includes('paper') || t.includes('essay')) {
    if (t.includes('research')) {
      const researchCat = categories.find(
        (c) =>
          c.name.toLowerCase().includes('research') &&
          (c.name.toLowerCase().includes('paper') || c.name.toLowerCase().includes('essay'))
      );
      if (researchCat) return researchCat;
    }
    const cat = categories.find(
      (c) => c.name.toLowerCase().includes('paper') || c.name.toLowerCase().includes('essay')
    );
    if (cat) return cat;
  }

  // 7. Project / Lab
  if (t.includes('project')) {
    const cat = categories.find((c) => c.name.toLowerCase().includes('project'));
    if (cat) return cat;
  }
  if (t.includes('lab')) {
    const cat = categories.find((c) => c.name.toLowerCase().includes('lab'));
    if (cat) return cat;
  }

  // 8. Exam Agreement: ONLY if item title explicitly mentions agreement
  if (isAgreementItem) {
    const cat = categories.find(
      (c) => c.name.toLowerCase().includes('agreement') || c.name.toLowerCase().includes('honor') || c.name.toLowerCase().includes('integrity')
    );
    if (cat) return cat;
  }

  // 9. Substantial substring / word match between title and category name
  for (const cat of categories) {
    const cName = cat.name.toLowerCase().trim();
    if (cName.length >= 3) {
      if (cName.includes('agreement') && !isAgreementItem) continue;
      const cWords = cName.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
      if (cWords.length > 0 && cWords.every((w) => tWords.includes(w))) {
        return cat;
      }
    }
  }

  // Deadlines that match no category stay unassigned
  return null;
}

export function getEffectiveCategoryId(
  deadline: Deadline,
  categories: GradedCategory[]
): string | null {
  if ((deadline as any).excludedFromGrading) {
    return null;
  }

  const categoryIds = new Set(categories.map((c) => c.id));

  // The student placed this item themselves (a category, or Unassigned). Never override it.
  if (deadline.categoryLocked) {
    return deadline.categoryId && categoryIds.has(deadline.categoryId) ? deadline.categoryId : null;
  }

  // If already assigned to a valid category in course
  if (deadline.categoryId && categoryIds.has(deadline.categoryId)) {
    const assignedCat = categories.find((c) => c.id === deadline.categoryId);
    if (assignedCat) {
      const isAgreementCat = assignedCat.name.toLowerCase().includes('agreement');
      const isAgreementTitle = deadline.title.toLowerCase().includes('agreement');
      // If it was wrongly assigned to an agreement category while being an exam or other item
      if (isAgreementCat && !isAgreementTitle) {
        const correctCat = matchTitleToCategory(deadline.title, categories);
        return correctCat ? correctCat.id : null;
      }
      return deadline.categoryId;
    }
  }

  // If a deadline's title clearly matches a category name (for example "Exam Agreement 2" and a category named Exam Agreement), assign it to that category instead of leaving it unassigned.
  const matched = matchTitleToCategory(deadline.title, categories);
  return matched ? matched.id : null;
}

function linkDeadlinesToCategories(course: Course): Course {
  const updatedDeadlines = course.deadlines.map((d) => {
    if ((d as any).excludedFromGrading) {
      return {
        ...d,
        categoryId: null,
        score: null,
      };
    }
    const effectiveCatId = getEffectiveCategoryId(d, course.categories);
    return {
      ...d,
      categoryId: effectiveCatId,
      score: d.score !== undefined ? d.score : null,
    };
  });

  return {
    ...course,
    deadlines: updatedDeadlines,
  };
}

function syncCourseData(course: Course): Course {
  const linked = linkDeadlinesToCategories(course);
  const updatedCategories = linked.categories.map((cat) => {
    const catItems = linked.deadlines.filter((d) => d.categoryId === cat.id);
    if (catItems.length > 0) {
      const graded = catItems.filter(
        (d) => d.score !== null && d.score !== undefined && !isNaN(Number(d.score))
      );
      const avg =
        graded.length > 0
          ? Math.round(
              (graded.reduce((s, it) => s + Number(it.score), 0) / graded.length) * 10
            ) / 10
          : null;
      return { ...cat, currentScore: avg };
    }
    return cat;
  });
  return { ...linked, categories: updatedCategories };
}

// Safe read from local storage on startup
function readLocalCoursesSafe(): Course[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(syncCourseData);
      }
    }
  } catch {}
  return [];
}

function readLocalPlansSafe(): AssignmentPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PLANS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return [];
}

function readLocalNotificationSettingsSafe(): NotificationSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as NotificationSettings;
      }
    }
  } catch {}
  return null;
}

function readLocalNotificationRulesSafe(): NotificationRule[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NOTIFICATION_RULES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as NotificationRule[];
      }
    }
  } catch {}
  return [];
}

export interface SafeSaveOptions {
  force?: boolean;
  allowDelete?: boolean;
}

/**
 * Strict data protection lock for local storage writes.
 * Prevents temporary, transitionary, or empty React states from accidentally overwriting
 * and wiping an existing, populated course database.
 */
function safeSaveCoursesToLocalStorage(coursesToSave: Course[], options?: SafeSaveOptions): boolean {
  if (typeof window === 'undefined') return false;
  if (!Array.isArray(coursesToSave)) {
    console.warn('[DataStore Protection Lock] Refused write: courses is not an array.');
    return false;
  }

  try {
    const existingRaw = localStorage.getItem(STORAGE_KEY);
    let existingCount = 0;
    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw);
        if (Array.isArray(parsed)) existingCount = parsed.length;
      } catch {}
    }

    // STRICT DATA PROTECTION LOCK:
    // 1. Never allow empty array [] to overwrite an existing populated course database
    // unless explicitly marked as a forced, deliberate clear (such as user account deletion).
    if (coursesToSave.length === 0 && existingCount > 0 && !options?.force) {
      console.warn(
        `[DataStore Protection Lock Active] Blocked attempt to overwrite populated course database (${existingCount} courses) with empty array. Data loss prevented.`
      );
      return false;
    }

    // 2. Prevent sudden catastrophic drop/truncation (e.g. partial component state with only 1 course)
    // unless explicitly flagged with allowDelete or force.
    if (
      existingCount > 1 &&
      coursesToSave.length < existingCount &&
      !options?.force &&
      !options?.allowDelete
    ) {
      console.warn(
        `[DataStore Protection Lock Active] Blocked attempt to truncate course database from ${existingCount} to ${coursesToSave.length} courses without deletion flag. Data loss prevented.`
      );
      return false;
    }

    // 3. Deep validation: ensure courses are well-formed objects with required fields
    const valid = coursesToSave.filter(
      (c) =>
        c &&
        typeof c.id === 'string' &&
        typeof c.name === 'string' &&
        Array.isArray(c.categories) &&
        Array.isArray(c.deadlines)
    );

    if (coursesToSave.length > 0 && valid.length !== coursesToSave.length && !options?.force) {
      console.warn('[DataStore Protection Lock] Blocked write: courses array contains invalid or malformed objects.');
      return false;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    return true;
  } catch (e) {
    console.warn('[DataStore Protection Lock] Error writing to localStorage:', e);
    return false;
  }
}

function safeSavePlansToLocalStorage(plansToSave: AssignmentPlan[], options?: SafeSaveOptions): boolean {
  if (typeof window === 'undefined') return false;
  if (!Array.isArray(plansToSave)) return false;

  try {
    const existingRaw = localStorage.getItem(PLANS_STORAGE_KEY);
    let existingCount = 0;
    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw);
        if (Array.isArray(parsed)) existingCount = parsed.length;
      } catch {}
    }

    if (plansToSave.length === 0 && existingCount > 0 && !options?.force) {
      console.warn(
        `[DataStore Protection Lock Active] Blocked attempt to overwrite populated plans database (${existingCount} plans) with empty array. Data loss prevented.`
      );
      return false;
    }

    if (
      existingCount > 1 &&
      plansToSave.length < existingCount &&
      !options?.force &&
      !options?.allowDelete
    ) {
      console.warn(
        `[DataStore Protection Lock Active] Blocked attempt to truncate plans database from ${existingCount} to ${plansToSave.length} plans without deletion flag. Data loss prevented.`
      );
      return false;
    }

    const valid = plansToSave.filter(
      (p) =>
        p &&
        typeof p.id === 'string' &&
        typeof p.title === 'string' &&
        Array.isArray(p.milestones)
    );

    if (plansToSave.length > 0 && valid.length !== plansToSave.length && !options?.force) {
      console.warn('[DataStore Protection Lock] Blocked write: plans array contains invalid objects.');
      return false;
    }

    localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(valid));
    return true;
  } catch (e) {
    console.warn('[DataStore Protection Lock] Error writing plans to localStorage:', e);
    return false;
  }
}

function safeSaveNotificationSettingsToLocalStorage(settings: NotificationSettings | null): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!settings) {
      localStorage.removeItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
      return true;
    }
    localStorage.setItem(NOTIFICATION_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (e) {
    console.warn('[DataStore Protection Lock] Error writing notification settings to localStorage:', e);
    return false;
  }
}

function safeSaveNotificationRulesToLocalStorage(rules: NotificationRule[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(NOTIFICATION_RULES_STORAGE_KEY, JSON.stringify(rules));
    return true;
  } catch (e) {
    console.warn('[DataStore Protection Lock] Error writing notification rules to localStorage:', e);
    return false;
  }
}

// True sequential asynchronous mutation queue to prevent race conditions
let mutationQueue: Promise<any> = Promise.resolve();

async function withCourseMutationLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = mutationQueue;
  let runResolver!: (val: T) => void;
  let runRejecter!: (err: any) => void;
  const runPromise = new Promise<T>((resolve, reject) => {
    runResolver = resolve;
    runRejecter = reject;
  });

  mutationQueue = (async () => {
    try {
      await previous;
    } catch {
      // Don't let previous failures block subsequent operations
    }
    try {
      const res = await fn();
      runResolver(res);
    } catch (err) {
      runRejecter(err);
    }
  })();

  return await runPromise;
}

let inMemoryCourses: Course[] = readLocalCoursesSafe();
let hasLoadedForUserId: string | null = null;
let inMemoryPlans: AssignmentPlan[] = readLocalPlansSafe();
let hasLoadedPlansForUserId: string | null = null;

let inMemoryNotificationSettings: NotificationSettings | null = readLocalNotificationSettingsSafe();
let hasLoadedNotificationSettingsForUserId: string | null = null;

let inMemoryNotificationRules: NotificationRule[] = readLocalNotificationRulesSafe();
let hasLoadedNotificationRulesForUserId: string | null = null;

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  phoneNumber: '',
  countryCode: 'US',
  isVerified: false,
  timeZone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles' : 'America/Los_Angeles',
  defaultReminderTime: '09:00',
  channel: 'sms',
  consent: false,
  consentGivenAt: null,
  updatedAt: new Date().toISOString(),
};

async function persistNotificationSettingsToFirestore(settings: NotificationSettings): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const path = `users/${userId}/notificationSettings/settings`;
  const docRef = doc(db, 'users', userId, 'notificationSettings', 'settings');
  const cleanDoc = JSON.parse(JSON.stringify(settings));

  try {
    await setDoc(docRef, cleanDoc);
    notifySaveError(null);
  } catch (err) {
    console.error('Failed to save notification settings to Firestore:', err);
    notifySaveError({
      message: 'Failed to save notification settings to cloud database.',
      retry: async () => {
        await persistNotificationSettingsToFirestore(settings);
      },
    });
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

async function loadNotificationSettingsForUser(userId: string): Promise<NotificationSettings> {
  const path = `users/${userId}/notificationSettings/settings`;
  try {
    const docRef = doc(db, 'users', userId, 'notificationSettings', 'settings');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      inMemoryNotificationSettings = snap.data() as NotificationSettings;
    } else {
      // If remote does not have document yet, check local storage before returning defaults
      const local = readLocalNotificationSettingsSafe();
      inMemoryNotificationSettings = local || { ...DEFAULT_NOTIFICATION_SETTINGS };
    }
    if (inMemoryNotificationSettings) {
      safeSaveNotificationSettingsToLocalStorage(inMemoryNotificationSettings);
    }
    hasLoadedNotificationSettingsForUserId = userId;
    notifySaveError(null);
    return inMemoryNotificationSettings;
  } catch (err) {
    console.warn('Failed to load notification settings from Firestore (falling back to local cache):', err);
    const local = readLocalNotificationSettingsSafe();
    if (local) {
      inMemoryNotificationSettings = local;
      hasLoadedNotificationSettingsForUserId = userId;
      return inMemoryNotificationSettings;
    }
    inMemoryNotificationSettings = inMemoryNotificationSettings || { ...DEFAULT_NOTIFICATION_SETTINGS };
    hasLoadedNotificationSettingsForUserId = userId;
    const isOffline = (err as any)?.code === 'unavailable' || String(err).includes('client is offline');
    if (!isOffline && (err as any)?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.GET, path);
    }
    return inMemoryNotificationSettings;
  }
}

async function persistNotificationRuleToFirestore(rule: NotificationRule): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const path = `users/${userId}/notificationRules/${rule.id}`;
  const docRef = doc(db, 'users', userId, 'notificationRules', rule.id);
  const cleanDoc = JSON.parse(JSON.stringify(rule));

  try {
    await setDoc(docRef, cleanDoc);
    notifySaveError(null);
  } catch (err) {
    console.error('Failed to save notification rule to Firestore:', err);
    notifySaveError({
      message: `Failed to save reminder rule "${rule.name}" to cloud database.`,
      retry: async () => {
        await persistNotificationRuleToFirestore(rule);
      },
    });
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

async function deleteNotificationRuleFromFirestore(ruleId: string): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const path = `users/${userId}/notificationRules/${ruleId}`;
  const docRef = doc(db, 'users', userId, 'notificationRules', ruleId);

  try {
    await deleteDoc(docRef);
    notifySaveError(null);
  } catch (err) {
    console.error('Failed to delete notification rule from Firestore:', err);
    notifySaveError({
      message: 'Failed to delete reminder rule from cloud database.',
      retry: async () => {
        await deleteNotificationRuleFromFirestore(ruleId);
      },
    });
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

async function loadNotificationRulesForUser(userId: string): Promise<NotificationRule[]> {
  const path = `users/${userId}/notificationRules`;
  try {
    const colRef = collection(db, 'users', userId, 'notificationRules');
    const snapshot = await getDocs(colRef);
    const loaded: NotificationRule[] = [];
    snapshot.forEach((d) => {
      loaded.push(d.data() as NotificationRule);
    });

    loaded.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    // Protection: If Firestore returned 0 rules, but local storage already has rules, keep local rules
    if (loaded.length === 0) {
      const local = readLocalNotificationRulesSafe();
      if (local.length > 0) {
        inMemoryNotificationRules = local;
        hasLoadedNotificationRulesForUserId = userId;
        notifySaveError(null);
        return inMemoryNotificationRules;
      }
    }

    inMemoryNotificationRules = loaded;
    if (loaded.length > 0) {
      safeSaveNotificationRulesToLocalStorage(loaded);
    }
    hasLoadedNotificationRulesForUserId = userId;
    notifySaveError(null);
    return inMemoryNotificationRules;
  } catch (err) {
    console.warn('Failed to load notification rules from Firestore (falling back to local cache):', err);
    const local = readLocalNotificationRulesSafe();
    if (local && local.length > 0) {
      inMemoryNotificationRules = local;
      hasLoadedNotificationRulesForUserId = userId;
      return inMemoryNotificationRules;
    }
    inMemoryNotificationRules = inMemoryNotificationRules || [];
    hasLoadedNotificationRulesForUserId = userId;
    const isOffline = (err as any)?.code === 'unavailable' || String(err).includes('client is offline');
    if (!isOffline && (err as any)?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.LIST, path);
    }
    return inMemoryNotificationRules;
  }
}

async function persistPushSettingsToFirestore(settings: PushSettings): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const path = `users/${userId}/pushSettings/settings`;
  const docRef = doc(db, 'users', userId, 'pushSettings', 'settings');
  const cleanDoc = JSON.parse(JSON.stringify(settings));

  try {
    await setDoc(docRef, cleanDoc);
    notifySaveError(null);
  } catch (err) {
    console.error('Failed to save push settings to Firestore:', err);
    notifySaveError({
      message: 'Failed to save push settings to cloud database.',
      retry: async () => {
        await persistPushSettingsToFirestore(settings);
      },
    });
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

async function loadPushSettingsForUser(userId: string): Promise<PushSettings> {
  const path = `users/${userId}/pushSettings/settings`;
  try {
    const docRef = doc(db, 'users', userId, 'pushSettings', 'settings');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      inMemoryPushSettings = snap.data() as PushSettings;
    } else {
      const local = readLocalPushSettingsSafe();
      inMemoryPushSettings = local || { ...DEFAULT_PUSH_SETTINGS };
    }
    if (inMemoryPushSettings) {
      safeSavePushSettingsToLocalStorage(inMemoryPushSettings);
    }
    hasLoadedPushSettingsForUserId = userId;
    notifySaveError(null);
    return inMemoryPushSettings;
  } catch (err) {
    console.warn('Failed to load push settings from Firestore (falling back to local cache):', err);
    const local = readLocalPushSettingsSafe();
    if (local) {
      inMemoryPushSettings = local;
      hasLoadedPushSettingsForUserId = userId;
      return inMemoryPushSettings;
    }
    inMemoryPushSettings = inMemoryPushSettings || { ...DEFAULT_PUSH_SETTINGS };
    hasLoadedPushSettingsForUserId = userId;
    return inMemoryPushSettings;
  }
}

async function persistPushRuleToFirestore(rule: PushRule): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const path = `users/${userId}/pushRules/${rule.id}`;
  const docRef = doc(db, 'users', userId, 'pushRules', rule.id);
  const cleanDoc = JSON.parse(JSON.stringify(rule));

  try {
    await setDoc(docRef, cleanDoc);
    notifySaveError(null);
  } catch (err) {
    console.error('Failed to save push rule to Firestore:', err);
    notifySaveError({
      message: `Failed to save push rule "${rule.name}" to cloud database.`,
      retry: async () => {
        await persistPushRuleToFirestore(rule);
      },
    });
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

async function deletePushRuleFromFirestore(ruleId: string): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const path = `users/${userId}/pushRules/${ruleId}`;
  const docRef = doc(db, 'users', userId, 'pushRules', ruleId);

  try {
    await deleteDoc(docRef);
    notifySaveError(null);
  } catch (err) {
    console.error('Failed to delete push rule from Firestore:', err);
    notifySaveError({
      message: 'Failed to delete push rule from cloud database.',
      retry: async () => {
        await deletePushRuleFromFirestore(ruleId);
      },
    });
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

async function loadPushRulesForUser(userId: string): Promise<PushRule[]> {
  const path = `users/${userId}/pushRules`;
  try {
    const colRef = collection(db, 'users', userId, 'pushRules');
    const snapshot = await getDocs(colRef);
    const loaded: PushRule[] = [];
    snapshot.forEach((d) => {
      loaded.push(d.data() as PushRule);
    });

    loaded.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    if (loaded.length === 0) {
      const local = readLocalPushRulesSafe();
      if (local.length > 0) {
        inMemoryPushRules = local;
        hasLoadedPushRulesForUserId = userId;
        notifySaveError(null);
        return inMemoryPushRules;
      }
    }

    inMemoryPushRules = loaded;
    if (loaded.length > 0) {
      safeSavePushRulesToLocalStorage(loaded);
    }
    hasLoadedPushRulesForUserId = userId;
    notifySaveError(null);
    return inMemoryPushRules;
  } catch (err) {
    console.warn('Failed to load push rules from Firestore (falling back to local cache):', err);
    const local = readLocalPushRulesSafe();
    if (local && local.length > 0) {
      inMemoryPushRules = local;
      hasLoadedPushRulesForUserId = userId;
      return inMemoryPushRules;
    }
    inMemoryPushRules = inMemoryPushRules || [];
    hasLoadedPushRulesForUserId = userId;
    return inMemoryPushRules;
  }
}

let saveErrorCallback: ((err: { message: string; retry: () => Promise<void> } | null) => void) | null = null;

export function onSaveError(callback: (err: { message: string; retry: () => Promise<void> } | null) => void) {
  saveErrorCallback = callback;
  return () => {
    saveErrorCallback = null;
  };
}

function notifySaveError(info: { message: string; retry: () => Promise<void> } | null) {
  if (saveErrorCallback) {
    saveErrorCallback(info);
  }
}

async function persistPlanToFirestore(plan: AssignmentPlan): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const path = `users/${userId}/plans/${plan.id}`;
  const docRef = doc(db, 'users', userId, 'plans', plan.id);
  const cleanDoc = JSON.parse(JSON.stringify(plan));

  try {
    await setDoc(docRef, cleanDoc);
    notifySaveError(null);
  } catch (err) {
    console.error('Failed to save plan to Firestore:', err);
    notifySaveError({
      message: `Failed to save roadmap "${plan.title}" to cloud database.`,
      retry: async () => {
        await persistPlanToFirestore(plan);
      },
    });
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

async function deletePlanFromFirestore(planId: string): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const path = `users/${userId}/plans/${planId}`;
  const docRef = doc(db, 'users', userId, 'plans', planId);

  try {
    await deleteDoc(docRef);
    notifySaveError(null);
  } catch (err) {
    console.error('Failed to delete plan from Firestore:', err);
    notifySaveError({
      message: 'Failed to delete roadmap from cloud database.',
      retry: async () => {
        await deletePlanFromFirestore(planId);
      },
    });
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

async function persistAllPlansToFirestore(plans: AssignmentPlan[]): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const path = `users/${userId}/plans`;
  try {
    const batch = writeBatch(db);
    plans.forEach((p) => {
      const docRef = doc(db, 'users', userId, 'plans', p.id);
      const cleanDoc = JSON.parse(JSON.stringify(p));
      batch.set(docRef, cleanDoc);
    });
    await batch.commit();
    notifySaveError(null);
  } catch (err) {
    console.error('Failed to persist all plans to Firestore:', err);
    notifySaveError({
      message: 'Failed to synchronize roadmaps to cloud database.',
      retry: async () => {
        await persistAllPlansToFirestore(plans);
      },
    });
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

async function loadPlansForUser(userId: string): Promise<AssignmentPlan[]> {
  const path = `users/${userId}/plans`;
  try {
    const colRef = collection(db, 'users', userId, 'plans');
    const snapshot = await getDocs(colRef);
    const loaded: AssignmentPlan[] = [];
    snapshot.forEach((d) => {
      loaded.push(d.data() as AssignmentPlan);
    });

    loaded.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    // STRICT PROTECTION: If Firestore returned 0 plans, but local storage already has plans,
    // preserve existing local plans instead of wiping memory cache!
    if (loaded.length === 0) {
      const local = readLocalPlansSafe();
      if (local.length > 0) {
        console.warn(`[DataStore] Firestore returned 0 plans, keeping ${local.length} existing local plans.`);
        inMemoryPlans = local;
        hasLoadedPlansForUserId = userId;
        notifySaveError(null);
        return inMemoryPlans;
      }
    }

    inMemoryPlans = loaded;
    if (loaded.length > 0) {
      safeSavePlansToLocalStorage(loaded);
    }
    hasLoadedPlansForUserId = userId;
    notifySaveError(null);
    return inMemoryPlans;
  } catch (err) {
    console.error('Failed to load plans from Firestore:', err);
    const local = readLocalPlansSafe();
    if (local.length > 0) {
      console.warn(`[DataStore] Falling back to ${local.length} locally saved plans due to Firestore error.`);
      inMemoryPlans = local;
      hasLoadedPlansForUserId = userId;
      return inMemoryPlans;
    }
    const isOffline = (err as any)?.code === 'unavailable' || String(err).includes('client is offline');
    if (!isOffline && (err as any)?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.LIST, path);
    }
    inMemoryPlans = inMemoryPlans || [];
    hasLoadedPlansForUserId = userId;
    return inMemoryPlans;
  }
}

async function persistCourseToFirestore(course: Course): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const path = `users/${userId}/courses/${course.id}`;
  const docRef = doc(db, 'users', userId, 'courses', course.id);
  const cleanDoc = JSON.parse(JSON.stringify(course));

  try {
    await setDoc(docRef, cleanDoc);
    notifySaveError(null);
  } catch (err) {
    console.error('Failed to save course to Firestore:', err);
    notifySaveError({
      message: `Failed to save "${course.name}" to cloud database.`,
      retry: async () => {
        await persistCourseToFirestore(course);
      },
    });
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

async function deleteCourseFromFirestore(courseId: string): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const path = `users/${userId}/courses/${courseId}`;
  const docRef = doc(db, 'users', userId, 'courses', courseId);

  try {
    await deleteDoc(docRef);
    notifySaveError(null);
  } catch (err) {
    console.error('Failed to delete course from Firestore:', err);
    notifySaveError({
      message: 'Failed to delete course from cloud database.',
      retry: async () => {
        await deleteCourseFromFirestore(courseId);
      },
    });
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

async function persistAllCoursesToFirestore(courses: Course[]): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const path = `users/${userId}/courses`;
  try {
    const batch = writeBatch(db);
    courses.forEach((c, idx) => {
      const docRef = doc(db, 'users', userId, 'courses', c.id);
      const cleanDoc = JSON.parse(JSON.stringify({ ...c, order: idx }));
      batch.set(docRef, cleanDoc);
    });
    await batch.commit();
    notifySaveError(null);
  } catch (err) {
    console.error('Failed to persist all courses to Firestore:', err);
    notifySaveError({
      message: 'Failed to synchronize courses to cloud database.',
      retry: async () => {
        await persistAllCoursesToFirestore(courses);
      },
    });
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

async function loadCoursesForUser(userId: string): Promise<Course[]> {
  const path = `users/${userId}/courses`;
  try {
    const colRef = collection(db, 'users', userId, 'courses');
    const snapshot = await getDocs(colRef);
    const loaded: Course[] = [];
    snapshot.forEach((d) => {
      loaded.push(d.data() as Course);
    });

    // Run existing data cleanup on load
    const cleaned = loaded.map(syncCourseData);

    // Sort by order if present
    cleaned.sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : 0;
      const orderB = typeof b.order === 'number' ? b.order : 0;
      return orderA - orderB;
    });

    // STRICT PROTECTION: If Firestore returned 0 courses, but local storage already has populated courses,
    // do NOT wipe in-memory cache or local storage!
    if (cleaned.length === 0) {
      const local = readLocalCoursesSafe();
      if (local.length > 0) {
        console.warn(`[DataStore] Firestore returned 0 courses, protecting and keeping ${local.length} local courses.`);
        inMemoryCourses = local;
        hasLoadedForUserId = userId;
        notifySaveError(null);
        return inMemoryCourses;
      }
    }

    inMemoryCourses = cleaned;
    if (cleaned.length > 0) {
      safeSaveCoursesToLocalStorage(cleaned);
    }
    hasLoadedForUserId = userId;
    notifySaveError(null);
    return inMemoryCourses;
  } catch (err) {
    console.error('Failed to load courses from Firestore:', err);
    const local = readLocalCoursesSafe();
    if (local.length > 0) {
      console.warn(`[DataStore] Falling back to ${local.length} locally saved courses due to Firestore error.`);
      inMemoryCourses = local;
      hasLoadedForUserId = userId;
      return inMemoryCourses;
    }
    const isOffline = (err as any)?.code === 'unavailable' || String(err).includes('client is offline');
    if (!isOffline && (err as any)?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.LIST, path);
    }
    inMemoryCourses = inMemoryCourses || [];
    hasLoadedForUserId = userId;
    return inMemoryCourses;
  }
}

function loadFromStorage(): Course[] {
  if (inMemoryCourses.length === 0) {
    const local = readLocalCoursesSafe();
    if (local.length > 0) {
      inMemoryCourses = local;
    }
  }
  return inMemoryCourses;
}

function persistToStorage(
  courses: Course[],
  modifiedCourse?: Course,
  options?: SafeSaveOptions
): boolean {
  const saveSuccess = safeSaveCoursesToLocalStorage(courses, options);
  if (!saveSuccess && !options?.force) {
    console.warn('[DataStore] Refused to update in-memory cache because safeSaveCoursesToLocalStorage rejected the write.');
    const existing = readLocalCoursesSafe();
    if (existing.length > 0) {
      inMemoryCourses = existing;
    }
    return false;
  }

  inMemoryCourses = courses;
  if (modifiedCourse) {
    persistCourseToFirestore(modifiedCourse).catch(() => {});
  } else {
    persistAllCoursesToFirestore(courses).catch(() => {});
  }
  return true;
}

/**
 * DataStore module:
 * Abstracts all persistence operations with fast in-memory cache and automatic Firestore sync.
 */
export const dataStore = {
  /**
   * Load courses for signed in user from Firestore and keep in memory
   */
  async loadCoursesForUser(userId: string): Promise<Course[]> {
    return await loadCoursesForUser(userId);
  },

  /**
   * Clear in-memory courses on sign out
   */
  clearUserCourses(): void {
    inMemoryCourses = [];
    hasLoadedForUserId = null;
    notifySaveError(null);
  },

  /**
   * Load roadmaps for signed in user from Firestore and keep in memory
   */
  async loadPlansForUser(userId: string): Promise<AssignmentPlan[]> {
    return await loadPlansForUser(userId);
  },

  /**
   * Clear in-memory plans on sign out
   */
  clearUserPlans(): void {
    inMemoryPlans = [];
    hasLoadedPlansForUserId = null;
    notifySaveError(null);
  },

  /**
   * Load notification settings for signed in user
   */
  async loadNotificationSettingsForUser(userId: string): Promise<NotificationSettings> {
    return await loadNotificationSettingsForUser(userId);
  },

  /**
   * Get notification settings
   */
  async getNotificationSettings(): Promise<NotificationSettings> {
    const currentUid = auth.currentUser?.uid;
    if (currentUid && hasLoadedNotificationSettingsForUserId !== currentUid) {
      return await loadNotificationSettingsForUser(currentUid);
    }
    return inMemoryNotificationSettings || { ...DEFAULT_NOTIFICATION_SETTINGS };
  },

  /**
   * Save notification settings
   */
  async saveNotificationSettings(settingsUpdate: Partial<NotificationSettings>): Promise<NotificationSettings> {
    const current = await this.getNotificationSettings();
    const updated: NotificationSettings = {
      ...current,
      ...settingsUpdate,
      updatedAt: new Date().toISOString(),
    };
    inMemoryNotificationSettings = updated;
    safeSaveNotificationSettingsToLocalStorage(updated);
    await persistNotificationSettingsToFirestore(updated);
    return updated;
  },

  /**
   * Load reminder rules for signed in user
   */
  async loadNotificationRulesForUser(userId: string): Promise<NotificationRule[]> {
    return await loadNotificationRulesForUser(userId);
  },

  /**
   * Get reminder rules
   */
  async getNotificationRules(): Promise<NotificationRule[]> {
    const currentUid = auth.currentUser?.uid;
    if (currentUid && hasLoadedNotificationRulesForUserId !== currentUid) {
      return await loadNotificationRulesForUser(currentUid);
    }
    return inMemoryNotificationRules;
  },

  /**
   * Save (create or update) a reminder rule
   */
  async saveNotificationRule(
    ruleInput: Partial<NotificationRule> & {
      name: string;
      scope: NotificationRuleScope;
      leadTimes: ReminderLeadTime[];
    }
  ): Promise<NotificationRule> {
    const rules = [...inMemoryNotificationRules];
    const now = new Date().toISOString();

    const ruleId = ruleInput.id || `rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const existingIndex = rules.findIndex((r) => r.id === ruleId);

    const ruleToSave: NotificationRule = {
      id: ruleId,
      name: ruleInput.name.trim(),
      enabled: ruleInput.enabled ?? true,
      scope: ruleInput.scope,
      leadTimes: ruleInput.leadTimes,
      customReminderTime: ruleInput.customReminderTime || null,
      createdAt: ruleInput.createdAt || now,
      updatedAt: now,
    };

    if (existingIndex !== -1) {
      rules[existingIndex] = ruleToSave;
    } else {
      rules.unshift(ruleToSave);
    }

    inMemoryNotificationRules = rules;
    safeSaveNotificationRulesToLocalStorage(rules);
    await persistNotificationRuleToFirestore(ruleToSave);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notification-rules-updated'));
    }

    return ruleToSave;
  },

  /**
   * Delete a reminder rule
   */
  async deleteNotificationRule(ruleId: string): Promise<boolean> {
    const rules = inMemoryNotificationRules;
    const filtered = rules.filter((r) => r.id !== ruleId);
    if (filtered.length !== rules.length) {
      inMemoryNotificationRules = filtered;
      safeSaveNotificationRulesToLocalStorage(filtered);
      await deleteNotificationRuleFromFirestore(ruleId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notification-rules-updated'));
      }
      return true;
    }
    return false;
  },

  /**
   * Toggle a reminder rule enabled state
   */
  async toggleNotificationRuleEnabled(ruleId: string, enabled: boolean): Promise<NotificationRule | null> {
    const rules = [...inMemoryNotificationRules];
    const index = rules.findIndex((r) => r.id === ruleId);
    if (index === -1) return null;

    const rule = { ...rules[index], enabled, updatedAt: new Date().toISOString() };
    rules[index] = rule;
    inMemoryNotificationRules = rules;
    safeSaveNotificationRulesToLocalStorage(rules);
    await persistNotificationRuleToFirestore(rule);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notification-rules-updated'));
    }

    return rule;
  },

  /**
   * Clear user notification caches on sign out
   */
  clearUserNotificationData(): void {
    inMemoryNotificationSettings = null;
    hasLoadedNotificationSettingsForUserId = null;
    inMemoryNotificationRules = [];
    hasLoadedNotificationRulesForUserId = null;
    inMemoryPushSettings = null;
    hasLoadedPushSettingsForUserId = null;
    inMemoryPushRules = [];
    hasLoadedPushRulesForUserId = null;
  },

  /**
   * Load push settings for signed in user
   */
  async loadPushSettingsForUser(userId: string): Promise<PushSettings> {
    return await loadPushSettingsForUser(userId);
  },

  /**
   * Get push settings
   */
  async getPushSettings(): Promise<PushSettings> {
    const currentUid = auth.currentUser?.uid;
    if (currentUid && hasLoadedPushSettingsForUserId !== currentUid) {
      return await loadPushSettingsForUser(currentUid);
    }
    return inMemoryPushSettings || { ...DEFAULT_PUSH_SETTINGS };
  },

  /**
   * Save push settings
   */
  async savePushSettings(settingsUpdate: Partial<PushSettings>): Promise<PushSettings> {
    const current = await this.getPushSettings();
    const updated: PushSettings = {
      ...current,
      ...settingsUpdate,
      updatedAt: new Date().toISOString(),
    };
    inMemoryPushSettings = updated;
    safeSavePushSettingsToLocalStorage(updated);
    await persistPushSettingsToFirestore(updated);
    return updated;
  },

  /**
   * Load push reminder rules for signed in user
   */
  async loadPushRulesForUser(userId: string): Promise<PushRule[]> {
    return await loadPushRulesForUser(userId);
  },

  /**
   * Get push reminder rules
   */
  async getPushRules(): Promise<PushRule[]> {
    const currentUid = auth.currentUser?.uid;
    if (currentUid && hasLoadedPushRulesForUserId !== currentUid) {
      return await loadPushRulesForUser(currentUid);
    }
    return inMemoryPushRules;
  },

  /**
   * Save (create or update) a push reminder rule
   */
  async savePushRule(
    ruleInput: Partial<PushRule> & {
      name: string;
      scope: NotificationRuleScope;
      leadTimes: ReminderLeadTime[];
    }
  ): Promise<PushRule> {
    const rules = [...inMemoryPushRules];
    const now = new Date().toISOString();

    const ruleId = ruleInput.id || `push-rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const existingIndex = rules.findIndex((r) => r.id === ruleId);

    const ruleToSave: PushRule = {
      id: ruleId,
      name: ruleInput.name.trim(),
      enabled: ruleInput.enabled ?? true,
      scope: ruleInput.scope,
      leadTimes: ruleInput.leadTimes,
      customReminderTime: ruleInput.customReminderTime || null,
      createdAt: ruleInput.createdAt || now,
      updatedAt: now,
    };

    if (existingIndex !== -1) {
      rules[existingIndex] = ruleToSave;
    } else {
      rules.unshift(ruleToSave);
    }

    inMemoryPushRules = rules;
    safeSavePushRulesToLocalStorage(rules);
    await persistPushRuleToFirestore(ruleToSave);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('push-rules-updated'));
    }

    return ruleToSave;
  },

  /**
   * Delete a push reminder rule
   */
  async deletePushRule(ruleId: string): Promise<boolean> {
    const rules = inMemoryPushRules;
    const filtered = rules.filter((r) => r.id !== ruleId);
    if (filtered.length !== rules.length) {
      inMemoryPushRules = filtered;
      safeSavePushRulesToLocalStorage(filtered);
      await deletePushRuleFromFirestore(ruleId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('push-rules-updated'));
      }
      return true;
    }
    return false;
  },

  /**
   * Toggle a push reminder rule enabled state
   */
  async togglePushRuleEnabled(ruleId: string, enabled: boolean): Promise<PushRule | null> {
    const rules = [...inMemoryPushRules];
    const index = rules.findIndex((r) => r.id === ruleId);
    if (index === -1) return null;

    const rule = { ...rules[index], enabled, updatedAt: new Date().toISOString() };
    rules[index] = rule;
    inMemoryPushRules = rules;
    safeSavePushRulesToLocalStorage(rules);
    await persistPushRuleToFirestore(rule);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('push-rules-updated'));
    }

    return rule;
  },

  /**
   * Save push token for the signed-in user
   */
  async savePushToken(token: string): Promise<void> {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    const docId = getPushTokenDocId(token);
    const path = `users/${userId}/pushTokens/${docId}`;
    const docRef = doc(db, 'users', userId, 'pushTokens', docId);
    const tokenRecord: PushTokenRecord = {
      token,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await setDoc(docRef, tokenRecord);
      notifySaveError(null);
    } catch (err) {
      console.error('Failed to save push token to Firestore:', err);
      notifySaveError({
        message: 'Failed to save push token to cloud database.',
        retry: async () => {
          await this.savePushToken(token);
        },
      });
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  /**
   * Remove push token for the signed-in user
   */
  async removePushToken(token: string): Promise<void> {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    const docId = getPushTokenDocId(token);
    const path = `users/${userId}/pushTokens/${docId}`;
    const docRef = doc(db, 'users', userId, 'pushTokens', docId);
    try {
      await deleteDoc(docRef);
      notifySaveError(null);
    } catch (err) {
      console.error('Failed to remove push token from Firestore:', err);
      notifySaveError({
        message: 'Failed to remove push token from cloud database.',
        retry: async () => {
          await this.removePushToken(token);
        },
      });
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  /**
   * Get push notification preferences for the signed-in user
   */
  async getPushPreferences(): Promise<PushPreferences> {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      return readLocalPushPreferencesSafe() || { ...DEFAULT_PUSH_PREFERENCES };
    }
    const path = `users/${userId}/pushPreferences/preferences`;
    try {
      const docRef = doc(db, 'users', userId, 'pushPreferences', 'preferences');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as PushPreferences;
        safeSavePushPreferencesToLocalStorage(data);
        notifySaveError(null);
        return data;
      }
      const local = readLocalPushPreferencesSafe();
      return local || { ...DEFAULT_PUSH_PREFERENCES };
    } catch (err) {
      console.warn('Failed to load push preferences from Firestore (falling back to local cache):', err);
      const local = readLocalPushPreferencesSafe();
      return local || { ...DEFAULT_PUSH_PREFERENCES };
    }
  },

  /**
   * Save push notification preferences for the signed-in user
   */
  async savePushPreferences(prefsUpdate: Partial<PushPreferences>): Promise<PushPreferences> {
    const current = await this.getPushPreferences();
    const updated: PushPreferences = {
      ...current,
      ...prefsUpdate,
      updatedAt: new Date().toISOString(),
    };
    safeSavePushPreferencesToLocalStorage(updated);

    const userId = auth.currentUser?.uid;
    if (userId) {
      const path = `users/${userId}/pushPreferences/preferences`;
      const docRef = doc(db, 'users', userId, 'pushPreferences', 'preferences');
      try {
        await setDoc(docRef, updated);
        notifySaveError(null);
      } catch (err) {
        console.error('Failed to save push preferences to Firestore:', err);
        notifySaveError({
          message: 'Failed to save push preferences to cloud database.',
          retry: async () => {
            await this.savePushPreferences(prefsUpdate);
          },
        });
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    }
    return updated;
  },

  /**
   * Subscribe to Firestore save errors with retry callback
   */
  onSaveError(callback: (err: { message: string; retry: () => Promise<void> } | null) => void) {
    return onSaveError(callback);
  },

  /**
   * Await any active in-flight course mutations to ensure synchronization stability
   */
  async awaitCourseStabilization(): Promise<void> {
    try {
      await mutationQueue;
    } catch {}
  },

  /**
   * Retrieve all saved courses from in-memory cache or safe local storage
   */
  async getCourses(): Promise<Course[]> {
    const currentUid = auth.currentUser?.uid;
    if (currentUid && hasLoadedForUserId !== currentUid) {
      return await loadCoursesForUser(currentUid);
    }
    if (inMemoryCourses.length === 0) {
      const local = readLocalCoursesSafe();
      if (local.length > 0) {
        inMemoryCourses = local;
      }
    }
    return [...inMemoryCourses];
  },

  /**
   * Retrieve single course by ID
   */
  async getCourse(id: string): Promise<Course | null> {
    const courses = loadFromStorage();
    return courses.find((c) => c.id === id) || null;
  },

  /**
   * Create or update a course safely with mutation lock and local storage data protection
   */
  async saveCourse(
    courseInput: Partial<Course> & {
      name: string;
      categories: GradedCategory[];
      deadlines: Deadline[];
    }
  ): Promise<Course> {
    return await withCourseMutationLock(async () => {
      const courses = [...loadFromStorage()];
      const now = new Date().toISOString();

      if (courseInput.id) {
        // Update existing course
        const index = courses.findIndex((c) => c.id === courseInput.id);
        if (index !== -1) {
          const existing = courses[index];
          const prevById = new Map(existing.deadlines.map((x) => [x.id, x]));
          const updatedCourse: Course = {
            ...existing,
            ...courseInput,
            categories: courseInput.categories.map((c, i) => ({
              id: c.id || `cat-${Date.now()}-${i}`,
              name: c.name.trim(),
              weight: c.weight !== null && !isNaN(Number(c.weight)) ? Number(c.weight) : null,
              description: c.description || null,
            })),
            deadlines: courseInput.deadlines.map((d, i) => {
              const prev = prevById.get(d.id);
              return {
                id: d.id || `dl-${Date.now()}-${i}`,
                title: d.title.trim(),
                date: d.date ? d.date.trim() : null,
                dateStatus: d.dateStatus !== undefined ? d.dateStatus : prev?.dateStatus,
                dateEnd: d.dateEnd !== undefined ? (d.dateEnd ? d.dateEnd.trim() : null) : (prev?.dateEnd ? prev.dateEnd.trim() : null),
                dateEvidence: d.dateEvidence !== undefined ? (d.dateEvidence ? d.dateEvidence.trim() : null) : (prev?.dateEvidence ?? null),
                type: d.type || 'homework',
                weight: d.weight !== null && !isNaN(Number(d.weight)) ? Number(d.weight) : null,
                completed: d.completed ?? false,
                calendarEventId: d.calendarEventId !== undefined ? d.calendarEventId : prev?.calendarEventId,
                // Grading data: use what was passed in, otherwise keep what is already saved for this deadline
                score: d.score !== undefined
                  ? (d.score !== null && !isNaN(Number(d.score)) ? Number(d.score) : null)
                  : (prev?.score ?? null),
                categoryId: d.categoryId !== undefined ? (d.categoryId || null) : (prev?.categoryId ?? null),
                ...((d.categoryLocked ?? prev?.categoryLocked) ? { categoryLocked: true } : {}),
                ...((d.excludedFromGrading ?? prev?.excludedFromGrading) ? { excludedFromGrading: true } : {}),
              };
            }),
            updatedAt: now,
          };
          courses[index] = updatedCourse;
          persistToStorage(courses, updatedCourse);
          return updatedCourse;
        }
      }

      // Create new course
      const newCourseId = `course-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newCourse: Course = {
        id: newCourseId,
        name: courseInput.name.trim(),
        code: courseInput.code?.trim() || null,
        instructor: courseInput.instructor?.trim() || null,
        term: courseInput.term?.trim() || null,
        color: courseInput.color || getRandomColor(),
        rawSyllabus: courseInput.rawSyllabus || undefined,
        order: courses.length,
        categories: courseInput.categories.map((c, i) => ({
          id: c.id || `cat-${Date.now()}-${i}`,
          name: c.name.trim(),
          weight: c.weight !== null && !isNaN(Number(c.weight)) ? Number(c.weight) : null,
          description: c.description || null,
        })),
        deadlines: courseInput.deadlines.map((d, i) => ({
          id: d.id || `dl-${Date.now()}-${i}`,
          title: d.title.trim(),
          date: d.date ? d.date.trim() : null,
          dateStatus: d.dateStatus,
          dateEnd: d.dateEnd ? d.dateEnd.trim() : null,
          dateEvidence: d.dateEvidence ? d.dateEvidence.trim() : null,
          type: d.type || 'homework',
          weight: d.weight !== null && !isNaN(Number(d.weight)) ? Number(d.weight) : null,
          completed: false,
          calendarEventId: d.calendarEventId,
          score: d.score !== undefined ? (d.score !== null && !isNaN(Number(d.score)) ? Number(d.score) : null) : null,
          categoryId: d.categoryId || null,
          ...(d.categoryLocked ? { categoryLocked: true } : {}),
          ...((d as any).excludedFromGrading ? { excludedFromGrading: true } : {}),
        })),
        notes: courseInput.notes || null,
        createdAt: now,
        updatedAt: now,
      };

      courses.unshift(newCourse);
      persistToStorage(courses, newCourse);
      return newCourse;
    });
  },

  /**
   * Set an exact date for a previously ambiguous/missing deadline
   */
  async setDeadlineDate(courseId: string, deadlineId: string, date: string): Promise<Course | null> {
    return await withCourseMutationLock(async () => {
      const courses = [...loadFromStorage()];
      const courseIndex = courses.findIndex((c) => c.id === courseId);
      if (courseIndex === -1) return null;

      const existingCourse = courses[courseIndex];
      const cleanDate = date ? date.trim() : null;
      const updatedDeadlines = existingCourse.deadlines.map((d) =>
        d.id === deadlineId
          ? {
              ...d,
              date: cleanDate,
              dateStatus: (cleanDate ? 'exact' : 'missing') as DateStatus,
              dateEnd: null,
            }
          : { ...d }
      );

      const updatedCourse: Course = {
        ...existingCourse,
        deadlines: updatedDeadlines,
        updatedAt: new Date().toISOString(),
      };
      courses[courseIndex] = updatedCourse;
      persistToStorage(courses, updatedCourse);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('courses-updated'));
      }

      return updatedCourse;
    });
  },

  /**
   * Delete a course by ID safely with mutation lock
   */
  async deleteCourse(id: string): Promise<boolean> {
    return await withCourseMutationLock(async () => {
      const courses = loadFromStorage();
      const filtered = courses.filter((c) => c.id !== id);
      if (filtered.length !== courses.length) {
        inMemoryCourses = filtered;
        persistToStorage(filtered, undefined, { force: filtered.length === 0, allowDelete: true });
        await deleteCourseFromFirestore(id);
        return true;
      }
      return false;
    });
  },

  /**
   * Toggle completion state of a deadline within a course safely with mutation lock
   */
  async toggleDeadlineCompleted(courseId: string, deadlineId: string): Promise<Course | null> {
    return await withCourseMutationLock(async () => {
      const courses = [...loadFromStorage()];
      const courseIndex = courses.findIndex((c) => c.id === courseId);
      if (courseIndex === -1) return null;

      const existingCourse = courses[courseIndex];
      const updatedDeadlines = existingCourse.deadlines.map((d) =>
        d.id === deadlineId ? { ...d, completed: !d.completed } : { ...d }
      );

      const updatedCourse: Course = {
        ...existingCourse,
        deadlines: updatedDeadlines,
        updatedAt: new Date().toISOString(),
      };
      courses[courseIndex] = updatedCourse;
      persistToStorage(courses, updatedCourse);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('courses-updated'));
      }

      return updatedCourse;
    });
  },

  /**
   * Update category scores, item scores, and target grade for a course
   */
  async updateCourseGrades(
    courseId: string,
    targetGrade: number | null,
    categoryScores: Record<string, number | null>,
    itemScores?: Record<string, number | null>
  ): Promise<Course | null> {
    const courses = loadFromStorage();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return null;

    const course = courses[courseIndex];
    course.targetGrade = targetGrade !== null && !isNaN(targetGrade) ? targetGrade : null;

    // Update individual item scores if provided
    if (itemScores) {
      course.deadlines = course.deadlines.map((d) => {
        if (d.id in itemScores) {
          const val = itemScores[d.id];
          return {
            ...d,
            score: val !== undefined ? (val !== null && !isNaN(val) ? val : null) : (d.score ?? null),
          };
        }
        return d;
      });
    }

    // Update category scores: compute from items if items exist, otherwise use direct score
    course.categories = course.categories.map((cat) => {
      const items = course.deadlines.filter((d) => d.categoryId === cat.id);
      if (items.length > 0) {
        const graded = items.filter(
          (d) => d.score !== null && d.score !== undefined && !isNaN(Number(d.score))
        );
        const avg =
          graded.length > 0
            ? Math.round(
                (graded.reduce((s, it) => s + Number(it.score), 0) / graded.length) * 10
              ) / 10
            : null;
        return { ...cat, currentScore: avg };
      }
      const score = categoryScores[cat.id];
      return {
        ...cat,
        currentScore: score !== undefined ? (score !== null && !isNaN(score) ? score : null) : (cat.currentScore ?? null),
      };
    });

    course.updatedAt = new Date().toISOString();
    courses[courseIndex] = course;
    persistToStorage(courses);
    return course;
  },

  /**
   * Update a whole-category score directly (when category has no individual items)
   */
  async updateCategoryScore(
    courseId: string,
    categoryId: string,
    score: number | null
  ): Promise<Course | null> {
    const courses = loadFromStorage();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return null;

    const course = courses[courseIndex];
    const validScore = score !== null && !isNaN(score) ? score : null;
    course.categories = course.categories.map((cat) =>
      cat.id === categoryId ? { ...cat, currentScore: validScore } : cat
    );

    course.updatedAt = new Date().toISOString();
    courses[courseIndex] = course;
    persistToStorage(courses);
    return course;
  },

  /**
   * Add a new item to a category within a course
   */
  async addCategoryItem(
    courseId: string,
    categoryId: string,
    itemData: { title: string; score?: number | null; type?: DeadlineType }
  ): Promise<Course | null> {
    const courses = loadFromStorage();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return null;

    const course = courses[courseIndex];
    const category = course.categories.find((c) => c.id === categoryId);

    // Inferred type
    let inferredType: DeadlineType = itemData.type || 'homework';
    if (!itemData.type && category) {
      const cName = category.name.toLowerCase();
      if (cName.includes('quiz')) inferredType = 'quiz';
      else if (cName.includes('paper') || cName.includes('essay')) inferredType = 'paper';
      else if (cName.includes('exam') || cName.includes('test') || cName.includes('midterm') || cName.includes('final')) inferredType = 'exam';
      else if (cName.includes('project') || cName.includes('lab')) inferredType = 'project';
    }

    const newItem: Deadline = {
      id: `dl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: itemData.title.trim() || 'New Item',
      type: inferredType,
      date: null,
      weight: null,
      completed: false,
      score:
        itemData.score !== undefined && itemData.score !== null && !isNaN(Number(itemData.score))
          ? Number(itemData.score)
          : null,
      categoryId,
      categoryLocked: true,
    };

    course.deadlines.push(newItem);

    // Sync parent category currentScore
    if (category) {
      const catItems = course.deadlines.filter((d) => d.categoryId === categoryId);
      const graded = catItems.filter(
        (d) => d.score !== null && d.score !== undefined && !isNaN(Number(d.score))
      );
      category.currentScore =
        graded.length > 0
          ? Math.round(
              (graded.reduce((s, it) => s + Number(it.score), 0) / graded.length) * 10
            ) / 10
          : null;
    }

    course.updatedAt = new Date().toISOString();
    courses[courseIndex] = course;
    persistToStorage(courses);
    return course;
  },

  /**
   * Update an item's title, score, or category in a course
   */
  async updateCategoryItem(
    courseId: string,
    itemId: string,
    updates: { title?: string; score?: number | null; categoryId?: string | null }
  ): Promise<Course | null> {
    const courses = loadFromStorage();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return null;

    const course = courses[courseIndex];
    const deadlineIndex = course.deadlines.findIndex((d) => d.id === itemId);
    if (deadlineIndex === -1) return null;

    const current = course.deadlines[deadlineIndex];
    const prevCategoryId = current.categoryId;
    const newCategoryId =
      updates.categoryId !== undefined ? updates.categoryId : current.categoryId;

    const updatedScore =
      updates.score !== undefined
        ? updates.score !== null && !isNaN(Number(updates.score))
          ? Number(updates.score)
          : null
        : current.score ?? null;

    course.deadlines[deadlineIndex] = {
      ...current,
      title: updates.title !== undefined ? updates.title.trim() : current.title,
      score: updatedScore,
      categoryId: newCategoryId,
      ...(updates.categoryId !== undefined ? { categoryLocked: true } : {}),
    };

    // Re-sync category scores for affected categories
    const categoriesToSync = new Set<string>();
    if (prevCategoryId) categoriesToSync.add(prevCategoryId);
    if (newCategoryId) categoriesToSync.add(newCategoryId);

    course.categories = course.categories.map((cat) => {
      if (categoriesToSync.has(cat.id)) {
        const catItems = course.deadlines.filter((d) => d.categoryId === cat.id);
        if (catItems.length > 0) {
          const graded = catItems.filter(
            (d) => d.score !== null && d.score !== undefined && !isNaN(Number(d.score))
          );
          const avg =
            graded.length > 0
              ? Math.round(
                  (graded.reduce((s, it) => s + Number(it.score), 0) / graded.length) * 10
                ) / 10
              : null;
          return { ...cat, currentScore: avg };
        }
      }
      return cat;
    });

    course.updatedAt = new Date().toISOString();
    courses[courseIndex] = course;
    persistToStorage(courses);
    return course;
  },

  /**
   * Move an item to a different category (or unassigned if newCategoryId is null)
   */
  async moveCategoryItem(
    courseId: string,
    itemId: string,
    newCategoryId: string | null
  ): Promise<Course | null> {
    return this.updateCategoryItem(courseId, itemId, { categoryId: newCategoryId });
  },

  /**
   * Remove an item from a category:
   * Removing an item only removes it from grading. It does not delete the deadline from the course or the calendar.
   * When an item is removed, the remaining items in that category share the category weight equally.
   */
  async removeCategoryItem(
    courseId: string,
    itemId: string
  ): Promise<Course | null> {
    const courses = loadFromStorage();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return null;

    const course = courses[courseIndex];

    // Removing an item only removes it from grading. It does not delete the deadline from the course or the calendar.
    course.deadlines = course.deadlines.map((d) =>
      d.id === itemId
        ? {
            ...d,
            categoryId: null,
            score: null,
            ...({ excludedFromGrading: true } as any),
          }
        : d
    );

    const synced = syncCourseData(course);
    synced.updatedAt = new Date().toISOString();
    courses[courseIndex] = synced;
    persistToStorage(courses);
    return synced;
  },

  /**
   * Assign an unassigned deadline to a category
   */
  async assignDeadlineToCategory(
    courseId: string,
    deadlineId: string,
    categoryId: string
  ): Promise<Course | null> {
    const courses = loadFromStorage();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return null;

    const course = courses[courseIndex];
    const dlIndex = course.deadlines.findIndex((d) => d.id === deadlineId);
    if (dlIndex === -1) return null;

    course.deadlines[dlIndex] = {
      ...course.deadlines[dlIndex],
      categoryId,
      categoryLocked: true,
      ...({ excludedFromGrading: false } as any),
    };

    const synced = syncCourseData(course);
    synced.updatedAt = new Date().toISOString();
    courses[courseIndex] = synced;
    persistToStorage(courses);
    return synced;
  },

  /**
   * Exclude an unassigned deadline from grading (hides it without deleting deadline)
   */
  async excludeDeadlineFromGrading(
    courseId: string,
    deadlineId: string
  ): Promise<Course | null> {
    const courses = loadFromStorage();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return null;

    const course = courses[courseIndex];
    const dlIndex = course.deadlines.findIndex((d) => d.id === deadlineId);
    if (dlIndex === -1) return null;

    course.deadlines[dlIndex] = {
      ...course.deadlines[dlIndex],
      categoryId: null,
      score: null,
      ...({ excludedFromGrading: true } as any),
    };

    const synced = syncCourseData(course);
    synced.updatedAt = new Date().toISOString();
    courses[courseIndex] = synced;
    persistToStorage(courses);
    return synced;
  },

  /**
   * Restore an excluded deadline
   */
  async restoreExcludedDeadline(
    courseId: string,
    deadlineId: string
  ): Promise<Course | null> {
    const courses = loadFromStorage();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return null;

    const course = courses[courseIndex];
    const dlIndex = course.deadlines.findIndex((d) => d.id === deadlineId);
    if (dlIndex === -1) return null;

    const dl = course.deadlines[dlIndex];
    (dl as any).excludedFromGrading = false;
    dl.categoryLocked = false;
    const effectiveCatId = getEffectiveCategoryId(dl, course.categories);
    dl.categoryId = effectiveCatId;

    course.deadlines[dlIndex] = dl;

    const synced = syncCourseData(course);
    synced.updatedAt = new Date().toISOString();
    courses[courseIndex] = synced;
    persistToStorage(courses);
    return synced;
  },

  /**
   * Delete a deadline permanently from the course
   */
  async deleteDeadline(
    courseId: string,
    deadlineId: string
  ): Promise<Course | null> {
    const courses = loadFromStorage();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return null;

    const course = courses[courseIndex];
    const dlToDelete = course.deadlines.find((d) => d.id === deadlineId);
    course.deadlines = course.deadlines.filter((d) => d.id !== deadlineId);

    const synced = syncCourseData(course);
    synced.updatedAt = new Date().toISOString();
    courses[courseIndex] = synced;
    persistToStorage(courses);

    if (dlToDelete?.calendarEventId) {
      calendarSyncService.deleteDeadlineEvent(dlToDelete.calendarEventId).catch(() => {});
    }

    return synced;
  },

  /**
   * Add a category (name and weight) to a course
   */
  async addCategory(
    courseId: string,
    categoryData: { name: string; weight: number | null; description?: string | null }
  ): Promise<Course | null> {
    const courses = loadFromStorage();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return null;

    const course = courses[courseIndex];
    const newCatId = `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const weightVal =
      categoryData.weight !== null && categoryData.weight !== undefined && !isNaN(Number(categoryData.weight))
        ? Math.min(100, Math.max(0, Number(categoryData.weight)))
        : null;

    const newCategory: GradedCategory = {
      id: newCatId,
      name: categoryData.name.trim() || 'New Category',
      weight: weightVal,
      description: categoryData.description?.trim() || null,
      currentScore: null,
    };

    course.categories.push(newCategory);
    course.updatedAt = new Date().toISOString();
    courses[courseIndex] = course;
    persistToStorage(courses);
    return course;
  },

  /**
   * Rename a category, update its weight, or description
   */
  async updateCategory(
    courseId: string,
    categoryId: string,
    updates: { name?: string; weight?: number | null; description?: string | null }
  ): Promise<Course | null> {
    const courses = loadFromStorage();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return null;

    const course = courses[courseIndex];
    const catIndex = course.categories.findIndex((c) => c.id === categoryId);
    if (catIndex === -1) return null;

    const currentCat = course.categories[catIndex];
    const newName = updates.name !== undefined ? updates.name.trim() : currentCat.name;
    const newWeight =
      updates.weight !== undefined
        ? updates.weight !== null && !isNaN(Number(updates.weight))
          ? Math.min(100, Math.max(0, Number(updates.weight)))
          : null
        : currentCat.weight;

    course.categories[catIndex] = {
      ...currentCat,
      name: newName,
      weight: newWeight,
      description: updates.description !== undefined ? updates.description : currentCat.description,
    };

    course.updatedAt = new Date().toISOString();
    courses[courseIndex] = course;
    persistToStorage(courses);
    return course;
  },

  /**
   * Delete a category and unassign its items from grading
   */
  async deleteCategory(courseId: string, categoryId: string): Promise<Course | null> {
    const courses = loadFromStorage();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return null;

    const course = courses[courseIndex];
    course.categories = course.categories.filter((c) => c.id !== categoryId);

    // Unassign deadlines that belonged to this category (remove from grading, but keep deadline in course/calendar)
    course.deadlines = course.deadlines.map((d) =>
      d.categoryId === categoryId ? { ...d, categoryId: null, score: null } : d
    );

    course.updatedAt = new Date().toISOString();
    courses[courseIndex] = course;
    persistToStorage(courses);
    return course;
  },

  /**
   * Reorder categories of a course and save the order
   */
  async reorderCategories(courseId: string, orderedCategoryIds: string[]): Promise<Course | null> {
    const courses = loadFromStorage();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return null;

    const course = courses[courseIndex];
    const catMap = new Map(course.categories.map((c) => [c.id, c]));

    const reordered: GradedCategory[] = [];
    orderedCategoryIds.forEach((id) => {
      const cat = catMap.get(id);
      if (cat) {
        reordered.push(cat);
        catMap.delete(id);
      }
    });
    // Append any remaining categories not in orderedCategoryIds
    catMap.forEach((cat) => reordered.push(cat));

    course.categories = reordered;
    course.updatedAt = new Date().toISOString();
    courses[courseIndex] = course;
    persistToStorage(courses);
    return course;
  },

  /**
   * Reset data to the sample college courses (empty for student accounts)
   */
  async resetToSampleData(): Promise<Course[]> {
    const userId = auth.currentUser?.uid;
    if (userId) {
      for (const course of inMemoryCourses) {
        await deleteCourseFromFirestore(course.id);
      }
    }
    inMemoryCourses = [];
    return [];
  },

  /**
   * Retrieve all saved assignment plans from in-memory cache or Firestore
   */
  async getPlans(): Promise<AssignmentPlan[]> {
    const currentUid = auth.currentUser?.uid;
    if (currentUid && hasLoadedPlansForUserId !== currentUid) {
      return await loadPlansForUser(currentUid);
    }
    return inMemoryPlans;
  },

  /**
   * Retrieve a single plan by ID
   */
  async getPlan(id: string): Promise<AssignmentPlan | null> {
    const plans = await this.getPlans();
    return plans.find((p) => p.id === id) || null;
  },

  /**
   * Save (create or update) an assignment plan in memory and sync to Firestore
   */
  async savePlan(planInput: AssignmentPlan): Promise<AssignmentPlan> {
    const plans = [...inMemoryPlans];
    const now = new Date().toISOString();
    const existingIndex = plans.findIndex((p) => p.id === planInput.id);

    const planToSave: AssignmentPlan = {
      ...planInput,
      updatedAt: now,
      createdAt: planInput.createdAt || now,
    };

    if (existingIndex !== -1) {
      plans[existingIndex] = planToSave;
    } else {
      plans.unshift(planToSave);
    }

    inMemoryPlans = plans;
    safeSavePlansToLocalStorage(plans);
    await persistPlanToFirestore(planToSave);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plans-updated'));
    }

    return planToSave;
  },

  /**
   * Delete an assignment plan by ID from memory and Firestore
   */
  async deletePlan(id: string): Promise<boolean> {
    const plans = inMemoryPlans;
    const filtered = plans.filter((p) => p.id !== id);
    if (filtered.length !== plans.length) {
      inMemoryPlans = filtered;
      safeSavePlansToLocalStorage(filtered, { force: filtered.length === 0, allowDelete: true });
      await deletePlanFromFirestore(id);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('plans-updated'));
      }
      return true;
    }
    return false;
  },

  /**
   * Toggle a milestone completed state in a plan and sync to Firestore
   */
  async toggleMilestone(planId: string, milestoneId: string): Promise<AssignmentPlan | null> {
    const plans = [...inMemoryPlans];
    const planIndex = plans.findIndex((p) => p.id === planId);
    if (planIndex === -1) return null;

    const plan = { ...plans[planIndex] };
    plan.milestones = plan.milestones.map((m) =>
      m.id === milestoneId ? { ...m, completed: !m.completed } : m
    );
    plan.updatedAt = new Date().toISOString();
    plans[planIndex] = plan;
    inMemoryPlans = plans;

    await persistPlanToFirestore(plan);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plans-updated'));
    }

    return plan;
  },

  /**
   * Retrieve legacy data saved in this browser before signing in
   */
  getBrowserSavedData(): { courses: Course[]; plans: AssignmentPlan[] } {
    let courses: Course[] = [];
    let plans: AssignmentPlan[] = [];
    try {
      const rawCourses = localStorage.getItem(STORAGE_KEY);
      if (rawCourses) {
        const parsed = JSON.parse(rawCourses);
        if (Array.isArray(parsed)) {
          courses = parsed.map(syncCourseData);
        }
      }
    } catch (e) {
      console.error('Error reading browser courses:', e);
    }

    try {
      const rawPlans = localStorage.getItem(PLANS_STORAGE_KEY);
      if (rawPlans) {
        const parsed = JSON.parse(rawPlans);
        if (Array.isArray(parsed)) {
          plans = parsed;
        }
      }
    } catch (e) {
      console.error('Error reading browser plans:', e);
    }

    return { courses, plans };
  },

  /**
   * Import legacy browser data into the signed-in student's account.
   * Copies the data into the account and does not delete the browser copy.
   */
  async importBrowserDataToAccount(): Promise<{
    courses: Course[];
    plans: AssignmentPlan[];
    stats: {
      addedCourses: number;
      skippedCourses: number;
      addedPlans: number;
      skippedPlans: number;
    };
  }> {
    const { courses: bCourses, plans: bPlans } = this.getBrowserSavedData();
    return await this.restoreAddMissing(bCourses, bPlans);
  },

  /**
   * Create complete backup object of user data from the signed-in account
   */
  async createBackup(): Promise<{
    app: string;
    appIdentifier: string;
    version: number;
    exportedAt: string;
    courses: Course[];
    plans: AssignmentPlan[];
    storage: Record<string, string>;
  }> {
    const courses = await this.getCourses();
    const plans = await this.getPlans();

    // Capture user data storage keys (strictly exclude theme preference)
    const storageData: Record<string, string> = {};
    try {
      const coursesRaw = localStorage.getItem(STORAGE_KEY);
      storageData[STORAGE_KEY] = coursesRaw || JSON.stringify(courses);

      const plansRaw = localStorage.getItem(PLANS_STORAGE_KEY);
      storageData[PLANS_STORAGE_KEY] = plansRaw || JSON.stringify(plans);
    } catch (e) {
      console.error('Error reading localStorage for backup:', e);
    }

    return {
      app: 'semester-command-center',
      appIdentifier: 'semester-command-center',
      version: 1,
      exportedAt: new Date().toISOString(),
      courses,
      plans,
      storage: storageData,
    };
  },

  /**
   * Restore by replacing all current data in the signed-in account with backup data
   */
  async restoreReplace(
    coursesToRestore: Course[],
    plansToRestore: AssignmentPlan[]
  ): Promise<{ courses: Course[]; plans: AssignmentPlan[] }> {
    return await withCourseMutationLock(async () => {
      const userId = auth.currentUser?.uid;
      const cleanedCourses = coursesToRestore.map(syncCourseData);

      if (userId) {
        // Delete previous courses not in restored list
        const prevCourses = inMemoryCourses;
        const newCourseIds = new Set(cleanedCourses.map((c) => c.id));
        for (const prev of prevCourses) {
          if (!newCourseIds.has(prev.id)) {
            await deleteCourseFromFirestore(prev.id);
          }
        }

        // Delete previous plans not in restored list
        const prevPlans = inMemoryPlans;
        const newPlanIds = new Set(plansToRestore.map((p) => p.id));
        for (const prev of prevPlans) {
          if (!newPlanIds.has(prev.id)) {
            await deletePlanFromFirestore(prev.id);
          }
        }

        // Persist all new courses and plans into Firestore
        await persistAllCoursesToFirestore(cleanedCourses);
        await persistAllPlansToFirestore(plansToRestore);
      }

      inMemoryCourses = cleanedCourses;
      inMemoryPlans = plansToRestore;

      // Safe write to local storage with explicit force for user backup replacement
      safeSaveCoursesToLocalStorage(cleanedCourses, { force: true });
      safeSavePlansToLocalStorage(plansToRestore, { force: true });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('plans-updated'));
      }

      return {
        courses: cleanedCourses,
        plans: plansToRestore,
      };
    });
  },

  /**
   * Restore by adding only what's missing to the signed-in account (keeps existing items unchanged)
   */
  async restoreAddMissing(
    coursesToRestore: Course[],
    plansToRestore: AssignmentPlan[]
  ): Promise<{
    courses: Course[];
    plans: AssignmentPlan[];
    stats: {
      addedCourses: number;
      skippedCourses: number;
      addedPlans: number;
      skippedPlans: number;
    };
  }> {
    return await withCourseMutationLock(async () => {
      const currentCourses = loadFromStorage();
      const currentPlans = inMemoryPlans.length > 0 ? inMemoryPlans : readLocalPlansSafe();

      const existingCourseIds = new Set(currentCourses.map((c) => c.id));
      const existingPlanIds = new Set(currentPlans.map((p) => p.id));

      const coursesToAdd = coursesToRestore
        .filter((c) => !existingCourseIds.has(c.id))
        .map(syncCourseData);
      const skippedCourses = coursesToRestore.length - coursesToAdd.length;

      const plansToAdd = plansToRestore.filter((p) => !existingPlanIds.has(p.id));
      const skippedPlans = plansToRestore.length - plansToAdd.length;

      const mergedCourses = [...currentCourses, ...coursesToAdd];
      const mergedPlans = [...currentPlans, ...plansToAdd];

      inMemoryCourses = mergedCourses;
      inMemoryPlans = mergedPlans;

      safeSaveCoursesToLocalStorage(mergedCourses, { force: true });
      safeSavePlansToLocalStorage(mergedPlans, { force: true });

      // Save only newly added items to Firestore
      for (const course of coursesToAdd) {
        await persistCourseToFirestore(course);
      }
      for (const plan of plansToAdd) {
        await persistPlanToFirestore(plan);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('plans-updated'));
      }

      return {
        courses: mergedCourses,
        plans: mergedPlans,
        stats: {
          addedCourses: coursesToAdd.length,
          skippedCourses,
          addedPlans: plansToAdd.length,
          skippedPlans,
        },
      };
    });
  },

  /**
   * Safely update calendar event IDs on existing courses in dataStore
   * without risk of dropping courses or deadlines
   */
  async updateCoursesWithCalendarEvents(updatedCourses: Course[]): Promise<void> {
    if (!Array.isArray(updatedCourses) || updatedCourses.length === 0) return;
    return await withCourseMutationLock(async () => {
      const current = loadFromStorage();
      if (current.length === 0) return;

      const updatedMap = new Map(updatedCourses.map((c) => [c.id, c]));
      const merged = current.map((c) => {
        const u = updatedMap.get(c.id);
        if (!u) return c;
        const dlMap = new Map(u.deadlines.map((d) => [d.id, d]));
        const mergedDeadlines = c.deadlines.map((d) => {
          const ud = dlMap.get(d.id);
          return ud && ud.calendarEventId ? { ...d, calendarEventId: ud.calendarEventId } : d;
        });
        return { ...c, deadlines: mergedDeadlines };
      });

      persistToStorage(merged);
    });
  },

  /**
   * Delete all of the student's data from Firestore (courses, plans, notification rules, notification settings, and user doc)
   */
  async deleteAllUserData(userId: string): Promise<void> {
    return await withCourseMutationLock(async () => {
      const coursesPath = `users/${userId}/courses`;
      const plansPath = `users/${userId}/plans`;

      try {
        // 1. Delete all course documents
        const coursesSnap = await getDocs(collection(db, 'users', userId, 'courses'));
        for (const d of coursesSnap.docs) {
          await deleteDoc(doc(db, 'users', userId, 'courses', d.id));
        }

        // 2. Delete all plan documents
        const plansSnap = await getDocs(collection(db, 'users', userId, 'plans'));
        for (const d of plansSnap.docs) {
          await deleteDoc(doc(db, 'users', userId, 'plans', d.id));
        }

        // 3. Delete all notification rules
        try {
          const rulesSnap = await getDocs(collection(db, 'users', userId, 'notificationRules'));
          for (const d of rulesSnap.docs) {
            await deleteDoc(doc(db, 'users', userId, 'notificationRules', d.id));
          }
        } catch (err) {
          console.error('Failed to delete notification rules from Firestore:', err);
        }

        // 4. Delete notification settings
        try {
          await deleteDoc(doc(db, 'users', userId, 'notificationSettings', 'settings'));
        } catch (err) {
          console.error('Failed to delete notification settings from Firestore:', err);
        }

        // 4b. Delete push tokens & push preferences
        try {
          const pushTokensSnap = await getDocs(collection(db, 'users', userId, 'pushTokens'));
          for (const d of pushTokensSnap.docs) {
            await deleteDoc(doc(db, 'users', userId, 'pushTokens', d.id));
          }
        } catch (err) {
          console.error('Failed to delete push tokens from Firestore:', err);
        }
        try {
          await deleteDoc(doc(db, 'users', userId, 'pushPreferences', 'preferences'));
        } catch (err) {
          console.error('Failed to delete push preferences from Firestore:', err);
        }
        try {
          const pushRulesSnap = await getDocs(collection(db, 'users', userId, 'pushRules'));
          for (const d of pushRulesSnap.docs) {
            await deleteDoc(doc(db, 'users', userId, 'pushRules', d.id));
          }
        } catch (err) {
          console.error('Failed to delete push rules from Firestore:', err);
        }
        try {
          await deleteDoc(doc(db, 'users', userId, 'pushSettings', 'settings'));
        } catch (err) {
          console.error('Failed to delete push settings from Firestore:', err);
        }

        // 5. Delete user document if present
        try {
          await deleteDoc(doc(db, 'users', userId));
        } catch {
          // Ignored if user doc was not explicitly created
        }

        inMemoryCourses = [];
        inMemoryPlans = [];
        hasLoadedForUserId = null;
        hasLoadedPlansForUserId = null;
        safeSaveCoursesToLocalStorage([], { force: true });
        safeSavePlansToLocalStorage([], { force: true });
        this.clearUserNotificationData();
      } catch (err) {
        console.error('Failed to delete student data from Firestore:', err);
        handleFirestoreError(err, OperationType.DELETE, coursesPath);
        throw err;
      }
    });
  },

  /**
   * Saves an exam prep study guide or practice question set under the signed-in user's Firestore path:
   * /users/{userId}/examPreps/{prepId}
   */
  async saveExamPrep(prep: ExamPrepData): Promise<void> {
    const userId = auth.currentUser?.uid;
    const sanitizedId = prep.id.replace(/[^a-zA-Z0-9_\-.]/g, '_');
    const safePrep: ExamPrepData = {
      ...prep,
      id: sanitizedId,
      updatedAt: new Date().toISOString(),
    };

    // Save to local storage for fast cached access
    try {
      const stored = localStorage.getItem(EXAM_PREPS_STORAGE_KEY);
      const allPreps: Record<string, ExamPrepData> = stored ? JSON.parse(stored) : {};
      allPreps[safePrep.id] = safePrep;
      localStorage.setItem(EXAM_PREPS_STORAGE_KEY, JSON.stringify(allPreps));
    } catch {
      // LocalStorage error non-fatal
    }

    if (!userId) return;

    const path = `users/${userId}/examPreps/${safePrep.id}`;
    try {
      await setDoc(doc(db, 'users', userId, 'examPreps', safePrep.id), safePrep);
    } catch (err) {
      console.error('Failed to save exam prep to Firestore:', err);
      handleFirestoreError(err, OperationType.WRITE, path);
      throw err;
    }
  },

  /**
   * Retrieves a single saved exam prep by ID
   */
  async getExamPrep(prepId: string): Promise<ExamPrepData | null> {
    const sanitizedId = prepId.replace(/[^a-zA-Z0-9_\-.]/g, '_');
    const userId = auth.currentUser?.uid;

    if (!userId) {
      try {
        const stored = localStorage.getItem(EXAM_PREPS_STORAGE_KEY);
        if (stored) {
          const allPreps: Record<string, ExamPrepData> = JSON.parse(stored);
          return allPreps[sanitizedId] || null;
        }
      } catch {
        return null;
      }
      return null;
    }

    const path = `users/${userId}/examPreps/${sanitizedId}`;
    try {
      const snap = await getDoc(doc(db, 'users', userId, 'examPreps', sanitizedId));
      if (snap.exists()) {
        const data = snap.data() as ExamPrepData;
        return data;
      }
      // Fallback to local storage if Firestore doc doesn't exist yet
      const stored = localStorage.getItem(EXAM_PREPS_STORAGE_KEY);
      if (stored) {
        const allPreps: Record<string, ExamPrepData> = JSON.parse(stored);
        return allPreps[sanitizedId] || null;
      }
      return null;
    } catch (err) {
      console.error('Failed to load exam prep from Firestore:', err);
      handleFirestoreError(err, OperationType.GET, path);
      return null;
    }
  },

  /**
   * Loads all saved exam preps for the signed-in user, mapped by prepId
   */
  async getAllExamPreps(): Promise<Record<string, ExamPrepData>> {
    const userId = auth.currentUser?.uid;
    const map: Record<string, ExamPrepData> = {};

    // Seed with local storage
    try {
      const stored = localStorage.getItem(EXAM_PREPS_STORAGE_KEY);
      if (stored) {
        Object.assign(map, JSON.parse(stored));
      }
    } catch {
      // Ignore
    }

    if (!userId) return map;

    const path = `users/${userId}/examPreps`;
    try {
      const snap = await getDocs(collection(db, 'users', userId, 'examPreps'));
      snap.forEach((d) => {
        const data = d.data() as ExamPrepData;
        map[data.id] = data;
      });

      // Update local storage cache
      try {
        localStorage.setItem(EXAM_PREPS_STORAGE_KEY, JSON.stringify(map));
      } catch {
        // Ignore
      }
      return map;
    } catch (err) {
      console.error('Failed to load all exam preps from Firestore:', err);
      handleFirestoreError(err, OperationType.GET, path);
      return map;
    }
  },
};

// Register dataStore stabilization hooks with calendarSyncService to prevent async race conditions
registerDataStoreHooks({
  awaitStabilization: async () => {
    await dataStore.awaitCourseStabilization();
  },
  getCourses: async () => {
    return await dataStore.getCourses();
  },
});