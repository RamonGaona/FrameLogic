# Abrir DWG/DXF con el motor adaptado de Cota — FrameLogic v0.1.133

## ¿Por qué una vía nueva?

En la v0.1.131, un DWG que producía aproximadamente 1.400.000 segmentos
podía sobrepasar la memoria del navegador porque cada segmento se convertía
en una entidad editable con UUID, punto inicial y final, historial, etc.
La corrección v0.1.132 limitó los SNAP, pero todavía guardaba cada segmento
como objeto individual.

Cota (Apache-2.0) utiliza un lector CAD `@node-projects/acad-ts`,
escritura DXF en UTF-8 sin concatenar millones de fragmentos y transferencia
de datos geométricos empaquetados por Web Worker. Este modo adapta dichas
técnicas al modelador de FrameLogic.

## Cómo utilizar

1. Abrir un proyecto vacío de FrameLogic.
2. En **ARCHIVO → Abrir CAD (motor Cota)** elegir .DWG o .DXF.
   Incluye DXF ASCII y binario.
3. Confirmar las unidades reales de origen. **mm siempre equivale a ×1**
   incluso si `INSUNITS` informa metros.
4. Se conserva la geometría visible que interpreta el parser de FrameLogic,
   los colores/capas compatibles y los textos/atributos legibles. No se
   crean 1.400.000 entidades editables individuales.
5. El importador manda paquetes transferibles con como máximo 8.192 líneas,
   conservando coordenadas `Float64`, y los dibuja agrupados con origen
   local `Float32` en GPU.
6. Es posible ocultar la referencia/capas y usar SNAP de las líneas
   visuales compatibles. En vistas muy densas el índice de SNAP solo retiene
   una muestra; acercar la cámara para obtener todos los candidatos locales.
7. El archivo .flproject guarda el buffer compacto de esta referencia;
   el autoguardado se pausa cuando contiene más de 100.000 segmentos
   compactos para evitar generar otra copia de gran tamaño cada minuto.
   **Guardar manualmente** para no perder el proyecto.

## Limitaciones deliberadas

- **Referencia ligera de solo lectura.** MOVER, GIRAR y COPYBASE sobre
  referencias compactas están protegidos para impedir un resultado parcial;
  usar **ARCHIVO → Abrir DWG/DXF** si esas operaciones son necesarias ahora.
- Para DWG el conversor Cota se ejecuta con `acad-ts`; el parser geométrico
  de FrameLogic sigue siendo el encargado de interpretar entidades y expandir
  bloques. No es una integración de todas las capacidades del editor Cota.
- `XREF`, algunas entidades `ACAD_PROXY_ENTITY`, sólidos ACIS, fuentes
  externas, gráficos especiales y acotaciones avanzadas no se reconstruyen
  por completo. Tampoco se prometen 1.400.000 **entidades nativas**: son
  segmentos visuales compactos obtenidos de geometría compatible.
- No se elimina el límite físico de RAM. Archivos muy grandes todavía
  pueden agotar memoria durante la conversión de DXF, el guardado o el
  cálculo de geometría temporal. Validar con el DWG original en Firefox
  y Chrome.
- El modo editable original y su herramienta «Recuperar DWG» no cambian.
