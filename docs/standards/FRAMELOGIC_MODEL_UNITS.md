# FrameLogic Model Units

## Unidad lineal canónica

A partir de la migración de unidades, **1 unidad geométrica de FrameLogic = 1 milímetro (mm)**.

Esta regla aplica a todo dato lineal propio del Model Space:

- coordenadas X/Y/Z;
- posición de `PieceInstance`;
- puntos y líneas CAD;
- SNAPs persistentes;
- orígenes de WorkPlane;
- ejes y geometría de referencia;
- radios, diámetros, profundidades y longitudes geométricas;
- secciones y volúmenes de corte;
- referencias de cotas;
- geometría de Views de ensamble;
- desplazamientos y entrada numérica de MOVE/POINT/LINE.

## Importación

STEP e IFC son formatos externos y pueden declarar otras unidades. La frontera de importación debe normalizar su geometría al sistema interno de FrameLogic. Una vez dentro del Model Space, la geometría se expresa en milímetros.

STEP se solicita directamente a OpenCascade en milímetros. IFC se normaliza a milímetros en la frontera de importación antes de usarse como geometría propia de FrameLogic.

## Paper Space

Las hojas ISO A0-A4 ya están definidas en milímetros. Por tanto, para una escala `1:N`, la conversión de Model Space a papel es directamente:

`paper_mm = model_mm / N`

No debe existir un factor adicional de `1000` entre Model Space y Paper Space.

## Unidades que no cambian

La migración lineal no cambia magnitudes que ya tienen una unidad física explícita distinta:

- rotaciones: radianes internamente;
- ángulos mostrados: grados cuando corresponda;
- masa: kg;
- densidad: kg/m³;
- volumen físico: m³;
- propiedades de sección: m² y m⁴ cuando así lo declara el contrato de ingeniería;
- tiempo: horas;
- moneda/costos: según sus campos propios.

## Compatibilidad

Los archivos `.flproject` y `.flpiece` nuevos se marcan con `lengthUnit: "mm"`.

Los archivos anteriores que no incluyen ese campo se consideran archivos históricos en metros. Al abrirlos, FrameLogic convierte automáticamente sus coordenadas y longitudes geométricas multiplicándolas por `1000`, conservando el mismo tamaño físico.

Las coordenadas de Paper Space (posición de textos, offsets de anotaciones y layout de hoja) no se convierten durante esta migración porque ya son coordenadas de presentación, no coordenadas del modelo.
