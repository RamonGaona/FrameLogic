export type DrawingUnit =
  | "MM"
  | "CM"
  | "M";

export type ProfessionalDimensionMode =
  | "ALIGNED"
  | "HORIZONTAL"
  | "VERTICAL"
  | "DIAMETER"
  | "RADIUS"
  | "ANGULAR"
  | "ORDINATE_X"
  | "ORDINATE_Y"
  | "CHAIN"
  | "BASELINE"
  | "LEVEL"
  | "ARC_LENGTH";

export type DrawingSnapMode =
  | "AUTO"
  | "ENDPOINT"
  | "MIDPOINT"
  | "CENTER"
  | "QUADRANT"
  | "INTERSECTION"
  | "NEAREST"
  | "PERPENDICULAR"
  | "TANGENT"
  | "EXTENSION";

export type DrawingViewKind =
  | "SECTION"
  | "DETAIL";

export type DrawingLineStyle =
  | "CUT"
  | "VISIBLE"
  | "HIDDEN"
  | "CENTER"
  | "HATCH";

export interface DimensionStyleState {
  readonly id: string;
  name: string;
  unit: DrawingUnit;
  precision: number;
  textHeightMm: number;
  arrowSizeMm: number;
  extensionGapMm: number;
  suffix: string;
  prefix: string;
  showUnit: boolean;
  toleranceUpper?: number;
  toleranceLower?: number;
}

export interface DrawingViewLayoutState {
  readonly id: string;
  readonly sectionId: string;
  kind: DrawingViewKind;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleDenominator: number | null;
  showHidden: boolean;
  locked: boolean;
  cropCenterX?: number;
  cropCenterY?: number;
  cropRadius?: number;
  title?: string;
}

export interface DrawingSectionDisplayState {
  readonly sectionId: string;
  visible: boolean;
  locked: boolean;
}

export interface RevisionCloudState {
  readonly id: string;
  readonly revisionCode: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrozenDrawingRevisionState {
  readonly id: string;
  readonly sheetOwnerSectionId: string;
  readonly revisionCode: string;
  readonly createdAt: string;
  readonly svg: string;
}

export interface DrawingProfessionalState {
  activeDimensionStyleId: string;
  activeSnapMode: DrawingSnapMode;
  activeDimensionMode: ProfessionalDimensionMode;
  readonly dimensionStyles: DimensionStyleState[];
  readonly viewLayouts: DrawingViewLayoutState[];
  readonly sectionDisplay: DrawingSectionDisplayState[];
  readonly revisionClouds: RevisionCloudState[];
  readonly frozenRevisions: FrozenDrawingRevisionState[];
  titleBlockTemplate:
    | "ISO_SIMPLE"
    | "STRUCTURAL"
    | "FABRICATION";
}

export interface DrawingProfessionalSnapshot {
  readonly version: 1;
  readonly state: DrawingProfessionalState;
}

export function createDefaultDimensionStyle(): DimensionStyleState {
  return {
    id: "framelogic-iso",
    name: "FrameLogic ISO",
    unit: "MM",
    precision: 0,
    textHeightMm: 2.5,
    arrowSizeMm: 2.5,
    extensionGapMm: 1.5,
    suffix: "",
    prefix: "",
    showUnit: false,
  };
}

export function createDefaultProfessionalState(): DrawingProfessionalState {
  return {
    activeDimensionStyleId: "framelogic-iso",
    activeSnapMode: "AUTO",
    activeDimensionMode: "ALIGNED",
    dimensionStyles: [
      createDefaultDimensionStyle(),
    ],
    viewLayouts: [],
    sectionDisplay: [],
    revisionClouds: [],
    frozenRevisions: [],
    titleBlockTemplate: "ISO_SIMPLE",
  };
}

export function cloneProfessionalState(
  value: DrawingProfessionalState,
): DrawingProfessionalState {
  return JSON.parse(
    JSON.stringify(value),
  ) as DrawingProfessionalState;
}

export function modelMetersToDrawingUnit(
  valueMeters: number,
  unit: DrawingUnit,
): number {
  switch (unit) {
    case "MM":
      return valueMeters * 1000;
    case "CM":
      return valueMeters * 100;
    case "M":
      return valueMeters;
  }
}

export function drawingUnitLabel(
  unit: DrawingUnit,
): string {
  switch (unit) {
    case "MM":
      return "mm";
    case "CM":
      return "cm";
    case "M":
      return "m";
  }
}

export function formatDrawingMeasurement(
  valueMeters: number,
  style: DimensionStyleState,
): string {
  const converted =
    modelMetersToDrawingUnit(
      valueMeters,
      style.unit,
    );
  const fixed =
    converted.toFixed(
      Math.max(
        0,
        Math.min(
          8,
          style.precision,
        ),
      ),
    );
  const unit =
    style.showUnit
      ? ` ${drawingUnitLabel(style.unit)}`
      : "";
  const tolerance =
    style.toleranceUpper !== undefined
    || style.toleranceLower !== undefined
      ? ` +${formatTolerance(style.toleranceUpper ?? 0, style)} / -${formatTolerance(Math.abs(style.toleranceLower ?? 0), style)}`
      : "";

  return `${style.prefix}${fixed}${unit}${style.suffix}${tolerance}`;
}

function formatTolerance(
  valueMeters: number,
  style: DimensionStyleState,
): string {
  return modelMetersToDrawingUnit(
    valueMeters,
    style.unit,
  ).toFixed(
    Math.max(
      0,
      Math.min(
        8,
        style.precision,
      ),
    ),
  );
}
