# Criticality

Self-organizing critical system simulator.

The app visualizes a rectangle where each pixel is an item with health from 0 to 1. Low-health items are pathological; they can increase the pathology of adjacent neighbors, while random external events can trigger pathology anywhere in the system.

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
