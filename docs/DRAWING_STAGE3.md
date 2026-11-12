# FrameLogic — Etapa 3: acotación y vistas proyectadas (v0.1.128)

El módulo **Drawing** ya incluía `Vistas auto`, `Cotas auto` y exportación PDF/DXF/SVG.
Esta etapa refina el flujo de dibujo sin reemplazar el modelador ni introducir servicios de pago.

## Crear un plano con cuatro vistas
1. Cargar un modelo 3D con piezas STEP y abrir Drawing/Plano.
2. Pulsar **Vistas auto**. Se crean alzado, planta, lateral e isométrica, con un
   marco propio para cada vista y el cajetín fuera del área proyectada.
3. Elegir **ISO E · 1.er diedro** (planta abajo, lateral derecha de la pieza a la
   izquierda de alzado) o **ISO A · 3.er diedro** (planta arriba, lateral a la derecha).
4. Mover/redimensionar marcos a mano si hace falta. No se reacomodan solos tras
   editar; **Organizar auto** reaplica la disposición elegida si se desea.

## Generar cotas
1. En el plano de una vista ortográfica elegir **Cotas · conjunto** para acotar
   el volumen geométrico global, o **Cotas · por pieza** para acotar cada pieza
   visible con vértices exactos.
2. Elegir **Cotas · desde base** o **Cotas · en cadena**, y **Cotas · detalles**
   (estaciones y diámetros) o **Cotas · generales** (alto/ancho).
3. Pulsar **Cotas auto**. Se sustituyen solo las cotas automáticas anteriores
   del plano activo, respetando anotaciones manuales y referencias B-Rep.
4. Revisar valores, líneas ocultas, escala, ortogonalidad, tolerancias,
   cantidades y dimensiones antes de imprimir o exportar PDF/DXF/SVG.

## Limitaciones
- Los planos existentes con posiciones personalizadas no se reorganizan
  automáticamente al restaurarse.
- La agrupación `n× Ø` solo incluye centros circulares exactos que se pueden
  representar en la vista; no se asumen diámetros a partir de segmentos
  poligonales ni de referencias DWG/DXF sin topología exacta.
- La vista isométrica se ofrece como referencia, no para acotación automática.
- Las cuatro vistas se calculan a partir de los límites 3D visibles; verificar
  si la orientación principal elegida coincide con la requerida para fabricación.
- No se genera lista de materiales ni se asegura conformidad normativa completa
  de planos de taller sin revisión técnica.

## Validación
```sh
npm run test:drawings
npm run typecheck
npm run build
```

Créditos: criterios de distribución ortográfica y acotación automática
inspirados en [Cota](https://github.com/mxchristian17/cota),
Copyright 2026 Christian Orengia, Apache-2.0. Implementación adaptada a
TypeScript/Three.js, geometría B-Rep y estado de dibujo de FrameLogic.
