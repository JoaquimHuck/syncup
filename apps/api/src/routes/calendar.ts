/**
 * Calendar Routes — fetch availability and find slots
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth';
import { findAvailableSlots } from '../services/scheduler';
import { BadRequestError } from '../utils/errors';
import { FindSlotsRequest } from '@syncup/shared';
import { prisma } from '../utils/db';
import { getBusySlots as getGoogleBusy, listEvents, GoogleTokens } from '../services/google-calendar';
import { getBusySlots as getMicrosoftBusy } from '../services/microsoft-calendar';
import { getBusySlots as getAppleBusy } from '../services/apple-calendar';
import { decryptJson } from '../utils/crypto';
import { getCompanyFromEmail, isInternalContact } from '../utils/company';
import { updatePreferences } from '../services/preferences';
import { DateTime } from 'luxon';

export const calendarRouter = Router();
calendarRouter.use(requireAuth);

/**
 * POST /api/calendar/find-slots
 * Body: FindSlotsRequest
 * Returns the top suggested slots across all attendees' calendars.
 */
calendarRouter.post('/find-slots', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as FindSlotsRequest;
    if (!body.attendeeEmails?.length) throw new BadRequestError('attendeeEmails is required');
    if (!body.durationMinutes) throw new BadRequestError('durationMinutes is required');
    if (!body.rangeStart || !body.rangeEnd) throw new BadRequestError('rangeStart and rangeEnd are required');

    const userId = req.session.userId!;

    // Collect busy slots from all attendees (owner + contacts)
    const allBusy = await collectBusySlots(userId, body.attendeeEmails, body.rangeStart, body.rangeEnd);

    // Load preferences for context
    const preferences = await prisma.preference.findMany({
      where: { userId },
    });

    // Run the scheduling engine
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const userPrefs = JSON.parse(user?.preferences ?? '{}');

    const result = await findAvailableSlots({
      busySlots: allBusy,
      durationMinutes: body.durationMinutes,
      rangeStart: new Date(body.rangeStart),
      rangeEnd: new Date(body.rangeEnd),
      userPreferences: userPrefs,
      learnedPreferences: preferences,
      attendeeEmails: body.attendeeEmails,
    });

    return res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/calendar/status
 * Returns whether the current user has connected their calendar.
 */
calendarRouter.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId! },
      select: { calendarProvider: true, oauthTokens: true },
    });
    return res.json({
      data: {
        connected: !!user?.calendarProvider && !!user?.oauthTokens,
        provider: user?.calendarProvider ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/calendar/sync
 * Imports events from the user's Google Calendar into the SyncUp database.
 * Fetches the last 3 months + next 6 months. Trains learned preferences from past events.
 */
calendarRouter.post('/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user?.calendarProvider || !user.oauthTokens) {
      return res.status(400).json({ error: 'No calendar connected. Connect Google Calendar first.' });
    }
    if (user.calendarProvider !== 'google') {
      return res.status(400).json({ error: 'Calendar sync is currently supported for Google Calendar only.' });
    }

    const tokens = decryptJson<GoogleTokens>(user.oauthTokens);
    if (!tokens) return res.status(400).json({ error: 'Invalid calendar tokens. Please reconnect.' });

    const now = DateTime.now();
    const timeMin = now.minus({ months: 3 }).startOf('day').toISO()!;
    const timeMax = now.plus({ months: 6 }).endOf('day').toISO()!;

    const events = await listEvents(tokens, timeMin, timeMax);

    let imported = 0;
    let skipped = 0;
    let trained = 0;

    for (const event of events) {
      if (!event.id || event.status === 'cancelled') { skipped++; continue; }

      // Skip events shorter than 5 minutes or longer than 8 hours (likely not real meetings)
      const durationMin = (new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60000;
      if (durationMin < 5 || durationMin > 480) { skipped++; continue; }

      // Check if already imported
      const existing = await prisma.meeting.findFirst({
        where: { externalId: event.id, createdById: userId },
      });
      if (existing) { skipped++; continue; }

      // Resolve attendee emails to contacts (create if missing)
      const attendeeEmails = event.attendeeEmails.filter((e) => e !== user.email);
      const contactIds: string[] = [];

      for (const email of attendeeEmails) {
        let contact = await prisma.contact.findFirst({
          where: { ownerId: userId, email },
        });
        if (!contact) {
          // Auto-create contact from Google Calendar attendee
          const namePart = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          contact = await prisma.contact.create({
            data: {
              ownerId: userId,
              name: namePart,
              email,
              company: getCompanyFromEmail(email),
              isInternal: isInternalContact(user.email, email),
            },
          });
        }
        contactIds.push(contact.id);
      }

      // Create meeting record
      const meeting = await prisma.meeting.create({
        data: {
          title: event.title,
          description: event.description ?? null,
          startTime: new Date(event.startTime),
          endTime: new Date(event.endTime),
          createdById: userId,
          source: 'google',
          externalId: event.id,
          attendees: {
            create: contactIds.map((contactId) => ({ contactId, responseStatus: 'accepted' })),
          },
        },
      });

      imported++;

      // Train AI preferences from past meetings
      const isPast = new Date(event.endTime) < new Date();
      if (isPast && contactIds.length > 0) {
        for (const contactId of contactIds) {
          await updatePreferences(userId, contactId, new Date(event.startTime), new Date(event.endTime));
        }
        trained++;
      }
    }

    return res.json({
      data: {
        imported,
        skipped,
        trained,
        total: events.length,
        message: `Imported ${imported} meetings, trained AI on ${trained} past meetings.`,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---- Internal helper ----

interface TokenStore {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  username?: string;
  appPassword?: string;
}

async function collectBusySlots(
  ownerId: string,
  attendeeEmails: string[],
  rangeStart: string,
  rangeEnd: string,
) {
  const busy: Array<{ start: string; end: string; contactId: string }> = [];

  // Owner's calendar
  const owner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (owner?.oauthTokens && owner.calendarProvider) {
    const tokens = decryptJson<TokenStore>(owner.oauthTokens);
    if (tokens) {
      try {
        let ownerBusy: Array<{ start: string; end: string }> = [];
        if (owner.calendarProvider === 'google') {
          ownerBusy = await getGoogleBusy(tokens as Parameters<typeof getGoogleBusy>[0], rangeStart, rangeEnd);
        } else if (owner.calendarProvider === 'microsoft') {
          ownerBusy = await getMicrosoftBusy(tokens as Parameters<typeof getMicrosoftBusy>[0], rangeStart, rangeEnd);
        } else if (owner.calendarProvider === 'apple') {
          ownerBusy = await getAppleBusy(tokens as Parameters<typeof getAppleBusy>[0], rangeStart, rangeEnd);
        }
        busy.push(...ownerBusy.map((s) => ({ ...s, contactId: ownerId })));
      } catch (e) {
        console.error('[calendar] Failed to fetch owner busy slots', e);
      }
    }
  }

  // Linked contacts that also have their own SyncUp accounts
  const contacts = await prisma.contact.findMany({
    where: { ownerId, email: { in: attendeeEmails } },
  });

  for (const contact of contacts) {
    if (!contact.linkedUserId) continue;
    const linkedUser = await prisma.user.findUnique({ where: { id: contact.linkedUserId } });
    if (!linkedUser?.oauthTokens || !linkedUser.calendarProvider) continue;

    const tokens = decryptJson<TokenStore>(linkedUser.oauthTokens);
    if (!tokens) continue;

    try {
      let contactBusy: Array<{ start: string; end: string }> = [];
      if (linkedUser.calendarProvider === 'google') {
        contactBusy = await getGoogleBusy(tokens as Parameters<typeof getGoogleBusy>[0], rangeStart, rangeEnd);
      } else if (linkedUser.calendarProvider === 'microsoft') {
        contactBusy = await getMicrosoftBusy(tokens as Parameters<typeof getMicrosoftBusy>[0], rangeStart, rangeEnd);
      } else if (linkedUser.calendarProvider === 'apple') {
        contactBusy = await getAppleBusy(tokens as Parameters<typeof getAppleBusy>[0], rangeStart, rangeEnd);
      }
      busy.push(...contactBusy.map((s) => ({ ...s, contactId: contact.id })));
    } catch (e) {
      console.error(`[calendar] Failed to fetch busy slots for contact ${contact.id}`, e);
    }
  }

  return busy;
}
