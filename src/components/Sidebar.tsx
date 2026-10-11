import { ThemeToggle } from './ThemeToggle';
import React, { useState } from 'react';
import { 
  BookOpen, 
  CalendarDays, 
  GraduationCap, 
  Layers, 
  Mic, 
  Menu,
  X,
  HardDrive,
  Bell,
  Calendar,
  FileQuestion
} from 'lucide-react';
import { User } from '../services/firebase';

export type NavTab = 'courses' | 'collision' | 'planner' | 'grades' | 'notifications' | 'calendar' | 'examprep';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  courseCount: number;
  totalDeadlines: number;
  onOpenLiveVoice: () => void;
  onOpenBackupRestore: () => void;
  onOpenDeleteAccount: () => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  user: User | null;
  onSignOut: () => void;
}

interface NavItem {
  key: string;
  label: string;
  icon: any;
  // Tab items switch the main view; action items open a panel or dialog
  tab?: NavTab;
  action?: () => void;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  courseCount,
  totalDeadlines,
  onOpenLiveVoice,
  onOpenBackupRestore,
  onOpenDeleteAccount: _onOpenDeleteAccount,
  isMobileOpen,
  setIsMobileOpen,
  user,
  onSignOut: _onSignOut,
}) => {
  const [avatarError, setAvatarError] = useState(false);

  const userDisplayName = user?.displayName || user?.email?.split('@')[0] || 'Student';
  const userInitial = (userDisplayName?.[0] || user?.email?.[0] || 'S').toUpperCase();

  const navGroups: NavGroup[] = [
    {
      label: 'Semester',
      items: [
        {
          key: 'courses',
          tab: 'courses',
          label: 'Courses',
          icon: BookOpen,
          badge: courseCount > 0 ? `${courseCount}` : undefined,
        },
        { key: 'collision', tab: 'collision', label: 'Collision Map', icon: Layers },
        { key: 'planner', tab: 'planner', label: 'Planner', icon: CalendarDays },
      ],
    },
    {
      label: 'Study',
      items: [
        { key: 'grades', tab: 'grades', label: 'Grades', icon: GraduationCap },
        { key: 'examprep', tab: 'examprep', label: 'Exam Prep', icon: FileQuestion },
        { key: 'voice', action: onOpenLiveVoice, label: 'Voice Advisor', icon: Mic },
      ],
    },
    {
      label: 'Sync & Data',
      items: [
        { key: 'calendar', tab: 'calendar', label: 'Calendar', icon: Calendar },
        { key: 'notifications', tab: 'notifications', label: 'Reminders', icon: Bell },
        { key: 'backup', action: onOpenBackupRestore, label: 'Backup & Restore', icon: HardDrive },
      ],
    },
  ];

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isSelected = !!item.tab && activeTab === item.tab;
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => {
          if (item.tab) onSelectTab(item.tab);
          else if (item.action) item.action();
          setIsMobileOpen(false);
        }}
        aria-label={item.label}
        aria-current={isSelected ? 'page' : undefined}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${
          isSelected
            ? 'bg-indigo-600 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
          <span>{item.label}</span>
        </div>

        {item.badge && (
          <span
            className={`text-[11px] px-2 py-0.5 rounded font-mono font-semibold ${
              isSelected
                ? 'bg-indigo-700 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-xs">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              <span className="text-indigo-600 dark:text-indigo-400">Apodict</span>
            </h1>
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium tracking-wider uppercase">
              Fall 2026 Term
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile User Avatar */}
          <div className="shrink-0" title={userDisplayName}>
            {user?.photoURL && !avatarError ? (
              <img
                src={user.photoURL}
                alt={userDisplayName}
                onError={() => setAvatarError(true)}
                className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {userInitial}
              </div>
            )}
          </div>
          <ThemeToggle />
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Backdrop for mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-xs">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
                <span className="text-indigo-600 dark:text-indigo-400 font-semibold">Apodict</span>
              </h2>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-indigo-950 text-slate-700 dark:text-indigo-300 border border-slate-200 dark:border-indigo-800/60">
                Fall 2026 Term
              </span>
            </div>
            <ThemeToggle className="ml-auto" />
          </div>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto" aria-label="Main navigation">
          {navGroups.map((group, groupIndex) => (
            <div key={group.label} className={groupIndex === 0 ? '' : 'mt-5'}>
              <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {group.label}
              </div>
              <div className="space-y-1">{group.items.map(renderNavItem)}</div>
            </div>
          ))}
        </nav>

        {/* Bottom Student Stats Summary */}
        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 mt-auto">
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="p-2 rounded-lg bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-sm font-bold text-slate-900 dark:text-white">{courseCount}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Courses</div>
            </div>
            <div className="p-2 rounded-lg bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{totalDeadlines}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Deadlines</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};