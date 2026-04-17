/**
 * Contacts Routes — CRUD for cofounders / teammates
 * Auto-enriches contacts with company and isInternal on create/update.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { requireAuth } from './auth';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { getCompanyFromEmail, isInternalContact } from '../utils/company';

export const contactsRouter = Router();
contactsRouter.use(requireAuth);

// GET /api/contacts
contactsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { ownerId: req.session.userId! },
      orderBy: { name: 'asc' },
    });
    return res.json({ data: contacts });
  } catch (err) {
    next(err);
  }
});

// POST /api/contacts
contactsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, calendarProvider, city } = req.body as {
      name?: string;
      email?: string;
      calendarProvider?: string;
      city?: string;
    };
    if (!name || !email) throw new BadRequestError('name and email are required');

    const owner = await prisma.user.findUnique({ where: { id: req.session.userId! } });

    const contact = await prisma.contact.create({
      data: {
        ownerId: req.session.userId!,
        name,
        email,
        calendarProvider: calendarProvider ?? null,
        city: city ?? null,
        company: getCompanyFromEmail(email),
        isInternal: owner ? isInternalContact(owner.email, email) : false,
      },
    });
    return res.status(201).json({ data: contact });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return next(new BadRequestError('A contact with this email already exists'));
    }
    next(err);
  }
});

// PUT /api/contacts/:id
contactsRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const existing = await prisma.contact.findFirst({
      where: { id, ownerId: req.session.userId! },
    });
    if (!existing) throw new NotFoundError('Contact');

    const { name, email, calendarProvider, city } = req.body as {
      name?: string;
      email?: string;
      calendarProvider?: string;
      city?: string;
    };

    const owner = await prisma.user.findUnique({ where: { id: req.session.userId! } });

    const updated = await prisma.contact.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(email && {
          email,
          company: getCompanyFromEmail(email),
          isInternal: owner ? isInternalContact(owner.email, email) : false,
        }),
        ...(calendarProvider !== undefined && { calendarProvider }),
        ...(city !== undefined && { city: city || null }),
      },
    });
    return res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/contacts/:id
contactsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const existing = await prisma.contact.findFirst({
      where: { id, ownerId: req.session.userId! },
    });
    if (!existing) throw new NotFoundError('Contact');

    await prisma.contact.delete({ where: { id } });
    return res.json({ message: 'Contact deleted' });
  } catch (err) {
    next(err);
  }
});
