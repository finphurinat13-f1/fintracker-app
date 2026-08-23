// ── Data audit ───────────────────────────────────────────────────────────────
// Checks a snapshot of the data for states that should be impossible, rather
// than checking that buttons were clicked in the right order. Most of the bugs
// found by hand — a wallet's cash negative against an asset holding the same
// money, a transfer missing its second leg, a category no longer in the list —
// are visible as broken invariants long before anyone notices them on screen.
//
// Reads a backup file. Never touches Firestore, never writes anything.
//
//   node tests/audit.mjs [path-to-backup.json]

import fs from 'node:fs';
import path from 'node:path';
import { walletCash, assetVal, walletDelta, getExpenseCats, itemTotals } from '../fintracker/src/lib.js';

// lib.js reads localStorage for the user's category list; there is none here.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

// No backup file present is the normal state, not a failure: this checks a
// snapshot of real data, which is deliberately not kept in the repo. Exiting
// non-zero here would break `npm run check` for everyone who has not just
// exported one, and a data check that blocks the build gets removed from the
// build — so it steps aside instead, and says how to run it.
const file = process.argv[2] || (() => {
  const found = fs.readdirSync('.').filter(f => /^fintracker-backup-.*\.json$/.test(f)).sort();
  if (!found.length) {
    console.log('ℹ️  ข้ามการตรวจข้อมูล — ไม่พบไฟล์ backup ในโฟลเดอร์นี้');
    console.log('   ถ้าต้องการตรวจ: ดาวน์โหลด Backup จากแอปมาวางไว้ แล้วรัน npm run audit อีกครั้ง');
    console.log('   หรือระบุไฟล์เอง: node tests/audit.mjs <file.json>');
    process.exit(0);
  }
  return found[found.length - 1];
})();

const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const txs     = d.txs     || [];
const assets  = d.assets  || [];
const wallets = d.wallets || [];

const problems = [];
const fail = (rule, detail) => problems.push({ rule, detail });
const near  = (a, b) => Math.abs(a - b) < 0.01;
const money = n => '฿' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 1 — the per-row rule must add up to the aggregate one. The running balance in
//     the transaction list is built on walletDelta; if it drifts from walletCash
//     the two disagree about the same wallet.
for (const w of wallets) {
  const cashAssetIds = new Set(assets.filter(a => a.walletId === w.id && a.type === 'cash').map(a => a.id));
  const tagged = t => cashAssetIds.has(t.targetAssetId) || cashAssetIds.has(t.toAssetId) || cashAssetIds.has(t.fromAssetId);
  const summed = txs.reduce((s, t) => s + (tagged(t) ? 0 : walletDelta(t, w.id)), 0);
  const actual = walletCash(w, txs, assets);
  if (!near((w.initialBalance || 0) + summed, actual))
    fail('ยอดกระเป๋าคำนวณสองวิธีไม่ตรงกัน', `${w.name}: ทีละรายการได้ ${money((w.initialBalance||0)+summed)} · สูตรรวมได้ ${money(actual)}`);
}

// 2 — loose cash cannot be negative while a cash asset in the same wallet holds
//     money: it means a transfer was taken from the wallet while the money sat in
//     the asset. Nets to the right total, which is why it hides.
for (const w of wallets) {
  const loose = walletCash(w, txs, assets);
  const inAssets = assets.filter(a => a.walletId === w.id && a.type === 'cash')
                         .reduce((s, a) => s + assetVal(a, txs, 1), 0);
  if (loose < -0.01 && inAssets > 0)
    fail('เงินสดติดลบเทียบกับสินทรัพย์ในกระเป๋าเดียวกัน', `${w.name}: เงินสด ${money(loose)} · สินทรัพย์ ${money(inAssets)}`);
}

// 3 — a transfer is two rows sharing a linkedId. One alone means the other was
//     deleted, and one side of the move silently never happened.
const legs = {};
txs.filter(t => t.linkedId).forEach(t => { (legs[t.linkedId] ||= []).push(t); });
for (const [id, group] of Object.entries(legs)) {
  const w2w = group.length === 1 && group[0].toWalletId && group[0].fromWalletId && group[0].toWalletId !== group[0].fromWalletId;
  if (w2w) fail('รายการโยกเหลือขาเดียว', `${group[0].date} ${group[0].title} ${money(Math.abs(group[0].amount))} (${id})`);
}

// 4 — every reference must point at something that still exists, or the amount
//     belongs to nothing and quietly leaves the totals.
const walletIds = new Set(wallets.map(w => w.id));
const assetIds  = new Set(assets.map(a => a.id));
for (const t of txs) {
  if (t.walletId && !walletIds.has(t.walletId))
    fail('รายการอ้างถึงกระเป๋าที่ไม่มีอยู่', `${t.date} ${t.title} (walletId ${t.walletId})`);
  for (const k of ['targetAssetId', 'toAssetId', 'fromAssetId'])
    if (t[k] && !assetIds.has(t[k]))
      fail('รายการอ้างถึงสินทรัพย์ที่ไม่มีอยู่', `${t.date} ${t.title} (${k} ${t[k]})`);
}
for (const a of assets)
  if (a.walletId && !walletIds.has(a.walletId))
    fail('สินทรัพย์ผูกกับกระเป๋าที่ไม่มีอยู่', `${a.name} (walletId ${a.walletId})`);

// 5 — a cash holding cannot be worth less than nothing.
for (const a of assets.filter(a => a.type === 'cash')) {
  const v = assetVal(a, txs, 1);
  if (v < -0.01) fail('สินทรัพย์เงินสดติดลบ', `${a.name}: ${money(v)}`);
}

// 6 — Net Worth is assets plus wallet cash. Anything counted twice or missed
//     shows up as a gap against the same figure built the other way round.
const rate = d.usdrate || 35;
const nwParts = assets.reduce((s, a) => s + assetVal(a, txs, rate), 0)
              + wallets.reduce((s, w) => s + walletCash(w, txs, assets), 0);
const nwByWallet = wallets.reduce((s, w) => {
  const linked = assets.filter(a => a.walletId === w.id).reduce((x, a) => x + assetVal(a, txs, rate), 0);
  return s + walletCash(w, txs, assets) + linked;
}, 0) + assets.filter(a => !a.walletId).reduce((s, a) => s + assetVal(a, txs, rate), 0);
if (!near(nwParts, nwByWallet))
  fail('Net Worth คำนวณสองวิธีไม่ตรงกัน', `${money(nwParts)} vs ${money(nwByWallet)}`);

// 7 — an expense filed under a category the list no longer offers stops being
//     reachable from Budget, so its money silently drops out of that view.
const cats = new Set(d.budgets ? Object.keys(d.budgets) : getExpenseCats());
const orphanCats = new Set();
txs.filter(t => t.type === 'expense' && t.category && !cats.has(t.category)).forEach(t => orphanCats.add(t.category));
if (orphanCats.size) fail('หมวดที่ใช้อยู่แต่ไม่มีในรายการหมวด', [...orphanCats].join(', '));

// 8 — every id must be unique; a duplicate means editing or deleting one record
//     hits the other.
const seen = new Set(), dupes = new Set();
txs.forEach(t => { if (seen.has(t.id)) dupes.add(t.id); seen.add(t.id); });
if (dupes.size) fail('รายการมี id ซ้ำกัน', [...dupes].join(', '));

// 9 — a collection asset (พระเครื่อง, การ์ด) is described by its pieces, but every
//     view values it as qty × currentPrice. Those are written from the pieces on
//     save; if they ever disagree, the total on screen has stopped matching the
//     list that explains it, and neither one announces which is wrong.
for (const a of assets.filter(a => (a.items || []).length)) {
  const { count, value } = itemTotals(a.items);
  const stored = a.qty * a.currentPrice;
  if (!near(stored, value))
    fail('ยอดสินทรัพย์ไม่ตรงกับผลรวมรายการย่อย', `${a.name}: เก็บไว้ ${money(stored)} · รวมรายชิ้นได้ ${money(value)}`);
  if (a.qty !== count)
    fail('จำนวนสินทรัพย์ไม่ตรงกับจำนวนชิ้น', `${a.name}: จำนวน ${a.qty} · มี ${count} ชิ้น`);
}

// 10 — reported, never failed: a row with neither a wallet nor an asset is money
//      with nowhere to come from. Budget counts the spend and Net Worth does not,
//      so the two disagree with nothing on screen to say why. It is a legitimate
//      way to record cash the app was never told about, which is exactly why it
//      cannot be an error — but it is also the only thing that can inflate Net
//      Worth silently and permanently, one forgotten wallet at a time, so the
//      running figure is worth seeing.
const floating = txs.filter(t => (t.type === 'income' || t.type === 'expense')
  && !t.walletId && !t.targetAssetId && !t.toAssetId && !t.fromAssetId);
const floatIn  = floating.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(t.amount), 0);
const floatOut = floating.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0);

// ── report ───────────────────────────────────────────────────────────────────
console.log(`ตรวจไฟล์: ${path.basename(file)}`);
console.log(`ข้อมูล: ${txs.length} รายการ · ${assets.length} สินทรัพย์ · ${wallets.length} กระเป๋า\n`);

if (floating.length) {
  console.log(`ℹ️  รายการลอย (ไม่ผูกกระเป๋าและไม่ผูกสินทรัพย์): ${floating.length} รายการ`);
  console.log(`     รายรับ ${money(floatIn)} · รายจ่าย ${money(floatOut)}`);
  console.log('     นับในงบและสรุปรายรับ-รายจ่าย แต่ไม่กระทบ Net Worth');
  console.log('     ถูกต้องถ้าเป็นเงินที่ไม่ได้บันทึกไว้ในแอป — ถ้าไม่ใช่ แปลว่ายอดกระเป๋าค้างสูงเกินจริง');
  [...floating].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 5)
    .forEach(t => console.log(`     ${t.date}  ${t.type === 'income' ? '+' : '-'}${money(Math.abs(t.amount))}  ${t.title}`));
  if (floating.length > 5) console.log(`     … อีก ${floating.length - 5} รายการ`);
  console.log('');
}

if (!problems.length) {
  console.log('✅ ผ่านทั้ง 9 ข้อ — ไม่พบสภาพที่เป็นไปไม่ได้ในข้อมูล');
  process.exit(0);
}
const byRule = {};
problems.forEach(p => { (byRule[p.rule] ||= []).push(p.detail); });
for (const [rule, details] of Object.entries(byRule)) {
  console.log(`⚠️  ${rule} (${details.length})`);
  details.slice(0, 8).forEach(x => console.log('     ' + x));
  if (details.length > 8) console.log(`     … อีก ${details.length - 8} รายการ`);
  console.log('');
}
console.log(`พบทั้งหมด ${problems.length} จุด`);
process.exit(1);
