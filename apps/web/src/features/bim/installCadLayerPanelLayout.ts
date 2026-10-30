const PANEL_STACK_SELECTOR =
  '[data-framelogic-model-space-panel-stack="true"]';

const CAD_LAYER_PANEL_SELECTOR =
  '[data-framelogic-cad-layer-panel="true"]';

const INSTANCE_TREE_SELECTOR =
  '[data-framelogic-instance-tree="true"]';

const PREPARATION_PANEL_SELECTOR =
  '[data-framelogic-piece-preparation-panel="true"]';


/**
 * Integra el control de Capas CAD en la columna lateral del Model Space.
 *
 * CadReferenceLayerPanelController conserva su responsabilidad funcional;
 * este adaptador únicamente reorganiza su UI para que el botón y el panel
 * expandido participen del mismo flujo vertical que INSTANCIAS.
 */
export function installCadLayerPanelLayout():
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


  function findCadLayerToggle():
    HTMLButtonElement | null {

    return Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "button",
      ),
    ).find(
      (
        button,
      ) => {
        const label =
          (
            button.textContent
            ?? ""
          )
            .replace(
              /[▸▾]/g,
              "",
            )
            .trim()
            .toUpperCase();

        return label === "CAPAS CAD";
      },
    )
      ?? null;
  }


  function applyLayout(): void {
    animationFrame =
      0;

    const stack =
      document.querySelector<HTMLElement>(
        PANEL_STACK_SELECTOR,
      );

    if (!stack) {
      return;
    }

    const toggle =
      findCadLayerToggle();
    const panel =
      document.querySelector<HTMLElement>(
        CAD_LAYER_PANEL_SELECTOR,
      );

    observeResize(stack);
    observeResize(toggle);
    observeResize(panel);

    if (toggle) {
      if (
        toggle.parentElement
        !== stack
      ) {
        stack.append(toggle);
      }

      Object.assign(
        toggle.style,
        {
          position: "relative",
          left: "auto",
          top: "auto",
          right: "auto",
          width: "100%",
          maxWidth: "100%",
          minHeight: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          flex: "0 0 auto",
          order: "10",
          padding: "7px 9px",
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: "6px",
          background: "rgba(31,41,51,0.96)",
          color: "#f3f7f9",
          boxShadow: "0 4px 14px rgba(0,0,0,0.22)",
          font: "700 12px system-ui, sans-serif",
          textAlign: "left",
          pointerEvents: "auto",
        },
      );
    }

    if (panel) {
      if (
        panel.parentElement
        !== stack
      ) {
        stack.append(panel);
      }

      Object.assign(
        panel.style,
        {
          position: "relative",
          left: "auto",
          top: "auto",
          right: "auto",
          bottom: "auto",
          width: "100%",
          maxWidth: "100%",
          maxHeight: "min(34vh, 360px)",
          minHeight: "0",
          flex: "0 1 auto",
          order: "20",
          overflowX: "hidden",
          overflowY: "auto",
          zIndex: "119",
          pointerEvents: "auto",
        },
      );
    }

    const instanceTree =
      stack.querySelector<HTMLElement>(
        INSTANCE_TREE_SELECTOR,
      );

    if (instanceTree) {
      instanceTree.style.order =
        "30";
    }

    const preparationPanel =
      stack.querySelector<HTMLElement>(
        PREPARATION_PANEL_SELECTOR,
      );

    if (preparationPanel) {
      preparationPanel.style.order =
        "40";
    }
  }


  function scheduleLayout(): void {
    if (
      animationFrame !== 0
    ) {
      return;
    }

    animationFrame =
      window.requestAnimationFrame(
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
      childList: true,
      subtree: true,
    },
  );

  window.addEventListener(
    "resize",
    scheduleLayout,
  );

  scheduleLayout();


  return () => {
    mutationObserver.disconnect();
    resizeObserver?.disconnect();
    window.removeEventListener(
      "resize",
      scheduleLayout,
    );

    if (
      animationFrame !== 0
    ) {
      window.cancelAnimationFrame(
        animationFrame,
      );
    }
  };
}
