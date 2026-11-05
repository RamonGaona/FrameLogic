const FRAMELOGIC_WORKSPACE_TITLE_PREFIX =
  "Pieza FrameLogic ·";

const FRAMELOGIC_WORKSPACE_BACK_LABEL =
  "Volver al modelo";

const MODEL_SPACE_CHROME_SELECTORS = [
  '[data-framelogic-project-toolbar="true"]',
  ".bim-toolbar",
  '[data-framelogic-model-space-panel-stack="true"]',
  ".layer-panel",
  ".model-panel",
  '[data-framelogic-section-panel="true"]',
  // Render / calidad visual también son útiles dentro del editor aislado.
  // No ocultarlos: el editor debe permitir Diseño / Detalle / Básico.
] as const;


function hasActiveFrameLogicPieceWorkspace():
  boolean {

  const backButtons =
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "button",
      ),
    );


  for (
    const button
    of backButtons
  ) {

    if (
      button.textContent
        ?.trim()
      !== FRAMELOGIC_WORKSPACE_BACK_LABEL
    ) {
      continue;
    }


    const topBar =
      button.parentElement;

    const title =
      topBar
        ?.querySelector(
          "strong",
        )
        ?.textContent
        ?.trim()
      ?? "";


    if (
      title.startsWith(
        FRAMELOGIC_WORKSPACE_TITLE_PREFIX,
      )
    ) {
      return true;
    }

  }


  return false;
}


/**
 * Mantiene el editor aislado de piezas FrameLogic libre del chrome general
 * del Model Space. Algunos controles se reubican en document.body mediante
 * adaptadores de layout y por ello quedan fuera del alcance del ocultamiento
 * histórico de PieceFrameLogicWorkspaceController.
 */
export function installPieceWorkspaceChromeGuard():
  () => void {

  const hiddenElements =
    new Map<
      HTMLElement,
      string
    >();

  let animationFrame =
    0;


  const restoreChrome =
    (): void => {

    for (
      const [
        element,
        display,
      ]
      of hiddenElements
    ) {

      if (
        element.isConnected
      ) {
        element.style.display =
          display;
      }

    }


    hiddenElements.clear();
  };


  const hideChrome =
    (): void => {

    for (
      const selector
      of MODEL_SPACE_CHROME_SELECTORS
    ) {

      const elements =
        document.querySelectorAll<HTMLElement>(
          selector,
        );


      for (
        const element
        of elements
      ) {

        if (
          hiddenElements.has(
            element,
          )
          || window
            .getComputedStyle(
              element,
            )
            .display
            === "none"
        ) {
          continue;
        }


        hiddenElements.set(
          element,
          element.style.display,
        );

        element.style.display =
          "none";

      }

    }

  };


  const apply =
    (): void => {

    animationFrame =
      0;


    if (
      hasActiveFrameLogicPieceWorkspace()
    ) {
      hideChrome();
      return;
    }


    restoreChrome();
  };


  const schedule =
    (): void => {

    if (
      animationFrame !== 0
    ) {
      return;
    }


    animationFrame =
      requestAnimationFrame(
        apply,
      );
  };


  const observer =
    new MutationObserver(
      schedule,
    );

  observer.observe(
    document.body,
    {
      childList:
        true,
      subtree:
        true,
    },
  );


  schedule();


  return () => {
    observer.disconnect();

    if (
      animationFrame !== 0
    ) {
      cancelAnimationFrame(
        animationFrame,
      );
    }

    restoreChrome();
  };
}
