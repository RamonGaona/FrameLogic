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
