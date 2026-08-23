// ── Backup encrypt / decrypt from the command line ───────────────────────────
// The app can open its own encrypted backups, but nothing else could: the audit
// script reads a plain JSON snapshot, and a file that only one browser tab can
// read is a poor place to keep the only copy of six years of records. This uses
// the same functions the app does, so a file written by either side opens on the
// other.
//
//   node tests/backup-crypto.mjs decrypt <in.enc.json> [out.json]
//   node tests/backup-crypto.mjs encrypt <in.json> [out.enc.json]
//
// The passphrase is read from stdin (or $FT_PASS) and never taken as an
// argument — command lines land in shell history and in the process list.

import fs from 'node:fs';
import readline from 'node:readline';
import { encryptBackup, decryptBackup, isEncryptedBackup } from '../fintracker/src/lib.js';

globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const [, , cmd, inFile, outArg] = process.argv;

if (!cmd || !inFile || !['encrypt', 'decrypt'].includes(cmd)) {
  console.log('ใช้: node tests/backup-crypto.mjs decrypt <in.enc.json> [out.json]');
  console.log('     node tests/backup-crypto.mjs encrypt <in.json> [out.enc.json]');
  console.log('\nรหัสอ่านจาก stdin หรือ $FT_PASS — ไม่รับเป็น argument');
  process.exit(cmd ? 1 : 0);
}
if (!fs.existsSync(inFile)) { console.error(`ไม่พบไฟล์: ${inFile}`); process.exit(1); }

const askPass = async prompt => {
  if (process.env.FT_PASS) return process.env.FT_PASS;
  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(res => rl.question(prompt, res));
  rl.close();
  return answer;
};

const src = JSON.parse(fs.readFileSync(inFile, 'utf8'));

if (cmd === 'decrypt') {
  if (!isEncryptedBackup(src)) { console.error('ไฟล์นี้ไม่ได้เข้ารหัส — เปิดอ่านได้เลย'); process.exit(1); }
  const pass = await askPass('รหัสของไฟล์: ');
  let plain;
  try {
    plain = await decryptBackup(src, pass);
  } catch {
    console.error('❌ รหัสไม่ถูกต้อง หรือไฟล์เสียหาย');
    process.exit(1);
  }
  const out = outArg || inFile.replace(/\.enc\.json$/, '.json').replace(/\.json$/, '.decrypted.json');
  fs.writeFileSync(out, JSON.stringify(plain, null, 2));
  console.log(`✅ ถอดรหัสแล้ว → ${out}`);
  console.log(`   ${plain.txs?.length || 0} รายการ · ${plain.assets?.length || 0} สินทรัพย์ · backup ${plain.exportedAt?.slice(0, 10) || '-'}`);
  console.log('   ⚠️ ไฟล์นี้เป็นข้อความเปล่า — ลบทิ้งเมื่อใช้เสร็จ');
} else {
  if (isEncryptedBackup(src)) { console.error('ไฟล์นี้เข้ารหัสอยู่แล้ว'); process.exit(1); }
  const pass = await askPass('ตั้งรหัสสำหรับไฟล์: ');
  if (!pass) { console.error('ต้องมีรหัส'); process.exit(1); }
  const env = await encryptBackup(src, pass);
  const out = outArg || inFile.replace(/\.json$/, '.enc.json');
  fs.writeFileSync(out, JSON.stringify(env, null, 2));
  console.log(`✅ เข้ารหัสแล้ว → ${out}`);
  console.log('   ⚠️ ลืมรหัสนี้ = เปิดไฟล์ไม่ได้ตลอดไป');
}
