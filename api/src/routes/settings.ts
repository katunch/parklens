import { Router } from 'express';
import { parse } from '../middleware/validate.js';
import { updateSettingsSchema } from '../schemas.js';
import { getPublicSettings, setLotSettings, setWebhookSettings } from '../services/settings.js';
import { sendTestWebhook } from '../services/webhook.js';

export function settingsRouter(): Router {
  const r = Router();

  r.get('/', async (_req, res) => {
    res.json(await getPublicSettings());
  });

  r.put('/', async (req, res) => {
    const { webhook, lot } = parse(updateSettingsSchema, req.body);
    if (webhook) await setWebhookSettings(webhook);
    if (lot) await setLotSettings(lot);
    res.json(await getPublicSettings());
  });

  r.post('/webhook/test', async (_req, res) => {
    res.json(await sendTestWebhook());
  });

  return r;
}
