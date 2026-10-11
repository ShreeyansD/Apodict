import React from 'react';
import { CalendarDays, Clock, Sparkles, CheckCircle2, Zap, ArrowRight, BookOpen } from 'lucide-react';

export const PlannerPlaceholder: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 shadow-xl text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto shadow-lg shadow-indigo-500/10">
          <CalendarDays className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-800/80">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Feature Coming Soon</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          AI Study Planner & Timebox Engine
        </h2>

        <p className="text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
          Transforms heavy syllabus deadlines into manageable 45-minute daily study sprints, spaced repetition flashcard blocks, and adaptive milestone checklists.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-3">
            <Zap className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-white">Reverse Study Roadmaps</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Backwards-plans your prep 14 days before every major exam so you never cram at 3 AM the night before.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3">
            <Clock className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-white">Pomodoro Calendar Sync</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Generates downloadable .ICS calendar events with focused study topics calibrated to your heaviest grade weights.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-3">
            <BookOpen className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-white">Spaced Repetition</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Schedules topic refreshers at 1, 3, 7, and 14-day intervals to lock technical concepts into long-term memory.
          </p>
        </div>
      </div>
    </div>
  );
};
