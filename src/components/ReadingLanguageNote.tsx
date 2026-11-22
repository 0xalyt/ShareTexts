import React from 'react';
import { useI18n } from '../lib/i18n';

export function ReadingLanguageNote() {
  const { lang, dir, t } = useI18n();
  if (lang === 'en') return null;
  return <p lang={lang} dir={dir} className="reading-language-note" data-testid="reading-language-note">{t('reading.englishOnly')}</p>;
}
