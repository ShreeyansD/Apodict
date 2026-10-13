import { DeadlineType } from './academic';
import { ReminderLeadTime, NotificationRuleScope } from './notifications';

export interface PushSettings {
  timeZone: string;
  defaultReminderTime: string;
  updatedAt: string;
}

export interface PushRule {
  id: string;
  name: string;
  enabled: boolean;
  scope: NotificationRuleScope;
  leadTimes: ReminderLeadTime[];
  customReminderTime: string | null; // e.g. "09:00" or null for settings default
  createdAt: string;
  updatedAt: string;
}

export interface UpcomingPushReminderPreview {
  id: string;
  deadlineId: string;
  deadlineTitle: string;
  deadlineDate: string;
  deadlineType: DeadlineType;
  courseId: string;
  courseName: string;
  courseColor: string;
  reminderDateTime: string; // ISO string
  reminderFormattedTime: string; // formatted in settings timeZone
  leadTime: ReminderLeadTime;
  leadTimeLabel: string;
  ruleId: string;
  ruleName: string;
}
