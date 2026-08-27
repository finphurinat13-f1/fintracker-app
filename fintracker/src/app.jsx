import {
  THEMES, _uidCounter, uid, INCOME_CATS, getExpenseCats, MONTHS_TH, CAT_CLR, setCatMeta, renameCatMeta, delCatMeta, catIcon, catIconSmart, catClr, CAT_PALETTE, GOLD_RAMP, getImportCatMemory, rememberImportCat, guessImportCat, isAssetTxOut, isAssetTxIn, assetTagged, today, ym, txSign, txAmtCls, txBarClr, txBadgeCls, txLabel, sumTxType, sumTxMonth, assetVal, walletCash, mergeArrById, walletBal, exportCSV, impliedTicker, priceAge, PRICE_STALE_MS, catOptions, renameCatInStores, runningBalances, systemCashByDay, revertMove, chooseBudgets, mergeKeyedMap, itemTotals, itemsToAsset, splitBudget, monthlyRate, projectFV, requiredPMT, makeSalt, hashPin, tickerClr, realizedByYear, assetCashFlow, whoAmI, annualisedReturn, encryptBackup, decryptBackup, isEncryptedBackup
} from "./lib.js";


const { useState, useEffect, useRef, useMemo, useCallback } = React;

// Animate a number from its previous value to the new one (easeOutCubic).
// Honors prefers-reduced-motion by snapping instantly.
const prefersReducedMotion = () => typeof matchMedia!=='undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// `fromZero` makes the figure count up on first paint rather than only when it
// later changes. It was seeded with its own value, so the animation existed but
// nobody ever saw it: net worth is settled by the time the page renders and
// only moves again when a transaction is edited.
const useCountUp = (value, dur=650, fromZero=false) => {
  const [n,setN] = useState(fromZero ? 0 : value);
  const ref = useRef(fromZero ? 0 : value);
  useEffect(()=>{
    const from=ref.current, to=value;
    if(from===to) return;
    if(prefersReducedMotion()){ ref.current=to; setN(to); return; }
    const start=performance.now(); let raf;
    const tick=t=>{ const p=Math.min(1,(t-start)/dur); const e=1-Math.pow(1-p,3); setN(from+(to-from)*e); if(p<1) raf=requestAnimationFrame(tick); else { ref.current=to; setN(to); } };
    raf=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(raf);
  },[value,dur]);
  return n;
};

Chart.defaults.font.family = 'Noto Sans Thai, sans-serif';
Chart.defaults.font.size = 11;
Chart.defaults.color = 'rgba(148,163,184,0.75)';


// ── UTILS ──────────────────────────────────────────────────
// Layer one of the screen lock: once a PIN is set, every load starts masked.
// Being unlocked is never written down, so closing the tab re-hides by itself —
// which is the state anyone else picking up the machine will find.
// The hash is checked as well as the flag: a lock switched on with nothing to
// verify against could never be opened, and would have to be cleared by wiping
// site data. A flag on its own is not a lock.
const _locked = localStorage.getItem('ft-lock-on') === '1' && !!localStorage.getItem('ft-lock-hash');
// A grace window, because re-locking the instant the tab reloads made an
// accidental F5 cost a passcode every time. It is kept alive while the app is
// in use and starts counting down the moment it is not, so a reload, a glance
// at another tab, or stepping away briefly costs nothing — while leaving for
// longer than the window still locks.
//
// Thirty minutes, up from five. Five was short enough that checking a bank app
// mid-entry came back to a passcode prompt, and a lock people meet that often
// is one they turn off. What this protects against is someone else picking the
// device up, and the honest limit is stated on the settings card: this is
// visual masking, not encryption. Half an hour is well inside the window in
// which the device is still in your hand.
const LOCK_GRACE_MS = 30 * 60_000;   // 30 นาที
const lockTouch = () => { try{ localStorage.setItem('ft-lock-until', String(Date.now()+LOCK_GRACE_MS)); }catch{} };
const lockDrop  = () => { try{ localStorage.removeItem('ft-lock-until'); }catch{} };
const lockFresh = () => { try{ return Date.now() < (parseInt(localStorage.getItem('ft-lock-until')||'0',10)||0); }catch{ return false; } };
let _hideAmt = localStorage.getItem('ft-hideamt') === '1';
let _privacy = localStorage.getItem('ft-privacy') === '1' || (_locked && !lockFresh());
const fmt   = n => (_privacy||_hideAmt) ? '฿ •••••' : '฿' + Math.abs(n).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtNW = n => (_privacy||_hideAmt) ? '฿ •••••' : '฿' + Math.abs(n).toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:0});
// fmt() strips the sign (amounts pair with a separate +/- prefix). For real
// balances that can legitimately go negative, fmtSigned keeps the minus sign.
const fmtSigned = n => (n<0?'-':'') + fmt(n);
// Stamped in by the build. The typeof guard keeps the source runnable outside
// the bundler; a "+" on the hash means that build had uncommitted changes.
const APP_BUILD = typeof __BUILD_DATE__ !== 'undefined' ? `${__BUILD_DATE__} · ${__GIT_HASH__}` : 'dev build';
// "8 ส.ค." — parsed by hand, since new Date('2026-08-08') is UTC midnight and
// shifts a day backwards for anyone reading it west of Greenwich.
const dayLabel = d => { const [,m,dd] = d.split('-'); return `${+dd} ${MONTHS_TH[+m-1]}`; };
// Display a raw numeric string with thousands separators while keeping it
// editable (preserves a trailing dot, decimals, and a leading minus). Pair with
// onChange that strips commas, so the stored value stays comma-free for parseFloat.
const fmtNumInput = v => {
  let s = String(v ?? '');
  if (s === '') return '';
  const neg = s.trim().startsWith('-');
  s = s.replace(/[^\d.]/g, '');
  if (s === '') return neg ? '-' : '';
  const dot = s.indexOf('.');
  const intRaw = (dot >= 0 ? s.slice(0, dot) : s).replace(/^0+(?=\d)/, '');
  const dec = dot >= 0 ? s.slice(dot) : '';
  const intGrouped = (intRaw === '' ? '0' : intRaw).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + intGrouped + dec;
};

// ── ICONS ──────────────────────────────────────────────────
const Ic = ({ n, s=18, cls='', fill='none' }) => {
  const p = {
    home:     <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></>,
    list:     <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    chart:    <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    plus:     <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    lock:     <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    lockopen: <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></>,
    sun:      <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>,
    moon:     <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
    x:        <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    trash:    <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
    edit:     <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    search:   <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    up:       <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>,
    down:     <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>,
    wallet:   <><path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 11h2"/></>,
    trend:    <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    target:   <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    repeat:   <><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>,
    star:     <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    print:    <><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></>,
    logout:   <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    eye:      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    eyeoff:   <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>,
    cloud:    <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></>,
    chevL:    <><polyline points="15 18 9 12 15 6"/></>,
    chevR:    <><polyline points="9 18 15 12 9 6"/></>,
    chevD:    <><polyline points="6 9 12 15 18 9"/></>,
    menu:     <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    key:      <><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></>,
    check:    <><polyline points="20 6 9 12 4 9"/></>,
    creditcard:<><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    undo:     <><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.49"/></>,
    sync:     <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
    alert:    <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  };
  return <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={cls}>{p[n]}</svg>;
};

// ── CATEGORY ICONS ─────────────────────────────────────────
// Emoji used to do this job, and they were the one thing on screen nobody had
// designed: multicolour, cartoon-styled, and drawn differently by every OS, so
// next to a muted gold-and-near-black palette they read as stickers stuck onto
// the app rather than part of it.
//
// These are flat two-tone vectors instead, and they carry no colour of their
// own — currentColor takes the category's. A body shape at 30% opacity gives
// the silhouette its mass, and the detail that names the thing sits on top at
// full strength. One hue per icon, so a column of twenty stays quiet enough to
// scan down.
const CAT_SVG = {
  food:      <><path d="M2 11.2h20c0 5.7-4.5 9.6-10 9.6S2 16.9 2 11.2z" opacity=".3"/><rect x="1.4" y="10" width="21.2" height="2" rx="1"/><path d="M8 3.6v2.2M12 2.6v3.2M16 3.6v2.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity=".55"/></>,
  transport: <><path d="M4.6 11.4 6.2 7.2a2.4 2.4 0 0 1 2.2-1.6h7.2a2.4 2.4 0 0 1 2.2 1.6l1.6 4.2z" opacity=".3"/><path d="M2.4 12.8a2 2 0 0 1 2-2h15.2a2 2 0 0 1 2 2v3.8a1.4 1.4 0 0 1-1.4 1.4H3.8a1.4 1.4 0 0 1-1.4-1.4z"/><circle cx="6.9" cy="18.2" r="1.9"/><circle cx="17.1" cy="18.2" r="1.9"/></>,
  shopping:  <><path d="M4.4 9h15.2l-1.1 10.9a2.1 2.1 0 0 1-2.1 1.9H7.6a2.1 2.1 0 0 1-2.1-1.9z" opacity=".3"/><path d="M8.4 9.6V6.9a3.6 3.6 0 1 1 7.2 0v2.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><rect x="2.4" y="6.9" width="19.2" height="2.8" rx="1.1"/></>,
  home:      <><path d="M4.8 10.9 12 5.3l7.2 5.6V20a1.2 1.2 0 0 1-1.2 1.2H6A1.2 1.2 0 0 1 4.8 20z" opacity=".3"/><path d="M2.24 11.79a1 1 0 0 1 .17-1.4l9-7.1a1 1 0 0 1 1.24 0l9 7.1a1 1 0 1 1-1.24 1.57L12 5.37 3.64 11.96a1 1 0 0 1-1.4-.17z"/><rect x="10" y="14.6" width="4" height="6.6" rx=".8"/></>,
  utilities: <><path d="M12 2.4a7 7 0 0 1 4.2 12.6 2 2 0 0 0-.8 1.6v.2H8.6v-.2a2 2 0 0 0-.8-1.6A7 7 0 0 1 12 2.4z" opacity=".3"/><rect x="8.6" y="17.4" width="6.8" height="1.8" rx=".9"/><rect x="9.8" y="20" width="4.4" height="1.8" rx=".9"/><path d="M12 6.8v6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></>,
  phone:     <><rect x="5.6" y="2.2" width="12.8" height="19.6" rx="2.8" opacity=".3"/><rect x="5.6" y="2.2" width="12.8" height="19.6" rx="2.8" fill="none" stroke="currentColor" strokeWidth="1.8"/><rect x="9.6" y="4.8" width="4.8" height="1.4" rx=".7"/><circle cx="12" cy="18.4" r="1.1"/></>,
  internet:  <><path d="M12 4.4c4 0 7.6 1.5 10.3 3.9a1.2 1.2 0 0 1-1.6 1.8A13.2 13.2 0 0 0 12 6.8a13.2 13.2 0 0 0-8.7 3.3 1.2 1.2 0 1 1-1.6-1.8A15.5 15.5 0 0 1 12 4.4z" opacity=".3"/><path d="M12 9.8a10 10 0 0 1 6.6 2.5 1.2 1.2 0 0 1-1.6 1.8A7.6 7.6 0 0 0 12 12.2a7.6 7.6 0 0 0-5 1.9 1.2 1.2 0 1 1-1.6-1.8A10 10 0 0 1 12 9.8z" opacity=".6"/><path d="M12 15.2a4.8 4.8 0 0 1 3.1 1.1 1.2 1.2 0 0 1-1.6 1.8 2.4 2.4 0 0 0-3 0 1.2 1.2 0 1 1-1.6-1.8 4.8 4.8 0 0 1 3.1-1.1z"/><circle cx="12" cy="20.4" r="1.4"/></>,
  entertain: <><path d="M7.6 7h8.8a5.2 5.2 0 0 1 5.1 4.3l.7 3.9a3 3 0 0 1-5.5 2.2l-1.2-1.8H8.5l-1.2 1.8a3 3 0 0 1-5.5-2.2l.7-3.9A5.2 5.2 0 0 1 7.6 7z" opacity=".3"/><rect x="6.15" y="11.2" width="1.7" height="4.4" rx=".85"/><rect x="4.8" y="12.55" width="4.4" height="1.7" rx=".85"/><circle cx="16.3" cy="12.3" r="1.2"/><circle cx="18.4" cy="14.4" r="1.2"/></>,
  health:    <><path d="M12 21.2s-8.6-5-8.6-10.8A5.2 5.2 0 0 1 12 7.1a5.2 5.2 0 0 1 8.6 3.3c0 5.8-8.6 10.8-8.6 10.8z" opacity=".3"/><path d="M11 10.2h2v2.3h2.3v2H13v2.3h-2v-2.3H8.7v-2H11z"/></>,
  education: <><path d="M3 4.8a1.4 1.4 0 0 1 1.4-1.4h4.8a2.6 2.6 0 0 1 2.6 2.6v13.4a2.2 2.2 0 0 0-2.2-1.4H3z" opacity=".3"/><path d="M21 4.8a1.4 1.4 0 0 0-1.4-1.4h-4.8a2.6 2.6 0 0 0-2.6 2.6v13.4a2.2 2.2 0 0 1 2.2-1.4H21z" opacity=".3"/><rect x="11.1" y="5.6" width="1.8" height="15.2" rx=".9"/></>,
  subscription: <><circle cx="12" cy="12" r="9.2" opacity=".3"/><path d="M7.6 10.8A4.8 4.8 0 0 1 16 9.3M16.4 13.2A4.8 4.8 0 0 1 8 14.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M16.9 6.4l.4 3.3-3.3-.5zM7.1 17.6l-.4-3.3 3.3.5z"/></>,
  invest:    <><path d="M3 20.4v-7.2a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v7.2zM9.8 20.4V9.6a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v10.8zM16.6 20.4V6.2a1 1 0 0 1 1-1H20a1 1 0 0 1 1 1v14.2z" opacity=".3"/><path d="M4 15.6a1 1 0 0 1-.6-1.8l5.3-3.9a1 1 0 0 1 1.2 0l3.2 2.3 5-4.3a1 1 0 0 1 1.3 1.5l-5.6 4.8a1 1 0 0 1-1.24.05L9.3 12.1l-4.7 3.4a1 1 0 0 1-.6.1z"/></>,
  salary:    <><rect x="2.2" y="5.4" width="19.6" height="13.2" rx="2.2" opacity=".3"/><rect x="2.2" y="5.4" width="19.6" height="13.2" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="12" r="2.9"/><circle cx="6.2" cy="12" r="1.1"/><circle cx="17.8" cy="12" r="1.1"/></>,
  gift:      <><path d="M3.6 11.8h16.8v7.8a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8z" opacity=".3"/><rect x="2.2" y="7.4" width="19.6" height="4.6" rx="1.2"/><rect x="10.4" y="7.4" width="3.2" height="14" rx=".7"/><path d="M12 7.4S10.6 3 8.2 3a2.2 2.2 0 0 0 0 4.4zM12 7.4S13.4 3 15.8 3a2.2 2.2 0 0 1 0 4.4z"/></>,
  work:      <><rect x="2.2" y="7.2" width="19.6" height="13.4" rx="2.2" opacity=".3"/><path d="M8.6 7.2V5.6a2.4 2.4 0 0 1 2.4-2.4h2a2.4 2.4 0 0 1 2.4 2.4v1.6h-1.9V5.6a.5.5 0 0 0-.5-.5h-2a.5.5 0 0 0-.5.5v1.6z"/><path d="M2.2 10.4h19.6v2.4a1 1 0 0 1-.7.96 27.6 27.6 0 0 1-18.2 0 1 1 0 0 1-.7-.96z"/></>,
  coffee:    <><path d="M3.4 8h13.2v6.4a5.4 5.4 0 0 1-5.4 5.4H8.8a5.4 5.4 0 0 1-5.4-5.4z" opacity=".3"/><path d="M17 9.4h1.6a2.8 2.8 0 0 1 0 5.6H17v-1.9h1.6a.9.9 0 0 0 0-1.8H17z"/><rect x="2.6" y="20.4" width="15" height="1.8" rx=".9"/><path d="M7.6 2.8v2.4M12 2.2v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".55"/></>,
  pet:       <><path d="M12 12.4c3 0 5.5 2.4 5.5 4.9a3 3 0 0 1-3 3 8.4 8.4 0 0 1-2.5-.5 8.4 8.4 0 0 1-2.5.5 3 3 0 0 1-3-3c0-2.5 2.5-4.9 5.5-4.9z" opacity=".3"/><ellipse cx="6.3" cy="9.6" rx="2.1" ry="2.7"/><ellipse cx="17.7" cy="9.6" rx="2.1" ry="2.7"/><ellipse cx="10.2" cy="5.8" rx="1.9" ry="2.5"/><ellipse cx="13.8" cy="5.8" rx="1.9" ry="2.5"/></>,
  fitness:   <><rect x="7.2" y="10.4" width="9.6" height="3.2" rx="1.2" opacity=".3"/><rect x="7.2" y="11" width="9.6" height="2" rx="1"/><rect x="3.6" y="7.6" width="3.4" height="8.8" rx="1.4"/><rect x="17" y="7.6" width="3.4" height="8.8" rx="1.4"/><rect x="1.2" y="9.8" width="2.2" height="4.4" rx="1.1" opacity=".55"/><rect x="20.6" y="9.8" width="2.2" height="4.4" rx="1.1" opacity=".55"/></>,
  travel:    <><path d="M20 10.4a1.6 1.6 0 0 1 0 3.2h-5.2l-3 6.6a.8.8 0 0 1-.73.47H8.9a.6.6 0 0 1-.57-.79l2.1-6.28H6.6l-1.5 2.2a.8.8 0 0 1-.66.35H2.9a.6.6 0 0 1-.57-.79L3.4 12l-1.07-3.36a.6.6 0 0 1 .57-.79h1.54a.8.8 0 0 1 .66.35l1.5 2.2h3.83L8.33 4.12a.6.6 0 0 1 .57-.79h2.17a.8.8 0 0 1 .73.47l3 6.6z"/></>,
  movie:     <><rect x="2.2" y="8.6" width="19.6" height="12.6" rx="2.2" opacity=".3"/><path d="M3.5 4.2 20 6.7a1.4 1.4 0 0 1 1.2 1.6l-.2 1.4L2.6 6.9l.2-1.4a1.4 1.4 0 0 1 .7-1.3z"/><rect x="5" y="12.4" width="3.2" height="3.2" rx=".8"/><rect x="10.4" y="12.4" width="3.2" height="3.2" rx=".8"/><rect x="15.8" y="12.4" width="3.2" height="3.2" rx=".8"/></>,
  music:     <><circle cx="6.4" cy="17.6" r="3.4" opacity=".3"/><circle cx="17.4" cy="15.6" r="3.4" opacity=".3"/><path d="M8.8 17.8V7.4l10-2v10.2h-2V7.8l-6 1.2v8.8z"/></>,
  water:     <><path d="M12 2.6s7 7.4 7 12.1a7 7 0 0 1-14 0C5 10 12 2.6 12 2.6z" opacity=".3"/><path d="M12 8.4s3.6 4.2 3.6 6.6a3.6 3.6 0 0 1-7.2 0c0-2.4 3.6-6.6 3.6-6.6z"/></>,
  power:     <><path d="M13.4 2 4.8 13.2a.9.9 0 0 0 .7 1.5h4.4l-.9 7.3 8.6-11.2a.9.9 0 0 0-.7-1.5h-4.4z" opacity=".3"/><path d="M12.6 4.6 7.4 11.4h3.9a.9.9 0 0 1 .9 1l-.4 3.4 4.4-5.8h-3.4a.9.9 0 0 1-.9-1z"/></>,
  fuel:      <><rect x="3" y="3.4" width="10.6" height="17.4" rx="2.2" opacity=".3"/><rect x="2" y="20" width="12.6" height="1.9" rx=".95"/><rect x="5" y="6.2" width="6.6" height="4.6" rx="1"/><path d="M15.4 8.2l2.6 2.6a2 2 0 0 1 .6 1.4v4.6a1.6 1.6 0 0 0 3.2 0v-6.4l-2.4-2.4M15.4 5.6l2 2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></>,
  insurance: <><path d="M12 2.4 20.4 5v6.7c0 5-3.5 8.7-8.4 10.1-4.9-1.4-8.4-5.1-8.4-10.1V5z" opacity=".3"/><path d="M10.9 15.6 7.6 12.3l1.5-1.5 1.8 1.8 4.4-4.4 1.5 1.5z"/></>,
  tax:       <><path d="M4.4 2.6h15.2v18.2l-2.5-1.6-2.5 1.6-2.6-1.6-2.5 1.6-2.6-1.6-2.5 1.6z" opacity=".3"/><rect x="7.4" y="7" width="9.2" height="1.9" rx=".95"/><rect x="7.4" y="11" width="9.2" height="1.9" rx=".95"/><rect x="7.4" y="15" width="5.6" height="1.9" rx=".95"/></>,
  beauty:    <><path d="M12 2.2l2.1 5.9 5.9 2.1-5.9 2.1L12 18.2l-2.1-5.9L4 10.2l5.9-2.1z" opacity=".3"/><path d="M12 5.6l1.3 3.6 3.6 1.3-3.6 1.3-1.3 3.6-1.3-3.6-3.6-1.3 3.6-1.3z"/><path d="M18.8 16.2l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" opacity=".6"/></>,
  family:    <><circle cx="8.4" cy="7.4" r="3.4" opacity=".3"/><circle cx="16.6" cy="8.6" r="2.8" opacity=".3"/><path d="M2.6 20.4a5.8 5.8 0 0 1 11.6 0 1 1 0 0 1-1 1h-9.6a1 1 0 0 1-1-1z"/><path d="M15.4 13.4a4.8 4.8 0 0 1 6 4.7v2.3a1 1 0 0 1-1 1h-3.9a7.6 7.6 0 0 0-1.7-6.4z" opacity=".7"/></>,
  laptop:    <><rect x="4" y="4.2" width="16" height="11.2" rx="1.8" opacity=".3"/><rect x="4" y="4.2" width="16" height="11.2" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M1.6 17.2h20.8a.9.9 0 0 1 .85 1.2 2.4 2.4 0 0 1-2.27 1.6H3.02a2.4 2.4 0 0 1-2.27-1.6.9.9 0 0 1 .85-1.2z"/></>,
  other:     <><circle cx="12" cy="12" r="9.2" opacity=".3"/><circle cx="12" cy="12" r="3.4"/></>,
};
// Values saved before this existed are emoji strings, and a category can still
// be given any emoji by typing one — so anything not in the set is drawn as
// text rather than dropped.
const CatIc = ({ n, s=18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{CAT_SVG[n]}</svg>
);
const CatGlyph = ({ v, s=18, color }) => (
  <span className="inline-flex items-center justify-center flex-shrink-0" style={{color, width:s, height:s, fontSize:s*0.92, lineHeight:1}}>
    {CAT_SVG[v] ? <CatIc n={v} s={s}/> : TYPE_SVG[v] ? <TypeIc n={v} s={s}/> : (v||'●')}
  </span>
);
const CAT_ICON_KEYS = Object.keys(CAT_SVG);

// ── TYPE ICONS ─────────────────────────────────────────────
// Wallet, asset and debt types, in the same two-tone currentColor idiom as
// CAT_SVG — a soft shape at 30% carrying the silhouette, solid detail on top.
//
// These replace the emoji that were standing in for them. Emoji are full-colour
// artwork drawn by the operating system: 📈💵📦💼🔒💰👛💳 put eight unrelated
// palettes on a screen whose colours were argued over all day, and each one
// looks different on Windows, on a Mac and on a phone, so the app had no say in
// its own iconography. Drawn in currentColor they take the type's colour from
// the ramp and are the same everywhere.
//
// Kept apart from CAT_SVG deliberately: those keys feed the category icon
// picker, and a wallet type has no business being offered as an icon for a
// spending category.
const TYPE_SVG = {
  bank:    <><path d="M4.2 10.4h15.6v8.2H4.2z" opacity=".3"/><path d="M11.5 2.6a1 1 0 0 1 1 0l9 4.9a1 1 0 0 1-.48 1.88H2.98A1 1 0 0 1 2.5 7.5z"/><rect x="5.6" y="11" width="2.2" height="6.4" rx="1"/><rect x="10.9" y="11" width="2.2" height="6.4" rx="1"/><rect x="16.2" y="11" width="2.2" height="6.4" rx="1"/><rect x="3" y="18.8" width="18" height="2.4" rx="1.2"/></>,
  cash:    <><rect x="2.2" y="6" width="19.6" height="12" rx="2.2" opacity=".3"/><rect x="2.2" y="6" width="19.6" height="12" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="12" r="2.8"/><circle cx="5.9" cy="12" r="1"/><circle cx="18.1" cy="12" r="1"/></>,
  stock:   <><path d="M3 20.2V13l4.6-3.4 4.4 3 4.6-5.2L21 4.8v15.4z" opacity=".3"/><path d="M2.9 14.2a1 1 0 0 1 .2-1.4l4.6-3.4a1 1 0 0 1 1.16-.02l3.62 2.47 4.03-4.55a1 1 0 1 1 1.5 1.32l-4.6 5.2a1 1 0 0 1-1.31.16L8.3 11.44l-4 2.96a1 1 0 0 1-1.4-.2z"/><circle cx="17.4" cy="7.6" r="1.9"/></>,
  credit:  <><rect x="2.2" y="4.6" width="19.6" height="14.8" rx="2.6" opacity=".3"/><rect x="2.2" y="4.6" width="19.6" height="14.8" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.7"/><rect x="2.2" y="8.2" width="19.6" height="2.8"/><rect x="5" y="14" width="5.2" height="2" rx="1"/></>,
  crypto:  <><path d="M12 2.4 20 5.6v6.1c0 4.4-3.1 8.4-8 9.9-4.9-1.5-8-5.5-8-9.9V5.6z" opacity=".3"/><path d="M12 2.4 20 5.6v6.1c0 4.4-3.1 8.4-8 9.9-4.9-1.5-8-5.5-8-9.9V5.6z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M10 8.4h3.1a2.1 2.1 0 0 1 0 4.2H10zm0 4.2h3.4a2.1 2.1 0 0 1 0 4.2H10zm1.1-6.5v2m0 9v2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></>,
  ewallet: <><rect x="5.4" y="2.2" width="13.2" height="19.6" rx="2.8" opacity=".3"/><rect x="5.4" y="2.2" width="13.2" height="19.6" rx="2.8" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M10.4 7.6h2.7a1.9 1.9 0 0 1 0 3.8h-2.7zm0 3.8h3a1.9 1.9 0 0 1 0 3.8h-3zm1-5.6v1.8m0 7.6v1.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>,
  fund:    <><path d="M12 3a9 9 0 1 1-9 9h9z" opacity=".3"/><path d="M12 2a1 1 0 0 1 1-1 11 11 0 0 1 11 11 1 1 0 0 1-1 1H13a1 1 0 0 1-1-1z" transform="translate(-1 1)"/><path d="M11 12.6 3.6 12a9 9 0 0 0 8.4 9.6" fill="none" stroke="currentColor" strokeWidth="1.7"/></>,
  fixed:   <><rect x="4" y="10.2" width="16" height="10.6" rx="2.4" opacity=".3"/><rect x="4" y="10.2" width="16" height="10.6" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M7.8 10V7.4a4.2 4.2 0 0 1 8.4 0V10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="15.4" r="1.7"/></>,
  savings: <><circle cx="12" cy="12" r="9" opacity=".3"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="12" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="1.9"/></>,
  wallet:  <><path d="M3 7.4a2.4 2.4 0 0 1 2.4-2.4h12.2A2.4 2.4 0 0 1 20 7.4v11.2a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 18.6z" opacity=".3"/><path d="M3 7.4a2.4 2.4 0 0 1 2.4-2.4h12.2A2.4 2.4 0 0 1 20 7.4v11.2a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 18.6z" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M15 11h5.6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H15a2 2 0 0 1 0-4z"/></>,
  gold:    <><path d="M6.4 8.6h11.2l2.2 4.6-7.8 7-7.8-7z" opacity=".3"/><path d="M6.4 8.6h11.2l2.2 4.6-7.8 7-7.8-7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M6.4 8.6 12 3.4l5.6 5.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9.6 13.2h4.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></>,
  box:     <><path d="M3.4 7.8 12 4l8.6 3.8v8.4L12 20l-8.6-3.8z" opacity=".3"/><path d="M3.4 7.8 12 4l8.6 3.8v8.4L12 20l-8.6-3.8z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M3.4 7.8 12 11.6l8.6-3.8M12 11.6V20" fill="none" stroke="currentColor" strokeWidth="1.6"/></>,
  car:     <><path d="M4.6 11.4 6.2 7.2a2.4 2.4 0 0 1 2.2-1.6h7.2a2.4 2.4 0 0 1 2.2 1.6l1.6 4.2z" opacity=".3"/><path d="M2.4 12.8a2 2 0 0 1 2-2h15.2a2 2 0 0 1 2 2v3.8a1.4 1.4 0 0 1-1.4 1.4H3.8a1.4 1.4 0 0 1-1.4-1.4z"/><circle cx="6.9" cy="18.2" r="1.9"/><circle cx="17.1" cy="18.2" r="1.9"/></>,
  house:   <><path d="M4.8 10.9 12 5.3l7.2 5.6V20a1.2 1.2 0 0 1-1.2 1.2H6A1.2 1.2 0 0 1 4.8 20z" opacity=".3"/><path d="M2.24 11.79a1 1 0 0 1 .17-1.4l9-7.1a1 1 0 0 1 1.24 0l9 7.1a1 1 0 1 1-1.24 1.57L12 5.37 3.64 11.96a1 1 0 0 1-1.4-.17z"/><rect x="10" y="14.6" width="4" height="6.6" rx=".8"/></>,
  briefcase:<><rect x="2.6" y="7.2" width="18.8" height="12.6" rx="2.2" opacity=".3"/><rect x="2.6" y="7.2" width="18.8" height="12.6" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M8.6 7V5.8a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2V7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><rect x="2.6" y="12" width="18.8" height="1.9"/></>,
};
const TypeIc = ({ n, s=18, cls='' }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={cls} aria-hidden="true">{TYPE_SVG[n]}</svg>
);

// ── DATE RANGE PICKER ──────────────────────────────────────
// Two native date fields used to do this. Empty they rendered as the browser's
// own mm/dd/yyyy — US order, greyed, unstyleable — and saying "this month" meant
// typing its first and last day separately, four gestures for one idea.
//
// A calendar answers it in two clicks: one day opens the range, the next closes
// it. Month and year are dropdowns inside the popover rather than arrows only,
// because reaching last December through ‹ eight times is not navigation.
const DOW_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];
const isoDay  = (y,m,d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const lastDayOfMonth = (y,m) => new Date(y, m+1, 0).getDate();
// Local, never toISOString(): Thailand is UTC+7, so after 5pm that returns
// tomorrow and "today" highlights the wrong square.
const todayIso = () => { const d=new Date(); return isoDay(d.getFullYear(), d.getMonth(), d.getDate()); };
const isWholeMonth = (from,to) => !!from && !!to
  && from.slice(8)==='01' && from.slice(0,7)===to.slice(0,7)
  && +to.slice(8) === lastDayOfMonth(+from.slice(0,4), +from.slice(5,7)-1);

const rangeLabel = (from,to) => {
  // "ทุกวัน" read as a frequency — the thing รายการประจำ does — rather than as
  // no date filter. The other filters in the same row already say ทุกหมวด and
  // ทุกกระเป๋า, so this joins them.
  if (!from && !to) return 'ทุกวันที่';
  const part = s => ({ y:+s.slice(0,4), m:+s.slice(5,7)-1, d:+s.slice(8) });
  const a = part(from||to), b = part(to||from);
  if (from === to) return `${a.d} ${MONTHS_TH[a.m]} ${a.y}`;
  if (isWholeMonth(from,to)) return `${MONTHS_TH[a.m]} ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS_TH[a.m]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS_TH[a.m]} – ${b.d} ${MONTHS_TH[b.m]} ${a.y}`;
  return `${a.d} ${MONTHS_TH[a.m]} ${a.y} – ${b.d} ${MONTHS_TH[b.m]} ${b.y}`;
};

const DateRangePicker = ({from, to, onPick, dk, years=[]}) => {
  const [open, setOpen]     = useState(false);
  const [anchor, setAnchor] = useState(null);   // the day that opened a range, awaiting its second click
  const [vy, setVy] = useState(() => +(from||todayIso()).slice(0,4));
  const [vm, setVm] = useState(() => +(from||todayIso()).slice(5,7)-1);
  const box = useRef(null);
  const btn = useRef(null);
  // The filter row scrolls sideways (overflow-x-auto), and an overflow other
  // than visible on one axis clips the other too — so a popover positioned
  // inside it was cropped to nothing and pressing the button looked dead.
  // Fixed to the viewport instead, placed from the button's own rectangle.
  const [pos, setPos] = useState({top:0, left:0});
  const place = () => {
    const r = btn.current?.getBoundingClientRect(); if(!r) return;
    const W = 278, pad = 8;
    setPos({
      top:  Math.min(r.bottom + 6, window.innerHeight - 340),
      left: Math.max(pad, Math.min(r.left, window.innerWidth - W - pad)),
    });
  };
  const [hover, setHover] = useState(null);   // day under the cursor, for previewing the range
  // Opening lands on the month being filtered, not wherever it was left last time.
  // Deliberately keyed on `open` alone: the first click of a range changes `from`,
  // and while this also watched `from` that change re-ran the reset and cleared
  // the anchor — so the second click always began a new single day instead of
  // closing the range, and a range could never be picked at all.
  useEffect(()=>{ if(open){ const b = from||todayIso(); setVy(+b.slice(0,4)); setVm(+b.slice(5,7)-1); setAnchor(null); setHover(null); } },[open]);
  useEffect(()=>{
    if(!open) return;
    const away = e => { if(box.current && !box.current.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    const esc  = e => { if(e.key==='Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return ()=>{ document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc);
                 window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  },[open]);

  const step = n => { const d = new Date(vy, vm+n, 1); setVy(d.getFullYear()); setVm(d.getMonth()); };
  const clickDay = d => {
    const s = isoDay(vy, vm, d);
    // First click shows the single day straight away, so a one-day filter is one
    // click and never needs the second to "finish"
    if (!anchor) { setAnchor(s); onPick(s, s); return; }
    onPick(anchor <= s ? anchor : s, anchor <= s ? s : anchor);
    setAnchor(null); setHover(null); setOpen(false);
  };
  const wholeMonth = () => { onPick(isoDay(vy,vm,1), isoDay(vy,vm,lastDayOfMonth(vy,vm))); setAnchor(null); setOpen(false); };

  const active = !!from || !!to;
  const tIso   = todayIso();
  const lead   = new Date(vy, vm, 1).getDay();
  const days   = lastDayOfMonth(vy, vm);
  const cells  = [...Array(lead).fill(null), ...Array.from({length:days}, (_,i)=>i+1)];
  const yearList = years.length ? years : [vy];
  const selCls = `appearance-none pl-2 pr-5 py-1 rounded-lg text-xs font-semibold outline-none cursor-pointer bg-no-repeat bg-[right_0.3rem_center] ${dk?'bg-white/10 text-white':'bg-slate-100 text-slate-700'}`;
  const caret  = {backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='9' viewBox='0 0 24 24' fill='none' stroke='%23${dk?'94a3b8':'64748b'}' stroke-width='3' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundSize:'9px'};
  const navCls = `w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${dk?'text-slate-400 hover:bg-white/10 hover:text-white':'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`;

  return (
    <>
      <button ref={btn} onClick={()=>{ if(!open) place(); setOpen(o=>!o); }}
        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border whitespace-nowrap ${active?(dk?'bg-gold-500/20 text-gold-300 border-gold-500/30':'bg-gold-50 text-gold-600 border-gold-200'):(dk?'bg-white/5 text-slate-400 border-white/10 hover:text-white':'bg-slate-100 text-slate-700 border-slate-200 hover:text-slate-800')}`}>
        {rangeLabel(from,to)}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {/* Rendered on <body>, not here. position:fixed anchors to the viewport
          only while no ancestor has a transform, filter or backdrop-filter —
          this page animates in under fade-up, whose transform quietly made that
          card the containing block, so the calendar landed hundreds of pixels
          off and behind the rows. A portal has no ancestors to inherit. */}
      {open&&ReactDOM.createPortal(
        <div ref={box} style={{position:'fixed', top:pos.top, left:pos.left, zIndex:60}}
          className={`w-[278px] rounded-2xl shadow-2xl p-3 ${dk?'bg-[#0c1018] border border-white/10':'bg-white border border-slate-200'}`}>
          <div className="flex items-center justify-between gap-1 mb-2">
            <button onClick={()=>step(-1)} className={navCls} title="เดือนก่อน">‹</button>
            <div className="flex gap-1.5">
              <select value={vm} onChange={e=>setVm(+e.target.value)} className={selCls} style={caret}>
                {MONTHS_TH.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select>
              <select value={vy} onChange={e=>setVy(+e.target.value)} className={selCls} style={caret}>
                {(yearList.includes(vy)?yearList:[vy,...yearList]).map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={()=>step(1)} className={navCls} title="เดือนถัดไป">›</button>
          </div>
          <div className={`grid grid-cols-7 gap-0.5 mb-1 text-[10px] font-semibold text-center ${dk?'text-slate-500':'text-slate-400'}`}>
            {DOW_TH.map(d=><div key={d} className="py-0.5">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d,i)=>{
              if(d===null) return <div key={`x${i}`}/>;
              const s    = isoDay(vy,vm,d);
              // Mid-pick the band follows the cursor, so the range being drawn is
              // visible before it is committed rather than after
              const lo = anchor&&hover ? (anchor<=hover?anchor:hover) : from;
              const hi = anchor&&hover ? (anchor<=hover?hover:anchor) : to;
              const isIn = lo && hi && s>=lo && s<=hi;
              const isEnd= s===lo || s===hi;
              const isTd = s===tIso;
              return (
                <button key={s} onClick={()=>clickDay(d)} onMouseEnter={()=>anchor&&setHover(s)}
                  className={`h-8 rounded-lg text-xs tabular-nums transition-colors ${
                    isEnd ? 'bg-gold-500 text-[#241c0a] font-bold'
                    : isIn ? (dk?'bg-gold-500/20 text-gold-200':'bg-gold-100 text-gold-700')
                    : isTd ? (dk?'text-gold-300 font-bold ring-1 ring-gold-500/40':'text-gold-600 font-bold ring-1 ring-gold-300')
                    : (dk?'text-slate-300 hover:bg-white/10':'text-slate-600 hover:bg-slate-100')}`}>
                  {d}
                </button>
              );
            })}
          </div>
          <div className={`flex items-center justify-between gap-2 mt-2 pt-2 border-t ${dk?'border-white/8':'border-slate-100'}`}>
            <span className={`text-[10px] ${dk?'text-slate-500':'text-slate-400'}`}>{anchor?'เลือกวันสิ้นสุด':'คลิก 2 วันเพื่อเลือกช่วง'}</span>
            <button onClick={wholeMonth} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${dk?'bg-white/10 hover:bg-white/15 text-slate-200':'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>ทั้งเดือน</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

// ── LOGO ───────────────────────────────────────────────────
const LogoSvg = ({size=32}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    {/* The mark used to be white on #0d1b2e — a navy that appears nowhere else
        in the app, which made the logo the one thing outside its own palette.
        Gold on near-black is the identity everything else already uses, and it
        is far more distinctive on a phone home screen than white on blue. */}
    <rect width="100" height="100" fill="#05080f" rx="10"/>
    {/* Geometric F: top bar → gap → middle bar → vertical stroke */}
    <polygon points="34,24 73,24 65,35 38,35 38,41 63,41 55,52 38,52 38,76 30,76 30,29" fill="#c9a94b"/>
  </svg>
);

// ── CHARTS ─────────────────────────────────────────────────
const BarChart = ({ data, theme, hide=false }) => {
  const ref = useRef(); const ch = useRef();
  useEffect(() => {
    if (!ref.current||!data) return;
    if (ch.current) ch.current.destroy();
    const dk = theme==='dark';
    ch.current = new Chart(ref.current, { type:'bar', data: {
      labels: data.labels,
      datasets: [
        { label:'รายรับ', data:data.income, backgroundColor:dk?'rgba(201,169,74,0.75)':'rgba(201,169,74,0.65)', borderRadius:8, borderSkipped:false, barPercentage:0.65 },
        { label:'รายจ่าย', data:data.expense, backgroundColor:dk?'rgba(201,114,106,0.75)':'rgba(201,114,106,0.65)', borderRadius:8, borderSkipped:false, barPercentage:0.65 },
      ]}, options:{ responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{ labels:{ color:dk?'#94a3b8':'#64748b', usePointStyle:true, pointStyle:'circle', padding:20, font:{size:11,family:"'Noto Sans Thai',sans-serif"} } },
          tooltip:{
            backgroundColor:dk?'rgba(13,27,46,0.95)':'rgba(255,255,255,0.97)',
            titleColor:dk?'#e2e8f0':'#1e293b', bodyColor:dk?'#94a3b8':'#64748b',
            borderColor:dk?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)',
            borderWidth:1, padding:10, cornerRadius:10,
            callbacks:{ label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` }
          }
        },
        scales:{
          x:{ grid:{display:false}, border:{display:false}, ticks:{color:dk?'#475569':'#94a3b8', font:{size:11,family:"'Noto Sans Thai',sans-serif"}} },
          y:{ grid:{color:dk?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)'}, border:{display:false},
              ticks:{color:dk?'#475569':'#94a3b8', font:{size:11,family:"'Noto Sans Thai',sans-serif"}, callback:v=>v>=1000?(v/1000).toFixed(0)+(hide?'':'K'):v} }
        }
      }
    });
    return () => ch.current?.destroy();
  }, [data, theme, hide]);
  return <canvas ref={ref}/>;
};

const DonutChart = ({ data, theme, centerValue, hideAmt=false }) => {
  const ref = useRef(); const ch = useRef();
  const activeRef = useRef(null);   // slice under the pointer, or null for the total
  const containerRef = useRef();
  const dk = theme==='dark';
  const [narrow, setNarrow] = useState(false);
  useEffect(()=>{
    if(!containerRef.current) return;
    const ro = new ResizeObserver(es=>setNarrow(es[0].contentRect.width < 500));
    ro.observe(containerRef.current);
    return ()=>ro.disconnect();
  },[]);
  useEffect(() => {
    if (!ref.current||!data||!data.labels.length) return;
    if (ch.current) ch.current.destroy();
    const displayCenter = hideAmt ? '฿ •••••' : centerValue;
    const total = data.values.reduce((s,v)=>s+v,0);
    // Labels drawn in the hole rather than around the rim. Leader lines out to
    // the edge are the handsomer arrangement and they work at four slices; at
    // thirteen, four of them under 1%, the lines for the thin slices have to
    // travel furthest and end up crossing each other and the labels. The centre
    // is empty, always in the same place, and has room for the amount as well
    // as the name — which the rim never would have.
    const centerPlugin = centerValue ? [{
      id:'centerText',
      beforeDraw(chart){
        const {ctx,chartArea:{top,right,bottom,left}} = chart;
        const cx=(left+right)/2, cy=(top+bottom)/2;
        const i = activeRef.current;
        const on = i!=null && data.labels[i]!=null;
        // A long category name would run out past the ring, so it is cut to fit
        // the hole rather than allowed to overlap the slices it describes.
        const name = on ? (data.labels[i].length>14 ? data.labels[i].slice(0,13)+'…' : data.labels[i]) : 'รวม';
        const amt  = on ? (hideAmt ? '฿ •••••' : fmt(data.values[i])) : displayCenter;
        const pct  = on && total>0 ? (data.values[i]/total*100).toFixed(1)+'%' : null;
        ctx.save();
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font=`10px 'Noto Sans Thai',sans-serif`;
        ctx.fillStyle = on ? (data.colors[i]||'#c9a94b') : (dk?'#64748b':'#94a3b8');
        ctx.fillText(name, cx, cy-13);
        ctx.font=`600 13px 'Noto Sans Thai',sans-serif`;
        ctx.fillStyle=dk?'#f1f5f9':'#1e293b';
        ctx.fillText(amt, cx, cy+4);
        if(pct){
          ctx.font=`10px 'Noto Sans Thai',sans-serif`;
          ctx.fillStyle=dk?'#64748b':'#94a3b8';
          ctx.fillText(pct, cx, cy+19);
        }
        ctx.restore();
      }
    }] : [];
    ch.current = new Chart(ref.current, { type:'doughnut', data: {
      labels:data.labels,
      datasets:[{ data:data.values, backgroundColor:data.colors, borderWidth:0, hoverOffset:6, borderRadius:4 }]
    }, options:{ responsive:true, maintainAspectRatio:false, cutout:'68%',
      // The index is held in a ref, not in state: state would rebuild the chart
      // on every pixel of mouse movement. draw() is called directly, and only
      // when the slice under the pointer actually changes.
      onHover:(e,els,chart)=>{
        const idx = els.length ? els[0].index : null;
        if(activeRef.current !== idx){ activeRef.current = idx; chart.draw(); }
      },
      plugins:{
        legend:{ display:false },
        // No tooltip. It carried the same two facts the centre now shows, in a
        // box that follows the cursor and covers the slices next to the one
        // being read.
        tooltip:{ enabled:false }
      }
    }, plugins: centerPlugin });
    return () => ch.current?.destroy();
  }, [data, theme, centerValue, hideAmt]);
  const total = data?.values?.reduce((s,v)=>s+v,0)||0;
  const legendItems = (data?.labels||[]).map((label,i)=>{
    const val = data.values[i];
    const pct = total>0?(val/total*100).toFixed(1):'0.0';
    return (
      <div key={i} style={{display:'flex',alignItems:'center',gap:'7px',minWidth:0}}>
        <span style={{display:'inline-block',width:'14px',height:'2.5px',borderRadius:'2px',background:data.colors[i],flexShrink:0}}/>
        <span style={{fontSize:'11px',fontFamily:"'Noto Sans Thai',sans-serif",color:dk?'#94a3b8':'#64748b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {narrow
            ? <>{label} <span style={{color:dk?'#c9a94b':'#d1b768'}}>{pct}%</span></>
            : hideAmt
              ? `${label}  ******`
              : <>{label}  {fmt(val)}  <span style={{color:dk?'#c9a94b':'#d1b768'}}>({pct}%)</span></>
          }
        </span>
      </div>
    );
  });
  // minHeight, not height. The wide layout was pinned to 200px with the legend
  // set to overflow:hidden, so a month with more categories than fit simply lost
  // the last few — and they were the small ones at the bottom, which is exactly
  // where an unfamiliar charge hides. The row grows with the legend now.
  //
  // The donut takes a fixed 200px square rather than height:100%, which would
  // have made it grow to match the legend: thirteen categories would have
  // inflated it to a 300px circle to no purpose.
  return (
    <div ref={containerRef} style={narrow?{display:'flex',flexDirection:'column',gap:'10px'}:{display:'flex',minHeight:'200px',alignItems:'center',gap:'12px'}}>
      <div style={narrow?{height:'160px',width:'160px',margin:'0 auto',flexShrink:0}:{flex:'0 0 auto',height:'200px',width:'200px'}}>
        <canvas ref={ref} style={{height:'100%',width:'100%'}}/>
      </div>
      <div style={narrow?{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'7px 8px'}:{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:'8px',justifyContent:'center'}}>
        {legendItems}
      </div>
    </div>
  );
};

const LineChart = ({ data, theme }) => {
  const ref = useRef(); const ch = useRef();
  useEffect(() => {
    if (!ref.current||!data) return;
    if (ch.current) ch.current.destroy();
    const dk = theme==='dark';
    ch.current = new Chart(ref.current, { type:'line', data: {
      labels: data.labels,
      datasets:[
        { label:'รายรับ', data:data.income, borderColor:'#c9a94b', backgroundColor: dk?'rgba(201,169,74,0.12)':'rgba(201,169,74,0.08)', fill:true, tension:0.4, pointRadius:0, pointHoverRadius:4, pointHoverBackgroundColor:'#c9a94b', borderWidth:2 },
        { label:'รายจ่าย', data:data.expense, borderColor:'#c9726a', backgroundColor: dk?'rgba(201,114,106,0.12)':'rgba(201,114,106,0.08)', fill:true, tension:0.4, pointRadius:0, pointHoverRadius:4, pointHoverBackgroundColor:'#c9726a', borderWidth:2 },
      ]}, options:{ responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{
          legend:{ labels:{ color:dk?'#94a3b8':'#64748b', usePointStyle:true, pointStyle:'circle', padding:20, font:{size:11,family:"'Noto Sans Thai',sans-serif"} } },
          tooltip:{
            backgroundColor: dk?'rgba(13,27,46,0.95)':'rgba(255,255,255,0.97)',
            titleColor: dk?'#e2e8f0':'#1e293b',
            bodyColor: dk?'#94a3b8':'#64748b',
            borderColor: dk?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)',
            borderWidth:1, padding:10, cornerRadius:10,
            callbacks:{ label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` }
          }
        },
        scales:{
          x:{ grid:{display:false}, border:{display:false}, ticks:{color:dk?'#475569':'#94a3b8', font:{size:11,family:"'Noto Sans Thai',sans-serif"}} },
          y:{ grid:{color:dk?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)'}, border:{display:false},
              ticks:{color:dk?'#475569':'#94a3b8', font:{size:11,family:"'Noto Sans Thai',sans-serif"}, callback:v=>(v>=1000?(v/1000).toFixed(0)+'K':v)} }
        }
      }
    });
    return () => ch.current?.destroy();
  }, [data, theme]);
  return <canvas ref={ref}/>;
};

// ── PROJECTION CHART ───────────────────────────────────────
// Two lines rather than a stacked bar per year: the story is the gap opening
// between what was paid in and what it became, and a gap is a shape, not a
// column height you have to compare against the one beside it. The band between
// them is filled because that band *is* the compound return.
//
// Hovering names all three figures for that year — contributed, returned, total
// — since the whole question is which of them is doing the work by year twenty.
const PlanChart = ({ data, theme }) => {
  const ref = useRef(); const ch = useRef();
  useEffect(() => {
    if (!ref.current||!data) return;
    if (ch.current) ch.current.destroy();
    const dk = theme==='dark';
    const axis = { color:dk?'#475569':'#94a3b8', font:{size:11,family:"'Noto Sans Thai',sans-serif"} };
    ch.current = new Chart(ref.current, { type:'line', data:{
      labels: data.labels,
      datasets:[
        { label:'เงินลงทุนสะสม', data:data.put, borderColor:'#c9a94b', backgroundColor:dk?'rgba(201,169,74,0.10)':'rgba(201,169,74,0.08)',
          fill:'origin', borderWidth:2, tension:0.25, pointRadius:0, pointHoverRadius:4 },
        // fill:'-1' shades to the line above — the compound return, drawn as the
        // distance between the two rather than as a number to be read off
        { label:'มูลค่ารวม', data:data.total, borderColor:'#7aab8a', backgroundColor:dk?'rgba(122,171,138,0.16)':'rgba(122,171,138,0.13)',
          fill:'-1', borderWidth:2.5, tension:0.25, pointRadius:0, pointHoverRadius:4 },
      ]}, options:{ responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{
          legend:{ labels:{ color:dk?'#94a3b8':'#64748b', usePointStyle:true, pointStyle:'circle', padding:18, font:{size:11,family:"'Noto Sans Thai',sans-serif"} } },
          tooltip:{
            backgroundColor: dk?'rgba(13,27,46,0.95)':'rgba(255,255,255,0.97)',
            titleColor: dk?'#e2e8f0':'#1e293b', bodyColor: dk?'#94a3b8':'#64748b',
            footerColor: dk?'#7aab8a':'#4b735a',
            borderColor: dk?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)',
            borderWidth:1, padding:10, cornerRadius:10,
            callbacks:{
              label: ctx=>` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
              footer: items=>{
                const put = items.find(i=>i.datasetIndex===0)?.parsed.y ?? 0;
                const tot = items.find(i=>i.datasetIndex===1)?.parsed.y ?? 0;
                const pct = tot>0 ? (tot-put)/tot*100 : 0;
                return ` ผลตอบแทนทบต้น: ${fmt(tot-put)}  (${pct.toFixed(0)}%)`;
              },
            }
          }
        },
        scales:{
          x:{ grid:{display:false}, border:{display:false}, ticks:{...axis, maxRotation:0, autoSkipPadding:12} },
          y:{ grid:{color:dk?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)'}, border:{display:false},
              ticks:{...axis, callback:v=>v>=1e6?(v/1e6).toFixed(v>=1e7?0:1)+'M':v>=1000?(v/1000).toFixed(0)+'K':v} }
        }
      }
    });
    return () => ch.current?.destroy();
  }, [data, theme]);
  return <canvas ref={ref}/>;
};

// ── MODAL ──────────────────────────────────────────────────
const Modal = ({ open, onClose, onSave, editData, theme, wallets=[], assets=[], txs=[], defaultWalletId=null }) => {
  const dk = theme==='dark';
  const [f, setF] = useState({ title:'', amount:'', category:'เงินเดือน', date:today(), type:'income', notes:'', walletId:null, fromWalletId:null, toWalletId:null, fromAssetId:null, toAssetId:null, targetAssetId:null, fromSource:'', toSource:'' });
  useEffect(() => {
    if (editData) {
      let fromSource='', toSource='';
      if(editData.type==='transfer'){
        if(editData.fromWalletId) fromSource=`w-${editData.fromWalletId}`;
        else if(editData.fromAssetId) fromSource=`a-${editData.fromAssetId}`;
        if(editData.toWalletId) toSource=`w-${editData.toWalletId}`;
        else if(editData.toAssetId) toSource=`a-${editData.toAssetId}`;
        if(!fromSource&&editData.walletId&&editData.transferDir==='from') fromSource=`w-${editData.walletId}`;
        if(!toSource&&editData.walletId&&editData.transferDir==='to') toSource=`w-${editData.walletId}`;
      }
      setF({...editData, amount:String(Math.abs(editData.amount)), walletId:editData.walletId||null, targetAssetId:editData.targetAssetId||null, fromSource, toSource});
    }
    else {
      const fs = defaultWalletId?`w-${defaultWalletId}`:'';
      setF({ title:'', amount:'', category:'อาหาร', date:today(), type:'expense', notes:'', walletId:defaultWalletId, fromWalletId:null, toWalletId:null, fromAssetId:null, toAssetId:null, targetAssetId:null, fromSource:fs, toSource:'' });
    }
  }, [editData, open, defaultWalletId]);
  const set = (k,v) => { const nf={...f,[k]:v}; if(k==='type'){nf.category=v==='income'?'เงินเดือน':v==='transfer'?'โยกเงิน':'อาหาร';} setF(nf); };
  const parseSrcM = v => { if(!v) return {t:null,id:null}; const [t,...r]=v.split('-'); return {t,id:parseInt(r.join('-'))}; };
  const getSrcName = v => { const {t,id}=parseSrcM(v); return t==='w'?wallets.find(x=>x.id===id)?.name:assets.find(x=>x.id===id)?.name||''; };
  const save = () => {
    const amt = parseFloat(f.amount);
    if (!f.title.trim()||f.amount===''||isNaN(amt)) return;   // 0 อนุญาต — ใช้บันทึกเป็นโน้ตเฉยๆ ได้ (ไม่กระทบยอด)
    if (f.type==='income'&&amt<0) return;
    if (f.type==='transfer'&&(!f.fromSource||!f.toSource||f.fromSource===f.toSource)) return;
    if (overDraw) return;   // nothing can send away more than it holds
    // The picker offers only the wallet, so routing has to decide which of its
    // pools the money leaves from: loose cash while it covers the amount, then
    // the linked cash asset. Without this, choosing the wallet drives its loose
    // cash negative against an asset holding the very money being moved.
    const routeSrc = (src) => {
      if (src.t!=='w') return src;
      const w = wallets.find(x=>String(x.id)===String(src.id));
      if (!w || walletCash(w, txs, assets) >= amt) return src;
      const cash = assets.filter(a=>a.walletId===w.id && a.type==='cash')
                         .sort((x,y)=>assetVal(y,txs,1)-assetVal(x,txs,1));
      return cash.length ? {t:'a', id:cash[0].id} : src;
    };
    // Incoming money follows the same rule, or the receiving wallet keeps two
    // pools: the money would land as loose cash beside a cash asset holding the
    // rest, which is the split this was meant to remove. Only when the wallet has
    // exactly one cash asset — with several there is no way to know which.
    const routeDest = (dst) => {
      if (dst.t!=='w') return dst;
      const w = wallets.find(x=>String(x.id)===String(dst.id));
      if (!w) return dst;
      const cash = assets.filter(a=>a.walletId===w.id && a.type==='cash');
      return cash.length===1 ? {t:'a', id:cash[0].id} : dst;
    };
    if(f.type==='transfer'){
      const fs=routeSrc(parseSrcM(f.fromSource)), ts=routeDest(parseSrcM(f.toSource));
      const base={title:f.title,amount:amt,date:f.date,notes:f.notes,type:'transfer',category:'โยกเงิน'};
      const txId=uid(), txId2=uid(); const linkedId=`trf-${txId}`;
      if(fs.t==='w'&&ts.t==='w'){
        onSave([{...base,id:txId,walletId:fs.id,toWalletId:ts.id,fromWalletId:fs.id,transferDir:'from',linkedId},{...base,id:txId2,walletId:ts.id,toWalletId:ts.id,fromWalletId:fs.id,transferDir:'to',amount:-amt,linkedId}]);
      } else if(fs.t==='w'&&ts.t==='a'){
        onSave([{...base,id:txId,walletId:fs.id,toAssetId:ts.id,transferDir:'from',linkedId}]);
      } else if(fs.t==='a'&&ts.t==='w'){
        onSave([{...base,id:txId,walletId:ts.id,fromAssetId:fs.id,transferDir:'to',amount:-amt,linkedId}]);
      } else {
        onSave([{...base,id:txId,fromAssetId:fs.id,toAssetId:ts.id,linkedId}]);
      }
    } else {
      // adjustment sign is real data (− = ลดยอดกระเป๋า), not derived from type.
      // The form abs-es the amount on load, so re-apply the original sign on edit
      // to stop a negative ปรับยอด from flipping positive when only the title changes.
      const finalAmt = (f.type==='adjustment' && editData && editData.amount<0) ? -Math.abs(amt) : amt;
      onSave({...f, amount:finalAmt, walletId:f.walletId||null});
    }
    onClose();
  };
  if (!open) return null;
  const inp = `w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-600 focus:border-gold-500':'bg-slate-50 border-slate-200 text-slate-800 focus:border-gold-400'}`;
  const lbl = `text-xs font-medium mb-1.5 block ${dk?'text-slate-400':'text-slate-500'}`;
  // A cash asset living inside a wallet is that wallet's money, not a second
  // place to move money from — offering both is what put two identically-named
  // entries in this list and made picking the wrong one so easy.
  const pickableAssets = assets.filter(a=>!(a.type==='cash'&&a.walletId));
  // What the chosen source can actually send. Editing an existing transfer must
  // not be measured against a balance that already has that transfer taken out,
  // so its own legs are removed before counting.
  const availFrom = (()=>{
    const src = parseSrcM(f.fromSource||'');
    if (!src.t) return null;
    const base = editData
      ? txs.filter(t=>t.id!==editData.id && (!editData.linkedId || t.linkedId!==editData.linkedId))
      : txs;
    if (src.t==='w') {
      const w = wallets.find(x=>String(x.id)===String(src.id));
      if (!w) return null;
      const cash = assets.filter(a=>a.walletId===w.id&&a.type==='cash').reduce((s,a)=>s+assetVal(a,base,1),0);
      return walletCash(w, base, assets) + cash;
    }
    const a = assets.find(x=>String(x.id)===String(src.id));
    return a ? assetVal(a, base, 1) : null;
  })();
  const overDraw = f.type==='transfer' && availFrom!==null && (parseFloat(f.amount)||0) > availFrom + 0.01;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl scale-in ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dk?'border-white/8':'border-slate-100'}`}>
          <h2 className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>{editData?'แก้ไขรายการ':'เพิ่มรายการใหม่'}</h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="x" s={15}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className={`flex rounded-xl p-1 ${dk?'bg-white/5':'bg-slate-100'}`}>
            {['income','expense','transfer'].map(t=>(
              <button key={t} onClick={()=>set('type',t)} className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${f.type===t?(t==='income'?'bg-gold-500 text-white':t==='transfer'?'bg-gold-500 text-white':'bg-rose-500 text-white'):(dk?'text-slate-400':'text-slate-700')}`}>
                {t==='income'?'รับ':t==='transfer'?'โยก':'จ่าย'}
              </button>))}
          </div>
          <div>
            <label className={lbl}>รายการ</label>
            <input className={`${inp} ${f.title===''&&f.amount?'border-rose-500/50':''}`} placeholder={f.type==='income'?'เช่น เงินเดือน, โบนัส, เงินปันผล':'เช่น ค่ากาแฟ, ค่าอาหาร, ค่าเดินทาง'} value={f.title} onChange={e=>set('title',e.target.value)}/>
            {f.title===''&&f.amount&&<p className="mt-1 text-xs text-rose-400">กรุณากรอกชื่อรายการค่ะ</p>}
          </div>
          <div>
            <label className={lbl}>จำนวน (฿)</label>
            <input type="text" inputMode="decimal" className={`${inp} ${f.amount&&isNaN(parseFloat(f.amount))?'border-rose-500/50':''}`} placeholder="0" value={fmtNumInput(f.amount)} onChange={e=>set('amount',e.target.value.replace(/,/g,''))}/>
            {f.amount&&isNaN(parseFloat(f.amount))&&<p className="mt-1 text-xs text-rose-400">กรุณากรอกจำนวนที่ถูกต้องค่ะ</p>}
            {f.type==='expense'&&parseFloat(f.amount)<0&&(
              <p className="mt-1.5 text-xs text-emerald-400 flex items-center gap-1">↩ บันทึกเป็น Refund / เงินคืน — จะหักออกจากรายจ่ายเดือนนี้</p>
            )}
          </div>
          {f.type!=='transfer'?(
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>หมวดหมู่</label>
                <select className={inp} value={f.category} onChange={e=>set('category',e.target.value)}>
                  {catOptions(f.type==='income'?INCOME_CATS:getExpenseCats(), f.category).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                </select></div>
              <div><label className={lbl}>วันที่</label><input type="date" className={inp} value={f.date} onChange={e=>set('date',e.target.value)}/></div>
            </div>
          ):(
            <div className="space-y-3">
              <div>
                <label className={lbl}>จาก</label>
                {/* กระเป๋าเป็นบ้าน สินทรัพย์เป็นคนที่อยู่ในบ้าน — เงินสดที่ผูกกับ
                    กระเป๋าคือเงินของกระเป๋านั้น ไม่ใช่ของแยกอีกก้อน */}
                <select className={inp} value={f.fromSource||''} onChange={e=>set('fromSource',e.target.value)}>
                  <option value="">-- เลือกต้นทาง --</option>
                  <optgroup label="💼 กระเป๋าเงิน">{wallets.map(w=><option key={`w-${w.id}`} value={`w-${w.id}`}>{w.icon||'💼'} {w.name}</option>)}</optgroup>
                  <optgroup label="📊 สินทรัพย์">{pickableAssets.map(a=><option key={`a-${a.id}`} value={`a-${a.id}`}>{a.name}</option>)}</optgroup>
                </select>
              </div>
              <div>
                <label className={lbl}>ไปยัง</label>
                <select className={inp} value={f.toSource||''} onChange={e=>set('toSource',e.target.value)}>
                  <option value="">-- เลือกปลายทาง --</option>
                  <optgroup label="💼 กระเป๋าเงิน">{wallets.map(w=><option key={`w-${w.id}`} value={`w-${w.id}`} disabled={f.fromSource===`w-${w.id}`}>{w.icon||'💼'} {w.name}</option>)}</optgroup>
                  <optgroup label="📊 สินทรัพย์">{pickableAssets.map(a=><option key={`a-${a.id}`} value={`a-${a.id}`} disabled={f.fromSource===`a-${a.id}`}>{a.name}</option>)}</optgroup>
                </select>
              </div>
              {/* The dedicated โยกเงิน screen has blocked over-transfers all along;
                  this one never did, which is how a wallet's loose cash went
                  negative against the cash asset holding the same money. */}
              {overDraw&&(
                <div className={`text-xs rounded-xl px-3 py-2 leading-5 ${dk?'bg-rose-500/10 text-rose-300':'bg-rose-50 text-rose-600'}`}>
                  ⚠️ มีอยู่ {fmtSigned(availFrom)} — โยก {fmt(parseFloat(f.amount)||0)} ไม่ได้ค่ะ จะทำให้ติดลบ
                </div>
              )}
              {f.fromSource&&f.toSource&&<div className={`text-xs text-center py-1 font-medium ${dk?'text-gold-300':'text-gold-600'}`}>{getSrcName(f.fromSource)} → {getSrcName(f.toSource)}</div>}
              <div><label className={lbl}>วันที่</label><input type="date" className={inp} value={f.date} onChange={e=>set('date',e.target.value)}/></div>
            </div>
          )}
          {wallets.length>0&&f.type!=='transfer'&&(
            <div><label className={lbl}>กระเป๋าเงิน</label>
              <select className={inp} value={f.walletId||''} onChange={e=>set('walletId',e.target.value?parseInt(e.target.value):null)}>
                <option value="">ไม่ระบุ</option>
                {wallets.map(w=><option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
              </select>
            </div>
          )}
          {f.type!=='transfer'&&assets.length>0&&(
            <div><label className={lbl}>🏷️ สินทรัพย์ที่เกี่ยวข้อง (ไม่บังคับ)</label>
              <select className={inp} value={f.targetAssetId||''} onChange={e=>set('targetAssetId',e.target.value?parseInt(e.target.value):null)}>
                <option value="">— ไม่ระบุ —</option>
                {assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          {/* A row with neither a wallet nor an asset is money with nowhere to
              come from: Budget counts the spend, Net Worth does not, and the two
              disagree with nothing to say so. It is legitimate — cash the app was
              never told about — so this informs rather than blocks. Said here
              because in three months there is no way to tell which rows meant it. */}
          {f.type!=='transfer' && !f.walletId && !f.targetAssetId && (
            <div className={`text-xs rounded-xl px-3 py-2 leading-5 flex items-start gap-2 ${dk?'bg-amber-500/10 text-amber-300':'bg-amber-50 text-amber-700'}`}>
              <span className="flex-shrink-0">ℹ️</span>
              <span>ยังไม่ได้เลือกกระเป๋าและสินทรัพย์ — รายการนี้จะ<b>ไม่กระทบยอดกระเป๋าและ Net Worth</b> นับเฉพาะในสรุปรายรับ-รายจ่ายและงบเท่านั้น{f.type==='expense'?' · ใช้เมื่อจ่ายด้วยเงินที่ไม่ได้บันทึกไว้ในแอป':''}</span>
            </div>
          )}
          <div><label className={lbl}>หมายเหตุ</label><input className={inp} placeholder="หมายเหตุ (ไม่บังคับ)" value={f.notes} onChange={e=>set('notes',e.target.value)}/></div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${dk?'bg-white/5 hover:bg-white/10 text-slate-300':'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>ยกเลิก</button>
          <button onClick={save} disabled={overDraw} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed ${f.type==='income'?'bg-gold-500 hover:bg-gold-600':f.type==='transfer'?'bg-gold-500 hover:bg-gold-600':'bg-rose-500 hover:bg-rose-600'}`}>{editData?'บันทึก':'เพิ่มรายการ'}</button>
        </div>
      </div>
    </div>
  );
};

// ── UNREALIZED P/L ─────────────────────────────────────────
// This replaced the Net Worth Timeline, which plotted total net worth month by
// month. The trouble was that net worth moves for reasons that say nothing
// about how the holdings performed: a salary landing, a transfer between
// wallets, or a fresh purchase all pushed the line up exactly the way a real
// gain did. Four lines and a seven-column table, and none of it could answer
// the one question actually being asked of it — is the portfolio up or down.
//
// Unrealized P/L is immune to that by construction: market value minus what was
// paid, so money moving in adds to both sides and cancels, leaving only price
// movement. The formula is lifted from the assets page rather than rewritten —
// a second definition of "profit" that disagreed with the first over some
// rounding rule would be worse than showing nothing.
const UnrealizedPL = ({ assets, txs, usdRate, theme, hide=false, nwHistory=[], cashTotal=0 }) => {
  const dk = theme==='dark';
  // English here, Thai everywhere else in the app. Not an inconsistency that
  // slipped in — the list already had "Crypto" sitting next to "ทองคำ" and
  // "หุ้น", because no one says คริปโทเคอร์เรนซี out loud. One column mixing two
  // languages is what read as wrong, so the column picks one. Local to this
  // card: the assets page, filters and forms still label these in Thai, where
  // they are ordinary words rather than terms sitting beside Cost and P/L.
  const LBL = {stock:'Stocks', etf:'ETF', fund:'Funds', bond:'Bonds', crypto:'Crypto', gold:'Gold', property:'Property', other:'Other', cash:'Cash'};

  // The allocation breakdown that used to be its own card on the assets page
  // now shares these rows. The two panels were splitting one table in half: the
  // assets page listed value, cost and P/L per type and called it allocation,
  // this card listed P/L per type and called it performance. Same grouping,
  // same arithmetic, two places to read and two places to keep correct.
  const { rows, allocTot, totCost, totVal, totPl } = useMemo(()=>{
    const by = {}; let tc=0, tv=0;
    assets.filter(a=>a.type!=='cash').forEach(a=>{
      const mult = a.currency==='USD' ? usdRate : 1;
      const {taggedIn, taggedOut} = assetTagged(txs, a.id);
      const val  = (a.qty*a.currentPrice + taggedIn - taggedOut) * mult;
      const cost = (a.qty*a.avgCost) * mult;
      if(!by[a.type]) by[a.type] = {type:a.type, label:LBL[a.type]||a.type, cost:0, val:0};
      by[a.type].cost += cost; by[a.type].val += val;
      tc += cost; tv += val;
    });
    // Cash joins for the allocation column only, and is deliberately left out of
    // the P/L totals above it. It has no cost basis to subtract, so its profit
    // is zero by definition — but a share of the portfolio that omitted the
    // cash would never reach 100%, which is the one thing an allocation column
    // has to do. Wallet cash and cash-type assets both count; walletCash()
    // already excludes transactions attributed to the latter, so nothing is
    // counted twice.
    const cashAssets = assets.filter(a=>a.type==='cash')
      .reduce((s,a)=>s+assetVal(a,txs,usdRate), 0);
    const cash = cashTotal + cashAssets;
    if(Math.abs(cash) > 0.01) by.cash = {type:'cash', label:LBL.cash, cost:cash, val:cash};

    const at = Object.values(by).reduce((s,g)=>s+g.val, 0);
    // Biggest mover first, gain or loss alike — a large loss is at least as
    // worth seeing at the top as a large gain. Not sorted by size of holding:
    // the card's headline is performance, so the rows answer to that and the
    // allocation column reads down whatever order performance produced.
    const list = Object.values(by)
      .map(g=>({...g, pl:g.val-g.cost, pct:g.cost>0?((g.val-g.cost)/g.cost*100):0,
                share: at>0 ? g.val/at*100 : 0}))
      .sort((a,b)=>Math.abs(b.pl)-Math.abs(a.pl));
    return { rows:list, allocTot:at, totCost:tc, totVal:tv, totPl:tv-tc };
  },[assets,txs,usdRate,cashTotal]);

  // Month-on-month needs a cost basis recorded alongside each snapshot, which
  // only began when this card was built. Earlier months carry no `cost` at all,
  // and the historical prices needed to reconstruct one were never stored, so
  // they are skipped rather than read as zero — a missing cost treated as zero
  // would render the whole holding as pure profit.
  const mom = useMemo(()=>{
    const withCost = nwHistory.filter(h=>typeof h.cost==='number' && h.cost>0)
                              .sort((a,b)=>a.month.localeCompare(b.month));
    if(withCost.length<2) return null;
    const pl = h => (h.portfolio + (h.other||0)) - h.cost;
    const cur = withCost[withCost.length-1], prev = withCost[withCost.length-2];
    const [py,pm] = prev.month.split('-');
    return { label:`${MONTHS_TH[parseInt(pm)-1]} ${py}`, delta: pl(cur)-pl(prev) };
  },[nwHistory]);

  if(!rows.length) return null;

  const totPct = totCost>0 ? (totPl/totCost*100) : 0;
  const up = totPl >= 0;
  // fmt already respects the header padlock; this adds the card eye on top, so
  // hiding here hides the per-type rows underneath as well.
  const f  = v => hide ? '฿ •••••' : fmtSigned(v);
  const fv = v => hide ? '฿ •••••' : fmt(v);
  const fp = v => hide ? '•••' : `${v>=0?'+':''}${v.toFixed(2)}%`;
  const tone = g => g ? 'text-emerald-400' : 'text-rose-400';

  return (
    <div className={`rounded-2xl fade-up p-5 mt-4 ${dk?'card-solid':'glass-light shadow-sm'}`}>
      {/* One heading, not two. The Thai title and the English eyebrow opposite
          it were a translation of each other, so the card announced itself
          twice before saying anything. The term carries the title; the Thai
          line under it does the explaining, which is the part a translated
          heading was never going to do on its own. */}
      {/* The heading names both halves now that the allocation table lives here
          — the card had been introducing itself as only the second of the two
          things it shows. Orange because this is the panel the page is for. */}
      <div className="text-base font-bold text-orange-400">Asset Allocation &amp; Unrealized P/L</div>
      <div className={`text-xs mt-0.5 ${dk?'text-slate-400':'text-slate-500'}`}>สัดส่วนสินทรัพย์ และกำไร/ขาดทุนของที่ถืออยู่</div>

      <div className="flex items-baseline gap-3 flex-wrap mt-4">
        <div className={`text-3xl font-bold tracking-wider ${tone(up)}`}>{f(totPl)}</div>
        <div className={`text-sm font-semibold ${tone(up)}`}>{fp(totPct)}</div>
      </div>
      <div className={`text-xs mt-1.5 ${dk?'text-slate-400':'text-slate-500'}`}>
        Cost {fv(totCost)} → Market Value {fv(totVal)}
      </div>

      {/* The headline above is what this card is for, so the table under it
          stays at one type size and lets colour do the separating: only the P/L
          column is tinted, value and cost sit in muted grey, and the share bar
          is drawn at low opacity behind the type name rather than as its own
          column of colour. No donut — the net worth card higher up the page
          already draws this same split as a segmented bar, and a third
          rendering of one fact would out-shout the number the card exists for. */}
      <div className={`mt-4 pt-1 border-t overflow-x-auto ${dk?'border-white/5':'border-slate-100'}`}>
        <table className="w-full text-xs" style={{minWidth:'440px'}}>
          <thead>
            <tr className={dk?'text-slate-500':'text-slate-400'}>
              <th className="py-2 text-left font-medium">ประเภท</th>
              <th className="py-2 pl-3 text-right font-medium">มูลค่า</th>
              <th className="py-2 pl-3 text-right font-medium">ต้นทุน</th>
              <th className="py-2 pl-3 text-right font-medium">P/L</th>
              <th className="py-2 pl-3 text-right font-medium">สัดส่วน</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(g=>{
              const clr = (ASSET_TYPES.find(t=>t.v===g.type)||ASSET_TYPES[4]).c;
              return (
                <tr key={g.type} className={`border-t ${dk?'border-white/5':'border-slate-100'}`}>
                  {/* The share fill needs a visible track behind it or it is
                      not a bar. Without one it was drawn across a cell only as
                      wide as the word in it, so 35.8% of "Crypto" stopped
                      mid-word and read as highlighting that failed rather than
                      as a proportion — nothing on screen said what the 100%
                      would have been. Fixed cell width plus a faint full-width
                      track gives it something to be a fraction of. */}
                  <td className="py-2 pr-3" style={{width:'34%',minWidth:'132px'}}>
                    <div className={`relative rounded-sm overflow-hidden ${dk?'bg-white/[0.04]':'bg-slate-100'}`}>
                      <div className="absolute inset-y-0 left-0" style={{width:`${g.share}%`,backgroundColor:clr,opacity:0.20}}/>
                      <div className="relative flex items-center gap-2 py-1 px-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{backgroundColor:clr}}/>
                        <span className={dk?'text-slate-300':'text-slate-600'}>{g.label}</span>
                      </div>
                    </div>
                  </td>
                  {/* Value is the figure this table is scanned for, so it is the
                      one column set above the body size and in the brightest
                      ink. Cost stays small and dim: it exists to be subtracted
                      from, not read. */}
                  <td className={`py-2 pl-3 text-right tabular-nums text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>{fv(g.val)}</td>
                  <td className={`py-2 pl-3 text-right tabular-nums ${dk?'text-slate-500':'text-slate-400'}`}>{fv(g.cost)}</td>
                  <td className={`py-2 pl-3 text-right tabular-nums font-semibold ${g.type==='cash'?(dk?'text-slate-600':'text-slate-300'):tone(g.pl>=0)}`}>
                    {/* Cash has no cost basis, so a P/L of exactly zero here
                        would be a fact about arithmetic rather than about the
                        holding. A dash says the column does not apply. */}
                    {g.type==='cash' ? '—' : <>{f(g.pl)}<div className="font-normal opacity-80">{fp(g.pct)}</div></>}
                  </td>
                  <td className={`py-2 pl-3 text-right tabular-nums font-semibold ${dk?'text-slate-300':'text-slate-600'}`}>{g.share.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className={`border-t ${dk?'border-white/10 text-slate-400':'border-slate-200 text-slate-500'}`}>
              <td className="py-2 pr-3 font-medium">รวม</td>
              <td className={`py-2 pl-3 text-right tabular-nums text-sm font-bold ${dk?'text-white':'text-slate-800'}`}>{fv(allocTot)}</td>
              <td colSpan={3}/>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className={`text-xs mt-3.5 pt-3 border-t ${dk?'border-white/5 text-slate-500':'border-slate-100 text-slate-400'}`}>
        {mom
          ? <span>เทียบ {mom.label} · {mom.delta>=0?'กำไรเพิ่มขึ้น':'กำไรลดลง'} <span className={tone(mom.delta>=0)}>{fv(Math.abs(mom.delta))}</span></span>
          : <span>เพิ่งเริ่มเก็บต้นทุนรายเดือน — เทียบเดือนต่อเดือนได้ตั้งแต่เดือนหน้าค่ะ</span>}
      </div>
    </div>
  );
};

// ── PASTEL COLOR MAP ──────────────────────────────────────
const PASTEL_CLR = {
  'อาหาร':'#fca5a5','การเดินทาง':'#fdba74','ช้อปปิ้ง':'#fde68a',
  'ที่พัก':'#6ee7b7','บันเทิง':'#93c5fd','สุขภาพ':'#86efac',
  'การศึกษา':'#67e8f9','Subscription':'#d1b768','อื่นๆ':'#cbd5e1','default':'#cbd5e1'
};

// ── BUDGET METRIC CARD (Stats11 style) ──────────────────────
const BudgetMetricCard = ({ cat, spent, budget, dk, onEdit }) => {
  const rawPct = budget > 0 ? (spent / budget) * 100 : 0;
  const pct = Math.min(rawPct, 100);
  const over = rawPct > 100;
  const warn = rawPct >= 80 && !over;
  // The warn orange came down with the red beside it. Leaving #f97316 neon in
  // the same three-way conditional whose other branch just got muted would have
  // made "nearly over" shout louder than "over".
  // Same three states as the budget page, so a category reads the same colour
  // wherever it appears.
  const barColor = over ? '#d4574a' : warn ? '#d4af45' : catClr(cat);
  return (
    <div className={`relative overflow-hidden rounded-2xl border fade-up ${dk?'card-solid':'bg-white border-slate-200 shadow-sm'}`}>
      <div className="p-4 pb-12">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{background:catClr(cat)}}/>
          <h5 className={`text-[11px] font-medium tracking-wider uppercase ${dk?'text-slate-400':'text-slate-500'}`}>{cat}</h5>
        </div>
        <div className="flex items-baseline gap-1 mt-1">
          <span className={`text-lg font-semibold tabular-nums ${over?(dk?'text-rose-400':'text-rose-600'):(dk?'text-white':'text-slate-800')}`}>฿{fmt(spent)}</span>
          <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>/ ฿{fmt(budget)}</span>
        </div>
        <div className={`relative h-1 w-full overflow-hidden rounded-full mt-3 ${dk?'bg-white/10':'bg-slate-100'}`}>
          <div className="h-full w-full origin-left rounded-full transition-all duration-700"
            style={{transform:`scaleX(${pct/100})`,background:barColor}}/>
        </div>
        <div className="mt-2.5 min-h-[2rem]">
          {over
            ? <p className={`text-xs ${dk?'text-amber-400':'text-amber-600'}`}>เกิน Budget ฿{fmt(spent-budget)} จากที่ตั้งไว้</p>
            : warn
            ? <p className={`text-xs ${dk?'text-orange-400':'text-orange-600'}`}>ใช้แล้ว {rawPct.toFixed(0)}% — ใกล้เต็มแล้วค่ะ</p>
            : <p className={`text-xs ${dk?'text-emerald-400':'text-emerald-600'}`}>เหลืออีก ฿{fmt(budget-spent)} ({(100-rawPct).toFixed(0)}%)</p>
          }
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0">
        <button onClick={()=>onEdit(cat,budget)}
          className={`h-8 w-full flex items-center gap-1.5 px-3 text-xs font-medium transition-colors ${dk?'text-gold-400 hover:text-gold-300 bg-white/5':'text-gold-600 hover:text-gold-700 bg-slate-50 border-t border-slate-100'}`}>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          แก้ไข Budget
        </button>
      </div>
    </div>
  );
};

// ── SEGMENTED PROGRESS ────────────────────────────────────
const SegmentedProgress = ({ segments, total, theme }) => {
  const dk = theme === 'dark';
  const free = total > 0 ? Math.max(0, total - segments.reduce((s,g)=>s+g.val,0)) : 0;
  // A third palette lived here — coral, cyan, sage, mint — separate from both
  // ASSET_TYPES and CAT_CLR while describing the same five asset types those
  // already colour. Same ramp as everywhere else now, and unknown types fall
  // through it rather than into a set of pastels nothing else uses.
  const SEG_COLOR_MAP = {stock:'#f8e3d5',crypto:'#d99669',gold:'#b76736',cash:'#8a4622',other:'#6b6154',bond:'#73381a'};
  const getColor = (type,i) => SEG_COLOR_MAP[type] || GOLD_RAMP[(i*2+1) % GOLD_RAMP.length];
  return (
    <div className="mt-3">
      <div className={`flex h-3 w-full overflow-hidden rounded-full ${dk?'bg-white/8':'bg-slate-200'}`}>
        {segments.map((seg,i)=>{
          const pct = total>0 ? (seg.val/total*100) : 0;
          // The sheen runs top-to-bottom, never left-to-right. Segment
          // boundaries are vertical, so a horizontal gradient would blend one
          // asset class into the next and there would be no telling where
          // crypto ends and stocks begin — the bar's whole job. Running it
          // down the bar instead crosses no boundary: every segment keeps a
          // hard edge and a flat swatch turns into something with a surface.
          return <div key={seg.type} className="h-full transition-all duration-700" style={{width:`${pct}%`,backgroundColor:getColor(seg.type,i),backgroundImage:'linear-gradient(180deg,rgba(255,255,255,0.20) 0%,rgba(255,255,255,0.05) 42%,rgba(0,0,0,0.10) 68%,rgba(0,0,0,0.20) 100%)'}}/>;
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-2.5">
        {segments.map((seg,i)=>(
          <div key={seg.type} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{backgroundColor:getColor(seg.type,i)}}/>
            <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>{seg.label}</span>
            <span className={`text-xs tabular-nums font-medium ${dk?'text-slate-300':'text-slate-600'}`}>{total>0?(seg.val/total*100).toFixed(1):'0'}%</span>
          </div>
        ))}
        {free>0&&(
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${dk?'bg-white/10':'bg-slate-200'}`}/>
            <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>อื่นๆ</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ── MINI AREA CARD ─────────────────────────────────────────
const MiniAreaCard = ({ label, ticker, value, sub, positive, data, labels, color, theme }) => {
  const ref = useRef(); const ch = useRef();
  const dk = theme === 'dark';
  useEffect(() => {
    if (!ref.current || !data) return;
    if (ch.current) ch.current.destroy();
    ch.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: color,
          backgroundColor: color + '22',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 1.5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false, grace: '15%' } },
        animation: { duration: 500 },
      }
    });
    return () => ch.current?.destroy();
  }, [data, color]);
  return (
    <div className={`rounded-2xl overflow-hidden fade-up ${dk?'card-solid':'glass-light shadow-sm'}`}>
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-medium ${dk?'text-slate-200':'text-slate-700'}`}>{label}</span>
          {ticker&&<span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>({ticker})</span>}
        </div>
        <div className="flex items-baseline justify-between mt-1.5">
          <div className="text-lg font-bold tabular-nums" style={{color}}>{value}</div>
          <div className={`text-xs font-medium ${dk?'text-slate-400':'text-slate-500'}`}>{sub}</div>
        </div>
      </div>
      <div style={{height:'64px',overflow:'hidden'}}>
        <canvas ref={ref}/>
      </div>
    </div>
  );
};

const Portal = ({children}) => ReactDOM.createPortal(children, document.body);

// ── DISCOVER MODE: highlight interactive spots ([data-hint]) with a ring + label ──
const DiscoverOverlay = ({ active }) => {
  const [rects, setRects] = useState([]);
  // hints the user has already clicked once are remembered as "seen" and stop showing
  const [dismissed, setDismissed] = useState(()=>{ try{ return new Set(JSON.parse(localStorage.getItem('ft-hints-seen')||'[]')); }catch{ return new Set(); } });
  useEffect(()=>{
    if(!active){ setRects([]); return; }
    const compute = () => {
      if(document.querySelector('.modal-bg')){ setRects([]); return; } // hide hints while a modal is open
      const out=[], seen=new Set();
      document.querySelectorAll('[data-hint]').forEach(el=>{
        const hint=el.getAttribute('data-hint');
        if(seen.has(hint)||dismissed.has(hint)) return;   // once per unique tip; skip ones already clicked
        const r=el.getBoundingClientRect();
        if(r.width>0&&r.height>0&&r.bottom>0&&r.top<window.innerHeight){
          seen.add(hint);
          out.push({hint, top:r.top, left:r.left, w:r.width, h:r.height});
        }
      });
      // place labels with collision avoidance so they never overlap each other.
      // process last-in-DOM first so the rightmost button (e.g. "เพิ่มกระเป๋า")
      // gets the closest/top slot and earlier buttons stack below it.
      const placed=[], LH=22, winW=window.innerWidth;
      [...out].reverse().forEach(o=>{
        const lw=Math.min(250, o.hint.length*7.2+34);
        const lx=Math.max(6, Math.min(o.left, winW-lw-6));
        const below = o.top < window.innerHeight*0.55;   // top elements → label below, stack down
        let ly = below ? o.top+o.h+7 : o.top-LH-7;
        let g=0;
        while(g++<60 && placed.some(p=> lx < p.x+p.w+8 && lx+lw > p.x-8 && ly < p.y+p.h+4 && ly+LH > p.y-4))
          ly += below ? (LH+5) : -(LH+5);
        placed.push({x:lx, y:ly, w:lw, h:LH});
        o.lx=lx; o.ly=ly;
      });
      setRects(out);
    };
    compute();
    // once the user actually clicks a highlighted spot, retire that hint for good
    const onClick=e=>{ const el=e.target.closest&&e.target.closest('[data-hint]'); if(!el) return; const hint=el.getAttribute('data-hint'); setDismissed(prev=>{ if(prev.has(hint)) return prev; const next=new Set(prev); next.add(hint); try{ localStorage.setItem('ft-hints-seen', JSON.stringify([...next])); }catch{} return next; }); };
    document.addEventListener('click',onClick,true);
    const on=()=>compute();
    window.addEventListener('scroll',on,true);
    window.addEventListener('resize',on);
    const iv=setInterval(compute,350);
    return ()=>{ document.removeEventListener('click',onClick,true); window.removeEventListener('scroll',on,true); window.removeEventListener('resize',on); clearInterval(iv); };
  },[active,dismissed]);
  if(!active) return null;
  return (
    <Portal>
      <div style={{position:'fixed',inset:0,zIndex:70,pointerEvents:'none'}}>
        {rects.map((r,i)=>(
          <React.Fragment key={i}>
            <div style={{position:'fixed',top:r.top-3,left:r.left-3,width:r.w+6,height:r.h+6,border:'2px solid #c3a343',borderRadius:12,animation:'hintPulse 1.6s ease-in-out infinite',boxSizing:'border-box'}}/>
            <div style={{position:'fixed',top:r.ly,left:r.lx,zIndex:71}}><span style={{display:'inline-block',background:'#c3a343',color:'#241d08',fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,.5)',whiteSpace:'nowrap',fontFamily:"'Noto Sans Thai',sans-serif"}}>💡 {r.hint}</span></div>
          </React.Fragment>
        ))}
      </div>
    </Portal>
  );
};

// ── CONFIRM DIALOG ─────────────────────────────────────────
// ── ACTION SHEET ───────────────────────────────────────────
// Built on the iOS action sheet, because that is the shape a phone user already
// knows how to read: the question at the top, each action its own full-width row
// separated by a hairline, the dangerous one in red, and Cancel detached below
// with a gap so the thumb cannot take it for one of the choices.
//
// The palette stays the app's own — this borrows iOS's structure, not its greys
// and system blue, which would look pasted in beside a gold-on-black ledger.
const ConfirmDialog = ({ open, title, message, confirmLabel='ลบ', destructive=true, onConfirm, onCancel, dk=false }) => {
  useEffect(()=>{
    if(!open) return;
    const esc = e => { if(e.key==='Escape') onCancel(); };
    document.addEventListener('keydown', esc);
    return ()=>document.removeEventListener('keydown', esc);
  },[open,onCancel]);
  if (!open) return null;
  const surface = dk ? 'rgba(16,22,36,0.86)' : 'rgba(255,255,255,0.9)';
  const line    = dk ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
  const press   = dk ? 'active:bg-white/10' : 'active:bg-black/5';
  const sheet   = { background:surface, backdropFilter:'blur(20px) saturate(180%)', WebkitBackdropFilter:'blur(20px) saturate(180%)', '--sheet-line':line };
  const row     = `sheet-row w-full py-3.5 px-4 text-[17px] leading-tight transition-colors ${press}`;
  return (
    <Portal>
      {/* Bottom on a phone where the thumb is, centred from sm: up */}
      <div onClick={onCancel} role="presentation"
        className="fixed z-[9999] flex items-end justify-center sm:items-center p-3 sm:p-4"
        style={{inset:0, top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.42)', backdropFilter:'blur(2px)'}}>
        <div className="sheet-up w-full max-w-[340px] space-y-2" onClick={e=>e.stopPropagation()}
          role="alertdialog" aria-modal="true" aria-label={title}>
          <div className="rounded-2xl overflow-hidden shadow-2xl" style={sheet}>
            <div className="px-5 pt-4 pb-3.5 text-center" style={{borderBottom:`1px solid ${line}`}}>
              <div className={`text-[13px] font-semibold ${dk?'text-white':'text-slate-900'}`}>{title}</div>
              {message&&<div className={`mt-1 text-[13px] leading-snug whitespace-pre-line ${dk?'text-slate-400':'text-slate-500'}`}>{message}</div>}
            </div>
            <button onClick={onConfirm} autoFocus
              className={`${row} font-semibold ${destructive?'text-rose-500':(dk?'text-gold-300':'text-gold-600')}`}>
              {confirmLabel}
            </button>
          </div>
          {/* Detached, as iOS does — Cancel must not read as one of the choices */}
          <button onClick={onCancel}
            className={`w-full py-3.5 rounded-2xl text-[17px] font-bold shadow-2xl transition-colors ${press} ${dk?'text-white':'text-slate-900'}`}
            style={sheet}>
            ยกเลิก
          </button>
        </div>
      </div>
    </Portal>
  );
};
const useConfirm = (dk=false) => {
  const [state, setState] = useState({ open:false, title:'', message:'', onOk:null, confirmLabel:'ลบ', destructive:true });
  // opts is optional so the nineteen existing calls keep their wording; without
  // it every confirmation said "ลบ", including the ones that delete nothing.
  const ask = useCallback((title, message, onOk, opts={}) =>
    setState({ open:true, title, message, onOk, confirmLabel:opts.confirmLabel||'ลบ', destructive:opts.destructive!==false }), []);
  const ok  = () => { state.onOk?.(); setState(s=>({...s,open:false})); };
  const no  = useCallback(() => setState(s=>({...s,open:false})), []);
  const el  = <ConfirmDialog open={state.open} title={state.title} message={state.message}
                 confirmLabel={state.confirmLabel} destructive={state.destructive}
                 onConfirm={ok} onCancel={no} dk={dk}/>;
  return [el, ask];
};

// ── DASHBOARD ──────────────────────────────────────────────
const Dashboard = ({ txs, assets, theme, nwHistory=[], wallets=[], user=null, debts=[], custodial=[], privacy=false, hideAmt=false, onToggleHide }) => {
  const dk = theme==='dark';
  const now = new Date();
  const curM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const income  = sumTxType(txs,'income');
  const expense = sumTxType(txs,'expense');
  const balance = income - expense;
  const savRate = income>0?((income-expense)/income*100):0;

  // ── Net Worth ──
  // Both controls live in the header now; this is the same flag, so the eye on
  // this card and the one up there cannot disagree.
  const mask = v => hideAmt ? '฿ •••••' : v;
  const usdRate = parseFloat(localStorage.getItem('ft-usdrate')||'35');
  // canonical net worth = every asset (incl. tags) + every wallet's cash (cash-asset dedup)
  const walletCashTotal = useMemo(()=>wallets.reduce((s,w)=>s+walletCash(w,txs,assets),0),[wallets,txs,assets]);
  const netWorth = useMemo(()=>
    assets.reduce((s,a)=>s+assetVal(a,txs,usdRate),0) + walletCashTotal
  ,[assets,txs,usdRate,walletCashTotal]);
  const totalDebtRemaining = useMemo(()=>{
    try{
      return debts.reduce((sum,d)=>{
        const totalPayable=d.monthlyPayment*d.totalMonths;
        const start=new Date(d.startDate); const now=new Date();
        const monthsPaid=Math.max(0,(now.getFullYear()-start.getFullYear())*12+(now.getMonth()-start.getMonth()));
        return sum+Math.max(totalPayable-Math.min(monthsPaid*d.monthlyPayment,totalPayable),0);
      },0);
    }catch{return 0;}
  },[debts]);
  // เงินที่ถือแทน (custodial) is informational only — shown separately, not subtracted from Net Worth
  const totalCustodial = useMemo(()=>custodial.filter(c=>!c.returned).reduce((s,c)=>s+(c.amount||0),0),[custodial]);
  const trueNetWorth = netWorth - totalDebtRemaining;
  const animNetWorth = useCountUp(trueNetWorth, 900, true);

  const nwByType = useMemo(()=>{
    const map={};
    assets.forEach(a=>{ map[a.type]=(map[a.type]||0)+assetVal(a,txs,usdRate); });
    if(walletCashTotal!==0) map.cash=(map.cash||0)+walletCashTotal; // wallet cash folds into เงินสด
    const icons={stock:'📈',gold:'🥇',crypto:<BtcIcon/>,cash:'💵',bond:'📄',other:'🏦'};
    const labels={stock:'หุ้น',gold:'ทอง',crypto:'Crypto',cash:'เงินสด',bond:'พันธบัตร',other:'อื่นๆ'};
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([t,v])=>({
      type:t, val:v, pct:netWorth>0?v/netWorth*100:0,
      icon:icons[t]||'🏦', label:labels[t]||t
    }));
  },[assets,txs,usdRate,netWorth,walletCashTotal]);

  const mKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

  // Always six columns, anchored so the empty ones fall on the right. A plain
  // trailing window put the blanks before the first transaction on the left,
  // where they pushed the bars into the right half of the chart and up against
  // the donut beside it. Starting the window at the first month with activity
  // packs the bars left and lets the months not yet arrived hold the empty space
  // instead — the same six columns, with the gap on the side that reads as "not
  // yet" rather than "nothing here".
  //
  // Once history outgrows six months the anchor stops mattering and it becomes
  // an ordinary trailing window ending on the current month, so the chart never
  // scrolls off into the past or grows past six.
  // The window is chosen now, not fixed at six. `null` means every month on
  // record — the one range whose length the app cannot know in advance, so it
  // is measured from the first transaction rather than counted back from today.
  const [range, setRange] = useState(()=>{ const v=localStorage.getItem('ft-range'); return v==='all'?null:(parseInt(v)||6); });
  const pickRange = v => { setRange(v); try{ localStorage.setItem('ft-range', v===null?'all':String(v)); }catch{} };

  const chartMonths = useMemo(()=>{
    const firstTx = txs.reduce((min,t)=>(t.date&&(!min||t.date<min))?t.date:min, null);
    const startAt = firstTx ? new Date(+firstTx.slice(0,4), +firstTx.slice(5,7)-1, 1) : null;
    if (range === null) {
      // Every month from the first record to this one. Capped at 60 so a long
      // history cannot produce a chart with more bars than pixels.
      const from = startAt || new Date(now.getFullYear(), now.getMonth(), 1);
      const span = (now.getFullYear()-from.getFullYear())*12 + (now.getMonth()-from.getMonth()) + 1;
      const n = Math.min(Math.max(span,1), 60);
      return Array.from({length:n},(_,i)=>mKey(new Date(now.getFullYear(), now.getMonth()-(n-1-i), 1)));
    }
    const trailing = new Date(now.getFullYear(), now.getMonth()-(range-1), 1);
    // Whichever is later: the window back from today, or the month the records
    // begin — so early months sit as empty space on the right rather than as
    // blanks on the left pushing the bars into half the chart.
    const base = (startAt && startAt > trailing) ? startAt : trailing;
    return Array.from({length:range},(_,i)=>mKey(new Date(base.getFullYear(), base.getMonth()+i, 1)));
  },[txs,range]);

  const barData = useMemo(()=>({
    labels: chartMonths.map(m=>{ const[,mo]=m.split('-'); return MONTHS_TH[parseInt(mo)-1]; }),
    income:  chartMonths.map(m=>sumTxMonth(txs,'income',m)),
    expense: chartMonths.map(m=>sumTxMonth(txs,'expense',m)),
  }),[txs,chartMonths]);

  const statsCards = useMemo(()=>{
    // Read from the calendar, not from the end of the chart. The last column is
    // now often a month that has not happened yet, so .at(-1) would have shown
    // ฿0 on "รายรับเดือนนี้" from the day the window started reaching forward.
    const prevM = mKey(new Date(now.getFullYear(), now.getMonth()-1, 1));
    const ci=sumTxMonth(txs,'income',curM),  pi=sumTxMonth(txs,'income',prevM);
    const ce=sumTxMonth(txs,'expense',curM), pe=sumTxMonth(txs,'expense',prevM);
    const netD=barData.income.map((v,i)=>v-barData.expense[i]);
    const cn=ci-ce, pn=pi-pe;
    const momI=pi>0?(ci-pi)/pi*100:0;
    const momE=pe>0?(ce-pe)/pe*100:0;
    const momN=pn!==0?(cn-pn)/Math.abs(pn)*100:0;
    return { netD, ci, ce, cn, momI, momE, momN };
  },[txs,curM,barData]);

  const donutData = useMemo(()=>{
    const exp=txs.filter(t=>t.type==='expense'&&t.date.startsWith(curM));
    const byC={}; exp.forEach(t=>{ byC[t.category]=(byC[t.category]||0)+t.amount; });
    const sorted=Object.entries(byC).sort((a,b)=>b[1]-a[1]);
    return { labels:sorted.map(([k])=>k), values:sorted.map(([,v])=>v), colors:sorted.map(([k])=>catClr(k)) };
  },[txs,curM]);


  const card  = `rounded-2xl p-5 fade-up ${dk?'card-solid':'glass-light shadow-sm'}`;
  const subTx = `text-xs ${dk?'text-slate-400':'text-slate-500'}`;

  // ── Daily Investment Quote ──
  const QUOTES = [
    { text: "The stock market is a device for transferring money from the impatient to the patient.", author: "Warren Buffett" },
    { text: "Price is what you pay. Value is what you get.", author: "Warren Buffett" },
    { text: "Be fearful when others are greedy, and greedy when others are fearful.", author: "Warren Buffett" },
    { text: "Risk comes from not knowing what you're doing.", author: "Warren Buffett" },
    { text: "Wide diversification is only required when investors do not understand what they are doing.", author: "Warren Buffett" },
    { text: "It's not whether you're right or wrong, but how much money you make when you're right and how much you lose when you're wrong.", author: "George Soros" },
    { text: "The four most dangerous words in investing are: 'This time it's different.'", author: "Sir John Templeton" },
    { text: "Know what you own, and know why you own it.", author: "Peter Lynch" },
    { text: "In investing, what is comfortable is rarely profitable.", author: "Robert Arnott" },
    { text: "Time in the market beats timing the market.", author: "Ken Fisher" },
    { text: "The stock market is filled with individuals who know the price of everything, but the value of nothing.", author: "Philip Fisher" },
    { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
    { text: "Compound interest is the eighth wonder of the world.", author: "Albert Einstein" },
    { text: "The individual investor should act consistently as an investor and not as a speculator.", author: "Benjamin Graham" },
    { text: "Behind every stock is a company. Find out what it's doing.", author: "Peter Lynch" },
    { text: "Go for a business that any idiot can run — because sooner or later, any idiot probably is going to run it.", author: "Peter Lynch" },
    { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
    { text: "It's far better to buy a wonderful company at a fair price than a fair company at a wonderful price.", author: "Warren Buffett" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "You get recessions, you have stock market declines. If you don't understand that's going to happen, then you're not ready.", author: "Peter Lynch" },
    { text: "The intelligent investor is a realist who sells to optimists and buys from pessimists.", author: "Benjamin Graham" },
    { text: "Never invest in a business you can't understand.", author: "Warren Buffett" },
    { text: "Invest in yourself. Your career is the engine of your wealth.", author: "Paul Clitheroe" },
    { text: "The most contrarian thing of all is not to oppose the crowd but to think for yourself.", author: "Peter Thiel" },
    { text: "In the short run, the market is a voting machine. In the long run, it's a weighing machine.", author: "Benjamin Graham" },
    { text: "Diversification is a protection against ignorance. It makes little sense if you know what you are doing.", author: "Warren Buffett" },
    { text: "The biggest risk of all is not taking one.", author: "Mellody Hobson" },
    { text: "A peak performance investor knows that the goal is not to make money but to be an excellent trader.", author: "Van K. Tharp" },
    { text: "Do not put all your eggs in one basket.", author: "Miguel de Cervantes" },
    { text: "The more you learn, the more you earn.", author: "Warren Buffett" },
    { text: "Rule No.1: Never lose money. Rule No.2: Never forget Rule No.1.", author: "Warren Buffett" },
  ];
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(),0,1)) / 86400000);
  const todayQ = QUOTES[dayOfYear % QUOTES.length];

  const StatCard = ({ icon, label, val, sub, accent, extra='', valCls='' }) => (
    <div className={`${card} ${extra}`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-medium uppercase tracking-wide ${dk?'text-slate-400':'text-slate-500'}`}>{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${accent}`}>{icon}</div>
      </div>
      <div className={`text-2xl font-bold tracking-tight ${valCls||(dk?'text-white':'text-slate-800')}`}>{val}</div>
      {sub&&<div className={subTx+' mt-1'}>{sub}</div>}
    </div>
  );

  const greeting = now.getHours()<12?'🌅 อรุณสวัสดิ์':now.getHours()<18?'☀️ สวัสดีตอนบ่าย':'🌙 สวัสดีตอนเย็น';
  const dateStr = now.toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  return (
    // `stagger` replaces `fade-up` here rather than joining it: the parent
    // animating as one block is exactly what made every section land on the
    // same frame. The children carry the animation now.
    <div className="space-y-5 stagger">

      {/* ── Hero + Quote (merged) ── */}
      <div className={`rounded-2xl px-5 py-3.5 fade-up ${dk?'card-solid':'glass-light shadow-sm'}`}
        style={{background:dk?'linear-gradient(135deg,rgba(13,27,46,0.95) 0%,rgba(30,41,59,0.85) 100%)':'linear-gradient(135deg,#f8fafc 0%,#eff6ff 100%)',border:dk?'1px solid rgba(255,255,255,0.07)':'1px solid rgba(199,210,254,0.5)'}}>
        <div className="flex items-center gap-3">

          {/* Left: Logo + Name */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <LogoSvg size={40}/>
            <div>
              <div className={`text-sm font-bold tracking-wide ${dk?'text-white':'text-slate-800'}`}>FinTracker</div>
              {/* Signing up with an email address sets no displayName, so the
                  fallback here was every user's name — and it was 'Fin'. The
                  address is the only name the account actually has; the +alias
                  suffix comes off because it is routing, not identity. */}
              <div className={`text-xs mt-0.5 ${dk?'text-slate-400':'text-slate-500'}`}>{greeting}{whoAmI(user) ? `, ${whoAmI(user)}` : ''} 👋</div>
            </div>
          </div>

          {/* Divider */}
          <div className={`hidden sm:block w-px h-7 flex-shrink-0 ${dk?'bg-white/10':'bg-slate-200'}`}/>

          {/* Center: Quote */}
          <div className="hidden sm:flex items-center gap-2 flex-1 min-w-0 px-1">
            <span className="text-sm leading-none flex-shrink-0 select-none">💡</span>
            <div className="min-w-0">
              <p className={`text-xs font-medium truncate ${dk?'text-slate-300':'text-slate-600'}`}>"{todayQ.text}"</p>
              <p className={`text-[11px] mt-0.5 ${dk?'text-slate-400':'text-slate-500'}`}>— {todayQ.author}</p>
            </div>
          </div>

          {/* Divider */}
          <div className={`hidden sm:block w-px h-7 flex-shrink-0 ${dk?'bg-white/10':'bg-slate-200'}`}/>

          {/* Right: Date + Settings */}
          <div className="flex items-center gap-2.5 flex-shrink-0 ml-auto">
            <div className="text-right hidden sm:block">
              <div className={`text-sm font-semibold ${dk?'text-slate-200':'text-slate-700'}`}>{dateStr}</div>
              <div className={`text-xs mt-0.5 ${dk?'text-slate-400':'text-slate-500'}`}>Personal Finance Dashboard</div>
            </div>
          </div>

        </div>
      </div>


{/* ── Net Worth Hero Card ──
     Shown even at zero. Hiding it kept a big ฿0.00 off a brand-new dashboard,
     but every other card on that screen reads ฿0.00 already — so the one that
     vanished looked broken rather than tactful, and it is the figure the whole
     app exists to show. */}
      {/* No border and no card fill in dark mode. Net worth was one panel among
          six of equal weight, so nothing on the page led — and a page where
          everything is emphasised has no emphasis at all. Sitting directly on
          the black, at a size no other figure comes near, it reads as the
          page's opening statement rather than as its first card. Light mode
          keeps a surface, where a borderless block on off-white would read as
          unfinished rather than as deliberate.

          No fade-up class: this block is a direct child of the stagger
          container, which supplies the animation. Both would have run two. */}
      {(
        <div className={`relative overflow-hidden rounded-2xl px-5 py-6 ${dk?'':'glass-light shadow-sm border border-gold-100'}`}>
          {dk && <HeroSpark history={nwHistory}/>}
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className={`text-xs font-medium uppercase tracking-widest ${dk?'text-slate-400':'text-slate-500'}`}>Net Worth · มูลค่าทรัพย์สินสุทธิ <span title="เงินสด + สินทรัพย์ทั้งหมด หักหนี้สิน = เงินที่เป็นของคุณจริงๆ (เงินที่ถือแทนคนอื่นแสดงแยกไว้ ไม่รวมในยอดนี้)" style={{cursor:'help',opacity:.7}}>ⓘ</span></div>
              </div>
              <button data-hint="คลิกซ่อน/แสดงจำนวนเงิน" onClick={()=>onToggleHide&&onToggleHide()} className={`flex items-center gap-2 group cursor-pointer text-left`}>
                {/* clamp rather than a scale step: this figure should grow with
                    the window, and it is the one place in the app where that is
                    true. tabular-nums keeps it from jittering as it counts up. */}
                <div className={`font-bold tracking-wide tabular-nums ${dk?'text-white':'text-slate-800'}`}
                  style={{fontSize:'clamp(2.1rem, 5.5vw, 3.4rem)', lineHeight:1.05}}>
                  {mask(fmtNW(animNetWorth))}
                </div>
                <Ic n={hideAmt?'eyeoff':'eye'} s={14} className={`mt-1 opacity-40 group-hover:opacity-80 transition-opacity ${dk?'text-slate-400':'text-slate-400'}`}/>
              </button>
              {(totalDebtRemaining>0||totalCustodial>0)&&(
                <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-xs ${dk?'text-slate-400':'text-slate-500'}`}>
                  {totalDebtRemaining>0&&<span>สินทรัพย์ {mask(fmtNW(netWorth))} <span className="text-rose-400">− หนี้สิน {mask(fmtNW(totalDebtRemaining))}</span></span>}
                  {totalCustodial>0&&<span className={dk?'text-amber-400':'text-amber-600'}>🔒 Custodial {mask(fmtNW(totalCustodial))}</span>}
                </div>
              )}
              <div className={`text-xs mt-1 ${dk?'text-slate-400':'text-slate-500'}`}>{totalDebtRemaining>0?'Net · ':''}คำนวณจาก {assets.length} สินทรัพย์ + {wallets.length} กระเป๋า · USD/THB = {usdRate}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {nwByType.map(({type,val,pct,icon,label})=>(
                <div key={type} className={`flex items-center gap-2 px-3 py-2 rounded-xl overflow-visible`}
                  style={dk
                    ?{background:'rgba(255,255,255,0.06)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)',border:'1px solid rgba(255,255,255,0.1)',boxShadow:'0 2px 12px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.07)'}
                    :{background:'rgba(255,255,255,0.75)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)',border:'1px solid rgba(201,169,74,0.14)',boxShadow:'0 2px 14px rgba(201,169,74,0.1),inset 0 1px 0 rgba(255,255,255,0.9)'}
                  }>
                  <span className="text-base leading-none">{icon}</span>
                  <div className="min-w-0">
                    <div className={`text-xs font-bold ${dk?'text-slate-100':'text-slate-700'}`}>{mask(fmt(val))}</div>
                    <div className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>&nbsp;{label} · {pct.toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {nwByType.length>0&&(
            <SegmentedProgress
              segments={nwByType.map(({type,val,label})=>({type,val,label}))}
              total={netWorth}
              theme={theme}
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="ยอดคงเหลือ"  val={mask(fmt(balance))}     sub={balance>=0?'✓ เป็นบวก':'⚠ ติดลบ'}  icon={<Ic n="wallet" s={15} cls="text-gold-300"/>} accent="bg-gold-500/15" extra="" valCls={dk?'tg-white':'text-slate-800'}/>
        {/* No tinted border or glow. Income vs expense was being encoded five
            times over on one card — figure colour, icon colour, icon backing,
            border tint and an outer halo — for a single bit the number states
            outright. The card keeps the shared gold hairline; the figure and
            the icon still carry the colour. */}
        <StatCard label="รายรับรวม"   val={mask(fmt(income))}      sub={`${txs.filter(t=>t.type==='income').length} รายการ`}  icon={<Ic n="up" s={15} cls="text-emerald-400"/>} accent="bg-emerald-500/15" valCls={dk?'tg-emerald':'text-slate-800'}/>
        <StatCard label="รายจ่ายรวม"  val={mask(fmt(expense))}     sub={`${txs.filter(t=>t.type==='expense').length} รายการ`} icon={<Ic n="down" s={15} cls="text-rose-400"/>} accent="bg-rose-500/15" valCls={dk?'tg-red':'text-slate-800'}/>
        <StatCard label="อัตราออม"    val={hideAmt?'••%':`${savRate.toFixed(1)}%`} sub={savRate>=20?'✓ ดีมาก':'↑ เพิ่มได้อีก'} icon={<Ic n="chart" s={15} cls="text-amber-400"/>} accent="bg-amber-500/15" valCls={dk?'tg-gold':'text-slate-800'}/>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniAreaCard label="รายรับเดือนนี้" ticker="INCOME" value={mask(fmt(statsCards.ci))} sub={`${statsCards.momI>=0?'+':''}${statsCards.momI.toFixed(1)}% vs เดือนก่อน`} positive={statsCards.momI>=0} data={barData.income} labels={barData.labels} color="#c9a94b" theme={theme}/>
        <MiniAreaCard label="รายจ่ายเดือนนี้" ticker="EXPENSE" value={mask(fmt(statsCards.ce))} sub={`${statsCards.momE>=0?'+':''}${statsCards.momE.toFixed(1)}% vs เดือนก่อน`} positive={statsCards.momE<=0} data={barData.expense} labels={barData.labels} color="#c9726a" theme={theme}/>
        <MiniAreaCard label="คงเหลือเดือนนี้" ticker="NET" value={mask(fmt(statsCards.cn))} sub={`${statsCards.momN>=0?'+':''}${statsCards.momN.toFixed(1)}% vs เดือนก่อน`} positive={statsCards.cn>=0} data={statsCards.netD} labels={barData.labels} color="#7aab8a" theme={theme}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card}>
          {/* The range control every financial chart has, and the reason the
              heading no longer states a fixed number: it would have gone stale
              the moment the window changed. */}
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h3 className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>รายรับ-รายจ่ายรายเดือน</h3>
            <div className={`flex gap-0.5 p-0.5 rounded-full ${dk?'bg-white/5':'bg-slate-100'}`}>
              {[{l:'3M',v:3},{l:'6M',v:6},{l:'1Y',v:12},{l:'ALL',v:null}].map(({l,v})=>(
                <button key={l} onClick={()=>pickRange(v)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${range===v?'bg-orange-400 text-orange-950':(dk?'text-slate-400 hover:text-slate-200':'text-slate-500 hover:text-slate-700')}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="h-52"><BarChart data={barData} theme={theme} hide={hideAmt||privacy}/></div>
        </div>
        <div className={card}>
          <h3 className={`text-sm font-semibold mb-4 ${dk?'text-white':'text-slate-700'}`}>รายจ่ายตามหมวด (เดือนนี้)</h3>
          <div>
            {donutData.labels.length>0 ? <DonutChart data={donutData} theme={theme} centerValue={fmt(donutData.values.reduce((s,v)=>s+v,0))} hideAmt={hideAmt}/> : <div className={`h-32 flex items-center justify-center text-sm ${subTx}`}>ยังไม่มีรายจ่ายเดือนนี้</div>}
          </div>
        </div>
      </div>

      {/* The daily spending heatmap sat beside this and is gone. The idea was
          sound — no other chart here says *when* money leaves — but the picture
          it drew was not readable: spending on most days falls in a narrow band
          well below the heaviest day, and scaling to that maximum pressed
          almost every cell into the same shade. A grid of one colour is not a
          pattern, it is noise with a legend.

          Making it work would mean ranking days against each other rather than
          against the largest, which is a different chart and a decision for
          another day. The treemap takes the full width in the meantime, which
          is what the small holdings needed anyway. */}
      {/* Two views of the same holdings that answer different questions: the
          treemap says what is big and whether it is up, the ranking says what
          is earning fastest for the time it has been held. A position can be
          the largest tile and the worst performer at once, which is exactly the
          pairing worth seeing side by side. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={card + ' p-5 lg:col-span-2'}>
          <h3 className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>แผนผังพอร์ต</h3>
          <p className={`text-xs mt-0.5 mb-4 ${subTx}`}>ขนาด = มูลค่า · สี = กำไร/ขาดทุน · ชี้เพื่อดูรายละเอียด</p>
          <PortfolioTreemap assets={assets} txs={txs} usdRate={usdRate} theme={theme} hide={hideAmt||privacy}/>
        </div>
        <div className={card + ' p-5'}>
          <h3 className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>ผลตอบแทนต่อปี</h3>
          <p className={`text-xs mt-0.5 mb-4 ${subTx}`}>คิดแบบทบต้น เทียบกันได้ข้ามระยะเวลาถือ</p>
          <ReturnRanking assets={assets} txs={txs} usdRate={usdRate} theme={theme}/>
        </div>
      </div>

      {/* The last-10 transactions list used to sit here, collapsed, above the
          P/L card. The transactions page is the same list without the cap and
          with search, filters and bulk select, so the dashboard copy could only
          ever be the worse of the two — and it carried its own edit and delete
          buttons, which meant a second place to change data that had to be
          kept in step with the real one for no gain. */}
      <UnrealizedPL assets={assets} txs={txs} usdRate={usdRate} theme={theme} hide={hideAmt||privacy} nwHistory={nwHistory} cashTotal={walletCashTotal}/>
    </div>
  );
};

// ── MONTH GROUP (Accordion Row) ────────────────────────────
const MonthGroup = ({ month, txs, dk, defaultOpen=false, sel, toggleSel, onEdit, onDelete, walletMap, assets=[], onAddRecurring, onQuickEdit, favKeys, balCol=null, sysDay=null }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [editInline, setEditInline] = useState(null);
  const startEdit = (t, field) => { if(!onQuickEdit) return; setEditInline({id:t.id, field, value: field==='title'?t.title:String(Math.abs(t.amount))}); };
  const commitEdit = (t) => {
    if(!editInline) return;
    if(editInline.field==='title') {
      const v = editInline.value.trim(); if(v) onQuickEdit(t.id,{title:v});
    } else {
      const n = parseFloat(editInline.value); if(n>0) onQuickEdit(t.id,{amount: t.amount<0?-n:n});
    }
    setEditInline(null);
  };
  const [y, m] = month.split('-');
  const monthLabel = MONTHS_TH[parseInt(m)-1] + ' ' + y;
  const income  = sumTxType(txs,'income');
  const expense = sumTxType(txs,'expense');
  const net = income - expense;
  return (
    <div className={`border-b last:border-0 ${dk?'border-white/5':'border-slate-100'}`}>
      {/* Parent summary row */}
      {/* The header was white at 4% while the rows under it were black at 10% —
          a few percent apart on either side of the card, so neither won and the
          month line sank into the list it was supposed to head.

          It is lifted to 9% and warmed, which puts it in the same world as the
          gold rather than reading as grey laid over black, and a rule along the
          top marks where one month ends and the next begins. Not orange: there
          are six of these on a page, and an accent spent six times over stops
          meaning "this one". Orange appears on one edge of the open month only,
          which is the single thing here worth pointing at. */}
      <div onClick={()=>setOpen(o=>!o)}
        className={`relative flex items-center gap-3 px-4 py-4 cursor-pointer select-none transition-colors ${dk?'border-t border-white/10':(open?'bg-slate-100 border-t border-slate-200':'border-t border-slate-200 hover:bg-slate-50')}`}
        style={dk?{background:open?'rgba(232,216,186,0.15)':'rgba(232,216,186,0.10)'}:undefined}>
        {open&&<span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{background:'#e8763a'}}/>}
        <div className={`flex-shrink-0 transition-transform duration-200 ${open?'text-orange-400':(dk?'text-slate-400':'text-slate-500')}`}
          style={{transform:open?'rotate(90deg)':'rotate(0deg)'}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-base font-bold ${dk?'text-white':'text-slate-800'}`}>{monthLabel}</span>
          <span className={`ml-2 text-xs ${dk?'text-slate-400':'text-slate-500'}`}>{txs.length} รายการ</span>
          {income>0&&<span className="hidden md:inline ml-3 text-xs"><span className={`mr-1 ${dk?'text-slate-400':'text-slate-500'}`}>รับ</span><span className="font-medium text-gold-400 tabular-nums">+{fmt(income)}</span></span>}
          {expense>0&&<span className="hidden md:inline ml-2 text-xs"><span className={`mr-1 ${dk?'text-slate-400':'text-slate-500'}`}>จ่าย</span><span className="font-medium text-rose-400 tabular-nums">-{fmt(expense)}</span></span>}
        </div>
        <div className="w-24 hidden sm:block flex-shrink-0"/>
        <div className={`w-32 text-right text-sm font-bold tabular-nums flex-shrink-0 ${net>=0?'text-emerald-400':'text-rose-400'}`}>{net>=0?'+':''}{fmtSigned(net)}</div>
        {balCol&&<div className="w-28 flex-shrink-0 hidden sm:block"/>}
        {/* must match the actions column on the rows below (w-20), or every
            column to its left lands 24px off the figures it heads */}
        <div className="w-20 flex-shrink-0"/>
      </div>
      {/* Child rows — card-list style. Pushed further down as the header came
          up: separation is the gap between two surfaces, not the brightness of
          one, and lifting the header alone had it climbing towards the cards
          around it instead of away from the list it heads. Measured against the
          card colour, the two are 1.42 apart now where they were 1.18. */}
      {open&&(
        <div className={dk?'bg-black/30':'bg-slate-50/60'}>
          {txs.map((t,i)=>{
           // Rows run newest first, so a day closes at the top of its block —
           // the same place a bank statement puts the closing balance.
           const close = sysDay && (i===0 || txs[i-1].date!==t.date) ? sysDay[t.date] : null;
           return (
            <React.Fragment key={t.id}>
            {close&&(
              <div className={`flex items-center gap-2 px-4 py-1.5 border-t text-[11px] ${dk?'border-white/[0.06] bg-white/[0.03]':'border-slate-100 bg-slate-100/70'}`}>
                <span className={dk?'text-slate-500':'text-slate-400'}>สิ้นวัน {dayLabel(t.date)}</span>
                <span className={`flex-1 border-b border-dashed ${dk?'border-white/10':'border-slate-200'}`}/>
                {close.warn&&(
                  <span className="text-rose-400 font-semibold" title={`โยกเงินวันนี้ไม่สมดุล ${fmtSigned(close.gap)} — มีรายการโยกที่ปลายทางหายไป`}>
                    ⚠️ โยกไม่สมดุล {fmtSigned(close.gap)}
                  </span>
                )}
                <span className={`tabular-nums font-semibold ${dk?'text-slate-300':'text-slate-600'}`}>เงินสดรวม {fmtSigned(close.total)}</span>
              </div>
            )}
            <div
              className={`flex items-center gap-3 px-4 py-4 border-t group transition-colors ${dk?(i%2===0?'border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.05]':'border-white/[0.04] bg-black/[0.08] hover:bg-white/[0.04]'):(i%2===0?'border-slate-100 bg-white hover:bg-slate-50':'border-slate-100 bg-slate-50/50 hover:bg-slate-100/60')}`}>
              <input type="checkbox" checked={sel.includes(t.id)} onChange={()=>toggleSel(t.id)} className="rounded w-3.5 h-3.5 flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"/>
              {/* Category color bar */}
              <div className="w-[3px] h-8 rounded-full flex-shrink-0 opacity-70" style={{background:txBarClr(t)}}/>
              {/* Title + meta */}
              <div className="flex-1 min-w-0">
                {editInline?.id===t.id&&editInline.field==='title'
                  ? <input autoFocus className={`text-xs font-semibold w-full outline-none rounded px-1 -mx-1 ${dk?'bg-white/10 text-white':'bg-gold-50 text-slate-800'}`}
                      value={editInline.value} onChange={e=>setEditInline(p=>({...p,value:e.target.value}))}
                      onBlur={()=>commitEdit(t)} onKeyDown={e=>{if(e.key==='Enter')commitEdit(t);if(e.key==='Escape')setEditInline(null);}}/>
                  : <div data-hint="ดับเบิลคลิกแก้ชื่อรายการ" className={`text-xs font-semibold truncate ${dk?'text-white':'text-slate-700'}`} onDoubleClick={()=>startEdit(t,'title')} title={onQuickEdit?'ดับเบิลคลิกเพื่อแก้ชื่อ':''}>{t.title}</div>
                }
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={`text-xs tabular-nums ${dk?'text-slate-400':'text-slate-500'}`}>{t.date}</span>
                  <span className={`text-slate-400 text-xs ${dk?'':'text-slate-300'}`}>·</span>
                  <span className="px-1.5 py-px rounded-md text-xs font-medium" style={{background:txBarClr(t)+'22',color:txBarClr(t)}}>{t.type==='transfer'?(()=>{
                    const targetWallet = t.transferDir==='from'?walletMap[t.toWalletId]:walletMap[t.fromWalletId];
                    return t.transferDir==='from'?`โยกไป ${targetWallet?.name||'wallet'}`:` รับจาก ${targetWallet?.name||'wallet'}`;
                  })():t.type==='adjustment'?'ปรับยอด':t.type==='dividend'?'ปันผล':t.category}</span>
                  {t.type==='transfer'&&(t.fromAssetId||t.toAssetId)&&(()=>{
                    const srcAsset = assets && assets.find(a=>a.id===t.fromAssetId);
                    const dstAsset = assets && assets.find(a=>a.id===t.toAssetId);
                    return srcAsset||dstAsset?<span className={`text-xs ${dk?'text-slate-500':'text-slate-400'}`}>📦 {srcAsset?.name||'asset'} → {dstAsset?.name||'asset'}</span>:null;
                  })()}
                  {t.walletId&&walletMap[t.walletId]&&!t.fromAssetId&&(()=>{const w=walletMap[t.walletId];const ico=w.type==='bank'?detectBankIcon(w.name,12):w.type==='crypto'?detectCryptoWalletIcon(w.name,12):w.icon;return(<span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium ${dk?'bg-white/8 text-slate-400':'bg-slate-100 text-slate-700'}`}>{typeof ico==='string'?<span className="text-[11px]">{ico}</span>:ico}<span>{w.name}</span></span>);})()}
                  {t.type==='adjustment'&&t.targetAssetId&&(()=>{const a=assets&&assets.find(x=>x.id===t.targetAssetId);return a?<span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium ${dk?'bg-amber-500/10 text-amber-400':'bg-amber-50 text-amber-700'}`}>📦 {a.name}</span>:null;})()}
                  {t.type==='dividend'&&t.targetAssetId&&(()=>{const a=assets&&assets.find(x=>x.id===t.targetAssetId);return a?<span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium ${dk?'bg-teal-500/10 text-teal-400':'bg-teal-50 text-teal-700'}`}>💰 {a.name}</span>:null;})()}
                  {t.notes&&(()=>{const isRec=t.notes.includes('[rec:');const display=isRec?'รายการประจำ':t.notes;return(<span className={`text-xs truncate max-w-[140px] ${isRec?(dk?'text-gold-400/70':'text-gold-400'):(dk?'text-slate-500':'text-slate-400')}`}>· {display}</span>);})()}
                </div>
              </div>
              {/* Type badge — aligned to ประเภท column */}
              <div className="w-24 flex-shrink-0 hidden sm:flex justify-center">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${txBadgeCls(t)}`}>{txLabel(t)}</span>
              </div>
              {/* Amount — aligned to จำนวน column */}
              {editInline?.id===t.id&&editInline.field==='amount'
                ? <input autoFocus type="number" min="0" className={`w-32 flex-shrink-0 text-sm font-bold tabular-nums text-right outline-none rounded px-1 ${dk?'bg-white/10 text-white':'bg-gold-50 text-slate-800'}`}
                    value={editInline.value} onChange={e=>setEditInline(p=>({...p,value:e.target.value}))}
                    onBlur={()=>commitEdit(t)} onKeyDown={e=>{if(e.key==='Enter')commitEdit(t);if(e.key==='Escape')setEditInline(null);}}/>
                : <div className="w-32 flex-shrink-0 text-right">
                    <div data-hint="ดับเบิลคลิกแก้ยอดเงิน" className={`text-sm font-bold tabular-nums ${txAmtCls(t)}`} onDoubleClick={()=>t.type!=='transfer'&&startEdit(t,'amount')} title={onQuickEdit&&t.type!=='transfer'?'ดับเบิลคลิกเพื่อแก้ยอด':''}>{txSign(t)}{fmt(Math.abs(t.amount))}</div>
                    {/* narrow screens have no room for a fourth column, so the
                        balance tucks under the amount there instead */}
                    {balCol&&balCol.map[t.id]!==undefined&&(
                      <div className={`sm:hidden text-[10px] tabular-nums mt-0.5 ${balCol.map[t.id]<0?'text-rose-400 font-semibold':(dk?'text-slate-500':'text-slate-400')}`}>{balCol.label} {fmtSigned(balCol.map[t.id])}</div>
                    )}
                  </div>
              }
              {/* Balance — the statement column. A wallet balance genuinely can go
                  below zero (the data audit has a rule for exactly that), so it is
                  printed signed: fmt() would render it as a positive and turn the
                  one row that reveals the problem into the one row that hides it. */}
              {balCol&&(
                <div className={`w-28 flex-shrink-0 hidden sm:block text-right text-sm tabular-nums ${balCol.map[t.id]===undefined?'':balCol.map[t.id]<0?'text-rose-400 font-bold':(dk?'text-slate-300 font-medium':'text-slate-600 font-medium')}`}>
                  {balCol.map[t.id]===undefined?'':fmtSigned(balCol.map[t.id])}
                </div>
              )}
              {/* Actions */}
              <div className="w-20 flex-shrink-0 flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                {onAddRecurring&&t.type!=='transfer'&&(()=>{ const isFav=favKeys&&favKeys.has(t.title+'|'+t.type); return (
                  <button title={isFav?'⭐ บันทึกเป็นรายการโปรดแล้ว (กดเพื่อเพิ่มอีกได้)':'⭐ บันทึกเป็นรายการโปรด/ประจำ — เปิดหน้าต่างให้ยืนยันก่อน (กันกดผิด)'} onClick={e=>{e.stopPropagation();onAddRecurring(t);}} className={`p-1.5 rounded-lg transition-colors ${isFav?(dk?'bg-gold-500/25 text-gold-300':'bg-gold-100 text-gold-600'):(dk?'hover:bg-gold-500/20 text-slate-400 hover:text-gold-400':'hover:bg-gold-50 text-slate-400 hover:text-gold-500')}`}><Ic n="star" s={12} fill={isFav?'currentColor':'none'}/></button>
                ); })()}
                <button title="แก้ไข" onClick={e=>{e.stopPropagation();onEdit(t);}} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-200 text-slate-400'}`}><Ic n="edit" s={11}/></button>
                <button title="ลบ" onClick={e=>{e.stopPropagation();onDelete(t.id);}} className={`p-1.5 rounded-lg ${dk?'hover:bg-rose-500/20 text-rose-400':'hover:bg-rose-50 text-rose-400'}`}><Ic n="trash" s={11}/></button>
              </div>
            </div>
            </React.Fragment>
           );
          })}
        </div>
      )}
    </div>
  );
};

// ── TRANSACTIONS PAGE ───────────────────────────────────────
const TxPage = ({ txs, theme, onEdit, onAdd, onDelete, onBulkDelete, onExport, wallets=[], assets=[], onAddRecurring, onRecordRecurring, onQuickEdit, favKeys }) => {
  const dk = theme==='dark';
  const [confirmEl, ask] = useConfirm(dk);
  const [search,setSearch]=useState('');
  const [fType,setFType]=useState('all');
  const [fCat,setFCat]=useState('all');
  const [fWallet,setFWallet]=useState('all');
  // Which stretch of time the page opens on. Stored as the choice ("today"),
  // never as the date itself — a saved 2026-08-08 would still say 2026-08-08
  // tomorrow, and the page would open on a day that has quietly become
  // yesterday. Resolved to real dates below, on every load.
  const [dRange,setDRange]=useState(()=>{ try { return localStorage.getItem('ft-tx-range') || 'today'; } catch { return 'today'; } });
  const initDates = (() => {
    const d = new Date().toISOString().slice(0,10);
    if (dRange==='today') return [d, d];
    if (dRange==='month') return [d.slice(0,8)+'01', d];
    return ['',''];
  })();
  const [fDateFrom,setFDateFrom]=useState(initDates[0]);
  const [fDateTo,setFDateTo]=useState(initDates[1]);
  useEffect(()=>{ try { localStorage.setItem('ft-tx-range', dRange); } catch {} },[dRange]);
  const [showAdv,setShowAdv]=useState(false);
  const [sortBy,setSortBy]=useState('date');
  const [sortDir,setSortDir]=useState('desc');
  const [sel,setSel]=useState([]);

  // ── Recurring (embedded) ──
  const [recOpen,setRecOpen]=useState(false);
  const [recList,setRecList]=useState(()=>{try{return JSON.parse(localStorage.getItem('ft-recurring')||'null')||RECURRING_DEFAULTS;}catch{return RECURRING_DEFAULTS;}});
  const recListMounted = useRef(false);
  useEffect(()=>{
    localStorage.setItem('ft-recurring',JSON.stringify(recList));
    // same reasoning as the Budget/Assets page fixes — the Transactions page is the most commonly opened page,
    // so this one mattered most: don't sync from merely opening it with whatever was already in local storage.
    if (!recListMounted.current) { recListMounted.current = true; return; }
    window.dispatchEvent(new Event('ft-sync'));
  },[recList]);
  // reload list when a recurring item is added elsewhere (e.g. "เพิ่มเป็นรายการประจำ" from a tx)
  useEffect(()=>{ const reload=()=>{try{setRecList(JSON.parse(localStorage.getItem('ft-recurring')||'null')||RECURRING_DEFAULTS);}catch{}}; window.addEventListener('ft-rec-ext',reload); return ()=>window.removeEventListener('ft-rec-ext',reload); },[]);
  const [recModal,setRecModal]=useState({open:false,editData:null});
  const rNow=new Date();
  const rCurM=`${rNow.getFullYear()}-${String(rNow.getMonth()+1).padStart(2,'0')}`;
  const doneIds=useMemo(()=>new Set(txs.filter(t=>t.date.startsWith(rCurM)&&t.notes?.includes('[rec:')).map(t=>{const m=t.notes.match(/\[rec:([^\]]+)\]/);return m?.[1];}).filter(Boolean)),[txs,rCurM]);
  const doneTxMap=useMemo(()=>{const m={};txs.filter(t=>t.date.startsWith(rCurM)&&t.notes?.includes('[rec:')).forEach(t=>{const match=t.notes.match(/\[rec:([^\]]+)\]/);if(match)m[match[1]]=t;});return m;},[txs,rCurM]);
  const addOneRec=r=>{const maxDay=new Date(rNow.getFullYear(),rNow.getMonth()+1,0).getDate();const dd=String(Math.min(r.day,maxDay)).padStart(2,'0');onRecordRecurring&&onRecordRecurring({title:r.title,amount:r.amount,category:r.category,type:r.type,date:`${rCurM}-${dd}`,notes:`[rec:${r.id}] ${r.method}`,walletId:r.walletId||null});};
  const addAllRec=()=>recList.filter(r=>r.enabled&&!doneIds.has(r.id)).forEach(addOneRec);
  const toggleRec=id=>setRecList(ls=>ls.map(r=>r.id===id?{...r,enabled:!r.enabled}:r));
  const deleteRecItem=id=>ask('ลบรายการประจำ','ยืนยันการลบรายการประจำนี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้',()=>setRecList(ls=>ls.filter(r=>r.id!==id)));
  const saveRec=data=>{if(recModal.editData){setRecList(ls=>ls.map(r=>r.id===recModal.editData.id?{...data,id:r.id}:r));}else{setRecList(ls=>[...ls,{...data,id:'r_'+uid()}]);}};
  const pendingRec=recList.filter(r=>r.enabled&&!doneIds.has(r.id));
  const totalPendingRec=pendingRec.reduce((s,r)=>s+r.amount,0);

  const today = new Date().toISOString().slice(0,10);
  const setToday = () => { setFDateFrom(today); setFDateTo(today); setDRange('today'); };
  const clearDates = () => { setFDateFrom(''); setFDateTo(''); setDRange('all'); };
  // Years offered in the picker: every year the data actually covers, up to now
  const yearOpts = useMemo(()=>{
    const ys = txs.map(t=>+String(t.date).slice(0,4)).filter(y=>y>1970);
    const cur = new Date().getFullYear();
    const out = [];
    for (let y = Math.min(ys.length?Math.min(...ys):cur, cur); y <= cur; y++) out.push(y);
    return out.reverse();
  },[txs]);

  const walletMap = useMemo(()=>{const m={};wallets.forEach(w=>m[w.id]=w);return m;},[wallets]);
  const allCats=useMemo(()=>[...new Set(txs.map(t=>t.category))].sort(),[txs]);
  const filtered=useMemo(()=>{
    let l=[...txs];
    if(search) l=l.filter(t=>t.title.toLowerCase().includes(search.toLowerCase())||(t.category||'').toLowerCase().includes(search.toLowerCase()));
    if(fType!=='all') l=l.filter(t=>t.type===fType);
    if(fCat!=='all') l=l.filter(t=>t.type==='transfer'||t.category===fCat);
    if(fWallet!=='all') l=l.filter(t=>fWallet==='none'?!t.walletId:String(t.walletId)===fWallet);
    if(fDateFrom) l=l.filter(t=>t.date>=fDateFrom);
    if(fDateTo) l=l.filter(t=>t.date<=fDateTo);
    l.sort((a,b)=>{ let va=a[sortBy],vb=b[sortBy]; if(sortBy==='amount'){va=+va;vb=+vb;} const cmp=sortDir==='asc'?(va>vb?1:va<vb?-1:0):(va<vb?1:va>vb?-1:0); return cmp!==0?cmp:b.id-a.id; });
    return l;
  },[txs,search,fType,fCat,fWallet,fDateFrom,fDateTo,sortBy,sortDir]);

  const filteredIncome   = useMemo(()=>sumTxType(filtered,'income'),[filtered]);
  const filteredExpense  = useMemo(()=>sumTxType(filtered,'expense'),[filtered]);
  const filteredDividend = useMemo(()=>sumTxType(filtered,'dividend'),[filtered]);
  const filteredBalance  = filteredIncome + filteredDividend - filteredExpense;

  const toggleSort=f=>{ if(sortBy===f) setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortBy(f);setSortDir('desc');} };
  const toggleSel=id=>setSel(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const selAll=()=>setSel(filtered.length===sel.length?[]:filtered.map(t=>t.id));
  // The old wording said this could not be undone, which was wrong twice over:
  // deleted rows go to the recycle bin and come back — but the bin holds 200, so
  // past that they really are gone, and the message that cried wolf about the
  // safe case said nothing about the one that isn't.
  const TRASH_CAP = 200;
  const doBulk=()=>{
    const idSet = new Set(sel);
    const picked = txs.filter(t=>idSet.has(t.id));
    const n = picked.length;
    const sum = picked.reduce((s,t)=>s+Math.abs(t.amount),0);
    const lost = n - TRASH_CAP;
    ask('ลบรายการที่เลือก?',
      `${n.toLocaleString('en-US')} รายการ · รวม ${fmt(sum)}\n` +
      (lost > 0
        ? `⚠️ ถังขยะเก็บได้ ${TRASH_CAP} รายการล่าสุด — อย่างน้อย ${lost.toLocaleString('en-US')} รายการจะหายถาวร กู้ไม่ได้`
        : `ย้ายไปถังขยะ กู้คืนได้ที่เมนู ☰ → ถังขยะ`),
      ()=>{ onBulkDelete(sel); setSel([]); },
      {confirmLabel:`ลบ ${n.toLocaleString('en-US')} รายการ`});
  };

  const grouped=useMemo(()=>{
    const map={};
    filtered.forEach(t=>{ const mo=ym(t.date); if(!map[mo]) map[mo]=[]; map[mo].push(t); });
    return Object.entries(map).sort((a,b)=>b[0].localeCompare(a[0]));
  },[filtered]);

  // Statement-style balance after each row. Only for one wallet at a time, and
  // only newest-first: a running total needs every movement in order, so any
  // other sort — or any filter that drops rows — makes it a number that looks
  // authoritative while being wrong. runningBalances refuses those cases too,
  // by checking the row count against the wallet's full history.
  // A balance only reads correctly when the rows on screen run without gaps:
  // each one has to differ from the row above it by the amount shown on it.
  // Narrowing to a date range keeps that true — it trims the ends of a list
  // that is already in date order. Searching, or filtering by type or category,
  // punches holes in the middle, and then consecutive balances stop agreeing
  // with the amounts between them even though every figure is right.
  const contiguous = !search && fType==='all' && fCat==='all' && sortBy==='date' && sortDir==='desc';

  const runBal = useMemo(()=>{
    if (!contiguous) return null;
    if (fWallet==='all' || fWallet==='none') return null;
    const w = wallets.find(x=>String(x.id)===fWallet);
    return w ? runningBalances(w, txs, assets) : null;
  },[contiguous, fWallet, txs, assets, wallets]);

  // The same idea one level up: how much cash the whole system held at the close
  // of each day. Only in the all-wallets view, where a per-wallet balance has no
  // meaning — and per day rather than per row, because transactions carry no
  // time and their order inside a day is only the order they were entered.
  const sysCash = useMemo(()=>{
    if (!contiguous || fWallet!=='all') return null;
    return systemCashByDay(wallets, txs, assets);
  },[contiguous, fWallet, txs, assets, wallets]);

  // One balance column, filled by whichever figure the current view makes sense
  // of: a single wallet's balance, or cash across all of them.
  const balCol = runBal ? { map: runBal, label:'คงเหลือ' }
               : sysCash ? { map: sysCash.row, label:'เงินสดรวม' }
               : null;

  const inp=`px-3 py-2 rounded-xl border text-sm outline-none transition-all ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-600 focus:border-gold-500':'bg-white border-slate-200 text-slate-700 focus:border-gold-400'}`;
  const th=`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none ${dk?'text-slate-500 hover:text-white':'text-slate-400 hover:text-slate-700'}`;
  const SI=({f})=>sortBy===f?<Ic n={sortDir==='asc'?'up':'down'} s={11} cls="inline ml-1"/>:null;

  return (
    <div className="space-y-4 fade-up">
      <PageHeader theme={theme} lead="All" accent="Transactions"
        sub={`${txs.length} รายการ · รายรับ รายจ่าย โยกเงิน และปันผล`}/>
      {onAdd&&(
        <div className="flex items-center justify-between">
          <h2 className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>📋 รายการทั้งหมด</h2>
          <button data-hint="กดเพิ่มรายรับ-รายจ่ายของคุณเองที่นี่" onClick={onAdd} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl btn-primary text-white text-xs font-semibold">
            <Ic n="plus" s={13}/> เพิ่มรายการ
          </button>
        </div>
      )}
      <div className={`rounded-2xl p-4 space-y-3 ${dk?'card-solid':'glass-light shadow-sm'}`}>
        {/* Row 1: Search */}
        <div className="relative">
          <Ic n="search" s={14} cls={`absolute left-3 top-1/2 -translate-y-1/2 ${dk?'text-slate-400':'text-slate-500'}`}/>
          <input className={`${inp} pl-9 ${search?'pr-8':'pr-3'} w-full`} placeholder="ค้นหา..." value={search} onChange={e=>setSearch(e.target.value)}/>
          {search&&<button onClick={()=>setSearch('')} className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full transition-colors ${dk?'text-slate-500 hover:text-slate-300':'text-slate-400 hover:text-slate-600'}`}><Ic n="x" s={13}/></button>}
        </div>
        {/* Row 2: All filters in one scrollable row */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <div className={`flex rounded-xl p-1 gap-0.5 flex-shrink-0 ${dk?'bg-white/5':'bg-slate-100'}`}>
            {[['all','ทั้งหมด'],['income','รายรับ'],['expense','รายจ่าย'],['transfer','โยก'],['dividend','ปันผล'],['adjustment','ปรับยอด']].map(([v,l])=>(
              <button key={v} onClick={()=>setFType(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${fType===v?(dk?'bg-gold-500/25 text-gold-200':'bg-gold-500 shadow-sm'):(dk?'text-slate-400 hover:text-white':'text-slate-500 hover:text-slate-800')}`}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={setToday} className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${fDateFrom===today&&fDateTo===today?(dk?'bg-gold-500/20 text-gold-300 border border-gold-500/30':'bg-gold-50 text-gold-600 border border-gold-200'):(dk?'bg-white/5 text-slate-400 hover:text-white':'bg-slate-100 text-slate-700 hover:text-slate-800')}`}>
            วันนี้
          </button>
          <DateRangePicker from={fDateFrom} to={fDateTo} dk={dk} years={yearOpts}
            onPick={(a,b)=>{ setFDateFrom(a); setFDateTo(b);
              // What is remembered is the *kind* of range, resolved to real dates
              // on the next load — a stored 8 Aug would still say 8 Aug in October
              setDRange(a===b&&a===todayIso() ? 'today' : isWholeMonth(a,b) ? 'month' : 'custom'); }}/>
          {(fDateFrom||fDateTo)&&(
            <button onClick={clearDates} className={`flex-shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors text-rose-400 hover:bg-rose-500/10`}><Ic n="x" s={11}/></button>
          )}
          <button onClick={()=>setShowAdv(p=>!p)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border whitespace-nowrap ${showAdv||fCat!=='all'||fWallet!=='all'?(dk?'border-gold-500/40 bg-gold-500/10 text-gold-300':'border-gold-300 bg-gold-50 text-gold-600'):(dk?'border-white/10 bg-white/5 text-slate-400 hover:text-white':'border-slate-200 bg-slate-100 text-slate-700 hover:text-slate-800')}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
            ตัวกรอง
            {(fCat!=='all'||fWallet!=='all')&&<span className="w-1.5 h-1.5 rounded-full bg-gold-400"/>}
          </button>
        </div>
        {/* Advanced filters (collapsible) */}
        {showAdv&&(
          <div className={`flex flex-wrap items-center gap-2 pt-3 border-t ${dk?'border-white/5':'border-slate-100'}`}>
            <select className={`${inp} flex-1 min-w-32`} value={fCat} onChange={e=>setFCat(e.target.value)}>
              <option value="all">ทุกหมวด</option>{allCats.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            {wallets.length>0&&(
              <select className={`${inp} flex-1 min-w-32`} value={fWallet} onChange={e=>setFWallet(e.target.value)}>
                <option value="all">ทุกกระเป๋า</option>
                <option value="none">ไม่ระบุ</option>
                {wallets.map(w=><option key={w.id} value={String(w.id)}>{w.icon} {w.name}</option>)}
              </select>
            )}
            {/* The from/to date fields lived here. Empty they rendered as the
                browser's own mm/dd/yyyy, in US order and unstyleable, and the
                month picker above covers what they were used for. */}
            <button onClick={()=>exportCSV(filtered)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium flex-shrink-0 ${dk?'bg-white/5 hover:bg-white/10 text-slate-300':'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
              <Ic n="download" s={13}/> CSV{filtered.length<txs.length?` (${filtered.length})`:''}
            </button>
          </div>
        )}
      </div>

      {/* ── Filtered Summary Bar ── */}
      {filtered.length>0&&(
        <div className={`rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 ${dk?'card-solid':'glass-light shadow-sm'}`}>
          {/* Hero: net (the number Fin actually wants) */}
          <div className="flex flex-col gap-1">
            <span className={`text-[11px] font-medium ${dk?'text-slate-400':'text-slate-500'}`}>สุทธิ · {filtered.length} รายการ</span>
            <span className={`flex items-baseline gap-1.5 text-2xl sm:text-3xl font-bold tabular-nums leading-none ${filteredBalance>=0?'text-emerald-400':'text-rose-400'}`}>
              <span className="text-sm font-semibold">{filteredBalance>=0?'▲':'▼'}</span>
              {filteredBalance>=0?'+':'-'}{fmt(filteredBalance)}
            </span>
          </div>
          {/* Supporting breakdown */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex flex-col gap-0.5">
              <span className={`text-[11px] ${dk?'text-slate-400':'text-slate-500'}`}>รายรับ</span>
              <span className="text-sm font-semibold tabular-nums text-gold-400">+{fmt(filteredIncome)}</span>
            </div>
            {filteredDividend>0&&(
              <div className="flex flex-col gap-0.5">
                <span className={`text-[11px] ${dk?'text-slate-400':'text-slate-500'}`}>ปันผล</span>
                <span className="text-sm font-semibold tabular-nums text-teal-400">+{fmt(filteredDividend)}</span>
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <span className={`text-[11px] ${dk?'text-slate-400':'text-slate-500'}`}>รายจ่าย</span>
              <span className="text-sm font-semibold tabular-nums text-rose-400">-{fmt(filteredExpense)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Recurring Collapsible Block ── */}
      <div className={`rounded-2xl overflow-hidden ${dk?'card-solid':'glass-light shadow-sm'}`}>
        <div onClick={()=>setRecOpen(o=>!o)}
          className={`flex items-center gap-3 px-4 py-4 cursor-pointer select-none transition-colors ${dk?'hover:bg-white/5':'hover:bg-slate-50'}`}>
          <div className={`flex-shrink-0 transition-transform duration-200 ${dk?'text-slate-400':'text-slate-500'}`} style={{transform:recOpen?'rotate(90deg)':'rotate(0deg)'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Ic n="repeat" s={13}/>
            <span className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>รายการประจำ</span>
            <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>{recList.length} รายการ · {MONTHS_TH[rNow.getMonth()]} {rNow.getFullYear()}</span>
          </div>
          {pendingRec.length>0&&<span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400">{pendingRec.length} ยังไม่บันทึก</span>}
        </div>
        {recOpen&&(
          <>
            <div className={`flex items-center justify-between gap-3 px-4 py-2.5 border-t ${dk?'border-white/5 bg-white/[0.02]':'border-slate-100 bg-slate-50/60'}`}>
              <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>{pendingRec.length>0?`${pendingRec.length} รายการรอบันทึก`:'บันทึกครบแล้วเดือนนี้ ✓'}</span>
              <div className="flex gap-2">
                {pendingRec.length>0&&<button onClick={addAllRec} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl btn-primary text-white text-xs font-semibold"><Ic n="plus" s={12}/> บันทึกทั้งหมด ({fmt(totalPendingRec)})</button>}
                <button onClick={()=>setRecModal({open:true,editData:null})} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${dk?'bg-white/5 hover:bg-white/10 text-white border-white/10':'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'}`}><Ic n="plus" s={12}/> เพิ่ม</button>
              </div>
            </div>
            {recList.length===0&&<div className={`py-8 text-center text-sm ${dk?'text-slate-400':'text-slate-500'}`}>ยังไม่มีรายการประจำ</div>}
            {recList.map(r=>{
              const done=doneIds.has(r.id),off=!r.enabled;
              return (
                <div key={r.id} className={`flex items-center gap-3 px-4 py-3 border-t group transition-colors ${dk?'border-white/5 hover:bg-white/[0.03]':'border-slate-100 hover:bg-slate-50/60'} ${off?'opacity-40':''}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm ${done?'bg-emerald-500/20 text-emerald-400':r.type==='expense'?'bg-rose-500/15 text-rose-400':'bg-gold-500/15 text-gold-400'}`}>{done?'✓':<CatGlyph v={r.emoji||catIcon(r.category)} s={17}/>}</div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${dk?'text-white':'text-slate-700'}`}>{r.title}</div>
                    <div className={`text-xs mt-0.5 ${dk?'text-slate-400':'text-slate-500'}`}>{r.category} · วันที่ {r.day} ทุกเดือน</div>
                  </div>
                  <div className={`text-sm font-semibold flex-shrink-0 ${r.type==='income'?'text-gold-400':'text-rose-400'}`}>{r.type==='income'?'+':'-'}{fmt(r.amount)}</div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {done&&<div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-emerald-400 px-2">✓ แล้ว</span>
                      <button title="ยกเลิกการโพสต์" onClick={()=>doneTxMap[r.id]&&onDelete(doneTxMap[r.id].id)} className={`p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100 ${dk?'hover:bg-amber-500/20 text-amber-400':'hover:bg-amber-50 text-amber-500'}`}><Ic n="undo" s={11}/></button>
                    </div>}
                    {!done&&r.enabled&&<button onClick={()=>addOneRec(r)} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gold-500/15 text-gold-400 hover:bg-gold-500/25">+ บันทึก</button>}
                    <button onClick={()=>setRecModal({open:true,editData:r})} className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="edit" s={12}/></button>
                    <button onClick={()=>deleteRecItem(r.id)} className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 ${dk?'hover:bg-rose-500/20 text-rose-400':'hover:bg-rose-50 text-rose-400'}`}><Ic n="trash" s={12}/></button>
                    <button onClick={()=>toggleRec(r.id)} className={`p-1.5 rounded-lg text-sm ${dk?'hover:bg-white/10':'hover:bg-slate-100'} ${off?(dk?'text-slate-600':'text-slate-300'):(dk?'text-gold-400':'text-gold-500')}`}>{off?'○':'●'}</button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
      <RecurringModal open={recModal.open} onClose={()=>setRecModal({open:false,editData:null})} onSave={saveRec} editData={recModal.editData} theme={theme} wallets={wallets}/>

      {sel.length>0&&(
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl ${dk?'bg-rose-500/15 border border-rose-500/25':'bg-rose-50 border border-rose-200'}`}>
          <span className="text-sm text-rose-400">เลือก {sel.length} รายการ</span>
          <button onClick={doBulk} className="flex items-center gap-1.5 text-sm text-rose-400 font-medium"><Ic n="trash" s={13}/> ลบที่เลือก</button>
        </div>
      )}

      <div className={`rounded-2xl overflow-hidden ${dk?'card-solid':'glass-light shadow-sm'}`}>
        {/* Accordion header */}
        <div className={`flex items-center gap-3 px-4 py-3 border-b ${dk?'border-white/5 bg-white/[0.03]':'border-slate-100 bg-slate-50'}`}>
          <input type="checkbox" checked={filtered.length>0&&sel.length===filtered.length} onChange={selAll} className="rounded w-3.5 h-3.5 flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity"/>
          {/* stands in for the category colour bar on the rows, so "รายการ" starts
              at the same x as the titles underneath it */}
          <div className="w-[3px] flex-shrink-0"/>
          <div className={`flex-1 text-xs font-semibold uppercase tracking-wide ${dk?'text-slate-400':'text-slate-500'}`}>รายการ</div>
          <div className={`w-24 text-center text-xs font-semibold uppercase tracking-wide hidden sm:block ${dk?'text-slate-400':'text-slate-500'}`}>ประเภท</div>
          <div className={`w-32 text-right text-xs font-semibold uppercase tracking-wide ${dk?'text-slate-400':'text-slate-500'}`}>จำนวน</div>
          {balCol&&<div className={`w-28 flex-shrink-0 hidden sm:block text-right text-xs font-semibold uppercase tracking-wide ${dk?'text-slate-400':'text-slate-500'}`}>{balCol.label}</div>}
          <div className="w-20 flex-shrink-0"/>
        </div>

        {filtered.length===0&&(
          <div className={`py-12 text-center text-sm ${dk?'text-slate-400':'text-slate-500'}`}>ไม่พบรายการ</div>
        )}

        {grouped.length===0 ? (
          <div className="px-5 py-14 text-center">
            <div className="text-4xl mb-3 opacity-60">{txs.length===0?'📝':'🔍'}</div>
            <p className={`text-sm font-semibold mb-1 ${dk?'text-slate-300':'text-slate-600'}`}>{txs.length===0?'ยังไม่มีรายการ':'ไม่พบรายการที่ตรงกับตัวกรอง'}</p>
            <p className={`text-xs mb-4 ${dk?'text-slate-500':'text-slate-400'}`}>{txs.length===0?'เริ่มบันทึกรายรับ-รายจ่ายแรกของคุณได้เลย':'ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา'}</p>
            {txs.length===0
              ? (onAdd&&<button onClick={onAdd} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl btn-primary text-white text-xs font-semibold"><Ic n="plus" s={13}/> เพิ่มรายการ</button>)
              : <button onClick={()=>{setSearch('');setFType('all');setFCat('all');setFWallet('all');setFDateFrom('');setFDateTo('');}} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border ${dk?'border-white/15 text-slate-300 hover:bg-white/8':'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>ล้างตัวกรอง</button>}
          </div>
        ) : grouped.map(([month, mTxs], i)=>(
          <MonthGroup
            key={month}
            month={month}
            txs={mTxs}
            defaultOpen={i===0}
            dk={dk}
            balCol={balCol}
            sysDay={sysCash&&sysCash.day}
            sel={sel}
            toggleSel={toggleSel}
            onEdit={onEdit}
            onDelete={onDelete}
            walletMap={walletMap}
            assets={assets}
            onAddRecurring={onAddRecurring}
            onQuickEdit={onQuickEdit}
            favKeys={favKeys}
          />
        ))}

        <div className={`px-5 py-3 border-t ${dk?'border-white/5':'border-slate-100'}`}>
          <span className={`text-xs ${dk?'text-slate-500':'text-slate-400'}`}>แสดง {filtered.length} จาก {txs.length} รายการ</span>
        </div>
      </div>
      {confirmEl}
    </div>
  );
};

// ── ANALYTICS PAGE ─────────────────────────────────────────
const Analytics = ({ txs, theme }) => {
  const dk = theme==='dark';
  const now = new Date();
  const curM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const lastM = (()=>{ const d=new Date(now.getFullYear(),now.getMonth()-1,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();

  const [localBudgets, setLocalBudgets] = useState(()=>JSON.parse(localStorage.getItem('ft-budgets')||'null')||BUDGET_DEFAULTS);
  const [editCat, setEditCat] = useState(null);
  const [editVal, setEditVal] = useState('');
  const openEdit = (cat, budget) => { setEditCat(cat); setEditVal(String(budget)); };
  const saveBudget = () => {
    const val = parseInt(editVal, 10);
    if (!editCat || isNaN(val) || val <= 0) return;
    const updated = {...localBudgets, [editCat]: val};
    setLocalBudgets(updated);
    localStorage.setItem('ft-budgets', JSON.stringify(updated));
    setEditCat(null);
  };

  const months6=useMemo(()=>{ const ms=[]; for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);ms.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);} return ms; },[]);
  const lineData=useMemo(()=>({ labels:months6.map(m=>{ const[,mo]=m.split('-'); return MONTHS_TH[parseInt(mo)-1]; }), income:months6.map(m=>sumTxMonth(txs,'income',m)), expense:months6.map(m=>sumTxMonth(txs,'expense',m)) }),[txs,months6]);

  const spendSegs=useMemo(()=>{ const byC={}; txs.filter(t=>t.type==='expense'&&t.date.startsWith(curM)).forEach(t=>{ byC[t.category]=(byC[t.category]||0)+t.amount; }); return Object.entries(byC).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([cat,val])=>({cat,val})); },[txs,curM]);
  const totalExp=spendSegs.reduce((s,{val})=>s+val,0);
  const budgetCards=useMemo(()=>Object.entries(localBudgets)
    .map(([cat,budget])=>({ cat, budget, spent:txs.filter(t=>t.type==='expense'&&t.category===cat&&t.date.startsWith(curM)).reduce((s,t)=>s+t.amount,0) }))
    .sort((a,b)=>(b.spent/b.budget)-(a.spent/a.budget))
    .slice(0,4)
  ,[txs,curM,localBudgets]);

  const curInc=sumTxMonth(txs,'income',curM), lstInc=sumTxMonth(txs,'income',lastM);
  const curExp=sumTxMonth(txs,'expense',curM), lstExp=sumTxMonth(txs,'expense',lastM);
  const momInc=lstInc>0?((curInc-lstInc)/lstInc*100):0;
  const momExp=lstExp>0?((curExp-lstExp)/lstExp*100):0;

  const card=`rounded-2xl p-5 fade-up ${dk?'card-solid':'glass-light shadow-sm'}`;
  const ttl=`text-sm font-semibold mb-4 ${dk?'text-white':'text-slate-700'}`;
  const sub=`text-xs ${dk?'text-slate-400':'text-slate-500'}`;

  return (
    <div className="space-y-4 fade-up">
      <div className="grid grid-cols-2 gap-4">
        {[{label:'รายรับ MoM',val:curInc,mom:momInc,good:true},{label:'รายจ่าย MoM',val:curExp,mom:momExp,good:false}].map(({label,val,mom,good})=>(
          <div key={label} className={card}>
            <div className={sub+' mb-2'}>{label}</div>
            <div className={`text-xl font-bold mb-1 ${dk?'text-white':'text-slate-800'}`}>{fmt(val)}</div>
            <div className={`text-xs font-medium flex items-center gap-1 ${mom===0?(dk?'text-slate-500':'text-slate-400'):(mom>0)===good?'text-emerald-400':'text-rose-400'}`}>
              <Ic n={mom>=0?'up':'down'} s={11}/>{Math.abs(mom).toFixed(1)}% vs เดือนที่แล้ว
            </div>
          </div>
        ))}
      </div>
      <div className={card}>
        <h3 className={ttl}>แนวโน้ม 6 เดือน</h3>
        <div className="h-64"><LineChart data={lineData} theme={theme}/></div>
      </div>
      {/* Stats13 — Spending Segmented Breakdown */}
      <div className={card}>
        <p className={`text-sm mb-4 ${dk?'text-slate-400':'text-slate-500'}`}>
          รายจ่ายเดือนนี้{' '}
          <span className={`font-semibold tabular-nums ${dk?'text-white':'text-slate-800'}`}>฿{totalExp.toLocaleString('th-TH')}</span>
          {' '}บาท
        </p>
        {spendSegs.length===0
          ? <p className={`text-sm ${sub}`}>ยังไม่มีรายจ่ายเดือนนี้</p>
          : <>
            <div className={`flex h-2.5 w-full overflow-hidden rounded-full mb-4 ${dk?'bg-white/10':'bg-slate-100'}`}>
              {spendSegs.map(({cat,val})=>(
                <div key={cat} className="h-full transition-all duration-700"
                  style={{width:`${totalExp>0?val/totalExp*100:0}%`,background:PASTEL_CLR[cat]||PASTEL_CLR.default}}/>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {spendSegs.map(({cat,val})=>(
                <div key={cat} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{background:PASTEL_CLR[cat]||PASTEL_CLR.default}}/>
                  <span className={`text-sm ${dk?'text-slate-400':'text-slate-500'}`}>{cat}</span>
                  <span className={`text-sm tabular-nums ${dk?'text-slate-300':'text-slate-600'}`}>฿{val.toLocaleString('th-TH')}</span>
                </div>
              ))}
            </div>
          </>
        }
      </div>

      {/* Stats11 — Budget Metric Cards */}
      <div>
        <h3 className={`${ttl} mb-3`}>งบประมาณเดือนนี้</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {budgetCards.map(({cat,spent,budget})=>(
            <BudgetMetricCard key={cat} cat={cat} spent={spent} budget={budget} dk={dk} onEdit={openEdit}/>
          ))}
        </div>
      </div>

      {/* Budget Edit Modal */}
      {editCat&&(
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={()=>setEditCat(null)}>
          <div className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl scale-in ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`} onClick={e=>e.stopPropagation()}>
            <h3 className={`text-base font-semibold mb-1 ${dk?'text-white':'text-slate-800'}`}>Update Budget</h3>
            <p className={`text-sm mb-5 ${dk?'text-slate-400':'text-slate-500'}`}>งบประมาณสำหรับหมวด <span className="font-medium" style={{color:catClr(editCat)}}>{editCat}</span></p>
            <div>
              <label className={`text-sm font-medium mb-1.5 block ${dk?'text-slate-200':'text-slate-700'}`}>งบต่อเดือน (฿)</label>
              <input type="number" value={editVal} onChange={e=>setEditVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveBudget()}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-gold-500/20 ${dk?'bg-white/5 border-white/10 text-white':'bg-white border-slate-200 text-slate-800'}`}/>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={()=>setEditCat(null)} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${dk?'border-white/10 text-slate-300 hover:bg-white/5':'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Cancel</button>
              <button onClick={saveBudget} className="flex-1 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-600 text-sm font-medium transition-colors">Update</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── SESSION MANAGEMENT ──────────────────────────────────────
const getDeviceId = () => {
  let id = localStorage.getItem('ft-device-id');
  if (!id) { id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).substr(2,6); localStorage.setItem('ft-device-id', id); }
  return id;
};
const getPlatform = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? '📱 Mobile' : '💻 PC';

// ── ASSETS ─────────────────────────────────────────────────
const BtcIcon = ({s=18})=><svg width={s} height={s} viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#F7931A"/><path fill="white" d="M22.4 13.4c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.7 2.7-1.3-.3.7-2.7-1.6-.4-.7 2.7-2.6-.6-.4 1.7s1.2.3 1.1.3c.6.2.7.5.7.8l-1.7 6.9c-.1.2-.3.5-.8.4 0 .1-1.1-.3-1.1-.3l-.8 1.8 2.5.6 1.4.4-.7 2.7 1.6.4.7-2.7 1.3.3-.7 2.7 1.6.4.7-2.7c2.7.5 4.8.3 5.6-2.1.7-2-.03-3.1-1.5-3.9 1.1-.2 1.9-1 2.1-2.3zm-3.8 5.3c-.5 2-3.9.9-5 .6l.9-3.5c1.1.3 4.6.8 4.1 2.9zm.5-5.3c-.5 1.8-3.3.9-4.2.7l.8-3.2c.9.2 3.9.6 3.4 2.5z"/></svg>;
const SoFiIcon = ({s=18})=><svg width={s} height={s} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="7" fill="#1B0032"/><text x="16" y="14" textAnchor="middle" fill="#B2FF5C" fontSize="9" fontWeight="800" fontFamily="Arial,sans-serif" letterSpacing="-0.2">SoFi</text><text x="16" y="25" textAnchor="middle" fill="#ffffff" fontSize="6.5" fontWeight="500" fontFamily="Arial,sans-serif" letterSpacing="0.3" opacity="0.7">Technologies</text></svg>;
const EthIcon = ({s=18})=><svg width={s} height={s} viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#627EEA"/><g fill="#fff"><path opacity=".6" d="M16.3 4v8.6l7.3 3.3z"/><path d="M16.3 4L9 15.9l7.3-3.3z"/><path opacity=".6" d="M16.3 21.9v6.1l7.3-10.1z"/><path d="M16.3 28v-6.1L9 17.9z"/><path opacity=".2" d="M16.3 20.6l7.3-4.1-7.3-3.3z"/><path opacity=".6" d="M9 16.5l7.3 4.1v-7.4z"/></g></svg>;
const TronIcon = ({s=18})=><svg width={s} height={s} viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#EB0029"/><polygon fill="#fff" points="9,9 24,12 15,26"/><polygon fill="#fff" opacity=".55" points="9,9 16,10.5 12,22"/></svg>;
const UsdtIcon = ({s=18})=><svg width={s} height={s} viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#26A17B"/><path fill="#fff" d="M17.9 17.3v-.01c-.11.01-.68.04-1.95.04-1.01 0-1.72-.03-1.97-.04v.02c-3.6-.16-6.29-.79-6.29-1.54s2.69-1.38 6.29-1.55v2.47c.26.02.98.06 1.99.06 1.21 0 1.82-.05 1.93-.06v-2.46c3.59.16 6.27.79 6.27 1.54s-2.68 1.38-6.27 1.54zm0-3.34v-2.21h5.02V8.4H9.12v3.35h5.02v2.21c-4.08.19-7.15 1-7.15 1.96s3.07 1.77 7.15 1.96v7.02h3.76v-7.03c4.07-.19 7.13-1 7.13-1.95s-3.06-1.76-7.13-1.95z"/></svg>;
const GoldIcon = ({s=18})=><svg width={s} height={s} viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="120" rx="18" fill="#FFB300"/><rect x="8" y="8" width="84" height="104" rx="13" fill="#FFCA28"/><rect x="16" y="16" width="68" height="88" rx="9" fill="#FFB300"/><text x="50" y="50" textAnchor="middle" fill="#FFE082" fontSize="22" fontWeight="bold" fontFamily="sans-serif">GOLD</text><text x="50" y="78" textAnchor="middle" fill="#FFE082" fontSize="18" fontWeight="bold" fontFamily="sans-serif">999.9</text><text x="50" y="102" textAnchor="middle" fill="#FFE082" fontSize="18" fontWeight="bold" fontFamily="sans-serif">1M</text></svg>;
const BankIcon = ({s=18})=><svg width={s} height={s} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="28" width="52" height="5" rx="2" fill="#3d4a5c"/><rect x="10" y="33" width="7" height="20" rx="2" fill="#3d4a5c"/><rect x="22" y="33" width="7" height="20" rx="2" fill="#3d4a5c"/><rect x="35" y="33" width="7" height="20" rx="2" fill="#3d4a5c"/><rect x="47" y="33" width="7" height="20" rx="2" fill="#3d4a5c"/><rect x="4" y="53" width="56" height="6" rx="3" fill="#3d4a5c"/><polygon points="32,8 4,28 60,28" fill="#3d4a5c"/><circle cx="32" cy="18" r="12" fill="#4caf50" stroke="white" strokeWidth="2"/><text x="32" y="23" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="Arial,sans-serif">$</text></svg>;
// CashIcon was three overlapping banknotes in fixed cream and tan. It went with
// its last caller: TYPE_SVG.cash is drawn in currentColor, so the cash wallet
// now takes its colour from the ramp like every other type instead of carrying
// a palette of its own.
const KBankIcon = ({s=18})=>{
  const [err,setErr]=useState(false);
  if(err) return <span style={{width:s,height:s,borderRadius:Math.round(s*0.28),background:'#13a538',color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:Math.round(s*0.56),lineHeight:1}}>K</span>;
  return <img src="/kbank.png?v=2" width={s} height={s} alt="KBANK" onError={()=>setErr(true)} style={{display:'block',objectFit:'contain'}}/>;
};
const SCBIcon = ({s=18})=><svg width={s} height={s} viewBox="0 0 1591 1574" xmlns="http://www.w3.org/2000/svg"><path d="m0.3 0h1590.7v1574h-1590.7z" fill="#462279"/><path d="m1410.6 1242.8l-167.3-655.8-446-406.6-446.1 403.3-167.2 655.8 318.1 150.9h252.5v-226.3c0 0-465.7 245.9-344.3-305 39.3-183.6 255.8-426.2 377.1-495.1 3.3-3.3 6.6-3.3 9.9-6.6 121.3 59.1 347.6 311.6 390.3 501.7 121.3 550.9-344.4 305-344.4 305v226.3h252.5z" fill="#feac00"/></svg>;
const OKXIcon = ({s=22}) => (
  <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="8" fill="#000"/>
    <rect x="7" y="15.5" width="8" height="9" rx="1.5" fill="white"/>
    <rect x="16" y="15.5" width="8" height="9" rx="1.5" fill="white"/>
    <rect x="25" y="15.5" width="8" height="9" rx="1.5" fill="white"/>
  </svg>
);
const OneKeyIcon = ({s=22}) => (
  <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="8" fill="#00B812"/>
    <circle cx="16" cy="20" r="7" stroke="white" strokeWidth="2.5" fill="none"/>
    <circle cx="16" cy="20" r="2.5" fill="white"/>
    <rect x="23" y="19" width="11" height="2.5" rx="1.25" fill="white"/>
    <rect x="30" y="21.5" width="4" height="2.5" rx="1.25" fill="white"/>
    <rect x="27" y="21.5" width="4" height="2.5" rx="1.25" fill="white"/>
  </svg>
);
const detectCryptoWalletIcon = (name, s=22) => {
  const n = (name||'').toUpperCase();
  if(n.includes('OKX')) return <OKXIcon s={s}/>;
  if(n.includes('ONEKEY')||n.includes('ONE KEY')) return <OneKeyIcon s={s}/>;
  return '🔐';
};
const detectBankIcon = (name, s=22) => {
  const n = (name||'').toUpperCase();
  if(n.includes('KBANK')||n.includes('กสิกร')||n.includes('K+')) return <KBankIcon s={s}/>;
  if(n.includes('SCB')||n.includes('ไทยพาณิชย์')) return <SCBIcon s={s}/>;
  return <BankIcon s={s}/>;
};

// Circles, not rounded squares, and a size up. The badge is the thing that lets
// a long table be scanned by shape instead of read line by line, and a circle
// is the more distinct silhouette against rows of rectangular cells — which is
// why every dashboard that does this well uses one.
const AssetIcon = ({a, ti, size='md'}) => {
  const dim = size==='sm' ? 'w-7 h-7' : 'w-9 h-9';
  if (a.type === 'stock') {
    const ticker = (a.ticker || a.name).replace(/[^A-Za-z0-9]/g,'').toUpperCase() || a.name.substring(0,4).toUpperCase();
    const CUSTOM_ICONS = { 'SOFI': SoFiIcon };
    if (CUSTOM_ICONS[ticker]) {
      const CustomIcon = CUSTOM_ICONS[ticker];
      const px = size==='sm' ? 28 : 32;
      return <div className={`${dim} rounded-full overflow-hidden flex-shrink-0`}><CustomIcon s={px}/></div>;
    }
    // Initials on a colour hashed from the ticker. They were all the
    // same gold, so twenty holdings read as one shape repeated and every row had
    // to be spelled out before it could be told from the one above it.
    if (ticker) {
      const c = tickerClr(ticker);
      return (
        <div className={`${dim} rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center`}
          style={{background:`linear-gradient(135deg, ${c}, ${c}cc)`, boxShadow:'0 1px 4px rgba(0,0,0,0.12)'}}>
          <span className="text-xs font-bold text-white">{ticker.substring(0,2)}</span>
        </div>
      );
    }
    const initials = a.name.replace(/[^A-Za-z]/g,'').substring(0,2).toUpperCase() || a.name.substring(0,2).toUpperCase();
    return (
      <div className={`${dim} rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0`} style={{background:ti.c+'28',color:ti.c}}>
        {initials}
      </div>
    );
  }
  if (a.type === 'crypto') {
    // แยกไอคอนตามเหรียญจริง (ticker หรือคำแรกของชื่อ) — กันไม่ให้ทุกเหรียญโชว์โลโก้ BTC ซ้ำกันหมด
    // Yahoo quotes crypto as COIN-FIAT ("USDT-USD"). The pair suffix isn't part
    // of the coin's identity, and left in it collapses to USDTUSD and matches
    // nothing below — every coin picked from the search would lose its logo.
    const sym = (a.ticker || a.name).trim().split(/\s+/)[0]
      .replace(/-(USD|USDT|THB|EUR|GBP|JPY|BTC)$/i,'')
      .replace(/[^A-Za-z]/g,'').toUpperCase();
    const px = size==='sm' ? 28 : 32;
    if (sym==='BTC'||sym==='BITCOIN'||sym==='XBT') return <div className={`${dim} rounded-full overflow-hidden flex-shrink-0`}><BtcIcon s={px}/></div>;
    if (sym==='ETH'||sym==='ETHEREUM') return <div className={`${dim} rounded-full overflow-hidden flex-shrink-0`}><EthIcon s={px}/></div>;
    if (sym==='USDT'||sym==='TETHER') return <div className={`${dim} rounded-full overflow-hidden flex-shrink-0`}><UsdtIcon s={px}/></div>;
    if (sym==='TRX'||sym==='TRON'||sym==='TRC') return <div className={`${dim} rounded-full overflow-hidden flex-shrink-0`}><TronIcon s={px}/></div>;
    return (
      <div className={`${dim} rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0`} style={{background:ti.c+'28',color:ti.c}}>
        {sym.substring(0,2)||'C'}
      </div>
    );
  }
  return (
    <div className={`${dim} rounded-xl flex items-center justify-center text-base flex-shrink-0`} style={{background:ti.c+'22'}}>
      {ti.icon}
    </div>
  );
};
// ที่อยู่รับเงิน (public wallet address) — แสดงแบบตัดสั้น กดเพื่อคัดลอก
const AddressChip = ({address, dk}) => {
  const [copied, setCopied] = useState(false);
  const short = address.length>14 ? `${address.slice(0,6)}…${address.slice(-4)}` : address;
  const copy = e => {
    e.stopPropagation();
    navigator.clipboard?.writeText(address).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),1500); }).catch(()=>{});
  };
  return (
    <button onClick={copy} title="กดเพื่อคัดลอกที่อยู่กระเป๋า" className={`ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-colors ${dk?'bg-white/8 text-slate-400 hover:bg-white/15 hover:text-white':'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}>
      {copied?'✓ คัดลอกแล้ว':`🔑 ${short}`}
    </button>
  );
};
// One hue at five brightnesses rather than five hues. The old set was gold,
// yellow, bitcoin orange, emerald and slate — colours picked one at a time for
// what each asset "is", which is how a five-segment bar ends up looking like a
// flag. Nothing was ever decided by the fact that crypto is orange; the split
// is the information, and a single ramp carries it while letting the segments
// stay distinguishable.
//
// Ordered brightest to dimmest by how much attention the type usually wants —
// the traded holdings first, then cash, with everything uncategorised last.
// Colours off the same ramp as everything else, so an asset type is the same
// colour in the allocation bar, the P/L table and its own row badge. 'other'
// must stay at index 4 — typeInfo falls back to ASSET_TYPES[4] for an unknown
// type, and reordering this list silently repaints every one of them.
const ASSET_TYPES = [
  {v:'stock', l:'📈 หุ้น',    c:'#f0cbb2', icon:<TypeIc n="stock" s={18}/>},
  {v:'crypto',l:'🟠 Crypto', c:'#d99669', icon:<BtcIcon/>},
  {v:'gold',  l:'🪙 ทองคำ',  c:'#b76736', icon:<GoldIcon/>},
  {v:'cash',  l:'💵 เงินสด', c:'#8a4622', icon:<TypeIc n="cash" s={18}/>},
  {v:'other', l:'📦 อื่นๆ',   c:'#5c2b12', icon:<TypeIc n="box" s={18}/>},
];
const BUDGET_DEFAULTS = {'อาหาร':7000,'การเดินทาง':2000,'Home & Utilities':8000,'ช้อปปิ้ง':1500,'อินเตอร์เน็ต/โทรศัพท์':500,'สุขภาพ':1000,'Subscription':500,'การศึกษา':1000,'บันเทิง':1500,'ลงทุน/ปันผล':2000,'อื่นๆ':1000};
// Empty on purpose. This list used to ship the author's real standing
// commitments — rent, monthly DCA, savings transfer — which is a disclosure the
// moment the repository stops being private.
//
// Filling it with plausible-looking fake rows instead would repeat the mistake
// the sample-data mode made: figures that look real enough to be trusted, in a
// place where being trusted wrongly costs money. A new install starts with
// nothing and says so — the screen already has an empty state.
const RECURRING_DEFAULTS = [];

const fmtA  = (n,c) => c==='USD' ? (n<0?'-':'')+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : (n<0?'-':'')+fmt(n);
const fmtQty = n => parseFloat(Number(n||0).toFixed(8)).toLocaleString('en-US',{maximumFractionDigits:8});
const typeInfo = v => ASSET_TYPES.find(t=>t.v===v) || ASSET_TYPES[4];

// Crypto quotes on Yahoo carry the pseudo-exchange "CCC" and are priced in USD.
const US_EXCHANGES = /^(NASDAQ|NYSE|NYSEArca|NYSE American|AMEX|BATS|CBOE|OTC|CCC|CCY|Cboe)/i;

// Ticker picker: search by company name, choose from results. Still accepts a
// symbol typed straight in, which is faster once you already know it.
const TickerSearch = ({ value, onChange, onPick, dk, inp }) => {
  const [q, setQ]         = useState('');
  const [hits, setHits]   = useState([]);
  const [open, setOpen]   = useState(false);
  const [busy, setBusy]   = useState(false);
  const boxRef = useRef(null);

  useEffect(()=>{
    const away = e => { if(boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return ()=>document.removeEventListener('mousedown', away);
  },[]);

  // debounced so a typed word is one request, not one per keystroke
  useEffect(()=>{
    const term = q.trim();
    if(term.length < 2){ setHits([]); return; }
    let dead = false;
    setBusy(true);
    const t = setTimeout(async ()=>{
      try{
        const u = auth.currentUser;
        if(!u) return;
        const token = await u.getIdToken();
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {headers:{Authorization:`Bearer ${token}`}});
        const d = r.ok ? await r.json() : {results:[]};
        if(!dead){ setHits(d.results||[]); setOpen(true); }
      }catch{ if(!dead) setHits([]); }
      finally{ if(!dead) setBusy(false); }
    }, 350);
    return ()=>{ dead = true; clearTimeout(t); };
  },[q]);

  return (
    <div className="relative" ref={boxRef}>
      {/* width lives on the wrappers: `inp` already carries w-full, and a w-28 on
          the input itself loses to it in Tailwind's cascade, collapsing the search box */}
      <div className="flex gap-2 items-center">
        <div className="flex-1 min-w-0">
          <input className={inp} placeholder="ค้นหา เช่น nvidia, rocket lab, ethereum"
            value={q} onChange={e=>setQ(e.target.value)} onFocus={()=>hits.length&&setOpen(true)}/>
        </div>
        <div className="w-28 flex-shrink-0">
          <input className={`${inp} text-center font-semibold`} placeholder="TICKER"
            value={value} onChange={e=>onChange(e.target.value)} title="ใส่ ticker ตรงๆ ได้ถ้ารู้อยู่แล้ว"/>
        </div>
      </div>
      {open&&(
        <div className={`absolute z-50 left-0 right-0 mt-1 rounded-xl border shadow-2xl max-h-56 overflow-y-auto ${dk?'bg-[#0d1625] border-white/12':'bg-white border-slate-200'}`}>
          {busy&&!hits.length&&<div className={`px-3 py-2.5 text-xs ${dk?'text-slate-400':'text-slate-500'}`}>กำลังค้นหา…</div>}
          {!busy&&!hits.length&&<div className={`px-3 py-2.5 text-xs ${dk?'text-slate-400':'text-slate-500'}`}>ไม่พบ — ลองพิมพ์ชื่อภาษาอังกฤษดูค่ะ</div>}
          {hits.map(h=>(
            <button key={h.symbol} type="button"
              onClick={()=>{ onPick(h); setQ(''); setHits([]); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${dk?'hover:bg-white/8':'hover:bg-slate-50'}`}>
              <span className={`text-xs font-bold w-20 flex-shrink-0 ${dk?'text-gold-400':'text-gold-600'}`}>{h.symbol}</span>
              <span className={`text-xs flex-1 truncate ${dk?'text-slate-200':'text-slate-700'}`}>{h.name}</span>
              <span className={`text-[10px] flex-shrink-0 ${dk?'text-slate-500':'text-slate-400'}`}>{h.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const AssetModal = ({open, onClose, onSave, onAssign, onUnlink, onAssetTransfer, editData, theme, wallets=[], assets=[], defaultWalletId=null}) => {
  const dk = theme==='dark';
  const blank = {name:'', type:'stock', qty:'', avgCost:'', currentPrice:'', currency:'THB', note:'', purchaseDate:today(), ticker:'', address:'', walletId:'', moves:[], items:[]};
  const [f, setF] = useState(blank);
  const [tab, setTab] = useState('new');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState([]);
  const [tuQty, setTuQty] = useState('');   // "เติมเข้า" — quantity added
  // 'qty' keeps the original behaviour exactly; 'amt' reads the same box as money
  const [tuMode, setTuMode] = useState('qty');
  const [tuRate, setTuRate] = useState(''); // "เติมเข้า" — rate / cost per unit
  const [tuNote, setTuNote] = useState(''); // "เติมเข้า" — ชื่อรายการ / โน้ต
  useEffect(()=>{
    if(!open) return;
    setTab(editData?'new':'new');
    setSearch(''); setPicked([]); setTuQty(''); setTuRate(''); setTuNote(''); setTuMode('qty'); setEditMove(null);
    setIName(''); setIValue(''); setEditItem(null);
    setCostTotal(editData && editData.qty ? String(parseFloat(((editData.avgCost||0)*editData.qty).toFixed(2))) : '');
    setF(editData?{...editData,qty:String(editData.qty),avgCost:String(editData.avgCost),currentPrice:String(editData.currentPrice),moves:editData.moves||[],items:editData.items||[]}:{...blank,walletId:defaultWalletId||''});
  },[editData,open,defaultWalletId]);
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  // "เติม/เอาออก": weighted-average — ใส่จำนวนบวก=เข้า, ลบ=ออก ; fills qty + avgCost above so Save persists it
  //
  // A fund is bought by amount, not by unit count: the order is "฿50,000
  // worth", and how many units that buys is the division. Typing 50000 into a
  // field labelled จำนวน added fifty thousand units — a plausible number, silently
  // wrong by three orders of magnitude. So the figure can be given either way and
  // the rate converts it; units stay what is stored, since that is what the
  // holding is.
  const tuOldQty=parseFloat(f.qty)||0, tuOldAvg=parseFloat(f.avgCost)||0;
  const tuTyped=parseFloat(tuQty)||0, tuR=parseFloat(tuRate)||0;
  const tuAddQ = tuMode==='amt' ? (tuR>0 ? tuTyped/tuR : 0) : tuTyped;
  const tuAmt  = tuMode==='amt' ? tuTyped : tuTyped*tuR;   // the money either way
  // The rate is quoted in the asset's own currency, so the money box means that
  // currency too. Labelling it ฿ on a USD holding read ฿50,000 as $50,000 — 888
  // shares where 27 were bought, the entire error being the exchange rate, and
  // nothing on screen to show it.
  const tuSym  = f.currency==='USD' ? '$' : '฿';
  const tuNewQty=tuOldQty+tuAddQ;
  // เติมเข้า (บวก): เรทเฉลี่ยถ่วงน้ำหนัก ; เอาออก (ลบ): ต้นทุนเฉลี่ยคงเดิม ลดแค่จำนวน
  const tuNewAvg = tuAddQ<0 ? tuOldAvg : (tuNewQty>0?(tuOldQty*tuOldAvg+tuAddQ*tuR)/tuNewQty:tuR);
  const tuRealized = tuAddQ<0 && tuR>0 ? (tuR-tuOldAvg)*(-tuAddQ) : 0;   // กำไร/ขาดทุนที่เกิดจากการเอาออก
  // by amount there is no answer without a rate, in either direction — a blank
  // rate would divide by nothing rather than default to something
  const tuValid = tuAddQ!==0 && tuNewQty>=0 && (tuMode==='amt' ? tuR>0 : (tuAddQ<0 || tuR>0));
  // anything typed into the เติม/เอาออก fields but not yet applied
  const tuPending = !!(tuQty.trim() || tuRate.trim() || tuNote.trim());
  // Selling units and receiving the cash are one event. Naming a wallet here
  // records both; leaving it blank is still what a transfer out to another
  // exchange, or a plain quantity correction, needs. Only for taking units out
  // with a rate — that is what says how much money came back.
  const [tuDest,setTuDest]=useState('');
  const tuCanRoute = tuAddQ<0 && tuR>0 && wallets.length>0 && f.type!=='cash';
  const tuProceeds = tuCanRoute ? Math.abs(tuAddQ)*tuR : 0;
  const applyTopUp=()=>{
    if(!tuValid) return;
    // log the movement so the asset keeps a เติม/เอาออก history
    const entry={ id:uid(), date:today(), note:tuNote.trim(), qty:parseFloat(tuAddQ.toFixed(8)), rate:tuR||0,
                  newQty:parseFloat(tuNewQty.toFixed(8)), newAvg:parseFloat(tuNewAvg.toFixed(6)),
                  realized:parseFloat((tuRealized||0).toFixed(2)) };
    // held on the form until บันทึก, so cancelling drops it with everything else
    const sale = (tuCanRoute && tuDest)
      ? { walletId:parseInt(tuDest), amount:parseFloat(tuProceeds.toFixed(2)),
          title:tuNote.trim()||'ขายสินทรัพย์', date:today() }
      : null;
    setF(p=>({...p, qty:String(parseFloat(tuNewQty.toFixed(8))), avgCost:String(parseFloat(tuNewAvg.toFixed(6))),
              moves:[entry,...(p.moves||[])], _sales: sale ? [...(p._sales||[]), sale] : (p._sales||[])}));
    setTuQty(''); setTuRate(''); setTuNote(''); setTuDest('');
  };
  // ประวัติ: แก้ได้แค่ชื่อ / ลบแถวที่ log ผิด — จำนวน+เรทแก้ไม่ได้ เพราะ qty และทุนเฉลี่ยถูกคำนวณไปแล้ว
  const [editMove, setEditMove] = useState(null);   // {id, note}
  const commitMoveNote = () => {
    if(!editMove) return;
    const {id, note} = editMove;
    setF(p=>({...p, moves:(p.moves||[]).map(m=>m.id===id?{...m, note:note.trim()}:m)}));
    setEditMove(null);
  };
  // Deleting an entry now undoes its arithmetic too, where that can be done
  // safely — see revertMove. When it can't (an older entry, with later ones
  // stacked on top), the log line still goes but the numbers stay, and the
  // button says so rather than leaving it to be discovered later.
  const moveRevert = m => revertMove(m, parseFloat(f.qty)||0, parseFloat(f.avgCost)||0);
  const deleteMove = id => {
    const m = (f.moves||[]).find(x=>x.id===id);
    const back = moveRevert(m);
    setF(p=>{
      const moves = (p.moves||[]).filter(x=>x.id!==id);
      return back ? {...p, moves, qty:String(back.qty), avgCost:String(back.avgCost)} : {...p, moves};
    });
    setEditMove(null);
  };
  // ── รายการย่อย — a collection asset (พระเครื่อง, การ์ด) listed piece by piece ──
  // The pieces are the record; qty and the two prices are written from them so
  // there is never a second figure to keep in step. See itemsToAsset.
  // A name and an amount, and nothing else. The first version also asked for a
  // cost and a date so it could show a gain per piece — but that put four fields
  // next to an asset ledger that already had its own way of adding money, and
  // the two together were unusable. What was actually wanted was a list of what
  // is in the box.
  const [iName,setIName]   = useState('');
  const [iValue,setIValue] = useState('');
  const [editItem,setEditItem] = useState(null);   // id of the piece being edited
  // What the collection cost, as one figure for the whole thing. Per-unit is the
  // wrong shape here — nine amulets are not nine of anything — and it is held
  // apart from the pieces because they say what the collection is worth now,
  // which is a different fact and would report a gain of zero forever.
  const [costTotal,setCostTotal] = useState('');
  const items = f.items||[];
  const iTot  = itemTotals(items);
  const applyItems = list => setF(p=>{
    const d = itemsToAsset(list);
    if(!d) return {...p, items:list};
    // adding a piece changes how the cost spreads per unit, never the total
    const ct  = parseFloat(costTotal);
    const avg = isFinite(ct) && ct>0 ? ct/d.qty : d.currentPrice;
    return {...p, items:list, qty:String(d.qty), currentPrice:String(d.currentPrice), avgCost:String(parseFloat(avg.toFixed(6)))};
  });
  const iVal = parseFloat(iValue)||0;
  const iValid = !!iName.trim() && iVal>0;
  const iPending = !!(iName.trim()||iValue.trim());
  const clearItemForm = () => { setIName(''); setIValue(''); setEditItem(null); };
  const commitItem = () => {
    if(!iValid) return;
    const rec = { name:iName.trim(), value:iVal };
    // rebuilt rather than spread over: pieces saved by the first version carry a
    // cost and a date that nothing collects any more, and left in place they
    // would keep feeding a gain figure with no field behind it
    applyItems(editItem
      ? items.map(i=>i.id===editItem?{id:i.id,...rec}:i)
      : [...items, {id:uid(), ...rec}]);
    clearItemForm();
  };
  const loadItem = i => { setEditItem(i.id); setIName(i.name||''); setIValue(String(i.value??'')); };
  const delItem = id => { applyItems(items.filter(i=>i.id!==id)); if(editItem===id) clearItemForm(); };
  const togglePick = id => setPicked(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const save = () => {
    if(!f.name.trim()||!f.qty||!f.avgCost||!f.currentPrice) return;
    onSave({...f,qty:parseFloat(f.qty),avgCost:parseFloat(f.avgCost),currentPrice:parseFloat(f.currentPrice)});
    onClose();
  };
  const assign = () => {
    if(!picked.length||!defaultWalletId) return;
    onAssign&&onAssign(picked, defaultWalletId);
    onClose();
  };
  const defaultWallet = wallets.find(w=>w.id===defaultWalletId);
  const walletTypeFilter = defaultWallet?.type;
  const WALLET_ASSET_TYPE_MAP = { crypto:['crypto'], bank:['cash'], cash:['cash'], credit:['cash'], stock:['stock','gold'] };
  const allowedAssetTypes = WALLET_ASSET_TYPE_MAP[walletTypeFilter] || null;
  const filtered = assets.filter(a=>{
    if(a.walletId) return false; // already linked to a wallet — hide; show only unassigned assets
    if(allowedAssetTypes&&!allowedAssetTypes.includes(a.type)) return false;
    const q=search.toLowerCase();
    return !q||a.name.toLowerCase().includes(q)||(a.note||'').toLowerCase().includes(q);
  });
  if(!open) return null;
  const inp = `w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-600 focus:border-gold-500':'bg-slate-50 border-slate-200 text-slate-800 focus:border-gold-400'}`;
  const lbl = `text-xs font-medium mb-1.5 block ${dk?'text-slate-400':'text-slate-500'}`;
  const showTabs = !editData && defaultWalletId;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl scale-in ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dk?'border-white/8':'border-slate-100'}`}>
          <h2 className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>{editData?'Edit Asset':'Add Asset'}</h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="x" s={15}/></button>
        </div>
        {showTabs&&(
          <div className={`flex px-5 pt-4 gap-2`}>
            {[{k:'existing',l:'เลือกจากที่มีอยู่'},{k:'new',l:'สร้างใหม่'},{k:'manage',l:'จัดการสินทรัพย์'}].map(t=>(
              <button key={t.k} onClick={()=>setTab(t.k)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${tab===t.k?(dk?'bg-gold-500/20 text-gold-300 border border-gold-500/40':'bg-gold-50 text-gold-600 border border-gold-200'):(dk?'bg-white/5 text-slate-400 border border-white/8':'bg-slate-50 text-slate-400 border border-slate-200')}`}>
                {t.l}
              </button>
            ))}
          </div>
        )}
        {tab==='manage'?(
          <div className="p-5 space-y-3">
            {(()=>{
              const linked = assets.filter(a=>a.walletId===defaultWalletId);
              return linked.length===0?(
                <div className={`py-10 text-center text-xs ${dk?'text-slate-400':'text-slate-500'}`}>ยังไม่มีสินทรัพย์ในกระเป๋านี้ค่ะ</div>
              ):(
                <div className={`rounded-xl border overflow-hidden ${dk?'border-white/8':'border-slate-100'}`}>
                  {linked.map((a,i)=>{
                    const ti=typeInfo(a.type);
                    return (
                      <div key={a.id} className={`flex items-center gap-3 px-4 py-3 border-b last:border-b-0 ${dk?(i%2===0?'border-white/5 bg-white/[0.01]':'border-white/5 bg-black/[0.06]'):(i%2===0?'border-slate-100 bg-white':'border-slate-100 bg-slate-50/50')}`}>
                        <AssetIcon a={a} ti={ti} size="sm"/>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-semibold truncate ${dk?'text-white':'text-slate-700'}`}>{a.name}</div>
                          <div className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>{ti.l.substring(3)}{a.note?' · '+a.note:''}</div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {linked.length>1&&<button title="โยกเงินไปสินทรัพย์อื่น" onClick={()=>{ onAssetTransfer&&onAssetTransfer(a.id); }}
                            className={`p-1.5 rounded-lg transition-colors ${dk?'hover:bg-gold-500/20 text-slate-500 hover:text-gold-400':'hover:bg-gold-50 text-slate-400 hover:text-gold-500'}`}>
                            <Ic n="swap" s={13}/>
                          </button>}
                          <button title="ถอดออกจากกระเป๋า" onClick={()=>{ onUnlink&&onUnlink(a.id); }}
                            className={`p-1.5 rounded-lg transition-colors ${dk?'hover:bg-rose-500/20 text-slate-500 hover:text-rose-400':'hover:bg-rose-50 text-slate-400 hover:text-rose-500'}`}>
                            <Ic n="x" s={13}/>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <button onClick={onClose} className={`w-full py-2.5 rounded-xl text-sm font-medium ${dk?'bg-white/5 hover:bg-white/10 text-slate-300':'bg-slate-100 text-slate-600'}`}>Close</button>
          </div>
        ):tab==='existing'?(
          <div className="p-5 space-y-3">
            <input className={inp} placeholder="ค้นหาสินทรัพย์..." value={search} onChange={e=>setSearch(e.target.value)}/>
          {allowedAssetTypes&&<p className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>แสดงเฉพาะสินทรัพย์ประเภท <span className="font-semibold">{allowedAssetTypes.join(', ')}</span> ตามประเภทกระเป๋า</p>}
            <div className={`rounded-xl border overflow-hidden ${dk?'border-white/8':'border-slate-100'}`} style={{maxHeight:'280px',overflowY:'auto'}}>
              {filtered.length===0?(
                <div className={`py-8 text-center text-xs ${dk?'text-slate-400':'text-slate-500'}`}>{search?'ไม่พบสินทรัพย์':'สินทรัพย์ทั้งหมดถูกผูกกระเป๋าแล้ว'}</div>
              ):filtered.map(a=>{
                const ti=typeInfo(a.type);
                const sel=picked.includes(a.id);
                return (
                  <div key={a.id} onClick={()=>togglePick(a.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b transition-colors ${dk?'border-white/5':'border-slate-100'} ${sel?(dk?'bg-gold-500/15':'bg-gold-50'):(dk?'hover:bg-white/5':'hover:bg-slate-50')}`}>
                    <AssetIcon a={a} ti={ti} size="sm"/>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold truncate ${dk?'text-white':'text-slate-700'}`}>{a.name}</div>
                      <div className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>{ti.l.substring(3)}{a.note?' · '+a.note:''}</div>
                    </div>
                    {sel&&<div className="w-4 h-4 rounded-full bg-gold-500 flex items-center justify-center flex-shrink-0"><svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg></div>}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${dk?'bg-white/5 hover:bg-white/10 text-slate-300':'bg-slate-100 text-slate-600'}`}>Cancel</button>
              <button onClick={assign} disabled={!picked.length} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity ${picked.length?'bg-gold-500 hover:bg-gold-600':'bg-gold-300 opacity-50 cursor-not-allowed'}`}>{picked.length>0?`เชื่อม ${picked.length} สินทรัพย์`:'เชื่อมกับกระเป๋านี้'}</button>
            </div>
          </div>
        ):(
          <>
          <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>ชื่อสินทรัพย์</label><input className={inp} placeholder="เช่น NVDA, Bitcoin" value={f.name} onChange={e=>set('name',e.target.value)}/></div>
            <div><label className={lbl}>ประเภท</label>
              <select className={inp} value={f.type} onChange={e=>set('type',e.target.value)}>
                {ASSET_TYPES.map(a=><option key={a.v} value={a.v}>{a.l}</option>)}
              </select>
            </div>
          </div>
          {/* With รายการย่อย in use these three stop being inputs and become
              results — itemsToAsset writes them from the pieces. Left editable
              they would be a second place to state the same money, and the two
              would drift the first time a piece was revalued. */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>{iTot.count>0?'จำนวน (ชิ้น)':'จำนวน (หุ้น/เหรียญ/บาท)'}</label><input type="number" readOnly={iTot.count>0} className={`${inp}${iTot.count>0?' opacity-60 cursor-not-allowed':''}`} placeholder="0" value={f.qty} onChange={e=>set('qty',e.target.value)}/></div>
            <div><label className={lbl}>สกุลเงิน</label>
              <select className={inp} value={f.currency} onChange={e=>set('currency',e.target.value)}>
                <option value="THB">🇹🇭 THB (บาท)</option>
                <option value="USD">🇺🇸 USD (ดอลลาร์)</option>
              </select>
            </div>
          </div>
          {/* For a collection both figures are stated for the whole thing: per
              unit is meaningless when nine amulets are not nine of anything.
              The cost is the owner's to type — the pieces cannot know it. The
              value is not, because it is the pieces, and a second place to type
              it is a second answer to the same question. */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>{iTot.count>0?'ทุนรวมทั้งหมด':'ราคาทุนเฉลี่ย / หน่วย'}</label>
              {iTot.count>0
                ? <input type="number" className={inp} placeholder="ที่จ่ายไปทั้งหมด" value={costTotal}
                    onChange={e=>{ const v=e.target.value; setCostTotal(v);
                      const n=parseFloat(v); set('avgCost', String(isFinite(n)&&iTot.count>0 ? parseFloat((n/iTot.count).toFixed(6)) : 0)); }}/>
                : <input type="number" className={inp} placeholder="0" value={f.avgCost} onChange={e=>set('avgCost',e.target.value)}/>}
            </div>
            <div><label className={lbl}>{iTot.count>0?'มูลค่ารวมตอนนี้':'ราคาปัจจุบัน / หน่วย'}</label>
              <input type="number" readOnly={iTot.count>0} className={`${inp}${iTot.count>0?' opacity-60 cursor-not-allowed':''}`} placeholder="0"
                value={iTot.count>0 ? String(parseFloat(iTot.value.toFixed(2))) : f.currentPrice}
                onChange={e=>set('currentPrice',e.target.value)}/>
            </div>
          </div>
          {iTot.count>0&&(
            <p className={`text-[11px] -mt-2 px-0.5 ${dk?'text-slate-500':'text-slate-400'}`}>🔒 <b>มูลค่ารวม</b> กับ <b>จำนวน</b> มาจากรายการด้านล่าง — อยากเปลี่ยนให้แก้ยอดเงินของชิ้นนั้นค่ะ · <b>ทุนรวม</b> พิมพ์ได้เลย</p>
          )}
          {f.type==='other'&&(
            <div className={`p-2.5 rounded-xl space-y-2 ${dk?'bg-white/5 border border-white/10':'bg-slate-50 border border-slate-200'}`}>
              <div className={`text-xs font-semibold ${dk?'text-slate-200':'text-slate-700'}`}>📋 รายการย่อย{iTot.count>0?` (${iTot.count} ชิ้น)`:''}</div>
              {iTot.count===0&&(
                <p className={`text-[11px] ${dk?'text-slate-500':'text-slate-400'}`}>ของสะสมที่มีหลายชิ้น เช่น พระเครื่อง หรือ การ์ด — ใส่ชื่อกับยอดเงินทีละชิ้น แล้วแอปรวมยอดให้เอง</p>
              )}
              {iTot.count>0&&(
                <div className="max-h-52 overflow-auto">
                  {items.map(i=>(
                    <div key={i.id} className={`text-[11px] py-1.5 border-b last:border-b-0 group/it flex items-center gap-1.5 ${dk?'border-white/5':'border-slate-200'}`}>
                      <div onClick={()=>loadItem(i)} title="คลิกเพื่อแก้ไขชิ้นนี้"
                        className={`flex-1 min-w-0 truncate cursor-pointer hover:underline font-semibold ${editItem===i.id?'text-gold-500':(dk?'text-slate-200':'text-slate-700')}`}>{i.name}</div>
                      <span className={`flex-shrink-0 tabular-nums font-bold ${dk?'text-white':'text-slate-800'}`}>{fmtA(Number(i.value)||0, f.currency)}</span>
                      <button type="button" onClick={()=>delItem(i.id)} title="ลบชิ้นนี้ออกจากรายการ"
                        className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-sm leading-none opacity-40 group-hover/it:opacity-100 transition-all ${dk?'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10':'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}>×</button>
                    </div>
                  ))}
                  <div className={`flex items-center justify-between pt-1.5 mt-0.5 border-t text-xs font-semibold ${dk?'border-white/10 text-slate-200':'border-slate-300 text-slate-700'}`}>
                    <span>รวม {iTot.count} ชิ้น</span>
                    <span className="tabular-nums">{fmtA(iTot.value, f.currency)}</span>
                  </div>
                </div>
              )}
              {/* Turning an existing lump into pieces is where a figure can quietly
                  shrink: list four amulets of a five-amulet collection and the
                  asset simply becomes worth less, with nothing to say a piece is
                  missing. Only the difference from what was stored can say it. */}
              {editData && iTot.count>0 && (()=>{
                const before = (Number(editData.qty)||0)*(Number(editData.currentPrice)||0);
                const diff   = iTot.value - before;
                if (Math.abs(diff) < 0.01) return null;
                return (
                  <div className={`text-[11px] flex items-start gap-1.5 px-0.5 ${diff<0?(dk?'text-amber-300':'text-amber-700'):(dk?'text-emerald-300':'text-emerald-700')}`}>
                    <span className="flex-shrink-0">{diff<0?'⚠️':'↑'}</span>
                    <span>ยอดสินทรัพย์จะเปลี่ยนจาก <b>{fmtA(before,f.currency)}</b> เป็น <b>{fmtA(iTot.value,f.currency)}</b> ({diff>=0?'+':'−'}{fmtA(Math.abs(diff),f.currency)}) — {diff<0?'ถ้ายังใส่ไม่ครบทุกชิ้น เพิ่มต่อได้ค่ะ':'ลองตรวจว่าใส่ซ้ำไหมนะคะ'}</span>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-2">
                <input type="text"   className={inp} placeholder="รายการ" value={iName}  onChange={e=>setIName(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commitItem();}}}/>
                <input type="number" className={inp} placeholder="ยอดเงิน" value={iValue} onChange={e=>setIValue(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commitItem();}}}/>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={commitItem} disabled={!iValid}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed">{editItem?'บันทึกการแก้ไขชิ้นนี้':'+ เพิ่มชิ้นนี้'}</button>
                {iPending&&(
                  <button type="button" onClick={clearItemForm}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${dk?'bg-white/10 hover:bg-white/15 text-slate-300':'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'}`}>ยกเลิก</button>
                )}
              </div>
            </div>
          )}
          {/* เติม/เอาออก writes qty and the average cost directly, which is the
              same pair รายการย่อย derives. Both at once and whichever ran last
              wins silently, so a collection uses its pieces and nothing else. */}
          {editData && f.type!=='cash' && iTot.count===0 && (
            <div className={`p-2.5 rounded-xl space-y-2 ${dk?'bg-emerald-500/8 border border-emerald-500/25':'bg-emerald-50 border border-emerald-100'}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className={`text-xs font-semibold ${dk?'text-emerald-300':'text-emerald-700'}`}>📈 เติม / เอาออก — ใส่ลบ (−) เพื่อเอาออก (ต้นทุนเฉลี่ยคงเดิม)</div>
                {/* กองทุนซื้อเป็นเงิน หุ้น/เหรียญซื้อเป็นหน่วย — ให้กรอกตามที่ซื้อจริง */}
                <div className={`flex rounded-lg p-0.5 gap-0.5 flex-shrink-0 ${dk?'bg-white/10':'bg-white'}`}>
                  {[['qty','หน่วย'],['amt','เงิน '+tuSym]].map(([m,l])=>(
                    <button key={m} type="button" onClick={()=>setTuMode(m)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${tuMode===m?'bg-emerald-600 text-white':(dk?'text-slate-400 hover:text-white':'text-slate-500 hover:text-slate-800')}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" className={inp} placeholder={tuMode==='amt'?`จำนวนเงิน ${tuSym} (+เข้า / −ออก)`:'จำนวน (+เข้า / −ออก)'} value={tuQty} onChange={e=>setTuQty(e.target.value)}/>
                <input type="number" className={inp} placeholder={tuMode==='amt'?`ราคาต่อหน่วย ${tuSym} (บังคับ)`:'เรท / ราคาต่อหน่วย'} value={tuRate} onChange={e=>setTuRate(e.target.value)}/>
              </div>
              <input type="text" className={inp} placeholder="ชื่อรายการ (ไม่บังคับ)" value={tuNote} onChange={e=>setTuNote(e.target.value)}/>
              {tuMode==='amt'&&!(tuR>0)&&tuTyped!==0&&(
                <div className={`text-[11px] px-0.5 ${dk?'text-amber-300':'text-amber-700'}`}>⚠️ กรอกเป็นเงิน ต้องใส่ราคาต่อหน่วยด้วย ถึงจะรู้ว่าได้กี่หน่วย</div>
              )}
              {tuValid&&(
                <div className={`text-[11px] px-0.5 space-y-0.5 ${dk?'text-slate-300':'text-slate-600'}`}>
                  {tuMode==='amt'&&(
                    <div className={`flex justify-between font-medium ${dk?'text-emerald-300':'text-emerald-700'}`}>
                      <span>เงิน {fmtA(Math.abs(tuAmt), f.currency)} ÷ {tuR.toLocaleString('en-US',{maximumFractionDigits:6})}</span>
                      <span>= {Math.abs(tuAddQ).toLocaleString('en-US',{maximumFractionDigits:4})} หน่วย</span>
                    </div>
                  )}
                  <div className="flex justify-between"><span>{tuAddQ<0?'เอาออก':'เติมเข้า'}</span><span className="font-medium">{Math.abs(tuAddQ).toLocaleString('en-US',{maximumFractionDigits:4})}</span></div>
                  <div className="flex justify-between"><span>จำนวนรวมใหม่</span><span className="font-medium">{tuNewQty.toLocaleString('en-US',{maximumFractionDigits:4})}</span></div>
                  <div className="flex justify-between"><span>เรทเฉลี่ย{tuAddQ<0?' (คงเดิม)':'ใหม่'}</span><span className="font-semibold text-emerald-500">{tuNewAvg.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</span></div>
                  {tuAddQ<0&&tuR>0&&(<div className="flex justify-between"><span>กำไร/ขาดทุนที่เกิดขึ้น</span><span className={`font-semibold ${tuRealized>=0?'text-emerald-500':'text-rose-500'}`}>{tuRealized>=0?'+':''}{tuRealized.toLocaleString('en-US',{maximumFractionDigits:2})}</span></div>)}
                </div>
              )}
              {tuAddQ<0&&tuNewQty<0&&(
                <div className="text-[11px] px-0.5 text-rose-500">เอาออกเกินจำนวนที่มี (เหลือ {tuOldQty.toLocaleString('en-US',{maximumFractionDigits:4})})</div>
              )}
              {tuCanRoute&&(
                <>
                  <select className={inp} value={tuDest} onChange={e=>setTuDest(e.target.value)}>
                    <option value="">— ไม่รับเงินเข้ากระเป๋า (โอนออก / แก้จำนวน) —</option>
                    {wallets.map(w=><option key={w.id} value={w.id}>💵 เงินเข้า: {w.name}</option>)}
                  </select>
                  {tuDest&&(
                    <div className={`text-[11px] px-0.5 flex justify-between ${dk?'text-emerald-300':'text-emerald-700'}`}>
                      <span>จะสร้างรายการเงินเข้า</span>
                      <span className="font-semibold">+{fmt(tuProceeds)} → {wallets.find(w=>String(w.id)===String(tuDest))?.name}</span>
                    </div>
                  )}
                </>
              )}
              <button type="button" onClick={applyTopUp} disabled={!tuValid} className="w-full py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40">อัปเดตจำนวน + เรทเฉลี่ยด้านบน</button>
            </div>
          )}
          {/* The preview above says "จำนวนรวมใหม่ 5,000", which reads as a promise
              that saving will apply it. It does not — the green button is what
              writes those figures into the fields, and saving without pressing it
              stores the old quantity and throws the typed values away silently.
              Block the save instead, and offer a way out so this cannot dead-end. */}
          {tuPending && (
            <div className={`p-2.5 rounded-xl text-xs flex items-start gap-2 ${dk?'bg-amber-500/10 border border-amber-500/30 text-amber-300':'bg-amber-50 border border-amber-200 text-amber-800'}`}>
              <span className="flex-shrink-0">⚠️</span>
              <div className="flex-1">
                <div className="font-semibold mb-0.5">ยังไม่ได้ใช้ค่าที่กรอกในช่อง เติม / เอาออก</div>
                <div className="opacity-90">กด <b>“อัปเดตจำนวน + เรทเฉลี่ยด้านบน”</b> ก่อน ไม่งั้นค่าที่พิมพ์จะหายไปตอนบันทึก</div>
                <button type="button" onClick={()=>{ setTuQty(''); setTuRate(''); setTuNote(''); }}
                  className={`mt-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold ${dk?'bg-white/10 hover:bg-white/15':'bg-white hover:bg-amber-100 border border-amber-200'}`}>
                  ล้างช่องทิ้ง
                </button>
              </div>
            </div>
          )}
          {/* Same trap as เติม/เอาออก above: a piece typed but not added looks
              recorded and is thrown away on save. */}
          {iPending && (
            <div className={`p-2.5 rounded-xl text-xs flex items-start gap-2 ${dk?'bg-amber-500/10 border border-amber-500/30 text-amber-300':'bg-amber-50 border border-amber-200 text-amber-800'}`}>
              <span className="flex-shrink-0">⚠️</span>
              <div className="flex-1">
                <div className="font-semibold mb-0.5">ยังมีชิ้นที่กรอกค้างไว้ในรายการย่อย</div>
                <div className="opacity-90">กด <b>{editItem?'“บันทึกการแก้ไขชิ้นนี้”':'“+ เพิ่มชิ้นนี้”'}</b> ก่อน ไม่งั้นที่พิมพ์ไว้จะหายไปตอนบันทึก</div>
              </div>
            </div>
          )}
          {editData && (f.moves||[]).length>0 && (
            <div className={`p-2.5 rounded-xl ${dk?'bg-white/5 border border-white/10':'bg-slate-50 border border-slate-200'}`}>
              <div className={`text-xs font-semibold mb-1 ${dk?'text-slate-300':'text-slate-600'}`}>🧾 ประวัติเติม / เอาออก ({(f.moves||[]).length})</div>
              <div className="max-h-44 overflow-auto">
                {(f.moves||[]).map(m=>(
                  <div key={m.id} className={`text-[11px] py-1.5 border-b last:border-b-0 group/mv ${dk?'border-white/5':'border-slate-100'}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {editMove?.id===m.id
                        ? <input autoFocus type="text" value={editMove.note} placeholder="ชื่อรายการ"
                            className={`flex-1 min-w-0 px-1.5 py-0.5 rounded-md border outline-none text-[11px] ${dk?'bg-white/10 border-white/20 text-white placeholder-slate-500':'bg-white border-slate-300 text-slate-700 placeholder-slate-400'}`}
                            onChange={e=>setEditMove(p=>({...p,note:e.target.value}))}
                            onBlur={commitMoveNote}
                            onKeyDown={e=>{if(e.key==='Enter')commitMoveNote();if(e.key==='Escape')setEditMove(null);}}/>
                        : <div onClick={()=>setEditMove({id:m.id,note:m.note||''})} title="คลิกเพื่อแก้ชื่อ"
                            className={`flex-1 min-w-0 truncate cursor-pointer hover:underline ${m.note?`font-semibold ${dk?'text-slate-200':'text-slate-700'}`:`italic ${dk?'text-slate-600':'text-slate-400'}`}`}>
                            {m.note||'+ ใส่ชื่อรายการ'}
                          </div>}
                      <button type="button" onClick={()=>deleteMove(m.id)}
                        title={moveRevert(m) ? `ลบและย้อนกลับ — จำนวนจะกลับเป็น ${moveRevert(m).qty.toLocaleString('en-US',{maximumFractionDigits:4})}` : 'ลบแถวนี้ออกจากประวัติเท่านั้น — ย้อนจำนวนให้ไม่ได้ เพราะมีรายการหลังจากนี้ทับไปแล้ว'}
                        className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-sm leading-none opacity-40 group-hover/mv:opacity-100 transition-all ${dk?'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10':'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}>×</button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-bold tabular-nums ${m.qty<0?'text-rose-400':'text-emerald-500'}`}>{m.qty>0?'+':''}{fmtQty(m.qty)}</span>
                      <span className={`tabular-nums ${dk?'text-slate-400':'text-slate-500'}`}>{m.rate?`@ ${m.rate.toLocaleString('en-US',{maximumFractionDigits:6})}`:'—'}</span>
                      <span className={dk?'text-slate-500':'text-slate-400'}>{m.date}</span>
                    </div>
                    <div className={`flex items-center justify-between gap-2 mt-0.5 ${dk?'text-slate-500':'text-slate-400'}`}>
                      <span className="tabular-nums">เหลือ {fmtQty(m.newQty)} · ทุนเฉลี่ย {m.newAvg}</span>
                      {m.realized!==0&&<span className={`font-medium ${m.realized>0?'text-emerald-500':'text-rose-400'}`}>{m.realized>0?'กำไร':'ขาดทุน'} {fmt(Math.abs(m.realized))}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>วันที่ซื้อ</label><input type="date" className={inp} value={f.purchaseDate||''} onChange={e=>set('purchaseDate',e.target.value)}/></div>
            <div><label className={lbl}>หมายเหตุ</label><input className={inp} placeholder="หมายเหตุ" value={f.note} onChange={e=>set('note',e.target.value)}/></div>
          </div>
          <div>
            <label className={lbl}>📡 ค้นหาเพื่ออัปเดตราคาอัตโนมัติ</label>
            <TickerSearch
              value={f.ticker||''}
              dk={dk}
              inp={inp}
              onChange={v=>set('ticker',v)}
              onPick={hit=>{
                set('ticker', hit.symbol);
                if(!f.name.trim()) set('name', hit.name);
                // FX pairs share the CCY venue with crypto but are quoted in the
                // target currency, not USD — THB=X returns baht. Setting USD here
                // would make the price be refused as a currency mismatch.
                if(!/=X$/i.test(hit.symbol) && US_EXCHANGES.test(hit.exchange)) set('currency','USD');
              }}
            />
            <p className={`text-xs mt-1 ${dk?'text-slate-500':'text-slate-400'}`}>พิมพ์ชื่อบริษัทหรือเหรียญ เช่น nvidia, rocket lab, ethereum แล้วเลือกจากรายการ · ทองคำโลก (ทรอยออนซ์) ใส่ <b>GC=F</b> · ทองไทย (บาท) ยังต้องกรอกเอง</p>
          </div>
          {f.type==='crypto'&&(
            <div>
              <label className={lbl}>🔑 ที่อยู่รับเงิน (Wallet Address) — ไม่บังคับ</label>
              <input className={inp} placeholder="เช่น bc1q..., 0x..., T..." value={f.address||''} onChange={e=>set('address',e.target.value)}/>
              <p className={`text-xs mt-1 ${dk?'text-slate-500':'text-slate-400'}`}>เก็บได้เฉพาะที่อยู่รับเงิน (public address) เท่านั้น — ห้ามใส่ Private Key หรือ Seed Phrase เด็ดขาด</p>
            </div>
          )}
          {wallets.length>0&&(
            <div>
              <label className={lbl}>👛 กระเป๋าเงิน (เชื่อมสินทรัพย์)</label>
              <select className={inp} value={f.walletId||''} onChange={e=>set('walletId',e.target.value?parseInt(e.target.value):null)}>
                <option value="">— ไม่เชื่อมกระเป๋า —</option>
                {wallets.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${dk?'bg-white/5 hover:bg-white/10 text-slate-300':'bg-slate-100 text-slate-600'}`}>ยกเลิก</button>
          <button onClick={save} disabled={tuPending||iPending} title={tuPending?'ยังมีค่าค้างในช่อง เติม / เอาออก':iPending?'ยังมีชิ้นที่กรอกค้างไว้ ยังไม่ได้กดเพิ่ม':''} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-gold-500 hover:bg-gold-600 disabled:opacity-40 disabled:cursor-not-allowed">{editData?'บันทึก':'เพิ่มสินทรัพย์'}</button>
        </div>
        </>
        )}
      </div>
    </div>
  );
};

// (TransferModal & WalletToInvestModal merged into UnifiedTransferModal)

// AllocationPieChart lived here — a donut plus a five-column table of value,
// cost, P/L and share per type. Both halves moved into the Unrealized P/L card,
// except the donut: the net worth card on that page already draws the same
// split as a segmented bar, and a third rendering of one fact would have
// out-shouted the number the card is there for.

// ── ASSET RELATED-TX PANEL BODY (shared by cash card + table views) ──
const AssetRelBody = ({a, investTxs, dk, onAddTx, onDeleteTx, onTopUp, wallets=[], onDeleteMove, onRenameMove, onAddItem, onDelItem, usdRate=35}) => {
  const [editNote,setEditNote]=useState(null);   // {id, note} while renaming a movement
  const sub=`text-xs ${dk?'text-slate-400':'text-slate-500'}`;
  const [adding,setAdding]=useState(false);
  const [dir,setDir]=useState('in');
  const [amt,setAmt]=useState('');
  const [ttl,setTtl]=useState('');
  const [date,setDate]=useState(today());
  const isCash=a.type==='cash';
  const isCollection=(a.items||[]).length>0;   // valued by its pieces — see itemsToAsset
  // adding a piece straight from here: the first version only allowed it inside
  // Edit Asset, which left "+ เพิ่มรายการ" as the nearest button and put two ways
  // to record the same amulet side by side
  const [addingItem,setAddingItem]=useState(false);
  const [niName,setNiName]=useState('');
  const [niValue,setNiValue]=useState('');
  const niValid=!!niName.trim() && (parseFloat(niValue)||0)>0;
  const doAddItem=()=>{
    if(!niValid) return;
    onAddItem&&onAddItem(niName.trim(), parseFloat(niValue));
    setNiName(''); setNiValue(''); setAddingItem(false);
  };
  // One panel, four things that can happen to a holding. They used to be two
  // buttons: units here, money over there — so buying was two entries that
  // nothing tied together, and whichever half was forgotten left the other
  // half lying. The mode picks which fields matter; the handler writes both
  // sides of whichever one is chosen.
  const [topUp,setTopUp]=useState(false);
  const [tuKind,setTuKind]=useState('buy');   // buy | sell | dividend | adjust
  const [tuQty,setTuQty]=useState('');
  const [tuRate,setTuRate]=useState('');
  const [tuNote,setTuNote]=useState('');
  const [tuDate,setTuDate]=useState(today()); // was always today, so a sale entered late was dated wrong
  // Same หน่วย/เงิน choice the edit dialog offers — a fund is bought by amount,
  // and having only one of the two places accept it is the worse of both.
  // 'qty' is the default, so untouched this behaves exactly as it always did.
  const [tuMode,setTuMode]=useState('qty');
  const tuTyped=parseFloat(tuQty)||0, tuRn=parseFloat(tuRate)||0;
  const tuSell = tuKind==='sell';
  const tuMag = tuMode==='amt' ? (tuRn>0 ? tuTyped/tuRn : 0) : tuTyped;
  // The sign is the mode's job now. Typing a minus to mean "sell" was the part
  // that had to be explained in the label, and the label was the only place it
  // was written down.
  const tuQn = tuKind==='adjust' ? tuTyped : tuSell ? -Math.abs(tuMag) : Math.abs(tuMag);
  const tuAmt = tuMode==='amt' ? tuTyped : tuTyped*tuRn;
  const tuSym = a.currency==='USD' ? '$' : '฿';   // the money box speaks the asset's currency, not the app's
  const tuNewQty=a.qty+tuQn;
  // ซื้อ: เรทเฉลี่ยถ่วงน้ำหนัก ; ขาย: ต้นทุนเฉลี่ยคงเดิม ลดแค่จำนวน
  const tuNewAvg=tuQn<0?a.avgCost:(tuNewQty>0?(a.qty*a.avgCost+tuQn*tuRn)/tuNewQty:tuRn);
  const tuRealized=tuQn<0&&tuRn>0?(tuRn-a.avgCost)*(-tuQn):0;
  const tuValid = tuKind==='dividend'
    ? tuTyped>0
    : tuKind==='adjust'
      ? tuQn!==0 && tuNewQty>=0
      : tuQn!==0 && tuNewQty>=0 && tuRn>0;
  const numFmt=n=>n.toLocaleString('en-US',{maximumFractionDigits:4});
  // Selling units and receiving cash are one event, but they used to be two
  // separate manual steps with nothing linking them — and forgetting the second
  // moved Net Worth by the whole sale with nothing to flag it. Naming a wallet
  // here records both at once. Only for taking units out, and only when a rate
  // is given, since that is what says how much money came back.
  const [tuDest,setTuDest]=useState('');
  // Both directions now, which is the whole point of the merge: selling says
  // where the cash landed, buying says where it came from.
  // The preview and the saved row come from the same function, so the figure on
  // screen cannot drift from the one written — which is how the missing currency
  // conversion stayed invisible in the first place.
  const tuFlow = assetCashFlow({ kind:tuKind, qty:tuQn, rate:tuRn, amount:tuTyped, currency:a.currency, usdRate });
  const canRoute = wallets.length>0 && !isCash && tuKind!=='adjust' && tuFlow!==0;
  // A dividend is only the money — with no wallet named there is nothing left to
  // record, and the handler would return having done nothing at all. Buying and
  // selling still save without one, since moving units between exchanges is a
  // real thing to log and no cash changes hands.
  const tuCanSave = tuValid && (tuKind!=='dividend' || !!tuDest);
  const doTopUp=()=>{
    if(!tuCanSave) return;
    onTopUp&&onTopUp({
      kind: tuKind,
      qty: tuKind==='dividend' ? 0 : tuQn,
      rate: tuKind==='dividend' ? 0 : tuRn,
      amount: tuKind==='dividend' ? tuTyped : 0,
      note: tuNote.trim(), date: tuDate,
      walletId: (canRoute && tuDest) ? parseInt(tuDest) : null,
    });
    setTopUp(false); setTuQty(''); setTuRate(''); setTuNote(''); setTuDest(''); setTuDate(today());
  };
  const base=a.qty*a.currentPrice;
  const shouldBe=base + a.taggedIn - a.taggedOut;
  const inpCls=`px-2 py-1 rounded-lg border text-xs outline-none ${dk?'bg-white/10 border-white/15 text-white placeholder-slate-500':'bg-white border-slate-300 text-slate-700 placeholder-slate-400'}`;
  const reset=()=>{ setAdding(false); setAmt(''); setTtl(''); setDate(today()); setDir('in'); };
  const save=()=>{
    const n=parseFloat(amt); if(!n||n===0) return;
    if(dir!=='adj'&&n<0) return;
    // for a cash asset that mirrors a wallet, stamp walletId so the entry also
    // shows in that wallet's list (one record, both views). Counted once: it's
    // tagged to the cash asset, so walletCash excludes it. Non-cash assets stay
    // wallet-less (a standalone asset ledger entry, no wallet-cash impact).
    const wid = (a.type==='cash' && a.walletId) ? a.walletId : null;
    let tx;
    if(dir==='adj') {
      tx = {id:uid(), type:'adjustment', title:ttl.trim()||'ปรับยอด', amount:n, date, targetAssetId:a.id, walletId:wid, notes:''};
    } else {
      tx = dir==='in'
        ? {id:uid(), type:'transfer', title:ttl.trim()||'เงินเข้า', amount:n,  date, toAssetId:a.id,   walletId:wid, notes:'[manual]'}
        : {id:uid(), type:'transfer', title:ttl.trim()||'เงินออก', amount:-n, date, fromAssetId:a.id, walletId:wid, notes:'[manual]'};
    }
    onAddTx(tx); reset();
  };
  // assetVal adds the tagged amounts to qty × price *before* converting to baht,
  // so every figure in this panel is in the asset's own currency — but fmt()
  // hardcodes ฿, which printed a USD holding's $1,817.95 as ฿1,817.95.
  const fmtCur = n => fmt(n).replace('฿', a.currency==='USD' ? '$' : '฿');
  return (
    <div className="px-2 pt-1 pb-2">
      {/* A collection's pieces go where the opening balance would: they *are*
          that balance. Showing both put two lists and two totals against one
          holding, and reading it, you could not tell which number was the
          asset. Tagged transactions carry on into the same list below, so what
          is on screen always adds up to what the asset is worth. */}
      {isCollection ? (a.items||[]).map(i=>(
        <div key={i.id} className={`group flex items-center justify-between gap-2 px-1 py-1.5 rounded-lg ${dk?'hover:bg-white/5':'hover:bg-slate-50'}`}>
          <span className={`flex-1 min-w-0 truncate text-xs font-medium ${dk?'text-slate-200':'text-slate-700'}`}>{i.name}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-xs font-semibold ${dk?'text-white':'text-slate-800'}`}>{fmtCur(Number(i.value)||0)}</span>
            <button onClick={()=>onDelItem&&onDelItem(i.id)} title="ลบชิ้นนี้ออกจากรายการ"
              className={`w-5 h-5 flex items-center justify-center rounded-md text-sm transition-colors opacity-0 group-hover:opacity-100 ${dk?'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10':'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}>×</button>
          </div>
        </div>
      )) : (
        <div className="flex items-center justify-between px-1 py-1.5">
          <span className={sub}>ยอดเริ่มต้น</span>
          <span className={`text-xs font-medium ${dk?'text-slate-300':'text-slate-600'}`}>{fmtCur(base)}</span>
        </div>
      )}
      {investTxs.map(t=>{
        const isOut=isAssetTxOut(t,a.id);
        const isAdj=t.type==='adjustment';
        // listed as related, but not part of the arithmetic — a dividend does not
        // raise what the holding is worth. Say so, or the total looks broken.
        const counted=isAssetTxIn(t,a.id)||isOut;
        return (
          <div key={t.id} className={`group flex items-center justify-between px-1 py-1.5 rounded-lg ${dk?'hover:bg-white/5':'hover:bg-slate-50'}`}>
            <div className="flex items-center gap-2 min-w-0 mr-3">
              <span className={`text-[11px] flex-shrink-0 ${sub}`}>{t.date}</span>
              <span className={`text-xs font-medium truncate ${dk?'text-slate-200':'text-slate-700'}`}>{t.title}</span>
              {isAdj&&<span className="text-[10px] px-1 rounded bg-amber-500/15 text-amber-400 flex-shrink-0">ปรับ</span>}
              {!counted&&<span className={`text-[10px] px-1 rounded flex-shrink-0 ${dk?'bg-white/10 text-slate-400':'bg-slate-100 text-slate-500'}`}>ไม่นับรวม</span>}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className={`text-xs font-semibold ${!counted?(dk?'text-slate-500':'text-slate-400'):isAdj?'text-amber-400':isOut?'text-rose-400':'text-emerald-500'}`}>{isAdj?(t.amount>=0?'+':''): isOut?'-':'+'}{counted?fmtCur(Math.abs(t.amount)):fmt(Math.abs(t.amount))}</span>
              <button onClick={()=>onDeleteTx(t.id)} title="ลบรายการนี้"
                className={`w-5 h-5 flex items-center justify-center rounded-md text-sm transition-colors opacity-0 group-hover:opacity-100 ${dk?'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10':'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}>×</button>
            </div>
          </div>
        );
      })}
      <div className={`flex items-center justify-between px-1 py-1.5 mt-1 border-t font-bold ${dk?'border-white/8':'border-slate-200'}`}>
        {/* "ยอดที่ควรเป็น" described how the figure is arrived at — the balance the
            rows above imply. What it is, is the total, and that is what to call it. */}
        <span className={`text-xs ${dk?'text-white':'text-slate-800'}`}>ยอดรวม{isCollection?` (${(a.items||[]).length+investTxs.filter(t=>isAssetTxIn(t,a.id)||isAssetTxOut(t,a.id)).length} รายการ)`:''}</span>
        <span className={`text-xs ${shouldBe<0?'text-rose-400':'text-gold-400'}`}>{(shouldBe<0?'-':'')+fmtCur(shouldBe)}</span>
      </div>
      {/* Same list the edit dialog shows, mirrored here so one place answers
          "what happened to this holding" — transactions and quantity movements
          together. Read-only: editing and deleting stay in Edit Asset, where the
          delete can also undo the quantity it changed. */}
      {(a.moves||[]).length>0 && (
        <div className={`mt-2 pt-2 border-t ${dk?'border-white/8':'border-slate-200'}`}>
          <div className={`text-[11px] font-semibold mb-1 ${dk?'text-slate-400':'text-slate-500'}`}>🧾 ประวัติเติม / เอาออก ({(a.moves||[]).length})</div>
          <div className="max-h-40 overflow-auto">
            {(a.moves||[]).map(m=>{
              const back = revertMove(m, a.qty||0, a.avgCost||0);
              return (
              <div key={m.id} className={`text-[11px] py-1 border-b last:border-b-0 group/mv ${dk?'border-white/5':'border-slate-100'}`}>
                <div className="flex items-center gap-1.5">
                  {editNote?.id===m.id
                    ? <input autoFocus type="text" value={editNote.note} placeholder="ชื่อรายการ"
                        className={`flex-1 min-w-0 px-1.5 py-0.5 rounded-md border outline-none text-[11px] ${dk?'bg-white/10 border-white/20 text-white':'bg-white border-slate-300 text-slate-700'}`}
                        onChange={e=>setEditNote(p=>({...p,note:e.target.value}))}
                        onBlur={()=>{ onRenameMove&&onRenameMove(a.id,m.id,editNote.note.trim()); setEditNote(null); }}
                        onKeyDown={e=>{ if(e.key==='Enter'){ onRenameMove&&onRenameMove(a.id,m.id,editNote.note.trim()); setEditNote(null); } if(e.key==='Escape') setEditNote(null); }}/>
                    : <span onClick={()=>onRenameMove&&setEditNote({id:m.id,note:m.note||''})} title={onRenameMove?'คลิกเพื่อแก้ชื่อ':''}
                        className={`flex-1 min-w-0 truncate ${onRenameMove?'cursor-pointer hover:underline':''} ${m.note?(dk?'text-slate-200':'text-slate-700'):`italic ${dk?'text-slate-600':'text-slate-400'}`}`}>{m.note||'+ ใส่ชื่อรายการ'}</span>}
                  <span className={`flex-shrink-0 tabular-nums ${dk?'text-slate-500':'text-slate-400'}`}>{m.date}</span>
                  {onDeleteMove&&(
                    <button type="button" onClick={()=>onDeleteMove(a.id,m.id)}
                      title={back?`ลบและย้อนกลับ — จำนวนจะกลับเป็น ${back.qty.toLocaleString('en-US',{maximumFractionDigits:4})}`:'ลบแถวนี้ออกจากประวัติเท่านั้น — ย้อนจำนวนให้ไม่ได้ เพราะมีรายการหลังจากนี้ทับไปแล้ว'}
                      className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-sm leading-none opacity-0 group-hover/mv:opacity-100 transition-all ${dk?'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10':'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}>×</button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-bold tabular-nums ${m.qty<0?'text-rose-400':'text-emerald-500'}`}>{m.qty>0?'+':''}{fmtQty(m.qty)}</span>
                  <span className={`tabular-nums ${dk?'text-slate-400':'text-slate-500'}`}>{m.rate?`@ ${m.rate.toLocaleString('en-US',{maximumFractionDigits:6})}`:'—'}</span>
                  {m.realized!==0&&<span className={`font-medium ${m.realized>0?'text-emerald-500':'text-rose-400'}`}>{m.realized>0?'กำไร':'ขาดทุน'} {fmt(Math.abs(m.realized))}</span>}
                </div>
                <div className={`tabular-nums ${dk?'text-slate-500':'text-slate-400'}`}>เหลือ {fmtQty(m.newQty)} · ทุนเฉลี่ย {m.newAvg}</div>
              </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Add controls */}
      {adding ? (
        <div className={`mt-2 p-2 rounded-xl space-y-2 ${dk?'bg-white/5':'bg-slate-50'}`} onClick={e=>e.stopPropagation()}>
          <div className="flex gap-1.5">
            {[['in','+ เงินเข้า'],['out','− เงินออก'],['adj','⚖ ปรับยอด']].map(([k,l])=>(
              <button key={k} onClick={()=>setDir(k)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${dir===k?(k==='in'?'bg-emerald-500 text-white':k==='adj'?'bg-amber-500 text-white':'bg-rose-500 text-white'):(dk?'bg-white/10 text-slate-400':'bg-white text-slate-500 border border-slate-200')}`}>{l}</button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input className={inpCls+' flex-1'} type="text" placeholder="ชื่อรายการ" value={ttl} onChange={e=>setTtl(e.target.value)}/>
            <input className={inpCls+' w-24'} type="number" placeholder={dir==='adj'?'±จำนวน':'จำนวน'} value={amt} onChange={e=>setAmt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&save()}/>
          </div>
          <div className="flex gap-1.5 items-center">
            <input className={inpCls+' flex-1'} type="date" value={date} onChange={e=>setDate(e.target.value)}/>
            <button onClick={reset} className={`px-2.5 py-1 rounded-lg text-xs ${dk?'text-slate-400 hover:bg-white/10':'text-slate-500 hover:bg-slate-100'}`}>ยกเลิก</button>
            <button onClick={save} disabled={!(parseFloat(amt)>0)} className="px-3 py-1 rounded-lg text-xs font-semibold bg-gold-500 hover:bg-gold-600 disabled:opacity-40">บันทึก</button>
          </div>
        </div>
      ) : topUp ? (
        <div className={`mt-2 p-2.5 rounded-xl space-y-2 ${dk?'bg-emerald-500/8 border border-emerald-500/20':'bg-emerald-50 border border-emerald-100'}`} onClick={e=>e.stopPropagation()}>
          {/* The mode carries the sign, the direction of the money, and which
              fields are even asked for. Before this it was one form and a label
              telling you to type a minus. */}
          <div className="flex gap-1">
            {[['buy','📈 ซื้อ'],['sell','📉 ขาย'],['dividend','💰 ปันผล'],['adjust','⚖ ปรับยอด']].map(([k,l])=>(
              <button key={k} type="button" onClick={()=>{setTuKind(k);setTuDest('');}}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${tuKind===k
                  ?(k==='sell'?'bg-rose-500 text-white':k==='adjust'?'bg-amber-500 text-white':'bg-emerald-600 text-white')
                  :(dk?'bg-white/10 text-slate-400 hover:text-white':'bg-white text-slate-500 border border-slate-200 hover:text-slate-800')}`}>{l}</button>
            ))}
          </div>

          {tuKind==='dividend' ? (
            <input className={inpCls+' w-full'} type="number" placeholder={`เงินปันผลที่ได้รับ ${tuSym}`} value={tuQty} onChange={e=>setTuQty(e.target.value)} autoFocus onKeyDown={e=>e.key==='Enter'&&doTopUp()}/>
          ) : tuKind==='adjust' ? (
            <input className={inpCls+' w-full'} type="number" placeholder="ปรับจำนวน (+เพิ่ม / −ลด)" value={tuQty} onChange={e=>setTuQty(e.target.value)} autoFocus onKeyDown={e=>e.key==='Enter'&&doTopUp()}/>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] ${dk?'text-slate-400':'text-slate-500'}`}>กรอกเป็น</span>
                <div className={`flex rounded-lg p-0.5 gap-0.5 ${dk?'bg-white/10':'bg-white'}`}>
                  {[['qty','หน่วย'],['amt','เงิน '+tuSym]].map(([m,l])=>(
                    <button key={m} type="button" onClick={()=>setTuMode(m)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${tuMode===m?'bg-emerald-600 text-white':(dk?'text-slate-400 hover:text-white':'text-slate-500 hover:text-slate-800')}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-1.5">
                <input className={inpCls+' flex-1 min-w-0'} type="number" placeholder={tuMode==='amt'?`จำนวนเงิน ${tuSym}`:'จำนวนหน่วย'} value={tuQty} onChange={e=>setTuQty(e.target.value)} autoFocus/>
                <input className={inpCls+' flex-1 min-w-0'} type="number" placeholder={`ราคาต่อหน่วย ${tuSym}`} value={tuRate} onChange={e=>setTuRate(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doTopUp()}/>
              </div>
            </>
          )}

          <div className="flex gap-1.5">
            <input className={inpCls+' flex-1 min-w-0'} type="text" placeholder="ชื่อรายการ (ไม่บังคับ)" value={tuNote} onChange={e=>setTuNote(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doTopUp()}/>
            <input className={inpCls+' w-32 flex-shrink-0'} type="date" value={tuDate} onChange={e=>setTuDate(e.target.value)}/>
          </div>

          {tuKind!=='dividend'&&tuKind!=='adjust'&&!(tuRn>0)&&tuTyped!==0&&(
            <div className={`text-[11px] px-1 ${dk?'text-amber-300':'text-amber-700'}`}>⚠️ ต้องใส่ราคาต่อหน่วยด้วย</div>
          )}
          {tuKind==='dividend'&&tuTyped>0&&!tuDest&&(
            <div className={`text-[11px] px-1 ${dk?'text-amber-300':'text-amber-700'}`}>⚠️ เลือกกระเป๋าที่รับเงินปันผลด้วยค่ะ</div>
          )}
          {tuValid&&tuKind!=='dividend'&&(
            <div className={`text-[11px] px-1 space-y-0.5 ${dk?'text-slate-300':'text-slate-600'}`}>
              {tuMode==='amt'&&tuKind!=='adjust'&&(
                <div className={`flex justify-between font-medium ${dk?'text-emerald-300':'text-emerald-700'}`}>
                  <span>เงิน {fmtCur(Math.abs(tuAmt))} ÷ {numFmt(tuRn)}</span>
                  <span>= {numFmt(Math.abs(tuQn))} หน่วย</span>
                </div>
              )}
              <div className="flex justify-between"><span>จำนวนรวมใหม่</span><span className="font-medium">{numFmt(a.qty)} {tuQn<0?'−':'+'} {numFmt(Math.abs(tuQn))} = <b>{numFmt(tuNewQty)}</b></span></div>
              <div className="flex justify-between"><span>เรทเฉลี่ย{tuQn<0?' (คงเดิม)':'ใหม่'}</span><span className="font-semibold text-emerald-500">{tuNewAvg.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</span></div>
              {tuSell&&tuRn>0&&(<div className="flex justify-between"><span>กำไร/ขาดทุนที่เกิดขึ้น</span><span className={`font-semibold ${tuRealized>=0?'text-emerald-500':'text-rose-500'}`}>{tuRealized>=0?'+':''}{tuRealized.toLocaleString('en-US',{maximumFractionDigits:2})}</span></div>)}
            </div>
          )}
          {tuQn<0&&tuNewQty<0&&(
            <div className="text-[11px] px-1 text-rose-500">ขายเกินจำนวนที่มี (เหลือ {numFmt(a.qty)})</div>
          )}

          {canRoute&&(
            <>
              <select className={inpCls+' w-full'} value={tuDest} onChange={e=>setTuDest(e.target.value)}>
                <option value="">{tuKind==='buy'?'— ไม่ตัดเงินจากกระเป๋า (โอนเข้าจากที่อื่น) —':'— ไม่รับเงินเข้ากระเป๋า (โอนออก) —'}</option>
                {wallets.map(w=><option key={w.id} value={w.id}>{tuKind==='buy'?`💸 จ่ายจาก: ${w.name}`:`💵 เงินเข้า: ${w.name}`}</option>)}
              </select>
              {tuDest&&(
                <div className={`text-[11px] px-1 flex justify-between ${tuKind==='buy'?(dk?'text-rose-300':'text-rose-600'):(dk?'text-emerald-300':'text-emerald-700')}`}>
                  <span>สร้างรายการ{tuKind==='buy'?'เงินออก':'เงินเข้า'}</span>
                  <span className="font-semibold">{tuFlow<0?'−':'+'}{fmt(Math.abs(tuFlow))} → {wallets.find(w=>String(w.id)===String(tuDest))?.name}</span>
                </div>
              )}
            </>
          )}
          <div className="flex gap-1.5 justify-end">
            <button onClick={()=>{setTopUp(false);setTuQty('');setTuRate('');setTuNote('');setTuDest('');}} className={`px-2.5 py-1 rounded-lg text-xs ${dk?'text-slate-400 hover:bg-white/10':'text-slate-500 hover:bg-slate-100'}`}>ยกเลิก</button>
            <button onClick={doTopUp} disabled={!tuCanSave} className={`px-3 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-40 ${tuSell?'bg-rose-500 hover:bg-rose-600':tuKind==='adjust'?'bg-amber-500 hover:bg-amber-600':'bg-emerald-600 hover:bg-emerald-700'}`}>บันทึก</button>
          </div>
        </div>
      ) : addingItem ? (
        <div className={`mt-2 p-2 rounded-xl space-y-1.5 ${dk?'bg-white/5 border border-white/10':'bg-slate-50 border border-slate-200'}`}>
          <div className="flex gap-1.5">
            <input autoFocus className={inpCls+' flex-1 min-w-0'} type="text" placeholder="รายการ" value={niName} onChange={e=>setNiName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doAddItem()}/>
            <input className={inpCls+' w-28'} type="number" placeholder="ยอดเงิน" value={niValue} onChange={e=>setNiValue(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doAddItem()}/>
          </div>
          <div className="flex gap-1.5 justify-end">
            <button onClick={()=>{setAddingItem(false);setNiName('');setNiValue('');}} className={`px-2.5 py-1 rounded-lg text-xs ${dk?'text-slate-400 hover:bg-white/10':'text-slate-500 hover:bg-slate-100'}`}>ยกเลิก</button>
            <button onClick={doAddItem} disabled={!niValid} className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40">เพิ่ม</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-1.5 mt-2">
          {/* One way in, per type of asset.
              · อื่นๆ  — a collection is described by its pieces, nothing else.
              · เงินสด — money in and out, with no units to hold.
              · หุ้น/คริปโต/ทอง/กองทุน — one button covering ซื้อ ขาย ปันผล ปรับยอด.

              The last case used to be two buttons, and that was the mistake: a
              purchase is one event that moves units *and* money, so recording it
              meant filling two forms that nothing linked, and whichever half was
              forgotten left the other half lying. Same fork as the พระเครื่อง one,
              and it closes the same way — by having one door, not by hiding the
              second door once you have walked through the first. */}
          {a.type==='other'
            ? onAddItem&&<button onClick={()=>setAddingItem(true)} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border border-dashed transition-colors ${dk?'border-white/15 text-slate-400 hover:text-emerald-300 hover:border-emerald-400/50':'border-slate-300 text-slate-500 hover:text-emerald-600 hover:border-emerald-300'}`}>+ เพิ่มชิ้น</button>
            : (isCash||!onTopUp)&&!isCollection&&<button onClick={()=>setAdding(true)} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border border-dashed transition-colors ${dk?'border-white/15 text-slate-400 hover:text-emerald-300 hover:border-emerald-400/50':'border-slate-300 text-slate-500 hover:text-emerald-600 hover:border-emerald-300'}`}>+ เพิ่มรายการ</button>}
          {!isCash&&!isCollection&&onTopUp&&<button onClick={()=>setTopUp(true)} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${dk?'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10':'border-emerald-300 text-emerald-600 hover:bg-emerald-50'}`}>+ บันทึกความเคลื่อนไหว</button>}
        </div>
      )}
    </div>
  );
};

const AssetsPage = ({assets, onEdit, onDelete, onAdd, onInvest, onPriceUpdate, onQuickPrice, onDCA, onAddAssetTx, onDeleteAssetTx, onTopUpAsset, onDeleteMove, onRenameMove, onAddItem, onDelItem, theme, wallets=[], txs=[]}) => {
  const dk = theme==='dark';
  const [usdRate,      setUsdRate]    = useState(()=>parseFloat(localStorage.getItem('ft-usdrate')||'35'));
  const [rateLoading,  setRateLoad]   = useState(false);
  // Persisted, unlike the plain useState it replaces: this one rate multiplies
  // every USD holding, so "when was it last real" has to survive a reload.
  const [rateAt, setRateAt] = useState(()=>{ const v=parseInt(localStorage.getItem('ft-usdrate-at')||'0',10); return v||null; });
  const markRateFetched = () => { const t=Date.now(); setRateAt(t); try{ localStorage.setItem('ft-usdrate-at',String(t)); }catch{} };
  const [priceLoading, setPriceLoad]  = useState(false);
  const [priceUpdAt,   setPriceUpdAt] = useState('');
  const [editingPrice, setEditingPrice]= useState(null);
  const [walletOpen,   setWalletOpen]  = useState(true);
  const [expandedRelMap, setExpandedRelMap] = useState({});
  const [assetTab, setAssetTab] = useState('all');
  const toggleRel = (id) => setExpandedRelMap(p=>({...p,[id]:!p[id]}));
  const [sortBy,  setSortBy]  = useState('valTHB');
  const [sortDir, setSortDir] = useState('desc');
  const [assetSearch, setAssetSearch] = useState('');
  const [searchTags, setSearchTags] = useState([]);
  const [walletFilter, setWalletFilter] = useState('all');
  const searchInputRef = useRef(null);
  const usdRateMounted = useRef(false);
  useEffect(()=>{
    localStorage.setItem('ft-usdrate',String(usdRate));
    // same reasoning as the Budget page fix — don't sync just from opening this page with whatever rate
    // happened to be in local storage, only when the user (or a real rate fetch) actually changes it.
    if (!usdRateMounted.current) { usdRateMounted.current = true; return; }
    window.dispatchEvent(new Event('ft-sync'));
  },[usdRate]);
  // the Twelve Data key this used to hold is gone — prices come from the server now
  useEffect(()=>{ try{ localStorage.removeItem('ft-stock-key'); }catch{} },[]);

  // Through our own endpoint like everything else, so the browser talks to one
  // host instead of a scattering of third parties.
  const fetchRate = async () => {
    setRateLoad(true);
    const srv = await fetchFromServer([], []);
    if (srv?.usdthb) { setUsdRate(srv.usdthb); markRateFetched(); }
    setRateLoad(false);
  };


  const fetchWithTimeout = (url, ms=6000, extraHeaders={}) => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, {signal: ctrl.signal, headers:{'Accept':'application/json', ...extraHeaders}})
      .finally(() => clearTimeout(tid));
  };

  // Preferred path: our own Cloud Function (see functions/index.js). Keeps the
  // user's ticker list off the public CORS proxies below, which is the whole
  // reason it exists. Returns null on any failure so the old path can take over.
  const fetchFromServer = async (stockTickers, cryptoIds) => {
    try {
      const u = auth.currentUser;
      if (!u) return null;
      const token = await u.getIdToken();
      const qs = new URLSearchParams();
      if (stockTickers.length) qs.set('stocks', stockTickers.join(','));
      if (cryptoIds.length)    qs.set('crypto', cryptoIds.join(','));
      const r = await fetchWithTimeout(`/api/prices?${qs.toString()}`, 45000, {Authorization:`Bearer ${token}`});
      if (!r.ok) return null;
      const d = await r.json();
      // "responded but priced nothing" counts as a failure — but only when
      // something was actually asked for. A bare rate lookup sends no tickers.
      const wanted = stockTickers.length + cryptoIds.length;
      if (wanted && !Object.keys(d.stocks||{}).length && !Object.keys(d.crypto||{}).length) return null;
      return d;
    } catch { return null; }
  };

  // Only an explicit `true` means quiet. Passed as an onClick handler this used
  // to receive the click event, which is truthy, so the manual button suppressed
  // every toast it was supposed to show — a failure with no symptom but silence.
  const fetchAllPrices = async (quiet) => {
    const silent = quiet === true;
    // In local mode there is no account, and the price endpoint refuses
    // unauthenticated callers because each request costs money. Say that
    // plainly instead of letting the button fail with a 401 and no
    // explanation — the trade was chosen on the way in and should be named.
    if (!auth.currentUser) { if(!silent) onPriceUpdate({}, usdRate, 0, [], {}, false, true); return; }
    const toUpdate = assets.filter(a => impliedTicker(a));
    if (!toUpdate.length) { if(!silent) onPriceUpdate({}, usdRate); return; }
    setPriceLoad(true);

    // Gold was excluded outright because no source was wired up for it. World
    // gold does have one — GC=F on Yahoo — so a gold holding that names a ticker
    // now gets priced like anything else. Thai baht-weight gold still has no
    // usable feed, and impliedTicker won't invent one for it, so those stay manual.
    const stockAssets  = toUpdate.filter(a => a.type !== 'crypto');
    const cryptoAssets = toUpdate.filter(a => a.type === 'crypto');

    // ดึง Stocks (TD > Yahoo > Stooq) + Crypto พร้อมกัน
    // Crypto carries two mutually exclusive naming schemes: a CoinGecko id
    // ("bitcoin") or a Yahoo symbol ("BTC-USD", what the search picker returns).
    // Neither source recognises the other's form, so route each to the one that
    // understands it instead of forcing users to know which is which.
    const stockTickers = [
      ...stockAssets.map(a => impliedTicker(a)),
      ...cryptoAssets.map(a => impliedTicker(a)).filter(t => t.includes('-')),
    ];
    const cryptoIds = [...new Set(
      cryptoAssets.map(a => impliedTicker(a)).filter(t => !t.includes('-')).map(t => t.toLowerCase())
    )];

    // Our own server first; the proxy path below is only a fallback now.
    const srv = await fetchFromServer(stockTickers, cryptoIds);
    if (srv) {
      const updates = {...(srv.stocks||{})};
      cryptoAssets.forEach(a => {
        const id = impliedTicker(a).toLowerCase();   // matches how the request was built
        const price = srv.crypto?.[id];
        if (price) updates['__crypto__'+id] = price;
      });
      const rate = srv.usdthb || usdRate;
      // the rate rides along with every price refresh, so stamp it here too or
      // the freshness label reports the last 🔄 press instead of the real fetch
      if (srv.usdthb) { if (srv.usdthb !== usdRate) setUsdRate(srv.usdthb); markRateFetched(); }
      onPriceUpdate(updates, rate, stockAssets.length + cryptoAssets.length, srv.missing || [], srv.currencies || {}, silent);
      setPriceUpdAt(new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}));
      setPriceLoad(false);
      return;
    }

    // No silent fallback: the old path routed the ticker list through public
    // CORS proxies, which is the whole thing this replaced. Better to say it
    // failed than to leak the holdings to work around an outage.
    if(!silent) onPriceUpdate({}, usdRate);
    setPriceLoad(false);
  };

  // the auto-refresh lives at app level (see autoPriced there) so it also runs
  // when the app opens on the dashboard; this only picks up the rate it fetched
  useEffect(()=>{
    const sync = ()=>{ const v=parseFloat(localStorage.getItem('ft-usdrate')||'0'); if(v>0) setUsdRate(v);
      const t=parseInt(localStorage.getItem('ft-usdrate-at')||'0',10); if(t) setRateAt(t); };
    window.addEventListener('ft-rate', sync);
    return ()=>window.removeEventListener('ft-rate', sync);
  },[]);

  const walletBalances = useMemo(()=>{
    const now = new Date();
    const curM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    return wallets.map(w=>{
      const wt      = txs.filter(t=>t.walletId===w.id);
      // cash-type linked assets are already counted in totVal — walletCash drops their tagged txs
      const balance = walletCash(w, txs, assets);
      const mInc    = sumTxMonth(wt,'income',curM);
      const mExp    = sumTxMonth(wt,'expense',curM);
      return { ...w, balance, mInc, mExp, txCount:wt.length };
    });
  },[wallets,txs,assets]);
  const totalWalletBalance = useMemo(()=>walletBalances.reduce((s,w)=>s+w.balance,0),[walletBalances]);

  const fmtHold = days => {
    if (days===null||days===undefined) return '—';
    if (days<0) return '—';
    if (days<30) return `${days} วัน`;
    if (days<365) return `${Math.floor(days/30)} เดือน`;
    const y=Math.floor(days/365), m=Math.floor((days%365)/30);
    return m>0?`${y} ปี ${m} เดือน`:`${y} ปี`;
  };
  const toggleSort = f => { if(sortBy===f) setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortBy(f);setSortDir('asc');} };
  const SI = ({f}) => sortBy===f?<Ic n={sortDir==='asc'?'up':'down'} s={11} cls="inline ml-1"/>:null;

  const enriched = useMemo(()=>{
    const q = assetSearch.toLowerCase().trim();
    const terms = [...searchTags.map(t=>t.toLowerCase()), ...(q ? [q] : [])];
    const TAB_TYPES = {stock:['stock','etf','fund'], crypto:['crypto'], gold:['gold'], cash:['cash'], other:['property','other']};
    const tabFilter    = a => assetTab==='all' || (TAB_TYPES[assetTab]||[]).includes(a.type);
    const walletFilterFn = a => walletFilter==='all' || String(a.walletId)===walletFilter || (walletFilter==='none'&&!a.walletId);
    const mapped = assets.filter(a=> tabFilter(a) && walletFilterFn(a) && (!terms.length || terms.some(t=> a.name.toLowerCase().includes(t) || (a.ticker||'').toLowerCase().includes(t) || a.type.includes(t)))).map(a=>{
      const mult    = a.currency==='USD' ? usdRate : 1;
      const {taggedIn, taggedOut} = assetTagged(txs, a.id);
      const hasTagged = taggedIn>0||taggedOut>0;
      const isCash = a.type==='cash';
      let valTot  = a.qty * a.currentPrice + taggedIn - taggedOut;
      let costTot = isCash ? valTot : a.qty * a.avgCost;
      const pl      = isCash ? 0 : valTot - costTot;
      const plPct   = isCash ? 0 : (costTot>0 ? (pl/costTot*100) : 0);
      const holdDays = a.purchaseDate ? Math.floor((new Date()-new Date(a.purchaseDate))/86400000) : null;
      return {...a, costTot, valTot, pl, plPct, costTHB:costTot*mult, valTHB:valTot*mult, plTHB:pl*mult, holdDays, taggedIn, taggedOut, hasTagged, isCash};
    });
    // Group by type, but order the groups by their total value (biggest group on
    // top). Within a group, keep the user's chosen column; default is value desc.
    const typeTotals = {};
    mapped.forEach(a=>{ typeTotals[a.type] = (typeTotals[a.type]||0) + a.valTHB; });
    mapped.sort((a,b)=>{
      const to = (typeTotals[b.type]||0) - (typeTotals[a.type]||0);   // bigger type-group first
      if(to !== 0) return to;
      const va = sortBy==='plTHB'?a.plTHB:sortBy==='plPct'?a.plPct:sortBy==='valTHB'?a.valTHB:sortBy==='costTHB'?a.costTHB:sortBy==='holdDays'?(a.holdDays||0):sortBy==='purchaseDate'?(a.purchaseDate||''):(a[sortBy]??'');
      const vb = sortBy==='plTHB'?b.plTHB:sortBy==='plPct'?b.plPct:sortBy==='valTHB'?b.valTHB:sortBy==='costTHB'?b.costTHB:sortBy==='holdDays'?(b.holdDays||0):sortBy==='purchaseDate'?(b.purchaseDate||''):(b[sortBy]??'');
      if(typeof va==='string') return sortDir==='asc'?va.localeCompare(vb):vb.localeCompare(va);
      return sortDir==='asc'?va-vb:vb-va;
    });
    return mapped;
  },[assets,txs,usdRate,sortBy,sortDir,assetSearch,searchTags,assetTab,walletFilter]);

  const totCost   = enriched.reduce((s,a)=>s+a.costTHB,0);
  const totVal    = enriched.reduce((s,a)=>s+a.valTHB,0);
  const totPL     = totVal-totCost;
  const totPLPct  = totCost>0 ? (totPL/totCost*100) : 0;
  // Hero card only: cash-type assets are money, not an investment — pull their value out of "พอร์ตลงทุน"
  // and into "กระเป๋าเงิน" instead. "other/property" (amulets, land, collectibles) aren't cash OR a liquid
  // investment either — they get their own third bucket. totVal/totalWalletBalance themselves stay untouched
  // everywhere else on this page (table totals, allocation chart, etc still need the full unsplit numbers to
  // match their own visible rows).
  const cashAssetsTotal  = enriched.filter(a=>a.type==='cash').reduce((s,a)=>s+a.valTHB,0);
  const otherAssetsTotal = enriched.filter(a=>a.type==='other'||a.type==='property').reduce((s,a)=>s+a.valTHB,0);
  const heroPortfolioVal = totVal - cashAssetsTotal - otherAssetsTotal;
  const heroWalletVal    = totalWalletBalance + cashAssetsTotal;

  // Cash sitting loose in wallets rather than written down as an asset record.
  const looseCash = useMemo(()=>wallets.reduce((s,w)=>s+walletCash(w,txs,assets),0),[wallets,txs,assets]);
  // It belongs in the เงินสด slice. This page used to total asset records only
  // and hang the wallet figure off the row as "(ไม่รวมในกระเป๋า ฿587,019)" — so
  // the same word carried two numbers, the smaller one here and the larger one
  // on the dashboard, and neither answered "how much cash am I holding".
  // It is one question, so it gets one number, matching what the dashboard has
  // always shown. Cash has no cost basis distinct from its value, so it adds to
  // both and leaves the P/L column alone.

  const card = `rounded-2xl ${dk?'card-solid':'glass-light shadow-sm'}`;
  const sub  = `text-xs ${dk?'text-slate-400':'text-slate-500'}`;

  return (
    <div className="space-y-4 fade-up">
      <PageHeader theme={theme} lead="Your" accent="Holdings"
        sub={`${assets.length} รายการ · หุ้น คริปโต ทองคำ และอื่นๆ`}/>
      {/* Header */}
      <div className={`${card} p-4 flex items-center justify-between flex-wrap gap-3`}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="min-w-0">
            <div className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>พอร์ตสินทรัพย์</div>
            <div className={sub}>{enriched.length}{enriched.length!==assets.length?` / ${assets.length}`:''} รายการ</div>
          </div>
          <div onClick={()=>searchInputRef.current?.focus()} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border flex-1 max-w-sm cursor-text flex-wrap ${dk?'border-white/10 bg-white/5':'border-slate-200 bg-white'}`}>
            <Ic n="search" s={12} cls={dk?'text-slate-500':'text-slate-400'}/>
            {searchTags.map(tag=>(
              <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${dk?'bg-gold-500/20 text-gold-300':'bg-gold-100 text-gold-600'}`}>
                {tag}
                <button onClick={e=>{e.stopPropagation();setSearchTags(ts=>ts.filter(t=>t!==tag));}} className="opacity-60 hover:opacity-100">
                  <Ic n="x" s={9}/>
                </button>
              </span>
            ))}
            <input ref={searchInputRef} type="text" placeholder={searchTags.length?'':'ค้นหาชื่อ, ticker...'}
              value={assetSearch} onChange={e=>setAssetSearch(e.target.value)}
              onKeyDown={e=>{
                if((e.key===' '||e.key==='Enter')&&assetSearch.trim()){
                  e.preventDefault();
                  setSearchTags(ts=>[...ts,assetSearch.trim()]);
                  setAssetSearch('');
                } else if(e.key==='Backspace'&&!assetSearch&&searchTags.length){
                  setSearchTags(ts=>ts.slice(0,-1));
                }
              }}
              className={`flex-1 min-w-[80px] text-xs outline-none bg-transparent ${dk?'text-white placeholder-slate-600':'text-slate-700 placeholder-slate-400'}`}/>
            {(assetSearch||searchTags.length>0)&&<button onClick={()=>{setAssetSearch('');setSearchTags([]);}} className={`text-xs flex-shrink-0 ${dk?'text-slate-500 hover:text-slate-300':'text-slate-400'}`}><Ic n="x" s={11}/></button>}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div data-hint="ปรับเรท USD/THB สำหรับสินทรัพย์สกุลดอลลาร์" className={`px-3 py-1.5 rounded-xl border ${dk?'border-white/10 bg-white/5':'border-slate-200 bg-white'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${dk?'text-slate-400':'text-slate-500'}`}>USD/THB</span>
              <input type="number" value={usdRate} onChange={e=>{ setUsdRate(parseFloat(e.target.value)||35); markRateFetched(); }}
                className={`w-16 text-sm text-center outline-none bg-transparent font-semibold ${dk?'text-white':'text-slate-700'}`}/>
              <button onClick={fetchRate} disabled={rateLoading} title="ดึงอัตราแลกเปลี่ยนล่าสุด"
                className={`text-xs transition-all ${rateLoading?'animate-spin':'hover:scale-110'} ${dk?'text-slate-500 hover:text-gold-400':'text-slate-400 hover:text-gold-500'}`}>
                🔄
              </button>
            </div>
            {(()=>{ // shown, not tooltipped: this rate multiplies every USD holding
              if(!rateAt) return null;
              const stale = Date.now()-rateAt > PRICE_STALE_MS;
              return <div className={`text-[10px] mt-0.5 text-center ${stale?(dk?'text-amber-500/80':'text-amber-600/80'):(dk?'text-slate-500':'text-slate-400')}`}>{priceAge(rateAt)}</div>;
            })()}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col items-center gap-0.5">
              {priceUpdAt&&<span className={`text-[10px] ${dk?'text-slate-500':'text-slate-400'}`}>อัปเดต {priceUpdAt}</span>}
              <button data-hint="ดึงราคาหุ้น/คริปโตล่าสุดอัตโนมัติ" onClick={()=>fetchAllPrices()} disabled={priceLoading}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${dk?'border-gold-500/50 text-gold-400 hover:bg-gold-500/15':'border-gold-300 text-gold-600 hover:bg-gold-50'} disabled:opacity-50`}>
                <span className={priceLoading?'animate-spin':''}>{priceLoading?'⏳':'📡'}</span>
                <span className="hidden sm:inline">{priceLoading?'กำลังดึง...':'อัปเดตราคา'}</span>
              </button>
            </div>
          </div>
          {/* The "โยกเงิน / ลงทุน" button stood here and opened the transfer
              modal with nothing preset. The wallets page has a button that
              opens the same modal with the same empty preset, so this was the
              second of two doors into one room — and the worse of the two,
              because a transfer starts from a wallet and that is the page you
              are on when you think of making one.

              The contextual routes are untouched and are better than either:
              starting from a specific asset or wallet fills in one side of the
              transfer instead of presenting two empty pickers. */}
          <button data-hint="เพิ่มหุ้น/ทอง/คริปโต/เงินสด" onClick={onAdd} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold">
            <Ic n="plus" s={13}/> เพิ่มสินทรัพย์
          </button>
        </div>
      </div>

      {/* Net Worth hero card */}
      {wallets.length>0&&(
        <div className={`${card} card-hero p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className={`text-xs font-medium uppercase tracking-wide mb-1 ${dk?'text-slate-400':'text-slate-500'}`}>มูลค่าสินทรัพย์รวม</div>
              <div className={`text-3xl font-bold tracking-tight ${dk?'tg-white':'text-slate-800'}`}>{fmtNW(heroPortfolioVal+heroWalletVal+otherAssetsTotal)}</div>
            </div>
            <div className="flex gap-6 flex-wrap">
              <div>
                <div className={`text-xs mb-0.5 ${dk?'text-slate-400':'text-slate-500'}`}>📈 พอร์ตลงทุน</div>
                <div className={`text-lg font-bold tracking-wide ${dk?'text-white':'text-slate-800'}`}>{fmt(heroPortfolioVal)}</div>
              </div>
              <div className={`w-px ${dk?'bg-white/10':'bg-slate-200'}`}/>
              <div>
                <div className={`text-xs mb-0.5 ${dk?'text-slate-400':'text-slate-500'}`}>👛 กระเป๋าเงิน</div>
                <div className={`text-lg font-bold tracking-wide ${dk?'text-white':'text-slate-800'}`}>{fmt(heroWalletVal)}</div>
              </div>
              {otherAssetsTotal>0&&(<>
                <div className={`w-px ${dk?'bg-white/10':'bg-slate-200'}`}/>
                <div>
                  <div className={`text-xs mb-0.5 ${dk?'text-slate-400':'text-slate-500'}`}>🗂️ สินทรัพย์อื่นๆ</div>
                  <div className={`text-lg font-bold tracking-wide ${dk?'text-white':'text-slate-800'}`}>{fmt(otherAssetsTotal)}</div>
                </div>
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {label:'มูลค่าพอร์ต (฿)', val:fmt(totVal),    cls:dk?'text-2xl font-bold tracking-wide tg-white':'text-2xl font-bold tracking-wide text-slate-800',                                        note:'ราคาปัจจุบันรวม',    extra:wallets.length>0?'':(dk?'card-hero':'')},
          {label:'ต้นทุนรวม (฿)',   val:fmt(totCost),   cls:`text-2xl font-bold tracking-wide ${dk?'text-slate-300':'text-slate-600'}`,                                                  note:'เงินที่ลงทุนไป',     extra:''},
          {label:'กำไร/ขาดทุน (฿)',val:(totPL>=0?'+':'')+fmt(totPL), cls:dk?`text-2xl font-bold tracking-wide ${totPL>=0?'tg-emerald':'tg-red'}`:`text-2xl font-bold tracking-wide ${totPL>=0?'text-emerald-500':'text-rose-500'}`, note:totPL>=0?'✓ กำไร':'⚠ ขาดทุน'},
          {label:'% เปลี่ยนแปลง', val:`${totPLPct>=0?'+':''}${totPLPct.toFixed(2)}%`, cls:dk?`text-2xl font-bold tracking-wide ${totPLPct>=0?'tg-emerald':'tg-red'}`:`text-2xl font-bold tracking-wide ${totPLPct>=0?'text-emerald-500':'text-rose-500'}`, note:`จากต้นทุน ${fmt(totCost)}`},
        ].map(({label,val,cls,note,extra})=>(
          <div key={label} className={`${card} ${extra} p-5`}>
            <div className={`text-xs font-medium mb-2 uppercase tracking-wide ${dk?'text-slate-400':'text-slate-500'}`}>{label}</div>
            <div className={cls}>{val}</div>
            <div className={`mt-1 ${sub}`}>{note}</div>
          </div>
        ))}
      </div>

      {/* สัดส่วนตามประเภท used to sit here, with a donut and a per-type table of
          value, cost, P/L and share. It has moved into the Unrealized P/L card
          on the dashboard, which was grouping by the same types and computing
          the same P/L already — the two panels were one table split across two
          pages, each having to be kept correct separately. */}

      {/* Table - full width */}
      <div className={`${card} overflow-hidden`}>
        <div className={`flex items-center justify-between gap-3 px-5 py-3 border-b flex-wrap ${dk?'border-white/5':'border-slate-100'}`}>
          <span className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>รายการสินทรัพย์ทั้งหมด</span>
          <div className="flex items-center gap-2 flex-wrap">
            {wallets.length>0&&(
              <select value={walletFilter} onChange={e=>setWalletFilter(e.target.value)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none transition-all ${walletFilter!=='all'?(dk?'border-gold-500/60 bg-gold-500/10 text-gold-300':'border-gold-400 bg-gold-50 text-gold-700'):(dk?'border-white/10 bg-white/5 text-slate-400':'border-slate-200 bg-white text-slate-500')}`}>
                <option value="all">👛 ทุกกระเป๋า</option>
                {wallets.map(w=><option key={w.id} value={String(w.id)}>{w.icon||'👛'} {w.name}</option>)}
                <option value="none">— ไม่มีกระเป๋า</option>
              </select>
            )}
            <div className={`flex gap-1 p-1 rounded-xl ${dk?'bg-white/5':'bg-slate-100'}`}>
              {[{k:'all',l:'ทั้งหมด'},{k:'stock',l:'📈 หุ้น'},{k:'crypto',l:'🪙 คริปโต'},{k:'gold',l:'🥇 ทองคำ'},{k:'cash',l:'💵 เงินสด'},{k:'other',l:'📦 อื่นๆ'}].map(({k,l})=>(
                <button key={k} onClick={()=>setAssetTab(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${assetTab===k?(dk?'bg-orange-400 text-orange-950':'bg-white text-orange-600 shadow-sm'):(dk?'text-slate-400 hover:text-white':'text-slate-500 hover:text-slate-700')}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        {assetTab==='cash' ? (
          <div className="p-4 space-y-3">
            {enriched.length===0 && <p className={`text-sm text-center py-8 ${sub}`}>ยังไม่มีสินทรัพย์ประเภทเงินสด</p>}
            {enriched.map(a=>{
              const investTxs = txs.filter(t=>{
                if(t.targetAssetId===a.id) return true;
                if(t.toAssetId===a.id && t.transferDir!=='to') return true;
                if(t.fromAssetId===a.id && t.transferDir!=='from') return true;
                return false;
              }).sort((x,y)=>y.id-x.id);
              const bal = a.valTot;
              const pct = totVal>0 ? bal/totVal*100 : 0;
              const w = wallets.find(x=>x.id===a.walletId);
              return (
                <div key={a.id} className={`rounded-2xl border overflow-hidden ${dk?'border-white/8 bg-white/[0.02]':'border-slate-200 bg-white'}`}>
                  {/* Account header */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${dk?'bg-emerald-500/15':'bg-emerald-50'}`}>💵</div>
                      <div>
                        <div className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>{a.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {a.note&&<span className={`text-xs ${sub}`}>{a.note}</span>}
                          {w&&<span className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium ${dk?'bg-white/8 text-slate-400':'bg-slate-100 text-slate-500'}`}>👛 {w.name}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold tracking-tight ${dk?'text-white':'text-slate-800'}`}>{fmt(bal)}</div>
                      <div className={`text-xs mt-0.5 ${sub}`}>{pct.toFixed(1)}% ของพอร์ต</div>
                    </div>
                  </div>
                  {/* Balance bar */}
                  <div className={`mx-5 mb-3 h-1.5 rounded-full overflow-hidden ${dk?'bg-white/8':'bg-slate-100'}`}>
                    <div className="h-full rounded-full transition-all duration-700" style={{width:`${Math.min(pct,100)}%`,background:'#7aab8a'}}/>
                  </div>
                  {/* Transactions */}
                  {/* Anything worth showing opens the row: transactions, or quantity movements,
                      or a cash asset's own ledger. Keyed on transactions alone it stayed
                      shut on a holding whose whole story was in its เติม/เอาออก history. */}
                  {(investTxs.length>0||(a.moves||[]).length>0||(a.items||[]).length>0||a.type==='cash'||a.type==='other')&&(
                    <div className={`border-t ${dk?'border-white/5':'border-slate-100'}`}>
                      <button onClick={()=>toggleRel(a.id)} className={`w-full flex items-center gap-2 px-5 py-2.5 text-left hover:bg-black/5 transition-colors`}>
                        <span className={`text-xs ${sub}`}>{expandedRelMap[a.id]?'▲':'▼'}</span>
                        <span className={`text-xs font-medium ${dk?'text-slate-400':'text-slate-500'}`}>รายการที่เกี่ยวข้อง ({investTxs.length+(a.items||[]).length})</span>
                      </button>
                      {expandedRelMap[a.id]&&(
                        <div className={`px-3 pb-3 border-t ${dk?'border-white/5':'border-slate-100'}`}>
                          <AssetRelBody a={a} investTxs={investTxs} dk={dk} onAddTx={onAddAssetTx} onDeleteTx={onDeleteAssetTx} onTopUp={opts=>onTopUpAsset(a.id,opts)} wallets={wallets} usdRate={usdRate} onDeleteMove={onDeleteMove} onRenameMove={onRenameMove} onAddItem={(n,v)=>onAddItem&&onAddItem(a.id,n,v)} onDelItem={iid=>onDelItem&&onDelItem(a.id,iid)}/>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Actions */}
                  <div className={`flex border-t ${dk?'border-white/5':'border-slate-100'}`}>
                    <button onClick={()=>onEdit(a)} className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${dk?'text-slate-400 hover:text-white hover:bg-white/5':'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}><Ic n="edit" s={11}/> แก้ไข</button>
                    <div className={`w-px my-2 ${dk?'bg-white/8':'bg-slate-100'}`}/>
                    <button onClick={()=>onDelete(a.id)} className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${dk?'text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/8':'text-rose-300 hover:text-rose-500 hover:bg-rose-50'}`}><Ic n="trash" s={11}/> ลบ</button>
                  </div>
                </div>
              );
            })}
            {/* Total.
                The rows above are cash written down as asset records, and their
                sum is not the cash on hand — the wallets hold the rest. The
                allocation panel at the top of this same page adds the two, so
                totalling only the rows put ฿596,000 directly under ฿1,180,736
                and left the reader to guess which was the cash they have.
                Both figures are right; the arithmetic between them was missing. */}
            {enriched.length>0&&(
              <div className={`px-5 py-4 rounded-2xl ${dk?'bg-emerald-500/10 border border-emerald-500/20':'bg-emerald-50 border border-emerald-100'}`}>
                {(looseCash>0.01 && walletFilter==='all') ? (<>
                  <div className={`flex items-center justify-between text-xs ${dk?'text-slate-400':'text-slate-500'}`}>
                    <span>รวมที่บันทึกเป็นสินทรัพย์</span><span className="tabular-nums">{fmt(totVal)}</span>
                  </div>
                  <div className={`flex items-center justify-between text-xs mt-1 ${dk?'text-slate-400':'text-slate-500'}`}>
                    <span>+ เงินในกระเป๋าเงิน</span><span className="tabular-nums">{fmt(looseCash)}</span>
                  </div>
                  <div className={`flex items-center justify-between mt-2 pt-2 border-t ${dk?'border-emerald-500/20':'border-emerald-200'}`}>
                    <span className={`text-sm font-semibold ${dk?'text-emerald-300':'text-emerald-700'}`}>รวมเงินสดทั้งหมด</span>
                    <span className={`text-xl font-bold tabular-nums ${dk?'text-emerald-300':'text-emerald-700'}`}>{fmt(totVal+looseCash)}</span>
                  </div>
                </>) : (
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-semibold ${dk?'text-emerald-300':'text-emerald-700'}`}>รวมเงินสดทั้งหมด</span>
                    <span className={`text-xl font-bold tabular-nums ${dk?'text-emerald-300':'text-emerald-700'}`}>{fmt(totVal)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
        <div className="overflow-auto" style={{maxHeight:'70vh'}}>
          {/* The wrapper has to be the scroll container for the pinned header to
              have anything to pin against. It was overflow-x-auto, and a box
              with overflow-x: auto gets overflow-y: auto forced on it by the
              spec — so it already was one, with the header stuck to a top edge
              that never moves. Giving it a height makes the rows scroll inside
              it rather than the page, which is what the header was written for.

              70vh rather than a pixel figure: the table should use most of
              whatever screen it is on, with the headings in view throughout. */}
          <table className="w-full">
            <thead><tr className={`border-b ${dk?'border-white/5':'border-slate-100'}`}>
              {[{h:'สินทรัพย์',f:'name'},{h:'จำนวน',f:'qty'},{h:'ทุน/หน่วย',f:'avgCost',tip:'ราคาต้นทุนเฉลี่ยต่อหน่วยที่ซื้อมา'},{h:'ราคาตลาด',f:'currentPrice',tip:'ราคาล่าสุดต่อหน่วย'},{h:'วันที่ซื้อ',f:'purchaseDate'},{h:'ต้นทุนรวม',f:'costTHB',tip:'จำนวน × ต้นทุนเฉลี่ย = เงินที่ลงทุนไปทั้งหมด'},{h:'กำไร/ขาดทุน',f:'plTHB',tip:'มูลค่าปัจจุบัน − ต้นทุนรวม (ยังไม่ขาย = กำไรบนกระดาษ)'},{h:'มูลค่าปัจจุบัน',f:'valTHB',tip:'ต้นทุนรวม + กำไร/ขาดทุน = มูลค่าตอนนี้'}].map(({h,f,tip})=>(
                // Pinned. Reading the twentieth of thirty-four holdings meant
                // having scrolled the column names off the top, so ทุน/หน่วย and
                // มูลค่า became two unlabelled columns of baht that look alike.
                // The header needs an opaque background of its own to do this —
                // rows passing under a translucent one are unreadable — hence
                // the solid colour rather than the tint it carried before.
                <th key={h} title={tip||undefined} onClick={()=>toggleSort(f)}
                  className={`sticky top-0 z-10 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${dk?'text-slate-200 hover:text-white':'text-slate-700 hover:text-slate-900'}`}
                  style={{background: dk ? '#14140f' : '#e8e6e1'}}>{h}{tip&&<span className="ml-0.5 opacity-40 normal-case">ⓘ</span>}<SI f={f}/></th>
              ))}
              <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${dk?'text-slate-200 bg-white/[0.09]':'text-slate-700 bg-slate-200'}`}>จัดการ</th>
            </tr></thead>
            <tbody>
              {enriched.length===0&&<tr><td colSpan={8} className="py-14 text-center">
                <div className="text-4xl mb-3 opacity-60">{assets.length===0?'📈':'🔍'}</div>
                <p className={`text-sm font-semibold mb-1 ${dk?'text-slate-300':'text-slate-600'}`}>{assets.length===0?'ยังไม่มีสินทรัพย์':'ไม่พบสินทรัพย์ที่ตรงกับตัวกรอง'}</p>
                <p className={`text-xs mb-4 ${sub}`}>{assets.length===0?'เพิ่มหุ้น คริปโต ทอง หรือเงินสด เพื่อเริ่มติดตามพอร์ต':'ลองเปลี่ยนตัวกรองหรือคำค้นหา'}</p>
                {assets.length===0&&<button onClick={onAdd} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold"><Ic n="plus" s={13}/> เพิ่มสินทรัพย์</button>}
              </td></tr>}
              {enriched.map((a,i)=>{
                const ti = typeInfo(a.type);
                const investTxs = txs.filter(t=>{
                  if(t.targetAssetId===a.id) return true;
                  if(t.toAssetId===a.id && t.transferDir!=='to') return true;
                  if(t.fromAssetId===a.id && t.transferDir!=='from') return true;
                  return false;
                }).sort((x,y)=>y.id-x.id);
                return (
                  <React.Fragment key={a.id}>
                  {/* Light mode separates rows with the rule alone. It had both a
                      rule and zebra striping, each turned down so far that
                      neither worked — the stripe was slate-50/50 and the rule
                      was slate-50, the same colour, so the "divider" was drawn
                      in the shade it was meant to divide. Rows here run two
                      lines deep, and banding that tall reads as blocks of
                      colour rather than as grouping, so the rule is the one
                      worth keeping. Dark mode keeps its striping: on near-black
                      the bands are what carry across a wide row. */}
                  <tr className={`row-mod border-b transition-colors group ${dk?(i%2===0?'border-white/5 bg-white/[0.01] hover:bg-white/[0.05]':'border-white/5 bg-black/[0.08] hover:bg-white/[0.04]'):'border-slate-100 bg-white hover:bg-slate-50'}`}>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <AssetIcon a={a} ti={ti}/>
                        <div>
                          <div className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>{a.name}</div>
                          {/* The type was plain grey text at the head of the
                              sub-line, indistinguishable from the note that
                              followed it. As a tinted pill in the type's own
                              colour it matches the badge to its left, so the
                              two agree at a glance and the note beside it stops
                              being read as part of the category. */}
                          <div className={`text-xs flex items-center gap-1.5 flex-wrap ${sub}`}>
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                              style={{background:ti.c+'22', color:ti.c}}>{ti.l.substring(3)}</span>
                            {a.note?<span>{a.note}</span>:null}{(()=>{const w=wallets.find(x=>x.id===a.walletId);return w?<span data-hint="สินทรัพย์นี้เชื่อมกับกระเป๋าเงิน — ไปโผล่ในหน้ากระเป๋าด้วย" className={`ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${dk?'bg-gold-500/20 text-gold-300':'bg-gold-50 text-gold-500'}`}>👛 {w.name}</span>:null;})()}{a.address&&<AddressChip address={a.address} dk={dk}/>}</div>
                          {a.type==='crypto'&&<div className={`text-[11px] mt-0.5 tabular-nums ${dk?'text-slate-500':'text-slate-400'}`}>{fmtQty(a.qty)} {(a.ticker||a.name).trim().split(/\s+/)[0].toUpperCase()} <span className="opacity-70">≈ {fmt(a.valTHB)}</span></div>}
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-4 text-sm ${dk?'text-slate-300':'text-slate-600'}`}>{fmtQty(a.qty)}</td>
                    {/* Both money columns are per unit, which for a collection is
                        an average across things that are not alike: nine amulets
                        of ฿1.5M showed ฿166,666.67 twice, a figure no amulet has.
                        Collections print the totals instead. Gated on having
                        pieces, so every other holding keeps its unit price. */}
                    <td className={`px-4 py-4 text-sm ${dk?'text-slate-300':'text-slate-600'}`}
                      title={(a.items||[]).length?'ทุนรวมทั้งหมด':''}>
                      {a.type==='cash'?'—':fmtA((a.items||[]).length?a.avgCost*a.qty:a.avgCost, a.currency)}
                    </td>
                    {/* A collection's price is the average of its pieces, not a
                        figure of its own — typing over it here would leave the
                        total disagreeing with the list that explains it. */}
                    <td className={`px-4 py-4 text-sm font-medium ${dk?'text-white':'text-slate-700'}`}
                      data-hint={a.type!=='cash'&&!(a.items||[]).length?"ดับเบิลคลิกแก้ราคา":undefined}
                      onDoubleClick={a.type!=='cash'&&!(a.items||[]).length?()=>setEditingPrice({id:a.id,value:String(a.currentPrice)}):undefined}
                      title={a.type==='cash'?"":(a.items||[]).length?"มูลค่ารวมของทุกชิ้น — แก้ที่ยอดเงินของชิ้นนั้น":"ดับเบิลคลิกเพื่อแก้ราคา"}>
                      {a.type==='cash'?'—':(editingPrice?.id===a.id
                        ? <input type="number" autoFocus
                            value={editingPrice.value}
                            onChange={e=>setEditingPrice(p=>({...p,value:e.target.value}))}
                            onBlur={()=>{ const p=parseFloat(editingPrice.value); if(p>0) onQuickPrice(a.id,p); setEditingPrice(null); }}
                            onKeyDown={e=>{ if(e.key==='Enter'){e.target.blur();} if(e.key==='Escape') setEditingPrice(null); }}
                            className={`w-28 px-2 py-0.5 rounded-lg border text-sm outline-none ${dk?'bg-white/10 border-gold-400 text-white':'bg-white border-gold-400 text-slate-800'}`}/>
                        : <span className="cursor-default select-none">{fmtA((a.items||[]).length?a.currentPrice*a.qty:a.currentPrice, a.currency)}</span>
                      )}
                      {a.type!=='cash'&&(()=>{
                        // sits under the number rather than in its own column — the age
                        // belongs to this price, and the table is already wide
                        const canPrice = !!impliedTicker(a);
                        if (!a.priceAt) return canPrice
                          ? <div className={`text-[10px] mt-0.5 font-normal ${dk?'text-amber-500/80':'text-amber-600/80'}`}>ยังไม่เคยอัปเดต</div>
                          : null;
                        const stale = Date.now()-a.priceAt > PRICE_STALE_MS;
                        return <div className={`text-[10px] mt-0.5 font-normal ${stale?(dk?'text-amber-500/80':'text-amber-600/80'):(dk?'text-slate-500':'text-slate-400')}`}>{priceAge(a.priceAt)}</div>;
                      })()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className={`text-sm ${dk?'text-slate-400':'text-slate-500'}`}>{a.purchaseDate||'—'}</div>
                      {a.holdDays!==null&&<div className={`text-[11px] tabular-nums mt-0.5 ${dk?'text-slate-500':'text-slate-400'}`}>{fmtHold(a.holdDays)}</div>}
                    </td>
                    <td className="px-4 py-4">
                      {a.isCash
                        ? <><div className={`text-sm font-bold whitespace-nowrap ${a.valTot<0?'text-rose-500':'text-emerald-500'}`}>{fmtSigned(a.valTot)}</div>
                          <div className={`text-[10px] ${sub}`}>ยอดคงเหลือ</div></>
                        : <><div className={`text-sm font-medium whitespace-nowrap ${dk?'text-slate-200':'text-slate-700'}`}>{fmtA(a.costTot,a.currency)}</div>
                          {a.currency==='USD'&&<div className={`text-xs ${sub}`}>≈ {fmt(a.costTHB)}</div>}</>
                      }
                    </td>
                    <td className="px-4 py-4">
                      {a.isCash
                        ? <span className={`text-sm ${dk?'text-slate-500':'text-slate-400'}`}>—</span>
                        : <><div className={`text-sm font-semibold whitespace-nowrap ${a.pl>=0?'text-emerald-400':'text-rose-400'}`}>{a.pl>=0?'+':''}{fmtA(a.pl,a.currency)}</div>
                          {/* the percentage is this same figure in another unit,
                              so it sits under it rather than a column away */}
                          <div className={`text-xs font-medium ${a.plPct>=0?'text-emerald-400/80':'text-rose-400/80'}`}>{a.plPct>=0?'+':''}{a.plPct.toFixed(2)}%</div>
                          {a.currency==='USD'&&<div className={`text-xs ${sub}`}>≈ {a.plTHB>=0?'+':''}{fmtSigned(a.plTHB)}</div>}</>
                      }
                    </td>
                    <td className="px-4 py-4">
                      {a.isCash
                        ? <span className={`text-sm ${dk?'text-slate-500':'text-slate-400'}`}>—</span>
                        : <><div className={`text-sm font-bold whitespace-nowrap ${dk?'text-white':'text-slate-800'}`}>{fmtA(a.valTot,a.currency)}</div>
                          {a.currency==='USD'&&<div className={`text-xs ${sub}`}>≈ {fmt(a.valTHB)}</div>}</>
                      }
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button title="แก้ไขสินทรัพย์" onClick={()=>onEdit(a)} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="edit" s={13}/></button>
                        {onDCA&&a.type!=='cash'&&<button title="คำนวณ DCA — วางแผนซื้อถัวเฉลี่ยต้นทุน (Dollar-Cost Averaging)" onClick={()=>onDCA(a)} className={`p-1.5 rounded-lg ${dk?'hover:bg-gold-500/20 text-slate-400 hover:text-gold-400':'hover:bg-gold-50 text-slate-400 hover:text-gold-500'}`}>🧮</button>}
                        <button title="ลบสินทรัพย์ (ยกเลิกได้ 5 วิ)" onClick={()=>onDelete(a.id)} className={`p-1.5 rounded-lg ${dk?'hover:bg-rose-500/20 text-rose-400':'hover:bg-rose-50 text-rose-400'}`}><Ic n="trash" s={13}/></button>
                      </div>
                    </td>
                  </tr>
                  {/* Anything worth showing opens the row: transactions, or quantity movements,
                      or a cash asset's own ledger. Keyed on transactions alone it stayed
                      shut on a holding whose whole story was in its เติม/เอาออก history. */}
                  {(investTxs.length>0||(a.moves||[]).length>0||(a.items||[]).length>0||a.type==='cash'||a.type==='other')&&(
                    <tr className={`${dk?'bg-white/[0.02]':'bg-slate-50/80'}`}>
                      <td colSpan={99} className="px-4 py-0 max-w-0 w-full overflow-hidden">
                        {/* Header row — always visible */}
                        <button onClick={()=>toggleRel(a.id)} className={`flex items-center gap-2 py-2 text-left`}>
                          <span className={`text-xs ${dk?'text-slate-500':'text-slate-400'}`}>{expandedRelMap[a.id]?'▲':'▼'}</span>
                          <span className={`text-xs font-semibold ${dk?'text-slate-400':'text-slate-500'}`}>📋 รายการที่เกี่ยวข้อง ({investTxs.length+(a.items||[]).length})</span>
                        </button>
                        {/* Expandable list */}
                        {expandedRelMap[a.id]&&(
                          <div className={`pb-3 border-t max-w-md ${dk?'border-white/5':'border-slate-100'}`}>
                            <AssetRelBody a={a} investTxs={investTxs} dk={dk} onAddTx={onAddAssetTx} onDeleteTx={onDeleteAssetTx} onTopUp={opts=>onTopUpAsset(a.id,opts)} wallets={wallets} usdRate={usdRate} onDeleteMove={onDeleteMove} onRenameMove={onRenameMove} onAddItem={(n,v)=>onAddItem&&onAddItem(a.id,n,v)} onDelItem={iid=>onDelItem&&onDelItem(a.id,iid)}/>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
            {enriched.length>0&&(
              <tfoot>
                <tr className={`border-t-2 font-bold ${dk?'border-white/10 bg-white/5':'border-slate-200 bg-slate-50'}`}>
                  {/* The footer kept the old column order: the total value sat
                      under ราคาตลาด, where it belonged to nothing, and the
                      percentage held the last column after มูลค่าปัจจุบัน took
                      it. Each figure now lines up under its own heading, and
                      the percentage sits under the gain here exactly as it does
                      in the rows above. */}
                  <td colSpan={2} className={`px-4 py-4 text-sm ${dk?'text-slate-300':'text-slate-600'}`}>รวมทั้งหมด (THB)</td>
                  <td/>
                  <td/>
                  <td/>
                  <td className={`px-4 py-4 text-sm font-bold ${dk?'text-slate-300':'text-slate-600'}`}>{fmt(totCost)}</td>
                  <td className="px-4 py-4">
                    <div className={`text-sm font-bold whitespace-nowrap ${totPL>=0?'text-emerald-400':'text-rose-400'}`}>{totPL>=0?'+':''}{fmtSigned(totPL)}</div>
                    <div className={`text-xs font-medium ${totPLPct>=0?'text-emerald-400/80':'text-rose-400/80'}`}>{totPLPct>=0?'+':''}{totPLPct.toFixed(2)}%</div>
                  </td>
                  <td className={`px-4 py-4 text-sm font-bold whitespace-nowrap ${dk?'text-white':'text-slate-800'}`}>{fmt(totVal)}</td>
                  <td/>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        )}
      </div>
    </div>
  );
};

// ── SUMMARY PAGE ───────────────────────────────────────────
// Goal projection chart — cumulative savings (solid) + forecast (dashed) + goal line
const GoalChart = ({ labels, actual, forecast, goal, theme }) => {
  const ref = useRef(); const ch = useRef();
  const dk = theme==='dark';
  useEffect(()=>{
    if(ch.current) ch.current.destroy();
    ch.current = new Chart(ref.current, { type:'line',
      data:{ labels, datasets:[
        { label:'เงินเก็บสะสม', data:actual, borderColor:'#7aab8a', backgroundColor:dk?'rgba(122,171,138,0.12)':'rgba(122,171,138,0.08)', fill:true, tension:0.35, pointRadius:2, borderWidth:2.5 },
        { label:'คาดการณ์', data:forecast, borderColor:'#c9a94b', borderDash:[5,4], fill:false, tension:0.35, pointRadius:0, borderWidth:2, spanGaps:true },
        { label:'เป้าหมาย', data:labels.map(()=>goal), borderColor:dk?'rgba(212,160,23,0.55)':'rgba(202,168,74,0.7)', borderDash:[2,3], fill:false, pointRadius:0, borderWidth:1.5 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
        plugins:{ legend:{ labels:{ boxWidth:10, padding:14, font:{size:10} } }, tooltip:{ callbacks:{ label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } } },
        scales:{ x:{ grid:{display:false}, ticks:{maxTicksLimit:8} }, y:{ ticks:{ callback:v=>v>=1e6?(v/1e6).toFixed(1)+'M':(v/1000).toFixed(0)+'K' } } } } });
    return ()=>ch.current?.destroy();
  },[labels,actual,forecast,goal,theme]);
  return <canvas ref={ref}/>;
};

// ── RETIREMENT / DCA PROJECTION ────────────────────────────
// The DCA Calculator already in the app answers a question at the moment of
// buying — what a purchase does to the average cost. This answers the other one:
// where a monthly habit ends up, and what it has to be to arrive somewhere.
//
// monthlyRate / projectFV / requiredPMT live in lib.js so they can be tested —
// compound interest is where an off-by-one in the period count or an r/12 gives
// an answer that looks entirely reasonable and is wrong by years.
// Which holdings a 10%-a-year assumption is even about. Everything summed
// together came to the whole net worth — gold, land, cash and a case of amulets
// alongside the equities — and none of those compound the way the number being
// typed in describes. Stock alone is the default; the rest are there to be
// added deliberately, each showing what it would bring.
const PLAN_TYPES = [['stock','หุ้น/กองทุน'],['crypto','Crypto'],['gold','ทองคำ'],['cash','เงินสด'],['other','อื่นๆ']];

const PlanTab = ({ dk, card, theme, byType={} }) => {
  const [mode,  setMode]  = useState('fv');      // 'fv' = หาปลายทาง · 'pmt' = หาเงินต่อเดือน
  const [incl,  setIncl]  = useState(['stock']);
  const [pv,    setPv]    = useState(()=>String(Math.round(byType.stock||0)));
  const [pmt,   setPmt]   = useState('20000');
  const [rate,  setRate]  = useState('10');
  const [years, setYears] = useState('20');
  const [target,setTarget]= useState('5000000');

  const nPv = parseFloat(pv)||0, nRate = parseFloat(rate)||0;
  const nYr = Math.max(0, Math.min(60, parseFloat(years)||0));
  const months = Math.round(nYr*12);
  const nPmt = mode==='fv' ? (parseFloat(pmt)||0) : requiredPMT(parseFloat(target)||0, nPv, nRate, months);
  const solved = mode==='fv' ? projectFV(nPv, nPmt, nRate, months) : (parseFloat(target)||0);
  const enough = mode==='pmt' && nPmt <= 0;      // the starting sum gets there on its own
  const contributed = nPv + Math.max(nPmt,0)*months;
  const growth = solved - contributed;

  // year-by-year, for the bars: what was put in vs what the returns added
  const series = useMemo(()=>{
    const out = [];
    for (let y=0; y<=Math.round(nYr); y++) {
      const m = y*12;
      out.push({ y, total: projectFV(nPv, Math.max(nPmt,0), nRate, m), put: nPv + Math.max(nPmt,0)*m });
    }
    return out;
  },[nPv,nPmt,nRate,nYr]);
  const peak = Math.max(...series.map(s=>s.total), 1);

  const inp = `w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none tabular-nums ${dk?'bg-white/5 border-white/10 text-white focus:border-gold-500':'bg-slate-50 border-slate-200 text-slate-800 focus:border-gold-400'}`;
  const lbl = `text-xs font-medium mb-1.5 block ${dk?'text-slate-400':'text-slate-500'}`;
  const money = n => isFinite(n) ? '฿'+Math.round(n).toLocaleString('en-US') : '—';

  return (
    <>
      <div className={`${card} p-5 space-y-4`}>
        <div className={`flex rounded-xl p-1 gap-1 ${dk?'bg-white/5':'bg-slate-100'}`}>
          {[['fv','มูลค่าปลายทาง'],['pmt','เงินลงทุนต่อเดือน']].map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode===m?(dk?'bg-gold-500/25 text-gold-200':'bg-gold-500 shadow-sm'):(dk?'text-slate-400 hover:text-white':'text-slate-500')}`}>{l}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>เงินลงทุนตั้งต้น</label>
            <input type="number" className={inp} value={pv} onChange={e=>setPv(e.target.value)}/>
          </div>
          <div>
            <label className={lbl}>{mode==='fv'?'เงินลงทุนต่อเดือน':'มูลค่าเป้าหมาย'}</label>
            {mode==='fv'
              ? <input type="number" className={inp} value={pmt}    onChange={e=>setPmt(e.target.value)}/>
              : <input type="number" className={inp} value={target} onChange={e=>setTarget(e.target.value)}/>}
          </div>
          <div><label className={lbl}>ผลตอบแทนต่อปี (%)</label><input type="number" className={inp} value={rate} onChange={e=>setRate(e.target.value)}/></div>
          <div><label className={lbl}>ระยะเวลาลงทุน (ปี)</label><input type="number" className={inp} value={years} onChange={e=>setYears(e.target.value)}/></div>
        </div>
        {PLAN_TYPES.some(([t])=>(byType[t]||0)>0)&&(
          <div>
            <label className={lbl}>ดึงจากพอร์ตจริง — เลือกเฉพาะสินทรัพย์ที่เติบโตตามสมมติฐานนี้</label>
            <div className="flex flex-wrap gap-1.5">
              {PLAN_TYPES.filter(([t])=>(byType[t]||0)>0).map(([t,l])=>{
                const on = incl.includes(t);
                return (
                  <button key={t} onClick={()=>{
                      const next = on ? incl.filter(x=>x!==t) : [...incl,t];
                      setIncl(next);
                      setPv(String(Math.round(next.reduce((s,k)=>s+(byType[k]||0),0))));
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-colors ${on?(dk?'bg-gold-500/20 text-gold-300 border-gold-500/40':'bg-gold-50 text-gold-600 border-gold-300'):(dk?'bg-white/5 text-slate-400 border-white/10 hover:text-white':'bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-800')}`}>
                    {on?'✓ ':''}{l} <span className="font-normal opacity-70">{money(byType[t])}</span>
                  </button>
                );
              })}
            </div>
            <p className={`text-[11px] mt-1.5 ${dk?'text-slate-500':'text-slate-400'}`}>
              {incl.length ? `เลือกแล้ว ${incl.length} ประเภท` : 'ยังไม่ได้เลือก — ระบุเงินลงทุนตั้งต้นเองได้'} · ทองคำ เงินสด และของสะสม มีลักษณะผลตอบแทนต่างจากหุ้น
            </p>
          </div>
        )}
        <p className={`text-[11px] ${dk?'text-slate-500':'text-slate-400'}`}>ทบต้นรายเดือนที่ {(monthlyRate(nRate)*100).toFixed(4)}% ต่อเดือน · ผลตอบแทนเป็นสมมติฐาน ไม่ใช่การรับประกัน</p>
      </div>

      <div className={`${card} p-5`}>
        {mode==='pmt'&&enough ? (
          <div className={`text-center py-4 ${dk?'text-emerald-300':'text-emerald-600'}`}>
            <div className="text-sm font-semibold mb-1">เงินลงทุนตั้งต้นถึงเป้าหมายโดยไม่ต้องลงทุนเพิ่ม</div>
            <div className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>{money(nPv)} ที่ {nRate}% ต่อปี เติบโตเป็น {money(projectFV(nPv,0,nRate,months))} ภายใน {nYr} ปี</div>
          </div>
        ) : (
          <>
            <div className={`text-xs font-medium mb-1 uppercase tracking-wide ${dk?'text-slate-400':'text-slate-500'}`}>{mode==='fv'?`มูลค่าเมื่อครบ ${nYr} ปี`:'เงินลงทุนต่อเดือนที่ต้องใช้'}</div>
            <div className={`text-3xl font-bold mb-4 ${dk?'tg-gold':'text-gold-600'}`}>{money(mode==='fv'?solved:nPmt)}</div>
            <div className="space-y-1.5">
              {[['เงินลงทุนสะสม', contributed, dk?'text-slate-300':'text-slate-600'],
                ['ผลตอบแทนทบต้น',   growth,      'text-emerald-500']].map(([l,v,c])=>(
                <div key={l} className="flex items-center justify-between text-xs">
                  <span className={dk?'text-slate-400':'text-slate-500'}>{l}</span>
                  <span className={`font-semibold tabular-nums ${c}`}>{money(v)}{solved>0&&<span className={`ml-1.5 font-normal ${dk?'text-slate-500':'text-slate-400'}`}>{(v/solved*100).toFixed(0)}%</span>}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {series.length>1&&isFinite(peak)&&(
        <div className={`${card} p-5`}>
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <div className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>การเติบโตรายปี</div>
            <div className={`text-[11px] ${dk?'text-slate-500':'text-slate-400'}`}>ชี้ที่กราฟเพื่อดูตัวเลขของแต่ละปี</div>
          </div>
          <div className="h-64"><PlanChart theme={theme} data={{
            labels: series.map(s=>`ปีที่ ${s.y}`),
            put:    series.map(s=>Math.round(s.put)),
            total:  series.map(s=>Math.round(s.total)),
          }}/></div>
        </div>
      )}
    </>
  );
};

const SummaryPage = ({ txs, assets=[], theme }) => {
  const dk = theme === 'dark';
  const [view, setView] = useState('monthly');
  // Split by type, not one total: the plan tab asks which holdings a growth
  // assumption is actually about, and the whole sum is not the answer.
  const planUsdRate = parseFloat(localStorage.getItem('ft-usdrate')||'35');
  // Realized profit, per year — money that actually arrived, kept apart from the
  // paper figure every other screen already shows.
  const realized      = useMemo(()=>realizedByYear(assets, txs, planUsdRate),[assets,txs,planUsdRate]);
  const realizedYears = useMemo(()=>Object.keys(realized).sort().reverse(),[realized]);
  const [rlzYear,setRlzYear] = useState('');
  useEffect(()=>{ if(realizedYears.length && !realizedYears.includes(rlzYear)) setRlzYear(realizedYears[0]); },[realizedYears,rlzYear]);
  const paperPL = useMemo(()=>assets.reduce((s,a)=>{
    const mult = a.currency==='USD' ? planUsdRate : 1;
    return s + ((a.qty||0)*(a.currentPrice||0) - (a.qty||0)*(a.avgCost||0)) * mult;
  },0),[assets,planUsdRate]);
  const assetsByType = useMemo(()=>{
    const m = {};
    assets.forEach(a=>{ m[a.type] = (m[a.type]||0) + assetVal(a,txs,planUsdRate); });
    return m;
  },[assets,txs,planUsdRate]);
  const now = new Date();
  const curM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const lastM = (()=>{ const d=new Date(now.getFullYear(),now.getMonth()-1,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();

  const monthlyData = useMemo(() => {
    const map = {};
    txs.forEach(t => {
      const m = ym(t.date);
      if (!map[m]) map[m] = { income:0, expense:0 };
      if (t.type==='income') map[m].income += t.amount;
      else if (t.type==='expense') map[m].expense += t.amount;
    });
    return Object.entries(map)
      .sort((a,b) => b[0].localeCompare(a[0]))
      .map(([m, v]) => {
        const [yr, mo] = m.split('-');
        const daysInMonth = m===curM ? now.getDate() : new Date(+yr,+mo,0).getDate();
        const avgExp = daysInMonth>0 ? v.expense/daysInMonth : 0;
        return { key:m, label: MONTHS_TH[parseInt(mo)-1] + ' ' + yr, income:v.income, expense:v.expense, balance:v.income-v.expense, rate: v.income>0 ? (v.income-v.expense)/v.income*100 : 0, avgExp, daysInMonth, isCurM: m===curM };
      });
  }, [txs, curM]);

  const yearlyData = useMemo(() => {
    const map = {};
    txs.forEach(t => {
      const y = t.date.substring(0,4);
      if (!map[y]) map[y] = { income:0, expense:0, months:new Set() };
      if (t.type==='income') map[y].income += t.amount;
      else if (t.type==='expense') map[y].expense += t.amount;
      map[y].months.add(ym(t.date));
    });
    return Object.entries(map)
      .sort((a,b) => b[0].localeCompare(a[0]))
      .map(([y, v]) => ({ key:y, label:'ปี '+y, income:v.income, expense:v.expense, balance:v.income-v.expense, rate: v.income>0?(v.income-v.expense)/v.income*100:0, months:v.months.size }));
  }, [txs]);

  const data = view==='monthly' ? monthlyData : yearlyData;
  const totInc = data.reduce((s,d)=>s+d.income,0);
  const totExp = data.reduce((s,d)=>s+d.expense,0);
  const totBal = totInc - totExp;
  const totRate = totInc>0 ? (totBal/totInc*100) : 0;

  // ── Analytics data ──
  const months6=useMemo(()=>{ const ms=[]; for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);ms.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);} return ms; },[]);
  const lineData=useMemo(()=>({ labels:months6.map(m=>{ const[,mo]=m.split('-'); return MONTHS_TH[parseInt(mo)-1]; }), income:months6.map(m=>sumTxMonth(txs,'income',m)), expense:months6.map(m=>sumTxMonth(txs,'expense',m)) }),[txs,months6]);
  const topCats=useMemo(()=>{ const byC={}; const period=view==='yearly'?String(now.getFullYear()):curM; txs.filter(t=>t.type==='expense'&&t.date.startsWith(period)).forEach(t=>{ byC[t.category]=(byC[t.category]||0)+t.amount; }); return Object.entries(byC).sort((a,b)=>b[1]-a[1]); },[txs,curM,view]);
  const topCatsExpTotal = topCats.reduce((s,[,amt])=>s+amt,0);
  const curInc=sumTxMonth(txs,'income',curM), lstInc=sumTxMonth(txs,'income',lastM);
  const curExp=sumTxMonth(txs,'expense',curM), lstExp=sumTxMonth(txs,'expense',lastM);
  const momInc=lstInc>0?((curInc-lstInc)/lstInc*100):0;
  const momExp=lstExp>0?((curExp-lstExp)/lstExp*100):0;

  const [expandedMonths, setExpandedMonths] = useState({});
  const toggleMonth = key => setExpandedMonths(p=>({...p,[key]:!p[key]}));

  const dailyDataMap = useMemo(()=>{
    const map={};
    txs.forEach(t=>{
      const m=ym(t.date);
      if(!map[m]) map[m]={};
      if(!map[m][t.date]) map[m][t.date]={income:0,expense:0};
      if(t.type==='income') map[m][t.date].income+=t.amount;
      else if(t.type==='expense') map[m][t.date].expense+=t.amount;
    });
    const res={};
    Object.entries(map).forEach(([m,days])=>{
      res[m]=Object.entries(days).sort((a,b)=>b[0].localeCompare(a[0])).map(([d,v])=>({date:d,...v}));
    });
    return res;
  },[txs]);

  const fmtDay = dateStr => {
    const [yr,mo,dy]=dateStr.split('-');
    const d=new Date(+yr,+mo-1,+dy);
    const days=['อา','จ','อ','พ','พฤ','ศ','ส'];
    return `${days[d.getDay()]} ${+dy} ${MONTHS_TH[+mo-1]}`;
  };

  // ── Goal tracker / projection / runway ──
  const [goal, setGoal] = useState(()=>parseFloat(localStorage.getItem('ft-goal'))||5000000);
  useEffect(()=>{ localStorage.setItem('ft-goal', String(goal)); },[goal]);
  const nMonths = monthlyData.length || 1;
  const currentSaved = totBal;            // cumulative net savings across all data
  const avgNet = currentSaved / nMonths;  // avg saved per month
  const avgExpMo = totExp / nMonths;      // avg spend per month (for runway)
  const remaining = Math.max(goal - currentSaved, 0);
  const monthsToGoal = avgNet>0 ? remaining/avgNet : Infinity;
  const goalPct = goal>0 ? Math.min(currentSaved/goal*100, 100) : 0;
  const runwayMonths = avgExpMo>0 ? currentSaved/avgExpMo : Infinity;
  const etaDate = isFinite(monthsToGoal) && monthsToGoal>0 ? (()=>{ const d=new Date(); d.setMonth(d.getMonth()+Math.ceil(monthsToGoal)); return d; })() : null;
  const yrMo = m => { if(!isFinite(m)) return '∞'; const y=Math.floor(m/12), mo=Math.round(m%12); return (y?`${y} ปี `:'')+(mo||!y?`${mo} เดือน`:''); };
  // cumulative actual + forecast series for the chart
  const goalChart = useMemo(()=>{
    const asc=[...monthlyData].reverse(); let acc=0;
    const aLabels=asc.map(d=>d.label), aVals=asc.map(d=>{ acc+=d.balance; return acc; });
    const fLabels=[], fVals=[];
    if(isFinite(monthsToGoal) && monthsToGoal>0){
      let c=currentSaved; const start=new Date(); const steps=Math.min(Math.ceil(monthsToGoal),120);
      for(let i=1;i<=steps;i++){ const d=new Date(start.getFullYear(),start.getMonth()+i,1); c+=avgNet; fLabels.push(MONTHS_TH[d.getMonth()]+' '+(d.getFullYear()+543).toString().slice(2)); fVals.push(Math.min(c,goal)); }
    }
    return {
      labels:[...aLabels, ...fLabels],
      actual:[...aVals, ...fLabels.map(()=>null)],
      forecast:[...aVals.map((v,i)=>i===aVals.length-1?v:null), ...fVals],
    };
  },[monthlyData, monthsToGoal, currentSaved, avgNet, goal]);
  // expense category trend across the last 6 months
  const catTrend = useMemo(()=>{
    const cats={};
    txs.filter(t=>t.type==='expense').forEach(t=>{ const m=ym(t.date), c=t.category||'อื่นๆ'; if(!cats[c]) cats[c]={total:0,m:{}}; cats[c].total+=t.amount; cats[c].m[m]=(cats[c].m[m]||0)+t.amount; });
    return Object.entries(cats).sort((a,b)=>b[1].total-a[1].total).slice(0,6).map(([c,v])=>{
      const vals=months6.map(m=>v.m[m]||0); const cur=vals[vals.length-1], prev=vals[vals.length-2]||0;
      const chg=prev>0?((cur-prev)/prev*100):(cur>0?null:0); const mx=Math.max(...vals,1);
      return { cat:c, vals, cur, prev, chg, mx };
    });
  },[txs,months6]);

  // ── Dividends received ──
  const curYear = String(now.getFullYear());
  const divTxs   = useMemo(()=>txs.filter(t=>t.type==='dividend'),[txs]);
  const [divOpen,setDivOpen] = useState(false);   // the per-payment list, folded by default
  const divTotal = useMemo(()=>divTxs.reduce((s,t)=>s+t.amount,0),[divTxs]);
  const divYear  = useMemo(()=>divTxs.filter(t=>t.date.startsWith(curYear)).reduce((s,t)=>s+t.amount,0),[divTxs,curYear]);
  const divByAsset = useMemo(()=>{
    const assetMap={}; assets.forEach(a=>assetMap[a.id]=a.name);
    const m={};
    divTxs.forEach(t=>{
      const name = (t.targetAssetId&&assetMap[t.targetAssetId]) || (t.title||'').replace(/^ปันผล\s*/,'').trim() || 'อื่นๆ';
      if(!m[name]) m[name]={name,amount:0,count:0};
      m[name].amount+=t.amount; m[name].count++;
    });
    return Object.values(m).sort((a,b)=>b.amount-a.amount);
  },[divTxs,assets]);

  const card = `rounded-2xl ${dk?'card-solid':'glass-light shadow-sm'}`;
  // Pinned, with an opaque background: rows scrolling under a translucent
  // header are unreadable, so the tint this used to inherit will not do.
  const th = `sticky top-0 z-10 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${dk?'text-slate-400 bg-[#14140f]':'text-slate-500 bg-[#e8e6e1]'}`;
  const sub = `text-xs ${dk?'text-slate-400':'text-slate-500'}`;
  const RateBadge = ({ r }) => (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${r>=30?'bg-emerald-500/15 text-emerald-400':r>=10?'bg-amber-500/15 text-amber-400':'bg-rose-500/15 text-rose-400'}`}>{r.toFixed(1)}%</span>
  );

  return (
    <div className="space-y-4 fade-up">
      <PageHeader theme={theme} lead="Financial" accent="Summary"
        sub="รายเดือน รายปี และเป้าหมายเงินเก็บ"/>
      {/* Toggle */}
      <div className={`${card} p-4 flex items-center justify-between flex-wrap gap-3`}>
        <div>
          <div className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>{view==='plan'?'ประมาณการผลตอบแทนทบต้น':'สรุปรายรับ-รายจ่าย'}</div>
          <div className={`text-xs mt-0.5 ${dk?'text-slate-400':'text-slate-500'}`}>
            {view==='plan' ? 'คำนวณเพื่อประกอบการวางแผน — ไม่บันทึกและไม่แก้ไขข้อมูลจริง' : `${data.length} ${view==='monthly'?'เดือน':'ปี'} · ${txs.length} รายการทั้งหมด`}
          </div>
        </div>
        {/* The first two tabs look back; this one looks forward — same question,
            other direction, so it belongs beside them rather than in its own page */}
        <div className={`flex rounded-xl p-1 gap-1 ${dk?'bg-white/5':'bg-slate-100'}`}>
          {[['monthly','📅 รายเดือน'],['yearly','📆 รายปี'],['plan','📈 ประมาณการ']].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${view===v?(dk?'bg-gold-500/25 text-gold-200':'bg-gold-500 shadow-sm'):(dk?'text-slate-400 hover:text-white':'text-slate-500')}`}>{l}</button>
          ))}
        </div>
      </div>

      {view==='plan' ? <PlanTab dk={dk} card={card} theme={theme} byType={assetsByType}/> : (<>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'รายรับรวม',   val:totInc, cls:'text-gold-400' },
          { label:'รายจ่ายรวม',  val:totExp, cls:'text-rose-400' },
          { label:'คงเหลือสุทธิ',val:totBal, cls:totBal>=0?'text-emerald-400':'text-rose-400' },
          { label:'อัตราออมเฉลี่ย',val:null, cls:totRate>=20?'text-emerald-400':'text-amber-400', custom:`${totRate.toFixed(1)}%` },
        ].map(({label,val,cls,custom})=>(
          <div key={label} className={`${card} p-5`}>
            <div className={`text-xs font-medium mb-2 uppercase tracking-wide ${dk?'text-slate-400':'text-slate-500'}`}>{label}</div>
            <div className={`text-xl font-bold ${cls}`}>{custom || fmt(val)}</div>
          </div>
        ))}
      </div>

      {/* Dividend summary. Compact: the card was giving two text-2xl figures a
          row each and then a two-line block per asset, which came to roughly the
          height of the P/L card for a total two orders of magnitude smaller. The
          figures now share one line with the heading, and each asset is one row
          with its bar in the middle instead of stacked underneath. */}
      {divTxs.length>0 && (
        <div className={`${card} p-4`}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>💰 เงินปันผลรับ</div>
            <span className={sub}>{divTxs.length} ครั้ง</span>
          </div>
          <div className="flex items-baseline gap-x-5 gap-y-1 flex-wrap mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>รับทั้งหมด</span>
              <span className="text-lg font-bold text-teal-400">+{fmt(divTotal)}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>ปีนี้ ({curYear})</span>
              <span className={`text-sm font-semibold ${dk?'text-slate-300':'text-slate-600'}`}>+{fmt(divYear)}</span>
            </div>
          </div>
          {/* No bars. A bar earns its place when the figures are far apart on
              screen or there are enough rows that the eye has to sweep them —
              here there are two or three, the amounts sit at the end of each
              line, and one holding paying ฿7,927 against another paying ฿60 is
              not a comparison that needs drawing. The bars were saying what the
              numbers beside them had already said. */}
          {divByAsset.length>0 && (
            <div className="mt-3 space-y-1">
              {divByAsset.slice(0,6).map((d,i)=>(
                <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className={`truncate ${dk?'text-slate-300':'text-slate-600'}`}>
                    {d.name}<span className={`ml-1 ${dk?'text-slate-500':'text-slate-400'}`}>×{d.count}</span>
                  </span>
                  <span className="font-semibold text-teal-400 whitespace-nowrap tabular-nums">+{fmt(d.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {/* Every payment, one row each. Folded away by default — the totals are
              what gets read month to month; the individual rows are for the once
              -in-a-while check that a specific payment was recorded. */}
          <button onClick={()=>setDivOpen(o=>!o)}
            className={`w-full mt-3 pt-2.5 border-t flex items-center justify-center gap-1.5 text-xs font-medium transition-colors ${dk?'border-white/10 text-slate-400 hover:text-teal-400':'border-slate-100 text-slate-500 hover:text-teal-600'}`}>
            <span className={`inline-block transition-transform duration-200 ${divOpen?'rotate-90':''}`}>▶</span>
            {divOpen?'ซ่อนรายการ':`ดูรายการทั้งหมด (${divTxs.length})`}
          </button>
          {divOpen && (
            <div className={`mt-2 rounded-xl overflow-hidden ${dk?'bg-white/[0.03]':'bg-slate-50'}`}>
              {[...divTxs].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id).map(t=>{
                const a = assets.find(x=>x.id===t.targetAssetId);
                return (
                  <div key={t.id} className={`flex items-center gap-3 px-3 py-2 border-b last:border-0 ${dk?'border-white/5':'border-slate-100'}`}>
                    <div className={`text-[11px] tabular-nums w-20 flex-shrink-0 ${dk?'text-slate-500':'text-slate-400'}`}>{t.date}</div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs truncate ${dk?'text-slate-200':'text-slate-700'}`}>{t.title||'ปันผล'}</div>
                      {a && <div className={`text-[10px] truncate ${dk?'text-slate-500':'text-slate-400'}`}>💰 {a.name}</div>}
                    </div>
                    <div className="text-xs font-semibold text-teal-400 tabular-nums whitespace-nowrap">+{fmt(t.amount)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className={`${card} overflow-hidden`}>
        {/* Same fix as the assets table: the wrapper must be the scroll
            container, with a height, or the pinned header has nothing to pin
            against. */}
        <div className="overflow-auto" style={{maxHeight:'70vh'}}>
          <table className="w-full">
            <thead>
              <tr className={`border-b ${dk?'border-white/5':'border-slate-100'}`}>
                <th className={th}>{view==='monthly'?'เดือน':'ปี'}</th>
                <th className={`${th} text-right`}>รายรับ</th>
                <th className={`${th} text-right`}>รายจ่าย</th>
                <th className={`${th} text-right`}>คงเหลือ</th>
                <th className={`${th} text-right`}>อัตราออม</th>
                {view==='monthly'&&<th className={`${th} text-right`}>เฉลี่ย/วัน</th>}
                {view==='yearly'&&<th className={`${th} text-right`}>จำนวนเดือน</th>}
              </tr>
            </thead>
            <tbody>
              {data.length===0&&<tr><td colSpan={6} className={`py-12 text-center text-sm ${dk?'text-slate-400':'text-slate-500'}`}>ยังไม่มีข้อมูล</td></tr>}
              {data.map(row=>{
                const isOpen = view==='monthly' && expandedMonths[row.key];
                const days = dailyDataMap[row.key]||[];
                return (
                  <React.Fragment key={row.key}>
                    <tr
                      onClick={()=>view==='monthly'&&toggleMonth(row.key)}
                      className={`border-b transition-colors ${view==='monthly'?'cursor-pointer':''} ${dk?'border-white/5 hover:bg-white/5':'border-slate-100 hover:bg-slate-50'}`}
                    >
                      <td className={`px-4 py-4 text-sm font-medium ${dk?'text-white':'text-slate-700'}`}>
                        <div className="flex items-center gap-2">
                          {view==='monthly'&&(
                            <span className={`text-[10px] transition-transform duration-200 ${isOpen?'rotate-90':''} ${dk?'text-slate-400':'text-slate-500'}`}>▶</span>
                          )}
                          {row.label}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-right text-gold-400 font-medium">+{fmt(row.income)}</td>
                      <td className="px-4 py-4 text-sm text-right text-rose-400 font-medium">-{fmt(row.expense)}</td>
                      {/* fmtSigned, not fmt: a month that only spent money nets negative,
                          and fmt() drops the sign — leaving ฿95,908 in a column headed
                          คงเหลือ, which reads as money left over rather than money gone. */}
                      <td className={`px-4 py-4 text-sm text-right font-semibold ${row.balance>=0?'text-emerald-400':'text-rose-400'}`}>{row.balance>=0?'+':''}{fmtSigned(row.balance)}</td>
                      <td className="px-4 py-4 text-right"><RateBadge r={row.rate}/></td>
                      {view==='monthly'&&(
                        <td className={`px-4 py-4 text-sm text-right ${dk?'text-slate-400':'text-slate-500'}`}>
                          <span className={`font-medium ${dk?'text-amber-400':'text-amber-500'}`}>{fmt(row.avgExp)}</span>
                          <span className={`text-[10px] ml-1 ${dk?'text-slate-500':'text-slate-400'}`}>/วัน</span>
                        </td>
                      )}
                      {view==='yearly'&&<td className={`px-4 py-4 text-sm text-right ${dk?'text-slate-400':'text-slate-500'}`}>{row.months} เดือน</td>}
                    </tr>
                    {isOpen && days.map(day=>(
                      <tr key={day.date} className={`border-b ${dk?'border-white/5 bg-white/[0.02]':'border-slate-100 bg-slate-50/60'}`}>
                        <td className={`pl-10 pr-4 py-2 text-xs ${dk?'text-slate-400':'text-slate-500'}`}>{fmtDay(day.date)}</td>
                        <td className={`px-4 py-2 text-xs text-right ${day.income>0?'text-gold-400':dk?'text-slate-600':'text-slate-300'}`}>{day.income>0?'+'+fmt(day.income):'—'}</td>
                        <td className={`px-4 py-2 text-xs text-right ${day.expense>0?'text-rose-400':dk?'text-slate-600':'text-slate-300'}`}>{day.expense>0?'-'+fmt(day.expense):'—'}</td>
                        <td className={`px-4 py-2 text-xs text-right font-medium ${(day.income-day.expense)>=0?'text-emerald-400':'text-rose-400'}`}>{(day.income-day.expense)>=0?'+':''}{fmtSigned(day.income-day.expense)}</td>
                        <td/><td/>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            {data.length>1&&(
              <tfoot>
                <tr className={`border-t-2 font-bold ${dk?'border-white/10 bg-white/5':'border-slate-200 bg-slate-50'}`}>
                  <td className={`px-4 py-4 text-sm ${dk?'text-white':'text-slate-800'}`}>รวมทั้งหมด</td>
                  <td className="px-4 py-4 text-sm text-right text-gold-400">+{fmt(totInc)}</td>
                  <td className="px-4 py-4 text-sm text-right text-rose-400">-{fmt(totExp)}</td>
                  <td className={`px-4 py-4 text-sm text-right ${totBal>=0?'text-emerald-400':'text-rose-400'}`}>{totBal>=0?'+':''}{fmtSigned(totBal)}</td>
                  <td className="px-4 py-4 text-right"><RateBadge r={totRate}/></td>
                  {view==='monthly'&&<td/>}
                  {view==='yearly'&&<td/>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Realized profit — yearly view only, since that is the period it is
          counted in. Every sale already recorded what it made and it had never
          been added up anywhere; the paper figure beside it is the one every
          other screen shows, and keeping them apart is the whole point. */}
      {view==='yearly' && realizedYears.length>0 && (
        <div className={`${card} p-5`}>
          <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
            <h3 className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>💰 กำไรที่รับรู้แล้ว</h3>
            <div className={`flex rounded-lg p-0.5 gap-0.5 ${dk?'bg-white/5':'bg-slate-100'}`}>
              {realizedYears.map(y=>(
                <button key={y} onClick={()=>setRlzYear(y)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${rlzYear===y?(dk?'bg-gold-500/25 text-gold-200':'bg-gold-500'):(dk?'text-slate-400 hover:text-white':'text-slate-500')}`}>{y}</button>
              ))}
            </div>
          </div>
          {(()=>{ const b = realized[rlzYear] || {sales:[],dividends:[],salesTotal:0,divTotal:0,total:0};
            const Row = ({label,sub2,amount}) => (
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <span className={`text-xs ${dk?'text-slate-300':'text-slate-600'}`}>{label}</span>
                  {sub2&&<span className={`text-[10px] ml-1.5 ${dk?'text-slate-500':'text-slate-400'}`}>{sub2}</span>}
                </div>
                <span className={`text-xs font-semibold tabular-nums flex-shrink-0 ${amount>=0?'text-emerald-400':'text-rose-400'}`}>{amount>=0?'+':''}{fmtSigned(amount)}</span>
              </div>
            );
            return (<>
              {b.sales.length>0&&(<div className="mb-3">
                <div className={`text-[11px] font-semibold mb-1 ${dk?'text-slate-400':'text-slate-500'}`}>จากการขาย</div>
                {b.sales.map(s=><Row key={s.id} label={s.name} sub2={`${s.date} · ${fmtQty(s.qty)}`} amount={s.amount}/>)}
              </div>)}
              {b.dividends.length>0&&(<div className="mb-3">
                <div className={`text-[11px] font-semibold mb-1 ${dk?'text-slate-400':'text-slate-500'}`}>จากปันผล</div>
                {b.dividends.map(d=><Row key={d.id} label={d.name} sub2={d.date} amount={d.amount}/>)}
              </div>)}
              <div className={`flex items-baseline justify-between gap-3 pt-2.5 border-t ${dk?'border-white/8':'border-slate-100'}`}>
                <span className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>รวมเงินจริงที่ได้ปี {rlzYear}</span>
                <span className={`text-lg font-bold tabular-nums ${b.total>=0?'text-emerald-400':'text-rose-400'}`}>{b.total>=0?'+':''}{fmtSigned(b.total)}</span>
              </div>
              <div className={`flex items-baseline justify-between gap-3 mt-2 pt-2 border-t ${dk?'border-white/8':'border-slate-100'}`}>
                <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>กำไรบนกระดาษ (ยังไม่ขาย)</span>
                <span className={`text-sm font-semibold tabular-nums ${paperPL>=0?'text-emerald-400/70':'text-rose-400/70'}`}>{paperPL>=0?'+':''}{fmtSigned(paperPL)}</span>
              </div>
              <p className={`text-[10px] mt-2.5 ${dk?'text-slate-500':'text-slate-400'}`}>
                นับตามวันที่บันทึกรายการขาย · สินทรัพย์สกุลดอลลาร์แปลงด้วยเรทวันนี้ เพราะไม่ได้เก็บเรท ณ วันขายไว้
              </p>
            </>);
          })()}
        </div>
      )}

      {/* ── Analytics section ── */}
      <div className={`px-1 pt-2 pb-1`}>
        <div className={`text-xs font-semibold uppercase tracking-widest ${dk?'text-slate-400':'text-slate-500'}`}>วิเคราะห์</div>
      </div>

      {/* MoM, on one slim row rather than two full cards. A salary does not move
          month to month, so รายรับ MoM read 0.0% every time it was looked at —
          two large cards for one figure that changes and one that never does. */}
      <div className={`${card} px-5 py-3 flex items-center gap-6 flex-wrap`}>
        {[{label:'รายรับ MoM',val:curInc,mom:momInc,good:true},{label:'รายจ่าย MoM',val:curExp,mom:momExp,good:false}].map(({label,val,mom,good})=>(
          <div key={label} className="flex items-baseline gap-2 min-w-0">
            <span className={`text-[11px] flex-shrink-0 ${dk?'text-slate-500':'text-slate-400'}`}>{label}</span>
            <span className={`text-sm font-bold tabular-nums ${dk?'text-slate-200':'text-slate-700'}`}>{fmt(val)}</span>
            <span className={`text-[11px] font-medium flex items-center gap-0.5 flex-shrink-0 ${mom===0?(dk?'text-slate-600':'text-slate-400'):(mom>0)===good?'text-emerald-400':'text-rose-400'}`}>
              {mom!==0&&<Ic n={mom>=0?'up':'down'} s={9}/>}{Math.abs(mom).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Top spending categories */}
      <div className={`${card} p-5`}>
        <h3 className={`text-sm font-semibold mb-4 ${dk?'text-white':'text-slate-700'}`}>หมวดจ่ายทั้งหมด ({view==='yearly'?'ปีนี้':'เดือนนี้'})</h3>
        {topCats.length===0
          ? <div className={`text-sm ${sub}`}>ยังไม่มีรายจ่าย{view==='yearly'?'ปีนี้':'เดือนนี้'}</div>
          : <>
              {/* หลอดรวมเดียว — สัดส่วนทุกหมวดในแท่งเดียว เหมือนการ์ด Net Worth */}
              <div className={`flex h-3 w-full overflow-hidden rounded-full mb-4 ${dk?'bg-white/8':'bg-slate-200'}`}>
                {topCats.map(([cat,amt])=>{
                  const pct = topCatsExpTotal>0 ? (amt/topCatsExpTotal*100) : 0;
                  return <div key={cat} className="h-full transition-all duration-700" style={{width:`${pct}%`,background:catClr(cat)}} title={`${cat} ${pct.toFixed(1)}%`}/>;
                })}
              </div>
              <div className="space-y-2.5">
                {topCats.map(([cat,amt])=>{
                  const pct = topCatsExpTotal>0 ? (amt/topCatsExpTotal*100) : 0;
                  return (
                    <div key={cat} className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{background:catClr(cat)}}/>
                        <span className={`text-sm font-medium truncate ${dk?'text-slate-300':'text-slate-600'}`}>{cat}</span>
                        <span className={`text-sm font-semibold whitespace-nowrap ${dk?'text-white':'text-slate-700'}`}>{fmt(amt)}</span>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{background:catClr(cat)+'28',color:catClr(cat)}}>{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </>
        }
      </div>

      {/* 🎯 Goal Tracker + projection */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <div className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>🎯 เป้าหมายเงินเก็บ</div>
            <div className={sub}>เก็บได้ {fmt(currentSaved)} จาก {fmt(goal)}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={sub}>เป้า ฿</span>
            <input type="text" inputMode="numeric" value={goal.toLocaleString('en-US')} onChange={e=>setGoal(parseFloat(e.target.value.replace(/[^\d]/g,''))||0)}
              className={`w-36 px-2.5 py-1.5 rounded-lg border text-sm text-right outline-none ${dk?'bg-white/5 border-white/10 text-white focus:border-emerald-500':'bg-slate-50 border-slate-200 text-slate-700 focus:border-emerald-400'}`}/>
          </div>
        </div>
        <div className={`h-2.5 rounded-full overflow-hidden ${dk?'bg-white/10':'bg-slate-100'}`}>
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{width:`${goalPct}%`}}/>
        </div>
        <div className="flex justify-between mt-1.5 text-xs">
          <span className="text-emerald-400 font-semibold">{goalPct.toFixed(1)}%</span>
          <span className={sub}>เหลืออีก {fmt(remaining)}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[['เก็บเฉลี่ย/เดือน', fmt(avgNet)],['อีกประมาณ', isFinite(monthsToGoal)?yrMo(monthsToGoal):'—'],['คาดถึงเป้า', etaDate?`${MONTHS_TH[etaDate.getMonth()]} ${(etaDate.getFullYear()+543).toString().slice(2)}`:'—']].map(([l,v])=>(
            <div key={l} className={`rounded-xl p-3 ${dk?'bg-white/5':'bg-slate-50'}`}>
              <div className={`text-[10px] uppercase tracking-wide ${dk?'text-slate-500':'text-slate-400'}`}>{l}</div>
              <div className={`text-sm font-bold mt-0.5 ${dk?'text-white':'text-slate-800'}`}>{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-4" style={{height:'210px'}}>
          <GoalChart labels={goalChart.labels} actual={goalChart.actual} forecast={goalChart.forecast} goal={goal} theme={theme}/>
        </div>
      </div>

      {/* 💧 Runway */}
      <div className={`${card} p-5 flex items-center justify-between flex-wrap gap-3`}>
        <div>
          <div className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>💧 เงินสำรอง (Runway)</div>
          <div className={sub}>ถ้าหยุดมีรายได้ เงินเก็บปัจจุบันอยู่ได้นานแค่ไหน</div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${runwayMonths>=12?'text-emerald-400':runwayMonths>=6?'text-amber-400':'text-rose-400'}`}>{yrMo(runwayMonths)}</div>
          <div className={sub}>รายจ่ายเฉลี่ย {fmt(avgExpMo)}/เดือน</div>
        </div>
      </div>

      {/* 📊 Category trend (last 6 months) */}
      {catTrend.length>0&&(
        <div className={`${card} p-5`}>
          <div className={`text-sm font-semibold mb-3 ${dk?'text-white':'text-slate-700'}`}>📊 เทรนด์หมวดรายจ่าย <span className={sub}>(6 เดือนล่าสุด)</span></div>
          <div className="space-y-2.5">
            {catTrend.map(({cat,vals,cur,chg,mx})=>(
              <div key={cat} className="flex items-center gap-3">
                <div className="w-24 flex-shrink-0 flex items-center gap-1.5 min-w-0">
                  <CatGlyph v={catIcon(cat)} s={16} color={catClr(cat)}/>
                  <span className={`text-xs truncate ${dk?'text-slate-300':'text-slate-600'}`}>{cat}</span>
                </div>
                <div className="flex-1 flex items-end gap-0.5 h-8">
                  {vals.map((v,i)=>(
                    <div key={i} className={`flex-1 rounded-sm transition-all ${i===vals.length-1?'':'opacity-50'}`}
                      style={{height:`${Math.max(v/mx*100,3)}%`, background:catClr(cat), minHeight:'2px'}} title={fmt(v)}/>
                  ))}
                </div>
                <div className="w-28 flex-shrink-0 text-right">
                  <div className={`text-xs font-semibold ${dk?'text-slate-200':'text-slate-700'}`}>{fmt(cur)}</div>
                  {chg!==null&&chg!==0&&<div className={`text-[10px] ${chg>0?'text-rose-400':'text-emerald-400'}`}>{chg>0?'▲':'▼'}{Math.abs(chg).toFixed(0)}% จากเดือนก่อน</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Line chart */}
      <div className={`${card} p-5`}>
        <h3 className={`text-sm font-semibold mb-4 ${dk?'text-white':'text-slate-700'}`}>แนวโน้ม 6 เดือน</h3>
        <div className="h-64"><LineChart data={lineData} theme={theme}/></div>
      </div>
      </>)}
    </div>
  );
};

// ── TOAST ──────────────────────────────────────────────────
const Toast = ({toasts, remove, cancelUndo}) => (
  <div className="fixed top-[70px] left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none w-full max-w-md px-4">
    {toasts.map(t=>(
      t.type==='undo'
        ? <div key={t.id} className="relative overflow-hidden flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-semibold toast-drop pointer-events-auto w-full max-w-sm bg-[#0c1018] border border-amber-500/40 text-slate-100">
            <span className="flex-1 truncate">{t.msg}</span>
            <button onClick={()=>cancelUndo(t.id)} className="text-amber-400 hover:text-amber-300 font-semibold text-xs whitespace-nowrap px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors flex-shrink-0">ยกเลิก</button>
            <div className="absolute bottom-0 left-0 h-[2px] bg-amber-400/60 undo-bar rounded-full"/>
          </div>
        : <div key={t.id} className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm md:text-[15px] font-semibold toast-drop pointer-events-auto w-full ${t.type==='warn'?'bg-amber-500':t.type==='err'?'bg-rose-500':'bg-emerald-500'} text-white`}>
            <span className="flex-1">{t.msg}</span>
            <button onClick={()=>remove(t.id)} className="opacity-70 hover:opacity-100 flex-shrink-0"><Ic n="x" s={14}/></button>
          </div>
    ))}
  </div>
);

// ── BUDGET PAGE ─────────────────────────────────────────────
const BudgetPage = ({txs, theme, onEdit, onRenameCategory}) => {
  const dk = theme==='dark';
  const now = new Date();
  const curM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const shiftMonth = (ym, delta) => { const [y,m] = ym.split('-').map(Number); const d = new Date(y, m-1+delta, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const [viewM, setViewM] = useState(curM);
  const isCurM = viewM === curM;
  const prevM = shiftMonth(viewM, -1);

  // Only seed BUDGET_DEFAULTS on the very first run (nothing saved yet) — once the user has any saved budgets,
  // that object is authoritative, so a deleted default category never gets silently backfilled again.
  const [budgets, setBudgets] = useState(()=>{try{const s=JSON.parse(localStorage.getItem('ft-budgets')||'null');return s || {...BUDGET_DEFAULTS};}catch{return {...BUDGET_DEFAULTS};}});
  const budgetsMounted = useRef(false);
  useEffect(()=>{
    localStorage.setItem('ft-budgets',JSON.stringify(budgets));
    localStorage.setItem('ft-expense-cats',JSON.stringify(Object.keys(budgets).filter(k=>!['ที่พัก','สาธารณูปโภค'].includes(k))));
    // Skip the very first run (page load / remount) — dispatching here unconditionally means just OPENING the
    // Budget page starts an upload race before this device's first cloud download has a chance to land. On a
    // second device with different/stale local budgets, that phantom "sync" would upload garbage before the
    // real cloud data ever gets pulled down, since budgets sync is local-authoritative (see uploadNow).
    if (!budgetsMounted.current) { budgetsMounted.current = true; return; }
    window.dispatchEvent(new Event('ft-sync'));
  },[budgets]);
  // Save per-month budget history for "copy from last month" feature
  useEffect(()=>{
    try{
      const h=JSON.parse(localStorage.getItem('ft-budget-history')||'{}');
      h[curM]=budgets;
      localStorage.setItem('ft-budget-history',JSON.stringify(h));
    }catch{}
  },[budgets,curM]);

  // Which categories are "irregular" (ไม่ประจำ — big one-time-ish spends like a car repair, not
  // daily-ish like food/water/transport). Stored the same shape+sync pattern as budgets: a plain
  // {catName: true} map, local-authoritative, synced via uploadNow/download exactly like budgets.
  // "อื่นๆ" is the bucket for whatever did not fit a category, which is the
  // definition of an irregular expense — filing it under ประจำ by default makes
  // the daily figure include money that was never going to arrive daily. Only a
  // starting position: the per-category toggle still decides, and an install
  // that has already chosen keeps its own answer.
  const [irregularCats, setIrregularCats] = useState(()=>{try{return JSON.parse(localStorage.getItem('ft-cat-irregular')||'null')||{'อื่นๆ':true};}catch{return {'อื่นๆ':true};}});
  const irregularMounted = useRef(false);
  useEffect(()=>{
    localStorage.setItem('ft-cat-irregular', JSON.stringify(irregularCats));
    if (!irregularMounted.current) { irregularMounted.current = true; return; }
    window.dispatchEvent(new Event('ft-sync'));
  },[irregularCats]);
  const isIrregular = (cat) => !!irregularCats[cat];
  const setIrregular = (cat) => setIrregularCats(m => { const nm={...m}; if(nm[cat]) delete nm[cat]; else nm[cat]=true; return nm; });

  const [editing, setEditing] = useState(null);
  const [expandedCat, setExpandedCat] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAmt, setNewAmt] = useState('');
  const [newIcon, setNewIcon] = useState('📌');
  const [newClr, setNewClr] = useState(CAT_PALETTE[0]);
  const [newIrregular, setNewIrregular] = useState(false);
  const [renamingCat, setRenamingCat] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [confirmEl, askConfirm] = useConfirm(dk);

  const resetAdd = () => { setNewName(''); setNewAmt(''); setNewIcon('📌'); setNewClr(CAT_PALETTE[0]); setNewIrregular(false); setAddOpen(false); };

  const addCat = () => {
    const n = newName.trim();
    const a = parseFloat(newAmt) || 0;
    if (!n || budgets[n] !== undefined) return;
    setCatMeta(n, {icon:newIcon, clr:newClr});
    setBudgets(b => ({...b, [n]: a}));
    if (newIrregular) setIrregularCats(m => ({...m, [n]: true}));
    resetAdd();
  };

  // Asks first. This button sits between two others on a small card and moves
  // the category to a different section of the page the instant it is pressed —
  // so a misclick did not just do the wrong thing, it made the card vanish from
  // where the eye was looking, which reads as having deleted something. The
  // action is trivially reversible; being unable to tell what happened is not.
  const toggleIrregular = (cat) => {
    const toIrregular = !isIrregular(cat);
    askConfirm(
      toIrregular ? 'ย้ายไปหมวดไม่ประจำ?' : 'ย้ายกลับไปหมวดประจำ?',
      toIrregular
        ? `ย้าย "${cat}" ไปกลุ่ม "ไม่ประจำ (นานๆ ที)" ใช่ไหมคะ?\nยอดที่บันทึกไว้ไม่เปลี่ยน เปลี่ยนแค่กลุ่มที่แสดงผลค่ะ`
        : `ย้าย "${cat}" กลับไปกลุ่ม "ประจำ (รายวัน)" ใช่ไหมคะ?\nยอดที่บันทึกไว้ไม่เปลี่ยน เปลี่ยนแค่กลุ่มที่แสดงผลค่ะ`,
      () => setIrregular(cat)
    );
  };

  const deleteCat = (cat) => {
    askConfirm('ลบหมวดนี้?', `ต้องการลบหมวด "${cat}" ออกจาก Budget ใช่ไหมคะ? (รายการที่บันทึกไว้ในหมวดนี้จะยังอยู่)`, () => {
      delCatMeta(cat);
      setBudgets(b => { const nb = {...b}; delete nb[cat]; return nb; });
      if (expandedCat === cat) setExpandedCat(null);
    });
  };

  // Rename this category inside every archived monthly budget snapshot, so browsing back to a past
  // month (◀) shows the current name too, instead of whatever it was called back then.
  const renameCatInHistory = (oldName, n) => {
    try {
      const h = JSON.parse(localStorage.getItem('ft-budget-history')||'{}');
      let changed = false;
      Object.keys(h).forEach(month => {
        if (h[month] && h[month][oldName] !== undefined && h[month][n] === undefined) {
          const nb = {}; Object.entries(h[month]).forEach(([k,v])=>{ nb[k===oldName?n:k]=v; });
          h[month] = nb; changed = true;
        }
      });
      if (changed) localStorage.setItem('ft-budget-history', JSON.stringify(h));
    } catch {}
  };

  const renameCat = (oldName) => {
    const n = renameVal.trim();
    if (!n || n === oldName) { setRenamingCat(null); return; }
    if (budgets[n] !== undefined) { setRenamingCat(null); return; }
    // every localStorage store that keys on the name — icon/color, monthly
    // history, recurring templates, import memory, ประจำ/ไม่ประจำ flag
    renameCatInStores(oldName, n);
    setBudgets(b => { const nb = {}; Object.entries(b).forEach(([k,v]) => { nb[k===oldName?n:k] = v; }); return nb; });
    // held in React state as well, so rename the live copy too or the effect
    // that persists it writes the old key straight back
    setIrregularCats(m => { const nm = {}; Object.entries(m).forEach(([k,v]) => { nm[k===oldName?n:k] = v; }); return nm; });
    onRenameCategory && onRenameCategory(oldName, n);
    if (expandedCat === oldName) setExpandedCat(n);
    setRenamingCat(null);
  };

  // One-time repair for categories renamed earlier today, before renameCatInHistory existed —
  // their July snapshot still shows the pre-rename Thai name. Runs silently once on load, no button needed.
  useEffect(()=>{
    try{ if(localStorage.getItem('ft-budget-history-fixed-v1')==='1') return; }catch{}
    const OLD_TO_NEW_PAIRS = [
      ['บันเทิง','Entertainment /Trip'],
      ['การศึกษา','Education'],
      ['สุขภาพ','Health'],
      ['การเดินทาง','Transport'],
      ['ช้อปปิ้ง','Shopping'],
      ['อินเตอร์เน็ต/โทรศัพท์','Internat / Phone Bills'],
    ];
    OLD_TO_NEW_PAIRS.forEach(([oldName,n])=>renameCatInHistory(oldName,n));
    try{ localStorage.setItem('ft-budget-history-fixed-v1','1'); }catch{}
  },[]);


  // Budget snapshot for whichever month is being viewed — live+editable for the current month, read-only history otherwise
  const viewBudgets = useMemo(()=>{
    if (isCurM) return budgets;
    try{ const h=JSON.parse(localStorage.getItem('ft-budget-history')||'{}'); return h[viewM] || null; }
    catch{ return null; }
  },[isCurM,budgets,viewM]);

  const spent = useMemo(()=>{
    const m={};
    txs.filter(t=>t.type==='expense'&&t.date.startsWith(viewM)).forEach(t=>{m[t.category]=(m[t.category]||0)+t.amount;});
    return m;
  },[txs,viewM]);

  const catTxs = useMemo(()=>{
    if(!expandedCat) return [];
    return txs.filter(t=>t.type==='expense'&&t.date.startsWith(viewM)&&t.category===expandedCat)
              .sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
  },[txs,viewM,expandedCat]);

  // Investment contributions move money into an asset, they aren't consumption — exclude from "real" spending totals.
  // This governs the OVERALL month totals (Budget รวม/ใช้ไปแล้ว/คงเหลือ), so it stays consistent with the sum of
  // the category cards below (regular + irregular together).
  const NON_SPEND_CATS = ['ลงทุน/ปันผล'];
  const isRealSpend = t => !NON_SPEND_CATS.includes(t.category);
  // Daily-specific views (ใช้จ่ายวันนี้/รายจ่ายรายวัน) additionally exclude "irregular" (ไม่ประจำ) categories —
  // a once-in-a-while car repair shouldn't make the daily spending pattern look like a blown budget. This does NOT
  // touch totBudget/totSpent above, so those still equal the full regular+irregular total shown in the cards.
  const isDailyRelevant = t => isRealSpend(t) && !isIrregular(t.category);

  // One total over two kinds of money — the rent that arrives every month and
  // the repair that may not happen at all. Both parts and the total come out of
  // one pass so the caption cannot end up disagreeing with the figure above it.
  const bSplit    = splitBudget(viewBudgets, isIrregular, NON_SPEND_CATS);
  const totBudget = bSplit.total;
  const totSpent  = txs.filter(t=>t.type==='expense'&&t.date.startsWith(viewM)&&isRealSpend(t)).reduce((s,t)=>s+t.amount,0);
  // what the line above leaves out — exactly the gap against the Transactions page total
  const nonSpendTotal = txs.filter(t=>t.type==='expense'&&t.date.startsWith(viewM)&&!isRealSpend(t)).reduce((s,t)=>s+t.amount,0);
  const totPct    = totBudget>0?Math.min(totSpent/totBudget*100,150):0;
  const irregularSpentTotal = Object.keys(spent).filter(cat=>isIrregular(cat)).reduce((s,cat)=>s+spent[cat],0);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const daysPassed  = now.getDate();
  const daysLeft    = daysInMonth - daysPassed + 1;
  const dailyAllowance = daysLeft>0 ? (totBudget-totSpent)/daysLeft : 0;

  const [dayExpOpen, setDayExpOpen] = useState(false);
  const todayStr    = today();
  const todayTxs    = useMemo(()=>txs.filter(t=>t.type==='expense'&&t.date===todayStr&&isDailyRelevant(t)),[txs,todayStr]);
  const todaySpent  = todayTxs.reduce((s,t)=>s+t.amount,0);
  const dailyBreakdown = useMemo(()=>{
    const m={};
    txs.filter(t=>t.type==='expense'&&t.date.startsWith(viewM)&&isDailyRelevant(t)).forEach(t=>{m[t.date]=(m[t.date]||0)+t.amount;});
    return Object.entries(m).sort(([da],[db])=>db.localeCompare(da)).map(([date,amt])=>({date,amt}));
  },[txs,viewM]);

  const prevSpent = useMemo(()=>{
    const m={};
    txs.filter(t=>t.type==='expense'&&t.date.startsWith(prevM)).forEach(t=>{m[t.category]=(m[t.category]||0)+t.amount;});
    return m;
  },[txs,prevM]);

  const card = `rounded-2xl ${dk?'card-solid':'glass-light shadow-sm'}`;
  const sub  = `text-xs ${dk?'text-slate-400':'text-slate-500'}`;

  return (
    <div className="space-y-4 fade-up">
      <PageHeader theme={theme} lead="Monthly" accent="Budget"
        sub="วงเงินรายหมวด ยอดใช้จ่าย และส่วนที่เหลือ"
        right={isCurM
          ? <button onClick={()=>setAddOpen(true)}
              className="flex items-center gap-1 text-xs px-4 py-2 rounded-full bg-orange-400 hover:bg-orange-300 text-orange-950 font-semibold transition-colors">
              + เพิ่มหมวด
            </button>
          : <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${dk?'bg-white/8 text-slate-400':'bg-slate-100 text-slate-500'}`}>ดูย้อนหลัง · แก้ไขไม่ได้</span>}/>
      <div className="grid grid-cols-3 gap-4">
        {[{l:'Budget รวม',v:fmt(totBudget),c:dk?'tg-gold':'text-gold-600',
           note: bSplit.irregular>0 ? `ประจำ ${fmt(bSplit.regular)} · ไม่ประจำ ${fmt(bSplit.irregular)}` : null},
          // money moved into investments is excluded on purpose — it is still yours.
          // Say so, or this total silently disagrees with the one on Transactions
          // and there is no way to tell which is wrong.
          {l:'ใช้ไปแล้ว',v:fmt(totSpent),c:totSpent>totBudget?'text-rose-400':'text-emerald-400',
           note: nonSpendTotal>0 ? `ไม่รวมลงทุน ${fmt(nonSpendTotal)}` : null},
          {l:'คงเหลือ',v:fmt(Math.max(totBudget-totSpent,0)),c:'text-gold-400'}].map(({l,v,c,note})=>(
          <div key={l} className={`${card} p-5`}>
            <div className={`text-xs font-medium mb-2 uppercase tracking-wide ${dk?'text-slate-400':'text-slate-500'}`}>{l}</div>
            <div className={`text-lg sm:text-xl font-bold leading-tight break-words ${c}`}>{v}</div>
            {note&&<div className={`text-[10px] mt-1 ${dk?'text-slate-500':'text-slate-400'}`}>{note}</div>}
          </div>))}
      </div>
      {/* Insight row — today-relative, only meaningful for the current month */}
      {isCurM&&(
      <div className="grid grid-cols-3 gap-4">
        <div className={`${card} p-5`}>
          <div className={`text-xs font-medium mb-2 uppercase tracking-wide ${dk?'text-slate-400':'text-slate-500'}`}>ใช้ได้อีก/วัน</div>
          <div className={`text-lg sm:text-xl font-bold leading-tight break-words ${dailyAllowance>=0?'text-emerald-400':'text-rose-400'}`}>{fmt(Math.max(dailyAllowance,0))}</div>
          <div className={`text-xs mt-1 ${sub}`}>เหลืออีก {daysLeft} วัน (จาก {daysInMonth} วัน)</div>
        </div>
        <div className={`${card} p-5`}>
          <div className={`text-xs font-medium mb-2 uppercase tracking-wide ${dk?'text-slate-400':'text-slate-500'}`}>📦 รวมรายจ่ายไม่ประจำ</div>
          <div className={`text-lg sm:text-xl font-bold leading-tight break-words ${dk?'text-white':'text-slate-800'}`}>{fmt(irregularSpentTotal)}</div>
          <div className={`text-xs mt-1 ${sub}`}>เดือนนี้</div>
        </div>
        <div className={`${card} p-5`}>
          <div className={`text-xs font-medium mb-2 uppercase tracking-wide ${dk?'text-slate-400':'text-slate-500'}`}>ใช้จ่ายวันนี้</div>
          <div className={`text-lg sm:text-xl font-bold leading-tight break-words text-rose-400`}>{fmt(todaySpent)}</div>
          <div className={`text-xs mt-1 ${sub}`}>{todayTxs.length>0?`${todayTxs.length} รายการ`:'ยังไม่มีรายจ่ายวันนี้'}</div>
        </div>
      </div>
      )}

      <div className={`${card} p-5`}>
        <button onClick={()=>setDayExpOpen(o=>!o)} className="w-full flex items-center justify-between text-left">
          <div>
            <h3 className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>รายจ่ายรายวัน ({isCurM?'เดือนนี้':`${MONTHS_TH[parseInt(viewM.split('-')[1])-1]} ${viewM.split('-')[0]}`})</h3>
            <p className={`text-xs mt-0.5 ${sub}`}>{isCurM?`วันนี้ใช้ไป ${fmt(todaySpent)}${todayTxs.length>0?` · ${todayTxs.length} รายการ`:''}`:`รวมทั้งเดือน ${fmt(totSpent)}`}</p>
          </div>
          <Ic n="chevD" s={14} cls={`transition-transform duration-200 flex-shrink-0 ${dayExpOpen?'rotate-180':''} ${dk?'text-slate-500':'text-slate-400'}`}/>
        </button>
        {dayExpOpen&&(
          <div className={`mt-4 pt-4 border-t ${dk?'border-white/8':'border-slate-100'}`}>
            {dailyBreakdown.length===0
              ? <p className={`text-xs text-center py-4 ${sub}`}>ยังไม่มีรายจ่ายเดือนนี้ค่ะ</p>
              : <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {dailyBreakdown.map(({date,amt})=>{
                    const d=new Date(date); const isToday=date===todayStr;
                    return (
                      <div key={date} className={`flex items-center justify-between px-2 py-1.5 rounded-lg ${isToday?(dk?'bg-gold-500/10':'bg-gold-50'):''}`}>
                        <span className={`text-xs ${isToday?'font-semibold':''} ${dk?'text-slate-300':'text-slate-600'}`}>{d.getDate()} {MONTHS_TH[d.getMonth()]}{isToday?' · วันนี้':''}</span>
                        <span className={`text-xs font-semibold tabular-nums ${dk?'text-white':'text-slate-700'}`}>{fmt(amt)}</span>
                      </div>
                    );
                  })}
                </div>
            }
            <div className={`flex items-center justify-between mt-3 pt-3 border-t ${dk?'border-white/8':'border-slate-100'}`}>
              <span className={`text-xs font-semibold ${dk?'text-slate-300':'text-slate-600'}`}>รวมเดือนนี้</span>
              <span className={`text-sm font-bold tabular-nums ${dk?'text-white':'text-slate-800'}`}>{fmt(totSpent)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Month overview bar — moved here, right above the category grid it governs */}
      <div className={`${card} p-5`}>
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <button onClick={()=>setViewM(m=>shiftMonth(m,-1))} title="เดือนก่อนหน้า"
              className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${dk?'border-white/15 text-slate-300 hover:bg-gold-500/15 hover:text-gold-300 hover:border-gold-400/50':'border-slate-200 text-slate-600 hover:bg-gold-50 hover:text-gold-600 hover:border-gold-300'}`}><Ic n="chevL" s={16}/></button>
            <h3 className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>ภาพรวม{isCurM?'เดือนนี้':''} — {MONTHS_TH[parseInt(viewM.split('-')[1])-1]} {viewM.split('-')[0]}</h3>
            <button onClick={()=>!isCurM&&setViewM(m=>shiftMonth(m,1))} disabled={isCurM} title="เดือนถัดไป"
              className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${isCurM?'opacity-25 cursor-default border-transparent':(dk?'border-white/15 text-slate-300 hover:bg-gold-500/15 hover:text-gold-300 hover:border-gold-400/50':'border-slate-200 text-slate-600 hover:bg-gold-50 hover:text-gold-600 hover:border-gold-300')}`}><Ic n="chevR" s={16}/></button>
          </div>
          <span className="text-xs font-semibold" style={{color:totPct>=100?'#d4574a':totPct>=80?'#d4af45':'#7aab8a'}}>{totPct.toFixed(1)}%</span>
        </div>
        <div className={`w-full h-3 rounded-full ${dk?'bg-white/5':'bg-slate-100'} overflow-hidden`}>
          <div className="h-full rounded-full transition-all duration-700" style={{width:`${Math.min(totPct,100)}%`,background:totPct>=100?'#d4574a':totPct>=80?'#d4af45':'#7aab8a'}}/>
        </div>
        <div className={`mt-1.5 text-xs ${sub}`}>{fmt(totSpent)} / {fmt(totBudget)}</div>
      </div>

      {/* The "แต่ละหมวด" card is gone. It was a full panel wrapped around one
          button, a read-only notice and a hint — a heading for a section that
          starts immediately below it and needs no announcing. The button moved
          into the page header, which already reserves its right side for
          exactly this, and the read-only notice went with it.

          The hint went entirely: "คลิก Category เพื่อดูรายการ" was a permanent
          line of instructions for a click the chevron on every card already
          advertises. */}
        {(() => {
          const allEntries = Object.entries(viewBudgets||{}).filter(([cat])=>!['ที่พัก','สาธารณูปโภค'].includes(cat))
            .sort(([ca,ba],[cb,bb])=>{const pa=ba>0?(spent[ca]||0)/ba:0,pb=bb>0?(spent[cb]||0)/bb:0;return pb-pa;});
          if (allEntries.length===0) return (
          <div className={`${card} p-5`}>
            <div className={`flex flex-col items-center justify-center py-12 text-center ${dk?'text-slate-500':'text-slate-400'}`}>
              <span className="text-3xl mb-3">🗂️</span>
              {isCurM ? (<>
                <p className="text-sm font-medium">ยังไม่มีหมวดค่าใช้จ่าย</p>
                <p className="text-xs mt-1 mb-4">เพิ่มหมวดแรกเพื่อเริ่มตั้งงบประมาณค่ะ</p>
                <button onClick={()=>setAddOpen(true)}
                  className="px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-600 text-xs font-semibold transition-colors">+ เพิ่มหมวดแรก</button>
              </>) : (
                <p className="text-sm font-medium">ไม่มีข้อมูล Budget เดือนนี้ค่ะ</p>
              )}
            </div>
          </div>
          );
          const regularEntries = allEntries.filter(([cat])=>!isIrregular(cat));
          const irregularEntries = allEntries.filter(([cat])=>isIrregular(cat));
          const regularTotal = regularEntries.reduce((s,[cat])=>s+(spent[cat]||0),0);
          const irregularTotal = irregularEntries.reduce((s,[cat])=>s+(spent[cat]||0),0);

          const renderCard = ([cat,bgt]) => {
            const s=spent[cat]||0, p=bgt>0?Math.min(s/bgt*100,100):0;
            const rawPct=bgt>0?s/bgt*100:0;
            const over=s>bgt, warn=rawPct>=80&&!over;
            // Three states, and each one visibly a different colour.
            //
            // There were four: #c9726a, #c98f5a, #c9a84c and #7aab8a. The first
            // three share a hue and a lightness — they were chosen to harmonise,
            // which is right for a figure sitting in a sentence and wrong for
            // the only thing distinguishing "over budget" from "fine". On screen
            // a category at 134% and one at 82% drew the same tan bar.
            //
            // Muting gain and loss was about colour floating in front of the
            // page. This is the opposite failure: a signal nobody can read is
            // not restrained, it is broken. So the steps are pulled apart — sage,
            // then gold, then a red with enough blood in it to stop a scroll —
            // and the 60% tier goes, because a fourth band nobody could name was
            // what forced the other three so close together.
            const clr = over ? '#d4574a' : rawPct>=80 ? '#d4af45' : '#7aab8a';
            // Border and tint follow the same three colours, so a card that is
            // over reads as over from its edge as well as its bar rather than
            // from a fourth shade that agreed with neither.
            const borderClr=over?(dk?'border-[#d4574a]/45':'border-[#e8a89e]/60'):warn?(dk?'border-[#d4af45]/40':'border-[#f0c99a]/60'):'';
            const bgTint=over?(dk?'bg-[#d4574a]/[0.07]':'bg-[#fdf0ee]'):warn?(dk?'bg-[#d4af45]/[0.05]':'bg-[#fdf7ee]'):'';
            const isExp=expandedCat===cat;
            return (
              <div key={cat} className={`rounded-xl border transition-all overflow-hidden
                ${isExp?(dk?'border-gold-500/40':'border-gold-300'):borderClr||(dk?'border-white/8':'border-slate-100')} ${bgTint}`}>
                {/* Utility row — badge + irregular-toggle/rename/delete (not part of the expand toggle) */}
                <div className="flex items-center justify-between px-3.5 pt-3 pb-1 min-h-[28px]">
                  {/* The เกิน!/ใกล้เต็ม/เฝ้าระวัง badges are gone. The card
                      already said the same thing three more times — in the
                      bar's colour, in the border tint, and in the words
                      "เกิน ฿5,098.50" which are the only version that says by
                      how much. Their pale pink and cream backgrounds were also
                      the last two colours on the page from no palette. */}
                  <div className="min-w-0"/>
                  {isCurM&&(
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={()=>toggleIrregular(cat)}
                      title={isIrregular(cat)?'เปลี่ยนเป็นประจำ':'เปลี่ยนเป็นไม่ประจำ'}
                      className={`text-xs w-6 h-6 flex items-center justify-center rounded-lg transition-colors ${isIrregular(cat)?(dk?'text-amber-400 hover:bg-amber-500/10':'text-amber-600 hover:bg-amber-50'):(dk?'text-slate-500 hover:text-slate-200 hover:bg-white/10':'text-slate-400 hover:text-slate-700 hover:bg-slate-100')}`}>
                      {isIrregular(cat)?'📦':'🔁'}
                    </button>
                    <button onClick={()=>{setRenamingCat(cat);setRenameVal(cat);}}
                      title="แก้ชื่อหมวด"
                      className={`text-xs w-6 h-6 flex items-center justify-center rounded-lg transition-colors ${dk?'text-slate-500 hover:text-slate-200 hover:bg-white/10':'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}>🏷️</button>
                    <button onClick={()=>deleteCat(cat)}
                      title="ลบหมวด"
                      className={`text-sm w-6 h-6 flex items-center justify-center rounded-lg transition-colors ${dk?'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10':'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}>×</button>
                  </div>
                  )}
                </div>
                {/* Ring row — click to expand */}
                <button data-hint="คลิกดูรายการในหมวด" onClick={()=>setExpandedCat(isExp?null:cat)}
                  className={`w-full px-3.5 pb-3.5 text-left transition-colors ${dk?'hover:bg-white/[0.03]':'hover:bg-slate-50/70'}`}>
                  <div className="flex items-center gap-3">
                    {/* A 58px ring with a 10px percentage inside it, twelve to a
                        screen. Two cards' rings could not be compared without
                        reading both numbers, which is the opposite of what a
                        chart is for — an angle is only legible when it is large
                        or alone, and these were neither.

                        The ring is now a plain chip carrying the category icon,
                        and the proportion moved to a bar under the figure where
                        every card's track is the same length and the eye can
                        run straight down the column. */}
                    <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
                      style={{background:clr+'1f', border:`1px solid ${clr}3d`}}>
                      <CatGlyph v={catIconSmart(cat)} s={19} color={clr}/>
                    </div>
                    <div className="min-w-0 flex-1">
                      {isCurM&&renamingCat===cat
                        ?<>
                          <input autoFocus type="text" value={renameVal}
                            className={`text-sm px-1.5 py-0.5 rounded-lg border outline-none w-full ${dk?'bg-white/10 border-white/20 text-white':'bg-white border-slate-300 text-slate-700'}`}
                            onChange={e=>setRenameVal(e.target.value)}
                            onClick={e=>e.stopPropagation()}
                            onBlur={()=>renameCat(cat)}
                            onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')renameCat(cat);if(e.key==='Escape')setRenamingCat(null);}}/>
                          {renameVal.trim()&&renameVal.trim()!==cat&&budgets[renameVal.trim()]!==undefined
                            ? <p className="text-rose-400 text-[10px] mb-1">ชื่อนี้มีอยู่แล้วค่ะ</p>
                            : <div className="mb-1"/>}
                        </>
                        :<div className="flex items-center gap-1.5 mb-0.5 min-w-0">
                          <span className={`text-sm font-medium truncate ${dk?'text-white':'text-slate-700'}`}>{cat}</span>
                          {/* This card carries a budget, a ring and a percentage exactly like
                              every other one, while the totals above deliberately leave it out
                              — so raising its budget changed nothing on screen and looked
                              broken. The figures were right; nothing said which ones. */}
                          {NON_SPEND_CATS.includes(cat)&&(
                            <span title="เงินลงทุนย้ายไปอยู่ในสินทรัพย์ ไม่ได้ใช้หายไป จึงไม่ถูกนับใน BUDGET รวม · ใช้ไปแล้ว · คงเหลือ · ใช้ได้อีก/วัน"
                              className={`flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${dk?'bg-white/10 text-slate-400':'bg-slate-100 text-slate-500'}`}>ไม่นับในยอดรวม</span>
                          )}
                        </div>
                      }
                      {/* Spent, then how it stands against the budget, on one
                          line. "เหลือ / เกิน" is the question this page is
                          opened to answer, and it had been the smallest and
                          dimmest thing on the card. */}
                      <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <span className={`text-base font-bold tabular-nums leading-none ${over?'text-rose-400':dk?'text-white':'text-slate-800'}`}>{fmt(s)}</span>
                        {bgt>0&&editing!==cat&&(
                          <span className="text-xs font-semibold tabular-nums whitespace-nowrap" style={{color:clr}}>
                            {over?`เกิน ${fmt(s-bgt)}`:`เหลือ ${fmt(bgt-s)}`}
                          </span>
                        )}
                      </div>
                      {/* Equal tracks, one per card, so the column reads down. */}
                      {/* 8px, not 6. The bar carries the state on a card with
                          nothing else large on it, and at 6px a colour has too
                          little area to register before the eye moves on. */}
                      <div className={`h-2 rounded-full overflow-hidden mb-1.5 ${dk?'bg-white/10':'bg-slate-100'}`}>
                        <div className="h-full rounded-full transition-all duration-500" style={{width:`${p}%`, background:clr}}/>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {!isCurM
                          ?<span className="text-[11px] text-slate-400">Budget {fmt(bgt)}</span>
                          :editing===cat
                          ?<input type="number" defaultValue={bgt} autoFocus
                              className={`w-full px-1.5 py-0.5 text-xs rounded-lg border outline-none ${dk?'bg-white/10 border-white/20 text-white':'bg-white border-slate-300 text-slate-700'}`}
                              onClick={e=>e.stopPropagation()}
                              onBlur={e=>{const v=parseFloat(e.target.value);setBudgets(b=>({...b,[cat]:isNaN(v)||v<0?bgt:v}));setEditing(null);}}
                              onKeyDown={e=>{if(e.key==='Enter')e.target.blur();if(e.key==='Escape')setEditing(null);}}/>
                          :<button data-hint="คลิกปรับงบประมาณของหมวดนี้ได้" onClick={e=>{e.stopPropagation();setEditing(cat);}} title="แก้งบประมาณ"
                              className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md border border-dashed transition-colors ${dk?'border-white/20 text-slate-400 hover:text-gold-300 hover:border-gold-400/50':'border-slate-300 text-slate-500 hover:text-gold-500 hover:border-gold-300'}`}>
                              Budget {fmt(bgt)} <span className="opacity-60">✏</span>
                            </button>}
                        {bgt>0&&editing!==cat&&(
                          <span className={`text-[11px] tabular-nums ${dk?'text-slate-500':'text-slate-400'}`}>{rawPct.toFixed(0)}%</span>
                        )}
                      </div>
                    </div>
                    <Ic n="chevD" s={12} cls={`transition-transform duration-200 flex-shrink-0 self-center ${isExp?'rotate-180':''} ${dk?'text-slate-500':'text-slate-400'}`}/>
                  </div>
                  {prevSpent[cat]!=null&&prevSpent[cat]>0&&(
                    <div className={`flex justify-between items-center mt-2.5 pt-2 border-t ${dk?'border-white/5':'border-slate-100'}`}>
                      <span className={`text-[11px] ${sub}`}>เดือนที่แล้ว</span>
                      <span className={`text-[11px] font-medium ${s>prevSpent[cat]?'text-rose-400':s<prevSpent[cat]?'text-emerald-400':dk?'text-slate-500':'text-slate-400'}`}>
                        {fmt(prevSpent[cat])} {s>prevSpent[cat]?'▲':s<prevSpent[cat]?'▼':''}
                      </span>
                    </div>
                  )}
                </button>
                {/* Drill-down */}
                {isExp&&(
                  <div className={`border-t ${dk?'border-white/8':'border-slate-100'}`}>
                    {catTxs.length===0
                      ?<p className={`text-xs text-center py-4 ${dk?'text-slate-400':'text-slate-500'}`}>ยังไม่มีรายการในเดือนนี้ค่ะ</p>
                      :<div className="px-4 py-2">
                        {catTxs.map(t=>(
                          <div key={t.id} onClick={()=>onEdit&&onEdit(t)}
                            className={`flex items-center justify-between py-2 border-b last:border-b-0 rounded-lg px-1 -mx-1 transition-colors ${onEdit?'cursor-pointer':''} ${dk?'border-white/5 hover:bg-white/5':'border-slate-100 hover:bg-slate-50'}`}>
                            <div className="flex-1 min-w-0 mr-3">
                              <p className={`text-xs font-medium truncate ${dk?'text-slate-200':'text-slate-700'}`}>{t.title}</p>
                              <p className={`text-[11px] mt-0.5 ${dk?'text-slate-400':'text-slate-500'}`}>{t.date}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-xs font-semibold ${t.amount<0?'text-emerald-400':'text-rose-400'}`}>{t.amount<0?'+':'-'}{fmt(Math.abs(t.amount))}</span>
                              {onEdit&&<Ic n="chevR" s={11} cls={dk?'text-slate-600':'text-slate-300'}/>}
                            </div>
                          </div>
                        ))}
                        <p className={`text-[11px] text-right pt-2 pb-1 ${dk?'text-slate-500':'text-slate-400'}`}>{catTxs.length} รายการ</p>
                      </div>
                    }
                  </div>
                )}
              </div>
            );
          };

          return (
            <>
              {regularEntries.length>0 && (
                <div className={`${card} p-5`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>🔁 ประจำ (รายวัน)</span>
                    <span className={`text-xs font-semibold ${dk?'text-slate-300':'text-slate-600'}`}>{fmt(regularTotal)}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {regularEntries.map(renderCard)}
                  </div>
                </div>
              )}
              {irregularEntries.length>0 && (
                <div className={`${card} p-5`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>📦 ไม่ประจำ (นานๆ ที)</span>
                    <span className={`text-xs font-semibold ${dk?'text-slate-300':'text-slate-600'}`}>{fmt(irregularTotal)}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {irregularEntries.map(renderCard)}
                  </div>
                </div>
              )}
            </>
          );
        })()}

      {/* Add Category Modal */}
      {addOpen&&(
        <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}
          className={`p-4 ${dk?'bg-black/60':'bg-black/30'} backdrop-blur-sm`}
          onClick={resetAdd}>
          <div className={`w-80 max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl p-6 ${dk?'bg-[#0f1117] border border-white/10':'bg-white border border-slate-200'}`}
            onClick={e=>e.stopPropagation()}>
            <h3 className={`text-sm font-semibold mb-4 ${dk?'text-white':'text-slate-800'}`}>เพิ่มหมวดใหม่</h3>
            <div className="space-y-3">
              {/* Live preview */}
              <div className={`flex items-center gap-2 p-2.5 rounded-xl ${dk?'bg-white/5':'bg-slate-50'}`}>
                <span className="w-8 h-8 flex items-center justify-center rounded-lg text-lg leading-none flex-shrink-0" style={{background:newClr+'22'}}>{newIcon}</span>
                <span className={`text-sm font-medium truncate ${dk?'text-white':'text-slate-700'}`}>{newName.trim()||'ตัวอย่างหมวด'}</span>
              </div>
              <div>
                <label className={`text-xs font-medium mb-1 block ${dk?'text-slate-300':'text-slate-600'}`}>ชื่อหมวด</label>
                <input autoFocus type="text" placeholder="เช่น ท่องเที่ยว, ยิม..." value={newName}
                  onChange={e=>setNewName(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addCat()}
                  className={`w-full px-3.5 py-2 rounded-xl border text-sm outline-none ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-500':'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}/>
                {budgets[newName.trim()]!==undefined&&newName.trim()&&(
                  <p className="text-rose-400 text-xs mt-1">ชื่อนี้มีอยู่แล้วค่ะ</p>
                )}
              </div>
              <div>
                <label className={`text-xs font-medium mb-1 block ${dk?'text-slate-300':'text-slate-600'}`}>งบประมาณ (฿/เดือน)</label>
                <input type="number" placeholder="0" value={newAmt}
                  onChange={e=>setNewAmt(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addCat()}
                  className={`w-full px-3.5 py-2 rounded-xl border text-sm outline-none ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-500':'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}/>
              </div>
              <div>
                <label className={`text-xs font-medium mb-1.5 block ${dk?'text-slate-300':'text-slate-600'}`}>ไอคอน</label>
                {/* drawn in the colour chosen just below, so the pair is picked
                    together rather than discovered to clash after saving */}
                <div className="grid grid-cols-8 gap-1">
                  {CAT_ICON_KEYS.map(k=>(
                    <button key={k} onClick={()=>setNewIcon(k)} title={k}
                      className={`aspect-square flex items-center justify-center rounded-lg transition-all ${newIcon===k?(dk?'bg-gold-500/25 ring-1 ring-gold-400':'bg-gold-100 ring-1 ring-gold-400'):(dk?'hover:bg-white/10':'hover:bg-slate-100')}`}>
                      <CatGlyph v={k} s={19} color={newClr}/>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={`text-xs font-medium mb-1.5 block ${dk?'text-slate-300':'text-slate-600'}`}>สี</label>
                <div className="flex gap-2 flex-wrap">
                  {CAT_PALETTE.map(c=>(
                    <button key={c} onClick={()=>setNewClr(c)}
                      className={`w-7 h-7 rounded-full transition-all ${newClr===c?'ring-2 ring-offset-2 '+(dk?'ring-white ring-offset-[#0f1117]':'ring-slate-700 ring-offset-white'):''}`}
                      style={{background:c}}/>
                  ))}
                </div>
              </div>
              <div>
                <label className={`text-xs font-medium mb-1.5 block ${dk?'text-slate-300':'text-slate-600'}`}>ประเภท</label>
                <div className={`inline-flex w-full p-1 rounded-full ${dk?'bg-white/5':'bg-slate-100'}`}>
                  <button onClick={()=>setNewIrregular(false)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-sm font-medium transition-all ${!newIrregular?'bg-orange-400 text-orange-950 shadow-sm':(dk?'text-slate-400 hover:text-slate-200':'text-slate-500 hover:text-slate-700')}`}>
                    🔁 ประจำ
                  </button>
                  <button onClick={()=>setNewIrregular(true)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-sm font-medium transition-all ${newIrregular?'bg-orange-400 text-orange-950 shadow-sm':(dk?'text-slate-400 hover:text-slate-200':'text-slate-500 hover:text-slate-700')}`}>
                    📦 ไม่ประจำ
                  </button>
                </div>
                <p className={`text-[11px] mt-1.5 ${sub}`}>ไม่ประจำ = นานๆ ที เช่น ค่าซ่อมรถ (จะไม่นับในค่าเฉลี่ยรายวัน)</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={resetAdd}
                className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${dk?'border-white/10 text-slate-400 hover:bg-white/5':'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                ยกเลิก
              </button>
              <button onClick={addCat} disabled={!newName.trim()||budgets[newName.trim()]!==undefined}
                className="flex-1 py-2 rounded-xl bg-gold-500 hover:bg-gold-600 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                เพิ่มหมวด
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmEl}
    </div>
  );
};

// ── DEBT MODAL ──────────────────────────────────────────────
const DebtModal = ({ open, onClose, onSave, editData, theme }) => {
  const dk = theme==='dark';
  const DEBT_TYPES = [
    {k:'car',      l:'รถยนต์',            e:'🚗'},
    {k:'home',     l:'บ้าน/คอนโด',        e:'🏠'},
    {k:'personal', l:'สินเชื่อส่วนบุคคล', e:'💼'},
    {k:'credit',   l:'บัตรเครดิต',        e:'💳'},
  ];
  const blank = {name:'',type:'car',totalLoan:'',interestRate:'',monthlyPayment:'',startDate:today(),totalMonths:'',vehiclePrice:''};
  const [f,setF] = useState(blank);
  useEffect(()=>{
    if(editData) setF({...editData,totalLoan:String(editData.totalLoan),interestRate:String(editData.interestRate),monthlyPayment:String(editData.monthlyPayment),totalMonths:String(editData.totalMonths),vehiclePrice:String(editData.vehiclePrice||'')});
    else setF(blank);
  },[editData,open]);
  const save = ()=>{
    if(!f.name.trim()||!f.totalLoan||!f.monthlyPayment||!f.totalMonths) return;
    onSave({...f,totalLoan:parseFloat(f.totalLoan)||0,interestRate:parseFloat(f.interestRate)||0,monthlyPayment:parseFloat(f.monthlyPayment)||0,totalMonths:parseInt(f.totalMonths)||0});
    onClose();
  };
  if(!open) return null;
  const inp=`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-600 focus:border-gold-500':'bg-slate-50 border-slate-200 text-slate-800 focus:border-gold-400'}`;
  const lbl=`text-xs font-medium mb-1.5 block ${dk?'text-slate-400':'text-slate-500'}`;
  return (
    <Portal>
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 modal-bg">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl scale-in ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dk?'border-white/8':'border-slate-100'}`}>
          <h2 className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>{editData?'แก้ไขรายการหนี้':'เพิ่มรายการหนี้ใหม่'}</h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="x" s={15}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={lbl}>ประเภทหนี้</label>
            <div className="grid grid-cols-2 gap-2">
              {DEBT_TYPES.map(dt=>(
                <button key={dt.k} onClick={()=>setF(p=>({...p,type:dt.k}))}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all ${f.type===dt.k?(dk?'border-gold-500 bg-gold-500/15 text-white':'border-gold-400 bg-gold-50 text-gold-700'):(dk?'border-white/10 bg-white/5 text-slate-400':'border-slate-200 bg-white text-slate-500')}`}>
                  <span>{dt.e}</span><span className="font-medium text-xs">{dt.l}</span>
                </button>
              ))}
            </div>
          </div>
          <div><label className={lbl}>ชื่อหนี้</label>
            <input className={inp} placeholder="เช่น ผ่อนรถ Honda" value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>ยอดกู้ทั้งหมด (฿)</label>
              <input type="number" className={inp} placeholder="600000" value={f.totalLoan} onChange={e=>setF(p=>({...p,totalLoan:e.target.value}))}/>
            </div>
            <div><label className={lbl}>ดอกเบี้ย (% ต่อปี)</label>
              <input type="number" className={inp} placeholder="4.5" step="0.1" value={f.interestRate} onChange={e=>setF(p=>({...p,interestRate:e.target.value}))}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>ค่างวดต่อเดือน (฿)</label>
              <input type="number" className={inp} placeholder="8500" value={f.monthlyPayment} onChange={e=>setF(p=>({...p,monthlyPayment:e.target.value}))}/>
            </div>
            <div><label className={lbl}>จำนวนงวดทั้งหมด</label>
              <input type="number" className={inp} placeholder="72" value={f.totalMonths} onChange={e=>setF(p=>({...p,totalMonths:e.target.value}))}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>วันที่เริ่มผ่อน</label>
              <input type="date" className={inp} value={f.startDate} onChange={e=>setF(p=>({...p,startDate:e.target.value}))}/>
            </div>
            <div><label className={lbl}>{f.type==='home'?'ราคาบ้าน':f.type==='credit'?'วงเงินบัตร':f.type==='personal'?'วงเงินสินเชื่อ':'ราคารถ'} (฿)</label>
              <input type="number" className={inp} placeholder="1137000" value={f.vehiclePrice} onChange={e=>setF(p=>({...p,vehiclePrice:e.target.value}))}/>
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${dk?'bg-white/5 hover:bg-white/10 text-slate-300':'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>ยกเลิก</button>
          <button onClick={save} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-gold-500 hover:bg-gold-600">{editData?'บันทึก':'เพิ่มหนี้'}</button>
        </div>
      </div>
    </div>
    </Portal>
  );
};

// ── DEBT PAGE ───────────────────────────────────────────────
const DebtPage = ({ theme, debts, setDebts }) => {
  const dk = theme==='dark';
  const [dModal,setDModal] = useState({open:false,editData:null});
  // the floating + button lives in the app shell, which cannot reach this state
  useEffect(()=>{
    const open=()=>setDModal({open:true,editData:null});
    window.addEventListener('ft-add-debt',open);
    return ()=>window.removeEventListener('ft-add-debt',open);
  },[]);
  const [confirmEl,ask] = useConfirm(dk);
  const [extraMap,setExtraMap] = useState({});
  const card=`rounded-2xl ${dk?'card-solid':'glass-light shadow-sm'}`;
  const sub=`text-xs ${dk?'text-slate-400':'text-slate-500'}`;
  const DEBT_ICON={car:'🚗',home:'🏠',personal:'💼',credit:'💳'};

  const calcDebt = (d) => {
    const totalPayable = d.monthlyPayment * d.totalMonths;
    const totalInterest = Math.max(totalPayable - d.totalLoan, 0);
    const start = new Date(d.startDate);
    const now = new Date();
    const monthsPaid = Math.max(0, (now.getFullYear()-start.getFullYear())*12 + (now.getMonth()-start.getMonth()));
    const amountPaid = Math.min(monthsPaid*d.monthlyPayment, totalPayable);
    const remaining = Math.max(totalPayable - amountPaid, 0);
    const monthsRemaining = Math.max(d.totalMonths - monthsPaid, 0);
    const pct = totalPayable>0 ? (amountPaid/totalPayable*100) : 0;
    const interestPaid = d.totalMonths>0 ? totalInterest * Math.min(monthsPaid/d.totalMonths,1) : 0;
    const principalRemaining = d.totalMonths>0 ? d.totalLoan * (monthsRemaining/d.totalMonths) : 0;
    const interestRemaining = Math.max(remaining - principalRemaining, 0);
    const pd = new Date(now); pd.setMonth(pd.getMonth()+monthsRemaining);
    const payoffStr = monthsRemaining>0 ? `${MONTHS_TH[pd.getMonth()]} ${pd.getFullYear()}` : 'ชำระครบแล้ว! 🎉';
    return {totalPayable,totalInterest,monthsPaid,amountPaid,remaining,monthsRemaining,pct,interestPaid,principalRemaining,interestRemaining,payoffStr};
  };

  const totals = useMemo(()=>debts.reduce((acc,d)=>{
    const c=calcDebt(d);
    const vp=parseFloat(d.vehiclePrice)||0;
    const down=vp>d.totalLoan?vp-d.totalLoan:0;
    acc.remaining+=c.remaining; acc.paid+=c.amountPaid+down; acc.interest+=c.interestPaid; return acc;
  },{remaining:0,paid:0,interest:0}),[debts]);

  const saveDebt = (data) => {
    if(dModal.editData) setDebts(ds=>ds.map(d=>d.id===dModal.editData.id?{...data,id:d.id}:d));
    else setDebts(ds=>[...ds,{...data,id:uid()}]);
    setDModal({open:false,editData:null});
  };
  const delDebt = (id) => ask('ลบรายการหนี้','ยืนยันการลบรายการหนี้นี้ออกจากระบบ? การดำเนินการนี้ไม่สามารถย้อนกลับได้',()=>setDebts(ds=>ds.filter(d=>d.id!==id)));

  return (
    <div className="space-y-4 fade-up">
      <PageHeader theme={theme} lead="Outstanding" accent="Debt"
        sub="ยอดค้าง ดอกเบี้ย และแผนการผ่อน"/>
      {debts.length>0&&(
        <div className="grid grid-cols-3 gap-4">
          {[{l:'หนี้คงเหลือ',v:fmt(totals.remaining),c:dk?'tg-red':'text-rose-500'},
            {l:'จ่ายไปแล้ว',v:fmt(totals.paid),c:dk?'tg-emerald':'text-emerald-600'},
            {l:'ดอกเบี้ยรวม',v:fmt(totals.interest),c:dk?'tg-gold':'text-amber-500'}].map(({l,v,c})=>(
            <div key={l} className={`${card} p-5`}>
              <div className={`text-xs font-medium mb-2 uppercase tracking-wide ${dk?'text-slate-400':'text-slate-500'}`}>{l}</div>
              <div className={`text-xl font-bold ${c}`}>{v}</div>
            </div>))}
        </div>
      )}

      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>รายการหนี้สิน</h2>
            <p className={`text-xs mt-0.5 ${sub}`}>{debts.length} รายการ</p>
          </div>
          <button onClick={()=>setDModal({open:true,editData:null})}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${dk?'border-white/15 text-slate-300 hover:bg-white/8':'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <Ic n="plus" s={14}/> เพิ่มหนี้
          </button>
        </div>
      </div>

      {debts.length===0&&(
        <div className={`${card} p-10 text-center`}>
          <div className="text-5xl mb-4">💳</div>
          <p className={`text-base font-semibold mb-1 ${dk?'text-white':'text-slate-700'}`}>ยังไม่มีรายการหนี้</p>
          <p className={`text-xs mb-5 max-w-md mx-auto leading-relaxed ${sub}`}>บันทึกหนี้บัตรเครดิต ผ่อนสินค้า หรือเงินกู้ เพื่อติดตามยอดคงเหลือและดอกเบี้ย — ถ้ายังไม่มีหนี้ก็ถือเป็นเรื่องดีค่ะ</p>
          <button onClick={()=>setDModal({open:true,editData:null})} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-600 text-white text-sm font-semibold"><Ic n="plus" s={14}/> เพิ่มหนี้</button>
        </div>
      )}

      {debts.map(debt=>{
        const c=calcDebt(debt);
        const clr=c.pct>=100?'#7aab8a':dk?'#475569':'#94a3b8';
        const extra=extraMap[debt.id]||'';
        const extraAmt=parseFloat(extra)||0;
        let extraInfo=null;
        if(extraAmt>0&&c.remaining>0){
          const newRemaining=Math.max(c.remaining-extraAmt,0);
          const newMonths=newRemaining>0?Math.ceil(newRemaining/debt.monthlyPayment):0;
          const saved=c.monthsRemaining-newMonths;
          if(saved>0) extraInfo={monthsSaved:saved, interestSaved:saved*(c.totalInterest/debt.totalMonths)};
        }
        return (
          <div key={debt.id} className={`${card} ${dk?'card-hero':''} overflow-hidden`}>
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${dk?'bg-white/8':'bg-slate-100'}`}>
                    {DEBT_ICON[debt.type]||'💳'}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>{debt.name}</p>
                    <p className={`text-xs mt-0.5 ${sub}`}>
                      {debt.interestRate}% ต่อปี · งวดละ {fmt(debt.monthlyPayment)}
                      {debt.vehiclePrice&&parseFloat(debt.vehiclePrice)>debt.totalLoan&&<> · ดาวน์ {fmt(parseFloat(debt.vehiclePrice)-debt.totalLoan)}</>}
                    </p>
                    {debt.vehiclePrice&&<p className={`text-sm font-bold mt-0.5 ${dk?'text-slate-300':'text-slate-600'}`}>{debt.type==='home'?'ราคาบ้าน':debt.type==='credit'?'วงเงินบัตร':debt.type==='personal'?'วงเงินสินเชื่อ':'ราคารถ'} {fmt(parseFloat(debt.vehiclePrice))}</p>}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={()=>setDModal({open:true,editData:debt})}
                    className={`p-1.5 rounded-lg transition-colors ${dk?'text-slate-500 hover:text-white hover:bg-white/10':'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}>
                    <Ic n="edit" s={13}/>
                  </button>
                  <button onClick={()=>delDebt(debt.id)}
                    className={`p-1.5 rounded-lg transition-colors ${dk?'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10':'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}>
                    <Ic n="trash" s={13}/>
                  </button>
                </div>
              </div>

              <div className={`w-full h-3 rounded-full ${dk?'bg-white/5':'bg-slate-100'} overflow-hidden mb-2`}>
                <div className="h-full rounded-full transition-all duration-700" style={{width:`${Math.min(c.pct,100)}%`,background:clr}}/>
              </div>
              <div className="flex justify-between mb-4">
                <span className={sub}>จ่ายแล้ว {fmt(c.amountPaid)}</span>
                <span className={`text-xs font-semibold ${dk?(c.pct>=100?'tg-emerald':'glow-num'):''}`} style={!dk?{color:clr}:{}}>{c.pct.toFixed(1)}%</span>
              </div>

              <div className={`grid grid-cols-2 gap-2 rounded-xl p-3 ${dk?'bg-white/5':'bg-slate-50'}`}>
                {[{l:'เงินต้นคงเหลือ',v:fmt(c.principalRemaining),c:'text-rose-400'},
                  {l:'ดอกเบี้ยคงเหลือ',v:fmt(c.interestRemaining),c:dk?'text-amber-400':'text-amber-500'},
                  {l:'เหลืออีก',v:`${c.monthsRemaining} งวด`,c:dk?'text-slate-300':'text-slate-700'},
                  {l:'หมดหนี้',v:c.payoffStr,c:'text-emerald-400'}].map(({l,v,c:tc})=>(
                  <div key={l} className={`text-center py-1 rounded-lg ${dk?'':'bg-white/60'}`}>
                    <p className={`text-[10px] uppercase tracking-wide mb-0.5 ${dk?'text-slate-500':'text-slate-400'}`}>{l}</p>
                    <p className={`text-xs font-bold ${tc}`}>{v}</p>
                  </div>
                ))}
              </div>
              <p className={`mt-2 text-[11px] text-center ${dk?'text-slate-500':'text-slate-400'}`}>
                ดอกเบี้ยจ่ายไปแล้ว {fmt(c.interestPaid)} / รวม {fmt(c.totalInterest)}
              </p>
            </div>

            {c.remaining>0&&(
              <div className={`px-5 py-3 border-t ${dk?'border-white/8 bg-white/[0.02]':'border-slate-100 bg-slate-50/50'}`}>
                <p className={`text-[11px] font-medium mb-2 ${dk?'text-slate-400':'text-slate-500'}`}>💡 ถ้าโปะเพิ่ม</p>
                <input type="number" placeholder="ใส่จำนวนเงินที่จะโปะ (฿)"
                  value={extra} onChange={e=>setExtraMap(m=>({...m,[debt.id]:e.target.value}))}
                  className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-600 focus:border-gold-500':'bg-white border-slate-200 text-slate-700 placeholder-slate-400 focus:border-gold-400'}`}/>
                {extraInfo&&(
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <span className="text-emerald-400 font-medium">🎉 หมดเร็วขึ้น {extraInfo.monthsSaved} เดือน</span>
                    {extraInfo.interestSaved>0&&<span className={sub}>ประหยัดดอกเบี้ย {fmt(extraInfo.interestSaved)}</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <DebtModal open={dModal.open} onClose={()=>setDModal({open:false,editData:null})} onSave={saveDebt} editData={dModal.editData} theme={theme}/>
      {confirmEl}
    </div>
  );
};

// ── WALLET MODAL ────────────────────────────────────────────
const WalletModal = ({ open, onClose, onSave, editData, theme }) => {
  const dk = theme==='dark';
  const blank = { name:'', type:'bank', initialBalance:'0', icon:'🏦' };
  const [f, setF] = useState(blank);
  // Five types covered where money sits, but not several places Thai savers
  // actually keep it. Added rather than renamed, so nothing already recorded
  // changes type underneath itself.
  //
  // ewallet is the notable gap: TrueMoney, Rabbit LINE Pay and ShopeePay hold
  // real balances and were having to be filed as either เงินสด or a bank
  // account, neither of which they are. fixed covers a deposit you cannot spend
  // from without breaking it, which is worth separating from a current account
  // for exactly that reason. fund is for a mutual-fund account, savings for a
  // goal pot, and other for whatever is left — better an honest "อื่นๆ" than
  // forcing a wallet into a category it does not belong to.
  // `i` is a TYPE_SVG key, not an emoji. It is stored on the wallet as its icon,
  // and CatGlyph falls through to rendering the raw string when it matches no
  // drawn icon — which is what keeps wallets created before this, and any emoji
  // someone typed in by hand, working exactly as they did.
  const WALLET_TYPES = [
    { k:'bank',    l:'บัญชีธนาคาร',  i:'bank' },
    { k:'cash',    l:'เงินสด',        i:'cash' },
    { k:'stock',   l:'พอร์ตหุ้น',     i:'stock' },
    { k:'credit',  l:'บัตรเครดิต',    i:'credit' },
    { k:'crypto',  l:'Crypto Wallet', i:'crypto' },
    { k:'ewallet', l:'e-Wallet',      i:'ewallet' },
    { k:'fund',    l:'กองทุนรวม',     i:'fund' },
    { k:'fixed',   l:'ฝากประจำ',      i:'fixed' },
    { k:'savings', l:'เงินเก็บ/เป้าหมาย', i:'savings' },
    { k:'other',   l:'อื่นๆ',          i:'wallet' },
  ];
  useEffect(()=>{
    if (editData) setF({...editData, initialBalance:String(editData.initialBalance)});
    else setF(blank);
  }, [editData, open]);
  const save = () => {
    if (!f.name.trim()) return;
    onSave({...f, initialBalance:parseFloat(f.initialBalance)||0});
    onClose();
  };
  if (!open) return null;
  const inp = `w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-600 focus:border-gold-500':'bg-slate-50 border-slate-200 text-slate-800 focus:border-gold-400'}`;
  const lbl = `text-xs font-medium mb-1.5 block ${dk?'text-slate-400':'text-slate-500'}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl scale-in ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dk?'border-white/8':'border-slate-100'}`}>
          <h2 className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>{editData?'แก้ไขกระเป๋าเงิน':'เพิ่มกระเป๋าเงินใหม่'}</h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="x" s={15}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div><label className={lbl}>ชื่อกระเป๋า</label>
            <input className={inp} placeholder="เช่น กสิกร, เงินสด, OKX, OneKey" value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&save()}/>
          </div>
          <div>
            <label className={lbl}>ประเภท</label>
            {/* One even grid rather than a row of three and then pairs. With
                five types the split read as deliberate; with ten it read as a
                layout that had run out of room. Selected takes the action
                colour, which is what selection is. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {WALLET_TYPES.map(wt=>(
                <button key={wt.k} onClick={()=>setF(p=>({...p,type:wt.k,icon:wt.i}))}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all ${f.type===wt.k?(dk?'border-orange-400 bg-orange-400/15 text-white':'border-orange-400 bg-orange-50 text-orange-700'):(dk?'border-white/10 bg-white/5 text-slate-400 hover:border-white/20':'border-slate-200 bg-white text-slate-500 hover:border-slate-300')}`}>
                  <TypeIc n={wt.i} s={17}/><span className="font-medium text-xs truncate">{wt.l}</span>
                </button>
              ))}
            </div>
          </div>
          <div><label className={lbl}>ยอดเริ่มต้น (฿)</label>
            <input type="number" className={inp} placeholder="0" value={f.initialBalance} onChange={e=>setF(p=>({...p,initialBalance:e.target.value}))}/>
          </div>
          <div><label className={lbl}>Emoji / ไอคอน</label>
            <input className={inp} placeholder="🏦" value={f.icon} onChange={e=>setF(p=>({...p,icon:e.target.value}))} maxLength={4}/>
          </div>
          <button type="button" onClick={()=>setF(p=>({...p,dividend:!p.dividend}))}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm transition-all ${f.dividend?(dk?'border-teal-500/50 bg-teal-500/10 text-teal-300':'border-teal-400 bg-teal-50 text-teal-700'):(dk?'border-white/10 bg-white/5 text-slate-400':'border-slate-200 bg-white text-slate-500')}`}>
            <span>💰 รับเงินปันผล</span>
            <span className={`text-xs font-semibold ${f.dividend?(dk?'text-teal-400':'text-teal-600'):(dk?'text-slate-500':'text-slate-400')}`}>{f.dividend?'เปิด':'ปิด'}</span>
          </button>
          {f.type==='cash'&&(
            <button type="button" onClick={()=>setF(p=>({...p,cashCount:!p.cashCount}))}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm transition-all ${f.cashCount?(dk?'border-emerald-500/50 bg-emerald-500/10 text-emerald-300':'border-emerald-400 bg-emerald-50 text-emerald-700'):(dk?'border-white/10 bg-white/5 text-slate-400':'border-slate-200 bg-white text-slate-500')}`}>
              <span>🧮 นับแบงค์</span>
              <span className={`text-xs font-semibold ${f.cashCount?(dk?'text-emerald-400':'text-emerald-600'):(dk?'text-slate-500':'text-slate-400')}`}>{f.cashCount?'เปิด':'ปิด'}</span>
            </button>
          )}
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${dk?'bg-white/5 hover:bg-white/10 text-slate-300':'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>ยกเลิก</button>
          <button onClick={save} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-gold-500 hover:bg-gold-600">{editData?'บันทึก':'เพิ่มกระเป๋า'}</button>
        </div>
      </div>
    </div>
  );
};

// ── CUSTODIAL (เงินที่ถือแทน) MODAL ─────────────────────────
const CustodialModal = ({ open, onClose, onSave, editData, theme, wallets=[] }) => {
  const dk = theme==='dark';
  const blank = { source:'', amount:'', walletId:'', note:'', date: today() };
  const [f, setF] = useState(blank);
  useEffect(()=>{
    if(editData) setF({...editData, amount:String(editData.amount), walletId:editData.walletId?String(editData.walletId):'', date:editData.date||today()});
    else setF(blank);
  },[editData, open]);
  const save = () => {
    if(!f.source.trim()||!f.amount||parseFloat(f.amount)<=0) return;
    onSave({ source:f.source.trim(), amount:parseFloat(f.amount), walletId:f.walletId?parseInt(f.walletId):null, note:(f.note||'').trim(), date:f.date||today(), returned: editData?.returned||false });
    onClose();
  };
  if(!open) return null;
  const inp = `w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-600 focus:border-amber-500':'bg-slate-50 border-slate-200 text-slate-800 focus:border-amber-400'}`;
  const lbl = `text-xs font-medium mb-1.5 block ${dk?'text-slate-400':'text-slate-500'}`;
  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg" onClick={onClose}>
      <div className={`w-full max-w-md rounded-2xl shadow-2xl scale-in ${dk?'bg-[#080f1e] border border-amber-900/40':'bg-white'}`} onClick={e=>e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dk?'border-white/8':'border-slate-100'}`}>
          <h2 className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>{editData?'แก้ไขเงินที่ถือแทน':'🔒 เพิ่มเงินที่ถือแทน'}</h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="x" s={15}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className={`text-[11px] px-3 py-2 rounded-xl ${dk?'bg-amber-500/10 text-amber-300':'bg-amber-50 text-amber-700'}`}>เงินที่ถือแทนคนอื่น (ไม่ใช่ของเรา) — จะแสดงแยกไว้เฉยๆ ไม่ถูกหักออกจาก Net Worth</div>
          <div><label className={lbl}>จากใคร / แหล่ง *</label>
            <input className={inp} placeholder="เช่น บริษัท, คุณเอ, เงินฝากลูกค้า" value={f.source} onChange={e=>setF(p=>({...p,source:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&save()}/>
          </div>
          <div><label className={lbl}>จำนวน (฿) *</label>
            <input type="number" className={inp} placeholder="0" value={f.amount} onChange={e=>setF(p=>({...p,amount:e.target.value}))}/>
          </div>
          <div><label className={lbl}>อยู่ในกระเป๋าไหน (ถ้าระบุได้)</label>
            <select className={inp} value={f.walletId} onChange={e=>setF(p=>({...p,walletId:e.target.value}))}>
              <option value="">— ไม่ระบุ —</option>
              {wallets.map(w=><option key={w.id} value={w.id}>{w.icon||'👛'} {w.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>วันที่รับ</label><input type="date" className={inp} value={f.date} onChange={e=>setF(p=>({...p,date:e.target.value}))}/></div>
            <div><label className={lbl}>โน้ต</label><input className={inp} placeholder="ไม่บังคับ" value={f.note} onChange={e=>setF(p=>({...p,note:e.target.value}))}/></div>
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${dk?'bg-white/5 hover:bg-white/10 text-slate-300':'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>ยกเลิก</button>
          <button onClick={save} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600">{editData?'บันทึก':'เพิ่ม'}</button>
        </div>
      </div>
    </div>
    </Portal>
  );
};

// ── DCA CALCULATOR MODAL ─────────────────────────────────────
const DCAModal = ({open, onClose, asset, usdRate=35, theme}) => {
  const dk = theme==='dark';
  const [buyAmt,  setBuyAmt]  = useState('');
  const [buyPrice,setBuyPrice]= useState('');
  const [mode,    setMode]    = useState('amount'); // 'amount' | 'qty'
  const [buyQty,  setBuyQty]  = useState('');
  useEffect(()=>{ if(open&&asset){ setBuyAmt(''); setBuyQty(''); setBuyPrice(String(asset.currentPrice)); setMode('amount'); } },[open,asset]);
  if(!open||!asset) return null;

  const isUSD = asset.currency==='USD';
  const cur = isUSD?'$':'฿';
  const rate = isUSD?1:1;
  const oldQty  = asset.qty||0;
  const oldAvg  = asset.avgCost||0;
  const oldCost = oldQty * oldAvg;
  const curPrice= parseFloat(buyPrice)||asset.currentPrice;

  let addQty=0, addCost=0;
  if(mode==='amount'){ addCost=parseFloat(buyAmt)||0; addQty=curPrice>0?addCost/curPrice:0; }
  else               { addQty=parseFloat(buyQty)||0;  addCost=addQty*curPrice; }

  const newQty  = oldQty + addQty;
  const newCost = oldCost + addCost;
  const newAvg  = newQty>0 ? newCost/newQty : 0;
  const newVal  = newQty * curPrice;
  const newPL   = newVal - newCost;
  const newPLPct= newCost>0 ? newPL/newCost*100 : 0;
  const breakeven = newAvg;

  const fmt2 = n => n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtQ = n => n.toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:6});
  const inp = `w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-600 focus:border-gold-500':'bg-slate-50 border-slate-200 text-slate-800 focus:border-gold-400'}`;
  const lbl = `text-xs font-medium mb-1.5 block ${dk?'text-slate-400':'text-slate-500'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg" onClick={onClose}>
      <div className={`w-full max-w-md rounded-2xl shadow-2xl scale-in ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`} onClick={e=>e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dk?'border-white/8':'border-slate-100'}`}>
          <div>
            <h2 className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>🧮 DCA Calculator</h2>
            <p className={`text-xs mt-0.5 ${dk?'text-slate-400':'text-slate-500'}`}>{asset.name} · Avg Cost ปัจจุบัน {cur}{fmt2(oldAvg)}</p>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="x" s={15}/></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Current position */}
          <div className={`grid grid-cols-3 gap-2 p-3 rounded-xl text-center ${dk?'bg-white/5':'bg-slate-50'}`}>
            <div><p className={`text-[10px] mb-1 ${dk?'text-slate-500':'text-slate-400'}`}>ถืออยู่</p><p className={`text-xs font-semibold ${dk?'text-white':'text-slate-700'}`}>{fmtQ(oldQty)}</p></div>
            <div><p className={`text-[10px] mb-1 ${dk?'text-slate-500':'text-slate-400'}`}>ต้นทุน</p><p className={`text-xs font-semibold ${dk?'text-white':'text-slate-700'}`}>{cur}{fmt2(oldCost)}</p></div>
            <div><p className={`text-[10px] mb-1 ${dk?'text-slate-500':'text-slate-400'}`}>ราคาตลาด</p><p className={`text-xs font-semibold ${dk?'text-white':'text-slate-700'}`}>{cur}{fmt2(asset.currentPrice)}</p></div>
          </div>
          {/* Mode toggle */}
          <div className={`flex p-1 rounded-xl ${dk?'bg-white/5':'bg-slate-100'}`}>
            {[{k:'amount',l:`ซื้อเป็นเงิน (${cur})`},{k:'qty',l:'ซื้อเป็นจำนวน'}].map(({k,l})=>(
              <button key={k} onClick={()=>setMode(k)} className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${mode===k?(dk?'bg-orange-400 text-orange-950':'bg-white text-orange-600 shadow-sm'):(dk?'text-slate-400':'text-slate-500')}`}>{l}</button>
            ))}
          </div>
          {/* Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>{mode==='amount'?`จำนวนเงิน (${cur})`:'จำนวนที่ซื้อ'}</label>
              {mode==='amount'
                ? <input type="number" className={inp} placeholder="5000" value={buyAmt} onChange={e=>setBuyAmt(e.target.value)}/>
                : <input type="number" className={inp} placeholder="0.05" value={buyQty} onChange={e=>setBuyQty(e.target.value)}/>
              }
            </div>
            <div>
              <label className={lbl}>ราคาที่ซื้อ ({cur})</label>
              <input type="number" className={inp} value={buyPrice} onChange={e=>setBuyPrice(e.target.value)}/>
            </div>
          </div>
          {/* Result */}
          {(addQty>0)&&(
            <div className={`rounded-xl overflow-hidden border ${dk?'border-white/8':'border-slate-200'}`}>
              <div className={`px-4 py-2 text-xs font-semibold ${dk?'bg-white/5 text-slate-400':'bg-slate-50 text-slate-500'}`}>ผลลัพธ์หลัง DCA</div>
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>จำนวนรวม</span>
                  <span className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>{fmtQ(newQty)} {asset.ticker||asset.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>ต้นทุนรวม</span>
                  <span className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>{cur}{fmt2(newCost)}</span>
                </div>
                <div className={`flex justify-between items-center py-2 px-3 rounded-lg ${dk?'bg-gold-500/10':'bg-gold-50'}`}>
                  <span className={`text-xs font-semibold ${dk?'text-gold-300':'text-gold-600'}`}>Avg Cost ใหม่</span>
                  <span className={`text-base font-bold ${dk?'text-gold-300':'text-gold-600'}`}>{cur}{fmt2(newAvg)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>Avg Cost เดิม</span>
                  <span className={`text-sm ${dk?'text-slate-400':'text-slate-500'} line-through`}>{cur}{fmt2(oldAvg)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>กำไร/ขาดทุน ณ ราคานี้</span>
                  <span className={`text-sm font-semibold ${newPL>=0?'text-emerald-400':'text-rose-400'}`}>{newPL>=0?'+':''}{cur}{fmt2(Math.abs(newPL))} ({newPLPct>=0?'+':''}{newPLPct.toFixed(2)}%)</span>
                </div>
                <div className={`flex justify-between items-center pt-2 border-t ${dk?'border-white/8':'border-slate-100'}`}>
                  <span className={`text-xs font-semibold ${dk?'text-slate-400':'text-slate-500'}`}>Breakeven ที่ราคา</span>
                  <span className={`text-sm font-bold ${dk?'text-white':'text-slate-800'}`}>{cur}{fmt2(breakeven)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose} className={`w-full py-2.5 rounded-xl text-sm font-medium ${dk?'bg-white/5 hover:bg-white/10 text-slate-300':'bg-slate-100 text-slate-600'}`}>Close</button>
        </div>
      </div>
    </div>
  );
};

// ── UNIFIED TRANSFER MODAL ───────────────────────────────────
// Single entry point for ALL money movement:
//   • wallet ↔ wallet, wallet ↔ cash-asset, cash-asset ↔ cash-asset  → tagged transfer records (no qty change)
//   • → investment asset  → "buy" (updates qty/avgCost). From wallet = invest expense tx; from asset = direct asset move
// Reuses the exact formulas from the old TransferModal / WalletToInvestModal so numbers stay identical.
const NEW_ASSET = '__new__';
const UNIFIED_ASSET_TYPES = [['stock','📈 หุ้น'],['etf','🧺 ETF'],['crypto','🪙 Crypto'],['fund','🏦 กองทุน'],['gold','🥇 ทองคำ'],['property','🏠 อสังหา'],['other','📦 อื่นๆ']];
const UnifiedTransferModal = ({open, onClose, onSave, wallets=[], assets=[], txs=[], theme, presetFrom=null, presetTo=null}) => {
  const dk = theme==='dark';
  // A wallet can hold a USD cash asset, and the checks below weigh what a wallet
  // can send — which has to be in baht like every other figure. This was reading
  // a name that did not exist here, so those checks threw the moment a wallet
  // with any cash asset was picked. Same stored rate the Assets page uses.
  const usdRate = parseFloat(localStorage.getItem('ft-usdrate')||'35') || 35;
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');
  const [amount, setAmount] = useState('');
  const [date,   setDate]   = useState(today());
  const [title,  setTitle]  = useState('');
  const [buyQty,   setBuyQty]   = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const blankNA = {name:'',type:'stock',currency:'THB',ticker:''};
  const [na, setNa] = useState(blankNA);
  useEffect(()=>{
    if(!open){ setFrom('');setTo('');setAmount('');setTitle('');setDate(today());setBuyQty('');setBuyPrice('');setNa(blankNA); }
    else { setFrom(presetFrom||''); setTo(presetTo||''); }
  },[open,presetFrom,presetTo]);

  // Cash assets tied to a wallet are that wallet's money — the wallet stands for
  // them in the picker, so they must not appear as a second identically-named row.
  const pickableAssets = assets.filter(a=>!(a.type==='cash'&&a.walletId));

  const parseSrc = v => { if(!v) return {t:null,id:null}; const [t,...r]=v.split('-'); return {t,id:parseInt(r.join('-'))}; };
  const getName  = v => { if(v===NEW_ASSET) return na.name||'สินทรัพย์ใหม่'; const {t,id}=parseSrc(v); return t==='w'?wallets.find(x=>x.id===id)?.name:assets.find(x=>x.id===id)?.name||''; };
  const getBal   = v => {
    const {t,id}=parseSrc(v);
    if(t==='w'){
      const w=wallets.find(x=>x.id===id); if(!w) return 0;
      // what the wallet can actually send: its loose cash plus the cash assets
      // it stands for, since those are now reachable only through the wallet
      const cash = assets.filter(a=>a.walletId===w.id&&a.type==='cash')
                         .reduce((s,a)=>s+assetVal(a,txs,usdRate),0);
      return walletCash(w, txs, assets) + cash;
    }
    if(t==='a'){
      const a=assets.find(x=>x.id===id); if(!a) return 0;
      const {taggedIn:tIn, taggedOut:tOut} = assetTagged(txs, a.id);
      return a.qty*a.currentPrice+tIn-tOut;
    }
    return 0;
  };

  const fromObj  = parseSrc(from);
  const toIsNew  = to===NEW_ASSET;
  const toObj    = toIsNew?{t:'new'}:parseSrc(to);
  const fromAsset= fromObj.t==='a'?assets.find(x=>x.id===fromObj.id):null;
  const toAsset  = toObj.t==='a'?assets.find(x=>x.id===toObj.id):null;
  const isInvest = a => a && a.type!=='cash';
  const investDest = toIsNew || isInvest(toAsset);

  const fromBal=from?getBal(from):0;
  const amt=parseFloat(amount)||0;
  const aq=parseFloat(buyQty)||0;
  const ap=parseFloat(buyPrice)||0;

  // DCA preview for buying into an existing investment asset
  const preview = (investDest && !toIsNew && toAsset && aq>0 && ap>0) ? (()=>{
    const nq=toAsset.qty+aq; const navg=(toAsset.qty*toAsset.avgCost+aq*ap)/nq;
    return {nq, navg};
  })() : null;

  // Assets were never checked, only wallets — so a holding could be sent away
  // twice over and go negative, which no real holding can do.
  const walletOk = !fromObj.t || amt<=fromBal+0.01;
  const investOk = !investDest || (aq>0 && ap>0 && (!toIsNew || na.name.trim()));
  const canSave  = from && to && from!==to && amt>0 && walletOk && investOk;

  // Same routing as the transaction form: spend loose cash first, then fall back
  // to the wallet's cash asset, so picking the wallet can never drive it negative
  // against an asset holding the money being moved.
  const routeSrc = (src) => {
    if (src.t!=='w') return src;
    const w = wallets.find(x=>x.id===src.id);
    if (!w || walletCash(w, txs, assets) >= amt) return src;
    const cash = assets.filter(a=>a.walletId===w.id && a.type==='cash')
                       .sort((x,y)=>assetVal(y,txs,usdRate)-assetVal(x,txs,usdRate));
    return cash.length ? {t:'a', id:cash[0].id} : src;
  };
  // Incoming money follows the same rule, or the receiving wallet ends up with
  // two pools again — loose cash beside a cash asset holding the rest. Only when
  // there is exactly one cash asset; with several there is no way to know which.
  const routeDest = (dst) => {
    if (dst.t!=='w') return dst;
    const w = wallets.find(x=>x.id===dst.id);
    if (!w) return dst;
    const cash = assets.filter(a=>a.walletId===w.id && a.type==='cash');
    return cash.length===1 ? {t:'a', id:cash[0].id} : dst;
  };

  const handleSave = () => {
    if(!canSave) return;
    const fromObj = routeSrc(parseSrc(from));   // shadows the outer one on purpose
    const toObj   = investDest ? parseSrc(to) : routeDest(parseSrc(to));
    const d=date||today(); const txId=uid(), txId2=uid();

    if(investDest){
      // ── BUY: destination gains units (qty/avgCost) ──
      const assetUpdates=[]; const newAssets=[];
      let destId;
      if(toIsNew){
        destId=txId2;
        newAssets.push({id:destId, name:na.name.trim(), type:na.type, qty:aq, avgCost:ap, currentPrice:ap, currency:na.currency, ticker:(na.ticker||'').toUpperCase(), purchaseDate:d, note:'', walletId:null});
      } else {
        const nq=toAsset.qty+aq; const navg=(toAsset.qty*toAsset.avgCost+aq*ap)/nq;
        destId=toAsset.id;
        assetUpdates.push({id:toAsset.id, patch:{qty:nq, avgCost:parseFloat(navg.toFixed(4))}});
      }
      if(fromObj.t==='w'){
        // From wallet → invest expense (matches old WalletToInvestModal math)
        const tx={id:txId, title:title||'DCA', amount:amt, category:'ลงทุน/ปันผล', type:'expense', date:d, notes:'[invest]', walletId:fromObj.id, targetAssetId:destId};
        onSave({txs:[tx], assetUpdates, newAssets});
      } else {
        // From asset → reduce source directly (matches old TransferModal math)
        const src=fromAsset;
        const srcPatch = src.qty===1
          ? {currentPrice:src.currentPrice-amt, avgCost:Math.max(0, src.avgCost-amt)}
          : {qty:src.qty - amt/src.currentPrice};
        assetUpdates.push({id:src.id, patch:srcPatch});
        onSave({txs:[], assetUpdates, newAssets});
      }
      onClose(); return;
    }

    // ── CASH transfer (wallet / cash-asset legs) — tagged records, no qty change ──
    // Routing already happened above. The rule this replaced sent every leg
    // through the wallet's cash asset unconditionally, which is the same bug
    // mirrored: a wallet holding loose cash and an empty cash asset would drive
    // that asset negative instead. routeSrc spends loose cash first for exactly
    // that reason, and running both left the two transfer screens disagreeing.
    const f=fromObj, tt=toObj;
    const lbl=title||(getName(from)+' → '+getName(to));
    const linkedId=`trf-${txId}`;
    const newTxs=[];
    if(f.t==='w'&&tt.t==='w'){
      newTxs.push({id:txId,   type:'transfer',title:lbl,amount:amt,  date:d,walletId:f.id, toWalletId:tt.id,fromWalletId:f.id,transferDir:'from',linkedId,notes:''});
      newTxs.push({id:txId2,  type:'transfer',title:lbl,amount:-amt, date:d,walletId:tt.id,toWalletId:tt.id,fromWalletId:f.id,transferDir:'to',  linkedId,notes:''});
    } else if(f.t==='w'&&tt.t==='a'){
      newTxs.push({id:txId, type:'transfer',title:lbl,amount:amt, date:d,walletId:f.id,toAssetId:tt.id,transferDir:'from',linkedId,notes:''});
    } else if(f.t==='a'&&tt.t==='w'){
      newTxs.push({id:txId, type:'transfer',title:lbl,amount:-amt,date:d,walletId:tt.id,fromAssetId:f.id,transferDir:'to',linkedId,notes:''});
    } else if(f.t==='a'&&tt.t==='a'){
      newTxs.push({id:txId, type:'transfer',title:lbl,amount:amt, date:d,fromAssetId:f.id,toAssetId:tt.id,transferDir:'a2a',linkedId,notes:''});
    }
    onSave({txs:newTxs}); onClose();
  };

  const inp=`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-600 focus:border-gold-500':'bg-slate-50 border-slate-200 text-slate-800 focus:border-gold-400'}`;
  const lbl2=`text-xs font-medium mb-1.5 block ${dk?'text-slate-400':'text-slate-500'}`;
  const sel=`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${dk?'bg-[#1a1a2e] border-white/10 text-white focus:border-gold-500':'bg-slate-50 border-slate-200 text-slate-800 focus:border-gold-400'}`;
  if(!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg" onClick={onClose}>
      <div className={`w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl scale-in ${dk?'bg-[#080f1e] border border-gold-900/40':'bg-white'}`} onClick={e=>e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dk?'border-white/8':'border-slate-100'}`}>
          <div>
            <h2 className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>💸 โยกเงิน / ลงทุน</h2>
            <p className={`text-xs mt-0.5 ${dk?'text-slate-400':'text-slate-500'}`}>กระเป๋า ↔ กระเป๋า · กระเป๋า → ลงทุน · ระหว่างสินทรัพย์</p>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="x" s={15}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={lbl2}>จาก</label>
            <select className={sel} value={from} onChange={e=>setFrom(e.target.value)}>
              <option value="">-- เลือกต้นทาง --</option>
              <optgroup label="💼 กระเป๋าเงิน">{wallets.map(w=><option key={`w-${w.id}`} value={`w-${w.id}`}>{w.icon||'💼'} {w.name}</option>)}</optgroup>
              <optgroup label="📊 สินทรัพย์">{pickableAssets.map(a=><option key={`a-${a.id}`} value={`a-${a.id}`}>{a.name}</option>)}</optgroup>
            </select>
            {from&&<p className={`text-xs mt-1 ${dk?'text-slate-400':'text-slate-500'}`}>ยอดคงเหลือ: <span className="font-semibold text-emerald-400">฿{fromBal.toLocaleString('th',{maximumFractionDigits:0})}</span></p>}
          </div>
          <div>
            <label className={lbl2}>ไปยัง</label>
            <select className={sel} value={to} onChange={e=>setTo(e.target.value)}>
              <option value="">-- เลือกปลายทาง --</option>
              <optgroup label="💼 กระเป๋าเงิน">{wallets.map(w=><option key={`w-${w.id}`} value={`w-${w.id}`} disabled={from===`w-${w.id}`}>{w.icon||'💼'} {w.name}</option>)}</optgroup>
              <optgroup label="📊 สินทรัพย์">{pickableAssets.map(a=><option key={`a-${a.id}`} value={`a-${a.id}`} disabled={from===`a-${a.id}`}>{a.name}{a.type!=='cash'?'  📈':''}</option>)}</optgroup>
              <optgroup label="✨ สร้างใหม่"><option value={NEW_ASSET}>✨ สร้างสินทรัพย์ลงทุนใหม่</option></optgroup>
            </select>
          </div>
          {from&&to&&<div className={`flex items-center justify-center gap-2 py-1 text-xs font-medium ${dk?'text-gold-300':'text-gold-600'}`}><span>{getName(from)}</span><span>→</span><span>{getName(to)}</span>{investDest&&<span className={`px-1.5 py-0.5 rounded-full text-[10px] ${dk?'bg-emerald-500/15 text-emerald-300':'bg-emerald-50 text-emerald-600'}`}>ลงทุน</span>}</div>}

          {/* New investment asset fields */}
          {investDest&&toIsNew&&(
            <div className={`p-3 rounded-xl space-y-3 ${dk?'bg-white/5':'bg-slate-50'}`}>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl2}>ชื่อสินทรัพย์</label><input className={inp} placeholder="NVDA" value={na.name} onChange={e=>setNa(p=>({...p,name:e.target.value}))}/></div>
                <div><label className={lbl2}>Ticker (ถ้ามี)</label><input className={inp} placeholder="NVDA" value={na.ticker} onChange={e=>setNa(p=>({...p,ticker:e.target.value.toUpperCase()}))}/></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl2}>ประเภท</label><select className={sel} value={na.type} onChange={e=>setNa(p=>({...p,type:e.target.value}))}>{UNIFIED_ASSET_TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
                <div><label className={lbl2}>สกุลเงิน</label><select className={sel} value={na.currency} onChange={e=>setNa(p=>({...p,currency:e.target.value}))}>{['THB','USD','EUR','GBP','JPY','SGD','HKD','BTC','ETH'].map(c=><option key={c} value={c}>{c}</option>)}</select></div>
              </div>
            </div>
          )}

          {/* Buy units (investment destination) */}
          {investDest&&(
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl2}>จำนวนหน่วยที่ได้รับ</label><input type="number" className={inp} placeholder="0.05" value={buyQty} onChange={e=>setBuyQty(e.target.value)}/></div>
              <div><label className={lbl2}>ราคา/หน่วย</label><input type="number" className={inp} placeholder="60000" value={buyPrice} onChange={e=>setBuyPrice(e.target.value)}/></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl2}>{investDest?'เงินที่จ่าย (฿)':'จำนวน (฿)'}</label>
              <input type="number" className={inp} placeholder="0" value={amount} onChange={e=>setAmount(e.target.value)}/>
              {from&&amt>fromBal+0.01&&<p className="text-xs text-rose-400 mt-1">เกินยอดคงเหลือค่ะ — มีอยู่ {fmt(fromBal)}</p>}
            </div>
            <div><label className={lbl2}>วันที่</label><input type="date" className={inp} value={date} onChange={e=>setDate(e.target.value)}/></div>
          </div>
          <div><label className={lbl2}>ชื่อรายการ (ไม่บังคับ)</label><input className={inp} placeholder={investDest?'DCA':`โยก ${getName(from)||'...'} → ${getName(to)||'...'}`} value={title} onChange={e=>setTitle(e.target.value)}/></div>

          {preview&&(
            <div className={`p-3 rounded-xl text-xs space-y-1 ${dk?'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300':'bg-emerald-50 border border-emerald-100 text-emerald-600'}`}>
              <div className="flex justify-between"><span>หลังซื้อ — จำนวนรวม</span><strong>{preview.nq.toFixed(4)} หน่วย</strong></div>
              <div className="flex justify-between"><span>Avg Cost ใหม่</span><strong>{fmt(preview.navg)}</strong></div>
            </div>
          )}
          {!investDest&&from&&to&&amt>0&&<div className={`p-3 rounded-xl text-xs ${dk?'bg-gold-500/10 border border-gold-500/20 text-gold-300':'bg-gold-50 border border-gold-100 text-gold-600'}`}>โยกเงิน <strong>฿{amt.toLocaleString()}</strong> จาก <strong>{getName(from)}</strong> → <strong>{getName(to)}</strong></div>}
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${dk?'bg-white/5 hover:bg-white/10 text-slate-300':'bg-slate-100 text-slate-600'}`}>ยกเลิก</button>
          <button onClick={handleSave} disabled={!canSave} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all ${canSave?'bg-gold-500 hover:bg-gold-600':'opacity-40 bg-gold-400 cursor-not-allowed'}`}>{investDest?'ยืนยันการลงทุน →':'โยกเงิน →'}</button>
        </div>
      </div>
    </div>
  );
};

// ── WALLET PAGE ──────────────────────────────────────────────
// SpendHeatmap lived here. Removed with its only caller — see the note on
// the dashboard where it used to render.

// ── PORTFOLIO TREEMAP ──────────────────────────────────────
// Every holding as a rectangle: area is what it is worth, colour is whether it
// is up or down. A donut can only carry the first of those, so answering "which
// of my big positions is losing money" meant reading the donut for size and
// then the table for P/L and holding both in your head.
//
// Laid out by recursive binary split — the list is halved by value at each step
// and the box is cut along its longer side. It is not a squarified treemap, but
// it keeps rectangles reasonably square without the iteration that algorithm
// needs, and at twenty or thirty holdings the difference is not visible.
const treemapLayout = (items, x, y, w, h, out=[]) => {
  if(!items.length) return out;
  if(items.length===1){ out.push({...items[0], x, y, w, h}); return out; }
  const total = items.reduce((s,i)=>s+i.val,0);
  let acc = 0, cut = 1;
  // Split where the running total first passes half — the closest the halves
  // can get to equal without reordering, which would scramble the ranking.
  for(let i=0;i<items.length;i++){ acc += items[i].val; if(acc >= total/2){ cut = i+1; break; } }
  cut = Math.min(Math.max(cut,1), items.length-1);
  const left = items.slice(0,cut), right = items.slice(cut);
  const ratio = left.reduce((s,i)=>s+i.val,0) / total;
  if(w >= h){
    treemapLayout(left,  x,          y, w*ratio,     h, out);
    treemapLayout(right, x+w*ratio,  y, w*(1-ratio), h, out);
  } else {
    treemapLayout(left,  x, y,          w, h*ratio,     out);
    treemapLayout(right, x, y+h*ratio,  w, h*(1-ratio), out);
  }
  return out;
};

const PortfolioTreemap = ({ assets, txs, usdRate, theme, hide=false }) => {
  const dk = theme==='dark';
  // The panel's real size in pixels, so a tile can be asked whether it has room
  // for a line of text rather than guessed at from its share of the whole.
  const wrapRef = useRef(null);
  const [box, setBox] = useState({w:0,h:0});
  useEffect(()=>{
    if(!wrapRef.current) return;
    const ro = new ResizeObserver(es=>{
      const r = es[0].contentRect;
      setBox(p => (Math.abs(p.w-r.width)>1 || Math.abs(p.h-r.height)>1) ? {w:r.width,h:r.height} : p);
    });
    ro.observe(wrapRef.current);
    return ()=>ro.disconnect();
  },[]);
  // Two different answers to "the small holdings are invisible", kept separate
  // because only one of them is free.
  //
  // `tmType` narrows what is being compared. A ฿1.5M amulet collection and a
  // ฿266K stock are not really comparable holdings, and once the view is only
  // stocks the remaining values sit close enough together that every one of
  // them gets a readable tile. Nothing is distorted — the question changed.
  //
  // `even` is the other answer, and it costs something: it lays the tiles out
  // by the square root of value, which pulls the range in hard and shows
  // everything at once, but area then no longer means value. It is off by
  // default and its button says what it does, because a chart that quietly
  // misrepresents its own numbers is worse than one that is hard to read.
  const [tmType, setTmType] = useState('all');
  const [even, setEven] = useState(false);
  const [hoverId, setHoverId] = useState(null);
  const TM_TABS = [
    {k:'all',    l:'ทั้งหมด'},
    {k:'stock',  l:'หุ้น'},
    {k:'crypto', l:'คริปโต'},
    {k:'gold',   l:'ทองคำ'},
    {k:'other',  l:'อื่นๆ'},
  ];

  const boxes = useMemo(()=>{
    const inView = a => tmType==='all' ? a.type!=='cash'
                  : tmType==='other'   ? (a.type==='other'||a.type==='property')
                  : tmType==='stock'   ? ['stock','etf','fund','bond'].includes(a.type)
                  : a.type===tmType;
    const items = assets
      .filter(inView)
      .map(a=>{
        const mult = a.currency==='USD' ? usdRate : 1;
        const {taggedIn, taggedOut} = assetTagged(txs, a.id);
        const val  = (a.qty*a.currentPrice + taggedIn - taggedOut) * mult;
        const cost = (a.qty*a.avgCost) * mult;
        // The name you gave it, not the symbol the price feed knows it by.
        // ticker-first turned ทองคำ into GC=F and the dollar holding into
        // THB=X — strings that identify a quote on Yahoo and nothing at all to
        // the person who owns the thing.
        return { id:a.id, name:a.name||a.ticker, val, pl:val-cost,
                 pct: cost>0 ? (val-cost)/cost*100 : 0 };
      })
      .filter(i=>i.val>0)
      .sort((a,b)=>b.val-a.val);
    if(!items.length) return [];
    // Laid out on `w`, labelled from `val` — so the figures printed on a tile
    // stay true even when its size has been evened out.
    const forLayout = items.map(i=>({...i, w: even ? Math.sqrt(i.val) : i.val}));
    return treemapLayout(forLayout.map(i=>({...i, val:i.w, real:i})), 0, 0, 100, 100)
      .map(b=>({...b.real, x:b.x, y:b.y, w:b.w, h:b.h}));
  },[assets,txs,usdRate,tmType,even]);

  const tabs = (
    <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
      <div className={`flex gap-0.5 p-0.5 rounded-full ${dk?'bg-white/5':'bg-slate-100'}`}>
        {TM_TABS.map(t=>(
          <button key={t.k} onClick={()=>setTmType(t.k)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${tmType===t.k?'bg-orange-400 text-orange-950':(dk?'text-slate-400 hover:text-slate-200':'text-slate-500 hover:text-slate-700')}`}>
            {t.l}
          </button>
        ))}
      </div>
      <button onClick={()=>setEven(v=>!v)}
        title="ย่อช่องว่างระหว่างรายการใหญ่กับเล็ก เพื่อให้เห็นรายการเล็กชัดขึ้น — พื้นที่จะไม่ตรงกับมูลค่าจริง"
        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${even?(dk?'border-orange-400/60 text-orange-300 bg-orange-400/10':'border-orange-400 text-orange-600 bg-orange-50'):(dk?'border-white/10 text-slate-400 hover:text-slate-200':'border-slate-200 text-slate-500 hover:text-slate-700')}`}>
        {even ? '⚖ สเกลเท่ากันมากขึ้น (พื้นที่ ≠ มูลค่า)' : '⚖ เห็นรายการเล็กชัดขึ้น'}
      </button>
    </div>
  );

  if(!boxes.length) return (
    <div>
      {tabs}
      <div className={`h-40 flex items-center justify-center text-xs rounded-xl ${dk?'text-slate-500 bg-white/[0.02]':'text-slate-400 bg-slate-50'}`}>
        ไม่มีรายการในประเภทนี้
      </div>
    </div>
  );

  // Colour says direction and strength, not category: a flat sage or terracotta
  // for a small move, deepening as the move gets larger, so a heavy loss is
  // findable without reading a single figure.
  const fill = pct => {
    const m = Math.min(Math.abs(pct)/30, 1);          // 30% counts as full
    return pct >= 0
      ? `rgba(122,171,138,${0.18 + m*0.55})`
      : `rgba(212,87,74,${0.18 + m*0.55})`;
  };

  return (
    // 3:2 was the right shape while this shared a row; at full width it made a
    // 660px block that pushed everything below it off the screen. A panel does
    // not need to be large to be legible — it needs enough pixels for the
    // smallest tile, which is a floor, not a target.
    //
    // 3:1 lands around 330px on a desktop, which still gives the tail room for
    // its figures. The bounds matter more than the ratio: min so a phone does
    // not collapse it to a strip, max so a wide monitor does not turn it back
    // into a wall.
    <div>
    {tabs}
    <div ref={wrapRef} className="relative w-full" style={{aspectRatio:'3/1', minHeight:'260px', maxHeight:'360px'}}>
      {boxes.map(b=>{
        // A box under roughly 7% of a side has no room for two lines of type;
        // it keeps its colour and gives its name to the tooltip instead of
        // printing a truncated word nobody can read.
        // Decided in pixels, measured, not in percentages. A tile at 10% of a
        // 660px panel had 66px of height; the same 10% of a 330px panel has 33,
        // and a percentage threshold cannot tell the difference — which is why
        // tiles that used to be labelled went blank the moment the panel got
        // shorter. Each line is shown when there is actually room to draw it.
        const pxW = box.w * b.w / 100, pxH = box.h * b.h / 100;
        const showName = pxW >= 42 && pxH >= 24;
        const showVal  = pxW >= 58 && pxH >= 40;
        const showPct  = pxW >= 58 && pxH >= 54;
        const on = hoverId === b.id;
        return (
          <div key={b.id}
            onMouseEnter={()=>setHoverId(b.id)}
            onMouseLeave={()=>setHoverId(h=>h===b.id?null:h)}
            onTouchStart={()=>setHoverId(h=>h===b.id?null:b.id)}
            className="absolute overflow-hidden rounded-md flex flex-col items-center justify-center text-center px-1 transition-[border-color] cursor-default"
            style={{
              left:`${b.x}%`, top:`${b.y}%`, width:`${b.w}%`, height:`${b.h}%`,
              background: fill(b.pct),
              border:`1px solid ${on ? (dk?'rgba(255,255,255,0.75)':'rgba(0,0,0,0.55)') : (dk?'rgba(0,0,0,0.35)':'rgba(255,255,255,0.6)')}`,
              zIndex: on ? 2 : 1,
            }}>
            {showName && (
              <div className={`text-[10px] font-bold leading-tight truncate max-w-full ${dk?'text-white':'text-slate-800'}`}>{b.name}</div>
            )}
            {showVal && (
              <div className={`text-[9px] leading-tight truncate max-w-full tabular-nums ${dk?'text-slate-300':'text-slate-600'}`}>{hide?'฿ •••••':fmt(b.val)}</div>
            )}
            {showPct && (
              <div className={`text-[9px] font-semibold leading-tight tabular-nums ${b.pct>=0?'text-emerald-300':'text-rose-300'}`}>
                {b.pct>=0?'+':''}{b.pct.toFixed(1)}%
              </div>
            )}
          </div>
        );
      })}

      {/* Our own label rather than the browser's. A title attribute waits about
          a second before appearing, renders in the operating system's styling,
          and cannot be triggered by touch at all — so on a phone the small
          tiles had no way to identify themselves.

          Drawn for every tile, not only the unlabelled ones: a labelled tile
          still truncates its name and rounds nothing, and having one mechanism
          that always behaves the same is worth more than saving a hover on the
          large ones. Clamped away from the panel edges so a tile in the corner
          does not push its own label out of view. */}
      {(()=>{
        const b = boxes.find(x=>x.id===hoverId);
        if(!b) return null;
        const cx = Math.min(Math.max(b.x + b.w/2, 14), 86);
        const above = b.y + b.h/2 > 45;      // flip to the other side near the bottom
        return (
          <div className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg whitespace-nowrap"
            style={{
              left:`${cx}%`, top:`${b.y + (above?0:b.h)}%`,
              transform:`translate(-50%, ${above?'calc(-100% - 6px)':'6px'})`,
              background: dk?'rgba(12,12,13,0.97)':'rgba(255,255,255,0.98)',
              border:`1px solid ${dk?'rgba(212,175,69,0.3)':'rgba(0,0,0,0.1)'}`,
              boxShadow:'0 6px 20px rgba(0,0,0,0.35)', zIndex:5,
            }}>
            <div className={`text-[11px] font-bold ${dk?'text-white':'text-slate-800'}`}>{b.name}</div>
            <div className={`text-[10px] tabular-nums ${dk?'text-slate-300':'text-slate-600'}`}>
              {hide?'฿ •••••':fmt(b.val)}
              <span className={`ml-1.5 font-semibold ${b.pct>=0?'text-emerald-400':'text-rose-400'}`}>
                {b.pct>=0?'+':''}{b.pct.toFixed(2)}%
              </span>
            </div>
          </div>
        );
      })()}
    </div>
    </div>
  );
};

// ── ANNUALISED RETURN RANKING ──────────────────────────────
// The dashboard's answer to "which of these is actually working". Not a column
// of thirty-four figures — that is the assets table in miniature — but the
// conclusion: the three earning most per year and the two earning least.
//
// Per year is the whole point. +39% and +18% side by side say the first did
// better; if the first took fifteen months and the second three, it did not.
// Total return cannot be compared between holdings bought at different times,
// and cannot be compared to a savings rate or an index at all.
const ReturnRanking = ({ assets, txs, usdRate, theme }) => {
  const dk = theme==='dark';
  const { top, bottom, tooNew } = useMemo(()=>{
    const rows = []; let skipped = 0;
    assets.filter(a=>a.type!=='cash').forEach(a=>{
      const mult = a.currency==='USD' ? usdRate : 1;
      const {taggedIn, taggedOut} = assetTagged(txs, a.id);
      const value = (a.qty*a.currentPrice + taggedIn - taggedOut) * mult;
      const cost  = (a.qty*a.avgCost) * mult;
      const days  = a.purchaseDate ? Math.floor((Date.now()-new Date(a.purchaseDate))/86400000) : null;
      const cagr  = annualisedReturn({ value, cost, days });
      // Counted, not silently dropped: a holding missing from a ranking with no
      // explanation reads as a bug in the ranking.
      if(cagr === null){ if(cost > 0) skipped++; return; }
      rows.push({ id:a.id, name:a.name||a.ticker, cagr, days });
    });
    rows.sort((x,y)=>y.cagr-x.cagr);
    // The two lists only split once there are enough holdings that they cannot
    // overlap; below that the same row would appear in both.
    return {
      top:    rows.slice(0, rows.length>5 ? 3 : rows.length),
      bottom: rows.length>5 ? rows.slice(-2).reverse() : [],
      tooNew: skipped,
    };
  },[assets,txs,usdRate]);

  const hold = d => d>=365 ? `${Math.floor(d/365)} ปี ${Math.round((d%365)/30)} ด.` : d>=30 ? `${Math.round(d/30)} เดือน` : `${d} วัน`;
  const Row = ({ r }) => (
    <div className="flex items-baseline justify-between gap-3 text-xs py-1">
      <span className={`truncate ${dk?'text-slate-300':'text-slate-600'}`}>{r.name}</span>
      <span className="flex items-baseline gap-2 flex-shrink-0">
        <span className={`text-[10px] ${dk?'text-slate-500':'text-slate-400'}`}>{hold(r.days)}</span>
        <span className={`font-semibold tabular-nums ${r.cagr>=0?'text-emerald-400':'text-rose-400'}`}>
          {r.cagr>=0?'+':''}{r.cagr.toFixed(1)}%<span className="font-normal opacity-70">/ปี</span>
        </span>
      </span>
    </div>
  );

  if(!top.length) return (
    <div className={`text-xs py-8 text-center ${dk?'text-slate-500':'text-slate-400'}`}>
      ยังไม่มีสินทรัพย์ที่ถือครบ 3 เดือน<br/>
      <span className="opacity-70">ถือสั้นเกินไปจะคำนวณต่อปีได้ไม่น่าเชื่อถือค่ะ</span>
    </div>
  );

  return (
    <div>
      {bottom.length>0 && <div className={`text-[10px] uppercase mb-1 ${dk?'text-slate-500':'text-slate-400'}`}>ทำได้ดีที่สุด</div>}
      {top.map(r=><Row key={r.id} r={r}/>)}
      {bottom.length>0 && (
        <>
          <div className={`text-[10px] uppercase mt-3 mb-1 ${dk?'text-slate-500':'text-slate-400'}`}>ตามหลัง</div>
          {bottom.map(r=><Row key={r.id} r={r}/>)}
        </>
      )}
      {tooNew>0 && (
        <div className={`text-[10px] mt-3 pt-2 border-t ${dk?'border-white/5 text-slate-500':'border-slate-100 text-slate-400'}`}
          title="ถือ 2 สัปดาห์แล้วได้ +5% ถ้าคิดเป็นต่อปีจะกลายเป็น +260% ซึ่งไม่ได้บอกอะไรจริง">
          ถือไม่ถึง 3 เดือน {tooNew} รายการ · ยังไม่คำนวณต่อปี ⓘ
        </div>
      )}
    </div>
  );
};

// ── HERO SPARKLINE ─────────────────────────────────────────
// Net worth over time, drawn full-bleed behind the headline figure. It is the
// history the app already records for its own snapshots, so nothing new is
// stored to draw it.
//
// Deliberately unlabelled and unreadable as a chart: no axis, no ticks, no
// tooltip. Its job is to say "this has been going up" in the half-second before
// anyone reads the number, and any attempt to read a value off it would be
// guesswork — the scale is normalised to whatever range these months happen to
// span. The exact figures live in the P/L card further down, where they carry
// units.
const HeroSpark = ({ history, accent='#e8763a' }) => {
  const d = useMemo(()=>{
    const pts = [...history].sort((a,b)=>a.month.localeCompare(b.month)).map(h=>h.total);
    if(pts.length < 2) return null;
    const min = Math.min(...pts), max = Math.max(...pts), span = (max-min) || 1;
    // 12% padding top and bottom so the peak never touches the edge, which is
    // what makes a sparkline read as a fragment of something larger.
    const xy = pts.map((v,i)=>[ (i/(pts.length-1))*100, 88 - ((v-min)/span)*76 ]);
    const line = xy.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    return { line, area:`${line} L100,100 L0,100 Z` };
  },[history]);
  if(!d) return null;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100"
      preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="heroSparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={accent} stopOpacity="0.16"/>
          <stop offset="100%" stopColor={accent} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={d.area} fill="url(#heroSparkFill)"/>
      <path d={d.line} fill="none" stroke={accent} strokeOpacity="0.42" strokeWidth="0.5" vectorEffect="non-scaling-stroke"/>
    </svg>
  );
};

// ── PAGE HEADER ────────────────────────────────────────────
// The reference opens every page with one large headline where a single word
// carries the accent, and a quiet line under it. Two things make it work and
// both are easy to lose: the accent falls on the word that says what the page
// is about — never the generic half — and the supporting line stays small
// enough that the heading is unmistakably the larger of the two.
//
// `lead` is the plain part, `accent` the coloured word. Splitting them as props
// rather than parsing a marker out of one string means the colour cannot land
// on the wrong word by accident.
//
// The accent belongs on the noun that names the page — Wallets, Holdings,
// Transactions — never on the qualifier. Colouring "All" tells the reader
// nothing they could not have guessed; colouring the subject is what makes the
// heading scannable at the top of a page they arrived at by tapping a tab.
//
// Headings are in English while the line beneath stays Thai, the same split the
// P/L card uses: the term names the thing, the Thai explains it.
const PageHeader = ({ lead, accent, sub, theme, right=null }) => {
  const dk = theme==='dark';
  // text-xl, not text-3xl. At 36px the heading was competing with the figures
  // rather than introducing them — on a page whose subject is a ฿9.5M balance,
  // the largest thing on screen should not be the word for what kind of page it
  // is. 23px still reads as the page title against the 14px card headings under
  // it, which is all it needs to do.
  return (
    <div className="relative overflow-hidden rounded-2xl px-5 py-5 -mx-1 mb-5">
      {/* The depth the net worth hero has, given to every page. Not the same
          device though: that line is real data — net worth month by month — and
          no other page has a series behind it. Repeating the shape with nothing
          under it would draw a chart that looks like it means something and
          does not, which is worse than a flat header.

          These are the arcs from the wallet card face instead: struck from
          off-canvas so only the curve crosses the header, obviously ornament
          rather than measurement. Dark only — on the light ground the same
          curves read as a smudge rather than as light falling across a
          surface. */}
      {dk && (
        <>
          <div className="absolute inset-0 pointer-events-none" style={{
            background:'radial-gradient(ellipse 80% 130% at 12% 0%, rgba(232,118,58,0.07) 0%, transparent 62%),'
                      +'radial-gradient(ellipse 60% 120% at 88% 100%, rgba(212,175,69,0.05) 0%, transparent 58%)',
          }}/>
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true">
            <circle cx="330" cy="-95" r="150" fill="none" stroke="#d4af45" strokeWidth="0.7" opacity="0.22" vectorEffect="non-scaling-stroke"/>
            <circle cx="378" cy="-40" r="150" fill="none" stroke="#e8763a" strokeWidth="0.7" opacity="0.14" vectorEffect="non-scaling-stroke"/>
          </svg>
        </>
      )}
      <div className="relative flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className={`text-xl font-bold tracking-tight ${dk?'text-white':'text-slate-800'}`} style={{textWrap:'balance'}}>
            {lead} <span className="text-orange-400">{accent}</span>
          </h1>
          {sub && <p className={`text-xs mt-1 ${dk?'text-slate-400':'text-slate-500'}`}>{sub}</p>}
        </div>
        {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
      </div>
    </div>
  );
};

// ── WALLET CARD FACE ───────────────────────────────────────
// The top of a wallet card, built to read as a physical bank card. Positions
// map to the real thing rather than being decoration hung on a panel: the
// balance takes the card-number line, the wallet name takes the cardholder
// line, and the type badge sits where the network mark goes.
//
// Dark in both themes, which is not an oversight — a bank card is a dark object
// whichever room it is in, and inverting it for light mode would make it read
// as a panel that happens to be card-shaped.
//
// Everything is drawn: the grain is an feTurbulence data URI and the chip and
// arcs are inline SVG, so the card costs no network request and cannot fail to
// load the way an image would.
const CARD_GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const WalletCardFace = ({ w, meta, balanceText, usdText, hidden, accent }) => (
  <div className="relative overflow-hidden rounded-xl mb-4" style={{
    background:'linear-gradient(145deg,#232326 0%,#141416 45%,#0a0a0b 100%)',
    boxShadow:'inset 0 1px 0 rgba(255,255,255,0.06)',
  }}>
    {/* Grain. Low opacity and blended so it reads as a surface texture rather
        than as static laid over the top. */}
    <div className="absolute inset-0 pointer-events-none" style={{backgroundImage:CARD_GRAIN, opacity:0.16, mixBlendMode:'overlay'}}/>
    {/* The two arcs from the reference — struck from off-canvas so only the
        curve crosses the card, which is what keeps them reading as embossing
        rather than as drawn circles. */}
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 320 180" preserveAspectRatio="none" aria-hidden="true">
      <circle cx="250" cy="-40" r="150" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.30"/>
      <circle cx="300" cy="30"  r="150" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.18"/>
    </svg>

    {/* The top-right corner is left empty on purpose: the card's edit and delete
        buttons are positioned there by the wallet card around this one, and the
        first version put the type badge under them. They overlapped, and since
        the badge sits in a stacking context of its own it took the clicks. The
        badge moved down beside the wallet name, which is where a card prints
        its network mark anyway. */}
    <div className="relative px-4 pt-3.5 pb-3">
      {/* Chip */}
      <svg width="30" height="23" viewBox="0 0 30 23" aria-hidden="true">
        <rect x="0.5" y="0.5" width="29" height="22" rx="4" fill="rgba(212,175,69,0.18)" stroke={accent} strokeWidth="0.8" opacity="0.85"/>
        <path d="M0 8h9M0 15h9M21 8h9M21 15h9M9 0v23M21 0v23" stroke={accent} strokeWidth="0.7" opacity="0.55" fill="none"/>
      </svg>

      {/* Balance sits on the card-number line: same weight, same wide tracking,
          same tabular figures, so a masked balance keeps the card's shape. */}
      <div className={`mt-3 text-2xl font-bold tabular-nums ${w.balance<0?'text-rose-400':'text-[#f0e6cd]'}`} style={{letterSpacing:'0.05em'}}>
        {balanceText}
      </div>

      <div className="flex items-end justify-between gap-3 mt-2">
        <div className="min-w-0 flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-sm flex-shrink-0 overflow-hidden">
            {w.type==='bank' ? detectBankIcon(w.name,24) : w.type==='crypto' ? detectCryptoWalletIcon(w.name,24) : (meta.icon || w.icon)}
          </div>
          <div className="min-w-0">
            <div className="text-[9px] uppercase truncate" style={{color:accent, letterSpacing:'0.12em'}}>{meta.label}</div>
            <div className="text-xs font-semibold truncate" style={{color:'rgba(240,230,205,0.92)'}}>{w.name}</div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[9px] uppercase" style={{color:'rgba(240,230,205,0.45)', letterSpacing:'0.12em'}}>USD</div>
          <div className="text-xs font-semibold tabular-nums" style={{color:'rgba(240,230,205,0.75)'}}>{hidden ? '$•••••' : usdText}</div>
        </div>
      </div>
    </div>
  </div>
);

const WalletPage = ({ wallets, txs, assets=[], onAdd, onEdit, onDelete, onAddTx, onEditTx, onDeleteTx, onAddAsset, onUnlinkAsset, onAssetTransfer, onReorder, theme, onOpenWalletModal, onUnifiedTransfer, onAdjust, onDividend, onSaveCashCount, custodial=[], setCustodial=()=>{} }) => {
  const dk = theme==='dark';
  // Read at render time — App re-renders when either control flips. These two
  // figures are money that fmt never sees: a dollar conversion of the balance,
  // and note counts that add straight back up to it.
  const hidden = _hideAmt || _privacy;
  // ── เงินที่ถือแทน (custodial money — held for others, not ours) ──
  const [custModal, setCustModal] = useState({open:false, editData:null});
  const activeCust = useMemo(()=>custodial.filter(c=>!c.returned),[custodial]);
  const totalCust  = useMemo(()=>activeCust.reduce((s,c)=>s+(c.amount||0),0),[activeCust]);
  const custByWallet = useMemo(()=>{ const m={}; activeCust.forEach(c=>{ if(c.walletId!=null) m[c.walletId]=(m[c.walletId]||0)+c.amount; }); return m; },[activeCust]);
  const saveCust = data => setCustodial(cs=> custModal.editData ? cs.map(c=>c.id===custModal.editData.id?{...data,id:c.id}:c) : [...cs, {...data, id:uid()}]);
  const delCust  = id => setCustodial(cs=>cs.filter(c=>c.id!==id));
  const toggleReturnedCust = id => setCustodial(cs=>cs.map(c=>c.id===id?{...c,returned:!c.returned}:c));
  const [editOrder, setEditOrder] = useState(false);
  const [expandedTxMap, setExpandedTxMap] = useState({});
  const toggleTxExpand = (wid) => setExpandedTxMap(p=>({...p,[wid]:!p[wid]}));
  const [txMonthMap, setTxMonthMap] = useState({});
  const shiftMonth = (ym, delta) => { const [y,m] = ym.split('-').map(Number); const d = new Date(y, m-1+delta, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const stepTxMonth = (wid, curSel, delta) => setTxMonthMap(p=>({...p,[wid]:shiftMonth(curSel,delta)}));
  const [expandedAssetMap, setExpandedAssetMap] = useState({});
  const toggleAssetExpand = (wid) => setExpandedAssetMap(p=>({...p,[wid]:!p[wid]}));
  const [adjWalletId, setAdjWalletId] = useState(null);
  const [adjAmt, setAdjAmt] = useState('');
  const [adjTtl, setAdjTtl] = useState('');
  const [adjDate, setAdjDate] = useState(today());
  const resetAdj = () => { setAdjWalletId(null); setAdjAmt(''); setAdjTtl(''); setAdjDate(today()); };
  const saveAdj = () => {
    const n = parseFloat(adjAmt); if(adjAmt===''||isNaN(n)) return;   // 0 อนุญาต — ใช้บันทึกเป็นโน้ตเฉยๆ ได้ (ไม่กระทบยอด)
    // if this wallet has a linked cash asset, route the adjustment to it so the
    // asset's "ยอดที่ควรเป็น" tracks the wallet (otherwise they drift apart)
    const cashAsset = assets.find(a=>a.walletId===adjWalletId && a.type==='cash');
    onAdjust && onAdjust({ walletId:adjWalletId, targetAssetId: cashAsset ? cashAsset.id : null, amount:n, title:adjTtl.trim()||'ปรับยอด', date:adjDate });
    resetAdj();
  };
  const [divWalletId, setDivWalletId] = useState(null);
  const [divAmt, setDivAmt] = useState('');
  const [divTtl, setDivTtl] = useState('');
  const [divAssetId, setDivAssetId] = useState('');
  const [divDate, setDivDate] = useState(today());
  const [divToAssetId, setDivToAssetId] = useState('');   // cash asset it landed in ('' = loose wallet cash)
  // Transactions have no currency field — every amount is stored in baht. A US
  // holding pays in dollars, so typing 1.84 recorded ฿1.84 instead of ฿61: out
  // by the exchange rate. This converts at entry and still stores baht, leaving
  // every formula untouched.
  const [divCur, setDivCur] = useState('THB');
  const divRateNow = parseFloat(localStorage.getItem('ft-usdrate')||'35') || 35;
  const divBaht = divCur==='USD' ? (parseFloat(divAmt)||0) * divRateNow : (parseFloat(divAmt)||0);
  const resetDiv = () => { setDivWalletId(null); setDivAmt(''); setDivTtl(''); setDivAssetId(''); setDivToAssetId(''); setDivCur('THB'); setDivDate(today()); };
  const saveDiv = () => {
    const raw = parseFloat(divAmt); if(!raw||raw<=0) return;
    const n = parseFloat(divBaht.toFixed(2)); if(!n||n<=0) return;
    const assetId = divAssetId ? parseInt(divAssetId) : null;
    const assetName = assetId ? (assets.find(a=>a.id===assetId)?.name||'') : '';
    // keep the dollar figure in the title — the stored amount is baht, and the
    // original is the only way to check the conversion later
    const auto = `ปันผล${assetName?` ${assetName}`:''}${divCur==='USD'?` $${raw}`:''}`;
    onDividend && onDividend({ walletId:divWalletId, targetAssetId:assetId, toAssetId:divToAssetId?parseInt(divToAssetId):null, amount:n, title:divTtl.trim()||auto, date:divDate });
    resetDiv();
  };
  // 🧮 banknote counter (cash wallets)
  const CASH_DENOMS = [1000,500,100,50,20,10,5,1];
  const cashCountSum = cc => CASH_DENOMS.reduce((s,d)=>s + d*(parseInt(cc?.[d])||0), 0);
  // greedy banknote breakdown of an amount → default fill from the wallet balance
  const cashBreakdown = amt => { let rem=Math.max(Math.round(amt||0),0); const m={}; for(const d of CASH_DENOMS){ const c=Math.floor(rem/d); if(c>0){ m[d]=c; rem-=c*d; } } return m; };
  const [countWalletId, setCountWalletId] = useState(null);
  const [countMap, setCountMap] = useState({});
  const countTotal = cashCountSum(countMap);
  const openCount = w => { setCountWalletId(w.id); setCountMap((w.cashCount&&cashCountSum(w.cashCount)>0)?{...w.cashCount}:cashBreakdown(w.balance)); resetAdj(); resetDiv(); };
  const resetCount = () => { setCountWalletId(null); setCountMap({}); };
  const saveCount = w => { onSaveCashCount && onSaveCashCount(w.id, {...countMap}); resetCount(); };
  const reconcileCount = w => {
    onSaveCashCount && onSaveCashCount(w.id, {...countMap});
    const delta = countTotal - w.balance;
    if(Math.abs(delta) >= 0.01 && onAdjust){
      const cashAsset = assets.find(a=>a.walletId===w.id && a.type==='cash');
      onAdjust({ walletId:w.id, targetAssetId: cashAsset?cashAsset.id:null, amount:delta, title:'นับแบงค์', date:today() });
    }
    resetCount();
  };
  const dragId = useRef(null);
  const [dragOverId, setDragOverId] = useState(null);
  const dragOverIdRef = useRef(null);
  const ghostEl = useRef(null);
  const touchGhostStart = useRef({top:0,y:0});

  const handleDragStart = (e, id) => { dragId.current=id; e.dataTransfer.effectAllowed='move'; };
  const handleDragOver  = (e, id) => { e.preventDefault(); setDragOverId(id); };
  const handleDrop      = (e, targetId) => {
    e.preventDefault();
    if(!dragId.current||dragId.current===targetId) return;
    const ids = wallets.map(w=>w.id);
    const fi=ids.indexOf(dragId.current), ti=ids.indexOf(targetId);
    const next=[...ids]; next.splice(fi,1); next.splice(ti,0,dragId.current);
    onReorder&&onReorder(next);
    dragId.current=null; setDragOverId(null);
  };
  const handleDragEnd = () => { dragId.current=null; setDragOverId(null); };

  const handleTouchStart = (e, id, currentWallets) => {
    if (!editOrder) return;
    dragId.current = id;
    const touch = e.touches[0];
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    Object.assign(ghost.style, {
      position:'fixed', top:rect.top+'px', left:rect.left+'px',
      width:rect.width+'px', opacity:'0.8', pointerEvents:'none',
      zIndex:'9999', transform:'scale(1.03)',
      boxShadow:'0 16px 40px rgba(0,0,0,0.3)', transition:'none',
    });
    document.body.appendChild(ghost);
    ghostEl.current = ghost;
    touchGhostStart.current = { top: rect.top, y: touch.clientY };
    el.style.opacity = '0.3';

    const onMove = (ev) => {
      ev.preventDefault();
      const t = ev.touches[0];
      const dy = t.clientY - touchGhostStart.current.y;
      ghost.style.top = (touchGhostStart.current.top + dy) + 'px';
      ghost.style.display = 'none';
      const under = document.elementFromPoint(t.clientX, t.clientY);
      ghost.style.display = '';
      const cardEl = under?.closest('[data-wallet-id]');
      if (cardEl) {
        const tid = Number(cardEl.dataset.walletId);
        if (tid !== dragId.current) { dragOverIdRef.current = tid; setDragOverId(tid); }
      }
    };
    const onEnd = () => {
      ghost.remove(); ghostEl.current = null;
      el.style.opacity = '';
      const targetId = dragOverIdRef.current;
      const srcId = dragId.current;
      dragId.current = null; dragOverIdRef.current = null; setDragOverId(null);
      if (targetId && targetId !== srcId) {
        const ids = currentWallets.map(w=>w.id);
        const fi = ids.indexOf(srcId), ti = ids.indexOf(targetId);
        if (fi !== -1 && ti !== -1) {
          const next = [...ids]; next.splice(fi,1); next.splice(ti,0,srcId);
          onReorder?.(next);
        }
      }
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove, { passive:false });
    document.addEventListener('touchend', onEnd);
  };
  const usdRate = parseFloat(localStorage.getItem('ft-usdrate')||'35');
  const [confirmEl, ask] = useConfirm(dk);
  const [filterType, setFilterType] = useState('all');
  const card = `rounded-2xl ${dk?'card-solid':'glass-light shadow-sm'}`;

  // Same ramp as ASSET_TYPES, for the same reason: five hues across five wallet
  // kinds made the page look like a chart legend before it looked like money.
  // Each card already names its own type, so the colour was never carrying it.
  // Must carry every key in WALLET_TYPES. A wallet whose type is missing here
  // falls back to a generic label and the default gold, which looks like a bug
  // rather than a gap — so new types get a colour off the same ramp as the
  // originals instead of a fresh hue.
  const TYPE_META = {
    bank:    { label:'บัญชีธนาคาร',  color:'#e8cf90', icon:<TypeIc n="bank" s={22}/> },
    stock:   { label:'พอร์ตหุ้น',     color:'#c9a94b', icon:<TypeIc n="stock" s={22}/> },
    crypto:  { label:'Crypto Wallet', color:'#a8894a', icon:<TypeIc n="crypto" s={22}/> },
    cash:    { label:'เงินสด',        color:'#7d6a3f', icon:<TypeIc n="cash" s={22}/> },
    credit:  { label:'บัตรเครดิต',    color:'#584b31', icon:<TypeIc n="credit" s={22}/> },
    ewallet: { label:'e-Wallet',      color:'#d4b876', icon:<TypeIc n="ewallet" s={22}/> },
    fund:    { label:'กองทุนรวม',     color:'#af924f', icon:<TypeIc n="fund" s={22}/> },
    fixed:   { label:'ฝากประจำ',      color:'#856b35', icon:<TypeIc n="fixed" s={22}/> },
    savings: { label:'เงินเก็บ/เป้าหมาย', color:'#c3a65f', icon:<TypeIc n="savings" s={22}/> },
    other:   { label:'อื่นๆ',          color:'#6b6154', icon:<TypeIc n="wallet" s={22}/> },
  };

  const now = new Date();
  const curM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const walletData = useMemo(()=>wallets.map(w=>{
    const linkedAssets = assets.filter(a=>a.walletId===w.id);
    // One event, one place to see it. Money moving through a wallet's own cash
    // asset is money moving through the wallet, so the wallet's list has to show
    // it — otherwise routing a transfer to the asset makes it vanish from the
    // wallet that received it, while the balance still changes.
    const ownAssetIds  = new Set(linkedAssets.map(a=>a.id));
    const touchesAsset = t => ownAssetIds.has(t.targetAssetId) || ownAssetIds.has(t.toAssetId) || ownAssetIds.has(t.fromAssetId);
    const wt           = txs.filter(t=>t.walletId===w.id || touchesAsset(t));
    // cash-type assets ARE the wallet's cash → fold into เงิน; non-cash stay as สินทรัพย์
    const cashAssets    = linkedAssets.filter(a=>a.type==='cash');
    const nonCashAssets = linkedAssets.filter(a=>a.type!=='cash');
    const cashAssetValue = cashAssets.reduce((s,a)=>s+assetVal(a,txs,usdRate),0);
    const walletCashOnly = walletCash(w, txs, assets); // wallet's own loose cash (initial + untagged txs)
    const cashBalance  = walletCashOnly + cashAssetValue;
    const assetValue   = nonCashAssets.reduce((s,a)=>s+assetVal(a,txs,usdRate),0);
    const balance      = cashBalance + assetValue;
    const mInc         = sumTxMonth(wt,'income',curM);
    const mExp         = sumTxMonth(wt,'expense',curM);
    const mAdj         = sumTxMonth(wt,'adjustment',curM);
    const mDiv         = sumTxMonth(wt,'dividend',curM);
    const mTransfer    = wt.filter(t=>t.type==='transfer'&&t.date.startsWith(curM)).reduce((s,t)=>s+t.amount,0);
    const prevBalance  = balance - mInc + mExp + mTransfer - mAdj - mDiv;
    let trendPct, trendLabel;
    if((w.type==='crypto'||w.type==='stock') && linkedAssets.length>0) {
      const costBasis = linkedAssets.reduce((s,a)=>s+(a.qty*a.avgCost*(a.currency==='USD'?usdRate:1)),0);
      trendPct = costBasis>0 ? (assetValue-costBasis)/costBasis*100 : 0;
      trendLabel = 'pnl';
    } else {
      trendPct = prevBalance!==0 ? (balance-prevBalance)/Math.abs(prevBalance)*100 : 0;
      trendLabel = 'month';
    }
    const allTxs = [...wt].sort((a,b)=>b.id-a.id);
    const recent = allTxs.slice(0,3);
    return { ...w, balance, cashBalance, walletCashOnly, cashAssetValue, assetValue, linkedAssets, mInc, mExp, txCount:wt.length, recent, allTxs, prevBalance, trendPct, trendLabel };
  }),[wallets,txs,assets,curM,usdRate]);

  const totalBalance  = useMemo(()=>walletData.reduce((s,w)=>s+w.balance,0),[walletData]);
  const cashTotal        = useMemo(()=>walletData.filter(w=>w.type==='bank'||w.type==='cash'||w.type==='credit').reduce((s,w)=>s+w.balance,0),[walletData]);
  const cryptoTotal      = useMemo(()=>walletData.filter(w=>w.type==='crypto').reduce((s,w)=>s+w.balance,0),[walletData]);
  const stockWalletTotal = useMemo(()=>walletData.filter(w=>w.type==='stock').reduce((s,w)=>s+w.balance,0),[walletData]);
  const hasCrypto        = useMemo(()=>walletData.some(w=>w.type==='crypto'),[walletData]);
  const walletIds     = useMemo(()=>new Set(wallets.map(w=>w.id)),[wallets]);
  const linkedStocks  = useMemo(()=>assets.filter(a=>(a.type==='stock'||a.type==='gold')&&walletIds.has(a.walletId)),[assets,walletIds]);
  const stockTotal    = useMemo(()=>linkedStocks.reduce((s,a)=>s+assetVal(a,txs,usdRate),0),[linkedStocks,txs,usdRate]);
  const stockCount    = linkedStocks.length;
  const hasStocks     = stockCount>0;

  return (
    <div className="space-y-4 fade-up">
      <PageHeader theme={theme} lead="All" accent="Wallets"
        sub={`${wallets.length} กระเป๋า · เงินสด บัญชีธนาคาร และวอลเล็ตคริปโต`}/>
      {/* Summary header */}
      <div className={`${card} p-5`}>
        <div className="flex flex-col gap-3">
          {/* Hero total + breakdown chips (same visual language as the Net Worth card) */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={`text-xs font-medium uppercase tracking-widest mb-1 ${dk?'text-slate-400':'text-slate-500'}`}>ยอดรวมกระเป๋าเงิน</p>
              <div className={`text-2xl lg:text-3xl font-bold tracking-tight ${dk?'text-white':'text-slate-800'}`}>{fmt(cashTotal+cryptoTotal+stockTotal)}</div>
              <p className={`text-xs mt-1 ${dk?'text-slate-400':'text-slate-500'}`}>{walletData.length} กระเป๋า{hasStocks?` · ${stockCount} สินทรัพย์`:''}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                {key:'cash',   icon:'💵', label:'เงินสด', val:cashTotal,   color:'#9AA374', show:true},
                {key:'crypto', icon:'🔐', label:'Crypto', val:cryptoTotal, color:'#DB5A6B', show:hasCrypto},
                {key:'stock',  icon:'📈', label:'หุ้น',   val:stockTotal,  color:'#26c6da', show:hasStocks},
              ].filter(c=>c.show).map(c=>{
                const grand = cashTotal+cryptoTotal+stockTotal;
                const pct = grand>0 ? (c.val/grand*100) : 0;
                return (
                  <div key={c.key} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${dk?'bg-white/5 border border-white/10':'bg-slate-50 border border-slate-200'}`}>
                    <span className="text-base leading-none">{c.icon}</span>
                    <div className="min-w-0">
                      <div className={`text-xs font-bold ${dk?'text-slate-100':'text-slate-700'}`}>{fmt(c.val)}</div>
                      <div className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>{c.label} · {pct.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <SegmentedProgress
            segments={[
              {type:'cash', val:Math.max(cashTotal,0), label:'เงินสด'},
              ...(hasCrypto?[{type:'crypto', val:cryptoTotal, label:'Crypto'}]:[]),
              ...(hasStocks?[{type:'stock', val:stockTotal, label:'หุ้น'}]:[]),
            ]}
            total={cashTotal+cryptoTotal+stockTotal}
            theme={theme}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* Filter pills — left */}
            <div className="flex gap-1.5 flex-wrap">
              {[
                {k:'all', l:'ทั้งหมด'},
                {k:'cash-group', l:'💵 เงินสด'},
                ...(walletData.some(w=>w.type==='stock')?[{k:'stock', l:'📈 พอร์ตหุ้น'}]:[]),
                ...(hasCrypto?[{k:'crypto', l:'🔐 Crypto'}]:[]),
              ].map(f=>(
                <button key={f.k} onClick={()=>setFilterType(f.k)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${filterType===f.k?(dk?'bg-gold-500/25 text-gold-300 border border-gold-500/40':'bg-gold-100 text-gold-600 border border-gold-200'):(dk?'bg-white/5 text-slate-400 border border-white/8 hover:bg-white/10':'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50')}`}>
                  {f.l}
                </button>
              ))}
            </div>
            {/* Action buttons — right */}
            <div className="flex gap-2">
              <button data-hint="ลากจัดลำดับกระเป๋าได้" onClick={()=>setEditOrder(o=>!o)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${editOrder?(dk?'border-gold-500/40 bg-gold-500/15 text-gold-300':'border-gold-300 bg-gold-50 text-gold-600'):(dk?'border-white/15 text-slate-400 hover:bg-white/8':'border-slate-200 text-slate-500 hover:bg-slate-50')}`}>
                ⠿ {editOrder?'เสร็จสิ้น':'เรียงลำดับ'}
              </button>
              {onUnifiedTransfer&&<button data-hint="โยกเงินระหว่างกระเป๋า/ลงทุน" onClick={onUnifiedTransfer}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${dk?'border-gold-500/50 text-gold-300 hover:bg-gold-500/15':'border-gold-300 text-gold-600 hover:bg-gold-50'}`}>
                💸 โยกเงิน
              </button>}
              <button data-hint="เพิ่มกระเป๋าใหม่ (บัญชี/เงินสด/พอร์ต/คริปโต)" onClick={()=>onOpenWalletModal(null)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-transparent transition-colors bg-gold-500 hover:bg-gold-600 text-white`}>
                <Ic n="plus" s={14}/> เพิ่มกระเป๋า
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── เงินที่ถือแทน / เงินฝาก (custodial — held for others, deducted from our net worth) ── */}
      {custodial.length===0 ? (
        <div className="flex justify-center">
          <button onClick={()=>setCustModal({open:true,editData:null})} title="เงินของคนอื่นที่คุณถือไว้ — แสดงแยกไว้เฉยๆ ไม่ปนกับเงินเรา" className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${dk?'text-slate-500 hover:text-amber-300 hover:bg-amber-500/10':'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}><span>🔒</span><Ic n="plus" s={11}/> เพิ่มเงินที่ถือแทน (เงินฝากคนอื่น)</button>
        </div>
      ) : (
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🔒</span>
            <h3 className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>เงินที่ถือแทน / เงินฝาก <span title="เงินของคนอื่นที่คุณถือไว้ (เงินฝาก/บริษัท) — แสดงแยกไว้เฉยๆ ไม่ปนกับเงินเรา ไม่หักออกจาก Net Worth" style={{cursor:'help',opacity:.7}}>ⓘ</span></h3>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${dk?'bg-amber-500/15 text-amber-400':'bg-amber-50 text-amber-600'}`}>ไม่ใช่เงินเรา</span>
          </div>
          <button onClick={()=>setCustModal({open:true,editData:null})} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors ${dk?'border-amber-500/40 text-amber-300 hover:bg-amber-500/10':'border-amber-300 text-amber-600 hover:bg-amber-50'}`}><Ic n="plus" s={12}/> เพิ่มเงินฝาก</button>
        </div>
        <div className={`flex items-baseline gap-2 mb-3 pb-3 border-b ${dk?'border-white/8':'border-slate-100'}`}>
              <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>ถืออยู่รวม</span>
              <span className="text-xl font-bold tabular-nums text-amber-500">{fmt(totalCust)}</span>
              <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>· {activeCust.length} รายการ</span>
            </div>
            <div className="space-y-1.5">
              {[...custodial].sort((a,b)=>(a.returned?1:0)-(b.returned?1:0)).map(c=>{
                const cw = wallets.find(x=>x.id===c.walletId);
                return (
                  <div key={c.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl ${c.returned?(dk?'bg-white/[0.02] opacity-50':'bg-slate-50 opacity-60'):(dk?'bg-amber-500/[0.06]':'bg-amber-50/60')}`}>
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${dk?'text-slate-200':'text-slate-700'} ${c.returned?'line-through':''}`}>{c.source}</div>
                      <div className={`text-[11px] truncate ${dk?'text-slate-500':'text-slate-400'}`}>{cw?`👛 ${cw.name}`:'ไม่ระบุกระเป๋า'}{c.date?` · ${c.date}`:''}{c.note?` · ${c.note}`:''}{c.returned?' · คืนแล้ว':''}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className={`text-sm font-bold tabular-nums mr-1 ${c.returned?'text-slate-400':'text-amber-500'}`}>{fmt(c.amount)}</span>
                      <button onClick={()=>toggleReturnedCust(c.id)} title={c.returned?'ทำเป็นยังไม่คืน':'ทำเครื่องหมายคืนแล้ว'} className={`text-xs px-1.5 py-1 rounded-lg ${c.returned?(dk?'text-emerald-400 hover:bg-emerald-500/10':'text-emerald-600 hover:bg-emerald-50'):(dk?'text-slate-500 hover:bg-white/10':'text-slate-400 hover:bg-slate-100')}`}>{c.returned?'↩':'✓'}</button>
                      <button onClick={()=>setCustModal({open:true,editData:c})} title="แก้ไข" className={`p-1 rounded-lg ${dk?'text-slate-500 hover:bg-white/10':'text-slate-400 hover:bg-slate-100'}`}><Ic n="edit" s={12}/></button>
                      <button onClick={()=>ask('ลบรายการเงินฝาก',`ลบ "${c.source}" ออกจากรายการเงินที่ถือแทน?`,()=>delCust(c.id))} title="ลบ" className={`p-1 rounded-lg ${dk?'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10':'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}><Ic n="trash" s={12}/></button>
                    </div>
                  </div>
                );
              })}
            </div>
      </div>
      )}
      <CustodialModal open={custModal.open} onClose={()=>setCustModal({open:false,editData:null})} onSave={saveCust} editData={custModal.editData} theme={theme} wallets={wallets}/>

      {/* One bar for the month, split by wallet. The previous version gave every
          row its own track, which meant five bars that could only be compared by
          eye, names clipped to 96px so two accounts at the same bank read as the
          same string, and no total or share anywhere. One stacked bar answers
          "where did it go" at a glance; the legend carries names at full width. */}
      {(()=>{
        const rows = [...walletData].filter(w=>w.mExp>0).sort((a,b)=>b.mExp-a.mExp);
        const total = rows.reduce((s,w)=>s+w.mExp,0);
        if (!total) return null;

        // A sliver under 5% is too thin to see on the bar and still costs a legend
        // row. Fold those together — but only from two up: collapsing a single
        // wallet into "อื่นๆ 1 กระเป๋า" hides its name and saves nothing.
        const small = rows.filter(w => w.mExp / total * 100 < 5);
        const fold  = small.length >= 2;
        const segs  = (fold ? rows.filter(w => w.mExp / total * 100 >= 5) : rows)
          .map((w, i) => ({ key: w.id, name: w.name, amt: w.mExp, clr: CAT_PALETTE[i % CAT_PALETTE.length] }));
        if (fold) segs.push({
          key: '_rest', name: `อื่นๆ ${small.length} กระเป๋า`,
          amt: small.reduce((s, w) => s + w.mExp, 0), clr: dk ? '#5b636e' : '#aab2bd',
        });

        return (
          <div className={`${card} px-3 py-2.5 mb-3`}>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <span className={`text-[11px] font-semibold ${dk?'text-white':'text-slate-700'}`}>รายจ่ายตามกระเป๋า · เดือนนี้</span>
              <span className={`text-xs font-bold tabular-nums ${dk?'text-white':'text-slate-800'}`}>{fmt(total)}</span>
            </div>

            {/* One bar per row, on equal tracks — the same shape the P/L card
                uses, so the two panels read the same way.

                The stacked bar that used to sit above this list is gone. It
                encoded the split, and then the list encoded it again as
                percentages, which is one fact drawn twice; and stretched across
                the full card a 4% wallet became a sliver two pixels wide,
                impossible to see and impossible to compare against anything.
                Equal tracks give the small wallet somewhere to stand, and give
                the eye a straight edge to read every row against.

                The total at the top right is what says these are parts of a
                whole, which is the one thing the stacked bar was better at. */}
            <div className="space-y-1.5">
              {segs.map(s=>{
                const pct = s.amt/total*100;
                return (
                  <div key={s.key} className="flex items-center gap-2 text-[11px]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:s.clr}}/>
                    <span className={`truncate flex-shrink-0 ${dk?'text-slate-300':'text-slate-600'}`} style={{width:'34%'}}>{s.name}</span>
                    <span className={`flex-1 h-1.5 rounded-full overflow-hidden min-w-0 ${dk?'bg-white/8':'bg-slate-100'}`}>
                      <span className="block h-full rounded-full transition-all duration-500" style={{width:`${pct}%`, background:s.clr}}/>
                    </span>
                    <span className={`font-semibold tabular-nums whitespace-nowrap ${dk?'text-white':'text-slate-700'}`}>{fmt(s.amt)}</span>
                    <span className={`w-9 text-right tabular-nums ${dk?'text-slate-500':'text-slate-400'}`}>{Math.round(pct)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {wallets.length===0 ? (
        <div className={`${card} p-10 text-center`}>
          <div className="text-5xl mb-4">👛</div>
          <p className={`text-base font-semibold mb-1 ${dk?'text-white':'text-slate-700'}`}>เริ่มต้นด้วยกระเป๋าเงินใบแรก</p>
          <p className={`text-xs mb-5 max-w-md mx-auto leading-relaxed ${dk?'text-slate-400':'text-slate-500'}`}>กระเป๋าเงินคือที่เก็บยอดเงินของคุณ เช่น บัญชีธนาคาร เงินสด พอร์ตหุ้น หรือ Crypto Wallet — สร้างใบแรกเพื่อเริ่มบันทึกรายรับ-รายจ่าย</p>
          <button onClick={()=>onOpenWalletModal(null)} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-600 text-white text-sm font-semibold"><Ic n="plus" s={14}/> เพิ่มกระเป๋าใบแรก</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* The เงินสด filter means "money I can spend", so the new everyday
              types belong in it. e-Wallet and a savings pot are spendable; a
              fixed deposit and a fund are not, and stay out — being unable to
              touch it without breaking it is the whole point of the category. */}
          {walletData.filter(w=>filterType==='all'||(filterType==='cash-group'&&['bank','cash','credit','ewallet','savings','other'].includes(w.type))||(filterType===w.type)).map(w=>{
            const meta = TYPE_META[w.type] || { label:w.type, color:'#c9a94b' };
            return (
              <div key={w.id}
                data-wallet-id={w.id}
                draggable={editOrder}
                onDragStart={e=>handleDragStart(e,w.id)}
                onDragOver={e=>handleDragOver(e,w.id)}
                onDrop={e=>handleDrop(e,w.id)}
                onDragEnd={handleDragEnd}
                onTouchStart={e=>handleTouchStart(e,w.id,wallets)}
                className={`${card} relative group overflow-hidden transition-all ${editOrder?'cursor-grab active:cursor-grabbing':''} ${dragOverId===w.id&&dragId.current!==w.id?'ring-2 ring-gold-400 scale-[1.01]':''}`}>
                {/* Color accent left bar */}
                <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl" style={{background:meta.color}}/>
                {editOrder&&<div className={`absolute top-3 left-4 text-lg select-none ${dk?'text-slate-500':'text-slate-300'}`}>⠿</div>}
                <div className="pl-5 pr-5 pt-5 pb-0">
                  {/* Action buttons */}
                  {/* z-20 keeps these above the card face below them. The face
                      paints its own stacking context for the grain and arcs, so
                      without it the buttons rendered but could not be clicked. */}
                  <div className={`absolute top-3 right-3 z-20 flex gap-1 transition-opacity ${editOrder?'opacity-0 pointer-events-none':'opacity-0 group-hover:opacity-100'}`}>
                    <button data-hint="แก้ไขกระเป๋า — เปิด/ปิดฟีเจอร์ นับแบงค์, รับปันผล ได้ที่นี่" title="แก้ไขกระเป๋า" onClick={()=>onOpenWalletModal(w)}
                      className={`p-1.5 rounded-lg ${dk?'hover:bg-white/15 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="edit" s={13}/></button>
                    <button title="ลบกระเป๋า" onClick={()=>ask('ลบกระเป๋าเงิน',`ยืนยันการลบกระเป๋า "${w.name}"? การดำเนินการนี้ไม่สามารถย้อนกลับได้`,()=>onDelete(w.id))}
                      className={`p-1.5 rounded-lg ${dk?'hover:bg-rose-500/20 text-slate-400 hover:text-rose-400':'hover:bg-rose-50 text-slate-400 hover:text-rose-500'}`}><Ic n="trash" s={13}/></button>
                  </div>
                  {/* Name, type, balance and the USD figure all moved onto the
                      card face above — they are what a real card shows, and
                      keeping a second copy underneath would have been the same
                      four facts printed twice. The month-on-month arrow stayed
                      gone: moving money between your own accounts swung it
                      wildly while nothing was earned or spent. */}
                  <WalletCardFace w={w} meta={meta} accent="#d4af45" hidden={hidden}
                    balanceText={fmtSigned(w.balance)}
                    usdText={'$'+(w.balance/usdRate).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}/>
                  <div className="mb-3">
                    {w.assetValue>0&&(
                      <div className={`flex items-center gap-1.5 mt-1 text-xs ${dk?'text-gold-400':'text-gold-500'}`}>
                        <span>📈</span>
                        <span>สินทรัพย์ {fmtSigned(w.assetValue)}</span>
                        {w.cashBalance!==0&&<span className={w.cashBalance<0?'text-rose-400 font-medium':(dk?'text-slate-500':'text-slate-400')}>· เงิน {fmtSigned(w.cashBalance)}</span>}
                      </div>
                    )}
                    {w.cashAssetValue>0&&(
                      <div className={`flex items-center gap-1.5 mt-1 text-xs ${dk?'text-emerald-400':'text-emerald-600'}`}>
                        <span>💵</span>
                        <span>ในสินทรัพย์ {fmtSigned(w.cashAssetValue)}</span>
                        {w.walletCashOnly!==0&&<span className={`font-medium ${w.walletCashOnly<0?'text-rose-400':(dk?'text-amber-400':'text-amber-600')}`}>· เงินในกระเป๋า {fmtSigned(w.walletCashOnly)}</span>}
                      </div>
                    )}
                    {/* The opening balance line is gone. It only appeared on a
                        wallet holding no assets, where it repeated the balance
                        already shown above it — the two figures are equal until
                        something is recorded against the wallet, and once
                        something is, the line disappears. */}
                    {/* Loose cash cannot really be negative — a wallet does not owe
                        itself money. Paired with a positive cash asset it means a
                        transfer was taken from the wallet while the money sat in the
                        asset: the total stays right, but neither side reflects reality. */}
                    {w.walletCashOnly<-0.01&&w.cashAssetValue>0&&(
                      <div className={`mt-1.5 text-[11px] leading-4 rounded-lg px-2 py-1.5 ${dk?'bg-amber-500/10 text-amber-300':'bg-amber-50 text-amber-700'}`}>
                        ⚠️ เงินสดติดลบเทียบกับสินทรัพย์ที่ผูกไว้ — น่าจะมีรายการโยกที่เลือกต้นทางเป็นกระเป๋า ทั้งที่เงินอยู่ในสินทรัพย์ (ยอดรวมยังถูก)
                      </div>
                    )}
                  </div>
                  {/* Custodial split — money in this wallet that isn't ours */}
                  {custByWallet[w.id]>0&&(
                    <div className="flex flex-wrap items-center gap-1.5 mb-3 -mt-1">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-lg ${dk?'bg-amber-500/15 text-amber-400':'bg-amber-50 text-amber-700'}`}>🔒 เงินฝาก {fmt(custByWallet[w.id])}</span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-lg ${dk?'bg-emerald-500/15 text-emerald-400':'bg-emerald-50 text-emerald-700'}`}>💚 เงินเรา {fmt(w.balance - custByWallet[w.id])}</span>
                    </div>
                  )}
                  {/* The share-of-total row is gone. Nothing is decided by
                      knowing one wallet holds 1.8% of everything — the bar at
                      the top of the page already carries the split, and here it
                      was a coloured line per card competing with the balance
                      above it. */}
                  {/* Month stats, on one line. This was three columns of label
                      over value — six lines to say what fits in one, on a card
                      whose point is the balance above it. "เดือนนี้" says once
                      what each of the three labels was repeating, and the two
                      figures are already signed and coloured, so naming them
                      รายรับ and รายจ่าย was telling the reader what the plus and
                      the minus had told them. */}
                  <div className={`flex items-baseline flex-wrap gap-x-2.5 gap-y-1 pt-2.5 border-t text-xs ${dk?'border-white/8':'border-slate-100'}`}>
                    <span className={dk?'text-slate-400':'text-slate-500'}>เดือนนี้</span>
                    <span className="font-semibold text-emerald-400">+{fmt(w.mInc)}</span>
                    <span className="font-semibold text-rose-400">-{fmt(w.mExp)}</span>
                    <span className={dk?'text-slate-500':'text-slate-400'}>· {w.txCount} รายการ</span>
                  </div>
                  {/* Transactions (collapsible, month-by-month) */}
                  {w.allTxs.length>0&&(()=>{
                    const selMonth = txMonthMap[w.id] || curM;
                    const monthTxs = w.allTxs.filter(t=>(t.date||'').startsWith(selMonth));
                    const [my,mm] = selMonth.split('-');
                    const isCurMonth = selMonth>=curM;
                    return (
                    <div className={`mt-3 pt-3 border-t ${dk?'border-white/8':'border-slate-100'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <button onClick={()=>stepTxMonth(w.id,selMonth,-1)} className={`p-1 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-500'}`}><Ic n="chevL" s={13}/></button>
                        <span className={`text-xs font-semibold ${dk?'text-slate-300':'text-slate-600'}`}>{MONTHS_TH[parseInt(mm)-1]} {my}</span>
                        <button onClick={()=>!isCurMonth&&stepTxMonth(w.id,selMonth,1)} disabled={isCurMonth}
                          className={`p-1 rounded-lg ${isCurMonth?'opacity-30 cursor-default':(dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-500')}`}><Ic n="chevR" s={13}/></button>
                      </div>
                      {monthTxs.length===0
                        ? <div className={`py-4 text-center text-xs ${dk?'text-slate-500':'text-slate-400'}`}>ไม่มีรายการเดือนนี้</div>
                        : <>
                      <div className="space-y-1">
                        {(expandedTxMap[w.id]?monthTxs:monthTxs.slice(0,3)).map(t=>(
                          <div key={t.id}
                            className={`flex items-center justify-between px-2 py-1 rounded-lg transition-colors group/tx ${dk?'hover:bg-white/8':'hover:bg-slate-50'}`}>
                            <span onClick={()=>onEditTx&&onEditTx(t)} className={`text-xs truncate flex-1 min-w-0 mr-2 ${onEditTx?'cursor-pointer':''} ${dk?'text-slate-400':'text-slate-500'}`}>{t.title}</span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className={`text-xs font-medium ${txAmtCls(t)}`}>
                                {txSign(t)}{fmt(Math.abs(t.amount))}
                              </span>
                              {onDeleteTx&&<button onClick={e=>{e.stopPropagation();onDeleteTx(t.id);}}
                                className={`opacity-0 group-hover/tx:opacity-100 transition-opacity p-0.5 rounded ${dk?'hover:bg-rose-500/20 text-slate-600 hover:text-rose-400':'hover:bg-rose-50 text-slate-300 hover:text-rose-400'}`}>
                                <Ic n="x" s={11}/>
                              </button>}
                            </div>
                          </div>
                        ))}
                      </div>
                      {monthTxs.length>3&&(
                        <button onClick={()=>toggleTxExpand(w.id)}
                          className={`w-full mt-1 mb-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${dk?'text-slate-500 hover:text-slate-300 hover:bg-white/5':'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                          {expandedTxMap[w.id]?'▲ ซ่อน':`▼ ดูทั้งหมด ${monthTxs.length} รายการ`}
                        </button>
                      )}
                      {monthTxs.length<=3&&<div className="pb-3"/>}
                        </>}
                    </div>
                    );
                  })()}
                  {w.linkedAssets.length>0&&(
                    <div className={`mt-2 pt-2 border-t pb-3 ${dk?'border-white/8':'border-slate-100'}`}>
                      <div className="space-y-1">
                        {(expandedAssetMap[w.id]?w.linkedAssets:w.linkedAssets.slice(0,4)).map(a=>{
                          const ti=typeInfo(a.type);
                          const av=assetVal(a,txs,usdRate);
                          return (
                            <div key={a.id} className={`group/ab flex items-center justify-between px-2 py-1 rounded-lg transition-colors ${dk?'hover:bg-white/8':'hover:bg-slate-50'}`}>
                              <span className={`flex items-center gap-1.5 text-xs truncate flex-1 min-w-0 mr-2 ${dk?'text-slate-300':'text-slate-600'}`}><AssetIcon a={a} ti={ti} size="sm"/><span className="truncate">{a.name}</span></span>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <div className="flex flex-col items-end leading-tight">
                                  <span className={`text-xs font-medium ${dk?'text-white':'text-slate-700'}`}>{fmt(av)}</span>
                                  {usdRate>0&&<span className={`text-[10px] tabular-nums ${dk?'text-slate-500':'text-slate-400'}`}>≈ {fmtA(av/usdRate,'USD')}</span>}
                                </div>
                                {onUnlinkAsset&&<button title="ถอดออกจากกระเป๋า" onClick={e=>{e.stopPropagation();onUnlinkAsset(a.id);}}
                                  className={`opacity-0 group-hover/ab:opacity-100 transition-opacity p-0.5 rounded ${dk?'hover:bg-rose-500/20 text-slate-600 hover:text-rose-400':'hover:bg-rose-50 text-slate-300 hover:text-rose-400'}`}>
                                  <Ic n="x" s={11}/>
                                </button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {w.linkedAssets.length>4&&(
                        <button onClick={()=>toggleAssetExpand(w.id)}
                          className={`w-full mt-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${dk?'text-slate-500 hover:text-slate-300 hover:bg-white/5':'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                          {expandedAssetMap[w.id]?'▲ ซ่อน':`▼ ดูทั้งหมด ${w.linkedAssets.length} สินทรัพย์`}
                        </button>
                      )}
                    </div>
                  )}
                  {w.cashCount && cashCountSum(w.cashCount)>0 && countWalletId!==w.id && (
                    <div className={`mt-2 pt-2 border-t text-[11px] pb-2 ${dk?'border-white/8 text-slate-400':'border-slate-100 text-slate-500'}`}>
                      🧮 {hidden ? '•••••' : CASH_DENOMS.filter(d=>parseInt(w.cashCount[d])>0).map(d=>`${w.cashCount[d]}×${d.toLocaleString('en-US')}`).join(' · ')}
                      <span className={`ml-1 font-semibold ${dk?'text-slate-300':'text-slate-600'}`}>= {fmt(cashCountSum(w.cashCount))}</span>
                    </div>
                  )}
                  {w.recent.length===0&&w.linkedAssets.length===0&&<div className="pb-2"/>}
                </div>
                {/* Adjustment inline form */}
                {adjWalletId===w.id&&(
                  <div className={`px-3 py-2.5 border-t space-y-2 ${dk?'border-white/8 bg-amber-500/5':'border-amber-100 bg-amber-50/60'}`} onClick={e=>e.stopPropagation()}>
                    <p className={`text-[11px] font-semibold ${dk?'text-amber-400':'text-amber-700'}`}>⚖ ปรับยอดกระเป๋า — ไม่นับเป็นรายรับ/รายจ่าย</p>
                    <div className="flex gap-1.5">
                      <input className={`flex-1 px-2 py-1.5 rounded-lg border text-xs outline-none ${dk?'bg-white/10 border-white/15 text-white placeholder-slate-500':'bg-white border-slate-300 text-slate-700 placeholder-slate-400'}`}
                        type="text" placeholder="เหตุผล / ชื่อรายการ" value={adjTtl} onChange={e=>setAdjTtl(e.target.value)}/>
                      <input className={`w-28 px-2 py-1.5 rounded-lg border text-xs outline-none ${dk?'bg-white/10 border-white/15 text-white placeholder-slate-500':'bg-white border-slate-300 text-slate-700 placeholder-slate-400'}`}
                        type="number" placeholder="±จำนวน" value={adjAmt} onChange={e=>setAdjAmt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveAdj()}/>
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <input className={`flex-1 px-2 py-1.5 rounded-lg border text-xs outline-none ${dk?'bg-white/10 border-white/15 text-white':'bg-white border-slate-300 text-slate-700'}`}
                        type="date" value={adjDate} onChange={e=>setAdjDate(e.target.value)}/>
                      <button onClick={resetAdj} className={`px-2.5 py-1.5 rounded-lg text-xs ${dk?'text-slate-400 hover:bg-white/10':'text-slate-500 hover:bg-slate-100'}`}>ยกเลิก</button>
                      <button onClick={saveAdj} disabled={adjAmt===''||isNaN(parseFloat(adjAmt))} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-40">บันทึก</button>
                    </div>
                  </div>
                )}
                {/* Dividend inline form */}
                {divWalletId===w.id&&(
                  <div className={`px-3 py-2.5 border-t space-y-2 ${dk?'border-white/8 bg-teal-500/5':'border-teal-100 bg-teal-50/60'}`} onClick={e=>e.stopPropagation()}>
                    <p className={`text-[11px] font-semibold ${dk?'text-teal-400':'text-teal-700'}`}>💰 บันทึกเงินปันผล</p>
                    <div className="flex gap-1.5">
                      <select className={`flex-1 px-2 py-1.5 rounded-lg border text-xs outline-none ${dk?'bg-[#1a1a2e] border-white/15 text-white':'bg-white border-slate-300 text-slate-700'}`}
                        value={divAssetId} onChange={e=>{ setDivAssetId(e.target.value); setDivTtl(''); }}>
                        <option value="">— หุ้น/กองทุน (ไม่บังคับ) —</option>
                        {assets.filter(a=>a.type!=='cash').map(a=><option key={a.id} value={a.id}>{a.name}{a.ticker?` (${a.ticker})`:''}</option>)}
                      </select>
                      <input className={`w-20 px-2 py-1.5 rounded-lg border text-xs outline-none ${dk?'bg-white/10 border-white/15 text-white placeholder-slate-500':'bg-white border-slate-300 text-slate-700 placeholder-slate-400'}`}
                        type="number" placeholder="จำนวน" min="0" value={divAmt} onChange={e=>setDivAmt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveDiv()}/>
                      <button type="button" onClick={()=>setDivCur(c=>c==='THB'?'USD':'THB')} title="สลับสกุลเงินที่กรอก"
                        className={`w-9 flex-shrink-0 rounded-lg text-xs font-bold transition-colors ${divCur==='USD'?'bg-teal-500 text-white':(dk?'bg-white/10 text-slate-400 hover:text-white':'bg-white border border-slate-300 text-slate-500 hover:text-slate-700')}`}>
                        {divCur==='USD'?'$':'฿'}
                      </button>
                    </div>
                    {divCur==='USD'&&(
                      <div className={`text-[11px] px-0.5 flex items-center justify-between ${dk?'text-teal-300':'text-teal-700'}`}>
                        <span>${(parseFloat(divAmt)||0).toLocaleString('en-US',{maximumFractionDigits:4})} × {divRateNow.toFixed(2)}</span>
                        <span className="font-semibold">บันทึกเป็น ฿{divBaht.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <input className={`flex-1 px-2 py-1.5 rounded-lg border text-xs outline-none ${dk?'bg-white/10 border-white/15 text-white placeholder-slate-500':'bg-white border-slate-300 text-slate-700 placeholder-slate-400'}`}
                        type="text" placeholder="ชื่อรายการ (ไม่บังคับ)" value={divTtl} onChange={e=>setDivTtl(e.target.value)}/>
                      <input className={`w-32 px-2 py-1.5 rounded-lg border text-xs outline-none ${dk?'bg-white/10 border-white/15 text-white':'bg-white border-slate-300 text-slate-700'}`}
                        type="date" value={divDate} onChange={e=>setDivDate(e.target.value)}/>
                    </div>
                    {/* Where the money landed, kept apart from which holding paid it.
                        A broker pays a dividend into its own cash balance, not into
                        your pocket — recording both facts on one row is what lets the
                        dividend card credit the right stock while the cash shows up
                        where it actually is. Only offered when this wallet has a cash
                        asset to receive it. */}
                    {(()=>{
                      const cashHere = assets.filter(a=>a.type==='cash' && String(a.walletId)===String(w.id));
                      if (!cashHere.length) return null;
                      return (
                        <select className={`w-full px-2 py-1.5 rounded-lg border text-xs outline-none ${dk?'bg-[#1a1a2e] border-white/15 text-white':'bg-white border-slate-300 text-slate-700'}`}
                          value={divToAssetId} onChange={e=>setDivToAssetId(e.target.value)}>
                          <option value="">💵 เงินเข้า: เงินสดในกระเป๋า</option>
                          {cashHere.map(a=><option key={a.id} value={a.id}>💵 เงินเข้า: {a.name}</option>)}
                        </select>
                      );
                    })()}
                    <div className="flex justify-end gap-1.5">
                      <button onClick={resetDiv} className={`px-2.5 py-1.5 rounded-lg text-xs ${dk?'text-slate-400 hover:bg-white/10':'text-slate-500 hover:bg-slate-100'}`}>ยกเลิก</button>
                      <button onClick={saveDiv} disabled={!parseFloat(divAmt)||parseFloat(divAmt)<=0} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-40">บันทึก</button>
                    </div>
                  </div>
                )}
                {/* Banknote counter inline form */}
                {countWalletId===w.id&&(
                  <div className={`px-3 py-2.5 border-t space-y-2 ${dk?'border-white/8 bg-emerald-500/5':'border-emerald-100 bg-emerald-50/60'}`} onClick={e=>e.stopPropagation()}>
                    <p className={`text-[11px] font-semibold ${dk?'text-emerald-400':'text-emerald-700'}`}>🧮 นับแบงค์ในกระเป๋า</p>
                    <div className="space-y-1">
                      {CASH_DENOMS.map(d=>{
                        const c=parseInt(countMap[d])||0;
                        return (
                          <div key={d} className="flex items-center gap-2 text-xs">
                            <span className={`w-12 text-right font-medium ${dk?'text-slate-300':'text-slate-600'}`}>฿{d.toLocaleString('en-US')}</span>
                            <span className={dk?'text-slate-500':'text-slate-400'}>×</span>
                            <input type="number" min="0" inputMode="numeric" value={countMap[d]??''} onChange={e=>setCountMap(m=>({...m,[d]:e.target.value}))}
                              className={`w-16 px-2 py-1 rounded-lg border text-xs outline-none ${dk?'bg-white/10 border-white/15 text-white placeholder-slate-500':'bg-white border-slate-300 text-slate-700 placeholder-slate-400'}`} placeholder="0"/>
                            <span className={`flex-1 text-right ${c>0?(dk?'text-white':'text-slate-700'):(dk?'text-slate-600':'text-slate-300')}`}>{c>0?fmt(d*c):'—'}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className={`flex items-center justify-between pt-1.5 border-t ${dk?'border-white/8':'border-emerald-100'}`}>
                      <span className={`text-xs font-semibold ${dk?'text-emerald-300':'text-emerald-700'}`}>รวม</span>
                      <span className={`text-sm font-bold ${dk?'text-white':'text-slate-800'}`}>{fmt(countTotal)}</span>
                    </div>
                    {Math.abs(countTotal-w.balance)>=0.01&&(
                      <div className={`text-[11px] ${dk?'text-amber-400':'text-amber-600'}`}>ต่างจากยอดกระเป๋า ({fmt(w.balance)}) อยู่ {countTotal>w.balance?'+':''}{fmt(countTotal-w.balance)}</div>
                    )}
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={resetCount} className={`px-2.5 py-1.5 rounded-lg text-xs ${dk?'text-slate-400 hover:bg-white/10':'text-slate-500 hover:bg-slate-100'}`}>ยกเลิก</button>
                      <button onClick={()=>saveCount(w)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${dk?'bg-white/10 hover:bg-white/15 text-white':'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}>บันทึกแบงค์</button>
                      {Math.abs(countTotal-w.balance)>=0.01&&<button onClick={()=>reconcileCount(w)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white">ตั้งยอด = {fmt(countTotal)}</button>}
                    </div>
                  </div>
                )}
                <div className={`flex border-t ${dk?'border-white/8':'border-slate-100'}`}>
                  {onAddTx&&(
                    <button data-hint="บันทึกรายรับ-รายจ่ายเข้ากระเป๋านี้" onClick={()=>onAddTx(w.id)}
                      className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${dk?'text-slate-400 hover:text-white hover:bg-white/5':'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                      <Ic n="plus" s={11}/> บันทึกรายการ
                    </button>
                  )}
                  {onAdjust&&(
                    <>
                      <div className={`w-px my-2 ${dk?'bg-white/10':'bg-slate-100'}`}/>
                      <button onClick={()=>{ adjWalletId===w.id?resetAdj():setAdjWalletId(w.id); resetDiv(); resetCount(); }}
                        className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${adjWalletId===w.id?(dk?'text-amber-400 bg-amber-500/10':'text-amber-600 bg-amber-50'):(dk?'text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/8':'text-amber-600/70 hover:text-amber-700 hover:bg-amber-50')}`}>
                        ⚖ ปรับยอด
                      </button>
                    </>
                  )}
                  {onSaveCashCount&&w.type==='cash'&&w.cashCount&&(
                    <>
                      <div className={`w-px my-2 ${dk?'bg-white/10':'bg-slate-100'}`}/>
                      <button onClick={()=>{ countWalletId===w.id?resetCount():openCount(w); }}
                        className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${countWalletId===w.id?(dk?'text-emerald-400 bg-emerald-500/10':'text-emerald-600 bg-emerald-50'):(dk?'text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-500/8':'text-emerald-600/70 hover:text-emerald-700 hover:bg-emerald-50')}`}>
                        🧮 นับแบงค์
                      </button>
                    </>
                  )}
                  {onDividend&&w.dividend&&(
                    <>
                      <div className={`w-px my-2 ${dk?'bg-white/10':'bg-slate-100'}`}/>
                      <button onClick={()=>{ divWalletId===w.id?resetDiv():setDivWalletId(w.id); resetAdj(); resetCount(); }}
                        className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${divWalletId===w.id?(dk?'text-teal-400 bg-teal-500/10':'text-teal-600 bg-teal-50'):(dk?'text-teal-500/70 hover:text-teal-400 hover:bg-teal-500/8':'text-teal-600/70 hover:text-teal-700 hover:bg-teal-50')}`}>
                        💰 ปันผล
                      </button>
                    </>
                  )}
                  {onAddAsset&&(
                    <>
                      {(onAddTx||onAdjust)&&<div className={`w-px my-2 ${dk?'bg-white/10':'bg-slate-100'}`}/>}
                      <button data-hint="เชื่อมสินทรัพย์เข้ากระเป๋าได้" onClick={()=>onAddAsset(w.id)}
                        className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${dk?'text-gold-400 hover:text-gold-300 hover:bg-gold-500/8':'text-gold-500 hover:text-gold-600 hover:bg-gold-50'}`}>
                        <Ic n="plus" s={11}/> เพิ่มสินทรัพย์
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ask() only sets state — without this the dialog never appeared, so
          "ลบกระเป๋า" and "ลบรายการเงินฝาก" did nothing at all when clicked */}
      {confirmEl}
    </div>
  );
};

// ── RECURRING MODAL ─────────────────────────────────────────
const RecurringModal = ({open, onClose, onSave, editData, theme, wallets=[], addLabel=false}) => {
  const dk = theme==='dark';
  const blank = {title:'', amount:'', category:'ที่พัก', type:'expense', day:1, method:'BANK', enabled:true, emoji:'', walletId:null};
  const [f, setF] = useState(blank);
  useEffect(()=>{
    if(editData) setF({...editData, amount:String(editData.amount), day:String(editData.day)});
    else setF(blank);
  },[editData, open]);
  const set = (k,v) => {
    const nf={...f,[k]:v};
    if(k==='type') nf.category = v==='income'?'เงินเดือน':'ที่พัก';
    setF(nf);
  };
  const save = () => {
    if(!f.title.trim()||!f.amount||parseFloat(f.amount)<=0) return;
    onSave({...f, amount:parseFloat(f.amount), day:Math.min(Math.max(parseInt(f.day)||1,1),31)});
    onClose();
  };
  if(!open) return null;
  const inp = `w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-600 focus:border-gold-500':'bg-slate-50 border-slate-200 text-slate-800 focus:border-gold-400'}`;
  const lbl = `text-xs font-medium mb-1.5 block ${dk?'text-slate-400':'text-slate-500'}`;
  // Portal → this modal renders inside a page wrapped in .fade-up, whose
  // lingering transform would otherwise capture position:fixed and push the
  // dialog below the viewport.
  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg" onClick={onClose}>
      <div className={`w-full max-w-md rounded-2xl shadow-2xl scale-in ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`} onClick={e=>e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dk?'border-white/8':'border-slate-100'}`}>
          <h2 className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>{editData&&!addLabel?'แก้ไขรายการประจำ':'เพิ่มรายการประจำ'}</h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="x" s={15}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className={`flex rounded-xl p-1 ${dk?'bg-white/5':'bg-slate-100'}`}>
            {['income','expense'].map(t=>(
              <button key={t} onClick={()=>set('type',t)} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${f.type===t?(t==='income'?'bg-gold-500 text-white':'bg-rose-500 text-white'):(dk?'text-slate-400':'text-slate-700')}`}>
                {t==='income'?'💰 รายรับ':'💸 รายจ่าย'}
              </button>))}
          </div>
          <div><label className={lbl}>ชื่อรายการ</label><input className={inp} placeholder="เช่น ค่าเช่า, Netflix" value={f.title} onChange={e=>set('title',e.target.value)}/></div>
          <div><label className={lbl}>จำนวน (฿)</label><input type="text" inputMode="decimal" className={inp} placeholder="0" value={fmtNumInput(f.amount)} onChange={e=>set('amount',e.target.value.replace(/,/g,''))}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>หมวดหมู่</label>
              <select className={inp} value={f.category} onChange={e=>set('category',e.target.value)}>
                {catOptions(f.type==='income'?INCOME_CATS:getExpenseCats(), f.category).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div><label className={lbl}>วันที่ตัดทุกเดือน (1–31)</label>
              <input type="number" min="1" max="31" className={inp} placeholder="1" value={f.day} onChange={e=>set('day',e.target.value)}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>ช่องทางชำระ</label>
              <select className={inp} value={f.method} onChange={e=>set('method',e.target.value)}>
                <option value="BANK">🏦 บัญชีธนาคาร</option>
                <option value="CREDIT">💳 บัตรเครดิต</option>
                <option value="CASH">💵 เงินสด</option>
              </select>
            </div>
            <div><label className={lbl}>ตัดจากกระเป๋า</label>
              <select className={inp} value={f.walletId||''} onChange={e=>set('walletId',e.target.value?parseInt(e.target.value):null)}>
                <option value="">ไม่ระบุ</option>
                {wallets.map(w=><option key={w.id} value={w.id}>{w.icon||'💼'} {w.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={lbl}>ไอคอน</label>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${dk?'bg-white/5 border border-white/10':'bg-slate-100 border border-slate-200'}`}>
                {f.emoji ? <CatGlyph v={f.emoji} s={21} color={catClr(f.category)}/> : <span className={dk?'text-slate-600':'text-slate-300'}>—</span>}
              </div>
              <input className={`${inp} flex-1`} placeholder="หรือพิมพ์ emoji เองก็ได้" value={CAT_SVG[f.emoji]?'':f.emoji} onChange={e=>set('emoji',e.target.value)} maxLength={2}/>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CAT_ICON_KEYS.map(e=>(
                <button key={e} type="button" onClick={()=>set('emoji',e)} title={e}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:scale-110 ${f.emoji===e?(dk?'bg-gold-500/30 ring-1 ring-gold-400':'bg-gold-50 ring-1 ring-gold-400'):(dk?'hover:bg-white/10':'hover:bg-slate-100')}`}>
                  <CatGlyph v={e} s={18} color={catClr(f.category)}/>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${dk?'bg-white/5 hover:bg-white/10 text-slate-300':'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>ยกเลิก</button>
          <button onClick={save} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white ${f.type==='income'?'bg-gold-500 hover:bg-gold-600':'bg-rose-500 hover:bg-rose-600'}`}>{editData&&!addLabel?'บันทึก':'เพิ่มรายการ'}</button>
        </div>
      </div>
    </div>
    </Portal>
  );
};

// ── ACCOUNT MODAL (profile / password) ─────────────────────
const AccountModal = ({open, onClose, theme, setTheme, colorTheme, setColorTheme, user, lockOn=false, onLockChange}) => {
  const dk = theme==='dark';
  const [dispName,setDispName] = useState(user?.displayName||'');
  const [pwSent,setPwSent]     = useState(false);
  const [nameSaved,setNameSaved] = useState(false);
  useEffect(()=>{ if(open){ setDispName(user?.displayName||''); setPwSent(false); setNameSaved(false); } },[open,user]);
  const sendReset = async()=>{ try{ await auth.sendPasswordResetEmail(user.email); setPwSent(true); }catch(e){ alert('เกิดข้อผิดพลาด: '+e.message); } };
  const saveDispName = async()=>{ try{ await auth.currentUser.updateProfile({displayName:dispName.trim()}); setNameSaved(true); setTimeout(()=>setNameSaved(false),2500); }catch(e){ alert('เกิดข้อผิดพลาด: '+e.message); } };
  if(!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
        <div className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl ${dk?'bg-slate-800 border border-white/10':'bg-white border border-slate-200'}`} onClick={e=>e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${dk?'bg-gold-500/20':'bg-gold-50'}`}>👤</div>
              <div>
                <div className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>Account</div>
                <div className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>จัดการบัญชีของคุณ</div>
              </div>
            </div>
            <button onClick={onClose} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="x" s={16}/></button>
          </div>
          <div className="mb-4">
            <div className={`text-xs mb-1.5 font-medium ${dk?'text-slate-400':'text-slate-500'}`}>ชื่อที่แสดง</div>
            <div className="flex gap-2">
              <input value={dispName} onChange={e=>{ setDispName(e.target.value); setNameSaved(false); }} placeholder="ชื่อ"
                className={`flex-1 px-3 py-2 rounded-xl text-sm border outline-none transition-colors ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-500 focus:border-gold-500':'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-gold-400'}`}/>
              <button onClick={saveDispName} className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${nameSaved?'bg-emerald-500/20 text-emerald-400':'bg-gold-500 hover:bg-gold-600'}`}>{nameSaved?<Ic n="check" s={14}/>:'บันทึก'}</button>
            </div>
          </div>
          <div className={`rounded-xl px-4 py-3 mb-4 ${dk?'bg-white/5':'bg-slate-50'}`}>
            <div className={`text-xs mb-1 ${dk?'text-slate-400':'text-slate-500'}`}>Email</div>
            <div className={`text-sm font-medium ${dk?'text-slate-200':'text-slate-700'}`}>{user?.email||'—'}</div>
          </div>
          {pwSent
            ? <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/15 text-emerald-400 text-sm"><Ic n="check" s={14}/>ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้วค่ะ</div>
            : <button onClick={sendReset} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-600 text-sm font-medium transition-colors"><Ic n="key" s={14}/>เปลี่ยนรหัสผ่าน</button>}
          <div className={`my-4 h-px ${dk?'bg-white/10':'bg-slate-100'}`}/>
          <button onClick={()=>setTheme(t=>t==='dark'?'light':'dark')}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors mb-4 ${dk?'bg-white/5 hover:bg-white/8 text-slate-200':'bg-slate-50 hover:bg-slate-100 text-slate-700'}`}>
            <span className="flex items-center gap-2"><Ic n={dk?'sun':'moon'} s={14}/>{dk?'โหมดสว่าง':'โหมดมืด'}</span>
            <span className={`text-xs ${dk?'text-slate-500':'text-slate-400'}`}>{dk?'Dark':'Light'}</span>
          </button>
          <div>
            {/* Deliberately worded as hiding, not securing. It keeps figures off
                the screen; it does not encrypt anything, and saying otherwise
                would be the one thing worse than not having it. */}
            <div className={`mb-4 p-3 rounded-xl border ${lockOn?(dk?'bg-gold-500/10 border-gold-500/30':'bg-gold-50 border-gold-200'):(dk?'bg-white/5 border-white/10':'bg-slate-50 border-slate-200')}`}>
              {/* Stacked, not side by side. The two buttons and the text were
                  competing for one row, so the description was squeezed into a
                  column four words wide and broke across six lines. */}
              <div className="flex flex-col gap-2.5">
                <div className="min-w-0">
                  <div className={`text-xs font-semibold ${dk?'text-white':'text-slate-700'}`}>{lockOn?'🔒':'🔓'} Passcode for balance privacy</div>
                  <div className={`text-[11px] mt-0.5 leading-snug ${dk?'text-slate-400':'text-slate-500'}`}>
                    {lockOn ? 'Amounts stay hidden on launch — passcode required to view. Stays unlocked for 30 minutes after you leave.'
                            : 'Set a passcode so tapping 👁 does not reveal amounts'}
                  </div>
                </div>
                <div className="flex-shrink-0 flex gap-1.5 flex-wrap">
                  {lockOn&&(
                    <button onClick={()=>{ onClose(); onLockChange&&onLockChange('change'); }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gold-500 hover:bg-gold-600">Change passcode</button>
                  )}
                  {/* Red because it is the one control here that removes the
                      protection — it looked like any other secondary button.
                      Outlined rather than solid: a settings row should not carry
                      two filled buttons competing, and gold stays the accent. */}
                  <button onClick={()=>{ onClose(); onLockChange&&onLockChange(lockOn?'off':'set'); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition-colors ${lockOn?(dk?'border-rose-500/40 text-rose-300 hover:bg-rose-500/10':'border-rose-300 text-rose-600 hover:bg-rose-50'):'bg-gold-500 hover:bg-gold-600 border-transparent'}`}>
                    {lockOn?'Turn off':'Set passcode'}
                  </button>
                </div>
              </div>
              <div className={`text-[10px] mt-2 leading-snug ${dk?'text-slate-500':'text-slate-400'}`}>
                ⓘ Visual masking only — nothing is encrypted. Backup files and cloud data stay readable.
              </div>
            </div>
            {/* The background picker is gone. A theme here only ever changed
                the page background: the gold accent, the slate text and the
                ten-colour category palette all stayed where they were, so
                every option but the first was that palette sitting on a
                background chosen for a different one. Three passable looks
                lose to one that was actually designed, and the picker was a
                standing cost on every screen added since.
                Light and dark remain — those are about the room you are in. */}
          </div>
          {/* Also reachable from the ☰ menu, but this is the first place anyone
              looks for it — the cost of having it twice is nothing next to the
              cost of hunting for it. */}
          {/* ซ่อน on the setup checklist wrote a flag and left no way back, and
              the person most likely to hit it by mistake is the new arrival who
              still needs the list. It disappears on its own once the three steps
              are done, so this is only ever needed by someone who dismissed it
              early — which is exactly who could not undo it before. */}
          {localStorage.getItem('ft-checklist-done')==='1' && (
            <button onClick={()=>{ try{localStorage.removeItem('ft-checklist-done');}catch{} location.reload(); }}
              className={`w-full mt-5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border ${dk?'border-white/10 text-slate-300 hover:bg-white/5':'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              แสดงรายการเริ่มต้นใช้งานอีกครั้ง
            </button>
          )}
          <button onClick={()=>{ onClose(); auth.signOut(); }}
            className={`w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border ${dk?'border-rose-500/25 text-rose-400 hover:bg-rose-500/10':'border-rose-200 text-rose-500 hover:bg-rose-50'}`}>
            <Ic n="logout" s={14}/>ออกจากระบบ
          </button>
          {/* Which build is running. Worth the two lines: the app redeploys often,
              so "it's broken" is only actionable once you know which version broke. */}
          <div className={`mt-4 pt-4 border-t text-center ${dk?'border-white/10':'border-slate-100'}`}>
            <div className={`text-[11px] ${dk?'text-slate-500':'text-slate-400'}`}>FinTracker</div>
            <div className={`text-[11px] font-mono tabular-nums ${dk?'text-slate-600':'text-slate-400'}`}>{APP_BUILD}</div>
          </div>
        </div>
      </div>
    </Portal>
  );
};

// ── TRASH MODAL (Recycle bin for deleted transactions) ──────
const TrashModal = ({open, onClose, theme, trash, wallets, assets, onRestore, onPurge, onClear}) => {
  const dk = theme==='dark';
  const wName = id => wallets.find(w=>w.id===id)?.name;
  const aName = id => assets.find(a=>a.id===id)?.name;
  // group transfer legs (shared linkedId) so a transfer shows/restores as one
  const groups = useMemo(()=>{
    const m=new Map();
    trash.forEach(t=>{ const k=t.linkedId||('x'+t.id); if(!m.has(k)) m.set(k,[]); m.get(k).push(t); });
    return [...m.values()].sort((a,b)=>(b[0]._deletedAt||0)-(a[0]._deletedAt||0));
  },[trash]);
  if(!open) return null;
  const when = ts => ts ? new Date(ts).toLocaleString('th-TH',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
  const typeLbl = t => t.type==='transfer'?'โยกเงิน':t.type==='income'?'รายรับ':t.type==='adjustment'?'ปรับยอด':t.type==='dividend'?'ปันผล':'รายจ่าย';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg" onClick={onClose}>
      <div className={`w-full max-w-md rounded-2xl shadow-2xl scale-in ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`} onClick={e=>e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dk?'border-white/8':'border-slate-100'}`}>
          <h2 className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>🗑 ถังขยะ <span className={`text-xs font-normal ${dk?'text-slate-500':'text-slate-400'}`}>({trash.length})</span></h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="x" s={15}/></button>
        </div>
        <div className="px-5 py-4">
          {trash.length===0 ? (
            <div className={`text-center py-10 text-sm ${dk?'text-slate-500':'text-slate-400'}`}>
              <div className="text-3xl mb-2">✓</div>ถังขยะว่าง<br/><span className="text-xs">รายการที่ลบจะมาแสดงที่นี่ (เก็บล่าสุด 200 รายการ)</span>
            </div>
          ) : (
            <>
              <div className="max-h-80 overflow-auto space-y-2">
                {groups.map(g=>{
                  const t=g[0]; const ids=g.map(x=>x.id);
                  const aid=t.targetAssetId||t.toAssetId||t.fromAssetId;
                  const loc=[]; if(t.walletId&&wName(t.walletId))loc.push(wName(t.walletId)); if(t.toWalletId&&t.toWalletId!==t.walletId&&wName(t.toWalletId))loc.push('→ '+wName(t.toWalletId)); if(aid&&aName(aid))loc.push('📦 '+aName(aid));
                  return (
                    <div key={ids.join('-')} className={`p-2.5 rounded-xl text-xs ${dk?'bg-white/5':'bg-slate-50'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className={`font-medium truncate ${dk?'text-slate-200':'text-slate-700'}`}>{t.title||typeLbl(t)} · ฿{Math.abs(t.amount).toLocaleString('th-TH')}</div>
                          <div className={`${dk?'text-slate-500':'text-slate-400'}`}>{typeLbl(t)}{loc.length?' · '+loc.join(' '):''}{g.length>1?` · ${g.length} ฝั่ง`:''}</div>
                          <div className={`${dk?'text-slate-500':'text-slate-400'}`}>ลบเมื่อ {when(t._deletedAt)}{t.date?` · ของวันที่ ${t.date}`:''}</div>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button onClick={()=>onRestore(ids)} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-600 text-white">↩ กู้คืน</button>
                          <button onClick={()=>onPurge(ids)} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium ${dk?'text-slate-500 hover:bg-white/10':'text-slate-400 hover:bg-slate-100'}`}>ลบถาวร</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={onClear} className={`w-full mt-3 py-2 rounded-xl text-xs font-medium ${dk?'text-rose-400 hover:bg-rose-500/10':'text-rose-500 hover:bg-rose-50'}`}>ล้างถังขยะทั้งหมด</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── BACKUP MODAL (JSON Export / Restore) ────────────────────
const BackupModal = ({open, onClose, onRestore, theme, txs, assets, wallets, debts, nwHistory, custodial=[]}) => {
  const dk = theme==='dark';
  const [tab, setTab] = useState('export');
  const [fileData, setFileData] = useState(null);
  const [error, setError] = useState('');
  const [pass, setPass]       = useState('');   // export passphrase — blank = plain file
  const [pass2, setPass2]     = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy]       = useState('');
  const [encFile, setEncFile] = useState(null); // encrypted envelope awaiting its passphrase
  const [unlockPass, setUnlockPass] = useState('');
  // Closing clears the passphrases as well as the panel state: leaving one in a
  // state variable outlives the reason it was typed.
  useEffect(()=>{ if(!open){ setTab('export'); setFileData(null); setError('');
    setPass(''); setPass2(''); setShowPass(false); setEncFile(null); setUnlockPass(''); setBusy(''); } },[open]);

  const inp = `w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none ${dk?'bg-white/5 border-white/10 text-white':'bg-slate-50 border-slate-200 text-slate-800'}`;
  const sel = `w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none ${dk?'bg-[#0c1018] border-white/10 text-white':'bg-slate-50 border-slate-200 text-slate-800'}`;

  const handleExport = async () => {
    const data = {
      version: 2, exportedAt: new Date().toISOString(),
      txs, assets, wallets, debts, nwHistory, custodial,
      budgets:    JSON.parse(localStorage.getItem('ft-budgets')       || 'null') || {},
      budgetHistory:   JSON.parse(localStorage.getItem('ft-budget-history')    || 'null') || {},
      catMeta:         JSON.parse(localStorage.getItem('ft-cat-meta')           || 'null') || {},
      importCatMemory: JSON.parse(localStorage.getItem('ft-import-cat-memory')  || 'null') || {},
      irregularCats: JSON.parse(localStorage.getItem('ft-cat-irregular')  || 'null') || {},
      recurring:  JSON.parse(localStorage.getItem('ft-recurring')     || 'null') || [],
      walletOrder:JSON.parse(localStorage.getItem('ft-wallet-order')  || 'null') || [],
      usdrate:    parseFloat(localStorage.getItem('ft-usdrate')       || '35'),
      theme:      localStorage.getItem('ft-theme')                               || 'light',
      colorTheme: localStorage.getItem('ft-color-theme')                         || 'terminal',
    };
    // A mistyped passphrase cannot be discovered later — the file simply never
    // opens again — so it is confirmed here rather than trusted.
    if (pass && pass !== pass2) { setError('รหัสสองช่องไม่ตรงกัน'); return; }

    let out = data, ext = 'json';
    if (pass) {
      try {
        setBusy('กำลังเข้ารหัส…'); setError('');
        out = await encryptBackup(data, pass);
        ext = 'enc.json';
      } catch {
        setBusy(''); setError('เข้ารหัสไม่สำเร็จ — ไฟล์ยังไม่ถูกบันทึก'); return;
      }
      setBusy('');
    }

    const blob = new Blob([JSON.stringify(out,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fintracker-backup-${new Date().toISOString().slice(0,10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    setPass(''); setPass2(''); setError('');
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        // An encrypted file carries no txs/assets to inspect until it is opened,
        // so it takes a different path rather than failing the shape check.
        if (isEncryptedBackup(d)) {
          setEncFile(d); setFileData(null); setUnlockPass(''); setError('');
          return;
        }
        setEncFile(null);
        if (!d.version||!d.txs||!d.assets) { setError('ไฟล์ไม่ถูกต้อง — ต้องเป็น FinTracker backup JSON'); setFileData(null); return; }
        setFileData(d); setError('');
      } catch { setError('ไม่สามารถอ่านไฟล์ได้'); setFileData(null); setEncFile(null); }
    };
    reader.readAsText(f);
  };

  // AES-GCM fails closed: a wrong passphrase throws rather than returning
  // wrong-looking records, so there is nothing to validate afterwards.
  const handleUnlock = async () => {
    if (!encFile || !unlockPass) return;
    setBusy('กำลังถอดรหัส…'); setError('');
    try {
      const d = await decryptBackup(encFile, unlockPass);
      if (!d.version||!d.txs||!d.assets) throw new Error('shape');
      setFileData(d); setEncFile(null); setUnlockPass(''); setError('');
    } catch {
      setError('รหัสไม่ถูกต้อง หรือไฟล์เสียหาย');
    }
    setBusy('');
  };

  // Restoring replaces everything and then uploads, so a wrong file taken from
  // the downloads folder wipes the live data on every device with one click.
  // The panel used to show only what was in the file — nothing to compare it
  // against — so a backup holding 22 records looked no different from one
  // holding 410. Show both sides, and make a shrinking restore say so out loud.
  const cur = { txs: txs?.length||0, assets: assets?.length||0 };
  const inc = { txs: fileData?.txs?.length||0, assets: fileData?.assets?.length||0 };
  const shrinks = !!fileData && (inc.txs < cur.txs || inc.assets < cur.assets);
  const handleRestore = () => {
    if (!fileData) return;
    const lost = Math.max(0, cur.txs - inc.txs);
    const warn = shrinks
      ? `⚠️ ไฟล์นี้มีข้อมูลน้อยกว่าที่มีอยู่ตอนนี้\n\n`
        + `รายการ   ${cur.txs} → ${inc.txs}` + (lost ? `   (หาย ${lost})` : '') + `\n`
        + `สินทรัพย์ ${cur.assets} → ${inc.assets}\n\n`
        + `ข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด และส่งขึ้นคลาวด์ทับทุกเครื่อง\nกู้กลับไม่ได้\n\nยืนยันหรือไม่?`
      : `กู้คืนจากไฟล์วันที่ ${fileData.exportedAt?.slice(0,10)||'-'}\n\n`
        + `รายการ   ${cur.txs} → ${inc.txs}\n`
        + `สินทรัพย์ ${cur.assets} → ${inc.assets}\n\n`
        + `ข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด\n\nยืนยันหรือไม่?`;
    if (!window.confirm(warn)) return;
    onRestore(fileData);
    onClose();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg" onClick={onClose}>
      <div className={`w-full max-w-md rounded-2xl shadow-2xl scale-in ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`} onClick={e=>e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dk?'border-white/8':'border-slate-100'}`}>
          <h2 className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>💾 Backup & Restore</h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="x" s={15}/></button>
        </div>
        {/* Tabs */}
        <div className={`flex border-b ${dk?'border-white/8':'border-slate-100'}`}>
          {[['export','📤 Export'],['import','📥 Import']].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab===t?(dk?'text-amber-400 border-b-2 border-amber-400':'text-amber-600 border-b-2 border-amber-500'):(dk?'text-slate-500 hover:text-slate-300':'text-slate-400 hover:text-slate-600')}`}>{l}</button>
          ))}
        </div>
        <div className="px-5 py-4">
          {tab==='export' ? (
            <div className="space-y-3">
              <div className={`p-3 rounded-xl text-xs space-y-1 ${dk?'bg-white/5 text-slate-400':'bg-slate-50 text-slate-500'}`}>
                <div className="flex justify-between"><span>รายการ</span><span className="font-semibold">{txs.length} รายการ</span></div>
                <div className="flex justify-between"><span>สินทรัพย์</span><span className="font-semibold">{assets.length} รายการ</span></div>
                <div className="flex justify-between"><span>กระเป๋าเงิน</span><span className="font-semibold">{wallets.length} ใบ</span></div>
                <div className="flex justify-between"><span>หนี้สิน</span><span className="font-semibold">{debts.length} รายการ</span></div>
              </div>
              <p className={`text-xs ${dk?'text-slate-500':'text-slate-400'}`}>บันทึกข้อมูลทั้งหมดเป็นไฟล์ .json สำหรับ backup หรือย้ายข้อมูลระหว่างอุปกรณ์ค่ะ</p>

              <div className={`p-3 rounded-xl space-y-2 ${dk?'bg-white/5':'bg-slate-50'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${dk?'text-slate-300':'text-slate-600'}`}>🔐 ใส่รหัสไฟล์ <span className="font-normal opacity-60">(ไม่ใส่ก็ได้)</span></span>
                  <button type="button" onClick={()=>setShowPass(v=>!v)} className={`text-xs px-2 py-0.5 rounded-lg ${dk?'text-slate-400 hover:bg-white/10':'text-slate-400 hover:bg-slate-200'}`}>{showPass?'🙈 ซ่อน':'👁 ดู'}</button>
                </div>
                <input type={showPass?'text':'password'} value={pass} onChange={e=>{setPass(e.target.value);setError('');}}
                  autoComplete="new-password" placeholder="รหัสสำหรับเปิดไฟล์นี้" className={inp}/>
                {pass && (
                  <input type={showPass?'text':'password'} value={pass2} onChange={e=>{setPass2(e.target.value);setError('');}}
                    autoComplete="new-password" placeholder="พิมพ์รหัสอีกครั้ง" className={inp}/>
                )}
                <p className={`text-xs leading-relaxed ${pass?(dk?'text-amber-400':'text-amber-600'):(dk?'text-slate-500':'text-slate-400')}`}>
                  {pass
                    ? '⚠️ ลืมรหัสนี้ = เปิดไฟล์ไม่ได้ตลอดไป ไม่มีรหัสสำรอง ไม่มีทางกู้'
                    : 'เว้นว่าง = ไฟล์ธรรมดา เปิดอ่านได้ทันที · ใส่รหัส = เข้ารหัสจริง ต้องมีรหัสถึงเปิดได้'}
                </p>
                <p className={`text-xs ${dk?'text-slate-500':'text-slate-400'}`}>คนละรหัสกับล็อกหน้าจอ — จะใช้รหัสเดียวกันก็ได้ค่ะ</p>
              </div>

              {error && <p className="text-xs text-rose-400">{error}</p>}
              <button onClick={handleExport} disabled={!!busy} className="w-full py-2.5 rounded-xl text-sm font-semibold btn-primary disabled:opacity-50">
                {busy || (pass ? '🔐 ดาวน์โหลด Backup (เข้ารหัส)' : '⬇ ดาวน์โหลด Backup')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dk?'border-white/15 hover:border-amber-500/40':'border-slate-200 hover:border-amber-300'}`}>
                <input type="file" accept=".json" onChange={handleFile} className="absolute opacity-0 w-px h-px" id="backup-file"/>
                <label htmlFor="backup-file" className="cursor-pointer">
                  <div className="text-2xl mb-1">📂</div>
                  <div className={`text-xs font-medium ${dk?'text-slate-400':'text-slate-500'}`}>คลิกเพื่อเลือกไฟล์ .json</div>
                </label>
              </div>
              {encFile && (
                <div className={`p-3 rounded-xl space-y-2 ${dk?'bg-white/5 border border-amber-500/20':'bg-amber-50 border border-amber-200'}`}>
                  <div className={`text-xs font-semibold ${dk?'text-amber-300':'text-amber-700'}`}>🔐 ไฟล์นี้เข้ารหัสไว้</div>
                  <div className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>Backup วันที่ {encFile.exportedAt?.slice(0,10)||'-'}</div>
                  <div className="flex gap-2">
                    <input type={showPass?'text':'password'} value={unlockPass}
                      onChange={e=>{setUnlockPass(e.target.value);setError('');}}
                      onKeyDown={e=>{ if(e.key==='Enter') handleUnlock(); }}
                      autoComplete="off" placeholder="ใส่รหัสของไฟล์นี้" className={inp}/>
                    <button type="button" onClick={()=>setShowPass(v=>!v)} className={`px-2.5 rounded-xl text-xs shrink-0 ${dk?'text-slate-400 hover:bg-white/10':'text-slate-400 hover:bg-slate-200'}`}>{showPass?'🙈':'👁'}</button>
                  </div>
                  <button onClick={handleUnlock} disabled={!unlockPass||!!busy}
                    className="w-full py-2 rounded-xl text-xs font-semibold btn-primary disabled:opacity-40">
                    {busy || '🔓 ถอดรหัส'}
                  </button>
                </div>
              )}
              {error && <p className="text-xs text-rose-400">{error}</p>}
              {fileData && (
                <div className={`p-3 rounded-xl text-xs space-y-1 ${dk?'bg-amber-500/10 border border-amber-500/20 text-amber-300':'bg-amber-50 border border-amber-200 text-amber-700'}`}>
                  <div className="font-semibold mb-1.5">ตอนนี้ → หลังกู้คืน</div>
                  <div className="flex justify-between"><span>รายการ</span>
                    <span className={inc.txs<cur.txs?'font-bold text-rose-400':''}>{cur.txs} → {inc.txs}</span></div>
                  <div className="flex justify-between"><span>สินทรัพย์</span>
                    <span className={inc.assets<cur.assets?'font-bold text-rose-400':''}>{cur.assets} → {inc.assets}</span></div>
                  <div className="flex justify-between"><span>Backup วันที่</span><span>{fileData.exportedAt?.slice(0,10)||'-'}</span></div>
                  {shrinks
                    ? <p className="text-xs mt-2 font-semibold text-rose-400">🚨 ไฟล์นี้มีข้อมูลน้อยกว่าปัจจุบัน — ตรวจวันที่ให้แน่ใจก่อน</p>
                    : <p className="text-xs mt-2 opacity-75">⚠ ข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด</p>}
                </div>
              )}
              <button onClick={handleRestore} disabled={!fileData} className="w-full py-2.5 rounded-xl text-sm font-semibold btn-primary disabled:opacity-40">🔄 กู้คืนข้อมูล</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── IMPORT MODAL ────────────────────────────────────────────
const ImportModal = ({open, onClose, onImport, theme}) => {
  const dk = theme==='dark';
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [step, setStep] = useState(1);

  const parse = () => {
    const memory = getImportCatMemory();
    const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
    const parsed = lines.map((line,i)=>{
      const nums  = line.match(/[\d,]+\.?\d*/g)?.map(n=>parseFloat(n.replace(/,/g,'')));
      const amount = nums?.find(n=>n>0&&n<10000000)||0;
      const dm = line.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
      let date = today();
      if(dm){ const y=dm[3]?dm[3].length===2?'20'+dm[3]:dm[3]:String(new Date().getFullYear()); date=`${y}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`; }
      const title = line.replace(/[\d,]+\.?\d*/g,'').replace(/\d{1,2}[\/\-]\d{1,2}[\/\-]?\d*/g,'').replace(/[,;]+/g,' ').replace(/\s+/g,' ').trim().substring(0,40)||`รายการ ${i+1}`;
      const category = guessImportCat(title, memory) || 'อื่นๆ';
      return {id:uid(), title, amount, date, category, type:'expense', notes:'', _on:true};
    }).filter(r=>r.amount>0);
    setRows(parsed); if(parsed.length) setStep(2);
  };

  const toggle   = id => setRows(rs=>rs.map(r=>r.id===id?{...r,_on:!r._on}:r));
  const flipType = id => setRows(rs=>rs.map(r=>r.id===id?{...r,type:r.type==='income'?'expense':'income',category:r.type==='income'?'อื่นๆ':'เงินเดือน'}:r));
  const setCat   = (id,category) => setRows(rs=>rs.map(r=>r.id===id?{...r,category}:r));
  const doImport = () => {
    const on = rows.filter(r=>r._on);
    on.forEach(r=>rememberImportCat(r.title, r.category)); // learn/reinforce for next time
    onImport(on.map(({_on,...r})=>r)); setText('');setRows([]);setStep(1);onClose();
  };
  const reset    = () => { setStep(1);setText('');setRows([]); };
  const fileRef  = useRef(null);
  const onFile   = e => {
    const f = e.target.files?.[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = ev => setText(String(ev.target.result||''));
    reader.readAsText(f);
    e.target.value = '';
  };

  if(!open) return null;
  const inp = `w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-600':'bg-slate-50 border-slate-200 text-slate-800'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg" onClick={onClose}>
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl scale-in ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`} onClick={e=>e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dk?'border-white/8':'border-slate-100'}`}>
          <h2 className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>📥 นำเข้าข้อมูล</h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}><Ic n="x" s={15}/></button>
        </div>
        {step===1?(
          <div className="p-5 space-y-4">
            <p className={`text-xs leading-5 ${dk?'text-slate-400':'text-slate-500'}`}>วาง text จาก Statement ธนาคาร ระบบจะอ่านวันที่และจำนวนเงินอัตโนมัติ</p>
            <textarea className={`${inp} h-44 resize-none`} placeholder={'01/05 ร้านข้าว 85.00\n02/05 Grab 129.00\n05/05 เงินเดือน 400000'} value={text} onChange={e=>setText(e.target.value)}/>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} className="hidden"/>
            <button onClick={()=>fileRef.current?.click()} className={`w-full py-2 rounded-xl text-xs font-medium border border-dashed ${dk?'border-white/15 text-slate-400 hover:bg-white/5':'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>📎 หรืออัปโหลดไฟล์ CSV / TXT</button>
            <div className="flex gap-3">
              <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${dk?'bg-white/5 text-slate-300':'bg-slate-100 text-slate-600'}`}>ยกเลิก</button>
              <button onClick={parse} disabled={!text.trim()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold btn-primary text-white disabled:opacity-40">อ่านข้อมูล →</button>
            </div>
          </div>
        ):(
          <div className="p-5 space-y-3">
            <p className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>พบ {rows.filter(r=>r._on).length} รายการ — คลิก รับ/จ่าย เพื่อเปลี่ยนประเภท, เลือกหมวดได้ก่อนนำเข้า (ครั้งหน้าจำให้อัตโนมัติ)</p>
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {rows.map(r=>(
                <div key={r.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${r._on?(dk?'border-gold-500/25 bg-gold-500/5':'border-gold-100 bg-gold-50/50'):(dk?'border-white/5 opacity-40':'border-slate-100 opacity-40')}`}>
                  <input type="checkbox" checked={r._on} onChange={()=>toggle(r.id)} className="rounded flex-shrink-0 cursor-pointer"/>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={()=>toggle(r.id)}>
                    <div className={`text-xs font-medium truncate ${dk?'text-white':'text-slate-700'}`}>{r.title}</div>
                    <div className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>{r.date}</div>
                  </div>
                  {r.type!=='income'&&(
                    <select value={r.category} onClick={e=>e.stopPropagation()} onChange={e=>setCat(r.id,e.target.value)}
                      className={`text-[10px] px-1.5 py-1 rounded-lg border outline-none flex-shrink-0 max-w-[92px] ${dk?'bg-white/5 border-white/10 text-slate-300':'bg-white border-slate-200 text-slate-600'}`}>
                      {catOptions(getExpenseCats(), r.category).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  <button onClick={e=>{e.stopPropagation();flipType(r.id);}} className={`px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 transition-colors ${r.type==='income'?'bg-gold-500/20 text-gold-400':'bg-rose-500/20 text-rose-400'}`}>{r.type==='income'?'รับ':'จ่าย'}</button>
                  <span className={`text-xs font-semibold flex-shrink-0 ${r.type==='income'?'text-gold-400':'text-rose-400'}`}>{fmt(r.amount)}</span>
                </div>))}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={reset} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${dk?'bg-white/5 text-slate-300':'bg-slate-100 text-slate-600'}`}>← กลับ</button>
              <button onClick={doImport} disabled={!rows.some(r=>r._on)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold btn-primary text-white disabled:opacity-40">นำเข้า {rows.filter(r=>r._on).length} รายการ</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


// ── VERIFY EMAIL ───────────────────────────────────────────
// Its own component so it can hold a hook: an early return inside App cannot.
//
// Firebase tells nobody when an address gets verified — the record changes
// server-side and every open tab carries on believing what it was told at
// sign-in. That matters because the link is usually opened on a phone while the
// sign-up is sitting on a laptop, and the laptop would otherwise wait forever
// on a screen asking for something already done. Asking every few seconds costs
// one small request while someone is looking at this page and nothing at all
// afterwards.
const VerifyEmail = ({ user, dk, addToast }) => {
  const [checking, setChecking] = useState(false);
  // Firebase sends from noreply@<project>.firebaseapp.com, a domain with no
  // sending history, and the first message from one lands in spam often enough
  // that saying nothing loses people who simply never find it. But leading with
  // the word to everybody plants a doubt about the app in the same breath as
  // asking for their email. So it waits: whoever got the mail in five seconds
  // never sees it, and whoever is still sitting here is exactly who needs it.
  const [slow, setSlow] = useState(false);
  useEffect(()=>{ const t = setTimeout(()=>setSlow(true), 10000); return ()=>clearTimeout(t); },[]);

  const check = useCallback(async (quiet) => {
    try { await user.reload(); } catch { return false; }
    if (auth.currentUser?.emailVerified) { location.reload(); return true; }
    if (!quiet) addToast('ยังไม่พบการยืนยัน กรุณาเปิดลิงก์ในอีเมลก่อน','err');
    return false;
  },[user, addToast]);

  useEffect(()=>{
    const t = setInterval(()=>check(true), 4000);
    // Coming back to the tab is the most likely moment for it to have happened
    const onShow = ()=>{ if(document.visibilityState==='visible') check(true); };
    document.addEventListener('visibilitychange', onShow);
    return ()=>{ clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  },[check]);

  return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${dk?'bg-app':'bg-slate-50'}`}>
      <div className={`w-full max-w-sm rounded-2xl p-8 text-center shadow-xl ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`}>
        <div className="text-4xl mb-4">📧</div>
        {/* The first screen a stranger meets, so it reads as a system notice
            rather than as a message from a person. */}
        <h2 className={`text-lg font-bold mb-2 ${dk?'text-white':'text-slate-800'}`}>ยืนยันอีเมลก่อนเริ่มใช้งาน</h2>
        <p className={`text-sm mb-1 ${dk?'text-slate-400':'text-slate-500'}`}>ระบบได้ส่งลิงก์ยืนยันไปที่</p>
        <p className={`text-sm font-semibold mb-5 ${dk?'text-gold-300':'text-gold-600'}`}>{user.email}</p>
        <p className={`text-xs leading-relaxed mb-6 ${dk?'text-slate-500':'text-slate-400'}`}>เปิดลิงก์จากอุปกรณ์ใดก็ได้ ระบบจะพาเข้าสู่หน้าใช้งานโดยอัตโนมัติ</p>
        {slow&&(
          <p className={`text-xs leading-relaxed mb-6 -mt-3 fade-up ${dk?'text-amber-400/80':'text-amber-700'}`}>
            หากยังไม่ได้รับอีเมล กรุณาตรวจสอบในกล่องจดหมายขยะ
          </p>
        )}
        <button disabled={checking} onClick={async()=>{ setChecking(true); await check(false); setChecking(false); }}
          className="w-full py-2.5 rounded-xl text-sm font-semibold btn-primary disabled:opacity-60">
          {checking ? 'กำลังตรวจสอบ…' : 'ยืนยันแล้ว — เข้าสู่ระบบ'}
        </button>
        <button onClick={async()=>{ try{ await user.sendEmailVerification({ url: window.location.origin }); addToast('ส่งอีเมลยืนยันอีกครั้งแล้ว'); }catch{ addToast('ส่งไม่สำเร็จ กรุณาลองอีกครั้ง','err'); } }}
          className={`w-full mt-2 py-2 text-xs ${dk?'text-slate-400 hover:text-slate-200':'text-slate-500 hover:text-slate-700'}`}>ส่งอีเมลยืนยันอีกครั้ง</button>
        <button onClick={()=>auth.signOut()}
          className={`w-full mt-3 py-2 text-xs ${dk?'text-slate-500 hover:text-rose-400':'text-slate-400 hover:text-rose-500'}`}>ออกจากระบบ</button>
      </div>
    </div>
  );
};

// ── LOGIN PAGE ─────────────────────────────────────────────
const LoginPage = ({ theme }) => {
  const dk = theme === 'dark';
  const [mode, setMode]   = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [pw, setPw]       = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [err, setErr]     = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const switchMode = m => { setMode(m); setErr(''); setResetSent(false); setPw(''); setConfirmPw(''); };

  const forgotPassword = async () => {
    if (!email) { setErr('กรุณากรอก Email ก่อนค่ะ'); return; }
    setResetLoading(true); setErr('');
    try {
      await auth.sendPasswordResetEmail(email);
      setResetSent(true);
    } catch (e) {
      const msgs = { 'auth/user-not-found':'ไม่พบ Email นี้ในระบบ', 'auth/invalid-email':'รูปแบบ Email ไม่ถูกต้อง' };
      setErr(msgs[e.code] || `ส่ง Email ไม่สำเร็จ (${e.code})`);
    }
    setResetLoading(false);
  };

  const login = async () => {
    if (!email || !pw) { setErr('กรุณากรอก Email และรหัสผ่าน'); return; }
    setLoading(true); setErr('');
    try {
      await auth.signInWithEmailAndPassword(email, pw);
    } catch (e) {
      const msgs = {
        'auth/user-not-found':     'ไม่พบ Email นี้ในระบบ',
        'auth/wrong-password':     'รหัสผ่านไม่ถูกต้อง',
        'auth/invalid-email':      'รูปแบบ Email ไม่ถูกต้อง',
        'auth/invalid-credential': 'Email หรือรหัสผ่านไม่ถูกต้อง',
        'auth/too-many-requests':  'ลองใหม่อีกครั้งในภายหลัง',
      };
      setErr(msgs[e.code] || `เข้าสู่ระบบไม่สำเร็จ (${e.code})`);
      setLoading(false);
    }
  };

  const signup = async () => {
    if (!email || !pw || !confirmPw) { setErr('กรุณากรอกข้อมูลให้ครบ'); return; }
    if (pw.length < 6) { setErr('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    if (pw !== confirmPw) { setErr('รหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง'); return; }
    setLoading(true); setErr('');
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, pw);
      // Proves the address exists and reaches somebody. Without it the registry
      // fills with typos and throwaways, and there is no way to reach a real
      // user later — the Firestore rules check the same flag, so this is not
      // only a screen anyone can skip past.
      // continueUrl puts a link back here on Firebase's confirmation page, so
      // the trip does not dead-end on a stock English page with nowhere to go.
      try { await cred.user.sendEmailVerification({ url: window.location.origin }); }
      catch { /* account exists; the wait screen offers a resend */ }
      await db.collection('registry').doc(cred.user.uid).set({
        email, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      const msgs = {
        'auth/email-already-in-use': 'Email นี้มีบัญชีอยู่แล้ว',
        'auth/invalid-email':        'รูปแบบ Email ไม่ถูกต้อง',
        'auth/weak-password':        'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
      };
      setErr(msgs[e.code] || `สมัครไม่สำเร็จ (${e.code})`);
      setLoading(false);
    }
  };

  // Focus is an action state, so the ring and the border it lights up take the
  // action colour rather than the brand gold. On this screen especially: gold
  // borders are the app's resting state everywhere else, so a gold focus ring
  // said nothing about which field the cursor was actually in.
  const inp = `w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all focus:ring-2 focus:ring-orange-500/25 ${dk?'bg-white/5 border-white/10 text-white placeholder-slate-500 focus:border-orange-400':'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-orange-400'}`;
  const lbl = `text-sm font-medium mb-1.5 block ${dk?'text-slate-200':'text-slate-700'}`;

  return (
    <div className={`flex items-center justify-center min-h-screen ${dk?'bg-app':'bg-slate-50'}`}>
      <div className="flex flex-1 flex-col justify-center px-6 py-10">
        <div className="mx-auto w-full max-w-sm">

          {/* Logo + App name */}
          <div className="flex flex-col items-center mb-8">
            <LogoSvg size={52}/>
            <span className={`mt-3 text-2xl font-bold tracking-wide ${dk?'text-white':'text-slate-800'}`}>FinTracker</span>
            <span className={`mt-1 text-xs ${dk?'text-slate-400':'text-slate-500'}`}>{mode==='signup' ? 'สร้างบัญชีใหม่' : 'เข้าสู่ระบบ'}</span>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className={lbl}>Email</label>
              <input className={inp} type="email" placeholder="your@email.com" value={email}
                onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(mode==='login'?login():signup())}/>
            </div>
            <div>
              <label className={lbl}>Password</label>
              <div className="relative">
                <input className={inp+' pr-10'} type={showPw?'text':'password'} placeholder="••••••••" value={pw}
                  onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(mode==='login'?login():signup())}/>
                <button type="button" tabIndex={-1} onClick={()=>setShowPw(v=>!v)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-base leading-none transition-colors ${dk?'text-slate-500 hover:text-slate-300':'text-slate-400 hover:text-slate-600'}`}>
                  {showPw?'🙈':'👁️'}
                </button>
              </div>
            </div>
            {mode==='signup'&&(
              <div>
                <label className={lbl}>Confirm Password</label>
                <div className="relative">
                  <input className={inp+' pr-10'} type={showConfirmPw?'text':'password'} placeholder="••••••••" value={confirmPw}
                    onChange={e=>setConfirmPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&signup()}/>
                  <button type="button" tabIndex={-1} onClick={()=>setShowConfirmPw(v=>!v)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 text-base leading-none transition-colors ${dk?'text-slate-500 hover:text-slate-300':'text-slate-400 hover:text-slate-600'}`}>
                    {showConfirmPw?'🙈':'👁️'}
                  </button>
                </div>
              </div>
            )}
            {err && <p className="text-rose-400 text-xs text-center">{err}</p>}
            {resetSent && <p className="text-emerald-400 text-xs text-center">✅ ส่ง Email รีเซ็ตรหัสผ่านแล้วค่ะ กรุณาตรวจ Inbox</p>}
            <button onClick={mode==='login'?login:signup} disabled={loading}
              className="mt-2 w-full py-2.5 rounded-full bg-orange-400 hover:bg-orange-300 active:bg-orange-500 text-orange-950 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? 'Loading...' : mode==='login' ? 'Sign in' : 'Create account'}
            </button>
          </div>

          {/* Records are stored so that a password reset gets somebody back to
              them. Losing years of entries to a forgotten password is a real
              and common loss; the protection that would have prevented an
              operator reading them is not worth it at this size. */}
          {mode==='login'&&(
            <p className={`text-sm mt-4 ${dk?'text-slate-400':'text-slate-500'}`}>
              ลืมรหัสผ่าน?{' '}
              <button onClick={forgotPassword} disabled={resetLoading}
                className="font-medium text-gold-400 hover:text-gold-300 transition-colors disabled:opacity-50">
                {resetLoading ? 'กำลังส่ง...' : 'รีเซ็ตรหัสผ่าน'}
              </button>
            </p>
          )}

          {/* Switch mode */}
          <p className={`text-sm mt-3 ${dk?'text-slate-400':'text-slate-500'}`}>
            {mode==='login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={()=>switchMode(mode==='login'?'signup':'login')}
              className="font-medium text-gold-400 hover:text-gold-300 transition-colors">
              {mode==='login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>


        </div>
      </div>
    </div>
  );
};

// ── SCREEN LOCK ────────────────────────────────────────────
// A PIN in front of the 👁 button.
//
// What it does: keeps the figures off the screen until four digits are typed,
// and puts them back the moment the tab loses focus. What it does not do:
// protect the data. Nothing here is encrypted — the records are readable in
// devtools, in the synced copy, and in any downloaded backup. So it is called
// ซ่อน everywhere and never ปลอดภัย, and the way out of a forgotten PIN is
// stated up front rather than left to be discovered in a panic.
const LOCK = { on:'ft-lock-on', salt:'ft-lock-salt', hash:'ft-lock-hash' };
const lockVerify = async pin => {
  try {
    const salt = localStorage.getItem(LOCK.salt), want = localStorage.getItem(LOCK.hash);
    if (!salt || !want) return false;
    return (await hashPin(pin, salt)) === want;
  } catch { return false; }
};

// Masking the figures still leaves the holding names on screen, and what
// somebody owns is most of what a glance at this page would tell them anyway.
// So the whole list is withheld rather than dotted out.
const LockedPanel = ({onUnlock, dk}) => (
  <div className={`rounded-2xl px-6 py-20 text-center fade-up ${dk?'card-solid':'glass-light shadow-sm'}`}>
    <div className="text-5xl mb-4">🔒</div>
    <div className={`text-base font-semibold mb-1 ${dk?'text-white':'text-slate-700'}`}>FinTracker is locked</div>
    <div className={`text-xs mb-7 ${dk?'text-slate-400':'text-slate-500'}`}>Enter your passcode to continue</div>
    <button onClick={onUnlock} className="px-8 py-3 rounded-xl text-sm font-semibold bg-gold-500 hover:bg-gold-600">Enter passcode</button>
  </div>
);

const PinModal = ({mode, onClose, onDone, dk}) => {
  const [p1,setP1]=useState(''); const [p2,setP2]=useState('');
  const [err,setErr]=useState('');
  const [show,setShow]=useState(false);
  const [caps,setCaps]=useState(false);
  // A growing pause after repeated misses, not a lockout. Anyone determined
  // reads localStorage instead of guessing, so blocking the dialog would only
  // ever succeed at locking out the person who owns it — while a pause is
  // enough to make guessing birthdays by hand not worth sitting through.
  //
  // The count is kept in storage rather than in state: reopening the dialog
  // would otherwise clear it, and pressing Cancel would be the way around this.
  const FAILS='ft-lock-fails', WAIT='ft-lock-wait';
  const readN    = () => { try{ return parseInt(localStorage.getItem(FAILS)||'0',10)||0; }catch{ return 0; } };
  const readWait = () => { try{ return parseInt(localStorage.getItem(WAIT) ||'0',10)||0; }catch{ return 0; } };
  const clearFails = () => { try{ localStorage.removeItem(FAILS); localStorage.removeItem(WAIT); }catch{} };
  const waitMsFor = n => n<=5 ? 0 : n===6 ? 3_000 : n===7 ? 6_000 : 15_000;

  const [tries,setTries]=useState(readN);
  const [waitUntil,setWaitUntil]=useState(readWait);
  const [nowTs,setNowTs]=useState(()=>Date.now());
  useEffect(()=>{
    if(waitUntil<=Date.now()) return;
    const t=setInterval(()=>setNowTs(Date.now()),250);
    return ()=>clearInterval(t);
  },[waitUntil]);
  const cooling  = mode!=='set' && waitUntil>nowTs;
  const secsLeft = Math.max(0, Math.ceil((waitUntil-nowTs)/1000));
  // hidden again on every open — revealing is per-attempt, never a setting
  useEffect(()=>{ setP1(''); setP2(''); setErr(''); setTries(readN()); setShow(false); setCaps(false); setNowTs(Date.now()); },[mode]);
  // Caps Lock and the keyboard layout are the two ways a passcode gets set as
  // something other than what was meant, and both are invisible behind dots.
  // The eye catches them if you look; these say it without being asked.
  const capsCheck = e => { try{ setCaps(!!(e.getModifierState && e.getModifierState('CapsLock'))); }catch{} };
  const hasThai = /[฀-๿]/.test(p1);
  useEffect(()=>{
    const esc = e => { if(e.key==='Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return ()=>document.removeEventListener('keydown', esc);
  },[onClose]);
  if(!mode) return null;

  // Anything typeable, 4–64 characters. Four digits is ten thousand guesses, a
  // few milliseconds for anyone who takes the salt and hash and runs a loop —
  // and letters and symbols are what turn that number into one nobody bothers
  // with. Passcodes already set keep working: the hash never cared what was in
  // them, only that it was the same thing again.
  const okLen = s => s.length >= 4 && s.length <= 64;
  const ready = (mode==='set' ? (okLen(p1) && p1===p2) : okLen(p1)) && !cooling;
  // Length first, variety second — that is the order in which they actually buy
  // resistance, so the meter reads that way rather than demanding a capital.
  const strength = pw => {
    const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter(r=>r.test(pw)).length;
    if (pw.length >= 12 && kinds >= 2) return 3;
    if (pw.length >= 8  && kinds >= 2) return 2;
    return 1;
  };
  const bars = ['', 'Weak', 'Fair', 'Strong'];
  const barCol = ['', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500'];
  const submit = async () => {
    if(!ready) return;
    if(mode==='set'){
      const salt = makeSalt();
      try{
        localStorage.setItem(LOCK.salt, salt);
        localStorage.setItem(LOCK.hash, await hashPin(p1, salt));
        localStorage.setItem(LOCK.on, '1');
      }catch{ setErr('Could not save passcode'); return; }
      clearFails(); onDone('set'); return;
    }
    if(!await lockVerify(p1)){
      const n = readN()+1;
      try{ localStorage.setItem(FAILS, String(n)); }catch{}
      const w = waitMsFor(n);
      if(w){ const u = Date.now()+w; try{ localStorage.setItem(WAIT, String(u)); }catch{} setWaitUntil(u); setNowTs(Date.now()); }
      setTries(n); setErr('Incorrect passcode'); setP1(''); return;
    }
    clearFails(); setTries(0); setWaitUntil(0);   // a correct one wipes the slate
    if(mode==='off'){ try{ [LOCK.on,LOCK.salt,LOCK.hash].forEach(k=>localStorage.removeItem(k)); }catch{} onDone('off'); return; }
    // changing hands straight back to 'set' — proving the old PIN and choosing
    // the new one are the same errand, and closing in between loses the thread
    if(mode==='change'){ onDone('change'); return; }
    onDone('unlock');
  };

  const inp = `w-full px-3.5 py-3 rounded-xl border text-center text-base tracking-wider outline-none ${dk?'bg-white/5 border-white/10 text-white focus:border-gold-500':'bg-slate-50 border-slate-200 text-slate-800 focus:border-gold-400'}`;
  // English throughout this feature, at Fin's request — a lock that announces
  // what it guards in the reader's own language guards a little less.
  const head = mode==='set' ? 'Set passcode' : mode==='off' ? 'Turn off passcode'
             : mode==='change' ? 'Change passcode' : 'Enter passcode';
  const hint = mode==='set' ? '4–64 characters · letters, numbers and symbols welcome · Keep it safe — if forgotten, clear site data to remove it (cloud data is unaffected)'
             : mode==='off' ? 'Enter your current passcode to confirm'
             : mode==='change' ? 'Enter your current passcode, then choose a new one'
             : 'Amounts are hidden';
  return (
    <Portal>
      <div className="fixed z-[9998] flex items-center justify-center p-4" onClick={onClose}
        style={{inset:0, top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(3px)'}}>
        <div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={head}
          className={`w-full max-w-[300px] rounded-2xl shadow-2xl p-5 scale-in ${dk?'bg-[#0c1018] border border-white/10':'bg-white'}`}>
          <div className="text-center mb-4">
            <div className="text-3xl mb-1.5">{mode==='unlock'?'🔒':mode==='off'?'🔓':mode==='change'?'🔁':'🔐'}</div>
            <div className={`text-sm font-semibold ${dk?'text-white':'text-slate-800'}`}>{head}</div>
            {hint&&<div className={`text-[11px] mt-1 leading-snug ${dk?'text-slate-400':'text-slate-500'}`}>{hint}</div>}
          </div>
          {/* No password manager. autoComplete="new-password" was putting the
              browser's own suggest-a-password button inside the field, which is
              the wrong offer here — this passcode belongs on this device only,
              and a vault that syncs it defeats the point of a screen lock.
              The vendor data-* flags keep the extensions out too.
              The eye replaces it: what was actually wanted was a way to check a
              typo, which a manager was never going to give. */}
          <div className="relative">
            <input autoFocus type={show?'text':'password'} maxLength={64} className={inp+' pr-11'} value={p1}
              autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other"
              onChange={e=>{setP1(e.target.value);setErr('');}}
              onKeyUp={capsCheck} onKeyDown={e=>{ capsCheck(e); if(e.key==='Enter'&&mode!=='set') submit(); }}
              placeholder={mode==='set'?'New passcode':'Passcode'}/>
            <button type="button" onClick={()=>setShow(s=>!s)} tabIndex={-1}
              title={show?'Hide':'Show'} aria-label={show?'Hide passcode':'Show passcode'}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${dk?'text-slate-500 hover:text-slate-200 hover:bg-white/10':'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}>
              <Ic n={show?'eyeoff':'eye'} s={15}/>
            </button>
          </div>
          {mode==='set'&&(<>
            {p1&&(
              <div className="flex items-center gap-2 mt-2">
                <div className={`flex-1 h-1 rounded-full overflow-hidden ${dk?'bg-white/10':'bg-slate-200'}`}>
                  <div className={`h-full rounded-full transition-all ${barCol[strength(p1)]}`} style={{width:`${strength(p1)/3*100}%`}}/>
                </div>
                <span className={`text-[10px] font-semibold flex-shrink-0 ${strength(p1)===3?'text-emerald-500':strength(p1)===2?'text-amber-500':'text-rose-500'}`}>{bars[strength(p1)]}</span>
              </div>
            )}
            {/* one eye for both boxes — checking a typo means seeing both */}
            <input type={show?'text':'password'} maxLength={64} className={inp+' mt-2'} value={p2}
              autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other"
              onChange={e=>{setP2(e.target.value);setErr('');}}
              onKeyUp={capsCheck} onKeyDown={e=>{ capsCheck(e); if(e.key==='Enter') submit(); }}
              placeholder="Confirm passcode"/>
          </>)}
          {caps&&(
            <div className={`text-[11px] mt-2 text-center font-medium ${dk?'text-amber-300':'text-amber-600'}`}>⇪ Caps Lock is on</div>
          )}
          {/* Set in Thai and unlocked with the keyboard in English, the same
              keystrokes produce different characters and the passcode simply
              stops working. Allowed — just not silently. */}
          {mode==='set'&&hasThai&&(
            <div className={`text-[11px] mt-2 text-center leading-snug ${dk?'text-amber-300':'text-amber-600'}`}>
              ⌨ Contains Thai characters — you will need the same keyboard layout to unlock
            </div>
          )}
          {mode==='set'&&p2&&p1!==p2&&<div className="text-[11px] text-rose-500 mt-1.5 text-center">Passcodes do not match</div>}
          {err&&!cooling&&<div className="text-[11px] text-rose-500 mt-1.5 text-center">{err}</div>}
          {cooling&&(
            <div className={`text-[11px] mt-2 text-center font-medium ${dk?'text-amber-300':'text-amber-600'}`}>
              Too many attempts — try again in {secsLeft}s
            </div>
          )}
          {/* Said after a few misses rather than never: forgetting the PIN must
              not feel like losing the data, because it isn't. */}
          {tries>=3&&mode!=='set'&&(
            <div className={`text-[10px] mt-2 leading-snug text-center ${dk?'text-slate-500':'text-slate-400'}`}>
              Forgot your passcode? Clear site data in your browser to remove the lock — your cloud data stays intact.
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${dk?'bg-white/5 hover:bg-white/10 text-slate-300':'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>Cancel</button>
            <button onClick={submit} disabled={!ready}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gold-500 hover:bg-gold-600 disabled:opacity-40 disabled:cursor-not-allowed">
              {mode==='set'?'Set passcode':mode==='off'?'Turn off':mode==='change'?'Next':'Unlock'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

// ── APP ────────────────────────────────────────────────────
const AdminPage = ({ theme }) => {
  const dk = theme==='dark';
  const [confirmEl, ask] = useConfirm(dk);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const card = `rounded-2xl ${dk?'card-solid':'bg-white shadow-sm border border-slate-100'}`;
  const sub = dk?'text-slate-400':'text-slate-500';

  useEffect(()=>{
    const unsub = db.collection('registry').orderBy('createdAt','desc').onSnapshot(snap=>{
      setUsers(snap.docs.map(d=>({id:d.id,...d.data()})));
      setLoading(false);
    });
    return unsub;
  },[]);

  // Each of these decides whether somebody can reach their own records, and
  // the three buttons sit a few pixels apart — so each one says who it is
  // about and what will happen before it happens.
  const setStatus = async (uid, status) => {
    await db.collection('registry').doc(uid).update({ status });
  };

  // The app's own dialog, not window.confirm — the browser's box is titled with
  // the domain and looks like something that arrived from outside the page,
  // which is the last impression an admin screen about access should give.
  const approve = (u) => ask('อนุมัติผู้ใช้',
    `${u.email} จะเข้าใช้งานได้ทันที และข้อมูลจะถูกเก็บบนระบบ`,
    ()=>setStatus(u.id,'approved'), { confirmLabel:'อนุมัติ', destructive:false });

  const suspend = (u) => ask(u.status==='approved' ? 'ระงับผู้ใช้' : 'ปฏิเสธผู้ใช้',
    `${u.email} จะเข้าใช้งานไม่ได้ทันที ข้อมูลที่บันทึกไว้ยังอยู่ และเปิดสิทธิ์คืนได้ภายหลัง`,
    ()=>setStatus(u.id,'rejected'), { confirmLabel: u.status==='approved' ? 'ระงับ' : 'ปฏิเสธ' });

  // Removes the entry, not the account. Firebase Auth is a separate system and
  // deleting from it needs the Admin SDK — so a removed person who signs in
  // again lands back here as pending rather than vanishing. Said out loud in
  // the prompt, because a delete that does not delete is worse than no delete.
  const removeUser = (u) => ask('ลบออกจากรายการ',
    `${u.email} จะหายจากรายการนี้และเข้าใช้งานไม่ได้ — หากผู้ใช้ล็อกอินอีกครั้ง จะกลับมาอยู่ในสถานะรอการอนุมัติ`,
    ()=>db.collection('registry').doc(u.id).delete());

  const STATUS_BADGE = {
    pending:  { label:'รอการอนุมัติ', cls:'bg-amber-500/15 text-amber-400' },
    approved: { label:'อนุมัติแล้ว',  cls:'bg-emerald-500/15 text-emerald-400' },
    rejected: { label:'ถูกปฏิเสธ',   cls:'bg-rose-500/15 text-rose-400' },
  };

  return (
    <div className="space-y-4 fade-up">
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className={`text-sm font-bold ${dk?'text-white':'text-slate-800'}`}>จัดการผู้ใช้งาน</h2>
            <p className={`text-xs mt-0.5 ${sub}`}>{users.length} บัญชีทั้งหมด · {users.filter(u=>u.status==='pending').length} รอการอนุมัติ</p>
          </div>
        </div>
        {loading && <p className={`text-sm text-center py-8 ${sub}`}>กำลังโหลด...</p>}
        {!loading && users.length===0 && <p className={`text-sm text-center py-8 ${sub}`}>ยังไม่มีผู้ใช้งานค่ะ</p>}
        {!loading && users.length>0 && (
          <div className="space-y-2">
            {/* Header */}
            <div className={`grid px-3 pb-2 border-b text-[10px] uppercase tracking-wider font-medium ${dk?'border-white/8 text-slate-500':'border-slate-100 text-slate-400'}`}
              style={{gridTemplateColumns:'1fr 120px 160px'}}>
              <span>Email</span>
              <span className="text-center">สถานะ</span>
              <span className="text-center">Actions</span>
            </div>
            {users.map((u,i)=>{
              const badge = STATUS_BADGE[u.status] || STATUS_BADGE.pending;
              return (
                <div key={u.id} className={`grid px-3 py-3 rounded-xl items-center gap-2 ${dk?(i%2===0?'bg-white/[0.01]':'bg-black/[0.06]'):(i%2===0?'bg-white':'bg-slate-50/50')}`}
                  style={{gridTemplateColumns:'1fr 120px 160px'}}>
                  <div>
                    <div className={`text-xs font-medium ${dk?'text-white':'text-slate-700'}`}>{u.email}</div>
                    {u.createdAt && <div className={`text-[10px] mt-0.5 ${sub}`}>{new Date(u.createdAt.seconds*1000).toLocaleDateString('th-TH')}</div>}
                  </div>
                  <div className="flex justify-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="flex justify-center gap-1.5">
                    {u.status!=='approved' && (
                      <button onClick={()=>approve(u)}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors">
                        ✓ อนุมัติ
                      </button>
                    )}
                    {/* One button, worded for the state it is in: turning
                        somebody away and cutting off somebody already working
                        are different enough to name differently, and showing
                        both at once was two buttons doing one thing. */}
                    {u.status!=='rejected' && (
                      <button onClick={()=>suspend(u)}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 transition-colors">
                        {u.status==='approved' ? 'ระงับ' : '✕ ปฏิเสธ'}
                      </button>
                    )}
                    <button onClick={()=>removeUser(u)} title="ลบออกจากรายการ"
                      className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${dk?'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10':'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}>
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {confirmEl}
    </div>
  );
};

const App = () => {
  // ── Auth state ──
  const [user,setUser]           = useState(null);
  const [userStatus,setUserStatus] = useState(null); // null|'pending'|'approved'|'rejected'
  const ADMIN_EMAIL = 'finphurinat18@gmail.com';
  const [authLoading,setAuthL]   = useState(true);
  const [dataLoading,setDataL]   = useState(true); // waiting for Firebase data
  const [syncStatus,setSyncSt]   = useState('idle');
  const [dataKey,setDataKey]     = useState(0);
  const [sidebarOpen,setSidebarOpen] = useState(false);
  const [privacy,setPrivacy]     = useState(_privacy);
  // Separate from the padlock on purpose: this one only covers figures so a
  // screen can be shown to somebody, and asking for a passcode to undo that
  // would make every screenshot cost three steps.
  const [hideAmt,setHideAmt]     = useState(_hideAmt);
  const toggleHideAmt = () => { const v=!_hideAmt; _hideAmt=v; try{localStorage.setItem('ft-hideamt',v?'1':'0');}catch{} setHideAmt(v); };
  const [lockOn,setLockOn]       = useState(_locked);
  const [pinGate,setPinGate]     = useState(null);   // 'unlock' | 'set' | 'off'
  // The padlock is the security control, not the one used to tidy a screen for
  // a screenshot — that is the eye on the Net Worth card. So hiding still ends
  // the grace at once: somebody who locks up because a person walked over
  // should not have left that person a button that opens it again.
  const applyPrivacy = on => {
    _privacy=on;
    try{localStorage.setItem('ft-privacy',on?'1':'0');}catch{}
    if(on) lockDrop(); else lockTouch();
    setPrivacy(on);
  };
  // Hiding never asks; only revealing does. A lock that got in the way of
  // putting the numbers away would be one people stop using.
  const togglePrivacy = () => {
    if (_privacy && lockOn) { setPinGate('unlock'); return; }
    applyPrivacy(!_privacy);
  };
  // Layer two: away from the tab, the figures go back behind the PIN. Walking
  // off is the moment this is for, and it is exactly the moment nobody remembers
  // to press the eye.
  const relockRef = useRef(null);
  useEffect(()=>{
    if(!lockOn) return;
    // leaving starts the countdown rather than locking outright
    const arm = () => {
      if(_privacy) return;
      lockTouch();
      clearTimeout(relockRef.current);
      relockRef.current = setTimeout(()=>applyPrivacy(true), LOCK_GRACE_MS);
    };
    // coming back inside the window cancels it
    const disarm = () => { clearTimeout(relockRef.current); if(!_privacy) lockTouch(); };
    const onVis = () => { document.hidden ? arm() : disarm(); };
    // kept fresh while in use, so the window is measured from the last moment
    // the app was actually open rather than from the unlock
    const keep = setInterval(()=>{ if(!document.hidden && !_privacy) lockTouch(); }, 5_000);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', arm);
    window.addEventListener('focus', disarm);
    return ()=>{
      clearTimeout(relockRef.current); clearInterval(keep);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', arm); window.removeEventListener('focus', disarm);
    };
  },[lockOn]);
  const [kickedOut,setKickedOut] = useState(false);
  const [newDeviceAlert,setNewDeviceAlert] = useState(null);
  const [assetCreatedAlert,setAssetCreatedAlert] = useState(null);
  // success confirmation dismisses itself; no click needed (Close still works)
  useEffect(()=>{
    if(!assetCreatedAlert) return;
    const t = setTimeout(()=>setAssetCreatedAlert(null), 1800);
    return ()=>clearTimeout(t);
  },[assetCreatedAlert]);
  const sessionIdRef             = useRef(null);
  const knownSessionIds          = useRef(null);
  const swipeX = useRef(null);
  const swipeY = useRef(null);
  const onTouchStart = e => { swipeX.current = e.touches[0].clientX; swipeY.current = e.touches[0].clientY; };
  const onTouchEnd   = e => {
    if (swipeX.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeX.current;
    const dy = e.changedTouches[0].clientY - swipeY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50 && dx > 0 && swipeX.current < 40) {
      setSidebarOpen(true);
    }
    swipeX.current = null;
  };

  // ── App state — init from localStorage cache only (no SAMPLE fallback) ──
  // Dark by default. The gold-on-near-black terminal look is the app's own —
  // the light theme is white cards and soft shadows, which is what every other
  // finance app looks like, and it was the first thing a new account saw.
  // Anyone who prefers it still has it; only the starting point moved.
  const [theme,setTheme]       = useState(()=>localStorage.getItem('ft-theme')||'dark');
  const [colorTheme,setColorThemeRaw] = useState(()=>localStorage.getItem('ft-color-theme')||'terminal');
  const setColorTheme = v => { setColorThemeRaw(v); localStorage.setItem('ft-color-theme',v); };
  const [page,setPage]         = useState(()=>localStorage.getItem('ft-page')||'dashboard');
  const [txs,setTxs]           = useState(()=>{ try{const s=localStorage.getItem('ft-txs');return s?JSON.parse(s):[];}catch{return[];} });
  const [assets,setAssets]     = useState(()=>{ try{const s=localStorage.getItem('ft-assets');return s?JSON.parse(s):[];}catch{return[];} });
  const [wallets,setWallets]   = useState(()=>{ try{const s=localStorage.getItem('ft-wallets');return s?JSON.parse(s):[];}catch{return[];} });
  const [walletOrder,setWalletOrder] = useState(()=>{ try{return JSON.parse(localStorage.getItem('ft-wallet-order')||'null')||[];}catch{return[];} });
  const [modal,setModal]       = useState({open:false,editData:null,defaultWalletId:null});
  const [assetModal,setAModal]       = useState({open:false,editData:null,defaultWalletId:null});
  const [importOpen,setImport]       = useState(false);
  const [backupOpen,setBackupOpen]   = useState(false);
  const [unifiedOpen,setUnifiedOpen]   = useState({open:false,from:null,to:null});
  const [dcaModal, setDcaModal]        = useState({open:false, asset:null});
  const [quickRecurModal, setQuickRecurModal] = useState({open:false, editData:null});
  const saveUnifiedTransfer = useCallback(payload=>{
    const {txs:newTxs=[], assetUpdates=[], newAssets=[]} = payload||{};
    if(newTxs.length) setTxs(ts=>[...newTxs,...ts]);
    if(assetUpdates.length||newAssets.length){
      setAssets(as=>{
        let updated = as.map(a=>{ const u=assetUpdates.find(x=>x.id===a.id); return u?{...a,...u.patch}:a; });
        if(newAssets.length) updated=[...updated,...newAssets];
        return updated;
      });
    }
  },[]);
  const [wModal,setWModal]             = useState({open:false,editData:null});
  const [toasts,setToasts]     = useState([]);
  const txsRef                 = useRef(txs);
  const assetsRef              = useRef(assets);
  const walletsRef             = useRef(wallets);
  const [nwHistory,setNwHistory] = useState(()=>{ try{const s=localStorage.getItem('ft-nw-history');return s?JSON.parse(s):[];}catch{return[];} });
  const nwHistoryRef             = useRef(nwHistory);
  const [debts,setDebts]       = useState(()=>{ try{const s=localStorage.getItem('ft-debts');return s?JSON.parse(s):[];}catch{return[];} });
  const debtsRef               = useRef(debts);
  const [custodial,setCustodial] = useState(()=>{ try{const s=localStorage.getItem('ft-custodial');return s?JSON.parse(s):[];}catch{return[];} });
  const custodialRef             = useRef(custodial);
  // Recycle bin — deleted transactions kept locally (per-device) so you can see
  // what was removed and restore it. Capped to the most recent 200 entries.
  const [trash,setTrash]       = useState(()=>{ try{const s=localStorage.getItem('ft-trash');return s?JSON.parse(s):[];}catch{return[];} });
  const trashRef               = useRef(trash);
  useEffect(()=>{ trashRef.current=trash; try{localStorage.setItem('ft-trash',JSON.stringify(trash));}catch{} },[trash]);
  const [trashOpen,setTrashOpen] = useState(false);
  const [menuOpen,setMenuOpen]   = useState(false);
  const [acctOpen,setAcctOpen]   = useState(false);
  const sendToTrash = useCallback(arr=>{ if(!arr.length) return; const stamp=Date.now(); setTrash(tr=>[...arr.map(t=>({...t,_deletedAt:stamp})),...tr].slice(0,200)); },[]);
  const saveTimer              = useRef(null);
  const pendingSync            = useRef(false);
  const skipSync               = useRef(0);
  const initDone               = useRef(false);
  const downloadPending        = useRef(0);
  const sessionTimer           = useRef(null);
  const regUnsub               = useRef(null);   // registry watcher — approval arrives from another screen
  const lastUploadedAt         = useRef(null);
  const firestoreUnsub         = useRef(null);
  // baseline of what was last in sync with the cloud — drives the 3-way merge.
  // starts empty so the very first push to a fresh cloud sends everything.
  const syncedRef              = useRef({ txs:[], assets:[], wallets:[], debts:[], custodial:[], trash:[] });

  // ── Session management ──
  const manageSession = useCallback(async (u) => {
    if (!u) return;
    const deviceId = getDeviceId();
    const userRef  = db.collection('users').doc(u.uid);
    try {
      const snap = await userRef.get();
      const sessions = (snap.exists && snap.data().sessions) || {};
      const entries  = Object.entries(sessions);
      if (!sessions[deviceId] && entries.length >= 2) {
        const oldest = entries.sort((a,b)=>(a[1].lastSeen||'')<(b[1].lastSeen||'')?-1:1)[0];
        delete sessions[oldest[0]];
      }
      sessions[deviceId] = { platform: getPlatform(), lastSeen: new Date().toISOString(), createdAt: sessions[deviceId]?.createdAt || new Date().toISOString() };
      await userRef.set({ sessions }, { merge: true });
      knownSessionIds.current = new Set(Object.keys(sessions));
    } catch(e){}
    clearInterval(sessionTimer.current);
    sessionTimer.current = setInterval(async () => {
      try {
        const snap = await db.collection('users').doc(u.uid).get();
        const sessions = (snap.exists && snap.data().sessions) || {};
        const myId = getDeviceId();
        if (snap.exists && Object.keys(sessions).length > 0 && !sessions[myId]) {
          clearInterval(sessionTimer.current);
          auth.signOut();
        } else if (sessions[myId]) {
          // ตรวจหา device ใหม่ที่ไม่เคยรู้จัก
          const currentIds = new Set(Object.keys(sessions));
          if (knownSessionIds.current) {
            for (const id of currentIds) {
              if (id !== myId && !knownSessionIds.current.has(id)) {
                const platform = sessions[id]?.platform || 'อุปกรณ์ไม่รู้จัก';
                setNewDeviceAlert(platform);
                break;
              }
            }
          }
          knownSessionIds.current = currentIds;
          sessions[myId].lastSeen = new Date().toISOString();
          await db.collection('users').doc(u.uid).set({ sessions }, { merge: true });
        }
      } catch(e){}
    }, 60000);
  }, []);

  // ── Auth listener ──
  useEffect(()=>{
    const unsub = auth.onAuthStateChanged(async u=>{
      // Records live in localStorage first and sync from there, and the keys
      // are not namespaced by account — so signing in as somebody else on a
      // browser that already holds records would load the previous person's
      // ledger and then upload it into the new account. Two people sharing a
      // laptop is enough to do it.
      //
      // The screen-lock keys matter as much: inheriting a passcode set by
      // whoever used the browser before locks the new arrival out of an app
      // they just signed up for, with a code only a stranger knows.
      //
      // Clearing has to happen before the app reads any of it, and the state
      // initialisers have already run by now, so this reloads rather than
      // trying to unpick it. ft-owner is written first, so the fresh load sees
      // a matching owner and comes up clean instead of looping.
      if (u) {
        const owner = localStorage.getItem('ft-owner');
        if (owner && owner !== u.uid) {
          Object.keys(localStorage)
            .filter(k => k.startsWith('ft-') && k !== 'ft-device-id')
            .forEach(k => localStorage.removeItem(k));
          localStorage.setItem('ft-owner', u.uid);
          location.reload();
          return;
        }
        try { localStorage.setItem('ft-owner', u.uid); } catch { /* private mode */ }
      }
      setUser(u); setAuthL(false);
      if (!u) { setDataL(false); setUserStatus(null); clearInterval(sessionTimer.current); if(regUnsub.current){ regUnsub.current(); regUnsub.current=null; } }
      else {
        if (u.email === ADMIN_EMAIL) {
          setUserStatus('approved');
        } else {
          // Watched rather than read once. Approval happens on somebody else's
          // screen, minutes or hours later, and a single read left the waiting
          // person on the same notice forever — with nothing on it suggesting
          // a refresh would help. Now the moment an admin approves, the page
          // they left open lets them in.
          const ref = db.collection('registry').doc(u.uid);
          const doc = await ref.get();
          if (!doc.exists) {
            await ref.set({ email: u.email, status:'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
          }
          if (regUnsub.current) regUnsub.current();
          regUnsub.current = ref.onSnapshot(
            s => setUserStatus(s.exists ? (s.data().status || 'pending') : 'pending'),
            () => setUserStatus('pending'),   // rules deny reads before approval on some paths
          );
        }
        manageSession(u);
      }
    });
    return unsub;
  },[]);

  // ── Auto logout after 1 hour of inactivity ──
  useEffect(()=>{
    if (!user) return;
    const TIMEOUT = 60 * 60 * 1000; // 1 hour
    let timer = setTimeout(()=>auth.signOut(), TIMEOUT);
    const reset = () => { clearTimeout(timer); timer = setTimeout(()=>auth.signOut(), TIMEOUT); };
    const events = ['mousemove','mousedown','keydown','scroll','touchstart'];
    events.forEach(e=>window.addEventListener(e, reset));
    return ()=>{ clearTimeout(timer); events.forEach(e=>window.removeEventListener(e, reset)); };
  },[user]);


  // ── Load data from Firestore — real-time listener ──
  useEffect(()=>{
    if (firestoreUnsub.current) { firestoreUnsub.current(); firestoreUnsub.current=null; }
    if (!user) return;
    setDataL(true);
    firestoreUnsub.current = db.collection('users').doc(user.uid).onSnapshot(snap=>{
      if (!snap.exists) {
        setDataL(false);
        setTimeout(()=>syncToCloud(), 200);
        return;
      }
      const d = snap.data();
      // ข้ามถ้าเป็น update ของเราเอง
      if (lastUploadedAt.current && d.updatedAt === lastUploadedAt.current) {
        setDataL(false);
        return;
      }
      // Cloud-first: apply remote data
      let cnt = 0;
      if (d.txs) cnt++; if (d.assets) cnt++; if (d.wallets) cnt++; if (Array.isArray(d.debts)) cnt++; if (Array.isArray(d.custodial)) cnt++; if (Array.isArray(d.trash)) cnt++;
      downloadPending.current = cnt;
      if (d.txs)       { setTxs(d.txs);         localStorage.setItem('ft-txs',          JSON.stringify(d.txs)); }
      if (d.assets)    { setAssets(d.assets);    localStorage.setItem('ft-assets',       JSON.stringify(d.assets)); }
      if (d.wallets)   { setWallets(d.wallets);  localStorage.setItem('ft-wallets',      JSON.stringify(d.wallets)); }
      if (Array.isArray(d.trash)) { setTrash(d.trash); localStorage.setItem('ft-trash', JSON.stringify(d.trash)); }
      if (d.nwHistory) { setNwHistory(d.nwHistory); localStorage.setItem('ft-nw-history',JSON.stringify(d.nwHistory)); }
      // budgets/irregularCats: local is always authoritative (matches uploadNow, which makes the cloud copy match
      // local exactly). Skip applying a remote snapshot here if a local edit is still pending upload — otherwise a
      // delete-then-immediate-refresh can have the stale remote value overwrite localStorage moments before
      // uploadNow reads it, silently reverting the very deletion that upload was about to push.
      if (d.budgets && !pendingSync.current) {
        localStorage.setItem('ft-budgets', JSON.stringify(d.budgets));
      }
      if (d.irregularCats && !pendingSync.current) {
        localStorage.setItem('ft-cat-irregular', JSON.stringify(d.irregularCats));
      }
      // per-month budget snapshots — merged, never replaced, so a month this device
      // recorded is not dropped by a cloud copy that never saw it
      const mergeDown = (key, remote) => {
        if (!remote) return;
        const local = (()=>{try{return JSON.parse(localStorage.getItem(key)||'null')||{};}catch{return {};}})();
        localStorage.setItem(key, JSON.stringify(mergeKeyedMap(local, remote)));
      };
      mergeDown('ft-budget-history',    d.budgetHistory);
      mergeDown('ft-cat-meta',          d.catMeta);
      mergeDown('ft-import-cat-memory', d.importCatMemory);
      if (d.colorTheme) localStorage.setItem('ft-color-theme', d.colorTheme);
      if (d.goals)     localStorage.setItem('ft-goals',     JSON.stringify(d.goals));
      if (d.recurring) localStorage.setItem('ft-recurring', JSON.stringify(d.recurring));
      if (d.usdrate)   localStorage.setItem('ft-usdrate',   String(d.usdrate));
      if (d.theme)     { setTheme(d.theme); localStorage.setItem('ft-theme', d.theme); }
      if (d.walletOrder){ setWalletOrder(d.walletOrder); localStorage.setItem('ft-wallet-order',JSON.stringify(d.walletOrder)); }
      if (Array.isArray(d.debts)) { setDebts(d.debts); localStorage.setItem('ft-debts', JSON.stringify(d.debts)); }
      if (Array.isArray(d.custodial)) { setCustodial(d.custodial); localStorage.setItem('ft-custodial', JSON.stringify(d.custodial)); }
      // cloud is now the baseline for future merges (use cloud where present, else keep current)
      syncedRef.current = {
        txs:     d.txs     ? d.txs     : txsRef.current,
        assets:  d.assets  ? d.assets  : assetsRef.current,
        wallets: d.wallets ? d.wallets : walletsRef.current,
        debts:   Array.isArray(d.debts) ? d.debts : debtsRef.current,
        custodial: Array.isArray(d.custodial) ? d.custodial : custodialRef.current,
        trash:   Array.isArray(d.trash) ? d.trash : trashRef.current,
      };
      setDataL(false);
      setDataKey(k=>k+1);
      // Daily backup (ครั้งแรกของวัน)
      const today = new Date().toISOString().slice(0,10);
      if (localStorage.getItem('ft-last-backup') !== today) {
        db.collection('users').doc(user.uid).collection('backups').doc(today)
          .set({ ...d, savedAt: new Date().toISOString() })
          .then(async()=>{
            localStorage.setItem('ft-last-backup', today);
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-7);
            const old = await db.collection('users').doc(user.uid).collection('backups')
              .where(firebase.firestore.FieldPath.documentId(), '<', cutoff.toISOString().slice(0,10)).get();
            old.docs.forEach(doc=>doc.ref.delete());
          }).catch(()=>{});
      }
    }, ()=>setDataL(false));
    return ()=>{ if(firestoreUnsub.current){ firestoreUnsub.current(); firestoreUnsub.current=null; } };
  },[user]);

  // ── Sync to Firestore ──
  // uploadNow: ยิงขึ้น cloud จริง (เรียกได้ทั้งจาก debounce และ flush ตอนปิดแท็บ)
  const uploadNow = useCallback(async ()=>{
    if (!user) return;
    pendingSync.current = false;
    const updatedAt = new Date().toISOString();
    // scalar / derived settings keep simple last-write-wins (regenerable, low-conflict)
    const settings = {
      nwHistory: nwHistoryRef.current,
      goals:     JSON.parse(localStorage.getItem('ft-goals')     || 'null') || [],
      recurring: JSON.parse(localStorage.getItem('ft-recurring') || 'null') || RECURRING_DEFAULTS,
      usdrate:      parseFloat(localStorage.getItem('ft-usdrate')   || '35'),
      theme:        localStorage.getItem('ft-theme') || 'light',
      colorTheme:   localStorage.getItem('ft-color-theme') || 'terminal',
      walletOrder:  JSON.parse(localStorage.getItem('ft-wallet-order') || 'null') || [],
      updatedAt,
    };
    const localBudgetsNow = (()=>{try{return JSON.parse(localStorage.getItem('ft-budgets')||'null')||{};}catch{return {};}})();
    const localIrregularNow = (()=>{try{return JSON.parse(localStorage.getItem('ft-cat-irregular')||'null')||{};}catch{return {};}})();
    const localHistoryNow = (()=>{try{return JSON.parse(localStorage.getItem('ft-budget-history')||'null')||{};}catch{return {};}})();
    const localCatMetaNow = (()=>{try{return JSON.parse(localStorage.getItem('ft-cat-meta')||'null')||{};}catch{return {};}})();
    const localImportMemNow = (()=>{try{return JSON.parse(localStorage.getItem('ft-import-cat-memory')||'null')||{};}catch{return {};}})();
    try {
      const userRef = db.collection('users').doc(user.uid);
      // read-merge-write in a transaction so two devices never clobber each other's records
      const merged = await db.runTransaction(async t=>{
        const snap = await t.get(userRef);
        const r = snap.exists ? snap.data() : {};
        // a device still on untouched defaults must not wipe a customised cloud copy
        const keepRemoteBudgets = chooseBudgets(localBudgetsNow, r.budgets, BUDGET_DEFAULTS) === 'remote';
        const m = {
          txs:     mergeArrById(syncedRef.current.txs,     txsRef.current,     r.txs),
          assets:  mergeArrById(syncedRef.current.assets,  assetsRef.current,  r.assets),
          wallets: mergeArrById(syncedRef.current.wallets, walletsRef.current, r.wallets),
          debts:   mergeArrById(syncedRef.current.debts,   debtsRef.current,   r.debts),
          custodial: mergeArrById(syncedRef.current.custodial, custodialRef.current, r.custodial),
          trash:   mergeArrById(syncedRef.current.trash,   trashRef.current,   r.trash).slice(0,200),
          budgetHistory:  mergeKeyedMap(localHistoryNow,  r.budgetHistory),
          catMeta:        mergeKeyedMap(localCatMetaNow,  r.catMeta),
          importCatMemory:mergeKeyedMap(localImportMemNow, r.importCatMemory),
          // budgets/irregularCats: local is authoritative (no merge) — a merge cannot express "I deleted this
          // category". The exception is a device still holding untouched defaults: it has nothing to say about
          // budgets, so it defers rather than wiping the cloud. See chooseBudgets.
          budgets: keepRemoteBudgets ? r.budgets : localBudgetsNow,
          irregularCats: keepRemoteBudgets ? (r.irregularCats||{}) : localIrregularNow,
        };
        // Firestore's set(...,{merge:true}) recursively DEEP-merges nested MAP fields, so a deleted key
        // would survive server-side. Dot-notation field paths only delete under update(), NOT set() — set() treats
        // "budgets.x" as a literal top-level field name (dot included), so a dot-path attempt would silently no-op.
        // Fix: write everything else via set-merge, then REPLACE these two maps wholesale via update() (which
        // overwrites the field entirely, dropping deleted keys). update() needs the doc to exist — on a brand-new
        // doc the set-merge above creates it first, so guard on snap.exists and fall back to set-merge when fresh.
        const { budgets: _b, irregularCats: _i, ...mRest } = m;
        t.set(userRef, {...settings, ...mRest}, {merge:true});
        if (snap.exists) t.update(userRef, { budgets: m.budgets, irregularCats: m.irregularCats });
        else t.set(userRef, { budgets: m.budgets, irregularCats: m.irregularCats }, {merge:true});
        return m;
      });
      lastUploadedAt.current = updatedAt;
      // when the cloud's copy won, adopt it locally too — otherwise this device
      // keeps showing defaults while every other one has the real thing
      if (merged.budgets && JSON.stringify(merged.budgets)!==JSON.stringify(localBudgetsNow)) {
        localStorage.setItem('ft-budgets', JSON.stringify(merged.budgets));
        localStorage.setItem('ft-cat-irregular', JSON.stringify(merged.irregularCats||{}));
        addToast('☁️ ดึงงบประมาณจากคลาวด์มาใช้ (เครื่องนี้ยังเป็นค่าเริ่มต้น)');
      }
      if (merged.budgetHistory)   localStorage.setItem('ft-budget-history',    JSON.stringify(merged.budgetHistory));
      if (merged.catMeta)         localStorage.setItem('ft-cat-meta',          JSON.stringify(merged.catMeta));
      if (merged.importCatMemory) localStorage.setItem('ft-import-cat-memory', JSON.stringify(merged.importCatMemory));
      syncedRef.current = { txs:merged.txs, assets:merged.assets, wallets:merged.wallets, debts:merged.debts, custodial:merged.custodial, trash:merged.trash };
      // pull in records another device added concurrently (merged differs from local).
      // downloadPending guard stops these state updates from triggering another sync.
      const ups=[];
      if(JSON.stringify(merged.txs)    !==JSON.stringify(txsRef.current))     ups.push(()=>setTxs(merged.txs));
      if(JSON.stringify(merged.assets) !==JSON.stringify(assetsRef.current))  ups.push(()=>setAssets(merged.assets));
      if(JSON.stringify(merged.wallets)!==JSON.stringify(walletsRef.current)) ups.push(()=>setWallets(merged.wallets));
      if(JSON.stringify(merged.debts)  !==JSON.stringify(debtsRef.current))   ups.push(()=>setDebts(merged.debts));
      if(JSON.stringify(merged.custodial)!==JSON.stringify(custodialRef.current)) ups.push(()=>setCustodial(merged.custodial));
      if(JSON.stringify(merged.trash)    !==JSON.stringify(trashRef.current))     ups.push(()=>setTrash(merged.trash));
      if(ups.length){ downloadPending.current += ups.length; ups.forEach(f=>f()); }
      setSyncSt('saved');
    } catch(e){
      setSyncSt('err');
      const id = uid();
      setToasts(ts=>[...ts,{id,msg:'⚠️ ซิงค์ล้มเหลว — กด ☁️ เพื่อลองใหม่',type:'err'}]);
      setTimeout(()=>setToasts(ts=>ts.filter(t=>t.id!==id)),8000);
    }
  },[user]);

  // debounce: รวมการแก้รัวๆ ให้เป็น upload เดียว (รอ 800ms)
  const syncToCloud = useCallback(()=>{
    if (!user) return;
    if (skipSync.current > 0) { skipSync.current--; return; }
    clearTimeout(saveTimer.current);
    setSyncSt('saving');
    pendingSync.current = true;
    saveTimer.current = setTimeout(uploadNow, 800);
  },[user, uploadNow]);

  // flush: พอแท็บกำลังจะซ่อน/ปิด ถ้ามี sync ค้าง → ยิงทันที ไม่รอ 800ms (กันข้อมูลหายข้ามเครื่อง)
  useEffect(()=>{
    const flush = ()=>{ if(pendingSync.current && document.visibilityState==='hidden'){ clearTimeout(saveTimer.current); uploadNow(); } };
    const flushNow = ()=>{ if(pendingSync.current){ clearTimeout(saveTimer.current); uploadNow(); } };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flushNow);
    return ()=>{ document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flushNow); };
  },[uploadNow]);

  const takeNwSnapshot = useCallback(()=>{
    const usdRate = parseFloat(localStorage.getItem('ft-usdrate')||'35');
    // Cash-type assets (e.g. a wallet's balance also tagged as a "cash" asset) are money, not an
    // investment — fold their value into the wallets/cash bucket instead of "พอร์ตลงทุน". "other/property"
    // (amulets, land, collectibles) aren't cash OR a liquid investment either — own bucket for those too.
    const portfolio    = assetsRef.current.filter(a=>a.type!=='cash'&&a.type!=='other'&&a.type!=='property').reduce((s,a)=>s+assetVal(a,txsRef.current,usdRate),0);
    const cashAssets   = assetsRef.current.filter(a=>a.type==='cash').reduce((s,a)=>s+assetVal(a,txsRef.current,usdRate),0);
    const otherAssets  = assetsRef.current.filter(a=>a.type==='other'||a.type==='property').reduce((s,a)=>s+assetVal(a,txsRef.current,usdRate),0);
    const walletTotal  = walletsRef.current.reduce((s,w)=>s+walletCash(w,txsRef.current,assetsRef.current),0) + cashAssets;
    // What everything non-cash cost to acquire, banked alongside what it is
    // worth. Value alone cannot answer "how much am I up" later, because buying
    // more raises it exactly the way a price rise does — the two are only
    // separable if the cost that came with the purchase was recorded too.
    // Covers the same holdings as portfolio + other, which is what the P/L card
    // subtracts it from. Snapshots taken before this existed have no cost and
    // are skipped there rather than back-filled: the historical prices needed
    // to reconstruct one were never stored.
    const portfolioCost = assetsRef.current.filter(a=>a.type!=='cash')
      .reduce((s,a)=>s + a.qty*a.avgCost*(a.currency==='USD'?usdRate:1), 0);
    // เงินที่ถือแทน (custodial) is informational only — not subtracted from Net Worth history
    const total = portfolio + walletTotal + otherAssets;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    setNwHistory(hist=>{
      const existing = hist.find(h=>h.month===month);
      if(existing && Math.abs(existing.total-total)<1 && Math.abs(existing.portfolio-portfolio)<1 && Math.abs(existing.wallets-walletTotal)<1 && Math.abs((existing.other||0)-otherAssets)<1 && Math.abs((existing.cost||0)-portfolioCost)<1) return hist;
      const updated = [...hist.filter(h=>h.month!==month), {month, portfolio:Math.round(portfolio), wallets:Math.round(walletTotal), other:Math.round(otherAssets), cost:Math.round(portfolioCost), total:Math.round(total)}];
      return updated.sort((a,b)=>a.month.localeCompare(b.month));
    });
  },[]);

  useEffect(()=>{ document.getElementById('html-root').className=theme; localStorage.setItem('ft-theme',theme); if(initDone.current) syncToCloud(); },[theme]);
  useEffect(()=>{ localStorage.setItem('ft-txs',JSON.stringify(txs)); txsRef.current=txs; if(!initDone.current) return; if(downloadPending.current>0){downloadPending.current--;takeNwSnapshot();return;} syncToCloud(); takeNwSnapshot(); },[txs]);
  useEffect(()=>{ localStorage.setItem('ft-assets',JSON.stringify(assets)); assetsRef.current=assets; if(!initDone.current) return; if(downloadPending.current>0){downloadPending.current--;takeNwSnapshot();return;} syncToCloud(); takeNwSnapshot(); },[assets]);
  useEffect(()=>{ localStorage.setItem('ft-wallets',JSON.stringify(wallets)); walletsRef.current=wallets; if(!initDone.current) return; if(downloadPending.current>0){downloadPending.current--;takeNwSnapshot();return;} syncToCloud(); takeNwSnapshot(); },[wallets]);
  useEffect(()=>{ localStorage.setItem('ft-debts',JSON.stringify(debts)); debtsRef.current=debts; if(!initDone.current) return; if(downloadPending.current>0){downloadPending.current--;return;} syncToCloud(); },[debts]);
  useEffect(()=>{ localStorage.setItem('ft-custodial',JSON.stringify(custodial)); custodialRef.current=custodial; if(!initDone.current) return; if(downloadPending.current>0){downloadPending.current--;takeNwSnapshot();return;} syncToCloud(); takeNwSnapshot(); },[custodial]);
  // ถังขยะ sync ขึ้นคลาวด์ด้วย (เดิมเก็บแค่ localStorage เครื่องเดียว) — กู้คืนได้ข้ามเครื่อง
  useEffect(()=>{ if(!initDone.current) return; if(downloadPending.current>0){downloadPending.current--;return;} syncToCloud(); },[trash]);
  useEffect(()=>{ initDone.current=true; },[]);
  useEffect(()=>{ localStorage.setItem('ft-nw-history',JSON.stringify(nwHistory)); nwHistoryRef.current=nwHistory; },[nwHistory]);

  // Listen for sub-page localStorage changes (Budget, Goals, Recurring, UsdRate)
  useEffect(()=>{
    window.addEventListener('ft-sync', syncToCloud);
    return ()=>window.removeEventListener('ft-sync', syncToCloud);
  },[syncToCloud]);

  const addToast = useCallback((msg,type='ok')=>{
    const id=Date.now()+Math.random();
    setToasts(ts=>[...ts,{id,msg,type}]);
    setTimeout(()=>setToasts(ts=>ts.filter(t=>t.id!==id)),4200);
  },[]);
  const rmToast = useCallback(id=>setToasts(ts=>ts.filter(t=>t.id!==id)),[]);

  const undoTimers = useRef({});
  const showUndo = useCallback((label, onConfirm)=>{
    const id = Date.now()+Math.random();
    const timer = setTimeout(()=>{
      onConfirm();
      setToasts(ts=>ts.filter(t=>t.id!==id));
      delete undoTimers.current[id];
    }, 5000);
    undoTimers.current[id] = timer;
    setToasts(ts=>[...ts,{id,msg:label,type:'undo'}]);
  },[]);
  const cancelUndo = useCallback((id)=>{
    if(undoTimers.current[id]){ clearTimeout(undoTimers.current[id]); delete undoTimers.current[id]; }
    setToasts(ts=>ts.filter(t=>t.id!==id));
  },[]);

  // ── Keyboard shortcuts ──
  useEffect(()=>{
    const handler = e => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (e.metaKey||e.ctrlKey||e.altKey) return;
      const anyOpen = modal.open||assetModal.open||wModal.open||unifiedOpen.open||importOpen;
      if (e.key==='n' && !anyOpen) {
        e.preventDefault();
        setModal({open:true,editData:null,defaultWalletId:null});
      }
      if (e.key==='Escape') {
        if (modal.open)        setModal({open:false,editData:null,defaultWalletId:null});
        else if (assetModal.open) setAModal({open:false,editData:null,defaultWalletId:null});
        else if (wModal.open)  setWModal({open:false,editData:null});
        else if (unifiedOpen.open) setUnifiedOpen({open:false,from:null,to:null});
        else if (importOpen)   setImport(false);
      }
    };
    window.addEventListener('keydown', handler);
    return ()=>window.removeEventListener('keydown', handler);
  },[modal.open,assetModal.open,wModal.open,unifiedOpen.open,importOpen]);

  const checkBudget = useCallback((data)=>{
    if(data.type!=='expense') return;
    try{
      const bgs=JSON.parse(localStorage.getItem('ft-budgets')||'null')||BUDGET_DEFAULTS;
      const lmt=bgs[data.category]; if(!lmt) return;
      const curM=data.date.substring(0,7);
      const prev=txsRef.current.filter(t=>t.type==='expense'&&t.date.startsWith(curM)&&t.category===data.category).reduce((s,t)=>s+t.amount,0);
      const total=prev+data.amount; const pct=total/lmt*100;
      if(pct>=100){ const over=total-lmt; addToast(`🚨 ${data.category} เกิน Budget ฿${fmt(over)}`,'err'); }
      else if(pct>=80){ const rem=lmt-total; addToast(`⚠️ ${data.category} ใช้ ${pct.toFixed(0)}% — เหลือ ฿${fmt(rem)}`,'warn'); }
    }catch(e){}
  },[addToast]);

  // Auto-link an income/expense to the cash asset of its wallet (if any & not
  // already tagged) so a wallet that mirrors a cash asset never drifts from it.
  // The cash side of selling part of a holding. A wallet that keeps its money in
  // a linked cash asset should end up showing one figure, not two — so the
  // proceeds go into that asset when there is one, exactly as a transfer into
  // the wallet already routes. Recorded as an adjustment rather than income:
  // selling something you owned is not earnings, and would otherwise inflate the
  // month's รายรับ by the whole sale.
  const saleProceedsTx = useCallback(s=>{
    const ca = assetsRef.current.find(a=>a.walletId===s.walletId && a.type==='cash');
    return { id:uid(), type:'adjustment', walletId:s.walletId, targetAssetId: ca ? ca.id : null,
             amount:s.amount, title:s.title, date:s.date, notes:'' };
  },[]);

  const linkCashAsset = useCallback(tx=>{
    if((tx.type==='income'||tx.type==='expense') && tx.walletId && !tx.targetAssetId){
      const ca = assetsRef.current.find(a=>a.walletId===tx.walletId && a.type==='cash');
      if(ca) return {...tx, targetAssetId: ca.id};
    }
    return tx;
  },[]);

  const saveModal  = useCallback(data=>{
    if(modal.editData){
      if(Array.isArray(data)){
        // editing a transfer rebuilds fresh legs → drop the whole old linked group
        // (the edited leg AND its counterpart), otherwise the old pair orphans
        const old=modal.editData, lid=old.linkedId;
        setTxs(ts=>[...data, ...ts.filter(t=> t.id!==old.id && !(lid && t.linkedId===lid) )]);
      }
      else { const d=linkCashAsset(data); setTxs(ts=>ts.map(t=>t.id===modal.editData.id?{...d,id:t.id}:t)); }
    }
    else{
      if(Array.isArray(data)){ setTxs(ts=>[...data,...ts]); return; }
      checkBudget(data);
      if(data.type==='transfer'){
        const txId = uid(), txId2 = uid();
        const linkedId = `trf-${txId}`;
        setTxs(ts=>[
          {...data, id:txId, walletId:data.fromWalletId, linkedId, transferDir:'from'},
          {...data, id:txId2, walletId:data.toWalletId, linkedId, transferDir:'to', amount:-data.amount},
          ...ts
        ]);
      } else {
        setTxs(ts=>[{...linkCashAsset(data),id:uid()},...ts]);
      }
    }
  },[modal.editData,checkBudget,linkCashAsset]);

  const saveAsset  = useCallback(data=>{
    // _sales rides along on the form: units taken out with a wallet named as the
    // destination. The cash record carries targetAssetId so it shows on the
    // asset's ledger and in the list, but neither toAssetId nor fromAssetId —
    // the quantity above already accounts for the holding, and tagging it again
    // would take the value off twice.
    const sales = data._sales || [];
    const clean = {...data}; delete clean._sales;
    if (sales.length && assetModal.editData) {
      setTxs(ts=>[...sales.map(s=>saleProceedsTx(s)), ...ts]);
      addToast(`✓ บันทึกเงินเข้ากระเป๋า ${sales.length} รายการ`);
    }
    data = clean;
    if(assetModal.editData) {
      setAssets(as=>as.map(a=>a.id===assetModal.editData.id?{...data,id:a.id}:a));
      setAssetCreatedAlert({type:'edit',name:data.name});
    } else {
      setAssets(as=>[{...data,id:uid()},...as]);
      setAssetCreatedAlert({type:'create',name:data.name});
    }
  },[assetModal.editData,addToast,saleProceedsTx]);

  const [confirmEl, ask] = useConfirm(theme==='dark');
  const openAddTxForWallet    = useCallback(walletId=>setModal({open:true,editData:null,defaultWalletId:walletId}),[]);
  const openAddAssetForWallet = useCallback(walletId=>setAModal({open:true,editData:null,defaultWalletId:walletId}),[]);
  const delOne     = useCallback(id=>{
    const tx=txsRef.current.find(t=>t.id===id); if(!tx) return;
    // gather this tx + any linked transfer counterpart(s)
    const ids=new Set([id]);
    if(tx.linkedId) txsRef.current.forEach(t=>{ if(t.linkedId===tx.linkedId) ids.add(t.id); });
    // describe where it lives so the user can verify before deleting
    const wn=wid=>walletsRef.current.find(w=>w.id===wid)?.name;
    const an=aid=>assetsRef.current.find(a=>a.id===aid)?.name;
    const places=[];
    if(tx.walletId&&wn(tx.walletId)) places.push(`กระเป๋า ${wn(tx.walletId)}`);
    if(tx.toWalletId&&tx.toWalletId!==tx.walletId&&wn(tx.toWalletId)) places.push(`กระเป๋า ${wn(tx.toWalletId)}`);
    const aid=tx.targetAssetId||tx.toAssetId||tx.fromAssetId;
    if(aid&&an(aid)) places.push(`สินทรัพย์ ${an(aid)}`);
    let msg=`ยืนยันลบ "${tx.title||'รายการ'}"?`;
    if(places.length) msg+=`\n📍 อยู่ใน: ${places.join(' · ')}`;
    if(ids.size>1) msg+=`\n⚠️ เป็นการโยกเงิน — จะลบทั้ง ${ids.size} ฝั่งพร้อมกัน`;
    ask('ลบรายการ',msg,()=>{ sendToTrash(txsRef.current.filter(t=>ids.has(t.id))); setTxs(ts=>ts.filter(t=>!ids.has(t.id))); });
  },[ask,sendToTrash]);
  // Delete a tx incl. its linked counterpart (transfer pairs share linkedId)
  const delAssetTx = useCallback(id=>{ const tx=txsRef.current.find(t=>t.id===id); ask('ลบรายการ',`ยืนยันลบ "${tx?.title||'รายการ'}"?`,()=>{ const ids=new Set([id]); if(tx?.linkedId) txsRef.current.forEach(t=>{ if(t.linkedId===tx.linkedId) ids.add(t.id); }); sendToTrash(txsRef.current.filter(t=>ids.has(t.id))); setTxs(ts=>ts.filter(t=>!ids.has(t.id))); }); },[ask,sendToTrash]);
  const addAssetTx = useCallback(tx=>setTxs(ts=>[tx,...ts]),[]);
  // Renaming a Budget category must carry existing transactions' category tag over, or their history becomes orphaned
  const renameCategoryInTxs = useCallback((oldName,newName)=>{
    setTxs(ts=>ts.map(t=>t.category===oldName?{...t,category:newName}:t));
    // the recycle bin holds full copies, so a transaction deleted before the
    // rename would come back afterwards carrying the retired name
    setTrash(tr=>tr.map(t=>t.category===oldName?{...t,category:newName}:t));
    // Recurring templates live in localStorage, outside the tx array, so the
    // rename used to skip them entirely — they kept pointing at a category that
    // no longer existed, and every transaction they posted carried the dead name.
    try{
      const recs = JSON.parse(localStorage.getItem('ft-recurring')||'null');
      if(Array.isArray(recs)){
        const next = recs.map(r=>r.category===oldName?{...r,category:newName}:r);
        if(JSON.stringify(next)!==JSON.stringify(recs)){
          localStorage.setItem('ft-recurring',JSON.stringify(next));
          window.dispatchEvent(new Event('ft-rec-ext'));
          window.dispatchEvent(new Event('ft-sync'));
        }
      }
    }catch{}
  },[]);
  const addWalletAdjust = useCallback(({walletId, targetAssetId, amount, title, date})=>{
    setTxs(ts=>[{id:uid(), type:'adjustment', walletId, targetAssetId:targetAssetId||null, amount, title, date, notes:''},...ts]);
  },[]);
  // targetAssetId = which holding paid it (what the dividend card groups by).
  // toAssetId     = which cash asset it landed in, if any. Kept apart because a
  // broker pays into its own cash balance, not into your pocket: assetVal picks
  // the money up from toAssetId, walletCash skips it as tagged, and the credit
  // still goes to the stock. Unset means it went to the wallet's loose cash.
  const addWalletDividend = useCallback(({walletId, targetAssetId, toAssetId, amount, title, date})=>{
    setTxs(ts=>[{id:uid(), type:'dividend', walletId, targetAssetId:targetAssetId||null, toAssetId:toAssetId||null, amount, title, date, notes:''},...ts]);
  },[]);
  const quickEditTx = useCallback((id, changes)=>{
    setTxs(ts=>ts.map(t=>t.id===id?{...t,...changes}:t));
  },[]);
  const delBulk    = useCallback(ids=>{
    const idSet=new Set(ids);
    // also remove the linked counterpart of any selected transfer leg
    const linkedIds=new Set(txsRef.current.filter(t=>idSet.has(t.id)&&t.linkedId).map(t=>t.linkedId));
    const willDel = t=> idSet.has(t.id) || (t.linkedId&&linkedIds.has(t.linkedId));
    sendToTrash(txsRef.current.filter(willDel));
    setTxs(ts=>ts.filter(t=>!willDel(t)));
  },[sendToTrash]);
  const openEdit   = useCallback(t=>setModal({open:true,editData:t}),[]);
  const delAsset   = useCallback(id=>{ const a=assetsRef.current.find(a=>a.id===id); showUndo(`🗑 ลบ "${a?.name||'สินทรัพย์'}"`,()=>setAssets(as=>as.filter(a=>a.id!==id))); },[showUndo]);
  // Recycle bin actions
  const restoreFromTrash = useCallback(ids=>{
    const s=new Set(ids); const back=trashRef.current.filter(t=>s.has(t.id)); if(!back.length) return;
    setTxs(ts=>[...back.map(({_deletedAt,...t})=>t), ...ts]);
    setTrash(tr=>tr.filter(t=>!s.has(t.id)));
    addToast(`↩ กู้คืน ${back.length} รายการแล้ว`);
  },[addToast]);
  const purgeTrash = useCallback(ids=>{ const s=new Set(ids); setTrash(tr=>tr.filter(t=>!s.has(t.id))); },[]);
  const clearTrash = useCallback(()=>setTrash([]),[]);
  const assignAssetToWallet = useCallback((assetIds, walletId)=>setAssets(as=>as.map(a=>assetIds.includes(a.id)?{...a,walletId}:a)),[]);
  const updatePrices = useCallback((priceMap, usdRate, attempted=0, missing=[], currencies={}, silent=false, noAuth=false)=>{
    // The session expired between opening the page and pressing the button.
    // The endpoint would answer 401 and the refresh would look broken for no
    // stated reason, so say which of the two it is.
    if (noAuth) { addToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่','err'); return; }
    const keys = Object.keys(priceMap);
    if (!keys.length) { if(!silent) addToast('⚠️ ดึงราคาไม่สำเร็จ — ลองใหม่อีกครั้งค่ะ','warn'); return; }
    let count = 0;
    const mismatched = [], updated = [], jumped = [];
    // Name holdings the way the table names them, not by the symbol used to fetch
    // them. GC=F is gold, THB=X is the exchange rate and BITCOIN is a CoinGecko
    // id — none of which appear anywhere else in the app. The list exists so a
    // holding that quietly stopped being priced can be spotted, which only works
    // if it reads like the row it refers to.
    const nameFor = {};
    const label = a => (a.name || '').trim() || impliedTicker(a);
    setAssets(as=>as.map(a=>{
      const t = impliedTicker(a);
      if (!t) return a;
      const tUp = t.toUpperCase();
      nameFor[tUp] = label(a);
      let newPrice, quoted;
      if (a.type === 'crypto') {
        // may have come back from either source — see the routing note in fetchAllPrices
        newPrice = priceMap['__crypto__'+t.toLowerCase()] ?? priceMap[tUp];
        quoted   = currencies[t.toLowerCase()] ?? currencies[tUp];
      } else {
        newPrice = priceMap[tUp];
        quoted   = currencies[tUp];
      }
      // A price in another currency is only usable when the conversion is known.
      // USD→THB is: it is the rate the app already applies to every USD holding,
      // which lets a THB-denominated asset track a USD-quoted instrument and keep
      // its cost basis in baht — the setup that makes FX movement show up as real
      // profit or loss. Anything else is refused: NVDA.MX quotes NVIDIA in pesos,
      // and writing that onto a USD holding would inflate it ~18x while looking
      // completely ordinary on screen.
      if (quoted && a.currency && quoted !== a.currency) {
        if (quoted === 'USD' && a.currency === 'THB' && usdRate > 0) newPrice = newPrice * usdRate;
        else { mismatched.push(`${label(a)} (${quoted}≠${a.currency})`); return a; }
      }
      // Last line of defence, and the only one that checks the answer rather than
      // the rules: every guard above verifies the *shape* of a price — signed-in
      // caller, currency match, known symbol — and a ticker pointing at the wrong
      // company passes all of them. A holding worth ฿33 does not become ฿89
      // between two refreshes, so treat that as a wrong symbol, not a wrong market.
      // Asymmetric on purpose: a real -60% day happens, a real +150% one does not.
      if (newPrice > 0 && a.currentPrice > 0) {
        const ratio = newPrice / a.currentPrice;
        if (ratio > 2.5 || ratio < 0.25) {
          // keeps the symbol as well — here it is the thing to go and check
          jumped.push(`${label(a)} (${t}) ${fmt(a.currentPrice)}→${fmt(newPrice)}`);
          return a;
        }
      }
      if (newPrice && newPrice > 0) {
        count++;
        if (!updated.includes(label(a))) updated.push(label(a));
        return {...a, currentPrice: parseFloat(newPrice.toFixed(4)), priceAt: Date.now()};
      }
      return a;
    }));
    if (mismatched.length && !silent) addToast(`⚠️ ข้ามเพราะสกุลเงินไม่ตรง: ${mismatched.slice(0,3).join(', ')}`,'warn');
    // shown even on the silent refresh — this one means something is wrong, and
    // the whole point is that it happens when nobody pressed anything
    if (jumped.length) addToast(`⚠️ ราคากระโดดผิดปกติ ไม่อัปเดตให้: ${jumped.slice(0,3).join(' · ')} — ตรวจ Ticker หรือแก้ราคาเองถ้าถูกต้อง`,'warn');
    // Name what changed. "12 รายการ" alone gives no way to tell a holding that
    // was refreshed from one that quietly stopped being priced months ago.
    // The toast wraps, so list them all — hiding some behind "+4" defeats the
    // point of naming them, which is being able to spot what's missing.
    const shown = updated.slice(0,24).join(' · ');
    const more  = updated.length>24 ? ` +${updated.length-24}` : '';
    // the auto-refresh on open stays quiet — a toast on every launch is noise,
    // and the per-price age labels already say what happened
    if (silent) return;
    if (attempted && count < attempted) {
      // the server answers in symbols; translate back before showing them
      const names = missing.slice(0,6).map(m=>nameFor[String(m).toUpperCase()]||m).join(', ');
      addToast(`📡 อัปเดต ${count}/${attempted} · ${shown}${more}${names?` — ดึงไม่ได้: ${names}`:''}`,'warn');
    } else {
      addToast(`📡 อัปเดตราคา ${count} รายการ · ${shown}${more}`);
    }
  },[addToast]);

  const editAsset      = useCallback(a=>setAModal({open:true,editData:a}),[]);
  const quickPriceEdit = useCallback((id, price)=>setAssets(as=>as.map(a=>a.id===id?{...a,currentPrice:price,priceAt:Date.now()}:a)),[]);

  // Refresh stale prices when the app opens, wherever it opens. It lives here
  // rather than on the Assets page because prices back the Net Worth card and
  // every chart too, and the app restores whatever page you left off on —
  // usually the dashboard, which would otherwise show week-old numbers.
  //
  // Deliberately not a scheduled server job: a cron would have to write into
  // every user's document unprompted, racing the sync that same document is
  // already under, to keep numbers fresh while nobody is looking at them.
  const autoPriced = useRef(false);
  useEffect(()=>{
    if (!user || autoPriced.current) return;
    const priceable = assets.filter(a => impliedTicker(a));
    if (!priceable.length) return;                 // assets may not have loaded yet
    autoPriced.current = true;
    const newest = Math.max(0, ...priceable.map(a => a.priceAt || 0));
    if (Date.now() - newest < 6*60*60*1000) return;
    (async ()=>{
      try{
        const cryptoAssets = priceable.filter(a=>a.type==='crypto');
        const stocks = [
          ...priceable.filter(a=>a.type!=='crypto'&&a.type!=='gold').map(impliedTicker),
          ...cryptoAssets.map(impliedTicker).filter(t=>t.includes('-')),
        ];
        const crypto = [...new Set(cryptoAssets.map(impliedTicker).filter(t=>!t.includes('-')).map(t=>t.toLowerCase()))];
        const qs = new URLSearchParams();
        if(stocks.length) qs.set('stocks', stocks.join(','));
        if(crypto.length) qs.set('crypto', crypto.join(','));
        const token = await auth.currentUser.getIdToken();
        const r = await fetch(`/api/prices?${qs.toString()}`, {headers:{Authorization:`Bearer ${token}`}});
        if(!r.ok) return;
        const d = await r.json();
        const rate = d.usdthb || parseFloat(localStorage.getItem('ft-usdrate')||'35');
        if(d.usdthb){
          localStorage.setItem('ft-usdrate', String(d.usdthb));
          localStorage.setItem('ft-usdrate-at', String(Date.now()));
          window.dispatchEvent(new Event('ft-rate'));   // the Assets page reads it back
        }
        const updates = {...(d.stocks||{})};
        Object.entries(d.crypto||{}).forEach(([id,p])=>{ updates['__crypto__'+id] = p; });
        updatePrices(updates, rate, 0, [], d.currencies||{}, true);
      }catch{}
    })();
  },[user, assets, updatePrices]);
  // "เติมเข้า": add units at a rate → recompute weighted-average cost
  // destWalletId set = the units were sold and the cash landed in that wallet, so
  // record the money side in the same action. The transaction carries
  // targetAssetId (so it shows on the asset's ledger and in the list) but neither
  // toAssetId nor fromAssetId — the quantity below already accounts for the
  // holding, and tagging it again would take the value off twice.
  // Buying, selling and being paid a dividend all arrive here now, because each
  // is one event that touches both sides. Selling could already name the wallet
  // the cash landed in; buying could not name where the cash came from, so the
  // money half had to be typed again through a second button, and forgetting it
  // left the wallet holding money it had already spent.
  //
  // The row is an adjustment, not income or expense, for the same reason
  // saleProceedsTx was: the baht changed shape rather than arriving or leaving,
  // and an income row would inflate the month's รายรับ by the whole sale.
  const assetMoneyTx = useCallback((walletId, amount, title, date)=>{
    const ca = assetsRef.current.find(a=>a.walletId===walletId && a.type==='cash');
    return { id:uid(), type:'adjustment', walletId, targetAssetId: ca ? ca.id : null,
             amount:parseFloat(amount.toFixed(2)), title, date, notes:'' };
  },[]);

  const topUpAsset = useCallback((id, opts={})=>{
    const { kind='buy', qty:addQty=0, rate=0, amount=0, note='', date=today(), walletId=null } = opts;
    const asset = assetsRef.current.find(a=>a.id===id);
    if(!asset) return;
    // A rate is quoted in the asset's own currency; a wallet holds baht. Without
    // this, selling a USD holding for $4,079.28 credited the wallet ฿4,079.28 —
    // the whole error being the exchange rate, which is the same way the money
    // box on this form was wrong before it learned to read the asset currency.
    const nm = note.trim();
    const usdRate = parseFloat(localStorage.getItem('ft-usdrate')||'35')||35;
    const flow = assetCashFlow({ kind, qty:addQty, rate, amount, currency:asset.currency, usdRate });

    // A dividend pays money without changing what is held, so it stops here:
    // writing a move with qty 0 would put a row in the history that says nothing
    // happened to the holding, which is true but not worth reading.
    if(kind==='dividend'){
      if(!flow || !walletId) return;
      setTxs(ts=>[assetMoneyTx(walletId, flow, nm||`ปันผล ${asset.name}`, date),...ts]);
      addToast('✓ บันทึกปันผลแล้ว');
      return;
    }

    if(!addQty) return;
    if(walletId && flow){
      setTxs(ts=>[assetMoneyTx(walletId, flow,
        nm || `${addQty<0?'ขาย':'ซื้อ'} ${asset.name}`, date),...ts]);
    }
    setAssets(as=>as.map(a=>{
      if(a.id!==id) return a;
      const nq=(a.qty||0)+addQty;
      const navg=addQty<0?(a.avgCost||0):(nq>0?((a.qty||0)*(a.avgCost||0)+addQty*rate)/nq:rate);
      // realized stays in the asset's own currency — realizedByYear applies the
      // rate when it groups, so converting here would apply it twice
      const realized=addQty<0&&rate>0?(rate-(a.avgCost||0))*(-addQty):0;
      const entry={ id:uid(), date, note:nm, qty:parseFloat(addQty.toFixed(8)), rate:rate||0,
                    newQty:parseFloat(nq.toFixed(8)), newAvg:parseFloat(navg.toFixed(6)),
                    realized:parseFloat(realized.toFixed(2)) };
      return {...a, qty:parseFloat(nq.toFixed(8)), avgCost:parseFloat(navg.toFixed(6)), moves:[entry,...(a.moves||[])]};
    }));
    addToast(addQty<0?'✓ บันทึกการขายแล้ว':kind==='adjust'?'✓ ปรับจำนวนแล้ว':'✓ บันทึกการซื้อแล้ว');
  },[addToast,assetMoneyTx]);
  // The same undo the edit dialog performs, applied straight to the stored asset
  // so both places behave identically — see revertMove for why only the most
  // recent entry can be unwound, and why it returns null rather than guessing.
  const deleteAssetMove = useCallback((assetId, moveId)=>{
    let reverted = false;
    setAssets(as=>as.map(a=>{
      if(a.id!==assetId) return a;
      const m = (a.moves||[]).find(x=>x.id===moveId);
      const back = revertMove(m, a.qty||0, a.avgCost||0);
      reverted = !!back;
      const moves = (a.moves||[]).filter(x=>x.id!==moveId);
      return back ? {...a, moves, qty:back.qty, avgCost:back.avgCost} : {...a, moves};
    }));
    addToast(reverted ? '✓ ลบแล้ว — ย้อนจำนวนกลับให้เรียบร้อย' : '✓ ลบออกจากประวัติแล้ว (จำนวนคงเดิม)');
  },[addToast]);
  const renameAssetMove = useCallback((assetId, moveId, note)=>{
    setAssets(as=>as.map(a=>a.id!==assetId?a:{...a, moves:(a.moves||[]).map(m=>m.id===moveId?{...m,note}:m)}));
  },[]);
  // Adding and removing a piece of a collection from the asset row itself. qty
  // and the prices are rewritten from the pieces every time, so the stored total
  // and the list on screen cannot come apart — see itemsToAsset.
  const writeItems = (assetId, fn) => setAssets(as=>as.map(a=>{
    if(a.id!==assetId) return a;
    const items = fn(a.items||[]);
    const d = itemsToAsset(items);
    if(!d) return {...a, items};
    // the cost total is held steady: listing another amulet says what the
    // collection contains, not that more money was spent on it
    const costTotal = (a.avgCost||0)*(a.qty||0);
    const avgCost = costTotal>0 ? parseFloat((costTotal/d.qty).toFixed(6)) : d.currentPrice;
    return {...a, items, ...d, avgCost};
  }));
  const addAssetItem = useCallback((assetId, name, value)=>{
    writeItems(assetId, items=>[...items, {id:uid(), name, value}]);
    addToast(`✓ เพิ่ม "${name}" แล้ว`);
  },[addToast]);
  const delAssetItem = useCallback((assetId, itemId)=>{
    writeItems(assetId, items=>items.filter(i=>i.id!==itemId));
    addToast('✓ ลบออกจากรายการแล้ว');
  },[addToast]);
  const addWallet      = useCallback(data=>setWallets(ws=>[...ws,{...data,id:uid()}]),[]);
  const editWallet     = useCallback(data=>setWallets(ws=>ws.map(w=>w.id===data.id?data:w)),[]);
  const saveCashCount  = useCallback((wid,cashCount)=>setWallets(ws=>ws.map(w=>w.id===wid?{...w,cashCount}:w)),[]);
  const delWallet      = useCallback(id=>setWallets(ws=>ws.filter(w=>w.id!==id)),[]);
  const unlinkAsset    = useCallback(id=>setAssets(as=>as.map(a=>a.id===id?{...a,walletId:null}:a)),[]);
  const reorderWallets = useCallback(ids=>{ setWalletOrder(ids); localStorage.setItem('ft-wallet-order',JSON.stringify(ids)); syncToCloud(); },[syncToCloud]);
  const sortedWallets  = useMemo(()=>{
    if(!walletOrder.length) return wallets;
    const om={}; walletOrder.forEach((id,i)=>om[id]=i);
    return [...wallets].sort((a,b)=>(om[a.id]??999)-(om[b.id]??999));
  },[wallets,walletOrder]);
  const addRecur   = useCallback(data=>{ checkBudget(data); setTxs(ts=>[{...linkCashAsset(data),id:uid()},...ts]); addToast(`✓ บันทึก: ${data.title}`); },[checkBudget,addToast,linkCashAsset]);
  const openQuickRecur = useCallback(tx=>{ setQuickRecurModal({open:true, editData:{title:tx.title, amount:String(Math.abs(tx.amount)), category:tx.category||'อื่นๆ', type:tx.type==='income'?'income':'expense', day:parseInt(tx.date?.split('-')[2])||1, method:'BANK', enabled:true, emoji:'', walletId:tx.walletId||null}}); },[]);
  const saveQuickRecur = useCallback(data=>{ const ls=JSON.parse(localStorage.getItem('ft-recurring')||'[]'); localStorage.setItem('ft-recurring',JSON.stringify([...ls,{...data,id:'r_'+uid()}])); window.dispatchEvent(new Event('ft-sync')); window.dispatchEvent(new Event('ft-rec-ext')); setQuickRecurModal({open:false,editData:null}); addToast('⭐ บันทึกเป็นรายการโปรดแล้วค่ะ'); },[addToast]);
  // set of "title|type" keys that already have a recurring/favorite → fills the star on those tx rows
  const [favKeys, setFavKeys] = useState(()=>{ try{ return new Set((JSON.parse(localStorage.getItem('ft-recurring')||'[]')||[]).map(r=>r.title+'|'+r.type)); }catch{ return new Set(); } });
  useEffect(()=>{ const load=()=>{ try{ setFavKeys(new Set((JSON.parse(localStorage.getItem('ft-recurring')||'[]')||[]).map(r=>r.title+'|'+r.type))); }catch{} }; window.addEventListener('ft-rec-ext',load); window.addEventListener('ft-sync',load); return ()=>{ window.removeEventListener('ft-rec-ext',load); window.removeEventListener('ft-sync',load); }; },[]);
  const doImport   = useCallback(rows=>{ setTxs(ts=>[...rows.map(r=>({...r,id:uid()})),...ts]); addToast(`✓ นำเข้า ${rows.length} รายการสำเร็จ`); },[addToast]);
  // ── First-run onboarding ────────────────────────────────────────────────────
  // There used to be sample data here: a set of fake wallets, assets and
  // transactions written straight into the real stores and told apart only by a
  // _sample flag. It was removed. Living in the same stores meant it synced to
  // the cloud, landed in every backup, and every later feature had to remember
  // the flag existed — and the button that cleared it took the real ledger with
  // it, which came within one press of losing 439 records. An empty app with the
  // checklist below is a smaller thing to explain than that risk.
  const [onboardDone, setOnboardDone] = useState(()=>{ try{return localStorage.getItem('ft-onboard-done')==='1';}catch{return false;} });
  const [discover, setDiscover] = useState(false); // "โหมดค้นพบ" — highlight interactive spots
  const isEmptyData = txs.length===0 && assets.length===0 && wallets.length===0;
  // First-run activation checklist (auto-ticks as the user completes each step)
  const [checklistDone, setChecklistDone] = useState(()=>{ try{return localStorage.getItem('ft-checklist-done')==='1';}catch{return false;} });
  // Each step opens the form it names. Sending someone to the right page and
  // leaving them to find the button was half an instruction — and the people
  // reading this list are exactly the ones who do not yet know where it is.
  const checklist = [
    {done:wallets.length>0, label:'เพิ่มกระเป๋าเงินแรก',            pg:'wallet',       cta:'เพิ่มกระเป๋า',   open:()=>setWModal({open:true,editData:null})},
    {done:txs.length>0,     label:'บันทึกรายรับ-รายจ่ายแรก',       pg:'transactions', cta:'บันทึกรายการ',  open:()=>setModal({open:true,editData:null})},
    {done:assets.length>0,  label:'เพิ่มสินทรัพย์ (หุ้น/ทอง/คริปโต)', pg:'assets',       cta:'เพิ่มสินทรัพย์', open:()=>setAModal({open:true,editData:null})},
  ];
  const clDone = checklist.filter(s=>s.done).length;
  const showChecklist = page==='dashboard' && !checklistDone && clDone < 3;
  // Celebrate the very first transaction, once
  const firstTxRef = useRef(null);
  useEffect(()=>{
    const real = txs.length;
    if(firstTxRef.current===null){ firstTxRef.current=real; return; }
    if(firstTxRef.current===0 && real>0 && localStorage.getItem('ft-first-tx')!=='1'){
      try{localStorage.setItem('ft-first-tx','1');}catch{}
      addToast('🎉 บันทึกรายการแรกสำเร็จ! เริ่มต้นการเงินที่ดีแล้วนะคะ');
    }
    firstTxRef.current=real;
  },[txs]);
  const dismissOnboard = ()=>{ setOnboardDone(true); try{localStorage.setItem('ft-onboard-done','1');}catch{} };
  const doRestore  = useCallback(data=>{
    if(data.txs)        setTxs(data.txs);
    if(data.assets)     setAssets(data.assets);
    if(data.wallets)    setWallets(data.wallets);
    if(Array.isArray(data.debts)) setDebts(data.debts);
    if(Array.isArray(data.custodial)) setCustodial(data.custodial);
    if(data.nwHistory)  setNwHistory(data.nwHistory);
    if(data.budgets)       localStorage.setItem('ft-budgets',        JSON.stringify(data.budgets));
    if(data.budgetHistory)   localStorage.setItem('ft-budget-history',    JSON.stringify(data.budgetHistory));
    if(data.catMeta)         localStorage.setItem('ft-cat-meta',          JSON.stringify(data.catMeta));
    if(data.importCatMemory) localStorage.setItem('ft-import-cat-memory', JSON.stringify(data.importCatMemory));
    if(data.irregularCats) localStorage.setItem('ft-cat-irregular',  JSON.stringify(data.irregularCats));
    if(data.recurring)  localStorage.setItem('ft-recurring',   JSON.stringify(data.recurring));
    if(data.walletOrder)localStorage.setItem('ft-wallet-order',JSON.stringify(data.walletOrder));
    if(data.usdrate)    localStorage.setItem('ft-usdrate',     String(data.usdrate));
    addToast('✅ กู้คืนข้อมูลสำเร็จค่ะ');
  },[addToast]);

  // The Backup panel used to carry a third tab that repaired legacy data: it
  // stamped walletId onto cash-asset rows that predated the field, and reported
  // lonely transfer legs for review. Both were migrations, not maintenance —
  // every path that writes those rows now sets walletId, and deleting a transfer
  // takes both legs with it, so neither state can be created again. It was run
  // on 2026-08-23 (2 rows linked, no orphans) and removed the same day.
  //
  // `npm run audit` still checks for both against a backup file, which is the
  // right place for a check that should almost never fire.

  const dk = theme==='dark';
  // The card colour rides along with the background so the two are chosen
  // together; .card-solid reads it through inheritance.
  const _th = THEMES.find(t=>t.id===colorTheme) || THEMES[0];
  // backgroundAttachment pins the glow to the viewport instead of to the
  // document. Without it the gradient is sized to the whole scrolling page, so
  // "15% from the top" lands 15% down a page many screens tall — the warmth
  // sat in the header and everything below it was flat black. Fixed keeps the
  // same glow in view the whole way down. iOS Safari ignores this and falls
  // back to the old scroll behaviour, which is merely what we had before.
  const bgStyle = { background: _th[dk?'dark':'light'], backgroundAttachment:'fixed', '--card-bg': _th.card || '#0b1220' };

  // ── Auth guard ──
  if (kickedOut) return (
    <div className="min-h-screen flex items-center justify-center" style={bgStyle}>
      <div className={`w-full max-w-sm rounded-2xl shadow-2xl scale-in p-8 text-center ${theme==='dark'?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`}>
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className={`text-lg font-bold mb-2 ${theme==='dark'?'text-white':'text-slate-800'}`}>ออกจากระบบอัตโนมัติ</h2>
        <p className={`text-sm mb-6 ${theme==='dark'?'text-slate-400':'text-slate-500'}`}>บัญชีนี้ถูกเข้าสู่ระบบจากอุปกรณ์อื่น<br/>กรุณาเข้าสู่ระบบใหม่อีกครั้ง</p>
        <button onClick={()=>setKickedOut(false)}
          className="w-full py-3 rounded-xl btn-primary text-white text-sm font-semibold">
          🔓 Login ใหม่
        </button>
      </div>
    </div>
  );

  // A skeleton's whole job is to reserve the shape the real content will take,
  // so that when it arrives it fills a space already held rather than shoving
  // the page around. This one was centred in a max-w-md column while the app it
  // stands in for is a full-width grid — nothing lined up, so the content still
  // jumped and all the skeleton bought was the feeling of loading, which a
  // spinner gives for less.
  //
  // It matches the real geometry now: the same max-w-7xl, a nav bar in place so
  // the chrome does not pop in, and blocks at the sizes the hero, the stat row
  // and the charts actually occupy.
  //
  // The pulsing logo and "กำลังตรวจสอบ..." went with it. A caption explaining
  // that loading is happening is the thing a skeleton exists to replace; the
  // shapes say it, and they say what is coming as well.
  if (authLoading || dataLoading) return (
    <div className="min-h-screen" style={bgStyle}>
      {(()=>{ const sk=`rounded-2xl animate-pulse ${dk?'bg-white/[0.06]':'bg-slate-100'}`;
        return (<>
          <div className={`border-b ${dk?'border-gold-500/18':'border-gold-100'}`}>
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl logo-icon flex items-center justify-center"><LogoSvg size={18}/></div>
              <div className={`h-4 w-24 rounded-lg animate-pulse ${dk?'bg-white/[0.06]':'bg-slate-100'}`}/>
              <div className="flex-1"/>
              <div className={`h-7 w-7 rounded-lg animate-pulse ${dk?'bg-white/[0.06]':'bg-slate-100'}`}/>
            </div>
          </div>
          <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
            <div className={`h-6 w-52 ${sk}`}/>
            {page==='transactions' ? (
              <div className="space-y-2.5">
                <div className={`h-12 ${sk}`}/>
                {[0,1,2,3,4,5].map(i=><div key={i} className={`h-16 ${sk}`}/>)}
              </div>
            ) : page==='assets'||page==='wallet' ? (
              <>
                <div className={`h-28 ${sk}`}/>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[0,1,2,3,4,5].map(i=><div key={i} className={`h-52 ${sk}`}/>)}
                </div>
              </>
            ) : (
              <>
                <div className={`h-40 ${sk}`}/>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[0,1,2,3].map(i=><div key={i} className={`h-24 ${sk}`}/>)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {[0,1,2].map(i=><div key={i} className={`h-28 ${sk}`}/>)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className={`h-72 ${sk}`}/><div className={`h-72 ${sk}`}/>
                </div>
              </>
            )}
          </main>
        </>);
      })()}
    </div>
  );
  // An account is required. Local mode was tried and dropped: it kept data off
  // the server entirely, but two devices then held two different sets of
  // records with no way to reconcile them, and an expense tracker that shows
  // different numbers on the phone and the laptop reads as broken rather than
  // private. The privacy it bought is being rebuilt as encryption instead —
  // same guarantee, without asking anyone to choose between it and the app
  // working properly.
  if (!user) return <LoginPage theme={theme}/>;

  // Verification gates the app as well as the rules, so an unverified account
  // gets an explanation rather than a permission error it cannot act on.
  if (user && !user.emailVerified && user.email !== ADMIN_EMAIL)
    return <VerifyEmail user={user} dk={dk} addToast={addToast}/>;

  if (user && userStatus === 'pending') return (
    <div className={`min-h-screen flex items-center justify-center ${dk?'bg-app':'bg-slate-50'}`}>
      <div className={`w-full max-w-sm rounded-2xl p-8 text-center shadow-xl ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`}>
        {/* A wait with no stated length, no reason and no next step reads as
            being stonewalled. All three are cheap to give, and the page now
            watches the registry, so it lets itself in the moment approval
            lands rather than asking anyone to guess that a refresh helps. */}
        <div className="text-5xl mb-4">⏳</div>
        <h2 className={`text-lg font-bold mb-2 ${dk?'text-white':'text-slate-800'}`}>รอการอนุมัติ</h2>
        <p className={`text-sm mb-4 ${dk?'text-slate-400':'text-slate-500'}`}>ยืนยันอีเมลเรียบร้อยแล้ว</p>
        <p className={`text-sm font-medium mb-5 ${dk?'text-gold-300':'text-gold-600'}`}>{user.email}</p>
        <div className={`text-xs leading-relaxed space-y-2 mb-6 text-left rounded-xl p-3.5 ${dk?'bg-white/5 text-slate-400':'bg-slate-50 text-slate-500'}`}>
          <p>ขั้นตอนสุดท้ายคือรอผู้ดูแลระบบเปิดสิทธิ์ให้ โดยปกติภายใน 1 วัน</p>
          <p>ระบบเปิดรับผู้ใช้ทีละน้อยเพื่อควบคุมค่าใช้จ่ายของเซิร์ฟเวอร์ จึงต้องอนุมัติทีละบัญชี</p>
          <p className={dk?'text-slate-300':'text-slate-600'}>เปิดหน้านี้ทิ้งไว้ได้เลย เมื่อได้รับอนุมัติระบบจะพาเข้าสู่หน้าใช้งานโดยอัตโนมัติ</p>
        </div>
        <button onClick={()=>auth.signOut()} className={`text-sm ${dk?'text-slate-400 hover:text-white':'text-slate-500 hover:text-slate-700'}`}>ออกจากระบบ</button>
      </div>
    </div>
  );

  if (userStatus === 'rejected') return (
    <div className={`min-h-screen flex items-center justify-center ${dk?'bg-app':'bg-slate-50'}`}>
      <div className={`w-full max-w-sm rounded-2xl p-8 text-center shadow-xl ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`}>
        <div className="text-5xl mb-4">🚫</div>
        <h2 className={`text-lg font-bold mb-2 ${dk?'text-white':'text-slate-800'}`}>ไม่ได้รับอนุญาต</h2>
        {/* Two lines rather than one wrapped paragraph: the single line broke
            after the last word and left one syllable stranded on a line of its
            own. Neutral wording as well, to match the other screens shown
            before anyone is inside the app. */}
        <p className={`text-sm mb-1 ${dk?'text-slate-400':'text-slate-500'}`}>บัญชีนี้ถูกระงับการเข้าใช้งาน</p>
        <p className={`text-sm mb-6 ${dk?'text-slate-400':'text-slate-500'}`}>หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบ</p>
        <button onClick={()=>auth.signOut()} className={`text-sm ${dk?'text-slate-400 hover:text-white':'text-slate-500 hover:text-slate-700'}`}>ออกจากระบบ</button>
      </div>
    </div>
  );

  const signOut = () => auth.signOut();
  const isAdmin = user.email === ADMIN_EMAIL;

  const nav=[
    {k:'dashboard',   l:'Dashboard', i:'home'},
    {k:'transactions', l:'รายการ',   i:'list'},
    {k:'assets',      l:'สินทรัพย์',   i:'trend'},
    {k:'wallet',      l:'กระเป๋าเงิน', i:'wallet'},
    {k:'budget',      l:'Budget',       i:'wallet'},
    {k:'debt',        l:'หนี้สิน',     i:'creditcard'},
    {k:'summary',     l:'สรุป',       i:'chart'},
  ];

  const syncTip  = syncStatus==='saving'?'กำลังซิงค์...':syncStatus==='saved'?'ซิงค์แล้ว':syncStatus==='err'?'ซิงค์ล้มเหลว':'Cloud Sync';

  return (
    <div className="min-h-screen transition-colors duration-300" style={bgStyle} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

      {/* ── DESKTOP: Top Navbar (lg+) ── */}
      <nav className={`hidden lg:block sticky top-0 z-40 border-b no-print ${dk?'bg-[#080f1e]/97 border-gold-500/18 backdrop-blur-2xl':'bg-white/85 border-gold-100 backdrop-blur-xl'}`}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <LogoSvg size={34}/>
            <span className={`font-bold text-sm ${dk?'text-white':'text-slate-800'}`}>FinTracker</span>
          </div>
          <div className={`flex flex-1 rounded-xl p-1 gap-0.5 overflow-x-auto ${dk?'bg-white/5':'bg-slate-100'}`}>
            {nav.map(({k,l,i})=>(
              <button key={k} onClick={()=>{setPage(k);localStorage.setItem('ft-page',k);}} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${page===k?(dk?'nav-active-dk text-white':'nav-active-lt text-slate-700'):(dk?'text-slate-400 hover:text-white':'text-slate-500 hover:text-slate-800')}`}>
                <Ic n={i} s={12}/><span>{l}</span>
              </button>))}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span title={syncTip} className={`inline-flex items-center px-1 ${syncStatus==='err'?'text-rose-400':syncStatus==='saving'?'text-yellow-400':'text-emerald-400'}`}><Ic n={syncStatus==='err'?'alert':'sync'} s={15} cls={syncStatus==='saving'?'animate-spin':''}/></span>
            <button onClick={togglePrivacy} title={privacy?'ปลดล็อกตัวเลข':'ล็อกตัวเลข'} className={`p-2 rounded-xl transition-colors ${privacy?(dk?'bg-gold-500/20 text-gold-300':'bg-gold-50 text-gold-500'):(dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-700')}`}>
              <Ic n={privacy?'lock':'lockopen'} s={15}/>
            </button>
            {isAdmin&&<button onClick={()=>{setPage('admin');localStorage.setItem('ft-page','admin');}} title="Users" className={`p-2 rounded-xl transition-colors text-sm leading-none ${page==='admin'?(dk?'bg-gold-500/20':'bg-gold-50'):(dk?'hover:bg-white/10':'hover:bg-slate-100')}`}>👤</button>}
            <button onClick={()=>setAcctOpen(true)} title="บัญชี" className={`p-2 rounded-xl transition-colors ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-700'}`}><Ic n="settings" s={15}/></button>
            {/* Consolidated settings menu */}
            <div className="relative">
              <button onClick={()=>setMenuOpen(o=>!o)} title="เมนู" className={`p-2 rounded-xl transition-colors ${menuOpen?(dk?'bg-white/10 text-white':'bg-slate-100 text-slate-800'):(dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-700')}`}><Ic n="menu" s={16}/></button>
              {menuOpen&&(<>
                <div className="fixed inset-0 z-40" onClick={()=>setMenuOpen(false)}/>
                <div className={`absolute right-0 mt-2 w-56 rounded-xl shadow-2xl z-50 py-1.5 ${dk?'bg-[#0d1625] border border-white/10':'bg-white border border-slate-200'}`}>
                  {[
                    {icon:'💡', label: discover?'ซ่อนคำแนะนำการใช้งาน':'คำแนะนำการใช้งาน', on:()=>setDiscover(d=>!d)},
                    {icon:'📥', label:'นำเข้าข้อมูล', on:()=>setImport(true)},
                    {icon:'💾', label:'Backup & กู้คืน', on:()=>setBackupOpen(true)},
                    {icon:'🗑', label:`ถังขยะ${trash.length?` (${trash.length})`:''}`, on:()=>setTrashOpen(true)},
                    {icon:'🖨', label:'พิมพ์ / PDF', on:()=>window.print()},
                  ].map((it,i)=>(
                    <button key={i} onClick={()=>{setMenuOpen(false); it.on();}}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-left transition-colors ${dk?'hover:bg-white/8 text-slate-300':'hover:bg-slate-50 text-slate-600'}`}>
                      <span className="w-4 text-center">{it.icon}</span><span>{it.label}</span>
                    </button>
                  ))}
                  <div className={`my-1 h-px ${dk?'bg-white/8':'bg-slate-100'}`}/>
                  <button onClick={()=>{setMenuOpen(false); signOut();}}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-left transition-colors ${dk?'hover:bg-rose-500/15 text-rose-400':'hover:bg-rose-50 text-rose-500'}`}>
                    <span className="w-4 text-center"><Ic n="logout" s={13}/></span><span>ออกจากระบบ</span>
                  </button>
                </div>
              </>)}
            </div>
          </div>
        </div>
      </nav>

      {/* ── MOBILE: Floating Sidebar (< lg) ── */}
      {sidebarOpen&&(
        <div className="fixed inset-0 z-40 lg:hidden" onClick={()=>setSidebarOpen(false)}
          style={{background:'rgba(0,0,0,0.45)',backdropFilter:'blur(4px)'}}/>
      )}
      <aside className={`lg:hidden fixed z-50 no-print flex flex-col transition-transform duration-300 ease-out
        ${sidebarOpen?'translate-x-0':'-translate-x-full'}
        rounded-2xl shadow-2xl overflow-hidden
        ${dk?'bg-[#1e1e28] border border-white/12':'bg-white border border-slate-200/80'}
      `} style={{top:'max(12px, env(safe-area-inset-top))',left:'12px',bottom:'12px',width:'240px'}}>

        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-4 flex-shrink-0 border-b ${dk?'border-white/[0.07]':'border-slate-100'}`}>
          <div className="flex items-center gap-2.5">
            <LogoSvg size={32}/>
            <span className={`font-bold text-sm tracking-wide ${dk?'text-white':'text-slate-800'}`}>FinTracker</span>
          </div>
          <button onClick={()=>setSidebarOpen(false)}
            className={`p-1.5 rounded-xl transition-colors ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-400'}`}>
            <Ic n="x" s={15}/>
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {nav.map(({k,l,i})=>(
            <button key={k} onClick={()=>{setPage(k);localStorage.setItem('ft-page',k);setSidebarOpen(false);}}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left
                ${page===k
                  ?(dk?'bg-gold-500/20 text-gold-300 border border-gold-500/25':'bg-gold-50 text-gold-700 border border-gold-100')
                  :(dk?'text-slate-400 hover:text-white hover:bg-white/[0.06]':'text-slate-500 hover:text-slate-700 hover:bg-slate-50')
                }`}>
              <span className={`flex-shrink-0 ${page===k?(dk?'text-gold-400':'text-gold-600'):(dk?'text-slate-500':'text-slate-400')}`}>
                <Ic n={i} s={15}/>
              </span>
              <span className="flex-1">{l}</span>
              {page===k&&<span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dk?'bg-gold-400':'bg-gold-500'}`}/>}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className={`p-2 border-t flex-shrink-0 space-y-0.5 ${dk?'border-white/[0.07]':'border-slate-100'}`}>
          {user&&(
            <button onClick={()=>{setAcctOpen(true);setSidebarOpen(false);}}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-1 transition-colors ${dk?'bg-white/[0.04] hover:bg-white/[0.08]':'bg-slate-50 hover:bg-slate-100'}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${dk?'bg-gold-500/30 text-gold-300':'bg-gold-100 text-gold-600'}`}>
                {(whoAmI(user)||user.email||'?')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className={`text-xs font-semibold truncate ${dk?'text-slate-200':'text-slate-700'}`}>{whoAmI(user)||user.email}</div>
                <div className={`text-[10px] truncate ${dk?'text-slate-400':'text-slate-500'}`}>{user.email}</div>
              </div>
              <Ic n="settings" s={14} cls={dk?'text-slate-500':'text-slate-400'}/>
            </button>
          )}
          <button onClick={()=>{setTrashOpen(true);setSidebarOpen(false);}}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${dk?'hover:bg-white/8 text-slate-400':'hover:bg-slate-100 text-slate-700'}`}>
            <span className="w-3.5 text-center text-xs">🗑</span><span className="text-xs">ถังขยะ{trash.length?` (${trash.length})`:''}</span>
          </button>
          <button onClick={()=>{setBackupOpen(true);setSidebarOpen(false);}}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${dk?'hover:bg-white/8 text-slate-400':'hover:bg-slate-100 text-slate-700'}`}>
            <Ic n="download" s={14}/><span className="text-xs">Backup & กู้คืน</span>
          </button>
          <button onClick={()=>{window.print();setSidebarOpen(false);}}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${dk?'hover:bg-white/8 text-slate-400':'hover:bg-slate-100 text-slate-700'}`}>
            <Ic n="print" s={14}/><span className="text-xs">พิมพ์ / PDF</span>
          </button>
          {isAdmin&&<button onClick={()=>{setPage('admin');localStorage.setItem('ft-page','admin');setSidebarOpen(false);}}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${page==='admin'?(dk?'bg-gold-500/20 text-gold-300':'bg-gold-50 text-gold-600'):(dk?'hover:bg-white/8 text-slate-400':'hover:bg-slate-100 text-slate-700')}`}>
            <span className="w-3.5 text-center text-xs">👤</span><span className="text-xs">Users</span>
          </button>}
          <button onClick={signOut}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${dk?'hover:bg-rose-500/15 text-rose-400':'hover:bg-rose-50 text-rose-500'}`}>
            <Ic n="logout" s={14}/><span className="text-xs">ออกจากระบบ</span>
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className={`lg:hidden sticky top-0 z-30 h-14 flex items-center justify-between px-4 border-b no-print
        ${dk?'bg-[#080f1e]/97 border-gold-500/18 backdrop-blur-2xl':'bg-white/85 border-gold-100 backdrop-blur-xl'}`}>
        <div className="flex items-center gap-2">
          <button onClick={()=>setSidebarOpen(true)} aria-label="เปิดเมนู" className={`p-2.5 rounded-xl ${dk?'hover:bg-white/10 text-slate-400':'hover:bg-slate-100 text-slate-700'}`}>
            <Ic n="menu" s={18}/>
          </button>
          <LogoSvg size={28}/>
          <span className={`font-bold text-sm ${dk?'text-white':'text-slate-800'}`}>FinTracker</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={togglePrivacy} title={privacy?'ปลดล็อกตัวเลข':'ล็อกตัวเลข'} aria-label={privacy?'ปลดล็อกตัวเลข':'ล็อกตัวเลข'}
            className={`p-2.5 rounded-lg transition-all active:scale-90 ${privacy?(dk?'text-gold-400':'text-gold-500'):(dk?'text-slate-400':'text-slate-700')}`}>
            <Ic n={privacy?'lock':'lockopen'} s={16}/>
          </button>
          <button onClick={()=>{ syncToCloud(); addToast('↻ กำลังซิงค์...'); }} title={syncTip} aria-label="ซิงค์ข้อมูล"
            className={`p-2.5 rounded-lg active:scale-90 transition-transform ${syncStatus==='err'?'text-rose-400':syncStatus==='saving'?'text-yellow-400':'text-emerald-400'}`}>
            <Ic n={syncStatus==='err'?'alert':'sync'} s={16} cls={syncStatus==='saving'?'animate-spin':''}/>
          </button>
        </div>
      </header>

      {/* New device alert banner */}
      {newDeviceAlert&&(
        <div className="sticky top-14 lg:top-16 z-30 mx-4 mt-2">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/90 backdrop-blur text-white text-sm font-medium shadow-lg">
              <span className="text-lg">⚠️</span>
              <span className="flex-1">มี device ใหม่ ({newDeviceAlert}) เพิ่งเข้าสู่ระบบบัญชีของคุณ</span>
              <button onClick={()=>setNewDeviceAlert(null)} className="p-1 rounded-lg hover:bg-white/20 flex-shrink-0">✕</button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 lg:pb-6 pb-24">
        {showChecklist && (
          <div className={`mb-4 rounded-2xl border p-5 no-print ${dk?'card-solid':'glass-light shadow-sm'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🚀</span>
                <h3 className={`text-sm font-semibold ${dk?'text-white':'text-slate-700'}`}>เริ่มต้นใช้งาน</h3>
                <span className={`text-xs ${dk?'text-slate-400':'text-slate-500'}`}>{clDone}/3</span>
              </div>
              <button onClick={()=>{setChecklistDone(true);try{localStorage.setItem('ft-checklist-done','1');}catch{}}} className={`text-xs ${dk?'text-slate-500 hover:text-slate-300':'text-slate-400 hover:text-slate-600'}`}>ซ่อน</button>
            </div>
            <div className={`w-full h-2 rounded-full mb-4 overflow-hidden ${dk?'bg-white/8':'bg-slate-100'}`}><div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{width:`${clDone/3*100}%`}}/></div>
            {/* Finished steps leave rather than sit here crossed out. A list
                that shrinks each time reads as progress; three lines where two
                are struck through read as a list with things wrong with it.
                The count and the bar above still carry how far along it is,
                which is what the crossed-out lines were doing badly. */}
            <div className="space-y-2.5">
              {checklist.filter(s=>!s.done).map((s,i)=>(
                <div key={s.pg} className="flex items-center justify-between gap-3 fade-up">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${dk?'bg-white/10 text-slate-500':'bg-slate-200 text-slate-400'}`}>{i+1}</span>
                    <span className={`text-sm truncate ${dk?'text-slate-200':'text-slate-700'}`}>{s.label}</span>
                  </div>
                  {/* The page renders first, so the form opens on the next tick
                      with the right screen already behind it — and closing it
                      leaves the person where the work happens rather than back
                      on the dashboard. */}
                  <button onClick={()=>{ setPage(s.pg); try{localStorage.setItem('ft-page',s.pg);}catch{} setTimeout(s.open, 0); }}
                    className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gold-500 hover:bg-gold-600 whitespace-nowrap">{s.cta} →</button>
                </div>
              ))}
            </div>
            <div className={`mt-4 pt-3 border-t text-xs ${dk?'border-white/8 text-slate-500':'border-slate-100 text-slate-400'}`}>
              💡 กด <b>คำแนะนำการใช้งาน</b> ในเมนู ☰ เพื่อไฮไลต์จุดที่กดได้ทั่วทั้งหน้า
            </div>
          </div>
        )}
        {/* One door, not seven. Masking the figures still left every page
            readable — the transactions list in particular, where the titles say
            there is a salary, a DCA, a transfer to family, without a single
            number showing. A privacy feature that covers some of the app gives
            the confidence of one that covers all of it, which is worse than
            having none. So while a PIN is set and the figures are hidden,
            nothing renders until it is entered. */}
        {privacy && lockOn ? <LockedPanel dk={theme==='dark'} onUnlock={()=>setPinGate('unlock')}/> : (<>
        {page==='dashboard'    && <Dashboard     txs={txs} assets={assets} theme={theme} nwHistory={nwHistory} wallets={wallets} user={user} debts={debts} custodial={custodial} privacy={privacy} hideAmt={hideAmt} onToggleHide={toggleHideAmt}/>}
        {page==='transactions' && <TxPage        txs={txs}    theme={theme} onEdit={openEdit} onAdd={()=>setModal({open:true,editData:null})} onDelete={delOne} onBulkDelete={delBulk} onExport={()=>exportCSV(txs)} wallets={wallets} assets={assets} onAddRecurring={openQuickRecur} onRecordRecurring={addRecur} onQuickEdit={quickEditTx} favKeys={favKeys}/>}
        {page==='assets'       && <AssetsPage    assets={assets} theme={theme} onEdit={editAsset} onDelete={delAsset} onAdd={()=>setAModal({open:true,editData:null})} onInvest={assetId=>setUnifiedOpen({open:true,from:null,to:typeof assetId==='number'?`a-${assetId}`:null})} onPriceUpdate={updatePrices} onQuickPrice={quickPriceEdit} onDCA={a=>setDcaModal({open:true,asset:a})} onAddAssetTx={addAssetTx} onDeleteAssetTx={delAssetTx} onTopUpAsset={topUpAsset} onDeleteMove={deleteAssetMove} onRenameMove={renameAssetMove} onAddItem={addAssetItem} onDelItem={delAssetItem} wallets={wallets} txs={txs}/>}
        {page==='budget'       && <BudgetPage    key={`budget-${dataKey}`}    txs={txs}    theme={theme} onEdit={openEdit} onRenameCategory={renameCategoryInTxs}/>}
        {page==='debt'         && <DebtPage      theme={theme} debts={debts} setDebts={setDebts}/>}
        {page==='wallet'       && <WalletPage     key={`wallet-${dataKey}`}    wallets={sortedWallets} txs={txs} assets={assets} onAdd={addWallet} onEdit={editWallet} onDelete={delWallet} onAddTx={openAddTxForWallet} onEditTx={openEdit} onDeleteTx={delOne} onAddAsset={openAddAssetForWallet} onUnlinkAsset={unlinkAsset} onAssetTransfer={assetId=>setUnifiedOpen({open:true,from:`a-${assetId}`,to:null})} onReorder={reorderWallets} theme={theme} onOpenWalletModal={editData=>setWModal({open:true,editData:editData||null})} onUnifiedTransfer={()=>setUnifiedOpen({open:true,from:null,to:null})} onAdjust={addWalletAdjust} onDividend={addWalletDividend} onSaveCashCount={saveCashCount} custodial={custodial} setCustodial={setCustodial}/>}
        {page==='summary'      && <SummaryPage   txs={txs} assets={assets} theme={theme}/>}
        {page==='admin'        && isAdmin && <AdminPage theme={theme}/>}
        </>)}
      </main>

      {/* ── Floating Add Button (Mobile) — context-aware per page ── */}
      {/* gone while locked: a + hovering over a lock screen invites a tap that
          opens a form on top of nothing */}
      {!(privacy&&lockOn)&&['dashboard','transactions','assets','wallet','debt'].includes(page)&&(
        <button
          onClick={()=> page==='assets' ? setAModal({open:true,editData:null,defaultWalletId:null})
            : page==='wallet' ? setWModal({open:true,editData:null})
            /* the debt modal's state lives inside DebtPage, not here — this used
               to call it directly, so the button threw instead of opening it */
            : page==='debt'   ? window.dispatchEvent(new Event('ft-add-debt'))
            : setModal({open:true,editData:null})}
          aria-label={page==='assets'?'เพิ่มสินทรัพย์':page==='wallet'?'เพิ่มกระเป๋า':page==='debt'?'เพิ่มหนี้สิน':'เพิ่มรายการ'}
          className="lg:hidden fixed right-5 z-40 no-print w-14 h-14 rounded-full btn-primary text-white shadow-2xl flex items-center justify-center active:scale-90 transition-transform"
          style={{bottom:'calc(env(safe-area-inset-bottom) + 76px)'}}>
          <Ic n="plus" s={26}/>
        </button>
      )}

      {/* ── Bottom Navigation Bar (Mobile Only) ── */}
      <nav className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 no-print border-t
        ${dk?'bg-[#080f1e]/98 border-gold-500/15 backdrop-blur-2xl':'bg-white/95 border-slate-200 backdrop-blur-xl'}`}
        style={{paddingBottom:'env(safe-area-inset-bottom)'}}>
        <div className="flex items-center justify-around px-1 pt-2 pb-2">
          {[
            {k:'dashboard',    l:'หน้าหลัก', i:'home'},
            {k:'transactions', l:'รายการ',   i:'list'},
            {k:'assets',       l:'สินทรัพย์', i:'trend'},
            {k:'wallet',       l:'กระเป๋า',  i:'wallet'},
          ].map(({k,l,i})=>{
            const active = page===k;
            return (
              <button key={k} onClick={()=>{setPage(k);localStorage.setItem('ft-page',k);}}
                className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-2xl transition-all active:scale-90 ${active?(dk?'text-orange-400':'text-orange-600'):(dk?'text-slate-500':'text-slate-400')}`}>
                <div className={`p-1.5 rounded-xl transition-all ${active?(dk?'bg-gold-500/15':'bg-gold-50'):''}`}>
                  <Ic n={i} s={20}/>
                </div>
                <span className={`text-[10px] font-medium ${active?'font-semibold':''}`}>{l}</span>
              </button>
            );
          })}
          {/* More button → opens sidebar */}
          <button onClick={()=>setSidebarOpen(true)}
            className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-2xl transition-all active:scale-90 ${['budget','debt','summary'].includes(page)?(dk?'text-gold-400':'text-gold-600'):(dk?'text-slate-500':'text-slate-400')}`}>
            <div className={`p-1.5 rounded-xl transition-all ${['budget','debt','summary'].includes(page)?(dk?'bg-gold-500/15':'bg-gold-50'):''}`}>
              <Ic n="menu" s={20}/>
            </div>
            <span className="text-[10px] font-medium">เพิ่มเติม</span>
          </button>
        </div>
      </nav>

      <WalletModal open={wModal.open} onClose={()=>setWModal({open:false,editData:null})} onSave={data=>{ if(wModal.editData) editWallet({...data,id:wModal.editData.id}); else addWallet(data); setWModal({open:false,editData:null}); }} editData={wModal.editData} theme={theme}/>
      <Modal       open={modal.open}      onClose={()=>setModal({open:false,editData:null,defaultWalletId:null})}  onSave={saveModal}  editData={modal.editData}     theme={theme} wallets={wallets} assets={assets} txs={txs} defaultWalletId={modal.defaultWalletId}/>
      <AssetModal  open={assetModal.open} onClose={()=>setAModal({open:false,editData:null,defaultWalletId:null})} onSave={saveAsset} onAssign={assignAssetToWallet} onUnlink={unlinkAsset} onAssetTransfer={assetId=>setUnifiedOpen({open:true,from:`a-${assetId}`,to:null})} editData={assetModal.editData} theme={theme} wallets={wallets} assets={assets} defaultWalletId={assetModal.defaultWalletId}/>
      <ImportModal  open={importOpen}      onClose={()=>setImport(false)}  onImport={doImport}  theme={theme}/>
      <BackupModal  open={backupOpen}      onClose={()=>setBackupOpen(false)} onRestore={doRestore} theme={theme} txs={txs} assets={assets} wallets={wallets} debts={debts} nwHistory={nwHistory} custodial={custodial}/>
      <DiscoverOverlay active={discover}/>
      {isEmptyData && !onboardDone && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg">
            <div className={`w-full max-w-md rounded-2xl shadow-2xl scale-in p-6 text-center ${dk?'bg-[#080f1e] border border-gold-500/25':'bg-white'}`}>
              <div className="text-5xl mb-3">👋</div>
              <h2 className={`text-lg font-bold mb-1 ${dk?'text-white':'text-slate-800'}`}>ยินดีต้อนรับสู่ FinTracker</h2>
              <p className={`text-sm mb-6 ${dk?'text-slate-400':'text-slate-500'}`}>ติดตามเงิน กระเป๋า สินทรัพย์ และงบประมาณ ในที่เดียว</p>
              <button onClick={dismissOnboard} className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors">➕ เริ่มบันทึกข้อมูล</button>
              <p className={`text-[11px] mt-4 ${dk?'text-slate-500':'text-slate-400'}`}>มีรายการตั้งต้น 3 ข้อคอยแนะนำในหน้าแรก</p>
            </div>
          </div>
        </Portal>
      )}
      <TrashModal   open={trashOpen}       onClose={()=>setTrashOpen(false)} theme={theme} trash={trash} wallets={wallets} assets={assets} onRestore={restoreFromTrash} onPurge={purgeTrash} onClear={clearTrash}/>
      <AccountModal open={acctOpen}        onClose={()=>setAcctOpen(false)} theme={theme} setTheme={setTheme} colorTheme={colorTheme} setColorTheme={setColorTheme} user={user}
        lockOn={lockOn} onLockChange={m=>setPinGate(m)}/>
      <PinModal mode={pinGate} dk={theme==='dark'} onClose={()=>setPinGate(null)}
        onDone={what=>{
          if(what==='change'){ setPinGate('set'); return; }   // straight on to choosing the new one
          setPinGate(null);
          if(what==='unlock') applyPrivacy(false);
          if(what==='set'){ setLockOn(true); applyPrivacy(true); addToast('🔒 Passcode set — amounts hidden on every launch'); }
          if(what==='off'){ setLockOn(false); addToast('🔓 Passcode removed'); }
        }}/>
      <UnifiedTransferModal open={unifiedOpen.open} presetFrom={unifiedOpen.from} presetTo={unifiedOpen.to} onClose={()=>setUnifiedOpen({open:false,from:null,to:null})} onSave={saveUnifiedTransfer} wallets={wallets} assets={assets} txs={txs} theme={theme}/>
      <DCAModal open={dcaModal.open} onClose={()=>setDcaModal({open:false,asset:null})} asset={dcaModal.asset} usdRate={35} theme={theme}/>
      <RecurringModal open={quickRecurModal.open} onClose={()=>setQuickRecurModal({open:false,editData:null})} onSave={saveQuickRecur} editData={quickRecurModal.editData} theme={theme} wallets={wallets} addLabel/>
      <Toast toasts={toasts} remove={rmToast} cancelUndo={cancelUndo}/>
      {assetCreatedAlert&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg">
          <div className={`relative w-full max-w-sm rounded-2xl shadow-2xl scale-in overflow-hidden ${dk?'bg-[#080f1e] border border-white/10':'bg-white'}`}>
            <button onClick={()=>setAssetCreatedAlert(null)} aria-label="ปิด" className={`absolute top-3 right-3 z-10 p-1.5 rounded-lg ${dk?'hover:bg-white/10 text-slate-500':'hover:bg-slate-100 text-slate-400'}`}><Ic n="x" s={15}/></button>
            <div className="px-6 pt-9 pb-6 text-center">
              <div className="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center bg-emerald-500 shadow-lg shadow-emerald-500/30" style={{animation:'checkPop .4s cubic-bezier(.34,1.4,.5,1) both'}}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12.5l5 5.5L20 6" strokeDasharray="26" style={{animation:'checkDraw .4s .15s ease both'}}/>
                </svg>
              </div>
              <p className={`text-lg font-bold ${dk?'text-white':'text-slate-800'}`}>{assetCreatedAlert.type==='create'?'สร้างสินทรัพย์เสร็จสิ้น':'แก้ไขสินทรัพย์เสร็จสิ้น'}</p>
              <p className={`text-sm mt-1 ${dk?'text-slate-400':'text-slate-500'}`}>{assetCreatedAlert.name}</p>
              <button onClick={()=>setAssetCreatedAlert(null)} className={`mt-5 text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors ${dk?'text-slate-400 hover:text-white hover:bg-white/5':'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>ปิด</button>
            </div>
            <div className="h-1 bg-emerald-500/15">
              <div className="h-full w-full bg-emerald-500" style={{animation:'undoShrink 1.8s linear forwards'}}/>
            </div>
          </div>
        </div>
      )}
      {confirmEl}
    </div>
  );
};

// ── Error boundary — a single render error must not blank the whole app.
// Data lives in localStorage + Firestore, so a reload recovers safely.
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state={err:null}; }
  static getDerivedStateFromError(err){ return {err}; }
  componentDidCatch(err,info){ console.error('FinTracker render error:', err, info); }
  render(){
    if(this.state.err){
      return (
        <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px',background:'#05080f',color:'#e2e8f0',fontFamily:'system-ui,sans-serif'}}>
          <div style={{maxWidth:'420px',textAlign:'center'}}>
            <div style={{fontSize:'42px',marginBottom:'12px'}}>⚠️</div>
            <div style={{fontSize:'18px',fontWeight:700,marginBottom:'8px',color:'#d4a017'}}>เกิดข้อผิดพลาดในการแสดงผล</div>
            <div style={{fontSize:'13px',color:'#94a3b8',marginBottom:'4px'}}>ข้อมูลของคุณปลอดภัย (เก็บไว้ในเครื่อง + คลาวด์)</div>
            <div style={{fontSize:'13px',color:'#94a3b8',marginBottom:'20px'}}>กดโหลดใหม่เพื่อกลับเข้าใช้งานได้เลยค่ะ</div>
            <button onClick={()=>location.reload()} style={{background:'#d4a017',color:'#05080f',border:'none',borderRadius:'12px',padding:'10px 24px',fontSize:'14px',fontWeight:700,cursor:'pointer'}}>โหลดใหม่</button>
            <pre style={{marginTop:'18px',fontSize:'11px',color:'#475569',whiteSpace:'pre-wrap',textAlign:'left',maxHeight:'120px',overflow:'auto'}}>{String(this.state.err&&this.state.err.message||this.state.err)}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);
