/**
 * generate-csp-hashes.mjs
 *
 * Computes SHA-256 hashes of all inline <script> and <style> tags in the Vite build
 * output and writes them to `public/csp-hashes.json`. The Express server reads this
 * file at startup to construct a hash-based Content-Security-Policy header.
 *
 * Usage: node scripts/generate-csp-hashes.mjs
 * Run from: project root (where package.json lives)
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { createHash } from 'crypto';

const DIST_DIR = resolve('dist');
const OUTPUT_FILE = resolve('public/csp-hashes.json');

const InlineSCRIPT_RE = /<script[^>]*>([\s\S]*?)<\/script>/gi;
const InlineSTYLE_RE  = /<style[^>]*>([\s\S]*?)<\/style>/gi;

function hash(content) {
  return createHash('sha256').update(content).digest('base64');
}

function extractInlineHashes(htmlContent) {
  const scriptHashes = [];
  const styleHashes  = [];

  let m;
  while ((m = InlineSCRIPT_RE.exec(htmlContent)) !== null) {
    const content = m[1].trim();
    if (content.length > 0) {
      scriptHashes.push(`'sha256-${hash(content)}'`);
    }
  }

  while ((m = InlineSTYLE_RE.exec(htmlContent)) !== null) {
    const content = m[1].trim();
    if (content.length > 0) {
      styleHashes.push(`'sha256-${hash(content)}'`);
    }
  }

  return { scriptHashes, styleHashes };
}

function walkDir(dir, extensions) {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkDir(full, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const htmlFiles = walkDir(DIST_DIR, ['.html']);
  if (htmlFiles.length === 0) {
    console.error('[CSP] No HTML files found in dist/. Run `npm run build` first.');
    process.exit(1);
  }

  const allScriptHashes = new Set();
  const allStyleHashes  = new Set();

  for (const file of htmlFiles) {
    const content = readFileSync(file, 'utf8');
    const { scriptHashes, styleHashes } = extractInlineHashes(content);
    scriptHashes.forEach(h => allScriptHashes.add(h));
    styleHashes.forEach(h  => allStyleHashes.add(h));
  }

  const result = {
    scriptSrc: [...allScriptHashes],
    styleSrc:  [...allStyleHashes],
    generatedAt: new Date().toISOString()
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log(`[CSP] Hashed ${allScriptHashes.size} script tag(s) and ${allStyleHashes.size} style tag(s).`);
  console.log(`[CSP] Written to ${OUTPUT_FILE}`);
}

main();