import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Car } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, qk } from '../../api/endpoints';
import { errorKey, toApiError } from '../../api/errors';
import type { Permit, PermitType } from '../../api/types';
import { PermitStatusBadge, ValidToday } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { CharCounter, Field, Textarea, TextInput } from '../../components/Field';
import { InlineAlert } from '../../components/InlineAlert';
import { DescriptionList } from '../../components/Misc';
import { PlateChip, PlateInput } from '../../components/Plate';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useToast } from '../../components/Toast';
import { addDays } from '../../lib/format';
import { markFresh } from '../../lib/fresh';
import { displayPlate } from '../../lib/plate';
import { useFmt } from '../../lib/timezone';
import { tNode } from '../../lib/tnode';
import { useForm } from '../../lib/useForm';
import { LIMITS, optional, validateDate, validateEmail, validateName, validateNote, validatePlate } from '../../lib/validation';

const ADMIN_MAX_DAYS = 365;

function invalidatePermitData(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['permits'] });
  void qc.invalidateQueries({ queryKey: ['summary'] });
  void qc.invalidateQueries({ queryKey: ['sessions'] });
}

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

export function PermitDetailsDialog({ permit: initial, onClose }: { permit: Permit | null; onClose: () => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const [edit, setEdit] = useState(false);
  const [revoke, setRevoke] = useState(false);
  const detail = useQuery({
    queryKey: qk.permit(initial?.id ?? ''),
    queryFn: () => api.permit(initial?.id ?? ''),
    enabled: initial !== null,
    placeholderData: initial ?? undefined,
  });
  const permit = detail.data ?? initial;

  useEffect(() => {
    if (!initial) {
      setEdit(false);
      setRevoke(false);
    }
  }, [initial]);

  const plate = permit ? displayPlate(permit) : '';

  return (
    <>
      <Dialog
        open={initial !== null}
        onClose={onClose}
        title={t('permits.detailsDialog.title', { plate })}
        size="md"
        footer={
          permit && (
            <>
              <Button onClick={() => setEdit(true)}>{t('permits.detailsDialog.editHolder')}</Button>
              {permit.status === 'approved' && (
                <Button variant="danger" onClick={() => setRevoke(true)}>
                  {t('permits.detailsDialog.revoke')}
                </Button>
              )}
              <Button variant="primary" onClick={onClose}>
                {t('common.actions.close')}
              </Button>
            </>
          )
        }
      >
        {permit && (
          <div className="permit-details">
            <div className="permit-details__head">
              <PlateChip display={permit.plateDisplay} plate={permit.plate} size="lg" srPrefix />
              <PermitStatusBadge status={permit.status} />
              {permit.isActiveToday && <ValidToday />}
            </div>
            <DescriptionList
              items={[
                { term: t('common.fields.holder'), detail: permit.holderName },
                { term: t('common.fields.email'), detail: permit.holderEmail ?? t('common.emptyValue') },
                {
                  term: t('common.fields.type'),
                  detail:
                    permit.type === 'daily' && permit.validDate
                      ? t('common.permitDailyOn', { date: fmt.calDateWeekday(permit.validDate) })
                      : t('common.permitTypeLong.permanent'),
                },
                {
                  term: t('common.fields.source'),
                  detail:
                    permit.source === 'request' ? (
                      <>
                        {t('common.source.request')} <code className="mono">{permit.reference}</code>
                      </>
                    ) : (
                      t('permits.detailsDialog.createdByAdmin')
                    ),
                },
                permit.requestNote ? { term: t('permits.detailsDialog.requestNote'), detail: <span className="quote">«{permit.requestNote}»</span> } : null,
                permit.decisionNote ? { term: t('permits.detailsDialog.decisionNote'), detail: <span className="quote">«{permit.decisionNote}»</span> } : null,
                permit.decidedAt
                  ? {
                      term: t('permits.detailsDialog.decidedAt'),
                      detail: (
                        <>
                          <time dateTime={permit.decidedAt}>{fmt.dateTime(permit.decidedAt)}</time>
                          {permit.decidedByName && <span className="muted"> · {permit.decidedByName}</span>}
                        </>
                      ),
                    }
                  : null,
                { term: t('permits.detailsDialog.createdAt'), detail: <time dateTime={permit.createdAt}>{fmt.dateTime(permit.createdAt)}</time> },
              ]}
            />
          </div>
        )}
      </Dialog>
      {permit && <EditHolderDialog permit={edit ? permit : null} onClose={() => setEdit(false)} />}
      {permit && (
        <RevokeDialog
          permit={revoke ? permit : null}
          onClose={() => setRevoke(false)}
          onRevoked={() => {
            setRevoke(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Edit holder
// ---------------------------------------------------------------------------

interface HolderValues extends Record<string, unknown> {
  holderName: string;
  holderEmail: string;
}

export function EditHolderDialog({ permit, onClose }: { permit: Permit | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  return (
    <Dialog open={permit !== null} onClose={onClose} title={t('permits.editDialog.title')} size="sm" busy={busy} dirty={dirty}>
      {permit && <EditHolderForm key={permit.id} permit={permit} onClose={onClose} onBusy={setBusy} onDirty={setDirty} />}
    </Dialog>
  );
}

function EditHolderForm({ permit, onClose, onBusy, onDirty }: { permit: Permit; onClose: () => void; onBusy: (b: boolean) => void; onDirty: (d: boolean) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<HolderValues>({
    initial: { holderName: permit.holderName, holderEmail: permit.holderEmail ?? '' },
    idPrefix: 'edit-holder',
    validateOnBlur: ['holderEmail'],
    validate: (v) => ({ holderName: validateName(v.holderName), holderEmail: validateEmail(v.holderEmail, false) }),
  });
  const mutation = useMutation({
    mutationFn: (v: HolderValues) => api.updatePermit(permit.id, { holderName: v.holderName.trim(), holderEmail: v.holderEmail.trim() || null }),
    onSuccess: (updated) => {
      qc.setQueryData(qk.permit(updated.id), updated);
      invalidatePermitData(qc);
      markFresh(updated.id);
      onClose();
      toast({ tone: 'success', message: t('permits.editDialog.success') });
    },
    onError: (e) => setFormError(t(errorKey(e))),
  });
  useEffect(() => onBusy(mutation.isPending), [mutation.isPending, onBusy]);
  useEffect(() => onDirty(form.dirty), [form.dirty, onDirty]);
  const { values, errors } = form;
  return (
    <form
      onSubmit={form.handleSubmit((v) => {
        setFormError(null);
        mutation.mutate(v);
      })}
      noValidate
    >
      <Field id={form.fieldId('holderName')} label={t('permits.createDialog.holderNameLabel')} error={errors.holderName}>
        {(aria) => <TextInput {...aria} value={values.holderName} onChange={(e) => form.set('holderName', e.target.value)} required maxLength={120} invalid={Boolean(errors.holderName)} />}
      </Field>
      <Field id={form.fieldId('holderEmail')} label={t('permits.createDialog.holderEmailLabel')} optional error={errors.holderEmail}>
        {(aria) => (
          <TextInput
            {...aria}
            type="email"
            value={values.holderEmail}
            onChange={(e) => form.set('holderEmail', e.target.value)}
            onBlur={() => form.blur('holderEmail')}
            maxLength={LIMITS.emailMax}
            invalid={Boolean(errors.holderEmail)}
          />
        )}
      </Field>
      {formError && (
        <InlineAlert tone="danger" role="alert">
          {formError}
        </InlineAlert>
      )}
      <div className="dialog__footer dialog__footer--inline">
        <Button onClick={onClose} disabled={mutation.isPending}>
          {t('common.actions.cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={mutation.isPending}>
          {t('permits.editDialog.submit')}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

export function RevokeDialog({ permit, onClose, onRevoked }: { permit: Permit | null; onClose: () => void; onRevoked: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [note, setNote] = useState('');
  const noteError = validateNote(note);

  useEffect(() => {
    if (permit) setNote('');
  }, [permit]);

  const mutation = useMutation({
    mutationFn: (p: Permit) => api.revokePermit(p.id, optional(note)),
    onSuccess: (updated) => {
      qc.setQueryData(qk.permit(updated.id), updated);
      invalidatePermitData(qc);
      markFresh(updated.id);
      toast({ tone: 'success', message: tNode(t, 'permits.revokeDialog.success', { plate: <PlateChip display={updated.plateDisplay} size="sm" /> }) });
      onRevoked();
    },
    onError: (e) => {
      const err = toApiError(e);
      invalidatePermitData(qc);
      toast({ tone: 'danger', message: t(errorKey(err)) });
      onClose();
    },
  });

  const plate = permit ? displayPlate(permit) : '';
  return (
    <Dialog
      open={permit !== null}
      onClose={onClose}
      title={t('permits.revokeDialog.title', { plate })}
      description={permit ? t('permits.revokeDialog.body', { name: permit.holderName }) : undefined}
      size="sm"
      busy={mutation.isPending}
      dirty={note !== ''}
      initialFocus={cancelRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (permit && !noteError) mutation.mutate(permit);
      }}
      footer={
        <>
          <Button ref={cancelRef} onClick={onClose} disabled={mutation.isPending}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" variant="danger" loading={mutation.isPending}>
            {t('permits.revokeDialog.confirm')}
          </Button>
        </>
      }
    >
      <Field id="revoke-note" label={t('permits.revokeDialog.noteLabel')} optional error={noteError} after={<CharCounter length={note.length} max={LIMITS.noteMax} />}>
        {(aria) => <Textarea {...aria} value={note} onChange={(e) => setNote(e.target.value)} invalid={Boolean(noteError)} />}
      </Field>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

interface CreateValues extends Record<string, unknown> {
  plate: string;
  holderName: string;
  holderEmail: string;
  type: PermitType;
  validDate: string;
  requestNote: string;
}

export function CreatePermitDialog({ open, onClose, initialPlate = '' }: { open: boolean; onClose: () => void; initialPlate?: string }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title={t('permits.createDialog.title')} description={t('permits.createDialog.lead')} size="md" busy={busy} dirty={dirty}>
      {open && <CreatePermitForm onClose={onClose} onBusy={setBusy} onDirty={setDirty} initialPlate={initialPlate} />}
    </Dialog>
  );
}

function CreatePermitForm({ onClose, onBusy, onDirty, initialPlate }: { onClose: () => void; onBusy: (b: boolean) => void; onDirty: (d: boolean) => void; initialPlate: string }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const toast = useToast();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const today = fmt.today();
  const maxDate = addDays(today, ADMIN_MAX_DAYS);

  const form = useForm<CreateValues>({
    initial: { plate: initialPlate, holderName: '', holderEmail: '', type: 'permanent', validDate: today, requestNote: '' },
    idPrefix: 'create-permit',
    validateOnBlur: ['plate', 'holderEmail'],
    validate: (v) => ({
      plate: validatePlate(v.plate),
      holderName: validateName(v.holderName),
      holderEmail: validateEmail(v.holderEmail, false),
      validDate: v.type === 'daily' ? validateDate(v.validDate, today, maxDate, fmt.calDate) : null,
      requestNote: validateNote(v.requestNote),
    }),
  });

  const mutation = useMutation({
    mutationFn: (v: CreateValues) =>
      api.createPermit({
        plate: v.plate.trim(),
        holderName: v.holderName.trim(),
        holderEmail: optional(v.holderEmail),
        type: v.type,
        validDate: v.type === 'daily' ? v.validDate : undefined,
        requestNote: optional(v.requestNote),
      }),
    onSuccess: (p) => {
      invalidatePermitData(qc);
      markFresh(p.id);
      onClose();
      toast({ tone: 'success', message: tNode(t, 'permits.createDialog.success', { plate: <PlateChip display={p.plateDisplay} size="sm" /> }) });
    },
    onError: (e) => {
      const err = toApiError(e);
      switch (err.code) {
        case 'ALREADY_PERMITTED':
          return form.setFieldError('plate', { key: 'errors.ALREADY_PERMITTED' });
        case 'INVALID_PLATE':
          return form.setFieldError('plate', { key: 'errors.INVALID_PLATE' });
        case 'DATE_IN_PAST':
        case 'DATE_TOO_FAR':
          return form.setFieldError('validDate', { key: `errors.${err.code}` });
        default:
          return setFormError(t(errorKey(err)));
      }
    },
  });

  useEffect(() => onBusy(mutation.isPending), [mutation.isPending, onBusy]);
  useEffect(() => onDirty(form.dirty), [form.dirty, onDirty]);
  const { values, errors } = form;

  return (
    <form
      onSubmit={form.handleSubmit((v) => {
        setFormError(null);
        mutation.mutate(v);
      })}
      noValidate
    >
      {form.submitted && form.errorCount >= 2 && (
        <InlineAlert tone="danger" role="alert">
          {t('validation.summary', { count: form.errorCount })}
        </InlineAlert>
      )}
      <Field id={form.fieldId('plate')} label={t('common.fields.plate')} error={errors.plate}>
        {(aria) => <PlateInput {...aria} size="md" value={values.plate} onChange={(v) => form.set('plate', v)} onBlur={() => form.blur('plate')} invalid={Boolean(errors.plate)} required />}
      </Field>
      <Field id={form.fieldId('holderName')} label={t('permits.createDialog.holderNameLabel')} error={errors.holderName}>
        {(aria) => <TextInput {...aria} value={values.holderName} onChange={(e) => form.set('holderName', e.target.value)} required maxLength={120} autoComplete="off" invalid={Boolean(errors.holderName)} />}
      </Field>
      <Field id={form.fieldId('holderEmail')} label={t('permits.createDialog.holderEmailLabel')} optional error={errors.holderEmail}>
        {(aria) => (
          <TextInput
            {...aria}
            type="email"
            value={values.holderEmail}
            onChange={(e) => form.set('holderEmail', e.target.value)}
            onBlur={() => form.blur('holderEmail')}
            maxLength={LIMITS.emailMax}
            autoComplete="off"
            invalid={Boolean(errors.holderEmail)}
          />
        )}
      </Field>
      <SegmentedControl<PermitType>
        name="create-permit-type"
        legend={t('common.fields.type')}
        value={values.type}
        onChange={(v) => form.set('type', v)}
        className="field"
        options={[
          { value: 'permanent', icon: Car, label: t('common.permitTypeLong.permanent') },
          { value: 'daily', icon: CalendarDays, label: t('common.permitTypeLong.daily') },
        ]}
      />
      {values.type === 'daily' && (
        <Field id={form.fieldId('validDate')} label={t('common.fields.date')} hint={t('permits.createDialog.dateHint', { maxDate: fmt.calDate(maxDate) })} error={errors.validDate}>
          {(aria) => (
            <TextInput {...aria} type="date" className="input--date" value={values.validDate} min={today} max={maxDate} onChange={(e) => form.set('validDate', e.target.value)} required invalid={Boolean(errors.validDate)} />
          )}
        </Field>
      )}
      <Field id={form.fieldId('requestNote')} label={t('permits.createDialog.noteLabel')} optional error={errors.requestNote} after={<CharCounter length={values.requestNote.length} max={LIMITS.noteMax} />}>
        {(aria) => <Textarea {...aria} value={values.requestNote} onChange={(e) => form.set('requestNote', e.target.value)} invalid={Boolean(errors.requestNote)} />}
      </Field>
      {formError && (
        <InlineAlert tone="danger" role="alert">
          {formError}
        </InlineAlert>
      )}
      <div className="dialog__footer dialog__footer--inline">
        <Button onClick={onClose} disabled={mutation.isPending}>
          {t('common.actions.cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={mutation.isPending}>
          {t('permits.createDialog.submit')}
        </Button>
      </div>
    </form>
  );
}
