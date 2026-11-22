import { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { endpointSelectionSettled, takeBootStats } from '../../lib/socket';

// The transport already reads /stats to select its endpoint. Reuse that
// response: this section must add no requests, polling or DO traffic. Keep
// the same promise across StrictMode and responsive layout remounts.
let snapshot: Promise<number | null> | undefined;
function roomCount() {
  return snapshot ??= endpointSelectionSettled().then(() => {
    const count = takeBootStats()?.roomsCreated;
    return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null;
  }).catch(() => null);
}

export function LandingActivity() {
  const { t, lang } = useI18n();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    void roomCount().then(value => { if (active) setCount(value); });
    return () => { active = false; };
  }, []);

  // No invented floor, optimistic connection bump, or cached-as-live badge.
  // A missing/invalid total is absent, while a real zero is still a total.
  if (count === null) return null;
  return (
    <section className="landing-activity" aria-label={t('home.activity.title')} data-testid="landing-activity">
      <p><strong><bdi>{new Intl.NumberFormat(lang).format(count)}</bdi></strong><span>{t('home.roomsMade')}</span></p>
    </section>
  );
}
