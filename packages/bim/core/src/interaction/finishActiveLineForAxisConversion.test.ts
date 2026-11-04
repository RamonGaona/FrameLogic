import { describe, expect, it, vi } from "vitest";
import { finishActiveLineForAxisConversion } from "./finishActiveLineForAxisConversion";

describe("LINE -> eje without Escape", () => {
  it("finishes active LINE without deleting its geometry and selects the last completed segment", () => {
    let activeCommandId: string | null = "LINE";
    const events: string[] = [];
    const commands = { get activeCommandId() { return activeCommandId; }, cancelActive: vi.fn(() => {
      events.push("cancel"); activeCommandId = null;
    }) };
    const selectSingle = vi.fn((id: string) => events.push("select:" + id));
    finishActiveLineForAxisConversion(commands, { lastCompletedLineId: "line-2" }, { selectSingle }, id => id === "line-2");
    expect(commands.cancelActive).toHaveBeenCalledOnce();
    expect(selectSingle).toHaveBeenCalledWith("line-2");
    expect(events).toEqual(["cancel", "select:line-2"]);
  });
  it("does not convert the unfinished preview if no line segment was completed", () => {
    const cancelActive = vi.fn(); const selectSingle = vi.fn();
    finishActiveLineForAxisConversion({ activeCommandId: "LINE", cancelActive }, { lastCompletedLineId: null }, { selectSingle }, () => true);
    expect(cancelActive).toHaveBeenCalledOnce();
    expect(selectSingle).not.toHaveBeenCalled();
  });
  it("does nothing if LINE was already finished and user selected a different CAD line", () => {
    const cancelActive = vi.fn(); const selectSingle = vi.fn();
    finishActiveLineForAxisConversion({ activeCommandId: null, cancelActive }, { lastCompletedLineId: "old" }, { selectSingle }, () => true);
    expect(cancelActive).not.toHaveBeenCalled();
    expect(selectSingle).not.toHaveBeenCalled();
  });
});
