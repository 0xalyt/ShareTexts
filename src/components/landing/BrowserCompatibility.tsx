import { useI18n } from '../../lib/i18n';

const BROWSERS = [
  ['chrome', 'Chrome'], ['safari', 'Safari'], ['firefox', 'Firefox'],
  ['edge', 'Edge'], ['brave', 'Brave'], ['samsung-internet', 'Samsung Internet'],
] as const;

/** Compatibility, not endorsements. Keep every browser readable at rest:
 * no decorative loop, duplicated content or motion controls to learn. */
export function BrowserCompatibility() {
  const { t } = useI18n();
  return (
    <section className="landing-browsers w-full" aria-labelledby="browsers-title">
      <p id="browsers-title">{t('home.browsers')}</p>
      <ul className="landing-browser-list">
        {BROWSERS.map(([slug, name]) => <li key={slug}>
          <img src={`/browsers/${slug}.svg`} width="28" height="28" loading="lazy" decoding="async" alt="" />
          <span>{name}</span>
        </li>)}
      </ul>
    </section>
  );
}
