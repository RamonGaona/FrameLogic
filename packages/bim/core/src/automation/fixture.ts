import { DesignModel } from "@framelogic/domain";
import { CadHistoryController } from "../interaction/CadHistoryController";
import type { DesignSceneController } from "../design/DesignSceneController";
import type { DesignSelectionController } from "../interaction/DesignSelectionController";
import { ModelOperations } from "./ModelOperations";

/** Reproducible numeric fixture, no STEP file or GPU required. Not loaded into user projects. */
export function createAutomationFixture() {
  const model = new DesignModel();
  const asset = model.registerAsset({ id: "fixture-asset", name: "REC1500", format: "IFC" });
  const definition = model.registerPieceDefinition({ id: "fixture-definition", code: "REC1500", name: "REC1500", geometryAssetId: asset.id,
    classification: "fixture", tags: ["material:steel"],
    coordinateSystem: { origin: {x:10,y:20,z:30}, xAxis: {x:0,y:1,z:0}, yAxis: {x:-1,y:0,z:0}, zAxis: {x:0,y:0,z:1} },
    snapPoints: [{ id:"tip", name:"tip", type:"CONNECTION", position:{x:1500,y:0,z:0} }],
    referenceGeometry: { axisLines: [{ id:"longitudinal", name:"Longitudinal", type:"MAIN", origin:{x:0,y:0,z:0}, direction:{x:1,y:0,z:0}, length:1500 }] },
  });
  model.registerPieceInstance({ id:"REC1500-instance", definitionId:definition.id, name:"REC1500", tags:["phase:1"],
    transform:{position:{x:100,y:200,z:300}, rotation:{x:0,y:0,z:Math.PI/2}} });
  let selected: string[] = [];
  let selectedAssemblies: string[] = [];
  const ports = {
    sync: () => {},
    getSelection: () => [...selected],
    setSelection: (ids: string[]) => { selected = [...ids]; selectedAssemblies = []; },
    getSelectedAssemblyIds: () => [...selectedAssemblies],
    setSelectedAssemblyIds: (ids: readonly string[]) => { selectedAssemblies = [...ids]; },
    assertReady: () => {},
  };
  const history = new CadHistoryController(model, { sync: ports.sync } as unknown as DesignSceneController,
    { setSelection:ports.setSelection } as unknown as DesignSelectionController);
  const operations = new ModelOperations(model, history, ports);
  return { model, history, ports, operations };
}
