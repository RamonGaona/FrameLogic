# Recuperación DWG — Etapa 1 (v0.1.127)

FrameLogic mantiene la importación rápida con **Abrir DWG/DXF**. Para archivos
DWG con bloques, perfiles o textos faltantes, utiliza **Recuperar DWG**.

## Proceso

1. Se ejecuta el lector principal DWG basado en WASM en un Web Worker.
2. En modo recuperación, se ejecuta además el lector independiente
   [acad-ts](https://github.com/node-projects/acad-ts), v3.6.0, utilizado por
   [Cota](https://github.com/mxchristian17/cota).
3. Se convierte cada resultado a geometría FrameLogic usando el mismo parser:
   INSERT anidados, líneas, arcos, polilíneas, TEXT, MTEXT y ATTRIB. Se omiten
   XREF externos y HATCH, según las prioridades ya establecidas.
4. Se comparan segmentos estructurales y textos, bloques sin resolver,
   geometría truncada, dimensiones generales y metadatos INSUNITS.
5. El lector alternativo solo reemplaza el resultado si hay ganancia de
   cobertura sin cambios incompatibles de escala. Si los lectores discrepan en INSUNITS, se advierte y se confirma la unidad real del DWG.
6. El usuario confirma la unidad *real* del DWG antes de crear entidades;
   mm permanece como opción inicial para evitar errores ×1.000.

No se fusionan dibujos ni se fabrican líneas para cubrir ausencias. El cuadro
final informa cantidades, lector elegido y errores de conversión. La lectura
alternativa no ejecuta operaciones sobre servicios externos ni requiere pagos.

## Corrección v0.1.129 — lector alternativo en web

La prueba real con `CUNAS_MEDIR 1.dwg` detectó que la versión publicada del
lector alternativo fallaba con `na is not a DXF subclass`. El fallo aparece
únicamente tras la minificación del Web Worker por Vite/Rolldown, que cambia
`constructor.name` y rompe las tablas de subclases usadas por `acad-ts`.
Se conservan los nombres de clase tanto en la compilación web como en la del
Web Worker, siguiendo la solución de Cota v2.10.4.

El resumen anterior de 240.000 segmentos y 143 entidades pendientes **no era
una recuperación**: provenía del lector principal porque falló el alternativo.
La siguiente prueba con `Recuperar DWG` debe mostrar el número de segmentos,
textos y lector seleccionado, o el diagnóstico si ninguno gana cobertura.

**Escala:** no seleccionar `m` ni `auto` solo porque el DXF convertido
indique metros. Si la longitud que AutoCAD muestra está ya en milímetros,
seleccionar `mm`: el resumen debe decir `factor ×1`. La detección de una
longitud final anómala por multiplicación ×1.000 exige confirmación adicional.

**Límite:** se mantienen 240.000 segmentos como máximo por seguridad del
navegador. Aunque el lector alternativo funcione, un DWG extremadamente
detallado puede seguir necesitando importar por partes o simplificar
la geometría. Un resultado parcial no está verificado para fabricación.

## Selección de unidades v0.1.130

Tras convertir el DWG (en el modo Abrir o Recuperar), FrameLogic muestra
un **selector real** con mm, cm, m, pulgadas y pies. Esta ventana reemplaza
el campo de texto anterior y muestra tanto el factor como el tamaño del
archivo en las unidades originales y en milímetros. Seleccionar
`Milímetros (mm) — ×1` aplica exactamente ×1 incluso cuando el DXF
convertido indica `INSUNITS = 6` (metros). No existe una opción de
`auto` para DWG, para evitar confundir los metadatos del conversor con
la unidad física del dibujo.

Para `CUNAS_MEDIR 1.dwg`:
- Seleccionar **mm** y comprobar que aparece `Factor que se aplicará: ×1`.
- Si la extensión bruta muestra 461.564,8 unidades, la extensión
  resultante debe mostrar aproximadamente **461.564,8 mm**, nunca
  461.564.801 mm.
- Se puede pulsar **Cancelar** sin crear capas, geometría o textos.
- Los DWG ya importados con escala errónea requieren eliminar la referencia
  y reimportarla; los proyectos guardados previamente no cambian.
- Esta mejora no aumenta el máximo de 240.000 segmentos ni completa
  automáticamente entidades que excedan dicho límite.

## Importación de DWG sin límite global de segmentos (v0.1.131)

Para los archivos con extensión **DWG** se eliminó el recorte global de
240.000 segmentos. Los lectores principal y alternativo expanden las
entidades y los INSERT sin esa cuota; los registros se envían desde
el procesador Web Worker al importador principal en lotes de 8.192,
esperando una confirmación antes de transferir el siguiente lote.

Se mantiene el procesado de registro por lotes de 1.800 elementos para
no bloquear la interfaz durante la creación del modelo. El resultado
debe incluir una indicación de que se importaron más de 240.000 líneas
cuando el archivo realmente las contiene. DXF conserva el tope anterior.

**Importante:** esto no significa que FrameLogic pueda abrir un archivo
de tamaño ilimitado: la RAM y la capacidad del navegador siguen siendo
limitaciones reales. XREF, sombreados HATCH, proxies CAD y algunos
gráficos de cotas no están incluidos en la cobertura garantizada.
Los controles de unidades de la v0.1.130 no cambian: escoger mm
mantiene las coordenadas y los textos con factor ×1.

## DWG con 1,4 millones de segmentos: memoria y SNAP (v0.1.132)

La v0.1.131 permitía importar más de 240.000 segmentos, pero el navegador
podía quedarse sin memoria al recibir y registrar unos 1,4 millones de
segmentos, especialmente cuando reconstruía las referencias SNAP.

La v0.1.132 reduce varios duplicados de datos:
- El Worker comunica la extensión y cantidad de elementos; el selector de
  unidades funciona sin recibir todavía todas las líneas.
- Tras elegir **mm ×1**, el registro avanza por lotes de 8.192 segmentos,
  con acuse de recibo después de registrar cada lote. No se acumula otro
  array entero de 1,4 millones de objetos en el hilo principal.
- El renderizador cuenta las líneas por capa y genera directamente el
  buffer gráfico sin duplicar otra matriz de objetos por capa.
- El índice de SNAP solo guarda hasta **120.000 candidatos visibles** y
  reparte esa muestra por el plano cuando la vista es demasiado densa.
  **No es un límite de importación**: el dibujo y las líneas originales
  siguen completos. Para utilizar SNAP exactos en una zona, acercar la
  cámara hasta que la cantidad visible de líneas esté por debajo del
  presupuesto. No se garantiza precisión absoluta de SNAP en vistas
  globales con millones de segmentos superpuestos.
- Para evitar dos copias completas de un archivo DWG enorme, al utilizar
  «Recuperar DWG» se omite la comparación simultánea con el segundo lector
  si el principal produjo más de 350.000 segmentos, mostrándolo en
  el diagnóstico. El segundo lector sigue siendo fallback si el primero
  falla.

Esto mejora la estabilidad, pero no elimina todos los límites de memoria
del dispositivo: millones de líneas siguen ocupando RAM en el modelo y
ciertas operaciones globales como mover/copiar un plano muy grande pueden
ser costosas. Los archivos DWG binarios originales deben comprobarse en
Firefox y Chrome antes de utilizarlos en fabricación.

## Comprobación manual con el DWG original

- Confirmar tubos y bloques con ATTRIB y TEXT interiores (p. ej. "4S 3000"
  y "P6 3000") frente a AutoCAD.
- Abrir el mismo DWG en ambos modos y comparar perfiles, textos y dimensiones.
- Verificar que 15.005,75 mm no se transforme en 15.005.750 mm; inspeccionar
  INSUNITS cuando ambos lectores informen códigos diferentes.
- Probar DWG con bloques anidados, cotas dentro de INSERT, XREF y planos grandes.
- Confirmar selección, SNAP, movimiento, persistencia en .flproject y
  funcionamiento tanto en Firefox como en Chrome.

## Pruebas técnicas

    npm run test:dwg-import
    npm run test:dwg-recovery  # incluye protección de nombres de clase y escala
    npm run typecheck
    npm run build

## Licencias y límites

La estrategia está adaptada de Cota (Apache-2.0) y su dependencia de lectura
acad-ts (MIT). La información de licencia se conserva en el código y en esta
nota. La geometría incompleta, especialmente ACAD_PROXY_ENTITY, XREF y
algunos sólidos ACIS, requiere una inspección manual antes de fabricación.

No se ha ejecutado todavía una comparación visual con el DWG binario original
aportado por el usuario.
