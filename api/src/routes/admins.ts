import { Router } from 'express';
import { currentAdmin } from '../middleware/auth.js';
import { parse, uuidParam } from '../middleware/validate.js';
import { createAdminSchema } from '../schemas.js';
import { createAdmin, deleteAdmin, listAdmins } from '../services/admins.js';

export function adminsRouter(): Router {
  const r = Router();

  r.get('/', async (_req, res) => {
    res.json(await listAdmins());
  });

  r.post('/', async (req, res) => {
    res.status(201).json(await createAdmin(parse(createAdminSchema, req.body)));
  });

  r.delete('/:id', async (req, res) => {
    await deleteAdmin(uuidParam(req.params.id, 'Admin'), currentAdmin(req).id);
    res.status(204).end();
  });

  return r;
}
