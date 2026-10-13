import React from 'react';
import Logo from './Logo';

interface TermsProps {
  onBack?: () => void;
}

const LINK = 'underline text-indigo-600 dark:text-indigo-400 hover:text-indigo-500';

export const TermsAndConditions: React.FC<TermsProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-[#e9f0fa] dark:bg-slate-950 text-[#0f1b33] dark:text-slate-100 antialiased">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <span className="text-xl font-bold tracking-tight text-black dark:text-white">
              Apodict
            </span>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors cursor-pointer"
            >
              &larr; Back to App
            </button>
          )}
        </div>

        <h1 className="text-3xl font-bold mb-2">Terms &amp; Conditions</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Effective Date: October 13, 2026</p>

        <div className="space-y-6 text-sm sm:text-base leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mb-1.5">1. About the Service</h2>
            <p>
              Apodict (&ldquo;the app,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is an academic planning tool
              that organizes course information, deadlines, and grades. The app includes:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Courses:</strong> Syllabus parsing (PDF and text), deadline tracking, and grading breakdowns.</li>
              <li><strong>Collision Map:</strong> Visualization of overlapping deadlines and heavy-workload weeks.</li>
              <li><strong>Planner:</strong> Milestone plans for large assignments and papers, with estimated hours.</li>
              <li><strong>Grades:</strong> Weighted grade tracking and what-if scenarios for target scores.</li>
              <li><strong>Exam Prep:</strong> AI-generated study guides, practice questions, and flashcards from your notes and PDFs.</li>
              <li><strong>Voice Advisor:</strong> Spoken briefings and conversational study coaching powered by Google Gemini.</li>
              <li><strong>Calendar Sync:</strong> Syncing deadlines and milestones to a dedicated Apodict Google Calendar.</li>
              <li><strong>Notifications:</strong> Optional push notification reminders for the deadlines you choose.</li>
              <li><strong>Backup &amp; Restore:</strong> Downloading and restoring a JSON archive of your data.</li>
            </ul>
            <p className="mt-3">
              By using Apodict, you agree to these Terms &amp; Conditions and our{' '}
              <a href="/privacy" className={LINK}>Privacy Policy</a>. If you do not agree, do not use the app.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-1.5">2. Eligibility and Account Responsibility</h2>
            <p>
              You must be at least 13 years old to use Apodict. You sign in with your personal Google account and are responsible for
              keeping it secure and for everything done under it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-1.5">3. Your Content</h2>
            <p>
              You own the syllabi, PDFs, notes, assignments, scores, and other content you upload or enter into Apodict. By providing
              it, you give us a worldwide, non-exclusive, royalty-free license to host, process, and display it only to operate the app
              and deliver its features to you.
            </p>
            <p className="mt-2">
              You confirm that you have the right to submit what you upload and that doing so does not violate any third party&rsquo;s
              rights or your school&rsquo;s policies.
            </p>
          </section>

          <section className="p-5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
            <h2 className="text-xl font-semibold mb-1.5 text-amber-900 dark:text-amber-200">
              4. AI-Assisted Features &amp; Academic Disclaimer
            </h2>
            <p className="text-amber-950 dark:text-amber-100">
              Apodict uses artificial intelligence (Google Gemini) for syllabus extraction, milestone planning, workload analysis, grade
              guidance, Exam Prep, audio briefings, and the Voice Advisor:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5 text-amber-950 dark:text-amber-100">
              <li>
                <strong>AI Can Be Wrong:</strong> AI models can misread complex syllabi, invent dates, misinterpret grading scales, or
                write inaccurate study material or practice answers.
              </li>
              <li>
                <strong>For Planning Only:</strong> Extracted dates, milestones, study suggestions, and grade calculations are estimates
                for personal planning.
              </li>
              <li>
                <strong>Your Responsibility:</strong> You are responsible for checking all dates, exam details, grading weights, and
                requirements against your official syllabus, your school&rsquo;s learning management system (such as Canvas or
                Blackboard), and your instructors.
              </li>
              <li>
                <strong>Not an Official Record:</strong> Apodict is an independent tool and is not affiliated with or endorsed by any
                university, and it is not an official record of your coursework.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-1.5">5. Google Calendar Sync</h2>
            <p>
              When you connect Google Calendar, you allow Apodict to create and manage a separate &ldquo;Apodict&rdquo; calendar and
              fill it with your deadlines and milestones according to the sync mode you choose.
            </p>
            <p className="mt-2">
              Sync depends on Google&rsquo;s services, your network connection, and your sign-in staying valid. Do not rely on calendar
              sync alone to keep track of your academic obligations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-1.5">6. Audio Briefings &amp; Voice Advisor</h2>
            <p>
              The Voice Advisor needs your permission to use your microphone. You agree not to send unlawful, abusive, harassing, or
              harmful audio. Coaching is generated by AI in real time and is not licensed academic counseling or tutoring.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-1.5">7. Notifications</h2>
            <p>
              Push notifications are optional and are off until you turn them on and allow them in your browser or device. You can turn
              them off at any time on the Notifications page or in your device settings.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>
                <strong>Best Effort Only:</strong> Notifications may be late or may not arrive. Delivery depends on your device, browser,
                operating system, battery and focus settings, network connection, notification permissions, and third-party push
                services. On iPhone, notifications work only after you add Apodict to your Home Screen.
              </li>
              <li>
                <strong>Based on Your Saved Data:</strong> Reminders follow the deadlines, dates, time zone, and rules saved in your
                account. If a date was extracted incorrectly or you have not updated it, your reminder will be wrong too.
              </li>
              <li>
                <strong>Do Not Rely on Them Alone:</strong> You remain responsible for tracking your deadlines. Do not depend on
                notifications as your only way to meet an academic obligation.
              </li>
              <li>
                <strong>Message Content:</strong> A notification shows the assignment name, course name, and due date, which may be
                visible on your lock screen depending on your device settings.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-1.5">8. Acceptable Use</h2>
            <p>You agree not to misuse Apodict. In particular, you agree not to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Try to access another user&rsquo;s account, data, or records.</li>
              <li>Interfere with, disrupt, or place an unreasonable load on the app&rsquo;s servers or connected services.</li>
              <li>Reverse engineer, scrape, or send automated requests to the app or its backend endpoints.</li>
              <li>Use the app for any illegal or fraudulent purpose.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-1.5">9. Backups, Changes, and Account Deletion</h2>
            <p>
              Backup &amp; Restore lets you download a JSON archive of your academic records, and we recommend doing so regularly.
            </p>
            <p className="mt-2">
              We may change, suspend, or discontinue any feature at any time without notice. You can stop using the service and
              permanently delete your account and its data at any time with &ldquo;Delete my account&rdquo; in the account menu.
            </p>
          </section>

          <section className="p-5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h2 className="text-xl font-semibold mb-1.5">10. Disclaimers and Limitation of Liability</h2>
            <p className="uppercase text-xs font-bold tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Please read this section carefully
            </p>
            <p>
              APODICT IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
              IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND
              NON-INFRINGEMENT.
            </p>
            <p className="mt-3">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE DEVELOPER AND APODICT ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF DATA, MISSED, LATE, OR UNDELIVERED NOTIFICATIONS, MISSED
              DEADLINES, ACADEMIC PENALTIES, GRADE REDUCTIONS, FAILED EXAMS, LOSS OF SCHOLARSHIPS, OR OTHER LOSSES RESULTING FROM YOUR
              USE OF OR INABILITY TO USE THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-1.5">11. Changes to These Terms</h2>
            <p>
              We may update these terms from time to time. When we do, we will update the &ldquo;Effective Date&rdquo; at the top of
              this page. Continuing to use Apodict after changes are posted means you accept the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Contact Us</h2>
            <p>If you have questions about these Terms &amp; Conditions, contact:</p>
            <div className="mt-3 text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <p><strong>Application:</strong> Apodict</p>
              <p><strong>Developer:</strong> Shreeyans Dodda</p>
              <p>
                <strong>Email:</strong>{' '}
                <a href="mailto:shreeyans21@gmail.com" className={LINK}>shreeyans21@gmail.com</a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};