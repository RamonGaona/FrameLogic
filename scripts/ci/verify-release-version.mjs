/**
 * Every PR / push to main must increase the root app version and update
 * CHANGELOG.md and package-lock.json. A manual run still verifies consistency.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function compareVersions(a, b) {
  const parse = v => {
    if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`Invalid release version: ${v}`);
    return v.split(".").map(Number);
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  }
  return 0;
}

export function verifyReleaseFiles(pkgText, lockText, changelogText) {
  const pkg = JSON.parse(pkgText);
  const lock = JSON.parse(lockText);
  const latest = changelogText.match(/^## v(\d+\.\d+\.\d+)\s+—[^\n]*\n/m);
  compareVersions(pkg.version, "0.0.0");
  if (pkg.version !== lock.version || pkg.version !== lock.packages?.[""]?.version) {
    throw new Error("package.json and both root package-lock.json versions must match");
  }
  if (latest?.[1] !== pkg.version) throw new Error("Latest CHANGELOG.md heading must match package.json version");
  const releaseBody = changelogText.slice(latest.index + latest[0].length).split(/\r?\n---\r?\n/)[0];
  if (!/^- \S.+/m.test(releaseBody)) throw new Error("Latest CHANGELOG.md release must describe at least one change");
  return pkg.version;
}

export function verifyAgainstBase(baseSha, version) {
  if (!baseSha || /^0+$/.test(baseSha)) return;
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const previous = JSON.parse(git("show", `${baseSha}:package.json`)).version;
  if (compareVersions(version, previous) <= 0) {
    throw new Error(`Every change must increase FrameLogic version: base ${previous}, current ${version}. Run npm run version:patch -- "Descripción".`);
  }
  const changed = new Set(git("diff", "--name-only", baseSha, "HEAD").split("\n").filter(Boolean));
  for (const path of ["package.json", "package-lock.json", "CHANGELOG.md"]) {
    if (!changed.has(path)) throw new Error(`Missing mandatory release file change: ${path}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = path => readFileSync(path, "utf8");
  const version = verifyReleaseFiles(
    read("package.json"), read("package-lock.json"), read("CHANGELOG.md"),
  );
  verifyAgainstBase(process.env.RELEASE_BASE_SHA, version);
  process.stdout.write(`FrameLogic v${version}: versión y changelog correctos.\n`);
}
