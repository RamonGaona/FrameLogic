import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname ?? process.cwd(), "..");
const sourceDir = resolve(root, "node_modules/dwgdxf/dist/wasm");
const publicDir = resolve(root, "apps/web/public/assets/wasm");
const files = ["dwgdxf.js", "dwgdxf_bg.wasm"];

describe("DWG WASM assets in Cloudflare Pages/Vite", () => {
  it("copies the runtime glue and binary exactly (not via an unresolved dynamic import)", () => {
    execFileSync(process.execPath, [resolve(root, "scripts/syncDwgWasmAssets.mjs")],
      { cwd: root, stdio: "pipe" });
    for (const name of files) {
      const original = readFileSync(resolve(sourceDir, name));
      const published = readFileSync(resolve(publicDir, name));
      expect(published.length).toBeGreaterThan(0);
      expect(published.equals(original)).toBe(true);
      expect(statSync(resolve(publicDir, name)).size).toBe(original.length);
    }
  });

  it("runs the asset copy for both production builds and local dev", () => {
    const web = JSON.parse(readFileSync(resolve(root, "apps/web/package.json"), "utf8"));
    expect(web.scripts.prebuild).toMatch(/syncDwgWasmAssets/);
    expect(web.scripts.predev).toMatch(/syncDwgWasmAssets/);
  });
});
