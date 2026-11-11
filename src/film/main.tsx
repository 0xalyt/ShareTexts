import { createRoot } from 'react-dom/client';
import '../index.css';
import { I18nProvider } from '../lib/i18n';
import { FilmStage } from './FilmStage';

const root = document.getElementById('film-root');
if (!root) throw new Error('film-root missing');
createRoot(root).render(
  <I18nProvider>
    <FilmStage />
  </I18nProvider>,
);
