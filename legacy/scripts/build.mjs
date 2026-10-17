import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const mainOut = path.join(root, 'dist', 'main');

// 语法校验：主进程源码写错也能 build 成功的问题，先检查再 copy
const mainSrc = path.join(root, 'src', 'main', 'index.js');
if (!fs.existsSync(mainSrc)) {
  console.error('Main source not found: ' + mainSrc);
  process.exit(1);
}
try {
  execFileSync(process.execPath, ['--check', mainSrc], { stdio: 'inherit' });
  console.log('Syntax check passed: src/main/index.js');
} catch {
  console.error('Syntax check FAILED, aborting build.');
  process.exit(1);
}

fs.mkdirSync(mainOut, { recursive: true });
fs.copyFileSync(
  mainSrc,
  path.join(mainOut, 'index.cjs')
);
console.log('Main build complete: dist/main/index.cjs');