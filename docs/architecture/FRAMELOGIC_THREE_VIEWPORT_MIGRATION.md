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

## Phase 2 — decouple consumers

1. Replace scattered `core.world.scene.three`, `core.world.renderer.three`,
   and `core.world.camera.three` references with FrameLogic-owned ports.
2. Define a separate CAD camera-controls port covering projection switching,
   azimuth/polar navigation, dolly-to-cursor, setLookAt, and camera change
   notifications, rather than exposing a specific vendor camera.
3. Keep selection, precise snaps, gizmos, local axes, Ctrl-copy, numeric
   input and camera Z-up behavior unchanged.
4. Keep drawing/PDF camera state isolated from Model Space.

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
