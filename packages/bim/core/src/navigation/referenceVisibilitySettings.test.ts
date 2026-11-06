import { describe, expect, it } from "vitest";
import {
  parseReferenceVisibilityPreferences,
  serializeReferenceVisibilityPreferences,
} from "./referenceVisibilitySettings";

describe("general reference display preferences", () => {
  it("defaults both helper groups to hidden", () => {
    expect(parseReferenceVisibilityPreferences(null)).toEqual({
      showSnaps: false, showAxes: false,
    });
  });
  it("restores the two independent options after a page reload", () => {
    const saved = serializeReferenceVisibilityPreferences({
      showSnaps: true, showAxes: false,
    });
    expect(parseReferenceVisibilityPreferences(saved)).toEqual({
      showSnaps: true, showAxes: false,
    });
  });
  it("discards corrupt or unexpected stored values safely", () => {
    expect(parseReferenceVisibilityPreferences("{")).toEqual({
      showSnaps: false, showAxes: false,
    });
    expect(parseReferenceVisibilityPreferences("[]")).toEqual({
      showSnaps: false, showAxes: false,
    });
    expect(parseReferenceVisibilityPreferences('{"showSnaps":"true","showAxes":1}')).toEqual({
      showSnaps: false, showAxes: false,
    });
  });
});
