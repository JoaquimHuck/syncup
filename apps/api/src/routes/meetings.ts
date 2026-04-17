/**
 * Meetings Routes — list and create meetings, update preferences
 */
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { requireAuth } from './auth';
import { updatePreferences } from '../services/preferences';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { decryptJson } from '../utils/crypto';
import { deleteCalendarEvent, GoogleTokens } from '../services/google-calendar';

export const meetingsRouter = Router();
meetingsRouter.use(requireAuth);

// GET /api/meetings — list meetings, with optional search/filter params
// Query params: search (title/contact name), from (ISO date), to (ISO date), contactId
meetingsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, from, to, contactId } = req.query as Record<string, string | undefined>;

    const meetings = await prisma.meeting.findMany({
      where: {
        createdById: req.session.userId!,
        ...(search && {
          OR: [
            { title: { contains: search } },
            { description: { contains: search } },
            { attendees: { some: { contact: { name: { contains: search } } } } },
            { attendees: { some: { contact: { email: { contains: search } } } } },
          ],
        }),
        ...(from && { startTime: { gte: new Date(from) } }),
        ...(to && { startTime: { lte: new Date(to) } }),
        ...(contactId && { attendees: { some: { contactId } } }),
      },
      include: { attendees: { include: { contact: true } } },
      orderBy: { startTime: 'desc' },
      take: 200,
    });
    return res.json({ data: meetings });
  } catch (err) {
    next(err);
  }
});

// GET /api/meetings/:id
meetingsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const meeting = await prisma.meeting.findFirst({
      where: { id: req.params.id, createdById: req.session.userId! },
      include: { attendees: { include: { contact: true } } },
    });
    if (!meeting) throw new NotFoundError('Meeting');
    return res.json({ data: meeting });
  } catch (err) {
    next(err);
  }
});

// POST /api/meetings — create a meeting record (called internally after confirmation)
meetingsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, startTime, endTime, attendeeEmails, source, externalId } = req.body as {
      title?: string;
      description?: string;
      startTime?: string;
      endTime?: string;
      attendeeEmails?: string[];
      source?: string;
      externalId?: string;
    };

    if (!title || !startTime || !endTime) {
      throw new BadRequestError('title, startTime, and endTime are required');
    }

    // Resolve attendee emails to contact IDs
    const contacts = await prisma.contact.findMany({
      where: {
        ownerId: req.session.userId!,
        email: { in: attendeeEmails ?? [] },
      },
    });

    const meeting = await prisma.meeting.create({
      data: {
        title,
        description: description ?? null,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        createdById: req.session.userId!,
        source: source ?? 'syncup',
        externalId: externalId ?? null,
        attendees: {
          create: contacts.map((c) => ({
            contactId: c.id,
            responseStatus: 'pending',
          })),
        },
      },
      include: { attendees: { include: { contact: true } } },
    });

    // Update learned preferences for each attendee pair
    for (const contact of contacts) {
      await updatePreferences(req.session.userId!, contact.id, new Date(startTime), new Date(endTime));
    }

    return res.status(201).json({ data: meeting });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/meetings/:id
// Also removes the event from Google Calendar if it has an externalId
meetingsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const meeting = await prisma.meeting.findFirst({
      where: { id: req.params.id, createdById: req.session.userId! },
    });
    if (!meeting) throw new NotFoundError('Meeting');

    // Try to delete from Google Calendar
    if (meeting.externalId && meeting.source === 'google') {
      const user = await prisma.user.findUnique({ where: { id: req.session.userId! } });
      if (user?.calendarProvider === 'google' && user.oauthTokens) {
        const tokens = decryptJson<GoogleTokens>(user.oauthTokens);
        if (tokens) {
          try {
            await deleteCalendarEvent(tokens, meeting.externalId);
          } catch (calErr) {
            // Log but don't block deletion if Google Calendar call fails
            console.error('[meetings] Failed to delete Google Calendar event', calErr);
          }
        }
      }
    }

    await prisma.meeting.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Meeting cancelled' });
  } catch (err) {
    next(err);
  }
});
