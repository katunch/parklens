import { useMutation } from '@tanstack/react-query';
import { CircleCheck, CircleX, LogIn, LogOut, Navigation, ScanLine, Shuffle } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../api/endpoints';
import { errorKey, toApiError } from '../../api/errors';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Field, Switch, TextInput } from '../../components/Field';
import { Badge } from '../../components/Badge';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useAutopilot } from '../../live/Autopilot';
import { addSimResult, clearSimResults, useSimResults, type SimResult } from '../../lib/simResults';
import type { Pace } from '../../lib/autopilot';
import { InlineAlert } from '../../components/InlineAlert';
import { PageHeader } from '../../components/Misc';
import { Panel } from '../../components/Panel';
import { PlateChip, PlateInput } from '../../components/Plate';
import { cx } from '../../lib/cx';
import { datetimeLocalToIso } from '../../lib/format';
import { useFresh } from '../../lib/fresh';
import { randomPlate } from '../../lib/plate';
import { STORAGE_KEYS, storage } from '../../lib/storage';
import { useFmt } from '../../lib/timezone';
import { LIMITS, validateGate, validatePlate, type MaybeMsg } from '../../lib/validation';

const DEMO_PLATES = [
  { plate: 'ZH 123 456', caption: 'permanent' },
  { plate: 'BE 98 765', caption: 'permanent' },
  { plate: 'ZH 555 111', caption: 'daily' },
  { plate: 'ZH 999 999', caption: 'none' },
  { plate: 'AG 44 321', caption: 'pending' },
  { plate: 'LU 777', caption: 'rejected' },
] as const;


/** `/admin/simulator` – check-in / check-out any plate via the real gate endpoints (UX §5.11). */
export default function SimulatorPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [plate, setPlate] = useState(() => (params.get('plate') ?? '').toUpperCase());
  const [plateError, setPlateError] = useState<MaybeMsg>(null);
  const [gate, setGate] = useState(() => storage.local.get(STORAGE_KEYS.simGate) ?? t('simulator.gateDefault'));
  const [time, setTime] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const results = useSimResults();
  const checkInRef = useRef<HTMLButtonElement>(null);
  const gateError = validateGate(gate);

  const mutation = useMutation({
    mutationFn: async (kind: 'in' | 'out'): Promise<SimResult> => {
      const occurredAt = datetimeLocalToIso(time) ?? undefined;
      const body = { plate: plate.trim(), gateId: gate.trim() || undefined, occurredAt };
      const at = occurredAt ?? new Date().toISOString();
      const gateId = gate.trim() || null;
      if (kind === 'in') {
        const res = await api.checkIn(body);
        return { id: `sim-${res.eventId}`, kind, at, gate: gateId, res };
      }
      const res = await api.checkOut(body);
      return { id: `sim-${res.eventId}`, kind, at, gate: gateId, res };
    },
    onSuccess: addSimResult,
    onError: (e) => {
      const err = toApiError(e);
      if (err.code === 'INVALID_PLATE') {
        setPlateError({ key: 'errors.INVALID_PLATE' });
        document.getElementById('sim-plate')?.focus();
        return;
      }
      setFormError(t(errorKey(err)));
    },
  });

  const run = (kind: 'in' | 'out') => {
    if (mutation.isPending) return;
    setFormError(null);
    const pErr = validatePlate(plate);
    setPlateError(pErr);
    if (pErr) {
      document.getElementById('sim-plate')?.focus();
      return;
    }
    if (gateError) {
      document.getElementById('sim-gate')?.focus();
      return;
    }
    mutation.mutate(kind);
  };

  const pendingKind = mutation.isPending ? mutation.variables : null;

  return (
    <div className="page">
      <PageHeader title={t('simulator.title')} lead={t('simulator.lead')} />
      <div className="simulator">
        <div className="simulator__col">
        <AutopilotPanel />
        <Panel title={t('simulator.formTitle')} className="simulator__form">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              run('in');
            }}
          >
            <Field id="sim-plate" label={t('simulator.plateLabel')} hint={t('simulator.enterHint')} error={plateError}>
              {(aria) => (
                <PlateInput
                  {...aria}
                  value={plate}
                  onChange={(v) => {
                    setPlate(v);
                    if (plateError) setPlateError(null);
                  }}
                  onEnter={() => run('in')}
                  invalid={Boolean(plateError)}
                />
              )}
            </Field>

            <fieldset className="demo-plates">
              <legend className="field__label">{t('simulator.demoLabel')}</legend>
              <div className="demo-plates__grid">
                {DEMO_PLATES.map((d) => {
                  const caption = t(`simulator.demo.${d.caption}`);
                  return (
                    <button
                      key={d.plate}
                      type="button"
                      className="demo-plate"
                      aria-label={`${d.plate}, ${caption}`}
                      onClick={() => {
                        setPlate(d.plate);
                        setPlateError(null);
                        checkInRef.current?.focus();
                      }}
                    >
                      <PlateChip display={d.plate} size="md" />
                      <span className="demo-plate__caption">{caption}</span>
                    </button>
                  );
                })}
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={Shuffle}
                className="demo-plates__random"
                onClick={() => {
                  setPlate(randomPlate());
                  setPlateError(null);
                }}
              >
                {t('simulator.demo.random')}
              </Button>
            </fieldset>

            <Field id="sim-gate" label={t('simulator.gateLabel')} hint={t('simulator.gateHint')} error={gateError}>
              {(aria) => (
                <TextInput
                  {...aria}
                  value={gate}
                  onChange={(e) => {
                    setGate(e.target.value);
                    storage.local.set(STORAGE_KEYS.simGate, e.target.value);
                  }}
                  maxLength={LIMITS.gateMax + 10}
                  autoComplete="off"
                  spellCheck={false}
                  invalid={Boolean(gateError)}
                />
              )}
            </Field>

            <details className="disclosure" open={time !== '' ? true : undefined}>
              <summary className="disclosure__summary">{t('simulator.timeToggle')}</summary>
              <Field id="sim-time" label={t('simulator.timeLabel')} hint={t('simulator.timeHint')} optional>
                {(aria) => <TextInput {...aria} type="datetime-local" step={1} className="input--date" value={time} onChange={(e) => setTime(e.target.value)} />}
              </Field>
            </details>

            {formError && (
              <InlineAlert tone="danger" role="alert">
                {formError}
              </InlineAlert>
            )}

            <div className="simulator__buttons">
              <Button ref={checkInRef} type="submit" variant="primary" size="lg" icon={LogIn} loading={pendingKind === 'in'} disabled={mutation.isPending && pendingKind !== 'in'}>
                {t('simulator.checkIn')}
              </Button>
              <Button size="lg" icon={LogOut} loading={pendingKind === 'out'} disabled={mutation.isPending && pendingKind !== 'out'} onClick={() => run('out')}>
                {t('simulator.checkOut')}
              </Button>
            </div>
          </form>
        </Panel>
        </div>

        <Panel
          title={t('simulator.resultsTitle')}
          className="simulator__results"
          action={
            results.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={clearSimResults}>
                {t('simulator.clearResults')}
              </Button>
            ) : undefined
          }
        >
          <ResultList results={results} />
        </Panel>
      </div>
    </div>
  );
}

function ResultList({ results }: { results: SimResult[] }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const isFresh = useFresh();
  return (
    <div aria-live="polite" aria-relevant="additions">
      {results.length === 0 ? (
        <EmptyState icon={ScanLine} title={t('simulator.empty.title')} body={t('simulator.empty.body')} />
      ) : (
        <ul className="sim-results">
          {results.map((r) => {
            const meta = r.gate
              ? t('simulator.result.meta', { direction: t(`common.directionLong.${r.kind}`), gate: r.gate })
              : t('simulator.result.metaNoGate', { direction: t(`common.directionLong.${r.kind}`) });
            let tone: 'success' | 'danger' | 'neutral';
            let Icon = CircleCheck;
            let title: string;
            let body: ReactNode;
            if (r.kind === 'in') {
              if (r.res.allowed) {
                tone = 'success';
                title = t('simulator.result.allowed');
                const p = r.res.permit;
                body =
                  r.res.reason === 'DAILY_PERMIT'
                    ? t('simulator.result.reason.DAILY_PERMIT', { name: p?.holderName ?? '', date: p?.validDate ? fmt.calDate(p.validDate) : '' })
                    : t('simulator.result.reason.PERMANENT_PERMIT', { name: p?.holderName ?? '' });
              } else {
                tone = 'danger';
                Icon = CircleX;
                title = t('simulator.result.denied');
                body = (
                  <>
                    {t('simulator.result.reason.NO_VALID_PERMIT')}{' '}
                    {r.res.alarmId && <Link to={`/admin/alarms?status=all&focus=${r.res.alarmId}`}>{t('simulator.result.viewAlarm')}</Link>}
                  </>
                );
              }
            } else {
              tone = 'neutral';
              Icon = LogOut;
              title = t('simulator.result.checkedOut');
              body =
                r.res.sessionId && r.res.durationMinutes !== null
                  ? t('simulator.result.parkedFor', { duration: fmt.duration(r.res.durationMinutes) })
                  : t('simulator.result.noSession');
            }
            return (
              <li key={r.id} className={cx('sim-result', `sim-result--${tone}`, isFresh(r.id) && 'is-fresh')}>
                <div className="sim-result__head">
                  <Icon size={20} aria-hidden="true" className="sim-result__icon" />
                  <p className="sim-result__title">{title}</p>
                  {r.autopilot && (
                    <Badge tone="live" icon={Navigation}>
                      {t('autopilot.badge')}
                    </Badge>
                  )}
                  <time className="sim-result__time tabular" dateTime={r.at}>
                    {fmt.timeSeconds(r.at)}
                  </time>
                </div>
                <div className="sim-result__meta">
                  <PlateChip plate={r.res.plate} size="md" srPrefix />
                  <span className="muted">{meta}</span>
                </div>
                <p className="sim-result__body">{body}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Autopilot panel (UX §5.11 v2): toggle, pace, stats and the "events are real" warning. */
function AutopilotPanel() {
  const { t } = useTranslation();
  const pilot = useAutopilot();
  return (
    <Panel
      title={t('autopilot.title')}
      className="autopilot-panel"
      action={<Switch id="autopilot-toggle" switchFirst label={t('autopilot.toggle')} checked={pilot.on} onChange={() => pilot.toggle()} />}
    >
      <p className="panel-lead">{t('autopilot.lead')}</p>
      <div className="autopilot-panel__row">
        <SegmentedControl<Pace>
          name="autopilot-pace"
          legend={t('autopilot.pace.label')}
          value={pilot.pace}
          onChange={pilot.setPace}
          options={[
            { value: 'calm', label: t('autopilot.pace.calm') },
            { value: 'busy', label: t('autopilot.pace.busy') },
          ]}
        />
        <p className="autopilot-panel__stats" aria-live="polite">
          {pilot.on || pilot.sent ? t('autopilot.stats', { events: pilot.sent, alarms: pilot.alarms }) : t(`autopilot.pace.${pilot.pace}Hint`)}
        </p>
      </div>
      <InlineAlert tone="warning" size="sm">
        {t('autopilot.warning')}
      </InlineAlert>
    </Panel>
  );
}
