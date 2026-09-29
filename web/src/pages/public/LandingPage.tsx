import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button, ButtonLink } from '../../components/Button';
import { Field } from '../../components/Field';
import { PlateInput } from '../../components/Plate';
import { useDocumentTitle } from '../../lib/hooks';
import { isValidPlate, normalizePlate } from '../../lib/plate';
import type { MaybeMsg } from '../../lib/validation';

/** `/` – get people into the request form quickly (UX §5.1). No API calls. */
export function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [plate, setPlate] = useState('');
  const [error, setError] = useState<MaybeMsg>(null);
  useDocumentTitle(t('nav.documentTitle', { page: t('landing.title') }));

  const go = () => {
    if (plate.trim() === '') {
      navigate('/request');
      return;
    }
    if (!isValidPlate(plate)) {
      setError({ key: 'validation.plateInvalid' });
      document.getElementById('landing-plate')?.focus();
      return;
    }
    navigate(`/request?plate=${encodeURIComponent(normalizePlate(plate))}`);
  };

  return (
    <div className="landing">
      <h1 className="public-title">{t('landing.title')}</h1>
      <p className="public-lead">{t('landing.lead')}</p>

      <form
        className="landing__form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <Field id="landing-plate" label={t('landing.plateLabel')} optional error={error}>
          {(aria) => (
            <PlateInput
              {...aria}
              value={plate}
              onChange={(v) => {
                setPlate(v);
                if (error) setError(null);
              }}
              onEnter={go}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" className="landing__cta">
          {t('landing.requestCta')}
        </Button>
      </form>

      <div className="landing__status">
        <p className="landing__status-hint">{t('landing.statusHint')}</p>
        <ButtonLink to="/request/status" variant="secondary">
          {t('landing.statusCta')}
        </ButtonLink>
      </div>

      <section className="steps" aria-labelledby="steps-title">
        <h2 id="steps-title" className="steps__title">
          {t('landing.stepsTitle')}
        </h2>
        <ol className="steps__list">
          {(['request', 'decision', 'status'] as const).map((step, i) => (
            <li key={step} className="steps__item">
              <span className="steps__number" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3 className="steps__item-title">{t(`landing.steps.${step}.title`)}</h3>
                <p className="steps__item-body">{t(`landing.steps.${step}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
