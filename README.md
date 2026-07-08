# Criticality

Self-organizing critical system simulator.

This Vite + React + TypeScript webapp implements the model in `PLAN.md`, `PSEUDOCODE.md`, and `APP.md`. It visualizes a rectangle where each pixel is an agent with fuel, energy, threshold, propensity, coupling, and vigor. Random triggers inject energy, active agents convert fuel into energy, neighbors absorb released energy, dissipation bleeds energy away, and inactive agents refuel.

## Develop

```bash
npm install
npm run dev
```

## Verify

```bash
npm test
npm run typecheck
npm run build
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, builds the Vite app, and publishes `dist/` to GitHub Pages.
