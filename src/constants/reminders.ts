import { ReminderLeadTime } from '../types/notifications';
import { DeadlineType } from '../types/academic';

export const COMMON_TIMEZONES: string[] = [
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

export const LEAD_TIME_OPTIONS: Array<{ id: ReminderLeadTime; label: string; daysBefore: number }> = [
  { id: 'morning_of', label: 'The morning of', daysBefore: 0 },
  { id: '1_day_before', label: '1 day before', daysBefore: 1 },
  { id: '2_days_before', label: '2 days before', daysBefore: 2 },
  { id: '3_days_before', label: '3 days before', daysBefore: 3 },
  { id: '1_week_before', label: '1 week before', daysBefore: 7 },
];

export const DEADLINE_TYPES: Array<{ id: DeadlineType; label: string }> = [
  { id: 'exam', label: 'Exam' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'homework', label: 'Homework' },
  { id: 'paper', label: 'Paper' },
  { id: 'project', label: 'Project' },
  { id: 'other', label: 'Other' },
];
