# Criticality

Self-organizing critical system simulator.

This Vite + React + TypeScript webapp implements the model in `PLAN.md`, `PSEUDOCODE.md`, and `APP.md`. It visualizes a rectangle where each pixel is an agent with a random initial fuel level from 0 to 0.5, energy, threshold, activation probability, deactivation probability, resistance, and vigor. Random trigger inputs inject energy for 1 to 10 steps, quiescence suppresses new triggers when average energy is high, active agents convert fuel into energy, neighbors absorb active excess energy through resistance, dissipation bleeds energy away, and inactive agents refuel.

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
