import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const checks = [
	{
		name: "package.json exists",
		pass: () => fs.existsSync(path.join(root, "package.json")),
	},
	{
		name: "env template or env exists",
		pass: () => fs.existsSync(path.join(root, ".env.example")) || fs.existsSync(path.join(root, ".env")),
	},
	{
		name: "server entry exists",
		pass: () => fs.existsSync(path.join(root, "src", "server.js")),
	},
	{
		name: "auth route exists",
		pass: () => fs.existsSync(path.join(root, "src", "routes", "auth.js")),
	},
	{
		name: "Dockerfile exists",
		pass: () => fs.existsSync(path.join(root, "Dockerfile")),
	},
	{
		name: "migrations directory exists",
		pass: () => fs.existsSync(path.join(root, "migrations")),
	},
	{
		name: "scripts directory exists",
		pass: () => fs.existsSync(path.join(root, "scripts")),
	},
];

const results = checks.map((item) => ({ name: item.name, ok: !!item.pass() }));
const passed = results.every((item) => item.ok);

console.log(JSON.stringify({ ok: passed, total: checks.length, checks: results }));
process.exit(passed ? 0 : 1);
