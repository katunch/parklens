export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_PLATE'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'NOT_FOUND'
  | 'DUPLICATE_REQUEST'
  | 'ALREADY_PERMITTED'
  | 'INVALID_STATE'
  | 'DATE_IN_PAST'
  | 'DATE_TOO_FAR'
  | 'CANNOT_DELETE_SELF'
  | 'LAST_ADMIN'
  | 'EMAIL_TAKEN'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  validation: (message = 'Invalid request', details?: unknown) =>
    new AppError(400, 'VALIDATION_ERROR', message, details),
  invalidPlate: () =>
    new AppError(422, 'INVALID_PLATE', 'Licence plate must contain 2–12 letters or digits'),
  unauthorized: (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message),
  invalidCredentials: (status = 401, message = 'Invalid email or password') =>
    new AppError(status, 'INVALID_CREDENTIALS', message),
  notFound: (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`),
  duplicateRequest: () =>
    new AppError(409, 'DUPLICATE_REQUEST', 'An identical request is already pending'),
  alreadyPermitted: () =>
    new AppError(409, 'ALREADY_PERMITTED', 'This plate already has a valid permit for this period'),
  invalidState: (message: string) => new AppError(422, 'INVALID_STATE', message),
  dateInPast: () => new AppError(422, 'DATE_IN_PAST', 'The date is in the past'),
  dateTooFar: (maxDays: number) =>
    new AppError(422, 'DATE_TOO_FAR', `The date must be at most ${maxDays} days in the future`),
  cannotDeleteSelf: () =>
    new AppError(409, 'CANNOT_DELETE_SELF', 'You cannot delete your own account'),
  lastAdmin: () => new AppError(409, 'LAST_ADMIN', 'The last admin cannot be deleted'),
  emailTaken: () => new AppError(409, 'EMAIL_TAKEN', 'An admin with this email already exists'),
};
