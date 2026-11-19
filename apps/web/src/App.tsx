import {
  lazy,
  Suspense,
  useEffect,
} from "react";

import {
  installCadLayerPanelLayout,
} from "./features/bim/installCadLayerPanelLayout";

import {
  installModelSpacePanelLayout,
} from "./features/bim/installModelSpacePanelLayout";

import {
  installStepImportWarmup,
} from "./features/bim/step/installStepImportWarmup";

/**
 * Separate route chunks: the native visual test must not mount
 * createBimCore/That Open or start a second renderer in the same tab.
 */
const BimViewport = lazy(async () => {
  const module = await import("./features/bim/BimViewport");
  return { default: module.BimViewport };
});

const NativeStepViewer = lazy(async () => {
  const module = await import("./features/bim/native/NativeStepViewer");
  return { default: module.NativeStepViewer };
});

function App() {
  const nativeViewer =
    new URLSearchParams(window.location.search).get("threeNative") === "1";

  useEffect(() => {
    if (nativeViewer) return;

    const uninstallModelSpacePanelLayout =
      installModelSpacePanelLayout();

    const uninstallCadLayerPanelLayout =
      installCadLayerPanelLayout();

    const uninstallStepImportWarmup =
      installStepImportWarmup();

    return () => {
      uninstallStepImportWarmup();
      uninstallCadLayerPanelLayout();
      uninstallModelSpacePanelLayout();
    };
  }, [nativeViewer]);

  return (
    <Suspense fallback={
      <div style={{
        color: "#e2e8f0", background: "#14202b",
        padding: 24, fontFamily: "system-ui, sans-serif",
        minHeight: "100vh",
      }}>Cargando FrameLogic...</div>
    }>
      {nativeViewer ? <NativeStepViewer /> : <BimViewport />}
    </Suspense>
  );
}

export default App;
