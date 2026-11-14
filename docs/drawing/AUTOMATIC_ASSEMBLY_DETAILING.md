# Detallado automático de ensambles — arquitectura y alcance

## Objetivo

El comando contextual **Generar planos automáticamente** crea hojas de dibujo
dentro de `GeneralPdfController`, conservando la única fuente de verdad
`DrawingProductionController.sheets`. No crea un segundo motor PDF.

## Investigación de soluciones

| Referencia | Hallazgo aplicable | Decisión |
| --- | --- | --- |
| Autodesk Advance Steel | Drawing Processes seleccionan vistas, estilos, numeración y disposición por reglas | Emular el concepto, no incorporar código privativo |
| Tekla Structures | Cotas asociativas y reglas automáticas configurables por vista | Diseñar futura acotación con referencias persistentes |
| FreeCAD TechDraw | Vistas proyectadas, secciones y geometría de dibujo basada en formas | Referencia arquitectónica; no se incorpora código LGPL en esta etapa |
| Open CASCADE Technology | Topología B-Rep, proyección HLR y secciones | Reutilizar el puente OCCT ya presente en DrawingProfessional en una etapa posterior |
| mxchristian17/cota | Organización de vistas y cotas CAD en navegador | Conservar atribución Apache-2.0 de algoritmos ya adaptados en FrameLogic |

Fuentes: https://help.autodesk.com/cloudhelp/2022/ENU/AdvSteel-Drawings/files/GUID-56DE7871-F31D-4C59-9758-0F3E4708CAAC.htm ;
https://support.tekla.com/doc/tekla-structures/2026/dra_dimensions ;
https://github.com/FreeCAD/FreeCAD ;
https://github.com/Open-Cascade-SAS/OCCT ;
https://github.com/mxchristian17/cota .

Licencias: FreeCAD LGPL-2.1-or-later, OCCT LGPL-2.1 con excepción de OCCT,
Cota Apache-2.0 según avisos del código FrameLogic. Estas licencias no
permiten asumir interoperabilidad inmediata ni eliminar obligaciones de
redistribución. En esta etapa no se añade una dependencia nueva ni se copia
código de FreeCAD, OCCT o los productos comerciales.

## v0.1.150 — Dirección propia sin ajuste a eje global

Se corrigió un defecto introducido en la v0.1.149: al seleccionar
«Planta · eje propio» con una viga inclinada menos de 8° respecto a
un eje global, el estimador era redondeado a XYZ y la vista quedaba
tan torcida como «Planta · ejes globales». El selector ya usa la
dirección longitudinal PCA completa y sin redondeo para TODAS las
orientaciones propias; la proyección global conserva su comportamiento
intencional. No existe transformación del modelo 3D ni alteración de
geometría física: solo se modifica el sistema de observación de la View.

El test `AssemblyViewOrientationControls.test.ts` contrasta la
proyección vertical de un perfil ligeramente girado entre las dos
opciones, incluyendo una placa de anclaje no simétrica. La base
de dibujo sigue siendo provisional cuando se infiere de mallas y
necesita validación visual para ensambles reales.

## v0.1.149 — Cambiar el tipo de vista y alinear el ensamble

La ruta **Enviar a PDF** usaba la orientación del `CadWorkPlaneState`
activo. Aunque el perfil estuviera alineado con X en el espacio modelo, podía
aparecer diagonal en la hoja; el texto **AUTO** del marco significaba escala
automática, no tipo de vista.

Ahora la View nueva utiliza de forma predeterminada **Alzado · eje propio**
si el estimador longitudinal de FrameLogic reconoce un eje dominante. Para
las vistas propias se conserva la orientación longitudinal exacta propuesta
por PCA sin redondearla a XYZ, incluso si se desvía pocos grados; las vistas
globales conservan sus ejes fijos. Si el eje no es
fiable, se usa **Alzado · ejes globales** y no se atribuye un eje propio.

En **PDF / Paper Space**, usa el panel superior derecho **VIEW seleccionada**:
elige la View o haz clic dentro de su recuadro; selecciona **Alzado, Planta,
Extremo o Isométrica · eje propio**; también están disponibles **Alzado,
Planta, Lateral e Isométrica · ejes globales** y **Actual / WorkPlane original**
para recuperar la orientación guardada. Cambiar la View recalcula su
proyección vectorial usando STEP HLR cuando es posible, conservando los
tamaños y posiciones manuales de los viewports y sin mover los objetos 3D.

Un cambio de orientación de la View principal invalida cortes o recortes
dependientes anteriormente generados: hay que reconstruir el paquete para
evitar referencias geométricas inconsistentes. El selector HTML no forma
parte del SVG exportado, pero el contenido de la View sí aparece en el PDF.

Las muestras de la geometría de visualización proponen ejes de orientación,
no datums verificables para cotas ni criterios certificados de taller.

## v0.1.148 — Cortes A-A/B-B y ampliaciones dentro del PDF

La generación automática del ensamble ya puede agregar **una segunda hoja A3**
con perfiles transversales `CORTE A-A` y `CORTE B-B` obtenidos
por `BRepAlgoAPI_Section`, además de `DETALLE A` y `DETALLE B`
ampliados desde la vista ortográfica principal. Se añaden trazas, flechas
y referencias `C-<ID del ensamble>` en esa vista; la hoja conserva
escalas individualizadas para no deformar el dibujo.

La estación A-A está al 20 % y B-B al 80 % de la **extensión proyectada**,
no de una conexión geométricamente reconocida. Un perfil de sección sólo
se presenta si **todas las instancias** disponen de STEP B-Rep legible y
transformaciones rígidas o de escala uniforme y si existe una verdadera
intersección con el plano. Una sección que falla no se reemplaza por
triángulos. Los detalles son recortes vectoriales de la vista HLR o de su
fallback, **no son cortes** ni comprobaciones de unión.

Los nuevos layouts y anotaciones son elementos del SVG de Paper Space y
entran en la exportación PDF existente. Los recortes se calculan con clipping
geométrico, sin cambiar el carácter visible/oculto de cada segmento. La hoja
de cortes utiliza las cuatro celdas disponibles con escalas por viewport.
Si no hay escala ISO que quepa, el viewport se muestra como AUTO,
debiendo verificarse antes de uso físico.

**Caducidad:** modificar piezas invalida los cortes y detalles ya emitidos:
se oculta su geometría obsoleta y se solicita generar nuevamente el paquete.
La regeneración asociativa automática de cortes con reposicionamiento de
estaciones, así como el reconocimiento de conexiones, rayados y las cotas
específicas de taller, son tareas posteriores. No se certifican estos planos
para fabricación sin revisión humana y ensayo de impresión a escala.

## v0.1.147 — HLR del conjunto STEP con oclusión entre piezas

`OpenCascadeDrawingKernel.hiddenLinesAssembly` aprovecha la misma instancia
OpenCascade existente, sin dependencias nuevas. Para cada pieza STEP calcula
su forma en coordenadas de mundo con la matriz de `DesignSceneController`
y la escala de `OpenCascadeBrepKernel`; añade todas las formas al mismo
`HLRBRep_Algo` y calcula `Update/Hide` antes de extraer visibles/ocultas.
Se exige una transformación ortogonal con escala uniforme y un documento B-Rep
cargado para **cada** instancia del ensamble. Se limita el lote a 128
instancias para proteger el navegador; los conjuntos mayores aún necesitan
fragmentación. No se fusionan sólidos ni se infieren soldaduras o agujeros.

La proyección devuelta ya está en coordenadas de mundo, por lo que el
`AssemblyProjectionEngine` sólo aplica `worldToPlane`. Los puntos de
cotas siguen procediendo de la topología de cada STEP con referencias
`instanceId/topologyId`. Para mezclas STEP/malla, matriz no uniforme,
fallo del kernel o proyección vacía, se mantiene la ruta previa **por pieza**
y se indica que la ocultación entre componentes no es exacta.

`GeneralPdfController` distingue vistas de HLR de conjunto y per-piece
en las advertencias del PDF y su estado. La prueba de integración Node
`tests/clashOcctIntegration.ts` utiliza dos cajas B-Rep alineadas en
profundidad; comprueba que el HLR conjunto no reproduce todas las
aristas visibles de la caja posterior y que se rechaza escala no uniforme.
Sin prueba real de impresión y geometría compleja no se habilita uso
de fabricación.

**No implementado aquí:** identificación automática de uniones, cortes,
detalles de conexión y colocación de sus marcadores. Siguen en la Etapa A.

## v0.1.146 — Etapa A, orientación longitudinal (entrega incremental)

`AssemblyOrientationPlanner.inferAssemblyLongitudinalFrame` usa el tensor de
covarianza de una muestra acotada de vértices de las cajas envolventes
**locales de cada malla**, transformadas a coordenadas mundiales. Rechaza
geometrías isótropas/ambiguas y elige el signo de eje de forma determinista.
`planSmartAssemblyViews` acepta opcionalmente esas muestras; propone un
alzado longitudinal y vista de extremo ortogonales, además de vistas
complementarias ya soportadas por `AutoSheetLayoutPlanner`.
`GeneralPdfController` recolecta muestras por ensamble y pieza (máximo 8192
puntos de caja) y mantiene el flujo actual, los tamaños derivados de
`projectAssembly`, las cotas B-Rep y las posiciones manuales de Paper Space.
La opción sin muestras conserva exactamente el comportamiento previo.

Estas cajas de presentación no constituyen datums de fabricación, detección
de conexiones, medida ni evidencia de que exista perforación o soldadura.
Las formas no esbeltas siguen con vistas de ejes globales; aún falta
reconocimiento topológico de perfiles y uniones, HLR del conjunto completo,
cortes y detalles reales con sus indicadores en planta/alzado.

**Siguiente incremento de Etapa A:** pasar múltiples TopoDS_Shape con las
transformaciones correctas a un único `HLRBRep_Algo` (el API admite
múltiples formas), verificar compatibilidad de escalas y transformaciones,
comparar contra oclusiones reales y rechazar resultado cuando hay geometría
mixta. Después: detectar uniones con evidencia B-Rep, elegir sección y
proyectarla con `sectionByPlane`; no etiquetar proximidad de cajas como
contacto geométrico verificado.

Referencias: OCCT, "Modeling Algorithms", sección Hidden Lines Removal:
https://github.com/Open-Cascade-SAS/OCCT/blob/master/dox/user_guides/modeling_algos/modeling_algos.md .
FreeCAD TechDraw es una referencia de secuenciación (combinar formas,
orientar, proyectar, anotar), sin copiar código:
https://github.com/FreeCAD/FreeCAD/blob/main/src/Mod/TechDraw/App/DrawViewPart.cpp .

## V0.1.143 — etapa 1

Flujo: árbol INSTANCIAS -> menú contextual de ensamble ->
`GeneralPdfTreeBridgeController.generateAutomaticAssembly` ->
`GeneralPdfController.generateAutomaticAssembly` ->
`planSmartAssemblyViews` y `planSelectedSheetLayout` ->
vistas persistidas en Paper Space -> vista previa editable y exportación PDF
del motor existente.

La selección se basa en el envolvente mundial del ensamble (eje dominante,
proyección más informativa y proyección de extremo). Añade la vista isométrica
cuando el ensamble tiene varias piezas y una tercera proyección ortogonal
para ensambles volumétricos complejos. Permite conjuntos de 2 a 4 vistas,
con disposición de primer diedro, reserva de cajetín, misma escala ISO
normalizada, y layouts que el usuario puede mover y redimensionar.

Las marcas por definición se guardan en la hoja como `pieceMarks`. El resumen
muestra cantidades según las instancias del ensamble, sin inferir materiales,
pesos, propiedades metalúrgicas ni tolerancias.

## Restricciones de seguridad geométrica

Esta primera implementación usa `THREE.EdgesGeometry`, igual que la ruta
actual `Enviar a PDF`. Eso genera vistas *preliminares* sin eliminación
correcta de líneas ocultas por pieza y NO justifica acotación de
fabricación. Por ello esta etapa no convierte el tamaño aparente de las
aristas en dimensiones exactas. La propia hoja incluye una advertencia.

Para la etapa 2 se debe usar la misma topología STEP B-Rep exacta del
`EngineeringAutoDimensionPlanner`, proyectar por cada cámara mediante
OCCT HLR y obtener referencias persistentes vinculadas a la pieza y al
`topologyId`. Si una pieza sólo tiene malla o referencia DWG, no generar
medidas de fabricación que aparenten exactitud; indicar la limitación.
Antes de dar por concluidos los planos se requieren pruebas con piezas
rotadas, conjuntos jerárquicos, curvas, agujeros, cambios de modelo y PDF
a escala física en distintos navegadores.

## v0.1.144 — continuación de las prioridades

La nueva ruta `AssemblyProjectionEngine.projectAssembly` intenta primero
`OpenCascadeDrawingKernel.hiddenLines` para cada pieza STEP cuyo documento
B-Rep esté cargado, transformando el resultado al sistema de cada vista.
Sólo si falla el cálculo o falta B-Rep recurre a `EdgesGeometry`.
Las aristas ocultas pueden activarse por viewport y se conservan separadas.

`planExactAssemblyDimensions` trabaja exclusivamente con vértices B-Rep
y centros de arcos/círculos coplanares de las piezas. Presenta cotas
X, Y y Ø en **mm**, priorizando cotas generales, centros y diámetros.
Un círculo sometido a escalado no uniforme no genera un Ø engañoso.
La selección de vistas sigue el envolvente de la etapa 1; no se ha
introducido orientación PCA ni identificación semántica de las uniones.

Para cada definición de pieza del ensamble se crea hasta un máximo de
**20 hojas individuales por comando** (representante de la primera
instancia de dicha definición) y, si hay más de ocho definiciones, hojas
de listado completo con hasta 40 entradas cada una. Los identificadores
se conservan en la hoja; el listado proporciona marcas, cantidades y
nombres, pero no atribuye pesos, calidades de acero ni soldaduras sin
datos reales. Se informa cuando el límite deja piezas sin plano individual.

Las vistas automáticas guardan referencias `instanceId` /
`topologyId` de las cotas y firma de modelo. El botón
**Regenerar planos automáticos** y un control periódico detectan
cambios en matrices, versión de geometría y B-Rep. La regeneración
actualiza las vistas y cotas automáticas sin sustituir el layout
manual ni las anotaciones manuales existentes.

**ADVERTENCIAS IMPORTANTES**

- El HLR es **por pieza**, no hay ocultación exacta entre piezas distintas.
- Las cotas del PDF general se proyectan como SVG técnico, pero aún no
  son controles gráficos editables de arrastre ni se validan contra
  normas de fabricación; las vistas STEP no secciones carecen de cortes.
- Las dimensiones exteriores se basan en los vértices STEP indexados;
  determinadas superficies curvadas pueden superar esos vértices.
- Si el documento STEP no está cargado o sólo existe una malla,
  no se generan dimensiones exactas para esa geometría.
- No se dibujan soldaduras, taladros roscados, tolerancias ni biseles
  inferidos automáticamente. Se requiere revisión de fabricación.
- La exportación sigue siendo por hoja PDF; no hay exportación masiva
  de todas las hojas como un único PDF.
- La regeneración de esta etapa atiende cambios de geometría de las
  instancias existentes; aún falta reconciliar todas las altas/bajas
  y cambios jerárquicos con marcas y BOM de manera transaccional.

## v0.1.145 — cotas STEP, distribución y BOM asociativa

`WorkshopFeatureDimensionPlanner` selecciona primero los extremos de
vértices STEP exactos; luego agrupa aristas circulares coplanares por
radio y **centro único**, genera estaciones de sus centros y mide
separaciones entre centros sólo cuando coinciden realmente en una
misma fila o columna dentro de la tolerancia geométrica. No deduce
que toda arista circular sea un taladro ni que todo vértice interior
sea un corte de taller. Los puntos siempre son B-Rep.

`WorkshopDimensionLayout` calcula posiciones deterministas en los
márgenes superior, derecho e inferior de cada ventana; evita
colisiones entre cajas de texto y oculta las dimensiones que no caben
mostrando el número omitido. Los textos de las cotas automáticas
pueden arrastrarse sin cambiar su valor y ocultarse con clic
derecho. El botón **Restablecer cotas** recupera la posición
automática y los textos ocultos. El PDF exporta la misma alineación
de texto que el SVG; no usa la propiedad `text-anchor` que el
exportador PDF heredado no interpreta.

`AssemblyBomPlanner` obtiene la cantidad de instancias por
definición de pieza y lee de `FrameLogicEngineeringModel` los
atributos `material.name`, `material.grade` y
`physical.massKg` cuando existen. Calcula masa total solamente
multiplicando una masa unitaria explícita por la cantidad real.
Si falta información, la tabla muestra «sin dato» y no deduce masa,
material ni perfiles de una malla. Se utiliza en el resumen principal
y las hojas ampliadas de BOM.

La regeneración de un ensamble consulta la lista actual de
instancias jerárquicas, conserva marcas ya asignadas, agrega
nuevas marcas y actualiza la BOM. Las hojas individuales de pieza
preexistentes se mantienen, pero **no** se crean automáticamente
planos adicionales al insertar una definición nueva mediante la
regeneración. Esto queda pendiente.

**Límites que permanecen:** HLR es por pieza y no entre piezas;
las cotas se basan en referencias STEP pero su edición gráfica
manual se limita a mover/ocultar textos; no hay optimizador global
de intersecciones de líneas de cota, ni detalles de soldadura,
cortes, biseles o despieces de producción revisados por norma.
En vistas pequeñas los candidatos sin sitio se omiten
intencionalmente y se reportan, no se saturan los planos.
Se necesita comprobación dimensional y física del PDF de un
ensamble real antes de autorizar su fabricación.

## Etapas posteriores

1. HLR real por vista y acotación exacta editable de ensamble y piezas, sin
   solapamientos ni cotas repetidas.
2. Identificación persistente de cada pieza, BOM con materiales y pesos
   solo si hay propiedades suficientes; hojas extra si el resumen no cabe.
3. Cortes, vistas auxiliares y detalles de uniones/acoples por reglas.
4. Regeneración incremental asociativa, preservación de cambios manuales y
   detección de referencias perdidas.

**Criterio de entrega actual:** avance utilizable de planificación y
presentación, todavía no equivalente a planos de taller aprobados.

## v0.1.152 — Crear proyecciones desde una View existente

1. Abre una hoja de Paper Space que contenga una **View de una pieza individual o un ensamble**.
2. Selecciona la View en el árbol **VIEWS** o desde **VIEW seleccionada**.
3. Pulsa **Proyectar View**. Mueve el cursor fuera del marco de la View origen: a derecha/izquierda/arriba/abajo para vistas ortográficas, o en diagonal para vistas isométricas.
4. La previsualización punteada indica la colocación; haz clic en un espacio libre de la hoja. Sigue colocando proyecciones o pulsa **Esc** para salir.
5. Las nuevas Views se pueden seleccionar, arrastrar, cambiar de render y exportar dentro del mismo PDF. Los ejes y escala provienen de la View origen, respetando **ISO E / ISO A**. Las proyecciones vinculadas se regeneran al cambiar la orientación o geometría de su origen sin mover las piezas.

No es posible derivar un nuevo alzado desde un corte físico A-A/B-B o un detalle recortado sin una política de proyección del volumen de corte; esos casos se bloquean para evitar resultados geométricamente falsos.
