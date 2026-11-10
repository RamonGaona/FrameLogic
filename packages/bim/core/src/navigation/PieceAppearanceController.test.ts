import { afterEach, describe, expect, it, vi } from "vitest";
import { PieceAppearanceController } from "./PieceAppearanceController";
import { findInstanceTreeBody } from "./findInstanceTreeBody";

vi.mock("./findInstanceTreeBody", () => ({
  findInstanceTreeBody: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("individual eyes after INSTANCIAS reparenting", () => {
  it("finds assembly and piece rows by model IDs, not visible names", () => {
    const assemblyRow = {
      dataset: { framelogicAssemblyId: "assembly-1" },
    } as unknown as HTMLDivElement;
    const groupedPiece = {
      dataset: { framelogicPieceId: "piece-grouped" },
    } as unknown as HTMLDivElement;
    const loosePiece = {
      dataset: { framelogicPieceId: "piece-loose" },
    } as unknown as HTMLDivElement;
    const querySelectorAll = vi.fn((selector: string) =>
      selector === "div[data-framelogic-assembly-id]"
        ? [assemblyRow]
        : selector === "div[data-framelogic-piece-id]"
          ? [groupedPiece, loosePiece]
          : [],
    );
    vi.mocked(findInstanceTreeBody).mockReturnValue({
      querySelectorAll,
    } as unknown as HTMLElement);

    // The parent of the real tree can be document.body, NOT the
    // PieceAppearanceController's original viewport container.
    const viewportContainer = {} as HTMLElement;
    const controller = Object.create(
      PieceAppearanceController.prototype,
    ) as {
      decorateRows(): void;
      ensureAssemblyVisibilityEye: ReturnType<typeof vi.fn>;
      ensurePieceVisibilityEye: ReturnType<typeof vi.fn>;
    };
    Object.assign(controller, {
      options: {
        container: viewportContainer,
        designModel: {
          assemblies: { get: (id: string) => id === "assembly-1" ? {} : undefined },
          pieceInstances: {
            get: (id: string) => id.startsWith("piece-") ? {} : undefined,
          },
        },
      },
      ensureAssemblyVisibilityEye: vi.fn(),
      ensurePieceVisibilityEye: vi.fn(),
    });

    controller.decorateRows();
    expect(findInstanceTreeBody).toHaveBeenCalledWith(viewportContainer);
    expect(controller.ensureAssemblyVisibilityEye)
      .toHaveBeenCalledWith(assemblyRow, "assembly-1");
    expect(controller.ensurePieceVisibilityEye)
      .toHaveBeenCalledWith(groupedPiece, "piece-grouped");
    expect(controller.ensurePieceVisibilityEye)
      .toHaveBeenCalledWith(loosePiece, "piece-loose");
    expect(controller.ensurePieceVisibilityEye).toHaveBeenCalledTimes(2);
  });
});
