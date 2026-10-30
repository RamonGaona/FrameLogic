const INSTANCE_TREE_SELECTOR =
  '[data-framelogic-instance-tree="true"]';

const INSTANCE_TREE_BODY_SELECTOR =
  '[data-framelogic-instance-tree-body="true"]';

const PREPARATION_PANEL_SELECTOR =
  '[data-framelogic-piece-preparation-panel="true"]';

const PREPARATION_PANEL_HEADER_PREFIX =
  "Preparar pieza ·";

const PANEL_STACK_SELECTOR =
  '[data-framelogic-model-space-panel-stack="true"]';

const MODEL_TOOLBAR_SELECTOR =
  ".bim-toolbar";

const PROJECT_TOOLBAR_SELECTOR =
  '[data-framelogic-project-toolbar="true"]';

const VIEW_CUBE_SELECTOR =
  ".view-cube-container";

const TOP_MARGIN =
  16;

const TOP_TOOLBAR_GAP =
  8;

const DEFAULT_RIGHT_RESERVE =
  190;

const MIN_SIDE_BY_SIDE_TOOLBAR_WIDTH =
  620;


export function installModelSpacePanelLayout():
  () => void {

  let animationFrame =
    0;

  const resizeObserved =
    new WeakSet<Element>();

  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(
          () => {
            scheduleLayout();
          },
        );


  function observeResize(
    element:
      Element | null,
  ): void {

    if (
      !element
      || !resizeObserver
      || resizeObserved.has(
        element,
      )
    ) {

      return;

    }


    resizeObserved.add(
      element,
    );

    resizeObserver.observe(
      element,
    );

  }


  const getOrCreatePanelStack =
    (): HTMLDivElement => {

    const existing =
      document.querySelector<HTMLDivElement>(
        PANEL_STACK_SELECTOR,
      );


    if (
      existing
    ) {

      observeResize(
        existing,
      );

      return existing;

    }


    const stack =
      document.createElement(
        "div",
      );

    stack.dataset[
      "framelogicModelSpacePanelStack"
    ] =
      "true";


    Object.assign(
      stack.style,
      {
        position:
          "fixed",
        left:
          "16px",
        top:
          "146px",
        zIndex:
          "118",
        width:
          "310px",
        maxWidth:
          "calc(100vw - 32px)",
        maxHeight:
          "calc(100vh - 220px)",
        display:
          "flex",
        flexDirection:
          "column",
        gap:
          "8px",
        pointerEvents:
          "none",
      },
    );


    document.body.appendChild(
      stack,
    );

    observeResize(
      stack,
    );


    return stack;

  };


  const findPreparationPanel =
    (): HTMLElement | null => {

    const markedPanels =
      Array.from(
        document.querySelectorAll<HTMLElement>(
          PREPARATION_PANEL_SELECTOR,
        ),
      );


    for (
      let index =
        markedPanels.length - 1;
      index >= 0;
      index -= 1
    ) {

      const panel =
        markedPanels[index];


      if (
        panel
        && panel.isConnected
      ) {

        return panel;

      }

    }


    for (
      const child
      of Array.from(
        document.body.children,
      )
        .reverse()
    ) {

      if (
        !(child instanceof HTMLElement)
      ) {

        continue;

      }


      const headerText =
        child.firstElementChild
          ?.textContent
          ?.trim()
        ?? "";


      if (
        !headerText.startsWith(
          PREPARATION_PANEL_HEADER_PREFIX,
        )
      ) {

        continue;

      }


      child.dataset[
        "framelogicPiecePreparationPanel"
      ] =
        "true";


      return child;

    }


    return null;

  };


  const applyTopToolbarLayout =
    (): number => {

    const modelToolbar =
      document.querySelector<HTMLElement>(
        MODEL_TOOLBAR_SELECTOR,
      );

    const projectToolbar =
      document.querySelector<HTMLElement>(
        PROJECT_TOOLBAR_SELECTOR,
      );

    const viewCube =
      document.querySelector<HTMLElement>(
        VIEW_CUBE_SELECTOR,
      );


    observeResize(
      modelToolbar,
    );

    observeResize(
      projectToolbar,
    );

    observeResize(
      viewCube,
    );


    const viewportWidth =
      Math.max(
        document.documentElement.clientWidth,
        window.innerWidth,
      );

    const viewCubeRect =
      viewCube
        ?.getBoundingClientRect();

    const rightReserve =
      viewCubeRect
        ? Math.max(
            DEFAULT_RIGHT_RESERVE,
            viewportWidth
            - viewCubeRect.left
            + TOP_TOOLBAR_GAP,
          )
        : DEFAULT_RIGHT_RESERVE;

    const usableRight =
      Math.max(
        TOP_MARGIN + 320,
        viewportWidth
        - rightReserve,
      );

    let topControlsBottom =
      0;


    if (
      projectToolbar
    ) {

      const projectMaxWidth =
        Math.max(
          280,
          Math.min(
            500,
            usableRight
            - TOP_MARGIN,
          ),
        );


      Object.assign(
        projectToolbar.style,
        {
          left:
            `${TOP_MARGIN}px`,
          top:
            `${TOP_MARGIN}px`,
          right:
            "auto",
          maxWidth:
            `${projectMaxWidth}px`,
          flexWrap:
            "wrap",
          alignItems:
            "center",
          rowGap:
            "5px",
        },
      );


      topControlsBottom =
        Math.max(
          topControlsBottom,
          projectToolbar
            .getBoundingClientRect()
            .bottom,
        );

    }


    if (
      modelToolbar
    ) {

      let toolbarLeft =
        TOP_MARGIN;

      let toolbarTop =
        TOP_MARGIN;


      if (
        projectToolbar
      ) {

        const projectRect =
          projectToolbar
            .getBoundingClientRect();

        const sideBySideLeft =
          Math.ceil(
            projectRect.right
            + TOP_TOOLBAR_GAP,
          );


        if (
          usableRight
          - sideBySideLeft
          >= MIN_SIDE_BY_SIDE_TOOLBAR_WIDTH
        ) {

          toolbarLeft =
            sideBySideLeft;

        }
        else {

          toolbarTop =
            Math.ceil(
              projectRect.bottom
              + TOP_TOOLBAR_GAP,
            );

        }

      }


      const toolbarMaxWidth =
        Math.max(
          320,
          usableRight
          - toolbarLeft,
        );


      Object.assign(
        modelToolbar.style,
        {
          left:
            `${toolbarLeft}px`,
          top:
            `${toolbarTop}px`,
          right:
            "auto",
          width:
            "max-content",
          maxWidth:
            `${toolbarMaxWidth}px`,
        },
      );


      topControlsBottom =
        Math.max(
          topControlsBottom,
          modelToolbar
            .getBoundingClientRect()
            .bottom,
        );

    }


    return topControlsBottom;

  };


  const applyInstanceTreeLayout =
    (
      instanceTree:
        HTMLElement,
    ): void => {

    Object.assign(
      instanceTree.style,
      {
        position:
          "relative",
        left:
          "auto",
        top:
          "auto",
        width:
          "100%",
        maxWidth:
          "100%",
        maxHeight:
          "40vh",
        overflow:
          "hidden",
        display:
          "flex",
        flexDirection:
          "column",
        flexShrink:
          "1",
        minHeight:
          "0",
        pointerEvents:
          "auto",
      },
    );


    const body =
      instanceTree.querySelector<HTMLElement>(
        INSTANCE_TREE_BODY_SELECTOR,
      );


    if (
      !body
    ) {

      return;

    }


    Object.assign(
      body.style,
      {
        maxHeight:
          "none",
        minHeight:
          "0",
        flex:
          "1 1 auto",
        overflowX:
          "hidden",
        overflowY:
          "auto",
        scrollbarGutter:
          "stable",
      },
    );

  };


  const applyPreparationPanelLayout =
    (
      preparationPanel:
        HTMLElement,
    ): void => {

    Object.assign(
      preparationPanel.style,
      {
        position:
          "relative",
        left:
          "auto",
        top:
          "auto",
        bottom:
          "auto",
        width:
          "100%",
        maxWidth:
          "100%",
        maxHeight:
          "none",
        minHeight:
          "0",
        flex:
          "0 1 auto",
        overflowX:
          "hidden",
        overflowY:
          "auto",
        zIndex:
          "119",
        pointerEvents:
          "auto",
      },
    );

  };


  const applyLayout =
    (): void => {

    animationFrame =
      0;


    const topControlsBottom =
      applyTopToolbarLayout();

    const instanceTrees =
      Array.from(
        document.querySelectorAll<HTMLElement>(
          INSTANCE_TREE_SELECTOR,
        ),
      );


    const instanceTree =
      instanceTrees[
        instanceTrees.length - 1
      ];


    if (
      !instanceTree
    ) {

      return;

    }


    const stack =
      getOrCreatePanelStack();

    const stackTop =
      Math.max(
        146,
        Math.ceil(
          topControlsBottom
          + 16,
        ),
      );


    stack.style.top =
      `${stackTop}px`;

    stack.style.maxHeight =
      `${Math.max(
        80,
        window.innerHeight
        - stackTop
        - 72,
      )}px`;


    if (
      instanceTree.parentElement
      !== stack
    ) {

      stack.prepend(
        instanceTree,
      );

    }


    applyInstanceTreeLayout(
      instanceTree,
    );

    observeResize(
      instanceTree,
    );


    const preparationPanel =
      findPreparationPanel();


    if (
      !preparationPanel
    ) {

      return;

    }


    if (
      preparationPanel.parentElement
      !== stack
    ) {

      stack.appendChild(
        preparationPanel,
      );

    }


    applyPreparationPanelLayout(
      preparationPanel,
    );

    observeResize(
      preparationPanel,
    );

  };


  function scheduleLayout(): void {

    if (
      animationFrame !== 0
    ) {

      return;

    }


    animationFrame =
      requestAnimationFrame(
        applyLayout,
      );

  }


  const mutationObserver =
    new MutationObserver(
      () => {

        scheduleLayout();

      },
    );


  mutationObserver.observe(
    document.body,
    {
      childList:
        true,
      subtree:
        true,
    },
  );


  window.addEventListener(
    "resize",
    scheduleLayout,
  );


  scheduleLayout();


  return () => {

    mutationObserver.disconnect();

    resizeObserver
      ?.disconnect();

    window.removeEventListener(
      "resize",
      scheduleLayout,
    );


    if (
      animationFrame !== 0
    ) {

      cancelAnimationFrame(
        animationFrame,
      );

    }

  };

}
