# FrameLogic private development deployment

This repository is prepared for a private Cloudflare Pages development deployment.

## Cloudflare Pages build settings

Use these values when connecting the GitHub repository `RamonGaona/FrameLogic`:

- Production branch: `main`
- Preview branch to use for daily FrameLogic testing: `feature/precision-model-space`
- Root directory: repository root (`/`)
- Framework preset: React (Vite) or None
- Build command: `npm run build:cloudflare`
- Build output directory: `apps/web/dist`
- Node version: read from `.node-version`

The repository root must remain the build root because the web app depends on workspace packages under `packages/`.

`build:cloudflare` installs the Linux x64 native bindings required by Rolldown and Lightning CSS before running the normal FrameLogic web build. This avoids npm's cross-platform optional-dependency lockfile issue when the lockfile was generated on Windows.

## Automatic updates

Cloudflare Pages Git integration automatically creates a new deployment when a commit is pushed to the connected branch. The preview deployment for `feature/precision-model-space` will update when new commits are pushed to that branch.

## Private access

Preview deployments are public by default. In Cloudflare Pages:

1. Open the Pages project.
2. Go to Settings > General.
3. Enable the Access policy for preview deployments.
4. In Cloudflare Zero Trust > Access > Applications, restrict access to the account/email(s) allowed to test FrameLogic.
5. To protect the main `*.pages.dev` hostname as well, follow Cloudflare's documented Pages Access procedure for the production hostname and keep the preview wildcard policy enabled.

Do not add a custom public domain for the development environment unless it is later required.

## Recommended workflow

`ChatGPT / developer -> GitHub feature/precision-model-space -> GitHub web-build CI -> Cloudflare Pages preview -> private browser test`

A failed build must not be treated as a valid development release. Keep testing the last successful deployment until the branch build is green.

## OpenCascade / WASM

`apps/web/vite.config.ts` aliases `opencascade.js` to the local Vite runtime wrapper. The wrapper imports `opencascade.full.wasm` with `?url`, so Vite emits the WASM as a static build asset. The GitHub `Web build` workflow checks that the final `apps/web/dist` directory contains a `.wasm` file.

## Local equivalent

The regular local workflow remains:

```powershell
npm install
npm.cmd run typecheck
npm.cmd run build
```

The Cloudflare/Linux build command is:

```text
npm run build:cloudflare
```

The generated static site is in `apps/web/dist`.
