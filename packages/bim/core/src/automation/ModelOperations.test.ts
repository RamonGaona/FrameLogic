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
