import { z } from 'zod';
import { LOT_CAPACITY_MAX, LOT_CAPACITY_MIN, WEBHOOK_FORMATS } from './config.js';
import { isValidDateString } from './lib/time.js';

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Raw plate input; normalization/length (422 INVALID_PLATE) is checked by parsePlate(). */
export const plateInput = z
  .string({ error: 'Plate is required' })
  .trim()
  .min(1, 'Plate is required')
  .max(32, 'Plate is too long');

const requiredText = (max: number, label: string) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);

/** Optional free text: '' / null / undefined → null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .max(254)
  .pipe(z.email({ error: 'Invalid email address' }));

/** Optional email: '' / null / undefined → null. */
export const optionalEmail = z
  .union([emailSchema, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const dateSchema = z
  .string()
  .trim()
  .refine(isValidDateString, { error: 'Expected a date in YYYY-MM-DD format' });

/** Optional date: '' / null / undefined → null. */
const optionalDate = z
  .union([dateSchema, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const permitType = z.enum(['permanent', 'daily']);

const requireDateForDaily = (
  v: { type: 'permanent' | 'daily'; validDate: string | null },
  ctx: z.RefinementCtx,
) => {
  if (v.type === 'daily' && !v.validDate) {
    ctx.addIssue({ code: 'custom', path: ['validDate'], message: 'validDate is required for daily permits' });
  }
};

/** Normalizes the permit input: permanent permits never carry a date. */
const dropDateForPermanent = <T extends { type: 'permanent' | 'daily'; validDate: string | null }>(v: T): T =>
  v.type === 'permanent' ? { ...v, validDate: null } : v;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

const boolQuery = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true' || v === '1'));

const optionalQueryString = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => (v ? v : undefined));

export const paginationQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(50)
    .transform((n) => Math.min(n, 200)),
  offset: z.coerce.number().int().min(0).default(0),
});

// ---------------------------------------------------------------------------
// Auth / admins
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string({ error: 'Email is required' }).trim().min(1, 'Email is required').max(254),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(200),
});

export const newPasswordSchema = z
  .string({ error: 'Password is required' })
  .min(10, 'Password must be at least 10 characters')
  .max(200);

export const changePasswordSchema = z.object({
  currentPassword: z.string({ error: 'Current password is required' }).min(1).max(200),
  newPassword: newPasswordSchema,
});

export const createAdminSchema = z.object({
  email: emailSchema,
  name: requiredText(120, 'Name'),
  password: newPasswordSchema,
});

// ---------------------------------------------------------------------------
// Permits
// ---------------------------------------------------------------------------

export const createPermitSchema = z
  .object({
    plate: plateInput,
    holderName: requiredText(120, 'Holder name'),
    holderEmail: optionalEmail,
    type: permitType,
    validDate: optionalDate,
    requestNote: optionalText(1000),
  })
  .superRefine(requireDateForDaily)
  .transform(dropDateForPermanent);

export const publicRequestSchema = z
  .object({
    plate: plateInput,
    holderName: requiredText(120, 'Name'),
    holderEmail: emailSchema,
    type: permitType,
    validDate: optionalDate,
    requestNote: optionalText(1000),
  })
  .superRefine(requireDateForDaily)
  .transform(dropDateForPermanent);

export const publicLookupSchema = z.object({
  reference: z.string({ error: 'Reference is required' }).trim().min(1, 'Reference is required').max(20),
  plate: plateInput,
});

export const updatePermitSchema = z.object({
  holderName: requiredText(120, 'Holder name').optional(),
  holderEmail: z.union([emailSchema, z.literal(''), z.null()]).optional(),
});

export const decisionSchema = z.object({
  decisionNote: optionalText(1000),
});

export const listPermitsQuery = paginationQuery.extend({
  status: z.enum(['pending', 'approved', 'rejected', 'revoked']).optional(),
  type: permitType.optional(),
  source: z.enum(['admin', 'request']).optional(),
  q: optionalQueryString,
  activeToday: boolQuery,
});

// ---------------------------------------------------------------------------
// Sessions / gate events / alarms
// ---------------------------------------------------------------------------

export const listSessionsQuery = paginationQuery.extend({
  active: boolQuery,
  plate: optionalQueryString,
});

export const listGateEventsQuery = paginationQuery.extend({
  plate: optionalQueryString,
  direction: z.enum(['in', 'out']).optional(),
  authorized: boolQuery,
});

export const listAlarmsQuery = paginationQuery.extend({
  status: z.enum(['open', 'resolved', 'all']).default('all'),
  plate: optionalQueryString,
});

export const resolveAlarmSchema = z.object({
  note: optionalText(1000),
  grantDailyPermit: z
    .object({
      holderName: requiredText(120, 'Holder name'),
      holderEmail: optionalEmail,
    })
    .nullish()
    .transform((v) => v ?? null),
});

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

export const gateSchema = z.object({
  plate: plateInput,
  occurredAt: z
    .union([z.iso.datetime({ offset: true, error: 'occurredAt must be an ISO-8601 timestamp' }), z.null()])
    .optional()
    .transform((v) => (v ? new Date(v) : new Date())),
  gateId: optionalText(64),
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const httpUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

export const updateSettingsSchema = z
  .object({
    webhook: z
      .object({
        enabled: z.boolean({ error: 'enabled must be a boolean' }),
        url: z
          .string()
          .trim()
          .max(2000)
          .nullish()
          .transform((v) => v ?? ''),
        format: z.enum(WEBHOOK_FORMATS as ['generic', 'slack', 'teams']).default('generic'),
      })
      .superRefine((v, ctx) => {
        if ((v.enabled || v.url !== '') && !httpUrl(v.url)) {
          ctx.addIssue({ code: 'custom', path: ['url'], message: 'URL must be a valid http(s) URL' });
        }
      })
      .optional(),
    lot: z
      .object({
        capacity: z
          .number({ error: 'capacity must be a number' })
          .int('capacity must be a whole number')
          .min(LOT_CAPACITY_MIN, `capacity must be at least ${LOT_CAPACITY_MIN}`)
          .max(LOT_CAPACITY_MAX, `capacity must be at most ${LOT_CAPACITY_MAX}`),
      })
      .optional(),
  })
  .refine((v) => v.webhook !== undefined || v.lot !== undefined, {
    error: 'Provide at least one of: webhook, lot',
  });

export type CreatePermitInput = z.output<typeof createPermitSchema>;
export type PublicRequestInput = z.output<typeof publicRequestSchema>;
export type GateInput = z.output<typeof gateSchema>;
