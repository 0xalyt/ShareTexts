import { useI18n } from '../lib/i18n';

/** One complete promise, at rest in every motion preference. */
export function ShuffleHeading({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <h1 className={`landing-heading st-display text-[clamp(34px,8.8vw,46px)] leading-[1.08] text-apple-ink dark:text-white ${className ?? ''}`}>
      {t('home.title').replace(/\n/g, ' ')}
    </h1>
  );
}

export default ShuffleHeading;
