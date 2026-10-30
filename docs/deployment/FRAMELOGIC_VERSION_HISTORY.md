# FrameLogic — historial de versiones de prueba

Este archivo registra la versión visible utilizada para comprobar que `framelogic-dev.pages.dev` está ejecutando el último cambio desplegado.

## Regla de versionado

- Cada cambio funcional que se suba para pruebas incrementará la versión *patch* visible de FrameLogic.
- La misma versión debe aparecer en el badge inferior derecho del Model Space y en el `package.json` raíz.
- Antes de validar un cambio en la web, comprobar primero que el badge muestra la versión esperada.

## Versiones

### v0.1.36 — Proyecto nuevo inicia en TOP + Norte

- Se corrige el bootstrap de precisión que todavía imponía explícitamente una vista `ISO` al terminar de crear el Model Space.
- Los proyectos nuevos quedan en proyección ortográfica, con dirección cardinal `N` y vista `TOP`.
- La orientación se aplica en el orden `Norte → TOP`, porque `TOP` conserva el azimut activo y lleva únicamente la inclinación a 0°.
- Abrir un `.flproject` con cámara guardada sigue pudiendo sustituir esta vista inicial por la vista persistida del proyecto.

### v0.1.35 — STEP conserva escala real en milímetros

- Se elimina el escalado visual heredado `× 0.001` que se aplicaba después de que OpenCascade ya hubiera normalizado el STEP a milímetros.
- Una geometría STEP de `2 m` debe representarse y medirse como aproximadamente `2000 mm`, no como `2 mm`.
- La malla visible y las features B-Rep/SNAP quedan en la misma escala de Model Space.
- Los bytes STEP originales guardados en `.flproject` no se modifican; al reconstruir la pieza se usa la escala correcta en milímetros.

### v0.1.34 — Cámara persistente por proyecto

- `Guardar proyecto` incorpora la vista actual del Model Space dentro del `.flproject`.
- Se conservan posición de cámara, `target`, azimut, inclinación, proyección ortográfica/perspectiva y zoom ortográfico.
- Al volver a abrir el proyecto, FrameLogic reconstruye primero modelo/dibujos y después restaura la cámara guardada para recuperar el encuadre exacto de trabajo.
- El autoguardado utiliza el mismo paquete y conserva también la vista.
- Los `.flproject` antiguos sin estado de cámara siguen siendo compatibles y mantienen el comportamiento anterior de recuperación.

### v0.1.33 — TOP/Norte inicial, SNAP sobre ORTO y longitud digitada visible

- Los proyectos nuevos inician siempre en vista `TOP` con Norte arriba.
- Durante `LINE`, un SNAP explícito tiene prioridad sobre ORTO para permitir conectar exactamente con `ENDPOINT`, `MIDPOINT` u otra referencia aunque el destino sea diagonal.
- ORTO permanece activo fuera del SNAP y sigue restringiendo el movimiento libre a los ejes permitidos.
- Mientras se escribe una longitud numérica para `LINE`, la cota temporal muestra inmediatamente el valor digitado antes de pulsar `Enter`.
- `Enter` confirma esa longitud en la dirección actual del tramo.

### v0.1.32 — Ángulo dinámico y confirmación `L + Enter`

- Mientras `LINE` espera el segundo punto, el preview muestra también el ángulo respecto al eje X del WorkPlane activo.
- Si el WorkPlane está desactivado, el ángulo se mide respecto al eje X global en el plano XY.
- El ángulo se muestra en grados enteros y se actualiza en tiempo real junto con la longitud temporal.
- Pulsar `L` ya no inicia inmediatamente `LINE`: abre un recuadro de comando cerca del cursor.
- `L + Enter` o `LINE + Enter` ejecutan el comando `LINE`; `Tab` completa `LINE` y `Esc` cancela el recuadro.
- En esta versión sólo `LINE` adopta el flujo de confirmación textual; los demás atajos conservan su comportamiento actual.

### v0.1.31 — Cotas temporales sin decimales

- Las cotas temporales de líneas CAD muestran milímetros enteros, sin decimales.
- El valor se redondea al milímetro más cercano tanto al seleccionar una línea como durante el preview de `LINE`.
- Ejemplo: `2.234,55 mm` pasa a mostrarse como `2.235 mm`.

### v0.1.30 — Cotas temporales informativas en líneas CAD

- Al seleccionar una única línea CAD en Model Space se muestra temporalmente su longitud real en milímetros.
- La cota temporal se dibuja separada de la línea y desaparece al deseleccionarla o seleccionar otro tipo de elemento.
- Mientras el comando `LINE` tiene definido el primer punto y espera el segundo, el preview incorpora una cota temporal que se actualiza en tiempo real con el cursor.
- Después de confirmar un segmento, la medida temporal pasa automáticamente al nuevo tramo encadenado que propone `LINE`.
- El offset visual de la cota se calcula en función del zoom para conservar aproximadamente la misma separación en pantalla tanto en geometría pequeña como en líneas de decenas de metros.
- Estas cotas son exclusivamente informativas: no crean anotaciones permanentes, no modifican el historial y no sustituyen la herramienta `COTA`.

### v0.1.29 — Clipping ortográfico corregido en modelos extensos

- Se corrige el recorte de geometría al orbitar cuando el modelo se extiende decenas de metros desde el `target` de la cámara.
- El zoom ortográfico y la distancia física cámara–target quedan desacoplados: alejar la cámara físicamente ya no cambia el tamaño aparente del modelo.
- La distancia física de la cámara aumenta automáticamente según la diagonal visible del frustum ortográfico, conservando el mismo `target`, orientación y zoom.
- Una línea de `35 000 mm` y geometría dibujada a partir de su extremo pueden seguir visibles al rotar la vista, siempre que estén dentro del encuadre.
- El plano `far` ortográfico se dimensiona con la distancia real y el campo visible, evitando multiplicaciones excesivas que degradarían la precisión del depth buffer.
- Se conserva el rango de zoom ampliado introducido en v0.1.28 y el comportamiento de PAN/zoom cercano.

### v0.1.28 — Rango de zoom ortográfico ampliado

- El campo ortográfico inicial se mantiene en aproximadamente `5000 mm` de alto para conservar una vista inicial útil.
- Se corrige el bloqueo que hacía coincidir ese zoom inicial (`≈ 0.01`) con el límite mínimo de CameraControls, impidiendo alejarse más al trabajar con geometría de 5 m o superior.
- El límite de zoom-out ortográfico baja a `0.0001`, permitiendo un campo visible aproximado de hasta `500 000 mm` con el frustum actual.
- La rueda del mouse puede seguir alejando después de encuadrar una línea de `5000 mm`.
- `Zoom Extents` y el enfoque de precisión usan el mismo límite ampliado para poder encuadrar modelos mayores.
- El rango de zoom-in y la escala inicial de 5000 mm no cambian.

### v0.1.27 — Cotas lineales en Model Space

- Se agrega el botón `COTA` junto a las herramientas `POINT` y `LINE` del Model Space.
- Al activar `COTA`, FrameLogic habilita SNAP y solicita dos puntos: `P1` y `P2`.
- La cota se crea entre dos SNAPs válidos y muestra la distancia real del modelo en milímetros.
- La representación incluye líneas auxiliares, línea de dimensión, extremos visibles y etiqueta numérica.
- La separación de la línea de dimensión se calcula automáticamente respecto al WorkPlane activo; si no hay WorkPlane se usa la orientación de cámara.
- Después de crear una cota, la herramienta permanece activa para colocar otra sin volver a pulsar el botón.
- `Esc` o clic derecho terminan la herramienta de cota; cambiar a otra herramienta CAD también la desactiva.
- Las cotas de esta primera versión son anotaciones de sesión en Model Space; todavía no se guardan dentro del `.flproject` ni son asociativas a cambios posteriores de geometría.

### v0.1.26 — Cancelación por niveles en LINE

- Al terminar un segmento, `LINE` conserva su comportamiento encadenado y propone el siguiente tramo desde el último extremo.
- Un solo `Esc` cancela únicamente ese tramo pendiente: desaparece el preview, se libera el extremo anterior y `LINE` permanece activo esperando un nuevo primer punto independiente.
- Un solo clic derecho sobre Model Space realiza la misma cancelación parcial sin mostrar el menú contextual del navegador.
- Dos `Esc` consecutivos dentro de una ventana corta terminan completamente el comando `LINE`.
- Dos clics derechos consecutivos dentro de la misma ventana terminan completamente el comando `LINE`.
- Las líneas ya creadas nunca se eliminan al cancelar el tramo pendiente.
- Mantener `Esc` presionado no se interpreta como doble `Esc`.

### v0.1.25 — Escala ortográfica inicial corregida para milímetros

- Se corrige el frustum inicial de la cámara ortográfica de That Open, que tras la migración a mm seguía mostrando aproximadamente sólo `50 mm` de alto.
- La vista ortográfica inicial pasa a mostrar aproximadamente `5000 mm` de alto.
- La distancia de cámara de referencia se mantiene en `5000 mm` respecto al origen.
- Una línea de `10–20 mm` deja de ocupar gran parte de la pantalla al iniciar un proyecto vacío.
- La cuadrícula de `100 mm` vuelve a ser visible porque el campo inicial ya abarca varios metros.
- El ajuste se aplica directamente a `threeOrtho`, por lo que también queda preparado cuando se cambia posteriormente desde perspectiva a ortográfica.

### v0.1.24 — Cámara inicial y cuadrícula estándar en milímetros

- Al iniciar un proyecto vacío, la cámara se coloca a una distancia real de aproximadamente `5000 mm` del origen sobre una vista isométrica.
- El zoom inicial se restablece a `1` para evitar heredar una escala de cámara demasiado cercana.
- La cuadrícula del WorkPlane conserva un área total de `20 000 × 20 000 mm`.
- La separación de la retícula se reduce a `100 mm` por división para que sea visible y útil al trabajar en escala milimétrica.
- Se aumenta ligeramente la opacidad de la cuadrícula para mejorar su lectura sin ocultar la geometría.

### v0.1.23 — Unidad lineal canónica en milímetros

- FrameLogic adopta `1 unidad geométrica = 1 mm` en Model Space.
- STEP, IFC y DWG/DXF se normalizan a milímetros al entrar al proyecto.
- Coordenadas, SNAPs, WorkPlane, secciones, movimiento, cotas y geometría de dibujo trabajan en mm.
- Las escalas técnicas de Paper Space usan directamente `paper_mm = model_mm / N`.
- Los `.flproject` y `.flpiece` históricos sin unidad declarada se migran automáticamente desde metros a milímetros.
- Se conservaron las unidades físicas explícitas de ingeniería como kg, kg/m³, m², m³, m⁴ y radianes.

### v0.1.16 — Pestañas PDF sólo al abrir y cierre independiente

- La barra inferior mantiene `MODELO` siempre visible.
- Los PDF ya no aparecen todos automáticamente como pestañas.
- Un PDF se agrega a la barra únicamente cuando el usuario lo abre, ya sea desde un selector o desde otra acción que abra ese documento.
- Cada pestaña PDF incorpora una `×` para cerrarla.
- Cerrar una pestaña no elimina el PDF ni sus views; únicamente lo retira de los documentos abiertos.
- Un PDF cerrado puede volver a abrirse posteriormente desde los selectores de PDF.
- Si se cierra el PDF activo, FrameLogic vuelve a `MODELO` y conserva abiertas las demás pestañas.
- Las pestañas abiertas son estado de sesión y no se fuerzan al restaurar un proyecto.

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
