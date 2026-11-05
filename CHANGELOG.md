# Changelog de FrameLogic

Este archivo registra los cambios relevantes de cada versión visible de FrameLogic.

## Convención de mantenimiento

- Cada versión funcional nueva debe añadir su entrada aquí antes de considerarse cerrada.
- Las entradas se ordenan de la más reciente a la más antigua.
- Se documentan funciones nuevas, cambios de comportamiento, correcciones importantes y cambios técnicos que afecten el uso o la arquitectura.
- Los cambios únicamente de documentación no incrementan por sí solos la versión visible de FrameLogic.
- Las herramientas o diagnósticos temporales deben indicarse expresamente como temporales para poder retirarlos después.

---

## v0.1.77 — 2026-11-05

### Corregido: Render y calidad visual ocultos en el editor aislado de piezas

- Se elimina `[data-framelogic-model-render-mode="true"]` de la regla CSS del editor de piezas que imponía `display: none !important` y `visibility: hidden !important` a las herramientas generales del espacio modelo.
- La corrección de v0.1.76 montó el panel Render fuera del viewport, pero esta regla CSS aún lo ocultaba; ahora quedan disponibles los controles de estilo Sólido / Sólido + aristas / Alámbrico / Transparente y calidad Diseño / Detalle seleccionado / Detalle / Básico mientras se prepara una pieza.
- El resto de las herramientas generales continúan ocultas dentro del editor. Al volver al espacio modelo, los controles visuales permanecen accesibles.
- No se cambia el color, las piezas, el proyecto guardado, SNAPs, ejes ni las geometrías.

### Validación

- Prueba de regresión integrada en `test:piece-visuals` que inspecciona el CSS real de aislamiento y evita reintroducir un selector oculto, además de conservar el test del guard de JavaScript.
- Versión visible, package.json y package-lock.json sincronizados en `0.1.77`.

---

## v0.1.76 — 2026-11-05

### Corregido: color persistente al reabrir proyectos y estilos visibles al editar piezas

- El color automático se deriva de la identidad estable del recurso (hash de contenido si existe; de lo contrario formato y nombre de archivo) y ya no del UUID de AssetDefinition, que cambia cuando la misma pieza STEP/IFC se vuelve a importar al abrir un .flproject.
- El color explícito elegido para cada instancia continúa guardándose en los tags de .flproject; el cambio solamente estabiliza el color por defecto sin sobreescribir preferencias guardadas.
- Los controles Render y calidad visual ahora se montan en document.body con posición fija y prioridad visual superior a la capa aislada del editor de pieza. Dejan de desaparecer detrás del workspace y siguen disponibles al volver al modelo.
- El panel de Render se posiciona respecto a la ventana y por encima del panel de secciones cuando éste es visible; conserva los estilos Sólido, Sólido + aristas, Alámbrico y Transparente y la calidad Diseño, Básico, Detalle seleccionado y Detalle.
- No se modifican archivos de proyecto, definiciones, geometría, ejes, SNAPs ni coordenadas.

### Validación

- Pruebas para identidad de color con IDs diferentes de la misma geometría y para montar los controles Render fuera del viewport, integradas en `test:piece-visuals`.
- Version visible, package.json y package-lock.json sincronizados en `0.1.76`.

---

## v0.1.75 — 2026-11-05

### Corregido: estilos visuales en el editor de pieza FrameLogic

- Los controles de Render y calidad visual permanecen accesibles al entrar en el editor de pieza aislada; ya no forman parte del chrome que se oculta.
- Cambiar entre Básico, Diseño, Detalle seleccionado y Detalle afecta realmente la geometría que muestra la pieza en preparación. Antes se forzaba siempre a Detalle independientemente de la selección.
- Detalle seleccionado mantiene la pieza en edición con geometría detallada y las demás con geometría de trabajo; Básico y Diseño ya no reciben excepciones invisibles de detalle.
- Los estilos Sólido, Sólido + aristas, Alámbrico y Transparente siguen disponibles en ambas vistas, sin alterar geometría persistente, SNAPs, ejes ni precisión de selección.

### Validación

- Pruebas de política visual para cada modo y para la exclusión del control de Render de los elementos que el editor oculta.
- Versión visible, package.json y package-lock.json sincronizados a `0.1.75`.

---

## v0.1.74 — 2026-11-05

### Identificación visual de SNAPs y ejes

- El editor resalta temporalmente cada referencia sobre la geometría 3D al pasar el mouse sobre su fila de SNAP o eje.
- Nuevo botón `◎` para fijar o quitar el foco en una referencia. La fila queda destacada y el usuario puede comparar otros elementos sin renombrar ni modificar tipos.
- Los SNAPs se muestran como marcadores grandes de tamaño constante en pantalla; los ejes como una línea amarilla con ambos extremos resaltados.
- Los marcadores son visuales y no interceptan raycasts, selección ni SNAPs de modelado.
- El resaltado se actualiza tras modificar referencias y se limpia al salir de la preparación; la geometría persistente no cambia.

### Validación

- Nuevas pruebas para mostrar SNAP/eje, cambiar foco y limpiar marcadores, integradas en `test:piece-preparation`.
- Versión visible, package.json y package-lock.json a `0.1.74`.

---

## v0.1.73 — 2026-11-05

### Mejoras de interfaz del editor de piezas

- Se unifican `Metadatos de ingeniería` y `Preparar pieza` en una sola columna lateral, sin ventanas flotantes que bloqueen el espacio modelo.
- La sección de metadatos es desplegable/contraíble y comienza contraída, priorizando las herramientas de geometría, SNAPs y ejes; sus valores permanecen intactos al alternar.
- Los comandos de preparación quedan justo debajo de metadatos, seguidos de la lista editable de SNAPs y ejes, con desplazamiento vertical disponible.
- Al salir del editor, el panel de preparación se desprende antes de destruir el workspace y regresa al stack habitual del modelo; se preservan los selectores y listeners.
- No cambian geometría, conversiones STEP, ejes, coordenadas, SNAPs ni transformaciones.

### Validación

- Pruebas de regresión para acoplar el panel al sidebar, regresar al layout normal y evitar destruirlo al cerrar el editor.
- Versión visible, package.json y package-lock.json sincronizados en `0.1.73`.

---

## v0.1.72 — 2026-11-05

### Corregido

- La inserción precisa `SmartPieceInsertionController` (barra INSERTAR PIEZA XYZ) tiene prioridad sobre el recuadro de selección CAD durante los dos clics: origen FrameLogic y dirección 3D.
- El estado de inserción inteligente se registra explícitamente en `CadWindowSelectionController`, que deja de iniciar ventanas de selección durante la colocación.
- Antes de insertar, se cancela cualquier ventana CAD que estuviese esperando su segunda esquina.
- Al finalizar o cancelar, la selección por ventana vuelve a funcionar; se preservan el origen de la pieza, SNAPs, dirección 3D y F8 ORTO.
- Sin cambios en geometría, cálculo de orientación o transformaciones.

### Validación

- Tres pruebas adicionales de prioridad del insertador preciso, candidato pendiente, selección anterior y retorno a selección normal; ejecutadas en `test:gizmos`.
- Versión visible, package.json y package-lock.json sincronizados en `0.1.72`.

---

## v0.1.71 — 2026-11-05

### Corregido

- `Insertar otra pieza` utiliza dos clics: el primero fija posición y el segundo define dirección horizontal, alineando +X local con una rotación alrededor del eje Y.
- Los clics de inserción no arman ni completan la selección CAD por ventana; se cancela cualquier rectángulo pendiente al empezar.
- La vista previa permanece en la posición elegida mientras rota hacia el segundo punto; un segundo clic coincidente no completa una orientación ambigua.
- Los selectores de piezas, puntos y líneas quedan suspendidos durante la inserción y se restablecen al finalizar o cancelar.

### Validación

- Pruebas de regresión para ambos clics y para evitar ventanas CAD durante la inserción.
- Versión visible, package.json y lockfile sincronizados a `0.1.71`.

---

## v0.1.70 — 2026-11-04

### Corregido

- El panel **Preparar pieza** con la lista de SNAPs persistentes, el selector de tipo y los ejes se mantiene visible al entrar en el editor aislado FrameLogic.
- El adaptador de diseño retira temporalmente ese panel del stack general que se oculta durante la edición y lo muestra a la derecha del formulario de metadatos, con desplazamiento vertical.
- Al volver al espacio modelo, el panel retorna al stack normal; los cambios de modo se detectan aunque no haya nuevas mutaciones de elementos.
- Se conservan los tipos ORIGIN, CENTER, CONNECTION, REFERENCE y CUSTOM. ORIGIN sigue protegido mediante la herramienta de cambio de origen.
- No se cambia la geometría, ni los datos de las piezas, ejes, snaps o transformaciones.

### Validación

- Se agregan tres pruebas sobre visibilidad, retorno al layout original y ausencia de reparenting repetido, integradas en `test:piece-preparation`.
- Versión visible, package.json y lockfile sincronizados en `0.1.70`.

---

## v0.1.69 — 2026-11-04

### Corregido

- El editor aislado de piezas activa automáticamente la preparación geométrica ANTES de dibujar líneas o puntos CAD, evitando que `Línea → eje` oculte después los objetos al cambiar de capa.
- `Línea → eje` funciona aunque el comando LINE siga abierto: termina el trazado sin deshacer segmentos ya creados, selecciona el último segmento CAD válido y crea el eje persistente; la previsualización pendiente no se convierte en una línea ficticia.
- La selección CAD no oculta la pieza aislada: el aislamiento conserva la lista original de instancias al entrar, en lugar de depender de la selección que cambia durante el dibujo.
- Iniciar la preparación no borra automáticamente los puntos o líneas de una capa temporal previamente existente. La limpieza al pulsar `Salir de preparación` se mantiene.
- Los botones de conversión muestran los errores en el panel, en vez de dejar fallos silenciosos o prometer una conversión que no se realizó.

### Validación

- Pruebas para inicio automático, LINE activo sin Esc, ausencia de línea completa y selección del último segmento; version visible, package.json y lockfile a `0.1.69`.

---

## v0.1.68 — 2026-11-04

### Corregido

- Al usar `Línea → eje` o `Punto → SNAP` dentro de la preparación geométrica de una pieza, no se reinicia la preparación si ya está activa para esa instancia.
- Se conservan la selección CAD y las líneas/puntos temporales hasta que el usuario termina la preparación; el eje se agrega como referencia persistente sin borrar su línea CAD original al convertirla.
- La función central `startPieceDefinitionPreparation` reutiliza el contexto antes de cancelar comandos, y la clase `PieceDefinitionPreparationController.start` protege también a otros llamadores.
- El cambio de pieza y `Salir de preparación` conservan la limpieza temporal existente. No cambian geometría, sistema de coordenadas, snaps ni modelos importados.

### Validación

- Nuevas pruebas para un segundo inicio idempotente y para la conversión real de una línea CAD seleccionada en eje persistente sin eliminar CAD.
- Se incorpora `test:piece-preparation` en CI y se sincronizan versión visible, package.json, lockfile y CHANGELOG en `0.1.68`.

---

## v0.1.67 — 2026-11-04

### Corregido

- MOVE vuelve a reconocer los SNAPs de la pieza seleccionada después de colocar el centro del gizmo sobre una referencia y pulsar un eje para elegir un segundo SNAP.
- El veto de SNAPs propios se aplica solo durante un arrastre real; desaparece cuando el eje queda armado esperando un clic de destino (`HASTA`), sin perder los SNAPs externos.
- Se preserva el movimiento restringido por eje/plano, el pivote temporal independiente, historial Undo/Redo y los controles de cámara.

### Validación

- Se agregan pruebas de transición `DRAGGING` a `PICK_DESTINATION`, SNAP sobre la pieza propia y referencias externas; integradas en `test:gizmos`.
- Version visible, package.json y package-lock.json sincronizados en `0.1.67`.

---

## v0.1.66 — 2026-11-04

### Corregido

- La rueda del raton presionada vuelve a orbitar despues de alternar entre camara ORTHOGRAPHIC y PERSPECTIVE mediante el ViewCube.
- That Open ProjectionManager reasigna `mouseButtons.middle` a ZOOM o DOLLY al cambiar la proyeccion; FrameLogic reaplica sus controles CAD despues del cambio.
- Se preserva el zoom mediante el giro de la rueda, PAN con boton derecho y seleccion/comandos con boton izquierdo. No se modifica geometria, ejes, SNAPs ni transformaciones.

### Validacion

- Pruebas de regresion para restaurar la orbita despues de ambos cambios de proyeccion, conservar el zoom de rueda y restaurar los botones al desmontar el controlador.
- La validacion de `main` ejecuta la prueba de camara; el build especifico de Cloudflare vuelve a verificarse en la rama principal.
- Version visible, package.json y package-lock.json sincronizados en `0.1.66`.

---

## v0.1.65 — 2026-11-04

### Corregido

- Se recupera la vista `VISTAS DE SECCIÓN` dentro del arbol `INSTANCIAS` cuando el layout reubica ese panel fuera del contenedor original del visor.
- El mismo ajuste recupera los grupos `ENTIDADES CAD` y `PLANOS / PDF` y los ojos de visibilidad de grupos que dependen del arbol reubicado.
- Los controladores siguen el panel real tanto antes como despues de moverlo al stack lateral en `document.body`; la limpieza al desmontar actua sobre ese mismo arbol.
- No se alteran modelos, referencias CAD, posiciones, geometria ni definiciones de seccion.

### Validación

- Pruebas de regresion para la localizacion del arbol antes y despues del reparenting y ausencia de panel.
- Se centraliza `main` como rama de integracion; se mantienen las ramas historicas y `Andres`/`Miguel` sin modificacion.
- Version visible, package.json y package-lock.json sincronizados en `0.1.65`.

---

## v0.1.64 — 2026-11-03

### Corregido

- Se impide que las barras y los botones generales de edicion del espacio modelo sigan visibles por detras del encabezado al entrar en `Convertir a pieza FrameLogic` o `Editar pieza FrameLogic`.
- El editor declara explicitamente su estado activo en `document.documentElement`; una regla CSS de prioridad oculta los controles generales incluso si un adaptador de layout vuelve a aplicarles estilos en linea.
- `Volver al modelo` elimina la marca y restaura la interfaz original. El panel de metadatos del editor y ViewCube permanecen disponibles.

### Tecnico y validacion

- No se modifica geometria, SNAP, ejes, transformaciones ni datos de piezas. Se conserva el guard anterior como respaldo para otros controles reubicados.
- Version visible, package.json y package-lock.json sincronizados en `0.1.64`. Requiere comprobacion manual del editor aislado sobre piezas reales.

---

## v0.1.63 — 2026-11-03

### Corregido

- Un clic corto sobre los aros o ejes de ROTATE/MOVE no debe interpretarse tambien como primera esquina de una ventana de seleccion del espacio modelo.
- El controlador de ventana descarta el candidato al soltar si una herramienta deshabilito la seleccion durante el mismo gesto; no modifica transformaciones, SNAP ni Undo/Redo.
- Los clics reales en espacio vacio conservan la seleccion CAD por dos esquinas.

### Validacion

- Se incorporan pruebas del conflicto con gizmos, seleccion en espacio vacio y clic sobre pieza dentro de `test:gizmos`.
- Se sincronizan version visible, package.json y package-lock.json en `0.1.63`.

---

## v0.1.62 — 2026-11-02

### Corregido

- Un clic corto sobre un eje o aro del gizmo ya no puede dejar `TransformControls` en estado de arrastre después de soltar el botón del mouse.
- Si el estado nativo `dragging` queda desincronizado de la propiedad física del botón, el siguiente evento de puntero lo corrige antes de permitir cualquier movimiento de la pieza.
- Se añade `mouseup` como ruta de respaldo para cerrar el gesto cuando el navegador o una integración interrumpe la secuencia normal de `pointerup`.
- Un nuevo `pointerdown` limpia primero cualquier arrastre nativo huérfano antes de iniciar un gesto nuevo.

### Validación

- Se añaden pruebas para `dragging` sin propietario de puntero y para ausencia de `pointerup` con `mouseup` disponible.
- Se mantienen las pruebas existentes de clic/arrastre, liberación fuera del visor, cancelación, foco numérico y aros completos de ROTATE.
- Versión visible y `package.json` sincronizados en `0.1.62`.

---

## v0.1.61 — 2026-11-02

### Corregido

- Al abrir `Convertir a pieza FrameLogic` o `Editar pieza FrameLogic`, las barras y paneles generales del Model Space que fueron reubicados fuera del contenedor 3D dejan de quedar visibles por encima del editor de pieza.
- Se ocultan temporalmente la barra de proyecto, la barra principal, el stack lateral de Model Space y los paneles inferiores de sección/render mientras el workspace de pieza está activo.
- Al pulsar `Volver al modelo`, cada control recupera el estado de visualización que tenía antes de entrar al editor.
- El ViewCube y el badge de versión permanecen disponibles para conservar orientación y trazabilidad durante la edición.

### Técnico

- Se añade un guard de layout independiente que detecta el workspace aislado de pieza y complementa el ocultamiento histórico de `PieceFrameLogicWorkspaceController` para controles movidos a `document.body` por los adaptadores actuales.
- El guard no modifica geometría, referencias, SNAPs, ejes, transformaciones ni datos de ingeniería.
- Versión visible y `package.json` sincronizados en `0.1.61`.

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
