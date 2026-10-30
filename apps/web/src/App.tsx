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


function App() {

  useEffect(
    () => {
      const uninstallModelSpacePanelLayout =
        installModelSpacePanelLayout();

      const uninstallCadLayerPanelLayout =
        installCadLayerPanelLayout();

      return () => {
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
