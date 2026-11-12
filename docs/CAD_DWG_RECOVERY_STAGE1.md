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
   cobertura sin cambios incompatibles de escala/unidades.
6. El usuario confirma la unidad *real* del DWG antes de crear entidades;
   mm permanece como opción inicial para evitar errores ×1.000.

No se fusionan dibujos ni se fabrican líneas para cubrir ausencias. El cuadro
final informa cantidades, lector elegido y errores de conversión. La lectura
alternativa no ejecuta operaciones sobre servicios externos ni requiere pagos.

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
    npm run test:dwg-recovery
    npm run typecheck
    npm run build

## Licencias y límites

La estrategia está adaptada de Cota (Apache-2.0) y su dependencia de lectura
acad-ts (MIT). La información de licencia se conserva en el código y en esta
nota. La geometría incompleta, especialmente ACAD_PROXY_ENTITY, XREF y
algunos sólidos ACIS, requiere una inspección manual antes de fabricación.

No se ha ejecutado todavía una comparación visual con el DWG binario original
aportado por el usuario.
