# FrameLogic — historial de versiones de prueba

Este archivo registra la versión visible utilizada para comprobar que `framelogic-dev.pages.dev` está ejecutando el último cambio desplegado.

## Regla de versionado

- Cada cambio funcional que se suba para pruebas incrementará la versión *patch* visible de FrameLogic.
- La misma versión debe aparecer en el badge inferior derecho del Model Space y en el `package.json` raíz.
- Antes de validar un cambio en la web, comprobar primero que el badge muestra la versión esperada.

## Versiones

### v0.1.15 — Árbol VIEWS acoplado y botón PDF Ensambles oculto

- El botón `PDF Ensambles` del encabezado del panel `INSTANCIAS` queda oculto; la creación de views de ensamble/pieza mediante `clic derecho → Enviar a PDF` se conserva.
- El árbol `VIEWS` deja de flotar sobre la hoja PDF.
- En PDFs de sección y en PDFs con views de ensamble/pieza, `VIEWS` ocupa una columna lateral fija de 270 px.
- El área de navegación del papel se reduce automáticamente para que la hoja nunca quede debajo del árbol.
- La posición vertical del panel se ajusta a la altura real de la barra de herramientas, incluso cuando esta ocupa varias filas.
- El árbol mantiene scroll independiente del papel.
- Se conservan pestañas `MODELO/PDF`, zoom al cursor, PAN y edición/escala independiente de views.

### v0.1.14 — Zoom al cursor y Pan unificados en PDFs

- La rueda del mouse hace zoom directamente en cualquier PDF, incluidas las hojas con views de ensamble/pieza.
- El zoom toma como referencia la posición del cursor en lugar del borde izquierdo de la hoja.
- Se añade PAN del papel con botón central + arrastre.
- Como alternativa para mouse/touchpad, `Shift + arrastre izquierdo` también desplaza el papel.
- El PAN permite llevar la hoja hacia la derecha, izquierda, arriba o abajo sin quedar anclada al origen del viewport.
- Los botones `+` y `−` del PDF de sección usan el mismo estado de zoom visual.

### v0.1.13 — Navegación PDF, pestañas y edición independiente de Views

- Los distintos orígenes de PDF se presentan dentro de una navegación común de documentos.
- Se añade una barra inferior tipo CAD con una pestaña fija `MODELO` y una pestaña por cada PDF disponible.
- Al pulsar `MODELO` se regresa al Model Space; al pulsar una pestaña PDF se abre directamente ese documento.
- Las views de hojas PDF pueden seleccionarse y moverse libremente mediante arrastre o con controles de desplazamiento.
- Cada view puede usar escala `AUTO` o una escala técnica independiente `1:N`.
- Posición y escala de cada view se incorporan al snapshot del proyecto y se restauran al volver a abrirlo.
- Las vistas profesionales de sección conservan su sistema existente de movimiento/redimensionado independiente y su estado de escala por view.
- Integración funcional preparada en `c01b101b4fb23002b8dfb9fc7f7f15fc736e9352`.

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
