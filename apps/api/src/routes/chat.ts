/**
 * Chat Routes — AI assistant endpoint with streaming
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth';
import { streamChatResponse, AgentContext } from '../services/ai-agent';
import { BadRequestError } from '../utils/errors';

export const chatRouter = Router();
chatRouter.use(requireAuth);

// In-memory conversation store (per-session).
// In production, persist to Redis or DB.
const conversations = new Map<string, AgentContext>();

function getOrCreateContext(userId: string): AgentContext {
  if (!conversations.has(userId)) {
    conversations.set(userId, {
      userId,
      conversationHistory: [],
    });
  }
  return conversations.get(userId)!;
}

/**
 * POST /api/chat/message
 * Body: { message: string }
 * Streams SSE response from Claude
 */
chatRouter.post('/message', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body as { message?: string };
    if (!message?.trim()) throw new BadRequestError('message is required');

    const context = getOrCreateContext(req.session.userId!);
    await streamChatResponse(context, message.trim(), res);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/chat/conversation
 * Clear the conversation history for the current user
 */
chatRouter.delete('/conversation', (req: Request, res: Response) => {
  conversations.delete(req.session.userId!);
  res.json({ message: 'Conversation cleared' });
});

/**
 * GET /api/chat/history
 * Return conversation history (non-streaming)
 */
chatRouter.get('/history', (req: Request, res: Response) => {
  const context = conversations.get(req.session.userId!);
  res.json({ data: context?.conversationHistory ?? [] });
});
