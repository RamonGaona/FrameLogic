import {
  useEffect,
} from "react";

import {
  BimViewport,
} from "./features/bim/BimViewport";

import {
  installModelSpacePanelLayout,
} from "./features/bim/installModelSpacePanelLayout";


function App() {

  useEffect(
    () =>
      installModelSpacePanelLayout(),
    [],
  );


  return (
    <BimViewport />
  );

}


export default App;
