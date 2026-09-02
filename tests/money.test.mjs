// ── Money formula tests ──────────────────────────────────────────────────────
// Every case here is a bug that actually reached production, kept so it cannot
// come back. lib.js is deliberately free of React and the DOM, which is what
// makes the parts that calculate money testable without a browser.
//
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

// must exist before lib.js is imported — several helpers read it at call time
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

const {
  walletCash, assetVal, assetTaggedNet, dataHealth, walletDelta, runningBalances, mergeArrById, systemCashByDay, txSign, txAmtCls, revertMove,
  isUntouchedBudgets, chooseBudgets, mergeKeyedMap, itemTotals, itemsToAsset, splitBudget, monthlyRate, projectFV, requiredPMT, makeSalt, hashPin, realizedByYear,
  encryptBackup, decryptBackup, isEncryptedBackup, assetCashFlow, whoAmI,
  impliedTicker, catOptions, renameCatInStores, priceAge, annualisedReturn, assetTotalReturn,
} = await import('../fintracker/src/lib.js');

// ── walletDelta ──────────────────────────────────────────────────────────────
// A transfer stores +amt on the sending leg and -amt on the receiving one, and
// each row is filed under the wallet it affects. Both move that wallet opposite
// to the sign they store — the trap the running balance was built on.
test('transfer rows move a wallet opposite to their stored sign', () => {
  const sending   = { type:'transfer', walletId:1, amount: 5000 };
  const receiving = { type:'transfer', walletId:2, amount:-5000 };
  assert.equal(walletDelta(sending, 1),   -5000, 'ขาส่งต้องหักออกจากกระเป๋าต้นทาง');
  assert.equal(walletDelta(receiving, 2), +5000, 'ขารับต้องบวกเข้ากระเป๋าปลายทาง');
  assert.equal(walletDelta(sending, 2), 0, 'รายการของกระเป๋าอื่นต้องไม่นับ');
});

test('income adds, expense subtracts, adjustment keeps its sign', () => {
  assert.equal(walletDelta({ type:'income',     walletId:1, amount: 100 }, 1),  100);
  assert.equal(walletDelta({ type:'expense',    walletId:1, amount: 100 }, 1), -100);
  assert.equal(walletDelta({ type:'adjustment', walletId:1, amount:-100 }, 1), -100);
  assert.equal(walletDelta({ type:'dividend',   walletId:1, amount: 100 }, 1),  100);
});

// ── walletCash ───────────────────────────────────────────────────────────────
test('money tagged to a wallet cash asset is not counted twice', () => {
  const w = { id:1, initialBalance:0 };
  const cashAsset = { id:10, type:'cash', walletId:1, qty:1, avgCost:0, currentPrice:0, currency:'THB' };
  const txs = [{ id:1, type:'income', walletId:1, amount:29600, targetAssetId:10, date:'2026-06-01' }];
  assert.equal(walletCash(w, txs, [cashAsset]), 0, 'นับที่สินทรัพย์แล้ว ห้ามนับซ้ำในเงินสดกระเป๋า');
  assert.equal(assetVal(cashAsset, txs, 1), 29600);
});

// ── runningBalances ──────────────────────────────────────────────────────────
test('running balance reconciles, and is computed over the whole history', () => {
  const w = { id:1, initialBalance:1000 };
  const txs = [
    { id:3, type:'expense', walletId:1, amount:200, date:'2026-08-03' },
    { id:2, type:'income',  walletId:1, amount:500, date:'2026-08-02' },
    { id:1, type:'expense', walletId:1, amount:100, date:'2026-08-01' },
  ];
  const bal = runningBalances(w, txs, []);
  assert.equal(bal[3], 1200, 'แถวบนสุดต้องเท่ากับยอดคงเหลือจริง');
  assert.equal(bal[2], 1400);
  assert.equal(bal[1], 900);
  assert.equal(walletCash(w, txs, []), 1200, 'ต้องบรรจบกับสูตรยอดกระเป๋า');
  // The figures must not depend on the order they arrive in, or on which of
  // them the screen happens to be showing — filtering to one day has to leave
  // that day's balance exactly where it was.
  const shuffled = [txs[1], txs[2], txs[0]];
  assert.deepEqual(runningBalances(w, shuffled, []), bal, 'ลำดับที่ส่งเข้ามาต้องไม่มีผลต่อผลลัพธ์');
});

// Wallet 2 is credited through the *sending* row's toWalletId, so if its own
// row is deleted the balance still ends in the right place while no row on
// screen accounts for the money. Walking the rows cannot reproduce the total,
// and a column that cannot be reproduced must not be drawn.
test('a running balance the rows cannot account for is refused', () => {
  const w2 = { id:2, initialBalance:0 };
  const orphaned = [
    { id:1, type:'transfer', walletId:1, toWalletId:2, fromWalletId:1, transferDir:'from', amount:29600, date:'2026-08-02', linkedId:'L1' },
  ];
  assert.equal(walletCash(w2, orphaned, []), 29600, 'เงินเข้ากระเป๋า 2 จริง');
  assert.equal(runningBalances(w2, orphaned, []), null, 'แต่ไม่มีแถวไหนอธิบายได้ ต้องไม่แสดงคอลัมน์');
});

// ── txSign ───────────────────────────────────────────────────────────────────
// The row prints fmt(Math.abs(amount)), so txSign is the only sign it can show.
// A -฿150,000 balance correction and the outgoing leg of a transfer both used
// to render with no sign at all, reading as money coming in.
test('every row that removes money shows a minus', () => {
  const minus = [
    [{ type:'adjustment', amount:-150000 },                     'ปรับยอดติดลบ'],
    [{ type:'transfer',   amount: 29600, transferDir:'from' },  'ขาส่งของการโยกเงิน'],
    [{ type:'expense',    amount: 170 },                        'รายจ่าย'],
  ];
  for (const [t, why] of minus) assert.equal(txSign(t), '-', why);

  const plus = [
    [{ type:'adjustment', amount: 10 },                         'ปรับยอดเป็นบวก'],
    [{ type:'transfer',   amount:-29600, transferDir:'to' },    'ขารับของการโยกเงิน'],
    [{ type:'income',     amount: 5000 },                       'รายรับ'],
    [{ type:'dividend',   amount: 300 },                        'ปันผล'],
  ];
  for (const [t, why] of plus) assert.equal(txSign(t), '+', why);
});

// ── systemCashByDay ──────────────────────────────────────────────────────────
// Total cash across every wallet, closed off per day. The property worth the
// whole feature: moving money between your own wallets cannot change how much
// you have, so the total must sit still on a day that only contained transfers.
test('a transfer between two wallets leaves the system total untouched', () => {
  const wallets = [{ id:1, initialBalance:100000 }, { id:2, initialBalance:0 }];
  const txs = [
    { id:3, type:'transfer', walletId:2, toWalletId:2, fromWalletId:1, transferDir:'to',   amount:-29600, date:'2026-08-02', linkedId:'L1' },
    { id:2, type:'transfer', walletId:1, toWalletId:2, fromWalletId:1, transferDir:'from', amount: 29600, date:'2026-08-02', linkedId:'L1' },
    { id:1, type:'expense',  walletId:1, amount:1000, date:'2026-08-01' },
  ];
  const { day } = systemCashByDay(wallets, txs, []);
  assert.equal(day['2026-08-02'].total, 99000, 'วันที่มีแต่โยกเงิน ยอดรวมต้องไม่ขยับ');
  assert.equal(day['2026-08-01'].total, 99000, 'ยอดหลังจ่าย 1,000 จากต้นทุน 100,000');
  assert.equal(day['2026-08-02'].warn, false);
  // and it must agree with the figure every other view is built from
  const byWallet = wallets.reduce((s, w) => s + walletCash(w, txs, []), 0);
  assert.equal(day['2026-08-02'].total, byWallet, 'ต้องตรงกับผลรวมยอดกระเป๋า');
});

test('a transfer that lost its destination is flagged, not absorbed', () => {
  const wallets = [{ id:1, initialBalance:100000 }, { id:2, initialBalance:0 }];
  const txs = [
    // toWalletId gone: the money leaves wallet 1 and arrives nowhere
    { id:2, type:'transfer', walletId:1, fromWalletId:1, transferDir:'from', amount:29600, date:'2026-08-02', linkedId:'L1' },
    { id:1, type:'income',   walletId:1, amount:5000, date:'2026-08-01' },
  ];
  const { day } = systemCashByDay(wallets, txs, []);
  assert.equal(day['2026-08-02'].warn, true, 'เงินหายจากระบบ ต้องเตือน');
  assert.equal(day['2026-08-02'].gap, -29600, 'ต้องบอกด้วยว่าหายไปเท่าไหร่');
  assert.equal(day['2026-08-01'].warn, false, 'วันที่ปกติต้องไม่เตือน');
});

// Money parked in a wallet's cash asset is still cash — walletCash deliberately
// stops counting it so it is not counted twice, so the system total has to pick
// it up from the asset or it looks like the money evaporated.
test('cash sitting in a wallet cash asset stays inside the total', () => {
  const wallets = [{ id:1, initialBalance:0 }];
  const cashAsset = { id:10, type:'cash', walletId:1, qty:1, avgCost:0, currentPrice:0, currency:'THB' };
  const txs = [{ id:1, type:'income', walletId:1, amount:29600, targetAssetId:10, date:'2026-08-02' }];
  const { day } = systemCashByDay(wallets, txs, [cashAsset]);
  assert.equal(walletCash(wallets[0], txs, [cashAsset]), 0, 'เงินสดหลวมต้องเป็น 0 — เงินอยู่ที่สินทรัพย์');
  assert.equal(day['2026-08-02'].total, 29600, 'แต่ยอดรวมต้องเห็นเงินก้อนนี้ ไม่ใช่ 0 และไม่ใช่นับซ้ำเป็น 59,200');
});

// Opening the page on a single day filters the list down to that day. The
// balances shown must be the ones that day really ended on, not a total
// restarted from whatever happens to be on screen.
// The system total has to mean the same thing the dashboard means by เงินสด,
// or the two disagree and neither can be trusted. A cash asset with no wallet
// attached is the case that broke it.
test('the system total matches the dashboard definition of cash', () => {
  const wallets = [{ id:1, initialBalance:50000 }];
  const assets = [
    { id:10, type:'cash',  walletId:1,    qty:1, avgCost:0, currentPrice:0,     currency:'THB' },
    { id:11, type:'cash',  walletId:null, qty:80000, avgCost:1, currentPrice:1,  currency:'THB' },
    { id:12, type:'stock', walletId:null, qty:10, avgCost:100, currentPrice:200, currency:'THB' },
  ];
  const txs = [{ id:1, type:'income', walletId:1, amount:29600, targetAssetId:10, date:'2026-08-02' }];
  const { day } = systemCashByDay(wallets, txs, assets);

  const dashboardCash = assets.filter(a => a.type === 'cash').reduce((s, a) => s + assetVal(a, txs, 1), 0)
                      + wallets.reduce((s, w) => s + walletCash(w, txs, assets), 0);
  assert.equal(day['2026-08-02'].total, dashboardCash, 'ต้องตรงกับนิยามเงินสดของหน้า Dashboard');
  assert.equal(day['2026-08-02'].total, 50000 + 29600 + 80000, 'กระเป๋า + เงินสดในสินทรัพย์ทั้งที่ผูกและไม่ผูกกระเป๋า');
});

test('narrowing to one day does not change that day figure', () => {
  const wallets = [{ id:1, initialBalance:1000 }];
  const txs = [
    { id:3, type:'expense', walletId:1, amount:200, date:'2026-08-03' },
    { id:2, type:'income',  walletId:1, amount:500, date:'2026-08-02' },
    { id:1, type:'expense', walletId:1, amount:100, date:'2026-08-01' },
  ];
  const full = systemCashByDay(wallets, txs, []);
  assert.equal(full.day['2026-08-02'].total, 1400);
  assert.equal(full.row[2], 1400, 'ยอดรายแถวต้องมีให้ทุกแถว');
  // the day the page would open on, on its own
  const oneDay = systemCashByDay(wallets, txs.filter(t=>t.date==='2026-08-02'), []);
  assert.notEqual(oneDay.day['2026-08-02'].total, full.day['2026-08-02'].total,
    'ถ้าคำนวณจากรายการที่กรองแล้วจะได้เลขผิด — จึงต้องส่งรายการทั้งหมดเข้ามาเสมอ');
});

// ── dividend into a cash asset ───────────────────────────────────────────────
// A broker pays a dividend into its own cash balance, not into your pocket, so
// one row has to carry two separate facts: which holding paid (targetAssetId,
// what the dividend card groups by) and where the money landed (toAssetId).
// The trap is counting it in both places — the cash asset *and* the wallet.
test('a dividend paid into a cash asset lands once, credited to the payer', () => {
  const w    = { id:1, initialBalance:0 };
  const cash = { id:100, type:'cash',  walletId:1, qty:4998.16, avgCost:33.01, currentPrice:33.12, currency:'THB' };
  const asml = { id:200, type:'stock', walletId:1, qty:2, avgCost:20000, currentPrice:25000, currency:'THB' };
  const assets = [cash, asml];
  const div = { id:1, type:'dividend', walletId:1, targetAssetId:200, toAssetId:100, amount:61, date:'2026-08-06' };

  const total = txs => walletCash(w, txs, assets) + assetVal(cash, txs, 1) + assetVal(asml, txs, 1);
  assert.equal(Math.round((total([div]) - total([])) * 100) / 100, 61, 'ต้องเพิ่มขึ้น 61 พอดี ไม่นับซ้ำ');

  assert.equal(assetVal(cash, [div], 1) - assetVal(cash, [], 1), 61, 'เงินต้องเข้าสินทรัพย์เงินสด');
  assert.equal(assetVal(asml, [div], 1), assetVal(asml, [], 1), 'มูลค่าหุ้นที่จ่ายต้องไม่ขยับ');
  assert.equal(walletCash(w, [div], assets), 0, 'ต้องไม่โผล่เป็นเงินสดหลวมในกระเป๋าด้วย');
  assert.equal(div.targetAssetId, asml.id, 'เครดิตต้องอยู่กับหุ้นที่จ่าย ไม่ใช่บัญชีเงินสด');
});

// Without toAssetId it is the old behaviour: straight into the wallet's cash.
test('a dividend with no destination still goes to wallet cash', () => {
  const w = { id:1, initialBalance:0 };
  const div = { id:1, type:'dividend', walletId:1, targetAssetId:200, amount:61, date:'2026-08-06' };
  assert.equal(walletCash(w, [div], []), 61);
});

// ── selling units into a wallet ──────────────────────────────────────────────
// Selling crypto and receiving baht is one event recorded in two places: the
// quantity comes off the holding, and a transaction puts the cash in a wallet.
// The trap is the cash record also being tagged to the asset — the value would
// then come off twice, once through the quantity and once through the tag.
test('selling units into a wallet moves the money once', () => {
  const w = { id:1, initialBalance:0 };
  const before = { id:200, type:'crypto', walletId:null, qty:19746.6081, avgCost:34.19, currentPrice:32.85, currency:'THB' };
  const after  = { ...before, qty:16702.4681 };            // 3,044.14 units taken out
  const sale   = { id:1, type:'transfer', transferDir:'to', walletId:1, targetAssetId:200,
                   amount:-100000, title:'M แลก 100K', date:'2026-08-12' };

  assert.equal(walletCash(w, [sale], [after]), 100000, 'เงินต้องเข้ากระเป๋าเต็มจำนวน');
  assert.equal(assetVal(after, [sale], 1), assetVal(after, [], 1),
    'รายการนี้ต้องไม่หักมูลค่าสินทรัพย์ซ้ำ — จำนวนที่ลดไปคิดให้แล้ว');

  // net worth before the sale vs after: the holding shrinks by what the cash gains
  const nwBefore = assetVal(before, [], 1) + walletCash(w, [], []);
  const nwAfter  = assetVal(after, [sale], 1) + walletCash(w, [sale], [after]);
  assert.ok(Math.abs(nwAfter - nwBefore) < 1, `Net Worth ต้องนิ่ง (ต่าง ${(nwAfter-nwBefore).toFixed(2)})`);
});

// ── sale proceeds landing in a wallet's cash asset ───────────────────────────
// A wallet that keeps its money in a linked cash asset should end up with one
// figure, not two: the wallet total and the asset agreeing. Proceeds that land
// as loose cash instead split it in half — both halves right, the pair useless.
// The money must still arrive exactly once whichever way it goes.
test('sale proceeds land in the wallet cash asset, and only once', () => {
  const w    = { id:9, initialBalance:0 };
  const cash = { id:90, type:'cash', walletId:9, qty:1, avgCost:0, currentPrice:0, currency:'THB' };
  const held = [{ id:1, type:'income', walletId:9, targetAssetId:90, amount:80000, date:'2026-07-01' }];
  const sale = { id:2, type:'adjustment', walletId:9, targetAssetId:90, amount:100000, date:'2026-08-12' };

  const loose = txs => walletCash(w, txs, [cash]);
  const inAsset = txs => assetVal(cash, txs, 1);

  assert.equal(inAsset(held) + loose(held), 80000, 'ก่อนขาย');
  assert.equal(inAsset([...held, sale]), 180000, 'เงินต้องเข้าไปอยู่ในสินทรัพย์');
  assert.equal(loose([...held, sale]), 0, 'ต้องไม่เหลือค้างเป็นเงินสดหลวม');
  assert.equal(inAsset([...held, sale]) + loose([...held, sale]), 180000, 'รวมต้องเพิ่มครั้งเดียว');
});

test('a wallet with no cash asset still takes the proceeds as loose cash', () => {
  const w = { id:7, initialBalance:0 };
  const sale = { id:1, type:'adjustment', walletId:7, amount:100000, date:'2026-08-12' };
  assert.equal(walletCash(w, [sale], []), 100000);
});

// ── mergeArrById ─────────────────────────────────────────────────────────────
// Every sync decides which records survive by running this three times over.
// base = what this device last saw agreed with the cloud, local = what it holds
// now, remote = what the cloud holds now. It is the only thing standing between
// two devices editing at once and one of them losing work, and until now it had
// no test at all.
const rec = (id, v) => ({ id, v });

test('a record nobody touched survives untouched', () => {
  const base = [rec(1,'a'), rec(2,'b')];
  assert.deepEqual(mergeArrById(base, base, base), base);
});

test('each side keeps what it added', () => {
  const base   = [rec(1,'a')];
  const local  = [rec(1,'a'), rec(2,'mine')];
  const remote = [rec(1,'a'), rec(3,'theirs')];
  const out = mergeArrById(base, local, remote);
  assert.deepEqual(out.map(r=>r.id).sort(), [1,2,3], 'ทั้งของเราและของเครื่องอื่นต้องอยู่ครบ');
});

test('an edit here wins; an edit only there is picked up', () => {
  const base   = [rec(1,'old'), rec(2,'old')];
  const local  = [rec(1,'mine'), rec(2,'old')];      // edited 1, left 2 alone
  const remote = [rec(1,'theirs'), rec(2,'theirs')]; // other device edited both
  const out = mergeArrById(base, local, remote);
  assert.equal(out.find(r=>r.id===1).v, 'mine',   'แก้ที่เครื่องนี้ต้องชนะ');
  assert.equal(out.find(r=>r.id===2).v, 'theirs', 'ที่ไม่ได้แตะ ต้องรับของเครื่องอื่นมา');
});

test('a deletion on either side propagates', () => {
  const base = [rec(1,'a'), rec(2,'b')];
  assert.deepEqual(mergeArrById(base, [rec(1,'a')], base).map(r=>r.id), [1], 'ลบที่เครื่องนี้');
  assert.deepEqual(mergeArrById(base, base, [rec(1,'a')]).map(r=>r.id), [1], 'ลบที่เครื่องอื่น');
});

// The case that matters most after today. A browser that cleared its storage
// comes back with nothing, and its baseline resets with it — so every cloud
// record reads as "added elsewhere" and is pulled down, rather than as
// "deleted here" and wiped. The budgets path had no equivalent of this, which
// is exactly how it lost everything.
test('a device that lost everything pulls the cloud back, it does not erase it', () => {
  const cloud = [rec(1,'a'), rec(2,'b'), rec(3,'c')];
  const out = mergeArrById([], [], cloud);
  assert.deepEqual(out.map(r=>r.id), [1,2,3], 'ต้องดึงกลับมาครบ ไม่ใช่ลบทิ้ง');
});

test('a first sync from a fresh device keeps both sides', () => {
  const out = mergeArrById([], [rec(1,'mine')], [rec(2,'theirs')]);
  assert.deepEqual(out.map(r=>r.id).sort(), [1,2]);
});

test('records without an id are dropped rather than corrupting the merge', () => {
  const out = mergeArrById([], [{v:'no id'}, rec(1,'ok')], []);
  assert.deepEqual(out.map(r=>r.id), [1]);
});

test('missing or malformed sides are treated as empty', () => {
  assert.deepEqual(mergeArrById(null, [rec(1,'a')], undefined), [rec(1,'a')]);
  assert.deepEqual(mergeArrById(undefined, null, [rec(2,'b')]), [rec(2,'b')]);
});

// ── budget sync guards ───────────────────────────────────────────────────────
// This is the incident these exist for: a device lost its local storage, came
// back holding factory defaults, and uploaded them — replacing seventeen
// categories, their budgets and the irregular flags on every device at once.
const DEF = { 'อาหาร':7000, 'การเดินทาง':2000, 'Home & Utilities':8000 };
// A customised set: renamed categories, one added, amounts that are nobody's
// defaults. What it must never be is the author's own budget — this file is
// public, and a fixture is not worth disclosing what somebody pays in rent.
const REAL = { 'Internat / Phone Bills':2500, 'Home & Utilities':9500, 'ครอบครัว':3000 };

test('a device holding untouched defaults never overwrites the cloud', () => {
  assert.equal(chooseBudgets(DEF,  REAL, DEF), 'remote', 'ค่าเริ่มต้นห้ามทับของจริง');
  assert.equal(chooseBudgets({},   REAL, DEF), 'remote', 'ค่าว่างก็ห้ามทับ');
  assert.equal(chooseBudgets(null, REAL, DEF), 'remote', 'อ่านไม่ได้ก็ห้ามทับ');
});

test('a real edit is still authoritative, including deletions', () => {
  // one amount changed from the default — that is a decision, and it wins
  assert.equal(chooseBudgets({...DEF, 'อาหาร':9000}, REAL, DEF), 'local');
  // deliberately deleting down to two categories must still push
  assert.equal(chooseBudgets({'อาหาร':7000,'ครอบครัว':3000}, REAL, DEF), 'local');
  // nothing worth keeping on the other side
  assert.equal(chooseBudgets(DEF, {},   DEF), 'local');
  assert.equal(chooseBudgets(DEF, null, DEF), 'local');
});

test('untouched means every default present and unchanged', () => {
  assert.equal(isUntouchedBudgets(DEF, DEF), true);
  assert.equal(isUntouchedBudgets({...DEF, 'อาหาร':7001}, DEF), false, 'ต่างแค่บาทเดียวก็นับว่าแก้แล้ว');
  assert.equal(isUntouchedBudgets({...DEF, 'ใหม่':100}, DEF), false, 'เพิ่มหมวดก็นับว่าแก้แล้ว');
});

// Per-month snapshots lived only in one browser — no cloud copy, none in the
// backup file — so losing that storage lost every past month permanently.
test('budget history merges by month so no device loses one', () => {
  const local  = { '2026-08': {'อาหาร':15000} };
  const remote = { '2026-06': {'อาหาร':12000}, '2026-07': {'อาหาร':14000} };
  const m = mergeKeyedMap(local, remote);
  assert.deepEqual(Object.keys(m).sort(), ['2026-06','2026-07','2026-08'], 'ต้องเก็บครบทุกเดือนจากทั้งสองฝั่ง');
  assert.equal(m['2026-06']['อาหาร'], 12000, 'เดือนที่มีแต่บนคลาวด์ต้องไม่หาย');
  assert.equal(m['2026-08']['อาหาร'], 15000, 'เดือนที่เครื่องนี้บันทึกต้องอยู่');
});

test('the same month on both sides keeps this device view', () => {
  const m = mergeKeyedMap({ '2026-08': {'อาหาร':15000} }, { '2026-08': {'อาหาร':7000} });
  assert.equal(m['2026-08']['อาหาร'], 15000);
});

// ── revertMove ───────────────────────────────────────────────────────────────
// Deleting a เติม/เอาออก entry used to remove the log line and leave the numbers
// it produced in place: the row vanished and the quantity did not move.
test('deleting the latest เอาออก puts the units back', () => {
  // the real case: 19,746.6081 units, 3,044.14 taken out at 32.85
  const move = { id:1, qty:-3044.14, rate:32.85, newQty:16702.4681, newAvg:34.190043 };
  const back = revertMove(move, 16702.4681, 34.190043);
  assert.equal(back.qty, 19746.6081, 'จำนวนต้องกลับไปเท่าก่อนขาย');
  assert.equal(back.avgCost, 34.190043, 'เอาออกไม่แตะทุนเฉลี่ย จึงต้องคงเดิม');
});

test('deleting the latest เติมเข้า unblends the average it created', () => {
  // 100 units at 30, then 50 added at 36 → 150 at 32
  const move = { id:1, qty:50, rate:36, newQty:150, newAvg:32 };
  const back = revertMove(move, 150, 32);
  assert.equal(back.qty, 100);
  assert.equal(back.avgCost, 30, 'ต้องถอดเรทที่เพิ่งถัวเข้าไปออก');
});

// The stored entry only describes its own before/after. Anything with later
// entries stacked on it cannot be unwound from that, so it must refuse rather
// than compute a plausible-looking wrong number.
test('an entry that is no longer the latest refuses to revert', () => {
  const older = { id:1, qty:-100, rate:30, newQty:900, newAvg:25 };
  assert.equal(revertMove(older, 1200, 25), null, 'จำนวนไม่ตรงกับที่บันทึกไว้');
  assert.equal(revertMove(older, 900, 27), null, 'ทุนเฉลี่ยไม่ตรงกับที่บันทึกไว้');
  assert.equal(revertMove(null, 900, 25), null);
});

// ── impliedTicker ────────────────────────────────────────────────────────────
// Guessing wide is worse than not guessing: CASH, USD, GOLD and DIME are all
// real US tickers, so a loose rule prices someone's baht as a bank stock.
test('ticker is inferred from the name only where it cannot mislead', () => {
  const cases = [
    [{ name:'AAPL', type:'stock', currency:'USD' },                'AAPL', 'ชื่อเป็น ticker'],
    [{ name:'MSFT', type:'stock', currency:'USD', ticker:'MSFT' }, 'MSFT', 'มี ticker อยู่แล้ว'],
    [{ name:'Nividia', type:'stock', currency:'USD', ticker:'NVDA' }, 'NVDA', 'ชื่อสะกดผิดไม่มีผลเมื่อมี ticker'],
    [{ name:'PTT',  type:'stock', currency:'THB' },                '',     'หุ้นไทย — PTT บน Yahoo คือกองทุนอเมริกัน'],
    [{ name:'GOLD', type:'gold',  currency:'USD' },                '',     'ทอง — GOLD คือหุ้น Barrick'],
    [{ name:'CASH', type:'cash',  currency:'USD' },                '',     'เงินสด — CASH คือหุ้น Pathward'],
    [{ name:'Rocket Lab USA', type:'stock', currency:'USD' },      '',     'ชื่อเต็มเดาไม่ได้'],
  ];
  for (const [asset, expected, why] of cases)
    assert.equal(impliedTicker(asset), expected, why);
});

// ── catOptions ───────────────────────────────────────────────────────────────
// A <select> cannot render a value it has no <option> for; the browser shows a
// different one and saving writes that instead.
test('a category no longer in the list stays selectable', () => {
  const list = ['อาหาร', 'Subscription', 'Internat / Phone Bills'];
  const opts = catOptions(list, 'อินเตอร์เน็ต/โทรศัพท์');
  assert.equal(opts[0].value, 'อินเตอร์เน็ต/โทรศัพท์', 'ค่าที่เก็บไว้ต้องอยู่ในตัวเลือกเสมอ');
  assert.match(opts[0].label, /หมวดเดิม/, 'ต้องมีป้ายบอกว่าเป็นของตกค้าง');
  assert.equal(catOptions(list, 'อาหาร').length, list.length, 'หมวดที่ยังมีอยู่ต้องไม่ถูกเพิ่มซ้ำ');
});

// ── renameCatInStores ────────────────────────────────────────────────────────
// The name is the identity, so a rename has to reach every store holding one.
// Recurring templates and the ไม่ประจำ flag were both missed at different times.
test('renaming a category reaches every store that keys on it', () => {
  Object.keys(store).forEach(k => delete store[k]);
  store['ft-cat-meta']           = JSON.stringify({ 'ค่าเน็ต': { icon:'📱' }, 'อาหาร': { icon:'🍜' } });
  store['ft-cat-irregular']      = JSON.stringify({ 'ค่าเน็ต': true });
  store['ft-budget-history']     = JSON.stringify({ '2026-07': { 'ค่าเน็ต':500, 'อาหาร':7000 } });
  store['ft-recurring']          = JSON.stringify([{ title:'True', category:'ค่าเน็ต' }, { title:'ข้าว', category:'อาหาร' }]);
  store['ft-import-cat-memory']  = JSON.stringify({ 'true online':'ค่าเน็ต', '7-11':'อาหาร' });

  renameCatInStores('ค่าเน็ต', 'Internet');
  const g = k => JSON.parse(store[k]);

  assert.ok(g('ft-cat-meta')['Internet'],                          'ไอคอน/สี');
  assert.equal(g('ft-cat-irregular')['Internet'], true,            'ธง ไม่ประจำ');
  assert.equal(g('ft-budget-history')['2026-07']['Internet'], 500, 'ประวัติงบรายเดือน');
  assert.equal(g('ft-recurring')[0].category, 'Internet',          'รายการประจำ');
  assert.equal(g('ft-import-cat-memory')['true online'], 'Internet','ความจำนำเข้าสเตทเมนต์');

  assert.equal(g('ft-recurring')[1].category, 'อาหาร',             'หมวดอื่นต้องไม่ถูกแตะ');
  assert.equal('ค่าเน็ต' in g('ft-cat-irregular'), false,          'ชื่อเก่าต้องหายไป');
});

// ── priceAge ─────────────────────────────────────────────────────────────────
// A same-calendar-day test misfires just after midnight: a price from twenty
// minutes earlier falls on the previous date and reads as a day stale.
test('a price from minutes ago never reads as yesterday-dated', () => {
  const justAfterMidnight = new Date(); justAfterMidnight.setHours(0, 6, 0, 0);
  const twentyMinsBefore  = justAfterMidnight.getTime() - 20 * 60_000;
  const original = Date.now;
  Date.now = () => justAfterMidnight.getTime();
  try {
    const label = priceAge(twentyMinsBefore);
    assert.match(label, /เมื่อวาน \d{2}:\d{2}/, 'ต้องบอกเวลาไว้ด้วย ไม่ใช่แสดงเป็นวันที่เปล่าๆ');
  } finally { Date.now = original; }
});

test('no timestamp means no label rather than a wrong one', () => {
  assert.equal(priceAge(null), null);
  assert.equal(priceAge(0), null);
});

// ── sign display ─────────────────────────────────────────────────────────────
// fmt() strips the sign on purpose: most amounts pair with a separate +/-
// prefix. The trap is the prefix that emits '+' when positive and nothing when
// negative — the minus then belongs to neither half and disappears. A month
// with no income showed its net as ฿95,908.52 under a column headed คงเหลือ,
// reading as money left over when it was money gone. Colour was the only clue.
// A source check, because these are JSX render paths, not functions.
test('a value that can go negative is never printed by sign-stripping fmt', async () => {
  const src = await (await import('node:fs/promises')).readFile(
    new URL('../fintracker/src/app.jsx', import.meta.url), 'utf8');
  const bad = [...src.matchAll(/>=?\s*0\s*\?\s*'\+'\s*:\s*''\s*\}\s*\{\s*fmt(NW)?\(/g)];
  assert.equal(bad.length, 0,
    `พบ ${bad.length} จุดที่ใช้ fmt() กับค่าที่ติดลบได้ — ต้องใช้ fmtSigned() ไม่งั้นเครื่องหมายลบจะหายไป`);
});

// ── collections ──────────────────────────────────────────────────────────────
// พระเครื่อง and การ์ด are one asset line standing for many pieces of unequal
// worth. The pieces are stored, but every formula in the app values an asset as
// qty × currentPrice — so the only thing that must hold is that those two
// derived numbers still multiply back to the sum of the pieces. If that ever
// drifts, Net Worth quietly stops matching what the collection is worth.
test('a collection is worth the sum of its pieces', () => {
  const items = [
    { id: 1, name: 'สมเด็จวัดระฆัง', value: 600000 },
    { id: 2, name: 'หลวงปู่ทวด',      value: 350000 },
    { id: 3, name: 'พระรอด',          value: 250000 },
  ];
  const d = itemsToAsset(items);
  assert.equal(d.qty, 3, 'จำนวนต้องเท่ากับจำนวนชิ้น');
  assert.equal(d.qty * d.currentPrice, 1200000);
});

test('an awkward total still lands within a satang', () => {
  // 1,000,000 / 3 does not divide, and the stored price is rounded — the
  // question is only whether the rounding can be seen in the money.
  const items = [1, 2, 3].map(id => ({ id, name: `ชิ้น ${id}`, value: 1000000 / 3 }));
  const d = itemsToAsset(items);
  assert.ok(Math.abs(d.qty * d.currentPrice - 1000000) < 0.01,
    `ยอดเพี้ยนไป ${Math.abs(d.qty * d.currentPrice - 1000000)} บาท`);
});

test('a piece with no cost recorded reports no gain rather than a fake one', () => {
  const items = [
    { id: 1, name: 'ไม่รู้ทุน', value: 500000 },              // cost omitted
    { id: 2, name: 'รู้ทุน',    value: 300000, cost: 200000 },
    { id: 3, name: 'ทุนว่าง',   value: 100000, cost: '' },     // cleared in the form
  ];
  const { count, value, cost } = itemTotals(items);
  assert.equal(count, 3);
  assert.equal(value, 900000);
  assert.equal(cost, 800000, 'ชิ้นที่ไม่ใส่ทุน ต้องนับทุน = มูลค่า ไม่ใช่ 0');
});

test('an asset with no pieces is left to its own price', () => {
  assert.equal(itemsToAsset([]), null);
  assert.equal(itemsToAsset(undefined), null);
});

test('a collection reaches Net Worth at the value of its pieces', () => {
  const items = [
    { id: 1, name: 'Charizard 1st Ed', value: 180000 },
    { id: 2, name: 'Pikachu Illustr.', value: 120000 },
  ];
  const asset = { id: 9, name: 'การ์ด', type: 'other', currency: 'THB', items, ...itemsToAsset(items) };
  assert.equal(assetVal(asset, [], 1), 300000);
});

// What a collection cost is not something the pieces can answer — they are
// listed at what they are worth now. Derived from them it only ever reported a
// gain of zero, and it was overwritten again on every edit, so the figure the
// owner typed could not survive adding a tenth amulet.
test('the cost of a collection is left for its owner to state', () => {
  const items = [{ id: 1, name: 'พระรอด', value: 250000 }];
  assert.equal('avgCost' in itemsToAsset(items), false, 'itemsToAsset ต้องไม่แตะต้นทุน');

  const asset = { qty: 1, avgCost: 90000, currentPrice: 250000, items };
  const grown = { ...asset, items: [...items, { id: 2, name: 'สมเด็จ', value: 350000 }] };
  const after = { ...grown, ...itemsToAsset(grown.items) };
  assert.equal(after.avgCost, 90000, 'ต้นทุนที่ผู้ใช้กรอกต้องอยู่ครบหลังเพิ่มชิ้นใหม่');
  assert.equal(after.qty * after.currentPrice, 600000, 'ส่วนมูลค่ายังเท่ากับผลรวมรายชิ้น');
});

// ── budget split ─────────────────────────────────────────────────────────────
// The Budget card shows one total over two kinds of money, and now names both
// parts beneath it. A caption that does not add back up to the figure above it
// is worse than no caption, so the parts and the total come from one pass.
test('the budget caption always adds back up to the total above it', () => {
  const budgets  = { 'อาหาร':7000, 'ค่าเช่า':12000, 'ซ่อมรถ':20000, 'ลงทุน/ปันผล':5000 };
  const irregular = c => c === 'ซ่อมรถ';
  const s = splitBudget(budgets, irregular, ['ลงทุน/ปันผล']);
  assert.equal(s.regular, 19000);
  assert.equal(s.irregular, 20000);
  assert.equal(s.total, 39000, 'เงินลงทุนไม่ใช่รายจ่าย ต้องไม่ถูกนับเป็นงบ');
  assert.equal(s.regular + s.irregular, s.total, 'สองส่วนต้องบวกได้เท่ายอดรวมเสมอ');
});

test('no irregular category means the whole budget is regular', () => {
  const s = splitBudget({ 'อาหาร':7000 }, () => false);
  assert.equal(s.irregular, 0);
  assert.equal(s.regular, s.total);
  assert.deepEqual(splitBudget(null, () => false), { regular:0, irregular:0, total:0 });
});

// ── sample data ──────────────────────────────────────────────────────────────
// The button that clears the sample used to empty every store outright —
// setTxs([]) and the rest — on the reasoning that anyone looking at the sample
// was new and had nothing worth keeping. That is true exactly once. An existing
// user opened the sample to look at it, and a button reading "ล้างข้อมูลตัวอย่าง"
// was one press from deleting a real ledger and syncing the empty result to the
// cloud. loadSample marks every record it adds with _sample and never touches an
// existing one, so the two sets were always separable. A source check, because
// this lives in a component and the failure is silent and total.
// It was then removed outright rather than repaired: living in the real stores
// meant it synced to the cloud, landed in every backup, and left a flag every
// later feature had to remember. Nothing about it can come back quietly.
test('the sample data feature stays gone', async () => {
  const read = (await import('node:fs/promises')).readFile;
  for (const f of ['../fintracker/src/app.jsx', '../fintracker/src/lib.js']) {
    const src = await read(new URL(f, import.meta.url), 'utf8');
    // the comment explaining the removal is allowed to name it; code is not
    const code = src.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    assert.doesNotMatch(code, /\b(loadSample|clearSample|hasSample)\b/,
      `${f}: ฟีเจอร์ข้อมูลตัวอย่างถูกเอาออกแล้ว — ปุ่มล้างเคยลบข้อมูลจริงทั้งหมดไปด้วย`);
    assert.doesNotMatch(code, /_sample/,
      `${f}: ไม่ควรมีธง _sample เหลืออยู่ ข้อมูลตัวอย่างเคยถูกเก็บปนกับข้อมูลจริง`);
  }
});

// ── compound projection ──────────────────────────────────────────────────────
// The two directions must be each other's inverse: whatever monthly figure the
// planner says reaches ฿10M has to actually reach ฿10M when projected forward.
// Nothing on screen would show it if they drifted — both numbers look plausible.
test('the two directions of the projection agree', () => {
  const target = 10_000_000, r = 10, months = 240;
  const pmt = requiredPMT(target, 0, r, months);
  assert.ok(Math.abs(projectFV(0, pmt, r, months) - target) < 1,
    `ออมเดือนละ ${pmt} แล้วได้ ${projectFV(0, pmt, r, months)} ไม่ใช่ ${target}`);
  // and with a starting sum in the mix
  const pmt2 = requiredPMT(target, 3_000_000, r, months);
  assert.ok(Math.abs(projectFV(3_000_000, pmt2, r, months) - target) < 1);
});

// r/12 is the classic wrong turn: twelve months of 10/12 compounds to 10.47%,
// which over twenty years invents about a tenth of the growth.
test('an annual rate compounds at its twelfth root, not a twelfth of itself', () => {
  assert.ok(Math.abs(Math.pow(1 + monthlyRate(10), 12) - 1.10) < 1e-12,
    'สิบสองเดือนต้องได้ผลตอบแทนต่อปีพอดี');
  assert.ok(monthlyRate(10) < 0.10/12, 'ต้องต่ำกว่า r/12 เสมอ');
  assert.equal(projectFV(1_000_000, 0, 10, 12).toFixed(2), (1_100_000).toFixed(2));
});

test('a zero rate is a straight line, not a division by zero', () => {
  assert.equal(projectFV(100_000, 10_000, 0, 120), 100_000 + 1_200_000);
  assert.equal(requiredPMT(1_300_000, 100_000, 0, 120), 10_000);
});

// "you need ฿0/month" and "your starting sum already overshoots" read the same
// if the figure is clamped, so it is allowed to come back negative.
test('a starting sum that already overshoots reports as negative, not zero', () => {
  const pmt = requiredPMT(10_000_000, 9_500_000, 10, 60);
  assert.ok(pmt < 0, 'พอร์ตโตถึงเป้าเองอยู่แล้ว ต้องได้ค่าติดลบเพื่อบอกว่าไม่ต้องเติม');
  assert.equal(projectFV(9_500_000, 0, 10, 0), 9_500_000, 'ศูนย์เดือนต้องไม่โต');
});

// ── asset currency ───────────────────────────────────────────────────────────
// เติม/เอาออก divides the money typed by the rate, and the rate is quoted in the
// asset's own currency — so the money box means that currency too. It was
// labelled ฿ for every asset, which read ฿50,000 on a USD holding as $50,000:
// 888 shares where 27 were bought, off by exactly the exchange rate, and the
// only visible trace a Net Worth ฿1.6M too high. A source check, because the
// label and the arithmetic sit in different components.
test('the top-up money field is never labelled in a fixed currency', async () => {
  const src = await (await import('node:fs/promises')).readFile(
    new URL('../fintracker/src/app.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /'amt'\s*,\s*'เงิน\s*[฿$]'/,
    'ป้ายโหมดเงินต้องมาจากสกุลของสินทรัพย์ (tuSym) ไม่ใช่สัญลักษณ์ตายตัว');
  assert.doesNotMatch(src, /fmt\(Math\.abs\(tuAmt\)\)/,
    'ยอดเงินของสินทรัพย์ต้องใช้ fmtA/fmtCur — fmt() ใส่ ฿ ให้เสมอแม้สินทรัพย์เป็น USD');
});

// ── screen lock ──────────────────────────────────────────────────────────────
// The PIN in front of the 👁 button hides figures from someone looking at the
// screen. It is not encryption and must never be built as though it were — but
// the PIN itself should not be sitting in localStorage in the clear, because a
// PIN gets reused somewhere it does matter.
test('the PIN is stored as a salted hash, never as itself', async () => {
  const salt = makeSalt();
  const h = await hashPin('1234', salt);
  assert.equal(h.length, 64, 'SHA-256 ต้องได้ 64 ตัวอักษร');
  assert.doesNotMatch(h, /1234/, 'ค่าที่เก็บต้องไม่มีรหัสอยู่ในนั้น');
  assert.equal(await hashPin('1234', salt), h, 'รหัสเดิม salt เดิม ต้องได้ค่าเดิม');
  assert.notEqual(await hashPin('1235', salt), h, 'รหัสต่างต้องได้ค่าต่าง');
});

// Two installs choosing the same PIN must not produce the same stored value,
// or one leaked hash would read across every device that shares the habit.
test('the same PIN on two devices stores two different values', async () => {
  const a = await hashPin('1234', makeSalt());
  const b = await hashPin('1234', makeSalt());
  assert.notEqual(a, b);
  assert.equal(new Set([makeSalt(), makeSalt(), makeSalt()]).size, 3, 'salt ต้องไม่ซ้ำกัน');
});

// ── row colour ───────────────────────────────────────────────────────────────
// Colour is read before the label is. A transfer's incoming leg used to be the
// same green as a salary, so ฿100,000 moved between two of your own accounts
// looked at a glance like ฿100,000 earned — and the totals below, which
// correctly ignore transfers, then seemed not to add up.
test('a transfer is never coloured like income', () => {
  const income   = txAmtCls({ type:'income',   amount: 100000 });
  const transfIn = txAmtCls({ type:'transfer', amount:-100000, transferDir:'to' });
  const transfOut= txAmtCls({ type:'transfer', amount: 100000, transferDir:'from' });
  assert.notEqual(transfIn,  income, 'ขาเข้าของการโยกต้องไม่ใช้สีเดียวกับรายรับ');
  assert.equal(transfIn, transfOut, 'สองขาของการโยกเป็นเหตุการณ์เดียว ต้องสีเดียวกัน');
  assert.match(transfIn, /slate/, 'โยกเงินไม่ทำให้รวยขึ้นหรือจนลง — ต้องเป็นสีกลาง');
});

// green means more money, red means less, and nothing else may claim either
test('green belongs to money coming in, red to money going out', () => {
  assert.match(txAmtCls({ type:'income',  amount: 5000 }), /emerald/);
  assert.match(txAmtCls({ type:'expense', amount: 5000 }), /rose/);
  for (const t of ['transfer','adjustment']) {
    assert.doesNotMatch(txAmtCls({ type:t, amount:5000 }), /emerald|rose/,
      `${t} ไม่ได้เพิ่มหรือลดความมั่งคั่ง ต้องไม่ใช้เขียวหรือแดง`);
  }
});

// ── realized profit ──────────────────────────────────────────────────────────
// Money that arrived, kept apart from money that merely could. Both are called
// "กำไร" everywhere else, and confusing them is how a portfolio down on paper
// looks like a losing year when it was a profitable one, or the reverse.
test('realized profit counts sales and dividends, and nothing unsold', () => {
  const assets = [
    { name:'USDT', currency:'THB', qty:100, avgCost:30, currentPrice:99,   // huge paper gain
      moves:[{ id:1, date:'2026-03-04', qty:-1523, realized:18940 }] },
    { name:'BTC',  currency:'USD', moves:[{ id:2, date:'2026-05-20', qty:-0.05, realized:-150 }] },
    { name:'TRC',  currency:'THB', moves:[{ id:3, date:'2025-11-02', qty:-500, realized:1831.18 }] },
  ];
  const txs = [{ id:9, type:'dividend', title:'ปันผล ASML', date:'2026-08-06', amount:1830 }];
  const r = realizedByYear(assets, txs, 33);

  assert.equal(Math.round(r['2026'].salesTotal), 18940 - 150*33, 'ขายสกุลดอลลาร์ต้องคูณเรท');
  assert.equal(r['2026'].divTotal, 1830);
  assert.equal(Math.round(r['2026'].total), Math.round(r['2026'].salesTotal + r['2026'].divTotal));
  assert.equal(Math.round(r['2025'].total), 1831, 'ต้องแยกตามปีของวันที่บันทึก');
  // the unsold position is worth 99 against a cost of 30 and must not appear here
  assert.ok(!JSON.stringify(r).includes('6900'), 'กำไรบนกระดาษต้องไม่ถูกนับเป็นกำไรที่รับรู้');
});

test('a move that realized nothing is not listed', () => {
  const assets = [{ name:'X', currency:'THB', moves:[
    { id:1, date:'2026-01-05', qty: 100, realized:0 },      // buying realizes nothing
    { id:2, date:'2026-01-06', qty:-10,  realized:0 },       // sold with no rate given
  ]}];
  assert.deepEqual(realizedByYear(assets, [], 35), {}, 'ไม่มีกำไรที่รับรู้ ต้องไม่มีปีขึ้นมาเลย');
});

// ── Backup encryption ────────────────────────────────────────────────────────
// The screen lock hides numbers; this one is supposed to actually protect the
// file. The difference is only real if a wrong passphrase fails instead of
// returning something — so that is what these check.
test('an encrypted backup round-trips with the right passphrase', async () => {
  const data = { version:2, exportedAt:'2026-08-23T00:00:00.000Z',
                 txs:[{ id:1, amount:280 }], assets:[{ id:2, qty:12.5 }], usdrate:33 };
  const env = await encryptBackup(data, 'ลองรหัสไทย 123!');
  assert.ok(isEncryptedBackup(env), 'ต้องถูกมองว่าเป็นไฟล์เข้ารหัส');
  assert.deepEqual(await decryptBackup(env, 'ลองรหัสไทย 123!'), data);
});

test('the ciphertext does not carry the records in the clear', async () => {
  const data = { version:2, exportedAt:'2026-08-23T00:00:00.000Z',
                 txs:[{ id:1, title:'เงินเดือน', amount:620000 }], assets:[] };
  // The passphrase needs a character base64 cannot produce. Checking for a short
  // alphanumeric one ("pw") failed about one run in twenty, because two random
  // base64 characters land on it that often — the test flagged its own noise,
  // not a leak.
  const pass = 'never-in-base64';
  const env = await encryptBackup(data, pass);
  const blob = JSON.stringify(env);
  assert.ok(!blob.includes('620000'), 'ยอดเงินต้องไม่โผล่ในไฟล์');
  assert.ok(!blob.includes('เงินเดือน'), 'ชื่อรายการต้องไม่โผล่ในไฟล์');
  assert.ok(!blob.includes(pass), 'รหัสต้องไม่ถูกเก็บลงไฟล์');
});

test('a wrong passphrase throws instead of returning wrong data', async () => {
  const env = await encryptBackup({ version:2, txs:[], assets:[] }, 'right');
  await assert.rejects(() => decryptBackup(env, 'wrong'));
});

test('a tampered file fails to decrypt rather than opening changed', async () => {
  const env = await encryptBackup({ version:2, txs:[{ id:1, amount:100 }], assets:[] }, 'pw');
  const flipped = { ...env, data: env.data.slice(0, -8) + 'AAAAAAA=' };
  await assert.rejects(() => decryptBackup(flipped, 'pw'), 'AES-GCM ต้องจับได้ว่าไฟล์ถูกแก้');
});

test('every export gets its own salt and iv', async () => {
  const d = { version:2, txs:[], assets:[] };
  const a = await encryptBackup(d, 'same'), b = await encryptBackup(d, 'same');
  assert.notEqual(a.salt, b.salt, 'salt ซ้ำกันไม่ได้');
  assert.notEqual(a.iv,   b.iv,   'iv ซ้ำกันไม่ได้');
  assert.notEqual(a.data, b.data, 'ไฟล์เดียวกันรหัสเดียวกัน ต้องได้ ciphertext คนละแบบ');
});

test('a plain backup is not mistaken for an encrypted one', () => {
  assert.equal(isEncryptedBackup({ version:2, txs:[], assets:[] }), false);
  assert.equal(isEncryptedBackup(null), false);
  assert.equal(isEncryptedBackup({ ftEncrypted:1 }), false, 'ต้องมี salt/iv/data ครบถึงนับ');
});

test('a real-sized backup survives the base64 chunking', async () => {
  // btoa via String.fromCharCode(...bytes) blows the argument stack somewhere
  // above ~100KB; real backups are past 300KB, so this is the case that matters.
  const txs = Array.from({ length: 4000 }, (_, i) => ({ id:i, title:'รายการที่ '+i, amount:i*13 }));
  const env = await encryptBackup({ version:2, txs, assets:[] }, 'pw');
  const back = await decryptBackup(env, 'pw');
  assert.equal(back.txs.length, 4000);
  assert.equal(back.txs[3999].title, 'รายการที่ 3999');
});

// ── Asset cash flow ──────────────────────────────────────────────────────────
// The money side of buying, selling and dividends. Buying had no wallet at all
// until these paths merged, and selling converted no currency — so both halves
// of this are bugs that were live.
test('buying takes money out of the wallet, selling puts it back', () => {
  const buy  = assetCashFlow({ kind:'buy',  qty: 10, rate:100, currency:'THB' });
  const sell = assetCashFlow({ kind:'sell', qty:-10, rate:100, currency:'THB' });
  assert.equal(buy,  -1000, 'ซื้อต้องเป็นเงินออกจากกระเป๋า');
  assert.equal(sell, +1000, 'ขายต้องเป็นเงินเข้ากระเป๋า');
});

test('a USD holding converts before it reaches a baht wallet', () => {
  // 40 units at $50 is $2,000; at 33 that is ฿66,000. Writing the dollar figure
  // into a baht wallet was out by the whole exchange rate, every time.
  const sell = assetCashFlow({ kind:'sell', qty:-40, rate:50, currency:'USD', usdRate:33 });
  assert.equal(sell, 66000);
  const thb = assetCashFlow({ kind:'sell', qty:-40, rate:50, currency:'THB', usdRate:33 });
  assert.equal(thb, 2000, 'สินทรัพย์สกุลบาทต้องไม่ถูกคูณเรท');
});

test('a dividend pays money without touching the holding', () => {
  assert.equal(assetCashFlow({ kind:'dividend', amount:1830, currency:'THB' }), 1830);
  assert.equal(assetCashFlow({ kind:'dividend', amount:100, currency:'USD', usdRate:32.81 }), 3281);
  assert.equal(assetCashFlow({ kind:'dividend', amount:0 }), 0, 'ไม่มียอด = ไม่มีรายการ');
});

test('a quantity correction moves no money', () => {
  assert.equal(assetCashFlow({ kind:'adjust', qty:5,  rate:100 }), 0, 'ปรับยอดคือแก้จำนวนที่บันทึกผิด ไม่ใช่การซื้อ');
  assert.equal(assetCashFlow({ kind:'adjust', qty:-5, rate:100 }), 0);
});

test('no rate means no money, in either direction', () => {
  // moving units to another exchange is a real thing to record, and it is not a sale
  assert.equal(assetCashFlow({ kind:'sell', qty:-10, rate:0 }), 0);
  assert.equal(assetCashFlow({ kind:'buy',  qty: 10, rate:0 }), 0);
  assert.equal(assetCashFlow({}), 0, 'เรียกเปล่าๆ ต้องไม่พัง');
});


// ── Account switch clears local records ──────────────────────────────────────
// localStorage keys are not namespaced by account, so the guard that wipes them
// on a uid change is the only thing standing between two people sharing a
// browser and one of them uploading the other's ledger. Modelled here rather
// than in app.jsx so the rule itself is checkable: every ft- key goes except
// the device id, which belongs to the machine and not to anyone signed in.
const wipeOnSwitch = (store, uid) => {
  const owner = store['ft-owner'];
  if (owner && owner !== uid) {
    Object.keys(store).filter(k => k.startsWith('ft-') && k !== 'ft-device-id')
      .forEach(k => { delete store[k]; });
  }
  store['ft-owner'] = uid;
  return store;
};

test('signing in as somebody else drops the previous ledger', () => {
  const s = wipeOnSwitch({
    'ft-owner':'uid-A', 'ft-txs':'[…]', 'ft-assets':'[…]', 'ft-wallets':'[…]',
    'ft-device-id':'dev_abc',
  }, 'uid-B');
  assert.equal(s['ft-txs'], undefined, 'รายการของคนก่อนต้องไม่ค้าง');
  assert.equal(s['ft-assets'], undefined);
  assert.equal(s['ft-wallets'], undefined);
  assert.equal(s['ft-owner'], 'uid-B');
  assert.equal(s['ft-device-id'], 'dev_abc', 'device id เป็นของเครื่อง ไม่ใช่ของคน');
});

test('the previous screen lock never carries over to a new account', () => {
  // inheriting a passcode a stranger set locks the new arrival out of their own app
  const s = wipeOnSwitch({
    'ft-owner':'uid-A', 'ft-lock-on':'1', 'ft-lock-hash':'abc', 'ft-lock-salt':'def',
  }, 'uid-B');
  assert.equal(s['ft-lock-on'], undefined);
  assert.equal(s['ft-lock-hash'], undefined);
  assert.equal(s['ft-lock-salt'], undefined);
});

test('signing back in as the same person keeps everything', () => {
  const s = wipeOnSwitch({ 'ft-owner':'uid-A', 'ft-txs':'[…]' }, 'uid-A');
  assert.equal(s['ft-txs'], '[…]', 'คนเดิมกลับมา ข้อมูลต้องอยู่ครบ');
});

test('a first sign-in keeps what is already there', () => {
  // upgrading from a build that predates ft-owner must not wipe a real ledger
  const s = wipeOnSwitch({ 'ft-txs':'[…]' }, 'uid-A');
  assert.equal(s['ft-txs'], '[…]', 'ไม่มีเจ้าของเดิมบันทึกไว้ = ไม่ใช่การสลับบัญชี');
  assert.equal(s['ft-owner'], 'uid-A');
});

// ── Who the greeting names ───────────────────────────────────────────────────
// The fallback here used to be a literal name, so every account that signed up
// with an email address — which sets no displayName — was greeted as somebody
// else entirely.
test('the greeting never calls somebody by another person’s name', () => {
  assert.equal(whoAmI({ email:'somebody@gmail.com' }), 'somebody');
  assert.equal(whoAmI({ displayName:'Nok', email:'other@gmail.com' }), 'Nok', 'ชื่อที่ตั้งไว้ต้องมาก่อน');
  assert.equal(whoAmI({ email:'user+test1@gmail.com' }), 'user', '+alias เป็นการกำหนดเส้นทาง ไม่ใช่ชื่อ');
  assert.equal(whoAmI({ displayName:'   ', email:'x@y.com' }), 'x', 'ชื่อที่มีแต่ช่องว่างไม่นับ');
});

test('no usable name gives a greeting with no name in it', () => {
  // better a bare hello than a wrong one
  assert.equal(whoAmI({}), '');
  assert.equal(whoAmI(null), '');
  assert.equal(whoAmI({ email:'' }), '');
});


// ── Annualised return ────────────────────────────────────────────────────────
// The figure that makes two holdings comparable. Every case here is one the
// panel on the dashboard can actually be handed.
test('annualisedReturn: one full year is the plain gain', () => {
  assert.equal(annualisedReturn({ value: 130, cost: 100, days: 365.25 }), 30);
});

test('annualisedReturn: compounds rather than dividing by years', () => {
  // Doubling over two years is ~41.4%/yr compounded, not 50% straight-line.
  assert.equal(annualisedReturn({ value: 200, cost: 100, days: 730.5 }), 41.42);
});

test('annualisedReturn: a short hold scales up, and a long one down', () => {
  // Same +18%: over 6 months that is a much better annual rate than over 3 yrs.
  const half = annualisedReturn({ value: 118, cost: 100, days: 183 });
  const long = annualisedReturn({ value: 118, cost: 100, days: 1096 });
  assert.ok(half > 38 && half < 40, `six-month: ${half}`);
  assert.ok(long > 5 && long < 6,   `three-year: ${long}`);
});

test('annualisedReturn: losses stay negative and never below -100', () => {
  assert.ok(annualisedReturn({ value: 80, cost: 100, days: 365.25 }) === -20);
  assert.equal(annualisedReturn({ value: 0, cost: 100, days: 400 }), -100);
  assert.equal(annualisedReturn({ value: -5, cost: 100, days: 400 }), -100);
});

test('annualisedReturn: refuses anything held under the minimum', () => {
  // Two weeks at +5% annualises to about +260% — correct, and meaningless.
  assert.equal(annualisedReturn({ value: 105, cost: 100, days: 14 }), null);
  assert.equal(annualisedReturn({ value: 105, cost: 100, days: 89 }), null);
  assert.ok(annualisedReturn({ value: 105, cost: 100, days: 90 }) !== null);
});

test('annualisedReturn: no cost basis and no holding period give null', () => {
  assert.equal(annualisedReturn({ value: 100, cost: 0, days: 400 }), null);
  assert.equal(annualisedReturn({ value: 100, cost: -1, days: 400 }), null);
  assert.equal(annualisedReturn({ value: 100, cost: 100, days: 0 }), null);
  assert.equal(annualisedReturn({ value: 100, cost: 100, days: null }), null);
});

test('annualisedReturn: rounds, so no 30.000000000000004 reaches the screen', () => {
  const r = annualisedReturn({ value: 130, cost: 100, days: 365.25 });
  assert.equal(String(r).length <= 6, true, `got ${r}`);
});

// ── assetTotalReturn ─────────────────────────────────────────────────────────
// The figure the app could not produce: everything one holding has made, with
// the pieces that were sold counted alongside the piece still held.
test('assetTotalReturn: a position sold at a profit and now under water', () => {
  // Bought 1.0 at 2,000,000. Sold 0.5 at 4,000,000 (+1,000,000 realised).
  // The remaining 0.5 has fallen to 1,600,000 — a paper loss of 200,000.
  const a = {
    id: 1, type: 'crypto', currency: 'THB', qty: 0.5, avgCost: 2000000, currentPrice: 1600000,
    moves: [{ id: 'm1', qty: -0.5, rate: 4000000, realized: 1000000 }],
  };
  const r = assetTotalReturn(a, [], 1);
  assert.equal(r.unrealised, -200000, 'the half still held is down');
  assert.equal(r.realised, 1000000, 'the half sold banked a million');
  assert.equal(r.invested, 2000000, 'both halves cost 2,000,000 in total');
  assert.equal(r.total, 800000, 'so the holding is up overall');
  assert.equal(r.pct, 40);
});

test('assetTotalReturn: dividends count, and only this holding s own', () => {
  const a = { id: 7, type: 'stock', currency: 'THB', qty: 10, avgCost: 100, currentPrice: 100, moves: [] };
  const txs = [
    { id: 1, type: 'dividend', targetAssetId: 7, amount: 300, date: '2026-01-05' },
    { id: 2, type: 'dividend', targetAssetId: 9, amount: 999, date: '2026-01-05' }, // another holding
  ];
  const r = assetTotalReturn(a, txs, 1);
  assert.equal(r.dividends, 300, 'another holding s dividend must not be counted here');
  assert.equal(r.total, 300, 'flat price, so the dividend is the whole return');
  assert.equal(r.pct, 30);
});

// Money tagged to an asset raises what that asset is worth — the mechanism
// cash-type holdings are built on. It flows through assetVal into the paper
// gain, so it must not also be counted as a return in its own right, and a
// dividend must not be double-counted by arriving through both doors.
// This test used to assert the opposite, and the assertion was the bug written
// down: a holding is worth its units times its price, so money tagged to it
// cannot also be added — the units are already the record of what was bought.
// Applying both is how a ฿3,000 purchase came out as ฿6,000 of value.
test('assetTotalReturn: tagged money does not move a holding with units', () => {
  const a = { id: 8, type: 'stock', currency: 'THB', qty: 10, avgCost: 100, currentPrice: 100, moves: [] };
  const txs = [{ id: 1, type: 'income', targetAssetId: 8, amount: 500, date: '2026-01-05' }];
  const r = assetTotalReturn(a, txs, 1);
  assert.equal(r.unrealised, 0, '10 units at cost, and the tag adds nothing on top');
  assert.equal(r.dividends, 0, 'income is not a dividend');
  assert.equal(r.total, 0);
});

// The same amounts that would double-count on a holding are the entire balance
// on a cash asset: qty x price is the opening figure and the tagged flow is the
// only record of what has happened since.
test('assetTaggedNet: cash tracks its tagged flow, a holding ignores it', () => {
  const cash  = { id: 7, type: 'cash',  qty: 10000, avgCost: 1, currentPrice: 1, currency: 'THB' };
  const stock = { id: 8, type: 'stock', qty: 10, avgCost: 100, currentPrice: 100, currency: 'THB' };
  const txs = [
    { id: 1, type: 'income',  targetAssetId: 7, amount: 3000 },
    { id: 2, type: 'expense', targetAssetId: 7, amount: 1000 },
    { id: 3, type: 'income',  targetAssetId: 8, amount: 5000 },
  ];
  assert.equal(assetTaggedNet(cash, txs), 2000, '3000 in, 1000 out');
  assert.equal(assetTaggedNet(stock, txs), 0, 'units already carry it');
  assert.equal(assetVal(cash, txs, 1), 12000);
  assert.equal(assetVal(stock, txs, 1), 1000, 'not 6000');
});

// The buy flow raises qty and avgCost and writes an [invest] expense tagged to
// the same asset. Counting that tag as money in charged the purchase twice.
test('an [invest] expense never adds on top of the units it bought', () => {
  const after = { id: 1, type: 'stock', qty: 250, avgCost: 20, currentPrice: 20, currency: 'THB' };
  const dca = { id: 9, type: 'expense', amount: 3000, notes: '[invest]', targetAssetId: 1, walletId: 5 };
  assert.equal(assetVal(after, [dca], 1), 5000, '250 x 20, and the tag adds nothing');
});

test('assetTotalReturn: a USD holding converts realised but not dividends', () => {
  // realized is stored in the asset's currency; dividend rows are already baht.
  const a = {
    id: 2, type: 'stock', currency: 'USD', qty: 1, avgCost: 100, currentPrice: 120,
    moves: [{ id: 'm', qty: -1, rate: 150, realized: 50 }],
  };
  const txs = [{ id: 1, type: 'dividend', targetAssetId: 2, amount: 350, date: '2026-02-01' }];
  const r = assetTotalReturn(a, txs, 30);
  assert.equal(r.unrealised, 600, '(120-100) x 1 x 30');
  assert.equal(r.realised, 1500, '50 x 30');
  assert.equal(r.dividends, 350, 'already baht, not multiplied again');
  assert.equal(r.total, 2450);
});

test('assetTotalReturn: never divides by a cost basis of zero', () => {
  const a = { id: 3, type: 'other', currency: 'THB', qty: 0, avgCost: 0, currentPrice: 0, moves: [] };
  assert.equal(assetTotalReturn(a, [], 1).pct, null);
  assert.equal(assetTotalReturn(null, [], 1), null);
});

test('assetTotalReturn: cash has no paper gain to report', () => {
  const a = { id: 4, type: 'cash', currency: 'THB', qty: 1, avgCost: 0, currentPrice: 50000, moves: [] };
  assert.equal(assetTotalReturn(a, [], 1).unrealised, 0);
});


// ── Data health ─────────────────────────────────────────────────────────────
// The rules exist because the audit that ran before them was structural only,
// and structural rules said nothing at all while three double-counting bugs
// moved real money. Each of these is one of those bugs, written down.

test('dataHealth: a row on both a wallet and a holding is flagged', () => {
  const assets = [{ id: 1, type: 'stock', qty: 10, avgCost: 100, currentPrice: 100 }];
  const txs = [{ id: 9, type: 'expense', amount: 3000, walletId: 5, targetAssetId: 1 }];
  const hit = dataHealth({ txs, assets }).find(f => f.title.includes('นับสองที่'));
  assert.ok(hit, 'the pattern that took ฿6,000 off net worth for a ฿3,000 payment');
  assert.equal(hit.rows.length, 1);
});

test('dataHealth: the same row against a cash asset is fine', () => {
  // Cash assets are exactly where a tagged amount belongs — walletCash already
  // excludes it, so nothing is counted twice.
  const assets = [{ id: 1, type: 'cash', qty: 10000, avgCost: 1, currentPrice: 1, walletId: 5 }];
  const txs = [{ id: 9, type: 'expense', amount: 3000, walletId: 5, targetAssetId: 1 }];
  assert.equal(dataHealth({ txs, assets }).filter(f => f.title.includes('นับสองที่')).length, 0);
});

test('dataHealth: units that disagree with their own history are flagged', () => {
  const assets = [{ id: 1, type: 'stock', qty: 999, avgCost: 20, currentPrice: 20,
                    moves: [{ id: 'm', qty: 150, newQty: 250, rate: 20 }] }];
  const hit = dataHealth({ txs: [], assets }).find(f => f.title.includes('จำนวนหน่วย'));
  assert.ok(hit, 'qty says 999, the newest move says 250');
});

test('dataHealth: a transfer missing its other leg is flagged', () => {
  const txs = [{ id: 1, type: 'transfer', amount: 500, linkedId: 'trf-1',
                 transferDir: 'from', walletId: 1, toWalletId: 2 }];
  assert.ok(dataHealth({ txs }).find(f => f.title.includes('ขาเดียว')));
});

test('dataHealth: clean data reports nothing', () => {
  const assets = [{ id: 1, type: 'stock', qty: 250, avgCost: 20, currentPrice: 20,
                    moves: [{ id: 'm', qty: 150, newQty: 250, rate: 20 }] }];
  const txs = [{ id: 1, type: 'expense', amount: 100, walletId: 5 }];
  assert.equal(dataHealth({ txs, assets }).filter(f => f.level === 'warn').length, 0);
});
