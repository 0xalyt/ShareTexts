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
  'footer.devices': 'Os seus dispositivos',
  'demo.s7': 'Feche a sala quando terminar.',
  'home.faq.a6': 'As salas em direto são encriptadas em trânsito. O serviço emite o segredo da sala, pelo que não é um sistema de conhecimento zero. Os Espaços temporários guardam textos e ligações no servidor até serem fechados ou expirarem. Os itens guardados ficam no navegador. Consulte a política de privacidade.',
  'home.faq.a1': 'Mova textos, ligações, fotografias e ficheiros entre os seus dispositivos. Use uma sala em direto para enviar no momento, ou um Espaço temporário para recolher textos e ligações mais tarde.',
  'app.ended.sub': 'Não precisa de conta. Os itens guardados ficam neste navegador.',
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
    'Textos, ligações, fotografias e ficheiros. Abra esta página nos dois dispositivos.',
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
};

export default ptPT;
