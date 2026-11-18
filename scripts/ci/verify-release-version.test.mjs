import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions, verifyReleaseFiles } from "./verify-release-version.mjs";

const files = (version, lockVersion = version, changelogVersion = version) => [
  JSON.stringify({ name: "framelogic", version }),
  JSON.stringify({ version: lockVersion, packages: { "": { version: lockVersion } } }),
  `# Changelog\n\n## v${changelogVersion} — 2026-11-18 (cambio)\n\n- Cambio documentado.\n\n---\n`,
];

test("numeric patch comparisons are not lexicographical", () => {
  assert.equal(compareVersions("0.1.184", "0.1.183"), 1);
  assert.equal(compareVersions("0.1.100", "0.1.99"), 1);
  assert.equal(compareVersions("0.1.184", "0.1.184"), 0);
  assert.equal(compareVersions("0.1.183", "0.1.184"), -1);
});

test("validates synchronized release files", () => {
  assert.equal(verifyReleaseFiles(...files("0.1.184")), "0.1.184");
  assert.throws(() => verifyReleaseFiles(...files("0.1.184", "0.1.183")), /must match/);
  assert.throws(() => verifyReleaseFiles(...files("0.1.184", "0.1.184", "0.1.183")), /heading must match/);
});

test("rejects an empty changelog entry", () => {
  const [pkg, lock] = files("0.1.184");
  assert.throws(() => verifyReleaseFiles(pkg, lock, "# Changelog\n\n## v0.1.184 — 2026-11-18\n\n---\n"), /describe/);
});
