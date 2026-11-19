import { createRoot } from 'react-dom/client';
import '../index.css';
import { I18nProvider } from '../lib/i18n';
import { FilmStage } from './FilmStage';

const root = document.getElementById('film-root');
if (!root) throw new Error('film-root missing');

/* `?mode=brag` renders the 15 s launch cut (FilmStage's LAUNCH_SHOTS); the
   default is the 32 s desk film and `?mode=loop` is the old hero loop. One
   entry means the rig's deterministic hook is identical for every cut, and the
   launch cut is the same set and the same app as the film it came from. */
createRoot(root).render(
  <I18nProvider>
    <FilmStage />
  </I18nProvider>,
);
