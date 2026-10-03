# FrameLogic Information Standard v1

**Status:** Architecture target / approved design baseline  
**Version:** 1.0  
**Scope:** Piece library, reusable assemblies, complete project model, IFC exchange and ISO 19650-aligned information management.

---

## 1. Purpose

This document defines the information architecture for FrameLogic at three reusable levels:

1. **PieceDefinition** — one reusable individual piece.
2. **AssemblyDefinition** — one reusable assembly made of pieces and/or other assemblies.
3. **ProjectModel** — the complete editable project containing placed piece and assembly instances.

The standard also defines:

- definition vs. instance identity;
- local coordinate systems and transformations;
- persistent snap points;
- reference axes;
- material and physical properties;
- multi-currency sale and daily-rental pricing;
- recursive/nested assemblies;
- IFC mapping rules;
- ISO 19650 information-container metadata;
- validation and versioning rules.

This is the target domain model. The current implementation may contain only a subset of these fields.

---

## 2. Normative and technical references

FrameLogic targets the following standards for interoperability and information management:

- **ISO 16739-1:2024** — Industry Foundation Classes (IFC), Part 1: Data schema.
- **IFC 4.3.2.0 / IFC4X3_ADD2** — official buildingSMART documentation corresponding to the ISO IFC 4.3 schema.
- **ISO 19650-1:2018** — information-management concepts and principles.
- **ISO 19650-2:2018** — information management during the delivery phase.
- **ISO 19650-4:2022** — detailed information-exchange process and criteria.
- **ISO 4217** — three-letter currency codes used by FrameLogic pricing records.

Reference URLs:

- https://www.iso.org/standard/84123.html
- https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/
- https://www.iso.org/standard/68078.html
- https://www.iso.org/standard/68080.html
- https://www.iso.org/standard/78246.html

At the date of this specification, ISO 19650-1:2018 and ISO 19650-2:2018 remain current published editions while second editions are under development. FrameLogic SHALL keep ISO-19650-specific coding configurable so future editions or national/project conventions can be adopted without changing the core piece/assembly model.

---

## 3. Fundamental architecture

FrameLogic distinguishes **definitions** from **instances**.

A definition answers:

> What is this reusable object?

An instance answers:

> Which occurrence is this, and where is it located?

The hierarchy is:

```text
PieceDefinition
    ↓
PieceInstance

PieceDefinition(s)
    ↓
AssemblyDefinition
    ↓
AssemblyInstance

PieceInstance(s) + AssemblyInstance(s)
    ↓
ProjectModel
    ↓
Complete IFC exchange
```

A definition MUST NOT be duplicated merely because the same piece or assembly appears at multiple positions.

---

## 4. Common data types

### 4.1 Vector3Data

```ts
interface Vector3Data {
  x: number;
  y: number;
  z: number;
}
```

### 4.2 TransformData

```ts
interface TransformData {
  position: Vector3Data;
  rotation: Vector3Data;
}
```

Rotation storage MAY initially remain Euler-based to match the existing FrameLogic domain. Serialization SHALL document the rotation order when persisted externally.

### 4.3 Identity

```ts
interface DefinitionIdentity {
  name: string;
  code: string;
  description?: string;
  revision: string;
}
```

Rules:

- `code` identifies the engineering/commercial definition.
- `revision` is the technical revision of the definition.
- A definition revision is NOT the same as an ISO 19650 information-container revision.
- `id` is an immutable internal UUID and is separate from `code`.

### 4.4 Coordinate system

```ts
interface LocalCoordinateSystem {
  origin: Vector3Data;
  xAxis: Vector3Data;
  yAxis: Vector3Data;
  zAxis: Vector3Data;
}
```

Rules:

- axes MUST be non-zero;
- axes SHOULD be normalized;
- X/Y/Z SHOULD form an orthonormal right-handed basis;
- all persistent snaps and reference geometry SHALL use definition-local coordinates.

### 4.5 Reference axis

```ts
type ReferenceAxisType =
  | "MAIN"
  | "HOLE"
  | "CONNECTION"
  | "REFERENCE";

interface ReferenceAxisLine {
  id: string;
  name: string;
  type: ReferenceAxisType;
  origin: Vector3Data;
  direction: Vector3Data;
  length?: number;
}
```

Reference axes are non-physical engineering geometry.

They SHALL:

- remain available even when hidden visually;
- be displayed in a dedicated **Reference Axes** layer;
- be exportable to IFC as `Axis` geometry where valid for the target IFC entity;
- never be merged into the physical `Body` geometry.

Visibility is a UI state, not domain existence.

### 4.6 Persistent snap point

```ts
type PersistentSnapType =
  | "ORIGIN"
  | "CENTER"
  | "CONNECTION"
  | "REFERENCE"
  | "CUSTOM";

interface PieceSnapPoint {
  id: string;
  name: string;
  type: PersistentSnapType;
  position: Vector3Data;
  relatedAxisId?: string;
}
```

Persistent snaps are different from automatically detected geometric snaps.

FrameLogic currently supports automatic:

- ENDPOINT
- MIDPOINT
- CENTER

Automatic snaps MAY be recomputed from geometry and do not need to be stored individually.

Persistent snaps SHALL:

- be stored with the definition;
- use local coordinates;
- have unique IDs within their definition;
- be visually represented by a dedicated point/helper;
- be displayed in a dedicated **Snap Manual** layer;
- remain usable for snapping when their display layer is hidden.

A snap MAY reference an axis using `relatedAxisId`, for example a hole center associated with its hole axis.

### 4.7 Pricing

```ts
interface CurrencyPricing {
  currency: string;
  salePrice?: number;
  dailyRentalPrice?: number;
}

interface DefinitionPricing {
  currencies: CurrencyPricing[];
}
```

Rules:

- `currency` SHALL use an uppercase ISO 4217 three-letter code, e.g. USD, COP, EUR.
- each currency SHALL occur at most once in a definition;
- `salePrice` and `dailyRentalPrice` are independent commercial values;
- prices in different currencies MUST NOT be assumed to be exchange-rate conversions of one another;
- prices MUST be zero or positive.

One-currency example:

```ts
pricing: {
  currencies: [
    {
      currency: "USD",
      salePrice: 850.00,
      dailyRentalPrice: 7.50,
    },
  ],
}
```

Two-currency example:

```ts
pricing: {
  currencies: [
    {
      currency: "USD",
      salePrice: 850.00,
      dailyRentalPrice: 7.50,
    },
    {
      currency: "COP",
      salePrice: 3_500_000,
      dailyRentalPrice: 32_000,
    },
  ],
}
```

---

# LEVEL 1 — PIECE

## 5. PieceDefinition

A `PieceDefinition` represents one reusable engineering piece, independent of where or how many times it is used.

Examples:

- plate;
- profile;
- bracket;
- manufactured component;
- special connector;
- accessory.

Target structure:

```text
PieceDefinition
├─ id
├─ Identity
│  ├─ name
│  ├─ code
│  ├─ description
│  └─ revision
├─ Geometry
│  ├─ sourceSTEP
│  ├─ processedGeometry
│  └─ units
├─ CoordinateSystem
│  ├─ origin
│  ├─ xAxis
│  ├─ yAxis
│  └─ zAxis
├─ ReferenceGeometry
│  └─ axisLines[]
├─ Material
│  ├─ name
│  ├─ standard
│  ├─ grade
│  └─ density
├─ PhysicalProperties
│  ├─ volume
│  ├─ surfaceArea
│  ├─ mass
│  └─ massSource
├─ SnapPoints[]
└─ Pricing
   └─ currencies[]
      ├─ currency
      ├─ salePrice
      └─ dailyRentalPrice
```

### 5.1 Geometry

```ts
type PieceGeometrySource =
  | "STEP"
  | "IFC"
  | "NATIVE";

interface PieceGeometry {
  sourceType: PieceGeometrySource;
  sourceAssetId?: string;
  processedGeometryAssetId: string;
  units: "mm" | "m";
}
```

The original STEP SHOULD be retained as a source asset for traceability and reprocessing.

Processed geometry is the geometry FrameLogic uses for rendering/export and MAY contain multiple representations internally, such as:

- exact CAD/B-Rep data;
- topology data;
- render mesh;
- bounding box;
- thumbnail.

The STEP source itself is not required to be opened in the main project model. A piece-editing workflow may process one STEP at a time and store the resulting `PieceDefinition` in the library.

### 5.2 Material

```ts
interface PieceMaterial {
  name?: string;
  standard?: string;
  grade?: string;
  density?: number;
}
```

Density SHOULD use kg/m³ internally.

### 5.3 Physical properties

```ts
interface PiecePhysicalProperties {
  volume: number;
  surfaceArea: number;
  mass: number;
  massSource: "CALCULATED" | "MANUAL";
}
```

Canonical SI storage is recommended:

- volume: m³
- surface area: m²
- mass: kg

Displayed units MAY differ.

When `massSource === "CALCULATED"`, mass is normally derived from geometry volume and material density.

### 5.4 Proposed TypeScript contract

```ts
interface PieceDefinition {
  id: string;
  identity: DefinitionIdentity;
  geometry: PieceGeometry;
  coordinateSystem: LocalCoordinateSystem;
  referenceGeometry: {
    axisLines: ReferenceAxisLine[];
  };
  material: PieceMaterial;
  physicalProperties: PiecePhysicalProperties;
  snapPoints: PieceSnapPoint[];
  pricing: DefinitionPricing;
}
```

---

## 6. PieceInstance

A `PieceInstance` represents one occurrence of a `PieceDefinition`.

```ts
interface PieceInstance {
  id: string;
  definitionId: string;
  transform: TransformData;
  tags: readonly string[];
}
```

Rules:

- every instance has its own immutable `id`;
- many instances MAY reference the same `definitionId`;
- moving/rotating one instance MUST NOT modify its definition;
- all definition snaps and axes are transformed into world coordinates through the instance transform.

Example:

```text
PieceDefinition PL-001
├─ PieceInstance PI-001 at position A
├─ PieceInstance PI-002 at position B
└─ PieceInstance PI-003 at position C
```

Only one geometry/definition needs to be stored.

---

# LEVEL 2 — ASSEMBLY

## 7. AssemblyDefinition

An `AssemblyDefinition` represents a reusable composition of pieces and/or other assemblies.

Target structure:

```text
AssemblyDefinition
├─ id
├─ Identity
├─ CoordinateSystem
├─ Components[]
│  ├─ PieceComponent
│  └─ AssemblyComponent
├─ ReferenceGeometry
│  └─ axisLines[]
├─ SnapPoints[]
├─ PhysicalProperties
└─ Pricing
   └─ currencies[]
      ├─ currency
      ├─ salePrice
      └─ dailyRentalPrice
```

### 7.1 Components

```ts
interface PieceAssemblyComponent {
  id: string;
  kind: "PIECE";
  definitionId: string;
  transform: TransformData;
}

interface NestedAssemblyComponent {
  id: string;
  kind: "ASSEMBLY";
  definitionId: string;
  transform: TransformData;
}

type AssemblyComponent =
  | PieceAssemblyComponent
  | NestedAssemblyComponent;
```

Every component transform is expressed relative to the assembly's local coordinate system.

### 7.2 Nested assemblies

Nested assemblies are explicitly supported.

Valid:

```text
ASM-A
└─ ASM-B
   └─ ASM-C
      └─ Piece
```

Invalid:

```text
ASM-A
└─ ASM-B
   └─ ASM-A   ← cycle
```

Rules:

- recursive assembly composition is allowed;
- circular references are forbidden;
- validation MUST reject direct and indirect cycles before saving;
- a component definition MUST exist before the assembly is considered valid.

### 7.3 Assembly snaps and axes

An assembly MAY expose its own persistent snap points and reference axes independently of component snaps.

Examples:

- mounting point;
- overall center;
- lifting point;
- connection point;
- main structural axis.

Component snaps remain available through transform composition, but assembly-level snaps provide a stable external interface for inserting and connecting the complete assembly.

### 7.4 Assembly physical properties

```ts
interface AssemblyPhysicalProperties {
  totalVolume: number;
  totalMass: number;
  grossSurfaceArea?: number;
}
```

These values SHOULD normally be derived recursively from components.

`grossSurfaceArea` means the sum of component surface areas and does not imply removal of contact/internal surfaces.

### 7.5 Assembly material

An assembly does NOT have to have one material because components may use different materials.

Material summaries SHOULD be derived from components rather than forcing a single assembly material.

### 7.6 Assembly pricing

Assemblies use the same `DefinitionPricing` structure as pieces.

Assembly prices are commercial definition-level values and do not have to equal the arithmetic sum of component prices.

### 7.7 Proposed TypeScript contract

```ts
interface AssemblyDefinition {
  id: string;
  identity: DefinitionIdentity;
  coordinateSystem: LocalCoordinateSystem;
  components: AssemblyComponent[];
  referenceGeometry: {
    axisLines: ReferenceAxisLine[];
  };
  snapPoints: PieceSnapPoint[];
  physicalProperties: AssemblyPhysicalProperties;
  pricing: DefinitionPricing;
}
```

---

## 8. AssemblyInstance

An `AssemblyInstance` represents one placed occurrence of an `AssemblyDefinition` in the project or inside a higher-level runtime context.

```ts
interface AssemblyInstance {
  id: string;
  definitionId: string;
  transform: TransformData;
  tags: readonly string[];
}
```

The same assembly definition may be inserted many times:

```text
AssemblyDefinition ASM-010
├─ AssemblyInstance AI-001
├─ AssemblyInstance AI-002
└─ AssemblyInstance AI-003
```

World placement of a nested piece is calculated by composing all transforms from its local piece placement through all containing assemblies to the project coordinate system.

---

# LEVEL 3 — PROJECT

## 9. ProjectModel

`ProjectModel` is the complete editable FrameLogic model.

It is the authority for:

- placed piece instances;
- placed assembly instances;
- project coordinate systems;
- project units;
- optional georeferencing;
- project classification and metadata;
- spatial organization;
- references to library definitions;
- read-only external IFC reference models used for coordination/federation.

Target structure:

```text
ProjectModel
├─ Identity
├─ Units
├─ CoordinateSystem
├─ Georeferencing
├─ SpatialStructure
├─ PieceInstances[]
├─ AssemblyInstances[]
├─ ExternalReferences[]
├─ Classification
└─ ProjectProperties
```

### 9.1 Project identity

```ts
interface ProjectIdentity {
  id: string;
  name: string;
  projectNumber: string;
  description?: string;
}
```

A project identity is separate from ISO 19650 container identity.

### 9.2 Project coordinate system

FrameLogic SHOULD work in a stable local engineering coordinate system for graphical precision.

Optional georeferencing SHALL map the local project system to a real-world coordinate reference system.

```ts
interface ProjectGeoreferencing {
  crs?: string;
  eastings?: number;
  northings?: number;
  orthogonalHeight?: number;
  trueNorthRadians?: number;
}
```

Exact IFC CRS mapping will be defined during exporter implementation.

### 9.3 Spatial structure

The internal FrameLogic spatial structure SHOULD remain generic enough for buildings, industrial structures and infrastructure.

IFC export SHALL map project spatial nodes to the most specific valid IFC spatial entities required by the exchange.

### 9.4 External IFC reference models

FrameLogic SHALL support external IFC models supplied by third parties or other authoring software as **read-only project references**.

Typical use case:

```text
External architectural/structural IFC
        ↓
loaded as reference
        ↓
positioned / coordinated in FrameLogic
        ↓
FrameLogic tower designed relative to it
```

An external reference is NOT:

- a `PieceDefinition`;
- an `AssemblyDefinition`;
- editable FrameLogic-owned geometry;
- automatically part of the authored FrameLogic IFC export.

Proposed contract:

```ts
interface ExternalReferenceModel {
  id: string;

  name: string;

  sourceAssetId: string;

  sourceFormat: "IFC";

  transform: TransformData;

  visible: boolean;

  snapEnabled: boolean;

  locked: true;

  provenance?: {
    originator?: string;
    sourceSystem?: string;
    sourceFileName?: string;
    sourceRevision?: string;
    receivedAt?: string;
    contentHash?: string;
  };

  coordinateReference?: {
    crs?: string;
    sourceUnits?: string;
  };
}
```

Rules:

- the source IFC SHALL remain immutable inside FrameLogic;
- FrameLogic MAY store a local placement transform to coordinate the external model;
- changing the reference placement MUST NOT rewrite the original IFC;
- the reference MAY participate in visual coordination and snapping;
- MOVE/ROTATE/DELETE intended for authored FrameLogic objects MUST NOT modify reference IFC elements;
- the reference SHALL have its own visibility control/layer;
- source provenance SHOULD be retained;
- a content hash SHOULD be retained when available so updated revisions of the external file can be detected;
- reference-model replacement SHOULD preserve the FrameLogic placement when practical;
- georeferencing/shared coordinates SHOULD be preferred over arbitrary manual placement when trustworthy coordinate information is available.

ISO 19650 treats an information model as a set of interrelated information containers and defines federation as combining information from separate sources for a specific purpose. Therefore an external IFC SHOULD normally remain a separate information container rather than being silently absorbed into the FrameLogic-authored model.

### 9.5 Complete project IFC

The editable FrameLogic project SHALL NOT rely on IFC as its only persistence format.

The rule is:

```text
FrameLogic native project/domain data
        ↓
authoritative editable model
        ↓
Export
        ↓
Complete PROJECT.ifc
```

The complete project IFC is the interoperability/exchange representation.

It SHALL contain, as applicable:

- one `IfcProject` root/context;
- units and geometric representation context;
- optional georeferencing;
- spatial hierarchy;
- piece occurrences;
- assembly occurrences;
- nested assembly decomposition;
- materials;
- quantities;
- reference axes where applicable;
- FrameLogic extension properties needed for round-trip semantics.

---

# 10. IFC mapping policy

## 10.1 IFC target

FrameLogic v1 targets:

- ISO 16739-1:2024;
- IFC 4.3.2.0 / IFC4X3_ADD2.

The exporter SHALL prefer standard IFC entities and properties whenever IFC already represents the concept.

Custom FrameLogic properties are only used where IFC does not provide the required FrameLogic semantic directly.

## 10.2 Piece mapping

Mapping policy:

- use the most specific valid IFC element/type class for the engineering piece;
- use a generic fallback only when no more specific IFC class is appropriate;
- reusable definition-level data SHOULD map to an IFC type object when appropriate;
- occurrences map to corresponding IFC element occurrences;
- physical geometry uses the `Body` representation;
- product placement maps the instance coordinate system/transform;
- material maps to `IfcMaterial` and appropriate material association;
- physical quantities use IFC quantity mechanisms where applicable.

The same FrameLogic definition used by multiple instances SHOULD reuse type-level semantics and geometry mapping rather than being treated as unrelated definitions.

## 10.3 Assembly mapping

Preferred mapping:

```text
AssemblyDefinition → IfcElementAssemblyType
AssemblyInstance   → IfcElementAssembly
components         → decomposition/aggregation relationships
```

IFC explicitly supports assemblies made from multiple elements and nested assemblies.

Nested FrameLogic assemblies SHALL therefore preserve hierarchy in IFC rather than being flattened into a single mesh unless an explicit export mode requests flattening.

## 10.4 Project mapping

```text
ProjectModel → IfcProject context + complete project exchange structure
```

`IfcProject` supplies the exchange context, including units, project coordinate system, representation context and optional geospatial mapping.

## 10.5 Library exports

FrameLogic may store pieces and assemblies in a reusable library independently from projects.

For IFC library exchange, `IfcProjectLibrary` SHOULD be considered for reusable type libraries.

A standalone piece/assembly preview exchange MAY alternatively include a minimal project context plus a single occurrence. The exporter implementation SHALL expose the intended mode explicitly rather than conflating library definitions with project occurrences.

---

# 11. IFC geometry representations

## 11.1 Body

Physical piece geometry maps to an IFC `Body` representation.

The source STEP SHOULD not be treated as the IFC body itself; it is a source asset from which FrameLogic produces an appropriate IFC geometric representation.

## 11.2 Axis

Reference axes are separate from physical geometry.

For IFC entities where the standard allows an `Axis` representation, FrameLogic SHOULD export a compatible line/bounded curve using:

```text
RepresentationIdentifier = "Axis"
```

FrameLogic SHALL NOT assume every arbitrary reference axis is guaranteed to be displayed by every IFC viewer. Visual display is viewer-dependent even when the axis is valid IFC data.

## 11.3 Faces

Face-aware snapping/reference faces are explicitly OUT OF SCOPE for v1.

FrameLogic v1 relies on:

- automatic ENDPOINT;
- automatic MIDPOINT;
- automatic CENTER;
- persistent manual snap points;
- reference axes.

---

# 12. FrameLogic IFC extensions

IFC-defined property sets reserve the `Pset_` prefix.

Therefore FrameLogic custom property sets MUST NOT use the `Pset_` prefix.

Allowed examples:

```text
FrameLogic_Identity
FrameLogic_Pricing
FrameLogic_SnapPoints
FrameLogic_ReferenceGeometry
```

Not allowed:

```text
Pset_FrameLogicPricing
Pset_FrameLogicSnapPoints
```

### 12.1 Pricing extension

Semantic contract:

```text
FrameLogic_Pricing
└─ currencies[]
   ├─ currency
   ├─ salePrice
   └─ dailyRentalPrice
```

The exact IFC encoding of repeated currency records will be finalized with the IFC exporter. The domain contract above is authoritative and MUST remain independent from the selected transport encoding.

### 12.2 Snap extension

Persistent snap semantics MUST survive FrameLogic round-trip exchange.

The IFC exporter SHALL include:

- schema/version identifier for the FrameLogic snap payload;
- snap ID;
- snap name;
- snap type;
- local XYZ;
- optional related axis ID.

The exact IFC property encoding MAY evolve as long as the semantic contract remains backward-readable.

---

# 13. ISO 19650 information-management layer

ISO 19650 metadata is NOT part of `PieceDefinition` or `AssemblyDefinition` identity.

It belongs to the exchanged/published information container.

Conceptual model:

```ts
interface InformationContainerMetadata {
  containerId: string;
  revision: string;
  state: string;
  purpose?: string;
  originator: string;
  createdAt: string;
  modifiedAt?: string;
  approvedBy?: string;
  classification?: {
    system: string;
    code: string;
    description?: string;
  };
}
```

Important distinction:

```text
PieceDefinition.identity.revision
= technical revision of the reusable piece.

InformationContainerMetadata.revision
= revision of the exchanged information container.
```

These values MUST NOT be conflated.

FrameLogic SHALL support the ISO 19650 concepts of information exchange, recording, versioning and organization.

Exact container naming fields, status codes, suitability/purpose codes and approval conventions SHALL be project-configurable because implementations may depend on project requirements, appointments and national conventions.

---

# 14. Exchange containers at all three levels

Each level MAY be independently exchanged.

## 14.1 Piece exchange

```text
InformationContainer
├─ ISO 19650 metadata
└─ Piece IFC
   ├─ reusable definition/type
   ├─ Body
   ├─ Axis where applicable
   ├─ material
   ├─ quantities
   ├─ persistent snaps
   └─ pricing
```

## 14.2 Assembly exchange

```text
InformationContainer
├─ ISO 19650 metadata
└─ Assembly IFC
   ├─ IfcElementAssemblyType / occurrence as appropriate
   ├─ component hierarchy
   ├─ nested assemblies
   ├─ component pieces
   ├─ assembly snaps
   ├─ assembly axes
   └─ pricing
```

## 14.3 Project exchange

```text
InformationContainer
├─ ISO 19650 metadata
└─ PROJECT.ifc
   ├─ IfcProject
   ├─ units/context
   ├─ georeferencing
   ├─ spatial structure
   ├─ PieceInstances
   ├─ AssemblyInstances
   └─ nested decomposition

External reference IFCs remain separate exchange/source containers by default.
```

---

# 15. Visual helper layers

The FrameLogic viewport SHALL conceptually separate physical and auxiliary data.

Initial layers:

```text
Geometry
Snap Manual
Reference Axes
Selection
```

Rules:

- hiding `Snap Manual` only changes visualization; persistent snap points remain active;
- hiding `Reference Axes` only changes visualization; axes remain in the definition;
- helper geometry is not physical body geometry;
- helper objects SHALL NOT affect mass, volume or surface area.

---

## 15.1 Project layer system

Layers are project/model-space organization. They belong to **placed objects**, not reusable library definitions.

The rule is:

```text
PieceDefinition
AssemblyDefinition
→ no project layer membership

PieceInstance
AssemblyInstance
CadPoint
CadLine
ExternalReferenceModel
→ layerId
```

This allows two occurrences of the same reusable definition to belong to different layers.

Example:

```text
PieceDefinition PL-001
├─ PI-001 → layer "Level 1"
├─ PI-002 → layer "Level 3"
└─ PI-003 → layer "Temporary Works"
```

A project layer has the following core state:

```ts
interface DesignLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  snapEnabled: boolean;
  system: boolean;
}
```

Rules:

- `visible = false` hides every placed object assigned to the layer;
- `locked = true` prevents selection/editing of FrameLogic-authored objects on the layer;
- `snapEnabled = false` prevents objects on the layer from providing SNAP candidates;
- hiding a layer does not delete its objects;
- locking a layer does not remove or alter its geometry;
- reusable definitions are not modified when an instance changes layer;
- world/global coordinates are derived from instance transforms and hierarchy, not duplicated in definitions.

Initial system layers are:

```text
Geometry
Reference CAD
Snap Manual
Reference Axes
External References
```

New FrameLogic piece instances default to `Geometry` unless another layer is explicitly supplied.

Future `CadPoint` and `CadLine` creation defaults to the currently active CAD layer, initially `Reference CAD`.

External read-only IFC reference models default to `External References`.

Deleting a user-created layer SHALL first reassign its placed objects to an appropriate valid fallback layer. System layers SHALL NOT be deletable.

## 15.2 CAD WorkPlane

FrameLogic SHALL provide the following initial CAD work planes:

```text
XY
XZ
YZ
OFF
```

The active WorkPlane is a model-space construction aid and SHALL be displayed visually as auxiliary grid geometry.

Initial origin:

```text
(0, 0, 0)
```

Initial mode:

```text
XY
```

The user can cycle:

```text
XY → XZ → YZ → OFF → XY
```

The active WorkPlane defines where a free pointer click can produce a 3D construction point.

Rules for future POINT and LINE commands:

- when a WorkPlane is active, a free click is projected/intersected onto the active plane;
- POINT and LINE may use an exact SNAP located anywhere in 3D even when that SNAP is not on the active WorkPlane;
- a valid 3D SNAP therefore takes precedence over WorkPlane projection;
- with WorkPlane `OFF`, free pointer placement is disabled;
- with WorkPlane `OFF`, LINE construction by pointer requires valid SNAP points;
- typed coordinate input remains an explicit coordinate method and will be handled separately by the POINT/LINE input controller;
- the WorkPlane is auxiliary construction geometry and is not part of physical IFC Body geometry.

This rule allows a line to use planar construction for ordinary free placement while still connecting to semantic geometry located anywhere in 3D.

# 16. Identity and uniqueness rules

## 16.1 Definition identity

```text
PieceDefinition.id
AssemblyDefinition.id
```

are immutable internal identifiers.

Engineering codes SHOULD be unique within the relevant library namespace.

## 16.2 Instance identity

```text
PieceInstance.id
AssemblyInstance.id
```

identify individual occurrences.

Two identical pieces at different coordinates MUST have different instance IDs while sharing the same definition ID.

## 16.3 Component identity

Components inside an assembly have their own component IDs.

Example:

```text
AssemblyDefinition ASM-001
├─ AC-001 → PieceDefinition PL-001
├─ AC-002 → PieceDefinition PL-001
└─ AC-003 → AssemblyDefinition ASM-002
```

`AC-001` and `AC-002` are two separate uses of the same definition inside the assembly.

---

# 17. Transformation rules

All transforms are relative to their immediate parent.

```text
Project
└─ AssemblyInstance transform
   └─ NestedAssemblyComponent transform
      └─ PieceComponent transform
         └─ SnapPoint local position
```

World coordinates are obtained by composing the complete transform chain.

A definition SHALL NOT store project/world placement.

---

# 18. Validation rules

A saved/published model is valid only if all applicable rules pass.

### PieceDefinition

- ID exists and is unique.
- Code exists.
- Name exists.
- Revision exists.
- Processed geometry asset exists.
- Coordinate system is valid.
- Snap IDs are unique.
- Axis IDs are unique.
- `relatedAxisId`, when present, resolves within the same definition.
- Physical values are non-negative.
- Material density, when present, is positive.
- Currency codes are unique and normalized.
- Prices are non-negative.

### PieceInstance

- ID is unique.
- `definitionId` resolves.
- transform values are finite.

### AssemblyDefinition

- ID/code/name/revision exist.
- all component IDs are unique within the assembly.
- every piece component definition resolves.
- every nested assembly definition resolves.
- the assembly dependency graph contains no cycles.
- local snaps/axes satisfy the same uniqueness rules as pieces.

### AssemblyInstance

- ID is unique.
- `definitionId` resolves.
- transform values are finite.

### ProjectModel

- all instance references resolve;
- all referenced definitions are available;
- project units are defined;
- project coordinate context is defined;
- spatial parents, if used, resolve;
- IFC export validation succeeds before publication.

---

# 19. Versioning

FrameLogic domain schemas SHALL carry a schema version independent from engineering revision.

Recommended:

```ts
interface FrameLogicSchemaHeader {
  schema: "FrameLogicInformationModel";
  version: "1.0";
}
```

Meaning:

- schema version = structure of FrameLogic data;
- definition revision = engineering revision of a piece/assembly;
- information-container revision = ISO 19650 exchange revision.

All three are separate concerns.

---

# 20. Current implementation vs target model

Current FrameLogic already contains the foundations:

- `AssetDefinition`;
- `PieceDefinition`;
- `PieceInstance`;
- `Assembly`;
- `DesignModel`;
- reusable geometry assets;
- piece definition → piece instance references;
- transforms;
- automatic ENDPOINT / MIDPOINT / CENTER snapping;
- MOVE and ROTATE workflows.

The current `Assembly` model references concrete `pieceInstanceIds`. The v1 target architecture evolves this into reusable:

```text
AssemblyDefinition
+
AssemblyInstance
```

with components defined relative to the assembly.

This migration SHOULD be implemented incrementally to preserve existing MOVE, ROTATE, SNAP, DELETE and history behavior.

---

# 21. Recommended implementation sequence

1. Introduce shared v1 domain value objects:
   - identity;
   - coordinate system;
   - reference axes;
   - persistent snaps;
   - pricing;
   - physical properties.

2. Extend `PieceDefinition` while preserving existing `id`, `code`, `name` and `geometryAssetId` compatibility.

3. Implement visual **Snap Manual** and **Reference Axes** helper layers.

4. Add piece-editor workflow for STEP:
   - ingest STEP;
   - preserve source asset;
   - process geometry;
   - define origin;
   - define material;
   - calculate physical properties;
   - define persistent snaps/axes;
   - save to library.

5. Introduce `AssemblyDefinition` and `AssemblyInstance`.

6. Add recursive assembly validation and transform resolution.

7. Introduce `ProjectModel` persistence and optional georeferencing.

8. Implement IFC 4.3 exporter:
   - piece;
   - assembly;
   - complete project.

9. Add ISO 19650 `InformationContainerMetadata` to exchange/publication workflow.

10. Add IFC round-trip tests for FrameLogic extension data.

---

# 22. Decisions intentionally deferred

The following are NOT part of v1:

- face snapping;
- reference faces;
- face-to-face constraints;
- mate/concentric constraints;
- weekly/monthly rental rates;
- deposits;
- internal production cost;
- transport cost;
- sales margin;
- automatic FX conversion;
- ERP integration;
- fabrication process modeling;
- welding/bolt connection semantics beyond ordinary piece/assembly composition.

These may be added later without changing the three-level architecture.

---

# 23. Canonical architecture summary

```text
FRAMELOGIC LIBRARY
│
├─ PieceDefinition
│  ├─ Identity
│  ├─ Geometry
│  ├─ CoordinateSystem
│  ├─ ReferenceGeometry.axisLines[]
│  ├─ Material
│  ├─ PhysicalProperties
│  ├─ SnapPoints[]
│  └─ Pricing.currencies[]
│
└─ AssemblyDefinition
   ├─ Identity
   ├─ CoordinateSystem
   ├─ Components[]
   │  ├─ PieceComponent
   │  └─ AssemblyComponent
   ├─ ReferenceGeometry.axisLines[]
   ├─ SnapPoints[]
   ├─ PhysicalProperties
   └─ Pricing.currencies[]

FRAMELOGIC PROJECT
│
└─ ProjectModel
   ├─ Identity
   ├─ Units
   ├─ CoordinateSystem
   ├─ Georeferencing
   ├─ SpatialStructure
   ├─ PieceInstances[]
   ├─ AssemblyInstances[]
   └─ ExternalReferences[]

INFORMATION EXCHANGE
│
├─ InformationContainerMetadata
│  └─ ISO 19650-aligned exchange metadata
│
└─ IFC 4.3 / ISO 16739-1:2024
   ├─ piece exchange
   ├─ assembly exchange
   └─ complete project exchange
```

---

## 24. Architectural rule

**FrameLogic domain data is the editable source of truth. IFC is the interoperable exchange representation. ISO 19650 governs the management and exchange context of that information.**

This separation MUST be preserved as the application evolves.
