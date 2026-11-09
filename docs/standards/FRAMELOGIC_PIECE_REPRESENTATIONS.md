# Representaciones visuales de piezas

## Contrato de precisión

El STEP original es el maestro CAD. Las mallas son exclusivamente visuales.
`PieceDefinition.coordinateSystem`, `snapPoints`, `referenceGeometry` y los datos
de ingeniería mantienen su sistema local y precisión aunque cambie la malla.
Las instancias conservan su identidad y transformación al cambiar de nivel.

En v0.1.59, el B-Rep original continúa vivo para las consultas exactas. El raycast
usa la malla detallada y los proveedores derivados consultan esa misma malla;
ninguna medición se obtiene de la aproximación de trabajo.

## Representaciones disponibles

| Nivel | Uso | Generación |
| --- | --- | --- |
| LOW | Vista básica | Agrupación espacial, 40 celdas sobre la dimensión mayor |
| WORK | Diseño | Agrupación espacial, 160 celdas sobre la dimensión mayor |
| DETAIL | Detalle, selección bajo demanda y preparación | Malla original preparada |

El selector de Render controla el cambio. Diseño es el valor inicial; Detalle
seleccionado mantiene ligeras las piezas restantes. Preparar pieza fuerza detalle
para esa instancia cuando se solicita. Desde v0.1.92 el modo opcional
**Automático (zoom)** escoge LOW/WORK/DETAIL por tamaño proyectado, con
histéresis, y mantiene en DETAIL la selección y la preparación. Los modos
manuales anteriores continúan disponibles y el predeterminado sigue siendo
Diseño. El cálculo automático es exclusivamente visual; nunca reemplaza la
geometría B-Rep original para consultas, medidas o raycasts.

Los niveles son aproximaciones visuales, no tolerancias de fabricación ni límites
garantizados de triángulos. Los detalles pequeños pueden desaparecer en LOW/WORK.
Las mallas con menos de 2.000 triángulos, UV, skinning, morph targets o múltiples
grupos se conservan completas. Si la reducción es ineficaz o colapsa toda la
geometría, se conserva también el detalle original.

Las representaciones se calculan una sola vez por geometría y se comparten entre
instancias. Las jerarquías siguen siendo objetos seleccionables individuales:
esta versión comparte buffers, pero no agrupa llamadas de dibujo con InstancedMesh.

## Archivo de pieza

Se conserva el esquema `.flpiece` JSON v1 para los lectores existentes:

```text
FRAMELOGIC_PIECE
├── geometry: STEP/IFC maestro original, sin modificaciones
├── visualRepresentations (opcional, piezas STEP)
│   ├── format: GLB
│   ├── lengthUnit: mm
│   ├── sourceSha256
│   ├── low: GLB en base64
│   ├── work: GLB en base64
│   ├── detail: GLB en base64
│   └── products: árbol original de productos
├── definition: origen, puntos, ejes y propiedades
└── engineering: material, features y modelo analítico independiente
```

Al abrir una pieza con caché compatible se leen los GLB y se carga el B-Rep desde
el STEP maestro. Así se evita volver a inicializar el kernel visual y triangular
el STEP. Las coordenadas y el árbol de productos se conservan en milímetros.
Una caché ausente, incompatible o ilegible utiliza la importación STEP normal.

El guardado de proyectos mantiene su contrato actual, con una fuente geométrica
por definición y transformaciones por instancia. Las cachés persistentes de GLB
en proyectos completos todavía no están implementadas. Tampoco cambia el flujo
de importación IFC.

## Consultas y recursos

Antes del raycast de precisión se descartan las instancias cuya caja envolvente
de detalle no cruza el rayo. Se conserva la prioridad existente de referencias
explícitas. Este filtro no sustituye un BVH y no cambia las tolerancias de SNAP.

Las tres geometrías se liberan con su prototipo; las instancias no liberan los
buffers compartidos. Al reemplazar la geometría se regeneran las aristas del modo
Render que correspondan.

## Evolución prevista

El empaquetado ZIP `.flp` deberá conservar un manifiesto, STEP maestro, tres GLB,
referencias y propiedades separadas. Compresión Meshopt/Draco, instancing GPU,
BVH, caché persistente de proyectos y carga diferida del B-Rep requieren fases
posteriores con sus propias validaciones. No se modifica el contrato de precisión
para introducir estas optimizaciones.
