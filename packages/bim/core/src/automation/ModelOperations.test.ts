import { describe, it, expect, vi } from "vitest";
import { createAutomationFixture } from "./fixture";
import { createOperationDispatcher } from "./dispatch";
const request = { operation:"copy_piece_array" as const, id:"REC1500-instance", space:"local" as const,
  direction:{x:1,y:0,z:0}, distance:1500, count:4 };
describe("model automation with real domain and shared CAD history", () => {
  it("copies REC1500 four times along its rotated FrameLogic longitudinal axis, undo/redo atomically", () => {
    const {operations:o, model, history} = createAutomationFixture();
    o.selectPieces([request.id]);
    const original = structuredClone(model.pieceInstances.get(request.id));
    expect(o.getPieceAxes(request.id).x.x).toBeCloseTo(-1);
    expect(o.getPieceAxes(request.id).origin).toEqual({x:80,y:210,z:330});
    expect(o.listPieceSnaps(request.id)[0]!.worldPosition.x).toBeCloseTo(-1420);
    const preview = o.prepare(request);
    expect(model.pieceInstances.count).toBe(1);
    expect(preview.targets.map(t => t.position.x)).toEqual([-1400,-2900,-4400,-5900]);
    const {affectedIds} = o.confirm(preview.id);
    expect(affectedIds).toHaveLength(4);
    expect(new Set(affectedIds).size).toBe(4);
    expect(model.pieceInstances.get(request.id)).toEqual(original);
    for (const id of affectedIds) {
      const p = model.pieceInstances.get(id)!;
      expect(p.definitionId).toBe(original!.definitionId); expect(p.tags).toEqual(original!.tags);
      expect(p.layerId).toBe(original!.layerId); expect(p.transform.rotation).toEqual(original!.transform.rotation);
      expect(p.transform.position.y).toBeCloseTo(200);
    }
    expect(model.assets.getAll()).toHaveLength(1); expect(model.pieceDefinitions.getAll()).toHaveLength(1);
    expect(o.undo().changed).toBe(true); expect(model.pieceInstances.count).toBe(1); expect(history.canUndo).toBe(false);
    expect(o.redo().changed).toBe(true); expect(model.pieceInstances.getAll().slice(1).map(p=>p.id)).toEqual(affectedIds);
  });
  it("moves the FrameLogic origin to world position and supports local displacement", () => {
    const {operations:o} = createAutomationFixture();
    const p=o.prepare({operation:"move_piece", id:request.id, space:"world", position:{x:0,y:0,z:0}});
    o.confirm(p.id); expect(o.getPieceAxes(request.id).origin.x).toBeCloseTo(0);
    expect(o.getPieceAxes(request.id).origin.y).toBeCloseTo(0);
    expect(o.getPieceAxes(request.id).origin.z).toBeCloseTo(0);
    o.undo();
    o.confirm(o.prepare({operation:"move_piece", id:request.id, space:"local", displacement:{x:1500,y:0,z:0}}).id);
    expect(o.getPiece(request.id).instance.transform.position.x).toBeCloseTo(-1400);
    o.undo(); expect(o.getPiece(request.id).instance.transform.position.x).toBe(100);
  });
  it.each([
    {...request,id:"missing"}, {...request,direction:{x:0,y:0,z:0}},
    {...request,distance:NaN}, {...request,distance:-1}, {...request,count:101},
    {...request,direction:{x:Infinity,y:0,z:0}},
  ])("rejects invalid requests without mutation", r => {
    const {operations:o,model,history}=createAutomationFixture();
    expect(()=>o.prepare(r)).toThrow(); expect(model.pieceInstances.count).toBe(1); expect(history.canUndo).toBe(false);
  });
  it("rejects stale, replayed and externally altered previews", () => {
    const {operations:o,model}=createAutomationFixture();
    const p=o.prepare(request); Reflect.set(p.targets[0]!.position,"x",999);
    o.confirm(p.id); expect(model.pieceInstances.getAll()[1]!.transform.position.x).toBe(-1400);
    expect(()=>o.confirm(p.id)).toThrow();
    const next=o.prepare(request); model.pieceInstances.updateName(request.id,"changed");
    expect(()=>o.confirm(next.id)).toThrow(/changed/);
  });
  it("rolls back failed creation and records no history", () => {
    const {operations:o,model,history}=createAutomationFixture();
    const register=model.registerPieceInstance.bind(model); let n=0;
    vi.spyOn(model,"registerPieceInstance").mockImplementation(input=>{if(++n===3) throw Error("injected failure");return register(input);});
    expect(()=>o.confirm(o.prepare(request).id)).toThrow(/injected/);
    expect(model.pieceInstances.count).toBe(1); expect(history.canUndo).toBe(false);
    expect(o.audit.at(-1)?.success).toBe(false);
  });
  it("rejects locked layers and requires human approval at dispatch", async () => {
    const {operations:o,model}=createAutomationFixture();
    const dispatch=createOperationDispatcher(o,()=>false);
    const p=await dispatch("prepare_operation",{request});
    expect((await dispatch("confirm_operation",{proposalId:p.data!.id})).ok).toBe(false);
    expect(model.pieceInstances.count).toBe(1);
    model.layers.update("geometry",{locked:true}); expect(()=>o.prepare(request)).toThrow(/locked/);
  });
  it("returns copies of metadata and rejects unknown fields", async () => {
    const {operations:o}=createAutomationFixture();
    const piece=o.getPiece(request.id); Reflect.set(piece.instance.transform.position,"x",999);
    expect(o.getPiece(request.id).instance.transform.position.x).toBe(100);
    const dispatch=createOperationDispatcher(o,()=>true);
    expect((await dispatch("prepare_operation",{request:{...request,executeCode:"bad"}})).ok).toBe(false);
  });
});

describe("history failures", () => {
  it("keeps a failed undo/redo entry retryable", () => {
    const {history}=createAutomationFixture(); let fail=true;
    history.recordOperation("test",()=>{if(fail)throw Error("undo failed");},()=>{if(fail)throw Error("redo failed");});
    expect(()=>history.undo()).toThrow(); expect(history.canUndo).toBe(true); expect(history.canRedo).toBe(false);
    fail=false; history.undo(); fail=true;
    expect(()=>history.redo()).toThrow(); expect(history.canRedo).toBe(true); expect(history.canUndo).toBe(false);
    fail=false; expect(history.redo()).toBe(true);
  });
  it("rolls back a failed redo without losing the history entry", () => {
    const {operations:o,model,history}=createAutomationFixture();
    o.confirm(o.prepare(request).id); o.undo();
    const register=model.registerPieceInstance.bind(model);let n=0;
    const spy=vi.spyOn(model,"registerPieceInstance").mockImplementation(input=>{if(++n===2)throw Error("redo failure");return register(input);});
    expect(()=>o.redo()).toThrow(); expect(model.pieceInstances.count).toBe(1); expect(history.canRedo).toBe(true);
    spy.mockRestore();o.redo();expect(model.pieceInstances.count).toBe(5);
  });
});

const moveLocal = (distance: number) => ({
  operation: "move_piece" as const, id: "REC1500-instance",
  space: "local" as const, displacement: { x: distance, y: 0, z: 0 },
});
const copyLocal = (distance: number, count: number) => ({
  operation: "copy_piece_array" as const, id: "REC1500-instance",
  space: "local" as const, direction: { x: 1, y: 0, z: 0 },
  distance, count,
});

describe("Stage 3: read-only model queries", () => {
  it("filters by id, name/code and selection, with explicit missing visual bounds", () => {
    const { operations: ops } = createAutomationFixture();
    expect(ops.queryObjects({ search: "REC1500" }).total).toBe(1);
    expect(ops.queryObjects({ ids: ["REC1500-instance"] }).objects[0]?.id).toBe("REC1500-instance");
    expect(ops.queryObjects({ ids: ["unknown"] }).total).toBe(0);
    expect(ops.queryObjects({ selectedOnly: true }).total).toBe(0);
    ops.selectPieces(["REC1500-instance"]);
    const result = ops.queryObjects({ selectedOnly: true, limit: 1 });
    expect(result.total).toBe(1);
    expect(result.objects[0]?.selected).toBe(true);
    expect(result.objects[0]?.boundsMm).toBeNull();
    const detail = ops.describeObject("REC1500-instance");
    expect(detail.axes.x.x).toBeCloseTo(-1);
    expect(detail.snaps).toHaveLength(1);
    expect(detail.boundsPrecision).toBe("UNAVAILABLE");
    expect(() => ops.describeObject("unknown")).toThrow(/not found/);
    expect(() => ops.queryObjects({ limit: 101 })).toThrow(/limit/);
    expect(() => ops.queryObjects({ ids: Array.from({ length: 101 }, (_, i) => "x" + i) })).toThrow(/100/);
  });

  it("reads detailed-model bounds through the optional geometry port", () => {
    const fixture = createAutomationFixture();
    Object.assign(fixture.ports, {
      getInstanceBounds: () => ({
        min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 20, z: 30 },
      }),
    });
    const object = fixture.operations.describeObject("REC1500-instance");
    expect(object.boundsMm?.max.y).toBe(20);
    expect(object.boundsPrecision).toBe("DETAIL_GEOMETRY");
  });
});

describe("Stage 3: bounded command sequences with one history entry", () => {
  it("simulates sequential move + copy from the moved source, atomically undo/redo", () => {
    const { operations: ops, model, history } = createAutomationFixture();
    const requests = [moveLocal(200), copyLocal(1500, 2), moveLocal(100)];
    const preview = ops.prepareCommands(requests);
    expect(preview.steps).toHaveLength(3);
    expect(preview.copyCount).toBe(2);
    expect(model.pieceInstances.count).toBe(1);
    expect(preview.steps[0]?.targets[0]?.position.x).toBeCloseTo(-100);
    expect(preview.steps[1]?.targets.map(p => p.position.x)).toEqual([-1600, -3100]);
    expect(preview.steps[2]?.targets[0]?.position.x).toBeCloseTo(-200);
    preview.steps[0]!.targets[0]!.position.x = 99999; // Caller must not alter accepted proposal.
    const response = ops.confirmCommands(preview.id);
    expect(response.operationCount).toBe(3);
    expect(response.movedIds).toEqual(["REC1500-instance"]);
    expect(response.createdIds).toHaveLength(2);
    expect(model.pieceInstances.get("REC1500-instance")!.transform.position.x).toBeCloseTo(-200);
    expect(model.pieceInstances.count).toBe(3);
    expect(history.canUndo).toBe(true);
    expect(ops.undo().changed).toBe(true);
    expect(history.canUndo).toBe(false); // Exactly one undo entry.
    expect(model.pieceInstances.get("REC1500-instance")!.transform.position.x).toBeCloseTo(100);
    expect(model.pieceInstances.count).toBe(1);
    expect(ops.redo().changed).toBe(true);
    expect(model.pieceInstances.count).toBe(3);
    expect(model.pieceInstances.getAll().slice(1).map(p => p.id)).toEqual(response.createdIds);
    expect(() => ops.confirmCommands(preview.id)).toThrow(/missing/);
  });

  it("rejects stale batches, too many commands or >100 generated instances", () => {
    const { operations: ops, model } = createAutomationFixture();
    expect(() => ops.prepareCommands([])).toThrow(/1–12/);
    expect(() => ops.prepareCommands(Array(13).fill(moveLocal(1)))).toThrow(/1–12/);
    expect(() => ops.prepareCommands([copyLocal(1, 100), copyLocal(1, 1)])).toThrow(/100 copies/);
    const proposal = ops.prepareCommands([moveLocal(100), copyLocal(200, 2)]);
    model.pieceInstances.updateName("REC1500-instance", "changed");
    expect(() => ops.confirmCommands(proposal.id)).toThrow(/changed/);
    expect(model.pieceInstances.count).toBe(1);
  });

  it("restores moved pieces if a later copy fails and leaves no history entry", () => {
    const { operations: ops, model, history } = createAutomationFixture();
    const proposal = ops.prepareCommands([moveLocal(300), copyLocal(100, 3)]);
    const register = model.registerPieceInstance.bind(model);
    let calls = 0;
    const spy = vi.spyOn(model, "registerPieceInstance").mockImplementation(input => {
      if (++calls === 2) throw new Error("injected staged copy failure");
      return register(input);
    });
    expect(() => ops.confirmCommands(proposal.id)).toThrow(/injected staged/);
    spy.mockRestore();
    expect(model.pieceInstances.count).toBe(1);
    expect(model.pieceInstances.get("REC1500-instance")!.transform.position.x).toBeCloseTo(100);
    expect(history.canUndo).toBe(false);
  });

  it("requires browser approval and never replays a declined script", async () => {
    const { operations: ops, model } = createAutomationFixture();
    const approved = vi.fn(() => false);
    const dispatch = createOperationDispatcher(ops, approved);
    const prepared = await dispatch("prepare_commands", {
      commands: [moveLocal(100), copyLocal(100, 2)],
    });
    expect(prepared.ok).toBe(true);
    expect(model.pieceInstances.count).toBe(1);
    const proposalId = prepared.data!.id;
    expect((await dispatch("confirm_commands", { proposalId })).ok).toBe(false);
    expect(model.pieceInstances.count).toBe(1);
    expect((await dispatch("confirm_commands", { proposalId })).ok).toBe(false);
    expect(approved).toHaveBeenCalledTimes(1);
    expect((await dispatch("prepare_commands", { commands: [{ ...moveLocal(100), malicious: true }] })).ok).toBe(false);
    expect((await dispatch("query_objects", { search: "REC", limit: 5 })).data?.total).toBe(1);
    expect((await dispatch("describe_object", { id: "REC1500-instance" })).ok).toBe(true);
  });
});
