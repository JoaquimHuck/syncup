/**
 * Auth Routes
 * Handles OAuth 2.0 flows for Google Calendar and Microsoft (Outlook).
 * Also provides session-based user management.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { UnauthorizedError, BadRequestError } from '../utils/errors';
import { getGoogleAuthUrl, handleGoogleCallback } from '../services/google-calendar';
import { encryptJson, decryptJson } from '../utils/crypto';
import { GoogleTokens } from '../services/google-calendar';

// Augment Express session with our custom fields
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    oauthState?: string;
    oauthProvider?: string;
  }
}

export const authRouter = Router();

// ----------------------------------------------------------------
// GET /api/auth/me  — return the current session user
// ----------------------------------------------------------------
authRouter.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { id: true, name: true, email: true, calendarProvider: true, preferences: true, createdAt: true },
    });
    if (!user) return res.status(401).json({ error: 'User not found' });
    return res.json({ data: { ...user, preferences: JSON.parse(user.preferences) } });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------
// POST /api/auth/register  — create a new local user account
// ----------------------------------------------------------------
authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email } = req.body as { name?: string; email?: string };
    if (!name || !email) throw new BadRequestError('name and email are required');

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      req.session.userId = existing.id;
      return res.json({ data: { ...existing, preferences: JSON.parse(existing.preferences) } });
    }

    const defaultPrefs = {
      workingHoursStart: '09:00',
      workingHoursEnd: '18:00',
      workingDays: [1, 2, 3, 4, 5],
      bufferMinutes: 15,
      timezone: 'America/New_York',
    };

    const user = await prisma.user.create({
      data: { name, email, preferences: JSON.stringify(defaultPrefs) },
    });

    req.session.userId = user.id;
    return res.status(201).json({ data: { ...user, preferences: defaultPrefs } });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------
// POST /api/auth/logout
// ----------------------------------------------------------------
authRouter.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out' });
  });
});

// ----------------------------------------------------------------
// PUT /api/auth/preferences  — update the current user's preferences
// ----------------------------------------------------------------
authRouter.put('/preferences', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session.userId) throw new UnauthorizedError();
    const updated = await prisma.user.update({
      where: { id: req.session.userId },
      data: { preferences: JSON.stringify(req.body) },
    });
    return res.json({ data: JSON.parse(updated.preferences) });
  } catch (err) {
    next(err);
  }
});

// ================================================================
// GOOGLE OAUTH
// ================================================================

authRouter.get('/google', (req: Request, res: Response) => {
  if (!req.session.userId) {
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
    return res.redirect(`${webUrl}/login`);
  }

  try {
    // Generate a random state token to prevent CSRF
    const state = Math.random().toString(36).substring(2);
    req.session.oauthState = state;
    req.session.oauthProvider = 'google';

    const url = getGoogleAuthUrl(state);
    return res.redirect(url);
  } catch {
    // Google credentials not configured
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
    return res.redirect(`${webUrl}/settings?calendar_error=credentials_missing`);
  }
});

authRouter.get('/google/callback', async (req: Request, res: Response, next: NextFunction) => {
  const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      return res.redirect(`${webUrl}/settings?calendar_error=${error}`);
    }

    if (!req.session.userId) {
      return res.redirect(`${webUrl}/login`);
    }

    if (state !== req.session.oauthState) {
      return res.redirect(`${webUrl}/settings?calendar_error=state_mismatch`);
    }

    const tokens = await handleGoogleCallback(code);
    const encryptedTokens = encryptJson(tokens);

    await prisma.user.update({
      where: { id: req.session.userId },
      data: {
        calendarProvider: 'google',
        oauthTokens: encryptedTokens,
      },
    });

    // Clear OAuth state
    req.session.oauthState = undefined;
    req.session.oauthProvider = undefined;

    return res.redirect(`${webUrl}/settings?calendar_connected=google`);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------
// DELETE /api/auth/google  — disconnect Google Calendar
// ----------------------------------------------------------------
authRouter.delete('/google', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session.userId) throw new UnauthorizedError();
    await prisma.user.update({
      where: { id: req.session.userId },
      data: { calendarProvider: null, oauthTokens: null },
    });
    return res.json({ message: 'Google Calendar disconnected' });
  } catch (err) {
    next(err);
  }
});

// ================================================================
// MICROSOFT OAUTH — hidden until credentials are set
// ================================================================

authRouter.get('/microsoft', (_req: Request, res: Response) => {
  const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
  return res.redirect(`${webUrl}/settings?calendar_unavailable=1`);
});

authRouter.get('/microsoft/callback', (_req: Request, res: Response) => {
  const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
  return res.redirect(`${webUrl}/settings`);
});

// ================================================================
// APPLE / CalDAV — hidden until credentials are set
// ================================================================
authRouter.post('/apple', (_req: Request, res: Response) => {
  return res.status(503).json({ error: 'Apple Calendar integration coming soon.' });
});

// ---- Middleware: require authenticated session ----
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.session.userId) throw new UnauthorizedError();
  next();
}
