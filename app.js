'use strict';
/* keikan — 領収書管理。データはログインした人の Google ドライブ（keikan フォルダ）にだけ保存する。 */

const CID = window.KEIKAN_CLIENT_ID || '';
const DEMO = new URLSearchParams(location.search).has('demo');
const REDIRECT = new URL('./', location.href).href;
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
const DEFAULT_CATS = ['消耗品費', '旅費交通費', '通信費', '会議費', '接待交際費', '新聞図書費', '支払手数料', '地代家賃', '水道光熱費', '外注費', '広告宣伝費', '租税公課', '福利厚生費', '車両費', '保険料', '雑費'];
const PIE = ['#16233F', '#6FB7DE', '#A8853B', '#7B869C', '#D8CFB8', '#3E5C8A', '#C9A656', '#A9D4EC', '#5A6275', '#E6DFCB'];

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const yen = (n) => '¥' + Number(n).toLocaleString('ja-JP');
const ymLabel = (ym) => { const [y, m] = ym.split('-'); return `${y}年${+m}月`; };
const dLabel = (d) => { const p = d.split('-'); return `${+p[1]}月${+p[2]}日`; };
const now = new Date();
const THIS_YEAR = now.getFullYear();
const THIS_YM = `${THIS_YEAR}-${pad(now.getMonth() + 1)}`;
const sum = (a) => a.reduce((s, f) => s + f.amount, 0);
const authErr = () => Object.assign(new Error('auth'), { auth: true });

const ICON = {
  left: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  down: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg>',
  bars: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>',
  pie: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l6 6"/></svg>',
  cam: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  up: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>',
  folder: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h6l2 2h10v11H3z"/></svg>',
  doc: '<svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
  zip: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16v13H4zM4 7l2-3h12l2 3M12 10v6M9.5 13.5L12 16l2.5-2.5"/></svg>',
  move: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h6l2 2h8v10H4zM11 14h6M14.5 11.5L17 14l-2.5 2.5"/></svg>',
  copy: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9h11v11H9zM5 15H4V4h11v1"/></svg>',
  trash: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
};

/* ---------- 状態 ---------- */
const S = {
  ready: false, files: [], tab: 'year', year: THIS_YEAR, ym: THIS_YM, regYear: THIS_YEAR,
  view: null,      // null | {type:'folder', ym} | {type:'detail', ...}
  selecting: false, sel: new Set(), sheet: null,
};

/* ---------- Google ログイン ---------- */
const Auth = {
  token: null, exp: 0,
  valid() { return !!this.token && Date.now() < this.exp - 60000; },
  load() { try { const s = JSON.parse(sessionStorage.getItem('kk_tok')); if (s) { this.token = s.t; this.exp = s.e; } } catch (e) { /* 保存領域が使えなくても動く */ } },
  clear() { this.token = null; this.exp = 0; try { sessionStorage.removeItem('kk_tok'); } catch (e) { /* 同上 */ } },
  // ページごと Google のログイン画面へ移動し、戻ってきた URL からログイン情報を受け取る（iPhone の Safari・ホーム画面アプリでも動く方式）
  login() {
    const state = Math.random().toString(36).slice(2);
    try { sessionStorage.setItem('kk_state', state); } catch (e) { /* 同上 */ }
    const q = new URLSearchParams({ client_id: CID, redirect_uri: REDIRECT, response_type: 'token', scope: 'https://www.googleapis.com/auth/drive.file', include_granted_scopes: 'true', state });
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + q;
  },
  fromHash() {
    if (!/access_token=|error=/.test(location.hash)) return '';
    const h = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    let st = null;
    try { st = sessionStorage.getItem('kk_state'); sessionStorage.removeItem('kk_state'); } catch (e) { /* 同上 */ }
    if (h.get('error') || !h.get('access_token') || (st && h.get('state') !== st)) return 'error';
    this.token = h.get('access_token'); this.exp = Date.now() + (+h.get('expires_in') || 3600) * 1000;
    try { sessionStorage.setItem('kk_tok', JSON.stringify({ t: this.token, e: this.exp })); } catch (e) { /* 同上 */ }
    return 'ok';
  },
};

/* ---------- 保存先：Google ドライブ ---------- */
const props = (m) => ({ keikan: '1', date: m.date, amount: String(m.amount), cat: m.cat, vendor: m.vendor, ym: m.ym, ...(m.kind ? { kind: m.kind } : {}) });
const toRec = (f) => { const p = f.appProperties || {}; return { id: f.id, name: f.name, mime: f.mimeType, date: p.date || '', amount: +p.amount || 0, cat: p.cat || '', vendor: p.vendor || '', ym: p.ym || (p.date || '').slice(0, 7), kind: p.kind || '' }; };
const FIELDS = 'id,name,mimeType,appProperties';

const Drive = {
  folders: {},
  async api(url, opt = {}) {
    if (!Auth.valid()) throw authErr();
    const r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + Auth.token, ...(opt.headers || {}) } });
    if (r.status === 401) { Auth.clear(); throw authErr(); }
    if (!r.ok) throw new Error('drive ' + r.status);
    return r;
  },
  async j(url, opt) { return (await this.api(url, opt)).json(); },
  json(method, body) { return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; },
  async folder(name, parent) {
    const key = parent + '/' + name;
    if (this.folders[key]) return this.folders[key];
    const q = `name='${name}' and mimeType='${FOLDER}' and '${parent}' in parents and trashed=false`;
    const r = await this.j(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)`);
    let id = r.files[0] && r.files[0].id;
    if (!id) id = (await this.j(`${API}/files?fields=id`, this.json('POST', { name, mimeType: FOLDER, parents: [parent] }))).id;
    return (this.folders[key] = id);
  },
  async monthFolder(ym) {
    const root = await this.folder('keikan', 'root');
    const yf = await this.folder(ym.slice(0, 4) + '年', root);
    return this.folder(ymLabel(ym), yf);
  },
  async list() {
    const q = `appProperties has { key='keikan' and value='1' } and trashed=false and mimeType!='${FOLDER}'`;
    let out = [], tok = '';
    do {
      const r = await this.j(`${API}/files?q=${encodeURIComponent(q)}&pageSize=1000&fields=nextPageToken,files(${FIELDS})${tok ? '&pageToken=' + tok : ''}`);
      out = out.concat(r.files.map(toRec)); tok = r.nextPageToken || '';
    } while (tok);
    return out;
  },
  async create(blob, mime, name, m) {
    const fid = await this.monthFolder(m.ym);
    const meta = JSON.stringify({ name, parents: [fid], appProperties: props(m) });
    if (blob.size > 4 * 1024 * 1024) {
      const r = await this.api(`${UPLOAD}/files?uploadType=resumable&fields=${FIELDS}`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime }, body: meta });
      const loc = r.headers.get('Location'); if (!loc) throw new Error('resumable');
      const up = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': mime }, body: blob });
      if (!up.ok) throw new Error('upload ' + up.status);
      return toRec(await up.json());
    }
    const B = 'kk' + Date.now();
    const body = new Blob([`--${B}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${B}\r\nContent-Type: ${mime}\r\n\r\n`, blob, `\r\n--${B}--`]);
    return toRec(await this.j(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + B }, body }));
  },
  async update(rec, name, m) {
    let qs = 'fields=' + FIELDS;
    if (m.ym !== rec.ym) {
      const cur = await this.j(`${API}/files/${rec.id}?fields=parents`);
      qs += `&addParents=${await this.monthFolder(m.ym)}&removeParents=${(cur.parents || []).join(',')}`;
    }
    return toRec(await this.j(`${API}/files/${rec.id}?${qs}`, this.json('PATCH', { name, appProperties: props(m) })));
  },
  async copy(rec, name, ym) {
    const fid = await this.monthFolder(ym);
    return toRec(await this.j(`${API}/files/${rec.id}/copy?fields=${FIELDS}`, this.json('POST', { name, parents: [fid], appProperties: props({ ...rec, ym }) })));
  },
  async trash(rec) { await this.api(`${API}/files/${rec.id}`, this.json('PATCH', { trashed: true })); },
  async download(rec) { return (await this.api(`${API}/files/${rec.id}?alt=media`)).blob(); },
};

/* ---------- 保存先：デモ（端末のメモリだけ。閉じると消える） ---------- */
const Demo = {
  n: 0, blobs: {},
  async list() {
    const y = THIS_YEAR, rows = [
      [`${y}-01-12`, 42000, '外注費', 'サンプル制作'], [`${y}-02-03`, 28000, '地代家賃', 'サンプル不動産'], [`${y}-03-18`, 61000, '広告宣伝費', 'サンプル広告'],
      [`${y}-04-09`, 3300, '消耗品費', 'Amazon'], [`${y}-04-07`, 12480, '旅費交通費', 'JR東日本'], [`${y}-04-05`, 8778, '通信費', 'NTTドコモ'],
      [`${y}-04-03`, 2640, '会議費', 'スターバックス'], [`${y}-04-01`, 4180, '新聞図書費', '丸善'],
    ];
    return rows.map(([date, amount, cat, vendor]) => ({ id: 'd' + (++this.n), name: `${cat}_${amount}.jpg`, mime: 'image/jpeg', date, amount, cat, vendor, ym: date.slice(0, 7) }));
  },
  async create(blob, mime, name, m) { const id = 'd' + (++this.n); this.blobs[id] = blob; return { id, name, mime, ...m }; },
  async update(rec, name, m) { return { ...rec, name, ...m }; },
  async copy(rec, name, ym) { const id = 'd' + (++this.n); this.blobs[id] = this.blobs[rec.id]; return { ...rec, id, name, ym }; },
  async trash() {},
  async download(rec) {
    if (this.blobs[rec.id]) return this.blobs[rec.id];
    const cv = document.createElement('canvas'); cv.width = 480; cv.height = 640;
    const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 480, 640); c.fillStyle = '#16233F'; c.font = '28px sans-serif';
    c.fillText('見本の領収書', 40, 80); c.fillText(rec.vendor, 40, 140); c.fillText(rec.date, 40, 200); c.fillText(yen(rec.amount), 40, 260);
    return new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.8));
  },
};
const Store = DEMO ? Demo : Drive;

/* ---------- 文字の読み取り（端末内で処理。画像は外部に送らない） ---------- */
const norm = (t) => t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/，/g, ',').replace(/[￥\\]/g, '¥').replace(/[ \t　]+/g, '');
function parseDate(t) {
  // 領収書内の日付候補をすべて拾い、「日付らしい行にあるもの」→「新しいもの」の順で選ぶ。未来日・7年より前は除外。
  const today = new Date(), min = new Date(THIS_YEAR - 7, 0, 1), yy = THIS_YEAR % 100;
  const KEY = /(日付|発行日|領収日|利用日|取引日|注文日|購入日|日時|年月日)/;
  const cands = [];
  const add = (y, mo, d, line) => {
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return;
    if (dt > today || dt < min) return;
    cands.push({ s: `${y}-${pad(mo)}-${pad(d)}`, key: KEY.test(line) ? 1 : 0 });
  };
  for (const line of t.split('\n')) {
    for (const m of line.matchAll(/(20\d{2})[年\/\-.](\d{1,2})[月\/\-.](\d{1,2})/g)) add(+m[1], +m[2], +m[3], line);
    for (const m of line.matchAll(/令和(\d{1,2}|元)年(\d{1,2})月(\d{1,2})/g)) add(2018 + (m[1] === '元' ? 1 : +m[1]), +m[2], +m[3], line);
    for (const m of line.matchAll(/R(\d{1,2})[.\/](\d{1,2})[.\/](\d{1,2})/g)) add(2018 + +m[1], +m[2], +m[3], line);
    for (const m of line.matchAll(/(?<![\d\/.])(\d{2})[\/.](\d{1,2})[\/.](\d{1,2})(?![\d\/.])/g)) if (+m[1] >= 18 && +m[1] <= yy) add(2000 + +m[1], +m[2], +m[3], line);
  }
  if (!cands.length) return '';
  cands.sort((a, b) => b.key - a.key || (a.s < b.s ? 1 : a.s > b.s ? -1 : 0));
  return cands[0].s;
}
function parseAmount(t) {
  const nums = (s, re) => { const o = []; for (const m of s.matchAll(re)) { const v = +(m[1] || m[2]).replace(/[,.]/g, ''); if (v > 0 && v < 1e8) o.push(v); } return o; };
  const ANY = /¥?(\d{1,3}(?:[,.]\d{3})+|\d+)円?/g, MARKED = /¥(\d{1,3}(?:[,.]\d{3})+|\d+)|(\d{1,3}(?:[,.]\d{3})+|\d+)円/g;
  const KEY = /(合計|請求金額|請求額|支払金額|支払い金額|領収金額|総計|お買上計)/;
  const lines = t.split('\n'); let cand = [];
  lines.forEach((l, i) => {
    if (!KEY.test(l) || /小計/.test(l)) return;
    let n = nums(l.slice(l.search(KEY)).replace(KEY, ''), ANY);
    if (!n.length && lines[i + 1]) n = nums(lines[i + 1], ANY);
    cand = cand.concat(n);
  });
  if (!cand.length) cand = nums(t, MARKED);
  return cand.length ? Math.max(...cand) : '';
}
async function ocr(cv) { if (!window.Tesseract) return ''; const r = await Tesseract.recognize(cv, 'jpn'); return (r.data && r.data.text) || ''; }
async function imageCanvas(file) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
  const k = Math.min(1, 2000 / Math.max(src.width, src.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  return cv;
}
async function readReceipt(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  let blob = file, mime = isPdf ? 'application/pdf' : 'image/jpeg', ext = isPdf ? 'pdf' : 'jpg', text = '';
  if (isPdf) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      for (let p = 1; p <= Math.min(3, pdf.numPages); p++) {
        const tc = await (await pdf.getPage(p)).getTextContent();
        text += tc.items.map((i) => i.str + (i.hasEOL ? '\n' : '')).join('') + '\n';
      }
      if (text.replace(/\s/g, '').length < 10) {
        const pg = await pdf.getPage(1), vp = pg.getViewport({ scale: 2 });
        const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        text = await ocr(cv);
      }
    } catch (e) { text = ''; }
  } else {
    const cv = await imageCanvas(file);   // 画像として開けなければここで失敗し、呼び出し元がエラー表示する
    blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
    try { text = await ocr(cv); } catch (e) { text = ''; }
  }
  const t = norm(text);
  return { blob, mime, ext, date: parseDate(t), amount: parseAmount(t) };
}

/* ---------- 共通処理 ---------- */
const inMonth = (ym) => S.files.filter((f) => f.ym === ym).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, '');
function uniqueName(cat, amount, ext, ym, exceptId) {
  const used = new Set(S.files.filter((f) => f.ym === ym && f.id !== exceptId).map((f) => f.name));
  const base = amount > 0 ? `${safe(cat)}_${amount}` : safe(cat);
  const dot = ext ? '.' + ext : '';
  let name = base + dot, i = 0;
  while (used.has(name)) name = `${base}(${++i})${dot}`;
  return name;
}
const extOf = (f) => { const m = f.name.match(/\.([A-Za-z0-9]{1,8})$/); return m ? m[1].toLowerCase() : f.mime === 'application/pdf' ? 'pdf' : /^image\//.test(f.mime) ? 'jpg' : ''; };
const kindOf = (mime) => (mime === 'application/pdf' ? 'pdf' : /^image\/(jpeg|png|gif|webp)$/.test(mime) ? 'image' : 'file');
function customCats() { try { return JSON.parse(localStorage.getItem('kk_cats')) || []; } catch (e) { return []; } }
function allCats() {
  const count = {}; S.files.forEach((f) => { count[f.cat] = (count[f.cat] || 0) + 1; });
  const all = [...new Set([...DEFAULT_CATS, ...customCats(), ...Object.keys(count)])].filter(Boolean);
  return all.map((c, i) => ({ c, i })).sort((a, b) => (count[b.c] || 0) - (count[a.c] || 0) || a.i - b.i).map((x) => x.c);
}
const vendors = () => [...new Set(S.files.map((f) => f.vendor).filter(Boolean))];
const msg = (text) => { S.sheet = { type: 'msg', text }; renderSheet(); };
const busy = (text) => { S.sheet = { type: 'busy', text }; renderSheet(); };
const closeSheet = () => { S.sheet = null; renderSheet(); };
function fail(e) {
  console.error(e);
  if (e && e.auth) { S.sheet = { type: 'login' }; renderSheet(); }
  else msg('通信に失敗しました。\n入力内容は残っています。もう一度お試しください。');
}

/* ---------- 画面 ---------- */
function render() {
  const main = $('#main'), bar = $('#bar');
  if (!S.ready) { bar.innerHTML = ''; main.innerHTML = viewLogin(); return; }
  const v = S.view;
  main.innerHTML = (DEMO ? '<div class="demo" style="margin:-8px -24px 12px">デモ表示（保存されません）</div>' : '') +
    (v ? (v.type === 'detail' ? viewDetail(v) : v.type === 'crop' ? viewCrop(v) : viewFolder(v)) : S.tab === 'year' ? viewYear() : S.tab === 'month' ? viewMonth() : viewRegister());
  if (v && (v.type === 'detail' || v.type === 'crop')) bar.innerHTML = '';
  else if (v && S.selecting) {
    const off = S.sel.size ? '' : 'disabled';
    bar.innerHTML = `<button class="act" data-act="dest" data-mode="move" ${off}>${ICON.move}移動</button><button class="act" data-act="dest" data-mode="copy" ${off}>${ICON.copy}コピー</button><button class="act" data-act="askDelete" ${off}>${ICON.trash}削除</button>`;
  } else {
    const t = (id, icon, label) => `<button data-act="tab" data-tab="${id}" class="${!v && S.tab === id ? 'on' : ''}">${icon}${label}</button>`;
    bar.innerHTML = t('year', ICON.bars, '年間サマリ') + t('month', ICON.pie, '月別サマリ') + t('reg', ICON.cam, '登録');
  }
  if (v && v.type === 'detail') loadPreview(v);
  if (v && v.type === 'crop') mountCrop(v);
}

function viewLogin() {
  if (!CID && !DEMO) return `<div class="login"><h1 class="mincho">keikan</h1><p>Google ログインの設定がまだ済んでいません。config.js にクライアント ID を入れてください。</p><a class="ghost" href="?demo">デモ表示で画面を見る</a></div>`;
  return `<div class="login"><h1 class="mincho">keikan</h1><p>領収書を月ごとに整理し、ZIP にまとめて税理士へ送ります。データはあなたの Google ドライブにだけ保存されます。</p><button class="primary" data-act="login">Google でログイン</button><a class="mute" href="privacy.html" style="text-align:center">プライバシーポリシー</a></div>`;
}

function viewYear() {
  const y = S.year, per = Array.from({ length: 12 }, (_, i) => sum(inMonth(`${y}-${pad(i + 1)}`)));
  const max = Math.max(...per), files = S.files.filter((f) => f.ym.startsWith(y + '-'));
  const top = per.indexOf(max);
  return `<div class="head"><h1 class="mincho">keikan</h1>${DEMO ? '<span class="sub">年間サマリ</span>' : '<button class="textbtn sub" data-act="logout">ログアウト</button>'}</div><div class="rule"></div>
  <div class="switch"><button class="round" data-act="year" data-d="-1" aria-label="前の年">${ICON.left}</button><div class="cur mincho">${y}年</div><button class="round" data-act="year" data-d="1" aria-label="次の年" ${y >= THIS_YEAR ? 'disabled' : ''}>${ICON.right}</button></div>
  <div style="margin-top:24px"><div class="mute">年間合計</div><div class="big mincho">${yen(sum(files))}</div><div class="mute" style="margin-top:6px">領収書 ${files.length}件</div></div>
  <div class="mute" style="margin-top:30px">月別の取引金額</div>
  <div class="bars">${per.map((v, i) => `<button data-act="openMonth" data-ym="${y}-${pad(i + 1)}" aria-label="${i + 1}月 ${yen(v)}"><i style="height:${max ? Math.round(v / max * 100) : 0}%"></i></button>`).join('')}</div>
  <div class="barlab">${per.map((_, i) => `<div>${i + 1}</div>`).join('')}</div>
  ${max ? `<div class="kv"><div>最も多い月　${top + 1}月</div><b>${yen(max)}</b></div>` : '<div class="empty">この年の領収書はまだありません</div>'}`;
}

function viewMonth() {
  const list = inMonth(S.ym), total = sum(list), by = {};
  list.forEach((f) => { by[f.cat] = (by[f.cat] || 0) + f.amount; });
  const cats = Object.entries(by).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  let acc = 0;
  const stops = cats.map(([, v], i) => { const from = acc; acc += v / total * 100; return `${PIE[i % PIE.length]} ${from}% ${acc}%`; }).join(',');
  return `<div class="head"><button class="mincho" style="display:flex;align-items:center;gap:8px;padding:0;border:0;background:transparent;font-size:22px;min-height:44px" data-act="dest" data-mode="month">${ymLabel(S.ym)}${ICON.down}</button><span class="sub">月別サマリ</span></div><div class="rule"></div>
  ${list.length ? `${total > 0 ? `<div class="pie"><div class="disc" role="img" aria-label="カテゴリ別の円グラフ" style="background:conic-gradient(${stops})"></div>
  <div class="legend">${cats.map(([c, v], i) => `<div><i style="background:${PIE[i % PIE.length]}"></i><span>${esc(c)}</span><b>${Math.round(v / total * 100)}%</b></div>`).join('')}</div></div>` : ''}
  <div class="total"><div class="mute">合計　${list.length}件</div><div class="mincho">${yen(total)}</div></div>
  <div class="list">${list.map((f) => rowHtml(f, false)).join('')}</div>` : '<div class="empty">登録なし</div>'}`;
}

const rowHtml = (f, byName) => `<button class="row" data-act="edit" data-id="${f.id}"><span class="d">${f.date ? dLabel(f.date) : ''}</span><span class="t"><b>${esc(byName ? f.name : f.cat)}</b><small>${esc(byName ? f.vendor : f.vendor)}</small></span><span class="a">${yenOr(f.amount)}</span></button>`;

function viewRegister() {
  const y = S.regYear;
  const rows = Array.from({ length: 12 }, (_, i) => 12 - i).map((m) => {
    const ym = `${y}-${pad(m)}`, l = inMonth(ym);
    return `<button class="mrow" data-act="folder" data-ym="${ym}"><b>${m}月</b>${l.length ? `<span class="c">${l.length}件</span><span class="s">${yen(sum(l))}</span>` : '<span class="none">登録なし</span>'}</button>`;
  }).join('');
  return `<div class="head"><h1 class="mincho">登録</h1></div><div class="rule"></div>
  <div class="two"><label class="tile fill" for="cam">${ICON.cam}撮影する</label><label class="tile" for="pick">${ICON.up}写真・ファイルを選ぶ</label></div>
  ${CAN_DIR ? `<label class="tile sm" for="dir" style="margin-top:12px">${ICON.folder}フォルダを選ぶ</label>` : ''}
  <div class="switch" style="margin-top:18px"><button class="round" data-act="regYear" data-d="-1" aria-label="前の年">${ICON.left}</button><div class="cur mincho">${y}年</div><button class="round" data-act="regYear" data-d="1" aria-label="次の年" ${y >= THIS_YEAR ? 'disabled' : ''}>${ICON.right}</button></div>
  <div class="list">${rows}</div>`;
}

function viewFolder(v) {
  const list = inMonth(v.ym), all = list.length > 0 && list.every((f) => S.sel.has(f.id));
  const rows = list.map((f) => S.selecting
    ? `<label class="row"><input type="checkbox" data-chk="${f.id}" ${S.sel.has(f.id) ? 'checked' : ''}><span class="t"><b>${esc(f.name)}</b><small>${f.date ? dLabel(f.date) : ''}　${esc(f.vendor)}</small></span></label>`
    : `<button class="row" data-act="edit" data-id="${f.id}"><span class="t"><b>${esc(f.name)}</b><small>${f.date ? dLabel(f.date) : ''}　${esc(f.vendor)}</small></span><span class="a">${yenOr(f.amount)}</span></button>`).join('');
  return `<div class="head"><div style="display:flex;align-items:center"><button class="iconbtn" data-act="closeFolder" aria-label="戻る">${ICON.left}</button><h1 class="mincho" style="font-size:22px">${ymLabel(v.ym)}</h1></div>
  ${list.length ? `<button class="textbtn" data-act="select">${S.selecting ? '完了' : '選択'}</button>` : ''}</div><div class="rule"></div>
  <button class="primary h48" style="margin-top:18px" data-act="zip" ${list.length ? '' : 'disabled'}>${ICON.zip}ZIP作成</button>
  ${S.selecting ? `<div class="all"><label><input type="checkbox" data-all ${all ? 'checked' : ''}>すべて選択</label><span class="mute">${list.length}件中 ${S.sel.size}件を選択</span></div>`
    : `<div class="two" style="margin-top:12px"><label class="tile sm" for="cam">${ICON.cam}撮影する</label><label class="tile sm" for="pick">${ICON.up}写真・ファイルを選ぶ</label></div>${CAN_DIR ? `<label class="tile sm" for="dir" style="margin-top:12px">${ICON.folder}フォルダを選ぶ</label>` : ''}`}
  <div class="list">${rows || '<div class="empty">登録なし</div>'}</div>`;
}

// 金額はフォルダ・ファイル（写真・PDF以外）のとき任意
const amountOptional = (v) => v.kind === 'folder' || kindOf(v.mime) === 'file';
const yenOr = (n) => (n > 0 ? yen(n) : '—');
function detailOk(v) { return !!(v.date && v.cat && (v.amount > 0 || amountOptional(v))); }
// 保存先：年月フォルダから登録したときはその年月（取引日は関係なし）。それ以外は取引日の年月。
// 修正時は、取引日の年月に入っていた取引だけ取引日に合わせて移し、指定した年月に入れた取引は今の場所のまま。
function destYm(v) {
  if (v.isNew) return v.fixedYm || (v.date || THIS_YM).slice(0, 7);
  const auto = v.orig.ym === (v.orig.date || '').slice(0, 7);
  return auto && v.date ? v.date.slice(0, 7) : v.orig.ym;
}
const destText = (v) => `保存先　${ymLabel(destYm(v))}${v.isNew && v.fixedYm ? '（選んだ年月）' : v.isNew ? '（取引日の年月）' : ''}`;
function detailName(v) {
  if (!(v.cat && (v.amount > 0 || amountOptional(v)))) return '';
  return uniqueName(v.cat, v.amount, v.ext, destYm(v), v.id);
}
function viewDetail(v) {
  const opt = amountOptional(v);
  const miss = (k) => (v.isNew && !v.read[k] && !(k === 'amount' && opt) ? ' miss' : '');
  const hint = (k) => (!v.isNew || (k === 'amount' && opt) ? '' : v.read[k] ? '<div class="hint">読み取った内容です。領収書と同じか確認してください。</div>' : v.kind === 'folder' ? '<div class="hint">フォルダは自動で読み取りません。入力してください。</div>' : v.other ? '<div class="hint">このファイルは自動で読み取りません。入力してください。</div>' : '<div class="hint">読み取れませんでした。入力してください。</div>');
  return `<div class="head"><div style="display:flex;align-items:center"><button class="iconbtn" data-act="closeDetail" aria-label="戻る">${ICON.left}</button><h1 class="mincho" style="font-size:20px">${v.isNew ? '読み取り内容の確認' : '取引詳細'}</h1></div></div><div class="rule"></div>
  <div class="preview" id="preview"><p class="mute">読み込み中…</p></div>
  <div class="mute" style="margin-top:8px;display:flex;justify-content:space-between;gap:12px"><span>保存名　<span id="fname">${esc(detailName(v))}</span></span><a id="openfull" class="full" target="_blank" rel="noopener" hidden>全画面で見る</a></div>
  <div class="field${miss('date')}"><label for="f-date">取引日</label><input id="f-date" type="date" data-f="date" value="${esc(v.date)}" max="${THIS_YEAR + 1}-12-31">${hint('date')}</div>
  <div class="field${miss('amount')}"><label for="f-amount">金額（円）${opt ? '（任意）' : ''}</label><input id="f-amount" type="text" inputmode="numeric" data-f="amount" value="${v.amount ? v.amount : ''}" placeholder="例：3300">${hint('amount')}</div>
  <div class="field"><label id="l-cat">カテゴリ</label><button class="sel" aria-labelledby="l-cat" data-act="cat"><span>${v.cat ? esc(v.cat) : '選んでください'}</span>${ICON.down}</button></div>
  <div class="field"><label for="f-vendor">取引先（任意）</label><input id="f-vendor" type="text" data-f="vendor" list="vendors" maxlength="30" value="${esc(v.vendor)}" placeholder="例：Amazon"><datalist id="vendors">${vendors().map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
  <div style="margin-top:24px"><button class="primary" id="save" data-act="save" ${detailOk(v) ? '' : 'disabled'}>保存する</button>
  <div class="mute" style="text-align:center;margin-top:10px" id="dest">${esc(destText(v))}</div></div>`;
}
async function loadPreview(v) {
  const fail = (e) => { const el = $('#preview'); if (el) el.innerHTML = `<p class="mute">${e && e.auth ? 'ログインし直すと表示されます' : '表示できませんでした'}</p>`; };
  try {
    if (!v.src) v.src = v.blob || await Store.download(v.orig);
    if (!v.url) v.url = URL.createObjectURL(v.src);
    const el = $('#preview'); if (!el || S.view !== v) return;
    if (v.kind === 'folder') {
      const full = $('#openfull'); if (full) { full.href = v.url; full.hidden = false; full.textContent = 'ZIPで開く'; full.download = v.orig ? v.orig.name : 'folder.zip'; }
      const names = window.JSZip ? Object.values((await JSZip.loadAsync(v.src)).files).filter((e) => !e.dir).map((e) => e.name) : [];
      if (S.view !== v || !el.isConnected) return;
      el.innerHTML = `<div class="fileprev">${ICON.folder.replace(/20/g, '40')}<b>${esc(v.orig ? v.orig.name.replace(/\.zip$/i, '') : v.folderName || 'フォルダ')}</b><span class="mute">フォルダ・${names.length}件のファイル</span></div><ul class="flist">${names.slice(0, 100).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
      return;
    }
    const kind = kindOf(v.mime), fname = v.orig ? v.orig.name : (v.blob && v.blob.name) || 'file';
    const full = $('#openfull');
    if (full) { full.href = v.url; full.hidden = false; if (kind === 'file') { full.textContent = 'ファイルを開く'; full.download = fname; } }
    if (kind === 'file') { el.innerHTML = `<div class="fileprev">${ICON.doc}<b>${esc(fname)}</b><span class="mute">このファイルは画面で表示できません。「ファイルを開く」で確認してください。</span></div>`; return; }
    if (kind === 'image') { el.innerHTML = `<img src="${v.url}" alt="領収書の画像" onerror="this.outerHTML='<p class=&quot;mute&quot;>この画像は画面で表示できません。「全画面で見る」で確認してください。</p>'">`; return; }
    if (!window.pdfjsLib) { el.innerHTML = '<p class="mute">「全画面で見る」から開いてください</p>'; return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await v.src.arrayBuffer() }).promise;
    const w = el.clientWidth || 340, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let first = true;
    for (let p = 1; p <= Math.min(pdf.numPages, 10); p++) {
      const pg = await pdf.getPage(p), vp = pg.getViewport({ scale: (w / pg.getViewport({ scale: 1 }).width) * dpr });
      const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
      await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      if (S.view !== v || !el.isConnected) return;
      if (first) { el.innerHTML = ''; first = false; }
      el.appendChild(cv);
    }
  } catch (e) { fail(e); }
}

function renderSheet() {
  const el = $('#sheet'), s = S.sheet;
  if (!s) { el.innerHTML = ''; return; }
  const card = (h) => `<div class="card" role="dialog" aria-modal="true">${h}</div>`;
  if (s.type === 'msg') el.innerHTML = card(`<p>${esc(s.text)}</p><button class="primary h48" data-act="closeSheet">OK</button>`);
  else if (s.type === 'busy') el.innerHTML = card(`<div class="spin"></div><p>${esc(s.text)}</p>`);
  else if (s.type === 'login') el.innerHTML = card(`<p>ログインの有効期限が切れました。\nログインし直してください。保存していない入力内容は消えます。</p><button class="primary h48" data-act="relogin">Google でログイン</button>`);
  else if (s.type === 'confirm') el.innerHTML = card(`<p>${esc(s.text)}</p><div class="btns"><button class="ghost" data-act="closeSheet">キャンセル</button><button class="primary h48" data-act="doDelete">削除する</button></div>`);
  else if (s.type === 'zip') el.innerHTML = card(`<p>${esc(s.file.name)}\nを作成しました。</p>${navigator.canShare && navigator.canShare({ files: [s.file] }) ? '<button class="primary h48" data-act="share">保存先・共有先を選ぶ</button>' : ''}<a class="ghost" href="${s.url}" download="${esc(s.file.name)}">この端末に保存</a><button class="textbtn" data-act="closeSheet">閉じる</button>`);
  else if (s.type === 'dest') {
    const years = []; for (let y = THIS_YEAR; y >= THIS_YEAR - 6; y--) years.push(y);
    const label = { move: 'ここへ移動', copy: 'ここへコピー', month: '表示する' }[s.mode];
    el.innerHTML = card(`<p>${s.mode === 'month' ? '表示する年月' : s.mode === 'move' ? '移動先の年月' : 'コピー先の年月'}</p><div class="btns"><select id="dy" aria-label="年">${years.map((y) => `<option value="${y}" ${y === s.y ? 'selected' : ''}>${y}年</option>`).join('')}</select><select id="dm" aria-label="月">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === s.m ? 'selected' : ''}>${i + 1}月</option>`).join('')}</select></div><div class="btns"><button class="ghost" data-act="closeSheet">キャンセル</button><button class="primary h48" data-act="doDest">${label}</button></div>`);
  } else if (s.type === 'cat') {
    el.innerHTML = card(`<input type="search" id="catq" placeholder="カテゴリを検索・追加" aria-label="カテゴリを検索・追加" maxlength="20"><div class="catlist" id="catlist"></div><button class="textbtn" data-act="closeSheet">キャンセル</button>`);
    renderCats('');
  }
}
function renderCats(q) {
  q = q.trim();
  const list = allCats().filter((c) => c.includes(q));
  $('#catlist').innerHTML = list.map((c) => `<button data-act="pickCat" data-c="${esc(c)}">${esc(c)}</button>`).join('') +
    (q && !allCats().includes(q) ? `<button class="add" data-act="pickCat" data-c="${esc(q)}" data-new="1">「${esc(q)}」を追加</button>` : '');
}

/* ---------- 操作 ---------- */
async function startApp() {
  busy('読み込み中…');
  try { S.files = await Store.list(); S.ready = true; closeSheet(); render(); }
  catch (e) { closeSheet(); if (e.auth) { S.ready = false; render(); } else { render(); msg('読み込みに失敗しました。通信環境を確認して、開き直してください。'); } }
}
async function readCanvas(cv) {
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
  let text = '';
  try { text = await ocr(cv); } catch (e) { text = ''; }
  const t = norm(text);
  return { blob, mime: 'image/jpeg', ext: 'jpg', date: parseDate(t), amount: parseAmount(t) };
}
function openDetail(r, back) {
  S.view = { type: 'detail', isNew: true, back, fixedYm: back && back.type === 'folder' ? back.ym : '', blob: r.blob, mime: r.mime, ext: r.ext, other: !!r.other, kind: r.kind || '', date: r.date, amount: r.amount || 0, cat: '', vendor: '', read: { date: !!r.date, amount: !!r.amount } };
  closeSheet(); render();
  if (!r.other && !r.date && !r.amount) msg('文字が不鮮明なため読み取れませんでした。\n手入力してください。');
}
async function readAndOpen(cv, back) {
  busy('読み取り中…');
  try { openDetail(await readCanvas(cv), back); }
  catch (e) { console.error(e); msg('読み取りに失敗しました。\nもう一度お試しください。'); }
}
const MAX_MB = 50;
const CAN_DIR = 'webkitdirectory' in document.createElement('input') && matchMedia('(pointer: fine)').matches;
async function handleFolder(list) {
  const files = [...list].filter((f) => !/^\.|\/\./.test(f.webkitRelativePath || f.name));   // 隠しファイルは除く
  if (!files.length) { msg('フォルダの中にファイルがありません。'); return; }
  if (files.reduce((a, f) => a + f.size, 0) > MAX_MB * 1024 * 1024) { msg(`フォルダが大きすぎます（合計${MAX_MB}MBまで）。`); return; }
  if (!window.JSZip) { msg('ZIP の部品を読み込めませんでした。\n通信環境を確認して、開き直してください。'); return; }
  S.selecting = false; S.sel.clear();
  busy(`フォルダを読み込み中…（${files.length}件）`);
  try {
    const top = (files[0].webkitRelativePath || '').split('/')[0] || 'フォルダ';
    const z = new JSZip(), paths = [];
    for (const f of files) { const pth = (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name; z.file(pth, f); paths.push(pth); }
    const blob = new File([await z.generateAsync({ type: 'blob' })], top + '.zip', { type: 'application/zip' });
    openDetail({ blob, mime: 'application/zip', ext: 'zip', other: true, kind: 'folder', date: '', amount: 0 }, S.view);
    S.view.folderName = top;
  } catch (e) { console.error(e); msg('フォルダを読み込めませんでした。\nもう一度お試しください。'); }
}
function asFile(file) {
  const ext = extOf({ name: file.name, mime: file.type });
  return { blob: file, mime: file.type || 'application/octet-stream', ext, date: '', amount: 0, other: true };
}
async function handleFile(file) {
  if (!file) return;
  S.selecting = false; S.sel.clear();
  if (file.size > MAX_MB * 1024 * 1024) { msg(`ファイルが大きすぎます（${MAX_MB}MBまで）。`); return; }
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isImg = /^image\//.test(file.type) || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name);
  if (isPdf) {
    busy('読み取り中…');
    try { openDetail(await readReceipt(file), S.view); }
    catch (e) { console.error(e); openDetail(asFile(file), S.view); }
    return;
  }
  if (!isImg) { openDetail(asFile(file), S.view); return; }
  busy('画像を開いています…');
  try {
    const cv = await imageCanvas(file);
    S.view = { type: 'crop', cv, back: S.view, box: { x: 0.06, y: 0.06, w: 0.88, h: 0.88 } };
    closeSheet(); render();
  } catch (e) { console.error(e); openDetail(asFile(file), S.view); }   // 開けない画像形式はファイルのまま保存
}

/* ---------- 切り取り（範囲を選ぶ） ---------- */
function viewCrop() {
  return `<div class="head"><div style="display:flex;align-items:center"><button class="iconbtn" data-act="closeCrop" aria-label="戻る">${ICON.left}</button><h1 class="mincho" style="font-size:20px">範囲を選ぶ</h1></div></div><div class="rule"></div>
  <p class="mute" style="margin:14px 0 0">四隅の丸を動かして、領収書の部分だけを囲んでください。枠の内側を動かすと位置を移せます。</p>
  <div class="stage" id="stage"><div class="cropbox" id="cropbox" data-drag="move"><span data-drag="nw"></span><span data-drag="ne"></span><span data-drag="sw"></span><span data-drag="se"></span></div></div>
  <button class="primary" style="margin-top:18px" data-act="doCrop">この範囲で読み取る</button>
  <button class="textbtn" style="width:100%;margin-top:6px" data-act="noCrop">切り取らずに読み取る</button>`;
}
function mountCrop(v) {
  const st = $('#stage'); if (!st) return;
  const W = $('#main').clientWidth - 48, H = Math.max(240, window.innerHeight * 0.6);
  const k = Math.min(W / v.cv.width, H / v.cv.height);
  st.style.width = Math.round(v.cv.width * k) + 'px'; st.style.height = Math.round(v.cv.height * k) + 'px';
  v.cv.className = 'stagecv'; st.prepend(v.cv);
  placeBox(v);
}
function placeBox(v) {
  const b = $('#cropbox'); if (!b) return;
  Object.assign(b.style, { left: v.box.x * 100 + '%', top: v.box.y * 100 + '%', width: v.box.w * 100 + '%', height: v.box.h * 100 + '%' });
}
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest('[data-drag]'), v = S.view;
  if (!h || !v || v.type !== 'crop') return;
  e.preventDefault();
  drag = { mode: h.dataset.drag, st: $('#stage').getBoundingClientRect(), x0: e.clientX, y0: e.clientY, b0: { ...v.box } };
});
document.addEventListener('pointermove', (e) => {
  if (!drag || !S.view || S.view.type !== 'crop') return;
  e.preventDefault();
  const v = S.view, dx = (e.clientX - drag.x0) / drag.st.width, dy = (e.clientY - drag.y0) / drag.st.height, b = { ...drag.b0 }, MIN = 0.1;
  const clamp = (n, a, z) => Math.min(z, Math.max(a, n));
  if (drag.mode === 'move') { b.x = clamp(b.x + dx, 0, 1 - b.w); b.y = clamp(b.y + dy, 0, 1 - b.h); }
  else {
    let L = b.x, T = b.y, R = b.x + b.w, B = b.y + b.h;
    if (drag.mode.includes('w')) L = clamp(L + dx, 0, R - MIN);
    if (drag.mode.includes('e')) R = clamp(R + dx, L + MIN, 1);
    if (drag.mode.includes('n')) T = clamp(T + dy, 0, B - MIN);
    if (drag.mode.includes('s')) B = clamp(B + dy, T + MIN, 1);
    Object.assign(b, { x: L, y: T, w: R - L, h: B - T });
  }
  v.box = b; placeBox(v);
}, { passive: false });
['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, () => { drag = null; }));

async function eachSelected(text, fn) {
  const targets = S.files.filter((f) => S.sel.has(f.id));
  busy(text);
  try { for (const f of targets) { await fn(f); S.sel.delete(f.id); } S.selecting = false; return true; }
  catch (e) { render(); fail(e); return false; }
}

const actions = {
  login() { Auth.login(); },
  relogin() { Auth.login(); },
  logout() { Auth.clear(); S.ready = false; S.files = []; S.view = null; render(); },
  closeSheet() { if (S.sheet && S.sheet.url) URL.revokeObjectURL(S.sheet.url); closeSheet(); },
  tab(d) { S.tab = d.tab; S.view = null; S.selecting = false; S.sel.clear(); render(); },
  year(d) { S.year += +d.d; render(); },
  regYear(d) { S.regYear += +d.d; render(); },
  openMonth(d) { S.ym = d.ym; S.tab = 'month'; render(); },
  folder(d) { S.view = { type: 'folder', ym: d.ym }; render(); },
  closeFolder() { S.view = null; S.selecting = false; S.sel.clear(); render(); },
  select() { S.selecting = !S.selecting; S.sel.clear(); render(); },
  edit(d) {
    const f = S.files.find((x) => x.id === d.id); if (!f) return;
    S.view = { type: 'detail', isNew: false, id: f.id, orig: f, back: S.view, mime: f.mime, ext: extOf(f), kind: f.kind || '', date: f.date, amount: f.amount, cat: f.cat, vendor: f.vendor, read: {} };
    render();
  },
  closeCrop() { S.view = S.view.back || null; render(); },
  doCrop() {
    const v = S.view, b = v.box, c = v.cv;
    const sx = Math.round(b.x * c.width), sy = Math.round(b.y * c.height), sw = Math.round(b.w * c.width), sh = Math.round(b.h * c.height);
    const out = document.createElement('canvas'); out.width = sw; out.height = sh;
    out.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
    readAndOpen(out, v.back);
  },
  noCrop() { readAndOpen(S.view.cv, S.view.back); },
  closeDetail() { const v = S.view; if (v.url) URL.revokeObjectURL(v.url); S.view = v.back || null; render(); },
  cat() { S.sheet = { type: 'cat' }; renderSheet(); },
  pickCat(d) {
    if (d.new) { try { localStorage.setItem('kk_cats', JSON.stringify([...new Set([...customCats(), d.c])])); } catch (e) { /* 保存できなくても今回は使える */ } }
    S.view.cat = d.c; closeSheet(); render();
  },
  async save() {
    const v = S.view; if (!detailOk(v)) return;
    const m = { date: v.date, amount: v.amount, cat: v.cat, vendor: v.vendor.trim(), kind: v.kind || '' };
    busy('保存中…');
    try {
      if (v.isNew) {
        m.ym = destYm(v);
        S.files.push(await Store.create(v.blob, v.mime, uniqueName(m.cat, m.amount, v.ext, m.ym), m));
      } else {
        m.ym = destYm(v);
        const rec = await Store.update(v.orig, uniqueName(m.cat, m.amount, v.ext, m.ym, v.id), m);
        S.files[S.files.findIndex((x) => x.id === v.id)] = rec;
      }
      if (v.url) URL.revokeObjectURL(v.url);
      S.view = v.back || null; render();
      msg(`${ymLabel(m.ym)}に登録しました。`);
    } catch (e) { fail(e); }
  },
  dest(d) {
    const base = d.mode === 'month' ? S.ym : S.view.ym;
    S.sheet = { type: 'dest', mode: d.mode, y: +base.slice(0, 4), m: +base.slice(5) }; renderSheet();
  },
  async doDest() {
    const mode = S.sheet.mode, ym = `${$('#dy').value}-${pad($('#dm').value)}`;
    if (mode === 'month') { S.ym = ym; closeSheet(); render(); return; }
    if (mode === 'move' && ym === S.view.ym) { msg('いま開いている年月と同じです。\n別の年月を選んでください。'); return; }
    const n = S.sel.size;
    const ok = await eachSelected(mode === 'move' ? '移動中…' : 'コピー中…', async (f) => {
      const name = uniqueName(f.cat, f.amount, extOf(f), ym, mode === 'move' ? f.id : undefined);
      if (mode === 'move') S.files[S.files.indexOf(f)] = await Store.update(f, name, { date: f.date, amount: f.amount, cat: f.cat, vendor: f.vendor, kind: f.kind, ym });
      else S.files.push(await Store.copy(f, name, ym));
    });
    if (ok) { render(); msg(`${n}件を${ymLabel(ym)}へ${mode === 'move' ? '移動' : 'コピー'}しました。`); }
  },
  askDelete() { S.sheet = { type: 'confirm', text: `${S.sel.size}件を削除します。\nよろしいですか？` }; renderSheet(); },
  async doDelete() {
    const n = S.sel.size;
    const ok = await eachSelected('削除中…', async (f) => { await Store.trash(f); S.files.splice(S.files.indexOf(f), 1); });
    if (ok) { render(); msg(`${n}件を削除しました。`); }
  },
  async zip() {
    const ym = S.view.ym, list = inMonth(ym);
    if (!window.JSZip) { msg('ZIP の部品を読み込めませんでした。\n通信環境を確認して、開き直してください。'); return; }
    busy(`ZIP作成中…（${list.length}件）`);
    try {
      const z = new JSZip();
      for (const f of list) {
        const blob = await Store.download(f);
        if (f.kind === 'folder') {
          const inner = await JSZip.loadAsync(blob), dir = f.name.replace(/\.zip$/i, '');
          for (const e of Object.values(inner.files)) if (!e.dir) z.file(`${dir}/${e.name}`, await e.async('blob'));
        } else z.file(f.name, blob);
      }
      const blob = await z.generateAsync({ type: 'blob' });
      const file = new File([blob], `keikan_${ymLabel(ym)}.zip`, { type: 'application/zip' });
      S.sheet = { type: 'zip', file, url: URL.createObjectURL(file) }; renderSheet();
    } catch (e) { fail(e); }
  },
  async share() { try { await navigator.share({ files: [S.sheet.file] }); } catch (e) { /* 共有シートを閉じただけ */ } },
};

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  if (a && !a.disabled && actions[a.dataset.act]) actions[a.dataset.act](a.dataset);
});
document.addEventListener('input', (e) => {
  const t = e.target, v = S.view;
  if (t.id === 'catq') return renderCats(t.value);
  if (!t.dataset.f || !v || v.type !== 'detail') return;
  if (t.dataset.f === 'amount') v.amount = +norm(t.value).replace(/[^\d]/g, '') || 0;
  else v[t.dataset.f] = t.value;
  $('#save').disabled = !detailOk(v);
  $('#fname').textContent = detailName(v);
  $('#dest').textContent = destText(v);
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'dir') { const fs = [...t.files]; t.value = ''; handleFolder(fs); return; }
  if (t.id === 'cam' || t.id === 'pick') { const f = t.files[0]; t.value = ''; handleFile(f); return; }
  if (t.dataset.chk) { t.checked ? S.sel.add(t.dataset.chk) : S.sel.delete(t.dataset.chk); render(); }
  if ('all' in t.dataset) { const l = inMonth(S.view.ym); S.sel = new Set(t.checked ? l.map((f) => f.id) : []); render(); }
});

if (/ Line\//i.test(navigator.userAgent) && !/openExternalBrowser/.test(location.search)) {
  // LINE のアプリ内ブラウザでは Google ログインが使えないため、Safari で開き直す
  location.replace(location.href.split('#')[0] + (location.search ? '&' : '?') + 'openExternalBrowser=1');
} else {
  Auth.load();
  const back = Auth.fromHash();
  if (DEMO || (CID && Auth.valid())) startApp();
  else { render(); if (back === 'error') msg('ログインできませんでした。\nもう一度お試しください。'); }
}
