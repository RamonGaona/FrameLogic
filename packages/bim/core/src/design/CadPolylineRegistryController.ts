import type {
  DesignModel,
} from "@framelogic/domain";


export interface CadPolylineSegmentRef {
  readonly lineId: string;
  readonly reversed: boolean;
}


export interface CadPolyline {
  readonly id: string;
  readonly layerId: string;
  readonly segments: readonly CadPolylineSegmentRef[];
  readonly closed: boolean;
}


export interface RegisterCadPolylineInput {
  readonly id?: string;
  readonly layerId?: string;
  readonly segments: readonly CadPolylineSegmentRef[];
  readonly closed?: boolean;
}


function cloneSegment(
  segment: CadPolylineSegmentRef,
): CadPolylineSegmentRef {
  return {
    lineId: segment.lineId,
    reversed: segment.reversed,
  };
}


function clonePolyline(
  polyline: CadPolyline,
): CadPolyline {
  return {
    ...polyline,
    segments: polyline.segments.map(cloneSegment),
  };
}


/**
 * Registro semántico de POLYLINE.
 *
 * Los segmentos siguen siendo CadLine reales para que SNAP, TRIM, MOVE y LL
 * puedan operar sobre la geometría existente. La polilínea conserva el orden,
 * sentido, cierre y pertenencia de esos segmentos como una única entidad CAD.
 */
export class CadPolylineRegistryController {
  private readonly designModel: DesignModel;
  private readonly polylines =
    new Map<string, CadPolyline>();

  constructor(
    designModel: DesignModel,
  ) {
    this.designModel = designModel;
  }

  register(
    input: RegisterCadPolylineInput,
  ): CadPolyline {
    const segments =
      input.segments.map(cloneSegment);

    this.validateSegments(
      segments,
      undefined,
    );

    const firstLine =
      this.designModel.cadLines.get(
        segments[0].lineId,
      );

    if (!firstLine) {
      throw new Error(
        "La polilínea no contiene segmentos CAD válidos.",
      );
    }

    const layerId =
      input.layerId
      ?? firstLine.layerId;

    const layer =
      this.designModel.layers.get(layerId);

    if (!layer) {
      throw new Error(
        `Cannot create CAD polyline. Layer "${layerId}" does not exist.`,
      );
    }

    if (layer.locked) {
      throw new Error(
        `Cannot create CAD polyline. Layer "${layer.name}" is locked.`,
      );
    }

    for (const segment of segments) {
      const line =
        this.designModel.cadLines.get(
          segment.lineId,
        );

      if (!line || line.layerId !== layerId) {
        throw new Error(
          "Todos los segmentos de una polilínea deben pertenecer al mismo layer.",
        );
      }
    }

    const id =
      input.id
      ?? crypto.randomUUID();

    if (this.polylines.has(id)) {
      throw new Error(
        `A CAD polyline with id "${id}" already exists.`,
      );
    }

    const polyline: CadPolyline = {
      id,
      layerId,
      segments,
      closed: input.closed ?? false,
    };

    this.polylines.set(
      id,
      polyline,
    );

    return clonePolyline(polyline);
  }

  updateSegments(
    id: string,
    segments: readonly CadPolylineSegmentRef[],
    closed?: boolean,
  ): CadPolyline | undefined {
    const current =
      this.polylines.get(id);

    if (!current) return undefined;

    const cloned =
      segments.map(cloneSegment);

    this.validateSegments(
      cloned,
      id,
    );

    for (const segment of cloned) {
      const line =
        this.designModel.cadLines.get(
          segment.lineId,
        );

      if (!line || line.layerId !== current.layerId) {
        throw new Error(
          "Todos los segmentos de una polilínea deben pertenecer al mismo layer.",
        );
      }
    }

    const updated: CadPolyline = {
      ...current,
      segments: cloned,
      closed: closed ?? current.closed,
    };

    this.polylines.set(
      id,
      updated,
    );

    return clonePolyline(updated);
  }

  get(
    id: string,
  ): CadPolyline | undefined {
    const polyline =
      this.polylines.get(id);

    return polyline
      ? clonePolyline(polyline)
      : undefined;
  }

  getAll(): CadPolyline[] {
    return Array.from(
      this.polylines.values(),
      clonePolyline,
    );
  }

  findByLineId(
    lineId: string,
  ): CadPolyline | undefined {
    for (const polyline of this.polylines.values()) {
      if (
        polyline.segments.some(
          (segment) =>
            segment.lineId === lineId,
        )
      ) {
        return clonePolyline(polyline);
      }
    }

    return undefined;
  }

  remove(
    id: string,
  ): boolean {
    return this.polylines.delete(id);
  }

  clear(): void {
    this.polylines.clear();
  }

  restore(
    polylines: readonly CadPolyline[],
  ): void {
    this.polylines.clear();

    const occupiedLineIds =
      new Set<string>();

    for (const source of polylines) {
      const segments =
        source.segments
          .filter(
            (segment) =>
              this.designModel.cadLines.get(
                segment.lineId,
              ) !== undefined,
          )
          .map(cloneSegment);

      if (segments.length < 2) {
        continue;
      }

      if (
        segments.some(
          (segment) =>
            occupiedLineIds.has(
              segment.lineId,
            ),
        )
      ) {
        continue;
      }

      const firstLine =
        this.designModel.cadLines.get(
          segments[0].lineId,
        );

      if (!firstLine) continue;

      const sameLayer =
        segments.every(
          (segment) =>
            this.designModel.cadLines.get(
              segment.lineId,
            )?.layerId
            === firstLine.layerId,
        );

      if (!sameLayer) continue;

      const restored: CadPolyline = {
        id: source.id,
        layerId: firstLine.layerId,
        segments,
        closed: source.closed,
      };

      this.polylines.set(
        restored.id,
        restored,
      );

      for (const segment of segments) {
        occupiedLineIds.add(
          segment.lineId,
        );
      }
    }
  }

  private validateSegments(
    segments: readonly CadPolylineSegmentRef[],
    ignoredPolylineId: string | undefined,
  ): void {
    if (segments.length < 2) {
      throw new Error(
        "Una polilínea necesita al menos dos segmentos.",
      );
    }

    const unique =
      new Set<string>();

    for (const segment of segments) {
      if (unique.has(segment.lineId)) {
        throw new Error(
          "Una polilínea no puede contener el mismo tramo más de una vez.",
        );
      }

      unique.add(segment.lineId);

      if (
        !this.designModel.cadLines.get(
          segment.lineId,
        )
      ) {
        throw new Error(
          `CAD line "${segment.lineId}" does not exist.`,
        );
      }

      const owner =
        this.findByLineId(
          segment.lineId,
        );

      if (
        owner
        && owner.id !== ignoredPolylineId
      ) {
        throw new Error(
          "Un tramo CAD ya pertenece a otra polilínea.",
        );
      }
    }
  }
}
