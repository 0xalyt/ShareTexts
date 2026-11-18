import { createRoot } from 'react-dom/client';
import '../index.css';
import { I18nProvider } from '../lib/i18n';
import { FilmStage } from './FilmStage';
import { BragStage } from './BragStage';

const root = document.getElementById('film-root');
if (!root) throw new Error('film-root missing');

/* `?mode=brag` renders the launch cut; the default is the desk film. Keeping
   one entry means the rig's deterministic hook is identical for both. */
const mode = new URLSearchParams(window.location.search).get('mode');

createRoot(root).render(
  <I18nProvider>
    {mode === 'brag' ? <BragStage /> : <FilmStage />}
  </I18nProvider>,
);
