/**
 * Apple Calendar Service (CalDAV)
 * Uses Apple's iCloud CalDAV endpoint with an app-specific password.
 * Does NOT use OAuth; Apple uses HTTP Basic Auth for CalDAV.
 *
 * To use this, users must generate an app-specific password at:
 * https://appleid.apple.com → Security → App-Specific Passwords
 */
import * as https from 'https';

export interface AppleCredentials {
  username: string;   // Apple ID email
  appPassword: string; // App-specific password
}

const CALDAV_BASE = 'https://caldav.icloud.com';

/** Make an authenticated HTTP request to iCloud CalDAV. */
async function caldavRequest(
  creds: AppleCredentials,
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const auth = Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');

  return new Promise((resolve, reject) => {
    const url = new URL(path, CALDAV_BASE);
    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'text/xml; charset=utf-8',
        Depth: '1',
        ...headers,
      },
    };

    if (body) {
      (options.headers as Record<string, string>)['Content-Length'] = Buffer.byteLength(body).toString();
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: data,
          headers: res.headers as Record<string, string>,
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Fetch busy time slots from the user's iCloud calendar using a REPORT query.
 * Returns an array of busy slots within the given range.
 */
export async function getBusySlots(
  creds: AppleCredentials,
  rangeStart: string,
  rangeEnd: string,
): Promise<Array<{ start: string; end: string }>> {
  // First, discover the calendar home
  const principalXml = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-home-set/>
    <D:displayname/>
  </D:prop>
</D:propfind>`;

  const principalRes = await caldavRequest(creds, 'PROPFIND', `/`, principalXml, { Depth: '0' });
  if (principalRes.status >= 400) {
    throw new Error(`Apple CalDAV auth failed (${principalRes.status}). Check your credentials.`);
  }

  // Parse calendar home URL from PROPFIND response
  const homeMatch = principalRes.body.match(/<C:calendar-home-set[^>]*>\s*<D:href[^>]*>([^<]+)<\/D:href>/);
  const calendarHome = homeMatch?.[1] ?? `/${creds.username}/calendars/`;

  // Query for calendar events in the range
  const start = formatCalDavDate(rangeStart);
  const end = formatCalDavDate(rangeEnd);

  const reportXml = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:D="DAV:">
  <D:prop>
    <D:getetag/>
    <C:calendar-data>
      <C:comp name="VCALENDAR">
        <C:comp name="VEVENT">
          <C:prop name="DTSTART"/>
          <C:prop name="DTEND"/>
          <C:prop name="SUMMARY"/>
          <C:prop name="TRANSP"/>
        </C:comp>
      </C:comp>
    </C:calendar-data>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${start}" end="${end}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

  const reportRes = await caldavRequest(creds, 'REPORT', calendarHome, reportXml);

  // Parse VEVENT DTSTART/DTEND from the iCal response
  const busy: Array<{ start: string; end: string }> = [];
  const eventBlocks = reportRes.body.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];

  for (const block of eventBlocks) {
    // Skip transparent (free) events
    if (/TRANSP:TRANSPARENT/.test(block)) continue;

    const dtstart = parseICalDate(block.match(/DTSTART[^:]*:([^\r\n]+)/)?.[1]);
    const dtend = parseICalDate(block.match(/DTEND[^:]*:([^\r\n]+)/)?.[1]);

    if (dtstart && dtend) {
      busy.push({ start: dtstart, end: dtend });
    }
  }

  return busy;
}

/**
 * Create a calendar event on iCloud via CalDAV PUT.
 * Returns the URL of the created event.
 */
export async function createCalendarEvent(
  creds: AppleCredentials,
  event: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    attendeeEmails: string[];
    timezone?: string;
  },
): Promise<{ eventUrl: string }> {
  const uid = `syncup-${Date.now()}-${Math.random().toString(36).slice(2)}@syncup`;
  const tz = event.timezone ?? 'UTC';

  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SyncUp//SyncUp//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatCalDavDate(new Date().toISOString())}`,
    `DTSTART;TZID=${tz}:${formatLocalDate(event.startTime)}`,
    `DTEND;TZID=${tz}:${formatLocalDate(event.endTime)}`,
    `SUMMARY:${event.title}`,
    event.description ? `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}` : '',
    ...event.attendeeEmails.map((e) => `ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${e}`),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

  // Discover calendar home first
  const principalRes = await caldavRequest(creds, 'PROPFIND', '/', undefined, { Depth: '0' });
  const homeMatch = principalRes.body.match(/<C:calendar-home-set[^>]*>\s*<D:href[^>]*>([^<]+)<\/D:href>/);
  const calendarHome = homeMatch?.[1] ?? `/${creds.username}/calendars/`;

  const eventPath = `${calendarHome}${uid}.ics`;
  const res = await caldavRequest(creds, 'PUT', eventPath, ical, { 'Content-Type': 'text/calendar; charset=utf-8' });

  if (res.status >= 400) {
    throw new Error(`Failed to create Apple calendar event: HTTP ${res.status}`);
  }

  return { eventUrl: `${CALDAV_BASE}${eventPath}` };
}

// ---- iCal / CalDAV date helpers ----

/** Convert ISO string to CalDAV date format: 20240101T120000Z */
function formatCalDavDate(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Convert ISO string to local date format without Z: 20240101T120000 */
function formatLocalDate(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z?$/, '');
}

/** Parse a CalDAV date string to ISO format. */
function parseICalDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const clean = raw.trim();
  // Handle YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, z] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${z ?? ''}`;
}
