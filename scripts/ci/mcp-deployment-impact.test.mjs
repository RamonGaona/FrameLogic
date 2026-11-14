import test from "node:test";
import assert from "node:assert/strict";
import { affectsMcpDeployment, manifestsDiffer } from "./mcp-deployment-impact.mjs";

test("root version bump does not trigger MCP", () => {
  const packageBefore = JSON.stringify({ name: "framelogic", version: "0.1.156", workspaces: ["apps/*"] });
  const packageAfter = JSON.stringify({ name: "framelogic", version: "0.1.157", workspaces: ["apps/*"] });
  const lockBefore = JSON.stringify({ version: "0.1.156", packages: { "": { version: "0.1.156" }, "apps/mcp": { version: "0.1.0" } } });
  const lockAfter = JSON.stringify({ version: "0.1.157", packages: { "": { version: "0.1.157" }, "apps/mcp": { version: "0.1.0" } } });
  assert.equal(manifestsDiffer(packageBefore, packageAfter, "package.json"), false);
  assert.equal(manifestsDiffer(lockBefore, lockAfter, "package-lock.json"), false);
  assert.equal(affectsMcpDeployment(["package.json", "package-lock.json", "packages/bim/core/src/drawing/SheetAssemblyBom.ts"],
    (which, path) => (path === "package.json"
      ? which === "before" ? packageBefore : packageAfter
      : which === "before" ? lockBefore : lockAfter)), false);
});

test("dependency updates and MCP contracts must trigger deployment", () => {
  assert.equal(manifestsDiffer('{"version":"1","dependencies":{"zod":"^4"}}',
    '{"version":"2","dependencies":{"zod":"^5"}}', "package.json"), true);
  assert.equal(affectsMcpDeployment(["packages/contracts/src/automation.ts"], () => null), true);
  assert.equal(affectsMcpDeployment(["apps/mcp/src/remote.ts"], () => null), true);
  assert.equal(affectsMcpDeployment(["package-lock.json"],
    (which) => which === "before"
      ? '{"version":"1","packages":{"":{"version":"1"},"node_modules/zod":{"version":"4"}}}'
      : '{"version":"2","packages":{"":{"version":"2"},"node_modules/zod":{"version":"5"}}}'), true);
});

test("unrelated drawing changes do not deploy MCP", () => {
  assert.equal(affectsMcpDeployment(["packages/bim/core/src/drawing/GeneralPdfController.ts"], () => null), false);
  assert.equal(manifestsDiffer("{", "{}", "package.json"), true);
});

test("drawing tests and version changes are not MCP runtime changes", () => {
  const before = JSON.stringify({
    name: "framelogic", version: "0.1.160",
    scripts: { "test:drawings": "vitest old", build: "vite build", "mcp:deploy": "wrangler deploy" },
  });
  const after = JSON.stringify({
    name: "framelogic", version: "0.1.161",
    scripts: { "test:drawings": "vitest with new tests", build: "vite build", "mcp:deploy": "wrangler deploy" },
  });
  assert.equal(manifestsDiffer(before, after, "package.json"), false);
  assert.equal(affectsMcpDeployment(["package.json",
    "packages/bim/core/src/drawing/AssemblyViewOrientationControls.ts",
    "scripts/ci/mcp-deployment-impact.mjs"], (which) =>
      which === "before" ? before : after), false);
});

test("MCP deployment scripts and installation lifecycle scripts still trigger worker checks", () => {
  const base = { version: "0.1.161", scripts: {
    "mcp:deploy": "wrangler deploy", postinstall: "node setup.js",
  } };
  assert.equal(manifestsDiffer(JSON.stringify(base), JSON.stringify({
    ...base, scripts: { ...base.scripts, "mcp:deploy": "wrangler deploy --new-option" },
  }), "package.json"), true);
  assert.equal(manifestsDiffer(JSON.stringify(base), JSON.stringify({
    ...base, scripts: { ...base.scripts, postinstall: "node another-setup.js" },
  }), "package.json"), true);
  assert.equal(affectsMcpDeployment([".github/workflows/mcp-deploy.yml"], () => null), true);
});
