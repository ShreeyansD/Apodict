import { DeadlineType } from '../types/academic';

export interface MarkerColorStyle {
  label: string;
  badgeClass: string;
  light: {
    bg: string;
    text: string;
    border: string;
  };
  dark: {
    bg: string;
    text: string;
    border: string;
  };
}

/**
 * Shared deadline type tag styling across calm blue/indigo palette:
 * - QUIZ: sky blue
 * - EXAM: deep indigo with stronger fill & border for highest visual weight
 * - HOMEWORK: medium blue
 * - PROJECT & PAPER: teal
 * - OTHER: neutral slate
 * Contrast ratio >= 4.5:1 in both light and dark modes.
 */
export const DEADLINE_TYPE_THEME: Record<DeadlineType, MarkerColorStyle> = {
  exam: {
    label: 'Exam',
    badgeClass: 'bg-[#dfe3fb] text-[#312e81] border-[#8d9bea] font-bold dark:bg-indigo-950/70 dark:text-indigo-200 dark:border-indigo-500',
    light: { bg: '#dfe3fb', text: '#312e81', border: '#8d9bea' },
    dark: { bg: 'rgba(49, 46, 129, 0.7)', text: '#c7d2fe', border: '#6366f1' },
  },
  quiz: {
    label: 'Quiz',
    badgeClass: 'bg-[#def2fd] text-[#075985] border-[#9fd3f2] font-semibold dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-700/70',
    light: { bg: '#def2fd', text: '#075985', border: '#9fd3f2' },
    dark: { bg: 'rgba(8, 47, 73, 0.5)', text: '#7dd3fc', border: 'rgba(3, 105, 161, 0.7)' },
  },
  homework: {
    label: 'Homework',
    badgeClass: 'bg-[#e0e9fb] text-[#1e40af] border-[#a9bff0] font-semibold dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700/70',
    light: { bg: '#e0e9fb', text: '#1e40af', border: '#a9bff0' },
    dark: { bg: 'rgba(23, 37, 84, 0.5)', text: '#93c5fd', border: 'rgba(29, 78, 216, 0.7)' },
  },
  project: {
    label: 'Project',
    badgeClass: 'bg-[#dcf5f0] text-[#0f766e] border-[#8fdcd0] font-semibold dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-700/70',
    light: { bg: '#dcf5f0', text: '#0f766e', border: '#8fdcd0' },
    dark: { bg: 'rgba(4, 47, 46, 0.5)', text: '#5eead4', border: 'rgba(15, 118, 110, 0.7)' },
  },
  paper: {
    label: 'Paper',
    badgeClass: 'bg-[#dcf5f0] text-[#0f766e] border-[#8fdcd0] font-semibold dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-700/70',
    light: { bg: '#dcf5f0', text: '#0f766e', border: '#8fdcd0' },
    dark: { bg: 'rgba(4, 47, 46, 0.5)', text: '#5eead4', border: 'rgba(15, 118, 110, 0.7)' },
  },
  other: {
    label: 'Deliverable',
    badgeClass: 'bg-[#e6ecf5] text-[#334155] border-[#b8c7de] font-semibold dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
    light: { bg: '#e6ecf5', text: '#334155', border: '#b8c7de' },
    dark: { bg: 'rgba(30, 41, 59, 0.6)', text: '#cbd5e1', border: '#334155' },
  },
};

export type DueDateStatus = 'overdue' | 'today' | 'tomorrow' | 'near' | 'later' | 'tbd';

export interface DueDateMarkerConfig {
  pillClass: string;
  iconClass: string;
  hasPill: boolean;
  iconType: 'clock' | 'alert' | 'none';
  light: {
    bg?: string;
    text: string;
    border?: string;
  };
  dark: {
    bg?: string;
    text: string;
    border?: string;
  };
}

/**
 * Shared due-date status marker styles:
 * - Overdue: fill #ffe4e8, border #fda4af, text #9f1239, alert icon
 * - Due today: solid #2563eb with white text & clock icon
 * - Tomorrow: fill #dbeafe, border #93c5fd, text #1e40af, clock icon
 * - 2-3 days away: fill #e3eaf5, border #b8c7de, text #3b4d69, clock icon
 * - 4+ days away: plain muted text with no pill (#526580)
 * Contrast ratio >= 4.5:1 in both light and dark modes.
 */
export const DUE_DATE_STATUS_THEME: Record<DueDateStatus, DueDateMarkerConfig> = {
  overdue: {
    hasPill: true,
    iconType: 'alert',
    pillClass: 'bg-[#ffe4e8] text-[#9f1239] border border-[#fda4af] dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80 font-medium',
    iconClass: 'text-[#9f1239] dark:text-rose-300',
    light: { bg: '#ffe4e8', text: '#9f1239', border: '#fda4af' },
    dark: { bg: 'rgba(76, 5, 25, 0.6)', text: '#fca5a5', border: 'rgba(159, 18, 57, 0.8)' },
  },
  today: {
    hasPill: true,
    iconType: 'clock',
    pillClass: 'bg-[#2563eb] text-white border border-[#2563eb] dark:bg-blue-600 dark:border-blue-600 font-semibold shadow-xs',
    iconClass: 'text-white',
    light: { bg: '#2563eb', text: '#ffffff', border: '#2563eb' },
    dark: { bg: '#2563eb', text: '#ffffff', border: '#2563eb' },
  },
  tomorrow: {
    hasPill: true,
    iconType: 'clock',
    pillClass: 'bg-[#dbeafe] text-[#1e40af] border border-[#93c5fd] dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-700 font-medium',
    iconClass: 'text-[#1e40af] dark:text-sky-300',
    light: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    dark: { bg: 'rgba(8, 47, 73, 0.6)', text: '#7dd3fc', border: '#0369a1' },
  },
  near: {
    // 2 to 3 days away: fill #e3eaf5, border #b8c7de, text #3b4d69, clock icon
    hasPill: true,
    iconType: 'clock',
    pillClass: 'bg-[#e3eaf5] text-[#3b4d69] border border-[#b8c7de] dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700 font-medium',
    iconClass: 'text-[#3b4d69] dark:text-slate-400',
    light: { bg: '#e3eaf5', text: '#3b4d69', border: '#b8c7de' },
    dark: { bg: 'rgba(30, 41, 59, 0.8)', text: '#cbd5e1', border: '#334155' },
  },
  later: {
    // 4+ days away: plain muted text with no pill
    hasPill: false,
    iconType: 'none',
    pillClass: 'text-[#526580] dark:text-slate-400 text-xs font-normal',
    iconClass: 'text-[#526580] dark:text-slate-500',
    light: { text: '#526580' },
    dark: { text: '#94a3b8' },
  },
  tbd: {
    hasPill: false,
    iconType: 'none',
    pillClass: 'text-[#5b6b84] dark:text-slate-500 text-xs font-normal',
    iconClass: '',
    light: { text: '#5b6b84' },
    dark: { text: '#64748b' },
  },
};

export interface DeadlineDateInfo {
  formatted: string;
  relative: string;
  status: DueDateStatus;
  isPast: boolean;
  diffDays: number | null;
}

export function formatDeadlineDateWithTheme(dateStr: string | null): DeadlineDateInfo {
  if (!dateStr) {
    return { formatted: 'Date TBD', relative: 'No date stated', status: 'tbd', isPast: false, diffDays: null };
  }

  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const diffTime = d.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const formatted = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        weekday: 'short',
      });

      if (diffDays < 0) {
        return { formatted, relative: 'Overdue', status: 'overdue', isPast: true, diffDays };
      }
      if (diffDays === 0) {
        return { formatted, relative: 'Due today', status: 'today', isPast: false, diffDays };
      }
      if (diffDays === 1) {
        return { formatted, relative: 'Tomorrow', status: 'tomorrow', isPast: false, diffDays };
      }
      if (diffDays >= 2 && diffDays <= 3) {
        return { formatted, relative: `In ${diffDays} days`, status: 'near', isPast: false, diffDays };
      }
      if (diffDays > 3 && diffDays <= 7) {
        return { formatted, relative: `In ${diffDays} days`, status: 'later', isPast: false, diffDays };
      }
      if (diffDays > 7) {
        return { formatted, relative: `In ${Math.ceil(diffDays / 7)} weeks`, status: 'later', isPast: false, diffDays };
      }
    }
  } catch (e) {
    // fallback
  }

  return { formatted: dateStr, relative: '', status: 'later', isPast: false, diffDays: null };
}
