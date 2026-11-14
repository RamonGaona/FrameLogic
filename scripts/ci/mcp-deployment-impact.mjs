/**
 * Gate the expensive MCP worker deployment on meaningful changes.
 * GitHub path filters still start this lightweight job for root lockfile edits;
 * version-only bumps must not reinstall/build/deploy MCP.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function manifestsDiffer(beforeText, afterText, path) {
  if (beforeText === afterText) return false;
  if (!beforeText || !afterText) return true;
  try {
    const before = JSON.parse(beforeText);
    const after = JSON.parse(afterText);
    if (path === "package.json") {
      delete before.version;
      delete after.version;
    } else if (path === "package-lock.json") {
      delete before.version;
      delete after.version;
      if (before.packages?.[""]) delete before.packages[""].version;
      if (after.packages?.[""]) delete after.packages[""].version;
    }
    return JSON.stringify(before) !== JSON.stringify(after);
  } catch {
    // Do not silently skip deployment when a manifest is invalid.
    return true;
  }
}

export function affectsMcpDeployment(paths, readAt) {
  for (const path of paths) {
    if (path.startsWith("apps/mcp/")
      || path.startsWith("packages/contracts/")
      || path === ".github/workflows/mcp-deploy.yml"
      || path === "scripts/ci/mcp-deployment-impact.mjs") return true;
    if (path === "package.json" || path === "package-lock.json") {
      if (manifestsDiffer(readAt("before", path), readAt("after", path), path)) return true;
    }
  }
  return false;
}

export function changedBetween(before, after) {
  if (!before || /^0+$/.test(before) || !after) return true;
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  try {
    const changed = git("diff", "--name-only", before, after).trim().split("\n").filter(Boolean);
    return affectsMcpDeployment(changed, (which, path) => {
      try { return git("show", `${which === "before" ? before : after}:${path}`); }
      catch { return null; }
    });
  } catch {
    // Missing history or diff error: fail open, never leave the remote MCP stale.
    return true;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const deploy = process.env.GITHUB_EVENT_NAME === "workflow_dispatch"
    || changedBetween(process.env.GITHUB_EVENT_BEFORE, process.env.GITHUB_SHA);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${Boolean(deploy)}\n`);
  }
  process.stdout.write(`Remote MCP affected: ${Boolean(deploy)}\n`);
}
