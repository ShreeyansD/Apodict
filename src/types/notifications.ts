import { DeadlineType } from './academic';

export type ReminderLeadTime = 
  | 'morning_of' 
  | '1_day_before' 
  | '2_days_before' 
  | '3_days_before' 
  | '1_week_before';

export type RuleScopeType = 
  | 'specific_assignment' 
  | 'assignment_type' 
  | 'all_in_course';

export interface NotificationRuleScope {
  type: RuleScopeType;
  deadlineId?: string;
  deadlineType?: DeadlineType;
  courseId?: string | null; // null means all courses for assignment_type
}

export interface NotificationRule {
  id: string;
  name: string;
  enabled: boolean;
  scope: NotificationRuleScope;
  leadTimes: ReminderLeadTime[];
  customReminderTime: string | null; // e.g. "09:00" or null for settings default
  createdAt: string;
  updatedAt: string;
}

export interface NotificationSettings {
  phoneNumber: string; // stored in international E.164 format, e.g. "+14155552671"
  countryCode: string; // e.g. "US"
  isVerified: boolean; // default false
  verificationProof?: string | null; // signed by the server when the number was verified
  verifiedAt?: string | null;
  timeZone: string; // e.g. "America/Los_Angeles"
  defaultReminderTime: string; // e.g. "09:00" (9:00 AM)
  channel: 'sms';
  consent: boolean;
  consentGivenAt: string | null;
  updatedAt: string;
}

export interface UpcomingReminderPreview {
  id: string;
  deadlineId: string;
  deadlineTitle: string;
  deadlineDate: string;
  deadlineType: DeadlineType;
  courseId: string;
  courseName: string;
  courseColor: string;
  reminderDateTime: string; // ISO string
  reminderFormattedTime: string; // e.g. "Wed, Oct 8, 2026 at 9:00 AM"
  leadTime: ReminderLeadTime;
  leadTimeLabel: string;
  ruleId: string;
  ruleName: string;
}

export interface CountryInfo {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  placeholder: string;
}