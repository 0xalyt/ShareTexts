// STATUS: draft
//
// European Portuguese. This file is a VARIANT: it inherits pt-BR and overrides
// only where Portugal and Brazil genuinely disagree — ficheiro/arquivo,
// transferir/baixar, ligação/link, ligar/conectar, telemóvel/celular, and the
// second-person register (Portugal uses "você" sparingly and prefers the
// impersonal or "o utilizador" phrasing where Brazil says "você").
//
// Everything not listed here still comes from pt-BR. That is why the Language
// sheet labels this locale as a draft: a reader must never be told a variant
// was checked by a native speaker when it was not. Promotion is one line —
// change STATUS to 'reviewed' — and it is the owner's call.
import type { MsgKey } from './types';

export const STATUS = 'draft' as const;

const ptPT: Partial<Record<MsgKey, string>> = {
  'film.download': "Descarregar o filme",
  'film.from': "De um ecrã",
  'film.to': "para o outro.",
  'film.title': "O filme do ShareTexts",
  'film.label': "Feito para partilhar.",
  'film.summary': "Abra uma sala. Ligue os seus dispositivos. Envie o que quiser.",
  'film.play': "Reproduzir filme",
  'film.pause': "Pausar filme",
  'film.watch': "Ver o filme",
  // mouth: the home screen
  'home.subheading': 'Chegou o AirDrop para todos',
  'home.subtitle':
    'Do telemóvel para o portátil, ou do portátil para o telemóvel. Nada para instalar, nenhuma conta. As fotografias e os ficheiros chegam na qualidade original.',
  'home.how.1': 'Abra o ShareTexts nos dois dispositivos.',

  // files and what you do with them
  'attach.files': 'Ficheiros',
  'attach.filesHint': 'Escolher qualquer ficheiro',
  'chat.fileReceived': 'Ficheiro recebido: {name}',
  'space.addFile': 'Ficheiro',
  'space.download': 'Transferir',
  'saved.download': 'Transferir',
  'saved.copyUrl': 'Copiar ligação',
  'space.copyLink': 'Copiar ligação',

  // saved items
  'saved.title': 'Itens guardados',
  'nav.saved': 'Itens guardados',
  'saved.emptyTitle': 'Guarde o que quer voltar a encontrar.',

  // composer and room
  'composer.placeholder': 'Arraste qualquer coisa — texto, ligação, fotografia, ficheiro…',
  'room.title': 'Sala',
  'picker.open': 'Escolher dispositivos',

  // settings
  'settings.theme': 'Aspeto',

  // states
  'toast.connected': 'Ligado. Já pode enviar.',
  'err.generic': 'Não foi possível ligar. Verifique a ligação à internet e tente novamente.',
  'install.later': 'Agora não',

  // actions
  'action.save': 'Guardar',
  'action.copy': 'Copiar',
  'msg.copy': 'Copiar',
  // Landing: open a second browser and explore an expiring example.
  "home.browser.heading": "Navegadores diferentes. A mesma transferência.",
  "home.browser.body": "Não precisam de ser iguais. Basta abrir o ShareTexts nos dois.",
  "home.browser.open": "Abrir no seu outro dispositivo",
  "home.browser.qr": "Mostrar QR do site",
  "home.browser.qrHint": "Leia o QR para abrir esta página. Depois, ligue com um código de sala.",
  "home.browser.copyFailed": "Selecione e copie o endereço ou leia o QR.",
  "home.space.storage": "Os espaços usam armazenamento temporário no servidor. Partilhe o código apenas com pessoas de confiança.",
  "home.space.preview": "Pré-visualização interativa. Nada é guardado.",
  "home.space.open": "Enquanto aberto",
  "home.space.closed": "Após expirar",
  "home.space.example": "Planos para o fim de semana",
  "home.space.note": "Comboio às 09:30. Um café antes de sair?",
  "home.browser.hideQr": "Ocultar QR do site",
};

export default ptPT;
