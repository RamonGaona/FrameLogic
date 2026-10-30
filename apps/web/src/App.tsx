import {
  useEffect,
} from "react";

import {
  BimViewport,
} from "./features/bim/BimViewport";

import {
  installCadLayerPanelLayout,
} from "./features/bim/installCadLayerPanelLayout";

import {
  installModelSpacePanelLayout,
} from "./features/bim/installModelSpacePanelLayout";

import {
  installStepImportWarmup,
} from "./features/bim/step/installStepImportWarmup";


function App() {

  useEffect(
    () => {
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
    },
    [],
  );


  return (
    <BimViewport />
  );

}


export default App;
