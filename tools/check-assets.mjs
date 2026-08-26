/*
 * 静态资源引用检查:扫描 index.html 里本地 href/src 引用,
 * 确认文件都存在,防止 Pages 上线后 404。
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map(m => m[1])
  .filter(u => !/^(https?:|data:|#|mailto:)/.test(u));

const missing = refs.filter(u => !existsSync(join(root, u.split('?')[0].split('#')[0])));

if (missing.length) {
  console.error('缺失的资源引用:');
  for (const u of missing) console.error('  ' + u);
  process.exit(1);
}
console.log(`OK: ${refs.length} 个本地资源引用全部存在`);
