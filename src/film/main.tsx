import { createRoot } from 'react-dom/client';
import '../index.css';
import { I18nProvider } from '../lib/i18n';
import { FilmStage } from './FilmStage';
import { HeroCut } from './HeroCut';
import { LaunchFilm } from './LaunchFilm';

const root = document.getElementById('film-root');
if (!root) throw new Error('film-root missing');

/* `?mode=brag` renders the 15 s launch cut (FilmStage's LAUNCH_SHOTS); the
   default is the 32 s desk film and `?mode=loop` is the old hero loop. One
   entry means the rig's deterministic hook is identical for every cut, and the
   launch cut is the same set and the same app as the film it came from. */
/* `?mode=hero` renders the simplified hero cut (HeroCut): the same two
   devices, no lit desk, four movements. That is what the site's hero plays. */
const hero = /(?:^|[?&])mode=hero(?:&|$)/.test(window.location.search);
const launch = new URLSearchParams(window.location.search).get('mode') === 'launch';
// The white studio film uses the same product palette regardless of the OS.
if (launch) {
  document.documentElement.classList.remove('dark');
  document.documentElement.style.background = '#fff';
  document.body.style.background = '#fff';
}

createRoot(root).render(
  <I18nProvider>{launch ? <LaunchFilm /> : hero ? <HeroCut /> : <FilmStage />}</I18nProvider>,
);
