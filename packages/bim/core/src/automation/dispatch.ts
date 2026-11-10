import { toolSchemas, type ToolName, type OperationResult } from "../../../../contracts/src/automation";
import type { ModelOperations, Proposal, CommandsProposal } from "./ModelOperations";
import type { AssemblyProposal } from "./AssemblyAutomation";

/** Browser owns approval. Agent never receives a bypass flag. */
export function createOperationDispatcher(ops: ModelOperations, approve: (summary: unknown) => boolean | Promise<boolean>) {
  let proposal: Proposal | undefined;
  let commandsProposal: CommandsProposal | undefined;
  let assemblyProposal: AssemblyProposal | undefined;
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
        case "query_objects": data = ops.queryObjects(toolSchemas.query_objects.parse(a)); break;
        case "describe_object": data = ops.describeObject(toolSchemas.describe_object.parse(a).id); break;
        case "list_assemblies": data = ops.listAssemblies(toolSchemas.list_assemblies.parse(a).limit); break;
        case "get_selection_context": data = ops.getSelectionContext(); break;
        case "select_assembly": {
          if (!await approve({ operation: tool, ...a })) throw new Error("User declined assembly selection");
          data = ops.selectAssembly(toolSchemas.select_assembly.parse(a).id);
          break;
        }
        case "prepare_assembly_operation":
          proposal = undefined; commandsProposal = undefined;
          assemblyProposal = ops.prepareAssembly(toolSchemas.prepare_assembly_operation.parse(a).request);
          data = assemblyProposal;
          break;
        case "confirm_assembly_operation": {
          const { proposalId } = toolSchemas.confirm_assembly_operation.parse(a);
          if (!assemblyProposal || assemblyProposal.id !== proposalId)
            throw new Error("Prepare the assembly in this session first");
          const summary = assemblyProposal;
          assemblyProposal = undefined; // one-shot regardless of approval
          if (!await approve(summary)) throw new Error("User declined assembly operation");
          data = ops.confirmAssembly(proposalId);
          break;
        }
        case "prepare_operation":
          assemblyProposal = undefined;
          commandsProposal = undefined;
          proposal = ops.prepare(toolSchemas.prepare_operation.parse(a).request); data = proposal; break;
        case "prepare_commands":
          assemblyProposal = undefined;
          proposal = undefined;
          commandsProposal = ops.prepareCommands(toolSchemas.prepare_commands.parse(a).commands);
          data = commandsProposal;
          break;
        case "confirm_operation": {
          const { proposalId } = toolSchemas.confirm_operation.parse(a);
          if (!proposal || proposal.id !== proposalId) throw new Error("Prepare a proposal in this session first");
          const summary = proposal; proposal = undefined;
          if (!await approve(summary)) throw new Error("User declined operation");
          data = ops.confirm(proposalId); break;
        }
        case "confirm_commands": {
          const { proposalId } = toolSchemas.confirm_commands.parse(a);
          if (!commandsProposal || commandsProposal.id !== proposalId)
            throw new Error("Prepare a command sequence in this session first");
          const summary = commandsProposal;
          commandsProposal = undefined;
          if (!await approve(summary)) throw new Error("User declined command sequence");
          data = ops.confirmCommands(proposalId);
          break;
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
