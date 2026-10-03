import type {
  LocalCoordinateSystem,
  PersistentSnapType,
  PieceDefinition,
  PieceReferenceGeometry,
  PieceSnapPoint,
  PieceVector3Data,
  ReferenceAxisLine,
  ReferenceAxisType,
} from "./PieceDefinition";


export interface RegisterPieceDefinitionInput {

  id?: string;

  code: string;

  name: string;

  geometryAssetId: string;

  classification?: string;

  tags?: string[];

  coordinateSystem?:
    LocalCoordinateSystem;

  snapPoints?:
    readonly PieceSnapPoint[];

  referenceGeometry?:
    PieceReferenceGeometry;

}


export interface AddPieceSnapPointInput {

  id?: string;

  name: string;

  type:
    PersistentSnapType;

  position:
    PieceVector3Data;

  relatedAxisId?:
    string;

}


export interface AddReferenceAxisLineInput {

  id?: string;

  name: string;

  type:
    ReferenceAxisType;

  origin:
    PieceVector3Data;

  direction:
    PieceVector3Data;

  length?:
    number;

}


export class PieceDefinitionRegistry {

  private readonly definitions =
    new Map<
      string,
      PieceDefinition
    >();


  register(
    input:
      RegisterPieceDefinitionInput,
  ):
    PieceDefinition {

    const existingByCode =
      this.findByCode(
        input.code,
      );


    if (
      existingByCode
    ) {

      throw new Error(
        `A piece definition with code "${input.code}" already exists.`,
      );

    }


    const id =
      input.id
      ?? crypto.randomUUID();


    if (
      this.definitions.has(
        id,
      )
    ) {

      throw new Error(
        `A piece definition with id "${id}" already exists.`,
      );

    }


    const coordinateSystem =
      this.normalizeCoordinateSystem(
        input.coordinateSystem
        ?? this.createIdentityCoordinateSystem(),
      );


    const snapPoints =
      (
        input.snapPoints
        ?? []
      ).map(
        (
          snap,
        ) =>
          this.cloneSnapPoint(
            snap,
          ),
      );


    this.assertUniqueIds(
      snapPoints.map(
        (
          snap,
        ) =>
          snap.id,
      ),
      "piece snap point",
    );


    const axisLines =
      (
        input.referenceGeometry
          ?.axisLines
        ?? []
      ).map(
        (
          axis,
        ) =>
          this.normalizeAxisLine(
            axis,
          ),
      );


    this.assertUniqueIds(
      axisLines.map(
        (
          axis,
        ) =>
          axis.id,
      ),
      "reference axis",
    );


    const definition:
      PieceDefinition = {

        id,

        code:
          input.code,

        name:
          input.name,

        geometryAssetId:
          input.geometryAssetId,

        classification:
          input.classification,

        tags: [
          ...(
            input.tags
            ?? []
          ),
        ],

        coordinateSystem,

        snapPoints,

        referenceGeometry: {
          axisLines,
        },

      };


    this.definitions.set(
      id,
      definition,
    );


    return definition;

  }


  get(
    id: string,
  ):
    PieceDefinition
    | undefined {

    return this.definitions.get(
      id,
    );

  }


  getAll():
    PieceDefinition[] {

    return Array.from(
      this.definitions.values(),
    );

  }


  findByCode(
    code: string,
  ):
    PieceDefinition
    | undefined {

    const normalizedCode =
      code
        .trim()
        .toLowerCase();


    for (
      const definition
      of this.definitions.values()
    ) {

      if (
        definition.code
          .trim()
          .toLowerCase()
        === normalizedCode
      ) {

        return definition;

      }

    }


    return undefined;

  }


  findByAssetId(
    geometryAssetId:
      string,
  ):
    PieceDefinition[] {

    return this
      .getAll()
      .filter(
        (
          definition,
        ) =>
          definition.geometryAssetId
          === geometryAssetId,
      );

  }


  filterByClassification(
    classification:
      string,
  ):
    PieceDefinition[] {

    const normalizedClassification =
      classification
        .trim()
        .toLowerCase();


    return this
      .getAll()
      .filter(
        (
          definition,
        ) =>
          definition.classification
            ?.trim()
            .toLowerCase()
          === normalizedClassification,
      );

  }


  filterByTag(
    tag: string,
  ):
    PieceDefinition[] {

    const normalizedTag =
      tag
        .trim()
        .toLowerCase();


    return this
      .getAll()
      .filter(
        (
          definition,
        ) =>
          definition.tags.some(
            (
              currentTag,
            ) =>
              currentTag
                .trim()
                .toLowerCase()
              === normalizedTag,
          ),
      );

  }


  search(
    text: string,
  ):
    PieceDefinition[] {

    const query =
      text
        .trim()
        .toLowerCase();


    if (
      query.length === 0
    ) {

      return this.getAll();

    }


    return this
      .getAll()
      .filter(
        (
          definition,
        ) => {

          const matchesCode =
            definition.code
              .toLowerCase()
              .includes(
                query,
              );


          const matchesName =
            definition.name
              .toLowerCase()
              .includes(
                query,
              );


          const matchesClassification =
            definition.classification
              ?.toLowerCase()
              .includes(
                query,
              )
            ?? false;


          const matchesTag =
            definition.tags.some(
              (
                tag,
              ) =>
                tag
                  .toLowerCase()
                  .includes(
                    query,
                  ),
            );


          return (
            matchesCode
            || matchesName
            || matchesClassification
            || matchesTag
          );

        },
      );

  }


  updateCoordinateSystem(
    id: string,
    coordinateSystem:
      LocalCoordinateSystem,
    rebasePersistentGeometry =
      true,
  ):
    PieceDefinition
    | undefined {

    const current =
      this.definitions.get(
        id,
      );


    if (
      !current
    ) {

      return undefined;

    }


    const nextCoordinateSystem =
      this.normalizeCoordinateSystem(
        coordinateSystem,
      );


    const snapPoints =
      rebasePersistentGeometry
        ? current.snapPoints.map(
            (
              snap,
            ) => ({
              ...snap,
              position:
                this.rebasePoint(
                  snap.position,
                  current.coordinateSystem,
                  nextCoordinateSystem,
                ),
            }),
          )
        : current.snapPoints.map(
            (
              snap,
            ) =>
              this.cloneSnapPoint(
                snap,
              ),
          );


    const axisLines =
      rebasePersistentGeometry
        ? current.referenceGeometry
            .axisLines
            .map(
              (
                axis,
              ) => ({
                ...axis,
                origin:
                  this.rebasePoint(
                    axis.origin,
                    current.coordinateSystem,
                    nextCoordinateSystem,
                  ),
                direction:
                  this.rebaseDirection(
                    axis.direction,
                    current.coordinateSystem,
                    nextCoordinateSystem,
                  ),
              }),
            )
        : current.referenceGeometry
            .axisLines
            .map(
              (
                axis,
              ) =>
                this.normalizeAxisLine(
                  axis,
                ),
            );


    const updated:
      PieceDefinition = {

        ...current,

        coordinateSystem:
          nextCoordinateSystem,

        snapPoints,

        referenceGeometry: {
          axisLines,
        },

      };


    this.definitions.set(
      id,
      updated,
    );


    return updated;

  }


  addSnapPoint(
    definitionId:
      string,

    input:
      AddPieceSnapPointInput,
  ):
    PieceSnapPoint
    | undefined {

    const current =
      this.definitions.get(
        definitionId,
      );


    if (
      !current
    ) {

      return undefined;

    }


    const snap:
      PieceSnapPoint = {

        id:
          input.id
          ?? crypto.randomUUID(),

        name:
          input.name,

        type:
          input.type,

        position:
          this.cloneVector(
            input.position,
          ),

        relatedAxisId:
          input.relatedAxisId,

      };


    if (
      current.snapPoints.some(
        (
          item,
        ) =>
          item.id
          === snap.id,
      )
    ) {

      throw new Error(
        `A piece snap point with id "${snap.id}" already exists in definition "${definitionId}".`,
      );

    }


    const updated:
      PieceDefinition = {

        ...current,

        snapPoints: [
          ...current.snapPoints,
          snap,
        ],

      };


    this.definitions.set(
      definitionId,
      updated,
    );


    return snap;

  }


  removeSnapPoint(
    definitionId:
      string,

    snapId:
      string,
  ):
    boolean {

    const current =
      this.definitions.get(
        definitionId,
      );


    if (
      !current
    ) {

      return false;

    }


    const next =
      current.snapPoints.filter(
        (
          snap,
        ) =>
          snap.id
          !== snapId,
      );


    if (
      next.length
      === current.snapPoints.length
    ) {

      return false;

    }


    this.definitions.set(
      definitionId,
      {
        ...current,
        snapPoints:
          next,
      },
    );


    return true;

  }


  removeSnapPointsByType(
    definitionId:
      string,

    type:
      PersistentSnapType,
  ):
    number {

    const current =
      this.definitions.get(
        definitionId,
      );


    if (
      !current
    ) {

      return 0;

    }


    const next =
      current.snapPoints.filter(
        (
          snap,
        ) =>
          snap.type
          !== type,
      );


    const removed =
      current.snapPoints.length
      - next.length;


    if (
      removed > 0
    ) {

      this.definitions.set(
        definitionId,
        {
          ...current,
          snapPoints:
            next,
        },
      );

    }


    return removed;

  }


  addReferenceAxisLine(
    definitionId:
      string,

    input:
      AddReferenceAxisLineInput,
  ):
    ReferenceAxisLine
    | undefined {

    const current =
      this.definitions.get(
        definitionId,
      );


    if (
      !current
    ) {

      return undefined;

    }


    const axis =
      this.normalizeAxisLine({
        id:
          input.id
          ?? crypto.randomUUID(),
        name:
          input.name,
        type:
          input.type,
        origin:
          input.origin,
        direction:
          input.direction,
        length:
          input.length,
      });


    if (
      current.referenceGeometry
        .axisLines
        .some(
          (
            item,
          ) =>
            item.id
            === axis.id,
        )
    ) {

      throw new Error(
        `A reference axis with id "${axis.id}" already exists in definition "${definitionId}".`,
      );

    }


    const updated:
      PieceDefinition = {

        ...current,

        referenceGeometry: {
          axisLines: [
            ...current.referenceGeometry
              .axisLines,
            axis,
          ],
        },

      };


    this.definitions.set(
      definitionId,
      updated,
    );


    return axis;

  }


  removeReferenceAxisLine(
    definitionId:
      string,

    axisId:
      string,
  ):
    boolean {

    const current =
      this.definitions.get(
        definitionId,
      );


    if (
      !current
    ) {

      return false;

    }


    const next =
      current.referenceGeometry
        .axisLines
        .filter(
          (
            axis,
          ) =>
            axis.id
            !== axisId,
        );


    if (
      next.length
      === current.referenceGeometry
        .axisLines
        .length
    ) {

      return false;

    }


    this.definitions.set(
      definitionId,
      {
        ...current,
        referenceGeometry: {
          axisLines:
            next,
        },
      },
    );


    return true;

  }


  remove(
    id: string,
  ):
    boolean {

    return this.definitions.delete(
      id,
    );

  }


  clear():
    void {

    this.definitions.clear();

  }


  private createIdentityCoordinateSystem():
    LocalCoordinateSystem {

    return {
      origin: {
        x: 0,
        y: 0,
        z: 0,
      },
      xAxis: {
        x: 1,
        y: 0,
        z: 0,
      },
      yAxis: {
        x: 0,
        y: 1,
        z: 0,
      },
      zAxis: {
        x: 0,
        y: 0,
        z: 1,
      },
    };

  }


  private normalizeCoordinateSystem(
    input:
      LocalCoordinateSystem,
  ):
    LocalCoordinateSystem {

    const x =
      this.normalizeVector(
        input.xAxis,
        "PieceDefinition xAxis",
      );


    const yInput =
      this.normalizeVector(
        input.yAxis,
        "PieceDefinition yAxis",
      );


    const zFromCross =
      this.cross(
        x,
        yInput,
      );


    const z =
      this.normalizeVector(
        zFromCross,
        "PieceDefinition xAxis/yAxis cross product",
      );


    const y =
      this.normalizeVector(
        this.cross(
          z,
          x,
        ),
        "PieceDefinition corrected yAxis",
      );


    const requestedZ =
      this.normalizeVector(
        input.zAxis,
        "PieceDefinition zAxis",
      );


    if (
      this.dot(
        z,
        requestedZ,
      )
      < 0
    ) {

      throw new Error(
        "PieceDefinition coordinate system must be right-handed.",
      );

    }


    return {
      origin:
        this.cloneVector(
          input.origin,
        ),
      xAxis:
        x,
      yAxis:
        y,
      zAxis:
        z,
    };

  }


  private normalizeAxisLine(
    axis:
      ReferenceAxisLine,
  ):
    ReferenceAxisLine {

    if (
      axis.length !== undefined
      && (
        !Number.isFinite(
          axis.length,
        )
        || axis.length < 0
      )
    ) {

      throw new Error(
        "Reference axis length must be zero or positive.",
      );

    }


    return {
      id:
        axis.id,
      name:
        axis.name,
      type:
        axis.type,
      origin:
        this.cloneVector(
          axis.origin,
        ),
      direction:
        this.normalizeVector(
          axis.direction,
          "Reference axis direction",
        ),
      length:
        axis.length,
    };

  }


  private cloneSnapPoint(
    snap:
      PieceSnapPoint,
  ):
    PieceSnapPoint {

    return {
      id:
        snap.id,
      name:
        snap.name,
      type:
        snap.type,
      position:
        this.cloneVector(
          snap.position,
        ),
      relatedAxisId:
        snap.relatedAxisId,
    };

  }


  private cloneVector(
    vector:
      PieceVector3Data,
  ):
    PieceVector3Data {

    if (
      !Number.isFinite(
        vector.x,
      )
      || !Number.isFinite(
        vector.y,
      )
      || !Number.isFinite(
        vector.z,
      )
    ) {

      throw new Error(
        "Piece vector coordinates must be finite numbers.",
      );

    }


    return {
      x:
        vector.x,
      y:
        vector.y,
      z:
        vector.z,
    };

  }


  private normalizeVector(
    vector:
      PieceVector3Data,

    label:
      string,
  ):
    PieceVector3Data {

    const cloned =
      this.cloneVector(
        vector,
      );


    const length =
      Math.hypot(
        cloned.x,
        cloned.y,
        cloned.z,
      );


    if (
      length <= 1e-12
    ) {

      throw new Error(
        `${label} must be non-zero.`,
      );

    }


    return {
      x:
        cloned.x / length,
      y:
        cloned.y / length,
      z:
        cloned.z / length,
    };

  }


  private rebasePoint(
    local:
      PieceVector3Data,

    from:
      LocalCoordinateSystem,

    to:
      LocalCoordinateSystem,
  ):
    PieceVector3Data {

    const asset =
      this.localToAssetPoint(
        local,
        from,
      );


    return this.assetToLocalPoint(
      asset,
      to,
    );

  }


  private rebaseDirection(
    local:
      PieceVector3Data,

    from:
      LocalCoordinateSystem,

    to:
      LocalCoordinateSystem,
  ):
    PieceVector3Data {

    const asset = {
      x:
        local.x
        * from.xAxis.x
        + local.y
        * from.yAxis.x
        + local.z
        * from.zAxis.x,
      y:
        local.x
        * from.xAxis.y
        + local.y
        * from.yAxis.y
        + local.z
        * from.zAxis.y,
      z:
        local.x
        * from.xAxis.z
        + local.y
        * from.yAxis.z
        + local.z
        * from.zAxis.z,
    };


    return this.normalizeVector(
      {
        x:
          this.dot(
            asset,
            to.xAxis,
          ),
        y:
          this.dot(
            asset,
            to.yAxis,
          ),
        z:
          this.dot(
            asset,
            to.zAxis,
          ),
      },
      "Rebased reference axis direction",
    );

  }


  private localToAssetPoint(
    local:
      PieceVector3Data,

    coordinateSystem:
      LocalCoordinateSystem,
  ):
    PieceVector3Data {

    return {
      x:
        coordinateSystem.origin.x
        + local.x
        * coordinateSystem.xAxis.x
        + local.y
        * coordinateSystem.yAxis.x
        + local.z
        * coordinateSystem.zAxis.x,
      y:
        coordinateSystem.origin.y
        + local.x
        * coordinateSystem.xAxis.y
        + local.y
        * coordinateSystem.yAxis.y
        + local.z
        * coordinateSystem.zAxis.y,
      z:
        coordinateSystem.origin.z
        + local.x
        * coordinateSystem.xAxis.z
        + local.y
        * coordinateSystem.yAxis.z
        + local.z
        * coordinateSystem.zAxis.z,
    };

  }


  private assetToLocalPoint(
    asset:
      PieceVector3Data,

    coordinateSystem:
      LocalCoordinateSystem,
  ):
    PieceVector3Data {

    const delta = {
      x:
        asset.x
        - coordinateSystem.origin.x,
      y:
        asset.y
        - coordinateSystem.origin.y,
      z:
        asset.z
        - coordinateSystem.origin.z,
    };


    return {
      x:
        this.dot(
          delta,
          coordinateSystem.xAxis,
        ),
      y:
        this.dot(
          delta,
          coordinateSystem.yAxis,
        ),
      z:
        this.dot(
          delta,
          coordinateSystem.zAxis,
        ),
    };

  }


  private dot(
    first:
      PieceVector3Data,

    second:
      PieceVector3Data,
  ):
    number {

    return (
      first.x
      * second.x
      + first.y
      * second.y
      + first.z
      * second.z
    );

  }


  private cross(
    first:
      PieceVector3Data,

    second:
      PieceVector3Data,
  ):
    PieceVector3Data {

    return {
      x:
        first.y
        * second.z
        - first.z
        * second.y,
      y:
        first.z
        * second.x
        - first.x
        * second.z,
      z:
        first.x
        * second.y
        - first.y
        * second.x,
    };

  }


  private assertUniqueIds(
    ids:
      readonly string[],

    label:
      string,
  ):
    void {

    const unique =
      new Set(
        ids,
      );


    if (
      unique.size
      !== ids.length
    ) {

      throw new Error(
        `Duplicate ${label} id detected.`,
      );

    }

  }

}
