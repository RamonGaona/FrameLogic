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
