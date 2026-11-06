import { describe, expect, it } from "vitest";
import { assetPositionForPieceSnap } from "./assetPositionForPieceSnap";

describe("FrameLogic origin geometry", () => {
  it("maps a SNAP from a rotated local coordinate system into STEP asset coordinates", () => {
    const result = assetPositionForPieceSnap({
      origin: {x:100,y:200,z:300},
      xAxis: {x:0,y:0,z:1},
      yAxis: {x:0,y:1,z:0},
      zAxis: {x:-1,y:0,z:0},
    }, {x:20,y:30,z:40});
    expect(result.toArray()).toEqual([60,230,320]);
  });
});
