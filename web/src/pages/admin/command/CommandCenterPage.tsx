import { Maximize } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/Button';
import { cx } from '../../../lib/cx';
import { useNow } from '../../../lib/hooks';
import { useFmt } from '../../../lib/timezone';
import { useWall } from '../../../live/Wall';
import { GateFeed } from './GateFeed';
import { KpiTiles } from './KpiTiles';
import { LotMap } from './LotMap';
import { OccupancyGauge } from './OccupancyGauge';
import { OpenAlarms } from './OpenAlarms';
import { consumeBoot } from './shared';
import { Timeline } from './Timeline';

/** `/admin` — the command center (UX §5.6), replacing the v1 dashboard. */
export default function CommandCenterPage() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const now = useNow();
  const wall = useWall();
  const [booting, setBooting] = useState(consumeBoot);

  useEffect(() => {
    if (!booting) return;
    const id = window.setTimeout(() => setBooting(false), 1_400);
    return () => window.clearTimeout(id);
  }, [booting]);

  return (
    <div className="page page--cc">
      {!wall.wall && (
        <header className="page-head">
          <div>
            <h1>{t('dashboard.title')}</h1>
            <p>{fmt.dateLong(now.toISOString())}</p>
          </div>
          {wall.available && (
            <div className="page-head__actions">
              <Button variant="primary" icon={Maximize} onClick={wall.enter}>
                {t('strip.wallEnter')}
              </Button>
            </div>
          )}
        </header>
      )}
      {wall.wall && <h1 className="sr-only">{t('dashboard.title')}</h1>}
      <section className={cx('cc', booting && 'is-booting')} aria-label={t('dashboard.title')}>
        <KpiTiles booting={booting} />
        <OccupancyGauge index={5} booting={booting} />
        <LotMap index={6} />
        <GateFeed index={7} />
        <Timeline index={8} booting={booting} />
        <OpenAlarms index={9} />
      </section>
    </div>
  );
}
