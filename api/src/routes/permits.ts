import { Router } from 'express';
import { currentAdmin } from '../middleware/auth.js';
import { parse, uuidParam } from '../middleware/validate.js';
import { createPermitSchema, decisionSchema, listPermitsQuery, updatePermitSchema } from '../schemas.js';
import {
  createAdminPermit,
  decidePermit,
  getPermit,
  listPermits,
  updatePermit,
  type Decision,
} from '../services/permits.js';

export function permitsRouter(): Router {
  const r = Router();

  r.get('/', async (req, res) => {
    res.json(await listPermits(parse(listPermitsQuery, req.query)));
  });

  r.post('/', async (req, res) => {
    const input = parse(createPermitSchema, req.body);
    res.status(201).json(await createAdminPermit(input, currentAdmin(req).id));
  });

  r.get('/:id', async (req, res) => {
    res.json(await getPermit(uuidParam(req.params.id, 'Permit')));
  });

  r.patch('/:id', async (req, res) => {
    const id = uuidParam(req.params.id, 'Permit');
    const patch = parse(updatePermitSchema, req.body);
    res.json(await updatePermit(id, patch));
  });

  for (const decision of ['approve', 'reject', 'revoke'] as Decision[]) {
    r.post(`/:id/${decision}`, async (req, res) => {
      const id = uuidParam(req.params.id, 'Permit');
      const { decisionNote } = parse(decisionSchema, req.body);
      res.json(await decidePermit(id, decision, decisionNote, currentAdmin(req).id));
    });
  }

  return r;
}
