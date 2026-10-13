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
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Effective Date: October 13, 2026</p>

        <div className="space-y-8 text-sm sm:text-base leading-relaxed">
          {/* 1. Overview */}
          <section>
            <h2 className="text-xl font-semibold mb-2">1. Overview</h2>
            <p>
              Apodict (&ldquo;the app,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is an academic workspace
              that helps college and university students organize courses, extract assignment and exam dates from syllabi, spot
              crunch weeks, plan project milestones, calculate weighted grades, prepare for exams, sync deadlines with Google
              Calendar, talk with an AI voice advisor, and receive optional push notification reminders.
            </p>
            <p className="mt-3">
              This Privacy Policy explains what information we collect, how it is used and protected, who helps us operate the
              service, and the choices you have. Our <a href="/terms" className={LINK}>Terms &amp; Conditions</a> also apply to your
              use of Apodict.
            </p>
          </section>

          {/* 2. Information We Collect */}
          <section>
            <h2 className="text-xl font-semibold mb-2">2. Information We Collect</h2>
            <p className="mb-3">
              We collect only the information needed to provide the features you choose to use:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Account Information:</strong> When you sign in with Google (Firebase Authentication), we receive your name,
                email address, profile photo URL, and unique Google user identifier.
              </li>
              <li>
                <strong>Academic and Course Information:</strong> Course names and codes, instructor names and contact details, office
                hours, grading categories and weights, assignment titles, exam dates, deadline types, scores, grade targets, and
                milestone plans that you enter or that are extracted from your syllabi.
              </li>
              <li>
                <strong>Uploaded Syllabi, Notes, and Study Materials:</strong> PDF files and text you upload or paste for syllabus
                parsing, and the notes and PDF text you provide in Exam Prep. PDF text for Exam Prep is extracted in your browser, and
                the resulting text is sent to Google Gemini to generate study guides, practice questions, and flashcards.
              </li>
              <li>
                <strong>Microphone Audio (Temporary):</strong> If you start the Live Voice Advisor, your browser streams microphone
                audio during that session to produce real-time coaching. The audio is processed only during the session and is not
                recorded or stored by us.
              </li>
              <li>
                <strong>Google Calendar Access:</strong> If you connect Google Calendar, we receive a temporary access token that lets us
                create and manage a dedicated &ldquo;Apodict&rdquo; calendar and its events. We do not read or change events on any of
                your other calendars.
              </li>
              <li>
                <strong>Notification Data:</strong> If you turn on notifications, we store a push token for each device you enable,
                along with basic browser and device information and the date it was added. We also store your reminder rules, time zone,
                and default reminder time, and a record of which reminders have already been sent so you are not notified twice.
              </li>
              <li>
                <strong>Backup Files:</strong> JSON files you download through Backup &amp; Restore are saved on your own device. We only
                process them if you choose to restore one.
              </li>
              <li>
                <strong>Installed App and Cached Files:</strong> If you install Apodict on your device, a service worker stores the app&rsquo;s
                program files and icons on your device so it loads faster. It does not cache your account data.
              </li>
              <li>
                <strong>Technical and Security Data:</strong> Standard server and hosting logs (such as IP address, browser type, and
                request times) kept for security, rate limiting, and troubleshooting.
              </li>
            </ul>
          </section>

          {/* 3. How We Use Your Information */}
          <section>
            <h2 className="text-xl font-semibold mb-2">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To sign you in, secure your account, and load your courses and grades.</li>
              <li>To read syllabi with Google Gemini and extract deadlines, contacts, and grading weights.</li>
              <li>To show overlapping deadlines across your classes in the Collision Map.</li>
              <li>To break long assignments into milestone plans and estimate study time.</li>
              <li>To calculate weighted grades and simulate the scores you need on remaining work.</li>
              <li>To generate study guides, practice questions, and flashcards in Exam Prep.</li>
              <li>To provide audio briefings and real-time coaching in the Voice Advisor.</li>
              <li>To add deadline and exam events to your Apodict Google Calendar when you ask.</li>
              <li>To send push notification reminders for the deadlines you choose, at the times you set.</li>
              <li>To let you export and restore your records through Backup &amp; Restore.</li>
              <li>To prevent abuse, meet legal obligations, and fix technical problems.</li>
            </ul>
            <p className="mt-4 font-medium">
              We never sell your personal information, academic data, or Google account information. We do not use your data for
              advertising, behavioral profiling, or marketing emails.
            </p>
          </section>

          {/* 4. Google API Services & Calendar Integration */}
          <section className="p-5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800">
            <h2 className="text-xl font-semibold mb-2 text-sky-900 dark:text-sky-200">
              4. Google API Services &amp; Google Calendar Data
            </h2>
            <p className="text-sky-950 dark:text-sky-100 mb-3">
              Apodict connects to Google Calendar through Google OAuth 2.0. Our use and transfer of information received from Google
              APIs follows the{' '}
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
                <strong>Limited Scopes:</strong> We request only permission to manage calendars created by this app (
                <code>https://www.googleapis.com/auth/calendar.app.created</code>) and to check calendar titles so we can detect
                duplicate Apodict calendars (<code>https://www.googleapis.com/auth/calendar.calendarlist.readonly</code>).
              </li>
              <li>
                <strong>No Access to Personal Events:</strong> Apodict does not read, access, or change personal events or any other
                calendar on your account.
              </li>
              <li>
                <strong>Tokens Kept in Memory:</strong> Google access tokens are held only in your browser&rsquo;s memory. They are not
                saved to a database or to disk.
              </li>
              <li>
                <strong>No Third-Party Transfers or Ads:</strong> Google user data is used only to provide calendar sync. It is never
                transferred to third parties or used for advertising.
              </li>
              <li>
                <strong>No Human Access:</strong> No one reads your Google Calendar data unless required for security investigations or
                you give explicit consent for troubleshooting.
              </li>
            </ul>
          </section>

          {/* 5. Push Notifications */}
          <section className="p-5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900">
            <h2 className="text-xl font-semibold mb-2 text-indigo-900 dark:text-indigo-200">
              5. Push Notifications
            </h2>
            <p className="text-indigo-950 dark:text-indigo-100">
              Push notifications are optional and off until you turn them on from the Notifications page and allow them in your browser
              or device. When they are on:
            </p>
            <ul className="list-disc pl-5 mt-3 space-y-1.5 text-indigo-950 dark:text-indigo-100">
              <li>
                We store a push token for each device you enable, along with your reminder rules, time zone, and default reminder time.
              </li>
              <li>
                Our server regularly checks your saved deadlines against your rules and sends a notification when one is due. Each
                notification contains the assignment name, course name, and due date.
              </li>
              <li>
                Notifications are delivered through Firebase Cloud Messaging and the push service built into your browser or device
                (for example those run by Google, Apple, or Mozilla). These services carry the notification to your device.
              </li>
              <li>
                We do not use notifications for advertising or marketing, and we do not sell or share notification data.
              </li>
            </ul>
            <p className="mt-3 text-indigo-900 dark:text-indigo-200">
              You can stop notifications at any time by choosing &ldquo;Turn off on this device&rdquo; or removing a device on the
              Notifications page, turning off your rules, or blocking notifications for Apodict in your browser or device settings.
            </p>
          </section>

          {/* 6. Service Providers We Use */}
          <section>
            <h2 className="text-xl font-semibold mb-2">6. Service Providers We Use</h2>
            <p className="mb-3">We use the following providers to operate Apodict:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Google Cloud &amp; Firebase:</strong> Firebase Authentication handles sign-in. Cloud Firestore stores your
                academic records, notification settings, and preferences, protected by security rules so you can only access your own
                data. Firebase Cloud Messaging delivers push notifications.
              </li>
              <li>
                <strong>Google Gemini API:</strong> Powers syllabus parsing, conflict detection, milestone planning, grade focus
                guidance, Exam Prep, audio briefings, and the Live Voice Advisor. Content you submit to these features is sent to the
                Gemini API for processing.
              </li>
              <li>
                <strong>Google Calendar API:</strong> Lets the app sync deadlines and exams to your Apodict calendar when you ask.
              </li>
              <li>
                <strong>Render:</strong> Hosts the Apodict server and web app.
              </li>
              <li>
                <strong>Browser and Device Push Services:</strong> Carry push notifications to your device after you enable them.
              </li>
            </ul>
          </section>

          {/* 7. Data Retention and Deletion */}
          <section>
            <h2 className="text-xl font-semibold mb-2">7. Data Retention and Deletion</h2>
            <p>You stay in control of your data:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>
                <strong>Edit and Remove Items:</strong> Edit or delete individual courses, categories, milestones, deadlines, and
                reminder rules at any time inside the app.
              </li>
              <li>
                <strong>Delete Your Account:</strong> Choose &ldquo;Delete my account&rdquo; in the account menu to permanently delete
                your account and the data associated with it, including your notification settings and saved devices.
              </li>
              <li>
                <strong>Notifications:</strong> Turn off notifications on a device, or remove a saved device, from the Notifications page.
                Removing a device deletes its push token.
              </li>
              <li>
                <strong>Calendar Disconnect:</strong> Disconnect Google Calendar sync in the Calendar tab, and delete the Apodict
                calendar directly in Google Calendar if you wish.
              </li>
              <li>
                <strong>Export Your Data:</strong> Download a complete JSON backup of your courses, milestones, and grades at any time
                through Backup &amp; Restore.
              </li>
            </ul>
            <p className="mt-3">
              You can also email us at <a href="mailto:shreeyans21@gmail.com" className={LINK}>shreeyans21@gmail.com</a> to request
              deletion of your account and records.
            </p>
          </section>

          {/* 8. Security Safeguards */}
          <section>
            <h2 className="text-xl font-semibold mb-2">8. Security Safeguards</h2>
            <p>We use reasonable technical and administrative safeguards to protect your information:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>All web traffic and live voice sessions are encrypted in transit (HTTPS and secure WebSockets).</li>
              <li>Firestore security rules require sign-in and limit each student to their own data.</li>
              <li>Google Calendar access tokens stay in browser memory and are never stored by us or written to server logs.</li>
              <li>Server actions that send notifications are protected with secret credentials that are not exposed to the app.</li>
            </ul>
            <p className="mt-3">
              No method of storage or transmission is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          {/* 9. Children's Privacy */}
          <section>
            <h2 className="text-xl font-semibold mb-2">9. Children&rsquo;s Privacy</h2>
            <p>
              Apodict is designed for college and university students and is not directed to children under 13. We do not knowingly
              collect personal information from children under 13. If you believe a child under 13 has provided information to the
              app, contact us and we will delete it promptly.
            </p>
          </section>

          {/* 10. Changes to This Policy */}
          <section>
            <h2 className="text-xl font-semibold mb-2">10. Changes to This Policy</h2>
            <p>
              We may update this policy to reflect new features, security improvements, or legal changes. When we do, we will update
              the &ldquo;Effective Date&rdquo; at the top of this page. Continuing to use the app after changes are posted means you
              accept the updated policy.
            </p>
          </section>

          {/* 11. Contact Us */}
          <section>
            <h2 className="text-xl font-semibold mb-2">11. Contact Us</h2>
            <p>For questions about this policy, your data, or deletion requests, contact:</p>
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