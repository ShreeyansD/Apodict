import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  BookOpen, 
  Search, 
  CheckCircle2, 
  Calendar, 
  AlertCircle,
  Clock,
  Filter,
  GraduationCap,
  HardDrive,
  ChevronDown,
  LogOut,
  Trash2
} from 'lucide-react';
import { Course, Deadline, ExtractedSyllabusData, GradedCategory } from './types/academic';
import { dataStore } from './services/dataStore';
import { Sidebar, NavTab } from './components/Sidebar';
import { CourseCard } from './components/CourseCard';
import { AddCourseModal } from './components/AddCourseModal';
import { CourseReviewModal } from './components/CourseReviewModal';
import { AudioBriefingModal } from './components/AudioBriefingModal';
import { AcademicSearchModal } from './components/AcademicSearchModal';
import { LiveVoiceAdvisorModal } from './components/LiveVoiceAdvisorModal';
import { BackupRestoreModal } from './components/BackupRestoreModal';
import { DeleteAccountModal } from './components/DeleteAccountModal';
import { SignInScreen } from './components/SignInScreen';
import { CollisionMap } from './components/CollisionMap';
import { Planner } from './components/Planner';
import { Grades } from './components/Grades';
import { Notifications } from './components/Notifications';
import { CalendarSync } from './components/CalendarSync';
import { ExamPrep } from './components/ExamPrep';
import { calendarSyncService } from './services/calendarSyncService';
import { auth, onAuthStateChanged, firebaseSignOut, User } from './services/firebase';

// New Policy Component Imports
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsAndConditions } from './components/TermsAndConditions';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  
  const [activeTab, setActiveTab] = useState<NavTab>('courses');
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // New View Routing State (Supports direct paths: /privacy and /terms)
  const [currentView, setCurrentView] = useState<'app' | 'privacy' | 'terms'>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
      if (path === '/privacy') return 'privacy';
      if (path === '/terms') return 'terms';
    }
    return 'app';
  });

  // Keep the page in step with the browser's Back and Forward buttons
  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
      setCurrentView(path === '/privacy' ? 'privacy' : path === '/terms' ? 'terms' : 'app');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  
  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [reviewModalData, setReviewModalData] = useState<{
      isOpen: boolean;
      initialData: Partial<Course>;
      isEditing: boolean;
  }>({
      isOpen: false,
      initialData: {},
      isEditing: false,
  });
  const [audioModalCourse, setAudioModalCourse] = useState<Course | null>(null);
  const [searchModalCourse, setSearchModalCourse] = useState<Course | null>(null);
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState(false);
  const [isBackupRestoreOpen, setIsBackupRestoreOpen] = useState(false);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [deletionConfirmation, setDeletionConfirmation] = useState<string | null>(null);
  
  // Status notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [courseLoadError, setCourseLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ message: string; retry: () => Promise<void> } | null>(null);
  const [browserDataAvailable, setBrowserDataAvailable] = useState<{ courseCount: number; planCount: number } | null>(null);
  const [isImportingBrowserData, setIsImportingBrowserData] = useState(false);
  
  // Top bar account dropdown
  const [isTopAccountMenuOpen, setIsTopAccountMenuOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const topAccountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isTopAccountMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (topAccountMenuRef.current && !topAccountMenuRef.current.contains(e.target as Node)) {
        setIsTopAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isTopAccountMenuOpen]);

  const userDisplayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Student';
  const userInitial = (userDisplayName?.[0] || currentUser?.email?.[0] || 'S').toUpperCase();

  const showToast = (msg: string) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3500);
  };
  
  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
          setCurrentUser(user);
          setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);
  
  // Listen to Firestore save errors from dataStore
  useEffect(() => {
    const unsubscribe = dataStore.onSaveError((errInfo) => {
          setSaveError(errInfo);
    });
    return () => unsubscribe();
  }, []);
  
  const handleRetrySave = async () => {
    if (!saveError) return;
    const retryFn = saveError.retry;
    try {
      await retryFn();
      setSaveError(null);
      showToast('Saved changes to cloud database.');
    } catch (e) {
      console.error('Retry failed:', e);
    }
  };
  
  const handleSignOut = async () => {
    try {
      await firebaseSignOut(auth);
      dataStore.clearUserCourses();
      dataStore.clearUserPlans();
      dataStore.clearUserNotificationData();
      setCourses([]);
      setBrowserDataAvailable(null);
      showToast('Signed out of Apodict.');
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };
  
  const loadCourses = async () => {
      setIsLoadingCourses(true);
      setCourseLoadError(null);
      try {
        if (currentUser) {
          calendarSyncService.loadSettings().catch(() => {}); // warm up so the Calendar tab opens instantly
          const [loadedCourses, loadedPlans] = await Promise.all([
                    dataStore.loadCoursesForUser(currentUser.uid),
                    dataStore.loadPlansForUser(currentUser.uid),
          ]);
          
          if (loadedCourses && loadedCourses.length > 0) {
            setCourses(loadedCourses);
          } else {
            const browserData = dataStore.getBrowserSavedData();
            if (browserData.courses.length > 0) {
              setCourses(browserData.courses);
            } else {
              setCourses([]);
            }
          }
    
          // Check if this browser holds legacy data and the student account has none yet
          const browserData = dataStore.getBrowserSavedData();
          const bCourseCount = browserData.courses.length;
          const bPlanCount = browserData.plans.length;
          if ((bCourseCount > 0 || bPlanCount > 0) && loadedCourses.length === 0 && loadedPlans.length === 0) {
                    setBrowserDataAvailable({
                      courseCount: bCourseCount,
                      planCount: bPlanCount,
          });
          } else {
                    setBrowserDataAvailable(null);
          }
        } else {
          const [data] = await Promise.all([
                    dataStore.getCourses(),
                    dataStore.getPlans(),
          ]);
          setCourses(data);
        }
      } catch (err) {
        console.error('Error fetching academic data from Firestore:', err);
        setCourseLoadError('Failed to load courses from cloud database.');
      } finally {
        setIsLoadingCourses(false);
      }
  };
  
  const loadUserData = loadCourses;
  
  // Load user data whenever signed-in student changes
  useEffect(() => {
    if (currentUser) {
          loadUserData();
    } else {
          dataStore.clearUserCourses();
          dataStore.clearUserPlans();
          setCourses([]);
          setBrowserDataAvailable(null);
          setIsLoadingCourses(false);
    }
  }, [currentUser]);
  
  const handleImportBrowserData = async () => {
      setIsImportingBrowserData(true);
      try {
        const result = await dataStore.importBrowserDataToAccount();
        setCourses(result.courses);
        setBrowserDataAvailable(null);
        const cCount = result.stats.addedCourses;
        const pCount = result.stats.addedPlans;
        showToast(
          `Imported ${cCount} ${cCount === 1 ? 'course' : 'courses'} and ${pCount} ${
              pCount === 1 ? 'roadmap' : 'roadmaps'
          } into your account.`
        );
      } catch (e) {
        console.error('Import failed:', e);
        showToast('Failed to import browser data.');
      } finally {
        setIsImportingBrowserData(false);
      }
  };
  
  // Syllabus extraction complete -> open review screen
  const handleExtracted = (extracted: ExtractedSyllabusData, rawSyllabus?: string) => {
      setIsAddModalOpen(false);
    
      // Map extracted data into review format
      const initialCategories: GradedCategory[] = extracted.categories.map((c, idx) => ({
        id: `cat-extracted-${idx}`,
        name: c.name,
        weight: c.weight !== undefined ? c.weight : null,
        description: c.description || null,
      }));
    
      const initialDeadlines: Deadline[] = extracted.deadlines.map((d, idx) => ({
        id: `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${idx}`,
        title: d.title,
        date: d.date || null,
        type: d.type || 'homework',
        weight: d.weight !== undefined ? d.weight : null,
        completed: false,
      }));
    
      setReviewModalData({
        isOpen: true,
        initialData: {
          name: extracted.courseName || 'New Course',
          code: extracted.courseCode || null,
          instructor: extracted.instructor || null,
          term: extracted.term || 'Fall 2026',
          rawSyllabus,
          conflicts: extracted.conflicts || [],
          categories: initialCategories,
          deadlines: initialDeadlines,
        },
        isEditing: false,
      });
  };
  
  // Manual create directly without syllabus extraction
  const handleManualCreate = (courseName: string) => {
      setIsAddModalOpen(false);
      setReviewModalData({
        isOpen: true,
        initialData: {
          name: courseName || 'New Course',
          term: 'Fall 2026',
          categories: [
            { id: 'cat-default-1', name: 'Exams', weight: 40 },
            { id: 'cat-default-2', name: 'Homework & Assignments', weight: 30 },
            { id: 'cat-default-3', name: 'Final Project', weight: 30 },
          ],
          deadlines: [],
        },
        isEditing: false,
      });
  };
  
  // Open edit modal for an existing course
  const handleOpenEditCourse = (course: Course) => {
      setReviewModalData({
        isOpen: true,
        initialData: course,
        isEditing: true,
      });
  };
  
  // Save course (from review modal) to dataStore
  const handleSaveCourse = async (
      courseInput: Partial<Course> & {
        name: string;
        categories: GradedCategory[];
        deadlines: Deadline[];
      }
  ) => {
    try {
      const saved = await dataStore.saveCourse(courseInput);
      setReviewModalData({ isOpen: false, initialData: {}, isEditing: false });
      const allCourses = await dataStore.getCourses();
      if (allCourses && allCourses.length > 0) {
        setCourses(allCourses);
      } else {
        await loadCourses();
      }
      showToast(reviewModalData.isEditing ? `Updated "${saved.name}"` : `Added "${saved.name}" to dashboard!`);
      // Live Google Calendar sync
      calendarSyncService.syncCourseDeadlines(saved).catch((e) => console.warn('Background calendar sync notice:', e));
    } catch (err: any) {
      console.error('Error saving course:', err);
      showToast('Failed to save course. Please check inputs.');
    }
  };
  
  // Delete course
  const handleDeleteCourse = async (courseId: string) => {
    const toDelete = courses.find((c) => c.id === courseId);
    try {
      await dataStore.deleteCourse(courseId);
      const remaining = await dataStore.getCourses();
      setCourses(remaining);
      showToast('Course removed from dashboard.');
      // Live Google Calendar sync: remove events for deleted course
      if (toDelete) {
        calendarSyncService.deleteCourseEvents(toDelete).catch((e) => console.warn('Background calendar sync notice:', e));
      }
    } catch (err) {
      console.error('Error deleting course:', err);
    }
  };
  
  // Toggle deadline completion
  const handleToggleDeadline = async (courseId: string, deadlineId: string) => {
    // Optimistic UI update: instantly update UI so user sees immediate feedback
    setCourses((prevCourses) =>
      prevCourses.map((c) => {
        if (c.id !== courseId) return c;
        return {
          ...c,
          deadlines: c.deadlines.map((d) =>
            d.id === deadlineId ? { ...d, completed: !d.completed } : d
          ),
        };
      })
    );

    try {
      const updatedCourse = await dataStore.toggleDeadlineCompleted(courseId, deadlineId);
      if (updatedCourse) {
        const all = await dataStore.getCourses();
        if (all && all.length > 0) {
          setCourses([...all]);
        }
        // Live Google Calendar sync: updates title to "Done: ..." or back
        const dl = updatedCourse.deadlines.find((d) => d.id === deadlineId);
        if (dl) {
          calendarSyncService.syncDeadline(updatedCourse, dl).catch((e) => console.warn('Background calendar sync notice:', e));
        }
      } else {
        const all = await dataStore.getCourses();
        setCourses([...all]);
      }
    } catch (err) {
      console.error('Error toggling deadline:', err);
      const all = await dataStore.getCourses();
      setCourses([...all]);
    }
  };
  
  // Calculate high-level student stats
  const totalDeadlines = courses.reduce((acc, c) => acc + c.deadlines.length, 0);
  const pendingDeadlines = courses.reduce(
    (acc, c) => acc + c.deadlines.filter((d) => !d.completed).length,
    0
  );
  
  // Filter courses by search or tag
  const filteredCourses = courses.filter((course) => {
    const matchesSearch =
      course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (course.code && course.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (course.instructor && course.instructor.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (!matchesSearch) return false;
    
    if (filterType === 'exams') {
      return course.deadlines.some((d) => d.type === 'exam' && !d.completed);
    }
    if (filterType === 'projects') {
      return course.deadlines.some((d) => (d.type === 'project' || d.type === 'paper') && !d.completed);
    }
    return true;
  });
  
  // The Privacy Policy and Terms are public: they must open for anyone, signed in or not,
  // so they are checked before the loading and sign-in screens.
  if (currentView === 'privacy') {
    return (
      <PrivacyPolicy 
        onBack={() => { 
          setCurrentView('app'); 
          window.history.pushState({}, '', '/'); 
        }} 
      />
    );
  }

  if (currentView === 'terms') {
    return (
      <TermsAndConditions 
        onBack={() => { 
          setCurrentView('app'); 
          window.history.pushState({}, '', '/'); 
        }} 
      />
    );
  }

  // Short loading state while checking authentication to prevent sign-in screen flash
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="flex flex-col items-center gap-3 animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-600/30">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mt-2" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Loading your academic workspace...</p>
        </div>
      </div>
    );
  }
  
  // Show sign-in screen to anyone who isn't signed in, before any app content is visible
  if (!currentUser) {
    return <SignInScreen deletionConfirmation={deletionConfirmation} />;
  }

  
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row antialiased">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 text-slate-900 dark:text-white text-xs font-medium shadow-sm flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    
      {/* Responsive Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        courseCount={courses.length}
        totalDeadlines={pendingDeadlines}
        onOpenLiveVoice={() => setIsLiveVoiceOpen(true)}
        onOpenBackupRestore={() => setIsBackupRestoreOpen(true)}
        onOpenDeleteAccount={() => setIsDeleteAccountOpen(true)}
        isMobileOpen={isMobileNavOpen}
        setIsMobileOpen={setIsMobileNavOpen}
        user={currentUser}
        onSignOut={handleSignOut}
      />
    
      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Student Header Bar */}
        <header className="px-6 py-5 border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
                {activeTab === 'courses' && 'Course Center'}
                {activeTab === 'collision' && 'Collision Map'}
                {activeTab === 'planner' && 'Study Planner'}
                {activeTab === 'grades' && 'Grade Simulator'}
                {activeTab === 'notifications' && 'Scheduled Reminders'}
                {activeTab === 'calendar' && 'Google Calendar Sync'}
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700/70">
                Fall 2026
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {activeTab === 'courses' && 'Extract syllabus grading policies and manage critical assignment dates.'}
              {activeTab === 'collision' && 'Flagging overlapping exams and papers across your course load.'}
              {activeTab === 'planner' && 'Dynamic daily study sprints and spaced repetition milestones.'}
              {activeTab === 'grades' && 'Target GPA calculator and final exam weight simulations.'}
              {activeTab === 'notifications' && 'Automated text alerts and deadline reminder configuration.'}
              {activeTab === 'calendar' && 'Sync deadlines and study milestones to your Google Calendar.'}
            </p>
          </div>
    
          {/* Header Actions & Account Control in Top Bar */}
          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 w-full sm:w-auto">
            {activeTab === 'courses' ? (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 transition-all duration-150 ease-in-out shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Course</span>
              </button>
            ) : <div className="sm:hidden" />}

            {currentUser && (
              <div className="relative ml-auto sm:ml-0" ref={topAccountMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsTopAccountMenuOpen(!isTopAccountMenuOpen)}
                  className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700/80 transition-all cursor-pointer text-left shadow-2xs"
                  aria-expanded={isTopAccountMenuOpen}
                  aria-label="User account menu"
                >
                  {currentUser.photoURL && !avatarError ? (
                    <img
                      src={currentUser.photoURL}
                      alt={userDisplayName}
                      onError={() => setAvatarError(true)}
                      className="w-6 h-6 rounded-full object-cover border border-slate-300 dark:border-slate-600 shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0 shadow-2xs">
                      {userInitial}
                    </div>
                  )}
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200 max-w-[140px] truncate hidden sm:inline">
                    {userDisplayName}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400 shrink-0" />
                </button>

                {isTopAccountMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-1.5 z-50 space-y-1 animate-in fade-in duration-150"
                    role="menu"
                  >
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {userDisplayName}
                      </div>
                      {currentUser.email && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {currentUser.email}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsTopAccountMenuOpen(false);
                        handleSignOut();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left"
                    >
                      <LogOut className="w-4 h-4 text-slate-400" />
                      <span>Sign out</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsTopAccountMenuOpen(false);
                        setIsDeleteAccountOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer text-left"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      <span>Delete my account</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>
    
        {/* Tab Content Render */}
        <div className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col justify-between">
          <div>
            {/* Inline Save Error Banner with Retry */}
            {saveError && (
              <div 
                className="p-4 mb-6 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in duration-150"
                role="alert"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="font-medium">{saveError.message}</span>
                </div>
                <button
                  onClick={handleRetrySave}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition-all duration-150 cursor-pointer self-start sm:self-auto shrink-0 shadow-xs"
                >
                  Retry save
                </button>
              </div>
            )}
    
            {/* Inline Load Error Banner with Retry */}
            {courseLoadError && (
              <div 
                className="p-4 mb-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-900 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in duration-150"
                role="alert"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span className="font-medium">{courseLoadError}</span>
                </div>
                <button
                  onClick={loadUserData}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium transition-all duration-150 cursor-pointer self-start sm:self-auto shrink-0 shadow-xs"
                >
                  Retry
                </button>
              </div>
            )}
    
            {/* Inline Browser Data Import Panel */}
            {browserDataAvailable && (
              <div 
                className="p-4 mb-6 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-950 dark:text-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in duration-150"
                role="status"
              >
                <div className="flex items-center gap-2.5">
                  <HardDrive className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="font-medium">
                    We found data saved in this browser ({browserDataAvailable.courseCount} {browserDataAvailable.courseCount === 1 ? 'course' : 'courses'}, {browserDataAvailable.planCount} {browserDataAvailable.planCount === 1 ? 'roadmap' : 'roadmaps'}). Import it into your account?
                  </span>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => setBrowserDataAvailable(null)}
                    className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150 font-medium cursor-pointer"
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    onClick={handleImportBrowserData}
                    disabled={isImportingBrowserData}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium transition-all duration-150 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isImportingBrowserData ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'courses' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Semester KPI Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-5 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
                      <span className="text-xs font-medium">Enrolled Courses</span>
                      <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white tabular-nums">{courses.length}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Syllabi configured</div>
                  </div>
            
                  <div className="p-5 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
                      <span className="text-xs font-medium">Pending Deadlines</span>
                      <Calendar className="w-4 h-4 text-[#0369a1] dark:text-sky-400" />
                    </div>
                    <div className="text-2xl font-semibold tracking-tight text-[#0369a1] dark:text-sky-400 tabular-nums">{pendingDeadlines}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Across all classes</div>
                  </div>
            
                  <div className="col-span-2 md:col-span-1 p-5 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
                      <span className="text-xs font-medium">Exams Scheduled</span>
                      <GraduationCap className="w-4 h-4 text-[#4338ca] dark:text-indigo-400" />
                    </div>
                    <div className="text-2xl font-semibold tracking-tight text-[#4338ca] dark:text-indigo-400 tabular-nums">
                      {courses.reduce(
                        (acc, c) => acc + c.deadlines.filter((d) => d.type === 'exam' && !d.completed).length,
                        0
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Midterms &amp; finals</div>
                  </div>
                </div>
            
                {/* Search & Filter Toolbar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by course name, code, or professor..."
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-white dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150"
                    />
                  </div>
            
                  {/* Segmented Filter Control */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                    <button
                      onClick={() => setFilterType('all')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
                        filterType === 'all'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      All Courses
                    </button>
                    <button
                      onClick={() => setFilterType('exams')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
                        filterType === 'exams'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Has Exams
                    </button>
                    <button
                      onClick={() => setFilterType('projects')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
                        filterType === 'projects'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Projects &amp; Papers
                    </button>
                  </div>
                </div>
            
                {/* Course Cards Grid */}
                {isLoadingCourses ? (
                  <div className="py-20 text-center space-y-3">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <div className="text-xs text-slate-500 dark:text-slate-400">Loading your course center...</div>
                  </div>
                ) : filteredCourses.length === 0 ? (
                  <div className="p-12 rounded-3xl bg-white/50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-4 max-w-lg mx-auto my-8">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">No courses match your query</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {courses.length === 0
                          ? 'Add your first course syllabus or load sample college syllabi to get started.'
                          : 'Try adjusting your search keywords or filter criteria.'}
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30"
                      >
                        Add Course
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredCourses.map((course) => (
                      <CourseCard
                        key={course.id}
                        course={course}
                        onEdit={handleOpenEditCourse}
                        onDelete={handleDeleteCourse}
                        onToggleDeadline={handleToggleDeadline}
                        onOpenAudioBriefing={setAudioModalCourse}
                        onOpenAcademicSearch={setSearchModalCourse}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {activeTab === 'collision' && (
              <CollisionMap
                courses={courses}
                onOpenAddCourse={() => setIsAddModalOpen(true)}
                onToggleDeadline={handleToggleDeadline}
              />
            )}
            {activeTab === 'planner' && (
              <Planner
                courses={courses}
                onOpenAddCourse={() => setIsAddModalOpen(true)}
              />
            )}
            {activeTab === 'examprep' && (
              <ExamPrep
                courses={courses}
                onOpenCourses={() => setActiveTab('courses')}
                onOpenAddCourse={() => setIsAddModalOpen(true)}
              />
            )}
            {activeTab === 'grades' && (
              <Grades
                courses={courses}
                onOpenAddCourse={() => setIsAddModalOpen(true)}
                onCoursesUpdated={(updated) => setCourses(updated)}
              />
            )}
            {activeTab === 'notifications' && (
              <Notifications
                courses={courses}
                onOpenAddCourse={() => setIsAddModalOpen(true)}
              />
            )}
            {activeTab === 'calendar' && (
              <CalendarSync
                courses={courses}
                onCoursesUpdated={(updated) => setCourses(updated)}
              />
            )}
          </div>

          {/* Clean, Non-intrusive App Footer */}
          <footer className="mt-12 py-6 border-t border-slate-200/60 dark:border-slate-800/60 text-center text-[11px] text-slate-500 dark:text-slate-400 transition-colors">
            <div className="flex justify-center items-center space-x-4">
              <span>&copy; {new Date().getFullYear()} Apodict</span>
              <span className="text-slate-300 dark:text-slate-750">•</span>
              <button
                onClick={() => { 
                  setCurrentView('privacy'); 
                  window.history.pushState({}, '', '/privacy'); 
                }}
                className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors cursor-pointer font-medium"
              >
                Privacy Policy
              </button>
              <span className="text-slate-300 dark:text-slate-750">•</span>
              <button
                onClick={() => { 
                  setCurrentView('terms'); 
                  window.history.pushState({}, '', '/terms'); 
                }}
                className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors cursor-pointer font-medium"
              >
                Terms of Service
              </button>
            </div>
          </footer>
        </div>
      </main>
    
      {/* Modals */}
      <AddCourseModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onExtracted={handleExtracted}
        onManualCreate={handleManualCreate}
      />
    
      <CourseReviewModal
        isOpen={reviewModalData.isOpen}
        onClose={() => setReviewModalData({ isOpen: false, initialData: {}, isEditing: false })}
        onSave={handleSaveCourse}
        initialData={reviewModalData.initialData}
        isEditingExisting={reviewModalData.isEditing}
      />
    
      <AudioBriefingModal
        isOpen={!!audioModalCourse}
        course={audioModalCourse}
        onClose={() => setAudioModalCourse(null)}
      />
    
      <AcademicSearchModal
        isOpen={!!searchModalCourse}
        course={searchModalCourse}
        onClose={() => setSearchModalCourse(null)}
      />
    
      <LiveVoiceAdvisorModal
        isOpen={isLiveVoiceOpen}
        onClose={() => setIsLiveVoiceOpen(false)}
        courses={courses}
      />
    
      <BackupRestoreModal
        isOpen={isBackupRestoreOpen}
        onClose={() => setIsBackupRestoreOpen(false)}
        onRestoreSuccess={(updated) => {
          setCourses(updated);
          showToast('Data restored successfully!');
        }}
      />
    
      <DeleteAccountModal
        isOpen={isDeleteAccountOpen}
        onClose={() => setIsDeleteAccountOpen(false)}
        user={currentUser}
        onAccountDeleted={() => {
          setIsDeleteAccountOpen(false);
          setCurrentUser(null);
          setCourses([]);
          setDeletionConfirmation('Your account and all saved courses, roadmaps, and grades have been permanently deleted.');
          showToast('Account permanently deleted.');
        }}
      />
    </div>
  );
}