import { createAutomationFixture } from "../../../packages/bim/core/src/automation/fixture";
const { operations } = createAutomationFixture();
const id = "REC1500-instance";
operations.selectPieces([id]);
console.log("Axes:", operations.getPieceAxes(id));
const preview = operations.prepare({ operation: "copy_piece_array", id, space: "local",
  direction: {x:1,y:0,z:0}, distance:1500, count:4 });
console.log("Preview (fixture only):", preview);
const result = operations.confirm(preview.id);
console.log("Created:", result.affectedIds.map(id => operations.getPiece(id).instance));
operations.undo();
console.log("After one undo:", operations.getModelInfo());
