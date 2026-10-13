import { DateTime } from 'luxon';

/**
 * Computes the exact UTC reminder instant from deadline date, time of day,
 * lead days, and user's time zone.
 *
 * Subtracts lead days in the user's zone BEFORE converting to UTC, and never
 * applies a time zone offset to a value that is already a UTC instant.
 *
 * Formula:
 * DateTime.fromObject({ year, month, day, hour, minute }, { zone: userTimeZone })
 *   .minus({ days: leadDays })
 *   .toUTC()
 */
export function computeReminderInstant(
  dateStr: string,
  timeStr: string,
  leadDays: number = 0,
  userTimeZone: string = 'America/New_York'
): DateTime {
  const [year, month, day] = (dateStr || '').split('-').map((v) => parseInt(v, 10));
  const [hour, minute] = (timeStr || '09:00').split(':').map((v) => parseInt(v, 10));
  const safeZone = userTimeZone || 'America/New_York';

  return DateTime.fromObject(
    {
      year: year || 2026,
      month: month || 1,
      day: day || 1,
      hour: typeof hour === 'number' && !isNaN(hour) ? hour : 9,
      minute: typeof minute === 'number' && !isNaN(minute) ? minute : 0,
      second: 0,
      millisecond: 0,
    },
    { zone: safeZone }
  )
    .minus({ days: leadDays || 0 })
    .toUTC();
}

/**
 * Formats a reminder instant in the user's zone with date, time, and short zone name.
 * e.g. "Tue, Oct 13, 2026, 11:30 AM CDT"
 */
export function formatReminderInstantLocal(
  instantUtc: DateTime | Date | string,
  userTimeZone: string = 'America/New_York'
): string {
  const safeZone = userTimeZone || 'America/New_York';
  let dt: DateTime;

  if (typeof instantUtc === 'string') {
    dt = DateTime.fromISO(instantUtc, { zone: 'utc' });
  } else if (instantUtc instanceof Date) {
    dt = DateTime.fromJSDate(instantUtc, { zone: 'utc' });
  } else if (DateTime.isDateTime(instantUtc)) {
    dt = instantUtc;
  } else {
    dt = DateTime.utc();
  }

  return dt.setZone(safeZone).toFormat('EEE, MMM d, yyyy, h:mm a ZZZZ');
}
