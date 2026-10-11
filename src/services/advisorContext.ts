import { Course } from '../types/academic';

const DAY_MS = 86400000;
const MAX_CHARS = 9000;

const round = (n: number) => Math.round(n * 10) / 10;

function daysUntil(date: string, now: Date): number {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / DAY_MS);
}

function when(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} ago`;
  return `in ${days} days`;
}

/** Plain-text summary of the student's courses, sent to the voice advisor when a session starts. */
export function buildAdvisorContext(courses: Course[], now: Date = new Date()): string {
  if (courses.length === 0) return 'The student has not added any courses yet.';

  const lines: string[] = [`Today is ${now.toDateString()}.`];

  for (const c of courses) {
    const title = [c.code, c.name].filter(Boolean).join(' ');
    lines.push('', `Course: ${title}${c.term ? ` (${c.term})` : ''}${c.instructor ? `, instructor ${c.instructor}` : ''}`);

    // Grading categories: weight and what has been scored so far (no overall grade is calculated here)
    const grading = c.categories.map((cat) => {
      const weight = cat.weight == null ? 'weight not stated' : `${round(cat.weight)}%`;
      const items = c.deadlines.filter((d) => d.categoryId === cat.id && !d.excludedFromGrading);
      if (items.length > 0) {
        const scores = items.filter((d) => d.score != null).map((d) => d.score as number);
        const avg = scores.length ? `, average ${round(scores.reduce((a, b) => a + b, 0) / scores.length)}%` : '';
        return `${cat.name} ${weight} (${scores.length} of ${items.length} graded${avg})`;
      }
      return `${cat.name} ${weight} (${cat.currentScore != null ? `score ${round(cat.currentScore)}%` : 'not graded yet'})`;
    });
    lines.push(`Grading: ${grading.length ? grading.join('; ') : 'not available'}`);

    const open = c.deadlines.filter((d) => !d.completed && d.date);
    const overdue = open
      .filter((d) => daysUntil(d.date as string, now) < 0)
      .sort((a, b) => (a.date as string).localeCompare(b.date as string))
      .slice(-5);
    const upcoming = open
      .filter((d) => daysUntil(d.date as string, now) >= 0)
      .sort((a, b) => (a.date as string).localeCompare(b.date as string));
    const shown = upcoming.filter((d) => daysUntil(d.date as string, now) <= 30).slice(0, 10);

    if (overdue.length) {
      lines.push(`Overdue and not marked complete: ${overdue.map((d) => `${d.title} (${d.date})`).join('; ')}`);
    }
    if (shown.length) {
      lines.push('Upcoming deadlines:');
      shown.forEach((d) =>
        lines.push(`- ${d.title}: ${d.date} (${when(daysUntil(d.date as string, now))}), ${d.type}${d.weight != null ? `, worth ${round(d.weight)}%` : ''}`)
      );
    } else {
      lines.push('No deadlines in the next 30 days.');
    }
    if (upcoming.length > shown.length) lines.push(`${upcoming.length - shown.length} more deadline(s) later in the semester.`);
    const done = c.deadlines.filter((d) => d.completed).length;
    if (done) lines.push(`${done} deadline(s) already marked complete.`);
  }

  const text = lines.join('\n');
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + '\n[Summary shortened]' : text;
}