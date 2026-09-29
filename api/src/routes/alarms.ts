import { Router } from 'express';
import { currentAdmin } from '../middleware/auth.js';
import { parse, uuidParam } from '../middleware/validate.js';
import { listAlarmsQuery, resolveAlarmSchema } from '../schemas.js';
import { getAlarm, listAlarms, resolveAlarm } from '../services/alarms.js';

export function alarmsRouter(): Router {
  const r = Router();

  r.get('/', async (req, res) => {
    res.json(await listAlarms(parse(listAlarmsQuery, req.query)));
  });

  r.get('/:id', async (req, res) => {
    res.json(await getAlarm(uuidParam(req.params.id, 'Alarm')));
  });

  r.post('/:id/resolve', async (req, res) => {
    const id = uuidParam(req.params.id, 'Alarm');
    const input = parse(resolveAlarmSchema, req.body);
    res.json(await resolveAlarm(id, input, currentAdmin(req).id));
  });

  return r;
}
