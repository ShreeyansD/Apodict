import React, { useState, useEffect } from 'react';
import { 
  CalendarDays,
  
  Plus, 
  CheckCircle2, 
  Circle, 
  AlertTriangle, 
  Clock, 
  Trash2, 
  Loader2, 
  FileText, 
  ArrowRight, 
  ChevronRight, 
  BookOpen,
  
  Target
} from 'lucide-react';
import { Course, AssignmentPlan, Milestone } from '../types/academic';
import { dataStore } from '../services/dataStore';
import { geminiClient } from '../services/geminiClient';

interface PlannerProps {
  courses: Course[];
  onOpenAddCourse: () => void;
}

export const Planner: React.FC<PlannerProps> = ({ courses, onOpenAddCourse }) => {
  const [plans, setPlans] = useState<AssignmentPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form State
  const [selectedDeadlineKey, setSelectedDeadlineKey] = useState<string>('custom');
  const [title, setTitle] = useState('');
  const [courseName, setCourseName] = useState('');
  const [courseId, setCourseId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState<number>(1);
  const [promptText, setPromptText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();

    const handlePlansUpdated = () => {
      loadPlans();
    };
    window.addEventListener('plans-updated', handlePlansUpdated);
    return () => {
      window.removeEventListener('plans-updated', handlePlansUpdated);
    };
  }, []);

  const loadPlans = async () => {
    setIsLoadingPlans(true);
    try {
      const data = await dataStore.getPlans();
      setPlans(data);
      if (data.length > 0 && !activePlanId) {
        setActivePlanId(data[0].id);
      }
    } catch (e) {
      console.error('Error loading plans:', e);
    } finally {
      setIsLoadingPlans(false);
    }
  };

  // Extract all deadlines from all courses for the picker
  const availableDeadlines = courses.flatMap((c) =>
    c.deadlines
      .filter((d) => d.date)
      .map((d) => ({
        key: `${c.id}|${d.id}`,
        title: d.title,
        date: d.date!,
        courseName: c.name,
        courseId: c.id,
      }))
  );

  const handleSelectDeadline = (key: string) => {
    setSelectedDeadlineKey(key);
    if (key === 'custom') {
      setTitle('');
      setCourseName('');
      setCourseId(null);
      setDueDate('');
    } else {
      const found = availableDeadlines.find((d) => d.key === key);
      if (found) {
        setTitle(found.title);
        setCourseName(found.courseName);
        setCourseId(found.courseId);
        setDueDate(found.date);
      }
    }
  };

  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Please enter an assignment or project title.');
      return;
    }
    if (!dueDate) {
      setFormError('Please select a due date.');
      return;
    }

    setIsGenerating(true);
    setFormError(null);

    try {
      const result = await geminiClient.generatePlan({
        assignmentTitle: title.trim(),
        promptText: promptText.trim(),
        dueDate,
        hoursPerDay: hoursPerDay > 0 ? hoursPerDay : 1,
        currentDate: '2026-10-02',
      });

      const newPlan: AssignmentPlan = {
        id: `plan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: title.trim(),
        courseName: courseName ? courseName.trim() : null,
        courseId,
        promptText: promptText.trim(),
        dueDate,
        hoursPerDay,
        milestones: result.milestones,
        timeWarning: result.timeWarning || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const saved = await dataStore.savePlan(newPlan);
      setPlans((prev) => [saved, ...prev]);
      setActivePlanId(saved.id);
      setIsCreatingNew(false);

      // Reset form
      setTitle('');
      setPromptText('');
      setDueDate('');
      setHoursPerDay(1);
      setSelectedDeadlineKey('custom');
    } catch (err: any) {
      console.error('Plan generation error:', err);
      setFormError(err.message || 'Failed to generate plan. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleMilestone = async (planId: string, milestoneId: string) => {
    try {
      const updated = await dataStore.toggleMilestone(planId, milestoneId);
      if (updated) {
        setPlans((prev) => prev.map((p) => (p.id === planId ? updated : p)));
      }
    } catch (err) {
      console.error('Error toggling milestone:', err);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    try {
      await dataStore.deletePlan(planId);
      const remaining = plans.filter((p) => p.id !== planId);
      setPlans(remaining);
      setActivePlanId(remaining.length > 0 ? remaining[0].id : null);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Error deleting plan:', err);
    }
  };

  const activePlan = plans.find((p) => p.id === activePlanId) || null;

  // Active plan stats
  const completedMilestones = activePlan
    ? activePlan.milestones.filter((m) => m.completed).length
    : 0;
  const totalMilestones = activePlan ? activePlan.milestones.length : 0;
  const progressPercent = totalMilestones > 0
    ? Math.round((completedMilestones / totalMilestones) * 100)
    : 0;

  const totalHours = activePlan
    ? activePlan.milestones.reduce((acc, m) => acc + (m.estimatedHours || 0), 0)
    : 0;
  const completedHours = activePlan
    ? activePlan.milestones
        .filter((m) => m.completed)
        .reduce((acc, m) => acc + (m.estimatedHours || 0), 0)
    : 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-white dark:from-slate-900 via-indigo-50/40 dark:via-indigo-950/40 to-white dark:to-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Assignment Milestone Roadmaps
            </h2>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 max-w-xl leading-relaxed">
            Deconstructs large papers and projects into backward milestones with built-in buffer days, anti-procrastination starting tasks, and realistic time checks.
          </p>
        </div>

        <button
          onClick={() => {
            setIsCreatingNew(true);
            setFormError(null);
          }}
          className="self-start md:self-auto px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Assignment Plan</span>
        </button>
      </div>

      {/* Plan Creation Modal / Card */}
      {isCreatingNew && (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-500/40 shadow-2xl space-y-5 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Target className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                Create Backward Study Plan
              </h3>
            </div>
            <button
              onClick={() => setIsCreatingNew(false)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleGeneratePlan} className="space-y-4">
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Quick Pick from Saved Deadlines */}
            {availableDeadlines.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Pick from Saved Deadlines (or enter custom below):
                </label>
                <select
                  value={selectedDeadlineKey}
                  onChange={(e) => handleSelectDeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="custom">-- Enter a custom assignment --</option>
                  {availableDeadlines.map((dl) => (
                    <option key={dl.key} value={dl.key}>
                      {dl.courseName}: {dl.title} (Due {dl.date})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Title & Due Date Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Assignment Title <span className="text-indigo-600 dark:text-indigo-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Research Paper: Cognitive Biases"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Due Date <span className="text-indigo-600 dark:text-indigo-400">*</span>
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            {/* Daily Hours Commitment */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  How many hours per day can you realistically work on this?
                </label>
                <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                  {hoursPerDay} {hoursPerDay === 1 ? 'hour/day' : 'hours/day'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0.5"
                  max="6"
                  step="0.5"
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <input
                  type="number"
                  min="0.5"
                  max="12"
                  step="0.5"
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(parseFloat(e.target.value) || 1)}
                  className="w-20 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white text-right"
                />
              </div>
            </div>

            {/* Assignment Prompt / Rubric Text */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Pasted Assignment Prompt or Rubric (optional but recommended):
              </label>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={3}
                placeholder="Paste the prompt, word count requirements, rubric points, or specific tasks required..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 resize-y"
              />
            </div>

            {/* Submit Action */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreatingNew(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isGenerating || !title.trim() || !dueDate}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Scheduling Milestones...</span>
                  </>
                ) : (
                  <>
                    <span>Generate Backward Plan</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Plan Tabs / Selector */}
      {plans.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {plans.map((p) => {
            const isSelected = p.id === activePlanId;
            const completedCount = p.milestones.filter((m) => m.completed).length;
            const totalCount = p.milestones.length;
            const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

            return (
              <button
                key={p.id}
                onClick={() => {
                  setActivePlanId(p.id);
                  setShowDeleteConfirm(false);
                }}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-all shrink-0 ${
                  isSelected
                    ? 'bg-white dark:bg-slate-900 border-indigo-500 text-slate-900 dark:text-white ring-1 ring-indigo-500/50 shadow-md'
                    : 'bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-900'
                }`}
              >
                <div className="text-left">
                  <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[180px]">
                    {p.title}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <span>Due {p.dueDate}</span>
                    <span>•</span>
                    <span className={pct === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-700 dark:text-indigo-300'}>
                      {pct}%
                    </span>
                  </div>
                </div>

                <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-700 dark:text-slate-300">
                  {completedCount}/{totalCount}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Active Plan Detail View */}
      {isLoadingPlans ? (
        <div className="py-16 text-center space-y-2">
          <Loader2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-spin mx-auto" />
          <div className="text-xs text-slate-500 dark:text-slate-400">Loading study plans...</div>
        </div>
      ) : activePlan ? (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
          {/* Header of Active Plan */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {activePlan.courseName && (
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    {activePlan.courseName}
                  </span>
                )}
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
                  Due {activePlan.dueDate}
                </span>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  {activePlan.hoursPerDay} hr/day pace
                </span>
              </div>

              <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                {activePlan.title}
              </h3>

              {activePlan.promptText && (
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl line-clamp-2">
                  {activePlan.promptText}
                </p>
              )}
            </div>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors self-end sm:self-start"
              title="Delete this plan"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Delete Confirmation Banner */}
          {showDeleteConfirm && (
            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Delete this roadmap?</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePlan(activePlan.id)}
                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold"
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          {/* Progress Bar Card */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Milestone Progress: {completedMilestones} of {totalMilestones} Completed
              </span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {progressPercent}%
              </span>
            </div>

            <div className="w-full bg-[#dbe6f5] dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-indigo-500 h-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
              <span>Estimated: {completedHours.toFixed(1)} hrs completed / {totalHours.toFixed(1)} hrs total</span>
              <span>Buffer day included before deadline</span>
            </div>
          </div>

          {/* Time Shortage / Warning Callout */}
          {activePlan.timeWarning && (
            <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/80 text-amber-800 dark:text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Time warning: available work hours may be too short</span>
              </div>
              <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
                {activePlan.timeWarning.warningMessage}
              </p>
              <div className="p-2.5 rounded-lg bg-amber-100/30 dark:bg-amber-900/30 border border-amber-200/50 dark:border-amber-800/50 text-[11px] text-amber-900 dark:text-amber-100">
                <span className="font-semibold text-slate-900 dark:text-white">Suggested Action: </span>
                {activePlan.timeWarning.suggestion}
              </div>
            </div>
          )}

          {/* Milestones Checklist */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>Roadmap Milestones ({activePlan.milestones.length})</span>
              <span className="font-normal text-[11px] text-slate-500">
                Click checkbox to check off milestones
              </span>
            </div>

            <div className="space-y-2.5">
              {activePlan.milestones.map((milestone) => (
                <div
                  key={milestone.id}
                  onClick={() => handleToggleMilestone(activePlan.id, milestone.id)}
                  className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 cursor-pointer ${
                    milestone.completed
                      ? 'bg-slate-50/40 dark:bg-slate-950/40 border-slate-200/50 dark:border-slate-800/50 opacity-60'
                      : milestone.isStartHere
                      ? 'bg-emerald-50/20 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/60 hover:border-emerald-600'
                      : 'bg-slate-50/80 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      className="mt-0.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
                    >
                      {milestone.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-600" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {milestone.isStartHere && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            Start Here (&lt; 15 mins)
                          </span>
                        )}
                        <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400">
                          Target: {milestone.targetDate}
                        </span>
                      </div>

                      <div
                        className={`text-sm font-semibold text-slate-900 dark:text-white leading-snug ${
                          milestone.completed ? 'line-through text-slate-500 dark:text-slate-400' : ''
                        }`}
                      >
                        {milestone.title}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-mono text-indigo-700 dark:text-indigo-300 border border-slate-300 dark:border-slate-700">
                      ~{milestone.estimatedHours} {milestone.estimatedHours === 1 ? 'hr' : 'hrs'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 rounded-3xl bg-white/50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-4 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No active assignment plans</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Select any upcoming deadline from your courses to generate a backward roadmap with a 15-minute "Start here" task and buffer days.
            </p>
          </div>
          <button
            onClick={() => setIsCreatingNew(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Your First Plan</span>
          </button>
        </div>
      )}
    </div>
  );
};