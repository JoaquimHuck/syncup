/**
 * Microsoft Calendar Service
 * Uses MSAL (Microsoft Authentication Library) for OAuth 2.0
 * and the Microsoft Graph API for calendar operations.
 */
import * as msal from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

export interface MicrosoftTokens {
  accessToken: string;
  refreshToken?: string;
  expiresOn?: string; // ISO string
  account?: msal.AccountInfo;
}

function getMsalConfig(): msal.Configuration {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be set');
  }
  return {
    auth: {
      clientId,
      clientSecret,
      authority: 'https://login.microsoftonline.com/common',
    },
  };
}

const SCOPES = ['Calendars.ReadWrite', 'User.Read', 'offline_access'];

/** Generate the Microsoft consent screen URL. */
export function getMicrosoftAuthUrl(state: string): string {
  const redirectUri = `${process.env.API_URL ?? 'http://localhost:3001'}/api/auth/microsoft/callback`;
  const cca = new msal.ConfidentialClientApplication(getMsalConfig());

  // Build the auth code URL directly
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
    response_mode: 'query',
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

/** Exchange authorization code for tokens. */
export async function handleMicrosoftCallback(code: string): Promise<MicrosoftTokens> {
  const redirectUri = `${process.env.API_URL ?? 'http://localhost:3001'}/api/auth/microsoft/callback`;
  const cca = new msal.ConfidentialClientApplication(getMsalConfig());

  const result = await cca.acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri,
  });

  if (!result) throw new Error('Microsoft authentication failed');

  return {
    accessToken: result.accessToken,
    expiresOn: result.expiresOn?.toISOString(),
    account: result.account ?? undefined,
  };
}

/** Build a Microsoft Graph client from stored tokens. */
function buildGraphClient(tokens: MicrosoftTokens): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, tokens.accessToken);
    },
  });
}

/**
 * Fetch busy time slots from the user's Outlook calendar.
 * Uses the getSchedule endpoint for free/busy queries.
 */
export async function getBusySlots(
  tokens: MicrosoftTokens,
  rangeStart: string,
  rangeEnd: string,
): Promise<Array<{ start: string; end: string }>> {
  const client = buildGraphClient(tokens);

  // Get the current user's email for the schedule query
  const me = await client.api('/me').select('mail,userPrincipalName').get();
  const email: string = me.mail ?? me.userPrincipalName;

  const result = await client.api('/me/calendar/getSchedule').post({
    schedules: [email],
    startTime: { dateTime: rangeStart, timeZone: 'UTC' },
    endTime: { dateTime: rangeEnd, timeZone: 'UTC' },
    availabilityViewInterval: 30,
  });

  const scheduleItems: Array<{ status: string; start: { dateTime: string }; end: { dateTime: string } }> =
    result.value?.[0]?.scheduleItems ?? [];

  return scheduleItems
    .filter((item) => item.status === 'busy' || item.status === 'tentative')
    .map((item) => ({
      start: new Date(item.start.dateTime + 'Z').toISOString(),
      end: new Date(item.end.dateTime + 'Z').toISOString(),
    }));
}

/**
 * Create a calendar event on the user's Outlook calendar.
 */
export async function createCalendarEvent(
  tokens: MicrosoftTokens,
  event: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    attendeeEmails: string[];
    timezone?: string;
  },
): Promise<{ eventId: string; webLink: string }> {
  const client = buildGraphClient(tokens);
  const tz = event.timezone ?? 'UTC';

  const body = {
    subject: event.title,
    body: {
      contentType: 'text',
      content: event.description ?? '',
    },
    start: { dateTime: event.startTime, timeZone: tz },
    end: { dateTime: event.endTime, timeZone: tz },
    attendees: event.attendeeEmails.map((email) => ({
      emailAddress: { address: email },
      type: 'required',
    })),
    isOnlineMeeting: false,
  };

  const created = await client.api('/me/events').post(body);
  return {
    eventId: created.id as string,
    webLink: created.webLink as string,
  };
}
