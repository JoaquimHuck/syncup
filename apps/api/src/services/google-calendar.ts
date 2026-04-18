/**
 * Google Calendar Service
 * Handles OAuth 2.0 flow, token refresh, and calendar read/write operations
 * using the official googleapis npm package.
 */
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
}

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

/** Create a configured OAuth2 client. */
function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.API_URL ?? 'http://localhost:3001'}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** Generate the Google consent screen URL. */
export function getGoogleAuthUrl(state: string): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // force refresh_token on every consent
    state,
  });
}

/** Exchange an authorization code for tokens. */
export async function handleGoogleCallback(code: string): Promise<GoogleTokens> {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens as GoogleTokens;
}

/**
 * Build an authenticated OAuth2 client from stored tokens.
 * Automatically refreshes the access token if it has expired.
 * Returns the client AND updated tokens (save them back if refreshed).
 */
export async function getAuthenticatedClient(
  tokens: GoogleTokens,
): Promise<{ client: OAuth2Client; tokens: GoogleTokens }> {
  const client = createOAuth2Client();
  client.setCredentials(tokens);

  // If the access token is expired (or will expire in <5 min), refresh it
  const expiryDate = tokens.expiry_date ?? 0;
  const isExpired = expiryDate < Date.now() + 5 * 60 * 1000;

  if (isExpired && tokens.refresh_token) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    return { client, tokens: credentials as GoogleTokens };
  }

  return { client, tokens };
}

/**
 * Refresh a Google OAuth token.
 * Returns the new token set.
 */
export async function refreshGoogleToken(tokens: GoogleTokens): Promise<GoogleTokens> {
  const { tokens: refreshed } = await getAuthenticatedClient(tokens);
  return refreshed;
}

/**
 * Fetch busy time slots from the user's primary Google Calendar.
 * Uses the freebusy API for efficient querying without loading event details.
 */
export async function getBusySlots(
  tokens: GoogleTokens,
  rangeStart: string,
  rangeEnd: string,
): Promise<Array<{ start: string; end: string }>> {
  const { client } = await getAuthenticatedClient(tokens);
  const cal = google.calendar({ version: 'v3', auth: client });

  const response = await cal.freebusy.query({
    requestBody: {
      timeMin: rangeStart,
      timeMax: rangeEnd,
      items: [{ id: 'primary' }],
    },
  });

  const busy = response.data.calendars?.['primary']?.busy ?? [];
  return busy
    .filter((b): b is { start: string; end: string } => !!b.start && !!b.end)
    .map((b) => ({ start: b.start!, end: b.end! }));
}

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  attendeeEmails: string[];
  status: string; // 'confirmed' | 'tentative' | 'cancelled'
}

/**
 * List calendar events between two dates.
 * Returns events that have a concrete start/end time (skips all-day events).
 */
export async function listEvents(
  tokens: GoogleTokens,
  timeMin: string,
  timeMax: string,
): Promise<GoogleCalendarEvent[]> {
  const { client } = await getAuthenticatedClient(tokens);
  const cal = google.calendar({ version: 'v3', auth: client });

  const response = await cal.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 500,
  });

  const items = response.data.items ?? [];
  return items
    .filter((e) => e.start?.dateTime && e.end?.dateTime) // skip all-day events
    .map((e) => ({
      id: e.id ?? '',
      title: e.summary ?? '(No title)',
      description: e.description ?? undefined,
      startTime: e.start!.dateTime!,
      endTime: e.end!.dateTime!,
      attendeeEmails: (e.attendees ?? [])
        .map((a) => a.email ?? '')
        .filter(Boolean),
      status: e.status ?? 'confirmed',
    }));
}

/**
 * Delete a calendar event by its ID.
 */
export async function deleteCalendarEvent(
  tokens: GoogleTokens,
  eventId: string,
): Promise<void> {
  const { client } = await getAuthenticatedClient(tokens);
  const cal = google.calendar({ version: 'v3', auth: client });
  await cal.events.delete({ calendarId: 'primary', eventId });
}

/**
 * Create a calendar event on the user's primary Google Calendar.
 * Supports Google Meet link generation (format: 'online') and physical location (format: 'in-person').
 * Returns the event ID, calendar link, and Meet link (if online).
 */
export async function createCalendarEvent(
  tokens: GoogleTokens,
  event: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    attendeeEmails: string[];
    timezone?: string;
    format?: 'online' | 'in-person';
    location?: string; // physical address for in-person meetings
  },
): Promise<{ eventId: string; htmlLink: string; meetLink?: string }> {
  const { client } = await getAuthenticatedClient(tokens);
  const cal = google.calendar({ version: 'v3', auth: client });

  const tzid = event.timezone ?? 'UTC';
  const isOnline = event.format === 'online';

  const requestBody: calendar_v3.Schema$Event = {
    summary: event.title,
    description: event.description,
    start: { dateTime: event.startTime, timeZone: tzid },
    end: { dateTime: event.endTime, timeZone: tzid },
    attendees: event.attendeeEmails.map((email) => ({ email })),
    reminders: { useDefault: true },
    ...(event.location && { location: event.location }),
    ...(isOnline && {
      conferenceData: {
        createRequest: {
          requestId: `syncup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    }),
  };

  const created = await cal.events.insert({
    calendarId: 'primary',
    requestBody,
    // Required for Google Meet link generation
    conferenceDataVersion: isOnline ? 1 : 0,
    sendUpdates: 'all',
  });

  const meetLink = created.data.hangoutLink
    ?? created.data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri
    ?? undefined;

  return {
    eventId: created.data.id ?? '',
    htmlLink: created.data.htmlLink ?? '',
    ...(meetLink && { meetLink }),
  };
}
