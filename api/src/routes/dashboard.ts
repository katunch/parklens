import { Router } from 'express';
import { getDashboardSummary, getDashboardTimeline, getGateStatuses } from '../services/dashboard.js';

export function dashboardRouter(): Router {
  const r = Router();
  r.get('/summary', async (_req, res) => {
    res.json(await getDashboardSummary());
  });
  r.get('/timeline', async (_req, res) => {
    res.json(await getDashboardTimeline());
  });
  r.get('/gates', async (_req, res) => {
    res.json(await getGateStatuses());
  });
  return r;
}
