# Cota — Attribution and scope of reuse

- Upstream: https://github.com/mxchristian17/cota
- Author / copyright: Copyright 2026 Christian Orengia.
- License: Apache License, Version 2.0.
- License: [COTA_APACHE_2_0.txt](../licenses/COTA_APACHE_2_0.txt)
- Upstream NOTICE: [COTA_NOTICE.txt](../licenses/COTA_NOTICE.txt)
- Underlying DWG reader: `@node-projects/acad-ts`, MIT, as declared upstream.

FrameLogic **adapts** Cota's `cadRead.ts`, `dwgConvert.ts`,
`cadWorker.ts`, and `meshTransfer.ts` architectural patterns to its own
TypeScript/Three.js domain. The modified files
`CotaCadReader.ts` and `CotaCompactCadGeometry.ts` carry source
attribution, new compatibility logic and FrameLogic-specific interfaces.

This is NOT a copy of all of Cota, its user interface, or its renderer.
The Cota name identifies the upstream implementation, not a partnership,
official integration, certification or endorsement. The Cota name and logo
are not adopted as FrameLogic branding.
