/**
 * Shared placement for the Web chat and remote MCP entry points.
 * Avoids the bottom-right drawing/Render toolbar and the version badge.
 */
export interface DockLayoutInput {
  viewportWidth: number;
  viewportHeight: number;
  viewCubeBottom: number | null;
  reservedTop: number[];
}

export interface DockLayout {
  dockTop: number;
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
  // At narrow sizes or low heights, intentionally open a dismissible full-window sheet,
  // instead of accidentally covering the CAD controls with a narrow floating panel.
  const compact = width < 620 || panelHeight < 235;
  return {
    dockTop: Math.round(dockTop),
    panelTop: Math.round(dockTop),
    panelHeight: Math.round(panelHeight),
    panelRight: 92,
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
  const layout = calculateAssistantDockLayout({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    viewCubeBottom: cubeRect && cubeRect.height > 0 ? cubeRect.bottom : null,
    reservedTop,
  });
  dock.style.top = layout.dockTop + "px";
  dock.style.setProperty("--assistant-panel-top", layout.panelTop + "px");
  dock.style.setProperty("--assistant-panel-height", layout.panelHeight + "px");
  dock.style.setProperty("--assistant-panel-right", layout.panelRight + "px");
  dock.dataset["chatCompact"] = String(layout.compact);
  return layout;
}
