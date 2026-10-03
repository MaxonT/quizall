import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, ".env");
if (existsSync(envPath)) {
  console.log('Existing configuration preserved. Run the backend config check before starting.');
} else {
  const template = readFileSync(`${envPath}.example`, 'utf8');
  if (!/^JWT_SECRET=\s*$/m.test(template)) throw new Error('Expected a blank JWT_SECRET in the template.');
  const content = template.replace(/^JWT_SECRET=\s*$/m, `JWT_SECRET=${randomBytes(32).toString('hex')}`);
  writeFileSync(envPath, content, { flag: 'wx', mode: 0o600 });
  console.log('Created local configuration with a new random login signing key.');
}
console.log('For real AI output, add your own ANTHROPIC_API_KEY to ' + ".env" + '.');
console.log('Then: docker compose up --build');
console.log('Open http://localhost:4173. Stop with Ctrl+C; saved data stays in the Docker volume.');
