/**
 * The header's search chip, on its own.
 *
 * It used to live beside the palette in `CommandBar.tsx`, which meant the
 * landing header — visible on every visit — statically imported the entire
 * command palette and its dependencies into the entry chunk. The chip is 6
 * lines; the palette is 6 KB gzip and only exists after a keypress or a click.
 * Splitting them lets the palette load on demand without changing either one.
 */
import { AlloSymbol } from './AlloSymbol';
import { IconButton3D } from './IconButton3D';
import { useI18n } from '../lib/i18n';

export function CommandBarChip({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  // The chip uses the same quiet 40px icon slot as the other header actions.
  return (
    <IconButton3D label={t('command.openAria')} onClick={onClick} className="hidden lg:flex">
      <AlloSymbol name="search" size={18} />
    </IconButton3D>
  );
}
