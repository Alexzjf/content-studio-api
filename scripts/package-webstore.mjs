/**
 * Build a Chrome Web Store zip (no server/, no secrets, no node_modules).
 * Output: dist/cheatxtwitter-{version}.zip
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const version = manifest.version || "0.0.0";
const outDir = join(root, "dist");
const stagingDir = join(outDir, "staging");
const zipPath = join(outDir, `cheatxtwitter-${version}.zip`);

const EXCLUDE_DIRS = new Set([
  "node_modules",
  "server",
  "store",
  "dist",
  "scripts",
  ".git",
  ".cursor",
]);

const EXCLUDE_FILES = new Set([
  "auth-config.local.js",
  ".gitignore",
  "render.yaml",
  "zbpack.json",
  "package-lock.json",
  "INSTALL.md",
]);

const EXCLUDE_EXT = new Set([".map", ".example"]);

function shouldInclude(relPath) {
  const parts = relPath.split("/");
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return false;
  const base = parts[parts.length - 1];
  if (EXCLUDE_FILES.has(base)) return false;
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
  if (EXCLUDE_EXT.has(ext)) return false;
  return true;
}

function collectFiles(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(root, full);
    if (!shouldInclude(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) collectFiles(full, files);
    else files.push({ full, rel });
  }
  return files;
}

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });

for (const { full, rel } of collectFiles(root)) {
  const dest = join(stagingDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(full, dest);
}

cpSync(join(root, "store/auth-config.stub.js"), join(stagingDir, "auth-config.local.js"));

let manifestText = readFileSync(join(stagingDir, "manifest.json"), "utf8");
manifestText = manifestText.replace(/"auth-config\.local\.js",\s*\n\s*/, "");
writeFileSync(join(stagingDir, "manifest.json"), manifestText);

mkdirSync(outDir, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

execSync(`cd "${stagingDir}" && zip -r -q "${zipPath}" .`, { stdio: "inherit" });

const sizeMb = (statSync(zipPath).size / (1024 * 1024)).toFixed(2);
console.log(`\n✓ Chrome Web Store package ready:`);
console.log(`  ${zipPath}`);
console.log(`  ${sizeMb} MB, version ${version}`);
console.log(`\nUpload: https://chrome.google.com/webstore/devconsole\n`);
