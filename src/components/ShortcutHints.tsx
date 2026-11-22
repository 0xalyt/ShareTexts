import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';

/** A transient reminder, not another permanent label around the composer. */
export function ShortcutHints() {
  const { t } = useI18n();
  const [modifier, setModifier] = useState('');
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      setModifier(event.ctrlKey || event.metaKey ? (event.metaKey ? '⌘' : 'Ctrl+') : '');
    };
    const clear = () => setModifier('');
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
      window.removeEventListener('blur', clear);
    };
  }, []);
  if (!modifier) return null;
  return <div aria-hidden="true" data-testid="shortcut-hints" className="pointer-events-none absolute bottom-full inset-x-0 mb-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-apple-ink-muted dark:text-white/70">
    <span><kbd>{modifier}V</kbd> · {t('composer.teach.paste')}</span>
    <span><kbd>↵</kbd> · {t('composer.send')}</span>
  </div>;
}
