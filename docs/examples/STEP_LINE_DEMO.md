# Ejemplos STEP — Insertar (demo)

Esta carpeta contiene los tres archivos STEP originales proporcionados para la prueba de FrameLogic:

| Archivo publicado | Archivo recibido | Uso |
| --- | --- | --- |
| REC1500.stp | Rec1500.stp | Primera pieza |
| REC3000.stp | Rec3000(1).stp | Segunda pieza |
| REC6000.stp | Rec6000.stp | Tercera pieza |

La función **Piezas → Insertar (demo)** utiliza estas geometrías publicadas con el sitio. No abre POSITIONS.json, DBFrameLogic.json ni archivos locales FLPIECE.

1. Dibuja una línea CAD con una longitud suficiente.
2. Pulsa **Insertar (demo)** y selecciona esa línea.
3. FrameLogic carga los STEP por su URL /examples/step/, mide el eje longitudinal de cada geometría y propone una secuencia fija REC1500 → REC3000 → REC6000.
4. Confirma la ocupación mostrada. Solo se crean piezas completas y el conjunto de instancias puede deshacerse y rehacerse.

El nombre de cada archivo indica la familia de ejemplo, pero no se interpreta como una dimensión de fabricación: se utiliza la longitud física calculada a partir de las mallas importadas. Por ahora el orden es provisional y se repetirá cuando quepa en la línea; el catálogo de posiciones volverá a integrarse en una fase posterior.

Los archivos STEP son datos estáticos de demostración, no ejecutables. Los originales se mantienen sin editar; no se añaden geometrías inventadas.
