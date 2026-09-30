import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { errorKey, toApiError } from '../../api/errors';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/Button';
import { Field, PasswordInput, TextInput } from '../../components/Field';
import { InlineAlert } from '../../components/InlineAlert';
import { Logo } from '../../components/Misc';
import { useDocumentTitle } from '../../lib/hooks';
import { useForm } from '../../lib/useForm';
import { validateEmail, validateRequiredPassword } from '../../lib/validation';

interface LoginValues extends Record<string, unknown> {
  email: string;
  password: string;
}

const INITIAL: LoginValues = { email: '', password: '' };

/** `/login` – admin login (UX §5.5). */
export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  useDocumentTitle(t('nav.documentTitle', { page: t('login.title') }));

  const expired = params.get('expired') === '1';
  const loggedOut = Boolean((location.state as { loggedOut?: boolean } | null)?.loggedOut);
  const from = params.get('from');

  const form = useForm<LoginValues>({
    initial: INITIAL,
    idPrefix: 'login',
    validateOnBlur: ['email'],
    validate: (v) => ({ email: validateEmail(v.email, true), password: validateRequiredPassword(v.password) }),
  });

  const submit = form.handleSubmit(async (v) => {
    setFormError(null);
    setBusy(true);
    try {
      await login(v.email.trim(), v.password);
      navigate(from && from.startsWith('/admin') ? from : '/admin', { replace: true });
    } catch (e) {
      const err = toApiError(e);
      setFormError(t(errorKey(err)));
      form.set('password', '', { silent: true });
      window.requestAnimationFrame(() => passwordRef.current?.focus());
      setBusy(false);
    }
  });

  const { values, errors } = form;

  return (
    <div className="login-page">
      <span className="login-page__mark" aria-hidden="true">
        <Logo wordmark={false} className="login-page__logo" />
        <i className="reticle" />
      </span>
      <h1 className="public-title public-title--sm">{t('login.title')}</h1>
      <p className="public-lead">{t('login.lead')}</p>

      {(expired || loggedOut) && !formError && (
        <InlineAlert tone="info" className="login-page__notice">
          {expired ? t('login.sessionExpired') : t('login.loggedOut')}
        </InlineAlert>
      )}

      <form className="panel form-panel" onSubmit={submit} noValidate>
        <Field id={form.fieldId('email')} label={t('login.emailLabel')} error={errors.email}>
          {(aria) => (
            <TextInput
              {...aria}
              type="email"
              autoComplete="username"
              value={values.email}
              onChange={(e) => form.set('email', e.target.value)}
              onBlur={() => form.blur('email')}
              required
              invalid={Boolean(errors.email)}
            />
          )}
        </Field>
        <Field id={form.fieldId('password')} label={t('login.passwordLabel')} error={errors.password}>
          {(aria) => (
            <PasswordInput
              {...aria}
              ref={passwordRef}
              autoComplete="current-password"
              value={values.password}
              onChange={(e) => form.set('password', e.target.value)}
              required
              invalid={Boolean(errors.password)}
            />
          )}
        </Field>
        {formError && (
          <InlineAlert tone="danger" role="alert">
            {formError}
          </InlineAlert>
        )}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          {busy ? t('login.submitting') : t('login.submit')}
        </Button>
      </form>

      <p className="login-page__public">
        {t('login.publicHint')} <Link to="/">{t('login.publicLink')}</Link>
      </p>
    </div>
  );
}
