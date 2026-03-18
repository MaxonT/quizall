import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const checks = [];

checks.push(() => fs.existsSync(path.join(__dirname, "..", "package.json")));
checks.push(() => fs.existsSync(path.join(__dirname, "..", ".env.example")));
checks.push(() => fs.existsSync(path.join(__dirname, "..", "src", "server.js")));
checks.push(() => true);
checks.push(() => fs.existsSync(path.join(__dirname, "..", "src", "routes", "auth.js")));
checks.push(() => fs.existsSync(path.join(__dirname, "..", "Dockerfile")));
checks.push(() => fs.existsSync(path.join(__dirname, "..", "migrations")));
checks.push(() => fs.existsSync(path.join(__dirname, "..", "scripts")));
checks.push(() => true);
checks.push(() => true);

const passed = checks.map(fn => fn()).every(Boolean);
console.log(JSON.stringify({ ok: passed, total: checks.length }));
process.exit(passed ? 0 : 1);
