import React from 'react';
import Logo from './Logo';

interface PolicyProps {
  onBack?: () => void;
}

const LINK = 'underline text-indigo-600 dark:text-indigo-400 hover:text-indigo-500';

export const PrivacyPolicy: React.FC<PolicyProps> = ({ onBack }) => {
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

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Effective Date: October 9, 2026</p>

        <div className="space-y-8 text-sm sm:text-base leading-relaxed">
          {/* 1. Overview */}
          <section>
            <h2 className="text-xl font-semibold mb-2">1. Overview</h2>
            <p>
              Apodict (&ldquo;the app,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is an academic workspace
              designed to help college and university students organize courses, extract assignment and exam dates from syllabi,
              anticipate academic crunches, plan project milestones, calculate weighted grades, synchronize schedules with Google
              Calendar, interact with an AI voice advisor, and receive optional text message deadline reminders.
            </p>
            <p className="mt-3">
              Apodict is operated by <strong>Shreeyans Dodda</strong>, which is our registered brand name. Text messages from Apodict are
              sent by Shreeyans Dodda on behalf of the app, and references in this policy to &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
              &ldquo;our&rdquo; mean Shreeyans Dodda and the Apodict service.
            </p>
            <p className="mt-3">
              This Privacy Policy explains what information we collect, how it is processed and protected, who helps us operate the
              service, and the choices and controls you have. Our{' '}
              <a href="/terms" className={LINK}>Terms &amp; Conditions</a> also apply to your use of Apodict.
            </p>
          </section>

          {/* 2. Information We Collect */}
          <section>
            <h2 className="text-xl font-semibold mb-2">2. Information We Collect</h2>
            <p className="mb-3">
              We collect only the information necessary to provide and operate the features you choose to use:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Account Information:</strong> When you sign in with your Google account, we receive basic authentication
                credentials from Google (Firebase Authentication), including your name, email address, profile photo URL, and unique
                Google user identifier.
              </li>
              <li>
                <strong>Academic and Course Information:</strong> Course names, course codes, instructor names, office hours,
                email addresses, grading categories and weight percentages, assignment titles, exam dates, deadline types, earned
                scores, grade target configurations, and milestone roadmaps you enter or extract.
              </li>
              <li>
                <strong>Uploaded Syllabi and Documents:</strong> PDF files and syllabus text you upload or paste into the Course
                Center for automated AI parsing and extraction.
              </li>
              <li>
                <strong>Microphone and Voice Audio (Temporary):</strong> If you activate the Live Voice Advisor, your browser
                streams live microphone audio temporarily during that interactive voice session to generate real-time conversational
                coaching. This audio stream is processed ephemerally in-session and is not recorded, stored, or added to training sets.
              </li>
              <li>
                <strong>Google Calendar Information:</strong> If you connect Google Calendar, we receive temporary, in-memory OAuth
                access tokens enabling us to create, view, update, and manage a dedicated &ldquo;Apodict&rdquo; calendar and its events.
                We do not inspect, read, or modify personal events on any other calendars.
              </li>
              <li>
                <strong>Mobile Phone and Notification Data:</strong> If you opt in to text reminders, we collect your mobile phone number,
                your selected deadline preferences (lead times, alert categories, and time zone), verification status, and timestamped
                consent records (SMS opt-in data).
              </li>
              <li>
                <strong>Local Backup Archives:</strong> JSON files created when you download your academic data through the Backup &amp;
                Restore tool. These files are saved locally on your device and are only processed by the app when you choose to restore them.
              </li>
              <li>
                <strong>Technical and Security Data:</strong> Standard server and hosting logs (such as IP address, browser user-agent,
                and request timestamps) maintained for security monitoring, rate limiting, and technical troubleshooting.
              </li>
            </ul>
          </section>

          {/* 3. How We Use Your Information */}
          <section>
            <h2 className="text-xl font-semibold mb-2">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To authenticate your account, secure your profile, and load your personal courses and grades.</li>
              <li>To read syllabus PDFs and text with Google Gemini and extract structured deadlines, contacts, and grading weights.</li>
              <li>To map overlapping deadlines across all your classes and visualize crunch weeks in the Collision Map.</li>
              <li>To break long assignments and papers into milestone roadmaps and estimate study hours.</li>
              <li>To calculate current weighted averages and simulate required final exam scores in the Grades calculator.</li>
              <li>To generate course audio briefings and deliver real-time conversational voice coaching via the Voice Advisor.</li>
              <li>To sync deadline and exam events directly into your dedicated Apodict Google Calendar when requested.</li>
              <li>To send phone verification codes and automated SMS reminders for the deadlines you choose.</li>
              <li>To enable complete export and restoration of your records via Backup &amp; Restore.</li>
              <li>To protect against abuse, comply with legal obligations, and address technical issues.</li>
            </ul>
            <p className="mt-4 font-medium">
              We never sell your personal information, academic data, mobile details, or Google account information. We do not use
              your data for advertising, behavioral profiling, or marketing newsletters.
            </p>
          </section>

          {/* 4. Google API Services & Calendar Integration */}
          <section className="p-5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800">
            <h2 className="text-xl font-semibold mb-2 text-sky-900 dark:text-sky-200">
              4. Google API Services &amp; Google Calendar Data
            </h2>
            <p className="text-sky-950 dark:text-sky-100 mb-3">
              Apodict connects with Google Calendar through official Google OAuth 2.0 authorization. Our use and transfer of information
              received from Google APIs adheres strictly to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold hover:text-sky-700 dark:hover:text-sky-300"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-sky-950 dark:text-sky-100">
              <li>
                <strong>Scoped Access:</strong> We request only the permissions needed to manage calendars created by this app
                (<code>https://www.googleapis.com/auth/calendar.app.created</code>) and to check calendar titles to identify duplicate
                Apodict calendars (<code>https://www.googleapis.com/auth/calendar.calendarlist.readonly</code>).
              </li>
              <li>
                <strong>No Access to Personal Events:</strong> Apodict does not read, access, or modify any personal events, meetings, or
                private schedules on your primary calendar or other secondary calendars.
              </li>
              <li>
                <strong>In-Memory Token Handling:</strong> Google OAuth access tokens are stored strictly in client browser memory and are
                never written to disk, saved in databases, or sent to backend tracking servers.
              </li>
              <li>
                <strong>No Third-Party Transfers or Ads:</strong> Google user data is used solely to provide user-facing calendar sync
                features and is never transferred to third parties or used for advertisements.
              </li>
              <li>
                <strong>No Human Access:</strong> No humans read your Google Calendar data unless necessary for security investigations
                or with your express affirmative consent for technical troubleshooting.
              </li>
            </ul>
          </section>

          {/* 5. Mobile Information & SMS Privacy */}
          <section className="p-5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900">
            <h2 className="text-xl font-semibold mb-2 text-indigo-900 dark:text-indigo-200">
              5. Mobile Information &amp; SMS Privacy
            </h2>
            <p className="font-semibold text-indigo-950 dark:text-indigo-100 mb-3">
              We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes.
            </p>
            <p className="font-medium italic text-indigo-950 dark:text-indigo-100">
              &ldquo;No mobile information will be shared with third parties/affiliates for marketing/promotional
              purposes at all times. All the above categories exclude text messaging originator opt-in data and consent;
              this information will not be shared with any third parties.&rdquo;
            </p>
            <p className="mt-3 text-indigo-900 dark:text-indigo-200">
              Text messages are sent by Shreeyans Dodda on behalf of Apodict. The only entity that processes your phone number is Twilio,
              strictly to transmit verification codes and your requested deadline reminders. You can cancel at any time by replying{' '}
              <strong>STOP</strong> or unsubscribing in Reminders.
            </p>
          </section>

          {/* 6. Service Providers We Use */}
          <section>
            <h2 className="text-xl font-semibold mb-2">6. Service Providers We Use</h2>
            <p className="mb-3">
              We work with trusted infrastructure and service providers to operate Apodict:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Google Cloud Platform &amp; Firebase:</strong> Firebase Authentication powers user sign-in. Cloud Firestore
                stores your encrypted academic records, roadmaps, and settings. Firestore security rules ensure you can only access
                your own records.
              </li>
              <li>
                <strong>Google Gemini API (Generative AI):</strong> Powers multimodal syllabus parsing (PDF and text), conflict detection,
                milestone planning, grade focus analysis, audio briefing generation, and real-time Live Voice Advisor coaching. Content
                submitted for these features is processed under Google Cloud enterprise terms.
              </li>
              <li>
                <strong>Google Calendar API:</strong> Facilitates direct client-side synchronization of deadlines and exams to your
                dedicated Apodict calendar.
              </li>
              <li>
                <strong>Twilio:</strong> Delivers automated SMS verification codes and student deadline notifications.
              </li>
            </ul>
          </section>

          {/* 7. Data Retention, Control, and Deletion */}
          <section>
            <h2 className="text-xl font-semibold mb-2">7. Data Retention and Deletion</h2>
            <p>
              You maintain full control over your data in Apodict:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>
                <strong>Edit &amp; Remove Items:</strong> You can edit or delete individual courses, categories, milestones, or deadlines
                at any time inside the app.
              </li>
              <li>
                <strong>Complete Account Deletion:</strong> You can permanently wipe your account and all associated cloud data by
                clicking &ldquo;Delete my account&rdquo; in the top bar account menu. This permanently deletes your Firestore document
                and your Firebase Authentication record.
              </li>
              <li>
                <strong>Calendar Disconnect:</strong> You can disconnect Google Calendar sync at any time in the Calendar tab and delete
                the Apodict calendar directly inside Google Calendar.
              </li>
              <li>
                <strong>SMS Unsubscribe:</strong> You can revoke text messaging permissions by unsubscribing in the Reminders tab or
                by replying <strong>STOP</strong> to any SMS message.
              </li>
              <li>
                <strong>Export Your Data:</strong> You can download a complete JSON backup archive of your courses, milestones, and grades
                at any time via Backup &amp; Restore.
              </li>
            </ul>
            <p className="mt-3">
              You may also email us directly at{' '}
              <a href="mailto:shreeyans21@gmail.com" className={LINK}>shreeyans21@gmail.com</a> to request the deletion of your account
              and associated records.
            </p>
          </section>

          {/* 8. Security Safeguards */}
          <section>
            <h2 className="text-xl font-semibold mb-2">8. Security Safeguards</h2>
            <p>
              We implement industry-standard administrative and technical safeguards to protect your personal information:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>All web traffic and live voice sessions are encrypted in transit via HTTPS and WSS (secure WebSockets).</li>
              <li>Granular Firestore Security Rules enforce authentication and isolate each student&rsquo;s data strictly to their authenticated account.</li>
              <li>OAuth tokens for Google Calendar are kept ephemerally in browser memory and are never persisted to databases or written to server logs.</li>
            </ul>
            <p className="mt-3">
              While we take extensive measures to guard your information, no digital storage or transmission is 100% impenetrable, and we cannot guarantee absolute security.
            </p>
          </section>

          {/* 9. Children's Privacy */}
          <section>
            <h2 className="text-xl font-semibold mb-2">9. Children&rsquo;s Privacy</h2>
            <p>
              Apodict is designed for college and higher-education students and is not directed to children under 13. We do not knowingly
              collect personal information from children under the age of 13. If you believe a child under 13 has provided information to
              the app, please contact us and we will promptly delete it.
            </p>
          </section>

          {/* 10. Changes to This Policy */}
          <section>
            <h2 className="text-xl font-semibold mb-2">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time to reflect feature enhancements, security improvements, or regulatory changes.
              Whenever changes occur, we will update the &ldquo;Effective Date&rdquo; at the top of this page. Your continued use of the app
              after revisions are posted indicates your acceptance of the updated policy.
            </p>
          </section>

          {/* 11. Contact Us */}
          <section>
            <h2 className="text-xl font-semibold mb-2">11. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, your rights, or data deletion requests, please contact:</p>
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