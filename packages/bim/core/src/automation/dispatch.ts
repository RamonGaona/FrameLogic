import { toolSchemas, type ToolName, type OperationResult } from "../../../../contracts/src/automation";
import type { ModelOperations, Proposal } from "./ModelOperations";

/** Browser owns approval. Agent never receives a bypass flag. */
export function createOperationDispatcher(ops: ModelOperations, approve: (summary: unknown) => boolean | Promise<boolean>) {
  let proposal: Proposal | undefined;
  return async (tool: ToolName, args: unknown): Promise<OperationResult> => {
    try {
      if (!(tool in toolSchemas)) throw new Error("Unknown tool");
      const a = toolSchemas[tool].parse(args);
      let data: object;
      switch (tool) {
        case "get_model_info": data = ops.getModelInfo(); break;
        case "list_pieces": data = ops.listPieces(); break;
        case "get_piece": data = ops.getPiece((a as {id:string}).id); break;
        case "list_piece_snaps": data = { snaps: ops.listPieceSnaps((a as {id:string}).id) }; break;
        case "get_piece_axes": data = ops.getPieceAxes((a as {id:string}).id); break;
        case "prepare_operation":
          proposal = ops.prepare(toolSchemas.prepare_operation.parse(a).request); data = proposal; break;
        case "confirm_operation": {
          const { proposalId } = toolSchemas.confirm_operation.parse(a);
          if (!proposal || proposal.id !== proposalId) throw new Error("Prepare a proposal in this session first");
          const summary = proposal; proposal = undefined;
          if (!await approve(summary)) throw new Error("User declined operation");
          data = ops.confirm(proposalId); break;
        }
        case "select_pieces":
          if (!await approve({ operation: tool, ...a })) throw new Error("User declined selection");
          data = ops.selectPieces(toolSchemas.select_pieces.parse(a).ids); break;
        case "undo": case "redo":
          if (!await approve({ operation: tool, scope: "latest shared CAD history entry" })) throw new Error("User declined history operation");
          data = tool === "undo" ? ops.undo() : ops.redo(); break;
      }
      return { ok: true, data: data as Record<string, unknown> };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  };
}
