/**
 * Typed error classes for the API.
 */

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, message, 'BAD_REQUEST');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
  }
}

/** Format any error into a safe API response object. */
export function formatError(err: unknown): { error: string; code?: string } {
  if (err instanceof AppError) {
    return { error: err.message, code: err.code };
  }
  if (err instanceof Error) {
    return { error: err.message };
  }
  return { error: 'An unexpected error occurred' };
}
