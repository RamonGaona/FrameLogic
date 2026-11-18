/**
 * Usage: npm run version:patch -- "Description of the change"
 * Updates root package.json, root package-lock.json and CHANGELOG.md together.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = path => readFileSync(resolve(root, path), "utf8");
const write = (path, text) => writeFileSync(resolve(root, path), text);
const note = process.argv.slice(2).join(" ").trim();

if (!note || note.includes("\n")) {
  throw new Error('Provide a single-line release note: npm run version:patch -- "Descripción del cambio"');
}

const pkgText = read("package.json");
const pkg = JSON.parse(pkgText);
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!match) throw new Error("Root package version must be MAJOR.MINOR.PATCH");
const oldVersion = pkg.version;
const nextVersion = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
const lockText = read("package-lock.json");
const lock = JSON.parse(lockText);
if (lock.version !== oldVersion || lock.packages?.[""]?.version !== oldVersion) {
  throw new Error("package-lock.json is not synchronized with package.json");
}
const changelog = read("CHANGELOG.md");
const latest = changelog.match(/^## v(\d+\.\d+\.\d+)\s+—/m);
if (latest?.[1] !== oldVersion) throw new Error("CHANGELOG.md does not match the current release");
const previous = `"version": "${oldVersion}"`;
const updated = `"version": "${nextVersion}"`;
if (pkgText.split(previous).length !== 2) throw new Error("Ambiguous root package version");
if (lockText.split(previous).length !== 3) throw new Error("Expected two root version fields in lockfile");
const newPkg = pkgText.replace(previous, updated);
const newLock = lockText.replace(previous, updated).replace(previous, updated);
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const anchor = `---\n\n## v${oldVersion}`;
if (changelog.split(anchor).length !== 2) {
  throw new Error("Cannot locate the latest CHANGELOG.md entry");
}
const safeNote = note.replace(/\r/g, " ").replace(/\s+/g, " ");
const entry = `## v${nextVersion} — ${date} (actualización de FrameLogic)\n\n- ${safeNote}\n\n---\n\n`;
const newChangelog = changelog.replace(anchor, `---\n\n${entry}## v${oldVersion}`);

// Validate everything before modifying any file.
const parsedLock = JSON.parse(newLock);
if (JSON.parse(newPkg).version !== nextVersion ||
    parsedLock.version !== nextVersion ||
    parsedLock.packages?.[""]?.version !== nextVersion) {
  throw new Error("Generated version files are inconsistent");
}
write("package.json", newPkg);
write("package-lock.json", newLock);
write("CHANGELOG.md", newChangelog);
process.stdout.write(`FrameLogic ${oldVersion} -> ${nextVersion}; changelog actualizado.\n`);
