import { Router } from 'express';
import { errors } from '../lib/errors.js';
import { currentAdmin, requireAdmin, signToken } from '../middleware/auth.js';
import { perIpLimiter } from '../middleware/rateLimit.js';
import { parse } from '../middleware/validate.js';
import { changePasswordSchema, loginSchema } from '../schemas.js';
import { changePassword, toAdmin, verifyCredentials } from '../services/admins.js';

export function authRouter(): Router {
  const r = Router();

  r.post('/login', perIpLimiter(10), async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const admin = await verifyCredentials(email, password);
    if (!admin) throw errors.invalidCredentials();
    res.json({ token: signToken(admin.id), admin: toAdmin(admin) });
  });

  r.get('/me', requireAdmin, (req, res) => {
    res.json(toAdmin(currentAdmin(req)));
  });

  r.post('/change-password', requireAdmin, async (req, res) => {
    const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
    await changePassword(currentAdmin(req).id, currentPassword, newPassword);
    res.status(204).end();
  });

  return r;
}
