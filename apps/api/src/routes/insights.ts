/**
 * Insights Routes — meeting analytics for the current user
 */
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { requireAuth } from './auth';
import { DateTime } from 'luxon';

export const insightsRouter = Router();
insightsRouter.use(requireAuth);

// GET /api/insights
insightsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;

    const meetings = await prisma.meeting.findMany({
      where: { createdById: userId },
      include: { attendees: { include: { contact: true } } },
      orderBy: { startTime: 'asc' },
    });

    const now = DateTime.now();
    const startOfMonth = now.startOf('month').toJSDate();

    const totalMeetings = meetings.length;
    const meetingsThisMonth = meetings.filter((m) => m.startTime >= startOfMonth).length;

    // Unique contacts seen across all meetings
    const contactsSeen = new Map<string, { name: string; email: string; count: number; company: string | null; isInternal: boolean }>();
    for (const meeting of meetings) {
      for (const a of meeting.attendees) {
        const c = a.contact;
        const existing = contactsSeen.get(c.id);
        if (existing) {
          existing.count++;
        } else {
          contactsSeen.set(c.id, {
            name: c.name,
            email: c.email,
            count: 1,
            company: c.company ?? null,
            isInternal: c.isInternal,
          });
        }
      }
    }

    const uniqueContacts = contactsSeen.size;
    const contactList = Array.from(contactsSeen.values());
    const internalCount = meetings.filter((m) =>
      m.attendees.every((a) => a.contact.isInternal),
    ).length;
    const externalCount = totalMeetings - internalCount;

    const topContacts = contactList
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(({ name, email, count, company }) => ({ name, email, count, company }));

    // Monthly trend — last 6 months
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = now.minus({ months: i }).startOf('month').toJSDate();
      const monthEnd = now.minus({ months: i }).endOf('month').toJSDate();
      const count = meetings.filter(
        (m) => m.startTime >= monthStart && m.startTime <= monthEnd,
      ).length;
      monthlyTrend.push({
        month: DateTime.fromJSDate(monthStart).toFormat('MMM'),
        count,
      });
    }

    return res.json({
      data: {
        totalMeetings,
        meetingsThisMonth,
        uniqueContacts,
        internalCount,
        externalCount,
        topContacts,
        monthlyTrend,
      },
    });
  } catch (err) {
    next(err);
  }
});
