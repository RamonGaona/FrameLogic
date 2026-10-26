import * as THREE from "three";

import {
  getOpenCascadeBrepKernel,
} from "@framelogic/geometry";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import {
  getStepBrepDocumentId,
} from "../step/StepEngineeringBridge";

import type {
  DrawingWorkspaceController,
} from "./DrawingWorkspaceController";

import type {
  SectionViewDefinition,
} from "./SectionDrawingController";

interface WorkspaceRuntime {
  snapshot: {
    readonly section: SectionViewDefinition;
  } | null;
  render(): void;
  sectionToPaper(
    section: SectionViewDefinition,
    x: number,
    y: number,
  ): THREE.Vector2;
  appendSvgLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke: string,
    strokeWidth: number,
    annotationId?: string,
  ): void;
}

export class DrawingCenterMarkController {
  private readonly designModel: DesignModel;
  private readonly designScene: DesignSceneController;
  private readonly workspace: WorkspaceRuntime;
  private readonly baseRender: () => void;

  constructor(
    designModel: DesignModel,
    designScene: DesignSceneController,
    drawingWorkspace: DrawingWorkspaceController,
  ) {
    this.designModel = designModel;
    this.designScene = designScene;
    this.workspace = drawingWorkspace as unknown as WorkspaceRuntime;
    this.baseRender = this.workspace.render.bind(drawingWorkspace);
    this.workspace.render = () => {
      this.baseRender();
      this.renderCenterMarks();
    };
  }

  dispose(): void {
    // El wrapper vive lo mismo que DrawingWorkspace; no añade listeners.
  }

  private renderCenterMarks(): void {
    const snapshot = this.workspace.snapshot;
    if (!snapshot) return;
    const section = snapshot.section;
    const worldToSection = sectionWorldToLocalMatrix(section);
    const sectionNormal = new THREE.Vector3(
      section.normal.x,
      section.normal.y,
      section.normal.z,
    ).normalize();
    const kernel = getOpenCascadeBrepKernel();

    for (const instance of this.designModel.pieceInstances.getAll()) {
      const documentId = getStepBrepDocumentId(instance.definitionId);
      const document = documentId ? kernel.getDocument(documentId) : undefined;
      const object = this.designScene.getInstanceObject(instance.id);
      if (!document || !object || !object.visible) continue;
      object.updateMatrixWorld(true);
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
      const worldScale = new THREE.Vector3();
      object.getWorldScale(worldScale);
      const radiusScale = (
        Math.abs(worldScale.x)
        + Math.abs(worldScale.y)
        + Math.abs(worldScale.z)
      ) / 3;

      for (const edge of document.edges) {
        if (!edge.circle) continue;
        const normal = new THREE.Vector3(
          edge.circle.normal.x,
          edge.circle.normal.y,
          edge.circle.normal.z,
        ).applyMatrix3(normalMatrix).normalize();
        if (Math.abs(normal.dot(sectionNormal)) < 0.985) continue;

        const centerWorld = new THREE.Vector3(
          edge.circle.center.x * document.modelScale,
          edge.circle.center.y * document.modelScale,
          edge.circle.center.z * document.modelScale,
        ).applyMatrix4(object.matrixWorld);
        const local = centerWorld.applyMatrix4(worldToSection);
        if (
          local.z < -1e-5
          || local.z > section.depth + 1e-5
          || local.x < 0
          || local.x > section.width
          || local.y < 0
          || local.y > section.height
        ) {
          continue;
        }

        const radius = edge.circle.radius * document.modelScale * radiusScale;
        const center = this.workspace.sectionToPaper(section, local.x, local.y);
        const edgePaper = this.workspace.sectionToPaper(section, local.x + radius, local.y);
        const radiusPx = Math.abs(edgePaper.x - center.x);
        const mark = Math.max(7, Math.min(16, radiusPx * 0.38));
        this.workspace.appendSvgLine(
          center.x - mark,
          center.y,
          center.x + mark,
          center.y,
          "#59666d",
          0.45,
        );
        this.workspace.appendSvgLine(
          center.x,
          center.y - mark,
          center.x,
          center.y + mark,
          "#59666d",
          0.45,
        );
      }
    }
  }
}

function sectionWorldToLocalMatrix(
  section: SectionViewDefinition,
): THREE.Matrix4 {
  const matrix = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(section.xAxis.x, section.xAxis.y, section.xAxis.z),
    new THREE.Vector3(section.yAxis.x, section.yAxis.y, section.yAxis.z),
    new THREE.Vector3(section.normal.x, section.normal.y, section.normal.z),
  );
  matrix.setPosition(section.origin.x, section.origin.y, section.origin.z);
  return matrix.invert();
}
