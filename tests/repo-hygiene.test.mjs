import assert from "node:assert/strict";
import test from "node:test";
import {existsSync, readFileSync, readdirSync, statSync} from "node:fs";
import {join, relative, resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TEXT_EXT = /\.(ts|mjs|js|json|html|css|md|sh|yml|yaml|txt)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".contextguard-data", ".idea", "coverage"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT).filter(file => {
  const name = relative(ROOT, file);
  if (/^\.env(\.|$)/.test(name) && name !== ".env.example") return false;
  return name !== "package-lock.json" && (TEXT_EXT.test(name) || name === ".env.example" || name === ".gitignore" || name === "LICENSE");
});
const read = file => readFileSync(file, "utf8");

test("the repository has no internal milestone tags", () => {
  const tag = new RegExp("\\b[Gg]" + "\\d{2,3}\\b");
  const offenders = [];
  for (const file of files) {
    const name = relative(ROOT, file);
    if (tag.test(name)) offenders.push(`${name} (file name)`);
    const hit = read(file).split("\n").findIndex(line => tag.test(line));
    if (hit >= 0) offenders.push(`${name}:${hit + 1}`);
  }
  assert.deepEqual(offenders, []);
});

test("no secret-like value is committed", () => {
  const patterns = [
    new RegExp("github_pat_" + "[A-Za-z0-9_]{20,}"),
    new RegExp("gh[pousr]" + "_[A-Za-z0-9]{30,}"),
    new RegExp("sk-" + "[A-Za-z0-9_-]{30,}"),
    new RegExp("-----BEGIN " + "[A-Z ]*PRIVATE KEY-----")
  ];
  const offenders = [];
  for (const file of files) {
    const text = read(file);
    for (const pattern of patterns) if (pattern.test(text)) offenders.push(relative(ROOT, file));
  }
  assert.deepEqual(offenders, []);
});

test("Git never tracks environment files, dependencies, build output or archives", t => {
  const result = spawnSync("git", ["ls-files"], {cwd: ROOT, encoding: "utf8"});
  if (result.error || result.status !== 0) return t.skip("not inside a Git working tree");
  const tracked = result.stdout.split("\n").filter(Boolean);
  const forbidden = tracked.filter(name =>
    (/(^|\/)\.env(\.|$)/.test(name) && name !== ".env.example") ||
    /(^|\/)node_modules\//.test(name) ||
    /^dist\//.test(name) ||
    /^\.contextguard-data\//.test(name) ||
    /\.zip$/.test(name)
  );
  assert.deepEqual(forbidden, []);
});

test(".gitignore protects local secrets and keeps the template", () => {
  const lines = read(join(ROOT, ".gitignore")).split("\n").map(line => line.trim());
  for (const entry of [".env", ".env.*", "!.env.example", "node_modules/", "dist/", ".contextguard-data/"]) {
    assert.ok(lines.includes(entry), `.gitignore should contain ${entry}`);
  }
});

test(".env.example documents the required settings with placeholders only", () => {
  const values = new Map();
  for (const line of read(join(ROOT, ".env.example")).split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
  for (const key of ["COMINTY_API_KEY", "COMINTY_USER_ID", "COMINTY_WORKER_AGENT_ID", "COMINTY_GUARD_AGENT_ID"]) {
    assert.ok(values.has(key), `${key} is documented`);
    assert.match(values.get(key), /^your_[a-z_]+$/, `${key} must be a placeholder`);
  }
  assert.equal(values.get("CONTEXTGUARD_UI_REAL_EXECUTION_ENABLED"), "false", "real writes are off by default");
});

test("package.json is consistent with the repository", () => {
  const pkg = JSON.parse(read(join(ROOT, "package.json")));
  assert.equal(pkg.name, "contextguard");
  assert.equal(pkg.license, "ISC");
  assert.match(read(join(ROOT, "LICENSE")), /^ISC License/);
  for (const script of ["build", "start", "check", "test", "start:live"]) assert.ok(pkg.scripts[script], `script ${script}`);
  assert.match(pkg.engines.node, />=22/);
  assert.equal(pkg.scripts["start:live"].includes("CONTEXTGUARD_UI_REAL_EXECUTION_ENABLED=true"), true);
  assert.equal(pkg.scripts.start.includes("REAL_EXECUTION_ENABLED"), false, "npm start must not enable writes");
});

test("relative links in the documentation point to existing files", () => {
  const docs = files.filter(file => file.endsWith(".md"));
  assert.ok(docs.length >= 5);
  const broken = [];
  for (const doc of docs) {
    for (const match of read(doc).matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const path = resolve(join(doc, ".."), target.split("#")[0]);
      if (!existsSync(path)) broken.push(`${relative(ROOT, doc)} -> ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("the interface script only uses element ids that exist in the page", () => {
  const html = read(join(ROOT, "public/index.html"));
  const script = read(join(ROOT, "public/app.js"));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "element ids are unique");
  const used = new Set([...script.matchAll(/\$\(\s*["']([A-Za-z0-9_-]+)["']\s*\)/g)].map(match => match[1]));
  assert.ok(used.size > 100);
  assert.deepEqual([...used].filter(id => !ids.includes(id)), []);
});

test("the interface presents one clear path and no inline event handlers", () => {
  const html = read(join(ROOT, "public/index.html"));
  assert.match(html, /<html lang="en"/);
  assert.match(html, /name="viewport"/);
  assert.doesNotMatch(html, /\son(click|change|submit|load|input)\s*=/i);
  for (const id of ["stepRepository", "stepAsk", "advancedTools", "classicResearch", "simpleResetButton"]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} is part of the guided layout`);
  }
  assert.ok(html.indexOf('id="stepRepository"') < html.indexOf('id="stepAsk"'), "repository comes before the question");
  assert.match(html, /<details[^>]*id="advancedTools"/, "advanced tools are folded away");
});
