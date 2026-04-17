/**
 * Schedule Matching Engine
 * Finds optimal meeting slots by:
 *  1. Removing busy time from the candidate window
 *  2. Splitting remaining time into candidate slots of the requested duration
 *  3. Scoring each candidate by multiple preference signals
 *  4. Returning the top N ranked suggestions
 */
import { DateTime, Duration, Interval } from 'luxon';
import { SuggestedSlot } from '@syncup/shared';

export interface SchedulerInput {
  busySlots: Array<{ start: string; end: string; contactId?: string }>;
  durationMinutes: number;
  rangeStart: Date;
  rangeEnd: Date;
  userPreferences: {
    workingHoursStart?: string;   // "09:00"
    workingHoursEnd?: string;     // "18:00"
    workingDays?: number[];       // [1,2,3,4,5]
    bufferMinutes?: number;       // 15
    timezone?: string;
  };
  learnedPreferences: Array<{
    preferredTimes: string;   // JSON string
    preferredDays: string;    // JSON string
    avgDurationMinutes: number;
  }>;
  attendeeEmails: string[];
  maxResults?: number;
}

const DEFAULT_WORKING_START = '09:00';
const DEFAULT_WORKING_END = '18:00';
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri
const DEFAULT_BUFFER_MINUTES = 15;
const DEFAULT_MAX_RESULTS = 5;
const CANDIDATE_STEP_MINUTES = 30; // step size when generating candidates

/**
 * Main entry point. Returns ranked suggested meeting slots.
 */
export async function findAvailableSlots(input: SchedulerInput): Promise<{
  slots: SuggestedSlot[];
  busySlots: Array<{ start: string; end: string; contactId: string }>;
}> {
  const tz = input.userPreferences.timezone ?? 'UTC';
  const bufferMinutes = input.userPreferences.bufferMinutes ?? DEFAULT_BUFFER_MINUTES;
  const workingStart = input.userPreferences.workingHoursStart ?? DEFAULT_WORKING_START;
  const workingEnd = input.userPreferences.workingHoursEnd ?? DEFAULT_WORKING_END;
  const workingDays = input.userPreferences.workingDays ?? DEFAULT_WORKING_DAYS;
  const maxResults = input.maxResults ?? DEFAULT_MAX_RESULTS;

  // Parse learned preferences
  const learnedTimes: string[] = [];
  const learnedDays: number[] = [];
  for (const pref of input.learnedPreferences) {
    try {
      learnedTimes.push(...(JSON.parse(pref.preferredTimes) as string[]));
      learnedDays.push(...(JSON.parse(pref.preferredDays) as number[]));
    } catch {
      // ignore malformed pref JSON
    }
  }

  // Build merged busy intervals (add buffer padding around each)
  const busy = input.busySlots.map((b) => ({
    start: DateTime.fromISO(b.start, { zone: tz }),
    end: DateTime.fromISO(b.end, { zone: tz }).plus({ minutes: bufferMinutes }),
    contactId: b.contactId ?? '',
  }));

  const rangeStart = DateTime.fromJSDate(input.rangeStart, { zone: tz });
  // Don't schedule meetings in the past (add 30-min buffer from "now")
  const effectiveStart = DateTime.max(rangeStart, DateTime.now().setZone(tz).plus({ minutes: 30 }));
  const rangeEnd = DateTime.fromJSDate(input.rangeEnd, { zone: tz });

  // Generate candidate start times stepping by CANDIDATE_STEP_MINUTES
  const candidates: SuggestedSlot[] = [];
  let cursor = effectiveStart.startOf('minute');

  while (cursor < rangeEnd) {
    const slotEnd = cursor.plus({ minutes: input.durationMinutes });

    if (slotEnd > rangeEnd) break;

    // Check day-of-week
    const dayOfWeek = cursor.weekday % 7; // luxon: 1=Mon, 7=Sun → convert to 0=Sun...6=Sat
    const jsDay = cursor.weekday === 7 ? 0 : cursor.weekday;
    if (!workingDays.includes(jsDay)) {
      // Jump to start of next working day
      cursor = nextWorkingDayStart(cursor, workingDays, workingStart, tz);
      continue;
    }

    // Check working hours
    const [wsH, wsM] = workingStart.split(':').map(Number);
    const [weH, weM] = workingEnd.split(':').map(Number);
    const dayStart = cursor.set({ hour: wsH, minute: wsM, second: 0 });
    const dayEnd = cursor.set({ hour: weH, minute: weM, second: 0 });

    if (cursor < dayStart) {
      cursor = dayStart;
      continue;
    }
    if (slotEnd > dayEnd) {
      // Skip to next day
      cursor = nextWorkingDayStart(cursor.plus({ days: 1 }), workingDays, workingStart, tz);
      continue;
    }

    // Check against busy slots
    const overlaps = busy.some(
      (b) => cursor < b.end && slotEnd > b.start,
    );

    if (!overlaps) {
      const score = scoreSlot(cursor, slotEnd, learnedTimes, learnedDays, input.durationMinutes);
      candidates.push({
        start: cursor.toISO()!,
        end: slotEnd.toISO()!,
        score,
        reasons: buildReasons(cursor, learnedTimes, learnedDays),
        durationMinutes: input.durationMinutes,
      });
    }

    cursor = cursor.plus({ minutes: CANDIDATE_STEP_MINUTES });
  }

  // Sort by score descending, deduplicate overlapping suggestions, take top N
  candidates.sort((a, b) => b.score - a.score);
  const top = deduplicateSlots(candidates, input.durationMinutes).slice(0, maxResults);

  return {
    slots: top,
    busySlots: input.busySlots.map((b) => ({
      ...b,
      contactId: b.contactId ?? '',
    })),
  };
}

// ---- Scoring ----

/**
 * Score a candidate slot 0–100 based on preference signals:
 *  - Learned preferred times (+25 each match)
 *  - Learned preferred days (+20 each match)
 *  - Morning/afternoon vs evening (-10 for late evening)
 *  - Avoids Mondays 9am (usually packed) (-5)
 *  - Middle of week bonus (+10 for Tue/Wed/Thu)
 */
function scoreSlot(
  start: DateTime,
  _end: DateTime,
  learnedTimes: string[],
  learnedDays: number[],
  durationMinutes: number,
): number {
  let score = 50; // baseline

  const hour = start.hour;
  const jsDay = start.weekday === 7 ? 0 : start.weekday;

  // Preferred time match
  const timeStr = `${String(hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}`;
  if (learnedTimes.includes(timeStr)) score += 25;

  // Preferred day match
  if (learnedDays.includes(jsDay)) score += 20;

  // Time-of-day heuristics
  if (hour >= 9 && hour < 12) score += 10;  // morning
  if (hour >= 14 && hour < 17) score += 8;  // mid-afternoon
  if (hour >= 17) score -= 10;              // late afternoon / evening

  // Day-of-week heuristics
  if (jsDay === 2 || jsDay === 3 || jsDay === 4) score += 10; // Tue/Wed/Thu
  if (jsDay === 1 && hour === 9) score -= 5; // Monday 9am — typically packed

  // Penalize very short notice (< 4 hours from now)
  const hoursUntil = start.diffNow('hours').hours;
  if (hoursUntil < 4) score -= 20;
  else if (hoursUntil < 24) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildReasons(start: DateTime, learnedTimes: string[], learnedDays: number[]): string[] {
  const reasons: string[] = [];
  const hour = start.hour;
  const jsDay = start.weekday === 7 ? 0 : start.weekday;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const timeStr = `${String(hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}`;

  if (learnedTimes.includes(timeStr)) reasons.push('Matches your usual meeting time');
  if (learnedDays.includes(jsDay)) reasons.push(`You usually meet on ${dayNames[jsDay]}s`);
  if (hour >= 9 && hour < 12) reasons.push('Morning slot — typically high focus time');
  if (hour >= 14 && hour < 17) reasons.push('Mid-afternoon — good energy window');
  if (jsDay === 2 || jsDay === 3 || jsDay === 4) reasons.push('Mid-week — minimal Monday/Friday disruption');

  const hoursUntil = start.diffNow('hours').hours;
  if (hoursUntil > 48) reasons.push('Plenty of notice for attendees');

  return reasons;
}

// ---- Helpers ----

function nextWorkingDayStart(
  from: DateTime,
  workingDays: number[],
  workingStart: string,
  tz: string,
): DateTime {
  const [h, m] = workingStart.split(':').map(Number);
  let day = from.startOf('day').set({ hour: h, minute: m, second: 0 });
  for (let i = 0; i < 14; i++) {
    const jsDay = day.weekday === 7 ? 0 : day.weekday;
    if (workingDays.includes(jsDay)) return day;
    day = day.plus({ days: 1 });
  }
  return day;
}

/** Remove slots that overlap with higher-scored ones already selected. */
function deduplicateSlots(sorted: SuggestedSlot[], _durationMinutes: number): SuggestedSlot[] {
  const selected: SuggestedSlot[] = [];
  for (const candidate of sorted) {
    const start = DateTime.fromISO(candidate.start);
    const end = DateTime.fromISO(candidate.end);
    const overlaps = selected.some((s) => {
      const ss = DateTime.fromISO(s.start);
      const se = DateTime.fromISO(s.end);
      return start < se && end > ss;
    });
    if (!overlaps) selected.push(candidate);
  }
  return selected;
}
