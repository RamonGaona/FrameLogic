import type {
    CSSProperties,
  } from "react";
  
  import type {
    CameraOrientation,
    CameraProjectionMode,
    CardinalDirection,
    StandardView,
  } from "@framelogic/bim-core";
  
  
  interface ViewCubeProps {
  
    orientation:
      CameraOrientation;
  
  
    projectionMode:
      CameraProjectionMode;
  
  
    onViewChange:
      (
        view:
          StandardView,
      ) => void;
  
  
    onCardinalChange:
      (
        direction:
          CardinalDirection,
      ) => void;
  
  
    onToggleProjection:
      () => void;

    /** Temporary safety switch: ortho disabled in 3D editors. */
    projectionToggleEnabled?: boolean;
  
  }
  
  
  // ============================================================
  // VIEW CUBE
  // ============================================================
  
  export function ViewCube(
    {
      orientation,
      projectionMode,
      onViewChange,
      onCardinalChange,
      onToggleProjection,
      projectionToggleEnabled = false,
    }: ViewCubeProps,
  ) {
  
    // ==========================================================
    // CUBE ORIENTATION
    // ==========================================================
  
    const rotateX =
      orientation.polar
      - Math.PI / 2;
  
  
    const rotateY =
      orientation.azimuth;
  
  
    const cubeStyle:
      CSSProperties = {
  
        transform:
          `rotateX(${rotateX}rad) rotateY(${rotateY}rad)`,
  
      };
  
  
    // ==========================================================
    // COMPASS ORIENTATION
    // ==========================================================
  
    const compassStyle:
      CSSProperties = {
  
        transform:
          `rotate(${-orientation.azimuth}rad)`,
  
      };
  
  
    // ==========================================================
    // KEEP COMPASS TEXT UPRIGHT
    // ==========================================================
  
    const compassTextStyle:
      CSSProperties = {
  
        transform:
          `rotate(${orientation.azimuth}rad)`,
  
      };
  
  
    // ==========================================================
    // UI
    // ==========================================================
  
    return (
      <div
        className="view-cube-container"
      >
  
        {/* ====================================================
            COMPASS
            ==================================================== */}
  
        <div
          className="view-compass"
          style={
            compassStyle
          }
        >
  
          {/* --------------------------------------------------
              NORTH
              -------------------------------------------------- */}
  
          <button
            type="button"
  
            className="
              view-compass-label
              view-compass-north
            "
  
            style={
              compassTextStyle
            }
  
            title="Vista hacia el Norte"
  
            onClick={
              () =>
                onCardinalChange(
                  "N",
                )
            }
          >
  
            N
  
          </button>
  
  
          {/* --------------------------------------------------
              EAST
              -------------------------------------------------- */}
  
          <button
            type="button"
  
            className="
              view-compass-label
              view-compass-east
            "
  
            style={
              compassTextStyle
            }
  
            title="Vista hacia el Este"
  
            onClick={
              () =>
                onCardinalChange(
                  "E",
                )
            }
          >
  
            E
  
          </button>
  
  
          {/* --------------------------------------------------
              SOUTH
              -------------------------------------------------- */}
  
          <button
            type="button"
  
            className="
              view-compass-label
              view-compass-south
            "
  
            style={
              compassTextStyle
            }
  
            title="Vista hacia el Sur"
  
            onClick={
              () =>
                onCardinalChange(
                  "S",
                )
            }
          >
  
            S
  
          </button>
  
  
          {/* --------------------------------------------------
              WEST
              -------------------------------------------------- */}
  
          <button
            type="button"
  
            className="
              view-compass-label
              view-compass-west
            "
  
            style={
              compassTextStyle
            }
  
            title="Vista hacia el Oeste"
  
            onClick={
              () =>
                onCardinalChange(
                  "W",
                )
            }
          >
  
            W
  
          </button>
  
        </div>
  
  
        {/* ====================================================
            VIEW CUBE
            ==================================================== */}
  
        <div
          className="view-cube"
          style={
            cubeStyle
          }
        >
  
          {/* --------------------------------------------------
              FRONT
              -------------------------------------------------- */}
  
          <button
            type="button"
  
            className="
              view-cube-face
              view-cube-front
            "
  
            onClick={
              () =>
                onViewChange(
                  "FRONT",
                )
            }
          >
  
            FRONT
  
          </button>
  
  
          {/* --------------------------------------------------
              BACK
              -------------------------------------------------- */}
  
          <button
            type="button"
  
            className="
              view-cube-face
              view-cube-back
            "
  
            onClick={
              () =>
                onViewChange(
                  "BACK",
                )
            }
          >
  
            BACK
  
          </button>
  
  
          {/* --------------------------------------------------
              RIGHT
              -------------------------------------------------- */}
  
          <button
            type="button"
  
            className="
              view-cube-face
              view-cube-right
            "
  
            onClick={
              () =>
                onViewChange(
                  "RIGHT",
                )
            }
          >
  
            RIGHT
  
          </button>
  
  
          {/* --------------------------------------------------
              LEFT
              -------------------------------------------------- */}
  
          <button
            type="button"
  
            className="
              view-cube-face
              view-cube-left
            "
  
            onClick={
              () =>
                onViewChange(
                  "LEFT",
                )
            }
          >
  
            LEFT
  
          </button>
  
  
          {/* --------------------------------------------------
              TOP
              -------------------------------------------------- */}
  
          <button
            type="button"
  
            className="
              view-cube-face
              view-cube-top
            "
  
            onClick={
              () =>
                onViewChange(
                  "TOP",
                )
            }
          >
  
            TOP
  
          </button>
  
  
          {/* --------------------------------------------------
              BOTTOM
              -------------------------------------------------- */}
  
          <button
            type="button"
  
            className="
              view-cube-face
              view-cube-bottom
            "
  
            onClick={
              () =>
                onViewChange(
                  "BOTTOM",
                )
            }
          >
  
            BOTTOM
  
          </button>
  
        </div>
  
  
        {/* ====================================================
            VIEW ACTIONS
            ==================================================== */}
  
        <div
          className="view-cube-actions"
        >
  
          {/* --------------------------------------------------
              ISOMETRIC VIEW
              -------------------------------------------------- */}
  
          <button
            type="button"
  
            className="view-cube-iso"
  
            title="Vista isométrica"
  
            onClick={
              () =>
                onViewChange(
                  "ISO",
                )
            }
          >
  
            ISO
  
          </button>
  
  
          {/* --------------------------------------------------
              PROJECTION
              -------------------------------------------------- */}
  
          {projectionToggleEnabled && (
          <button
            type="button"
  
            className="view-cube-projection"
  
            title={
              projectionMode === "PERSPECTIVE"
                ? "Cambiar a proyección ortográfica"
                : "Cambiar a perspectiva"
            }
  
            onClick={
              onToggleProjection
            }
          >
  
            {
              projectionMode === "PERSPECTIVE"
                ? "O"
                : "P"
            }
  
          </button>
          )}
  
        </div>
  
      </div>
    );
  
  }