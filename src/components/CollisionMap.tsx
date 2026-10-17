import React, { useState, useMemo } from 'react';
import { 
  Layers,
  
  AlertTriangle, 
  Calendar, 
  Flame, 
  ShieldAlert, 
  ChevronRight, 
  CheckCircle2, 
  Circle, 
  Clock, 
  BookOpen, 
  Loader2, 
  Plus, 
  ArrowRight,
  TrendingUp,
  Tag
} from 'lucide-react';
import { Course, Deadline, DeadlineType, SemesterAnalysis } from '../types/academic';
import { DEADLINE_TYPE_THEME } from '../theme/markerTheme';
import { geminiClient } from '../services/geminiClient';

interface CollisionMapProps {
  courses: Course[];
  onOpenAddCourse: () => void;
  onToggleDeadline: (courseId: string, deadlineId: string) => void;
}

interface DeadlineWithCourse extends Deadline {
  courseId: string;
  courseName: string;
  courseCode: string | null;
  courseColor: string;
}

interface WeekBucket {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  startDateStr: string;
  endDateStr: string;
  label: string;
  items: DeadlineWithCourse[];
  loadScore: number;
  level: 'green' | 'yellow' | 'red';
  isHeaviest?: boolean;
}

const TYPE_WEIGHTS: Record<DeadlineType, number> = {
  exam: 25,
  paper: 15,
  project: 15,
  homework: 7,
  quiz: 6,
  other: 5,
};

function normalizeDateStr(dateStr: string): string {
  const clean = dateStr.trim().split('T')[0];
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else if (parts[2].length === 4) {
      // MM/DD/YYYY
      return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }
  return clean;
}

function toIsoDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShortDateStr(dateStr: string): string {
  const norm = normalizeDateStr(dateStr);
  const parts = norm.split('-').map(Number);
  if (parts.length === 3 && parts[1] >= 1 && parts[1] <= 12) {
    return `${MONTH_NAMES[parts[1] - 1]} ${parts[2]}`;
  }
  return dateStr;
}

function formatRangeLabel(startDateStr: string, endDateStr?: string | null): string {
  if (!endDateStr || startDateStr === endDateStr) {
    return formatShortDateStr(startDateStr);
  }
  const sNorm = normalizeDateStr(startDateStr);
  const eNorm = normalizeDateStr(endDateStr);
  const sParts = sNorm.split('-').map(Number);
  const eParts = eNorm.split('-').map(Number);
  if (sParts.length === 3 && eParts.length === 3 && sParts[1] >= 1 && sParts[1] <= 12 && eParts[1] >= 1 && eParts[1] <= 12) {
    const sMonth = MONTH_NAMES[sParts[1] - 1];
    const eMonth = MONTH_NAMES[eParts[1] - 1];
    if (sMonth === eMonth) {
      return `${sMonth} ${sParts[2]}-${eParts[2]}`;
    }
    return `${sMonth} ${sParts[2]} – ${eMonth} ${eParts[2]}`;
  }
  return `${startDateStr} – ${endDateStr}`;
}

export const CollisionMap: React.FC<CollisionMapProps> = ({
  courses,
  onOpenAddCourse,
  onToggleDeadline,
}) => {
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<SemesterAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // 1. Gather all deadlines with confirmed date or range (exclude ambiguous and missing)
  const allDeadlines = useMemo<DeadlineWithCourse[]>(() => {
    const list: DeadlineWithCourse[] = [];
    courses.forEach((c) => {
      c.deadlines.forEach((d) => {
        const isExcluded = !d.date || d.dateStatus === 'ambiguous' || d.dateStatus === 'missing';
        if (!isExcluded) {
          list.push({
            ...d,
            courseId: c.id,
            courseName: c.name,
            courseCode: c.code || null,
            courseColor: c.color || '#3B82F6',
          });
        }
      });
    });

    list.sort((a, b) => normalizeDateStr(a.date!).localeCompare(normalizeDateStr(b.date!)));
    return list;
  }, [courses]);

  // If no courses exist, show prompt to add one
  if (!courses || courses.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto shadow-lg shadow-indigo-500/10">
          <Layers className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            No courses in your Course Center yet
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            The Collision Map tracks week-by-week academic workload and pinpoints exam overlaps. Add your courses or paste a syllabus to map out your semester.
          </p>
        </div>
        <div className="pt-2">
          <button
            onClick={onOpenAddCourse}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Course from Syllabus</span>
          </button>
        </div>
      </div>
    );
  }

  // Calculate week-by-week timeline
  const weekBuckets = useMemo<WeekBucket[]>(() => {
    if (allDeadlines.length === 0) {
      return [];
    }

    const firstDateStr = normalizeDateStr(allDeadlines[0].date!);
    // Last date is the latest date or dateEnd across all items
    const lastDateStr = allDeadlines.reduce((max, item) => {
      const end = normalizeDateStr(item.dateEnd || item.date!);
      return end > max ? end : max;
    }, normalizeDateStr(allDeadlines[0].date!));

    // Start on Monday of the first week (using UTC to prevent timezone/DST distortion)
    const [startY, startM, startD] = firstDateStr.split('-').map(Number);
    const startUtc = new Date(Date.UTC(startY, startM - 1, startD));
    const day = startUtc.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    startUtc.setUTCDate(startUtc.getUTCDate() + diffToMonday);

    // End on Sunday after the last deadline
    const [endY, endM, endD] = lastDateStr.split('-').map(Number);
    const endUtc = new Date(Date.UTC(endY, endM - 1, endD));
    const endDay = endUtc.getUTCDay();
    const diffToSunday = endDay === 0 ? 0 : 7 - endDay;
    endUtc.setUTCDate(endUtc.getUTCDate() + diffToSunday);

    const buckets: WeekBucket[] = [];
    let currentStart = new Date(startUtc);
    let weekCount = 1;

    while (currentStart.getTime() <= endUtc.getTime() && weekCount <= 26) {
      const currentEnd = new Date(currentStart);
      currentEnd.setUTCDate(currentEnd.getUTCDate() + 6);

      const weekStartStr = toIsoDateStr(currentStart);
      const weekEndStr = toIsoDateStr(currentEnd);

      // Find items in this week: range items are counted across the whole window
      const itemsInWeek = allDeadlines.filter((item) => {
        if (!item.date) return false;
        const itemStart = normalizeDateStr(item.date);
        const itemEnd = item.dateEnd ? normalizeDateStr(item.dateEnd) : itemStart;
        return itemStart <= weekEndStr && itemEnd >= weekStartStr;
      });

      // Calculate load score: exams and high-weight items count more
      const score = itemsInWeek.reduce((total, item) => {
        const base = TYPE_WEIGHTS[item.type] || 5;
        const weightScore = item.weight ? item.weight * 1.2 : (item.type === 'exam' ? 15 : 5);
        return total + Math.round(base + weightScore);
      }, 0);

      // Classify level
      let level: 'green' | 'yellow' | 'red' = 'green';
      if (score >= 40) {
        level = 'red';
      } else if (score >= 18) {
        level = 'yellow';
      }

      buckets.push({
        weekNumber: weekCount,
        startDate: new Date(currentStart),
        endDate: new Date(currentEnd),
        startDateStr: weekStartStr,
        endDateStr: weekEndStr,
        label: `${formatShortDateStr(weekStartStr)} – ${formatShortDateStr(weekEndStr)}`,
        items: itemsInWeek,
        loadScore: score,
        level,
      });

      // Advance exactly 7 days in UTC
      currentStart.setUTCDate(currentStart.getUTCDate() + 7);
      weekCount++;
    }

    // Highlight the heaviest week(s)
    const maxScore = Math.max(...buckets.map((b) => b.loadScore), 0);
    if (maxScore > 0) {
      buckets.forEach((b) => {
        if (b.loadScore === maxScore) {
          b.isHeaviest = true;
        }
      });
    }

    return buckets;
  }, [allDeadlines]);

  // Set default selected week to heaviest or first non-empty week
  React.useEffect(() => {
    if (selectedWeekIndex === null && weekBuckets.length > 0) {
      const heaviestIndex = weekBuckets.findIndex((w) => w.isHeaviest);
      if (heaviestIndex !== -1) {
        setSelectedWeekIndex(heaviestIndex);
      } else {
        const firstActive = weekBuckets.findIndex((w) => w.items.length > 0);
        setSelectedWeekIndex(firstActive !== -1 ? firstActive : 0);
      }
    }
  }, [weekBuckets, selectedWeekIndex]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await geminiClient.analyzeSemester(courses);
      setAnalysis(result);
    } catch (err: any) {
      console.error('Analysis error:', err);
      setAnalysisError(err.message || 'Could not analyze semester collisions.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const selectedWeek = selectedWeekIndex !== null ? weekBuckets[selectedWeekIndex] : null;

  // Compute inspector items fresh from the currently selected week's boundaries
  // each time the selection changes, ensuring nothing is carried over or appended.
  const selectedWeekItems = useMemo(() => {
    if (!selectedWeek) return [];

    const weekStartStr = selectedWeek.startDateStr;
    const weekEndStr = selectedWeek.endDateStr;

    return allDeadlines.filter((item) => {
      if (!item.date) return false;
      const itemDateStr = normalizeDateStr(item.date);
      return itemDateStr >= weekStartStr && itemDateStr <= weekEndStr;
    });
  }, [selectedWeek, allDeadlines]);

  const selectedWeekScore = useMemo(() => {
    return selectedWeekItems.reduce((total, item) => {
      const base = TYPE_WEIGHTS[item.type] || 5;
      const weightScore = item.weight ? item.weight * 1.2 : (item.type === 'exam' ? 15 : 5);
      return total + Math.round(base + weightScore);
    }, 0);
  }, [selectedWeekItems]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Banner & Strategy Action */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-white dark:from-slate-900 via-indigo-50/40 dark:via-indigo-950/40 to-white dark:to-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Semester Collision Map
            </h2>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 max-w-xl leading-relaxed">
            Combines deadlines and their weights into a weekly load score. Heavy weeks are flagged so you can plan ahead.
          </p>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="self-start md:self-auto px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all shrink-0"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-slate-900 dark:text-white" />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <span>Analyze My Semester</span>
            </>
          )}
        </button>
      </div>

      {/* AI Crunch Analysis Panel (Displayed above timeline when triggered) */}
      {analysis && (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-500/40 shadow-2xl space-y-5 animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                  Gemini Collision Intelligence & Early-Start Strategy
                </h3>
              </div>
            </div>

            <button
              onClick={() => setAnalysis(null)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              Dismiss
            </button>
          </div>

          {/* Overall Strategy Box */}
          <div className="p-4 rounded-xl bg-[#eef4fc] dark:bg-indigo-950/40 border border-[#b8c7de] dark:border-indigo-800/60 text-xs text-[#0f1b33] dark:text-indigo-100 leading-relaxed">
            <span className="font-bold text-[#0f1b33] dark:text-white mr-1.5">Strategic Overview:</span>
            {analysis.overallStrategy}
          </div>

          {/* Crunch Periods Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analysis.crunchPeriods.map((period, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-[#f7faff] dark:bg-slate-950 border border-[#cfdcee] dark:border-slate-800 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span
                      className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${
                        period.severity === 'critical'
                          ? 'bg-[#ffe4e8] text-[#9f1239] border-[#fda4af] dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                          : period.severity === 'high'
                          ? 'bg-[#fef3c7] text-[#92400e] border-[#fde68a] dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                          : 'bg-[#dfe3fb] text-[#312e81] border-[#8d9bea] dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800'
                      }`}
                    >
                      {period.severity}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {period.dateRange}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                    {period.title}
                  </h4>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {period.description}
                  </p>
                </div>

                {/* Start Early Recommendations */}
                {period.startEarly && period.startEarly.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-900 space-y-1.5">
                    <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
                      Start In Advance:
                    </span>
                    {period.startEarly.map((se, i) => (
                      <div key={i} className="text-[11px] text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                        <div className="font-semibold text-indigo-700 dark:text-indigo-300">
                          {se.assignment} <span className="text-slate-500 dark:text-slate-400 font-normal">({se.course})</span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{se.recommendation}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis Error Message */}
      {analysisError && (
        <div className="p-4 rounded-xl bg-[#ffe4e8] dark:bg-rose-950/50 border border-[#fda4af] dark:border-rose-800 text-[#9f1239] dark:text-rose-200 text-xs flex items-center justify-between">
          <span>{analysisError}</span>
          <button onClick={handleAnalyze} className="underline font-semibold hover:text-slate-900 dark:hover:text-white ml-3">
            Retry Analysis
          </button>
        </div>
      )}

      {/* Week Timeline Strip */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Semester Timeline ({weekBuckets.length} Weeks)
          </span>

          {/* Legend */}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Light (0-17)</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Moderate (18-39)</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>Heavy (40+)</span>
            </span>
          </div>
        </div>

        {/* Week Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {weekBuckets.map((bucket, idx) => {
            const isSelected = selectedWeekIndex === idx;
            const levelColors = {
              green: 'bg-[#dcfce7] text-[#166534] border-[#86efac] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30 hover:border-emerald-500',
              yellow: 'bg-[#fef3c7] text-[#92400e] border-[#fde68a] dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30 hover:border-amber-500',
              red: 'bg-[#ffe4e8] text-[#9f1239] border-[#fda4af] dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/40 hover:border-rose-500',
            };

            const levelDot = {
              green: 'bg-emerald-500',
              yellow: 'bg-amber-500',
              red: 'bg-rose-500 animate-pulse',
            };

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedWeekIndex(idx)}
                className={`relative p-3 rounded-xl border text-left transition-all flex flex-col justify-between h-28 cursor-pointer ${
                  isSelected
                    ? 'ring-2 ring-indigo-400 bg-white dark:bg-slate-900 border-indigo-500 shadow-lg'
                    : 'bg-white/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900'
                } ${bucket.isHeaviest ? 'ring-1 ring-rose-500/60' : ''}`}
              >
                {/* Heaviest Week Ribbon */}
                {bucket.isHeaviest && (
                  <span className="absolute -top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-600 text-white shadow-xs">
                    Heaviest Week
                  </span>
                )}

                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span>Week {bucket.weekNumber}</span>
                    <span className={`w-2 h-2 rounded-full ${levelDot[bucket.level]}`} />
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                    {bucket.label}
                  </div>
                </div>

                <div>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-base font-extrabold text-slate-900 dark:text-white">
                        {bucket.loadScore}
                        <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400 ml-0.5">pts</span>
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {bucket.items.length} {bucket.items.length === 1 ? 'item' : 'items'}
                      </div>
                    </div>

                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                        levelColors[bucket.level]
                      }`}
                    >
                      {{ green: 'Light', yellow: 'Moderate', red: 'Heavy' }[bucket.level]}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Week Detailed Breakdown */}
      {selectedWeek && (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Week {selectedWeek.weekNumber} Deliverables Breakdown
                </h3>
                <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-semibold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-900">
                  {selectedWeek.label}
                </span>
                {selectedWeek.isHeaviest && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#ffe4e8] dark:bg-rose-950 text-[#9f1239] dark:text-rose-300 border border-[#fda4af] dark:border-rose-800 uppercase">
                    Heaviest Semester Week
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Calculated Load Score: <span className="font-bold text-slate-900 dark:text-white">{selectedWeekScore} points</span> ({selectedWeekItems.length} assignments & exams)
              </p>
            </div>
          </div>

          {selectedWeekItems.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-50/60 dark:bg-slate-950/60 border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-900 dark:text-white">No major deliverables due this week!</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Use this open window to get ahead on upcoming projects or study for future exam weeks.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {selectedWeekItems.map((item) => {
                const typeConfig = DEADLINE_TYPE_THEME[item.type] || DEADLINE_TYPE_THEME.other;

                return (
                  <div
                    key={`${item.courseId}-${item.id}`}
                    className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                      item.completed
                        ? 'bg-slate-50/30 dark:bg-slate-950/30 border-slate-200/40 dark:border-slate-800/40 opacity-60'
                        : 'bg-slate-50/70 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => onToggleDeadline(item.courseId, item.id)}
                        className="text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
                        title={item.completed ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {item.completed ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-600 hover:text-slate-500 dark:hover:text-slate-400" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.courseColor }}
                          />
                          <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 truncate">
                            {item.courseCode || item.courseName}
                          </span>
                        </div>

                        <div
                          className={`text-sm font-bold text-slate-900 dark:text-white truncate ${
                            item.completed ? 'line-through text-slate-500 dark:text-slate-400' : ''
                          }`}
                        >
                          {item.title}
                        </div>

                        {/* Mobile date / range display */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 sm:hidden text-xs text-slate-500">
                          {item.dateStatus === 'range' && item.dateEnd ? (
                            <>
                              <span className="font-mono text-slate-700 dark:text-slate-300">
                                {formatRangeLabel(item.date!, item.dateEnd)}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                Date range
                              </span>
                            </>
                          ) : (
                            <span className="font-mono text-slate-700 dark:text-slate-300">{item.date}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <div className="flex items-center justify-end gap-1.5 text-xs font-mono font-medium text-slate-700 dark:text-slate-300">
                          {item.dateStatus === 'range' && item.dateEnd ? (
                            <>
                              <span>{formatRangeLabel(item.date!, item.dateEnd)}</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                Date range
                              </span>
                            </>
                          ) : (
                            <span>{item.date}</span>
                          )}
                        </div>
                        {item.weight !== null && (
                          <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            {item.weight}% of grade
                          </div>
                        )}
                      </div>

                      <span
                        className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${typeConfig.badgeClass}`}
                      >
                        {typeConfig.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};