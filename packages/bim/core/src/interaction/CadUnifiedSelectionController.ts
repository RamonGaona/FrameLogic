import type {
  DesignSelectionController,
} from "./DesignSelectionController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";


export type CadSelectableEntityType =
  | "PIECE"
  | "POINT"
  | "LINE";


export interface CadSelectionItem {

  readonly type:
    CadSelectableEntityType;

  readonly id:
    string;

}


export interface CadSelectionState {

  readonly items:
    readonly CadSelectionItem[];

  readonly pieceIds:
    readonly string[];

  readonly pointIds:
    readonly string[];

  readonly lineIds:
    readonly string[];

  readonly selectedTypeCount:
    number;

}


export type CadUnifiedSelectionListener =
  (
    state:
      CadSelectionState,
  ) => void;


export class CadUnifiedSelectionController {

  private readonly designSelection:
    DesignSelectionController;


  private readonly pointSelection:
    CadPointSelectionController;


  private readonly lineSelection:
    CadLineSelectionController;


  private readonly listeners =
    new Set<
      CadUnifiedSelectionListener
    >();


  private readonly unsubscribeDesign:
    () => void;


  private readonly unsubscribePoints:
    () => void;


  private readonly unsubscribeLines:
    () => void;


  constructor(
    designSelection:
      DesignSelectionController,

    pointSelection:
      CadPointSelectionController,

    lineSelection:
      CadLineSelectionController,
  ) {

    this.designSelection =
      designSelection;


    this.pointSelection =
      pointSelection;


    this.lineSelection =
      lineSelection;


    this.unsubscribeDesign =
      this.designSelection
        .subscribe(
          () => {

            this.notify();

          },
        );


    this.unsubscribePoints =
      this.pointSelection
        .subscribe(
          () => {

            this.notify();

          },
        );


    this.unsubscribeLines =
      this.lineSelection
        .subscribe(
          () => {

            this.notify();

          },
        );

  }


  getState():
    CadSelectionState {

    const pieceIds = [
      ...this.designSelection
        .getSelectedIds(),
    ];


    const pointIds = [
      ...this.pointSelection
        .getSelectedIds(),
    ];


    const lineIds = [
      ...this.lineSelection
        .getSelectedIds(),
    ];


    const items:
      CadSelectionItem[] = [
        ...pieceIds.map(
          (
            id,
          ) => ({
            type:
              "PIECE" as const,
            id,
          }),
        ),

        ...pointIds.map(
          (
            id,
          ) => ({
            type:
              "POINT" as const,
            id,
          }),
        ),

        ...lineIds.map(
          (
            id,
          ) => ({
            type:
              "LINE" as const,
            id,
          }),
        ),
      ];


    const selectedTypeCount =
      Number(
        pieceIds.length > 0,
      )
      + Number(
          pointIds.length > 0,
        )
      + Number(
          lineIds.length > 0,
        );


    return {
      items,
      pieceIds,
      pointIds,
      lineIds,
      selectedTypeCount,
    };

  }


  getItems():
    readonly CadSelectionItem[] {

    return this.getState()
      .items;

  }


  get selectedTypeCount():
    number {

    return this.getState()
      .selectedTypeCount;

  }


  get hasSelection():
    boolean {

    return this.getItems()
      .length > 0;

  }


  get isMixed():
    boolean {

    return this.selectedTypeCount > 1;

  }


  clearSelection():
    void {

    this.designSelection
      .clearSelection();


    this.pointSelection
      .clearSelection();


    this.lineSelection
      .clearSelection();

  }


  setEnabled(
    enabled:
      boolean,
  ):
    void {

    this.designSelection
      .setEnabled(
        enabled,
      );


    this.pointSelection
      .setEnabled(
        enabled,
      );


    this.lineSelection
      .setEnabled(
        enabled,
      );

  }


  subscribe(
    listener:
      CadUnifiedSelectionListener,
  ):
    () => void {

    this.listeners.add(
      listener,
    );


    listener(
      this.getState(),
    );


    return () => {

      this.listeners.delete(
        listener,
      );

    };

  }


  private notify():
    void {

    if (
      this.listeners.size === 0
    ) {

      return;

    }


    const state =
      this.getState();


    for (
      const listener
      of this.listeners
    ) {

      listener(
        state,
      );

    }

  }


  dispose():
    void {

    this.unsubscribeDesign();

    this.unsubscribePoints();

    this.unsubscribeLines();


    this.listeners.clear();

  }

}
