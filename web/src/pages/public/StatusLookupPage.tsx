import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api, qk } from '../../api/endpoints';
import { errorKey, toApiError } from '../../api/errors';
import { Button } from '../../components/Button';
import { Field, TextInput } from '../../components/Field';
import { InlineAlert } from '../../components/InlineAlert';
import { PlateInput } from '../../components/Plate';
import { useDocumentTitle } from '../../lib/hooks';
import { useForm } from '../../lib/useForm';
import { validatePlate } from '../../lib/validation';

interface LookupValues extends Record<string, unknown> {
  reference: string;
  plate: string;
}

const INITIAL: LookupValues = { reference: '', plate: '' };

/** `/request/status` – look up a request by reference code + plate (UX §5.3). */
export function StatusLookupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  useDocumentTitle(t('nav.documentTitle', { page: t('status.lookup.title') }));

  const form = useForm<LookupValues>({
    initial: INITIAL,
    idPrefix: 'lookup',
    validateOnBlur: ['plate'],
    validate: (v) => ({
      reference: v.reference.trim() ? null : { key: 'validation.referenceRequired' },
      plate: validatePlate(v.plate),
    }),
  });

  const mutation = useMutation({
    mutationFn: (v: LookupValues) => api.lookupRequest({ reference: v.reference.trim().toUpperCase(), plate: v.plate.trim() }),
    onSuccess: (data) => {
      const { token, ...status } = data;
      queryClient.setQueryData(qk.publicRequest(token), status);
      navigate(`/request/${token}`, { replace: true, state: status });
    },
    onError: (e) => {
      const err = toApiError(e);
      if (err.code === 'NOT_FOUND') return setFormError(t('status.lookup.notFound'));
      if (err.code === 'INVALID_PLATE') return form.setFieldError('plate', { key: 'errors.INVALID_PLATE' });
      setFormError(t(errorKey(err)));
    },
  });

  const submit = form.handleSubmit((v) => {
    setFormError(null);
    mutation.mutate(v);
  });

  const { values, errors } = form;
  const busy = mutation.isPending;

  return (
    <div className="lookup-page">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" />
        {t('public.backToStart')}
      </Link>
      <h1 className="public-title">{t('status.lookup.title')}</h1>
      <p className="public-lead">{t('status.lookup.lead')}</p>

      <form className="panel form-panel" onSubmit={submit} noValidate>
        {form.submitted && form.errorCount >= 2 && (
          <InlineAlert tone="danger" role="alert">
            {t('validation.summary', { count: form.errorCount })}
          </InlineAlert>
        )}
        <Field id={form.fieldId('reference')} label={t('status.lookup.referenceLabel')} error={errors.reference}>
          {(aria) => (
            <TextInput
              {...aria}
              mono
              value={values.reference}
              onChange={(e) => form.set('reference', e.target.value.toUpperCase())}
              placeholder={t('status.lookup.referencePlaceholder')}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              required
              invalid={Boolean(errors.reference)}
            />
          )}
        </Field>
        <Field id={form.fieldId('plate')} label={t('status.lookup.plateLabel')} error={errors.plate}>
          {(aria) => (
            <PlateInput {...aria} size="md" value={values.plate} onChange={(v) => form.set('plate', v)} onBlur={() => form.blur('plate')} invalid={Boolean(errors.plate)} required />
          )}
        </Field>
        {formError && (
          <InlineAlert tone="danger" role="alert">
            {formError}
          </InlineAlert>
        )}
        <Button type="submit" variant="primary" size="lg" loading={busy} className="form-panel__submit">
          {busy ? t('status.lookup.submitting') : t('status.lookup.submit')}
        </Button>
      </form>
    </div>
  );
}
