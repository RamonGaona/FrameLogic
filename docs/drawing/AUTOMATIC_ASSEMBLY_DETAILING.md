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
