import React from 'react';
import { Layers, AlertTriangle, Calendar, Flame, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react';

export const CollisionMapPlaceholder: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      {/* Hero Badge */}
      <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 shadow-xl text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto shadow-lg shadow-amber-500/10">
          <Layers className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/80">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Feature Coming Soon in Next Update</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Multi-Course Collision Map
        </h2>

        <p className="text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
          The cross-syllabus congestion detector that flags exam clusters, paper pile-ups, and finals week crunch periods across all your classes before they strike.
        </p>
      </div>

      {/* Feature Preview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-3">
            <Flame className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-white">Cluster Detection</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Automatically calculates stress indices when two or more midterms or papers fall within 48 hours of each other.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-white">Syllabus Conflict Resolver</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Provides formal reschedule letter templates for professors when university policy guarantees exam accommodations for conflicts.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
            <Calendar className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-white">Semester Heatmap</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Visual 15-week timeline gradient showing safe study weeks versus danger zones where 60%+ of your semester grade is determined.
          </p>
        </div>
      </div>

      {/* Mockup Preview Graphic */}
      <div className="p-6 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <span>Sneak Peek: Week 7 Collision Alert</span>
          <span className="text-rose-400">High Risk Zone (45% of Semester GPA)</span>
        </div>

        <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-900/40 space-y-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <div className="text-xs text-rose-200">
              <span className="font-bold">Collision Warning:</span> Oct 22 (CS 106B Midterm, 20%) is 48 hours away from Oct 24 (ECON 50 Midterm, 20%).
            </div>
          </div>
          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden flex">
            <div className="bg-rose-500 w-3/4 h-full" />
            <div className="bg-slate-700 w-1/4 h-full" />
          </div>
        </div>
      </div>
    </div>
  );
};
