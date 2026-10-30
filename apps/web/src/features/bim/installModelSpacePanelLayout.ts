const INSTANCE_TREE_SELECTOR =
  '[data-framelogic-instance-tree="true"]';

const INSTANCE_TREE_BODY_SELECTOR =
  '[data-framelogic-instance-tree-body="true"]';

const PREPARATION_PANEL_SELECTOR =
  '[data-framelogic-piece-preparation-panel="true"]';

const PREPARATION_PANEL_HEADER_PREFIX =
  "Preparar pieza ·";


export function installModelSpacePanelLayout():
  () => void {

  let animationFrame =
    0;

  let observedInstanceTree:
    HTMLElement
    | null =
      null;


  const resizeObserver =
    new ResizeObserver(
      () => {

        scheduleLayout();

      },
    );


  const findPreparationPanel =
    (): HTMLElement | null => {

      const markedPanel =
        document.querySelector<HTMLElement>(
          PREPARATION_PANEL_SELECTOR,
        );


      if (
        markedPanel
      ) {

        return markedPanel;

      }


      for (
        const child
        of Array.from(
          document.body.children,
        )
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


  const updateObservedInstanceTree =
    (
      instanceTree:
        HTMLElement
        | null,
    ): void => {

      if (
        instanceTree
        === observedInstanceTree
      ) {

        return;

      }


      if (
        observedInstanceTree
      ) {

        resizeObserver.unobserve(
          observedInstanceTree,
        );

      }


      observedInstanceTree =
        instanceTree;


      if (
        observedInstanceTree
      ) {

        resizeObserver.observe(
          observedInstanceTree,
        );

      }

    };


  const applyLayout =
    (): void => {

      animationFrame =
        0;


      const instanceTree =
        document.querySelector<HTMLElement>(
          INSTANCE_TREE_SELECTOR,
        );


      updateObservedInstanceTree(
        instanceTree,
      );


      if (
        !instanceTree
      ) {

        return;

      }


      instanceTree.style.maxHeight =
        "40vh";

      instanceTree.style.overflow =
        "hidden";


      const instanceTreeBody =
        instanceTree.querySelector<HTMLElement>(
          INSTANCE_TREE_BODY_SELECTOR,
        );


      if (
        instanceTreeBody
      ) {

        instanceTreeBody.style.maxHeight =
          "calc(40vh - 38px)";

        instanceTreeBody.style.overflowX =
          "hidden";

        instanceTreeBody.style.overflowY =
          "auto";

        instanceTreeBody.style.scrollbarGutter =
          "stable";

      }


      const preparationPanel =
        findPreparationPanel();


      if (
        !preparationPanel
      ) {

        return;

      }


      const instanceRect =
        instanceTree.getBoundingClientRect();

      const top =
        Math.round(
          instanceRect.bottom
          + 8,
        );

      const availableHeight =
        Math.max(
          160,
          window.innerHeight
          - top
          - 16,
        );


      preparationPanel.style.position =
        "fixed";

      preparationPanel.style.left =
        `${Math.round(instanceRect.left)}px`;

      preparationPanel.style.top =
        `${top}px`;

      preparationPanel.style.bottom =
        "auto";

      preparationPanel.style.width =
        `${Math.round(instanceRect.width)}px`;

      preparationPanel.style.maxHeight =
        `${availableHeight}px`;

      preparationPanel.style.overflow =
        "auto";

      preparationPanel.style.zIndex =
        "119";

    };


  function scheduleLayout():
    void {

    if (
      animationFrame !== 0
    ) {

      cancelAnimationFrame(
        animationFrame,
      );

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

    resizeObserver.disconnect();

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
