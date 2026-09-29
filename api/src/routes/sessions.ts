import { Router } from 'express';
import { parse } from '../middleware/validate.js';
import { listGateEventsQuery, listSessionsQuery } from '../schemas.js';
import { listGateEvents, listSessions } from '../services/gate.js';

export function sessionsRouter(): Router {
  const r = Router();
  r.get('/', async (req, res) => {
    res.json(await listSessions(parse(listSessionsQuery, req.query)));
  });
  return r;
}

export function gateEventsRouter(): Router {
  const r = Router();
  r.get('/', async (req, res) => {
    res.json(await listGateEvents(parse(listGateEventsQuery, req.query)));
  });
  return r;
}
