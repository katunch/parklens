import { Router } from 'express';
import { errors } from '../lib/errors.js';
import { perIpLimiter } from '../middleware/rateLimit.js';
import { parse } from '../middleware/validate.js';
import { publicLookupSchema, publicRequestSchema } from '../schemas.js';
import { createPublicRequest, getPublicRequestByToken, lookupPublicRequest } from '../services/permits.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function publicRouter(): Router {
  const r = Router();
  const createLimiter = perIpLimiter(10);
  const lookupLimiter = perIpLimiter(20);

  r.post('/requests', createLimiter, async (req, res) => {
    const input = parse(publicRequestSchema, req.body);
    res.status(201).json(await createPublicRequest(input));
  });

  r.post('/requests/lookup', lookupLimiter, async (req, res) => {
    const { reference, plate } = parse(publicLookupSchema, req.body);
    res.json(await lookupPublicRequest(reference, plate));
  });

  r.get('/requests/:token', async (req, res) => {
    const token = req.params.token;
    if (!TOKEN_RE.test(token)) throw errors.notFound('Request');
    res.json(await getPublicRequestByToken(token));
  });

  return r;
}
