import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  Trash2, 
  Edit3, 
  Volume2, 
  Search, 
  CheckCircle2, 
  Circle, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle
} from 'lucide-react';
import { 
  DEADLINE_TYPE_THEME, 
  DUE_DATE_STATUS_THEME, 
  formatDeadlineDateWithTheme,
  formatDeadlineRangeLabel
} from '../theme/markerTheme';
import { Course, Deadline, DateStatus, DateSource } from '../types/academic';
import { dataStore } from '../services/dataStore';
import { calendarSyncService } from '../services/calendarSyncService';

type DateTypeOption = 'exact' | 'range' | 'none';

interface CourseCardProps {
  course: Course;
  onEdit: (course: Course) => void;
  onDelete: (courseId: string) => void;
  onToggleDeadline: (courseId: string, deadlineId: string) => void;
  onOpenAudioBriefing: (course: Course) => void;
  onOpenAcademicSearch: (course: Course) => void;
}

/**
 * Light-mode segment colors from first to last (blue-indigo progression lightens at a steady pace)
 */
const LIGHT_MODE_CATEGORY_COLORS = [
  '#616ae7',
  '#657fea',
  '#6b94ed',
  '#74a7f0',
  '#86baf3',
  '#9bcbf6',
  '#afdaf8',
  '#c3e4f9',
  '#d3ebfa',
  '#e0f1fb',
];

/**
 * Returns a color about 20% darker for the legend dot ring in light mode
 */
function getDarkerRingColor(colorHex: string): string {
  if (colorHex.startsWith('#')) {
    const num = parseInt(colorHex.replace('#', ''), 16);
    const r = Math.round(((num >> 16) & 255) * 0.8);
    const g = Math.round(((num >> 8) & 255) * 0.8);
    const b = Math.round((num & 255) * 0.8);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return colorHex;
}

/**
 * Returns shades of a blue-indigo hue ordered from darkest to lightest.
 * In light mode: uses the dedicated light-mode palette specified by design.
 * In dark mode: keeps the existing dark mode algorithm unchanged.
 * Never repeats a color within one course.
 */
function getCategoryShade(index: number, total: number, isDark: boolean): string {
  if (isDark) {
    // Dark mode: from rich indigo (L=44%, S=82%) to ice slate-blue (L=82%, S=60%)
    if (total <= 1) {
      return 'hsl(232, 75%, 58%)';
    }
    const ratio = index / (total - 1);
    const hue = 232; // Blue-indigo hue
    const lightness = 44 + ratio * 38;
    const saturation = 82 - ratio * 22;
    return `hsl(${hue}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`;
  }

  // Light mode progression
  if (index < LIGHT_MODE_CATEGORY_COLORS.length) {
    return LIGHT_MODE_CATEGORY_COLORS[index];
  }

  // If a course has more than 10 categories, continue with lighter unique shades
  const extra = index - LIGHT_MODE_CATEGORY_COLORS.length + 1;
  const lightness = Math.min(98.5, 93 + extra * 0.5);
  const saturation = Math.max(20, 75 - extra * 3);
  return `hsl(204, ${Math.round(saturation)}%, ${lightness.toFixed(1)}%)`;
}

export const CourseCard: React.FC<CourseCardProps> = ({
  course,
  onEdit,
  onDelete,
  onToggleDeadline,
  onOpenAudioBriefing,
  onOpenAcademicSearch,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    const sync = () => {
      if (typeof document !== 'undefined') {
        setIsDark(document.documentElement.classList.contains('dark'));
      }
    };
    window.addEventListener('themechange', sync);
    const observer = new MutationObserver(sync);
    if (typeof document !== 'undefined') {
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }
    return () => {
      window.removeEventListener('themechange', sync);
      observer.disconnect();
    };
  }, []);

  // Inline date editing state
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [editDateType, setEditDateType] = useState<DateTypeOption>('exact');
  const [editDate, setEditDate] = useState<string>('');
  const [editDateEnd, setEditDateEnd] = useState<string>('');
  const [editDateError, setEditDateError] = useState<string | null>(null);
  const [isSavingDate, setIsSavingDate] = useState(false);

  const startEditDeadlineDate = (dl: Deadline) => {
    const type: DateTypeOption = dl.dateStatus === 'range' ? 'range' : (!dl.date || dl.dateStatus === 'ambiguous' || dl.dateStatus === 'missing') ? 'none' : 'exact';
    setEditDateType(type);
    setEditDate(dl.date || '');
    setEditDateEnd(dl.dateEnd || '');
    setEditDateError(null);
    setEditingDeadlineId(dl.id);
  };

  const cancelEditDeadlineDate = () => {
    setEditingDeadlineId(null);
    setEditDateError(null);
  };

  const handleEditTypeChange = (newType: DateTypeOption) => {
    setEditDateType(newType);
    setEditDateError(null);
    if (newType === 'range') {
      const today = new Date().toISOString().split('T')[0];
      const start = editDate || today;
      setEditDate(start);
      setEditDateEnd('');
    } else if (newType === 'exact') {
      setEditDateEnd('');
    } else {
      setEditDate('');
      setEditDateEnd('');
    }
  };

  const handleSaveDeadlineDate = async (deadlineId: string) => {
    if (editDateType === 'range') {
      if (!editDate) {
        setEditDateError('Please enter a start date.');
        return;
      }
      if (!editDateEnd) {
        setEditDateError('Please enter an end date.');
        return;
      }
      if (editDateEnd < editDate) {
        setEditDateError('End date must be on or after the start date.');
        return;
      }
    }
    if (editDateType === 'exact' && !editDate) {
      setEditDateError('Please select an exact date.');
      return;
    }

    setIsSavingDate(true);
    try {
      const status: DateStatus = editDateType === 'range' ? 'range' : editDateType === 'none' ? 'missing' : 'exact';
      const finalDate = editDateType === 'none' ? null : (editDate ? editDate.trim() : null);
      const finalEnd = editDateType === 'range' ? (editDateEnd ? editDateEnd.trim() : null) : null;

      const updated = await dataStore.updateDeadlineDateDetails(course.id, deadlineId, {
        date: finalDate,
        dateStatus: status,
        dateEnd: finalEnd,
        dateSource: 'manual',
      });

      if (updated && status === 'exact') {
        const dl = updated.deadlines.find((d) => d.id === deadlineId);
        if (dl) {
          calendarSyncService.syncDeadline(updated, dl).catch((e) => console.warn('Background calendar sync notice:', e));
        }
      }
      setEditingDeadlineId(null);
    } catch (err: any) {
      console.error('Error saving deadline date:', err);
      setEditDateError(err.message || 'Failed to update date.');
    } finally {
      setIsSavingDate(false);
    }
  };

  // Compute total weight
  const totalWeight = course.categories.reduce((acc, cat) => acc + (cat.weight || 0), 0);

  // Deadlines progress
  const totalDeadlinesCount = course.deadlines.length;
  const completedDeadlinesCount = course.deadlines.filter((d) => d.completed).length;
  const progressPercent = totalDeadlinesCount > 0
    ? Math.round((completedDeadlinesCount / totalDeadlinesCount) * 100)
    : null;

  // Sort deadlines: items with dates first (chronologically), then items with null date
  const sortedDeadlines = [...course.deadlines].sort((a, b) => {
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return 0;
  });

  const visibleDeadlines = isExpanded ? sortedDeadlines : sortedDeadlines.slice(0, 3);
  const hasMore = sortedDeadlines.length > 3;

  return (
    <div className="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-150 ease-in-out flex flex-col">
      {/* Top Banner & Color Accent (hidden when the course color is set to None; older courses without a color keep the default blue) */}
      {course.color !== '' && (
        <div className="h-1.5 w-full" style={{ backgroundColor: course.color || '#3B82F6' }} />
      )}

      {/* Course Header */}
      <div className="p-5 sm:p-6 border-b border-slate-200/80 dark:border-slate-800/80 space-y-3">
        {/* Row 1: Course code chip, Term, and Icon-only Action buttons */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {course.code && (
              <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-slate-200/80 dark:border-slate-700/80">
                {course.code}
              </span>
            )}
            {course.term && (
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {course.term}
              </span>
            )}
          </div>

          {/* Action Buttons: icon-only buttons with hover tooltips and accessible labels */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAudioBriefing(course)}
              className="w-9 h-9 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-slate-700 dark:text-indigo-300 border border-slate-200/80 dark:border-indigo-500/20 transition-all duration-150 ease-in-out cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
              title="Play audio briefing"
              aria-label="Play audio briefing"
            >
              <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </button>

            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(`${course.code ?? ''} ${course.name} course materials textbook site.edu`.trim())}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 transition-all duration-150 ease-in-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
              title="Search readings"
              aria-label="Search readings"
            >
              <Search className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </a>

            <button
              type="button"
              onClick={() => onEdit(course)}
              className="w-9 h-9 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200/80 dark:hover:border-slate-700/80 transition-all duration-150 ease-in-out cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
              title="Edit course"
              aria-label="Edit course"
            >
              <Edit3 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-9 h-9 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200/80 dark:hover:border-slate-700/80 transition-all duration-150 ease-in-out cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
              title="Delete course"
              aria-label="Delete course"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Row 2: Course Title */}
        <h3 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight leading-snug break-words">
          {course.name}
        </h3>

        {/* Row 3: Instructor and Progress */}
        {(course.instructor || progressPercent !== null) && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
            {course.instructor ? (
              <p className="text-slate-500 dark:text-slate-400">
                <span className="text-slate-400">Instructor: </span>
                <span className="text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                  {course.instructor}
                </span>
              </p>
            ) : (
              <span />
            )}

            {progressPercent !== null && (
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {progressPercent}% complete
              </span>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Overlay */}
      {showDeleteConfirm && (
        <div className="p-4 bg-slate-100 dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800/80 text-slate-800 dark:text-slate-200 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0" />
            <span>Delete this course and its deadlines?</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium transition-all duration-150 ease-in-out cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete(course.id);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold shadow-xs transition-all duration-150 ease-in-out cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Graded Weights Breakdown */}
      <div className="p-5 sm:p-6 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/30">
        <div className="flex items-center justify-between mb-2">
          <span className="tracking-wider text-[10px] font-bold uppercase text-slate-400">
            Grade Weight Breakdown
          </span>
          <span
            className={`text-xs font-semibold tabular-nums ${
              Math.round(totalWeight) === 100 ? 'text-[#15803d] dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {totalWeight}% tracked
          </span>
        </div>

        {/* Visual Bar: 8px height (h-2), rounded ends (rounded-full), continuous strip with no gaps or dividers, unfilled track #dbe6f5 in light mode */}
        {course.categories.length > 0 ? (
          <>
            <div className="h-2 w-full bg-[#dbe6f5] dark:bg-slate-800/60 rounded-full overflow-hidden flex mb-3 ring-1 ring-[#b8c7de] dark:ring-0">
              {course.categories.map((cat, idx) => {
                const segColor = getCategoryShade(idx, course.categories.length, isDark);
                const widthPct = cat.weight ? (cat.weight / Math.max(totalWeight, 100)) * 100 : 0;
                return (
                  <div
                    key={cat.id || idx}
                    style={{ width: `${widthPct}%`, backgroundColor: segColor }}
                    className="h-full transition-all"
                    title={`${cat.name}: ${cat.weight !== null ? `${cat.weight}%` : 'unstated'}`}
                  />
                );
              })}
            </div>

            {/* Category Chips: Legend chips with same color dot, full text (no truncation) */}
            <div className="flex flex-wrap gap-1.5">
              {course.categories.map((cat, idx) => {
                const segColor = getCategoryShade(idx, course.categories.length, isDark);
                const dotRingColor = isDark ? undefined : getDarkerRingColor(segColor);
                return (
                  <div
                    key={cat.id || idx}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: segColor,
                        ...(dotRingColor ? { boxShadow: `0 0 0 1px ${dotRingColor}` } : {}),
                      }}
                    />
                    <span className="font-medium whitespace-nowrap">{cat.name}</span>
                    <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                      {cat.weight !== null ? `${cat.weight}%` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-500 italic">No grading weights configured.</div>
        )}
      </div>

      {/* Deadlines Section */}
      <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="tracking-wider text-[10px] font-bold uppercase text-slate-400">
              Upcoming Deadlines
            </span>
            {totalDeadlinesCount > 0 ? (
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {completedDeadlinesCount}/{totalDeadlinesCount} done
              </span>
            ) : (
              <span className="font-mono text-xs text-slate-400 italic">
                No deadlines yet
              </span>
            )}
          </div>

          {sortedDeadlines.length === 0 ? (
            <div className="p-5 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-dashed border-slate-200/80 dark:border-slate-800/80 text-center text-xs text-slate-500 dark:text-slate-400">
              No deadlines recorded. Click Edit to add assignments or exams.
            </div>
          ) : (
            <div className="space-y-2">
              {visibleDeadlines.map((deadline) => {
                const typeConfig = DEADLINE_TYPE_THEME[deadline.type] || DEADLINE_TYPE_THEME.other;
                const dateInfo = formatDeadlineDateWithTheme(deadline.date);
                const statusConfig = DUE_DATE_STATUS_THEME[dateInfo.status];

                return (
                  <div
                    key={deadline.id}
                    className={`flex flex-col p-3 rounded-lg border transition-all duration-150 ease-in-out gap-2 ${
                      deadline.completed
                        ? 'bg-slate-50/30 dark:bg-slate-950/20 border-slate-200/50 dark:border-slate-800/40 opacity-60'
                        : 'bg-slate-50/60 dark:bg-slate-950/50 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Checkbox & Details */}
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleDeadline(course.id, deadline.id);
                          }}
                          className="mt-0.5 p-0.5 -m-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0 cursor-pointer focus:outline-hidden"
                          title={deadline.completed ? 'Mark incomplete' : 'Mark complete'}
                          aria-label={deadline.completed ? `Mark ${deadline.title} incomplete` : `Mark ${deadline.title} complete`}
                        >
                          {deadline.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400" />
                          )}
                        </button>

                        <div 
                          className="min-w-0 cursor-pointer select-none flex-1"
                          onClick={() => onToggleDeadline(course.id, deadline.id)}
                        >
                          <div
                            className={`text-xs font-semibold text-slate-900 dark:text-white truncate ${
                              deadline.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''
                            }`}
                          >
                            {deadline.title}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {deadline.dateStatus === 'range' && deadline.dateEnd ? (
                              <>
                                <span className="flex items-center gap-1 font-mono text-slate-700 dark:text-slate-300">
                                  <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
                                  <span>{formatDeadlineRangeLabel(deadline.date, deadline.dateEnd)}</span>
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  Date range
                                </span>
                              </>
                            ) : !deadline.date || deadline.dateStatus === 'ambiguous' || deadline.dateStatus === 'missing' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditDeadlineDate(deadline);
                                  }}
                                  className="flex items-center gap-1 text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
                                  title="Click to set date"
                                >
                                  <Calendar className="w-3 h-3 text-amber-500 shrink-0" />
                                  <span>{deadline.dateStatus === 'ambiguous' ? 'Date unclear' : 'No date found'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditDeadlineDate(deadline);
                                  }}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 cursor-pointer"
                                >
                                  Needs date
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                                  <span>{dateInfo.formatted}</span>
                                </span>

                                {dateInfo.relative && !deadline.completed && (
                                  statusConfig.hasPill ? (
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] inline-flex items-center gap-1 shrink-0 ${statusConfig.pillClass}`}
                                    >
                                      {statusConfig.iconType === 'alert' && (
                                        <AlertCircle className={`w-3 h-3 shrink-0 ${statusConfig.iconClass}`} />
                                      )}
                                      {statusConfig.iconType === 'clock' && (
                                        <Clock className={`w-3 h-3 shrink-0 ${statusConfig.iconClass}`} />
                                      )}
                                      <span>{dateInfo.relative}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 dark:text-slate-400 text-xs">
                                      {dateInfo.relative}
                                    </span>
                                  )
                                )}
                              </>
                            )}

                            {deadline.weight !== null && (
                              <span className="text-indigo-600 dark:text-indigo-400 font-medium font-mono">
                                ({deadline.weight}%)
                              </span>
                            )}

                            {/* Edit date button */}
                            {editingDeadlineId !== deadline.id && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditDeadlineDate(deadline);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
                                title="Edit date"
                                aria-label={`Edit date for ${deadline.title}`}
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {/* Evidence Citation or Manual Edit Notice */}
                          {deadline.dateSource === 'manual' ? (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-0.5">
                              Edited manually
                            </p>
                          ) : deadline.dateEvidence ? (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-0.5">
                              Syllabus says: &ldquo;{deadline.dateEvidence}&rdquo;
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {/* Type Badge */}
                      <span
                        className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border shrink-0 uppercase tracking-wider ${typeConfig.badgeClass}`}
                      >
                        {typeConfig.label}
                      </span>
                    </div>

                    {/* Inline Manual Date Type Editor */}
                    {editingDeadlineId === deadline.id && (
                      <div className="pt-2.5 mt-1 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-slate-100/70 dark:bg-slate-900/70 p-2.5 rounded-lg">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Date Type:</span>
                          <select
                            value={editDateType}
                            onChange={(e) => handleEditTypeChange(e.target.value as DateTypeOption)}
                            className="px-2 py-1 rounded-md bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-medium focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                          >
                            <option value="exact">Exact date</option>
                            <option value="range">Date range</option>
                            <option value="none">No date yet</option>
                          </select>
                        </div>

                        {editDateType === 'exact' && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 dark:text-slate-400">Date:</span>
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => { setEditDate(e.target.value); setEditDateError(null); }}
                              className="px-2 py-1 rounded-md bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        )}

                        {editDateType === 'range' && (
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-500 dark:text-slate-400">From</span>
                                <input
                                  type="date"
                                  value={editDate}
                                  onChange={(e) => { setEditDate(e.target.value); setEditDateError(null); }}
                                  className="px-2 py-1 rounded-md bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-500 dark:text-slate-400">To</span>
                                <input
                                  type="date"
                                  value={editDateEnd}
                                  onChange={(e) => { setEditDateEnd(e.target.value); setEditDateError(null); }}
                                  className={`px-2 py-1 rounded-md bg-white dark:bg-slate-950 border text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 ${
                                    !editDateEnd
                                      ? 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/20'
                                      : editDate && editDateEnd < editDate
                                      ? 'border-rose-500 ring-2 ring-rose-500/20'
                                      : 'border-slate-300 dark:border-slate-700'
                                  }`}
                                />
                              </div>
                            </div>
                            {!editDateEnd && (
                              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                                End date is required.
                              </p>
                            )}
                            {editDate && editDateEnd && editDateEnd < editDate && (
                              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                                End date must be on or after the start date.
                              </p>
                            )}
                          </div>
                        )}

                        {editDateType === 'none' && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                            Saved with no date; will appear in Planner &ldquo;Needs a date&rdquo;.
                          </p>
                        )}

                        {/* Evidence or Manual Edit Citation inside editor */}
                        {deadline.dateSource === 'manual' ? (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 italic pt-1 border-t border-dashed border-slate-200 dark:border-slate-800">
                            Edited manually
                          </div>
                        ) : deadline.dateEvidence ? (
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 italic pt-1 border-t border-dashed border-slate-200 dark:border-slate-800">
                            Syllabus says: &ldquo;{deadline.dateEvidence}&rdquo;
                          </div>
                        ) : null}

                        {editDateError && (
                          <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                            {editDateError}
                          </p>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={cancelEditDeadlineDate}
                            className="px-2.5 py-1 rounded-md text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 font-medium transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isSavingDate}
                            onClick={() => handleSaveDeadlineDate(deadline.id)}
                            className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                          >
                            {isSavingDate ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* View All / Collapse toggle */}
        {hasMore && (
          <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800/80 text-center">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>{isExpanded ? 'Show fewer' : `View all ${sortedDeadlines.length} deadlines`}</span>
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};