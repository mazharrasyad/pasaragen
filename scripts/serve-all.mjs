#!/usr/bin/env node
// Serve Pasar and every demo shop locally, each on its own port (its own origin), with
// the CORS and worker headers the spec asks for. Pasar opens as 127.0.0.1 and the shops
// as localhost, so the runtime's key cookie is not shared between Pasar and the shops.
//   node scripts/serve-all.mjs     (run scripts/build-all.mjs first)
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVE = path.join(ROOT, "vendor", "agentify-website", "scripts", "serve_site.mjs");
const config = JSON.parse(await readFile(path.join(ROOT, "pasaragen.config.json"), "utf8")).local;
const sites = [["pasar", config.pasar], ...Object.entries(config.shops)];
for (const [id, url] of sites) {
  const u = new URL(url);
  const child = spawn(process.execPath, [SERVE, path.join(ROOT, "sites", id), "--port", u.port, "--open-as", u.hostname], { stdio: ["ignore", "pipe", "inherit"] });
  child.stdout.on("data", (d) => process.stdout.write(`[${id}] ${d}`));
}
process.on("SIGINT", () => process.exit(0));
