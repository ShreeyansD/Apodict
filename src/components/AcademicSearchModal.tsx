import React, { useState } from 'react';
import { 
  X, 
  Search, 
  ExternalLink, 
  
  Loader2, 
  BookOpen, 
  FileText, 
  HelpCircle, 
  GraduationCap 
} from 'lucide-react';
import { Course, AcademicSearchResult } from '../types/academic';
import { geminiClient } from '../services/geminiClient';

interface AcademicSearchModalProps {
  course: Course | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AcademicSearchModal: React.FC<AcademicSearchModalProps> = ({
  course,
  isOpen,
  onClose,
}) => {
  const [query, setQuery] = useState(
    'Find free textbook PDFs, open-access readings, and syllabus materials'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AcademicSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !course) return null;

  const presetQueries = [
    'Find free textbook PDFs, open-access course readings, & syllabus materials',
    'Key exam study guides, formula sheets, and past problem sets',
    'Best YouTube lectures & open MIT/Stanford/Coursera companion courses',
    'Common midterm pitfalls, tricky concepts, and high-yield topics',
  ];

  const handleSearch = async (searchQuery = query) => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    setError(null);
    setQuery(searchQuery);

    try {
      const data = await geminiClient.searchCourseResources(course.name, searchQuery);
      setResult(data);
    } catch (err: any) {
      console.error('Search grounding error:', err);
      setError(err.message || 'Failed to search academic resources.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="academic-search-title"
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="academic-search-title" className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Academic Search Grounding
                </h2>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                  Google Search Live
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Readings and study materials for this course
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Active Course Banner */}
          <div className="p-3 rounded-xl bg-slate-50/60 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: course.color || '#3B82F6' }} />
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{course.name}</span>
            </div>
            {course.code && (
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300">
                {course.code}
              </span>
            )}
          </div>

          {/* Quick Preset Queries */}
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">
              Suggested Academic Grounding Searches:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {presetQueries.map((pq, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSearch(pq)}
                  disabled={isLoading}
                  className="text-left text-xs px-2.5 py-1.5 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300/60 dark:border-slate-700/60 transition-colors"
                >
                  {pq}
                </button>
              ))}
            </div>
          </div>

          {/* Search Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask anything about textbooks, formulas, past exams, or syllabus topics..."
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Search</span>
            </button>
          </form>

          {/* Loading */}
          {isLoading && (
            <div className="p-8 rounded-xl bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <Loader2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-spin mx-auto" />
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                Querying Google Search Grounding for "{course.name}"...
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Synthesizing textbook editions, syllabus resources, and web citations
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-50/40 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs">
              {error}
            </div>
          )}

          {/* Results */}
          {result && !isLoading && (
            <div className="space-y-4">
              {/* Answer Content */}
              <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line space-y-2">
                {result.answer}
              </div>

              {/* Web Sources & Grounding Links */}
              {result.sources && result.sources.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Grounded Web Sources ({result.sources.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {result.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2.5 rounded-lg bg-slate-100/60 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/60 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-between gap-2 transition-colors group"
                      >
                        <span className="text-xs font-medium truncate">{src.title}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};