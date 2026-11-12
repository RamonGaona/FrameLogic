import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";


export interface CadCircleVector3Data {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}


export interface CadCircle {
  readonly id: string;
  readonly layerId: string;
  readonly center: CadCircleVector3Data;
  readonly radius: number;
  readonly xAxis: CadCircleVector3Data;
  readonly yAxis: CadCircleVector3Data;
  readonly normal: CadCircleVector3Data;
}


export interface RegisterCadCircleInput {
  readonly id?: string;
  readonly layerId?: string;
  readonly center: CadCircleVector3Data;
  readonly radius: number;
  readonly xAxis: CadCircleVector3Data;
  readonly yAxis: CadCircleVector3Data;
  readonly normal: CadCircleVector3Data;
}


function cloneVector(
  value: CadCircleVector3Data,
): CadCircleVector3Data {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  };
}


function isFiniteVector(
  value: CadCircleVector3Data,
): boolean {
  return Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z);
}


export class CadCircleSceneController {
  private readonly scene: THREE.Scene;
  private readonly designModel: DesignModel;
  private readonly circles =
    new Map<string, CadCircle>();
  private readonly objects =
    new Map<string, THREE.LineLoop>();
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    designModel: DesignModel,
  ) {
    this.scene = scene;
    this.designModel = designModel;
  }

  register(
    input: RegisterCadCircleInput,
  ): CadCircle {
    if (this.disposed) {
      throw new Error(
        "CAD circle scene is disposed.",
      );
    }

    if (
      !Number.isFinite(input.radius)
      || input.radius <= 1e-9
    ) {
      throw new Error(
        "El radio del círculo debe ser mayor que cero.",
      );
    }

    if (
      !isFiniteVector(input.center)
      || !isFiniteVector(input.xAxis)
      || !isFiniteVector(input.yAxis)
      || !isFiniteVector(input.normal)
    ) {
      throw new Error(
        "La geometría del círculo contiene coordenadas inválidas.",
      );
    }

    const id =
      input.id
      ?? crypto.randomUUID();

    if (this.circles.has(id)) {
      throw new Error(
        `A CAD circle with id "${id}" already exists.`,
      );
    }

    const layerId =
      input.layerId
      ?? this.designModel.layers.activeLayerId;
    const layer =
      this.designModel.layers.get(layerId);

    if (!layer) {
      throw new Error(
        `Cannot create CAD circle. Layer "${layerId}" does not exist.`,
      );
    }

    if (layer.locked) {
      throw new Error(
        `Cannot create CAD circle. Layer "${layer.name}" is locked.`,
      );
    }

    const xAxis =
      new THREE.Vector3(
        input.xAxis.x,
        input.xAxis.y,
        input.xAxis.z,
      );
    const yAxis =
      new THREE.Vector3(
        input.yAxis.x,
        input.yAxis.y,
        input.yAxis.z,
      );
    const normal =
      new THREE.Vector3(
        input.normal.x,
        input.normal.y,
        input.normal.z,
      );

    if (
      xAxis.lengthSq() <= 1e-12
      || yAxis.lengthSq() <= 1e-12
      || normal.lengthSq() <= 1e-12
    ) {
      throw new Error(
        "El plano del círculo no es válido.",
      );
    }

    xAxis.normalize();
    normal.normalize();
    yAxis
      .copy(
        new THREE.Vector3()
          .crossVectors(
            normal,
            xAxis,
          ),
      );

    if (yAxis.lengthSq() <= 1e-12) {
      throw new Error(
        "Los ejes del círculo no definen un plano válido.",
      );
    }
    yAxis.normalize();

    const circle: CadCircle = {
      id,
      layerId,
      center: cloneVector(input.center),
      radius: input.radius,
      xAxis: {
        x: xAxis.x,
        y: xAxis.y,
        z: xAxis.z,
      },
      yAxis: {
        x: yAxis.x,
        y: yAxis.y,
        z: yAxis.z,
      },
      normal: {
        x: normal.x,
        y: normal.y,
        z: normal.z,
      },
    };

    this.circles.set(
      id,
      circle,
    );
    this.sync();
    return circle;
  }

  get(
    id: string,
  ): CadCircle | undefined {
    return this.circles.get(id);
  }

  /** Edit a circle in place without changing its ID, layer or plane. */
  updateRadius(id: string, radius: number): boolean {
    const current = this.circles.get(id);
    if (!current || !Number.isFinite(radius) || radius <= 1e-9) return false;
    const layer = this.designModel.layers.get(current.layerId);
    if (!layer || layer.locked) return false;
    this.circles.set(id, { ...current, radius });
    this.sync();
    return true;
  }

  getAll(): CadCircle[] {
    return Array.from(
      this.circles.values(),
      (circle) => ({
        ...circle,
        center: cloneVector(circle.center),
        xAxis: cloneVector(circle.xAxis),
        yAxis: cloneVector(circle.yAxis),
        normal: cloneVector(circle.normal),
      }),
    );
  }

  getCircleObject(
    id: string,
  ): THREE.LineLoop | undefined {
    return this.objects.get(id);
  }

  remove(
    id: string,
  ): boolean {
    const removed =
      this.circles.delete(id);
    if (removed) {
      this.sync();
    }
    return removed;
  }

  clear(): void {
    this.circles.clear();
    this.sync();
  }

  restore(
    circles: readonly CadCircle[],
  ): void {
    this.circles.clear();

    for (const circle of circles) {
      const layerId =
        this.designModel.layers.get(circle.layerId)
          ? circle.layerId
          : this.designModel.layers.activeLayerId;

      this.circles.set(
        circle.id,
        {
          ...circle,
          layerId,
          center: cloneVector(circle.center),
          xAxis: cloneVector(circle.xAxis),
          yAxis: cloneVector(circle.yAxis),
          normal: cloneVector(circle.normal),
        },
      );
    }

    this.sync();
  }

  sync(): void {
    if (this.disposed) return;

    const activeIds =
      new Set(this.circles.keys());

    for (
      const [id, object]
      of this.objects
    ) {
      if (activeIds.has(id)) continue;
      this.scene.remove(object);
      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        for (const material of object.material) {
          material.dispose();
        }
      }
      else {
        object.material.dispose();
      }
      this.objects.delete(id);
    }

    for (const circle of this.circles.values()) {
      let object =
        this.objects.get(circle.id);

      if (!object) {
        object =
          new THREE.LineLoop(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({
              color: 0xe5e7eb,
            }),
          );
        object.name =
          `CadCircle:${circle.id}`;
        object.userData = {
          frameLogic: {
            entityType: "CadCircle",
            circleId: circle.id,
          },
        };
        this.scene.add(object);
        this.objects.set(circle.id, object);
      }

      const center =
        new THREE.Vector3(
          circle.center.x,
          circle.center.y,
          circle.center.z,
        );
      const xAxis =
        new THREE.Vector3(
          circle.xAxis.x,
          circle.xAxis.y,
          circle.xAxis.z,
        ).normalize();
      const yAxis =
        new THREE.Vector3(
          circle.yAxis.x,
          circle.yAxis.y,
          circle.yAxis.z,
        ).normalize();
      const points: THREE.Vector3[] = [];
      const segmentCount = 128;

      for (
        let index = 0;
        index < segmentCount;
        index += 1
      ) {
        const angle =
          index / segmentCount
          * Math.PI
          * 2;
        points.push(
          center
            .clone()
            .addScaledVector(
              xAxis,
              Math.cos(angle)
              * circle.radius,
            )
            .addScaledVector(
              yAxis,
              Math.sin(angle)
              * circle.radius,
            ),
        );
      }

      object.geometry.setFromPoints(points);
      object.geometry.computeBoundingSphere();

      const layer =
        this.designModel.layers.get(
          circle.layerId,
        );
      object.visible =
        layer?.visible
        ?? true;
      object.updateMatrixWorld(true);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }
}
