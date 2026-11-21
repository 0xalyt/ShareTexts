// STATUS: draft
//
// Traditional Chinese (Taiwan / Hong Kong / Macao). This file is a VARIANT: it
// inherits Simplified (zh-Hans) and overrides what differs — the character
// forms, plus the local vocabulary where Taiwan and Hong Kong do not use the
// mainland word (檔案 for 文件, 裝置 for 设备, 網路 for 网络, 分頁 for 标签页).
//
// Everything not listed here still comes from Simplified, which a Traditional
// reader can read but should not have to. That is exactly why the Language
// sheet labels this locale a draft: promotion (STATUS → 'reviewed') is the
// owner's call, once a native reader has walked the checklist in
// docs/redesign/translation-review.md.
import type { MsgKey } from './types';

export const STATUS = 'draft' as const;

const zhHant: Partial<Record<MsgKey, string>> = {
  'reading.englishOnly': "此頁面目前僅提供英文版本。",
  'nav.docs': '說明文件',
  'nav.about': '關於',
  'nav.privacy': '隱私',
  'nav.terms': '條款',
  'nav.guides': '指南',
  'footer.useIt': '開始使用',
  'footer.read': '閱讀',
  'footer.legal': '法律資訊',
  'footer.open': '開啟 ShareTexts',
  'footer.withCode': '使用代碼分享',
  'footer.devs': '開發者資訊',
  'footer.report': '回報問題',
  'footer.noApp': '無需安裝應用程式',
  'footer.noAccount': '無需帳號',
  'footer.followAria': '在 X 上關注',
  'footer.language': '語言',
  'footer.devices': '你的裝置',
  'demo.s7': '用完後關閉房間。',
  'home.faq.a6': '即時房間在傳輸過程中加密。服務會簽發房間密鑰，因此並非零知識系統。臨時空間的文字和連結會儲存在伺服器上，直到空間關閉或到期。已儲存的項目保留在瀏覽器中。詳情請參閱隱私政策。',
  'home.faq.q6': '隱私和安全有保障嗎？',
  'home.faq.a1': '在自己的裝置間傳送文字、連結、照片和檔案。即時傳送用即時房間，稍後取得文字和連結用臨時空間。',
  'app.ended.sub': '無需帳號。已儲存的項目保留在此瀏覽器中。',
  'film.download': "下載影片",
  'film.from': "從一個螢幕",
  'film.to': "到另一個螢幕。",
  'film.title': "ShareTexts 產品短片",
  'film.label': "為分享而生。",
  'film.summary': "開啟房間。連接裝置。直接傳送。",
  'film.play': "播放短片",
  'film.pause': "暫停短片",
  'film.watch': "觀看短片",
  // home
  'home.send': '傳送',
  'home.receive': '接收',
  'home.subheading': '人人可用的 AirDrop，來了',
  'home.subtitle':
    '文字、連結、照片和檔案。在兩台裝置上開啟本頁即可。',
  'home.how.1': '在兩台裝置上開啟 ShareTexts。',

  // files
  'attach.files': '檔案',
  'attach.filesHint': '選擇任何檔案',
  'chat.fileReceived': '收到檔案：{name}',
  'space.addFile': '檔案',
  'space.download': '下載',
  'saved.download': '下載',
  'saved.copyUrl': '複製連結',
  'space.copyLink': '複製連結',

  // saved items
  'saved.title': '已儲存項目',
  'nav.saved': '已儲存項目',
  'saved.emptyTitle': '留下你想再次找到的東西。',

  // composer and room
  'composer.placeholder': '拖放任何內容 — 文字、連結、照片、檔案…',
  'room.title': '房間',
  'picker.open': '選擇裝置',

  // settings
  'settings.language': '語言',
  'settings.theme': '外觀',

  // states
  'toast.connected': '已連線，可以傳送了。',
  'err.generic': 'ShareTexts 無法連線。請檢查網路後重試。',
  'install.later': '暫時不用',

  // actions
  'action.save': '儲存',
  'action.copy': '複製',
  'msg.copy': '複製',
  // Landing: open a second browser and explore an expiring example.
  "home.browser.heading": "瀏覽器不同。傳遞一樣簡單。",
  "home.browser.body": "不需使用相同的瀏覽器。在兩台裝置上開啟 ShareTexts 即可。",
  "home.browser.open": "在另一台裝置上開啟",
  "home.browser.qr": "顯示網站 QR 碼",
  "home.browser.qrHint": "掃碼開啟此頁面，然後使用房間代碼連線。",
  "home.browser.copyFailed": "選取並複製網址，或掃描 QR 碼。",
  "home.space.storage": "空間使用暫存伺服器儲存。請只與信任的人分享代碼。",
  "home.space.preview": "互動式預覽。不會儲存任何內容。",
  "home.space.open": "開放期間",
  "home.space.closed": "到期之後",
  "home.space.example": "週末計畫",
  "home.space.note": "火車09:30出發。出發前喝杯咖啡？",
  "home.browser.hideQr": "隱藏網站 QR 碼",

  // Hop — linked devices (My devices)
  "hop.title": "我的裝置",
  "hop.row.hint": "連結一次，隨時傳送",
  "hop.row.new": "{count} 則新內容",
  "hop.intro.title": "把你的裝置連結一次",
  "hop.intro.body": "之後你傳送的內容，會在另一台裝置下次開啟 ShareTexts 時等著它。傳送時它可以是關閉或離線的。",
  "hop.intro.show": "顯示 QR 碼供掃描",
  "hop.intro.scan": "改為掃描 QR 碼",
  "hop.intro.note": "不需要帳號。每項內容在離開這台裝置前就已加密，伺服器只保存這份加密副本，最多 30 天。",
  "hop.invite.title": "用另一台裝置掃描",
  "hop.invite.body": "用它的相機掃描。它會開啟 ShareTexts 並把兩台裝置連結起來。",
  "hop.invite.copy": "改為複製連結",
  "hop.invite.waiting": "正在等待另一台裝置…",
  "hop.invite.left": "{time} 內有效",
  "hop.invite.expired": "這個 QR 碼已過期。",
  "hop.invite.again": "產生新的 QR 碼",
  "hop.confirm.title": "兩個螢幕上是同樣的四個嗎？",
  "hop.confirm.body": "看看另一台裝置。如果它依同樣的順序顯示這四個，那它確實是你的裝置。",
  "hop.confirm.yes": "一致",
  "hop.confirm.no": "不一樣",
  "hop.join.title": "即將連結",
  "hop.join.body": "確認另一台裝置顯示的也是這四個，然後在那台裝置上確認。",
  "hop.join.starting": "正在連結…",
  "hop.scan.title": "掃描 QR 碼",
  "hop.scan.body": "把相機對準另一台裝置上的 QR 碼。",
  "hop.linked": "已連結。隨時傳送任何內容。",
  "hop.devices.unnamed": "其他裝置",
  "hop.devices.add": "再連結一台",
  "hop.empty.title": "這裡還沒有內容",
  "hop.empty.body": "在下方輸入或貼上。你的其他裝置下次開啟 ShareTexts 時就能看到。",
  "hop.composer.placeholder": "文字或連結",
  "hop.composer.attach": "加入檔案",
  "hop.send": "傳送",
  "hop.state.queued": "正在等待網路連線",
  "hop.state.sending": "正在傳送…",
  "hop.state.sent": "正在等待你的另一台裝置",
  "hop.state.delivered": "已送達",
  "hop.state.failed": "未傳送",
  "hop.from": "來自 {device}",
  "hop.withdraw": "收回",
  "hop.autocopy.ask": "下次自動複製來自你裝置的文字嗎？",
  "hop.autocopy.yes": "開啟",
  "hop.autocopy.no": "不用了",
  "hop.autocopy.done": "已為你複製",
  "hop.unlink": "取消連結這台裝置",
  "hop.unlink.hint": "會從這台裝置移除連結和已收到的內容。你的其他裝置會保留各自的副本。",
  "hop.err.unsupported": "這個瀏覽器無法記住已連結的裝置，通常是因為處於無痕模式。傳送和接收仍可使用。",
  "hop.err.offline": "沒有網路連線。請檢查網路後重試。",
  "hop.err.expired": "這個 QR 碼已過期。請在另一台裝置上產生新的。",
  "hop.err.used": "這個 QR 碼已被使用。請在另一台裝置上產生新的。",
  "hop.err.mismatch": "兩台裝置不一致，連結已停止。沒有分享任何內容。請用新的 QR 碼重試。",
  "hop.err.already": "這台裝置已經連結過了。要加入另一台，請在這裡顯示 QR 碼，再從那台裝置掃描。",
  "hop.err.full": "這組裝置已滿。",
  "hop.err.tooBig": "這個檔案超過 {size}。大型檔案請在兩台裝置都開啟時使用「傳送」。",
  "hop.err.storage": "這台裝置的空間不足。",
  "hop.err.unknown": "沒有成功。請重試。",
};

export default zhHant;
