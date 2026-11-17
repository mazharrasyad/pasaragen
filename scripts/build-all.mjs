#!/usr/bin/env node
// Build every demo shop and the Pasar site for one environment.
//   node scripts/build-all.mjs            local (each site on its own port = own origin)
//   node scripts/build-all.mjs prod       hosted (each site on its own subdomain)
import { readdir, readFile, writeFile, cp, rm, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "../generator/agentify-umkm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = process.argv[2] || "local";
const config = JSON.parse(await readFile(path.join(ROOT, "pasaragen.config.json"), "utf8"))[env];
if (!config) throw new Error(`No environment "${env}" in pasaragen.config.json`);

const shops = [];
for (const file of (await readdir(path.join(ROOT, "catalogs"))).filter((f) => f.endsWith(".json")).sort()) {
  const id = file.replace(/\.json$/, "");
  const pageUrl = config.shops[id];
  if (!pageUrl) throw new Error(`No URL for shop ${id} in config ${env}`);
  const result = await generate(path.join(ROOT, "catalogs", file), path.join(ROOT, "sites", id), pageUrl, config.pasar, { quiet: true });
  console.log(`✓ shop ${result.name} → ${result.network}`);
  shops.push(result);
}

// Pasar: copy the source, add the runtime, write its directory and network from the shops.
const pasarOut = path.join(ROOT, "sites", "pasar");
await rm(pasarOut, { recursive: true, force: true });
await cp(path.join(ROOT, "pasar"), pasarOut, { recursive: true });
await cp(path.join(ROOT, "vendor", "agentify-website", "runtime"), path.join(pasarOut, "runtime"), { recursive: true });
await cp(path.join(ROOT, "vendor", "agentify-website", "templates", "links.json"), path.join(pasarOut, "links.json"));

const directory = {
  profile: "pasaragen-directory/v1",
  updated: new Date().toISOString().slice(0, 10),
  note: "Small shops that publish an open agentic website. Add yours with a pull request.",
  shops: shops.map((s) => ({ id: s.id, name: s.name, category: s.category, districts: s.districts, page: s.page, network: s.network })),
};
await writeFile(path.join(pasarOut, "directory.json"), JSON.stringify(directory, null, 2) + "\n");

const hoconSource = await readFile(path.join(pasarOut, "pasar.hocon.in"), "utf8");
const toolName = (url) => new URL(url).pathname.replace(/^\/+/, "").replace(/[^A-Za-z0-9_]/g, "_");
const partnerLines = shops.map((s) => `- ${toolName(s.network)}: ${s.name}, ${s.category.toLowerCase()}, delivers to ${s.districts.join(", ")}.`).join("\n");
const hocon = hoconSource
  .replace("@@PARTNER_LINES@@", partnerLines)
  .replace("@@PARTNER_TOOLS@@", shops.map((s) => JSON.stringify(s.network)).join(", "))
  .replace("@@LINK_LABELS@@", shops.map((s) => `        ${JSON.stringify(s.network)}: ${JSON.stringify(s.name)}`).join(",\n"));
await writeFile(path.join(pasarOut, "pasar.hocon"), hocon);
await rm(path.join(pasarOut, "pasar.hocon.in"));

const manifest = JSON.parse(await readFile(path.join(pasarOut, "agent-manifest.json"), "utf8"));
manifest.allowed_peers = [...new Set(shops.map((s) => new URL(s.network).origin))];
await writeFile(path.join(pasarOut, "agent-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const build = spawnSync(process.execPath, [path.join(ROOT, "vendor", "agentify-website", "scripts", "build_network.mjs"), path.join(pasarOut, "pasar.hocon"), "--manifest", path.join(pasarOut, "agent-manifest.json")], { encoding: "utf8" });
process.stdout.write(build.stdout);
process.stderr.write(build.stderr);
if (build.status !== 0) process.exit(build.status);
console.log(`✓ Pasar → ${config.pasar}`);
