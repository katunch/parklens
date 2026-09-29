import { Router } from 'express';
import { requireGateAuth } from '../middleware/gateAuth.js';
import { parse } from '../middleware/validate.js';
import { gateSchema } from '../schemas.js';
import { checkIn, checkOut } from '../services/gate.js';

export function gateRouter(): Router {
  const r = Router();
  r.use(requireGateAuth);

  r.post('/check-in', async (req, res) => {
    res.json(await checkIn(parse(gateSchema, req.body)));
  });

  r.post('/check-out', async (req, res) => {
    res.json(await checkOut(parse(gateSchema, req.body)));
  });

  return r;
}
