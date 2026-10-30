import type {
  CadLine,
  CadLinePosition,
  DesignModel,
  RegisterCadLineInput,
} from "@framelogic/domain";

import type {
  CadPolylineRegistryController,
} from "../design/CadPolylineRegistryController";


const CONNECT_TOLERANCE = 1e-5;
const CONNECT_TOLERANCE_SQ =
  CONNECT_TOLERANCE * CONNECT_TOLERANCE;


type PolylineCaptureMode =
  | "NONE"
  | "LINE"
  | "RECTANGLE";


function positionsConnect(
  first: CadLinePosition,
  second: CadLinePosition,
): boolean {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  const dz = first.z - second.z;
  return dx * dx + dy * dy + dz * dz
    <= CONNECT_TOLERANCE_SQ;
}


/**
 * Convierte sesiones de dibujo existentes en entidades POLYLINE sin sustituir
 * la geometría CadLine que utilizan SNAP/TRIM/LL.
 */
export class CadPolylineLifecycleController {
  private readonly designModel: DesignModel;
  private readonly polylines:
    CadPolylineRegistryController;

  private readonly originalRegisterCadLine:
    (
      input: RegisterCadLineInput,
    ) => CadLine;

  private readonly registerBridge:
    (
      input: RegisterCadLineInput,
    ) => CadLine;

  private mode: PolylineCaptureMode =
    "NONE";
  private readonly sessionLineIds:
    string[] = [];
  private activePolylineId:
    string | null = null;
  private disposed = false;

  constructor(
    designModel: DesignModel,
    polylines: CadPolylineRegistryController,
  ) {
    this.designModel = designModel;
    this.polylines = polylines;
    this.originalRegisterCadLine =
      designModel.registerCadLine.bind(
        designModel,
      );

    this.registerBridge =
      (
        input: RegisterCadLineInput,
      ): CadLine => {
        const line =
          this.originalRegisterCadLine(input);

        try {
          this.capture(line);
        }
        catch (error) {
          /*
           * La geometría ya fue registrada. Un fallo de metadata nunca debe
           * dejar RECTANGLE/LINE en un estado a medias.
           */
          console.error(
            "FrameLogic POLYLINE capture failed:",
            error,
          );
          this.resetCapture();
        }

        return line;
      };

    this.designModel.registerCadLine =
      this.registerBridge;
  }

  beginLineSession(): void {
    this.resetCapture();
    this.mode = "LINE";
  }

  endLineSession(): void {
    if (this.mode !== "LINE") return;
    this.resetCapture();
  }

  beginRectangleSession(): void {
    this.resetCapture();
    this.mode = "RECTANGLE";
  }

  endRectangleSession(): void {
    if (this.mode !== "RECTANGLE") return;
    this.resetCapture();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (
      this.designModel.registerCadLine
      === this.registerBridge
    ) {
      this.designModel.registerCadLine =
        this.originalRegisterCadLine;
    }

    this.resetCapture();
  }

  private capture(
    line: CadLine,
  ): void {
    switch (this.mode) {
      case "LINE":
        this.captureContinuedLine(line);
        break;
      case "RECTANGLE":
        this.captureRectangleLine(line);
        break;
      case "NONE":
        break;
    }
  }

  private captureContinuedLine(
    line: CadLine,
  ): void {
    const previousId =
      this.sessionLineIds[
        this.sessionLineIds.length - 1
      ];

    if (previousId) {
      const previous =
        this.designModel.cadLines.get(
          previousId,
        );

      if (
        !previous
        || !positionsConnect(
          previous.end,
          line.start,
        )
      ) {
        this.sessionLineIds.splice(0);
        this.activePolylineId = null;
      }
    }

    this.sessionLineIds.push(line.id);

    if (this.sessionLineIds.length < 2) {
      return;
    }

    if (!this.activePolylineId) {
      const polyline =
        this.polylines.register({
          layerId: line.layerId,
          segments:
            this.sessionLineIds.map(
              (lineId) => ({
                lineId,
                reversed: false,
              }),
            ),
          closed: false,
        });

      this.activePolylineId =
        polyline.id;
      return;
    }

    const parent =
      this.polylines.get(
        this.activePolylineId,
      );

    if (!parent) {
      this.activePolylineId = null;
      return;
    }

    const firstLine =
      this.designModel.cadLines.get(
        this.sessionLineIds[0],
      );

    const closed =
      this.sessionLineIds.length > 2
      && firstLine !== undefined
      && positionsConnect(
        line.end,
        firstLine.start,
      );

    this.polylines.updateSegments(
      parent.id,
      [
        ...parent.segments,
        {
          lineId: line.id,
          reversed: false,
        },
      ],
      closed,
    );
  }

  private captureRectangleLine(
    line: CadLine,
  ): void {
    this.sessionLineIds.push(line.id);

    if (this.sessionLineIds.length !== 4) {
      return;
    }

    this.polylines.register({
      layerId: line.layerId,
      segments:
        this.sessionLineIds.map(
          (lineId) => ({
            lineId,
            reversed: false,
          }),
        ),
      closed: true,
    });

    this.resetCapture();
  }

  private resetCapture(): void {
    this.mode = "NONE";
    this.sessionLineIds.splice(0);
    this.activePolylineId = null;
  }
}
