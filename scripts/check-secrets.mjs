// Fails when a git-tracked file looks like it contains a secret. Plain Node, no dependencies.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip)$/i;
const SELF = 'scripts/check-secrets.mjs';
// Patterns are assembled from pieces so this file does not match its own rules.
const SERVICE_ROLE = 'service' + '_role';
const rules = [
  { name: 'JWT-like token', test: (line) => new RegExp('ey' + 'J[A-Za-z0-9_-]{20,}').test(line) },
  { name: 'Supabase secret key', test: (line) => line.includes('sb_' + 'secret_') },
  { name: 'private key header', test: (line) => new RegExp('-----BEGIN [A-Z ]*PRIVATE ' + 'KEY-----').test(line) },
];
const mayMentionServiceRole = (file) => file === 'README.md' || file === '.env.example' || file.startsWith('docs/');

const problems = [];
for (const file of files) {
  const base = path.basename(file);
  if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) {
    problems.push(`${file}: environment file is tracked by git`);
  }
  if (file === SELF || file === 'package-lock.json' || BINARY.test(file)) continue;
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  text.split('\n').forEach((line, index) => {
    if (line.includes(SERVICE_ROLE) && !mayMentionServiceRole(file)) {
      problems.push(`${file}:${index + 1}: mentions ${SERVICE_ROLE} outside README, docs and .env.example`);
    }
    rules.forEach((rule) => {
      if (rule.test(line)) problems.push(`${file}:${index + 1}: possible ${rule.name}`);
    });
  });
}

if (problems.length) {
  console.error('Secret scan FAILED:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`Secret scan passed (${files.length} tracked files checked).`);
