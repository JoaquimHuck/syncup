// ============================================================
// SyncUp Shared Types
// All types shared between the API and web frontend
// ============================================================

// ---- Calendar Providers ----
export type CalendarProvider = 'google' | 'microsoft' | 'apple';

// ---- User / Auth ----
export interface User {
  id: string;
  name: string;
  email: string;
  calendarProvider: CalendarProvider | null;
  preferences: UserPreferences;
  createdAt: string;
}

export interface UserPreferences {
  workingHoursStart: string; // "09:00"
  workingHoursEnd: string;   // "18:00"
  workingDays: number[];     // 0=Sun, 1=Mon, ..., 6=Sat
  bufferMinutes: number;     // default 15
  timezone: string;          // IANA timezone, e.g. "America/New_York"
}

// ---- Contacts ----
export interface Contact {
  id: string;
  name: string;
  email: string;
  calendarProvider: CalendarProvider | null;
  linkedUserId: string | null;
  city: string | null;
  company: string | null;
  isInternal: boolean;
  createdAt: string;
}

// ---- Calendar Events / Slots ----
export interface TimeSlot {
  start: string;  // ISO 8601
  end: string;    // ISO 8601
}

export interface BusySlot extends TimeSlot {
  contactId: string;
  summary?: string;
}

export interface SuggestedSlot extends TimeSlot {
  score: number;       // 0-100, higher = better
  reasons: string[];   // human-readable reasons why this slot is good
  durationMinutes: number;
}

// ---- Meetings ----
export interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  createdById: string;
  source: 'syncup' | 'google' | 'microsoft' | 'apple';
  attendees: MeetingAttendee[];
  createdAt: string;
}

export interface MeetingAttendee {
  contactId: string;
  contact: Contact;
  responseStatus: 'accepted' | 'declined' | 'tentative' | 'pending';
}

// ---- Preferences (learned) ----
export interface LearnedPreference {
  userId: string;
  contactId: string;
  preferredTimes: string[]; // e.g. ["09:00", "14:00"]
  avgDurationMinutes: number;
  preferredDays: number[];  // 0-6
  meetingCount: number;
}

// ---- Chat ----
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: ChatMessageMetadata;
}

export interface ChatMessageMetadata {
  suggestedSlots?: SuggestedSlot[];
  pendingMeeting?: PendingMeeting;
  actionType?: 'slots_presented' | 'slot_confirmed' | 'meeting_created' | 'info';
}

export interface PendingMeeting {
  title?: string;
  description?: string;
  duration: number; // minutes
  slot: TimeSlot;
  attendeeEmails: string[];
}

// ---- Insights ----
export interface InsightsData {
  totalMeetings: number;
  meetingsThisMonth: number;
  uniqueContacts: number;
  internalCount: number;
  externalCount: number;
  topContacts: Array<{ name: string; email: string; count: number; company: string | null }>;
  monthlyTrend: Array<{ month: string; count: number }>; // last 6 months
}

// ---- API Responses ----
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface FindSlotsRequest {
  attendeeEmails: string[];
  durationMinutes: number;
  rangeStart: string;   // ISO 8601
  rangeEnd: string;     // ISO 8601
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening' | 'any';
}

export interface FindSlotsResponse {
  slots: SuggestedSlot[];
  busySlots: BusySlot[];
}

export interface CreateMeetingRequest {
  title: string;
  description?: string;
  slot: TimeSlot;
  attendeeEmails: string[];
}

export interface OAuthCallbackResult {
  userId: string;
  provider: CalendarProvider;
  success: boolean;
}
