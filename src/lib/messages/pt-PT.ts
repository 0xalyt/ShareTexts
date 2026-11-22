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
  "home.roomsMade": "salas criadas",
  "home.activity.title": "Atividade das salas",
  "home.three.heading": "Um código liga os seus dispositivos.",
  "home.later.heading": "Textos e ligações para mais tarde.",
  "home.faq.heading": "Antes de enviar",
  "home.faq.more": "Ler o guia",
  "home.faq.q2": "Os dois dispositivos têm de estar online?",
  "home.faq.a2": "Para Enviar e Receber, mantenha o ShareTexts aberto nos dois dispositivos. Para deixar textos e ligações para mais tarde, use um Espaço temporário.",
  "home.faq.a7": "Texto, ligações e qualquer tipo de ficheiro, incluindo fotografias, vídeos, PDF e arquivos comprimidos. Os ficheiros mantêm a qualidade original.",
  "receive.note": "O código muda a cada 90 segundos. Se deixar de funcionar, use o código atual do outro dispositivo.",
  "qr.scan.typeCode": "Introduzir código",
  "chat.empty.dest": "Enviar para {name}",
  "chat.empty.body": "Escreva uma nota, cole uma ligação ou adicione um ficheiro abaixo.",
  "chat.empty.title": "Tudo pronto para partilhar",
  "saved.emptyBody": "Toque no marcador de uma mensagem para guardar aqui um texto, ligação, fotografia ou ficheiro.",
  "saved.emptyCta": "Percebi",
  "details.relay": "Ligado através do servidor.",
  "nearby.hint": "Abra o ShareTexts e ative o Nearby no outro dispositivo.",
  "nearby.autoHint": "Volta a ligar dispositivos já emparelhados. Os novos precisam da sua aprovação.",
  "nearby.hiddenTitle": "Tornar este dispositivo visível",
  "nearby.hiddenHint": "Os outros dispositivos na sua rede ainda não conseguem encontrar este.",
  "space.showQr": "Mostrar código QR",
  "space.hideQr": "Ocultar código QR",
  'space.createSub': 'Um espaço partilhado para este dispositivo e os que convidar. Fecha-se automaticamente.',
  'space.defaultName': 'Espaço partilhado',
  'space.empty': 'Comece com uma nota',
  'space.emptyTextHint': 'Ou cole uma ligação abaixo. Todos neste espaço podem adicionar conteúdo.',
  'space.composerPlaceholder': 'Adicionar nota…',
  'reading.englishOnly': "Esta página está atualmente disponível apenas em inglês.",
  'footer.devices': 'Os seus dispositivos',
  'demo.s7': 'Feche a sala quando terminar.',
  "home.faq.a6": "As salas em direto são encriptadas durante o envio. O ShareTexts fornece as chaves da sala. Os Espaços temporários guardam textos e ligações no servidor até serem fechados ou expirarem. Os itens guardados ficam no seu navegador. Consulte a política de privacidade.",
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
  "home.subtitle": "Textos, ligações, fotografias, vídeos e ficheiros. Sem aplicação nem conta.",
  'home.how.1': 'Abra o ShareTexts nos dois dispositivos.',

  // files and what you do with them
  'attach.files': 'Ficheiros',
  'attach.filesHint': 'Escolher qualquer ficheiro',
  'chat.fileReceived': 'Ficheiro recebido: {name}',
  'space.addFile': 'Ficheiro',
  'space.download': 'Transferir',
  'saved.download': 'Transferir',
  'saved.copyUrl': 'Copiar ligação',
  "space.copyLink": "Copiar ligação de convite",

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
  'action.download': 'Transferir',
  'action.copy': 'Copiar',
  'msg.copy': 'Copiar',
  // Landing: open a second browser and explore an expiring example.
  "home.browser.heading": "Funciona em todos os navegadores modernos",
  "home.browser.body": "Não precisam de ser iguais. Basta abrir o ShareTexts nos dois.",
  "home.browser.open": "Abrir no seu outro dispositivo",
  "home.browser.qr": "Mostrar QR do site",
  "home.browser.qrHint": "Leia o QR para abrir esta página. Depois, ligue com um código de sala.",
  "home.browser.copyFailed": "Selecione e copie o endereço ou leia o QR.",
  "home.space.storage": "Os espaços usam armazenamento temporário no servidor. Partilhe o código apenas com pessoas de confiança.",
  "home.space.preview": "Pré-visualização interativa. Nada é guardado.",
  "home.space.open": "Enquanto aberto",
  "home.space.closed": "Após expirar",
  "home.space.expired": "Expirado",
  "home.space.example": "Planos para o fim de semana",
  "home.space.note": "Comboio às 09:30. Um café antes de sair?",
  "home.browser.hideQr": "Ocultar QR do site",

  // Hop — linked devices (My devices)
  "hop.title": "Os meus dispositivos",
  "hop.row.hint": "Associe uma vez, envie quando quiser",
  "hop.intro.title": "Envie para os seus dispositivos, mesmo sem ligação",
  "hop.intro.body": "Associe dois dispositivos uma vez com um código QR. O que enviar fica à espera de que o outro abra o ShareTexts.",
  "hop.intro.show": "Mostrar código QR",
  "hop.intro.scan": "Ler código QR",
  "hop.intro.note": "Sem conta. Cada item é encriptado neste dispositivo antes de sair, e o servidor guarda apenas essa cópia encriptada, no máximo 30 dias.",
  "hop.invite.title": "Leia isto com o seu outro dispositivo",
  "hop.invite.body": "Use a câmara dele. Abre o ShareTexts e associa os dois.",
  "hop.invite.copy": "Copiar a ligação",
  "hop.invite.waiting": "A aguardar o outro dispositivo…",
  "hop.confirm.title": "Os mesmos quatro nos dois ecrãs?",
  "hop.confirm.body": "Olhe para o seu outro dispositivo. Se mostrar estes quatro por esta ordem, é mesmo o seu.",
  "hop.join.title": "Quase associado",
  "hop.join.body": "Verifique que o seu outro dispositivo mostra estes quatro e confirme lá.",
  "hop.join.starting": "A associar…",
  "hop.scan.title": "Ler um código QR",
  "hop.scan.body": "No outro dispositivo, escolha Mostrar código QR. Aponte esta câmara para ele.",
  "hop.linked": "Associado. Envie o que quiser, quando quiser.",
  "hop.devices.add": "Associar outro",
  "hop.empty.body": "Escreva ou cole abaixo. Estará nos seus outros dispositivos da próxima vez que abrirem o ShareTexts.",
  "hop.composer.placeholder": "Texto ou ligação",
  "hop.composer.attach": "Adicionar um ficheiro",
  "hop.state.queued": "A aguardar ligação",
  "hop.state.sending": "A enviar…",
  "hop.state.sent": "A aguardar o seu outro dispositivo",
  "hop.autocopy.done": "Copiado para si",
  "hop.unlink": "Desassociar este dispositivo",
  "hop.unlink.hint": "Remove a associação e o que foi recebido neste dispositivo. Os seus outros dispositivos mantêm as cópias deles.",
  "hop.err.unsupported": "Este navegador não consegue lembrar dispositivos associados, normalmente por causa do modo privado. Enviar e Receber continuam a funcionar.",
  "hop.err.offline": "Sem ligação. Verifique a rede e tente de novo.",
  "hop.err.mismatch": "A associação foi interrompida porque os dois dispositivos não coincidiram. Nada foi partilhado. Tente de novo com um código novo.",
  "hop.err.already": "Este dispositivo já está associado. Para adicionar o outro, mostre um código aqui e leia-o a partir de lá.",
  "hop.err.tooBig": "Esse ficheiro ultrapassa {size}. Para ficheiros grandes use Enviar, com os dois dispositivos abertos.",
};

export default ptPT;
