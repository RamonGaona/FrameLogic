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
