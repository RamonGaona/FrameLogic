/**
 * Shared placement for the Web chat and remote MCP entry points.
 * Avoids the bottom-right drawing/Render toolbar and the version badge.
 */
export interface DockLayoutInput {
  viewportWidth: number;
  viewportHeight: number;
  viewCubeBottom: number | null;
  reservedTop: number[];
  sidePanel?: { left: number; top: number; bottom: number } | null;
}

export interface DockLayout {
  dockTop: number;
  dockRight: number;
  panelTop: number;
  panelHeight: number;
  panelRight: number;
  compact: boolean;
}

export function calculateAssistantDockLayout(input: DockLayoutInput): DockLayout {
  const width = Math.max(280, input.viewportWidth);
  const height = Math.max(240, input.viewportHeight);
  // Only elements placed near the lower half count as the bottom toolbar.
  const reservedTop = input.reservedTop
    .filter(top => Number.isFinite(top) && top > height * 0.43 && top < height)
    .reduce((min, top) => Math.min(min, top), height);
  const safeBottom = Math.max(70, reservedTop - 12);
  const cubeBottom = input.viewCubeBottom && Number.isFinite(input.viewCubeBottom)
    ? input.viewCubeBottom : 164;
  const preferredDockTop = Math.max(70, cubeBottom + 12);
  const dockTop = Math.max(12, Math.min(preferredDockTop, safeBottom - 105));
  const panelHeight = Math.max(0, Math.min(570, safeBottom - dockTop - 9));
  // If ModelPanel occupies the middle-right of the viewport, move the entry points
  // to its left instead of placing new buttons over existing piece controls.
  const sidePanel = input.sidePanel;
  const sidePanelBlocksDock = sidePanel
    && sidePanel.left > width * 0.35
    && sidePanel.top < dockTop + 96
    && sidePanel.bottom > dockTop;
  const dockRight = sidePanelBlocksDock
    ? Math.max(16, width - sidePanel.left + 12) : 16;
  const panelRight = dockRight + 76;
  // If there isn't room for a flyout left of the dock, use a dismissible modal sheet.
  const compact = width < 620 || width < panelRight + 430 || panelHeight < 235;
  return {
    dockTop: Math.round(dockTop),
    dockRight: Math.round(dockRight),
    panelTop: Math.round(dockTop),
    panelHeight: Math.round(panelHeight),
    panelRight: Math.round(panelRight),
    compact,
  };
}

const DOCK_SELECTOR = '[data-framelogic-assistant-dock="true"]';

export function getOrCreateAssistantDock(): HTMLDivElement {
  const existing = document.querySelector<HTMLDivElement>(DOCK_SELECTOR);
  if (existing) return existing;
  const dock = document.createElement("div");
  dock.dataset["framelogicAssistantDock"] = "true";
  dock.className = "framelogic-assistant-dock";
  document.body.append(dock);
  return dock;
}

export function releaseAssistantDock(dock: HTMLDivElement): void {
  if (dock.childElementCount === 0) dock.remove();
}

export function syncAssistantDockLayout(dock: HTMLElement): DockLayout {
  const cube = document.querySelector<HTMLElement>(".view-cube-container");
  const cubeRect = cube?.getBoundingClientRect();
  const reserved = [
    '[data-framelogic-section-panel="true"]',
    '[data-framelogic-model-render-mode="true"]',
    '[data-framelogic-build-version="true"]',
  ];
  const reservedTop: number[] = [];
  for (const selector of reserved) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element || !element.isConnected) continue;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) reservedTop.push(rect.top);
  }
  const modelPanel = document.querySelector<HTMLElement>(".model-panel");
  const modelPanelStyle = modelPanel ? getComputedStyle(modelPanel) : null;
  const modelPanelRect = modelPanelStyle?.display !== "none"
    && modelPanelStyle?.visibility !== "hidden" ? modelPanel?.getBoundingClientRect() : null;
  const layout = calculateAssistantDockLayout({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    viewCubeBottom: cubeRect && cubeRect.height > 0 ? cubeRect.bottom : null,
    reservedTop,
    sidePanel: modelPanelRect && modelPanelRect.width > 0 && modelPanelRect.height > 0
      ? { left: modelPanelRect.left, top: modelPanelRect.top, bottom: modelPanelRect.bottom }
      : null,
  });
  dock.style.top = layout.dockTop + "px";
  dock.style.right = layout.dockRight + "px";
  dock.style.setProperty("--assistant-panel-top", layout.panelTop + "px");
  dock.style.setProperty("--assistant-panel-height", layout.panelHeight + "px");
  dock.style.setProperty("--assistant-panel-right", layout.panelRight + "px");
  dock.dataset["chatCompact"] = String(layout.compact);
  return layout;
}
