import * as THREE from "three";

import type {
  AssetDefinition,
  DesignModel,
  FrameLogicEngineeringModel,
  PieceDefinition,
} from "@framelogic/domain";

import type {
  StepGeometryDocument,
} from "@framelogic/geometry";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import {
  registerStepDocumentEngineering,
} from "./StepEngineeringBridge";


export interface ImportStepVisualPieceInput {
  readonly code: string;
  readonly name: string;
  readonly classification?: string;
  readonly tags?: readonly string[];
}


export interface ImportedStepVisualPiece {
  readonly asset: AssetDefinition;
  readonly definition: PieceDefinition;
}


/**
 * Registra un documento STEP directamente como asset FrameLogic.
 *
 * No crea un IFC intermedio. La malla solo se usa para render y el
 * StepGeometryDocument conserva la puerta de entrada a features B-Rep.
 *
 * Unidad canónica: los adaptadores STEP entregan `meshes` ya normalizados a
 * milímetros. `unitScaleToMeters` se conserva únicamente como metadato físico
 * del documento y NO debe volver a aplicarse al prototipo visual. Aplicarlo
 * aquí convertía, por ejemplo, 2000 mm -> 2 y FrameLogic interpretaba ese 2
 * como 2 mm.
 */
export function importStepVisualPiece(
  document: StepGeometryDocument,
  input: ImportStepVisualPieceInput,
  designModel: DesignModel,
  designScene: DesignSceneController,
  engineeringModel: FrameLogicEngineeringModel,
): ImportedStepVisualPiece {
  const asset =
    designModel.assets.register({
      name:
        document.sourceFileName,
      format:
        "STEP",
    });

  const prototype =
    createPrototype(
      document,
    );

  designScene.registerAssetPrototype(
    asset.id,
    prototype,
  );

  const definition =
    designModel.pieceDefinitions.register({
      code:
        input.code,
      name:
        input.name,
      geometryAssetId:
        asset.id,
      classification:
        input.classification,
      tags: [
        ...(input.tags ?? []),
      ],
    });

  registerStepDocumentEngineering(
    engineeringModel,
    definition.id,
    document,
  );

  return {
    asset,
    definition,
  };
}


function createPrototype(
  document: StepGeometryDocument,
): THREE.Group {
  const group =
    new THREE.Group();

  group.name =
    `STEP:${document.sourceFileName}`;
  group.userData["framelogicLengthUnit"] =
    "mm";

  for (
    const meshData
    of document.meshes
  ) {
    const geometry =
      new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        meshData.positions,
        3,
      ),
    );
    geometry.setIndex(
      new THREE.BufferAttribute(
        meshData.indices,
        1,
      ),
    );

    if (meshData.normals) {
      geometry.setAttribute(
        "normal",
        new THREE.BufferAttribute(
          meshData.normals,
          3,
        ),
      );
    }
    else {
      geometry.computeVertexNormals();
    }

    const material =
      new THREE.MeshLambertMaterial({
        color:
          0xffffff,
      });
    const mesh =
      new THREE.Mesh(
        geometry,
        material,
      );

    mesh.name =
      meshData.id;

    group.add(mesh);
  }

  return group;
}
