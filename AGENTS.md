# FrameLogic release versioning policy

Every pull request or code/documentation update integrated into `main` must:

1. Increment the root `package.json` patch version (`0.1.x`).
2. Synchronize the top-level `version` and `packages[""].version` in `package-lock.json`.
3. Add a new topmost section in `CHANGELOG.md` describing the real change, without claiming browser validation, deployment or performance improvements that were not checked.
4. Include the version in the pull request description.

Use `npm run version:patch -- "Descripción concreta del cambio"` to update all three files in one command. Never hardcode the version in a UI badge: Vite derives it from the root manifest. Avoid updating independent JSON catalog versions unless the corresponding catalog itself changed.

The Release version policy workflow checks all pull requests to `main` and pushes on `main`. Its successful status should be required by branch protection to prevent bypasses; a CI workflow alone cannot prohibit direct pushes or external deployments.
