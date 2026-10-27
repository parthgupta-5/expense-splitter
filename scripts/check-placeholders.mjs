// Lists placeholders the owner still has to fill in. With --strict it fails if any remain.
import { existsSync, readFileSync } from 'node:fs';

const strict = process.argv.includes('--strict');
const targets = ['README.md'];
const pattern = /TODO|<your name>|<url>|<link>|<your-project>/;

const found = [];
for (const file of targets) {
  if (!existsSync(file)) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    if (pattern.test(line)) found.push(`${file}:${index + 1}: ${line.trim()}`);
  });
}

if (!found.length) {
  console.log('No placeholders left. Ready to submit.');
} else {
  const heading = strict ? 'Placeholders still to fill in (blocking):' : 'Placeholders still to fill in (warning only):';
  console.log(heading + '\n' + found.map((item) => '  - ' + item).join('\n'));
  if (strict) process.exit(1);
}
