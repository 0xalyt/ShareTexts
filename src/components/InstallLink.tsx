import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';
import { hasInstallPrompt, initInstallCapture, isSnoozedOrMuted, isStandalone, promptInstall } from '../lib/pwaInstall';

/**
 * InstallLink — the quiet, permanent way to install.
 *
 * The nudge is the ask; this is the answer for people who said "not now" and
 * then changed their mind. It only exists when the browser can actually do it
 * (a real `beforeinstallprompt` is parked) and never inside the installed app,
 * so it can't be an empty promise or a permanent piece of furniture. No
 * instruction text for iOS here — a footer is the wrong place to teach a
 * two-step gesture, and the nudge already does it in context.
 */
export function InstallLink({ className }: { className?: string }) {
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    initInstallCapture();
    if (isStandalone() || isSnoozedOrMuted()) return;
    const sync = () => setAvailable(hasInstallPrompt() && !isStandalone());
    sync();
    window.addEventListener('sharetext:installable', sync);
    window.addEventListener('sharetext:installed', sync);
    return () => {
      window.removeEventListener('sharetext:installable', sync);
      window.removeEventListener('sharetext:installed', sync);
    };
  }, []);

  if (!available) return null;

  return (
    <button
      type="button"
      data-testid="footer-install"
      onClick={async () => {
        const shown = await promptInstall();
        if (!shown) setAvailable(false);
      }}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-apple-ink-muted transition-colors',
        'hover:text-apple-ink dark:text-white/60 dark:hover:text-white',
        className,
      )}
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      {t('install.cta')}
    </button>
  );
}
