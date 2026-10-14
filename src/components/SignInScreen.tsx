import React, { useState, useRef, useEffect } from 'react';
import Logo from './Logo';
import {
  BookOpen,
  AlertCircle,
  Loader2,
  CheckCircle2,
  UploadCloud,
  FileCheck2,
  CalendarCheck2,
  Calendar,
  Layers,
  Calculator,
  ShieldCheck,
  ArrowRight,
  Lock,
  Flame,
  FileText,
  CalendarRange,
  Milestone,
  BarChart3,
  ArrowLeftRight,
  Sparkles,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { auth, googleAuthProvider, signInWithPopup, User } from '../services/firebase';

interface SignInScreenProps {
  onSignInSuccess?: (user: User) => void;
  deletionConfirmation?: string | null;
}

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  yOffset?: number;
  blur?: boolean;
}

/**
 * Smooth scroll reveal component that fades elements in
 * gracefully as they approach or enter the viewport.
 */
const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  className = '',
  delay = 0,
  duration = 1100,
  yOffset = 0,
  blur = false,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        threshold: 0.01,
        rootMargin: '0px 0px 80px 0px',
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: yOffset !== 0 ? (isVisible ? 'translateY(0)' : `translateY(${yOffset}px)`) : undefined,
        filter: blur ? (isVisible ? 'blur(0px)' : 'blur(4px)') : undefined,
        transition: `opacity ${duration}ms cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms${
          yOffset !== 0 ? `, transform ${duration}ms cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms` : ''
        }${blur ? `, filter ${duration}ms cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms` : ''}`,
        willChange: yOffset !== 0 ? 'opacity, transform' : 'opacity',
      }}
    >
      {children}
    </div>
  );
};

export const SignInScreen: React.FC<SignInScreenProps> = ({ deletionConfirmation }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await signInWithPopup(auth, googleAuthProvider);
      // onAuthStateChanged in parent will update state automatically
    } catch (error: any) {
      console.error('Firebase Google Sign-in error:', error);

      const errorCode = error?.code;
      if (errorCode === 'auth/popup-blocked') {
        setErrorMessage(
          'The sign-in popup was blocked by your browser. Please allow popups for this site or open the app in its own tab and try again.'
        );
      } else if (errorCode === 'auth/popup-closed-by-user') {
        setErrorMessage(
          'Sign-in was cancelled because the popup window was closed before completing. Click "Sign in with Google" to try again.'
        );
      } else if (errorCode === 'auth/cancelled-popup-request') {
        setErrorMessage(
          'Another sign-in popup was requested. Please try clicking "Sign in with Google" again.'
        );
      } else if (errorCode === 'auth/network-request-failed') {
        setErrorMessage(
          'A network error occurred while connecting to Google. Please check your internet connection and try again.'
        );
      } else {
        setErrorMessage(
          'Sign-in could not be completed. If popups are restricted in this preview frame, please open the app in its own tab and try again.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderGoogleButton = (size: 'default' | 'large' = 'default') => (
    <button
      onClick={handleGoogleSignIn}
      disabled={isLoading}
      className={`group relative inline-flex items-center justify-center gap-3 font-semibold rounded-xl transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed ${
        size === 'large'
          ? 'px-6 py-3.5 text-base bg-indigo-600 hover:bg-indigo-500 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 shadow-indigo-600/25 hover:shadow-indigo-600/35'
          : 'px-5 py-3 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-white'
      }`}
      aria-label="Sign in with Google"
    >
      {isLoading ? (
        <>
          <Loader2 className={`w-4 h-4 animate-spin ${size === 'large' ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`} />
          <span>Signing in...</span>
        </>
      ) : (
        <>
          <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center p-0.5 shrink-0 shadow-xs">
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
          </div>
          <span className={size === 'large' ? 'text-white font-medium' : ''}>Sign in with Google</span>
          <ArrowRight className={`w-4 h-4 transition-transform group-hover:translate-x-0.5 ${size === 'large' ? 'text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`} />
        </>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased selection:bg-indigo-500/20 selection:text-indigo-700 dark:selection:text-indigo-300">
      {/* Sticky Navigation Header */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/80 dark:bg-slate-950/80 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <span className="text-base font-bold tracking-tight text-black dark:text-white">
              Apodict
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <ThemeToggle />
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shadow-xs disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Sign in</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Landing Page Content */}
      <main className="flex-1">
        {/* Banner: Deletion Confirmation (if returning from account deletion) */}
        {deletionConfirmation && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
            <div
              className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm flex items-start gap-3 shadow-xs animate-in fade-in duration-200"
              role="status"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-medium">
                {deletionConfirmation}
              </div>
            </div>
          </div>
        )}

        {/* Global Error Banner (if Google sign-in fails or popup blocked) */}
        {errorMessage && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
            <div
              className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex items-start gap-3 shadow-xs animate-in fade-in duration-200"
              role="alert"
            >
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <span className="font-medium">{errorMessage}</span>
                <div className="mt-2">
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold underline hover:text-amber-950 dark:hover:text-amber-100"
                  >
                    Open app in its own tab &rarr;
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 1. Hero Section with Modern, Consistent Color Gradient */}
        <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-32 border-b border-slate-200/70 dark:border-slate-800/70 bg-gradient-to-b from-indigo-50/80 via-slate-50/40 to-transparent dark:from-indigo-950/30 dark:via-slate-950 dark:to-slate-950">
          {/* Consistent multi-layer atmospheric gradient lighting */}
          <div 
            className="absolute inset-0 bg-[radial-gradient(ellipse_90%_65%_at_50%_-15%,rgba(99,102,241,0.22),transparent_70%)] dark:bg-[radial-gradient(ellipse_90%_65%_at_50%_-15%,rgba(99,102,241,0.30),transparent_70%)] pointer-events-none -z-10" 
            aria-hidden="true"
          />
          <div 
            className="absolute top-1/4 -left-24 w-96 h-96 bg-sky-400/15 dark:bg-sky-500/10 rounded-full blur-3xl pointer-events-none -z-10" 
            aria-hidden="true"
          />
          <div 
            className="absolute top-1/3 -right-24 w-96 h-96 bg-indigo-500/15 dark:bg-violet-600/15 rounded-full blur-3xl pointer-events-none -z-10" 
            aria-hidden="true"
          />

          {/* Subtle geometric alignment grid texture */}
          <div
            className="absolute inset-0 bg-[linear-gradient(to_right,#6366f10a_1px,transparent_1px),linear-gradient(to_bottom,#6366f10a_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_75%_60%_at_50%_40%,#000_65%,transparent_100%)] pointer-events-none -z-10"
            aria-hidden="true"
          />

          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
            <ScrollReveal delay={50} yOffset={0}>
              <span className="block text-xs uppercase font-bold tracking-wider text-indigo-600 dark:text-indigo-400 mb-3 sm:mb-4">
                Syllabus planner for college students
              </span>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.12]">
                A planner that turns your syllabi into{' '}
                <span className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500 dark:from-indigo-400 dark:via-indigo-300 dark:to-sky-400 bg-clip-text text-transparent [filter:drop-shadow(0_0_6px_rgba(99,102,241,0.06))] dark:[filter:drop-shadow(0_0_8px_rgba(129,140,248,0.10))]">
                  one clear semester plan
                </span>
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={120} yOffset={0}>
              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
                Stop digging through dozens of course PDFs. Extract assignment dates, identify heavy crunch weeks, break down big projects, and sync straight to Google Calendar.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={180} yOffset={0}>
              <div className="pt-4 flex flex-col items-center justify-center space-y-3">
                {renderGoogleButton('large')}
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your data is saved to your own account. Free to use with no setup required.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* 2. "How it works" in 3 steps */}
        <section className="py-16 sm:py-24 border-b border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollReveal delay={0} yOffset={0} className="text-center max-w-2xl mx-auto mb-12 sm:mb-16 space-y-2">
              <span className="text-xs uppercase font-bold tracking-wider text-indigo-600 dark:text-indigo-400">
                Three Simple Steps
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                How Apodict works
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Go from a folder of confusing PDF syllabi to a synchronized master timeline in minutes.
              </p>
            </ScrollReveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 relative">
              {/* Step 1 */}
              <ScrollReveal delay={0} yOffset={0} className="h-full">
                <div className="relative p-6 sm:p-7 rounded-2xl bg-white dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all duration-300 flex flex-col justify-between h-full group hover:-translate-y-1">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <span className="text-2xl font-black text-slate-300 dark:text-slate-700">01</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                      1. Upload your syllabi
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Drop in PDF syllabi or paste course text for any class. Our Gemini parser reads through tables, schedules, and policies automatically.
                    </p>
                  </div>
                  <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/60 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Supports multi-page PDFs &amp; text</span>
                  </div>
                </div>
              </ScrollReveal>

              {/* Step 2 */}
              <ScrollReveal delay={80} yOffset={0} className="h-full">
                <div className="relative p-6 sm:p-7 rounded-2xl bg-white dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all duration-300 flex flex-col justify-between h-full group hover:-translate-y-1">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <FileCheck2 className="w-5 h-5" />
                      </div>
                      <span className="text-2xl font-black text-slate-300 dark:text-slate-700">02</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                      2. Review what AI extracted
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Check your structured dates, exam categories, and grade weighting in an intuitive table. You can fine-tune or add any item in a single click.
                    </p>
                  </div>
                  <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/60 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Weights verify automatically to 100%</span>
                  </div>
                </div>
              </ScrollReveal>

              {/* Step 3 */}
              <ScrollReveal delay={160} yOffset={0} className="h-full">
                <div className="relative p-6 sm:p-7 rounded-2xl bg-white dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all duration-300 flex flex-col justify-between h-full group hover:-translate-y-1">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <CalendarCheck2 className="w-5 h-5" />
                      </div>
                      <span className="text-2xl font-black text-slate-300 dark:text-slate-700">03</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                      3. Plan and track your semester
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      See upcoming exams on a unified collision map, break long papers into milestones, calculate target grades, and sync with your Google Calendar.
                    </p>
                  </div>
                  <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/60 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Seamless sync across your devices</span>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* 3. Features Grid with Subtle, Professional Iconography & Illustrations */}
        <section className="py-16 sm:py-24 border-b border-slate-200/60 dark:border-slate-800/60">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollReveal delay={0} yOffset={0} className="text-center max-w-2xl mx-auto mb-12 sm:mb-16 space-y-2">
              <span className="text-xs uppercase font-bold tracking-wider text-indigo-600 dark:text-indigo-400">
                Core Capabilities
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Everything you need to navigate college courses
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Syllabus parsing, deadline tracking, a grade calculator, exam prep, and reminders, built to eliminate surprises and reduce academic stress.
              </p>
            </ScrollReveal>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Feature 1: Courses */}
              <ScrollReveal delay={0} yOffset={0} className="h-full">
                <div className="group relative overflow-hidden p-6 rounded-2xl bg-white dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all duration-300 hover:-translate-y-1 h-full flex flex-col justify-between">
                  {/* Subtle Ghost Watermark Illustration */}
                  <BookOpen className="w-28 h-28 absolute -bottom-3 -right-3 text-indigo-600/5 dark:text-indigo-400/5 pointer-events-none group-hover:scale-105 transition-transform duration-300" aria-hidden="true" />

                  <div className="space-y-3 relative z-10">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-2xs">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                        <FileText className="w-3.5 h-3.5" />
                        <span>AI Extraction</span>
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Courses
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      AI syllabus extraction pulls out every deadline, grading category, professor contact, and policy without manual typing.
                    </p>
                  </div>
                </div>
              </ScrollReveal>

              {/* Feature 2: Collision Map */}
              <ScrollReveal delay={60} yOffset={0} className="h-full">
                <div className="group relative overflow-hidden p-6 rounded-2xl bg-white dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-amber-300 dark:hover:border-amber-700/60 transition-all duration-300 hover:-translate-y-1 h-full flex flex-col justify-between">
                  {/* Subtle Ghost Watermark Illustration */}
                  <Flame className="w-28 h-28 absolute -bottom-3 -right-3 text-amber-600/5 dark:text-amber-400/5 pointer-events-none group-hover:scale-105 transition-transform duration-300" aria-hidden="true" />

                  <div className="space-y-3 relative z-10">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200/60 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-2xs">
                        <Flame className="w-5 h-5" />
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        <CalendarRange className="w-3.5 h-3.5" />
                        <span>Conflict Radar</span>
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Collision Map
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Pinpoints high-stakes weeks where multiple exams, papers, or projects overlap so you never get blindsided by a crunch week.
                    </p>
                  </div>
                </div>
              </ScrollReveal>

              {/* Feature 3: Planner */}
              <ScrollReveal delay={120} yOffset={0} className="h-full">
                <div className="group relative overflow-hidden p-6 rounded-2xl bg-white dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all duration-300 hover:-translate-y-1 h-full flex flex-col justify-between">
                  {/* Subtle Ghost Watermark Illustration */}
                  <Layers className="w-28 h-28 absolute -bottom-3 -right-3 text-indigo-600/5 dark:text-indigo-400/5 pointer-events-none group-hover:scale-105 transition-transform duration-300" aria-hidden="true" />

                  <div className="space-y-3 relative z-10">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-2xs">
                        <Layers className="w-5 h-5" />
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                        <Milestone className="w-3.5 h-3.5" />
                        <span>Step Milestones</span>
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Planner
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Breaks large, overwhelming assignments into realistic step-by-step milestones with estimated study hours and target dates.
                    </p>
                  </div>
                </div>
              </ScrollReveal>

              {/* Feature 4: Grades */}
              <ScrollReveal delay={0} yOffset={0} className="h-full">
                <div className="group relative overflow-hidden p-6 rounded-2xl bg-white dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-all duration-300 hover:-translate-y-1 h-full flex flex-col justify-between">
                  {/* Subtle Ghost Watermark Illustration */}
                  <Calculator className="w-28 h-28 absolute -bottom-3 -right-3 text-emerald-600/5 dark:text-emerald-400/5 pointer-events-none group-hover:scale-105 transition-transform duration-300" aria-hidden="true" />

                  <div className="space-y-3 relative z-10">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-2xs">
                        <Calculator className="w-5 h-5" />
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <BarChart3 className="w-3.5 h-3.5" />
                        <span>Weight Simulator</span>
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Grades
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Track earned scores across weighted categories and simulate what-if scenarios to know exactly what you need on upcoming finals.
                    </p>
                  </div>
                </div>
              </ScrollReveal>

              {/* Feature 5: Calendar */}
              <ScrollReveal delay={60} yOffset={0} className="h-full">
                <div className="group relative overflow-hidden p-6 rounded-2xl bg-white dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-sky-300 dark:hover:border-sky-700/60 transition-all duration-300 hover:-translate-y-1 h-full flex flex-col justify-between">
                  {/* Subtle Ghost Watermark Illustration */}
                  <Calendar className="w-28 h-28 absolute -bottom-3 -right-3 text-sky-600/5 dark:text-sky-400/5 pointer-events-none group-hover:scale-105 transition-transform duration-300" aria-hidden="true" />

                  <div className="space-y-3 relative z-10">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200/60 dark:border-sky-800/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-2xs">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span>Google Sync</span>
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Calendar
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Sync all dated course deadlines directly into Google Calendar with flexible replacement, add modes, and clean duplicate protection.
                    </p>
                  </div>
                </div>
              </ScrollReveal>

              {/* Feature 6: And more */}
              <ScrollReveal delay={120} yOffset={0} className="h-full">
                <div className="group relative overflow-hidden p-6 rounded-2xl bg-white dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-slate-400 dark:hover:border-slate-600 transition-all duration-300 hover:-translate-y-1 h-full flex flex-col justify-between">
                  {/* Subtle Ghost Watermark Illustration */}
                  <Sparkles className="w-28 h-28 absolute -bottom-3 -right-3 text-slate-600/5 dark:text-slate-400/5 pointer-events-none group-hover:scale-105 transition-transform duration-300" aria-hidden="true" />

                  <div className="space-y-3 relative z-10">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center shadow-2xs">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>More Tools</span>
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      And more
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Exam Prep with study guides, practice questions, and flashcards. A Voice Advisor for spoken briefings and coaching. Push notification reminders for your deadlines. And Backup &amp; Restore to keep your data safe.
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* 4. "Your Data" Note Section */}
        <section className="py-16 sm:py-20 border-b border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollReveal delay={0} yOffset={0}>
              <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Your Data, Strictly Guarded</span>
                    <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Sign-in is handled securely through Google. Your courses, grades, and schedules are stored in your own account and never sold or shared for advertising. When syncing with Google Calendar, the app only creates and updates its dedicated <strong>Apodict</strong> calendar—it never views or alters your personal events or private schedules.
                  </p>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* 5. Bottom Sign-in Call to Action */}
        <section className="py-16 sm:py-24 text-center">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <ScrollReveal delay={0} yOffset={0}>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Ready to take control of your semester?
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={60} yOffset={0}>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
                Sign in with your Google account and organize all your classes in one place.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={120} yOffset={0}>
              <div className="pt-2 flex flex-col items-center justify-center space-y-3">
                {renderGoogleButton('large')}
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Secure authentication powered by Google &amp; Firebase
                </p>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full py-8 border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <span className="font-semibold text-black dark:text-white">Apodict</span>
          </div>

          <div className="flex items-center gap-6">
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 underline transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 underline transition-colors"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
