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
    '手機到電腦，或電腦到手機。無需安裝應用程式，無需註冊帳號。照片與檔案以原始畫質傳送。關閉分頁，一切即消失。',
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
};

export default zhHant;
