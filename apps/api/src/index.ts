/**
 * SyncUp API Server
 * Entry point — creates the Express app, registers middleware and routes.
 */
import 'dotenv/config';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import rateLimit from 'express-rate-limit';

import { authRouter } from './routes/auth';
import { calendarRouter } from './routes/calendar';
import { chatRouter } from './routes/chat';
import { contactsRouter } from './routes/contacts';
import { meetingsRouter } from './routes/meetings';
import { insightsRouter } from './routes/insights';
import { AppError, formatError } from './utils/errors';
import { prisma } from './utils/db';

const app = express();
const PORT = process.env.PORT ?? 3001;

// ---- Security middleware ----
app.use(helmet());
app.use(
  cors({
    origin: process.env.WEB_URL ?? 'http://localhost:3000',
    credentials: true,
  }),
);

// ---- Rate limiting ----
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// ---- Body parsing ----
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- Sessions ----
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax',
    },
  }),
);

// ---- Routes ----
app.use('/api/auth', authRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/chat', chatRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/meetings', meetingsRouter);
app.use('/api/insights', insightsRouter);

// ---- Health check ----
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Serve frontend in production ----
if (process.env.NODE_ENV === 'production') {
  const webDist = path.join(__dirname, '../../web/dist');
  app.use(express.static(webDist));
  // All non-API routes serve the React SPA
  app.get(/^(?!\/api|\/health).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

// ---- Global error handler ----
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err);
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(formatError(err));
  }
  return res.status(500).json({ error: 'Internal server error' });
});

// ---- Start ----
async function main() {
  // Verify DB connection
  await prisma.$connect();
  console.log('[DB] Connected');

  app.listen(PORT, () => {
    console.log(`[API] SyncUp server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
