import { describe, expect, it } from "vitest";
import config from "../apps/web/vite.config";

/**
 * Browser regression for the real "na is not a DXF subclass" report:
 * acad-ts looks up DXF metadata using JS class constructor.name at runtime.
 * Unlike Node/Vitest, Vite/Rolldown production bundles rename these classes
 * unless keepNames is set both in main build and separately for Web Workers.
 */
describe("alternate DWG decoder in production", () => {
  it("preserves DXF class names in the site bundle AND the CAD Web Worker", () => {
    const value = config as unknown as {
      build: { rolldownOptions: { output: { keepNames: boolean } } };
      worker: { rolldownOptions: { output: { keepNames: boolean } } };
    };
    expect(value.build.rolldownOptions.output.keepNames).toBe(true);
    expect(value.worker.rolldownOptions.output.keepNames).toBe(true);
  });
});
