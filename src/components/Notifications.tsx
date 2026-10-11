import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bell, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Edit3, 
  Plus, 
  Check, 
  X, 
  Smartphone, 
  Globe, 
  ShieldCheck, 
  AlertTriangle,
  Info,
  CalendarDays,
  PhoneCall,
  ChevronDown
} from 'lucide-react';
import { Course, Deadline, DeadlineType } from '../types/academic';
import { 
  NotificationSettings, 
  NotificationRule, 
  NotificationRuleScope, 
  ReminderLeadTime, 
  UpcomingReminderPreview,
  CountryInfo
} from '../types/notifications';
import { dataStore } from '../services/dataStore';
import { auth } from '../services/firebase';

interface NotificationsProps {
  courses: Course[];
  onOpenAddCourse?: () => void;
}

const COUNTRIES: CountryInfo[] = [
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', placeholder: '(555) 123-4567' },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦', placeholder: '(555) 123-4567' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', placeholder: '7911 123456' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺', placeholder: '412 345 678' },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', placeholder: '98765 43210' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪', placeholder: '151 23456789' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷', placeholder: '6 12 34 56 78' },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵', placeholder: '90 1234 5678' },
  { code: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷', placeholder: '10 1234 5678' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷', placeholder: '11 91234-5678' },
  { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽', placeholder: '55 1234 5678' },
  { code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳', placeholder: '138 0013 8000' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬', placeholder: '8123 4567' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿', placeholder: '21 123 4567' },
  { code: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪', placeholder: '85 123 4567' },
  { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸', placeholder: '612 34 56 78' },
  { code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹', placeholder: '312 345 6789' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱', placeholder: '6 12345678' },
  { code: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭', placeholder: '78 123 45 67' },
  { code: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪', placeholder: '70 123 45 67' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦', placeholder: '82 123 4567' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬', placeholder: '802 123 4567' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪', placeholder: '50 123 4567' },
  { code: 'PH', name: 'Philippines', dialCode: '+63', flag: '🇵🇭', placeholder: '917 123 4567' },
];

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'UTC',
];

const LEAD_TIME_OPTIONS: Array<{ id: ReminderLeadTime; label: string; daysBefore: number }> = [
  { id: 'morning_of', label: 'The morning of', daysBefore: 0 },
  { id: '1_day_before', label: '1 day before', daysBefore: 1 },
  { id: '2_days_before', label: '2 days before', daysBefore: 2 },
  { id: '3_days_before', label: '3 days before', daysBefore: 3 },
  { id: '1_week_before', label: '1 week before', daysBefore: 7 },
];

const DEADLINE_TYPES: Array<{ id: DeadlineType; label: string }> = [
  { id: 'exam', label: 'Exam' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'homework', label: 'Homework' },
  { id: 'paper', label: 'Paper' },
  { id: 'project', label: 'Project' },
  { id: 'other', label: 'Other' },
];

const SMS_COMING_SOON = true; // set to false when text sending is live
export const Notifications: React.FC<NotificationsProps> = ({ courses }) => {
  // Settings state
  const [settings, setSettings] = useState<NotificationSettings>({
    phoneNumber: '',
    countryCode: 'US',
    isVerified: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    defaultReminderTime: '09:00',
    channel: 'sms',
    consent: false,
    consentGivenAt: null,
    updatedAt: new Date().toISOString(),
  });

  const [rawPhoneInput, setRawPhoneInput] = useState('');
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Rule Modal / Form State
  const [isRuleFormOpen, setIsRuleFormOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [ruleScopeType, setRuleScopeType] = useState<'specific_assignment' | 'assignment_type' | 'all_in_course'>('assignment_type');
  const [ruleDeadlineId, setRuleDeadlineId] = useState<string>('');
  const [ruleDeadlineType, setRuleDeadlineType] = useState<DeadlineType>('exam');
  const [ruleCourseId, setRuleCourseId] = useState<string>(''); // empty string means "all courses" for assignment_type
  const [ruleLeadTimes, setRuleLeadTimes] = useState<ReminderLeadTime[]>(['1_day_before', 'morning_of']);
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [ruleCustomTime, setRuleCustomTime] = useState('09:00');
  const [ruleFormError, setRuleFormError] = useState<string | null>(null);
  const [isSavingRule, setIsSavingRule] = useState(false);

  // In-page delete confirmation
  const [ruleIdToDelete, setRuleIdToDelete] = useState<string | null>(null);
  const [isDeletingRule, setIsDeletingRule] = useState(false);

  // Consent warning inline notice
  const [consentWarning, setConsentWarning] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false); // never pre-selected

  // Phone verification
  const [verifyStep, setVerifyStep] = useState<'idle' | 'sending' | 'code' | 'checking'>('idle');
  const [verifyChallenge, setVerifyChallenge] = useState<string | null>(null);
  const [verifyLast4, setVerifyLast4] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [verifyMessage, setVerifyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load initial settings and rules from Firestore
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [savedSettings, savedRules] = await Promise.all([
          dataStore.getNotificationSettings(),
          dataStore.getNotificationRules(),
        ]);
        if (isMounted) {
          const detectedZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
          const finalSettings = {
            ...savedSettings,
            timeZone: savedSettings.timeZone || detectedZone,
          };
          setSettings(finalSettings);

          const selectedCountry = COUNTRIES.find((c) => c.code === finalSettings.countryCode) || COUNTRIES[0];
          let nationalDigits = finalSettings.phoneNumber || '';
          if (nationalDigits.startsWith(selectedCountry.dialCode)) {
            nationalDigits = nationalDigits.slice(selectedCountry.dialCode.length);
          }
          setRawPhoneInput(nationalDigits);
          setRules(savedRules);
        }
      } catch (err) {
        console.error('Failed to load reminder settings or rules:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    const handleRulesUpdated = async () => {
      try {
        const updated = await dataStore.getNotificationRules();
        if (isMounted) setRules(updated);
      } catch (err) {
        console.error('Failed to refresh rules on event:', err);
      }
    };

    window.addEventListener('notification-rules-updated', handleRulesUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener('notification-rules-updated', handleRulesUpdated);
    };
  }, []);

  // Helper to format international phone number
  const computeInternationalPhone = (countryCode: string, nationalNumber: string): string => {
    const country = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];
    let cleanedDigits = nationalNumber.replace(/\D/g, '');
    if (!cleanedDigits) return '';
    const dialDigits = country.dialCode.replace(/\D/g, '');
    if (cleanedDigits.startsWith(dialDigits) && cleanedDigits.length > dialDigits.length + 6) {
      cleanedDigits = cleanedDigits.slice(dialDigits.length);
    }
    return `${country.dialCode}${cleanedDigits}`;
  };

  // Validate phone number format
  const isPhoneValid = (countryCode: string, nationalNumber: string): boolean => {
    const cleanedDigits = nationalNumber.replace(/\D/g, '');
    if (!cleanedDigits) return false;
    const country = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];
    const dialDigits = country.dialCode.replace(/\D/g, '');
    let coreDigits = cleanedDigits;
    if (coreDigits.startsWith(dialDigits) && coreDigits.length > dialDigits.length + 6) {
      coreDigits = coreDigits.slice(dialDigits.length);
    }
    const totalDigits = dialDigits.length + coreDigits.length;
    return totalDigits >= 8 && totalDigits <= 15 && coreDigits.length >= 7;
  };

  // Save Settings to Firestore
  const handleSaveSettings = async (overrideConsent?: boolean) => {
    setIsSavingSettings(true);
    setSettingsMessage(null);
    setConsentWarning(null);

    const country = COUNTRIES.find((c) => c.code === settings.countryCode) || COUNTRIES[0];
    const internationalPhone = computeInternationalPhone(settings.countryCode, rawPhoneInput);

    if (rawPhoneInput.trim() && !isPhoneValid(settings.countryCode, rawPhoneInput)) {
      setSettingsMessage({
        type: 'error',
        text: `Please enter a valid phone number for ${country.name}.`,
      });
      setIsSavingSettings(false);
      return;
    }

    const numberChanged = internationalPhone !== settings.phoneNumber;
    const consentVal = overrideConsent !== undefined ? overrideConsent : settings.consent;
    const consentTime = consentVal
      ? (settings.consentGivenAt || new Date().toISOString())
      : null;

    if (numberChanged) {
      setVerifyStep('idle');
      setVerifyChallenge(null);
      setCodeInput('');
      setVerifyMessage(null);
    }

    try {
      const updated = await dataStore.saveNotificationSettings({
        phoneNumber: internationalPhone,
        countryCode: settings.countryCode,
        isVerified: numberChanged ? false : settings.isVerified,
        ...(numberChanged ? { verificationProof: null, verifiedAt: null } : {}),
        timeZone: settings.timeZone,
        defaultReminderTime: settings.defaultReminderTime || '09:00',
        channel: 'sms',
        consent: consentVal,
        consentGivenAt: consentTime,
      });

      setSettings(updated);
      setSettingsMessage({
        type: 'success',
        text: 'Reminder settings saved to your account.',
      });

      if (!consentVal) {
        const activeRules = rules.filter((r) => r.enabled);
        if (activeRules.length > 0) {
          for (const rule of activeRules) {
            await dataStore.toggleNotificationRuleEnabled(rule.id, false);
          }
          const refreshedRules = await dataStore.getNotificationRules();
          setRules(refreshedRules);
        }
      }
    } catch (err: any) {
      setSettingsMessage({
        type: 'error',
        text: err?.message || 'Failed to save settings to cloud. Please try again.',
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Phone verification API helper
  const callPhoneApi = async (path: string, body: unknown) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Please sign in again.');
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
    return data;
  };

  const canVerify = isPhoneValid(settings.countryCode, rawPhoneInput);

  const handleSendCode = async () => {
    const targetPhone = computeInternationalPhone(settings.countryCode, rawPhoneInput);
    if (!targetPhone || !isPhoneValid(settings.countryCode, rawPhoneInput)) {
      setVerifyMessage({ type: 'error', text: 'Please enter a valid mobile number first.' });
      return;
    }

    setVerifyMessage(null);
    setVerifyStep('sending');
    try {
      // 1. Immediately persist user phone number and consent to cloud
      const updated = await dataStore.saveNotificationSettings({
        phoneNumber: targetPhone,
        countryCode: settings.countryCode,
        isVerified: false,
        verificationProof: null,
        verifiedAt: null,
        consent: true,
        consentGivenAt: settings.consentGivenAt || new Date().toISOString(),
      });
      setSettings(updated);
      setConsentChecked(true);

      // 2. Request Twilio verification code from backend
      const data = await callPhoneApi('/api/phone/start', { phoneNumber: targetPhone });
      setVerifyChallenge(data.challenge);
      setVerifyLast4(data.phoneLast4 || targetPhone.slice(-4));
      setCodeInput('');
      setVerifyStep('code');
      setVerifyMessage({ type: 'success', text: `Verification code sent to ${targetPhone}!` });
    } catch (err: any) {
      setVerifyStep(verifyChallenge ? 'code' : 'idle');
      setVerifyMessage({ type: 'error', text: err?.message || 'Could not send verification text. Please try again.' });
    }
  };

  const handleCheckCode = async () => {
    if (!codeInput || codeInput.trim().length !== 6) {
      setVerifyMessage({ type: 'error', text: 'Please enter the 6-digit code from your text message.' });
      return;
    }

    setVerifyMessage(null);
    setVerifyStep('checking');
    try {
      const data = await callPhoneApi('/api/phone/check', { challenge: verifyChallenge, code: codeInput.trim() });
      const targetPhone = computeInternationalPhone(settings.countryCode, rawPhoneInput);
      const updated = await dataStore.saveNotificationSettings({
        phoneNumber: targetPhone,
        countryCode: settings.countryCode,
        isVerified: true,
        verificationProof: data.proof,
        verifiedAt: new Date().toISOString(),
        consent: true,
        consentGivenAt: settings.consentGivenAt || new Date().toISOString(),
      });
      setSettings(updated);
      setConsentChecked(true);
      setVerifyStep('idle');
      setVerifyChallenge(null);
      setCodeInput('');
      setVerifyMessage({ type: 'success', text: 'Your phone number has been verified! Text reminders are now active.' });
    } catch (err: any) {
      setVerifyStep('code');
      setVerifyMessage({ type: 'error', text: err?.message || 'Could not check the code. Please try again.' });
    }
  };

  // Handle toggling consent checkbox
  const handleToggleConsent = async (checked: boolean) => {
    const intlPhone = computeInternationalPhone(settings.countryCode, rawPhoneInput) || settings.phoneNumber;
    const updatedSettings = {
      ...settings,
      phoneNumber: intlPhone,
      consent: checked,
      consentGivenAt: checked ? (settings.consentGivenAt || new Date().toISOString()) : null,
    };
    setSettings(updatedSettings);
    setConsentChecked(checked);
    if (!checked) {
      setConsentWarning('You have unsubscribed from text reminders. All reminder rules are off until you sign up again.');
    } else {
      setConsentWarning(null);
    }
    try {
      await dataStore.saveNotificationSettings({
        phoneNumber: intlPhone,
        countryCode: settings.countryCode,
        consent: checked,
        consentGivenAt: updatedSettings.consentGivenAt,
      });
      if (!checked) {
        for (const rule of rules.filter((r) => r.enabled)) {
          await dataStore.toggleNotificationRuleEnabled(rule.id, false);
        }
        const refreshedRules = await dataStore.getNotificationRules();
        setRules(refreshedRules);
      }
    } catch (e) {
      console.error('Error saving consent state:', e);
    }
  };

  // Toggle Rule Enabled / Disabled
  const handleToggleRule = async (rule: NotificationRule) => {
    setConsentWarning(null);
    if (!rule.enabled && !settings.consent) {
      setConsentWarning('Sign up for text reminders in the settings above before turning on any reminder rule.');
      return;
    }
    if (!rule.enabled && !settings.isVerified) {
      setConsentWarning('Verify your phone number in the settings above before turning on reminders.');
      return;
    }

    try {
      const updated = await dataStore.toggleNotificationRuleEnabled(rule.id, !rule.enabled);
      if (updated) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
      }
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  // Open Rule Modal to Add
  const handleOpenAddRule = () => {
    setRuleFormError(null);
    setEditingRuleId(null);
    setRuleName('Deadline Alert');
    setRuleScopeType('assignment_type');
    setRuleDeadlineType('exam');
    setRuleCourseId('');
    setRuleDeadlineId('');
    setRuleLeadTimes(['1_day_before', 'morning_of']);
    setUseCustomTime(false);
    setRuleCustomTime(settings.defaultReminderTime || '09:00');
    setIsRuleFormOpen(true);
  };

  // Open Rule Modal to Edit
  const handleOpenEditRule = (rule: NotificationRule) => {
    setRuleFormError(null);
    setEditingRuleId(rule.id);
    setRuleName(rule.name);
    setRuleScopeType(rule.scope.type);
    setRuleDeadlineType(rule.scope.deadlineType || 'exam');
    setRuleCourseId(rule.scope.courseId || '');
    setRuleDeadlineId(rule.scope.deadlineId || '');
    setRuleLeadTimes(rule.leadTimes.length > 0 ? rule.leadTimes : ['morning_of']);
    if (rule.customReminderTime) {
      setUseCustomTime(true);
      setRuleCustomTime(rule.customReminderTime);
    } else {
      setUseCustomTime(false);
      setRuleCustomTime(settings.defaultReminderTime || '09:00');
    }
    setIsRuleFormOpen(true);
  };

  // Save Rule (Create or Update)
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setRuleFormError(null);

    if (!ruleName.trim()) {
      setRuleFormError('Please enter a name for this reminder rule.');
      return;
    }

    if (ruleLeadTimes.length === 0) {
      setRuleFormError('Please select at least one lead time.');
      return;
    }

    if (ruleScopeType === 'specific_assignment' && !ruleDeadlineId) {
      setRuleFormError('Please select a specific assignment.');
      return;
    }

    if (ruleScopeType === 'all_in_course' && !ruleCourseId) {
      setRuleFormError('Please select a course for this rule.');
      return;
    }

    setIsSavingRule(true);

    const scope: NotificationRuleScope = {
      type: ruleScopeType,
      deadlineId: ruleScopeType === 'specific_assignment' ? ruleDeadlineId : undefined,
      deadlineType: ruleScopeType === 'assignment_type' ? ruleDeadlineType : undefined,
      courseId: ruleScopeType === 'assignment_type' 
        ? (ruleCourseId.trim() ? ruleCourseId : null) 
        : ruleScopeType === 'all_in_course' 
        ? ruleCourseId 
        : undefined,
    };

    const willBeEnabled = settings.consent && settings.isVerified ? true : false;

    try {
      const saved = await dataStore.saveNotificationRule({
        id: editingRuleId || undefined,
        name: ruleName.trim(),
        enabled: willBeEnabled,
        scope,
        leadTimes: ruleLeadTimes,
        customReminderTime: useCustomTime ? ruleCustomTime : null,
      });

      setRules((prev) => {
        const filtered = prev.filter((r) => r.id !== saved.id);
        return [saved, ...filtered];
      });

      setIsRuleFormOpen(false);
      if (!settings.consent) {
        setConsentWarning('Reminder rule created, but it stays off until you sign up for text reminders in Settings.');
      } else if (!settings.isVerified) {
        setConsentWarning('Reminder rule created, but it stays off until your phone number is verified.');
      }
    } catch (err: any) {
      setRuleFormError(err?.message || 'Failed to save rule. Please try again.');
    } finally {
      setIsSavingRule(false);
    }
  };

  // Delete Rule Execution
  const handleExecuteDeleteRule = async () => {
    if (!ruleIdToDelete) return;
    setIsDeletingRule(true);
    try {
      const success = await dataStore.deleteNotificationRule(ruleIdToDelete);
      if (success) {
        setRules((prev) => prev.filter((r) => r.id !== ruleIdToDelete));
      }
      setRuleIdToDelete(null);
    } catch (err) {
      console.error('Failed to delete rule:', err);
    } finally {
      setIsDeletingRule(false);
    }
  };

  // Collect all saved deadlines across all courses
  const allDeadlinesWithCourse = useMemo(() => {
    const list: Array<{ deadline: Deadline; course: Course }> = [];
    courses.forEach((c) => {
      c.deadlines.forEach((d) => {
        list.push({ deadline: d, course: c });
      });
    });
    return list;
  }, [courses]);

  const undatedDeadlinesCount = useMemo(() => {
    return allDeadlinesWithCourse.filter((item) => !item.deadline.date).length;
  }, [allDeadlinesWithCourse]);

  // Generate Upcoming Reminders Preview (Next 15 reminders)
  const upcomingReminders = useMemo(() => {
    const activeRules = rules.filter((r) => r.enabled);
    if (activeRules.length === 0) return [];

    const now = new Date();
    const reminders: UpcomingReminderPreview[] = [];
    const seenDeduplicationKeys = new Set<string>();

    for (const rule of activeRules) {
      const reminderTimeOfDay = rule.customReminderTime || settings.defaultReminderTime || '09:00';
      const [remHours, remMinutes] = reminderTimeOfDay.split(':').map((s) => parseInt(s, 10) || 0);

      const matchingItems = allDeadlinesWithCourse.filter(({ deadline, course }) => {
        if (deadline.completed) return false;
        if (!deadline.date) return false;

        if (rule.scope.type === 'specific_assignment') {
          return deadline.id === rule.scope.deadlineId;
        }

        if (rule.scope.type === 'all_in_course') {
          return course.id === rule.scope.courseId;
        }

        if (rule.scope.type === 'assignment_type') {
          const typeMatches = deadline.type === rule.scope.deadlineType;
          if (!typeMatches) return false;
          if (rule.scope.courseId) {
            return course.id === rule.scope.courseId;
          }
          return true;
        }

        return false;
      });

      for (const { deadline, course } of matchingItems) {
        if (!deadline.date) continue;

        const [year, month, day] = deadline.date.split('-').map((v) => parseInt(v, 10));
        if (!year || !month || !day) continue;

        for (const leadTime of rule.leadTimes) {
          const leadOption = LEAD_TIME_OPTIONS.find((opt) => opt.id === leadTime);
          const daysToSubtract = leadOption ? leadOption.daysBefore : 0;
          const reminderTargetDate = new Date(year, month - 1, day - daysToSubtract, remHours, remMinutes, 0, 0);

          if (reminderTargetDate.getTime() <= now.getTime()) {
            continue;
          }

          const reminderIso = reminderTargetDate.toISOString();
          const deduplicationKey = `${deadline.id}-${reminderIso}`;
          if (seenDeduplicationKeys.has(deduplicationKey)) {
            continue;
          }
          seenDeduplicationKeys.add(deduplicationKey);

          let formattedDateTime = '';
          try {
            formattedDateTime = new Intl.DateTimeFormat('en-US', {
              timeZone: settings.timeZone,
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZoneName: 'short',
            }).format(reminderTargetDate);
          } catch {
            formattedDateTime = reminderTargetDate.toLocaleString();
          }

          reminders.push({
            id: `${rule.id}-${deadline.id}-${leadTime}`,
            deadlineId: deadline.id,
            deadlineTitle: deadline.title,
            deadlineDate: deadline.date,
            deadlineType: deadline.type,
            courseId: course.id,
            courseName: course.name,
            courseColor: course.color || 'indigo',
            reminderDateTime: reminderIso,
            reminderFormattedTime: formattedDateTime,
            leadTime,
            leadTimeLabel: leadOption ? leadOption.label : leadTime,
            ruleId: rule.id,
            ruleName: rule.name,
          });
        }
      }
    }

    reminders.sort((a, b) => new Date(a.reminderDateTime).getTime() - new Date(b.reminderDateTime).getTime());
    return reminders.slice(0, 15);
  }, [rules, settings, allDeadlinesWithCourse]);

  const selectedCountry = COUNTRIES.find((c) => c.code === settings.countryCode) || COUNTRIES[0];

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 flex items-center justify-center text-slate-700 dark:text-slate-300">
              <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Scheduled Reminders
                {SMS_COMING_SOON && (
                  <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                    Coming soon
                  </span>
                )}
            </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configure your text message alert rules and preview scheduled notifications.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenAddRule}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium transition-all duration-150 ease-in-out shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Rule</span>
          </button>
        </div>
      </div>
      {SMS_COMING_SOON && (
        <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3">
        <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
          <strong>Text reminders are coming soon.</strong> Sign-up opens when they launch, and no texts are sent yet.
          For now, use the Calendar tab to get deadline popups on your phone.
        </div>
      </div>
)}
      {/* Inline Warning Notice */}
      {consentWarning && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 animate-in fade-in duration-150">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            {consentWarning}
          </div>
          <button
            onClick={() => setConsentWarning(null)}
            className="text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-100 p-0.5 rounded transition-all duration-150 ease-in-out cursor-pointer"
            aria-label="Dismiss warning"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SECTION 1: SETTINGS CARD */}
      <section className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <Smartphone className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                Reminder Settings
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Personalized settings saved to your student account in Firestore.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {settings.isVerified && settings.phoneNumber === computeInternationalPhone(settings.countryCode, rawPhoneInput) ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/80">
                Not verified
              </span>
            )}
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-8">
          {/* Row 1: Phone with Country Picker & Time Zone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Phone Number Field */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Mobile Phone Number
              </label>
              <div className="flex rounded-lg border border-slate-200/80 dark:border-slate-800/80 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 overflow-hidden bg-white dark:bg-slate-950/40 transition-all duration-150 ease-in-out">
                {/* Country Selector */}
                <div className="relative border-r border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/60">
                  <select
                    value={settings.countryCode}
                    onChange={(e) => {
                      const newCountry = e.target.value;
                      setSettings({ ...settings, countryCode: newCountry });
                    }}
                    className="h-full pl-3 pr-7 py-2.5 bg-transparent text-xs text-slate-900 dark:text-white font-medium focus:outline-hidden cursor-pointer appearance-none transition-all duration-150 ease-in-out"
                    aria-label="Country Code"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code} className="text-slate-900 bg-white dark:bg-slate-900 dark:text-white">
                        {c.flag} {c.dialCode} ({c.name})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Phone Input */}
                <input
                  type="tel"
                  value={rawPhoneInput}
                  onChange={(e) => {
                    setRawPhoneInput(e.target.value);
                  }}
                  placeholder={selectedCountry.placeholder}
                  className="flex-1 px-3.5 py-2.5 bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden transition-all duration-150 ease-in-out"
                />
              </div>

              <div className="flex items-center justify-between mt-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Stored internationally as: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{computeInternationalPhone(settings.countryCode, rawPhoneInput) || 'None'}</span>
                </span>
              </div>

              {settings.isVerified && settings.phoneNumber === computeInternationalPhone(settings.countryCode, rawPhoneInput) ? (
                <div className="mt-3 flex items-center justify-between text-xs p-3 rounded-lg bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20">
                  <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Number verified for automated text reminders
                  </span>
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={verifyStep === 'sending'}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
                  >
                    {verifyStep === 'sending' ? 'Sending...' : 'Re-verify'}
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {verifyStep === 'code' || verifyStep === 'checking' ? (
                    <div className="space-y-3 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30">
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        We texted a 6-digit code to the number ending in <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{verifyLast4 || computeInternationalPhone(settings.countryCode, rawPhoneInput).slice(-4)}</span>. It expires in 10 minutes.
                      </p>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={codeInput}
                          onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))}
                          placeholder="123456"
                          aria-label="Verification code"
                          className="w-32 px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-xs font-mono tracking-widest text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out"
                        />
                        <button
                          type="button"
                          onClick={handleCheckCode}
                          disabled={codeInput.length !== 6 || verifyStep === 'checking'}
                          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-all duration-150 ease-in-out shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
                        >
                          {verifyStep === 'checking' ? 'Checking...' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={handleSendCode}
                          disabled={verifyStep === 'checking'}
                          className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800/80 transition-all duration-150 ease-in-out disabled:opacity-50 cursor-pointer"
                        >
                          Send a new code
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVerifyStep('idle');
                            setVerifyMessage(null);
                          }}
                          className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline cursor-pointer ml-1"
                        >
                          Change number
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={SMS_COMING_SOON || !canVerify || verifyStep === 'sending'}                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-all duration-150 ease-in-out shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
                      >
                        {verifyStep === 'sending' ? 'Sending code...' : 'Verify number'}
                      </button>
                      {!canVerify && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {!rawPhoneInput.trim()
                            ? 'Enter your mobile number above.'
                            : 'Enter a valid phone number to verify.'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {verifyMessage && (
                <p className={`mt-2.5 text-xs ${verifyMessage.type === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`} role="status">
                  {verifyMessage.text}
                </p>
              )}
            </div>

            {/* Time Zone Field */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Time Zone
              </label>
              <div className="relative">
                <select
                  value={settings.timeZone}
                  onChange={(e) => setSettings({ ...settings, timeZone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-xs text-slate-900 dark:text-white font-medium focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer appearance-none pr-9 transition-all duration-150 ease-in-out"
                >
                  {!COMMON_TIMEZONES.includes(settings.timeZone) && (
                    <option value={settings.timeZone}>{settings.timeZone} (Auto-detected)</option>
                  )}
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 inline shrink-0" />
                Detected automatically; all reminders calculate against this zone.
              </p>
            </div>
          </div>

          {/* Row 2: Default reminder time & Channel Selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
            {/* Default Time of Day */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Default Reminder Time of Day
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="time"
                  value={settings.defaultReminderTime || '09:00'}
                  onChange={(e) => setSettings({ ...settings, defaultReminderTime: e.target.value })}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-xs text-slate-900 dark:text-white font-medium focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Default time for alerts (default 9:00 AM). Individual rules can override this.
              </p>
            </div>

            {/* Notification Channel */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Notification Channel
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg border border-indigo-600/60 dark:border-indigo-500/60 bg-indigo-50/30 dark:bg-indigo-950/30 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span className="text-xs font-medium text-slate-900 dark:text-white">Text message</span>
                  </div>
                  <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/20 opacity-50 flex items-center justify-between cursor-not-allowed">
                  <div className="flex items-center gap-2.5">
                    <PhoneCall className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-xs font-medium text-slate-500">Phone call</span>
                  </div>
                  <span className="tracking-wider text-[10px] font-bold uppercase text-slate-400 px-2 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800">
                    Coming later
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Direct SMS notifications sent to your validated international number.
              </p>
            </div>
          </div>

          {/* Row 3: Text message sign-up and consent */}
          <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
            {settings.consent ? (
              <div className="p-5 sm:p-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/10 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <p className="font-semibold text-slate-900 dark:text-white">You are signed up for text reminders from Apodict.</p>
                    {settings.consentGivenAt && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Signed up on {new Date(settings.consentGivenAt).toLocaleDateString()} at {new Date(settings.consentGivenAt).toLocaleTimeString()}.
                      </p>
                    )}
                    <p className="mt-1 text-slate-600 dark:text-slate-400">
                      Reply HELP for help or STOP to opt out at any time. Msg &amp; data rates may apply.{' '}
                      <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">Terms of Service</a>
                      {' '}&middot;{' '}
                      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">Privacy Policy</a>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await handleToggleConsent(false);
                    setConsentChecked(false);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all duration-150 ease-in-out cursor-pointer"
                >
                  Unsubscribe from text reminders
                </button>
              </div>
            ) : (
              <div className="p-5 sm:p-6 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/20 space-y-4">
                <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <p className="font-semibold text-slate-900 dark:text-white mb-1">Sign up for text message reminders</p>
                  <p className="text-slate-600 dark:text-slate-400">
                    You will receive a verification code when you verify your number, and reminders about the assignment,
                    quiz, and exam deadlines you choose.
                  </p>
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                    I agree to receive automated text message reminders from Apodict about my assignment, quiz,
                    and exam deadlines at the mobile number above. Message frequency varies with the reminder rules you
                    set, up to 10 messages per day. Msg &amp; data rates may apply. Reply HELP for help or STOP to opt
                    out. Consent is not a condition of using the app.
                  </span>
                </label>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  By signing up, you also agree to our{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">Privacy Policy</a>.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleToggleConsent(true)}
                    disabled={SMS_COMING_SOON || !consentChecked || (!settings.phoneNumber && !computeInternationalPhone(settings.countryCode, rawPhoneInput))}                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-all duration-150 ease-in-out shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
                  >
                    Yes, sign me up!
                  </button>
                  {!settings.phoneNumber && !computeInternationalPhone(settings.countryCode, rawPhoneInput) && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">Enter your mobile phone number above first.</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div>
              {settingsMessage && (
                <div className={`inline-flex items-center gap-2 text-xs font-medium ${
                  settingsMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {settingsMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{settingsMessage.text}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => handleSaveSettings()}
              disabled={isSavingSettings}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium transition-all duration-150 ease-in-out shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 self-end sm:self-auto cursor-pointer"
            >
              {isSavingSettings ? 'Saving Settings...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 2: REMINDER RULES */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <span>Reminder Rules</span>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/70 dark:border-slate-700/70">
                {rules.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Rules follow your course deadlines automatically. If a deadline date changes, reminders adjust.
            </p>
          </div>

          <button
            onClick={handleOpenAddRule}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium transition-all duration-150 ease-in-out shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Rule</span>
          </button>
        </div>

        {/* Delete Confirmation Alert Banner */}
        {ruleIdToDelete && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <div className="text-xs font-medium text-rose-900 dark:text-rose-200">
                Are you sure you want to permanently delete this reminder rule?
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() => setRuleIdToDelete(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-950/40 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-150 ease-in-out cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDeleteRule}
                disabled={isDeletingRule}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-xs transition-all duration-150 ease-in-out cursor-pointer"
              >
                {isDeletingRule ? 'Deleting...' : 'Delete Rule'}
              </button>
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <div className="p-8 sm:p-12 rounded-xl bg-white dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3">
            <div className="w-10 h-10 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 flex items-center justify-center mx-auto">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">No Reminder Rules Configured</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                Add your first rule to receive automated text messages before exams, projects, or homework deadlines.
              </p>
            </div>
            <button
              onClick={handleOpenAddRule}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium shadow-xs inline-flex items-center gap-1.5 transition-all duration-150 ease-in-out cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Rule</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {rules.map((rule) => {
              let scopeLabel = '';
              let scopeDetail = '';

              if (rule.scope.type === 'specific_assignment') {
                const foundItem = allDeadlinesWithCourse.find((i) => i.deadline.id === rule.scope.deadlineId);
                scopeLabel = 'Specific Assignment';
                scopeDetail = foundItem 
                  ? `${foundItem.deadline.title} (${foundItem.course.name})` 
                  : 'Assignment Deadline';
              } else if (rule.scope.type === 'all_in_course') {
                const foundCourse = courses.find((c) => c.id === rule.scope.courseId);
                scopeLabel = 'All Course Deadlines';
                scopeDetail = foundCourse ? foundCourse.name : 'Selected Course';
              } else {
                const typeName = DEADLINE_TYPES.find((t) => t.id === rule.scope.deadlineType)?.label || rule.scope.deadlineType;
                if (rule.scope.courseId) {
                  const foundCourse = courses.find((c) => c.id === rule.scope.courseId);
                  scopeLabel = `All ${typeName}s`;
                  scopeDetail = `In ${foundCourse ? foundCourse.name : 'Selected Course'}`;
                } else {
                  scopeLabel = `All ${typeName}s`;
                  scopeDetail = 'Across all courses';
                }
              }

              return (
                <div
                  key={rule.id}
                  className={`p-6 rounded-xl border transition-all duration-150 ease-in-out ${
                    rule.enabled
                      ? 'bg-white dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/80 shadow-xs'
                      : 'bg-slate-50/50 dark:bg-slate-900/20 border-slate-200/60 dark:border-slate-800/50 opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${rule.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white truncate">
                          {rule.name}
                        </h3>
                      </div>

                      <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-400 dark:text-slate-500">Scope:</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {scopeLabel}
                          </span>
                          <span className="truncate text-slate-500 dark:text-slate-400">({scopeDetail})</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-slate-400 dark:text-slate-500">Lead Times:</span>
                          {rule.leadTimes.map((lt, idx) => {
                            const opt = LEAD_TIME_OPTIONS.find((o) => o.id === lt);
                            return (
                              <React.Fragment key={lt}>
                                {idx > 0 && <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>}
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {opt ? opt.label : lt}
                                </span>
                              </React.Fragment>
                            );
                          })}
                        </div>

                        <div className="text-slate-500 dark:text-slate-400 pt-0.5 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            Time: {rule.customReminderTime || `${settings.defaultReminderTime || '09:00'} (default)`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Toggle and Action Buttons */}
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule)}
                        className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-150 ${
                          rule.enabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                        title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                        aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform duration-150 ${
                            rule.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>

                      <div className="flex items-center gap-1 pt-1">
                        <button
                          onClick={() => handleOpenEditRule(rule)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150 ease-in-out cursor-pointer"
                          title="Edit rule"
                          aria-label="Edit rule"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setRuleIdToDelete(rule.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150 ease-in-out cursor-pointer"
                          title="Delete rule"
                          aria-label="Delete rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 3: PREVIEW UPCOMING REMINDERS */}
      <section className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-700 dark:text-slate-300">
              <CalendarDays className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>Upcoming Reminders</span>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/70 dark:border-slate-700/70">
                  {upcomingReminders.length} / 15
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                The next 15 scheduled reminders produced by your enabled rules in time zone: <strong className="text-slate-700 dark:text-slate-300">{settings.timeZone}</strong>.
              </p>
            </div>
          </div>

          {undatedDeadlinesCount > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800/70 text-xs text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/80">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                <strong>{undatedDeadlinesCount}</strong> {undatedDeadlinesCount === 1 ? 'deadline was' : 'deadlines were'} ignored because they have no date.
              </span>
            </div>
          )}
        </div>

        <div className="p-6 sm:p-8">
          {upcomingReminders.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-10 h-10 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-800/50 text-slate-400 flex items-center justify-center mx-auto">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white">No Upcoming Reminders Scheduled</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                  {rules.filter((r) => r.enabled).length === 0
                    ? 'All rules are currently disabled or no rules exist yet. Turn on a rule above to preview scheduled alerts.'
                    : 'There are no future matching deadlines found for your active rules. Completed deadlines and past dates are automatically skipped.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingReminders.map((preview, index) => (
                <div
                  key={preview.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/20 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all duration-150 ease-in-out gap-4"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <span className="w-7 text-center text-xs font-mono font-medium text-slate-400 shrink-0">
                      #{index + 1}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {preview.deadlineTitle}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {preview.courseName}
                        </span>
                        <span className="tracking-wider text-[10px] font-bold uppercase text-slate-400 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                          {preview.deadlineType}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>Due <strong className="font-medium text-slate-700 dark:text-slate-300">{preview.deadlineDate}</strong></span>
                        <span aria-hidden="true">·</span>
                        <span>Lead: <strong className="font-medium text-indigo-600 dark:text-indigo-400">{preview.leadTimeLabel}</strong></span>
                        <span aria-hidden="true">·</span>
                        <span>Rule: <span className="text-slate-600 dark:text-slate-300">{preview.ruleName}</span></span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-left sm:text-right pl-10 sm:pl-0">
                    <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center sm:justify-end gap-1.5 font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{preview.reminderFormattedTime}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Text reminder dispatch
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* RULE MODAL: Add / Edit Rule */}
      {isRuleFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-md max-w-lg w-full p-6 sm:p-8 space-y-6 my-8 transition-all duration-150 ease-in-out">
            <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                  {editingRuleId ? 'Edit Reminder Rule' : 'Create Reminder Rule'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure the scope, lead times, and alert time for this rule.
                </p>
              </div>
              <button
                onClick={() => setIsRuleFormOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150 ease-in-out cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {ruleFormError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{ruleFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveRule} className="space-y-6">
              {/* Rule Name */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Rule Name
                </label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. Midterm & Final Exams alert"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out"
                  required
                />
              </div>

              {/* Rule Scope Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Scope
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setRuleScopeType('assignment_type')}
                    className={`p-2.5 rounded-lg border text-xs font-medium text-center transition-all duration-150 ease-in-out cursor-pointer ${
                      ruleScopeType === 'assignment_type'
                        ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    Assignment Type
                  </button>

                  <button
                    type="button"
                    onClick={() => setRuleScopeType('all_in_course')}
                    className={`p-2.5 rounded-lg border text-xs font-medium text-center transition-all duration-150 ease-in-out cursor-pointer ${
                      ruleScopeType === 'all_in_course'
                        ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    All in Course
                  </button>

                  <button
                    type="button"
                    onClick={() => setRuleScopeType('specific_assignment')}
                    className={`p-2.5 rounded-lg border text-xs font-medium text-center transition-all duration-150 ease-in-out cursor-pointer ${
                      ruleScopeType === 'specific_assignment'
                        ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    Specific Item
                  </button>
                </div>
              </div>

              {/* Scope Detail */}
              {ruleScopeType === 'assignment_type' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Assignment Type
                    </label>
                    <select
                      value={ruleDeadlineType}
                      onChange={(e) => setRuleDeadlineType(e.target.value as DeadlineType)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out cursor-pointer"
                    >
                      {DEADLINE_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Course Filter
                    </label>
                    <select
                      value={ruleCourseId}
                      onChange={(e) => setRuleCourseId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out cursor-pointer"
                    >
                      <option value="">All Courses</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {ruleScopeType === 'all_in_course' && (
                <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Select Course
                  </label>
                  <select
                    value={ruleCourseId}
                    onChange={(e) => setRuleCourseId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out cursor-pointer"
                    required
                  >
                    <option value="">-- Choose a Course --</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.deadlines.length} deadlines)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {ruleScopeType === 'specific_assignment' && (
                <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Select Specific Assignment
                  </label>
                  <select
                    value={ruleDeadlineId}
                    onChange={(e) => setRuleDeadlineId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out cursor-pointer"
                    required
                  >
                    <option value="">-- Choose from saved deadlines --</option>
                    {allDeadlinesWithCourse.map(({ deadline, course }) => (
                      <option key={deadline.id} value={deadline.id}>
                        {course.name} - {deadline.title} ({deadline.date || 'No Date'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Lead Times Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Lead Times (pick one or more)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {LEAD_TIME_OPTIONS.map((opt) => {
                    const isChecked = ruleLeadTimes.includes(opt.id);
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-all duration-150 ease-in-out ${
                          isChecked
                            ? 'border-indigo-600/70 dark:border-indigo-500/70 bg-indigo-50/40 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200 font-medium'
                            : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setRuleLeadTimes([...ruleLeadTimes, opt.id]);
                            } else {
                              setRuleLeadTimes(ruleLeadTimes.filter((lt) => lt !== opt.id));
                            }
                          }}
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Reminder Time Override */}
              <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 space-y-2.5">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomTime}
                    onChange={(e) => setUseCustomTime(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Set a custom time of day for this rule
                  </span>
                </label>

                {useCustomTime ? (
                  <div className="pt-2 pl-6 flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <input
                      type="time"
                      value={ruleCustomTime}
                      onChange={(e) => setRuleCustomTime(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-150 ease-in-out cursor-pointer"
                    />
                    <span className="text-xs text-slate-500">
                      Overrides the default {settings.defaultReminderTime || '09:00'} AM setting.
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 pl-6">
                    Will use your account default reminder time: <strong>{settings.defaultReminderTime || '09:00'}</strong>.
                  </p>
                )}
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setIsRuleFormOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-950/40 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-150 ease-in-out cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRule}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium transition-all duration-150 ease-in-out shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingRule ? 'Saving Rule...' : editingRuleId ? 'Update Rule' : 'Save Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
