import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/endpoints';
import { errorKey, toApiError } from '../api/errors';
import type { Alarm } from '../api/types';
import { AlarmTypeBadge, StillParkedBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { CharCounter, Checkbox, Field, Textarea, TextInput } from '../components/Field';
import { InlineAlert } from '../components/InlineAlert';
import { PlateChip } from '../components/Plate';
import { useToast } from '../components/Toast';
import { useNow } from '../lib/hooks';
import { useFmt } from '../lib/timezone';
import { useForm } from '../lib/useForm';
import { LIMITS, optional, validateEmail, validateName, validateNote } from '../lib/validation';

interface AlarmActions {
  openResolve: (alarm: Alarm) => void;
}

const AlarmActionsContext = createContext<AlarmActions>({ openResolve: () => {} });

export function useAlarmActions() {
  return useContext(AlarmActionsContext);
}

/** Mounts the global ResolveAlarmDialog once in the shell (UX §4.5). */
export function AlarmActionsProvider({ children }: { children: ReactNode }) {
  const [alarm, setAlarm] = useState<Alarm | null>(null);
  const openResolve = useCallback((a: Alarm) => setAlarm(a), []);
  const value = useMemo(() => ({ openResolve }), [openResolve]);
  return (
    <AlarmActionsContext.Provider value={value}>
      {children}
      <ResolveAlarmDialog alarm={alarm} onClose={() => setAlarm(null)} />
    </AlarmActionsContext.Provider>
  );
}

interface ResolveValues extends Record<string, unknown> {
  note: string;
  grant: boolean;
  holderName: string;
  holderEmail: string;
}

const INITIAL: ResolveValues = { note: '', grant: false, holderName: '', holderEmail: '' };

function ResolveAlarmDialog({ alarm, onClose }: { alarm: Alarm | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  return (
    <Dialog open={alarm !== null} onClose={onClose} title={t('alarms.resolveDialog.title')} size="md" busy={busy} dirty={dirty} className="resolve-dialog">
      {alarm && <ResolveForm key={alarm.id} alarm={alarm} onClose={onClose} onBusy={setBusy} onDirty={setDirty} />}
    </Dialog>
  );
}

interface ResolveFormProps {
  alarm: Alarm;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
}

function ResolveForm({ alarm, onClose, onBusy, onDirty }: ResolveFormProps) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const now = useNow();
  const toast = useToast();
  const queryClient = useQueryClient();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ResolveValues>({
    initial: INITIAL,
    idPrefix: 'resolve',
    validateOnBlur: ['holderEmail'],
    validate: (v) => ({
      note: validateNote(v.note),
      holderName: v.grant ? validateName(v.holderName) : null,
      holderEmail: v.grant ? validateEmail(v.holderEmail, false) : null,
    }),
  });

  const mutation = useMutation({
    mutationFn: (v: ResolveValues) =>
      api.resolveAlarm(alarm.id, {
        note: optional(v.note),
        grantDailyPermit: v.grant ? { holderName: v.holderName.trim(), holderEmail: optional(v.holderEmail) } : undefined,
      }),
    onSuccess: (_res, v) => {
      void queryClient.invalidateQueries({ queryKey: ['alarms'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['permits'] });
      onClose();
      toast({
        tone: 'success',
        message: v.grant ? t('alarms.resolveDialog.successGrant', { name: v.holderName.trim() }) : t('alarms.resolveDialog.success'),
      });
    },
    onError: (e) => {
      const err = toApiError(e);
      if (err.code === 'INVALID_STATE' || err.code === 'NOT_FOUND') {
        void queryClient.invalidateQueries({ queryKey: ['alarms'] });
        void queryClient.invalidateQueries({ queryKey: ['summary'] });
        onClose();
        toast({ tone: 'info', message: t('alarms.resolveDialog.alreadyResolved') });
        return;
      }
      if (err.code === 'VALIDATION_ERROR') {
        for (const d of err.validationDetails) {
          if (d.path === 'note') return form.setFieldError('note', { key: 'validation.tooLong', values: { max: LIMITS.noteMax } });
          if (d.path.endsWith('holderName')) return form.setFieldError('holderName', { key: 'validation.nameRequired' });
          if (d.path.endsWith('holderEmail')) return form.setFieldError('holderEmail', { key: 'validation.emailInvalid' });
        }
      }
      setFormError(t(errorKey(err)));
    },
  });

  const busy = mutation.isPending;
  useEffect(() => onBusy(busy), [busy, onBusy]);
  useEffect(() => onDirty(form.dirty), [form.dirty, onDirty]);
  useEffect(() => () => {
    onBusy(false);
    onDirty(false);
  }, [onBusy, onDirty]);
  const submit = form.handleSubmit((v) => {
    setFormError(null);
    mutation.mutate(v);
  });

  const meta = alarm.gateId
    ? t('alarms.banner.meta', { time: fmt.relative(alarm.occurredAt, now), gate: alarm.gateId })
    : t('alarms.banner.metaNoGate', { time: fmt.relative(alarm.occurredAt, now) });

  const { values, errors } = form;

  return (
    <form className="resolve-form" onSubmit={submit} noValidate>
      <div className="dialog__subject">
        <PlateChip plate={alarm.plate} size="lg" state="denied" srPrefix />
        <div className="dialog__subject-text">
          <span className="inline-badges">
            <AlarmTypeBadge type={alarm.type} />
            {alarm.isStillParked && <StillParkedBadge />}
          </span>
          <span className="dialog__subject-type">{t(`common.alarmTypeLong.${alarm.type}`)}</span>
          <time dateTime={alarm.occurredAt} title={fmt.dateTime(alarm.occurredAt)} className="dialog__subject-meta">
            {meta}
          </time>
          {alarm.previousAlarmCount > 0 && <span className="text-warning text-sm">{t('alarms.previous', { count: alarm.previousAlarmCount })}</span>}
        </div>
      </div>

      <Field
        id={form.fieldId('note')}
        label={t('alarms.resolveDialog.noteLabel')}
        optional
        hint={t('alarms.resolveDialog.noteHint')}
        error={errors.note}
        after={<CharCounter length={values.note.length} max={LIMITS.noteMax} />}
      >
        {(aria) => (
          <Textarea
            {...aria}
            ref={noteRef}
            value={values.note}
            onChange={(e) => form.set('note', e.target.value)}
            placeholder={t('alarms.resolveDialog.notePlaceholder')}
            invalid={Boolean(errors.note)}
          />
        )}
      </Field>

      <Checkbox
        id="resolve-grant"
        label={t('alarms.resolveDialog.grantLabel')}
        hint={alarm.isStillParked ? t('alarms.resolveDialog.grantHint') : t('alarms.resolveDialog.grantHintLeft')}
        checked={values.grant}
        onChange={(e) => {
          form.set('grant', e.target.checked);
          if (e.target.checked) form.focusField('holderName');
        }}
      />

      {values.grant && (
        <div className="resolve-grant">
          <Field id={form.fieldId('holderName')} label={t('alarms.resolveDialog.holderNameLabel')} error={errors.holderName}>
            {(aria) => (
              <TextInput
                {...aria}
                value={values.holderName}
                onChange={(e) => form.set('holderName', e.target.value)}
                autoComplete="off"
                required
                maxLength={120}
                invalid={Boolean(errors.holderName)}
              />
            )}
          </Field>
          <Field id={form.fieldId('holderEmail')} label={t('alarms.resolveDialog.holderEmailLabel')} optional error={errors.holderEmail}>
            {(aria) => (
              <TextInput
                {...aria}
                type="email"
                value={values.holderEmail}
                onChange={(e) => form.set('holderEmail', e.target.value)}
                onBlur={() => form.blur('holderEmail')}
                autoComplete="off"
                maxLength={LIMITS.emailMax}
                invalid={Boolean(errors.holderEmail)}
              />
            )}
          </Field>
        </div>
      )}

      {formError && (
        <InlineAlert tone="danger" role="alert">
          {formError}
        </InlineAlert>
      )}

      <div className="dialog__footer dialog__footer--inline">
        <Button onClick={onClose} disabled={busy}>
          {t('common.actions.cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {values.grant ? t('alarms.resolveDialog.submitGrant') : t('alarms.resolveDialog.submit')}
        </Button>
      </div>
    </form>
  );
}
