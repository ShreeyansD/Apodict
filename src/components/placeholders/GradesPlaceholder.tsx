import React from 'react';
import { GraduationCap, Percent, Sparkles, TrendingUp, Target, Calculator } from 'lucide-react';

export const GradesPlaceholder: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 shadow-xl text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto shadow-lg shadow-emerald-500/10">
          <GraduationCap className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Feature Coming Soon</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Target Grade & What-If Simulator
        </h2>

        <p className="text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
          Leverages your extracted syllabus weights to simulate final exam scores, calculate minimum passing thresholds, and optimize where your study hours will produce the highest GPA return.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
            <Calculator className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-white">What-If Calculator</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Drag score sliders on upcoming assignments to calculate the exact percentage required on the final exam to secure an A or B+.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3">
            <Target className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-white">GPA Goal Tracker</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Monitors semester GPA progress against graduate school, honors society, or scholarship minimum requirement benchmarks.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
            <TrendingUp className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-white">Curve & Drop Simulation</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Factors in syllabus policies like "lowest 2 quizzes dropped" and historic department grade distributions.
          </p>
        </div>
      </div>
    </div>
  );
};
