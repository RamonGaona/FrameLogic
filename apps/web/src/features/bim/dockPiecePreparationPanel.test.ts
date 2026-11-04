import { describe, expect, it, vi } from "vitest";
import { dockPiecePreparationPanel } from "./dockPiecePreparationPanel";

function fixture() {
  const panel = {
    parentElement: null as unknown,
    style: {} as Record<string, string>,
  } as unknown as HTMLElement;

  const makeParent = () => {
    const parent = {
      appendChild: vi.fn((child: HTMLElement) => {
        Object.assign(child, { parentElement: parent });
        return child;
      }),
    };
    return parent as unknown as HTMLElement;
  };
  return { panel, body: makeParent(), stack: makeParent() };
}

describe("FrameLogic piece preparation editor layout", () => {
  it("undocks the editable SNAP/axis panel from the hidden Model Space stack", () => {
    const { panel, body, stack } = fixture();
    dockPiecePreparationPanel(panel, stack, false);
    expect(panel.parentElement).toBe(stack);

    dockPiecePreparationPanel(panel, body, true);
    expect(panel.parentElement).toBe(body);
    expect(panel.style.position).toBe("fixed");
    expect(panel.style.zIndex).toBe("140");
    expect(panel.style.pointerEvents).toBe("auto");
    expect(panel.style.overflowY).toBe("auto");
  });

  it("restores the panel into the normal stack when leaving isolated piece editing", () => {
    const { panel, body, stack } = fixture();
    dockPiecePreparationPanel(panel, body, true);
    dockPiecePreparationPanel(panel, stack, false);
    expect(panel.parentElement).toBe(stack);
    expect(panel.style.position).toBe("relative");
    expect(panel.style.left).toBe("auto");
    expect(panel.style.width).toBe("100%");
  });

  it("does not needlessly reparent the panel on every layout update", () => {
    const { panel, body } = fixture();
    dockPiecePreparationPanel(panel, body, true);
    dockPiecePreparationPanel(panel, body, true);
    expect(body.appendChild).toHaveBeenCalledOnce();
  });
});
