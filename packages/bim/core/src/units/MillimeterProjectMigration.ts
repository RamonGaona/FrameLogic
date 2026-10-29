const MM_PER_METER = 1000;

/**
 * Los .flproject históricos no declaraban unidad y almacenaban la geometría
 * lineal en metros. Los paquetes nuevos declaran lengthUnit="mm".
 */
export function migrateLegacyProjectPackage(
  source: unknown,
): unknown {
  if (!isRecord(source)) return source;

  const clone = JSON.parse(
    JSON.stringify(source),
  ) as Record<string, unknown>;

  if (
    clone["schema"] !== "FRAMELOGIC_PROJECT"
    || clone["lengthUnit"] === "mm"
  ) {
    return clone;
  }

  forEachRecord(clone["pieceDefinitions"], (definition) => {
    const coordinateSystem = asRecord(definition["coordinateSystem"]);
    scalePoint(coordinateSystem?.["origin"]);

    forEachRecord(definition["snapPoints"], (snap) => {
      scalePoint(snap["position"]);
    });

    const referenceGeometry = asRecord(definition["referenceGeometry"]);
    forEachRecord(referenceGeometry?.["axisLines"], (axis) => {
      scalePoint(axis["origin"]);
      scaleNumber(axis, "length");
    });
  });

  forEachRecord(clone["pieceInstances"], (instance) => {
    scalePoint(asRecord(instance["transform"])?.["position"]);
  });

  forEachRecord(clone["cadPoints"], (point) => {
    scalePoint(point["position"]);
  });

  forEachRecord(clone["cadLines"], (line) => {
    scalePoint(line["start"]);
    scalePoint(line["end"]);
  });

  migrateEngineering(clone["engineering"]);
  migrateDocumentation(clone["documentation"]);
  migrateProfessionalDrawing(clone["professionalDrawing"]);

  clone["lengthUnit"] = "mm";
  return clone;
}

function migrateEngineering(value: unknown): void {
  const engineering = asRecord(value);
  if (!engineering) return;

  forEachRecord(engineering["pieces"], (piece) => {
    const axis = asRecord(piece["structuralAxis"]);
    if (axis) {
      scalePoint(axis["start"]);
      scalePoint(axis["end"]);
    }
    forEachRecord(piece["features"], migrateEngineeringFeature);
  });

  forEachRecord(engineering["assemblies"], (assembly) => {
    forEachRecord(assembly["components"], (component) => {
      scalePoint(asRecord(component["transform"])?.["position"]);
    });
    forEachRecord(assembly["constraints"], (constraint) => {
      scaleNumber(constraint, "offset");
    });
  });
}

function migrateEngineeringFeature(
  feature: Record<string, unknown>,
): void {
  switch (feature["kind"]) {
    case "HOLE":
      scalePoint(feature["center"]);
      scaleNumber(feature, "diameter");
      scaleNumber(feature, "depth");
      break;
    case "AXIS":
      scalePoint(feature["origin"]);
      scaleNumber(feature, "length");
      break;
    case "PLANE":
      scalePoint(feature["origin"]);
      break;
    case "POINT":
      scalePoint(feature["position"]);
      break;
    case "CIRCLE":
      scalePoint(feature["center"]);
      scaleNumber(feature, "radius");
      break;
    case "CYLINDER":
      scalePoint(feature["axisOrigin"]);
      scaleNumber(feature, "radius");
      scaleNumber(feature, "length");
      break;
  }
}

function migrateDocumentation(value: unknown): void {
  const documentation = asRecord(value);
  if (!documentation) return;

  forEachRecord(documentation["sections"], (section) => {
    scalePoint(section["origin"]);
    scaleNumber(section, "width");
    scaleNumber(section, "height");
    scaleNumber(section, "depth");
  });

  forEachRecord(documentation["documents"], (documentState) => {
    forEachRecord(documentState["annotations"], (annotation) => {
      for (const key of ["a", "b", "c", "target"]) {
        migrateDrawingReference(annotation[key]);
      }
    });
  });

  forEachRecord(documentation["sheets"], (sheet) => {
    forEachRecord(sheet["views"], (view) => {
      if (view["kind"] !== "ASSEMBLY") return;
      scaleNumber(view, "width");
      scaleNumber(view, "height");
      scalePoint(asRecord(view["workPlane"])?.["origin"]);
      forEachRecord(view["segments"], (segment) => {
        scaleNumber(segment, "x1");
        scaleNumber(segment, "y1");
        scaleNumber(segment, "x2");
        scaleNumber(segment, "y2");
      });
    });
  });
}

function migrateDrawingReference(value: unknown): void {
  const reference = asRecord(value);
  if (!reference) return;
  for (const key of ["x", "y", "radius", "centerX", "centerY"]) {
    scaleNumber(reference, key);
  }
}

function migrateProfessionalDrawing(value: unknown): void {
  const state = asRecord(asRecord(value)?.["state"]);
  if (!state) return;

  forEachRecord(state["dimensionStyles"], (style) => {
    scaleNumber(style, "toleranceUpper");
    scaleNumber(style, "toleranceLower");
  });

  forEachRecord(state["viewLayouts"], (layout) => {
    scaleNumber(layout, "cropCenterX");
    scaleNumber(layout, "cropCenterY");
    scaleNumber(layout, "cropRadius");
  });
}

function scalePoint(value: unknown): void {
  const point = asRecord(value);
  if (!point) return;
  scaleNumber(point, "x");
  scaleNumber(point, "y");
  scaleNumber(point, "z");
}

function scaleNumber(
  record: Record<string, unknown>,
  key: string,
): void {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    record[key] = value * MM_PER_METER;
  }
}

function forEachRecord(
  value: unknown,
  callback: (record: Record<string, unknown>) => void,
): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    const record = asRecord(entry);
    if (record) callback(record);
  }
}

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value);
}
