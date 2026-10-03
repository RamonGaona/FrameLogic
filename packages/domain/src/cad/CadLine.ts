export interface CadLinePosition {

  readonly x: number;

  readonly y: number;

  readonly z: number;

}


export interface CadLine {

  readonly id: string;

  readonly layerId: string;

  readonly start:
    CadLinePosition;

  readonly end:
    CadLinePosition;

}
