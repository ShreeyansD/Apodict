import React, { useState, useMemo } from 'react';
import { 
  GraduationCap,
  
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  TrendingUp, 
  Target, 
  Award, 
  ChevronRight, 
  Loader2, 
  BookOpen, 
  Plus, 
  Flame, 
  ArrowRight,
  ShieldAlert,
  Percent,
  Compass,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  RotateCcw,
  X
} from 'lucide-react';
import { Course, GradedCategory, Deadline, GradeFocusAnalysis } from '../types/academic';
import { dataStore, getEffectiveCategoryId } from '../services/dataStore';
import { geminiClient } from '../services/geminiClient';

interface GradesProps {
  courses: Course[];
  onOpenAddCourse: () => void;
  onCoursesUpdated: (updatedCourses: Course[]) => void;
}

export interface CalculatedCategoryItem {
  id: string;
  title: string;
  score: number | null;
  itemWeight: number; // equal share of category weight
  isGraded: boolean;
}

export interface CalculatedCategory {
  category: GradedCategory;
  items: CalculatedCategoryItem[];
  hasItems: boolean;
  itemWeight: number;
  gradedCount: number;
  ungradedCount: number;
  currentScore: number | null; // average of graded items, or cat.currentScore if no items
  gradedWeight: number; // based on how many items are graded
  remainingWeight: number;
  pointsEarned: number;
}

interface CourseGradeCalculation {
  courseId: string;
  courseName: string;
  courseCode: string | null;
  courseColor: string;
  targetGrade: number;
  totalWeight: number;
  isWeightValid: boolean;
  weightDifference: number;
  gradedWeight: number;
  remainingWeight: number;
  pointsEarnedSoFar: number;
  currentWeightedGrade: number | null;
  maxPossibleGrade: number;
  pointsNeeded: number;
  status: 'secured' | 'out_of_reach' | 'achievable' | 'no_grades' | 'invalid_weights';
  neededScoreOnRemaining: number | null;
}

/**
 * Filter items belonging to a category from the course's saved deadlines:
 * An item belongs to a category only when its title clearly matches the category name.
 * Do not assign deadlines to a category based on type alone.
 */
export function getCategoryItems(course: Course, categoryId: string): Deadline[] {
  const cat = course.categories.find((c) => c.id === categoryId);
  if (!cat) return [];

  return course.deadlines.filter((d) => {
    if ((d as any).excludedFromGrading) return false;
    const effectiveCatId = getEffectiveCategoryId(d, course.categories);
    return effectiveCatId === categoryId;
  });
}

/**
 * Deadlines that match no category stay unassigned
 */
export function getUnassignedItems(course: Course): Deadline[] {
  return course.deadlines.filter((d) => {
    if ((d as any).excludedFromGrading) return false;
    const effectiveCatId = getEffectiveCategoryId(d, course.categories);
    return effectiveCatId === null;
  });
}

/**
 * Deadlines excluded from grading
 */
export function getExcludedItems(course: Course): Deadline[] {
  return course.deadlines.filter((d) => (d as any).excludedFromGrading === true);
}

/**
 * Compute calculations for a category:
 * - Weights are always percentage points from 0 to 100 (a weight of 1 means 1%, not 100%)
 * - Equal share of category weight for each item
 * - Current score as average of graded items
 * - Graded and remaining weight based on how many items are graded
 * - A category with no matching items is graded as a single score
 */
export function calculateCategory(course: Course, cat: GradedCategory): CalculatedCategory {
  const items = getCategoryItems(course, cat.id);
  const catWeight =
    typeof cat.weight === 'number' && !isNaN(cat.weight)
      ? cat.weight
      : 0;

  if (items.length > 0) {
    const itemWeight = catWeight / items.length;
    const calculatedItems: CalculatedCategoryItem[] = items.map((it) => {
      const score =
        it.score !== undefined && it.score !== null && !isNaN(Number(it.score))
          ? Number(it.score)
          : null;
      return {
        id: it.id,
        title: it.title,
        score,
        itemWeight,
        isGraded: score !== null,
      };
    });

    const gradedItems = calculatedItems.filter((it) => it.isGraded);
    const gradedCount = gradedItems.length;
    const ungradedCount = calculatedItems.length - gradedCount;

    // Category's current score is average of its graded items
    const currentScore =
      gradedCount > 0
        ? gradedItems.reduce((sum, it) => sum + (it.score ?? 0), 0) / gradedCount
        : null;

    // Graded and remaining weight for the category based on how many items are graded
    const gradedWeight = (gradedCount / items.length) * catWeight;
    const remainingWeight = (ungradedCount / items.length) * catWeight;

    // Points earned toward final grade
    const pointsEarned = gradedItems.reduce(
      (sum, it) => sum + ((it.score ?? 0) / 100) * itemWeight,
      0
    );

    return {
      category: cat,
      items: calculatedItems,
      hasItems: true,
      itemWeight,
      gradedCount,
      ungradedCount,
      currentScore,
      gradedWeight,
      remainingWeight,
      pointsEarned,
    };
  } else {
    // A category with no items still allows a single score for the whole category
    const score =
      typeof cat.currentScore === 'number' && !isNaN(cat.currentScore) ? cat.currentScore : null;
    const isGraded = score !== null;
    const gradedWeight = isGraded ? catWeight : 0;
    const remainingWeight = isGraded ? 0 : catWeight;
    const pointsEarned = isGraded ? (score / 100) * catWeight : 0;

    return {
      category: cat,
      items: [],
      hasItems: false,
      itemWeight: catWeight,
      gradedCount: isGraded ? 1 : 0,
      ungradedCount: isGraded ? 0 : 1,
      currentScore: score,
      gradedWeight,
      remainingWeight,
      pointsEarned,
    };
  }
}

export const Grades: React.FC<GradesProps> = ({
  courses,
  onOpenAddCourse,
  onCoursesUpdated,
}) => {
  // Local state for focus advice modal / drawer
  const [activeCourseId, setActiveCourseId] = useState<string | null>(
    courses.length > 0 ? courses[0].id : null
  );
  const [isAnalyzingFocus, setIsAnalyzingFocus] = useState(false);
  const [focusAnalysis, setFocusAnalysis] = useState<{ [courseId: string]: GradeFocusAnalysis }>({});
  const [focusError, setFocusError] = useState<{ [courseId: string]: string | null }>({});
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [editingTitles, setEditingTitles] = useState<Record<string, string>>({});

  // Category management states
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatWeight, setNewCatWeight] = useState('');
  const [editingCategoryNames, setEditingCategoryNames] = useState<Record<string, string>>({});
  const [editingCategoryWeights, setEditingCategoryWeights] = useState<Record<string, string>>({});
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [deletingDeadlineId, setDeletingDeadlineId] = useState<string | null>(null);

  // Drag and drop states
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverCatIdForItems, setDragOverCatIdForItems] = useState<string | null>(null);

  // If no courses exist, show friendly prompt
  if (!courses || courses.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto shadow-lg shadow-indigo-500/10">
          <GraduationCap className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            No courses in your Course Center yet
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            The Grades tab calculates your current standing and determines the exact score needed on remaining work to reach your target final grade.
          </p>
        </div>
        <div className="pt-2">
          <button
            onClick={onOpenAddCourse}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Course from Syllabus</span>
          </button>
        </div>
      </div>
    );
  }

  // Exact arithmetic in JavaScript for all courses
  const calculations: Record<string, CourseGradeCalculation> = useMemo(() => {
    const map: Record<string, CourseGradeCalculation> = {};

    courses.forEach((c) => {
      const target = typeof c.targetGrade === 'number' && !isNaN(c.targetGrade) ? c.targetGrade : 90;
      let rawTotalWeight = 0;
      let gradedWeight = 0;
      let remainingWeight = 0;
      let pointsEarnedSoFar = 0;

      c.categories.forEach((cat) => {
        const catCalc = calculateCategory(c, cat);
        const weight =
          typeof cat.weight === 'number' && !isNaN(cat.weight)
            ? cat.weight
            : 0;
        rawTotalWeight += weight;
        gradedWeight += catCalc.gradedWeight;
        remainingWeight += catCalc.remainingWeight;
        pointsEarnedSoFar += catCalc.pointsEarned;
      });

      const totalWeight = Math.round(rawTotalWeight * 100) / 100;
      const isWeightValid = totalWeight === 100;
      const weightDifference = Math.round((100 - totalWeight) * 100) / 100;

      const currentWeightedGrade =
        gradedWeight > 0 ? (pointsEarnedSoFar / gradedWeight) * 100 : null;
      const maxPossibleGrade = pointsEarnedSoFar + remainingWeight;
      const pointsNeeded = target - pointsEarnedSoFar;

      let status: 'secured' | 'out_of_reach' | 'achievable' | 'no_grades' | 'invalid_weights' = 'achievable';
      let neededScoreOnRemaining: number | null = null;

      // While the total is not 100%, do not show the required average or the Secured, Achievable, or Out of Reach status for that course
      if (!isWeightValid) {
        status = 'invalid_weights';
        neededScoreOnRemaining = null;
      } else if (gradedWeight === 0) {
        status = 'no_grades';
        neededScoreOnRemaining = (target / 100) * 100;
      } else if (pointsEarnedSoFar >= target) {
        status = 'secured';
        neededScoreOnRemaining = 0;
      } else if (remainingWeight === 0) {
        status = 'out_of_reach';
        neededScoreOnRemaining = null;
      } else {
        const needed = (pointsNeeded / remainingWeight) * 100;
        if (needed > 100) {
          status = 'out_of_reach';
          neededScoreOnRemaining = needed;
        } else {
          status = 'achievable';
          neededScoreOnRemaining = Math.max(0, needed);
        }
      }

      map[c.id] = {
        courseId: c.id,
        courseName: c.name,
        courseCode: c.code || null,
        courseColor: c.color || '#3B82F6',
        targetGrade: target,
        totalWeight,
        isWeightValid,
        weightDifference,
        gradedWeight,
        remainingWeight,
        pointsEarnedSoFar,
        currentWeightedGrade,
        maxPossibleGrade,
        pointsNeeded,
        status,
        neededScoreOnRemaining,
      };
    });

    return map;
  }, [courses]);

  // Update item score
  const handleItemScoreChange = async (courseId: string, itemId: string, valStr: string) => {
    const num = valStr.trim() === '' ? null : parseFloat(valStr);
    const validScore = num !== null && !isNaN(num) ? Math.min(150, Math.max(0, num)) : null;

    try {
      const updatedCourse = await dataStore.updateCategoryItem(courseId, itemId, {
        score: validScore,
      });
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error updating item score:', err);
    }
  };

  // Rename an item
  const handleItemRename = async (courseId: string, itemId: string, newTitle: string) => {
    try {
      const updatedCourse = await dataStore.updateCategoryItem(courseId, itemId, {
        title: newTitle,
      });
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error renaming item:', err);
    }
  };

  // Add an item to a category
  const handleAddItem = async (courseId: string, categoryId: string) => {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    const cat = course.categories.find((c) => c.id === categoryId);
    if (!cat) return;

    const existing = getCategoryItems(course, categoryId);
    const newTitle = `${cat.name} ${existing.length + 1}`;

    try {
      const updatedCourse = await dataStore.addCategoryItem(courseId, categoryId, {
        title: newTitle,
        score: null,
      });
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error adding category item:', err);
    }
  };

  // Remove an item from a category (removes from grading, keeps deadline in course and calendar)
  const handleRemoveItem = async (courseId: string, itemId: string) => {
    try {
      const updatedCourse = await dataStore.removeCategoryItem(courseId, itemId);
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error removing category item:', err);
    }
  };

  // Move an item to a different category (or unassigned)
  const handleMoveItem = async (courseId: string, itemId: string, targetCatIdStr: string) => {
    const targetCatId =
      targetCatIdStr === 'unassigned' || targetCatIdStr === '' ? null : targetCatIdStr;
    try {
      const updatedCourse = await dataStore.updateCategoryItem(courseId, itemId, {
        categoryId: targetCatId,
      });
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error moving category item:', err);
    }
  };

  // Assign an unassigned deadline to a category
  const handleAssignDeadlineToCategory = async (
    courseId: string,
    deadlineId: string,
    categoryId: string
  ) => {
    if (!categoryId) return;
    try {
      const updatedCourse = await dataStore.assignDeadlineToCategory(courseId, deadlineId, categoryId);
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error assigning deadline to category:', err);
    }
  };

  // Exclude deadline from grading (hides it from unassigned list without deleting deadline)
  const handleExcludeDeadline = async (courseId: string, deadlineId: string) => {
    try {
      const updatedCourse = await dataStore.excludeDeadlineFromGrading(courseId, deadlineId);
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error excluding deadline from grading:', err);
    }
  };

  // Restore excluded deadline to grading
  const handleRestoreExcludedDeadline = async (courseId: string, deadlineId: string) => {
    try {
      const updatedCourse = await dataStore.restoreExcludedDeadline(courseId, deadlineId);
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error restoring excluded deadline:', err);
    }
  };

  // Delete deadline permanently from course
  const handleDeleteDeadline = async (courseId: string, deadlineId: string) => {
    try {
      const updatedCourse = await dataStore.deleteDeadline(courseId, deadlineId);
      setDeletingDeadlineId(null);
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error deleting deadline:', err);
    }
  };

  // Category Actions
  const handleAddCategory = async (courseId: string) => {
    if (!newCatName.trim()) return;
    const weightNum = newCatWeight.trim() === '' ? 0 : parseFloat(newCatWeight);
    const validWeight = !isNaN(weightNum) ? Math.min(100, Math.max(0, weightNum)) : 0;

    try {
      const updatedCourse = await dataStore.addCategory(courseId, {
        name: newCatName.trim(),
        weight: validWeight,
      });
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
        setNewCatName('');
        setNewCatWeight('');
        setIsAddingCategory(false);
      }
    } catch (err) {
      console.error('Error adding category:', err);
    }
  };

  const handleCategoryRename = async (courseId: string, categoryId: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const updatedCourse = await dataStore.updateCategory(courseId, categoryId, {
        name: newName.trim(),
      });
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error renaming category:', err);
    }
  };

  const handleCategoryWeightChange = async (courseId: string, categoryId: string, weightStr: string) => {
    const num = weightStr.trim() === '' ? 0 : parseFloat(weightStr);
    const validWeight = !isNaN(num) ? Math.min(100, Math.max(0, num)) : 0;

    try {
      const updatedCourse = await dataStore.updateCategory(courseId, categoryId, {
        weight: validWeight,
      });
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error updating category weight:', err);
    }
  };

  const handleConfirmDeleteCategory = async (courseId: string, categoryId: string) => {
    try {
      const updatedCourse = await dataStore.deleteCategory(courseId, categoryId);
      setDeletingCategoryId(null);
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error deleting category:', err);
    }
  };

  const handleMoveCategory = async (courseId: string, categoryId: string, direction: 'up' | 'down') => {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;

    const idx = course.categories.findIndex((c) => c.id === categoryId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === course.categories.length - 1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const newCategories = [...course.categories];
    const [moved] = newCategories.splice(idx, 1);
    newCategories.splice(targetIdx, 0, moved);

    try {
      const updatedCourse = await dataStore.reorderCategories(
        courseId,
        newCategories.map((c) => c.id)
      );
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error reordering categories:', err);
    }
  };

  // Drag and Drop for categories
  const handleCategoryDragStart = (e: React.DragEvent, categoryId: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'category', id: categoryId }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedCategoryId(categoryId);
  };

  const handleCategoryDragOver = (e: React.DragEvent, categoryId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedCategoryId && dragOverCategoryId !== categoryId) {
      setDragOverCategoryId(categoryId);
    }
  };

  const handleCategoryDrop = async (e: React.DragEvent, targetCategoryId: string) => {
    e.preventDefault();
    const sourceCatId = draggedCategoryId;
    setDraggedCategoryId(null);
    setDragOverCategoryId(null);

    const activeCourse = courses.find((c) => c.id === activeCourseId);
    if (!sourceCatId || sourceCatId === targetCategoryId || !activeCourse) return;

    const idx = activeCourse.categories.findIndex((c) => c.id === sourceCatId);
    const targetIdx = activeCourse.categories.findIndex((c) => c.id === targetCategoryId);
    if (idx === -1 || targetIdx === -1) return;

    const newCategories = [...activeCourse.categories];
    const [moved] = newCategories.splice(idx, 1);
    newCategories.splice(targetIdx, 0, moved);

    try {
      const updatedCourse = await dataStore.reorderCategories(
        activeCourse.id,
        newCategories.map((c) => c.id)
      );
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === activeCourse.id ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error dropping category:', err);
    }
  };

  // Drag and drop for items between categories
  const handleItemDragStart = (e: React.DragEvent, itemId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'item', id: itemId }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedItemId(itemId);
  };

  const handleItemDragOver = (e: React.DragEvent, targetCatId: string | 'unassigned') => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (draggedItemId && dragOverCatIdForItems !== targetCatId) {
      setDragOverCatIdForItems(targetCatId);
    }
  };

  const handleItemDrop = async (e: React.DragEvent, targetCatId: string | 'unassigned') => {
    e.preventDefault();
    e.stopPropagation();
    const itemId = draggedItemId;
    setDraggedItemId(null);
    setDragOverCatIdForItems(null);

    if (!itemId || !activeCourseId) return;
    const catIdToAssign = targetCatId === 'unassigned' ? null : targetCatId;
    await handleMoveItem(activeCourseId, itemId, catIdToAssign || 'unassigned');
  };

  // Update a single whole-category score (when category has no items)
  const handleCategoryScoreChange = async (courseId: string, categoryId: string, valStr: string) => {
    const num = valStr.trim() === '' ? null : parseFloat(valStr);
    const validScore = num !== null && !isNaN(num) ? Math.min(150, Math.max(0, num)) : null;

    const course = courses.find((c) => c.id === courseId);
    if (!course) return;

    const scoresMap: Record<string, number | null> = {};
    course.categories.forEach((cat) => {
      scoresMap[cat.id] = cat.id === categoryId ? validScore : (cat.currentScore ?? null);
    });

    try {
      const updatedCourse = await dataStore.updateCourseGrades(
        courseId,
        course.targetGrade ?? 90,
        scoresMap
      );
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
      }
    } catch (err) {
      console.error('Error saving score:', err);
    }
  };

  // Update target grade
  const handleTargetGradeChange = async (courseId: string, targetVal: number) => {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;

    const validTarget = Math.min(100, Math.max(50, targetVal));
    const scoresMap: Record<string, number | null> = {};
    course.categories.forEach((cat) => {
      scoresMap[cat.id] = cat.currentScore ?? null;
    });

    try {
      const updatedCourse = await dataStore.updateCourseGrades(
        courseId,
        validTarget,
        scoresMap
      );
      if (updatedCourse) {
        onCoursesUpdated(courses.map((c) => (c.id === courseId ? updatedCourse : c)));
        setSaveFeedback(`Target updated to ${validTarget}%`);
        setTimeout(() => setSaveFeedback(null), 2500);
      }
    } catch (err) {
      console.error('Error updating target grade:', err);
    }
  };

  // Request AI Focus Strategy via Gemini 3.1 Flash Lite
  const handleRequestFocus = async (courseId: string) => {
    const course = courses.find((c) => c.id === courseId);
    const calc = calculations[courseId];
    if (!course || !calc) return;

    if (!calc.isWeightValid || calc.status === 'invalid_weights') {
      setFocusError((prev) => ({
        ...prev,
        [courseId]: `Category weights total ${calc.totalWeight}%, not 100%. Please adjust category weights to 100% to generate effort focus advice.`,
      }));
      return;
    }

    setIsAnalyzingFocus(true);
    setFocusError((prev) => ({ ...prev, [courseId]: null }));

    try {
      const currentWeightedStanding =
        calc.currentWeightedGrade !== null ? Number(calc.currentWeightedGrade.toFixed(1)) : null;
      const requiredAverageOnRemaining =
        calc.neededScoreOnRemaining !== null ? Number(calc.neededScoreOnRemaining.toFixed(1)) : null;
      const pointsEarned = Number(calc.pointsEarnedSoFar.toFixed(1));
      const maxPossible = Number(calc.maxPossibleGrade.toFixed(1));

      const result = await geminiClient.getGradeFocusAdvice({
        courseName: course.name,
        targetGrade: calc.targetGrade,
        currentWeightedGrade: currentWeightedStanding,
        pointsEarnedSoFar: pointsEarned,
        maxPossibleGrade: maxPossible,
        gradedWeight: calc.gradedWeight,
        remainingWeight: calc.remainingWeight,
        status: calc.status,
        neededScoreOnRemaining: requiredAverageOnRemaining,
        categories: course.categories.map((c) => {
          const catCalc = calculateCategory(course, c);
          return {
            name: c.name,
            weight: c.weight,
            currentScore:
              catCalc.currentScore !== null ? Number(catCalc.currentScore.toFixed(1)) : null,
            gradedWeight: Number(catCalc.gradedWeight.toFixed(1)),
            remainingWeight: Number(catCalc.remainingWeight.toFixed(1)),
            status:
              catCalc.remainingWeight === 0 && catCalc.currentScore !== null
                ? ('graded' as const)
                : catCalc.gradedWeight === 0
                ? ('ungraded' as const)
                : ('partially_graded' as const),
            items: catCalc.items.map((it) => ({
              name: it.title,
              weight: Number(it.itemWeight.toFixed(1)),
              currentScore: it.score !== null ? Number(Number(it.score).toFixed(1)) : null,
              status: it.score !== null ? ('graded' as const) : ('ungraded' as const),
            })),
          };
        }),
      });

      setFocusAnalysis((prev) => ({ ...prev, [courseId]: result }));
    } catch (err: any) {
      console.error('Focus analysis error:', err);
      setFocusError((prev) => ({
        ...prev,
        [courseId]: err.message || 'Failed to generate effort focus advice.',
      }));
    } finally {
      setIsAnalyzingFocus(false);
    }
  };

  const selectedCalc = activeCourseId ? calculations[activeCourseId] : null;
  const selectedCourse = activeCourseId ? courses.find((c) => c.id === activeCourseId) : null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-white dark:from-slate-900 via-indigo-50/40 dark:via-indigo-950/40 to-white dark:to-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Academic Grade Tracker & Target Calculator
            </h2>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 max-w-2xl leading-relaxed">
            Shows your weighted standing and the average you need on remaining coursework to reach your target, with suggestions on where to focus.
          </p>
        </div>

        {saveFeedback && (
          <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-semibold animate-in fade-in">
            {saveFeedback}
          </span>
        )}
      </div>

      {/* Course Grade Comparison Chart (Visual Overview of All Courses) */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Current Standing vs Target Grade Chart</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Visual comparison across your enrolled semester courses.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-xs bg-indigo-500" />
              <span>Current Grade</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-3 rounded-xs bg-amber-400" />
              <span>Target Line</span>
            </span>
          </div>
        </div>

        {/* Bar Chart Grid */}
        <div className="space-y-4 pt-1">
          {courses.map((c) => {
            const calc = calculations[c.id];
            if (!calc) return null;

            const isSelected = activeCourseId === c.id;
            const currentPct = calc.currentWeightedGrade !== null ? Math.min(100, Math.max(0, calc.currentWeightedGrade)) : 0;
            const targetPct = calc.targetGrade;

            return (
              <div
                key={c.id}
                onClick={() => setActiveCourseId(c.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-50/90 dark:bg-slate-950/90 border-indigo-500 ring-1 ring-indigo-500/40'
                    : 'bg-slate-50/40 dark:bg-slate-950/40 border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-50/70 dark:hover:bg-slate-950/70'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: c.color || '#3B82F6' }}
                    />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {c.code ? `${c.code}: ` : ''}{c.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-slate-700 dark:text-slate-300">
                      Current:{' '}
                      <span className="font-bold text-slate-900 dark:text-white">
                        {calc.currentWeightedGrade !== null ? `${calc.currentWeightedGrade.toFixed(1)}%` : 'No grades'}
                      </span>
                    </span>
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">
                      Target: {calc.targetGrade}%
                    </span>

                    {/* Status Pill */}
                    {!calc.isWeightValid ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        <span>Weights total {calc.totalWeight}%, not 100%</span>
                      </span>
                    ) : (
                      <>
                        {calc.status === 'secured' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            Secured
                          </span>
                        )}
                        {calc.status === 'achievable' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                            Need {calc.neededScoreOnRemaining?.toFixed(1)}%
                          </span>
                        )}
                        {calc.status === 'out_of_reach' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                            Out of Reach
                          </span>
                        )}
                        {calc.status === 'no_grades' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                            Need {calc.neededScoreOnRemaining?.toFixed(1)}%
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Progress / Target Bar Chart */}
                <div className="relative w-full h-4 bg-[#dbe6f5] dark:bg-slate-900 rounded-full overflow-hidden border border-[#cfdcee] dark:border-slate-800">
                  {/* Current Grade Fill */}
                  <div
                    className="h-full transition-all duration-300 rounded-full"
                    style={{
                      width: `${currentPct}%`,
                      backgroundColor: c.color || '#3B82F6',
                      opacity: calc.currentWeightedGrade === null ? 0 : 0.85,
                    }}
                  />

                  {/* Target Line Marker */}
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-amber-400 shadow-sm shadow-amber-400/50 z-10"
                    style={{ left: `${targetPct}%` }}
                    title={`Target: ${targetPct}%`}
                  />
                </div>

                {/* Mini Breakdown note */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 font-mono">
                  <span>Graded: {calc.gradedWeight}% of course</span>
                  <span>Remaining: {calc.remainingWeight}% unassigned</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Course Breakdown & Calculator */}
      {selectedCourse && selectedCalc && (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
          {/* Header & Course Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span
                  className="px-2.5 py-0.5 rounded text-xs font-semibold text-slate-900 dark:text-white"
                  style={{ backgroundColor: selectedCourse.color || '#3B82F6' }}
                >
                  {selectedCourse.code || 'Course'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedCourse.term || 'Fall 2026'}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                {selectedCourse.name}
              </h3>
            </div>

            {/* Target Grade Selector */}
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                  Target Final Grade
                </label>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="number"
                    min="50"
                    max="100"
                    value={selectedCalc.targetGrade}
                    onChange={(e) =>
                      handleTargetGradeChange(
                        selectedCourse.id,
                        parseFloat(e.target.value) || 90
                      )
                    }
                    className="w-16 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white text-center focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">%</span>
                </div>
              </div>

              {/* Target Preset Buttons */}
              <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-2">
                {[95, 90, 85, 80].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleTargetGradeChange(selectedCourse.id, preset)}
                    className={`px-2 py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
                      selectedCalc.targetGrade === preset
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mathematical Status Banner or Weights Warning */}
          {!selectedCalc.isWeightValid ? (
            <div className="p-4 rounded-xl bg-amber-50/40 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/80 text-amber-800 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Category weights total {selectedCalc.totalWeight}%, not 100%
                  </div>
                  <div className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-0.5 leading-relaxed">
                    While the total is not 100%, required average scores and status (Secured, Achievable, or Out of Reach) are not shown. Difference: {selectedCalc.weightDifference > 0 ? `${selectedCalc.weightDifference}% remaining to reach 100%` : `${Math.abs(selectedCalc.weightDifference)}% over 100%`}. Adjust category weights below to equal 100%.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                selectedCalc.status === 'secured'
                  ? 'bg-emerald-50/40 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-200'
                  : selectedCalc.status === 'out_of_reach'
                  ? 'bg-rose-50/40 dark:bg-rose-950/40 border-rose-200/80 dark:border-rose-800/80 text-rose-800 dark:text-rose-200'
                  : selectedCalc.status === 'no_grades'
                  ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  : 'bg-indigo-50/40 dark:bg-indigo-950/40 border-indigo-200/80 dark:border-indigo-800/80 text-indigo-800 dark:text-indigo-200'
              }`}
            >
              <div className="flex items-center gap-3">
                {selectedCalc.status === 'secured' && (
                  <Award className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                )}
                {selectedCalc.status === 'out_of_reach' && (
                  <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                {selectedCalc.status === 'achievable' && (
                  <Target className="w-6 h-6 text-indigo-600 dark:text-indigo-400 shrink-0" />
                )}
                {selectedCalc.status === 'no_grades' && (
                  <HelpCircle className="w-6 h-6 text-slate-500 dark:text-slate-400 shrink-0" />
                )}

                <div>
                  <div className="text-xs font-bold uppercase tracking-wider">
                    {selectedCalc.status === 'secured' && 'Target Grade Already Secured 🎉'}
                    {selectedCalc.status === 'out_of_reach' && 'Target Grade Out of Reach'}
                    {selectedCalc.status === 'achievable' && 'Target Achievable with Remaining Work'}
                    {selectedCalc.status === 'no_grades' && 'No Graded Work Recorded Yet'}
                  </div>
                  <div className="text-xs mt-0.5 leading-relaxed">
                    {selectedCalc.status === 'secured' && (
                      <span>
                        You have earned <strong className="text-slate-900 dark:text-white">{selectedCalc.pointsEarnedSoFar.toFixed(1)}</strong> out of 100 points, guaranteeing at least {selectedCalc.targetGrade}% regardless of remaining work.
                      </span>
                    )}
                    {selectedCalc.status === 'out_of_reach' && (
                      <span>
                        Even with 100% on all remaining work, the maximum possible final grade is <strong className="text-slate-900 dark:text-white">{selectedCalc.maxPossibleGrade.toFixed(1)}%</strong>.
                      </span>
                    )}
                    {selectedCalc.status === 'achievable' && (
                      <span>
                        You need an average score of <strong className="text-slate-900 dark:text-white text-sm font-extrabold">{selectedCalc.neededScoreOnRemaining?.toFixed(1)}%</strong> across the remaining <strong className="text-slate-900 dark:text-white">{selectedCalc.remainingWeight}%</strong> of coursework to finish with {selectedCalc.targetGrade}%.
                      </span>
                    )}
                    {selectedCalc.status === 'no_grades' && (
                      <span>
                        Enter your scores in the categories below to calculate your required grade trajectory.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* "Where should I focus?" Button */}
              <button
                onClick={() => handleRequestFocus(selectedCourse.id)}
                disabled={isAnalyzingFocus}
                className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all shrink-0"
              >
                {isAnalyzingFocus ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Compass className="w-4 h-4 text-indigo-800 dark:text-indigo-200" />
                    <span>Where should I focus?</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* AI Focus Guidance Panel (Displayed when requested) */}
          {focusAnalysis[selectedCourse.id] && (
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-indigo-500/50 shadow-2xl space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Gemini Pragmatic Effort Strategy & Leverage Ranking
                    </h4>
                  </div>
                </div>

                <button
                  onClick={() =>
                    setFocusAnalysis((prev) => {
                      const next = { ...prev };
                      delete next[selectedCourse.id];
                      return next;
                    })
                  }
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Dismiss
                </button>
              </div>

              {/* Summary */}
              <div className="p-3.5 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60 text-xs text-indigo-900 dark:text-indigo-100 leading-relaxed">
                <span className="font-bold text-slate-900 dark:text-white mr-1.5">Overview:</span>
                {focusAnalysis[selectedCourse.id].summary}
              </div>

              {/* Already finished line showing each one's score, with no advice attached */}
              {(() => {
                const finishedCategories = selectedCourse.categories
                  .map((cat) => ({
                    cat,
                    calc: calculateCategory(selectedCourse, cat),
                  }))
                  .filter(
                    ({ calc }) =>
                      calc.remainingWeight === 0 && calc.currentScore !== null
                  );
                if (finishedCategories.length === 0) return null;

                return (
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Already finished:</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {finishedCategories.map(({ cat, calc }) => {
                        const wholeWeight =
                          cat.weight !== null && cat.weight !== undefined
                            ? cat.weight
                            : null;

                        return (
                          <span
                            key={cat.id}
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800"
                          >
                            <span>{cat.name}</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              ({calc.currentScore !== null ? `${calc.currentScore.toFixed(1)}%` : `${cat.currentScore}%`})
                            </span>
                            {wholeWeight !== null && (
                              <span className="text-slate-500 text-[10px]">[{wholeWeight}%]</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Ranked Action Items: ONLY include categories that are still ungraded */}
              {(() => {
                const finishedSet = new Set(
                  selectedCourse.categories
                    .map((cat) => ({
                      cat,
                      calc: calculateCategory(selectedCourse, cat),
                    }))
                    .filter(
                      ({ calc }) =>
                        calc.remainingWeight === 0 && calc.currentScore !== null
                    )
                    .map(({ cat }) => cat.name.trim().toLowerCase())
                );

                const ungradedActions = focusAnalysis[selectedCourse.id].prioritizedActions.filter(
                  (action) => !finishedSet.has(action.categoryName.trim().toLowerCase())
                );

                const priorityStyles: Record<string, string> = {
                  'Highest Leverage': 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30',
                  'High Impact': 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
                  'Diminishing Returns - Cap Effort': 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
                  'Maintain Standing': 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
                };

                return (
                  <div className="space-y-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Ranked Priority Breakdown:
                    </div>

                    {ungradedActions.length === 0 ? (
                      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 italic">
                        All categories for this course have already been completed and graded.
                      </div>
                    ) : (
                      ungradedActions.map((action, i) => {
                        const wholePctWeight =
                          action.weight !== null && action.weight !== undefined
                            ? action.weight
                            : null;

                        return (
                          <div
                            key={i}
                            className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-slate-900 dark:text-white">
                                  #{i + 1}. {action.categoryName}
                                </span>
                                {wholePctWeight !== null && (
                                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                    ({wholePctWeight}% weight)
                                  </span>
                                )}
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                    priorityStyles[action.priority] || priorityStyles['High Impact']
                                  }`}
                                >
                                  {action.priority}
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                                {action.actionableAdvice}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })()}

              {/* Honest Advice Box */}
              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <span className="font-bold text-slate-900 dark:text-white mr-1.5">Assessment:</span>
                {focusAnalysis[selectedCourse.id].honestAdvice}
              </div>
            </div>
          )}

          {/* Focus Error Banner */}
          {focusError[selectedCourse.id] && (
            <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between">
              <span>{focusError[selectedCourse.id]}</span>
              <button
                onClick={() => handleRequestFocus(selectedCourse.id)}
                className="underline font-semibold hover:text-slate-900 dark:hover:text-white"
              >
                Retry
              </button>
            </div>
          )}

          {/* Graded Categories Editable Breakdown Table */}
          <div className="space-y-4">
            {/* Category Header Row with Total Weight & Add Category Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Course Graded Categories ({selectedCourse.categories.length})
                  </span>
                  <span
                    className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-md border flex items-center gap-1.5 ${
                      selectedCalc.isWeightValid
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30'
                    }`}
                  >
                    {!selectedCalc.isWeightValid && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
                    {selectedCalc.isWeightValid && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                    <span>Total Weight: {selectedCalc.totalWeight}%</span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Manage categories and items directly. Reorder with arrows or drag & drop.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setIsAddingCategory((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Category</span>
                </button>
              </div>
            </div>

            {/* Clear Warning with actual total and difference if not 100% */}
            {!selectedCalc.isWeightValid && (
              <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/60 border border-amber-600/80 text-amber-800 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-amber-700 dark:text-amber-300 text-sm">
                      Category weights total {selectedCalc.totalWeight}%, not 100%
                    </div>
                    <p className="text-xs text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
                      {selectedCalc.weightDifference > 0
                        ? `Difference: ${selectedCalc.weightDifference}% remaining to reach 100%. Target calculations are paused until weights total 100%.`
                        : `Difference: ${Math.abs(selectedCalc.weightDifference)}% over 100%. Target calculations are paused until weights total 100%.`}
                    </p>
                  </div>
                </div>
                <div className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-mono font-bold text-xs shrink-0 self-end sm:self-auto">
                  {selectedCalc.weightDifference > 0 ? `-${selectedCalc.weightDifference}%` : `+${Math.abs(selectedCalc.weightDifference)}%`}
                </div>
              </div>
            )}

            {/* Inline Add Category Form */}
            {isAddingCategory && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-indigo-500/50 shadow-xl space-y-3 animate-in fade-in">
                <div className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 flex items-center justify-between">
                  <span>Add New Graded Category</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCategory(false);
                      setNewCatName('');
                      setNewCatWeight('');
                    }}
                    className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Category Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Quizzes, Homework, Midterm Exam"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Weight (% of final)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        placeholder="e.g. 20"
                        value={newCatWeight}
                        onChange={(e) => setNewCatWeight(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">%</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCategory(false);
                      setNewCatName('');
                      setNewCatWeight('');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddCategory(selectedCourse.id)}
                    disabled={!newCatName.trim()}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
                  >
                    Add Category
                  </button>
                </div>
              </div>
            )}

            {/* Categories List */}
            <div className="space-y-4">
              {selectedCourse.categories.map((cat, catIdx) => {
                const catCalc = calculateCategory(selectedCourse, cat);
                const wholeWeight =
                  typeof cat.weight === 'number' && !isNaN(cat.weight)
                    ? cat.weight
                    : 0;

                const itemWeightFormatted =
                  catCalc.itemWeight % 1 === 0
                    ? catCalc.itemWeight
                    : Number(catCalc.itemWeight.toFixed(2));

                const isDropTarget = dragOverCategoryId === cat.id;

                return (
                  <div
                    key={cat.id}
                    draggable={true}
                    onDragStart={(e) => handleCategoryDragStart(e, cat.id)}
                    onDragOver={(e) => handleCategoryDragOver(e, cat.id)}
                    onDrop={(e) => handleCategoryDrop(e, cat.id)}
                    onDragEnd={() => {
                      setDraggedCategoryId(null);
                      setDragOverCategoryId(null);
                    }}
                    className={`p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border transition-all space-y-3 ${
                      isDropTarget
                        ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-slate-50/90 dark:bg-slate-950/90'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300/80 dark:hover:border-slate-700/80'
                    }`}
                  >
                    {/* Category Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-900 pb-3">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Drag Handle Icon */}
                        <div
                          className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-1 shrink-0"
                          title="Drag to reorder category"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>

                        {/* Up / Down Reorder Buttons for Touch Screens & Keyboard */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={catIdx === 0}
                            onClick={() => handleMoveCategory(selectedCourse.id, cat.id, 'up')}
                            aria-label="Move category up"
                            title="Move category up"
                            className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-20 disabled:hover:text-slate-500 dark:disabled:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={catIdx === selectedCourse.categories.length - 1}
                            onClick={() => handleMoveCategory(selectedCourse.id, cat.id, 'down')}
                            aria-label="Move category down"
                            title="Move category down"
                            className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-20 disabled:hover:text-slate-500 dark:disabled:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Inline Editable Category Name */}
                        <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                          <input
                            type="text"
                            value={editingCategoryNames[cat.id] ?? cat.name}
                            onChange={(e) =>
                              setEditingCategoryNames((prev) => ({
                                ...prev,
                                [cat.id]: e.target.value,
                              }))
                            }
                            onBlur={() => {
                              const val = editingCategoryNames[cat.id];
                              if (val !== undefined && val.trim() !== '' && val.trim() !== cat.name) {
                                handleCategoryRename(selectedCourse.id, cat.id, val.trim());
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            title="Click to rename category"
                            className="bg-transparent text-sm font-bold text-slate-900 dark:text-white tracking-tight px-1.5 py-0.5 rounded hover:bg-white dark:hover:bg-slate-900 focus:bg-white dark:focus:bg-slate-900 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-indigo-500 focus:outline-hidden transition-colors min-w-[130px]"
                          />

                          {/* Inline Editable Category Weight */}
                          <div
                            className="flex items-center gap-1 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800"
                            title="Click to change category weight percentage"
                          >
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={
                                editingCategoryWeights[cat.id] ??
                                (cat.weight !== null && cat.weight !== undefined ? cat.weight : '')
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditingCategoryWeights((prev) => ({
                                  ...prev,
                                  [cat.id]: val,
                                }));
                                handleCategoryWeightChange(selectedCourse.id, cat.id, val);
                              }}
                              className="w-12 bg-transparent text-xs font-mono font-bold text-indigo-700 dark:text-indigo-300 text-right focus:outline-hidden"
                            />
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">%</span>
                          </div>

                          {catCalc.hasItems && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80">
                              {catCalc.items.length} {catCalc.items.length === 1 ? 'item' : 'items'} • {itemWeightFormatted}% each
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Metrics, Single Score if no items, and Delete Category Button */}
                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        {/* Earned toward final */}
                        <div className="text-right">
                          <div className="text-[10px] uppercase font-bold text-slate-500">
                            Earned Toward Final
                          </div>
                          <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                            {catCalc.pointsEarned.toFixed(1)} / {wholeWeight} pts
                          </div>
                        </div>

                        {catCalc.hasItems ? (
                          /* Average Score display for categories with items */
                          <div className="text-right bg-white/80 dark:bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                              Category Score
                            </div>
                            <div className="text-xs font-mono font-bold">
                              {catCalc.currentScore !== null ? (
                                <span className="text-indigo-700 dark:text-indigo-300 font-extrabold">{catCalc.currentScore.toFixed(1)}%</span>
                              ) : (
                                <span className="text-slate-500 font-normal">Ungraded</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* Single Category Score input (when category has no items) */
                          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                            <input
                              type="number"
                              min="0"
                              max="150"
                              step="0.5"
                              placeholder="Ungraded"
                              value={catCalc.currentScore !== null ? catCalc.currentScore : ''}
                              onChange={(e) =>
                                handleCategoryScoreChange(
                                  selectedCourse.id,
                                  cat.id,
                                  e.target.value
                                )
                              }
                              className="w-16 bg-transparent text-xs font-mono font-bold text-slate-900 dark:text-white text-right placeholder-slate-600 focus:outline-hidden"
                            />
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">%</span>
                          </div>
                        )}

                        {/* Delete Category Button */}
                        <button
                          type="button"
                          onClick={() => setDeletingCategoryId(cat.id)}
                          title="Delete category"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Inline Confirmation when deleting category */}
                    {deletingCategoryId === cat.id && (
                      <div className="p-3 rounded-xl bg-rose-50/90 dark:bg-rose-950/90 border border-rose-200 dark:border-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                        <div className="flex items-center gap-2 text-xs font-semibold text-rose-800 dark:text-rose-200">
                          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                          <span>Delete this category and its scores?</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={() => setDeletingCategoryId(null)}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmDeleteCategory(selectedCourse.id, cat.id)}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Category Items List (if items exist) */}
                    {catCalc.hasItems && (
                      <div className="space-y-2 pt-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                          <span>Items in {cat.name} ({catCalc.items.length})</span>
                          <span className="font-mono text-[10px] text-slate-500">
                            Equal share: {itemWeightFormatted}% each
                          </span>
                        </div>

                        {/* Items container drop zone for drag & drop */}
                        <div
                          onDragOver={(e) => handleItemDragOver(e, cat.id)}
                          onDrop={(e) => handleItemDrop(e, cat.id)}
                          className={`space-y-1.5 rounded-xl p-2.5 border transition-all ${
                            dragOverCatIdForItems === cat.id
                              ? 'bg-indigo-50/30 dark:bg-indigo-950/30 border-indigo-500/60 ring-1 ring-indigo-500/40'
                              : 'bg-white/40 dark:bg-slate-900/40 border-slate-200 dark:border-slate-900'
                          }`}
                        >
                          {catCalc.items.map((it) => (
                            <div
                              key={it.id}
                              draggable={true}
                              onDragStart={(e) => handleItemDragStart(e, it.id)}
                              className="p-2 rounded-lg bg-slate-50/80 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300/80 dark:hover:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all"
                            >
                              {/* Drag handle & Item Title (Inline Editable) */}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div
                                  className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 shrink-0 p-0.5"
                                  title="Drag item to another category"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </div>
                                <input
                                  type="text"
                                  value={editingTitles[it.id] ?? it.title}
                                  onChange={(e) =>
                                    setEditingTitles((prev) => ({
                                      ...prev,
                                      [it.id]: e.target.value,
                                    }))
                                  }
                                  onBlur={() => {
                                    const newTitle = editingTitles[it.id];
                                    if (
                                      newTitle !== undefined &&
                                      newTitle.trim() !== '' &&
                                      newTitle.trim() !== it.title
                                    ) {
                                      handleItemRename(selectedCourse.id, it.id, newTitle.trim());
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      (e.target as HTMLInputElement).blur();
                                    }
                                  }}
                                  className="bg-transparent text-xs text-slate-900 dark:text-white font-medium px-2 py-1 rounded hover:bg-white dark:hover:bg-slate-900 focus:bg-white dark:focus:bg-slate-900 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-indigo-500 focus:outline-hidden flex-1 min-w-[120px] transition-colors"
                                  title="Click to rename item"
                                  placeholder="Item name"
                                />
                                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 shrink-0">
                                  {itemWeightFormatted}% wt
                                </span>
                              </div>

                              {/* Item Move Category Dropdown, Score Input & Remove */}
                              <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
                                {/* Move Category Menu Selector */}
                                <select
                                  value={cat.id}
                                  onChange={(e) =>
                                    handleMoveItem(selectedCourse.id, it.id, e.target.value)
                                  }
                                  title="Move item to a different category"
                                  className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded px-2 py-1 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer transition-colors shrink-0 max-w-[145px] truncate"
                                >
                                  <option value={cat.id} disabled>
                                    Category: {cat.name}
                                  </option>
                                  {selectedCourse.categories
                                    .filter((c) => c.id !== cat.id)
                                    .map((c) => (
                                      <option key={c.id} value={c.id}>
                                        Move to: {c.name}
                                      </option>
                                    ))}
                                  <option value="unassigned">Move to: Unassigned</option>
                                </select>

                                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800">
                                  <input
                                    type="number"
                                    min="0"
                                    max="150"
                                    step="0.5"
                                    placeholder="Ungraded"
                                    value={it.score !== null ? it.score : ''}
                                    onChange={(e) =>
                                      handleItemScoreChange(
                                        selectedCourse.id,
                                        it.id,
                                        e.target.value
                                      )
                                    }
                                    className="w-16 bg-transparent text-xs font-mono font-bold text-slate-900 dark:text-white text-right placeholder-slate-600 focus:outline-hidden"
                                  />
                                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">%</span>
                                </div>

                                {/* Delete button on item: removes from grading, keeps deadline in course & calendar */}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(selectedCourse.id, it.id)}
                                  title="Remove item from grading (retains deadline in course)"
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}

                          {/* Add item button */}
                          <div className="pt-1 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => handleAddItem(selectedCourse.id, cat.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 text-xs font-semibold border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500/50 transition-all cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Item to {cat.name}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* If category has no items: allow adding items or drop items */}
                    {!catCalc.hasItems && (
                      <div
                        onDragOver={(e) => handleItemDragOver(e, cat.id)}
                        onDrop={(e) => handleItemDrop(e, cat.id)}
                        className={`pt-2 pb-1 px-3 rounded-lg border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                          dragOverCatIdForItems === cat.id
                            ? 'bg-indigo-50/30 dark:bg-indigo-950/30 border-indigo-500/60 ring-1 ring-indigo-500/40'
                            : 'bg-white/30 dark:bg-slate-900/30 border-dashed border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <span className="text-[11px] text-slate-500">
                          Evaluated as a single score. You can also add items or drag items here.
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddItem(selectedCourse.id, cat.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-700 dark:hover:text-indigo-300 text-xs border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add item</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Unassigned items list (only when at least one exists) */}
            {(() => {
              const unassignedItems = getUnassignedItems(selectedCourse);
              if (unassignedItems.length === 0) return null;

              return (
                <div
                  onDragOver={(e) => handleItemDragOver(e, 'unassigned')}
                  onDrop={(e) => handleItemDrop(e, 'unassigned')}
                  className={`p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border transition-all space-y-3 ${
                    dragOverCatIdForItems === 'unassigned'
                      ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-slate-50/90 dark:bg-slate-950/90'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Unassigned items ({unassignedItems.length})
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Deadlines not assigned to any category. Assign to a category, exclude from grading, or delete.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {unassignedItems.map((it) => (
                      <div
                        key={it.id}
                        draggable={true}
                        onDragStart={(e) => handleItemDragStart(e, it.id)}
                        className="p-3 rounded-lg bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 hover:border-slate-300/80 dark:hover:border-slate-700/80 flex flex-col gap-2 transition-all"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                            <div
                              className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 shrink-0 p-0.5"
                              title="Drag deadline to a category"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs text-slate-900 dark:text-white font-medium">{it.title}</span>
                            {it.date && (
                              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                                Due: {it.date}
                              </span>
                            )}
                            <span className="text-[10px] font-mono uppercase text-slate-500">
                              {it.type}
                            </span>
                          </div>

                          {/* Three Actions: Assign to category, Exclude from grading, Delete deadline */}
                          <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
                            {/* Action 1: Assign to category menu */}
                            <select
                              value=""
                              onChange={(e) =>
                                handleAssignDeadlineToCategory(
                                  selectedCourse.id,
                                  it.id,
                                  e.target.value
                                )
                              }
                              title="Assign to category"
                              className="bg-slate-50 dark:bg-slate-950 hover:bg-white dark:hover:bg-slate-900 text-xs font-semibold text-indigo-600 dark:text-indigo-400 border border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer transition-colors max-w-[170px] truncate"
                            >
                              <option value="" disabled>
                                Assign to category...
                              </option>
                              {selectedCourse.categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>

                            {/* Action 2: Exclude from grading */}
                            <button
                              type="button"
                              onClick={() => handleExcludeDeadline(selectedCourse.id, it.id)}
                              title="Exclude from grading (hides deadline from this list without deleting it)"
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-medium border border-slate-300 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer"
                            >
                              Exclude from grading
                            </button>

                            {/* Action 3: Delete deadline */}
                            <button
                              type="button"
                              onClick={() => setDeletingDeadlineId(it.id)}
                              title="Delete deadline"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 text-xs font-medium border border-slate-200 dark:border-slate-800 hover:border-rose-500/30 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete deadline</span>
                            </button>
                          </div>
                        </div>

                        {/* Inline confirmation for Delete deadline */}
                        {deletingDeadlineId === it.id && (
                          <div className="mt-1 p-2.5 rounded-lg bg-rose-50/90 dark:bg-rose-950/90 border border-rose-200 dark:border-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs animate-in fade-in">
                            <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200 font-medium">
                              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                              <span>Delete this deadline everywhere?</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                              <button
                                type="button"
                                onClick={() => setDeletingDeadlineId(null)}
                                className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDeadline(selectedCourse.id, it.id)}
                                className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Small Excluded Section (only when at least one exists) */}
            {(() => {
              const excludedItems = getExcludedItems(selectedCourse);
              if (excludedItems.length === 0) return null;

              return (
                <div className="p-3.5 rounded-xl bg-slate-50/60 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Excluded ({excludedItems.length})
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      Excluded from grading
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {excludedItems.map((it) => (
                      <div
                        key={it.id}
                        className="p-2 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="text-slate-700 dark:text-slate-300 font-medium line-through decoration-slate-600">
                            {it.title}
                          </span>
                          {it.date && (
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-50 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200/60 dark:border-slate-800/60">
                              Due: {it.date}
                            </span>
                          )}
                          <span className="text-[10px] font-mono uppercase text-slate-500">
                            {it.type}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={() => handleRestoreExcludedDeadline(selectedCourse.id, it.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200 text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
                            title="Restore deadline to grading"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};