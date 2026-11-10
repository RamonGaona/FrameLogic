# Changelog de FrameLogic

Este archivo registra los cambios relevantes de cada versión visible de FrameLogic.

## Convención de mantenimiento

- Cada versión funcional nueva debe añadir su entrada aquí antes de considerarse cerrada.
- Las entradas se ordenan de la más reciente a la más antigua.
- Se documentan funciones nuevas, cambios de comportamiento, correcciones importantes y cambios técnicos que afecten el uso o la arquitectura.
- Los cambios únicamente de documentación no incrementan por sí solos la versión visible de FrameLogic.
- Las herramientas o diagnósticos temporales deben indicarse expresamente como temporales para poder retirarlos después.

---

## v0.1.96 — 2026-11-09

### Menú ARCHIVO compacto y visibilidad individual de piezas

- **ARCHIVO ▾:** se agrupan en un solo menú desplegable los comandos Guardar proyecto, Abrir proyecto, Abrir DWG/DXF, Importar pieza y Abrir pieza FrameLogic. El menú se despliega hacia abajo, se cierra con clic fuera o Escape, y los comandos conservan sus controladores originales para no romper selección de archivos ni descargas.
- **Barra más limpia:** los botones originales permanecen montados pero solo se ocultan cuando el menú está disponible; se evita dejar una etiqueta ARCHIVO duplicada en la barra principal. El indicador de autoguardado continúa visible fuera del menú.
- **Ojos individuales:** las filas de ensamble y de pieza reciben sus IDs reales al crearse. PieceAppearanceController encuentra INSTANCIAS también después de que el layout mueve su panel a document.body, sin inferir identidad del nombre visible o del ID abreviado.
- **Refresco inmediato:** después de reconstruir el árbol se notifica al controlador de apariencia para volver a colocar los ojos en piezas agrupadas y sueltas, manteniendo el estado centralizado en DesignSceneController.
- **Menú contextual:** la decoración de color vuelve a recibir clics derechos sobre INSTANCIAS aunque el panel haya sido reubicado.
- **Regresión:** pruebas del listado y resolución de acciones ARCHIVO, y de la detección por IDs para una pieza dentro de ensamble y una suelta. Se incluyen en el flujo existente de pruebas del árbol.
- No se cambian los datos del proyecto, la geometría STEP/IFC ni los ojos generales de ensambles, secciones y entidades CAD. Sin nuevas dependencias de pago.

### Verificación visual

- Probar en un proyecto con ensambles y piezas sueltas los ojos individuales y generales, incluido el caso de ocultar una sola pieza dentro de un ensamble.
- Probar los cinco comandos de ARCHIVO y el cierre con clic fuera / Escape en la aplicación desplegada.

---

## v0.1.95 — 2026-11-09

### Corrección de visibilidad · Árbol INSTANCIAS

- **Piezas y ensambles:** los ojos individuales, el ojo de cada ensamble y los ojos generales de ENSAMBLAJES y PIEZAS SUELTAS emplean un único estado de ocultación por PieceInstance en DesignSceneController. Ocultar no altera posiciones, definiciones, geometría STEP ni los datos de proyecto.
- **Actualización estable:** las operaciones de visibilidad sobre grupos utilizan IDs del modelo y una sola sincronización, sin generar clics sintéticos en botones del DOM que pueden haber sido reconstruidos.
- **Propietario único de controles:** PieceAppearanceController administra los ojos individuales y por ensamble. Se retiró el segundo decorador del panel antiguo y la lógica duplicada del controlador de consistencia.
- **Vistas de sección:** el ojo general aplica la ocultación/restitución a todas las vistas en lote, con una sola resincronización; se preserva la acción individual.
- **Entidades y referencias CAD:** no se modifican sus controles de visibilidad.
- **Pruebas:** regresiones para grupos mixtos/legados, visibilidad de instancias con LOD/filtros, y visibilidad múltiple de secciones; se agrega validación específica en GitHub Actions.

### Límites

- La ocultación de piezas desde INSTANCIAS es una preferencia temporal del espacio modelo, no cambia la visibilidad de una capa ni el formato .flproject.
- Confirmar manualmente los ojos en los proyectos reales con STEP, secciones y componentes enlazados tras el despliegue.

---

## v0.1.94 — 2026-11-09

### Ensambles · Etapa A: estabilidad de composición

- **Agrupación segura:** crear un ensamble con piezas previamente agrupadas valida primero todas las instancias y la capa, registra el nuevo grupo y después retira las piezas de sus grupos anteriores; un error en la creación ya no puede desagrupar las piezas originales.
- **Traslado entre ensambles:** el árbol usa una operación del modelo de diseño que conserva el orden de miembros, evita insertar IDs duplicados y no duplica la geometría ni las definiciones STEP/IFC compartidas.
- **Validaciones del modelo:** los nuevos ensambles y actualizaciones normales rechazan IDs de piezas repetidos, inexistentes o que ya pertenezcan a otro ensamble. Se conservan las rutas de importación heredadas para no cambiar automáticamente los proyectos antiguos.
- **Interfaz:** la opción de liberar las piezas aparece explícitamente como «Desagrupar ensamble (conservar piezas)».
- **Regresión:** nuevas pruebas del dominio para reagrupar, trasladar, impedir duplicados, conservar miembros ante errores y desagrupar sin borrar piezas. El formato persistido sigue siendo FRAMELOGIC_PROJECT v1, sin migraciones destructivas.

### Limitaciones y siguientes etapas

- Los ensambles siguen siendo grupos planos: los subensambles jerárquicos, el origen local del conjunto, los cambios de transformaciones con historial CAD y los arreglos se abordarán por separado, después de pruebas específicas.
- La importación de archivos anteriores conserva su representación y no repara automáticamente vínculos antiguos inconsistentes.
- Las operaciones de agrupar, mover miembros entre grupos y desagrupar todavía necesitan integrarse con Undo/Redo del historial CAD; no se declara terminada la Etapa B.
- El despliegue en Cloudflare Pages y las pruebas manuales del navegador deben confirmarse por separado de CI.

---

## v0.1.93 — 2026-11-09

### Etapa 3 · Automatización segura desde chat web y MCP

- **Consultas del modelo**: herramientas `query_objects` (buscar por ID, nombre/código o selección, hasta 100 resultados) y `describe_object` (posición, rotación, ejes locales, SNAPs persistentes y límites 3D). Los límites salen de la geometría detallada registrada, no de la representación LOW/WORK/DETAIL; si aún no está cargada, se indica explícitamente.
- **Scripts de comandos**: `prepare_commands` recibe de 1 a 12 órdenes explícitas de movimiento/copia y propone los resultados sin modificar el modelo. Permite movimientos sucesivos de una misma pieza y copias desde su posición simulada.
- **Aprobación humana**: `confirm_commands` valida ID, caducidad (2 minutos) y vigencia del modelo. Requiere confirmación en la pestaña FrameLogic antes de ejecutar; no hay ejecución de código arbitrario ni cambios directos producidos por la IA.
- **Undo/Redo conjunto**: toda secuencia se aplica como una única operación compartida en el historial CAD, con prevalidación, rollback de mutaciones parciales y recuperación de IDs de copia al rehacer.
- **Chat web**: búsqueda y descripción de piezas, y secuencias deterministas separadas por punto y coma; muestra la propuesta con destinos en milímetros y botón **Revisar y aplicar**. La IA WebLLM sigue siendo solo lectura.
- Pruebas de regresión de consultas, control de permisos, límites de scripts, planes obsoletos, aceptación/denegación, atomicidad, deshacer y rehacer; integración con MCP local/remoto existente.
- Sin nuevos servicios ni dependencias de pago. Inspirado en la arquitectura de herramientas de Cota (Apache-2.0), con atribución.

### Límites

- Sólo mover/copiar instancias editables no pertenecientes a ensamblajes bloqueados por el sistema actual. Alineación automática, edición de geometría, ejecución de código JavaScript arbitrario y referencias a piezas creadas dentro del mismo script quedan fuera de esta etapa.
- Las consultas de límites 3D son de la geometría visual detallada cuando está disponible, **no tolerancias B-Rep certificadas**. Consultas SNAP/ejes se mantienen independientes del LOD.
- Debe comprobarse en la aplicación publicada la aprobación de un lote y el Undo/Redo con un proyecto de prueba real.

---

## v0.1.92 — 2026-11-09

### Etapa 2 · Precisión e interacción: rastreo SNAP y LOD adaptativo

- **Refs → Rastreo SNAP (X/Y):** control opcional, desactivado por defecto. Al mantener el cursor sobre un SNAP exacto aproximadamente 350 ms, se adquiere el punto como referencia temporal. Al desplazar el cursor cerca de los ejes X/Y del WorkPlane activo, se dibuja una guía y se genera un punto de posicionamiento 3D sobre el eje; los SNAPs directos siempre tienen prioridad.
- El rastreo utiliza tolerancia de pantalla de 10 píxeles y la dirección real del WorkPlane (XY, XZ, YZ o personalizado), no presupone ejes globales. Se cancela al salir del canvas, desactivarse o pasados 15 segundos.
- **Render → Automático (zoom):** selección adaptativa entre LOW, WORK y DETAIL según tamaño proyectado por pieza, con histéresis para evitar parpadeos. La pieza seleccionada o en preparación conserva DETAIL, y los modos manuales Diseño, Básico, Detalle y Detalle seleccionado siguen disponibles.
- Las representaciones siguen siendo exclusivamente visuales; el STEP y B-Rep original permanecen intactos y el raycast utiliza la geometría detallada. No modifica metadatos ni transformaciones.
- Pruebas de rastreo en ejes rotados, validación de profundidad y tolerancia, cambio de LOD al zoom y regresión de geometría detallada por instancia.
- Diseño inspirado en el rastreo y LOD de Cota (Christian Orengia, Apache-2.0), conservando su atribución en `docs/third-party/`.

### Limitaciones

- El rastreo está disponible solo si el WorkPlane está activo; requiere captar previamente un SNAP exacto y admite un único origen temporal X/Y, no cruces entre dos orígenes ni tangencias automáticas.
- El modo adaptativo no reduce el B-Rep ni sustituye las representaciones LOD existentes. Los elementos sin límites válidos conservan calidad Diseño.
- Pendiente prueba visual en un modelo STEP complejo y evaluación de FPS/uso de memoria en el navegador antes de ampliar su alcance.

---

## v0.1.91 — 2026-11-09

### Etapa 1 · Vistas técnicas y acotación automática (adaptación Cota)

- Nuevo botón **Vistas auto** en el espacio de documentación: construye cuatro secciones espaciales del modelo visible —alzado, planta, lateral e isométrica— usando sus límites 3D y bases ortonormales, y las incorpora a una hoja con vistas secundarias.
- Nuevo botón **Cotas auto**: genera cotas horizontales/verticales desde vértices STEP B-Rep reales y cotas de diámetro y posición desde círculos cuyos planos son paralelos al plano de la vista. No se calculan cotas automáticas desde geometría visual simplificada.
- Las cotas quedan como anotaciones editables del documento; regenerarlas sustituye solo las cotas automáticas, sin borrar las cotas manuales.
- Planificador geométrico aislado, pruebas unitarias de cuatro proyecciones, ortogonalidad, contención del volumen, referencias, límites, duplicados y cotas de agujeros.
- Lógica adaptada de las ideas de Cota (Christian Orengia, Apache-2.0) con atribución y avisos en `docs/third-party/COTA_ATTRIBUTION.md`; se mantienen el STEP maestro, el B-Rep OpenCascade y el editor existente.

### Límites y verificación

- La autoacotación exterior usa vértices exactos; los extremos de superficies curvas sin vértices extremos pueden quedar fuera de esa cota. Los planos requieren revisión técnica antes de fabricación.
- Las secciones automáticas no sustituyen las vistas previas ni se regeneran silenciosamente. Si cambia la geometría, comprueba las vistas o crea otras secciones.
- Los resultados deben validarse con proyectos STEP reales y pruebas visuales del navegador, además de las pruebas automáticas.

---

## v0.1.90 — 2026-11-08

### Chat web: selección de instancias CAD en tiempo real

- El chat ahora lee la selección CAD unificada del mismo núcleo del espacio modelo, en lugar de depender solo de consultas aisladas de `designSelection` al enviar comandos.
- Suscripción a cambios de selección: el estado visible del chat muestra nombre e identificador corto de la instancia PieceInstance actualmente seleccionada; cambiar de pieza actualiza la referencia sin reiniciar el chat.
- El selector interno usa identificadores únicos y mantiene una elección manual explícita; al cambiar la selección del visor vuelve automáticamente a seguir la selección del modelo. Se corrige el selector que podía quedar fijado a un identificador anterior.
- Distingue selección vacía, varias instancias, puntos/líneas CAD y referencias inválidas, con mensajes específicos. Nunca presupone que un punto, una línea o una referencia CAD constituye una instancia de pieza, ni elige arbitrariamente una definición con nombres repetidos.
- Los movimientos y matrices siguen pasando por preparación, comprobación de vigencia, aprobación humana, historial Undo/Redo y la API compartida de automatización; WebLLM permanece de solo lectura.
- Pruebas de regresión de resolución del visor y selector, nombres repetidos, cambios de selección, referencias caducadas y comandos de copia por ID; se reutilizan pruebas de automatización/MCP e interfaz adaptable existentes.

### Limitación

- Un CAD DWG/DXF seleccionado como bloque de referencia, o una línea/punto independiente, no equivale a una `PieceInstance` y no puede usarse como origen de copias de piezas. El chat lo indicará expresamente. La verificación visual de un clic real sobre geometría requiere un navegador con WebGL y un proyecto de prueba.

---

## v0.1.89 — 2026-11-08

### Corrección del chat y controles superpuestos

- Los accesos **Chat** y **MCP** comparten ahora un único dock lateral, ubicado debajo del ViewCube y fuera de la barra inferior de secciones, controles Render y etiqueta de versión.
- El panel de chat se coloca en la zona libre del espacio modelo, ajustando altura según el ViewCube, controles inferiores y etiqueta de versión; si hay un panel lateral de piezas se aparta de él, y en ventanas pequeñas se abre como una hoja modal cerrable.
- Nuevo selector **Pieza para comandos** dentro del chat para elegir una instancia concreta por nombre e identificador abreviado, sin necesidad de que el panel oculte la pieza del visor. Evita ambigüedad con piezas repetidas.
- El chat sigue consultando el modelo y requiere preparar y aprobar cualquier modificación; se mantiene la conexión MCP remota y el historial Undo/Redo.
- Pruebas nuevas de distribución adaptable para pantallas grandes/pequeñas y no superposición con los controles inferiores.

---

## v0.1.88 — 2026-11-08

### Chat local integrado en FrameLogic Web (sin API de pago)

- Nuevo botón **Chat** dentro del espacio modelo, independiente del panel MCP y de VS Code.
- Consultas de piezas, ejes, referencias, estado del modelo y comandos básicos de selección, copia, desplazamiento y Undo/Redo.
- Interpretación determinista en español con selección/identificador de pieza, distancia explícita en milímetros y eje local X/Y/Z. Si faltan datos o hay nombres repetidos, se detiene sin adivinar.
- Las modificaciones requieren preparación previa, lista de posiciones, botón de revisión y confirmación humana mediante el despachador compartido; se conservan las validaciones de estado y el historial CAD.
- Opción experimental de **WebLLM** en el navegador: descarga voluntaria de un modelo abierto solo tras consentimiento; exige WebGPU, recursos locales y conexión inicial a CDN/modelo. La IA responde preguntas sobre una vista de solo lectura y no ejecuta operaciones por sí sola.
- Sin nuevas credenciales, servicios de IA de pago ni descarga del modelo al abrir FrameLogic. MCP remoto y conectores existentes permanecen separados.
- Pruebas unitarias para comandos, eje obligatorio, distancias, nombres duplicados y aprobación explícita.

### Límites conocidos

- La IA local puede no funcionar en equipos sin WebGPU o con poca memoria y depende de descargas de terceros; en ese caso los comandos básicos siguen disponibles.
- El chat utiliza órdenes delimitadas, no es un agente CAD autónomo. Los ejes longitudinales no se infieren de la geometría.
- Despliegue web sujeto a compilación, pruebas y configuración de Cloudflare Pages.

---

## v0.1.87 — 2026-11-07

### MCP remoto para la web

- Panel MCP disponible en producción: creación explícita de sesión HTTPS, estado de conexión, configuración para cliente compatible y desconexión/revocación.
- Worker Cloudflare con Streamable HTTP oficial y Durable Object por sesión; credenciales distintas para agente y navegador, hashes persistidos, caducidad de una hora, origen exacto y una pestaña por sesión.
- Reutiliza la API del modelo y la aprobación humana; entrega única de solicitudes, bloqueo de concurrencia y rechazo de aprobaciones vencidas. No almacena geometría ni reintenta modificaciones.
- Workflow independiente de validación/despliegue MCP. Requiere secretos de Cloudflare; la publicación de Pages por sí sola no activa el servidor.
- Se mantiene MCP local. Corregido reenvío de argumentos de `npm run dev` al workspace web.
- Documentación de activación y límites en `docs/AUTOMATION_MCP_REMOTE.md`. No incluye chat, OAuth ni administración multiusuario.

### Validación y estado

- Pruebas del cliente HTTP oficial, puente, copias y Undo, rechazo humano, aislamiento, revocación y entrega única, además de las pruebas locales existentes.
- Typecheck, build web y empaquetado Worker con Wrangler dry-run. Panel revisado en navegador de forma aislada; el visor completo no se pudo probar por falta de WebGL en el entorno.
- Despliegue del Worker y aceptación con la web pública pendientes de acceso a Cloudflare. El simulador local de Wrangler no arrancó por una limitación `uv_interface_addresses` del entorno.

---

## v0.1.86 — 2026-11-06

### Automatización y MCP experimental local

- API numérica `core.automation` independiente del mouse: información, piezas, SNAPs persistentes, ejes mundiales, selección, movimiento y copias simples/múltiples.
- Coordenadas locales combinan el sistema FrameLogic y la rotación real; posición absoluta coloca el origen FrameLogic. Copias comparten definición/geometría y conservan metadatos de instancia.
- Propuestas estructuradas con transformaciones, caducidad, comprobación de cambios y confirmación; una entrada reversible por operación múltiple, rollback y registro de resultados en memoria.
- Servidor MCP oficial TypeScript por stdio y puente HTTP loopback con token, Origin/Host restringidos y una sesión local. Lecturas, preparación, confirmación humana en navegador, selección y Undo/Redo. No se conecta automáticamente ni se habilita en Cloudflare.
- Historial conserva entradas si falla Undo/Redo. OpenCascade se carga al solicitar el kernel, permitiendo importar el dominio sin cargar WASM para operaciones numéricas.
- Pruebas reproducibles REC1500 rotado, cuatro copias a 1500 mm, metadatos, rollback, errores, Undo/Redo, integración MCP→HTTP→puente→modelo y arranque stdio; incorporadas al CI.
- Documentación y ejemplo ejecutable en `docs/AUTOMATION_MCP.md` y `npm run automation:demo`.
- Pendiente: ALIGN programático, ensamblajes, SNAPs temporales, previsualización gráfica, chat, múltiples sesiones y auditoría persistente. La integración automatizada usa el puente real con fetch de Node; no sustituye validación manual completa en un navegador con STEP/IFC.
- Sin cambios de formato `.flpiece`/proyecto; controles manuales conservados. Versión raíz, lockfile, badge y servidor en 0.1.86.

---

## v0.1.85 — 2026-11-06

### Corregido: gizmo local después de ALINEAR y Ctrl+Z para alineaciones

- Cuando se vuelve a seleccionar una pieza previamente rotada o alineada, el gizmo de movimiento muestra por defecto sus ejes propios: combina la rotación real de la instancia con los ejes definidos en la PieceDefinition FrameLogic.
- La orientación del gizmo no gira ni desplaza la geometría seleccionada. Con varias piezas seleccionadas se mantiene el espacio global para evitar interpretar diferentes orientaciones locales a la vez.
- El movimiento restringido por eje/plano hacia SNAPs y los desplazamientos numéricos utilizan los mismos ejes locales que muestra el gizmo. La opción de espacio global, si se selecciona, conserva restricciones en coordenadas mundiales.
- ALINEAR registra la traslación y rotación de las **instancias de pieza** en el historial CAD. **Ctrl+Z** revierte esa transformación; rehacer restaura la alineación.
- Se conserva la copia continua de piezas v0.1.84, utilizando el punto base y la dirección local de la pieza.

### Validación

- Pruebas de orientación de ejes locales tras rotación/alineación, movimiento numérico y proyección de SNAP, selección múltiple global, y Undo/Redo de ALIGN.
- Badge, `package.json` y `package-lock.json` sincronizados en `0.1.85`.

---

## v0.1.84 — 2026-11-06

### Mejorado: copia múltiple continua con Ctrl + eje del gizmo hacia SNAPs

- Al hacer **Ctrl + clic corto en un eje del gizmo** y elegir un SNAP, FrameLogic crea la copia y **mantiene el eje armado** para colocar nuevas copias haciendo clic en otros SNAPs, sin volver a pulsar Ctrl ni activar el gizmo.
- La pieza original permanece seleccionada y en su posición inicial; cada copia nueva parte del mismo punto base del gizmo, en lugar de acumular el desplazamiento de la copia anterior.
- El gizmo sigue visible después de cada copia. **Esc** termina el modo de copia múltiple sin ocultar el gizmo; un Esc adicional mantiene el comportamiento habitual de cancelar MOVE.
- Cada copia es una operación **COPY** independiente, reversible con Undo/Redo, sin duplicar los datos STEP de la definición. Un destino con desplazamiento cero no crea instancias ni cancela el modo.
- La copia mediante **Ctrl + arrastrar el gizmo** conserva el comportamiento anterior (seleccionar la copia al finalizar); mover sin Ctrl no cambia.

### Validación

- Pruebas de varias copias consecutivas a SNAPs diferentes, conservación del origen/selección y eje armado, cancelación con Esc, destino sin desplazamiento, Undo/Redo y copia por arrastre.
- Badge visible, `package.json`, `package-lock.json` y changelog sincronizados en `0.1.84`.

---

## v0.1.83 — 2026-11-05

### Corregido: precisión del editor, referencias por instancia y controles de visualización

- El badge de versión evita superponerse al menú desplegado **Refs**; cuando las opciones están abiertas, se coloca por encima de su rectángulo.
- Durante una operación CAD, al pasar sobre una pieza se muestran temporalmente **solo los SNAPs y ejes de esa instancia**. Las copias adyacentes conservan sus referencias ocultas hasta que el cursor esté sobre ellas. Se respeta la opción de visibilidad general guardada.
- En el editor aislado, la visualización y el sistema de coordenadas de trabajo se basan en el origen FrameLogic guardado: al definir un SNAP como origen, dibujar en **X0 Y0 Z0** coincide con ese origen, no con el STEP original. La transformación persistente de la instancia no se modifica y se recupera al volver al espacio modelo.
- Nuevo flujo de edición de referencias persistentes: **Elegir en 3D** permite seleccionar directamente un marcador SNAP o eje, y **Mover referencia / Copiar referencia** colocan su origen en un SNAP de destino preciso. Las copias conservan la dirección/longitud del eje; las referencias ORIGIN no se desplazan por esta herramienta.
- El gizmo de líneas, puntos y selección CAD mixta es más grande y su cámara se sincroniza durante la navegación y los cambios de proyección, evitando una representación pequeña o desalineada.
- Los cambios se aplican a metadata FrameLogic y no duplican el STEP ni las mallas del modelo.

### Validación

- Pruebas de selección 3D, movimiento/copia de metadata de ejes y SNAPs, render local sin mover la instancia persistida, visibilidad temporal por instancia y regresiones existentes.
- Badge visible, `package.json` y `package-lock.json` sincronizados en `0.1.83`.

---

## v0.1.82 — 2026-11-05

### Corregido: la barra de herramientas antigua ya no parpadea al iniciar

- La barra de Model Space que React dibujaba antes de que iniciara el motor 3D permanece invisible hasta que **BIM Core** haya terminado de inicializarse y el adaptador haya distribuido correctamente las barras y el árbol de instancias.
- Los controles de proyecto, capas y modelos también esperan a esta disposición inicial para evitar saltos visuales durante una recarga.
- Se utiliza `visibility: hidden` en lugar de `display: none` para que los elementos sigan teniendo dimensiones medibles y no se rompa el cálculo de posiciones.
- Al cerrar o reiniciar el visor se limpian las señales de inicialización, para que una segunda carga no reutilice un estado visual obsoleto.
- Se conserva la barra funcional una vez finalizado el arranque; no se eliminan ni duplican acciones de importar piezas, CAD o WorkPlane.

### Validación

- Prueba de regresión del estado inicial oculto y de la condición de disposición completa, integrada en `test:piece-visuals`.
- Versión del badge, `package.json` y `package-lock.json` sincronizados en `0.1.82`.

---

## v0.1.81 — 2026-11-05

### Corregido: ocultar la marca de That Open Engine del visor

- Se desactiva el logo de That Open Engine que aparecía en la esquina inferior izquierda mediante la API oficial `SimpleRenderer.showLogo = false`.
- El visor 3D sigue utilizando That Open Engine; no se cambia la cámara, la geometría STEP/IFC, la selección ni los controles de modelado.
- Se conservan los avisos de licencia de las dependencias. El cambio es exclusivamente visual.
- Número visible de FrameLogic, `package.json` y `package-lock.json` sincronizados a v0.1.81.

### Validación

- Typecheck, pruebas CAD/visualización y build web mediante los workflows del repositorio.

---

## v0.1.80 — 2026-11-05

### Corregido: vista de referencias limpia y persistente después de recargar

- El menú compacto **Refs** guarda en el navegador las preferencias para mostrar u ocultar SNAPs y ejes; estas opciones se conservan después de pulsar F5.
- En un navegador sin configuración previa, los marcadores generales empiezan ocultos para evitar saturar el espacio modelo. El editor de piezas continúa mostrando sus referencias, independientemente de esa configuración.
- La detección precisa de SNAPs no se desactiva al ocultar los marcadores: durante una acción CAD activa siguen apareciendo temporalmente al apuntar a un SNAP válido.
- Se añaden cabeceras de revalidación para el HTML servido en Cloudflare Pages con el objetivo de evitar que una recarga reutilice una interfaz obsoleta almacenada en caché. No se alteran los recursos STEP ni los archivos de proyecto.
- Las opciones visuales se almacenan exclusivamente en el navegador y no modifican los datos persistentes de las piezas.

### Validación

- Pruebas de preferencias, datos guardados malformados, visibilidad inicial, hover y editor aislado; comprobación mediante los workflows de compilación y validación.
- Versión visible y package-lock.json sincronizados en 0.1.80.

---

## v0.1.79 — 2026-11-05

### Mejoras: gizmo CAD, referencias visuales y origen FrameLogic

- Al editar una pieza, se añade "Mover línea CAD (M)" al panel Preparación geométrica, que activa el gizmo existente de líneas CAD. Si LINE aún está activo, finaliza su último segmento completo y lo selecciona antes de iniciar MOVE_LINE; pulsar M usa el mismo criterio. Se conservan Esc y los SNAPs precisos.
- En Model Space el control Render incluye un pequeño menú "Refs" para ocultar o mostrar los marcadores de SNAPs y ejes independientemente. La visibilidad no cambia layers, SNAP-enabled ni referencias de las piezas; durante una herramienta activa, pasar el mouse por un SNAP válido permite visualizar temporalmente las referencias.
- El editor aislado sigue mostrando referencias de preparación, aunque en la vista general estén ocultas.
- Cada fila de SNAP persistente incorpora el botón "O" para convertirlo en el origen real de la definición FrameLogic. También se permite fijar un SNAP con ◎ y usar "Origen ← SNAP". Se preservan las otras coordenadas, se elimina el ORIGIN anterior y se marca el elegido.
- El punto base del gizmo de las piezas utiliza el origen FrameLogic en lugar del origen nativo STEP.
- Tanto la inserción precisa como la básica compensan el origen FrameLogic cuando posicionan y orientan una pieza, sin alterar la geometría CAD original ni los datos del proyecto.

### Validación

- Pruebas de rebase/identidad de SNAP, compensación de origen en inserción y visibilidad de referencias en modo general, hover temporal y preparación.
- Versión visible, package.json y lockfile sincronizados en 0.1.79.

---

## v0.1.78 — 2026-11-05

### Nuevo: Ctrl + eje del gizmo para copiar una pieza mientras se desplaza

- En el modo desplazar (M), mantener Ctrl mientras se hace clic sobre un eje o plano del gizmo permite mover una **copia nueva**, sin desplazar la pieza original.
- Funciona tanto con arrastre del eje como con clic corto en el eje y segundo clic sobre un SNAP de destino. La copia no se crea por un clic corto si todavía no se elige un destino.
- Se reutiliza la misma definición FrameLogic, la geometría 3D, SNAPs y ejes; se mantienen capa, etiquetas y transformaciones originales de cada instancia. Se selecciona la copia solo después de terminar el movimiento.
- La duplicación y el desplazamiento forman una sola operación de historial `COPY`, compatible con Deshacer/Rehacer. Un movimiento cancelado o Esc no deja instancias adicionales.
- Sin pulsar Ctrl, el movimiento previo y el cambio de punto base mediante el centro amarillo siguen intactos.

### Validación

- Pruebas del ciclo de vida físico del mouse y cancelación, copias múltiples, identidad/transformaciones de la pieza, Deshacer/Rehacer y limpieza al cancelar.
- Versión visible, package.json y package-lock.json sincronizados en `0.1.78`.

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

