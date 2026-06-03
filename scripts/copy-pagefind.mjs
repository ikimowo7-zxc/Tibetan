import fs from 'node:fs/promises';
import path from 'path';
import { existsSync } from 'node:fs';

const src = path.resolve('dist/pagefind');
const dst = path.resolve('public/pagefind');

async function copyDir(srcDir, dstDir) {
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  if (!existsSync(dstDir)) {
    await fs.mkdir(dstDir, { recursive: true });
  }
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, dstPath);
    } else {
      await fs.copyFile(srcPath, dstPath);
    }
  }
}

if (!existsSync(src)) {
  console.error('Error: dist/pagefind not found');
  process.exit(1);
}

console.log('Copying dist/pagefind → public/pagefind...');
if (existsSync(dst)) {
  await fs.rm(dst, { recursive: true, force: true });
}
await copyDir(src, dst);
console.log('✅ Done');
