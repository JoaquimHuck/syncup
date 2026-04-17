# SyncUp — AI Calendar Scheduling Assistant

SyncUp is a full-stack AI scheduling assistant that connects your calendars (Google, Outlook, Apple) and uses Claude to find the best meeting times across your team through a natural language chat interface.

---

## Features

- **AI Chat Interface** — talk to Claude naturally: *"Find a 30-min slot with Bruno and Rafael this week"*
- **Multi-calendar support** — Google Calendar, Microsoft Outlook, Apple iCloud (CalDAV)
- **Smart scheduling engine** — finds overlapping free slots, respects working hours, adds buffer time
- **Preference learning** — learns your meeting patterns over time (preferred times, days, durations)
- **Meeting creation** — creates events and sends invites with one confirmation
- **Dark mode** — full dark mode support
- **Mobile responsive** — works on all screen sizes

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS + Zustand |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite via Prisma ORM |
| AI | Anthropic Claude (`claude-sonnet-4-6`) with streaming |
| Auth | OAuth 2.0 (Google, Microsoft) + CalDAV (Apple) |
| Build | Turborepo monorepo |

---

## Project Structure

```
syncup/
├── apps/
│   ├── api/              # Express backend
│   │   └── src/
│   │       ├── routes/   # auth, calendar, chat, contacts, meetings
│   │       ├── services/ # google-calendar, microsoft-calendar, apple-calendar
│   │       │             # scheduler, ai-agent, preferences
│   │       ├── utils/    # crypto, db, errors
│   │       └── prisma/   # schema.prisma
│   └── web/              # React frontend
│       └── src/
│           ├── components/
│           │   ├── Chat/      # ChatPage, ChatBubble, TypingIndicator
│           │   ├── Settings/  # CalendarSection, ContactsSection, PreferencesSection
│           │   └── Common/    # Layout, LoginPage, LoadingSpinner
│           ├── services/  # api.ts (all API calls + SSE streaming)
│           └── store/     # Zustand global state
└── packages/
    └── shared/           # Shared TypeScript types
```

---

## Prerequisites

- **Node.js 20+** and npm/yarn/pnpm
- An **Anthropic API key** (for the AI agent)
- **Google OAuth credentials** (for Google Calendar)
- **Microsoft OAuth credentials** (for Outlook) — optional
- **Apple ID + app-specific password** (for Apple Calendar) — optional

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd syncup
npm install
```

### 2. Configure environment variables

```bash
cp .env.example apps/api/.env
```

Edit `apps/api/.env`:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-api03-...
SESSION_SECRET=generate-a-random-32-char-string-here
DATABASE_URL="file:./dev.db"
ENCRYPTION_KEY=generate-a-64-char-hex-string-here

# Google OAuth (required for Google Calendar)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Microsoft OAuth (optional)
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret

# App URLs
API_URL=http://localhost:3001
WEB_URL=http://localhost:3000
```

**Generate secrets:**
```bash
# SESSION_SECRET (random string)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ENCRYPTION_KEY (64-char hex for AES-256)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable **Google Calendar API**
4. Create OAuth 2.0 credentials (Web Application)
5. Add authorized redirect URI: `http://localhost:3001/api/auth/google/callback`
6. Copy Client ID and Secret to your `.env`

### 4. Set up Microsoft OAuth (optional)

1. Go to [Azure Portal](https://portal.azure.com) → App registrations
2. Create a new registration
3. Add redirect URI: `http://localhost:3001/api/auth/microsoft/callback`
4. Under **Certificates & secrets**, create a client secret
5. Copy Application (client) ID and Secret to your `.env`
6. Under **API permissions**, add `Calendars.ReadWrite` and `User.Read`

### 5. Set up the database

```bash
# Generate the Prisma client
npm run db:generate

# Create the database and run migrations
npm run db:migrate
```

### 6. Start the development servers

```bash
# Start both API and web simultaneously
npm run dev
```

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001

---

## First-Time Use

1. **Open** http://localhost:3000
2. **Register** with your name and email
3. **Connect your calendar** via the banner or Settings → Calendar Connection
4. **Add cofounders** in Settings → Cofounders & Contacts
5. **Start chatting!** Try:
   - *"Find a 30-min slot with [cofounder name] this week"*
   - *"Schedule a 1-hour strategy sync with everyone for next Tuesday"*
   - *"What's the best time to meet with Bruno tomorrow?"*

---

## How It Works

### AI Agent

The agent is built on Claude (`claude-sonnet-4-6`) with streaming SSE responses. It has two tools:

- **`find_slots`** — queries all attendees' calendars and runs the scheduling engine
- **`create_meeting`** — creates the event on your calendar provider after confirmation

The system prompt is dynamically built per-user and includes:
- Your cofounder list
- Your working hours and timezone
- The current date/time

### Scheduling Engine

The scheduling engine (`apps/api/src/services/scheduler.ts`):
1. Collects busy slots from all attendees' calendars
2. Adds buffer time around each busy period
3. Generates candidate slots at 30-minute intervals within working hours
4. Scores each candidate 0–100 based on:
   - Learned preferred times (+25)
   - Learned preferred days (+20)
   - Morning/afternoon heuristics (+10/+8)
   - Mid-week preference (+10 for Tue/Wed/Thu)
   - Notice time penalty (−20 for < 4 hours)
5. Returns the top 5 ranked, deduplicated slots

### Preference Learning

Every time you create a meeting, SyncUp updates the `Preference` model for each attendee pair with:
- Rolling history of meeting times (last 10)
- Rolling history of preferred days (last 10)
- Rolling average duration

This data is fed to Claude when suggesting slots.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Create/login user |
| `GET` | `/api/auth/me` | Get current user |
| `GET` | `/api/auth/google` | Start Google OAuth |
| `GET` | `/api/auth/microsoft` | Start Microsoft OAuth |
| `POST` | `/api/auth/apple` | Connect Apple CalDAV |
| `GET` | `/api/contacts` | List contacts |
| `POST` | `/api/contacts` | Add contact |
| `PUT` | `/api/contacts/:id` | Update contact |
| `DELETE` | `/api/contacts/:id` | Delete contact |
| `POST` | `/api/chat/message` | Stream AI response (SSE) |
| `DELETE` | `/api/chat/conversation` | Clear chat history |
| `GET` | `/api/meetings` | List meetings |
| `GET` | `/api/calendar/status` | Calendar connection status |
| `POST` | `/api/calendar/find-slots` | Find available slots (direct) |

---

## Database Schema

```prisma
User        — id, name, email, calendarProvider, oauthTokens (encrypted), preferences JSON
Contact     — id, ownerId, name, email, calendarProvider, linkedUserId
Meeting     — id, title, description, startTime, endTime, createdById, source, externalId
MeetingAttendee — meetingId, contactId, responseStatus
Preference  — userId, contactId, preferredTimes JSON, avgDuration, preferredDays JSON
```

OAuth tokens are encrypted at rest using AES-256-GCM.

---

## Development Commands

```bash
npm run dev           # Start all apps
npm run build         # Build all packages
npm run type-check    # TypeScript check all packages
npm run db:generate   # Regenerate Prisma client
npm run db:migrate    # Run DB migrations
npm run db:studio     # Open Prisma Studio (DB GUI)
```

---

## Adding More Contacts with Calendar Access

For a cofounder to share their calendar availability:
1. They sign up at your SyncUp instance
2. They connect their calendar in Settings
3. You add them as a contact (their email links to their SyncUp account)
4. SyncUp will now query their actual calendar for availability

For contacts who don't use SyncUp, the scheduler will still find slots but won't be able to verify their availability in real time.

---

## Security Notes

- OAuth tokens are encrypted with AES-256-GCM before storing in SQLite
- Session cookies are `httpOnly`, `sameSite: lax`, and `secure` in production
- Rate limiting is applied to all API routes
- CSRF protection via state parameter in OAuth flows

---

## Production Deployment

For production:
1. Set `NODE_ENV=production` in environment
2. Use a PostgreSQL database: change `provider = "postgresql"` in `schema.prisma`
3. Set proper OAuth redirect URIs
4. Use HTTPS (required for secure cookies)
5. Replace in-memory conversation store in `chat.ts` with Redis
6. Set `cookie.secure = true` in the session config (already done when `NODE_ENV=production`)
