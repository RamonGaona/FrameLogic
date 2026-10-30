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


export function installModelSpacePanelLayout():
  () => void {

  let animationFrame =
    0;


  const getOrCreatePanelStack =
    (): HTMLDivElement => {

    const existing =
      document.querySelector<HTMLDivElement>(
        PANEL_STACK_SELECTOR,
      );


    if (
      existing
    ) {

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

  };


  const scheduleLayout =
    (): void => {

    if (
      animationFrame !== 0
    ) {

      return;

    }


    animationFrame =
      requestAnimationFrame(
        applyLayout,
      );

  };


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
