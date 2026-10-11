import React, { useRef, useState } from 'react';
import { 
  X, 
  Save, 
  Plus, 
  Trash2, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Percent, 
  GraduationCap, 
  Tag, 
  HelpCircle 
} from 'lucide-react';
import { Course, Deadline, DeadlineType, GradedCategory, ExtractedSyllabusData } from '../types/academic';
import { AddMaterialsPanel } from './AddMaterialsPanel';

interface MergeDiff {
  id: string;
  label: string;
  current: string;
  incoming: string;
  apply: () => void;
}

interface MergeNotes {
  summary: string;
  conflicts: string[];
  diffs: MergeDiff[];
}

interface CourseReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (courseData: Partial<Course> & { name: string; categories: GradedCategory[]; deadlines: Deadline[] }) => void;
  initialData: Partial<Course>;
  isEditingExisting?: boolean;
}

const COLOR_OPTIONS = [
  { label: 'Blue', value: '#3B82F6' },
  { label: 'Emerald', value: '#10B981' },
  { label: 'Purple', value: '#8B5CF6' },
  { label: 'Amber', value: '#F59E0B' },
  { label: 'Rose', value: '#F43F5E' },
  { label: 'Cyan', value: '#06B6D4' },
  { label: 'Indigo', value: '#6366F1' },
];

// An empty string means "None": the course card shows no color bar
const NO_COLOR = '';

export const CourseReviewModal: React.FC<CourseReviewModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  isEditingExisting = false,
}) => {
  if (!isOpen) return null;

  const [courseName, setCourseName] = useState(initialData.name || '');
  const [courseCode, setCourseCode] = useState(initialData.code || '');
  const [instructor, setInstructor] = useState(initialData.instructor || '');
  const [term, setTerm] = useState(initialData.term || 'Fall 2026');
  // '' = None. A missing color (older courses, new syllabus imports) defaults to blue.
  const [selectedColor, setSelectedColor] = useState<string>(initialData.color ?? '#3B82F6');

  // Categories list
  const [categories, setCategories] = useState<GradedCategory[]>(
    (initialData.categories || []).map((cat, idx) => ({
      id: cat.id || `cat-edit-${idx}`,
      name: cat.name || '',
      weight: cat.weight !== undefined && cat.weight !== null ? Number(cat.weight) : null,
      description: cat.description || '',
    }))
  );

  // Deadlines list
  const [deadlines, setDeadlines] = useState<Deadline[]>(
    (initialData.deadlines || []).map((dl, idx) => ({
      ...dl, // keep score, categoryId, categoryLocked and excludedFromGrading
      id: dl.id || `dl-edit-${idx}`,
      title: dl.title || '',
      date: dl.date || null,
      type: dl.type || 'homework',
      weight: dl.weight !== undefined && dl.weight !== null ? Number(dl.weight) : null,
      completed: dl.completed || false,
    }))
  );

  const [errorValidation, setErrorValidation] = useState<string | null>(null);

  // Calculate total weight
  const totalWeight = categories.reduce((sum, c) => {
    return sum + (typeof c.weight === 'number' && !isNaN(c.weight) ? c.weight : 0);
  }, 0);

  // Handlers for categories
  const handleAddCategory = () => {
    setCategories([
      ...categories,
      {
        id: `cat-new-${Date.now()}`,
        name: 'New Graded Component',
        weight: 10,
        description: '',
      },
    ]);
  };

  const handleUpdateCategory = (id: string, field: keyof GradedCategory, value: any) => {
    setCategories(
      categories.map((c) => {
        if (c.id === id) {
          if (field === 'weight') {
            const num = value === '' || value === null ? null : parseFloat(value);
            return { ...c, weight: num !== null && !isNaN(num) ? num : null };
          }
          return { ...c, [field]: value };
        }
        return c;
      })
    );
  };

  const handleDeleteCategory = (id: string) => {
    setCategories(categories.filter((c) => c.id !== id));
  };

  // Handlers for deadlines
  const handleAddDeadline = () => {
    setDeadlines([
      ...deadlines,
      {
        id: `dl-new-${Date.now()}`,
        title: 'New Assignment / Exam',
        date: new Date().toISOString().split('T')[0],
        type: 'homework',
        weight: null,
        completed: false,
      },
    ]);
  };

  const handleUpdateDeadline = (id: string, field: keyof Deadline, value: any) => {
    setDeadlines(
      deadlines.map((d) => {
        if (d.id === id) {
          if (field === 'weight') {
            const num = value === '' || value === null ? null : parseFloat(value);
            return { ...d, weight: num !== null && !isNaN(num) ? num : null };
          }
          if (field === 'date') {
            return { ...d, date: value ? value : null };
          }
          return { ...d, [field]: value };
        }
        return d;
      })
    );
  };

  const handleDeleteDeadline = (id: string) => {
    setDeadlines(deadlines.filter((d) => d.id !== id));
  };

  // ---- Merge newly extracted material into this course (nothing is overwritten silently) ----
  const latest = useRef({ deadlines, categories });
  latest.current = { deadlines, categories };
  const [mergeNotes, setMergeNotes] = useState<MergeNotes | null>(null);

  const handleMaterialsExtracted = (ex: ExtractedSyllabusData) => {
    const { deadlines: curDl, categories: curCats } = latest.current;
    const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const uid = (i: number) => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${i}`;
    const diffs: MergeDiff[] = [];
    let filled = 0;

    if (!instructor && ex.instructor) { setInstructor(ex.instructor); filled++; }
    if (!courseCode && ex.courseCode) { setCourseCode(ex.courseCode); filled++; }

    // Categories: add new ones, fill blank weights, flag different weights
    const newCats: GradedCategory[] = [];
    const catFill: Record<string, number> = {};
    ex.categories.forEach((c, i) => {
      const hit = curCats.find((x) => norm(x.name) === norm(c.name));
      if (!hit) {
        if (!newCats.some((x) => norm(x.name) === norm(c.name))) {
          newCats.push({ id: `cat-${uid(i)}`, name: c.name, weight: c.weight ?? null, description: c.description || '' });
        }
      } else if (c.weight != null && hit.weight == null) {
        catFill[hit.id] = c.weight; filled++;
      } else if (c.weight != null && hit.weight != null && c.weight !== hit.weight) {
        diffs.push({
          id: `cw-${hit.id}`, label: `${hit.name}: weight`, current: `${hit.weight}%`, incoming: `${c.weight}%`,
          apply: () => setCategories((prev) => prev.map((x) => (x.id === hit.id ? { ...x, weight: c.weight } : x))),
        });
      }
    });
    if (newCats.length || Object.keys(catFill).length) {
      setCategories((prev) => [...prev.map((x) => (x.id in catFill ? { ...x, weight: catFill[x.id] } : x)), ...newCats]);
    }

    // Deadlines: add new ones, fill blank dates/weights, flag different dates/weights
    const newDl: Deadline[] = [];
    const dlFill: Record<string, Partial<Deadline>> = {};
    ex.deadlines.forEach((n, i) => {
      const hit = curDl.find((d) => norm(d.title) === norm(n.title));
      if (!hit) {
        if (!newDl.some((d) => norm(d.title) === norm(n.title))) {
          newDl.push({ id: `dl-${uid(i)}`, title: n.title, date: n.date || null, type: n.type || 'homework', weight: n.weight ?? null, completed: false });
        }
        return;
      }
      if (!hit.date && n.date) { dlFill[hit.id] = { ...dlFill[hit.id], date: n.date }; filled++; }
      if (hit.weight == null && n.weight != null) { dlFill[hit.id] = { ...dlFill[hit.id], weight: n.weight }; filled++; }
      if (hit.date && n.date && hit.date !== n.date) {
        diffs.push({
          id: `dd-${hit.id}`, label: `${hit.title}: date`, current: hit.date, incoming: n.date,
          apply: () => setDeadlines((prev) => prev.map((d) => (d.id === hit.id ? { ...d, date: n.date } : d))),
        });
      }
      if (hit.weight != null && n.weight != null && hit.weight !== n.weight) {
        diffs.push({
          id: `dw-${hit.id}`, label: `${hit.title}: weight`, current: `${hit.weight}%`, incoming: `${n.weight}%`,
          apply: () => setDeadlines((prev) => prev.map((d) => (d.id === hit.id ? { ...d, weight: n.weight } : d))),
        });
      }
    });
    if (newDl.length || Object.keys(dlFill).length) {
      setDeadlines((prev) => [...prev.map((d) => (dlFill[d.id] ? { ...d, ...dlFill[d.id] } : d)), ...newDl]);
    }

    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
    setMergeNotes({
      summary: `Added ${plural(newDl.length, 'deadline')} and ${plural(newCats.length, 'category').replace('categorys', 'categories')}. Filled ${plural(filled, 'blank field')}. Review the changes below, then save.`,
      conflicts: ex.conflicts || [],
      diffs,
    });
  };

  const handleSave = () => {
    if (!courseName.trim()) {
      setErrorValidation('Course name is required.');
      return;
    }

    setErrorValidation(null);

    onSave({
      id: initialData.id,
      name: courseName.trim(),
      code: courseCode.trim() || null,
      instructor: instructor.trim() || null,
      term: term.trim() || 'Fall 2026',
      color: selectedColor, // '' when None is chosen (stored as an empty string, never undefined)
      rawSyllabus: initialData.rawSyllabus,
      categories: categories.filter((c) => c.name.trim().length > 0),
      deadlines: deadlines.filter((d) => d.title.trim().length > 0),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-course-title"
        className="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: selectedColor === NO_COLOR ? '#94a3b8' : selectedColor }}
              />
              <h2 id="review-course-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                {isEditingExisting ? 'Edit Course & Syllabus Data' : 'Review & Verify Extracted Syllabus'}
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Review extracted weights and deadlines. Fix or add any details before saving.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-slate-800 dark:text-slate-200">
          {errorValidation && (
            <div className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{errorValidation}</span>
            </div>
          )}

          {/* Document Conflicts / Discrepancies Flagged by Gemini */}
          {initialData.conflicts && initialData.conflicts.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/80 text-amber-800 dark:text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Contradictions Flagged Across Syllabus Files / Text:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800/90 dark:text-amber-200/90 pl-1 leading-relaxed">
                {initialData.conflicts.map((conflict, i) => (
                  <li key={i}>{conflict}</li>
                ))}
              </ul>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium pt-0.5">
                The AI did not silently guess. Please review the weights and deadlines below and adjust as needed.
              </p>
            </div>
          )}

          {isEditingExisting && (
            <>
              <AddMaterialsPanel courseName={courseName} onExtracted={handleMaterialsExtracted} />
              {mergeNotes && (
                <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/40 space-y-3 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-slate-800 dark:text-slate-200">{mergeNotes.summary}</p>
                    <button type="button" onClick={() => setMergeNotes(null)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white shrink-0">Dismiss</button>
                  </div>
                  {mergeNotes.conflicts.length > 0 && (
                    <ul className="list-disc list-inside space-y-1 text-amber-800 dark:text-amber-300">
                      {mergeNotes.conflicts.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  )}
                  {mergeNotes.diffs.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="font-semibold text-slate-900 dark:text-white">The new files list different values. Your current values were kept.</p>
                      {mergeNotes.diffs.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2">
                          <span className="text-slate-700 dark:text-slate-300">
                            {d.label}: <span className="font-mono">{d.current}</span> to <span className="font-mono font-semibold">{d.incoming}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => { d.apply(); setMergeNotes((m) => (m ? { ...m, diffs: m.diffs.filter((x) => x.id !== d.id) } : m)); }}
                            className="shrink-0 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                          >
                            Use new
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Section: Course Info */}
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Course Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Course Name <span className="text-indigo-600 dark:text-indigo-400">*</span>
                </label>
                <input
                  type="text"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="e.g. CS 106B: Programming Abstractions"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Course Code
                </label>
                <input
                  type="text"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="e.g. CS 106B"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Instructor
                </label>
                <input
                  type="text"
                  value={instructor}
                  onChange={(e) => setInstructor(e.target.value)}
                  placeholder="e.g. Dr. Julie Zelenski"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Color Tag:</span>
                <div className="flex items-center gap-1.5">
                  {/* None: removes the color bar from the course card */}
                  <button
                    type="button"
                    onClick={() => setSelectedColor(NO_COLOR)}
                    aria-pressed={selectedColor === NO_COLOR}
                    className={`w-6 h-6 rounded-full flex items-center justify-center border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 transition-transform ${
                      selectedColor === NO_COLOR ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-950' : 'opacity-70 hover:opacity-100'
                    }`}
                    title="None (no color bar)"
                    aria-label="No color"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setSelectedColor(c.value)}
                      aria-pressed={selectedColor === c.value}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        selectedColor === c.value ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-950' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Academic Term:</span>
                <input
                  type="text"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Section: Graded Categories & Weights */}
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Grading Categories & Weights
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Extracted from syllabus. Total should typically equal 100%.
                </p>
              </div>

              {/* Total Weight Status Pill */}
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${
                  Math.round(totalWeight) === 100
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80'
                    : totalWeight > 100
                    ? 'bg-amber-50/80 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80'
                    : 'bg-indigo-50/80 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80'
                }`}
              >
                {Math.round(totalWeight) === 100 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                )}
                <span>
                  Total Weight: {totalWeight}%{' '}
                  {Math.round(totalWeight) === 100
                    ? '(Balanced)'
                    : totalWeight < 100
                    ? `(${100 - totalWeight}% unallocated)`
                    : '(Over 100%)'}
                </span>
              </div>
            </div>

            {/* Category Rows */}
            <div className="space-y-2">
              {categories.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                  No grading categories defined. Click below to add one.
                </div>
              ) : (
                categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                  >
                    <div className="flex-1">
                      <input
                        type="text"
                        value={category.name}
                        onChange={(e) => handleUpdateCategory(category.id, 'name', e.target.value)}
                        placeholder="Category name (e.g. Exams, Homework)"
                        className="w-full px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="w-full sm:w-32 flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={category.weight === null ? '' : category.weight}
                        onChange={(e) => handleUpdateCategory(category.id, 'weight', e.target.value)}
                        placeholder="null / unstated"
                        className="w-full px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-500 text-right focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">%</span>
                    </div>

                    <div className="hidden sm:block flex-1">
                      <input
                        type="text"
                        value={category.description || ''}
                        onChange={(e) => handleUpdateCategory(category.id, 'description', e.target.value)}
                        placeholder="Notes (e.g. drop lowest 1)"
                        className="w-full px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 placeholder-slate-600 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(category.id)}
                      className="p-1.5 rounded-md text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors self-end sm:self-center"
                      title="Delete category"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={handleAddCategory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/60 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/60 border border-indigo-200/60 dark:border-indigo-800/60 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Category</span>
            </button>
          </div>

          {/* Section: Deadlines & Deliverables */}
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Deadlines & Exam Dates ({deadlines.length})
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Extracted deliverables. If a date was missing or unclear in the syllabus, it defaults to null.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {deadlines.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                  No deadlines found. Click below to add an assignment or exam date.
                </div>
              ) : (
                deadlines.map((deadline) => (
                  <div
                    key={deadline.id}
                    className="flex flex-col md:flex-row items-stretch md:items-center gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                  >
                    {/* Title */}
                    <div className="flex-2">
                      <input
                        type="text"
                        value={deadline.title}
                        onChange={(e) => handleUpdateDeadline(deadline.id, 'title', e.target.value)}
                        placeholder="Deliverable title (e.g. Midterm 1)"
                        className="w-full px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Date */}
                    <div className="w-full md:w-38">
                      <input
                        type="date"
                        value={deadline.date || ''}
                        onChange={(e) => handleUpdateDeadline(deadline.id, 'date', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                        title="Deadline date (YYYY-MM-DD) or empty for null"
                      />
                    </div>

                    {/* Type Selector */}
                    <div className="w-full md:w-32">
                      <select
                        value={deadline.type}
                        onChange={(e) => handleUpdateDeadline(deadline.id, 'type', e.target.value as DeadlineType)}
                        className="w-full px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 capitalize"
                      >
                        <option value="exam">Exam</option>
                        <option value="paper">Paper</option>
                        <option value="homework">Homework</option>
                        <option value="project">Project</option>
                        <option value="quiz">Quiz</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    {/* Weight (optional/null) */}
                    <div className="w-full md:w-28 flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={deadline.weight === null ? '' : deadline.weight}
                        onChange={(e) => handleUpdateDeadline(deadline.id, 'weight', e.target.value)}
                        placeholder="Weight %"
                        className="w-full px-2 py-1.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-500 text-right focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                        title="Individual weight if stated in syllabus, or null"
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400">%</span>
                    </div>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDeleteDeadline(deadline.id)}
                      className="p-1.5 rounded-md text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors self-end md:self-center"
                      title="Delete deadline"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={handleAddDeadline}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/60 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/60 border border-indigo-200/60 dark:border-indigo-800/60 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Deadline</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>{isEditingExisting ? 'Save Changes' : 'Save Course to Dashboard'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};