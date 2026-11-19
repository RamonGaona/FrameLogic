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

## Phase 3i — short-click axis HASTA and Ctrl-copy until reference (v0.1.196)

This phase restores the stable Model Space move-axis interaction model in
the native Three.js experimental STEP viewer: **short click a gizmo axis**
to arm the X/Y/Z translation and **click a reference** to place the gizmo
pivot at that reference's coordinate, projected along the selected axis.
The other two coordinates remain unchanged. A normal axis drag still
translates continuously; the short click alone must not move or copy
anything.

Press Ctrl either when arming the axis or on the next destination click
to make **COPIAR HASTA** instead of move. The original loaded STEP group
remains fixed. A Ctrl-armed axis stays active for repeated copies at
further references until Escape; the original pivot is retained for each
click (no accumulation). The explicit **Hasta** and **Copiar hasta** buttons
provide equivalent modes for the UI-selected axis. Invalid, missing or
same-axis zero-distance targets leave the mode armed to retry.

Destination reference priority: visible indexed **exact OpenCascade B-Rep
SNAPs**, obtained from each native STEP instance's current world
placement; when none is near the click, fall back to a **visible triangle
surface intersection** via raycast. Surface hits are marked amber and
labelled approximate, never misrepresented as exact B-Rep geometry.
The axis correction is calculated from the original scoped gizmo pivot,
not a 3D free displacement to the clicked point.

Existing local MOVE/COPY undo/redo and Ctrl-copy isolation apply unchanged.
No STEP B-Rep or .flproject persistence is created here. The operation is
an experimental *visual placement only*, limited to independently imported
single-product STEP files with unambiguous source identity. Multi-product
STEP content remains blocked. The production CAD viewer, camera's
orthographic safety restriction, IFC, DWG and Paper Space/PDF are unchanged.

## Phase 3j — central XYZ gizmo pivot relocation (v0.1.197)

Following user validation of v0.1.196 MOVER/COPIAR HASTA, the native
orthographic STEP gizmo now includes a separately raycastable central XYZ
handle. A short click arms **pivot relocation**; the next click on a visible
**exact OpenCascade B-Rep SNAP** places only the gizmo centre at that 3D
coordinate. Dragging the centre to an exact snap also completes the operation;
dragging to empty space or arbitrary visible triangles never invents a
new pivot point. Escape cancels without a transform or copy.

The pivot is a world-space display offset stored in the STEP visual group
relative to the product's current world bounding centre. It is independent
of the underlying STEP B-Rep, vertices, mesh positions and copy/move history.
It follows the mesh group's translation, and a Ctrl-cloned group inherits
the relative pivot offset without linking source and copy afterwards.
An explicit Reset centre button restores the default product centre.

Subsequent MOVER HASTA and COPIAR HASTA operations start from this custom
pivot, matching the established Model Space centre-handle semantics. Normal
axis drag, Ctrl-copy, COPYBASE, selection, undo and redo remain intact.
Pivot changes are not tracked as model-transform Undo history, because no
geometry changes. The pivot is experimental/session-only and is not
persisted into STEP or .flproject. Multi-product STEP assemblies remain
ineligible for native visual edits.

The production CAD viewer and orthographic safety restriction, IFC,
DWG/DXF, and Paper Space/PDF remain untouched.

## Phase 3k — central gizmo hover and SNAP overlay priority (v0.1.198)

The user validated the centre relocation feature and requested that the
native XYZ centre **highlight under the pointer** and **remain above an
overlapping exact SNAP marker**. The centre sphere now changes color and
scale on hover, with a 24px non-interactive HTML halo. Pointer hit-testing
uses a stable CSS-pixel tolerance instead of tiny geometric ray intersections,
remaining usable when an imported STEP is zoomed out.

Rendering and selection priority are explicit: the centre mesh is drawn
after XYZ axis arrows, and the native HTML SNAP indicator is suppressed
when its screen-space position overlaps the projected centre's hit region.
SNAPs elsewhere remain fully available. The centre click continues to arm
its read-only exact-B-Rep pivot relocation; the hover state never changes
the STEP mesh or transform history.

Regression tests cover hover appearance and cleanup, pointer detection,
exact SNAP visual overlap and the existing centre/axis behavior.
The production That Open CAD viewport, native orthographic camera,
STEP/OCCT geometry, IFC/DWG/Paper Space and project persistence are unchanged.

## Phase 3l — orthographic zoom-invariant XYZ gizmo size (v0.1.199)

The user reported the XYZ gizmo was enormous when zoomed into a STEP
and barely visible when zoomed out. Native Three.js rendering now scales
only the **visual gizmo group** each frame to target approximately 96 CSS
pixels of axis length. The world-per-pixel factor uses the orthographic
camera's vertical frustum and zoom, divided by the actual viewport height;
small viewports receive a smaller target. This does not change STEP mesh
scale, OpenCascade B-Rep topology, object position, pivot world coordinate,
model units or any saved history.

Hit-testing and pointer capture use the current effective gizmo scale.
The drag controller receives **scaled world-axis length** so its axis
projection continues returning exact world-millimetre displacement.
Gizmo scale updates before render, on hover, and before pointer-down;
centre highlighting and SNAP-overlap priority from v0.1.198 are retained.

Tests cover stable projected axis length at near/far camera frusta,
centre and arrow picking, numerical drag invariance in mm, and invalid
viewport guards. No changes to stable CAD, IFC, DWG, Paper Space/PDF,
project persistence or orthographic-only experimental policy.

## Phase 3m — interoperable session entry without replacing Model Space (v0.1.201)

The default URL `https://framelogic-dev.pages.dev/` continues to load the
**complete existing FrameLogic CAD workspace**, not the standalone STEP experiment.
This safeguards IFC, CAD drawing/editing, DWG/DXF, assemblies, config,
project persistence, sections and Paper Space while the new renderer matures.

When a user imports a STEP/STP as a piece from the Model Space interface, the
browser keeps the **most recently imported original File** in current-tab
memory. The `Visor STEP Three.js` launcher opens a **separate tab**, preserving
the active .flproject and any unsaved work in the existing tab. If the File is
eligible and below the 256 MiB local handoff cap, the tabs exchange it through
a single-use `BroadcastChannel` ticket for a maximum of 20 seconds. No cloud
upload, localStorage, IndexedDB, persistent cache or server-side transfer is
created. On failure the native viewer retains manual STEP import. Users can
still open the native viewer without first importing a piece.

**This does not synchronize project changes:** native MOVE/ROTATE/COPY remain
visual-only and only in the native tab; they cannot be saved into .flproject
or applied back to the CAD project. Reopening a .flproject is not a promise of
a transferable original STEP file, and only the latest explicit STEP import
is eligible. Native operations remain restricted to unambiguous, standalone
single-product STEP documents. The user's IFC/DWG/PDF work stays on the
primary Model Space tab.

Before considering the native renderer as the default full FrameLogic engine:

1. Implement a proper project/semantic model adapter for STEP piece instances,
   subassemblies and independent B-Rep product ownership.
2. Reuse authoritative domain Move/Rotate/Copy commands and .flproject
   serializer (not standalone THREE.Group state) with shared Undo/Redo.
3. Connect IFC/Fragments, DWG/DXF and CAD primitives without converting STEP
   to IFC or silently dropping references.
4. Integrate native camera events and snaps with WorkPlane, tools, ViewCube,
   drawing sheets/sections/BOM and Paper Space/PDF.
5. Validate geometry, accuracy and stability on real large user STEP/DWG/IFC
   projects, memory ownership, automated tests, browser workflows and rollback.
6. Only then enable a reversible native-backend default behind a feature
   switch, with the existing complete Model Space as fallback.

`?threeNative=1` remains a separate, opt-in STEP viewer for this increment.

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
