/**
 * Preference Learning Service
 * Updates the learned scheduling preferences for a user-contact pair
 * each time a meeting is created. Uses a rolling average approach.
 */
import { prisma } from '../utils/db';

/**
 * Update (or create) the preference record for a given user-contact pair
 * based on a newly created meeting.
 */
export async function updatePreferences(
  userId: string,
  contactId: string,
  startTime: Date,
  endTime: Date,
): Promise<void> {
  const existing = await prisma.preference.findUnique({
    where: { userId_contactId: { userId, contactId } },
  });

  const hour = startTime.getUTCHours();
  const minute = startTime.getUTCMinutes();
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const dayOfWeek = startTime.getUTCDay(); // 0=Sun
  const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

  if (!existing) {
    await prisma.preference.create({
      data: {
        userId,
        contactId,
        preferredTimes: JSON.stringify([timeStr]),
        preferredDays: JSON.stringify([dayOfWeek]),
        avgDurationMinutes: durationMinutes,
        meetingCount: 1,
      },
    });
    return;
  }

  // Rolling update: add new time/day and recompute averages
  const times: string[] = JSON.parse(existing.preferredTimes);
  const days: number[] = JSON.parse(existing.preferredDays);
  const count = existing.meetingCount;

  // Keep most recent 10 times/days for the preference model
  const updatedTimes = [...times, timeStr].slice(-10);
  const updatedDays = [...days, dayOfWeek].slice(-10);

  // Rolling average duration
  const newAvgDuration = (existing.avgDurationMinutes * count + durationMinutes) / (count + 1);

  await prisma.preference.update({
    where: { userId_contactId: { userId, contactId } },
    data: {
      preferredTimes: JSON.stringify(updatedTimes),
      preferredDays: JSON.stringify(updatedDays),
      avgDurationMinutes: Math.round(newAvgDuration),
      meetingCount: count + 1,
    },
  });
}

/**
 * Get a human-readable summary of preferences for a user-contact pair.
 * Used by the AI agent to include in its context.
 */
export async function getPreferenceSummary(userId: string, contactIds: string[]): Promise<string> {
  if (!contactIds.length) return '';

  const prefs = await prisma.preference.findMany({
    where: { userId, contactId: { in: contactIds } },
    include: { contact: true },
  });

  if (!prefs.length) return '';

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const lines: string[] = ['Meeting history with these contacts:'];

  for (const pref of prefs) {
    const times: string[] = JSON.parse(pref.preferredTimes);
    const days: number[] = JSON.parse(pref.preferredDays);

    // Find the most common time and day
    const topTime = mostCommon(times);
    const topDay = mostCommon(days.map(String));
    const topDayName = topDay !== null ? dayNames[parseInt(topDay)] : null;

    lines.push(
      `- ${pref.contact.name}: ${pref.meetingCount} meetings, ` +
      `usually on ${topDayName ?? 'various days'} at ${topTime ?? 'various times'}, ` +
      `avg ${Math.round(pref.avgDurationMinutes)} min`,
    );
  }

  return lines.join('\n');
}

function mostCommon<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  const freq = new Map<T, number>();
  for (const x of arr) freq.set(x, (freq.get(x) ?? 0) + 1);
  let max = 0;
  let best: T = arr[0];
  for (const [val, count] of freq) {
    if (count > max) { max = count; best = val; }
  }
  return best;
}
