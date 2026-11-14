import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("FrameLogic deployed version badge", () => {
  it("uses the Vite-injected root package version instead of a literal badge number", () => {
    const badge = read("../packages/bim/core/src/navigation/BuildVersionBadgeController.ts");
    const vite = read("../apps/web/vite.config.ts");
    expect(badge).toContain("typeof __FRAMELOGIC_VERSION__");
    expect(badge).toContain("? __FRAMELOGIC_VERSION__");
    expect(badge).not.toMatch(/const FRAMELOGIC_VERSION\s*=\s*["']\d+\.\d+\.\d+/);
    expect(vite).toContain("__FRAMELOGIC_VERSION__: JSON.stringify(appVersion)");
    expect(vite).toContain("packageJson.version");
  });

  it("keeps the root package and lockfile release versions in sync", () => {
    const pkg = JSON.parse(read("../package.json")) as { version: string };
    const lock = JSON.parse(read("../package-lock.json")) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""]?.version).toBe(pkg.version);
    const changelog = read("../CHANGELOG.md");
    const latest = changelog.match(/^## v(\d+\.\d+\.\d+)\s+—/m);
    expect(latest?.[1]).toBe(pkg.version);
  });
});
