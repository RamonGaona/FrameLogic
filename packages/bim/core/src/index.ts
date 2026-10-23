export {
  createBimCore,
} from "./engine/createFrameLogicBimCorePrecision";

export type {
  PrecisionBimCoreInstance,
} from "./engine/createFrameLogicBimCorePrecision";

export {
  addSceneHelpers,
} from "./helpers/addSceneHelpers";

export type {
  SceneHelpers,
} from "./helpers/addSceneHelpers";

export {
  DesignSceneController,
} from "./design/DesignSceneController";

export type {
  LoadedModelInfo,
  ModelRole,
  ModelSource,
} from "./models/LoadedModel";

export {
  DesignPlacementController,
} from "./interaction/DesignPlacementController";

export type {
  DesignSurfaceHit,
  DesignSurfacePicker,
} from "./interaction/DesignPlacementController";

export type {
  BimCoreInstance,
  ImportDesignPieceIfcInput,
  StandardView,
  CardinalDirection,
  CameraOrientation,
  CameraProjectionMode,
} from "./engine/createBimCore";

export {
  DesignSelectionController,
} from "./interaction/DesignSelectionController";

export type {
  DesignSelectionListener,
} from "./interaction/DesignSelectionController";

export {
  DesignTransformController,
} from "./interaction/DesignTransformController";

export type {
  DesignTransformMode,
} from "./interaction/DesignTransformController";

export type {
  CadCommand,
} from "./commands/CadCommand";

export {
  CadCommandManager,
} from "./commands/CadCommandManager";

export {
  MoveCommand,
} from "./commands/MoveCommand";

export {
  DesignRotateController,
} from "./interaction/DesignRotateController";

export {
  RotateCommand,
} from "./commands/RotateCommand";

export {
  CadHistoryController,
} from "./interaction/CadHistoryController";

export type {
  CadTransformSnapshot,
  CadTransformState,
} from "./interaction/CadHistoryController";

export {
  DeleteCommand,
} from "./commands/DeleteCommand";

export {
  DesignSnapController,
} from "./interaction/DesignSnapController";

export type {
  DesignSnapResult,
  DesignSnapType,
} from "./interaction/DesignSnapController";

export {
  GeometryQueryEngine,
} from "./precision/GeometryQueryEngine";

export type {
  GeometryPrecision,
  GeometryQueryContext,
  GeometryQueryKind,
  GeometryQueryOptions,
  GeometryQueryProvider,
  GeometryQueryResult,
} from "./precision/GeometryQueryEngine";

export {
  PrecisionSnapEngine,
} from "./precision/PrecisionSnapEngine";

export type {
  PrecisionSnapDetails,
} from "./precision/PrecisionSnapEngine";

export {
  MeasurementEngine,
} from "./precision/MeasurementEngine";

export type {
  AngleMeasurement,
  DistanceMeasurement,
  PointToPlaneMeasurement,
  PointToSegmentMeasurement,
} from "./precision/MeasurementEngine";

export {
  PrecisionCameraController,
} from "./precision/PrecisionCameraController";

export type {
  PrecisionCameraControls,
} from "./precision/PrecisionCameraController";

export {
  StepEngineeringFeatureProvider,
} from "./precision/StepEngineeringFeatureProvider";

export {
  registerStepDocumentEngineering,
} from "./step/StepEngineeringBridge";

export {
  FrameLogicEngineeringModel,
  PieceEngineeringRegistry,
  AssemblyDefinitionRegistry,
  buildStructuralModel,
} from "@framelogic/domain";

export type {
  AddAssemblyComponentInput,
  AddAssemblyConstraintInput,
  AssemblyComponentDefinition,
  AssemblyConstraint,
  AssemblyConstraintEndpoint,
  AssemblyConstraintType,
  AssemblyDefinition,
  AssemblyEngineeringSummary,
  EngineeringDataSource,
  PieceCommercialData,
  PieceEngineeringData,
  PieceEngineeringFeature,
  PieceHoleFeature,
  PieceMaterialData,
  PiecePhysicalData,
  PlacedStructuralAxis,
  RegisterAssemblyDefinitionInput,
  StructuralAxisDefinition,
  StructuralMember,
  StructuralModel,
  StructuralNode,
  StructuralSectionData,
  UpsertPieceEngineeringInput,
} from "@framelogic/domain";

export type {
  CreateDesignLayerInput,
  DesignLayer,
  DesignLayerListener,
  UpdateDesignLayerInput,
} from "@framelogic/domain";

export {
  CadWorkPlaneController,
} from "./interaction/CadWorkPlaneController";

export type {
  CadWorkPlaneListener,
  CadWorkPlaneMode,
  CadWorkPlaneState,
} from "./interaction/CadWorkPlaneController";

export {
  CadWorkPlaneEditController,
} from "./interaction/CadWorkPlaneEditController";

export type {
  CadWorkPlaneEditListener,
  CadWorkPlaneEditMode,
  CadWorkPlaneEditState,
} from "./interaction/CadWorkPlaneEditController";

export {
  CadPointSceneController,
} from "./design/CadPointSceneController";

export {
  CadPointPlacementController,
} from "./interaction/CadPointPlacementController";

export {
  PointCommand,
} from "./commands/PointCommand";

export type {
  CadPoint,
  CadPointPosition,
  RegisterCadPointInput,
} from "@framelogic/domain";

export {
  CadPointSelectionController,
} from "./interaction/CadPointSelectionController";

export type {
  CadPointSelectionListener,
} from "./interaction/CadPointSelectionController";

export {
  CadPointMoveController,
} from "./interaction/CadPointMoveController";

export {
  MoveCadPointCommand,
} from "./commands/MoveCadPointCommand";

export {
  DeleteCadPointCommand,
} from "./commands/DeleteCadPointCommand";

export {
  CadWindowSelectionController,
} from "./interaction/CadWindowSelectionController";

export {
  CadLineSceneController,
} from "./design/CadLineSceneController";

export {
  CadLineSelectionController,
} from "./interaction/CadLineSelectionController";

export type {
  CadLineSelectionListener,
} from "./interaction/CadLineSelectionController";

export {
  CadLinePlacementController,
} from "./interaction/CadLinePlacementController";

export {
  CadLineMoveController,
} from "./interaction/CadLineMoveController";

export {
  LineCommand,
} from "./commands/LineCommand";

export {
  MoveCadLineCommand,
} from "./commands/MoveCadLineCommand";

export {
  DeleteCadLineCommand,
} from "./commands/DeleteCadLineCommand";

export type {
  CadLine,
  CadLinePosition,
  RegisterCadLineInput,
} from "@framelogic/domain";

export {
  CadUnifiedSelectionController,
} from "./interaction/CadUnifiedSelectionController";

export type {
  CadSelectableEntityType,
  CadSelectionItem,
  CadSelectionState,
  CadUnifiedSelectionListener,
} from "./interaction/CadUnifiedSelectionController";

export {
  CadMixedMoveController,
} from "./interaction/CadMixedMoveController";

export {
  MoveMixedSelectionCommand,
} from "./commands/MoveMixedSelectionCommand";

export {
  DeleteMixedSelectionCommand,
} from "./commands/DeleteMixedSelectionCommand";

export {
  PieceDefinitionPreparationController,
} from "./interaction/PieceDefinitionPreparationController";

export type {
  PieceDefinitionPreparationListener,
  PieceDefinitionPreparationState,
} from "./interaction/PieceDefinitionPreparationController";

export {
  PieceDefinitionHelperSceneController,
} from "./design/PieceDefinitionHelperSceneController";

export type {
  LocalCoordinateSystem,
  PersistentSnapType,
  PieceReferenceGeometry,
  PieceSnapPoint,
  PieceVector3Data,
  ReferenceAxisLine,
  ReferenceAxisType,
  AddPieceSnapPointInput,
  AddReferenceAxisLineInput,
} from "@framelogic/domain";

export {
  PieceDefinitionOriginEditController,
} from "./interaction/PieceDefinitionOriginEditController";

export type {
  PieceDefinitionOriginEditListener,
  PieceDefinitionOriginEditState,
} from "./interaction/PieceDefinitionOriginEditController";
