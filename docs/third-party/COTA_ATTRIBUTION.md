# Reutilización de ideas de Cota · FrameLogic v0.1.91

**Proyecto original:** Cota — Christian Orengia (Copyright © 2026).
**Repositorio:** https://github.com/mxchristian17/cota
**Licencia:** Apache License 2.0
**Licencia completa:** https://github.com/mxchristian17/cota/blob/main/LICENSE
**Avisos originales:** https://github.com/mxchristian17/cota/blob/main/NOTICE

## Alcance

El planificador `packages/bim/core/src/drawing/AutoDrawingPlanner.ts`
adapta conceptos de `core/drawing/viewgen.ts` y
`core/dimension/autodim.ts` de Cota para calcular disposiciones de
vistas y propuestas de acotación.

Se reescribió el modelo de datos para los tipos y referencias de FrameLogic:
- Las vistas se calculan sobre los límites espaciales del ensamblaje 3D.
- Las cotas automáticas consultan referencias exactas del B-Rep de OpenCascade.
- No se integró el sistema de sólidos, DocumentModel, store, PDF ni el
  motor de comandos de Cota.
- No se importaron sus bibliotecas adicionales ni el nombre o logotipo de Cota.

Los cálculos de B-Rep, la representación del STEP maestro y el formato de
proyectos de FrameLogic permanecen independientes. Las cotas derivadas
necesitan una revisión técnica, especialmente en piezas curvas, ensamblajes
complejos y casos con proyección de ejes inclinados.

## Aviso de atribución

Cota
Copyright 2026 Christian Orengia
https://github.com/mxchristian17

Licensed under the Apache License, Version 2.0.
Redistributions of adapted portions must preserve the original license,
copyright and NOTICE attribution to the extent required by Section 4.

Cota and its logo are trademarks of their owner, not part of FrameLogic.
