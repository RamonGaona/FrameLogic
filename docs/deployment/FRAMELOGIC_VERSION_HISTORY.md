# FrameLogic — historial de versiones de prueba

Este archivo registra la versión visible utilizada para comprobar que `framelogic-dev.pages.dev` está ejecutando el último cambio desplegado.

## Regla de versionado

- Cada cambio funcional que se suba para pruebas incrementará la versión *patch* visible de FrameLogic.
- La misma versión debe aparecer en el badge inferior derecho del Model Space y en el `package.json` raíz.
- Antes de validar un cambio en la web, comprobar primero que el badge muestra la versión esperada.

## Versiones

### v0.1.12 — Árbol de instancias por View en PDF

- Los espacios PDF de secciones y ensambles incorporan un panel lateral `VIEWS`.
- En un plano de sección, la view muestra todas las instancias del modelo general.
- En hojas de ensamble/pieza, cada view muestra únicamente las instancias que pertenecen a ese ensamble, pieza o instancia enviada al PDF.
- Las instancias incluidas en views de ensamble/pieza muestran un ojo como indicador de pertenencia visible.
- La indicación exacta de qué instancias son atravesadas por el corte de una sección queda pendiente de enlazarse al resultado geométrico de corte; no se infiere ni se marca de forma incorrecta en esta versión.

### v0.1.11 — SNAP contextual

- Los indicadores visuales de SNAP ya no se muestran durante navegación, selección o inspección normal.
- SNAP se activa visualmente únicamente mientras una herramienta que lo necesita está activa: Punto, Línea, MOVE/gizmo, ROTATE, mover líneas/selecciones mixtas, edición del WorkPlane, edición de origen de pieza e inserción inteligente.
- Al terminar o cancelar la herramienta, las etiquetas como `ENDPOINT`, `MIDPOINT` o `CENTER` vuelven a ocultarse.
- Commit funcional: `784afc389e709c7f0c923cab3fd0bfc449ce10da`.

### v0.1.10 — referencia anterior

- Versión visible previa a la implementación del SNAP contextual.
