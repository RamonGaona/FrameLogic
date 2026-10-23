# FrameLogic STEP-first architecture

## 1. Objetivo

FrameLogic prioriza STEP como fuente geométrica para las piezas de precisión.
IFC queda como formato BIM de contexto, coordinación e intercambio final.

El objetivo no es convertir FrameLogic en un editor sólido tipo CAD tradicional.
El objetivo es poder colocar, consultar, ensamblar y analizar piezas con precisión geométrica.

## 2. Autoridad de información

La autoridad se separa por responsabilidad:

1. STEP / B-Rep: geometría exacta de fabricación.
2. FrameLogic Engineering Model: metadatos, features de ingeniería, ensamblajes, restricciones y eje estructural.
3. Three.js: visualización e interacción.
4. IFC / That Open: contexto BIM de entrada y salida.
5. Malla triangulada: fallback visual y geométrico cuando no existe información exacta.

Nunca se debe considerar que una triangulación recupera automáticamente la precisión matemática de un STEP.

## 3. Flujo principal

```text
STEP
  |
  v
StepGeometryAdapter
  |
  +--> malla de visualización --> Three.js
  |
  +--> features B-Rep ---------> FrameLogic Engineering Model
                                  |
                                  +--> snaps exactos
                                  +--> ensamblajes
                                  +--> structuralAxis
                                  +--> cálculo
```

## 4. IFC como adaptador secundario

El modelo IFC suministrado por un cliente puede cargarse en el mismo espacio modelo como referencia BIM.
Las piezas nuevas de FrameLogic permanecen asociadas a sus STEP.

```text
IFC cliente --------------------------+
                                       |
STEP A --> PieceDefinition -----------+--> espacio modelo
STEP B --> PieceDefinition -----------+
STEP C --> PieceDefinition -----------+
```

Si el cliente solicita una entrega BIM final, FrameLogic podrá exportar las piezas y ensamblajes al IFC correspondiente sin convertir el IFC en la fuente maestra de precisión.

## 5. StepGeometryAdapter

`@framelogic/geometry` define `StepGeometryAdapter`.

El contrato desacopla FrameLogic de una implementación concreta de OpenCascade.
Una implementación puede cambiar sin modificar el dominio, el snap o el cálculo estructural.

Un `StepGeometryDocument` puede aportar:

- mallas para render,
- agujeros,
- círculos,
- cilindros,
- puntos,
- ejes,
- planos,
- estructura de producto/ensamblaje STEP.

Cada feature indica si su precisión es `BREP_EXACT` o `DERIVED`.

La implementación final de precisión debe ejecutar OCCT preferiblemente en Web Worker.

## 6. Estado del adaptador OCCT actual

`apps/web/src/features/bim/step/OcctStepGeometryAdapter.ts` envuelve el importador OCCT ya instalado.

Actualmente permite obtener la triangulación STEP y la estructura básica de producto sin pasar primero por IFC.
El binding actual no expone todavía los círculos/cilindros B-Rep necesarios para llenar features exactas; por eso este adapter es transitorio.

La siguiente implementación OCCT debe mantener el mismo `StepGeometryAdapter` y añadir features `BREP_EXACT`.

## 7. Importación STEP directa

`StepVisualImporter` registra un STEP directamente como:

```text
AssetDefinition(format = STEP)
        |
        v
PieceDefinition
        |
        +--> visual prototype Three.js
        |
        +--> PieceEngineeringData
```

No necesita crear un IFC intermedio.

La API pública del core de precisión expone:

```ts
core.importStepPiece(document, input)
```

El editor STEP existente todavía conserva temporalmente el camino STEP -> IFC de trabajo para no romper el flujo actual durante esta migración. Ese camino debe retirarse cuando el editor cambie a `OcctStepGeometryAdapter + core.importStepPiece`.

## 8. Metadatos de pieza

FrameLogic es el dueño de los datos de ingeniería y comerciales:

```text
PieceEngineeringData
  |- material
  |- physical
  |    |- massKg
  |    `- volumeM3
  |- commercial
  |    |- unitCost
  |    |- assemblyCost
  |    |- currency
  |    `- supplier
  |- revision
  |- structuralAxis
  `- features
```

Parte de esta información puede exportarse a STEP AP242 o IFC, pero el archivo de intercambio no es la base de datos maestra de FrameLogic.

## 9. Features para montaje

El modelo admite features persistentes como:

- HOLE,
- CIRCLE,
- CYLINDER,
- AXIS,
- PLANE,
- POINT.

Ejemplo de un agujero:

```text
HOLE
  center
  axisDirection
  diameter
  depth
  source = STEP_BREP_EXACT
```

`StepEngineeringFeatureProvider` entrega sus centros/ejes al `GeometryQueryEngine`.
Un centro obtenido de B-Rep no depende de la cámara ni de la triangulación visual.

## 10. Ensamblajes

`AssemblyDefinition` representa un ensamblaje reutilizable sin fusionar los sólidos.

```text
AssemblyDefinition
  |- Component A -> PieceDefinition A + transform
  |- Component B -> PieceDefinition B + transform
  `- constraints
       |- COAXIAL
       |- CONCENTRIC
       |- COINCIDENT
       |- PARALLEL
       |- PERPENDICULAR
       |- DISTANCE
       `- FACE_TO_FACE
```

Varias colocaciones pueden reutilizar la misma PieceDefinition y, por tanto, el mismo STEP.

Las restricciones hacen referencia a features de ingeniería, no a posiciones aproximadas del cursor.

## 11. Peso y costo

`FrameLogicEngineeringModel` puede resumir un ensamblaje a partir de los datos de cada PieceDefinition:

- masa total,
- costo de piezas,
- costo de ensamble,
- costo total,
- moneda cuando es consistente.

Cuando OCCT entregue volumen exacto y exista densidad de material, la masa puede pasar a ser un dato calculado en lugar de manual.

## 12. Eje estructural

Cada PieceDefinition puede tener un `StructuralAxisDefinition` asociado mediante `PieceEngineeringData`.

El eje se expresa en coordenadas locales de la pieza:

```text
StructuralAxisDefinition
  |- start
  |- end
  |- localYDirection
  |- section
  |- source
  `- confirmed
```

Un eje detectado automáticamente puede guardarse como no confirmado hasta que el usuario lo acepte.

El eje estructural no tiene que coincidir con un eje principal geométrico del sólido.

## 13. Extracción del modelo estructural

`StructuralModelExtractor` toma las instancias colocadas y transforma los ejes locales a coordenadas de proyecto.

```text
PieceInstance + StructuralAxis
              |
              v
      PlacedStructuralAxis
              |
              v
       StructuralModel
       |- nodes
       `- members
              |
              v
            Awatif
```

Los extremos coincidentes se fusionan como nodos usando una tolerancia configurable.

Solo los ejes confirmados se incluyen por defecto.

## 14. API del core de precisión

El core expone:

```text
core.geometryQuery
core.snapEngine
core.measurement
core.precisionCamera
core.engineeringModel
core.structuralModel
core.importStepPiece(...)
```

Ejemplo conceptual:

```ts
core.engineeringModel.pieces.upsert({
  pieceDefinitionId,
  material: {
    name: "Steel",
    densityKgPerM3: 7850,
  },
  commercial: {
    currency: "COP",
    unitCost: 85000,
  },
  structuralAxis: {
    id: "main-axis",
    name: "Main structural axis",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 3, y: 0, z: 0 },
    source: "MANUAL",
    confirmed: true,
  },
});

const structuralModel =
  core.structuralModel.build();
```

## 15. Prioridad de snap

La intención de arquitectura es:

```text
STEP B-Rep exacto
      >
FrameLogic persistente/manual
      >
features derivadas de malla
      >
triángulo de superficie
```

La coordenada 3D es la autoridad. La distancia en pantalla solo sirve para descubrir y ordenar candidatos cercanos al cursor.

## 16. Migración recomendada

Orden de trabajo:

1. Mantener estable el flujo actual de selección/gizmo/cámara.
2. Migrar `StepPieceEditor` de STEP -> IFC temporal a `OcctStepGeometryAdapter + core.importStepPiece`.
3. Sustituir el adaptador OCCT transitorio por uno que exponga B-Rep exacto.
4. Detectar círculos, cilindros, agujeros, ejes y planos desde STEP.
5. Añadir UI para material, peso, tarifa, revisión y `structuralAxis`.
6. Añadir creación y edición de `AssemblyDefinition` y constraints.
7. Conectar `StructuralModel` con el contrato de cálculo de Awatif.
8. Mantener That Open como adaptador IFC de contexto/exportación, no como kernel geométrico principal.

## 17. Regla de diseño

FrameLogic no debe depender de IFC para definir una pieza STEP.

FrameLogic tampoco debe depender de una librería OCCT específica.

Los límites correctos son:

```text
FrameLogic Domain
    ^
    |
StepGeometryAdapter <--- OCCT implementation
    |
    +--- STEP

IfcAdapter <--- That Open / web-ifc
    |
    +--- IFC
```

Así STEP puede evolucionar hacia mayor precisión sin afectar la capa BIM, y la capa BIM puede cambiar sin afectar piezas, ensamblajes o cálculo estructural.
