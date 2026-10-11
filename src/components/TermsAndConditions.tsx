import React from 'react';

interface TermsProps {
  onBack?: () => void;
}

const LINK = 'underline text-indigo-600 dark:text-indigo-400 hover:text-indigo-500';

export const TermsAndConditions: React.FC<TermsProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-[#e9f0fa] dark:bg-slate-950 text-[#0f1b33] dark:text-slate-100 antialiased">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors cursor-pointer"
          >
            &larr; Back to Apodict
          </button>
        )}

        <h1 className="text-3xl font-bold mb-2">Terms &amp; Conditions</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Effective Date: October 9, 2026</p>

        <div className="space-y-10 text-sm sm:text-base leading-relaxed">
          {/* Part 1: Using Apodict */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Part 1: Using Apodict</h2>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">1. About the Service</h3>
              <p>
                Apodict (&ldquo;the app,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is an academic workflow
                platform that organizes course information, deadlines, and grades. Apodict is operated by{' '}
                <strong>Shreeyans Dodda</strong>, which is our registered brand name. The app provides:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong>Course Center:</strong> Syllabus parsing (PDF and text), deadline tracking, and grading category breakdown.</li>
                <li><strong>Collision Map:</strong> Identification and visualization of overlapping exams and high-workload crunch weeks.</li>
                <li><strong>Milestone Planner:</strong> Deconstructing large assignments and papers into milestone roadmaps with estimated hours.</li>
                <li><strong>Grades Calculator:</strong> Weighted GPA tracking and what-if simulation for target final exam scores.</li>
                <li><strong>Google Calendar Sync:</strong> Synchronizing course deadlines and milestones to a dedicated Apodict Google Calendar.</li>
                <li><strong>AI Audio Briefings &amp; Voice Advisor:</strong> Real-time spoken briefings and conversational study coaching powered by Google Gemini.</li>
                <li><strong>Academic Search Grounding:</strong> Exploration of course-related reference materials and study topics.</li>
                <li><strong>Backup &amp; Restore:</strong> Local JSON archive download and restoration.</li>
                <li><strong>Deadline Text Reminders:</strong> Optional automated SMS deadline notifications via Twilio.</li>
              </ul>
              <p className="mt-3">
                By accessing or using Apodict, you agree to be bound by these Terms &amp; Conditions and our{' '}
                <a href="/privacy" className={LINK}>Privacy Policy</a>. If you do not agree to these terms, do not use the app.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">2. Eligibility and Account Responsibility</h3>
              <p>
                You must be at least 13 years old to use Apodict. You authenticate using your personal Google account. You are responsible
                for maintaining the confidentiality and security of your account, as well as for all actions performed under your account.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">3. Your Content and Syllabus Uploads</h3>
              <p>
                You retain complete ownership of all syllabi, PDF files, course notes, assignments, scores, and personal data that you upload
                or input into Apodict. By providing this content, you grant us a worldwide, non-exclusive, royalty-free license to host,
                process, analyze, and display your content solely for the purpose of operating the app and delivering its features to you.
              </p>
              <p className="mt-2">
                You represent and warrant that you possess all necessary rights and permissions to submit any materials you upload, and that
                doing so does not violate the intellectual property rights or policies of any third party or educational institution.
              </p>
            </section>

            <section className="p-5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
              <h3 className="text-lg font-semibold mb-1.5 text-amber-900 dark:text-amber-200">
                4. AI-Assisted Features &amp; Academic Disclaimer
              </h3>
              <p className="text-amber-950 dark:text-amber-100">
                Apodict incorporates artificial intelligence (including Google Gemini models) for multimodal syllabus extraction, milestone
                scheduling, workload collision analysis, grade focus guidance, audio briefings, and the interactive Voice Advisor:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1.5 text-amber-950 dark:text-amber-100">
                <li>
                  <strong>AI Inaccuracies:</strong> Generative AI models can occasionally make errors, misinterpret complex or non-standard
                  syllabus tables, hallucinate deadline dates, or misread grading scales.
                </li>
                <li>
                  <strong>Informational Purpose Only:</strong> All extracted dates, milestone deadlines, study recommendations, and grade
                  calculations are estimates provided strictly for informational and personal planning purposes.
                </li>
                <li>
                  <strong>Student Responsibility:</strong> You are solely responsible for cross-checking all dates, exam locations, grading
                  weights, and assignment requirements against your official course syllabus, university learning management systems
                  (such as Canvas or Blackboard), and instructions given by your professors.
                </li>
                <li>
                  <strong>Not an Institutional Record:</strong> Apodict is an independent planning tool and is not affiliated with,
                  endorsed by, or an official record of your university or academic department.
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">5. Google Calendar Synchronization</h3>
              <p>
                When you connect Google Calendar, you authorize Apodict to create, update, and manage a secondary &ldquo;Apodict&rdquo;
                calendar and to populate it with course deadlines and milestone events based on your chosen sync mode (Replace or Add).
              </p>
              <p className="mt-2">
                Calendar sync depends on third-party Google APIs, your device&rsquo;s network connection, and token validity. You should
                not rely exclusively on Google Calendar sync as your sole notification mechanism for academic obligations.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">6. Audio Briefings &amp; Live Voice Advisor</h3>
              <p>
                Using the Live Voice Advisor requires granting your browser permission to access your microphone. You agree not to transmit
                any unlawful, abusive, harassing, infringing, or harmful audio during voice coaching sessions. Voice coaching is generated
                in real time by artificial intelligence and does not constitute licensed academic counseling or tutoring.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">7. Acceptable Use</h3>
              <p>
                You agree not to misuse Apodict. Specifically, you agree not to:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Attempt to gain unauthorized access to any other user&rsquo;s account, data, or Firestore records.</li>
                <li>Interfere with, disrupt, or place an unreasonable load on the app&rsquo;s servers, WebSockets, or third-party APIs.</li>
                <li>Reverse engineer, decompile, or scrape the application or its underlying backend endpoints.</li>
                <li>Enter mobile phone numbers that you do not personally own or are not authorized to use.</li>
                <li>Use the app for any illegal or fraudulent purpose.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">8. Backups, Modifications, and Account Termination</h3>
              <p>
                We provide a Backup &amp; Restore utility enabling you to download a JSON archive of your academic records. We recommend
                downloading regular backups of your course data.
              </p>
              <p className="mt-2">
                We reserve the right to modify, suspend, or discontinue any feature of the service at any time without notice. You may
                discontinue using the service and permanently delete your account and associated records at any time using the
                &ldquo;Delete my account&rdquo; feature in your account menu.
              </p>
            </section>

            <section className="p-5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold mb-1.5">9. Disclaimers and Limitations of Liability</h3>
              <p className="uppercase text-xs font-bold tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Please read this section carefully
              </p>
              <p>
                Apodict IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES OF ANY KIND,
                WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
                PARTICULAR PURPOSE, ACCURACY, AND NON-INFRINGEMENT.
              </p>
              <p className="mt-3">
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE DEVELOPER OR APODICT BE LIABLE FOR ANY
                INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF DATA, MISSED DEADLINES,
                ACADEMIC PENALTIES, GRADE REDUCTIONS, FAILED EXAMS, LOSS OF SCHOLARSHIPS, OR OTHER LOSSES RESULTING FROM YOUR USE OF
                OR INABILITY TO USE THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">10. Changes to These Terms</h3>
              <p>
                We may revise these Terms &amp; Conditions from time to time. When changes occur, the &ldquo;Effective Date&rdquo; at the
                top of this page will be updated. Continued use of Apodict following the posting of changes constitutes your binding
                acceptance of the revised terms.
              </p>
            </section>
          </div>

          {/* Part 2: SMS Terms */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Part 2: SMS Terms (Text Message Reminder Program)</h2>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">1. Program Description</h3>
              <p>
                Apodict offers an optional text message reminder service that delivers automated SMS notifications to your mobile phone
                concerning upcoming course assignments, quizzes, papers, and exam deadlines that you configure in the Reminders tab.
                Text messages are sent by <strong>Shreeyans Dodda</strong> (our registered brand name) on behalf of Apodict.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">2. Opt-In &amp; Joining</h3>
              <p>
                Participation in text message reminders is completely voluntary and is not required to use the rest of Apodict. To enroll,
                you must sign in, navigate to <strong>Reminders</strong>, enter your mobile number, actively check the consent checkbox
                (which is never pre-checked), and click <strong>&ldquo;Yes, sign me up!&rdquo;</strong> You must then enter the 6-digit
                verification PIN texted to your phone to confirm ownership.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">3. Types of Messages</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>One-time numeric verification codes sent when you verify or change your mobile number.</li>
                <li>Automated reminders for the academic deadlines and advance lead times you selected.</li>
                <li>System responses to HELP and STOP inquiries.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">4. Message Frequency</h3>
              <p>
                Message frequency varies depending on the number of enrolled courses, your reminder rules, and your schedule of upcoming
                deadlines, up to a maximum of 10 messages per day.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">5. Rates and Charges</h3>
              <p className="font-semibold text-indigo-700 dark:text-indigo-300">
                Message and data rates may apply for any messages sent to you or received from you under your wireless service plan.
              </p>
            </section>

            <section className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold mb-1.5">6. Support and Help</h3>
              <p>
                Reply <strong>&ldquo;HELP&rdquo;</strong> to any text message for assistance, or contact customer support directly at{' '}
                <a href="mailto:shreeyans21@gmail.com" className={LINK}>shreeyans21@gmail.com</a>.
              </p>
            </section>

            <section className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
              <h3 className="text-lg font-semibold mb-1.5 text-amber-900 dark:text-amber-200">7. Opting Out (STOP)</h3>
              <p className="text-amber-950 dark:text-amber-100">
                You can cancel SMS notifications at any time by replying <strong>&ldquo;STOP&rdquo;</strong> to any text message, or by
                clicking unsubscribe in the Reminders tab. We will send a single text confirming your cancellation, and no further
                messages will be sent unless you re-enroll. To resume, reply <strong>&ldquo;START&rdquo;</strong> or re-enroll in
                Reminders.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">8. Wireless Carriers</h3>
              <p>
                Wireless carriers (including T-Mobile, AT&amp;T, Verizon, and others) are not liable for delayed or undelivered messages.
                Message delivery is subject to the effective transmission of your wireless service provider.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-1.5">9. Privacy</h3>
              <p>
                We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes. Your
                mobile phone number and opt-in consent records are never shared with third parties or affiliates for marketing or
                promotional purposes. For complete details on our data protection practices, please consult our{' '}
                <a href="/privacy" className={LINK}>Privacy Policy</a>.
              </p>
            </section>
          </div>

          {/* Contact Section */}
          <section>
            <h2 className="text-xl font-semibold mb-2">Contact Us</h2>
            <p>If you have any questions or concerns regarding these Terms &amp; Conditions, please contact:</p>
            <div className="mt-3 text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <p><strong>Registered Brand Name:</strong> Shreeyans Dodda</p>
              <p><strong>Developer:</strong> Shreeyans Dodda</p>
              <p><strong>Application:</strong> Apodict</p>
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