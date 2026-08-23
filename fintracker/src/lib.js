// ── Pure helpers, formulas & constant data (no React) ──
// Imported by app.jsx; safe to unit-test in isolation.

// ── THEMES ─────────────────────────────────────────────────
// A theme sets the page background and nothing else — the gold accent, the
// cards and the type are fixed. That is worth being blunt about, because the
// picker used to show each theme as a bright two-colour swatch (Sunset as red
// and orange, Terminal as gold and teal) which read as a promise that the app
// would turn that colour. It never did. The tiles now show these very strings,
// so a swatch cannot say anything the background does not.
//
// Five became three. Sunset's reds and Ocean's indigo fought the gold accent
// they sat beside and neither was ever chosen; what is left is one warm, one
// cool and one neutral, all dark-neutral enough to leave the accent alone.
// Terminal is first, so an unknown stored id falls back to the house style.
export const THEMES = [
  { id:'terminal', icon:'💹', label:'Terminal', note:'ทองบนดำ — ธีมหลัก',
    dark:  'radial-gradient(ellipse 70% 50% at 5% 15%,rgba(212,160,23,.06) 0%,transparent 60%),radial-gradient(ellipse 60% 40% at 95% 85%,rgba(0,200,150,.04) 0%,transparent 55%),#05080f',
    light: 'radial-gradient(ellipse 60% 55% at 15% 10%,rgba(212,160,23,.05) 0%,transparent 65%),#f6f4ef',
  },
  { id:'midnight', icon:'🏦', label:'Midnight', note:'น้ำเงินเข้ม',
    dark:  'radial-gradient(ellipse 70% 55% at 10% 15%,rgba(41,85,184,.18) 0%,transparent 60%),radial-gradient(ellipse 55% 45% at 90% 85%,rgba(30,60,140,.12) 0%,transparent 58%),#060c18',
    light: 'radial-gradient(ellipse 65% 55% at 15% 10%,rgba(41,85,184,.05) 0%,transparent 65%),radial-gradient(ellipse 55% 50% at 85% 90%,rgba(100,150,220,.04) 0%,transparent 60%),#f5f7fa',
  },
  { id:'mono',    icon:'🌑', label:'Mono', note:'เทากลาง ไม่มีสี',
    dark:  'radial-gradient(ellipse 60% 50% at 30% 20%,rgba(100,116,139,.22) 0%,transparent 60%),radial-gradient(ellipse 50% 60% at 80% 80%,rgba(71,85,105,.18) 0%,transparent 55%),#07080a',
    light: 'radial-gradient(ellipse 60% 50% at 30% 20%,rgba(148,163,184,.10) 0%,transparent 60%),radial-gradient(ellipse 50% 60% at 80% 80%,rgba(100,116,139,.07) 0%,transparent 55%),#f4f5f7',
  },
];

// ── Unique ID generator — monotonic, collision-proof within a session.
// Replaces bare Date.now() (which collides when records are created in the
// same millisecond → duplicate ids → editing/deleting the wrong record).
export let _uidCounter = 0;
export const uid = () => Date.now() * 1000 + (_uidCounter = (_uidCounter + 1) % 1000);

// ── CONSTANTS ──────────────────────────────────────────────
export const INCOME_CATS  = ['เงินเดือน','Freelance','ลงทุน/ปันผล','ธุรกิจ','อื่นๆ'];
export const EXPENSE_CATS = ['อาหาร','การเดินทาง','ช้อปปิ้ง','Home & Utilities','อินเตอร์เน็ต/โทรศัพท์','บันเทิง','สุขภาพ','การศึกษา','Subscription','ลงทุน/ปันผล','อื่นๆ'];
export const getExpenseCats = () => { try { const s=localStorage.getItem('ft-expense-cats'); if(s) return JSON.parse(s); } catch{} return EXPENSE_CATS; };
export const MONTHS_TH    = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
export const CAT_CLR  = { 'อาหาร':'#f43f5e','การเดินทาง':'#f97316','ช้อปปิ้ง':'#eab308','ที่พัก':'#14b8a6','Home & Utilities':'#14b8a6','บันเทิง':'#3b82f6','สุขภาพ':'#10b981','การศึกษา':'#06b6d4','Subscription':'#6366f1','ลงทุน/ปันผล':'#8b5cf6','อื่นๆ':'#94a3b8','default':'#94a3b8' };
// Values are keys into CAT_SVG (app.jsx). Anything not found there is drawn as
// text, which is what keeps every emoji saved before the icons existed working.
export const CAT_ICON = { 'อาหาร':'food','การเดินทาง':'transport','ช้อปปิ้ง':'shopping','ที่พัก':'home','Home & Utilities':'home','อินเตอร์เน็ต/โทรศัพท์':'phone','บันเทิง':'entertain','สุขภาพ':'health','การศึกษา':'education','Subscription':'subscription','ลงทุน/ปันผล':'invest','อื่นๆ':'other','เงินเดือน':'salary','โบนัส':'gift','ลงทุน':'invest','ฟรีแลนซ์':'laptop','Freelance':'laptop','ธุรกิจ':'work' };
// User-defined icon/color per category (for custom categories)
export const getCatMeta = () => { try { return JSON.parse(localStorage.getItem('ft-cat-meta')||'{}'); } catch { return {}; } };
export const setCatMeta = (cat, meta) => { try { const m=getCatMeta(); m[cat]={...m[cat],...meta}; localStorage.setItem('ft-cat-meta',JSON.stringify(m)); } catch{} };
export const renameCatMeta = (oldN, newN) => { try { const m=getCatMeta(); if(m[oldN]){ m[newN]=m[oldN]; delete m[oldN]; localStorage.setItem('ft-cat-meta',JSON.stringify(m)); } } catch{} };
export const delCatMeta = (cat) => { try { const m=getCatMeta(); delete m[cat]; localStorage.setItem('ft-cat-meta',JSON.stringify(m)); } catch{} };
// Statement-import category memory: remembers which category a merchant/title was tagged as last
// time, so re-importing a statement doesn't dump everything into "อื่นๆ" forever — only new
// merchants need a manual pick, previously-seen ones auto-fill from what the user chose before.
export const getImportCatMemory = () => { try { return JSON.parse(localStorage.getItem('ft-import-cat-memory')||'{}'); } catch { return {}; } };
export const rememberImportCat = (title, category) => {
  try {
    const key = (title||'').trim().toLowerCase();
    if (!key || !category) return;
    const m = getImportCatMemory();
    m[key] = category;
    localStorage.setItem('ft-import-cat-memory', JSON.stringify(m));
  } catch {}
};
export const guessImportCat = (title, memory) => {
  const t = (title||'').trim().toLowerCase();
  if (!t) return null;
  if (memory[t]) return memory[t]; // exact repeat (e.g. "Netflix" every month)
  // otherwise longest remembered key that overlaps this title (e.g. "grab" matches "Grab Bike", "Grab Food")
  let best=null, bestLen=0;
  Object.keys(memory).forEach(key=>{
    if (key.length>=3 && (t.includes(key)||key.includes(t)) && key.length>bestLen) { best=memory[key]; bestLen=key.length; }
  });
  return best;
};
// deterministic hash → same category name always picks the same palette slot,
// but different custom categories (no meta, no static entry) land on different
// colors/icons instead of all collapsing onto the same gray/📌 default.
const hashCat = c => { let h=0; for(let i=0;i<c.length;i++) h=(h*31+c.charCodeAt(i))>>>0; return h; };
// Guess an icon from keywords in the category name (TH + EN) so custom/renamed categories
// get a meaningful emoji automatically — no picker UI needed. Order matters: earlier, more
// specific rules win (e.g. น้ำมัน/fuel → car before ค่าน้ำ/water → electric). Returns null on no match.
const ICON_RULES = [
  ['food',      ['food','meal','eat','dining','lunch','dinner','breakfast','grocery','restaurant','อาหาร','กิน','ข้าว','ก๋วยเตี๋ยว','ร้านอาหาร']],
  ['coffee',    ['coffee','cafe','tea','drink','beverage','กาแฟ','เครื่องดื่ม','ชานม']],
  ['fuel',      ['fuel','gas','petrol','น้ำมัน','ปั๊มน้ำมัน']],
  ['transport', ['car','vehicle','auto','transport','commute','parking','taxi','grab','รถยนต์','รถ','เดินทาง','ค่าผ่อนรถ','จอดรถ','แท็กซี่']],
  ['travel',    ['travel','trip','flight','vacation','holiday','tour','ท่องเที่ยว','เที่ยว','ทริป','ตั๋วเครื่องบิน']],
  ['shopping',  ['shop','shopping','clothes','clothing','fashion','apparel','ช้อป','เสื้อผ้า','ซื้อของ']],
  ['water',     ['water bill','ค่าน้ำ','ประปา']],
  ['power',     ['electric','electricity','ค่าไฟ','ไฟฟ้า']],
  ['home',      ['home','house','rent','housing','utilit','เช่า','บ้าน','ที่พัก','สาธารณูปโภค','ค่าเช่า']],
  ['internet',  ['internet','wifi','เน็ต','อินเตอร์เน็ต']],
  ['phone',     ['phone','mobile','subscription','โทรศัพท์','มือถือ','ค่าโทร']],
  ['movie',     ['movie','netflix','cinema','stream','หนัง','ภาพยนตร์']],
  ['music',     ['music','spotify','song','เพลง','ดนตรี']],
  ['entertain', ['game','entertain','beer','alcohol','bar','บันเทิง','เกม','เบียร์','เหล้า','ผับ']],
  ['fitness',   ['gym','fitness','exercise','workout','ฟิตเนส','ยิม','ออกกำลัง']],
  ['health',    ['health','medic','doctor','hospital','pharmacy','clinic','สุขภาพ','ยา','หมอ','โรงพยาบาล','คลินิก']],
  ['insurance', ['insur','protect','ประกัน']],
  ['tax',       ['tax','vat','ภาษี','ใบเสร็จ']],
  ['education', ['edu','study','learn','book','course','school','tuition','การศึกษา','เรียน','หนังสือ','คอร์ส','ค่าเทอม']],
  ['invest',    ['invest','stock','crypto','dividend','saving','ลงทุน','หุ้น','ปันผล','ออม']],
  ['salary',    ['salary','wage','income','เงินเดือน','ค่าจ้าง','รายได้']],
  ['work',      ['business','office','work','ธุรกิจ','งาน','ออฟฟิศ']],
  ['laptop',    ['freelance','laptop','computer','software','ฟรีแลนซ์','คอมพิวเตอร์','โปรแกรม']],
  ['gift',      ['gift','present','donat','charity','merit','temple','ของขวัญ','ทำบุญ','บริจาค','วัด']],
  ['beauty',    ['beauty','cosmetic','salon','makeup','ความงาม','เครื่องสำอาง','ทำเล็บ','ทำผม','สปา']],
  ['pet',       ['pet','สัตว์เลี้ยง','หมา','แมว']],
  ['family',    ['family','parent','baby','kid','child','mom','mother','dad','father','ครอบครัว','ดูแล','ลูก','เด็ก','แม่','มารดา','พ่อ','บิดา']],
];
export const guessCatIcon = (c) => { const s=(c||'').toLowerCase(); for(const [icon,kws] of ICON_RULES){ if(kws.some(k=>s.includes(k))) return icon; } return null; };
export const catIcon = (c) => { const m=getCatMeta()[c]; if(m&&m.icon) return m.icon; if(CAT_ICON[c]) return CAT_ICON[c]; if(c==='อื่นๆ') return 'other'; return CAT_EMOJIS[hashCat(c)%CAT_EMOJIS.length]; };
// Same as catIcon but auto-guesses from the name before falling back to the deterministic hash.
// Used ONLY on the Budget page — the transaction list keeps catIcon's original behavior.
export const catIconSmart = (c) => { const m=getCatMeta()[c]; if(m&&m.icon) return m.icon; if(CAT_ICON[c]) return CAT_ICON[c]; if(c==='อื่นๆ') return 'other'; return guessCatIcon(c) || CAT_EMOJIS[hashCat(c)%CAT_EMOJIS.length]; };
export const catClr  = (c) => { const m=getCatMeta()[c]; if(m&&m.clr) return m.clr; if(CAT_CLR[c]) return CAT_CLR[c]; if(c==='อื่นๆ') return CAT_CLR.default; return CAT_PALETTE[hashCat(c)%CAT_PALETTE.length]; };
// Earthy / pastel palette for new categories (per Fin's preference)
export const CAT_PALETTE = ['#7aab8a','#c9a84c','#c98f5a','#c9726a','#8a9bb3','#a88fb0','#b08a6f','#6f9b97'];
// The pool a category with no icon of its own is hashed into — same name always
// lands on the same icon, so nothing shuffles when a category is renamed back.
// Keys into CAT_SVG, not emoji, despite the name this export has always had.
export const CAT_EMOJIS  = ['other','food','transport','shopping','home','entertain','health','education','phone','invest','travel','fitness','gift','coffee','pet','utilities','movie','beauty','music','water','power','work'];
// ── Asset tagging: decide whether a tx moves money IN or OUT of an asset ──
// income tagged → in · expense tagged → out (except invest-buy which adds to the asset) · transfers use transferDir
export const isAssetTxOut = (t, id) =>
  (t.fromAssetId===id && t.transferDir!=='from') ||
  (t.targetAssetId===id && t.type==='expense' && t.notes!=='[invest]') ||
  (t.targetAssetId===id && t.type==='adjustment' && t.amount<0);
export const isAssetTxIn = (t, id) =>
  (t.toAssetId===id && t.transferDir!=='to') ||
  (t.targetAssetId===id && (t.type==='income' || (t.type==='expense' && t.notes==='[invest]'))) ||
  (t.targetAssetId===id && t.type==='adjustment' && t.amount>0);
export const assetTagged = (txs, id) => {
  let taggedIn=0, taggedOut=0;
  txs.forEach(t=>{ const amt=Math.abs(t.amount);
    if(isAssetTxIn(t,id)) taggedIn+=amt;
    else if(isAssetTxOut(t,id)) taggedOut+=amt;
  });
  return {taggedIn, taggedOut};
};


export const today = () => new Date().toISOString().split('T')[0];
export const ym    = d => d.substring(0,7);

// ── TX DISPLAY HELPERS ─────────────────────────────────────
// The amount is printed with fmt(), which strips the sign — so whatever this
// returns is the only sign the row will ever show. Both branches below used to
// fall through to '', which printed a negative adjustment and the outgoing leg
// of a transfer as though money had arrived.
export const txSign = t =>
  t.type==='transfer'    ? (t.transferDir==='to' ? '+' : '-') :
  t.type==='adjustment'  ? (t.amount>=0 ? '+' : '-')          :
  t.type==='income'      ? '+'                                :
  t.type==='dividend'    ? '+'                                :
  t.amount<0             ? '+' : '-';

// Colour says what happened to the money, not what kind of row it is:
// green means more of it, red means less, and a transfer means neither — it
// moved between pockets and the total did not budge. It used to paint the
// incoming leg the same green as a salary, so a ฿100,000 move read at a glance
// as ฿100,000 earned.
export const txAmtCls = t =>
  t.type==='transfer'    ? 'text-slate-400' :
  t.type==='adjustment'  ? 'text-amber-400'   :
  t.type==='income'      ? 'text-emerald-400' :
  t.type==='dividend'    ? 'text-teal-400'    :
  t.amount<0             ? 'text-emerald-400' : 'text-rose-400';

export const txBarClr = t =>
  t.type==='transfer'    ? '#94a3b8' :   // neutral: the bar marks a move, not a gain
  t.type==='adjustment'  ? '#d97706' :
  t.type==='dividend'    ? '#14b8a6' : catClr(t.category);

export const txBadgeCls = t =>
  t.type==='income'      ? 'bg-emerald-500/15 text-emerald-400' :
  t.type==='transfer'    ? 'bg-slate-500/15 text-slate-400' :
  t.type==='adjustment'  ? 'bg-amber-500/15 text-amber-400'   :
  t.type==='dividend'    ? 'bg-teal-500/15 text-teal-400'     :
  'bg-rose-500/15 text-rose-400';

export const txLabel = t =>
  t.type==='income' ? 'รับ' : t.type==='transfer' ? 'โยก' :
  t.type==='adjustment' ? 'ปรับ' : t.type==='dividend' ? 'ปันผล' : 'จ่าย';

// sum transactions by type (and optional month prefix)
export const sumTxType  = (txs, type)        => txs.filter(t=>t.type===type).reduce((s,t)=>s+t.amount,0);
export const sumTxMonth = (txs, type, month) => txs.filter(t=>t.type===type&&t.date.startsWith(month)).reduce((s,t)=>s+t.amount,0);

// ── canonical money formulas — single source of truth, used by every view ──
// asset value incl. tagged cash flows (matches the Assets page valTot)
export const assetVal = (a, txs, usdRate=1) => {
  const {taggedIn, taggedOut} = assetTagged(txs, a.id);
  return (a.qty*a.currentPrice + taggedIn - taggedOut) * (a.currency==='USD' ? usdRate : 1);
};
// wallet cash. Pass `assets` to exclude txs already attributed to the wallet's
// own cash-type assets (those count via assetVal) — avoids double-counting.
export const walletCash = (w, txs, assets=[]) => {
  const cashAssetIds = new Set(assets.filter(a=>a.walletId===w.id&&a.type==='cash').map(a=>a.id));
  const tagged = t => cashAssetIds.has(t.targetAssetId)||cashAssetIds.has(t.toAssetId)||cashAssetIds.has(t.fromAssetId);
  const wt   = txs.filter(t=>t.walletId===w.id&&!tagged(t));
  const tOut = txs.filter(t=>t.type==='transfer'&&t.walletId===w.id&&!tagged(t)).reduce((s,t)=>s+t.amount,0);
  const tIn  = txs.filter(t=>t.type==='transfer'&&t.toWalletId===w.id&&!tagged(t)).reduce((s,t)=>s+t.amount,0);
  return (w.initialBalance||0)
    + sumTxType(wt,'income') - sumTxType(wt,'expense')
    - tOut + tIn
    + sumTxType(wt,'adjustment')
    + sumTxType(wt,'dividend');
};

// 3-way array merge by record id, for safe multi-device cloud sync.
// base   = snapshot of what was last in sync, local = this device now,
// remote = what's currently in the cloud (read inside the write transaction).
// Result keeps records another device added, and applies this device's
// own adds / edits / deletes — so concurrent edits never wipe each other.
export const mergeArrById = (base, local, remote) => {
  const toMap = a => { const m=new Map(); (Array.isArray(a)?a:[]).forEach(x=>{ if(x&&x.id!=null) m.set(x.id,x); }); return m; };
  const b=toMap(base), l=toMap(local), r=toMap(remote);
  const out=[];
  // keep this device's records in their current order
  for (const [id,rec] of l) {
    const prev=b.get(id);
    if (!prev || JSON.stringify(prev)!==JSON.stringify(rec)) { out.push(rec); continue; } // local add/edit wins
    if (r.has(id)) out.push(r.get(id));   // unchanged locally → take cloud copy (picks up remote edits)
    // else: existed in base, now gone from cloud → another device deleted it → drop
  }
  // append records another device added (in cloud, never in our base, and not local)
  for (const [id,rec] of r) if (!l.has(id) && !b.has(id)) out.push(rec);
  return out;
};
// raw wallet cash (no asset context) — kept for the few callers without assets in scope
export const walletBal = (w, txs) => walletCash(w, txs, []);

export const exportCSV = (txs) => {
  const rows = [['วันที่','รายการ','หมวด','ประเภท','จำนวน','หมายเหตุ'],
    ...txs.map(t=>[t.date,t.title,t.type==='transfer'?'โยกเงิน':t.type==='adjustment'?'ปรับยอด':t.type==='dividend'?'ปันผล':t.category,t.type==='income'?'รายรับ':t.type==='transfer'?'โยก':t.type==='adjustment'?'ปรับยอด':t.type==='dividend'?'ปันผล':'รายจ่าย',t.amount,t.notes])];
  const csv = rows.map(r=>r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv'}));
  a.download = `fintracker_${today()}.csv`; a.click();
};

// ── Ticker resolution ──────────────────────────────────────
// Assets are routinely named after the ticker itself, so demanding
// the field again is pure friction — and an asset silently left without one just
// stops getting priced, drifting further from reality the longer it sits.
// Guarded to USD holdings on purpose: a THB-priced "PTT" resolves on Yahoo to
// PTTRX, an unrelated US bond fund, which would look like a working price while
// being completely wrong.
export const TICKER_RE = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;
export const impliedTicker = a => {
  if (!a) return '';
  const explicit = (a.ticker || '').trim();
  if (explicit) return explicit;
  if (a.currency !== 'USD') return '';
  if (a.type === 'cash' || a.type === 'gold' || a.type === 'property' || a.type === 'other') return '';
  const name = (a.name || '').trim().toUpperCase();
  return TICKER_RE.test(name) ? name : '';
};

// How long ago a price was written, in words. Shown under the price so a figure
// that stopped updating months ago is visible as one — holdings sat 11% and
// 22% stale purely because nothing on screen said when they last moved.
// Clock time for today, date for anything older. A time means today by
// implication, so the two forms are distinguishable at a glance without
// carrying a label — and both are exact, unlike "เมื่อสักครู่".
export const priceAge = ts => {
  if (!ts) return null;
  const d = new Date(ts), now = new Date();
  const clock = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return clock + ' น.';
  // Yesterday is spelled out rather than dated: just after midnight a price
  // from twenty minutes ago is "yesterday", and showing it as a bare date makes
  // something current look a day stale.
  const yst = new Date(now); yst.setDate(yst.getDate() - 1);
  if (d.toDateString() === yst.toDateString()) return `เมื่อวาน ${clock}`;
  const opts = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = '2-digit';
  return d.toLocaleDateString('th-TH', opts);
};
export const PRICE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

// A stored category can outlive the list it came from: renaming one updated
// transactions but never the recurring templates, leaving them pointing at a
// name no longer offered. A <select> cannot render a value it has no <option>
// for — the browser shows a different category instead, and saving writes that
// wrong one. Keeping the current value in the list makes the field honest.
// Returns {value,label} so the leftover can be labelled: shown bare it reads as
// an equally valid choice, when it is really a dead name to move away from.
export const catOptions = (list, current) => {
  const opts = list.map(c => ({ value: c, label: c }));
  if (current && !list.includes(current))
    opts.unshift({ value: current, label: `${current} · หมวดเดิม (เลือกใหม่)` });
  return opts;
};

// Renaming a category has to reach every store that keys on its name, because
// the name IS the identity — miss one and it keeps pointing at a category that
// no longer exists. Recurring templates were missed for exactly this reason.
// Kept in one function so a store added later has an obvious place to be added.
// React-held state (budgets, irregularCats) is renamed by the caller.
export const renameCatInStores = (oldName, newName) => {
  if (!oldName || !newName || oldName === newName) return;
  const swapKeys = obj => {
    const out = {};
    Object.entries(obj).forEach(([k, v]) => { out[k === oldName ? newName : k] = v; });
    return out;
  };
  const edit = (key, fn) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return;
      const next = fn(JSON.parse(raw));
      if (next !== undefined && JSON.stringify(next) !== raw) localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };
  edit('ft-cat-meta',        m => swapKeys(m || {}));
  edit('ft-cat-irregular',   m => swapKeys(m || {}));
  edit('ft-budget-history',  h => {
    const out = {};
    Object.entries(h || {}).forEach(([month, cats]) => { out[month] = cats ? swapKeys(cats) : cats; });
    return out;
  });
  edit('ft-recurring',       rs => Array.isArray(rs) ? rs.map(r => r.category === oldName ? { ...r, category: newName } : r) : rs);
  // this one stores the category as the value, not the key
  edit('ft-import-cat-memory', m => {
    const out = {};
    Object.entries(m || {}).forEach(([title, cat]) => { out[title] = cat === oldName ? newName : cat; });
    return out;
  });
};

// ── Running balance (statement view) ───────────────────────
// How one transaction moves a wallet's balance. Mirrors walletCash exactly,
// including its quirk for transfers: the row filed under a wallet always moves
// that wallet opposite to the sign it stores, for both the sending and the
// receiving leg.
export const walletDelta = (t, walletId) => {
  if (String(t.walletId) !== String(walletId)) return 0;
  if (t.type === 'transfer' || t.type === 'expense') return -t.amount;
  return t.amount;                       // income · adjustment · dividend
};

// Balance after each transaction, newest first. Anchored to walletCash so the
// top row always shows the real current balance rather than a re-derived one.
//
// Returns null when the numbers cannot be trusted: a filtered or reordered list
// leaves gaps, and a running total over a subset of a wallet's history is a
// figure that looks authoritative while being wrong.
// Newest first, and within a day the most recently entered first. Matches how
// the transaction list sorts, so a balance always belongs to the row it sits on.
export const byNewest = (a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id;

export const runningBalances = (wallet, allTxs, assets = []) => {
  if (!wallet) return null;
  const end = walletCash(wallet, allTxs, assets);
  // Computed across the wallet's whole history, never across what happens to be
  // on screen: a balance depends on every movement before it, so narrowing the
  // view must not change the arithmetic. Which of these get shown is the
  // caller's decision — see the note on contiguity where this is used.
  const owned = allTxs.filter(t => String(t.walletId) === String(wallet.id)).sort(byNewest);

  const cashAssetIds = new Set(assets.filter(a => a.walletId === wallet.id && a.type === 'cash').map(a => a.id));
  const tagged = t => cashAssetIds.has(t.targetAssetId) || cashAssetIds.has(t.toAssetId) || cashAssetIds.has(t.fromAssetId);

  // walking every row back from the end must land on the starting balance —
  // if it doesn't, this wallet has movements the row-level rule doesn't capture
  const total = owned.reduce((s, t) => s + (tagged(t) ? 0 : walletDelta(t, wallet.id)), 0);
  if (Math.abs((wallet.initialBalance || 0) + total - end) > 0.01) return null;

  const out = {};
  let bal = end;
  for (const t of owned) {
    out[t.id] = bal;                                        // balance *after* this row
    bal -= tagged(t) ? 0 : walletDelta(t, wallet.id);
  }
  return out;
};

// ── budget sync guards ───────────────────────────────────────────────────────
// budgets and irregularCats upload without merging: whatever this device holds
// becomes the cloud's truth. That is deliberate — a merge cannot express "I
// deleted this category" — but it cannot tell a deletion from a device that has
// simply lost its local storage, and a browser clearing site data then looks
// exactly like a decision to wipe every category. It happened: seventeen
// categories, their budgets and the irregular flags were replaced across every
// device by a set of untouched defaults.
//
// The one state that is never a real edit is "still exactly the factory
// defaults, or nothing at all". A device in that state has nothing to say about
// budgets, so it defers to whatever the cloud holds instead of overwriting it.
// Changing any single amount makes it authoritative again, so deleting
// categories on purpose still works.
export const isUntouchedBudgets = (b, defaults) => {
  if (!b || typeof b !== 'object') return true;
  const keys = Object.keys(b);
  if (!keys.length) return true;
  const dk = Object.keys(defaults || {});
  if (keys.length !== dk.length) return false;
  return dk.every(k => k in b && Number(b[k]) === Number(defaults[k]));
};

// Which copy of budgets/irregularCats wins. They move as a pair: the flags
// describe the categories, so keeping one device's budgets with another's flags
// would leave the two disagreeing about which categories exist.
export const chooseBudgets = (local, remote, defaults) => {
  const remoteHasSomething = remote && typeof remote === 'object' && Object.keys(remote).length > 0;
  if (isUntouchedBudgets(local, defaults) && remoteHasSomething && !isUntouchedBudgets(remote, defaults)) {
    return 'remote';
  }
  return 'local';
};

// Union of two plain key→value maps, for the per-key stores that every device
// adds to independently: monthly budget snapshots, category icons and colours,
// and what the statement importer has learned about each merchant. An entry
// either device recorded is one neither should lose, so a key present on one
// side survives; a key both edited is a conflict only over the newer wording,
// and this device's own view wins there.
export const mergeKeyedMap = (local, remote) => ({ ...(remote || {}), ...(local || {}) });

// Undo one เติม/เอาออก entry, returning the quantity and average cost it was
// applied to — or null when that cannot be established.
//
// Deleting an entry used to strip the log line and leave the numbers it produced
// in place, so a mistake could be removed from the history while its effect
// stayed. Reversing the arithmetic is only safe for the most recent entry: later
// ones were computed on top of it, and what is stored does not describe the
// states in between. The check for "most recent" is the entry's own recorded
// result still matching the asset — self-verifying, and null when it doesn't.
export const revertMove = (move, curQty, curAvg) => {
  if (!move || typeof move.qty !== 'number') return null;
  const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;
  if (!near(move.newQty, curQty) || !near(move.newAvg, curAvg)) return null;

  const qty = curQty - move.qty;
  if (qty < -1e-6) return null;
  // เอาออก leaves the average untouched, so it reverts to itself; เติมเข้า blended
  // the new rate in by weight and has to be unblended the same way
  const avg = move.qty < 0 ? curAvg
            : qty > 1e-9 ? (curQty * curAvg - move.qty * (move.rate || 0)) / qty
            : curAvg;
  if (!isFinite(avg) || avg < 0) return null;
  return { qty: parseFloat(qty.toFixed(8)), avgCost: parseFloat(avg.toFixed(6)) };
};

// The budget total covers two kinds of money that behave nothing alike — a rent
// payment due every month, and a car repair that may not happen at all — so the
// card names both parts under the figure. Total and parts are returned together
// on purpose: computed separately they could be filtered differently, and a
// caption that does not add up to the number above it is worse than no caption.
export const splitBudget = (budgets, isIrregular, exclude = []) => {
  const out = { regular: 0, irregular: 0, total: 0 };
  for (const [cat, v] of Object.entries(budgets || {})) {
    if (exclude.includes(cat)) continue;
    const n = Number(v) || 0;
    out[isIrregular(cat) ? 'irregular' : 'regular'] += n;
    out.total += n;
  }
  return out;
};

// ── Compound projection ──────────────────────────────────────────────────────
// Rates compound monthly at the twelfth root of the annual figure, never r/12:
// "10% ต่อปี" is what the year returns, and twelve months of 10/12 compounds to
// 10.47% — a tenth of the growth invented, quietly, over decades.
export const monthlyRate = r => Math.pow(1 + r/100, 1/12) - 1;

// Where a starting sum plus a level monthly contribution ends up.
export const projectFV = (pv, pmt, r, months) => {
  if (months <= 0) return pv;
  const i = monthlyRate(r);
  if (Math.abs(i) < 1e-12) return pv + pmt*months;   // 0% is a straight line, not a division by zero
  const g = Math.pow(1+i, months);
  return pv*g + pmt*(g-1)/i;
};

// …and the contribution that lands on a target. Returns ≤ 0 when the starting
// sum already overshoots — reported rather than clamped, because "you need
// ฿0/month" and "you need nothing more at all" are different answers.
export const requiredPMT = (target, pv, r, months) => {
  if (months <= 0) return NaN;
  const i = monthlyRate(r);
  if (Math.abs(i) < 1e-12) return (target - pv)/months;
  const g = Math.pow(1+i, months);
  return (target - pv*g) * i / (g-1);
};

// ── Collections ──────────────────────────────────────────────────────────────
// An "อื่นๆ" asset is often one line standing for many things — พระเครื่อง, การ์ด —
// where the money is the sum of individual pieces, not a quantity at a price.
// Each piece is worth its own amount, so `qty × currentPrice` cannot describe
// the collection on its own: three amulets at ฿600k, ฿350k and ฿250k are not
// three of anything at one price.
//
// items[] records the pieces. Rather than teach every formula in the app about
// a second way of valuing an asset, the pieces derive qty and price so that
// `qty × currentPrice` still comes out at the collection's worth — assetVal,
// Net Worth, the charts and the audit keep working untouched, and there stays
// exactly one number to trust.
export const itemTotals = (items = []) => {
  const list = (items || []).filter(i => i && typeof i === 'object');
  const value = list.reduce((s, i) => s + (Number(i.value) || 0), 0);
  // Cost is optional per piece: things kept for years are often remembered by
  // what they are worth, not what they cost. Left blank it means "no gain to
  // report", which is what falling back to the value gives.
  const cost = list.reduce((s, i) => {
    const c = i.cost === '' || i.cost === null || i.cost === undefined ? i.value : i.cost;
    return s + (Number(c) || 0);
  }, 0);
  return { count: list.length, value, cost };
};

// The figures an asset must carry for its stored total to equal its pieces.
// null when there are no pieces — an asset priced the ordinary way is left alone.
//
// Deliberately not avgCost. What a collection is worth is the sum of the pieces
// and nothing else, but what it *cost* is a separate fact the pieces cannot
// supply: things kept for years are listed at what they are worth now, and
// deriving the cost from that only ever reports a gain of zero. Cost stays the
// owner's own figure, so it survives adding and revaluing pieces.
export const itemsToAsset = (items = []) => {
  const { count, value } = itemTotals(items);
  if (!count) return null;
  return {
    qty: count,
    currentPrice: parseFloat((value / count).toFixed(6)),
  };
};

// Cash held across every wallet at the close of each day — loose wallet cash
// plus cash-type assets, which is all of it and only it. Investments are left
// out on purpose: their value moves on its own, so they can never be counted
// against money you can go and physically count.
//
// The day is the honest unit, not the row. Transactions carry a date and no
// time, so their order within a day is the order they were typed in, not the
// order they happened. A balance printed after every row would state a sequence
// the data does not actually know.
//
// `warn` marks a day whose transfers did not net to zero. Moving money between
// two of your own wallets cannot change how much you have, so when a day's
// transfers sum to anything but zero, one of them is malformed — pointing at a
// wallet that no longer exists, or missing its destination altogether.
//
// Returns null rather than a figure it cannot stand behind, same as above.
export const systemCashByDay = (wallets, allTxs, assets = []) => {
  if (!wallets?.length || !allTxs?.length) return null;

  // Every cash asset, not only the ones attached to a wallet. An unattached one
  // is still cash you own, and Net Worth counts it — leaving it out here made
  // this total quietly disagree with the dashboard by exactly its value.
  const cashAssets = assets.filter(a => a.type === 'cash');
  const end = wallets.reduce((s, w) => s + walletCash(w, allTxs, assets), 0)
            + cashAssets.reduce((s, a) => s + assetVal(a, allTxs, 1), 0);

  const ownCash = new Map(wallets.map(w =>
    [String(w.id), new Set(cashAssets.filter(a => String(a.walletId) === String(w.id)).map(a => a.id))]));

  const delta = t => {
    let d = 0;
    for (const w of wallets) {
      const own = ownCash.get(String(w.id));
      // counted at the asset instead — walletCash excludes these, so must we
      if (own.has(t.targetAssetId) || own.has(t.toAssetId) || own.has(t.fromAssetId)) continue;
      const wid = String(w.id);
      if (t.type === 'transfer') {
        if (String(t.walletId)   === wid) d -= t.amount;
        if (String(t.toWalletId) === wid) d += t.amount;
      } else if (String(t.walletId) === wid) {
        d += t.type === 'expense' ? -t.amount : t.amount;    // income · adjustment · dividend
      }
    }
    for (const a of cashAssets) {
      const amt = Math.abs(t.amount);
      if (isAssetTxIn(t, a.id)) d += amt;
      else if (isAssetTxOut(t, a.id)) d -= amt;
    }
    return d;
  };

  // the same reconciliation runningBalances does: walking every row back from
  // today's figure has to land on what everything started at
  const base = wallets.reduce((s, w) => s + (w.initialBalance || 0), 0)
             + cashAssets.reduce((s, a) => s + a.qty * a.currentPrice, 0);
  const moved = allTxs.reduce((s, t) => s + delta(t), 0);
  if (Math.abs(base + moved - end) > 0.01) return null;

  const byDay = {};
  for (const t of [...allTxs].sort(byNewest)) (byDay[t.date] ||= []).push(t);

  const day = {}, row = {};
  let bal = end;
  for (const date of Object.keys(byDay).sort().reverse()) {
    const rows = byDay[date];
    const transferNet = rows.filter(t => t.type === 'transfer').reduce((s, t) => s + delta(t), 0);
    day[date] = { total: bal, warn: Math.abs(transferNet) > 0.01, gap: transferNet };
    // Per-row totals as well. Only the figure at each day boundary is a fact —
    // within a day the rows carry no time, so the order is the order they were
    // typed. Read them as "roughly here", and the day line as the truth.
    for (const t of rows) { row[t.id] = bal; bal -= delta(t); }
  }
  return { day, row };
};

// ── Screen lock ──────────────────────────────────────────────────────────────
// A PIN in front of the 👁 button, so the figures do not appear just because
// someone pressed it. Worth being exact about what this is: the numbers are
// hidden from view, not protected. Nothing here encrypts anything — the records
// sit in localStorage and in Firestore in the clear, and a downloaded backup is
// plain JSON. It stops a person looking at the screen; it does not stop a person
// who opens devtools, and it must never be described as though it did.
//
// The PIN is still stored as a salted hash rather than as itself, because a PIN
// gets reused elsewhere and a glance at localStorage should not hand it over.
export const makeSalt = () => {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
};

export const hashPin = async (pin, salt) => {
  const buf = new TextEncoder().encode(`ft-lock:${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
};

// ── Backup encryption ────────────────────────────────────────────────────────
// This one is the real thing, and the difference from the screen lock above
// matters enough to say plainly: the lock hides numbers from a person looking
// at the screen and can be stepped around by anyone who opens devtools. This
// encrypts the file, so a backup sitting in the downloads folder is unreadable
// without the passphrase — including to us.
//
// The cost is symmetric. There is no recovery path, no reset link, no way back
// in from a hash. A forgotten passphrase means the file is gone, which is why
// the passphrase is optional at export rather than forced on: an unencrypted
// backup that can always be read beats an encrypted one nobody can open.
//
// AES-GCM authenticates as well as encrypts, so a tampered or truncated file
// fails to decrypt rather than yielding plausible-looking wrong records.
export const PBKDF2_ITER = 250_000;

// btoa needs a binary string, and spreading a 300KB array into fromCharCode
// overflows the argument stack — real backups are well past that, so walk it
// in chunks instead.
const toB64 = buf => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

const deriveKey = async (pass, salt, iter, usage) => {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, usage);
};

export const encryptBackup = async (obj, pass) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(pass, salt, PBKDF2_ITER, ['encrypt']);
  const ct   = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  // exportedAt stays outside the ciphertext so the import panel can show which
  // day a file is from before asking for the passphrase. It is the only thing
  // that leaks, and knowing a backup exists is not what the passphrase guards.
  return {
    ftEncrypted: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: PBKDF2_ITER,
    exportedAt: obj.exportedAt,
    salt: toB64(salt), iv: toB64(iv), data: toB64(ct),
  };
};

export const isEncryptedBackup = d =>
  !!d && d.ftEncrypted === 1 && typeof d.data === 'string'
      && typeof d.salt === 'string' && typeof d.iv === 'string';

// Reads the iteration count from the file rather than the constant, so backups
// written today still open if the cost is raised later.
export const decryptBackup = async (env, pass) => {
  const key = await deriveKey(pass, fromB64(env.salt), env.iter || PBKDF2_ITER, ['decrypt']);
  const pt  = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(env.iv) }, key, fromB64(env.data));
  return JSON.parse(new TextDecoder().decode(pt));
};

// Stable colour for an asset's initials badge. Every stock without a logo was
// drawn on the same gold, so a column of twenty holdings read as one repeated
// shape and the initials had to be spelled out to tell them apart. Hashing the
// ticker gives each one a colour it keeps forever — recognisable at a glance,
// with no network call and nothing to load.
export const tickerClr = t => CAT_PALETTE[hashCat((t || '?').toUpperCase()) % CAT_PALETTE.length];

// ── Realized profit ──────────────────────────────────────────────────────────
// Money that has actually landed, kept apart from money that merely could. Every
// เติม/เอาออก already records what a sale made — (sale rate − average cost) ×
// units — and it has never been shown anywhere but that one asset's own history.
// Dividends belong beside it: also real, also received, and already stored in
// baht by the form that takes them.
//
// A holding's realized figure is in the asset's own currency and the rate on the
// day of the sale was never kept, so USD sales are converted at today's rate —
// close enough to group by year, and worth saying out loud rather than implying
// a precision that is not there.
// Money crossing between a wallet and a holding, in baht, signed from the
// wallet's side: buying takes money out, selling and dividends put it back.
//
// Two things this exists to get right. The rate is quoted in the asset's own
// currency while a wallet holds baht, and leaving the conversion out credited a
// $4,079.28 sale to a baht wallet as ฿4,079.28 — the whole error being the
// exchange rate, the same shape as the bug the money box on that form had. And
// buying used to have no wallet at all: only sales could name where the cash
// went, so a purchase moved units while the money it cost stayed in the wallet.
export const assetCashFlow = ({ kind = 'buy', qty = 0, rate = 0, amount = 0, currency = 'THB', usdRate = 35 } = {}) => {
  const fx = currency === 'USD' ? (Number(usdRate) || 35) : 1;
  if (kind === 'dividend') return amount > 0 ? amount * fx : 0;
  // ปรับยอด corrects a quantity that was recorded wrong; no money changed hands.
  // Neither does a move with no rate — there is nothing to say what it was worth.
  if (kind === 'adjust' || !qty || !(rate > 0)) return 0;
  const money = Math.abs(qty) * rate * fx;
  return qty < 0 ? money : -money;
};

export const realizedByYear = (assets = [], txs = [], usdRate = 35) => {
  const years = {};
  const yearOf = d => String(d || '').slice(0, 4);
  const bucket = y => (years[y] ||= { sales: [], dividends: [], salesTotal: 0, divTotal: 0, total: 0 });

  (assets || []).forEach(a => {
    const mult = a.currency === 'USD' ? usdRate : 1;
    (a.moves || []).forEach(m => {
      const raw = Number(m.realized) || 0;
      const y = yearOf(m.date);
      if (!raw || y.length !== 4) return;
      const b = bucket(y);
      b.sales.push({ id: m.id, name: a.name, date: m.date, currency: a.currency,
                     qty: Math.abs(Number(m.qty) || 0), raw, amount: raw * mult });
      b.salesTotal += raw * mult;
    });
  });

  (txs || []).filter(t => t && t.type === 'dividend').forEach(t => {
    const y = yearOf(t.date);
    if (y.length !== 4) return;
    const b = bucket(y);
    const amount = Math.abs(Number(t.amount) || 0);
    b.dividends.push({ id: t.id, name: t.title || 'ปันผล', date: t.date, amount });
    b.divTotal += amount;
  });

  const newest = (x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0);
  Object.values(years).forEach(b => {
    b.total = b.salesTotal + b.divTotal;
    b.sales.sort(newest);
    b.dividends.sort(newest);
  });
  return years;
};
