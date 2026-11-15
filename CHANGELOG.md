# Changelog de FrameLogic

Este archivo registra los cambios relevantes de cada versión visible de FrameLogic.

## Convención de mantenimiento

- Cada versión funcional nueva debe añadir su entrada aquí antes de considerarse cerrada.
- Fuente de versión única: `package.json` raíz. `package-lock.json` (raíz y `packages[""]`) y la entrada más reciente del changelog deben coincidir; la validación existente de versión comprueba los tres.
- Incrementar `patch` para cada corrección funcional durante `0.1.x`; documentación aislada no cambia la versión. Indicar versión también en el PR.
- Distinguir implementación y pruebas automatizadas de comprobaciones reales de navegador, fusión y despliegue: no declarar estas últimas sin evidencia.
- Las entradas se ordenan de la más reciente a la más antigua.
- Se documentan funciones nuevas, cambios de comportamiento, correcciones importantes y cambios técnicos que afecten el uso o la arquitectura.
- Los cambios únicamente de documentación no incrementan por sí solos la versión visible de FrameLogic.
- Las herramientas o diagnósticos temporales deben indicarse expresamente como temporales para poder retirarlos después.

---

## v0.1.173 — 2026-11-15 (versión manual de la base JSON y metadatos de guardado)

- **Versión del JSON** visible en Información del archivo JSON, independiente de la versión de FrameLogic. Solo se cambia manualmente con el candado global abierto, pulsando **Editar versión / Guardar versión** y posteriormente **Guardar JSON**. Validación estricta `MAYOR.MENOR.PARCHE`; edición cancelable sin cambios.
- Los archivos antiguos con `version: 1` o sin `version` siguen leyéndose sin migración silenciosa. La interfaz informa **Sin versión registrada** y conserva intactos códigos, subdivisiones y rutas. El archivo inicial nuevo utiliza `version: "1.0.0"`.
- Metadatos generales `fecha_modificacion` y `usuario_modificacion` para archivos nuevos; compatibilidad con `fecha` y `usuario` heredados, sin inventar fechas anteriores. La marca temporal se confirma solamente después de una escritura exitosa, no al editar un borrador, cancelar, navegar o descargar una copia.
- Ruta base predeterminada de **nuevos catálogos**: `D:\\Documents\\FrameLogic`, almacenada una sola vez y sin alterar las rutas relativas de las piezas existentes. Persistencia local con permisos del navegador, comprobación de cambios externos y cancelación tentativa de escrituras fallidas o tras bloqueo de edición.
- El candado temporal sigue sin autenticación real (usuario y contraseña vacíos): requiere protección backend antes de admitir escrituras compartidas. Nuevas pruebas de formatos, compatibilidad, permisos de interfaz, metadatos, conservación de datos y guardado. Los cambios no afectan al worker MCP.

---

## v0.1.172 — 2026-11-15 (fecha y usuario de última modificación del JSON)

- Se añaden **`fecha`** y **`usuario`** al nivel general de `DBFrameLogic.json`, junto a `version` y `ruta_base`. `fecha` es una cadena ISO 8601 con zona horaria y se genera en UTC; `usuario` será el autor del último cambio, pero por ahora permanece como cadena vacía `""` porque el candado provisional no identifica personas.
- La fecha se actualiza automáticamente al crear un JSON, modificar una celda o su tipo de dato, aplicar cambios a una estructura, añadir/eliminar piezas y modificar la ruta base. Solo se marca el catálogo cuando cambia su contenido, no al navegar entre pestañas, consultar el archivo o descargarlo.
- Los metadatos aparecen en una línea de consulta general fuera del cuadro de códigos. **Guardar JSON** persiste los valores ya actualizados en el archivo local; no modifica ninguna otra ruta ni altera la estructura de cada pieza.
- Compatible con bases JSON antiguas sin `fecha` o `usuario`: se preservan al leer, y los campos se incorporan al guardar después de una modificación. Se valida que `fecha` sea texto ISO 8601 válido (o vacío) y `usuario` sea texto.
- Nuevas pruebas de formato y actualización UTC, usuario provisional vacío, orden de propiedades, compatibilidad anterior y cobertura de todos los puntos de edición. Sin costos ni despliegue MCP.

---

## v0.1.171 — 2026-11-15 (ruta base independiente del catálogo)

- Nueva propiedad opcional **`ruta_base`** en la raíz de `DBFrameLogic.json`, fuera de `registros`, para definir una carpeta general de recursos. El catálogo nuevo incluye la propiedad como texto inicialmente vacío; los catálogos existentes sin esta propiedad siguen siendo compatibles.
- Se muestra **Ruta base** en una única línea fuera del listado de códigos y la tabla de propiedades. El candado general controla su edición; se guarda al pulsar **Guardar JSON** en el archivo local autorizado.
- Las rutas de las piezas son únicamente la **parte final o relativa** definida por el usuario: se muestran tal cual, sin recortarlas, añadirles prefijos, combinarlas ni reescribirlas automáticamente. El código futuro que utilice un recurso podrá concatenar `ruta_base` y la parte relativa explícitamente.
- Se conserva el soporte de subdivisiones universales por código, lectura automática autorizada, guardado local, protección contra sobrescrituras y esquemas JSON existentes.
- Pruebas de persistencia, validación de `ruta_base`, rutas relativas intactas y comprobaciones de integración de la interfaz. Documentación y catálogo web de inicio actualizados. Sin backend ni servicios de pago.

---

## v0.1.170 — 2026-11-15 (corregir tipo JSON de propiedades)

### Cambiar texto, número, booleano o null desde la misma celda

- En la tabla vertical de `Configuración → Base de datos`, con el candado general desbloqueado, cada campo simple ofrece un **selector explícito de tipo JSON**: `Texto`, `Número`, `Sí/No` o `Vacío`. El campo obligatorio `codigo` sigue siendo exclusivamente texto.
- Corrige el caso en el que se escribió texto en `peso_estimado_kg` (o cualquier campo numérico) y ya no se podía volver a número desde la tabla: `"125.5"` pasa a `125.5` sin abrir el editor JSON completo.
- Conversión estricta de números decimales (punto o coma), enteros, negativos y notación científica. El contenido vacío se representa como `null`; jamás se interpreta silenciosamente como cero. Los textos incompatibles requieren confirmación explícita antes de vaciarlos.
- Un campo numérico conserva temporalmente los valores incompletos mientras se edita y valida al perder el foco. No altera otros campos, subdivisiones, códigos ni listas del catálogo. Se mantiene el guardado explícito en `DBFrameLogic.json` y los permisos del archivo local.
- Pruebas de conversión en ambos sentidos, valor `null`, booleanos, errores de formato, decimales negativos y persistencia de registros anidados. Sin servicios de pago ni cambios MCP.

---

## v0.1.169 — 2026-11-15 (nueva pieza con subdivisiones universales)

### Crear códigos nuevos a partir de todos los registros existentes

- En `Configuración → Base de datos` se añade el botón **+ Nueva pieza / código**. Solo aparece con el **candado global desbloqueado**; no permite escribir sin el modo editor.
- Al pulsarlo se genera automáticamente un `codigo` único (`NUEVO_0001`, `NUEVO_0002`, etc.), se selecciona la nueva pieza y se limpia el filtro de búsqueda.
- El nuevo registro incluye la **unión recursiva de todas las subdivisiones** existentes en los demás registros del JSON que esté cargado: nombres de propiedades, grupos anidados y posiciones de listas, incluso si los registros tienen estructuras heterogéneas. No se copian valores de otras piezas: textos vacíos y datos numéricos, booleanos o ausentes inicializados como `null`.
- Si dos registros usan tipos incompatibles en la misma propiedad, se prioriza una estructura compuesta (objeto sobre lista, lista sobre valor simple), ya que JSON no admite varios tipos simultáneamente en la misma clave.
- Se valida tamaño y estructura antes de incorporar el nuevo registro a la memoria; los registros existentes no se alteran. El usuario edita las propiedades y pulsa **Guardar JSON** para persistir en el archivo local seleccionado, con los permisos normales del navegador.
- Pruebas para unión de esquemas diferentes, campos anidados, listas, valores vacíos, códigos duplicados, catálogo vacío y conservación de registros originales.
- No se examinan archivos adicionales del disco: la plantilla se construye con los códigos del **único catálogo JSON cargado**. No se introduce acceso arbitrario a directorios Windows ni escritura remota sin autenticación.

---

## v0.1.168 — 2026-11-15 (recuperación automática del JSON local)

### Recordar el archivo seleccionado, no solo su ruta

- En `Configuración → Base de datos`, el selector de archivos en navegadores compatibles con File System Access API guarda la **referencia de `DBFrameLogic.json` en IndexedDB del navegador**, separada de la ruta de texto persistida en `localStorage`. No se copia el contenido JSON a IndexedDB.
- Al reabrir la aplicación, FrameLogic recupera ese identificador y **consulta el permiso de lectura sin pedirlo**. Si sigue concedido, carga el JSON automáticamente en solo lectura, sin que sea necesario desbloquear Configuración ni buscar el archivo otra vez.
- Si el permiso requiere renovación, aparece el botón **Autorizar acceso**, que solicita permiso de lectura exclusivamente tras el clic del usuario. Si no se concede, aún puede pulsar **Seleccionar JSON**.
- Las operaciones de lectura no solicitan permisos de escritura. **Guardar JSON** sigue limitado al candado de editor y puede solicitar `readwrite` al guardar; se mantiene la comprobación de cambios externos antes de sobrescribir el fichero.
- Las referencias guardadas están asociadas a la ruta de configuración: si se cambia de ruta, la referencia anterior no se abre automáticamente por error. Degradación segura en navegadores sin IndexedDB o File System Access API, modo privado, permiso caducado y archivo movido o eliminado.
- Se preservan los códigos y subdivisiones universales, el JSON local en `D:\Documents\FrameLogic\DB\DBFrameLogic.json`, las URL remotas en consulta y el candado general. No se añade API ni acceso remoto de escritura a SharePoint.
- Pruebas de persistencia del identificador sin datos, restablecimiento por ruta, revocación, permiso de lectura y escritura separado y fallback sin IndexedDB.

---

## v0.1.167 — 2026-11-15 (catálogo universal por código)

### Subdivisiones JSON abiertas y sin columnas obligatorias fijas

- En `Configuración → Base de datos`, cada registro requiere únicamente **`codigo`**. El sistema conserva **todos** los demás nombres y valores JSON, aunque sean diferentes entre registros.
- Se visualizan dinámicamente todas las subdivisiones anidadas como grupos y filas verticales **Propiedad / Valor**: objetos, listas con índices, números, textos, booleanos y `null`, incluso con diferentes niveles y nombres.
- En el modo editor desbloqueado por el candado general, los valores simples son editables directamente; **Editar estructura JSON** permite añadir, renombrar y eliminar propiedades, grupos o listas arbitrarias conservando todo lo demás.
- La lectura, validación y escritura ya no reconstruyen una lista fija de nombre/familia/ruta/peso/longitud/tarifa, evitando la pérdida silenciosa de datos desconocidos. Se mantienen código único, límite de tamaño y profundidad, JSON bien formado, compatibilidad con archivos antiguos y guardado explícito local.
- Pruebas de dos registros con esquemas distintos, recorrido profundo de propiedades, edición de listas anidadas, validación de código y fidelidad de ida y vuelta en JSON.
- Archivo `DBFrameLogic.json` de dos ejemplos ficticios facilitado al usuario para copiar a `D:\Documents\FrameLogic\DB`. No se almacena información real de empresa; los nombres y valores son ilustrativos.

---

## v0.1.166 — 2026-11-15 (candado general y DBFrameLogic.json local)

### Un bloqueo para todas las pestañas de Configuración

- El botón **🔒/🔓** se sitúa en la cabecera de la ventana de Configuración, fuera de las pestañas; todas las opciones de todas las secciones empiezan bloqueadas para edición.
- El desbloqueo solicita **Usuario** y **Contraseña**. En esta etapa ambos deben estar vacíos: pulsar **Aceptar** con los dos campos en blanco habilita el modo edición de forma temporal. Se vuelve a bloquear al cerrar la ventana o pulsar el candado; no se guardan credenciales.
- Es un **bloqueo provisional solo de interfaz**, no autenticación real. No autoriza escritura de datos remotos ni protege el archivo compartido. La futura autenticación multiusuario deberá validarse en el servidor.

### Base de datos local y edición directa tipo Excel

- Nuevo archivo inicial para distribución manual: `DBFrameLogic.json`, con esquema `{ "version": 1, "registros": [] }`, para ubicar en `D:\Documents\FrameLogic\DB\DBFrameLogic.json`.
- La pestaña Base de datos muestra una tabla completa de filas y celdas rectangulares (Código, Nombre, Familia, Ruta, Peso, Longitud y Tarifa), en lugar del listado más una ficha secundaria. En modo editor las celdas se modifican directamente y actualizan el JSON en memoria, además de poder añadir/eliminar filas; en solo lectura son texto.
- El botón **Seleccionar JSON** obtiene permiso del usuario para leer el archivo local; **Guardar JSON** sobrescribe el archivo local cuando el navegador tiene permisos de escritura mediante File System Access API, y en caso contrario descarga una nueva copia. Se valida la estructura, códigos duplicados y tipos al guardar y se comprueba que el archivo no haya cambiado externamente.
- La ruta local sugerida se recuerda mediante `localStorage`. Al recargar se conserva su texto pero, por restricciones de seguridad del navegador, puede ser necesario seleccionar el archivo de nuevo. Las URL personalizadas guardadas previamente no se pierden.
- Las pestañas no desmontan el catálogo al cambiar entre secciones, por lo que no se descartan los cambios de celdas durante la misma apertura; se advierte sobre cambios pendientes al cerrar o recargar.
- Se conserva la opción de consultar JSON por URL HTTPS, pero no se promete sobrescribir el JSON estático de Cloudflare ni sincronizar SharePoint automáticamente. Para acceso y escritura compartidos con control de permisos se necesitará un backend.
- Nuevas pruebas del desbloqueo con campos vacíos, la posición global del candado, la grilla editable, la ruta local y el guardado. Sin servicios de pago.

---

## v0.1.165 — 2026-11-15 (catálogo de piezas JSON en Configuración)

### Nueva pestaña Base de datos

- **Configuración → Base de datos** abre un catálogo JSON de códigos, con listado, búsqueda, ficha y campos editables **Código, Nombre, Familia, Ruta, Peso, Longitud y Tarifa**. Código obligatorio y único, numéricos opcionales no negativos.
- **Origen:** casilla de ruta o URL HTTPS para leer un catálogo remoto común, selector de archivo JSON local (con opción de escritura directa mediante File System Access API cuando el navegador lo permita) y botón para crear un JSON nuevo. El catálogo inicial compartido vacío se sirve desde `/data/framelogic-catalog.json`; no se imponen moneda ni unidades.
- **Modo lector y modo administrador:** misma ventana; el formulario está desactivado en consulta. Para editar se define inicialmente una clave de al menos 12 caracteres o se ingresa la existente. La clave en texto plano no se almacena: se guarda un verificador PBKDF2-SHA256 con sal aleatoria en el JSON, únicamente como bloqueo de interfaz.
- **Edición:** agregar, seleccionar, modificar o eliminar código; aplicar ficha y guardar JSON. Se valida la estructura del archivo, duplicados, tipos, tamaño y modificación externa del archivo antes de sobrescribir. Se permite descargar copia.
- **Restricciones de seguridad y persistencia:** la URL pública es solo lectura. La edición local no publica cambios al servidor ni a otros usuarios; una escritura realmente compartida y protegida requiere una API con autenticación/autorización en servidor. La contraseña del JSON no protege archivos frente a quien tenga acceso directo de escritura. Nunca se incluyen contraseñas predeterminadas o tokens en el frontend.
- **Regresiones:** pruebas de esquema JSON, datos numéricos, códigos duplicados, URLs inseguras, hash y verificación de claves, conexión con la ventana existente y controles de edición. Se preservan `Validate`, `Web build`, Cloudflare Pages y el filtro MCP sin nuevos servicios de pago.

**Pendiente futuro:** autenticación de servidor y edición simultánea compartida; elección de unidades/moneda; vinculación de código a las piezas del modelo.

---

## v0.1.164 — 2026-11-14 (centro de configuración con pestañas)

### Ventana de configuración única para Model y Paper Space

- Botón **⚙ Configuración** permanente en las cintas superiores de Model Space y Paper Space; ambos abren la misma ventana modal web, equivalente visualmente al panel de opciones de una aplicación WPF de escritorio. No se introduce .NET/WPF ni un servicio externo.
- Centro de configuración con secciones extensibles **General, Interfaz, Model Space, Paper Space**. Arquitectura de registro de secciones, tipos de preferencias, validación de esquema y efectos CSS para ir incorporando opciones reales sin duplicar lógica.
- Preferencias iniciales funcionales: barras compactas, reducir animaciones de la interfaz, mostrar/ocultar cubo de vistas y mostrar/ocultar los cuatro grips de detalle circular. Los grips permanecen visibles por defecto.
- Cambios aplicados inmediatamente, persistencia local versionada por navegador, restauración de valores predeterminados y degradación segura si el almacenamiento está bloqueado. **No** se aplican cambios a la geometría ni se alteran archivos `.flproject`.
- Ventana accesible con cierre por Esc, navegación con Tab, restauración del foco y diseño adaptable a pantallas pequeñas.
- Pruebas de registro, valores inválidos, persistencia, fallos de storage, atributos CSS y conexión del botón en ambos espacios. Se mantienen suites CI ya optimizadas y el detector para omitir MCP en cambios de UI.

**Pendiente para siguientes iteraciones:** introducir opciones concretas de unidades, SNAP, acotación, exportación y preferencias por proyecto al definir su relación con los módulos respectivos. Validación visual en navegador real aún necesaria.

---

## v0.1.163 — 2026-11-14 (Detalle circular: cuatro grips)

### Paper Space — eliminar botón duplicado y redimensionar desde cuatro lados

- Se elimina el botón **Detalle** heredado de la barra general de `DrawingProfessionalController`. Permanece el único botón **Detalle** contextual de la View seleccionada, que crea un detalle circular enlazado.
- Cada referencia de detalle circular tiene cuatro grips **Norte, Este, Sur y Oeste** sobre su contorno para ajustar el radio desde cualquiera de los lados; todas las direcciones conservan un círculo perfecto, el mismo centro y la misma geometría proyectada.
- El arrastre del borde circular sigue moviendo la referencia completa; el cambio de radio conserva el control existente de límites de la View origen y presencia de geometría, revirtiendo los cambios inválidos.
- Nuevas pruebas de los cuatro puntos cardinales, radio común, datos geométricos inválidos, presencia del único comando contextual y no regresión de movimiento/validación.
- Se conserva la cinta de pestañas, el historial de dimensiones, las vistas de detalle y las optimizaciones CI (Validate y Web build sin pruebas duplicadas; sin despliegue MCP por cambios de Paper Space).

---

## v0.1.162 — 2026-11-14 (cinta de pestañas Model Space y Paper Space)

### Barras organizadas por pestañas superiores tipo CAD

- **Model Space:** pestañas superiores Archivo, Dibujar, Modificar, Acotar, WorkPlane y Piezas. Los botones existentes se agrupan por actividad sin reconstruirlos ni trasladar los nodos propiedad de React, conservando handlers, selección y edición. Archivo accede al menú ya existente, que mantiene su propia lógica de archivos.
- **Paper Space:** pestañas Inicio, Vistas, Cotas, Anotar, Hoja y PDF, Revisiones. La barra deja de crecer como tres filas permanentes: se muestra solamente el grupo activo; siguen disponibles escalas, cotas, edición, exportación, revisiones y acotación avanzada.
- **Views:** el panel de View seleccionada, orientación propia/global, proyección, detalle, escala individual, render y anclajes de cotas se integra en la pestaña Vistas. Se utiliza su nodo real y no se altera el estado de la View.
- **Accesibilidad:** botones de pestaña con estados ARIA y navegación mediante flechas; los grupos con más controles pueden desplazarse horizontalmente sin superponer el plano.
- **Compatibilidad:** no cambian las órdenes CAD, el almacenamiento de proyecto ni la representación vectorial de planos. Se conserva el menú Archivo existente y no se incluye ningún servicio de pago.
- **Pruebas:** nuevas regresiones para clasificación de comandos Model/Paper, compilación y suites existentes de planos; validación visual real en navegador pendiente hasta comprobar.
- **CI:** conserva la separación Validate / Web build, cancelación por PR y filtro MCP mejorado de v0.1.161.

---

## v0.1.161 — 2026-11-14 (orientaciones Paper Space)

### Seis vistas ortogonales con ejes propios y cotas aisladas por proyección

- Nuevas opciones **Posterior**, **Inferior** y **Extremo opuesto · eje propio**, calculadas desde el eje geométrico longitudinal del ensamble. Cada vista opuesta invierte la dirección de observación manteniendo una base ortogonal dextrógira y una dirección vertical u horizontal coherente.
- El selector tiene Actual/WorkPlane, siete orientaciones propias (incluida Isométrica) y tres globales. Se elimina **Lateral · ejes globales** del menú, conservando la lectura del modo histórico `WORLD_RIGHT` para proyectos anteriores.
- Se mantiene el sistema STEP/B-Rep/HLR y la cola de orientaciones de v0.1.158. Cambiar una View no rota el modelo, no cambia el render ni altera el marco o escala de otra View.
- Los ajustes manuales de cotas STEP se almacenan por orientación de cada View: al regresar al mismo modo y geometría se recuperan los puntos A/B editados. Cuando el modelo cambia, los puntos 2D incompatibles no se reutilizan y se comunica la restauración a referencias STEP originales; nunca se reutiliza un valor calculado desde puntos inválidos.
- Regresiones para tres parejas opuestas, ejes propios/globales rotados, reversibilidad, separación entre Views y persistencia serializable de ajustes. Las pruebas PDF existentes siguen como protección contra regresiones.
- CI: Validate y Web build mantienen sus responsabilidades separadas y las ejecuciones obsoletas de un PR se cancelan. El filtro de MCP omite cambios de versión, planos, scripts de pruebas de dibujo y cambios internos del propio detector; conserva despliegues por contratos, dependencias, configuración y scripts reales del Worker. Añadidas regresiones del filtro sin nuevos servicios de pago.

**Pendiente:** validación manual real con STEP de ensambles/subensambles, cotas editables, cortes, vistas de detalle y exportación PDF. Fusión y Cloudflare Pages sujetos a comprobaciones obligatorias.

---

## v0.1.160 — 2026-11-14 (en revisión)

### Cotas de taller — selección, eliminación fiable y edición de puntos de referencia

- Una cota STEP seleccionada muestra **dos puntos amarillos A/B** donde parten las líneas testigo, tomados de la proyección de las referencias geométricas originales. Las cotas de diámetro muestran un centro informativo; la reasignación de diámetros continúa pendiente.
- **Eliminar cota** aparece en el panel contextual cuando hay una cota STEP seleccionada. Es una acción explícita independiente del foco del teclado. Supr/Backspace funciona al seleccionar una cota en el SVG; no altera documentos de otras Views.
- Los grips A/B de cotas lineales se pueden arrastrar a **extremos de aristas proyectadas**, con tolerancia de SNAP. El cambio se conserva como override de la View, la cota vuelve a medirse desde sus dos puntos en milímetros y el modelo STEP permanece intacto.
- El botón **Restaurar puntos** recupera las dos referencias originales. Las marcas y botones de edición no se incluyen en el PDF exportado.
- Nuevas pruebas de selección geométrica de extremos, recálculo de longitud y supresión individual.
- **Pendiente:** prueba de interacción visual en Firefox/Chrome y Undo/Redo completo de estas ediciones.

---

## v0.1.159 — 2026-11-14 (correcciones Paper Space)

- **Selector de hoja sin parpadeo:** `DrawingExperienceController` deja de reemplazar las opciones del selector PDF que pertenece a `UnifiedPdfNavigationController`. Se elimina el conflicto entre los dos intervalos de sincronización, conservando la navegación de secciones cuando no existe selector unificado.
- **Cotas STEP seleccionables:** clic sobre texto **o cerca de líneas** de cualquier View de ensamble, no solo las creadas con «Vistas auto». Resaltado visual de la cota elegida sin alterar los colores exportados al PDF.
- **Mover cotas individualmente:** arrastrar el texto desplaza su etiqueta; arrastrar la línea desplaza la cota y prolonga sus líneas testigo desde los puntos originales. El valor físico y sus anclajes STEP no cambian.
- **Eliminar una cota:** usar **Supr**, **Backspace**, botón **Borrar** o clic derecho en la cota seleccionada. Se conserva una supresión por clave en `dimensionOverrides` de esa View para no regenerar involuntariamente la cota. «Restablecer cotas» permite recuperarla.
- **Compatibilidad:** anotaciones y cotas manuales continúan con su selección/edición existentes; otras Views no se modifican. Añadidas regresiones para pertenencia del desplegable, selección de líneas y movimiento de líneas/anclajes.

**Pendiente de validación visual:** interacción real en Firefox/Chrome, zoom extremo y cotas superpuestas; Undo/Redo de cotas automáticas sigue pendiente de revisión.

---

## v0.1.158 — 2026-11-14

### Corrección del cambio de orientación de Views en Paper Space

- **Orientación reversible:** se corrige el caso en que, tras seleccionar `Planta · ejes globales`, la selección de otra orientación podía quedar bloqueada mientras se recalculaba STEP/HLR. El selector sigue habilitado para Views elegibles.
- **Última opción solicitada:** si se elige otra orientación antes de terminar una proyección, se guarda la selección más reciente y se aplica al completar el cálculo en curso. No cambia el eje ni la posición de las piezas del Model Space.
- **Sin retrocesos visuales:** el desplegable refleja la opción solicitada mientras se calcula; evita restaurar momentáneamente el valor anterior por una sincronización automática.
- **Pruebas:** cobertura de cola de cambios, independencia entre Views y reversibilidad de ejes propios/globales.

**Validación pendiente de navegador:** probar el menú con ensambles STEP grandes y comprobar que los cambios repetidos finalizan correctamente en la interfaz real.

---

## v0.1.157 — 2026-11-14 (en validación, rama de desarrollo)

### Optimización de CI y correcciones de Paper Space

- **GitHub Actions:** Validate conserva las regresiones y pruebas de navegador; Web build se centra en generar y verificar el paquete estático y los archivos WASM. Se evita repetir typecheck, automatización, geometría y demás suites completas en ambos workflows.
- **Concurrencia:** ejecuciones anteriores de un mismo Pull Request se cancelan automáticamente; otros Pull Requests y los despliegues de producción permanecen independientes.
- **MCP remoto:** una comprobación ligera detecta cambios limitados a la versión raíz y evita instalar dependencias, recompilar y redesplegar el Worker; cambios de código, contratos o dependencias reales siguen activando despliegue. Se añadió una prueba de regresión del filtro.
- **BOM de hojas PDF:** la columna ÍTEM representa la jerarquía real con numeración 1, 1.1, 1.2, 1.2.1, etc., sin alterar el cómputo físico de piezas ni las marcas. El BOM plano mantiene su numeración consecutiva.
- **Selector de hoja PDF:** no se reconstruyen opciones mientras el desplegable tiene el foco y se corrige la reconstrucción repetida del estado «Sin PDFs».
- **Herramientas Paper Space:** barra principal con ajuste de línea para evitar que los controles invadan el área del plano; panel contextual de View debajo de la altura efectiva de esa barra.
- **Render por View:** las nuevas Views se inicializan en Sólido con aristas, conservando ajustes explícitos y persistentes de Views existentes. El panel flotante de render de Model Space se oculta cuando está abierto Paper Space.

**Pendiente de validación:** checks CI de esta rama, interacción visual del selector y menús en navegador, geometrías STEP y oclusión de aristas entre piezas, edición individual persistente de cotas y mejoras avanzadas del recorte de detalle. No declarar despliegue o fusión hasta verificarlos.

---

## v0.1.156 — 2026-11-13 (rama de desarrollo; pendiente de aceptación)

### Vista de detalle circular vectorial por View en Paper Space

- **Herramienta Detalle:** seleccionar la View origen, indicar con dos clics el centro y radio del círculo, previsualizar y colocar el nuevo marco sobre un espacio libre. Escape cancela sin crear detalles.
- **Recorte geométrico analítico:** los segmentos proyectados del origen se intersectan matemáticamente con el círculo en el plano local 2D. Se conserva el estado de líneas visibles, ocultas y aristas de corte, sin duplicar el ensamblaje ni convertirlo en una captura de pantalla. Las piezas STEP utilizan las líneas producidas por el motor existente OCCT/HLR. El recorte no representa un corte físico del sólido.
- **View independiente:** cada detalle mantiene escala, marco, estilo y ubicación propios; se crea a 1:5 y puede cambiar a escalas normalizadas, personalizadas y ampliaciones 2:1 o 5:1. La escala de la View origen no se modifica.
- **Vinculación y etiquetado:** círculos vectoriales A/B/C en su View fuente, vista rotulada «DETALLE A — ESC 1:5», árbol VIEWS con dependencia visual anidada y botón Eliminar detalle. Arrastrar el aro mueve el centro y su control derecho modifica el radio, actualizando únicamente los segmentos del detalle.
- **Actualización y datos:** el estado del círculo se guarda dentro de la View y viaja en los snapshots existentes de Paper Space, con su fuente y orientación. El historial de documentación registra cambios de forma inmediata. Los detalles de una View con ejes incompatiblemente reorientados se invalidan en lugar de mostrar geometría errónea; se rechazan dependencias circulares y ubicaciones que se solapan.
- **PDF:** se exportan los círculos de referencia como trazados vectoriales y se aplica máscara circular a los renderizados sombreados, tanto en la hoja activa como en el flujo de exportación por lotes.
- **Pruebas:** recorte analítico de segmentos, preservación de atributos HLR, transformaciones papel-modelo, radios y centros, referencias y dependencias, y compatibilidad con escalas mayores que 1:1.

**Pendiente:** completar validaciones de interfaz con ensambles grandes y archivos STEP/sección, verificar detalles encadenados y exportación con sombreado en navegador/lector PDF, y confirmar CI y despliegue antes de dar por cerrada la versión. Los detalles originados en una sección se representan por sus segmentos de sección, sin rellenar caras de corte como sólidos.

---

## v0.1.155 — 2026-11-13

### Guardar planos PDF individuales o todos juntos, respetando el tamaño físico de cada hoja

- **Guardar PDF actual:** el botón de exportación del Paper Space se identifica como «Guardar PDF actual» y genera la hoja activa en un único archivo, con su tamaño y orientación A0/A1/A2/A3/A4 definidos en el plano, cotas, BOM, vistas y renders vectoriales/sombreados.
- **Guardar todos:** junto al botón de hoja individual se incorpora un selector con los modos **«Todas en 1 PDF»** (archivo multipágina) y **«Todas separadas (ZIP)»** (un PDF por hoja dentro de un ZIP), evitando múltiples descargas bloqueadas por el navegador.
- **Tamaño y orientación independientes:** un solo PDF combinado admite páginas con distintos `/MediaBox` reales (por ejemplo A3 horizontal, A4 vertical y A1 horizontal). No se fuerza a todas las hojas al tamaño de la primera, ni se sustituye su contenido por una captura rasterizada. Se usa la misma escala de impresión X/Y: en papel vertical se centra el contenido sin estirar círculos ni distancias y se respeta 1:N; un layout de origen horizontal puede dejar márgenes en formato vertical.
- **PDFs individuales identificables:** cada archivo dentro del ZIP incluye ordinal del plano, número de plano, formato, orientación y revisión. Se respetan los tamaños configurados en DrawingProduction por hoja.
- **Orden de planos:** se exportan todas las hojas del navegador unificado de Paper Space en el orden visible, incluyendo hojas de BOM, vistas de ensamble, piezas, detalles y secciones.
- **Estado y errores:** el exportador restaura la hoja que estaba editando el usuario, también ante fallos. Si alguna hoja no puede abrirse/renderizarse, se interrumpe la operación completa y no se descarga un paquete parcial.
- **Sin servicios ni licencias:** nuevo generador PDF multipágina binario con imágenes JPEG XObjects y geometría SVG vectorial; ZIP tradicional STORE con CRC32 y nombres UTF-8, todo en TypeScript/browser.
- **Pruebas:** tamaños milimétricos A0–A4 y orientaciones, MediaBox heterogéneos, PDF multipágina con JPEG y vectores, índice binario PDF, ZIP de PDFs separados y nombres únicos estables.

**Nota de aceptación:** se requiere validación visual en navegador y revisión del PDF impreso al 100 % con cotas reales y estilos de sombreado. Los archivos se descargan mediante el navegador, por lo que la carpeta de destino depende de su configuración.

---

## v0.1.154 — 2026-11-13

### BOM independiente por hoja PDF, con ensambles y subensambles

- **BOM POR HOJA PDF** en el árbol VIEWS: seleccionar ensamble o subensamble de origen, elegir "Con subensambles" (jerarquía) o "Solo piezas agrupadas" y utilizar "Insertar BOM", "Actualizar BOM" o "Eliminar BOM".
- **Tabla editable por PDF:** una tabla BOM vectorial puede añadirse a la hoja abierta, desplazarse desde su cabecera y redimensionarse desde la esquina inferior derecha, conservando el cajetín y sin tapar otras Views. La tabla se exporta con el mismo PDF.
- **Jerarquía real:** desglosa el ensamble elegido, sus subensambles multinivel y las piezas directamente contenidas en cada nivel. En modo plano agrupa las piezas por definición de todo el subárbol y evita contar dos veces la misma instancia.
- **Datos verificables:** marca/código de pieza, nombre, cantidad, material, grado y masa solo cuando figuren en el modelo de ingeniería; no se inventan masas ni materiales ni se suman elementos de ensambles ajenos.
- **Aislamiento:** quitar o insertar BOM afecta únicamente a la hoja seleccionada; no borra piezas, ensambles, Views, cotas ni tablas de otros PDFs. También permite ocultar en una hoja el listado automático anterior.
- **Persistencia del proyecto:** configuración opcional `bomTable` almacenada por `DrawingProduction.sheets[]` con identificador de ensamble, vista origen, modo y posición/dimensiones. Se mantiene la compatibilidad de snapshots v1 y se actualiza el contenido a partir del modelo sin duplicar registros.
- **Manejo de espacio y BOM completa:** se impide insertar una tabla donde no existe un rectángulo libre; las filas que no caben se indican explícitamente. El botón **Crear hojas BOM completas** genera hojas PDF adicionales con paginación de todas las piezas y subensambles (40 filas aprox. por hoja), enlazadas al origen e individualmente removibles, sin omitir entradas.
- **Pruebas:** jerarquía multinivel, ausencia de duplicados, cantidades, falta de datos, pertenencia al ensamble y selección de espacio libre.

**Alcance:** lista técnica preliminar, no lista certificada de compra ni despiece verificado de fabricación. La tabla no altera el modelo ni la geometría.

---

## v0.1.153 — 2026-11-13

### Escala individual visible y editable en cada View de Paper Space

- **Control visible «Escala de View»:** en el panel superior «VIEW seleccionada», junto a los controles de orientación, «Proyectar View» y render, se puede asignar una escala independiente a la View seleccionada.
- **Un control en cada rama del árbol VIEWS:** cada View de pieza, ensamble, sección o detalle incluye su propio selector de escala; el título de cada View indica su escala actual. Las demás Views de la hoja y la escala global permanecen intactas.
- **Modos de escala:** AUTO (ajustar al marco), escalas 1:1, 1:2, 1:2,5, 1:5, 1:10, 1:15, 1:20, 1:25, 1:50, 1:75, 1:100, 1:150, 1:200, 1:250, 1:500, 1:1000 y personalizada 1:N (acepta denominadores decimales positivos a partir de 1, hasta 1.000.000). El valor personalizado se aplica al pulsar Enter o «Aplicar»; valores inválidos se rechazan.
- **Modelo de unidades corregido:** el modelo CAD utiliza milímetros. La conversión real de representación pasa a ser `pxPorMilímetroEnPapel / denominador` en las proyecciones de pieza/ensamble y en las vistas de sección/detalle. La selección de escala automática normalizada emplea la misma convención y elimina un factor ×1000 heredado.
- **Cotas reales:** cambiar la escala modifica la representación, sin alterar posiciones/transformaciones del modelo 3D ni los valores físicos de cotas. Las vistas proyectadas heredan inicialmente la escala de la View origen pero conservan su escala independiente después.
- **Seguridad de hoja:** la geometría visible de ensamble y de las secciones secundarias se recorta al marco de cada View; se advierte cuando la escala solicitada supera el tamaño disponible. El cajetín muestra «ESC VARIAS» cuando existen escalas diferentes.
- **Persistencia:** la escala de cada View se conserva en el estado profesional de la documentación, con historial y restauración; las opciones por View no escriben sobre la escala general de la hoja.
- **Pruebas:** analizador de 1:N y AUTO, valores personalizados/incorrectos, conversión de 3000 mm a papel real a 1:20, geometría recortada, independencia y serialización de múltiples Views.

**Pendiente de aceptación visual:** comprobar que las escalas personalizadas y el recorte de secciones principales se representan correctamente en el navegador y el PDF para proyectos guardados con unidades anteriores. No se considera validación de fabricación sin verificación dimensional externa.

---

## v0.1.152 — 2026-11-13

### Proyectar View a partir de una pieza individual o un ensamble

- **Herramienta «Proyectar View» en Paper Space:** selecciona primero una View de pieza o ensamble. Al activar la herramienta se indica la dirección desplazando el cursor fuera de la View: derecha, izquierda, arriba, abajo, o en diagonal para una proyección isométrica. Se muestra una previsualización punteada y se coloca con un clic; se pueden crear varias proyecciones antes de finalizar con Esc.
- **Ejes de la View origen:** todas las orientaciones derivan de los ejes locales reales de la View seleccionada, incluso cuando el ensamble esté girado respecto a XYZ. La herramienta no cambia la posición, rotación ni geometría del modelo 3D.
- **Normas de proyección:** respeta la configuración de primer diedro (ISO E) o tercer diedro (ISO A), invirtiendo la dirección desde la que se observa la pieza cuando corresponde, no el lado de colocación.
- **Persistencia y vínculo:** cada vista guarda `sourceViewId`, dirección y norma de proyección, su propio render y posición. Una modificación de orientación o geometría de la vista de origen regenera las proyecciones vinculadas conservando su disposición, cotas desplazadas y render individual. Reorientar manualmente una proyección la desvincula de su padre.
- **Motor y precisión:** utiliza el motor unificado de proyección STEP B-Rep/HLR con información de precisión; la malla de respaldo queda identificada como derivada, sin presentar sus líneas ocultas como HLR exactas. La proyección se integra en la misma hoja, el mismo árbol VIEWS, la exportación PDF y el mismo snapshot de proyecto.
- **Colocación protegida:** rechaza posiciones fuera de hoja o que se superpongan a View existentes. Si no cabe, permite reorganizar o redimensionar las Views antes de intentarlo nuevamente.
- **Pruebas geométricas:** bases ortonormales, normas ISO E/A, giro local de 7°, direcciones diagonales, alineación, escala y límites de hoja.

**Pendiente de aceptación visual:** interacción y render de las proyecciones sobre archivos STEP reales con distintos tamaños de ensamble, unidades, orientaciones oblicuas y hojas llenas. Todavía no incluye proyecciones derivadas de cortes físicos o detalles recortados; no debe inventar secciones.

---

## v0.1.151 — 2026-11-13

### Render independiente y superficies reales en Views de ensamble

- **Orden de render corregido:** el controlador de estilo se instala después de la proyección de ensambles, por lo que ahora encuentra la geometría SVG de cada View.
- **Selector conectado a «VIEW seleccionada»:** el modo elegido se aplica al identificador de la View activa y se guarda en `DrawingProductionController.sheets[].views[].renderMode`, manteniendo compatibilidad con el snapshot profesional legado, sin modificar la orientación del modelo.
- **Estilos diferenciados:** líneas visibles, visibles y ocultas, alámbrico, sólido a color, sólido con aristas y sombreado gris; se conserva la compatibilidad con el modo transparente de secciones.
- **Superficies:** sombreado 3D usando las mallas posicionadas del ensamble y z-buffer independiente de Three.js, con colores por pieza cuando están disponibles y profundidad real. Se mantiene la geometría HLR vectorial para las aristas.
- **PDF:** imágenes JPEG del sombreado incrustadas como XObjects en el mismo flujo PDF de líneas, cotas y textos; clipping por viewport y guiones para aristas ocultas.
- **Alineación:** se guarda el desplazamiento de la proyección en coordenadas del plano para mantener el sombreado alineado tras cambiar orientación o regenerar vistas.
- **Detalles ampliados:** se preserva el desplazamiento absoluto de la ventana de recorte, permitiendo sombreado en los detalles sin sustituir los cortes físicos STEP por falsas secciones.
- **Árbol VIEWS:** permite activar vistas de ensamble y de sección desde el árbol o el selector superior; los controles no aplicables quedan deshabilitados.
- **Aristas sobre superficies:** con HLR exacto se conservan aristas vectoriales; con mallas o geometría mixta se dibujan aristas rasterizadas con prueba de profundidad para no mostrar aristas posteriores atravesando caras opacas.
- **Pruebas nuevas:** modos persistentes por View y estructura binaria de PDF con JPEG y vectores.

**Unidades de cotas STEP:** el valor en papel ahora utiliza directamente las coordenadas milimétricas internas de FrameLogic. Se eliminó una multiplicación heredada por 1000 en `WorkshopDimensionLayout` y se adaptaron las pruebas geométricas a milímetros.

**Alcance y pendientes:** no se afirma todavía rayado real de cortes STEP, HLR exacto de mallas sin B-Rep, ni la mejora completa de la distribución de cotas. El sombreado y detalles recortados requieren comprobación visual en navegador y PDF. Se requiere validación visual en navegador con ensambles reales y comparación PDF/preview. Esta versión no modifica las piezas del espacio modelo.

---

## v0.1.150 — 2026-11-13

### Corrección: «Planta · eje propio» girada pese al selector

- **Causa identificada:** en v0.1.149, `AssemblyViewOrientationControls.resolveAssemblyViewBasis` aplicaba un snap automático de **8°** a ejes XYZ globales. Un ensamble girado, por ejemplo 5–7°, se proyectaba en «Planta · eje propio» usando realmente el eje global y aparecía inclinado, igual que «Planta · ejes globales».
- **Solución:** las orientaciones «Alzado/Planta/Extremo/Isométrica · eje propio» conservan sin redondeo angular la dirección principal geométrica calculada para el ensamble. Solo las opciones «· ejes globales» usan ejes absolutos. No se modifica ni una pieza 3D ni ninguna referencia geométrica de dimensiones.
- **Regresiones:** pruebas de orientación local/global con vigas a 0,5°, 3°, 5°, 7,5°, -6° y 12°, además de una placa de anclaje adjunta. Se verifica el eje longitudinal horizontal en la proyección local y su diferencia real frente a la planta mundial.

**Limitaciones:** el eje propio sigue siendo una propuesta obtenida por PCA de la geometría de visualización (no un datum verificado de taller); conjuntos de geometría ambigua pueden requerir seleccionar otra vista. Las cotas aparentemente desproporcionadas de las capturas necesitan una revisión específica de unidades independiente de este ajuste.

---

## v0.1.149 — 2026-11-13

### Vistas PDF configurables: orientación por eje propio

- **Corregida la inclinación en «Enviar a PDF»:** el comando ya no toma por defecto el WorkPlane como dirección de dibujo para un ensamble longitudinal. Detecta su eje principal a partir de la geometría espacial transformada y usa un marco ortonormal propio, con alineación exacta a X/Y/Z global cuando hay una desviación geométrica mínima (menos de 8°). Si no hay eje reconocible, utiliza el alzado global sin inventar orientación.
- **Selector para la View activa:** un panel contextual en Paper Space permite seleccionar la View y cambiar su tipo entre **alzado longitudinal, planta longitudinal, extremo, isométrica local, alzado global, planta global, lateral global, isométrica global y vista original**. Al pulsar sobre un viewport existente, el selector pasa a actuar sobre esa View.
- **Cambio solo del plano de proyección:** `GeneralPdfController` reproyecta mediante el motor `projectAssembly` (HLR STEP con fallback explícito) sin modificar las matrices 3D, posición, escala ni el recuadro de las otras Views. La orientación se conserva en el estado persistente de la hoja y se pueden restaurar los ejes originales.
- **Seguridad y referencias:** no se producen cotas a partir del eje PCA. Las cotas STEP, cuando existen, se recalculan; isométricas no reciben cotas automáticas. Si se reorienta una View de la que dependían cortes o ampliaciones, sus referencias se invalidan para impedir mantener detalles obsoletos.
- **Pruebas:** regresiones de alineación para miembros casi paralelos a X, miembros inclinados, bases ortonormales locales y selección de ejes globales.

**Pendiente:** verificación visual en un navegador con ensambles reales y comprobación de PDF impreso; el selector no reemplaza una definición de vistas de fabricación certificadas.

---

## v0.1.148 — 2026-11-13

### Etapa A (entrega incremental 3): cortes A-A/B-B y ampliaciones vectoriales

- **Secciones B-Rep reales:** `AssemblyProjectionEngine.projectAssemblySection` utiliza `OpenCascadeDrawingKernel.sectionByPlane` con el plano situado en el ensamble y transformado a cada definición STEP. Convierte las curvas de intersección a la base de dibujo; rechaza el corte completo si falta cualquier documento STEP o hay escala deformada, y nunca suplanta un perfil físico con aristas de la malla.
- **Estaciones A-A y B-B:** `AssemblySectionDetailPlanner` propone dos secciones transversales al 20 % y 80 % de la longitud proyectada. **Son posiciones geométricas preliminares, NO conexiones detectadas ni verificadas.** Si la intersección real es vacía, no se emite un corte ficticio. La vista principal contiene trazas, flechas y referencias de hoja.
- **Ampliaciones locales:** dos recortes vectoriales de la proyección existente conservan la condición de línea oculta; los recuadros de detalle y sus referencias llevan a una hoja A3 adicional con escalas normalizadas por viewport siempre que caben. Se reutilizan `DrawingProductionController.sheets` y el SVG del exportador PDF actual.
- **Control de caducidad:** las secciones/ampliaciones se invalidan al cambiar los datos fuente. Regenerar una vista ortogonal también elimina los marcadores que ya no corresponden al conjunto original; es necesario crear de nuevo el paquete para recalcular sus cortes.
- **Pruebas:** casos de estaciones, clipping y reparto A3; comprobación OCCT en Node de un perfil real de 10×10 mm, más la validación de CI.

**Limitaciones:** no hay todavía detección topológica de conexiones para seleccionar las mejores estaciones, rayado de material, representación de todo el volumen detrás de los cortes, acotación especial de detalles, regeneración asociativa de hojas suplementarias ni verificación física de impresión; los planos siguen siendo **preliminares, no certificados para fabricar**. Las piezas sin B-Rep pueden aparecer sólo como ampliaciones preliminares, nunca como cortes exactos.

---

## v0.1.147 — 2026-11-13

### Etapa A (entrega incremental 2): HLR del conjunto STEP

- **OpenCascade real para múltiples piezas:** el motor existente incorpora `hiddenLinesAssembly`, que sitúa cada forma STEP con su matriz mundial y `modelScale`, inserta **todas las formas** en un mismo `HLRBRep_Algo` y calcula líneas visibles y ocultas de conjunto. Evita tratar una suma de HLR por pieza como una oclusión exacta.
- **Seguridad geométrica:** se rechazan matrices inválidas, escalas no uniformes, documentos STEP no cargados y conjuntos de más de 128 piezas. Cuando el cálculo no es concluyente, se mantiene el HLR por pieza o malla, con advertencia; no se atribuye exactitud entre piezas.
- **Motor PDF existente:** `AssemblyProjectionEngine.projectAssembly` integra la nueva ruta sin sustituir las cotas B-Rep ni el planificador de hojas; `GeneralPdfController` registra la procedencia de cada vista y muestra si el HLR del conjunto pudo resolverse.
- **Pruebas OCCT:** prueba de integración Node con dos sólidos B-Rep superpuestos en profundidad, comprobación de aristas ocultas y rechazo de escala no uniforme, incorporada al test `test:clash:occt` ya ejecutado en CI.

**Pendiente Etapa A:** detección B-Rep de conexiones, ubicación automática de cortes, vistas seccionadas con referencia A-A y detalles ampliados; asimismo, pruebas visuales de planos reales y gestión por lotes de conjuntos de más de 128 piezas. El HLR exacto sólo se activa en conjuntos uniformemente transformados cuyas instancias tengan STEP B-Rep; no se certifica el plano para fabricación.

---

## v0.1.146 — 2026-11-13

### Etapa A (entrega incremental 1): vistas longitudinales de ensambles rotados

- **Orientación según geometría:** nuevo `AssemblyOrientationPlanner` estima por análisis de varianza (PCA) el eje longitudinal de conjuntos claramente esbeltos a partir de cajas locales de mallas ya transformadas a mundo. Rechaza orientaciones ambiguas y conserva el selector antiguo de ejes globales como respaldo. La dirección es una **propuesta de vista**, no un eje de mecanizado verificado.
- **Alzado/extremo vinculados:** `AutoDrawingPlanner` construye bases ortogonales coherentes para alzado longitudinal, extremo, planta e isométrica; `GeneralPdfController` pasa muestras de las piezas, inclusive en hojas individuales, sin sustituir `projectAssembly`, las cotas STEP ni el motor A3/PDF existente.
- **Seguridad:** los límites y posiciones reales de las vistas siguen tomándose de la proyección posterior, no del PCA; no se generan características de fabricación a partir de cajas o triángulos.
- **Pruebas añadidas:** perfil rotado 45°, columna vertical, volumen cúbico sin eje principal y geometrías inválidas; se incorporan a `test:drawings`.

**Etapa A NO finalizada:** sigue pendiente HLR exacto de conjunto con ocultación entre piezas, cortes de unión, detalles ampliados, flechas de sección y validación técnica de planos reales. La proyección exacta continúa limitada al HLR por pieza cargada. El cambio NO convierte los PDF en planos certificados para fabricación.

---

## v0.1.145 — 2026-11-13

### Acotación inteligente STEP, edición de etiquetas y BOM de ingeniería

- **Cotas de taller:** el planificador de ensambles prioriza dimensiones generales exactas X/Y, agrupación de diámetros por centros distintos, posiciones de centros circulares, pasos entre centros realmente alineados y estaciones intermedias de vértices STEP. Conserva referencias `instanceId` / `topologyId` y elimina valores geométricamente repetidos.
- **Distribución sin texto superpuesto:** incorpora un organizador de cotas por corredores de la vista (superior, lateral derecho e inferior); las cotas que no caben se omiten con un contador visible en vez de dibujarse encima de otras medidas. Protege la geometría principal de las etiquetas mediante márgenes y limita la densidad a 32 candidatos por vista.
- **Ajuste manual de etiquetas:** arrastra el texto de una cota automática para reposicionarlo sin cambiar su valor, clic derecho para ocultarlo y botón `Restablecer cotas` en el árbol del PDF para recuperarlas. Los ajustes se guardan con la hoja y se preservan al regenerar si la referencia STEP sigue existiendo. Las posiciones SVG y PDF comparten la misma alineación de texto.
- **BOM con datos reales:** agrupa ocurrencias por definición y añade nombre y calidad de material, masa unitaria y masa total **solo cuando existen** en `FrameLogicEngineeringModel`; los datos faltantes aparecen como no disponibles. No se calculan masas a partir de mallas.
- **Jerarquía y cambios:** la regeneración de vistas de ensamble consulta la pertenencia actual de subensambles, mantiene las marcas existentes, numera nuevas definiciones sin reutilizar marcas y actualiza las hojas de BOM asociadas sin eliminar hojas editadas.
- **Pruebas nuevas:** centros, diámetros y pasos colineales; exclusión de centros oblicuos; omisión por falta de espacio; ajustes manuales; cantidades, procedencia de masa y materiales.

**Alcance y pendientes:** los círculos STEP no se interpretan automáticamente como taladros mecanizados. Las cotas son geométricas y sus **textos** se pueden desplazar u ocultar, pero las líneas de cota aún no tienen edición manual completa. Siguen pendientes cortes y vistas auxiliares automáticos de uniones, ocultación exacta entre componentes, exportación multipágina en un archivo, reconciliación de hojas de pieza cuando cambia la jerarquía y verificación presencial contra planos de taller. No emplear los planos sin revisión profesional.

---

## v0.1.144 — 2026-11-13

### Detallado automático: STEP HLR, cotas, planos de piezas y regeneración

- **Proyección B-Rep:** las vistas automáticas consultan el motor OpenCascade HLR existente por cada pieza STEP cargada y proyectan sus aristas visibles/ocultas con la transformación de cada instancia. Si una pieza no dispone de STEP válido, continúa con proyección de malla y queda identificada como aproximada.
- **Cotas STEP:** utiliza vértices y centros de círculos B-Rep, no triángulos de visualización, para acotar los ejes X/Y y diámetros de vistas ortogonales. Reserva espacio en cada viewport para cotas y etiquetas; limita repeticiones y líderes para evitar saturación.
- **Marcas y planos de pieza:** etiquetas en el plano de ensamble, hojas A3 individuales para hasta 20 definiciones distintas, con vistas ortogonales y medidas STEP disponibles; conservan el motor PDF unificado.
- **BOM ampliado:** cuando un conjunto tiene más de ocho definiciones, añade hojas de inventario en páginas de 40 renglones, sin inventar pesos ni materiales.
- **Regeneración:** detecta cambios de transformaciones o geometría de malla y permite regenerar vistas desde el árbol PDF conservando el tamaño/posición manual de las ventanas; mantiene intactas las anotaciones manuales.
- **Resiliencia:** limita la densidad de segmentos por vista, evita desbordamiento de pila en conjuntos grandes y documenta la compatibilidad con proyectos antiguos; sin licencias ni dependencias nuevas.

**Limitaciones explícitas:** OCCT HLR sólo oculta aristas dentro de una misma pieza STEP, no resuelve oclusiones entre piezas diferentes. No existen aún cotas totalmente editables/asociativas en el PDF general, geometría B-Rep para piezas sin STEP, reconocimiento completo de uniones/soldaduras, ni cortes y detalles automáticos de fabricación. Se deben revisar y validar manualmente los planos, las unidades y las dimensiones, especialmente si se mezclan mallas y STEP.

---

## v0.1.143 — 2026-11-13

### Detallado automático de ensambles — primera etapa

- **Comando contextual:** clic derecho sobre un ensamble → `Generar planos automáticamente`, sin exigir activar un WorkPlane ni añadir botones a la barra superior.
- **Vistas adaptativas:** identifica el eje dominante del envolvente del ensamble, prioriza una vista principal y una vista de extremo, añade isométrica cuando existen varias piezas y una vista complementaria si el conjunto volumétrico es complejo. No impone las cuatro vistas.
- **Hoja A3 real:** crea vistas dentro del motor PDF unificado, distribuye de dos a cuatro vistas para primer diedro y escoge una escala normalizada común sin invadir el cajetín. Permite desplazar y cambiar tamaño de las vistas con el editor existente.
- **Marcas básicas y cantidades:** resumen obtenido de las instancias del ensamble y marcas persistentes por definición de pieza; no inventa materiales ni pesos.
- **Pruebas nuevas:** selección de vistas para tubos, placas y conjuntos volumétricos, compatibilidad de disposición por diedro, comprobación de solapamientos, validación de escalas.
- **Arquitectura:** investigación y límites detallados en `docs/drawing/AUTOMATIC_ASSEMBLY_DETAILING.md`, sin introducir dependencias ni licencias nuevas.

**Alcance explícito:** estas primeras proyecciones siguen la ruta de aristas de malla de «Enviar a PDF». Son preliminares, sin HLR exacto ni cotas de fabricación. La hoja incluye una advertencia. La siguiente etapa debe unir proyección OCCT B-Rep, cotas asociativas editables y planos individuales. El estado del CI y de Cloudflare Pages se valida por separado.

---

## v0.1.142 — 2026-11-13

### ZOOM: Enter obligatorio después de elegir E, O o S

- **Secuencia:** escribir `Z`, confirmar con `Enter`, pulsar `E`, `O` o `S` para resaltar la opción y pulsar **`Enter` otra vez** para ejecutarla. Ninguna letra inicia una operación de cámara por sí sola.
- **S · Seleccionar área:** antes del segundo Enter, no se captura el ratón, no aparece el rectángulo y la cámara sigue navegable. Después de confirmar S, funciona la ventana por dos esquinas o arrastre, con Esc para cancelar.
- **E/O:** conservan zoom de extensión y objeto seleccionado; también requieren confirmación Enter después de su letra.
- **Pruebas:** entradas de teclado, realce visible, inhibición de acciones antes de Enter, ejecución tras confirmar y cancelación.

**Pendiente:** comprobar la versión publicada en Cloudflare Pages y el flujo de teclado en Firefox y Chrome.

---

## v0.1.141 — 2026-11-13

### ZOOM: entrar con Z + Enter y encuadrar una zona seleccionada

- **Entrada de comando:** `Z` muestra una indicación breve junto al cursor y espera **Enter**. Solo entonces aparece el menú de opciones ZOOM. `E` y `O` ya no se ejecutan prematuramente al escribir después de `Z`.
- **Opciones:** `E · Extensión (todo el modelo)`, `O · Objeto (selección)`, `S · Seleccionar área (ventana)`. Las teclas de flecha o `Tab` recorren las opciones, `Enter` ejecuta la resaltada y `Esc` cancela.
- **S · Seleccionar área:** dibuja un rectángulo mediante **dos clics (esquinas opuestas)** o **clic y arrastre** sobre el espacio de modelado. Una vez confirmada la ventana, la cámara centra y amplía la región de pantalla elegida manteniendo su orientación original y un margen visible. Funciona con cámaras ortográficas y en perspectiva.
- **Sin selección ni modificaciones:** el rectángulo de ZOOM está separado de la selección de piezas, DWG y CAD; captura temporalmente el ratón y bloquea la navegación de cámara durante la definición del área. No crea entidades ni historial.
- **Posición y cancelación:** indicaciones junto al cursor, ventana azul translúcida sobre el área, `Esc` cancela antes de terminar y restaura el estado anterior de controles y pantalla. Rechaza ventanas demasiado pequeñas.
- **Pruebas:** entradas `Z → Enter → E/O/S`, cursor y menú de opciones, ciclo de selección, las dos variantes de ventana, cancelación/restablecimiento y encuadre geométrico ortográfico y 3D en perspectiva.

**Verificación manual pendiente:** probar en Chrome y Firefox con DWG grande y piezas 3D, incluyendo la selección de zonas en vistas inclinadas. La compilación de GitHub no certifica despliegue automático en Cloudflare Pages.

---

## v0.1.140 — 2026-11-13

### ZOOM: opciones de teclado legibles junto al cursor

- **Z → opciones contextuales:** al pulsar `Z` aparece junto al puntero un menú con `E · Extensión (todo el modelo)` y `O · Objeto (selección)`. Se elimina el recuadro fijo de ZOOM pegado al borde inferior que se superponía con otros controles.
- **Actualización al teclear:** `E` y `O` ejecutan directamente la opción correspondiente (como antes); `↑`/`↓` o `Tab` alternan y resaltan la opción visible; `Enter` confirma la resaltada; `Esc` cancela sin modificar la cámara.
- **Posicionamiento robusto:** el menú sigue la última posición real del puntero sobre Model Space, se desplaza hacia arriba cuando el cursor está cerca de la parte inferior y respeta los bordes de la ventana. Indicadores de resultado/errores de ZOOM también aparecen allí.
- **No interferencias:** el zoom no captura atajos modificados como `Ctrl+Z`, no se activa dentro de campos de texto y `Z` seguido de `E`/`O` no lanza accidentalmente otro comando CAD. El menú temporal dura hasta ocho segundos y se oculta al cancelar, ejecutar u operar otra herramienta.
- **Pruebas:** posición en bordes y pantallas estrechas, combinación `Z/E/O`, Tab/flechas/Enter/Esc, aislamiento de otros atajos y supresión en editores de texto.

**Validación en navegador pendiente:** comprobar el menú junto al cursor en Firefox/Chrome y el zoom real de modelos CAD, DWG/DXF y piezas 3D. El CI compila la aplicación, pero no garantiza la publicación automática en Cloudflare Pages.

---

## v0.1.139 — 2026-11-13

### LINE: ocultar el recuadro informativo después del primer punto

- **Aviso flotante:** mientras LINE espera el primer punto, conserva la indicación `LINE · SNAP / Primer punto`. Una vez elegido el primer SNAP, oculta inmediatamente el recuadro `LINE · SNAP / Segundo punto · ...` y no vuelve a mostrarlo durante la misma cadena de segmentos.
- **Vista despejada:** mantiene visibles únicamente las cotas temporales de distancia y ángulo, la vista previa de la línea y los indicadores SNAP. La entrada de distancia numérica y sus atajos siguen funcionando sin cambios.
- **Control de eventos:** la ocultación ocurre en el mismo `pointerup` que confirma el primer punto; no necesita esperar a mover el cursor ni afecta las indicaciones de PUNTO y TRIM.
- **Pruebas:** verificaciones de indicación inicial, ocultación inmediata tras el primer punto y ausencia de reapertura durante el resto de LINE.

**Validación en navegador pendiente:** verificar en Firefox y Chrome que las cotas temporales siguen visibles y el aviso no tapa el dibujo.

---

## v0.1.138 — 2026-11-13

### MOVE: centro de desplazamiento editable mediante el mismo control que ROTATE

- **Piezas y ensambles 3D:** MOVE incorpora el marcador amarillo visible y de tamaño constante en pantalla utilizado por ROTATE. Clic sobre el marcador, luego clic en un SNAP (extremo, punto medio, etc.) para cambiar con precisión el punto base del gizmo; también admite arrastrarlo libremente.
- **DWG/DXF:** el marcador existente de MOVE comparte la nueva experiencia. Si se arrastra y se suelta sobre un SNAP válido, el punto base se ajusta a ese punto; si no hay SNAP se mantiene en la posición libre elegida.
- **Seguridad geométrica:** cambiar el punto base no desplaza, duplica, rota ni altera la geometría seleccionada, ni crea una entrada de Undo/Redo. El siguiente arrastre de MOVE toma ese punto base como origen y solo aplica el desplazamiento solicitado.
- **Selección y comandos:** el marcador se superpone al lienzo para evitar clics accidentales sobre piezas ocultas detrás del gizmo, sin interferir con CTRL + copiar por eje, MOVE numérico, SNAP de destino ni el cambio de selección.
- **Interacción:** tamaño de marcador aumentado a 24 px, texto informativo accesible, limpieza al cancelar/desactivar y actualización al cambiar de cámara.
- **Pruebas:** clic + SNAP 3D, arrastre libre, SNAP de liberación en pieza y DWG, desplazamiento posterior sin salto de origen y conservación del historial.

**Validación manual pendiente:** comprobar MOVE en piezas 3D y DWG/DXF desde Chrome y Firefox y confirmar que Cloudflare Pages publique la versión. GitHub Actions solo valida y compila.

---

## v0.1.137 — 2026-11-13

### LINE: longitud numérica después de navegar la cámara

- **Corrección del foco:** después de girar la cámara con el botón central o desplazarse con el derecho, el campo `LINE · LONGITUD` recupera el foco, conserva el valor parcial y permite continuar digitando en lugar de obligar a un segundo punto manual.
- **Teclado de respaldo:** si el campo quedó desenfocado por navegación, el primer número (incluidos decimales, signo menos y retroceso) se dirige a la longitud en curso; Enter confirma esa distancia sin interrumpir LINE. Otros campos editables y accesos Ctrl/Alt se respetan.
- **Dirección estable:** el movimiento del puntero con botones de navegación de cámara no cambia la dirección de la línea provisional ni la longitud numérica posterior.
- **Precisión:** acepta coma o punto decimal y mantiene borradores intermedios como `12.` sin vaciarlos; conserva las cotas temporales y el historial/Undo existentes.
- **Pruebas:** restauración del foco después de navegación derecha/central, ingreso desde canvas tras perder el foco, Enter y señal de distancia, borradores numéricos y prevención de movimientos del dibujo durante la navegación.

**Comprobación manual recomendada:** LINE, primer punto, orientar la línea, navegar con botones central/derecho y escribir una distancia, tanto sobre CAD como sobre DWG/DXF; verificar también en Firefox.

---

## v0.1.136 — 2026-11-13

### SNAP INTERSECCIÓN sobre la trayectoria provisional de LINE

- **LINE / INTERSECCIÓN:** después de seleccionar el primer punto, la vista previa busca el primer cruce real con segmentos existentes entre el origen y el cursor y propone ese punto exacto como destino. Funciona con líneas CAD independientes y referencias DWG/DXF compactas, incluso desplazadas o rotadas.
- **Indicador visible:** se muestra un punto de color cian sobre la intersección mientras el tramo provisional está capturado; al hacer clic se crea el segmento hasta allí y LINE continúa. **Alt** permite atravesar otras líneas temporalmente sin la captura automática.
- **Cálculo geométrico:** requiere coincidencia de los segmentos finitos en 3D; evita falsos cruces debidos únicamente a su proyección en pantalla, capas ocultas/deshabilitadas para SNAP, segmentos paralelos y el punto inicial de la propia línea.
- **Rendimiento:** reutiliza el índice SNAP espacial con muestreo de la trayectoria (máximo 80 estaciones, hasta 80 candidatos locales). No explota ni recorre en cada movimiento los millones de segmentos compactos del DWG; respeta el presupuesto de muestras de referencias muy densas del índice existente.
- **Compatibilidad:** mantiene el workplane y ORTO, los SNAP de puntos existentes, el historial LINE y la entrada numérica de distancia sin aplicar captura de trayectoria a valores numéricos.
- **Pruebas:** intersecciones nativas, DWG transformado, primer cruce, distintas cotas Z, capas/SNAP, exclusión de inicio y tecla Alt.

**Limitación consciente:** en vistas muy alejadas con más de 120.000 segmentos visibles, la cobertura de candidatos depende del muestreo existente; acercar la cámara permite recuperar intersecciones locales exactas.

---

## v0.1.135 — 2026-11-12

### Corrección de doble clic 90° y centro de giro visible en piezas 3D

- **Doble clic sobre anillos de ROTATE:** los bloques DWG/DXF conservan el eje detectado por raycast cuando Three.js devuelve temporalmente un selector `E`/nulo. Se prueba el picker invisible y, como alternativa, los anillos visibles. Los dos clics sobre el mismo eje funcionan sin depender del evento `dblclick` nativo y toleran pequeños desplazamientos y pausas normales de ratón.
- **Piezas y ensambles 3D:** se emplea el mismo marcador amarillo de pivote que ya utiliza CAD, en tamaño constante de pantalla y situado sobre el gizmo. Clic sobre el marcador y siguiente SNAP para trasladar el centro sin mover la geometría; también admite arrastre libre del centro. Tras cambiar el pivote, ROTATE gira alrededor de ese punto.
- **Historial y precisión:** dos clics cortos sobre el mismo anillo producen un único giro de +90° y una sola operación de deshacer; clics en distintos ejes o gestos de arrastre no producen giro automático.
- **Pruebas:** regresiones de selección nativa `E`/nula, rotación sin evento `dblclick`, SNAP de centro 3D y tolerancia de pulsaciones.

**Pendiente de verificación manual:** confirmar las interacciones en Chrome y Firefox con el DWG grande original y piezas 3D STEP en la aplicación publicada.

---

## v0.1.134 — 2026-11-12

### Referencias CAD compactas transformables y menú DWG/DXF unificado

- **ARCHIVO → Abrir DWG/DXF:** una sola entrada utiliza el lector compacto integrado en v0.1.133. El menú deja de ofrecer las opciones duplicadas de importación y recuperación; la ruta alternativa sigue disponible internamente.
- **MOVE / ROTATE / COPYBASE:** habilitadas para referencias compactas mediante matrices de transformación por paquete, sin modificar sus segmentos originales en Float64Array. Se conservan los controles de giro con eje, centro SNAP, doble clic de 90 grados y entrada numérica.
- **Copias independientes sin clonar geometría:** cada referencia copiada tiene capas, identificadores y matrices propias; reutiliza el buffer de segmentos y la geometría GPU cuando es seguro hacerlo.
- **SNAP, cotas y etiquetas:** la búsqueda local devuelve las coordenadas mundiales después de aplicar matrices; los textos siguen la transformación mediante sus puntos de anclaje. Los límites de selección usan cajas locales cacheadas y ocho esquinas, evitando recorrer millones de segmentos al mover el gizmo.
- **Persistencia e historial:** los proyectos `.flproject` guardan matrices opcionales de las referencias compactas y pueden seguir abriendo los proyectos v0.1.133. MOVE, ROTATE y COPYBASE se integran con Undo/Redo.
- **Comandos:** `R` y `ROTATE` se asignan al giro en referencias seleccionadas; `T`/`TRIM` conservan el recorte y `REC` conserva el rectángulo. La interfaz utiliza nombres de FrameLogic y mantiene las atribuciones Apache-2.0 en el repositorio.
- **Regresiones:** pruebas para giro, pivote, matrices, SNAP transformado, copias de buffer compartido, historial y menú único.

**Validación manual necesaria:** comprobar en Chrome y Firefox con el DWG original de aproximadamente 1.400.000 segmentos, así como interacciones mixtas con varias piezas 3D.

---

## v0.1.133 — 2026-11-12

### Motor CAD de Cota adaptado: DWG/DXF y referencias compactas

- **Nueva opción en ARCHIVO:** `Abrir CAD (motor Cota)` permite abrir DWG y DXF tanto de texto como binario con la ruta de conversión `@node-projects/acad-ts` utilizada por Cota, manteniendo los importadores antiguos para archivos editables.
- **Lector CAD unificado:** se adapta el flujo de Cota de `DwgReader`/`DxfReader`, reparación de FIELDs huérfanos, reconstrucción gráfica de ciertas cotas de arco y multileaders, escritura DXF incremental en UTF-8 y procesamiento mediante un Web Worker. Los XREF no se reconstruyen.
- **Geometría ligera:** el importador interpreta la geometría, pero en lugar de crear un `CadLine` con UUID y dos objetos de puntos por cada segmento, utiliza buffers de precisión doble `Float64Array` por paquetes de hasta 8.192 líneas; transferencia sin clonación, con acuse del hilo principal. Esto reduce significativamente la memoria permanente de la referencia CAD.
- **GPU agrupada y SNAP local:** las referencias ligeras se dibujan en `THREE.LineSegments` con origen local para precisión en coordenadas grandes. El índice de SNAP incluye los paquetes compactos, conservando el límite de 120.000 candidatos de pantalla y recalculando al cambiar visibilidad o zoom.
- **Capas, textos y unidades:** conserva colores, capa visible, textos recuperados y anclas de texto existentes, con confirmación explícita de mm ×1 para los formatos importados con Cota; el modo editable original no cambia.
- **Guardar/restaurar:** los `.flproject` incorporan opcionalmente buffers CAD compactos; los proyectos anteriores mantienen compatibilidad. El autoguardado se pausa para referencias compactas mayores de 100.000 segmentos para evitar crear snapshots masivos.
- **Protección de edición:** las referencias Cota son **de solo lectura** en esta primera integración. Selección, visualización por capa y SNAP siguen disponibles, pero mover/rotar/copiar en modo compacto requiere primero usar el importador editable anterior.
- **Pruebas:** añade tests de 250.001 segmentos compactos, parser sin entidades individuales, renderizado, colores, visibilidad, snaps, almacenamiento y conexión del menú/Worker.
- **Licencia y atribución:** incorpora los documentos Apache-2.0 y NOTICE oficiales de Cota (Copyright 2026 Christian Orengia) en `licenses/`; implementación adaptada, no afiliada al proyecto Cota.

**Limitaciones:** no es una sustitución íntegra del editor o parser de Cota. La expansión de entidades sigue siendo responsabilidad de FrameLogic; el rendimiento con `CUNAS_MEDIR 1.dwg` requiere una prueba real. Entidades proxy complejas y 3DSOLID pueden seguir siendo incompletos. Consultar `docs/COTA_CAD_IMPORT.md`.

---

## v0.1.132 — 2026-11-12

### DWG grandes · reducir memoria y evitar Out of Memory con ~1.400.000 segmentos

- **Problema detectado:** al importar `CUNAS_MEDIR 1.dwg` sin el límite anterior (aprox. 1,4 millones de segmentos), Firefox/Chrome puede agotar la memoria. El código anterior clonaba todos los segmentos en un segundo array JavaScript en el hilo principal y reconstruía un índice SNAP con millones de objetos, celdas y referencias.
- **Registro DWG directo desde el Web Worker:** la interfaz confirma la unidad real **antes de registrar líneas**, recibe bloques de 8.192 segmentos con acuse después de insertarlos, nunca acumula un segundo array de 1,4 millones de objetos y libera las referencias de objetos del Worker conforme se transfieren. El encabezado incluye cantidad total y extensión original calculada en el Worker; el selector `mm ×1` conserva exactamente la escala.
- **Rollback seguro:** si se cancela, falla la transferencia o hay un error mientras se registra el DWG, se intenta eliminar la geometría y las capas importadas parcialmente, evitando referencias CAD incompletas.
- **GPU con dos pasadas de registro:** la escena CAD ya no usa `cadLines.getAll()` más un array con todas las líneas por capa solo para construir la representación; cuenta las líneas y rellena directamente un único `Float32Array` por capa, manteniendo todas las líneas de geometría.
- **SNAP adaptativo de memoria acotada:** el índice de SNAP en pantalla almacena como máximo 120.000 líneas visibles, elegidas de forma distribuida cuando la vista está demasiado alejada. Las demás líneas **siguen dibujadas y presentes en el modelo**. Al acercar la cámara, el índice incluye de nuevo todas las líneas visibles cuando caben en ese presupuesto. La precisión de SNAP puede ser parcial en vistas muy densas y debe revisarse antes de ensamblar con exactitud.
- **Recuperación DWG de alta carga:** si el lector principal recupera más de 350.000 segmentos, se omite su comparación simultánea con el lector alternativo para no duplicar enormes conjuntos de geometría en RAM. El diagnóstico indica explícitamente esta limitación. Si el lector principal falla o devuelve geometría vacía, el alternativo sigue disponible.
- **Pruebas:** regresiones de SNAP con más de 120.000 segmentos visibles, recuperación de SNAP completo tras zoom, almacenamiento de escala a partir de cabecera de Worker y protocolo de transferencia sin acumulación de objetos duplicados. Se conservan las pruebas de importación ilimitada de DWG y el límite DXF independiente.

**Advertencia:** no existe garantía de memoria ilimitada; los dispositivos con poca RAM todavía pueden fallar ante DWG enormes, guardado/transformaciones de referencias de millones de entidades o CAD altamente repetitivo. Esta mejora evita dos causas principales de OOM sin reducir el número de líneas del DWG importadas. Las entidades XREF y CAD proxy que el lector no soporte siguen sin reconstruirse. Validar en Firefox/Chrome con el archivo binario del usuario.

---

## v0.1.131 — 2026-11-12

### DWG grandes · sin límite global de 240.000 segmentos estructurales

- **DWG sin corte por segmentos:** tanto `Abrir DWG/DXF` (cuando la extensión es DWG) como `Recuperar DWG` activan el modo `unlimitedSegments` en el parser. Los `INSERT` anidados y los elementos posteriores al segmento 240.000 ya no se recortan por la cuota global.
- **Una pasada estructural:** para DWG grandes cada entidad raíz se expande directamente una sola vez, sin repartir un presupuesto de 240.000 segmentos ni repetir recursivamente los primeros miles de segmentos de cada bloque.
- **Transferencia por lotes con confirmación:** el Web Worker anuncia la cantidad real de segmentos y los envía en lotes de máximo 8.192. El hilo principal confirma la recepción de cada lote antes de solicitar el siguiente, reduciendo picos de clonación y manteniendo la UI con indicador de progreso. Si una transferencia acaba incompleta, se rechaza antes de registrar entidades.
- **Ahorro de memoria:** la comparación de extensiones entre los lectores DWG ya no crea una matriz auxiliar con dos puntos por segmento.
- **DXF y herramientas existentes:** conservan por defecto el límite protector de 240.000 segmentos, las unidades explícitas introducidas en v0.1.130, la representación por capas, el procesamiento de registros en grupos, SNAP y archivos .flproject. La omisión de HATCH y XREF se mantiene; las cotas gráficas opcionales conservan su política independiente.
- **Pruebas:** regresión con 245.761 segmentos estructurales (más de 240.000) incluyendo una viga colocada al final del archivo, validación de textos y del código INSUNITS, y transporte exacto de 250.001 registros por lotes sin pérdidas.

**Límites de hardware:** sin límite numérico de segmentos no significa memoria infinita. La conversión y el modelo CAD deben caber en la RAM del dispositivo; archivos con millones de entidades pueden tardar o causar errores de memoria. Los formatos no soportados (ACAD_PROXY_ENTITY, sólidos especiales) y referencias externas siguen requiriendo revisión visual. No se asegura que todos los bloques con atributos sean legibles por este solo cambio.

---

## v0.1.130 — 2026-11-12

### DWG/DXF · Unidades explícitas y prevención definitiva del factor ×1.000 accidental

- **Selector de unidades DWG:** reemplaza el `window.prompt` por un cuadro de diálogo con opciones excluyentes `mm (×1)`, `cm (×10)`, `m (×1.000)`, `in (×25,4)` y `ft (×304,8)`. Se inicia en **mm** y no ofrece `auto` para DWG; la unidad que informe el DXF generado solo es informativa y **nunca modifica la selección manual**.
- **Vista previa previa a la importación:** muestra el código `INSUNITS` detectado, el factor realmente aplicado y la extensión máxima en unidades originales y en milímetros. Permite cancelar antes de registrar capas, geometría o textos.
- **Una sola conversión:** el factor procede exclusivamente de la selección confirmada y se aplica por igual a líneas, puntos, posiciones y ejes de textos `TEXT`, `MTEXT`, `ATTRIB`; se comprueba que `mm` equivale exactamente a ×1.
- **Archivos DXF:** mantiene la conversión automática para códigos de `INSUNITS` válidos; si el DXF no declara unidades conocidas, presenta el mismo selector explícito.
- **Aviso complementario:** se conserva la confirmación de escala sospechosa al elegir metros en un dibujo con miles de unidades de extensión. El resumen final diferencia la unidad elegida manualmente del factor automático de DXF.
- **Pruebas:** incluye el caso `CUNAS_MEDIR 1.dwg` con `INSUNITS=6` y extensión original de 461.564,80125 unidades, además de centímetros, metros, pulgadas, pies y prohibición de inferencia automática del DWG.

**Limitación:** esta corrección no altera el tope protector de 240.000 segmentos ni recupera los bloques gráficos omitidos por dicho límite. Las referencias ya importadas con factor incorrecto deben eliminarse y reimportarse; no se reescala retrospectivamente un `.flproject`.

---

## v0.1.129 — 2026-11-12

### DWG · Corrección del lector alternativo en producción y protección contra escala ×1.000

- **Fallo reproducido por el usuario:** `ARCHIVO → Recuperar DWG` emitía `na is not a DXF subclass` en el navegador para `CUNAS_MEDIR 1.dwg`. Al no poder convertir el DWG alternativo, volvía al lector principal y seguía con 240.000 segmentos, 4.855 textos y 143 entidades con detalle pendiente.
- **Causa del fallo:** `@node-projects/acad-ts` identifica clases CAD mediante `constructor.name`. Vite 8/Rolldown minificaba esos nombres en producción, incluido el Web Worker. Se configura `build.rolldownOptions.output.keepNames = true` y **también** `worker.rolldownOptions.output.keepNames = true`, de acuerdo con la solución comprobada por Cota (Apache-2.0, v2.10.4). No se cambia el lector principal.
- **Control de escala:** si el usuario elige m/auto en un DWG cuyas coordenadas ya se extienden miles de unidades, se presenta una confirmación adicional con el tamaño de origen y el tamaño resultante en mm. Cancelar detiene la importación sin crear entidades. La opción `mm` sigue aplicando ×1.
- **Pruebas de regresión:** `npm run test:dwg-recovery` verifica explícitamente los nombres de clase en el paquete principal y el trabajador, casos de 15.005,75 unidades ×1.000, selección conservadora del lector y conversión binaria DWG de muestra.
- **Límite de seguridad conservado:** no se aumenta automáticamente el máximo de 240.000 segmentos, que protege el rendimiento y el consumo de memoria en Firefox/Chrome. Un DWG que lo supera debe seguir indicándose **parcial**. La mejora permite ejecutar el segundo lector; no asegura recuperar todo un dibujo grande.

**Pendiente de validación:** reimportar el DWG binario original `CUNAS_MEDIR 1.dwg` en la web publicada y comparar contra AutoCAD. La conservación de nombres en producción evita el error de subclase, pero la cobertura total depende de las entidades reales del archivo.

## v0.1.128 — 2026-11-12

### Etapa 3 · Planos técnicos y acotación automática (Cota → FrameLogic)

- **Vistas proyectadas ISO E / ISO A:** las cuatro vistas automáticas existentes (alzado, planta, lateral e isométrica) se disponen en una hoja usando primer o tercer diedro. La nueva selección de convención se guarda con las preferencias profesionales del dibujo.
- **Distribución de hoja protegida:** se calcula una escala visual común a las cuatro vistas y se dejan libres las áreas de cajetín y revisiones. Las vistas se organizan automáticamente solo al crearse; los posteriores desplazamientos/redimensionamientos manuales permanecen. El botón `Organizar auto` permite volver a distribuirlas explícitamente.
- **Cotas automáticas para piezas o conjunto:** junto a `Cotas auto` se puede seleccionar `Conjunto` o `Por pieza`, cotas `desde base` o `en cadena` y `detalladas` o `generales`. Las configuraciones se guardan por hoja en el snapshot de documentación.
- **Cotas por geometría exacta:** las estaciones de acotación se basan en vértices y centros de círculos STEP B-Rep; no se deducen cotas de mallas de visualización. Se agrupan diámetros iguales de orificios distintos con texto `n× Ø` sin contar dos veces aristas repetidas del mismo centro.
- **Regeneración segura:** la nueva planificación conserva la edición manual y sigue siendo idempotente al regenerar cotas automáticas. Las etiquetas de diámetros se incorporan a la misma representación SVG utilizada para PDF/DXF/SVG.
- **Pruebas:** la batería `npm run test:drawings` incluye geometrías de piezas/conjuntos, cotas en cadena/base, duplicados circulares y colocación de cuatro vistas sin intersecciones ni invasión del cajetín.

**Alcance y límites:** la disposición de vistas es una mejora de las secciones vectoriales existentes, no un sistema de proyección de fabricación certificado. Las cotas automáticas requieren STEP B-Rep accesible; geometría DWG importada como referencia, mallas y piezas sin topología B-Rep no generan cotas de diámetro exactas. Las proyecciones, ocultaciones, líneas y anotaciones deben revisarse antes de usar planos para fabricación. Se prioriza el núcleo de dibujo ya implementado y no se añaden licencias de pago.

---

## v0.1.127 — 2026-11-12

### Etapa 1 · Recuperación de DWG con un segundo lector (Cota / acad-ts)

- **Ruta rápida conservada:** el botón "Abrir DWG/DXF" sigue usando el conversor WASM actual. Cuando este falla o no genera geometría, se intenta automáticamente el lector alternativo.
- **Nuevo botón "Recuperar DWG":** permite comparar ambos lectores para un DWG problemático, en Web Worker y sin bloquear las interacciones de la página. El segundo lector usa \`@node-projects/acad-ts\` 3.6.0 (MIT), siguiendo el enfoque de Cota (Apache-2.0).
- **Diagnóstico de recuperación:** compara cantidad de segmentos estructurales (sin contar gráficos secundarios de cotas), textos recuperados, bloques sin resolver, escala, metadatos INSUNITS y truncamiento. Selecciona conservadoramente el mejor resultado; no mezcla piezas de dos lectores.
- **Bloques y atributos:** el segundo lector conserva la ruta DWG→DXF para INSERT, TEXT, MTEXT y ATTRIB; repara referencias de propiedad de campos anidados antes de escribir DXF e incorpora representaciones de cotas de arco con bloque gráfico.
- **Unidad y fiabilidad:** sigue siendo obligatoria la elección/confirmación de unidad para DWG (mm inicial), sin multiplicar inadvertidamente ×1.000. El aviso final incluye la comparación o los errores del lector alternativo.
- **Pruebas:** \`npm run test:dwg-recovery\` comprueba selección por aumento de geometría, conservación de textos, rechazo de escalas ×1.000, diferencias de INSUNITS y no sustitución de importaciones completas por truncadas.

**Limitaciones:** no se reconstruyen XREF externos, ni se promete soporte completo de proxies y sólidos ACIS. Pendiente comparar \`CUNAS_MEDIR 1.dwg\` real con AutoCAD y ejecutar validaciones de navegador Firefox/Chrome. No se considera un plano verificado para fabricación sin esta comparación.

---

## v0.1.126 — 2026-11-12

### Importación DWG: corregir unidades de AutoCAD que aparecen multiplicadas por 1.000

- **Error reportado:** un dibujo en milímetros (por ejemplo `CUNAS_MEDIR 1.dwg`) aparece con dimensiones próximas a 15 millones de mm frente a ~15.005,75 mm en AutoCAD. En la ruta actual, si el DXF generado por el conversor declara `$INSUNITS=6` (metros), `insUnitsToMillimeters()` multiplica por **1.000**, aunque las coordenadas del DWG original ya puedan estar expresadas en milímetros. El dato exacto que genera el conversor para el DWG binario de referencia sigue pendiente de comprobar.
- **Confirmación explícita de unidad en DWG:** tras convertir/analizar en el Web Worker y **antes de crear las entidades**, se solicita la unidad real de las coordenadas (mm, cm, m, in o ft), con **mm como opción inicial**. También se admite `auto` para confiar expresamente en el código INSUNITS convertido. La ventana informa el código detectado, el factor inferido y advierte sobre el problema ×1.000. Cancelar no crea geometría ni capas.
- **DXF ASCII:** conserva la lectura automática de su `$INSUNITS` cuando es válido. Si no hay unidades reconocidas solicita la unidad como anteriormente.
- **Coherencia CAD:** el único factor seleccionado se aplica de forma uniforme a segmentos, puntos y las tres anclas de cada texto, manteniendo SNAP, MOVE/ROTATE, COPYBASE y .flproject en milímetros. El resumen de importación informa el factor aplicado.
- **Pruebas:** comprobar importación sin tres ceros adicionales para una cota de 15.005,75 mm, selección intencionada de metros, centímetros, pulgadas, pies, opción automática, DXF con unidades conocidas y cancelación/entrada inválida.

**Limitación:** sin leer y contrastar el encabezado convertido de cada DWG no es seguro deducir si las coordenadas son realmente metros o milímetros. Por eso no se cambia indiscriminadamente el factor de todos los planos. Debe reimportarse el DWG de origen: los proyectos .flproject ya guardados con geometría escalada equivocadamente no se corrigen retroactivamente.

---

## v0.1.125 — 2026-11-12

### Recuperación gráfica de DWG con bloques complejos y controles individuales en INSTANCIAS

- **Problema reportado:** al importar `CUNAS_MEDIR 1.dwg`, la carga ya es rápida pero todavía faltan varios elementos visibles en AutoCAD. Los bloques pueden contener `ATTRIB`/textos, gráficos anónimos de `DIMENSION`, entidades no soportadas o referencias ausentes. La causa concreta de cada pieza faltante no puede concluirse sin una comparación de la conversión binaria y el dibujo original.
- **Geometría priorizada:** el parser continúa descomponiendo lógicamente `INSERT` y bloques anidados como geometría CAD, sin crear miles de subobjetos seleccionables. Los segmentos estructurales y los textos tienen prioridad; cuando sobra capacidad se rescatan hasta **24.000 segmentos gráficos secundarios** provenientes de bloques anónimos de `DIMENSION`, incluso dentro de otros `INSERT`. Esto corrige la omisión absoluta introducida por el modo estructural de v0.1.124, sin permitir que esos gráficos desplacen tubos, cerchas o rótulos. Se omiten `HATCH` y XREF que no tengan contenido local.
- **Textos y atributos:** `TEXT`, `MTEXT` y `ATTRIB` conservan sus posiciones, transformaciones anidadas y pasada independiente. La recuperación gráfica secundaria no los duplica.
- **INSTANCIAS:** cada referencia DWG/DXF muestra un triángulo para contraer o desplegar sus capas, inicialmente contraídas, y mantiene esta elección durante las reconstrucciones del árbol. Cada referencia tiene **un ojo propio** para ocultarla/mostrarla sin afectar a las demás. Al volver a mostrar, se restauran las visibilidades individuales de sus capas. El ojo general de REFERENCIAS CAD permanece.
- **Actualización visual:** al cambiar visibilidad se sincronizan líneas, puntos, textos y caché SNAP; ocultar un DWG seleccionado cancela su gizmo para que no quede visible sin geometría.
- **Pruebas:** nuevas regresiones de referencias con capas mixtas, aislamiento entre DWG, bloques anidados `DIMENSION`, textos `4S 3000`, `ATTRIB` `P6 3000` y conservación de un perfil estructural posterior con presupuesto limitado. Integradas en `npm run test:dwg-import`.

**Pendiente de validación manual:** contrastar visualmente el archivo binario aportado `CUNAS_MEDIR 1.dwg` con AutoCAD en Firefox/Chrome. Los elementos `ACAD_PROXY_ENTITY`, sólidos no convertidos o XREF externos pueden seguir ausentes; el límite total de 240.000 segmentos permanece. No se afirma que todas las piezas se recuperan solo por pasar pruebas DXF sintéticas. La prueba del clic MOVE por eje + SNAP sigue siendo un desarrollo independiente.

---

## v0.1.124 — 2026-11-12

### DWG grandes: prioridad a perfiles, tubos y textos frente a cotas y sombreados

- **Causa:** el presupuesto de 240.000 segmentos todavía se compartía con gráficos de cotas `DIMENSION` y contornos de `HATCH`; al importar planos cargados de detalles secundarios, algunos perfiles y tubos quedaban simplificados o sin representar. El reparto inicial también reservaba un mínimo de 16 segmentos por raíz, que podía agotar la cuota antes de visitar todas las referencias complejas posteriores.
- **Importación estructural:** el Web Worker prioriza `LINE`, `INSERT`, polilíneas, arcos y entidades constructivas y excluye del presupuesto los gráficos `DIMENSION` y `HATCH`, también cuando se encuentran dentro de bloques anidados. Se informa de las entidades omitidas en el resumen.
- **Cobertura de bloques:** la primera pasada reserva desde un segmento por entidad raíz cuando hay muchas referencias y dedica el resto de la capacidad a recuperar detalles en sucesivas pasadas. El límite de seguridad se mantiene en **240.000 segmentos**.
- **Textos en tubos:** `TEXT`, `MTEXT` y `ATTRIB` conservan su pasada y límite independientes del de la geometría; las etiquetas `4S 3000` y `P6 3000` no se sacrifican para dibujar cotas o sombreados. Persistencia, referencias, SNAP y MOVE/ROTATE no cambian.
- **Pruebas de regresión:** un plano con `DIMENSION`, `HATCH`, tubos con rótulos y líneas tardías; además, 25 `INSERT` de varios segmentos bajo un límite de prueba que exige representar todos los bloques antes de ampliar su detalle.

**Limitaciones y comprobación pendiente:** las cotas y los sombreados se omiten **intencionadamente** en importaciones DWG/DXF de la interfaz. Los XREF sin contenido embebido siguen sin reconstruirse. Si la geometría constructiva supera los 240.000 segmentos la importación sigue siendo parcial y el aviso debe respetarse; no es un archivo de fabricación verificado. Falta importar y contrastar visualmente `CUNAS_MEDIR 1.dwg` en Firefox y Chrome.

---

## v0.1.123 — 2026-11-12

### Etiquetas de texto DWG/DXF en tubos, cerchas y bloques

- **TEXT / MTEXT / ATTRIB:** importar y mostrar los textos originales de AutoCAD, incluidos los atributos asociados a bloques INSERT y los rótulos de piezas dentro de tubos y cerchas (por ejemplo **4S 3000** y **P6 3000**), sin necesidad de XREF, cotas, rellenos de HATCH o entidades proxy.
- **Transformaciones y estilos:** conservar texto, color ByLayer/ByBlock, capa, altura DXF grupo 40, rotación 50 o vector director de MTEXT, alineación horizontal y vertical y transformaciones de INSERT anidados. Decodificar escapes AutoCAD, saltos de línea MTEXT y símbolos frecuentes.
- **Importación en pase independiente:** el presupuesto de 240.000 segmentos de geometría no elimina las etiquetas: los textos se procesan por separado en el Web Worker (tope de seguridad 15.000 etiquetas). Los ATTRIB invisibles y ATTDEF variables no se duplican visualmente; solo ATTDEF constantes pueden representarse sin valor de instancia.
- **Renderizado eficiente:** cada cadena idéntica reutiliza una textura de Canvas y se representa con `THREE.InstancedMesh` por capa, evitando convertir miles de letras en líneas o crear un WebGL draw call por carácter. Los puntos auxiliares de transformación de textos quedan ocultos y excluidos de SNAP/selección.
- **Persistencia y edición:** `.flproject` almacena el texto y los IDs de tres puntos de referencia CAD por rótulo, manteniendo la compatibilidad con proyectos anteriores. MOVE/ROTATE de la referencia, COPYBASE y Ctrl+copiar trasladan también sus textos; Undo/Redo de copias los restaura y eliminar la referencia elimina sus etiquetas.
- **Pruebas:** bloques anidados con TEXT, MTEXT y ATTRIB, rotación y escala, codificación y multilinea, presupuesto independiente de la geometría, texturas instanciadas, movimiento de anclajes, visibilidad por capa y restauración.

**Limitación:** el visor usa tipografía sans-serif estándar; SHX, fuentes personalizadas y formato enriquecido MTEXT no se reproducen de forma idéntica a AutoCAD. XREF, DIMENSION, HATCH complejo y proxies quedan fuera de este alcance. La prueba visual con `CUNAS_MEDIR 1.dwg` en Firefox sigue pendiente.

---

## v0.1.122 — 2026-11-12

### Recuperar bloques DWG ausentes y corregir posiciones de cotas sin bloquear Firefox

- **Causa:** el límite de 80 000 segmentos de la v0.1.120/121 detenía por completo la lectura de ENTITIES en cuanto un INSERT/MINSERT inicial consumía la capacidad. El resultado podía mostrar una pequeña porción del plano y omitir cerchas, diagonales y bloques posteriores.
- **Presupuesto de geometría distribuido:** la primera pasada reserva una cuota de segmentos para CADA entidad lógica principal del DXF; la segunda vuelve a expandir únicamente el detalle restante de los bloques que excedan su cuota. Las polilíneas antiguas `POLYLINE/VERTEX/SEQEND` se agrupan para mantener sus puntos. Así no desaparecen los bloques posteriores por el orden del archivo. El límite total seguro aumenta de 80 000 a **240 000 segmentos**.
- **Importación parcial identificada:** si incluso ese límite resulta insuficiente, el aviso indica expresamente cuántas entidades principales conservan detalles sin incorporar. Es una representación parcial y **no debe emplearse como plano completo de fabricación**.
- **Referencias externas XREF:** se interpretan los indicadores de bloque DXF (flags 4/8, ruta 1). Cuando falta el contenido de una referencia externa, el informe muestra la ruta/nombre del DWG requerido. También se indican referencias INSERT sin definición de BLOCK. Las referencias externas no embebidas requieren importar o aportar los archivos de origen, no pueden recrearse sin ellos.
- **Cotas DIMENSION:** corregida la transformación de los bloques anónimos de cotas. DXF grupo 10 es el punto de definición, no su traslación: se usa grupo 12 cuando existe; de lo contrario la geometría del bloque se mantiene en sus coordenadas. Evita piezas de cotas separadas artificialmente del resto del plano.
- **Puntos CAD:** los marcadores de POINT dentro de referencias DWG usan 3 px en lugar de cuadrados de 8 px en vista general; los puntos siguen siendo referencias SNAP y se resaltan al seleccionarlos.
- **Rendimiento:** se registran 1 800 segmentos por lote, sin bloquear la interfaz; el árbol INSTANCIAS deja de recorrer cientos de miles de líneas cada 250 ms gracias a un caché por revisión y suspende su actualización durante importación. Se conservan GPU batches y SNAP espacial de la v0.1.121.
- **Pruebas:** MINSERT que excede la capacidad antes de otras referencias; verifica cobertura de bloques tardíos, integridad de geometría, detección de XREF y definiciones BLOCK ausentes, DIMENSION sin desplazamiento erróneo y límites de segmentos configurables solo para tests.

**Verificación pendiente:** importar `CUNAS_MEDIR 1.dwg` original en Firefox para confirmar visualmente todos los perfiles. El conversor DWG binario está en el navegador/WASM; las pruebas automatizadas de este PR operan sobre DXF reproducibles. Textos, rellenos complejos y entidades proxy siguen sin reproducción completa.

---

## v0.1.121 — 2026-11-12

### Importación de DWG grandes: árbol de instancias compacto y SNAP espacial

- **Causa del bloqueo posterior a la importación:** el sistema clásico de intersecciones SNAP comparaba cada pareja de líneas CAD: un DWG de 80 000 líneas generaba hasta 3 199 960 000 comparaciones por evento del ratón. El panel INSTANCIAS también serializaba y reconstruía una fila DOM por cada segmento cada 250 ms.
- **Árbol de instancias:** las líneas y puntos que pertenecen a una referencia DWG/DXF ya no se repiten en ENTIDADES CAD. La referencia completa sigue disponible como una única entrada en REFERENCIAS CAD, con sus capas, visibilidad y selección; ENTIDADES CAD queda reservado para líneas/puntos CAD editables independientes y desaparece si no hay ninguno.
- **SNAP exacto con índice espacial:** nueva rejilla de segmentos proyectados en pantalla, compartida por el sistema tradicional de SNAP (extremo, medio e intersección) y por GeometryQueryEngine. Se consultan únicamente las líneas próximas al cursor y las intersecciones se limitan a un máximo de 96 candidatos. Las coordenadas de los SNAP siguen siendo las originales del modelo, no aproximaciones gráficas.
- **Caché de precisión:** el índice se reutiliza entre consultas y se invalida al registrar, modificar, mover, rotar o borrar geometría, cambiar la cámara o modificar el tamaño del viewport.
- **Protección durante importación:** se suspende temporalmente la búsqueda de SNAP mientras se registran los lotes de 900 segmentos de DWG/DXF, evitando regenerar el índice en cada lote y que el ratón bloquee la página.
- **Compatibilidad:** SNAP de DWG y CAD nativo, selección del bloque, geometría interna bloqueada, colores, posicionamiento, historial y persistencia permanecen disponibles.
- **Pruebas:** 40 000 segmentos y dos líneas cercanas, actualización de caché tras cambio de geometría/cámara, SNAP de línea larga atravesando el cursor, y verificación de que 34 200 líneas importadas quedan como un bloque sin 34 200 filas en el árbol. Incluidas en `npm run test:camera`.

**Pendiente de comprobación manual:** velocidad de registro y respuesta de SNAP con `CUNAS_MEDIR 1.dwg` en Firefox; las pruebas automatizadas usan geometría CAD sintética.

---

## v0.1.120 — 2026-11-12

### Corrección de bloqueos al abrir DWG con muchos INSERT y segmentos

- **Causa:** la v0.1.119 podía expandir hasta 600 000 segmentos de bloques anidados y crear un objeto `THREE.Line` por cada segmento, saturando el hilo principal y la GPU. El DWG `CUNAS_MEDIR 1.dwg` (3,3 MB) tardaba minutos y bloqueaba la pestaña.
- **Importación en segundo plano:** la conversión `DWG→DXF` WASM y el análisis/expansión de bloques ahora se ejecutan dentro de un Web Worker, permitiendo que la interfaz siga respondiendo durante el análisis. La memoria del conversor se libera al terminar el Worker.
- **Registro progresivo:** las líneas y puntos se registran en lotes de 900, cediendo el control al navegador entre lotes y mostrando un indicador de progreso. No se llaman `scene.sync()` ni se crean objetos WebGL por segmento durante el registro.
- **Renderizado GPU agrupado:** todas las líneas importadas se mantienen como entidades CAD exactas (selección por referencia, snaps, COPYBASE, MOVE/ROTATE, historial y guardado) pero se dibujan mediante `THREE.LineSegments` **una vez por subcapa CAD**, conservando colores ByLayer/ByBlock. Las líneas CAD nativas editables conservan sus objetos individuales. Se usan coordenadas locales por lote para mantener precisión con coordenadas DWG grandes.
- **Protección ante explosión combinatoria:** los INSERT/MINSERT anidados dejan de expandirse al alcanzar **80 000 segmentos**, en lugar de crear cientos de miles de objetos y congelar el navegador. Si se alcanza ese límite, el aviso de importación identifica expresamente el dibujo como **parcial**. No se ocultan silenciosamente entidades recortadas.
- **Pruebas:** 12 000 segmentos importados en dos subcapas producen solo dos draw calls GPU (más entidades nativas), comprobación de colores, selección, visibilidad, actualización de geometría y límites, y test de INSERT 128×128 que se detiene antes de producir cientos de miles de segmentos. Incluidas en `test:dwg-import`.

**Pendiente de comprobación manual:** reimportar `CUNAS_MEDIR 1.dwg` en Firefox con la v0.1.120, revisar que no se bloquee y comparar detalles/colores contra AutoCAD. Si el dibujo supera los 80 000 segmentos, la app mostrará la advertencia de importación parcial.

---

## v0.1.119 — 2026-11-12

### Importación de bloques DWG/DXF, colores AutoCAD y unidades correctas

- **Bloques INSERT:** el importador DXF (también utilizado después de convertir DWG por WASM) ahora lee definiciones de la sección BLOCKS y expande INSERT anidados en la sección ENTITIES, aplicando correctamente punto base, traslación, rotación, escalas X/Y/Z y arrays de bloques MINSERT. Evita recursión circular y profundidad excesiva. DIMENSION expande también los bloques anónimos de representación gráfica si están presentes.
- **Colores originales:** lectura de tabla de capas LAYER, color ACI 62, RGB truecolor 420, propiedades ByLayer (256), ByBlock (0), y visibilidad de capas. Las líneas del mismo bloque con distinto color se guardan en subcapas CAD separadas, manteniendo el bloque de referencia seleccionado como una unidad. El renderizador CAD deja de imponer blanco/gris fijo para líneas y puntos.
- **Geometría adicional:** reconstrucción de bulges de LWPOLYLINE, contornos SOLID/TRACE/3DFACE, aproximación de SPLINE por puntos disponibles y contornos de HATCH polilínea. Los bloques no se eliminan silenciosamente: el resumen de importación indica cuántos INSERT/DIMENSION fueron expandidos y desglosa tipos aún sin representación.
- **Unidades críticas:** la escala de INSERT y toda la geometría de DWG/DXF se almacena en milímetros, que son las unidades canónicas de FrameLogic. Antes se convertían a metros (1/1000), lo que alteraba tanto medidas como escala aparente. No se altera retroactivamente la geometría de proyectos existentes: para recuperar la escala original, reimportar el DWG en esta versión.
- **Limitaciones conocidas:** geometría de bloque se conserva visualmente dentro de una referencia global (no como ensambles jerárquicos CAD editables). TEXT/MTEXT, atributos de texto, rellenos de HATCH, geometría avanzada de ACAD_PROXY_ENTITY, imágenes y precisión NURBS aún no tienen equivalencia completa de renderizado; se notifican en el resumen de entidades omitidas. Los colores por índice ACI 10–255 tienen conversión aproximada.
- **Pruebas:** DXF con bloques anidados, dimensiones anónimas, base+rotación+escala, MINSERT, colores ByLayer/ByBlock/truecolor, renderización de líneas, bucles HATCH, bulges, ciclos de bloques y unidad 226 000 mm. Se incorpora `npm run test:dwg-import` a CI.

---

## v0.1.118 — 2026-11-12

### Zoom de cámara para DWG de gran tamaño y Zoom Extents exacto

- **DWG de 226 000 mm o más:** corregido el tope de zoom-out en Model Space. El zoom ortográfico mínimo deja de limitarse a `0.0001` y ahora permite alejarse hasta `1e-8` sin modificar la escala de inicio de 5 000 mm ni afectar el zoom cercano.
- **Zoom Extents (Z → E):** la cámara calcula el tamaño proyectado real del rectángulo envolvente de la geometría visible en la orientación actual y la relación ancho/alto del viewport. Ajusta automáticamente los límites de alejamiento cuando el dibujo los supera; centra el modelo y encuadra todos los extremos con margen sin depender del `fitToBox` limitado por un zoom mínimo fijo.
- **Vista perspectiva:** si el visor tiene un `maxDistance` finito, se amplía únicamente cuando el volumen de geometría necesita más distancia para caber.
- **Compatibilidad:** conserva el punto de inspección y la orientación del usuario, la navegación CAD y las distancias en milímetros; se siguen respetando los límites de clipping dinámicos de la cámara.
- **Pruebas:** casos automatizados de un segmento DWG de 226 000 mm, viewport estrecho, dibujo lejos del origen, vista inclinada 3D, navegación cercana y distancia perspectiva. Incorporados a `npm run test:camera`.

**Archivo de reproducción:** `CUNAS_MEDIR 1.dwg` (AutoCAD DWG 2010/2011/2012, aprox. 3,2 MB). La geometría se validó con un fixture de 226 000 mm; no se ha automatizado la importación completa del DWG binario original en el navegador.

---

## v0.1.117 — 2026-11-12

### Primera opción preseleccionada y Enter en comandos CAD de varias opciones

- **Regla común:** los menús CAD que piden elegir entre varias acciones muestran visualmente la primera opción habilitada como selección predeterminada. Enter acepta esa opción sin otro clic, las flechas y Tab/Shift+Tab cambian la opción destacada sin ejecutarla, y el clic sobre otro botón sigue funcionando. Las opciones deshabilitadas no se seleccionan.
- **CÍRCULO:** al indicar el centro, Radio aparece resaltado de forma visible; Enter confirma Radio y abre su entrada de valor, sin escribir R ni hacer clic en el menú. D selecciona Diámetro. Si se hace clic directamente en el segundo SNAP, se usa el tamaño seleccionado: radio si está seleccionado Radio, mitad de la distancia si está seleccionado Diámetro. La visualización y los puntos SNAP/WorkPlane se conservan.
- **PEDIT:** al abrir el menú de operaciones de edición de polilíneas, **Mover vértice** es la primera acción preseleccionada y Enter la inicia. Flechas o Tab alternan entre Añadir vértice, Eliminar vértice, Abrir/Cerrar, Invertir, Separar tramo y Salir, respetando el orden visible. Cada vez que vuelve el menú se restablece la primera acción.
- **Activación textual:** E/PEDIT/EDITAR POLILÍNEA se ejecuta solo cuando se presiona Enter en el buffer de comandos, como C/CÍRCULO y L/LINE. El botón PEDIT existente sigue iniciando directamente. Los menús de ejes cuyo valor ya fue elegido por el usuario (por ejemplo ROTATE X/Y/Z) conservan esa elección, sin forzar el primer eje.
- **Pruebas:** selección predeterminada visible, Enter, flechas, Tab/Shift+Tab, bloqueo de opciones deshabilitadas, CÍRCULO, PEDIT y comandos escritos. Incluidas en la suite `test:gizmos`.

---

## v0.1.116 — 2026-11-12

### Recuperación de proyectos DWG, comandos CAD, círculo avanzado y edición numérica

- **Corrección crítica de .flproject:** al abrir proyectos con capas DWG/DXF bloqueadas, restaurar primero sus puntos y líneas en un bloque transaccional con desbloqueo temporal y `finally` que repone exactamente los bloqueos. Evita `Cannot create CAD line. Layer "CAD cad1 · 0" is locked`. Prueba con fixture de dos referencias y geometría, basada en el archivo proporcionado por el usuario.
- **Selección DWG/DXF estable:** el selector rectangular identifica el clic sobre líneas de referencias bloqueadas como clic sobre entidad, no como primera esquina de ventana vacía. Evita que una selección inmediata se convierta en ventana y desaparezca.
- **Comandos de texto:** `C`/`CÍRCULO`/`CIRCLE` + Enter ejecutan la herramienta de círculo. `COPY`/`COPYBASE`/`COPIAR`/`CP` conservan copia por punto base y destino; `P`/`PUNTO` y `T`/`TRIM` incorporan entrada de comando. Los comandos escritos no se ejecutan hasta Enter; los botones siguen iniciando directamente.
- **Círculo Radio/Diámetro:** Radio es la opción predeterminada y Enter la confirma sin teclear R; también permite elegir directamente el siguiente SNAP como radio. El tamaño se muestra en vivo junto al cursor. Con WorkPlane activo, los puntos seleccionados deben estar en el plano; con WorkPlane OFF se admite centro 3D y radio SNAP 3D, orientando el plano de la circunferencia.
- **Círculos como entidades CAD:** detección y selección por clic sobre la circunferencia, SNAP de centro y cuatro cuadrantes cardinales, cuatro grips de radio editables con arrastre, cota temporal de radio/diámetro/perímetro, Undo/Redo y respeto de visibilidad/bloqueo. No se convierte el círculo en 128 líneas CAD independientes.
- **Interacción y entrada dinámica:** en LINE/PUNTO/TRIM el texto contextual acompaña el puntero; CÍRCULO muestra tamaño y RECTÁNGULO muestra ancho/alto mientras se previsualizan. En la entrada numérica de RECTÁNGULO, Tab y Shift+Tab alternan solo X/Y, sin llevar el foco a botones del Model Space.
- **Pruebas de regresión:** restauración de .flproject con dos referencias bloqueadas, diferencia CIRCLE/COPY, centro y cuadrantes, plano activo/libre, edición del radio, menú predeterminado y Tab en X/Y. Se incorpora la suite de geometría de círculo al flujo `test:gizmos` y la prueba de proyecto al comando `test:project-locked-dwg`.

---

## v0.1.115 — 2026-11-11

### LINE desde SNAP DWG, cotas automáticas de líneas internas y selección por ventana de referencias

- **LINE desde DWG/DXF:** el bloque de referencia deja de capturar `pointerdown/pointerup` durante el comando LINE. Así el capturador del trazado recibe el clic y puede iniciar o continuar una línea desde el SNAP geométrico exacto (extremo, punto medio, intersección) de la referencia bloqueada.
- **Cotas informativas automáticas:** un clic sobre una línea de un bloque DWG/DXF selecciona la referencia completa, recuerda el miembro señalado y muestra su longitud real mediante el sistema existente de cotas temporales. La geometría interna sigue bloqueada y la cota se oculta durante MOVE/ROTATE y cuando se pierde la selección.
- **Selección rectangular:** ventana izquierda→derecha selecciona la referencia entera si contiene toda su geometría visible; captura derecha→izquierda selecciona la referencia entera si cruza al menos un segmento o incluye uno de sus puntos. Las capas CAD de referencia bloqueadas siguen participando en la detección geométrica sin que sus líneas se conviertan en seleccionables individualmente.
- **Compatibilidad:** respetar visibilidad de capas, selección REPLACE/ADD/REMOVE, piezas y CAD nativo. No alterar MOVE, ROTATE, COPYBASE, snaps del bloque ni su integridad.
- **Pruebas:** secuencias de eventos LINE sobre referencia, selección por ventana/crossing de bloques bloqueados y ocultos, medida temporal de la línea inspeccionada y regresiones de gizmos.

---

## v0.1.114 — 2026-11-11

### MOVE DWG/DXF: clic corto en eje y elección de SNAP sin reselección

- **Causa del fallo:** la selección por ventana interpretaba un clic del gizmo DWG/DXF como clic en espacio vacío porque su ventana de selección no conocía la propiedad del puntero de la referencia. Además, cuando Three.js no emitía el cierre nativo de `TransformControls`, `CadReferenceBlockController` no armaba el eje, y un destino sin SNAP válido dejaba pasar el evento a los selectores CAD/3D.
- **Corrección de eventos:** se identifica el eje/plano X/Y/Z/XY/XZ/YZ mediante raycast sobre los pickers originales de `TransformControls` al presionar el puntero. En `pointerup`, el controlador DWG finaliza el gesto nativo si corresponde, consume el evento reservado y habilita el siguiente SNAP, incluso si el navegador no entregó el evento `mouseUp`. Se diferencia el clic corto (hasta 5 px) del arrastre y se revierte un desplazamiento accidental inferior al umbral antes de confirmar historia.
- **Selección protegida:** `CadWindowSelectionController` deja de iniciar una ventana de selección mientras el gizmo DWG/DXF está activo. Los clics para SNAP inválidos se consumen y conservan armado el eje sin mover geometría.
- **Compatibilidad:** se conserva el centro/punto base mediante SNAP, ROTATE y su doble clic de 90°, la copia Ctrl+eje, las referencias con planos inclinados y el historial. Para el gizmo de selección mixta, los SNAP de los propios elementos siguen disponibles al esperar destino, y el modo repetido de copia no se cancela por desplazamiento cero.
- **Pruebas agregadas:** secuencias pointerdown→pointerup→SNAP para los seis ejes/planos, selección conservada, ausencia de movimiento hasta SNAP, Ctrl+copia repetida, Undo/Redo, SNAP inválido, propagación entre controladores y finalización nativa; raycast con cámaras perspectiva y ortográfica inclinada. Se mantienen los comandos de regresión `test:gizmos` y `test:copybase` en CI.
- **Limitaciones pendientes:** la simulación de eventos y las pruebas automatizadas no sustituyen una prueba manual sobre DWG/DXF real en Firefox y Chrome. Deben verificarse interacciones gráficas con líneas sueltas, ensambles, selección mixta, COPYBASE, proyectos guardados y publicación Cloudflare Pages antes de declarar la mejora visualmente validada.

---

## v0.1.113 — 2026-11-10

### MOVE y COPYBASE unificados para selecciones mixtas CAD + 3D

- **MOVE con un único gizmo:** se amplía `CadMixedMoveController` para incluir referencias DWG/DXF completas junto con las piezas 3D, líneas y puntos CAD nativos, y para atender también líneas y puntos CAD sueltos individuales mediante las mismas reglas de eje+SNAP, punto base y Ctrl+copia. Las referencias mantienen su identidad por capas CAD; se capturan todas sus líneas y puntos, incluso en capas ocultas/bloqueadas. El desplazamiento numérico y los gestos de eje+SNAP aplican un único delta y una sola acción Undo/Redo a la selección completa.
- **COPYBASE mixto:** ya no se da prioridad excluyente a las piezas 3D o referencias DWG. Una selección como línea CAD + pieza 3D (o varias piezas, puntos, polilíneas y referencias DWG) se captura como conjunto; se elige un punto base y otro de destino para crear copias independientes sin alterar los originales.
- **Una transacción de copia:** `UnifiedCadCopyTransaction` reutiliza la copia jerárquica de piezas/ensambles y la copia de referencias DWG con ID/capas propios, añade líneas, puntos y polilíneas nativas y reúne todo en **una entrada Undo/Redo**. Si algún componente falla, revierte las copias parciales, sin mover los originales.
- **Ctrl + eje del gizmo mixto:** dos operaciones compartidas con COPYBASE: clic en un eje y luego en SNAP para crear copias sucesivas manteniendo el conjunto original seleccionado, o Ctrl+arrastrar para crear una copia al soltar. Los clics de destino no se entregan a otros selectores mientras espera un SNAP.
- **Protección de duplicados:** una línea seleccionada a la vez individualmente y como parte de un DWG completo se copia solo dentro del nuevo bloque. Las polilíneas conservan sus segmentos, dirección y cierre.
- **Selección:** la selección con Ctrl puede combinar piezas, CAD suelto y DWG; los giros ROTATE mixtos y otras herramientas no incluidas en MOVE/COPYBASE conservan su funcionamiento anterior.
- **Pruebas:** COPY mixto de pieza, línea, punto, DWG, Undo/Redo común, conservación de polilíneas y de originales, fallo con reversión; MOVE numérico mixto con referencia DWG bloqueada y Ctrl+eje+SNAP repetido.
- **Pendiente:** verificación visual en navegador con un modelo mixto real, Snap en geometrías importadas complejas, y confirmación de Cloudflare Pages tras el merge.

---

## v0.1.112 — 2026-11-10

### DWG/DXF — MOVE eje + SNAP, Ctrl+eje copia independiente y COPYBASE por 2 puntos

- **MOVE por eje y SNAP:** se mantiene la secuencia seleccionar referencia DWG/DXF → M → clic corto en eje X/Y/Z o plano → clic en SNAP destino. Se elimina el conflicto del indicador de puntero activo de la interacción anterior, para no descartar el clic de destino cuando los eventos de `TransformControls` llegan en órdenes distintos. El delta se restringe al eje/plano seleccionado, se mueve la referencia completa y se registra Undo/Redo.
- **Ctrl + eje + SNAP:** presionar Ctrl al iniciar el gesto sobre un eje de MOVE activa copia de referencia completa en lugar de trasladar el original. La primera y siguientes elecciones de SNAP crean copias independientes conservando siempre el DWG y el punto base originales; Esc termina el modo de copias repetidas y deja activo el gizmo MOVE.
- **Ctrl + arrastre de eje:** soltar el eje arrastrado con Ctrl crea una copia en la posición desplazada, conservando el original y restaurando su pivote, sin aplicar cambios a sus entidades.
- **Copias realmente independientes:** cada DWG/DXF copiado recibe nuevas capas `CAD Nombre copia N · capa` y nuevos ID de líneas/puntos, con color, visibilidad, bloqueo y snaps heredados de la referencia original. No se duplican solamente las líneas visibles ni se mezclan capas de origen y copia.
- **COPYBASE:** seleccionar una referencia DWG/DXF completa, escribir COPYBASE (o COPY/COPIAR, o botón COPIAR), elegir punto base y SNAP destino crea una nueva referencia con desplazamiento exacto. El controlador de selección DWG queda temporalmente inactivo para no interceptar el flujo de dos puntos. Funciona también con referencias múltiples seleccionadas. El comando sigue admitiendo piezas 3D, ensambles y líneas CAD.
- **Undo/Redo y robustez:** cada copia es una transacción reversible con los mismos ID al rehacer; fallos intermedios eliminan sus geometrías y capas parciales. El comando rechaza traslaciones inválidas o referencias inexistentes sin mover los originales.
- **Pruebas:** copia completa de múltiples capas y puntos, repetición con nombres únicos, Undo/Redo, preservación de original, Ctrl+eje, Ctrl+arrastre, SNAP inválido, comando COPYBASE textual y su paso por el controlador de copia.
- **Validación manual pendiente:** confirmar picking de eje y SNAP contra archivos DWG/DXF reales en navegador y que la compilación llegue a Cloudflare Pages.

---

## v0.1.111 — 2026-11-10

### Gizmo DWG — centro seleccionable en MOVE y ROTATE, doble clic +90° fiable

- **Centro de giro visible:** al activar R sobre una referencia DWG/DXF aparece un pequeño botón central amarillo, siempre situado sobre el pivote proyectado. Un clic sobre él arma la elección de un SNAP como nuevo centro de rotación, sin mover el plano. El mismo control está disponible para el punto base de MOVE con M.
- **No se confunde con un clic al modelo:** el centro es un control independiente sobre el lienzo 3D con gestión propia de eventos, no depende de que TransformControls detecte el eje XYZ. Arrastrar el botón modifica únicamente el centro del gizmo; no modifica las líneas del DWG.
- **Doble clic +90° robusto:** el gestor DWG reconoce dos clics cortos consecutivos sobre el mismo anillo X/Y/Z a partir de eventos pointerup o del propio TransformControls. No depende exclusivamente del evento nativo dblclick; identifica el anillo con raycasting sobre los pickers del gizmo y conserva el fallback de eje seleccionado. La acción se ejecuta una sola vez, después de terminar la interacción del ratón.
- **Sin reselección del plano:** mientras el gizmo está activo, los clics del lienzo no vuelven a seleccionar el DWG ni cancelan la secuencia; los eventos de puntero se escuchan en fase de captura antes de la selección general.
- **SNAP para ambos modos:** el motor de SNAP está habilitado mientras estén activos MOVE o ROTATE de una referencia DWG. Después de hacer clic sobre el centro amarillo, un clic sobre ENDPOINT/CENTER/MIDPOINT/POINT válido cambia el pivote sin crear historial, y los giros siguientes usan ese nuevo centro.
- **Pruebas de regresión:** controlador del botón real con eventos puntero, click/drag/cancelación, doble clic sin evento nativo, selección conservada, cambios de punto base y movimiento restringido con Undo/Redo. No se altera la geometría interna ni la estructura de referencia CAD.
- **Pendiente:** verificar visualmente el gesto sobre los anillos con un DWG real y el despliegue en Cloudflare; los tests DOM y de lógica no reemplazan la prueba de navegador completa.

---

## v0.1.110 — 2026-11-10

### DWG/DXF — doble clic ROTATE y punto base MOVE con SNAP

- **Giro de +90° por doble clic:** se corrigió el conflicto de eventos entre TransformControls y la selección de referencias DWG. Un clic sobre un anillo ya no se interpreta al soltar como una nueva selección del plano que desactiva el gizmo y borra el estado del doble clic. El doble clic corto en el mismo aro X/Y/Z invoca una sola rotación numérica de +90°; los arrastres y cambios de eje continúan excluidos.
- **Punto base móvil:** el centro XYZ del gizmo MOVE se comporta como en piezas 3D: clic corto para armar la elección del punto base, seguido de clic sobre SNAP para mover solo el pivote sin modificar las entidades DWG. Arrastrar el centro mueve el pivote libremente, sin mover el dibujo.
- **Mover el DWG con SNAP:** tras establecer el punto base, clic corto sobre un eje del gizmo (X/Y/Z/XY/XZ/YZ) y clic en un SNAP de destino traslada todo el DWG en el eje o plano indicado. Los SNAP son suministrados por el motor unificado CAD/3D y el estado de las líneas y puntos se registra para Undo/Redo. El DWG conserva su identidad de bloque.
- **Protección de selección:** los eventos del gizmo o de la búsqueda de SNAP no vuelven a seleccionar entidades, no desactivan el gizmo y no disparan movimientos accidentales de la referencia.
- **Pruebas de regresión:** doble clic con evento pointerup sobre dibujo, selección intacta, reubicar solamente el pivote, mover con corrección restringida al eje, Undo/Redo y destino SNAP inexistente.
- **Límites:** si no hay un SNAP detectable, el gizmo continúa esperando uno; Esc cancela la interacción. La selección de referencia y la visualización del badge permanecen sin cambios. Es necesaria la comprobación de interacción manual en navegador con archivos DWG reales.

---

## v0.1.109 — 2026-11-10

### ROTATE CAD — DWG/DXF completos y líneas/puntos

- **DWG/DXF como bloque:** el gizmo ROTATE de una referencia importada ahora dispone del panel numérico X/Y/Z y aplica ángulos exactos al bloque de líneas y puntos, sin editar individualmente sus entidades internas. Dos clics cortos sobre el mismo anillo del gizmo aplican +90°, evitando cambios accidentales de eje y arrastres.
- **Entidades CAD nativas:** seleccionar una o varias líneas/puntos y pulsar R activa un nuevo gizmo de rotación con el mismo panel en grados. También funciona con la acción programática ROTATE. No requiere seleccionar una PieceInstance 3D.
- **Geometría y Undo/Redo:** cada transformación CAD rota extremos y puntos sobre un pivote común y registra el antes/después como una operación reversible; también se registran las rotaciones por arrastre de referencias DWG/DXF. No cambia los datos de piezas 3D ni el STEP importado.
- **Compatibilidad:** una selección mixta de piezas 3D y entidades CAD requiere separar la selección antes de ROTATE. Las referencias DWG se siguen tratando como bloque.
- **Pruebas:** giros de ±90°, grados decimales, geometría y posición recuperadas con Undo/Redo y rechazo de entradas no finitas para líneas y bloques CAD. Se incorporan al conjunto `test:gizmos`.
- **Pendiente:** validación manual con interacción del puntero sobre el gizmo en un navegador y conjuntos CAD complejos.

---

## v0.1.108 — 2026-11-10

### ROTATE — entrada de ángulo exacto y doble clic en ejes X/Y/Z

- **Ángulo numérico accesible:** al ejecutar `ROTATE` (tecla R o comando correspondiente), el panel inferior se abre directamente con eje seleccionable X/Y/Z, campo numérico en grados y botón «Girar». El usuario puede introducir valores enteros, decimales y negativos, por ejemplo 22,5°, 90° o -45°. La operación aplica un delta exacto mediante cuaterniones al conjunto seleccionado alrededor del pivote y registra Undo/Redo.
- **Doble clic sobre el aro del gizmo:** dos clics cortos en el mismo aro X, Y o Z aplican **+90°** sobre ese eje. No se interpretan como giro los dobles clics sobre dos ejes distintos, separados en pantalla, fuera del anillo o precedidos de arrastre.
- **Interacción segura:** el campo de grados no roba el foco mientras se arrastra el gizmo; el doble clic válido detiene el manejador de doble clic sobre fondo vacío para que ROTATE no se cancele accidentalmente. La selección, el desplazamiento del centro de giro y la lógica de bloqueo se mantienen.
- **Orientación:** el gizmo ROTATE conserva los ejes globales X/Y/Z actualmente implementados, incluso para piezas con orientación propia; esta versión no introduce un modo ROTATE local diferente al comportamiento ya existente.
- **Pruebas:** clasificación de doble clic en aro, rechazo por ejes distintos, retardo y arrastre; integración de rotaciones numéricas y de 90° con ensamble seleccionado y Undo/Redo. CI `test:gizmos`.
- **Por verificar en navegador:** interacción real con el picking de Three.js y control de superposición visual en pantallas pequeñas.

---

## v0.1.107 — 2026-11-10

### Corrección de importación DWG en Cloudflare Pages

- **Fallo detectado:** la importación dinámica de `dwgdxf` buscaba `/assets/wasm/dwgdxf.js` pero esa dependencia generada por WASM no se estaba publicando con el sitio. No significa que el DWG del usuario esté dañado.
- **Runtime autocontenido:** al ejecutar `npm run dev` o `npm run build` del workspace web, un paso previo copia desde el paquete `dwgdxf@2.0.1` los archivos `dwgdxf.js` y `dwgdxf_bg.wasm` a `apps/web/public/assets/wasm`, y Vite los publica en `dist/assets/wasm`.
- **URL explícita:** el convertidor utiliza `init({ wasmBase: <origen>/assets/wasm/ })` para cargar el JavaScript y el WASM desde la propia aplicación, sin depender de otra API ni CDN; el DWG se procesa localmente en el navegador.
- **Diagnóstico claro:** si el runtime falla, el error ahora identifica la URL del recurso y recomienda recargar la página. No altera referencias CAD, SNAP ni los archivos STEP.
- **Verificación automática:** prueba de sincronización byte a byte de los dos recursos en `test:dwg` y comprobación obligatoria de ambos archivos en la compilación de Cloudflare Pages.
- **Compatibilidad del archivo de prueba:** `cad1.dwg` adjunto tiene cabecera `AC1032` (DWG AutoCAD 2018), que la versión instalada de `dwgdxf` declara admitir. Es necesario comprobar la geometría/entidades reales en el navegador después de desplegar.

---

## v0.1.106 — 2026-11-10

### Guardar proyecto — elegir ubicación, nombre y confirmar reemplazos

- **Diálogo Guardar como:** al pulsar ARCHIVO → Guardar proyecto se abre el selector nativo del navegador compatible (File System Access API, por ejemplo Chrome/Edge sobre HTTPS). El usuario elige carpeta y nombre del archivo `.flproject`, sin una pregunta de nombre separada.
- **Protección contra sobrescritura:** además de la confirmación del diálogo nativo al escoger un archivo existente, FrameLogic pide confirmación expresa antes de abrir un flujo de escritura si el destino ya contiene datos. Al rechazar, cancelar o cerrar el diálogo no se reemplaza el archivo y no se modifica el modelo.
- **Nombre coherente:** el nombre del archivo seleccionado se utiliza también en el paquete del proyecto, y se recuerda en esta sesión para el próximo Guardar. Al abrir un proyecto existente, se conserva su nombre como sugerencia del siguiente guardado.
- **Compatibilidad:** en navegadores sin `showSaveFilePicker` se explica la limitación y se realiza la descarga tradicional; la elección de carpeta depende de la opción del navegador «Preguntar dónde guardar cada archivo». Una web no puede inspeccionar ni sobrescribir archivos locales arbitrarios en ese modo.
- **Seguridad de escritura:** si se produce un error, se intenta abortar el flujo de escritura y se muestra un mensaje. El formato de proyecto FRAMELOGIC_PROJECT v1 no cambia.
- **Pruebas:** selector y tipo de archivo, nuevo destino, archivo existente aprobado/rechazado, cancelación, incompatibilidad, error al escribir y nombres de proyecto.

---

## v0.1.105 — 2026-11-10

### Clash Detection — solo penetraciones volumétricas STEP B-rep

- **Contactos ignorados:** las caras apoyadas, aristas/vértices en contacto y piezas cercanas no se registran como interferencia. El filtro AABB exige superposición positiva en los tres ejes; una caja solapada por sí sola nunca constituye un Clash.
- **Booleana real:** para parejas con documentos STEP B-rep vivos se transforman copias de ambos TopoDS_Shape con las matrices de instancia y sus escalas a milímetros, sin mover las piezas originales. OpenCascade BRepAlgoAPI_Common calcula el sólido compartido.
- **Volumen geométrico:** se exige resultado B-rep con TopAbs_SOLID, sin errores de construcción y volumen positivo medido por BRepGProp, calculando además el centroide de la penetración. Umbral configurable de volumen mínimo en **mm³** (inicial 0,01 mm³), sin aumentar el fuzzy de la booleana.
- **Sin falsos positivos por incertidumbre:** geometría sin B-rep, intersecciones no válidas, errores del kernel o escalas incompatibles quedan como parejas **sin verificar**, nunca como Hard Clash. El panel presenta ese contador y exporta volumen a CSV/JSON; se conservan enfoque de cámara y resaltado temporal rojo.
- **Pruebas:** casos para contacto cara/cara, borde/vértice, separación, falsos candidatos AABB, volumen positivo, umbral, falta de B-rep, rotación, selección, jerarquías e invalidación. Test de integración adicional que ejecuta booleanas reales OCCT sobre dos sólidos cúbicos.
- **Alcance:** la precisión B-rep solo está disponible cuando ambas piezas tienen su documento STEP exacto aún cargado. No hay fallback con malla para diagnosticar penetración, ni persistencia de estados, PDF o MCP clash. Los casos sin verificar no prueban ausencia de interferencias; requieren revisión.
- **Validación pendiente:** comprobar en navegador con archivos STEP reales y ensambles grandes; los tests de coordinación usan un intersector simulado y el test de integración ejecuta geometrías primitivas B-rep de OCCT.

---

## v0.1.104 — 2026-11-10

### Clash Detection 3D — primera etapa de diagnóstico y revisión desde el navegador

- **Panel Clash Detection:** accesible desde el dock compartido de herramientas del espacio modelo, con análisis completo o por selección (incluidos ensambles y subensambles), tolerancia milimétrica, progreso, cancelación, búsqueda y filtros.
- **Motor preliminar por parejas:** broad-phase de AABB detalladas y sweep por eje X; narrow-phase de triángulos de detalle (nunca la malla LOW/WORK). No considera una coincidencia de AABB como choque confirmado.
- **Confirmación limitada de Hard Clash:** solo informa como confirmado un vértice estrictamente interior de una malla sólida cerrada respecto a otra malla cerrada; la ubicación mostrada es aproximada y no equivale al centroide del volumen de intersección.
- **Resultados explícitamente aproximados:** CONTACT y CLEARANCE son estimaciones de distancia de malla, y UNCONFIRMED identifica casos no resueltos. Las superficies abiertas, los mallados mayores que el límite de inspección y los cruces sin vértices interiores no se declaran Hard Clash confirmados.
- **Listado y localización:** ID estable por pareja de instancias, nombres/códigos de pieza, ruta de ensamble padre, estados de revisión en memoria, cámara enfocada con los controles existentes, materiales rojos temporales y marcador de ubicación estimada. Botón para restaurar cámara y visualización.
- **Vigencia:** firma del modelo para invalidar resultados cuando cambian piezas, transformaciones, definiciones o geometrías. No altera la jerarquía, la geometría ni el historial.
- **Exportación:** CSV y JSON con instancia A/B, clasificación, carácter confirmado/aproximado, estado, coordenadas y distancia estimada cuando existe.
- **Pruebas y CI:** cobertura unitaria de piezas separadas y superpuestas, contacto, clearance, falso positivo por AABB, rotación, jerarquía, selección, invalidación y cancelación, integrada en las validaciones de Pull Request.
- **Limitaciones expresas de esta etapa:** no existe aún intersección de sólidos B-rep con booleanas OpenCascade, cálculo del volumen de interferencia, distancia mínima exacta BVH, localización de la superficie de choque exacta, persistencia de estados en proyecto/localStorage, generación PDF, integración MCP o comparación industrial exhaustiva de mallas abiertas/no-manifold. Las revisiones duran solo la sesión actual. Se requieren verificaciones de compilación e integración antes de publicar en `main`.

---

## v0.1.103 — 2026-11-10

### Corrección Ctrl + gizmo: la copia se mueve y el ensamble original queda fijo

- **Transformaciones exclusivas de la copia:** al mantener Ctrl y mover el gizmo, el controlador posiciona los nuevos objetos a partir de la ubicación inicial de cada duplicado. Nunca aplica desplazamiento a objetos de las piezas originales.
- **Guardado seguro:** durante una copia, solo se persisten los transform de los nuevos ID de instancia, incluso si cambia la selección visual durante el arrastre o el clic sobre SNAP.
- **Consistencia visual y de dominio:** se conserva/restaura la posición y rotación inicial de las piezas del ensamble original al confirmar o cancelar la sesión.
- **Copias jerárquicas:** se mantienen todos los subensambles y sus IDs nuevos, con los assets y definiciones compartidos; el original permanece en sus coordenadas iniciales.
- **SNAP y copias repetidas:** el posicionamiento con Ctrl + eje y clic en SNAP mantiene el mismo origen para cada nueva copia, sin acumular desplazamientos.
- **Undo/Redo:** el historial conserva la copia como una sola operación reversible sin registrar un movimiento accidental del original.
- **Pruebas de regresión:** nuevas pruebas de integración de Ctrl + arrastre y Ctrl + eje/SNAP sobre ensambles con subensambles, además de pruebas de offsets absolutos y restauración ante cambios accidentales.

---

## v0.1.102 — 2026-11-10

### Automatización MCP y chat unificados para ensambles jerárquicos

- **Motor de comandos compartido:** los movimientos y las copias de ensambles usan una operación de dominio común, accesible por chat web y MCP mediante el despachador seguro existente. La interfaz sigue utilizando sus comandos CAD y el mismo historial Undo/Redo.
- **Identidad real del ensamble:** `get_selection_context`, `list_assemblies` y `select_assembly` reconocen la selección explícita del árbol INSTANCIAS, independientemente de la selección de piezas. Nunca deducen un ensamble únicamente por tener sus piezas seleccionadas.
- **Transacciones jerárquicas:** `prepare_assembly_operation` / `confirm_assembly_operation` permiten `move_assembly`, `copy_assembly` y `copy_assembly_array` con desplazamiento global XYZ en milímetros. Las copias conservan hijos y subensambles, pero reciben IDs nuevos y eliminan etiquetas de sincronización de copia vinculada.
- **Aprobación humana y seguridad:** preparación sin mutación, caducidad de 2 minutos, invalidación si el modelo o la selección cambian, confirmación de un solo uso, rechazo de ensambles bloqueados, validación de coordenadas, límite de 20 copias y cotas de 1000 piezas / 500 nodos por operación. Una acción confirmada crea un único paso Undo/Redo.
- **Chat integrado:** listar ensambles, consultar selección del árbol, y órdenes como «Mueve este ensamble 200 mm en X» o «Copia este ensamble 3 veces cada 1500 mm en X» con previsualización y botón de aprobación. Los ejes son globales porque el modelo de ensamble actual no define marco local propio.
- **Pruebas:** nuevas regresiones de 3 niveles, bloqueo, copias estructurales, aprobación, rollback, identidad seleccionada y parser; se integran a `test:automation` y `test:browser-chat`.
- **Alcance pendiente:** no se incluye alineación paramétrica automática, restricciones cinemáticas ni scripts mixtos con ensambles y piezas. El motor MCP sigue requiriendo una sesión explícita del navegador para aplicar cambios.

---

## v0.1.101 — 2026-11-10

### SNAPs geométricos STEP precisos y consistentes con LOD

- **Autoridad B-rep:** cuando una pieza tiene topología STEP exacta activa, los vértices, centros y puntos de arista usados para posicionar se obtienen de la geometría B-rep, no de triángulos de la malla visual. Los niveles LOW, WORK y DETAIL no alteran esos SNAPs.
- **Fallback controlado:** si la pieza no dispone de B-rep activo, se conserva el comportamiento anterior basado en malla. La política es independiente por instancia, de modo que piezas CAD exactas y objetos solo-malla conviven.
- **Protección de snaps persistentes:** los SNAPs definidos manualmente y las referencias CAD siguen disponibles; solo se descarta el SNAP heredado que realmente procede de una malla cuando existe topología exacta.
- **Identidad de pieza:** los resultados de las features de ingeniería STEP pasan a identificar su `PieceInstance` real; los IDs de feature permanecen en `relatedSourceIds`. Se evitan referencias sintéticas `instancia:feature` en operaciones de alineación y posicionamiento.
- **Pruebas:** se incorpora `npm run test:geometric-snaps` a CI, cubriendo prioridad de topología exacta, fallback de mallas, transformaciones y asociación correcta con la pieza.
- **Alcance:** no se introduce un nuevo kernel CAD ni se modifica el formato de proyectos, ensambles, guardado o historial. No implica que la intersección de superficies curvas o todas las referencias geométricas STEP estén ya soportadas.

---

## v0.1.100 — 2026-11-10

### Corrección de la versión visible en Model Space

- **Badge sincronizado:** el indicador `FrameLogic v...` deja de tener el número `0.1.98` fijado manualmente y utiliza `__FRAMELOGIC_VERSION__`, inyectado por Vite desde el `package.json` raíz durante la compilación.
- **Versionado consistente:** `package.json` y las dos entradas de FrameLogic en `package-lock.json` quedan sincronizados con `0.1.100`.
- **Protección contra regresiones:** la prueba `npm run test:version-badge` verifica que el badge no conserve versiones literales, que Vite inyecte la versión oficial y que el lockfile coincida con la versión raíz.
- **Sin cambios funcionales del modelador:** los ensambles jerárquicos incorporados en v0.1.99 permanecen intactos; esta corrección afecta únicamente la identificación de la compilación.

---

## v0.1.99 — 2026-11-10

### Ensambles jerárquicos: prevención de ciclos indirectos y agrupación atómica

- **Protección de jerarquía:** impide crear un ensamble padre dentro de un descendiente de cualquiera de los subensambles que intenta adoptar. El árbol anterior queda intacto cuando se rechaza la operación.
- **Agrupación transaccional:** si falla cualquier reasignación de subensambles, se restaura la instantánea completa previa, evitando padres vacíos y estructuras parcialmente modificadas.
- **Regresión automatizada:** se añaden pruebas para ciclos indirectos con tres niveles y fallo inyectado durante el traslado del segundo subensamble.
- **Compatibilidad:** no cambia el formato `FRAMELOGIC_PROJECT v1` ni la semántica de selección, movimiento, Ctrl+gizmo, COPYBASE, bloqueo y Undo/Redo existente.
- **Verificación pendiente:** ejecutar `npm run typecheck`, `npm run test:assembly-hierarchy` y `npm run build` en CI antes de fusionar a `main`.

---

## v0.1.98 — 2026-11-10

### Ctrl + gizmo: copia estructural de ensambles y COPY por dos puntos

- **Ctrl + gizmo con ensamble seleccionado:** duplica los `PieceInstance` seleccionados **y** todas las filas de ensamble y subensamble que correspondan a la selección explícita desde INSTANCIAS. Las copias reciben IDs nuevos; la estructura padre/hijo, orden de componentes, capas, giros y referencias FrameLogic se conservan. El ensamble original permanece intacto.
- **Copias independientes:** Ctrl + gizmo y COPY no generan vínculos involuntarios con la instancia original: se eliminan únicamente las etiquetas de sincronización de ensamble vinculado en las piezas copiadas. La función independiente de `Copiar instancia de ensamble` vinculada no se modifica.
- **Historial coherente:** una copia estructural completa (piezas + ensambles) es **una** operación COPY reversible. Esc cancela transacciones aún sin confirmar. Undo elimina las nuevas filas de ensamble antes de las piezas, y Redo recupera las mismas identidades y posiciones. El modo de copiar sucesivamente a SNAP conserva la selección del ensamble original.
- **Comando textual:** `C`, `COPY`, `CP` y `COPIAR` más Enter activan **COPY por punto base y destino** desde el campo de comandos CAD junto al cursor. El botón existente COPIAR y Ctrl+D mantienen el mismo flujo.
- **Selección antes o después del comando:** se pueden seleccionar una o varias piezas, un ensamble jerárquico o una combinación de ensambles y piezas sueltas. Si no hay selección, COPY permite escogerla en el canvas o en INSTANCIAS y confirmarla con Enter.
- **Dos puntos exactos:** el primer punto define la referencia; el segundo define el destino; las copias se trasladan mediante `destino - base` en X/Y/Z (mm), priorizando SNAP y usando la intersección con WorkPlane cuando no existe SNAP. Un desplazamiento cero no crea copias.
- **Compatibilidad CAD:** cuando se seleccionan líneas/polilíneas, COPIAR sigue utilizando el mismo motor anterior que conserva las polilíneas. Si hay piezas y líneas preseleccionadas, se priorizan las piezas.
- **Seguridad:** se valida que un ensamble seleccionado incluya todas sus piezas descendientes, se bloquea la copia de conjuntos bloqueados y se evita crear jerarquías incompletas. Si falla la operación, se revierte la creación parcial.
- **Pruebas:** selección padre/hijo, IDs independientes, metadatos, desplazamiento tridimensional, historial, cancelación y entrada de comando, con suite nueva `npm run test:copybase` en GitHub Actions.

### Uso

1. Selecciona un ensamble en INSTANCIAS, pulsa **M** y arrastra un eje manteniendo **Ctrl**, o haz clic en un eje con Ctrl y después en SNAP para copiar el ensamble completo.
2. Escribe **COPY + Enter**, selecciona las piezas/ensambles si todavía no estaban seleccionados, pulsa **Enter** para terminar la selección, elige un **punto base** y después un **punto destino**. La distancia se calcula automáticamente.
3. Para obtener desplazamientos 3D exactos, selecciona SNAPs persistentes en ambos puntos; sin SNAP el clic se proyecta sobre el WorkPlane.

---

## v0.1.97 — 2026-11-09

### Ensambles jerárquicos: múltiples niveles, integridad y control

- **Jerarquía real:** cada ensamble puede tener un `parentAssemblyId` opcional. El árbol INSTANCIAS muestra sus subensambles recursivamente y sus piezas directas, sin aplanar, duplicar geometría STEP/IFC ni eliminar piezas originales.
- **Selección explícita:** un clic sobre la fila de un ensamble selecciona el conjunto completo para movimientos 3D; Ctrl+clic permite combinar ensambles y piezas sueltas. La identidad del ensamble seleccionado se mantiene separada de los IDs de sus piezas.
- **Agrupación segura:** `+ Grupo` crea un padre con los ensambles explícitamente seleccionados y las piezas sueltas. No transfiere piezas internas de otro ensamble de forma implícita: informa al usuario que debe seleccionar su fila. Se rechazan relaciones circulares, selecciones simultáneas de ancestro/descendiente y miembros bloqueados.
- **Mover y desanidar:** el menú contextual permite anidar ensambles seleccionados en otro, desanidar un subensamble a raíz y desagrupar conservando las piezas y reubicando sus hijos al padre existente. Los cambios se validan antes de realizarse y restauran el estado previo ante errores.
- **Bloqueo heredado:** bloqueo/desbloqueo desde el árbol, propagado a descendientes. Mover/rotar con gizmo, Alinear, desagrupar, reanidar y desvincular una colocación bloqueada son rechazados.
- **Visibilidad y color:** los ojos y colores de cada ensamble alcanzan recursivamente todas las piezas de su jerarquía. Los ojos generales de categorías siguen sin depender de la estructura visual del árbol.
- **Undo/Redo:** se registran instantáneas de ensambles al crear, anidar, desanidar, renombrar, bloquear y desagrupar. Los comandos de movimiento 3D siguen utilizando su historial CAD.
- **Eliminación y planos:** DELETE y DELETE MIXED bloquean la eliminación de piezas heredadas de ensambles bloqueados. La acción de enviar un ensamble a PDF reconoce el ID real de la fila anidada y reúne las piezas de todos los niveles, no solo las directas.
- **Compatibilidad de proyectos:** `FRAMELOGIC_PROJECT v1` conserva su esquema; el padre y el bloqueo son campos opcionales en cada ensamble. Los proyectos anteriores se interpretan como ensambles raíz. El archivo con referencias circulares o padres ausentes se rechaza *antes de borrar el proyecto actual*.
- **Protección de copia vinculada:** se impide copiar con el mecanismo heredado un ensamble con subensambles, porque solo copiaría sus piezas directas; se muestra un aviso explícito.
- **Pruebas:** composición de dos y tres niveles, seguridad, ciclos, bloqueo heredado, desagrupación, serialización JSON, restauración de instantáneas, Undo/Redo CAD y regresión directa del caso «ensamble seleccionado + pieza suelta».

### Alcance pendiente

- La copia **vinculada jerárquica** no está implementada. El comando existente se bloquea para ensambles con hijos en vez de generar una copia incompleta.
- Los comandos externos (MCP/automatización y APIs directas sobre los registros) deben validar por separado las restricciones de bloqueo antes de alterar instancias. Las restricciones de gizmo, rotación y Alinear sí se aplican en la interfaz.
- Requiere prueba manual en navegador con ensambles anidados y apertura de un `.flproject` real; una compilación exitosa por sí sola no certifica toda la interacción.

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

