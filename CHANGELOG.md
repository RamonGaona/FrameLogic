# Changelog de FrameLogic

Este archivo registra los cambios relevantes de cada versión visible de FrameLogic.

## Convención de mantenimiento

- Cada versión funcional nueva debe añadir su entrada aquí antes de considerarse cerrada.
- Las entradas se ordenan de la más reciente a la más antigua.
- Se documentan funciones nuevas, cambios de comportamiento, correcciones importantes y cambios técnicos que afecten el uso o la arquitectura.
- Los cambios únicamente de documentación no incrementan por sí solos la versión visible de FrameLogic.
- Las herramientas o diagnósticos temporales deben indicarse expresamente como temporales para poder retirarlos después.

---

## v0.1.60 — 2026-11-02

### Corregido

- Los aros X/Y/Z de ROTATE se muestran completos (360°), coincidiendo con sus zonas de selección. Se aumenta ligeramente su grosor y el tamaño del gizmo para facilitar su lectura.
- Los gizmos de piezas, puntos, líneas y selección CAD mixta distinguen un clic de un arrastre mediante un umbral de 5 píxeles, evitando movimientos por vibraciones pequeñas del mouse.
- Se finaliza el gesto si el botón se libera fuera del visor, se pierde la captura o llega un movimiento sin el botón principal pulsado.
- La cancelación del puntero o la pérdida de foco restaura la transformación inicial y libera el gesto nativo. Desactivar la herramienta durante un arrastre también lo cancela antes de descartar sus snapshots.
- Los campos numéricos de distancia/ángulo esperan a la liberación del puntero para recibir foco.
- El centro temporal de ROTATE ignora otros punteros y limpia su estado ante cancelación o pérdida de foco. El clic seguido de SNAP para recolocar el centro se conserva.

### Validación

- Se añade `npm run test:gizmos`, con pruebas de clic/arrastre, liberación, cancelación, foco numérico y círculos completos en cámaras perspectiva y ortográfica.
- Versión visible, `package.json` y metadatos del lockfile sincronizados en `0.1.60`.
- Se conserva el trabajo de representaciones ligeras de `v0.1.59` como base de esta rama.

---

## v0.1.59 — 2026-10-30

### Añadido

- Separación entre geometría visual básica, de trabajo y detallada para piezas del Model Space.
- Selector de calidad en `Render`: `Diseño` (por defecto), `Detalle seleccionado`, `Detalle` y `Básico`.
- La pieza que se está preparando conserva su representación detallada.
- Los nuevos `.flpiece` STEP incorporan tres representaciones GLB en milímetros, junto al STEP maestro, las referencias y los datos de ingeniería existentes.
- Al abrir estas piezas se reutiliza la malla guardada y se omite la triangulación visual STEP. El B-Rep se sigue cargando desde el maestro para conservar las consultas exactas.
- La caché visual queda vinculada mediante SHA-256 a su archivo maestro. Si es incompatible o está dañada, la apertura recurre al STEP.

### Optimizado

- Simplificación visual por agrupación espacial de vértices; las piezas pequeñas, con texturas, múltiples grupos o animación conservan su malla original.
- Una caché por geometría comparte las representaciones entre todas sus instancias.
- Descarte por cajas envolventes de detalle antes del raycast de las consultas geométricas.
- Liberación de las tres representaciones al retirar sus prototipos.

### Precisión y compatibilidad

- Los puntos, ejes, sistema local y features exactos permanecen independientes del nivel visual.
- El raycast y las consultas derivadas de malla utilizan la geometría detallada, incluso en modo Diseño o Básico.
- Cambiar de representación conserva objetos, identificadores, transformaciones, propiedades y materiales.
- Se mantiene compatibilidad con `.flpiece` anteriores sin caché y con STEP/IFC externos.
- El formato sigue siendo `.flpiece` JSON v1 con un bloque visual opcional. El ZIP `.flp`, la compresión, el LOD automático por cámara y el agrupamiento GPU mediante `InstancedMesh` quedan pendientes.
- El guardado de proyectos conserva su formato actual y reconstruye las cachés visuales al abrirlos; el atajo GLB de esta versión corresponde a archivos individuales `.flpiece` STEP.

### Validación

- Se añade `npm run test:piece-visuals` para comprobar simplificación, reutilización, transformaciones, raycast, liberación de recursos, reapertura GLB y conservación del B-Rep maestro.
- Versión visible, `package.json` y metadatos de versión del lockfile sincronizados en `0.1.59`.

---

## v0.1.58 — 2026-10-30

### Optimizado

- Los kernels STEP/OpenCascade permanecen descargados mientras FrameLogic se utiliza únicamente como CAD y empiezan a inicializarse al pulsar `Importar pieza`.
- La inicialización de los kernels visual y B-Rep se lanza en paralelo desde la intención de importación, permitiendo que avance mientras el usuario selecciona el archivo.
- La indexación B-Rep de superficies recorre las caras una sola vez para extraer cilindros y planos, evitando el recorrido duplicado anterior.
- La inferencia de escala B-Rep ↔ malla calcula los límites directamente sobre los vértices y `Float32Array`, sin crear objetos temporales por cada vértice visual.

### Precisión

- Se mantienen sin cambios las tolerancias de triangulación STEP.
- Se conservan el `TopoDS_Shape`, vértices, aristas, círculos, cilindros, planos y features B-Rep exactos utilizados por SNAP y consultas geométricas.

### Técnico

- Se añade `warmup()` al kernel B-Rep y un instalador de warmup asociado exclusivamente a la acción `Importar pieza`.
- La instrumentación `window.__frameLogicStepTimings` se mantiene activa para comparar los tiempos antes y después de la optimización.
- La versión visible y la versión raíz del proyecto quedan sincronizadas en `0.1.58`.

---

## v0.1.57 — 2026-10-30

### Corregido

- `Capas CAD` deja de ocupar una segunda fila dentro de la barra de proyecto.
- El control de capas DWG/DXF pasa a la columna lateral izquierda, encima de `INSTANCIAS`.
- Al desplegar `Capas CAD`, el panel participa del flujo vertical y desplaza `INSTANCIAS` hacia abajo en lugar de superponerse.
- El panel expandido tiene altura limitada y scroll propio para referencias con muchas capas.
- La barra superior recupera espacio horizontal al retirar de ella el control `Capas CAD`.

### Técnico

- Se añade un adaptador de layout independiente para integrar la UI existente de `CadReferenceLayerPanelController` con el stack lateral del Model Space sin modificar su lógica funcional.
- La versión visible y la versión raíz del proyecto quedan sincronizadas en `0.1.57`.

---

## v0.1.56 — 2026-10-30

### Corregido

- Se elimina el solapamiento entre la barra de Archivo/proyecto y la barra principal de herramientas del Model Space.
- Las barras superiores ahora se distribuyen lado a lado cuando existe espacio suficiente y se apilan automáticamente en resoluciones más estrechas.
- El ancho disponible de la barra principal reserva el espacio del ViewCube para evitar que los controles invadan la navegación de vista.
- El panel de Instancias se desplaza hacia abajo automáticamente si las barras superiores ocupan más altura.
- El badge de versión deja de superponerse con los paneles inferiores `SECCIÓN` y `Render` y se mantiene por encima de ellos.

### Técnico

- El layout del Model Space observa cambios de tamaño en barras y paneles para reajustarse al añadir o retirar herramientas dinámicas.
- La versión visible y la versión raíz del proyecto quedan sincronizadas en `0.1.56`.

---

## v0.1.55 — 2026-10-30

### Añadido

- Instrumentación temporal de rendimiento para importación STEP.
- Medición separada de:
  - copia del STEP original;
  - inicialización del kernel visual WASM;
  - lectura y triangulación visual del STEP;
  - carga e indexación del B-Rep exacto;
  - copia de buffers de malla;
  - inferencia de escala entre B-Rep y malla;
  - construcción del árbol de productos;
  - creación de features exactos;
  - tiempo total de importación.
- Resumen de complejidad por archivo STEP:
  - tamaño del archivo;
  - número de mallas;
  - vértices visuales;
  - triángulos;
  - vértices y aristas B-Rep;
  - cilindros y planos detectados;
  - features exactos y productos.
- Historial temporal de la sesión disponible en `window.__frameLogicStepTimings`.

### Notas

- Esta instrumentación es temporal y no modifica la geometría ni el resultado de la importación.
- Su objetivo es localizar los cuellos de botella antes de optimizar el flujo STEP.

---

## v0.1.54 — 2026-10-30

### Añadido

- Propiedad de color por `DesignLayer`.
- Selector de color en el panel de Layers.
- Aplicación visual del color del layer a entidades CAD.
- Herencia automática del color al mover una entidad CAD de un layer a otro.
- Persistencia del color del layer al guardar y volver a abrir proyectos.
- Compatibilidad con proyectos anteriores que no contienen la propiedad `color`.

### Entidades afectadas

- `LINE`
- `POLYLINE`
- `RECTANGLE`
- `POINT`
- `CIRCLE`

### Notas

- Las piezas 3D y referencias IFC todavía no heredan el color del layer.
- La selección CAD mantiene su resaltado visual para distinguirla del color normal del layer.

---

## v0.1.53 — 2026-10-30

### Añadido

- Grips de vértices para `POLYLINE`.
- Visualización automática de todos los vértices de la polilínea al seleccionar uno de sus tramos.
- Arrastre directo de vértices con actualización de geometría en tiempo real.
- Compatibilidad del arrastre con SNAP y ORTO.
- Bloqueo temporal de la cámara durante el arrastre de un grip.
- `Esc` cancela el arrastre y restaura la posición anterior.
- El movimiento completo de un grip se registra como una sola operación de Undo/Redo.

### Compatibilidad

- Se mantiene la selección histórica por tramo para que comandos como `TRIM` puedan seguir trabajando sobre segmentos concretos.

---

## v0.1.52 — 2026-10-30

### Añadido

#### COPY base

- Copia de geometría CAD mediante selección → punto base → punto destino.
- Una `POLYLINE` conserva su estructura al copiarse.
- Se conservan layer, orden de segmentos y estado abierto/cerrado.

#### STRETCH

- Ventana de cruce para seleccionar vértices/extremos.
- Movimiento únicamente de los extremos incluidos dentro de la ventana.
- Los vértices compartidos de polilíneas se mantienen conectados.

#### PEDIT

- Edición de `POLYLINE` con operaciones para:
  - mover vértice;
  - añadir vértice;
  - eliminar vértice;
  - abrir/cerrar;
  - invertir sentido;
  - separar tramo.
- Integración con Undo/Redo, SNAP, WorkPlane, layers y persistencia del proyecto.

### Limitaciones conocidas de esta versión

- COPY está orientado a geometría CAD; la copia de piezas 3D queda para una etapa posterior.

---

## v0.1.51 — 2026-10-30

### Añadido

- Capa semántica de `POLYLINE` sobre segmentos `CadLine` existentes.
- Conversión automática de una secuencia continua de líneas en una polilínea a partir del segundo segmento conectado.
- `RECTANGLE` registrado como una polilínea cerrada.
- Comando `JOIN / UNIR` para convertir dos o más líneas conectadas en una polilínea.
- Posibilidad de combinar líneas con polilíneas existentes.
- Ordenamiento automático de segmentos y detección de sentido invertido.
- Detección de polilíneas abiertas y cerradas.
- Rechazo de cadenas desconectadas y ramificaciones ambiguas tipo T/Y.
- Historial Undo/Redo para operaciones `JOIN POLYLINE`.
- Persistencia de la identidad de polilínea dentro del proyecto.

### Compatibilidad

- Los segmentos internos continúan siendo `CadLine`, preservando compatibilidad con SNAP, TRIM/EXTEND y otras herramientas existentes.

---

## Historial anterior

Las versiones anteriores a `v0.1.51` aún no se han reconstruido aquí de forma completa. Pueden documentarse progresivamente a partir del historial de commits cuando sea necesario.
