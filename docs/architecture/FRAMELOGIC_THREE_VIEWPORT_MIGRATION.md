# FrameLogic: progressive native Three.js viewport migration

## Decision

FrameLogic uses STEP/OCCT as the source of manufacturing geometry and B-Rep
precision, Three.js for model-space graphics, and That Open for IFC/Fragments
interoperability. A native Three.js viewer is a long-term architectural goal,
not a justification for removing functioning BIM support immediately.

This migration must NOT convert STEP to IFC just for visualization, nor change
the STEP precision model, units (millimeters), drawing views, or project format.

## Phase 1 — isolation (this change)

- Add the FrameLogic-owned `FrameLogicViewportPort` interface exposing native
  Three.js scene, camera, renderer and canvas references.
- Move construction of That Open Worlds, SimpleScene, SimpleRenderer and
  OrthoPerspectiveCamera into `ThatOpenViewportAdapter.ts`.
- Use those functions in `createBimCore.ts` without changing its public API.
- Continue to initialize Components, FragmentsManager, IfcLoader and Mesher as
  before. CAD callers still using `core.world` remain compatible.
- The optional That Open logo remains hidden; third-party license notices
  remain required in distributions.

This phase is an API seam and NOT a speed-up or a switch to a native backend.

## Phase 2 — CAD consumers (first increment v0.1.185)

The user reported seven successful manual regression checks for phase 1
(v0.1.184): STEP/IFC import, camera, views, transformations, exact snaps,
and large assemblies.

FrameLogic now publishes a `core.viewport` Three.js port with **live**
camera/renderer/scene/canvas getters. Unlike a one-time snapshot, it observes
the active camera after switching projection modes. CAD precision, selection,
circle/grip tools, copy/stretch, drawing and navigation entrypoints use this
port for native Three.js handles.

The legacy `core.world` remains available for vendor navigation controls,
orthographic camera access and BIM/Fragments integration. Replacing those
services is a distinct next increment, not completed here. All new CAD tools
should use `core.viewport` for native scene/camera/canvas access.

The release contains tests for camera replacement and CAD integration plus
the existing typecheck, model-space, snap and camera regression suites.
Manual browser tests of v0.1.185 are still required.

## Phase 2 — decouple consumers

1. Replace scattered `core.world.scene.three`, `core.world.renderer.three`,
   and `core.world.camera.three` references with FrameLogic-owned ports.
2. Define a separate CAD camera-controls port covering projection switching,
   azimuth/polar navigation, dolly-to-cursor, setLookAt, and camera change
   notifications, rather than exposing a specific vendor camera.
3. Keep selection, precise snaps, gizmos, local axes, Ctrl-copy, numeric
   input and camera Z-up behavior unchanged.
4. Keep drawing/PDF camera state isolated from Model Space.

## Superseded mitigation: perspective-only (v0.1.186, incorrect)

This section records the now-reversed v0.1.186 assumption. The user clarified that perspective is the failing mode, and orthographic works. The effective restriction is v0.1.187, described below. Do not reintroduce the incorrect perspective-only behavior.

## Temporary Model Space camera restriction (v0.1.187 correction)

**The safe camera is ORTHOGRAPHIC. The broken camera is PERSPECTIVE.**
The earlier v0.1.186 perspective-only restriction was based on a reversed
interpretation of the user's screenshot; it is superseded by v0.1.187.
Model Space initializes in orthographic, hides its O/P projection toggle,
and guards the public toggle API against activating perspective.
Saved perspective camera states load in orthographic without reapplying
possibly stale orthographic zoom from those perspective snapshots.
The separate drawing and PDF orthographic projection engine is unchanged.
Keep this as a temporary mitigation pending investigation of the original
perspective rendering issue with the real STEP assembly.

## Phase 3a — FrameLogic camera controller (v0.1.188)

FrameLogic now owns `FrameLogicCameraController` and a backend-neutral
`FrameLogicCameraDriver` contract. It supplies active-camera access, CAD
tool enable/disable, camera view orientation, look-at, zoom, and update
subscriptions without an import from That Open.

`ThatOpenViewportAdapter.createThatOpenCameraController` is the temporary
implementation, delegating to the existing controls to preserve mouse
navigation and camera lifecycle. The public core API now exposes
`core.cameraNavigation`; the standard orientation controls and CAD tool
locks use it, while specialized orbit/zoom and IFC/Fragments may still rely
on `core.world`.

**Important:** the user verified orthographic is the working camera.
Perspective stays blocked in Model Space. No mode toggle is introduced in
this phase, and Paper Space/PDF projections are unaffected.

Next: migrate specialized navigation operations and camera state restore
through richer port contracts, then implement an opt-in native Three.js
backend after regression and performance checks on real STEP assemblies.

## Phase 3b — native Three.js read-only diagnostic and camera state ports (v0.1.189)

The user reported seven successful manual tests of v0.1.188: orthographic
camera, view cube, snaps after navigation, gizmos, large assemblies, project
reopen, IFC and Paper Space.

A **secondary native Three.js WebGLRenderer** can now be enabled in Model Space
with `?threePreview=1` appended to the deployed application URL. It renders
the existing scene using an independent native orthographic camera cloned from
the active Model Space camera. The read-only overlay has its own renderer,
context and disposal lifecycle; closing it or leaving Model Space must not
dispose any shared STEP/IFC geometry or change the stable viewport.

**This is not yet a full native CAD backend:** it shares the live scene,
borrows the current camera orientation, and cannot edit, select or navigate
independently. IFC/Fragments compatibility has not been validated. Running
two renderers simultaneously uses more GPU memory and their FPS are not
comparable as isolated benchmark results. Without the query opt-in, exactly
one production renderer remains active.

Model Space camera initialization, legacy project camera save/restore and CAD
mouse-button bindings now use the FrameLogic camera controller; the remaining
vendor-specific controls (precision camera, Zoom Extents and related operations)
need their own ports in subsequent phases.

The perspective camera remains disabled, orthographic is the only supported
Model Space projection, and drawing/PDF pipelines are unaffected. Before
using the preview for decisions, visually compare real STEP assemblies and
confirm explicit cleanup on close.

## Phase 3c — standalone native STEP renderer (v0.1.190)

After the user validated the native read-only secondary preview, FrameLogic
introduces `?threeNative=1`: a **separate visual-only route** with a single
THREE.WebGLRenderer, independent native orthographic camera and orbit/pan/zoom
handlers. `App.tsx` lazy-loads either the existing BimViewport or this native
viewer, never both in one tab. The standard CAD viewer has an explicit
experimental switch that warns about unsaved projects; the native viewer has
a return action. The previous `?threePreview=1` overlay remains optional.

STEP files are read through the *existing* OCCT adapter; the standalone
viewer builds its own Three.js meshes in millimetres and disposes its own
GPU resources. It reports measured STEP load time, displayed draw calls,
FPS, geometric counts and optionally the browser's JavaScript heap. System
RAM and VRAM cannot be measured reliably through standard browser APIs.

The standalone viewer does **not** yet support IFC/Fragments or any CAD
editing, selection, snapping, gizmos, project saving or Paper Space. Those
features remain available only in the stable That Open-backed viewport.
Experimental FPS and load metrics should be compared on the same device,
browser, viewport dimensions, and same STEP, with one tab/render backend
active at a time. The OCCT visual-only test excludes exact-feature extraction,
so load times are *not* equivalent to full CAD project import times.

Next: independently mount STEP model collections and later add safe
selection/snap/editing adapters, only after validating exact behaviour and
memory usage on the user's large real-world STEP assemblies.

## Phase 3d — native STEP mesh selection (v0.1.191)

The user confirmed that the standalone native orthographic viewer in v0.1.190
works with a real STEP model. The `?threeNative=1` route now supports
**read-only mesh selection**: a left click without drag raycasts the active
STEP scene, highlights one mesh with reversible emissive material state, and
shows its original STEP file, mesh identifier, approximate world bounds in
millimetres and triangle count. Drag/pan/orbit/wheel remain camera gestures,
and Escape, clicking empty space or reimporting clears the selection.

This is **mesh-level**, not yet a robust CAD part/assembly identity model.
It does not include precise B-Rep snapping, transformations, gizmos,
history/undo, IFC, Fragments, drawings or project persistence. The current
That Open-backed CAD remains unchanged. The standalone viewer still loads
only STEP files and retains a single native WebGL context.

The resource cleanup now disposes the active loaded native model when leaving
this standalone route. Tests cover raycast, safe highlighting, restoration
and release of the selected asset without mutating STEP mesh coordinates.

Next: map mesh selection to semantic part identities and CAD snapping using
the exact STEP B-Rep interface, before migrating gizmos or editing commands.

## Phase 3e — exact STEP B-Rep snap preview (v0.1.192)

The native `?threeNative=1` viewer now reads the same loaded OpenCascade
B-Rep document index used by CAD precision features. During import it indexes
the exact topological vertex coordinates, edge midpoints, analytic circle
centres and cylinder-axis origins (scaled to millimetres using the B-Rep
`modelScale`). On pointer hover, if a STEP mesh is selected, a small marker
and numerical coordinate readout show candidates projected through the native
orthographic camera. Mesh triangulation is **not** used to create alleged
exact snap points; the indexed geometry and camera clip bounds are authoritative.

Native STEP meshes also carry their originating B-Rep document id and product
node identity (when `StepProductNode.geometryIds` references that mesh).
The selected document id scopes snap queries, avoiding hits from separate
imported files even if filenames happen to match.

**Limitations:** B-Rep topology is indexed per STEP document, not per visual
submesh/product. Snap queries therefore may show exact points from other
parts contained in the same file. The markers are read-only; they are not yet
used by gizmos, edits, aligned placements or persistence. Hidden-surface
occlusion and exact edge-nearest/intersection snaps are not solved here.
Large models still require future spatial indexing for scalable hover queries.

The production CAD viewport, IFC/Fragments and Paper Space/PDF continue to
use their established implementations. Only the native experimental route
adds the snap display. Keep the orthographic-only camera safety restriction.

## Phase 3f — STEP product scope and visible B-Rep snaps (v0.1.193)

The user confirmed the native Three.js exact snap marker in v0.1.192
works on their STEP model. The native viewer now creates a scoped,
**read-only selection identity** from the B-Rep document id and unique
`StepProductNode.geometryIds` mapping. A visual mesh referenced by multiple
product nodes, or an ambiguous repeated mesh identifier, must not be assigned
an arbitrary product; it falls back to a session-local visual mesh identity.

Selecting a valid STEP product highlights all of its visual meshes and
restores each material exactly on deselection. The scope contains the
world-space bounding box and a non-mutating pivot for future gizmo controls.

Snap coordinates are still sourced only from exact OpenCascade document
B-Rep geometry. The new conservative gate filters candidates outside the
selected scope bounding box or behind the nearest rendered STEP surface.
The camera is orthographic; sphere/circle centres in genuine openings can
remain visible. The filters only run on nearby candidates during hover.

**Critical precision qualification:** current B-Rep indices do not map
edges/vertices to individual STEP product nodes. Spatial bounds and rendered
occlusion cannot certify per-piece exact topology when parts overlap or
share coincident surfaces. Do not use these provisional visual snap results
for manufacturing transforms. The transform-target contract is explicitly
read-only (`editable: false`), with no gizmo, undo/redo or persistence yet.

The production Model Space viewport, IFC, drawings and PDF remain unchanged.
The next phase needs actual B-Rep subshape-to-product identity or a strict,
proven selection scope before enabling native editing.

## Phase 3g — guarded native XYZ movement experiment (v0.1.194)

After the user validated the product selection and visible snaps in v0.1.193,
FrameLogic adds its first **temporary visual XYZ move gizmo** in
`?threeNative=1`. A target is eligible only if it is a complete, separately
loaded STEP document whose every visible mesh maps unambiguously to the same
STEP product, B-Rep document and source group. Multi-product STEP assemblies,
ambiguous identities and arbitrary submesh selections remain blocked.
Moving one independent STEP file never transforms another loaded file.

The native gizmo is drawn as three independent colored THREE.Mesh handles
outside the model's raycast root, and supports pointer dragging along an
orthographic screen-projected world axis, or a signed numeric distance in mm
when that axis projects edge-on. ESC can cancel an in-progress drag.
Session-local undo and redo revert the exact group positions in a bounded
history; importing another batch invalidates the old history.

**Crucially, this is visual-only placement:** THREE.Group transforms are
applied to the loaded document's display meshes, while the OCCT B-Rep source
remains unchanged. Snap markers project exact B-Rep local coordinates through
the display group matrix so the visual placement stays aligned with visible
snap previews, but *these are not yet authoritative persisted CAD transforms*.
No STEP output, .flproject persistence, geometry editing, rotation, Ctrl-copy
or precision snap destination selection has been implemented in this phase.
Never use experimental moved coordinates for manufacturing decisions.

The stable That Open CAD viewport retains production editing and exact B-Rep
operations, while Paper Space/PDF and IFC/Fragments are unchanged. The native
camera remains orthographic-only. Real production migration requires exact
subshape-to-product identity, authoritative B-Rep transform composition,
persistent undoable project commands and tests on real assemblies.

## Phase 3h — safe Ctrl-copy and exact B-Rep COPYBASE (v0.1.195)

After v0.1.194 movement was validated with real STEP files, the independent
`?threeNative=1` viewer now has **Ctrl + drag to create a separate visual
instance** of a complete isolated STEP file. The source group is never moved
in copy mode; pressing Ctrl midway through an existing move immediately
restores the source before creating the duplicate. Releasing Ctrl does not
turn the operation back into a move. Drag cancellation removes the preview
without touching the original. Signed numeric COPY is supported alongside
signed MOVE.

A fresh `nativeStepInstanceId` separates the STEP visual instances sharing
the same exact B-Rep document. Each duplicate owns independent GPU materials
and geometry, and selected source emissive colors are restored when cloning.
A separate history entry records COPY versus MOVE: Undo(COPY) detaches only
the copy; Redo(COPY) reattaches the same instance. Detached visual assets
are disposed when redo is invalidated or the session resets.

There is also an explicit COPYBASE workflow: capture a visible exact OCCT
snap on the selected isolated STEP instance, then click an exact visible
snap on another or the same STEP instance. The copy is placed using the
3D vector between those world-space exact B-Rep points. Points are projected
through each visual instance's world transform without changing OpenCascade
coordinates. This is a separate mode from axis drag and must be canceled
with Escape when no destination is desired.

**Safety and limitations:** These operations are still temporary visual
placements of the whole independently loaded STEP group. Neither a copied
topological OCCT document nor a .flproject piece/assembly entity is created.
The original STEP bytes, B-Rep model, manufacturing geometry and stable CAD
history are unaffected. A multi-product or ambiguously mapped STEP file
remains ineligible for these native editing controls. Full hierarchical
Ctrl-copy, persistent file save and per-product exact B-Rep ownership require
subsequent migrations and must not be claimed here.

The normal That Open-backed CAD viewer, orthographic camera safety guard,
IFC/Fragments, DWG and Paper Space/PDF remain unchanged.

## Phase 3 — native Three.js backend

1. Implement a new viewport backend using THREE.Scene,
   THREE.WebGLRenderer, PerspectiveCamera / OrthographicCamera and
   camera-controls (or an equivalent FrameLogic CAD navigation implementation).
2. Preserve resize, pixel ratio, lost-context recovery, render loop,
   object lifetime and disposal semantics.
3. Keep That Open IFC/Fragments processing behind a separate IFC adapter;
   ensure any fragments still update their view and camera correctly.
4. Enable the native backend behind an opt-in development flag first,
   compare side-by-side, and provide an immediate rollback.
5. Promote the new backend to default only after regression and performance
   targets are met.

## Acceptance criteria before switching the default

- STEP import and project reopen preserve original scale and positions.
- Reference IFC loads, selects, hides and disposes correctly.
- Model Space works with perspective/orthographic cameras, local/global
  axes, view cube, Zoom Extents and all numeric CAD navigation.
- Undo/redo, transforms, Ctrl-copy, CAD mouse navigation, snaps and selection
  are unchanged, including very large DWG references.
- Plane cuts, detail views, drawing creation and PDF output are unaffected.
- No memory leaks from renderer, camera controls, meshes or fragments.
- Compare with the same real STEP assemblies: cold/warm load time, peak
  JavaScript/WASM memory, GPU memory if measurable, steady-state FPS and
  frame latency while orbiting/panning/zooming.
- Run typecheck, unit tests, build, and interactive browser smoke tests.
  No performance improvement is claimed without measured results.

## Rollback

Do not merge Phase 3 until the opt-in backend is stable. Phase 1 changes only
delegate startup construction; reverting the adapter call sites restores
the previous initialization without changing stored projects.
