export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'ERROR',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, message, 'BAD_REQUEST', details);
export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, message, 'UNAUTHORIZED');
export const forbidden = (message = 'You do not have permission to do this') =>
  new HttpError(403, message, 'FORBIDDEN');
export const notFound = (resource = 'Resource') => new HttpError(404, `${resource} not found`, 'NOT_FOUND');
export const conflict = (message: string, code = 'CONFLICT') => new HttpError(409, message, code);
