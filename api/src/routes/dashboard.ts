import { Router } from 'express';
import { getDashboardSummary } from '../services/dashboard.js';

export function dashboardRouter(): Router {
  const r = Router();
  r.get('/summary', async (_req, res) => {
    res.json(await getDashboardSummary());
  });
  return r;
}
