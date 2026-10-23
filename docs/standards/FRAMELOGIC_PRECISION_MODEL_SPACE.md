# FrameLogic Precision Model Space

## Objetivo

El espacio modelo de FrameLogic prioriza inspección geométrica, selección, montaje y obtención de puntos 3D confiables. No busca editar sólidos mediante operaciones tipo Pull/Push.

La autoridad de una operación de SNAP es siempre una coordenada 3D calculada. La posición aparente del cursor en pantalla solamente sirve para encontrar candidatos.

La arquitectura completa STEP-first se define en `FRAMELOGIC_STEP_FIRST_ARCHITECTURE.md`.

## Autoridad geométrica

La prioridad de información es:

1. STEP/B-Rep exacto cuando esté disponible.
2. Geometría persistente definida por FrameLogic.
3. Características derivadas de malla.
4. Superficie triangulada para selección/inspección.

IFC se considera principalmente contexto BIM e intercambio. No es la fuente maestra de precisión de las piezas STEP.

## Componentes

### GeometryQueryEngine

Consulta geometría cercana al cursor y devuelve candidatos ordenados con coordenadas 3D, origen y nivel de precisión.

Candidatos soportados:

- vértices de pieza;
- punto medio de arista;
- punto más cercano sobre arista;
- centro de bucles circulares detectados;
- punto sobre superficie triangulada;
- CAD points;
- extremos y puntos medios de CAD lines;
- punto más cercano sobre CAD line;
- intersección 3D real entre CAD lines;
- SNAPs persistentes de PieceDefinition;
- origen y punto cercano sobre ejes persistentes;
- features de ingeniería provenientes de STEP.

El motor admite `GeometryQueryProvider`, por lo que nuevas fuentes exactas pueden añadirse sin acoplar el snap a un kernel CAD específico.

### StepEngineeringFeatureProvider

Expone al `GeometryQueryEngine` las features registradas en `FrameLogicEngineeringModel`.

Ejemplos:

- centro de agujero STEP;
- centro de círculo;
- origen de eje/cilindro;
- puntos exactos;
- extremos de eje estructural como referencias.

Cuando una feature proviene de B-Rep se registra como `STEP_BREP_EXACT`. Cuando procede de triangulación o inferencia se registra como `STEP_DERIVED`.

### MeshAnalyticFeatureProvider

Mantiene el fallback para modelos IFC o geometrías sin B-Rep accesible:

- reconoce bucles circulares;
- deriva el eje normal de un agujero/borde circular;
- calcula intersecciones 3D entre una CAD line de FrameLogic y una arista de pieza.

Los resultados de esta capa se marcan como `DERIVED_MESH`.

### PrecisionSnapEngine

Se instala sobre el `DesignSnapController` existente y conserva los SNAPs anteriores.

Combina:

1. SNAP persistente/manual de FrameLogic;
2. features STEP exactas o derivadas;
3. resultados geométricos de malla;
4. CAD points/lines.

Un impacto arbitrario sobre una cara triangulada queda disponible para consulta geométrica, pero no se convierte automáticamente en SNAP.

### MeasurementEngine

Proporciona operaciones reutilizables de distancia, ángulo, proyección, punto-segmento, punto-plano y longitud de polilínea.

### PrecisionCameraController

Mejora la inspección cercana mediante clipping dinámico, punto de órbita y enfoque de objetos/cajas 3D.

## Niveles de precisión del GeometryQueryEngine

- `MODEL_EXACT`: dato explícito de FrameLogic o feature STEP/B-Rep declarada como exacta.
- `DERIVED_MESH`: característica reconstruida desde triangulación.
- `TRIANGULATED_SURFACE`: punto obtenido directamente sobre un triángulo renderizado.

Un dato solo debe entrar como `MODEL_EXACT` cuando su proveedor garantice la coordenada geométrica. Una malla IFC o STEP triangulada no se convierte automáticamente en geometría B-Rep exacta.

## STEP y OpenCascade

La aplicación ya contiene `@sunbox/occt-import-js`, usado históricamente para leer y triangular STEP antes de generar un IFC de trabajo.

El nuevo enfoque desacopla esta implementación mediante `StepGeometryAdapter`:

```text
STEP
  ↓
OCCT implementation
  ↓
StepGeometryAdapter
  ├── malla → Three.js
  └── features B-Rep → FrameLogicEngineeringModel
                           ↓
                   GeometryQueryEngine
                           ↓
                    PrecisionSnapEngine
```

El adaptador actual `OcctStepGeometryAdapter` permite importación STEP directa de la malla y estructura básica de producto. El binding actualmente utilizado no expone todavía todas las entidades B-Rep necesarias para obtener círculos/cilindros/agujeros exactos, por lo que esa extracción exacta sigue siendo el siguiente paso técnico.

OpenCascade no reemplaza Three.js y no se usa como editor de sólidos. Su función es suministrar geometría STEP de precisión.

## API pública

`createBimCore()` expone:

```ts
core.geometryQuery
core.snapEngine
core.measurement
core.precisionCamera
core.engineeringModel
core.structuralModel
core.importStepPiece(...)
```

`engineeringModel` conserva metadatos, features, ensambles y ejes estructurales independientemente de IFC.

`structuralModel` transforma los ejes estructurales confirmados de las piezas colocadas a nodos/miembros listos para un adaptador de cálculo como Awatif.

## Criterio de aceptación

Antes de unir esta rama a una rama estable se debe comprobar como mínimo:

1. `npm.cmd run typecheck` pasa sin errores.
2. Los SNAPs anteriores siguen funcionando.
3. Los STEP pueden registrarse directamente como assets `STEP`, sin requerir conceptualmente un IFC como fuente maestra.
4. Mover el punto base del gizmo a una intersección conserva exactamente la misma coordenada después de orbitar la cámara.
5. Una intersección aparente en pantalla que no sea intersección 3D real no genera `INTERSECTION`.
6. Los centros de agujero permanecen fijos al cambiar la cámara.
7. Cuando exista una feature STEP `BREP_EXACT`, el snap usa su coordenada matemática y no el centro reconstruido de triángulos.
8. Una CAD line puede detectar una intersección 3D con una arista cuando realmente comparten el mismo punto espacial.
9. La cámara puede acercarse al modelo sin clipping excesivo ni pérdida severa de movilidad.
10. Un `structuralAxis` confirmado se transforma con su PieceInstance y aparece como miembro en `core.structuralModel.build()`.
11. Un ensamblaje puede reutilizar varias veces una misma PieceDefinition sin duplicar la geometría STEP.
