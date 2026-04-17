/**
 * SyncUp AI Chat Agent
 * Powered by Claude claude-sonnet-4-6 with streaming.
 *
 * The agent:
 *  1. Parses natural language meeting requests
 *  2. Calls the scheduling engine to find available slots
 *  3. Presents ranked options with human-readable reasons
 *  4. Confirms attendees and gathers title/description
 *  5. Creates the calendar event only after explicit user confirmation
 */
import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { prisma } from '../utils/db';
import { findAvailableSlots } from './scheduler';
import { getPreferenceSummary } from './preferences';
import { decryptJson } from '../utils/crypto';
import { createCalendarEvent as createGoogleEvent, GoogleTokens } from './google-calendar';
import { createCalendarEvent as createMicrosoftEvent, MicrosoftTokens } from './microsoft-calendar';
import { createCalendarEvent as createAppleEvent, AppleCredentials } from './apple-calendar';
import { ChatMessage, SuggestedSlot, PendingMeeting } from '@syncup/shared';
import { DateTime } from 'luxon';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Model to use — claude-sonnet-4-6 is fast and highly capable
const MODEL = 'claude-sonnet-4-6';

export interface AgentContext {
  userId: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  pendingMeeting?: PendingMeeting;
}

/**
 * Build the system prompt for the agent.
 * Includes the user's cofounder list and scheduling context.
 */
async function buildSystemPrompt(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const contacts = await prisma.contact.findMany({
    where: { ownerId: userId },
    orderBy: { name: 'asc' },
  });
  const userPrefs = JSON.parse(user?.preferences ?? '{}');
  const tz = userPrefs.timezone ?? 'UTC';
  const now = DateTime.now().setZone(tz).toFormat("cccc, LLLL d yyyy 'at' h:mm a ZZZZ");

  // Build contact list with enriched data
  const contactListLines = contacts.length
    ? contacts
        .map((c) => {
          const parts = [`- ${c.name} <${c.email}>`];
          if (c.calendarProvider) parts.push(`(${c.calendarProvider} calendar${c.linkedUserId ? ', connected' : ', NOT connected'})`);
          if (c.company) parts.push(`[${c.company}]`);
          if (c.isInternal) parts.push('[Internal]');
          if (c.city) parts.push(`[City: ${c.city}]`);
          return parts.join(' ');
        })
        .join('\n')
    : 'No contacts added yet.';

  return `You are SyncUp, an AI scheduling assistant. You help schedule meetings between cofounders and teammates by checking calendar availability and suggesting the best times.

Current date/time: ${now}
User: ${user?.name ?? 'Unknown'} (${user?.email ?? ''})
User timezone: ${tz}
Working hours: ${userPrefs.workingHoursStart ?? '09:00'}–${userPrefs.workingHoursEnd ?? '18:00'}
Buffer between meetings: ${userPrefs.bufferMinutes ?? 15} minutes

## Your Contacts / Cofounders
${contactListLines}

## Your capabilities
1. **Find meeting slots** — call \`find_slots\` when asked to schedule a meeting
2. **Create meetings** — call \`create_meeting\` only after explicit user confirmation
3. **Search meeting history** — call \`search_meetings\` when asked about past meetings

## Instructions
- Always confirm meeting details before creating: title, attendees, time slot
- Ask for a meeting title if not provided
- If a contact has no connected calendar, mention it
- Present slot options in a friendly format (e.g. "Tuesday, Jan 14 at 2:00 PM — 1 hour")
- When suggesting slots, explain WHY each one is good based on scoring reasons
- **Location awareness**: if all attendees share the same [City], suggest "This could be in-person". If cities differ or are missing, suggest "Online meeting recommended"
- **Internal vs External**: contacts tagged [Internal] share your company domain. Mention it when relevant (e.g. "This is an external meeting with Stripe")
- NEVER create a meeting without explicit confirmation
- Match contact names from messages to the list above (fuzzy match is fine)`;
}

// ---- Tool definitions for the agent ----
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'find_slots',
    description:
      'Find available meeting slots across all attendees\' calendars. Call this when the user wants to schedule a meeting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        attendee_emails: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email addresses of all attendees (including the user)',
        },
        duration_minutes: {
          type: 'number',
          description: 'Meeting duration in minutes (e.g. 30, 60)',
        },
        range_start: {
          type: 'string',
          description: 'Start of the search range in ISO 8601 format',
        },
        range_end: {
          type: 'string',
          description: 'End of the search range in ISO 8601 format',
        },
        preference: {
          type: 'string',
          enum: ['morning', 'afternoon', 'evening', 'any'],
          description: 'Preferred time of day (optional)',
        },
      },
      required: ['attendee_emails', 'duration_minutes', 'range_start', 'range_end'],
    },
  },
  {
    name: 'search_meetings',
    description: 'Search the user\'s past meetings by person, keyword, or date range. Use this when asked about meeting history.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term (meeting title, contact name, or topic)' },
        contact_email: { type: 'string', description: 'Filter by a specific attendee email' },
        from: { type: 'string', description: 'Start date (ISO 8601) for the search range' },
        to: { type: 'string', description: 'End date (ISO 8601) for the search range' },
      },
    },
  },
  {
    name: 'create_meeting',
    description:
      'Create a calendar event and send invites. Only call this AFTER the user has confirmed the meeting details.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Meeting title' },
        description: { type: 'string', description: 'Meeting description (optional)' },
        start_time: { type: 'string', description: 'Meeting start time in ISO 8601 format' },
        end_time: { type: 'string', description: 'Meeting end time in ISO 8601 format' },
        attendee_emails: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email addresses of all attendees',
        },
      },
      required: ['title', 'start_time', 'end_time', 'attendee_emails'],
    },
  },
];

/**
 * Execute a tool call from the agent.
 */
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const userPrefs = JSON.parse(user?.preferences ?? '{}');

  if (toolName === 'find_slots') {
    const { attendee_emails, duration_minutes, range_start, range_end } = toolInput as {
      attendee_emails: string[];
      duration_minutes: number;
      range_start: string;
      range_end: string;
    };

    // Collect busy slots from all attendees
    const allBusy = await collectBusySlots(userId, attendee_emails, range_start, range_end);

    // Get learned preferences for context
    const contacts = await prisma.contact.findMany({
      where: { ownerId: userId, email: { in: attendee_emails } },
    });
    const contactIds = contacts.map((c) => c.id);
    const preferences = await prisma.preference.findMany({
      where: { userId, contactId: { in: contactIds } },
    });
    const prefSummary = await getPreferenceSummary(userId, contactIds);

    const result = await findAvailableSlots({
      busySlots: allBusy,
      durationMinutes: duration_minutes,
      rangeStart: new Date(range_start),
      rangeEnd: new Date(range_end),
      userPreferences: userPrefs,
      learnedPreferences: preferences,
      attendeeEmails: attendee_emails,
    });

    if (!result.slots.length) {
      return JSON.stringify({
        success: false,
        message: 'No available slots found in the requested range. Everyone seems to be busy.',
        slots: [],
      });
    }

    return JSON.stringify({
      success: true,
      slots: result.slots,
      preference_context: prefSummary,
      attendees_without_calendar: attendee_emails.filter((email) => {
        const contact = contacts.find((c) => c.email === email);
        return contact && !contact.linkedUserId;
      }),
    });
  }

  if (toolName === 'search_meetings') {
    const { query, contact_email, from, to } = toolInput as {
      query?: string;
      contact_email?: string;
      from?: string;
      to?: string;
    };

    const meetings = await prisma.meeting.findMany({
      where: {
        createdById: userId,
        ...(query && {
          OR: [
            { title: { contains: query } },
            { description: { contains: query } },
            { attendees: { some: { contact: { name: { contains: query } } } } },
          ],
        }),
        ...(contact_email && { attendees: { some: { contact: { email: contact_email } } } }),
        ...(from && { startTime: { gte: new Date(from) } }),
        ...(to && { startTime: { lte: new Date(to) } }),
      },
      include: { attendees: { include: { contact: true } } },
      orderBy: { startTime: 'desc' },
      take: 20,
    });

    if (!meetings.length) {
      return JSON.stringify({ found: 0, meetings: [], message: 'No meetings found matching those criteria.' });
    }

    const userPrefs2 = JSON.parse(user?.preferences ?? '{}');
    const tz2 = userPrefs2.timezone ?? 'UTC';

    return JSON.stringify({
      found: meetings.length,
      meetings: meetings.map((m) => ({
        id: m.id,
        title: m.title,
        start: DateTime.fromJSDate(m.startTime).setZone(tz2).toFormat("cccc, LLLL d yyyy 'at' h:mm a"),
        end: DateTime.fromJSDate(m.endTime).setZone(tz2).toFormat('h:mm a'),
        attendees: m.attendees.map((a) => `${a.contact.name} <${a.contact.email}>`),
        description: m.description ?? null,
      })),
    });
  }

  if (toolName === 'create_meeting') {
    const { title, description, start_time, end_time, attendee_emails } = toolInput as {
      title: string;
      description?: string;
      start_time: string;
      end_time: string;
      attendee_emails: string[];
    };

    // Create the event via the user's calendar provider
    let externalId: string | undefined;
    if (user?.calendarProvider && user.oauthTokens) {
      const tokens = decryptJson<Record<string, unknown>>(user.oauthTokens);
      if (tokens) {
        try {
          if (user.calendarProvider === 'google') {
            const result = await createGoogleEvent(tokens as unknown as GoogleTokens, {
              title,
              description,
              startTime: start_time,
              endTime: end_time,
              attendeeEmails: attendee_emails,
              timezone: userPrefs.timezone ?? 'UTC',
            });
            externalId = result.eventId;
          } else if (user.calendarProvider === 'microsoft') {
            const result = await createMicrosoftEvent(tokens as unknown as MicrosoftTokens, {
              title,
              description,
              startTime: start_time,
              endTime: end_time,
              attendeeEmails: attendee_emails,
              timezone: userPrefs.timezone ?? 'UTC',
            });
            externalId = result.eventId;
          } else if (user.calendarProvider === 'apple') {
            const result = await createAppleEvent(tokens as unknown as AppleCredentials, {
              title,
              description,
              startTime: start_time,
              endTime: end_time,
              attendeeEmails: attendee_emails,
              timezone: userPrefs.timezone ?? 'UTC',
            });
            externalId = result.eventUrl;
          }
        } catch (calErr) {
          console.error('[agent] Calendar event creation failed', calErr);
          // Store locally anyway
        }
      }
    }

    // Resolve attendees to contacts
    const contacts = await prisma.contact.findMany({
      where: { ownerId: userId, email: { in: attendee_emails } },
    });

    // Save meeting to database
    const meeting = await prisma.meeting.create({
      data: {
        title,
        description: description ?? null,
        startTime: new Date(start_time),
        endTime: new Date(end_time),
        createdById: userId,
        source: user?.calendarProvider ?? 'syncup',
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

    // Update learned preferences
    const { updatePreferences } = await import('./preferences');
    for (const contact of contacts) {
      await updatePreferences(userId, contact.id, new Date(start_time), new Date(end_time));
    }

    return JSON.stringify({
      success: true,
      meeting_id: meeting.id,
      calendar_created: !!externalId,
      message: `Meeting "${title}" created successfully${externalId ? ' and added to your calendar' : ''}. Invites sent to: ${attendee_emails.join(', ')}`,
    });
  }

  return JSON.stringify({ error: `Unknown tool: ${toolName}` });
}

/**
 * Stream a chat response to the Express response object.
 * Handles multi-turn tool use via the manual agentic loop.
 */
export async function streamChatResponse(
  context: AgentContext,
  userMessage: string,
  res: Response,
): Promise<void> {
  const systemPrompt = await buildSystemPrompt(context.userId);

  // Append the new user message to history
  context.conversationHistory.push({ role: 'user', content: userMessage });

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', process.env.WEB_URL ?? 'http://localhost:3000');

  const sendSSE = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let continueLoop = true;

    while (continueLoop) {
      // Build messages for this turn
      const messages: Anthropic.MessageParam[] = context.conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Stream the response from Claude
      let assistantMessage = '';
      let toolUseBlocks: Anthropic.ToolUseBlock[] = [];
      let stopReason: string | null = null;

      const stream = await client.messages.stream({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const text = event.delta.text;
            assistantMessage += text;
            sendSSE('text', { text });
          }
        }
      }

      const finalMessage = await stream.finalMessage();
      stopReason = finalMessage.stop_reason;

      // Collect tool use blocks
      for (const block of finalMessage.content) {
        if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
        }
        if (block.type === 'text') {
          // Already streamed above
        }
      }

      // Add assistant's response to history (with full content array for tool use)
      if (assistantMessage) {
        context.conversationHistory.push({ role: 'assistant', content: assistantMessage });
      }

      if (stopReason === 'tool_use' && toolUseBlocks.length > 0) {
        // Execute tools and build tool results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolBlock of toolUseBlocks) {
          sendSSE('tool_call', { name: toolBlock.name, id: toolBlock.id });

          const result = await executeTool(
            toolBlock.name,
            toolBlock.input as Record<string, unknown>,
            context.userId,
          );

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: result,
          });

          // After find_slots, emit structured slot data so the frontend can render interactive cards
          if (toolBlock.name === 'find_slots') {
            try {
              const parsed = JSON.parse(result) as { success?: boolean; slots?: SuggestedSlot[] };
              if (parsed.success && parsed.slots?.length) {
                sendSSE('slots', { slots: parsed.slots });
              }
            } catch { /* ignore parse errors */ }
          }

          sendSSE('tool_result', { name: toolBlock.name, id: toolBlock.id });
        }

        // Add assistant's full content and tool results to the conversation
        // We need to rebuild the history with proper tool_use blocks
        context.conversationHistory.pop(); // remove simple text assistant message

        // Push the full assistant message content as a string representation
        const toolNames = toolUseBlocks.map((t) => t.name).join(', ');
        context.conversationHistory.push({
          role: 'assistant',
          content: assistantMessage
            ? `${assistantMessage}\n[Called tools: ${toolNames}]`
            : `[Called tools: ${toolNames}]`,
        });

        // Push tool results as user message
        const toolResultsText = toolResults
          .map((r) => `Tool result: ${typeof r.content === 'string' ? r.content : JSON.stringify(r.content)}`)
          .join('\n\n');
        context.conversationHistory.push({
          role: 'user',
          content: toolResultsText,
        });

        // Continue the loop to get Claude's response to tool results
        continueLoop = true;
      } else {
        continueLoop = false;
      }
    }

    sendSSE('done', { message: 'Stream complete' });
    res.end();
  } catch (err) {
    console.error('[agent] Streaming error', err);
    sendSSE('error', { error: err instanceof Error ? err.message : 'Agent error' });
    res.end();
  }
}

// ---- Helper: collect busy slots ----

async function collectBusySlots(
  ownerId: string,
  attendeeEmails: string[],
  rangeStart: string,
  rangeEnd: string,
): Promise<Array<{ start: string; end: string; contactId?: string }>> {
  const busy: Array<{ start: string; end: string; contactId?: string }> = [];
  const { getBusySlots: getGoogleBusy } = await import('./google-calendar');
  const { getBusySlots: getMicrosoftBusy } = await import('./microsoft-calendar');
  const { getBusySlots: getAppleBusy } = await import('./apple-calendar');

  const owner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (owner?.oauthTokens && owner.calendarProvider) {
    const tokens = decryptJson<Record<string, unknown>>(owner.oauthTokens);
    if (tokens) {
      try {
        let ownerBusy: Array<{ start: string; end: string }> = [];
        if (owner.calendarProvider === 'google') {
          ownerBusy = await getGoogleBusy(tokens as unknown as GoogleTokens, rangeStart, rangeEnd);
        } else if (owner.calendarProvider === 'microsoft') {
          ownerBusy = await getMicrosoftBusy(tokens as unknown as MicrosoftTokens, rangeStart, rangeEnd);
        } else if (owner.calendarProvider === 'apple') {
          ownerBusy = await getAppleBusy(tokens as unknown as AppleCredentials, rangeStart, rangeEnd);
        }
        busy.push(...ownerBusy);
      } catch (e) {
        console.error('[agent] Failed to fetch owner busy slots', e);
      }
    }
  }

  const contacts = await prisma.contact.findMany({
    where: { ownerId, email: { in: attendeeEmails } },
  });

  for (const contact of contacts) {
    if (!contact.linkedUserId) continue;
    const linkedUser = await prisma.user.findUnique({ where: { id: contact.linkedUserId } });
    if (!linkedUser?.oauthTokens || !linkedUser.calendarProvider) continue;
    const tokens = decryptJson<Record<string, unknown>>(linkedUser.oauthTokens);
    if (!tokens) continue;
    try {
      let contactBusy: Array<{ start: string; end: string }> = [];
      if (linkedUser.calendarProvider === 'google') {
        contactBusy = await getGoogleBusy(tokens as unknown as GoogleTokens, rangeStart, rangeEnd);
      } else if (linkedUser.calendarProvider === 'microsoft') {
        contactBusy = await getMicrosoftBusy(tokens as unknown as MicrosoftTokens, rangeStart, rangeEnd);
      } else if (linkedUser.calendarProvider === 'apple') {
        contactBusy = await getAppleBusy(tokens as unknown as AppleCredentials, rangeStart, rangeEnd);
      }
      busy.push(...contactBusy.map((s) => ({ ...s, contactId: contact.id })));
    } catch (e) {
      console.error(`[agent] Failed to fetch busy slots for contact ${contact.id}`, e);
    }
  }

  return busy;
}
