import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Car, CircleCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../api/endpoints';
import { errorKey, toApiError } from '../../api/errors';
import type { CreateRequestResult, PermitType } from '../../api/types';
import { Button, ButtonLink } from '../../components/Button';
import { CopyField } from '../../components/CopyField';
import { CharCounter, Field, Textarea, TextInput } from '../../components/Field';
import { InlineAlert } from '../../components/InlineAlert';
import { PlateChip, PlateInput } from '../../components/Plate';
import { SegmentedControl } from '../../components/SegmentedControl';
import { addDays } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import { formatPlate } from '../../lib/plate';
import { useFmt } from '../../lib/timezone';
import { tNode } from '../../lib/tnode';
import { useForm } from '../../lib/useForm';
import { LIMITS, optional, validateDate, validateEmail, validateName, validateNote, validatePlate, type Msg } from '../../lib/validation';

const MAX_DAYS_AHEAD = 60;

interface RequestValues extends Record<string, unknown> {
  type: PermitType;
  plate: string;
  validDate: string;
  holderName: string;
  holderEmail: string;
  requestNote: string;
}

const FIELD_FALLBACK: Record<string, Msg> = {
  plate: { key: 'validation.plateInvalid' },
  holderName: { key: 'validation.nameRequired' },
  holderEmail: { key: 'validation.emailInvalid' },
  validDate: { key: 'validation.dateRequired' },
  requestNote: { key: 'validation.tooLong', values: { max: LIMITS.noteMax } },
};

type FormAlert = { kind: 'duplicate' } | { kind: 'text'; text: string };

/** `/request` – public permit request form and success screen (UX §5.2). */
export function RequestPage() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const [params] = useSearchParams();
  const [success, setSuccess] = useState<{ result: CreateRequestResult; plate: string } | null>(null);
  const [formAlert, setFormAlert] = useState<FormAlert | null>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);

  const today = fmt.today();
  const maxDate = addDays(today, MAX_DAYS_AHEAD);

  const initial = useMemo<RequestValues>(
    () => ({
      type: params.get('type') === 'daily' ? 'daily' : 'permanent',
      plate: params.get('plate') ? formatPlate(params.get('plate') ?? '') : '',
      validDate: '',
      holderName: '',
      holderEmail: '',
      requestNote: '',
    }),
    // Only on first render: the URL pre-fills the form once.
    [],
  );

  const form = useForm<RequestValues>({
    initial,
    idPrefix: 'request',
    validateOnBlur: ['plate', 'holderEmail'],
    validate: (v) => ({
      plate: validatePlate(v.plate),
      validDate: v.type === 'daily' ? validateDate(v.validDate, today, maxDate, fmt.calDate) : null,
      holderName: validateName(v.holderName),
      holderEmail: validateEmail(v.holderEmail, true),
      requestNote: validateNote(v.requestNote),
    }),
  });

  useDocumentTitle(t('nav.documentTitle', { page: success ? t('request.success.title') : t('request.title') }));

  useEffect(() => {
    if (success) successHeading.current?.focus();
  }, [success]);

  const mutation = useMutation({
    mutationFn: (v: RequestValues) =>
      api.createRequest({
        plate: v.plate.trim(),
        holderName: v.holderName.trim(),
        holderEmail: v.holderEmail.trim(),
        type: v.type,
        validDate: v.type === 'daily' ? v.validDate : undefined,
        requestNote: optional(v.requestNote),
      }),
    onSuccess: (result, v) => {
      setSuccess({ result, plate: v.plate.trim().replace(/\s+/g, ' ') });
      window.scrollTo({ top: 0 });
    },
    onError: (e) => {
      const err = toApiError(e);
      switch (err.code) {
        case 'INVALID_PLATE':
          return form.setFieldError('plate', { key: 'errors.INVALID_PLATE' });
        case 'DATE_IN_PAST':
        case 'DATE_TOO_FAR':
          return form.setFieldError('validDate', { key: `errors.${err.code}` });
        case 'ALREADY_PERMITTED':
          return setFormAlert({ kind: 'text', text: t('request.errors.alreadyPermitted') });
        case 'DUPLICATE_REQUEST':
          return setFormAlert({ kind: 'duplicate' });
        case 'RATE_LIMITED':
          return setFormAlert({ kind: 'text', text: t('request.errors.rateLimited') });
        case 'VALIDATION_ERROR': {
          const detail = err.validationDetails.find((d) => FIELD_FALLBACK[d.path]);
          if (detail) return form.setFieldError(detail.path as keyof RequestValues & string, FIELD_FALLBACK[detail.path]!);
          return setFormAlert({ kind: 'text', text: t('errors.VALIDATION_ERROR') });
        }
        default:
          return setFormAlert({ kind: 'text', text: t(errorKey(err)) });
      }
    },
  });

  const submit = form.handleSubmit((v) => {
    setFormAlert(null);
    mutation.mutate(v);
  });

  if (success) {
    const statusUrl = `${window.location.origin}/request/${success.result.token}`;
    return (
      <div className="request-success">
        <span className="request-success__icon" aria-hidden="true">
          <CircleCheck size={28} />
        </span>
        <h1 className="public-title" tabIndex={-1} ref={successHeading}>
          {t('request.success.title')}
        </h1>
        <p className="public-lead">{tNode(t, 'request.success.lead', { plate: <PlateChip display={success.plate} size="md" /> })}</p>

        <div className="request-success__codes">
          <div className="field">
            <p className="field__label" id="success-ref-label">
              {t('request.success.referenceLabel')}
            </p>
            <CopyField value={success.result.reference} size="lg" />
          </div>
          <div className="field">
            <p className="field__label" id="success-link-label">
              {t('request.success.linkLabel')}
            </p>
            <CopyField value={statusUrl} size="sm" truncate copyLabel={t('common.actions.copyLink')} />
          </div>
          <p className="field__hint">{t('request.success.saveHint')}</p>
        </div>

        <div className="request-success__actions">
          <ButtonLink to={`/request/${success.result.token}`} variant="primary" size="lg">
            {t('request.success.openStatus')}
          </ButtonLink>
          <Button
            variant="link"
            onClick={() => {
              const type = form.values.type;
              form.reset({ ...initial, plate: '', type });
              setSuccess(null);
              setFormAlert(null);
              window.requestAnimationFrame(() => document.getElementById('request-plate')?.focus());
            }}
          >
            {t('request.success.another')}
          </Button>
        </div>
      </div>
    );
  }

  const { values, errors } = form;
  const daily = values.type === 'daily';
  const busy = mutation.isPending;

  return (
    <div className="request-page">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" />
        {t('public.backToStart')}
      </Link>
      <h1 className="public-title">{t('request.title')}</h1>
      <p className="public-lead">{t('request.lead')}</p>

      <form className="panel form-panel" onSubmit={submit} noValidate>
        {form.submitted && form.errorCount >= 2 && (
          <InlineAlert tone="danger" role="alert">
            {t('validation.summary', { count: form.errorCount })}
          </InlineAlert>
        )}

        <SegmentedControl<PermitType>
          name="request-type"
          id="request-type"
          legend={t('request.typeLegend')}
          variant="card"
          value={values.type}
          onChange={(v) => form.set('type', v)}
          options={[
            { value: 'permanent', icon: Car, label: t('request.type.permanent.title'), description: t('request.type.permanent.description') },
            { value: 'daily', icon: CalendarDays, label: t('request.type.daily.title'), description: t('request.type.daily.description') },
          ]}
        />

        <Field id={form.fieldId('plate')} label={t('request.plate.label')} hint={t('request.plate.hint')} error={errors.plate}>
          {(aria) => (
            <PlateInput {...aria} value={values.plate} onChange={(v) => form.set('plate', v)} onBlur={() => form.blur('plate')} invalid={Boolean(errors.plate)} required />
          )}
        </Field>

        {daily && (
          <Field
            id={form.fieldId('validDate')}
            label={t('request.date.label')}
            hint={t('request.date.hint', { maxDate: fmt.calDate(maxDate) })}
            error={errors.validDate}
          >
            {(aria) => (
              <TextInput
                {...aria}
                type="date"
                className="input--date"
                value={values.validDate}
                min={today}
                max={maxDate}
                onChange={(e) => form.set('validDate', e.target.value)}
                invalid={Boolean(errors.validDate)}
                required
              />
            )}
          </Field>
        )}

        <Field
          id={form.fieldId('holderName')}
          label={daily ? t('request.name.labelDaily') : t('request.name.labelPermanent')}
          hint={daily ? t('request.name.hintDaily') : undefined}
          error={errors.holderName}
        >
          {(aria) => (
            <TextInput
              {...aria}
              value={values.holderName}
              onChange={(e) => form.set('holderName', e.target.value)}
              autoComplete={daily ? 'off' : 'name'}
              required
              maxLength={120}
              invalid={Boolean(errors.holderName)}
            />
          )}
        </Field>

        <Field
          id={form.fieldId('holderEmail')}
          label={daily ? t('request.email.labelDaily') : t('request.email.labelPermanent')}
          hint={t('request.email.hint')}
          error={errors.holderEmail}
        >
          {(aria) => (
            <TextInput
              {...aria}
              type="email"
              value={values.holderEmail}
              onChange={(e) => form.set('holderEmail', e.target.value)}
              onBlur={() => form.blur('holderEmail')}
              autoComplete="email"
              required
              maxLength={LIMITS.emailMax}
              invalid={Boolean(errors.holderEmail)}
            />
          )}
        </Field>

        <Field
          id={form.fieldId('requestNote')}
          label={t('request.note.label')}
          optional
          hint={t('request.note.hint')}
          error={errors.requestNote}
          after={<CharCounter length={values.requestNote.length} max={LIMITS.noteMax} showFrom={400} />}
        >
          {(aria) => (
            <Textarea
              {...aria}
              value={values.requestNote}
              onChange={(e) => form.set('requestNote', e.target.value)}
              placeholder={t('request.note.placeholder')}
              invalid={Boolean(errors.requestNote)}
            />
          )}
        </Field>

        {formAlert && (
          <InlineAlert
            tone="danger"
            role="alert"
            action={
              formAlert.kind === 'duplicate' ? (
                <Link to="/request/status" className="alert__link">
                  {t('request.errors.duplicateAction')}
                </Link>
              ) : undefined
            }
          >
            {formAlert.kind === 'duplicate' ? t('request.errors.duplicate') : formAlert.text}
          </InlineAlert>
        )}

        <Button type="submit" variant="primary" size="lg" loading={busy} className="form-panel__submit">
          {busy ? t('request.submitting') : t('request.submit')}
        </Button>
      </form>
    </div>
  );
}
