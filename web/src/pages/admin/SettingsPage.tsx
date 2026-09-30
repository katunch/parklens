import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Send } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, qk } from '../../api/endpoints';
import { errorKey, toApiError } from '../../api/errors';
import type { Admin, WebhookFormat, WebhookSettings, WebhookTestResult } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { CopyField } from '../../components/CopyField';
import { Dialog } from '../../components/Dialog';
import { ErrorState } from '../../components/EmptyState';
import { Field, PasswordInput, Select, Switch, TextInput } from '../../components/Field';
import { InlineAlert } from '../../components/InlineAlert';
import { DescriptionList, PageHeader, Skeleton } from '../../components/Misc';
import { Panel } from '../../components/Panel';
import { ResponsiveTable, type Column } from '../../components/ResponsiveTable';
import { useToast } from '../../components/Toast';
import { useDelayedFlag } from '../../lib/hooks';
import { useFmt } from '../../lib/timezone';
import { useForm } from '../../lib/useForm';
import { LIMITS, validateEmail, validateName, validateNewPassword, validateRequiredPassword, validateWebhookUrl } from '../../lib/validation';

/** `/admin/settings` – notifications, camera connection, admins, own password (UX §5.12). */
export default function SettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="page page--narrow">
      <PageHeader title={t('settings.title')} />
      <div className="settings">
        <NotificationsPanel />
        <LotPanel />
        <CameraPanel />
        <AdminsPanel />
        <PasswordPanel />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Alarm notifications
// ---------------------------------------------------------------------------

interface WebhookValues extends Record<string, unknown> {
  enabled: boolean;
  url: string;
  format: WebhookFormat;
}

function NotificationsPanel() {
  const { t } = useTranslation();
  const settings = useQuery({ queryKey: qk.settings, queryFn: api.settings });
  const showSkeleton = useDelayedFlag(settings.isPending);
  return (
    <Panel title={t('settings.notifications.title')}>
      <p className="panel-lead">{t('settings.notifications.lead')}</p>
      {settings.isError && !settings.data ? (
        <ErrorState onRetry={() => void settings.refetch()} retrying={settings.isFetching} />
      ) : settings.data ? (
        <WebhookForm saved={settings.data.webhook} />
      ) : (
        showSkeleton && (
          <div className="stack-md" aria-busy="true">
            <Skeleton height={24} width="50%" />
            <Skeleton height={40} />
            <Skeleton height={40} width="40%" />
          </div>
        )
      )}
    </Panel>
  );
}

function WebhookForm({ saved }: { saved: WebhookSettings }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const testHintId = useId();
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<WebhookValues>({
    initial: { enabled: saved.enabled, url: saved.url, format: saved.format },
    idPrefix: 'webhook',
    validate: (v) => ({ url: validateWebhookUrl(v.url, v.enabled) }),
  });

  const save = useMutation({
    mutationFn: (v: WebhookValues) => api.saveSettings({ webhook: { enabled: v.enabled, url: v.url.trim(), format: v.format } }),
    onSuccess: (res) => {
      qc.setQueryData(qk.settings, res);
      form.reset({ enabled: res.webhook.enabled, url: res.webhook.url, format: res.webhook.format });
      toast({ tone: 'success', message: t('settings.notifications.saved') });
    },
    onError: (e) => {
      const err = toApiError(e);
      if (err.code === 'VALIDATION_ERROR' && err.validationDetails.some((d) => d.path.endsWith('url'))) {
        return form.setFieldError('url', { key: 'validation.urlInvalid' });
      }
      setFormError(t(errorKey(err)));
    },
  });

  const test = useMutation({
    mutationFn: api.testWebhook,
    onSuccess: setTestResult,
    onError: (e) => setTestResult({ ok: false, status: null, error: t(errorKey(e)) }),
  });

  const edit = <K extends keyof WebhookValues & string>(field: K, value: WebhookValues[K]) => {
    setTestResult(null);
    setFormError(null);
    form.set(field, value);
  };

  const { values, errors, dirty } = form;
  const canTest = saved.enabled && !dirty;
  const testHint = canTest ? null : dirty ? t('settings.notifications.testUnsaved') : t('settings.notifications.testDisabled');

  return (
    <form
      className="webhook-form"
      noValidate
      onSubmit={form.handleSubmit((v) => {
        setFormError(null);
        save.mutate(v);
      })}
    >
      <Switch id="webhook-enabled" switchFirst label={t('settings.notifications.enabledLabel')} checked={values.enabled} onChange={(v) => edit('enabled', v)} />
      <Field id={form.fieldId('url')} label={t('settings.notifications.urlLabel')} hint={t('settings.notifications.urlHint')} error={errors.url} optional={!values.enabled}>
        {(aria) => (
          <TextInput
            {...aria}
            type="url"
            inputMode="url"
            value={values.url}
            onChange={(e) => edit('url', e.target.value)}
            placeholder="https://hooks.slack.com/services/…"
            autoComplete="off"
            spellCheck={false}
            maxLength={2000}
            required={values.enabled}
            invalid={Boolean(errors.url)}
          />
        )}
      </Field>
      <Field id="webhook-format" label={t('settings.notifications.formatLabel')}>
        {(aria) => (
          <Select {...aria} value={values.format} onChange={(e) => edit('format', e.target.value as WebhookFormat)}>
            {(['generic', 'slack', 'teams'] as const).map((f) => (
              <option key={f} value={f}>
                {t(`settings.notifications.format.${f}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {formError && (
        <InlineAlert tone="danger" role="alert">
          {formError}
        </InlineAlert>
      )}
      <div className="button-row">
        <Button type="submit" variant="primary" loading={save.isPending}>
          {t('settings.notifications.save')}
        </Button>
        <Button icon={Send} loading={test.isPending} disabled={!canTest} aria-describedby={testHint ? testHintId : undefined} onClick={() => test.mutate()}>
          {test.isPending ? t('settings.notifications.testing') : t('settings.notifications.test')}
        </Button>
      </div>
      {testHint && (
        <p id={testHintId} className="field__hint">
          {testHint}
        </p>
      )}
      {testResult && (
        <InlineAlert tone={testResult.ok ? 'success' : 'danger'} role="status">
          {testResult.ok
            ? t('settings.notifications.testOk', { status: testResult.status ?? '' })
            : testResult.error
              ? t('settings.notifications.testFailed', { error: testResult.error })
              : t('settings.notifications.testFailedStatus', { status: testResult.status ?? '' })}
        </InlineAlert>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// 1b. Parking lot (v2)
// ---------------------------------------------------------------------------

export const CAPACITY_MIN = 1;
export const CAPACITY_MAX = 5000;

/** Lot capacity: a whole number from 1 to 5000 (UX §5.12, validation.capacityInvalid). */
export function validateCapacity(value: string) {
  const v = value.trim();
  return /^\d+$/.test(v) && Number(v) >= CAPACITY_MIN && Number(v) <= CAPACITY_MAX ? null : { key: 'validation.capacityInvalid' };
}

interface LotValues extends Record<string, unknown> {
  capacity: string;
}

function LotPanel() {
  const { t } = useTranslation();
  const settings = useQuery({ queryKey: qk.settings, queryFn: api.settings });
  return (
    <Panel title={t('settings.lot.title')}>
      <p className="panel-lead">{t('settings.lot.lead')}</p>
      {settings.isError && !settings.data ? (
        <ErrorState onRetry={() => void settings.refetch()} retrying={settings.isFetching} />
      ) : settings.data ? (
        <LotForm capacity={settings.data.lot.capacity} />
      ) : (
        <Skeleton height={40} width="40%" />
      )}
    </Panel>
  );
}

function LotForm({ capacity }: { capacity: number }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LotValues>({
    initial: { capacity: String(capacity) },
    idPrefix: 'lot',
    validate: (v) => ({ capacity: validateCapacity(v.capacity) }),
  });
  const save = useMutation({
    mutationFn: (v: LotValues) => api.saveSettings({ lot: { capacity: Number(v.capacity.trim()) } }),
    onSuccess: (res) => {
      qc.setQueryData(qk.settings, res);
      void qc.invalidateQueries({ queryKey: qk.summary });
      form.reset({ capacity: String(res.lot.capacity) });
      toast({ tone: 'success', message: t('settings.lot.saved') });
    },
    onError: (e) => {
      const err = toApiError(e);
      if (err.code === 'VALIDATION_ERROR') return form.setFieldError('capacity', { key: 'validation.capacityInvalid' });
      setFormError(t(errorKey(err)));
    },
  });
  const { values, errors } = form;
  return (
    <form
      className="lot-form"
      noValidate
      onSubmit={form.handleSubmit((v) => {
        setFormError(null);
        save.mutate(v);
      })}
    >
      <Field id={form.fieldId('capacity')} label={t('settings.lot.capacityLabel')} hint={t('settings.lot.capacityHint')} error={errors.capacity}>
        {(aria) => (
          <div className="input-suffix">
            <TextInput
              {...aria}
              type="number"
              inputMode="numeric"
              min={CAPACITY_MIN}
              max={CAPACITY_MAX}
              step={1}
              value={values.capacity}
              onChange={(e) => form.set('capacity', e.target.value)}
              invalid={Boolean(errors.capacity)}
              required
            />
            <span className="input-suffix__text" aria-hidden="true">
              {t('settings.lot.capacitySuffix')}
            </span>
          </div>
        )}
      </Field>
      {formError && (
        <InlineAlert tone="danger" role="alert">
          {formError}
        </InlineAlert>
      )}
      <div className="button-row">
        <Button type="submit" variant="primary" loading={save.isPending}>
          {t('settings.lot.save')}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 2. Camera connection
// ---------------------------------------------------------------------------

function CameraPanel() {
  const { t } = useTranslation();
  const settings = useQuery({ queryKey: qk.settings, queryFn: api.settings });
  const origin = window.location.origin;
  return (
    <Panel title={t('settings.camera.title')}>
      <p className="panel-lead">{t('settings.camera.lead')}</p>
      <DescriptionList
        className="dl--stacked"
        items={[
          { term: t('settings.camera.checkInLabel'), detail: <CopyField value={`${origin}/api/gate/check-in`} prefix="POST" /> },
          { term: t('settings.camera.checkOutLabel'), detail: <CopyField value={`${origin}/api/gate/check-out`} prefix="POST" /> },
          {
            term: t('settings.camera.apiKeyLabel'),
            detail: (
              <>
                <code className="mono">{settings.data?.gateApiKeyHint ?? t('common.emptyValue')}</code>
                <p className="field__hint">{t('settings.camera.apiKeyHint')}</p>
              </>
            ),
          },
          {
            term: t('settings.camera.timezoneLabel'),
            detail: (
              <>
                <span>{settings.data?.timezone ?? t('common.emptyValue')}</span>
                <p className="field__hint">{t('settings.camera.timezoneHint')}</p>
              </>
            ),
          },
        ]}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 3. Admins
// ---------------------------------------------------------------------------

function AdminsPanel() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { admin: me } = useAuth();
  const admins = useQuery({ queryKey: qk.admins, queryFn: api.admins });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Admin | null>(null);

  const columns: Array<Column<Admin>> = [
    {
      key: 'name',
      header: t('common.fields.name'),
      cardSlot: 'title',
      cell: (a) => (
        <span className="inline-badges">
          <span className="strong-500">{a.name}</span>
          {me?.id === a.id && <Badge tone="neutral">{t('common.you')}</Badge>}
        </span>
      ),
    },
    { key: 'email', header: t('common.fields.email'), cell: (a) => <span className="break">{a.email}</span> },
    {
      key: 'lastLogin',
      header: t('common.fields.lastLogin'),
      cardSlot: 'meta',
      cell: (a) => (a.lastLoginAt ? <time dateTime={a.lastLoginAt}>{fmt.dateTime(a.lastLoginAt)}</time> : t('settings.admins.never')),
    },
    { key: 'created', header: t('common.fields.created'), cardSlot: 'meta', cell: (a) => <time dateTime={a.createdAt}>{fmt.date(a.createdAt)}</time> },
    {
      key: 'remove',
      header: t('common.fields.actions'),
      headerHidden: true,
      align: 'end',
      cardSlot: 'action',
      cell: (a) =>
        me?.id === a.id ? null : (
          <Button variant="ghost" size="sm" className="btn--danger-text" onClick={() => setRemoving(a)}>
            {t('settings.admins.remove')}
            <span className="sr-only"> {a.name}</span>
          </Button>
        ),
    },
  ];

  return (
    <Panel
      title={t('settings.admins.title')}
      flush
      action={
        <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
          {t('settings.admins.add')}
        </Button>
      }
    >
      <p className="panel-lead panel-lead--flush">{t('settings.admins.lead')}</p>
      <ResponsiveTable
        caption={t('settings.admins.title')}
        columns={columns}
        rows={admins.data?.items}
        rowKey={(a) => a.id}
        loading={admins.isPending}
        skeletonRows={2}
        error={admins.isError && !admins.data ? <ErrorState onRetry={() => void admins.refetch()} retrying={admins.isFetching} /> : undefined}
        empty={null}
      />
      <AddAdminDialog open={adding} onClose={() => setAdding(false)} />
      <RemoveAdminDialog admin={removing} onClose={() => setRemoving(null)} />
    </Panel>
  );
}

interface AddAdminValues extends Record<string, unknown> {
  name: string;
  email: string;
  password: string;
}

function AddAdminDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title={t('settings.admins.addDialog.title')} size="sm" busy={busy} dirty={dirty}>
      {open && <AddAdminForm onClose={onClose} onBusy={setBusy} onDirty={setDirty} />}
    </Dialog>
  );
}

function AddAdminForm({ onClose, onBusy, onDirty }: { onClose: () => void; onBusy: (b: boolean) => void; onDirty: (d: boolean) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<AddAdminValues>({
    initial: { name: '', email: '', password: '' },
    idPrefix: 'add-admin',
    validateOnBlur: ['email'],
    validate: (v) => ({ name: validateName(v.name), email: validateEmail(v.email, true), password: validateNewPassword(v.password) }),
  });
  const mutation = useMutation({
    mutationFn: (v: AddAdminValues) => api.createAdmin({ name: v.name.trim(), email: v.email.trim(), password: v.password }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: qk.admins });
      onClose();
      toast({ tone: 'success', message: t('settings.admins.added', { name: a.name }) });
    },
    onError: (e) => {
      const err = toApiError(e);
      if (err.status === 409 || err.code === 'EMAIL_TAKEN') return form.setFieldError('email', { key: 'settings.admins.duplicateEmail' });
      setFormError(t(errorKey(err)));
    },
  });
  useEffect(() => onBusy(mutation.isPending), [mutation.isPending, onBusy]);
  useEffect(() => onDirty(form.dirty), [form.dirty, onDirty]);
  const { values, errors } = form;
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((v) => {
        setFormError(null);
        mutation.mutate(v);
      })}
    >
      <Field id={form.fieldId('name')} label={t('settings.admins.addDialog.nameLabel')} error={errors.name}>
        {(aria) => <TextInput {...aria} value={values.name} onChange={(e) => form.set('name', e.target.value)} autoComplete="off" required maxLength={120} invalid={Boolean(errors.name)} />}
      </Field>
      <Field id={form.fieldId('email')} label={t('settings.admins.addDialog.emailLabel')} error={errors.email}>
        {(aria) => (
          <TextInput
            {...aria}
            type="email"
            value={values.email}
            onChange={(e) => form.set('email', e.target.value)}
            onBlur={() => form.blur('email')}
            autoComplete="off"
            required
            maxLength={LIMITS.emailMax}
            invalid={Boolean(errors.email)}
          />
        )}
      </Field>
      <Field id={form.fieldId('password')} label={t('settings.admins.addDialog.passwordLabel')} hint={t('settings.admins.addDialog.passwordHint')} error={errors.password}>
        {(aria) => <PasswordInput {...aria} value={values.password} onChange={(e) => form.set('password', e.target.value)} autoComplete="new-password" required invalid={Boolean(errors.password)} />}
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
          {t('settings.admins.addDialog.submit')}
        </Button>
      </div>
    </form>
  );
}

function RemoveAdminDialog({ admin, onClose }: { admin: Admin | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const mutation = useMutation({
    mutationFn: (a: Admin) => api.deleteAdmin(a.id),
    onSuccess: (_r, a) => {
      void qc.invalidateQueries({ queryKey: qk.admins });
      onClose();
      toast({ tone: 'success', message: t('settings.admins.removed', { name: a.name }) });
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: qk.admins });
      onClose();
      toast({ tone: 'danger', message: t(errorKey(e)) });
    },
  });
  return (
    <Dialog
      open={admin !== null}
      onClose={onClose}
      size="sm"
      title={admin ? t('settings.admins.removeDialog.title', { name: admin.name }) : ''}
      description={admin ? t('settings.admins.removeDialog.body', { email: admin.email }) : undefined}
      busy={mutation.isPending}
      initialFocus={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} onClick={onClose} disabled={mutation.isPending}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant="danger" loading={mutation.isPending} onClick={() => admin && mutation.mutate(admin)}>
            {t('settings.admins.removeDialog.confirm')}
          </Button>
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// 4. Your password
// ---------------------------------------------------------------------------

interface PasswordValues extends Record<string, unknown> {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const EMPTY_PASSWORDS: PasswordValues = { currentPassword: '', newPassword: '', confirmPassword: '' };

function PasswordPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<PasswordValues>({
    initial: EMPTY_PASSWORDS,
    idPrefix: 'password',
    validate: (v) => ({
      currentPassword: validateRequiredPassword(v.currentPassword),
      newPassword: validateNewPassword(v.newPassword),
      confirmPassword: !v.confirmPassword
        ? { key: 'validation.passwordRequired' }
        : v.confirmPassword !== v.newPassword
          ? { key: 'validation.passwordMismatch' }
          : null,
    }),
  });
  const mutation = useMutation({
    mutationFn: (v: PasswordValues) => api.changePassword({ currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: () => {
      form.reset(EMPTY_PASSWORDS);
      toast({ tone: 'success', message: t('settings.account.success') });
    },
    onError: (e) => {
      const err = toApiError(e);
      // 403 INVALID_CREDENTIALS is a field error, never a logout (UX §2.4).
      if (err.code === 'INVALID_CREDENTIALS') return form.setFieldError('currentPassword', { key: 'settings.account.wrongCurrent' });
      if (err.code === 'VALIDATION_ERROR' && err.validationDetails.some((d) => d.path === 'newPassword')) {
        return form.setFieldError('newPassword', { key: 'validation.passwordTooShort', values: { min: LIMITS.passwordMin } });
      }
      setFormError(t(errorKey(err)));
    },
  });
  const { values, errors } = form;
  return (
    <Panel title={t('settings.account.title')} id="password">
      <form
        className="password-form"
        noValidate
        onSubmit={form.handleSubmit((v) => {
          setFormError(null);
          mutation.mutate(v);
        })}
      >
        {form.submitted && form.errorCount >= 2 && (
          <InlineAlert tone="danger" role="alert">
            {t('validation.summary', { count: form.errorCount })}
          </InlineAlert>
        )}
        <Field id={form.fieldId('currentPassword')} label={t('settings.account.currentLabel')} error={errors.currentPassword}>
          {(aria) => <PasswordInput {...aria} value={values.currentPassword} onChange={(e) => form.set('currentPassword', e.target.value)} autoComplete="current-password" required invalid={Boolean(errors.currentPassword)} />}
        </Field>
        <Field id={form.fieldId('newPassword')} label={t('settings.account.newLabel')} hint={t('settings.account.newHint')} error={errors.newPassword}>
          {(aria) => <PasswordInput {...aria} value={values.newPassword} onChange={(e) => form.set('newPassword', e.target.value)} autoComplete="new-password" required invalid={Boolean(errors.newPassword)} />}
        </Field>
        <Field id={form.fieldId('confirmPassword')} label={t('settings.account.confirmLabel')} error={errors.confirmPassword}>
          {(aria) => <PasswordInput {...aria} value={values.confirmPassword} onChange={(e) => form.set('confirmPassword', e.target.value)} autoComplete="new-password" required invalid={Boolean(errors.confirmPassword)} />}
        </Field>
        {formError && (
          <InlineAlert tone="danger" role="alert">
            {formError}
          </InlineAlert>
        )}
        <div className="button-row">
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {t('settings.account.submit')}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
