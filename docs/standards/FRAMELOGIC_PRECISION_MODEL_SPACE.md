# FrameLogic Precision Model Space

## Objetivo

El espacio modelo de FrameLogic debe priorizar inspección geométrica, selección y obtención de puntos 3D confiables. No busca editar sólidos mediante operaciones tipo Pull/Push.

La autoridad de una operación de SNAP es siempre una coordenada 3D calculada. La posición aparente del cursor en pantalla solamente sirve para encontrar candidatos.

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
- origen y punto cercano sobre ejes persistentes.

El motor admite `GeometryQueryProvider`. Esta interfaz permite conectar en el futuro fuentes geométricas exactas sin acoplar el núcleo a un kernel CAD específico.

### MeshAnalyticFeatureProvider

Analiza las aristas visibles de una malla para obtener información de ingeniería adicional:

- reconoce bucles circulares;
- deriva el eje normal de un agujero/borde circular;
- calcula intersecciones 3D entre una CAD line de FrameLogic y una arista de una pieza IFC.

Los resultados de esta capa se marcan como `DERIVED_MESH`, porque proceden de una triangulación y no de una curva B-Rep exacta.

### PrecisionSnapEngine

Se instala sobre el `DesignSnapController` existente. No elimina el SNAP actual ni cambia sus SNAPs persistentes.

Combina:

1. SNAP existente de FrameLogic;
2. resultados del `GeometryQueryEngine`;
3. proveedores analíticos adicionales.

Prioridad general:

1. SNAP manual/origen/conexión;
2. intersección;
3. centro;
4. extremo/vértice/punto;
5. punto medio;
6. referencia/eje/punto más cercano.

Un impacto arbitrario sobre una cara triangulada queda disponible para consulta geométrica, pero no se convierte automáticamente en SNAP. Esto evita que una cara tape candidatos geométricos más útiles.

### MeasurementEngine

Proporciona operaciones matemáticas reutilizables:

- distancia 3D;
- componentes X/Y/Z;
- distancia horizontal y vertical;
- ángulo entre tres puntos;
- distancia/proyección de punto a segmento;
- distancia/proyección de punto a plano;
- proyección sobre eje;
- longitud de polilínea.

### PrecisionCameraController

Mejora la inspección cercana sin modificar la geometría:

- mantiene un `near clipping plane` pequeño y proporcional a la distancia de cámara;
- conserva un `far plane` suficiente para modelos grandes;
- permite fijar el punto de inspección/órbita;
- permite enfocar objetos o cajas 3D.

Complementa la navegación CAD cercana que ya existe en `createBimCore`.

## Niveles de precisión

Cada resultado declara su origen:

- `MODEL_EXACT`: coordenada almacenada explícitamente por FrameLogic (CAD point, CAD line, SNAP persistente, eje persistente, etc.).
- `DERIVED_MESH`: característica reconstruida desde la malla triangulada (vértice, arista, centro circular detectado, eje de agujero derivado, intersección línea-arista IFC).
- `TRIANGULATED_SURFACE`: punto obtenido directamente sobre un triángulo renderizado.

`MODEL_EXACT` no significa que un IFC triangulado se haya convertido mágicamente en B-Rep. Significa que el dato consultado existe explícitamente en el modelo de FrameLogic.

## OpenCascade

OpenCascade no es una dependencia de esta rama.

No se necesita para el objetivo actual de FrameLogic porque no se implementan operaciones de modificación de sólidos.

La integración futura recomendada es un adaptador que implemente `GeometryQueryProvider` y entregue características STEP/B-Rep precalculadas como resultados `MODEL_EXACT`:

```text
STEP / B-Rep
    ↓
OpenCascade adapter
    ↓
GeometryQueryProvider
    ↓
GeometryQueryEngine
    ↓
PrecisionSnapEngine / MeasurementEngine
```

Así OpenCascade puede utilizarse únicamente para lectura y consulta exacta de geometría CAD: centros matemáticos, arcos, círculos, ejes cilíndricos, vértices y curvas. Three.js continúa siendo responsable de visualización e interacción.

## API pública añadida

`createBimCore()` ahora expone además:

```ts
core.geometryQuery
core.snapEngine
core.measurement
core.precisionCamera
```

Ejemplo de consulta:

```ts
const candidates = core.geometryQuery.queryAt(
  pointer.clientX,
  pointer.clientY,
);

const best = candidates[0];

if (best) {
  console.log(
    best.kind,
    best.point,
    best.precision,
  );
}
```

Ejemplo de medición:

```ts
const measurement = core.measurement.measureDistance(
  firstPoint,
  secondPoint,
);

console.log(measurement.distance);
```

## Criterio de aceptación

Antes de unir esta rama a una rama estable se debe comprobar como mínimo:

1. `npm.cmd run typecheck` pasa sin errores.
2. Los SNAPs anteriores siguen funcionando.
3. Mover el punto base del gizmo a una intersección conserva exactamente la misma coordenada después de orbitar la cámara.
4. Una intersección aparente en pantalla que no sea intersección 3D real no genera `INTERSECTION`.
5. Los centros detectados en agujeros se mantienen fijos al cambiar la cámara.
6. Una CAD line puede detectar una intersección 3D con una arista IFC cuando realmente comparten el mismo punto espacial.
7. La cámara puede acercarse al modelo sin clipping excesivo ni pérdida severa de movilidad.
