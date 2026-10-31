# Criticality

Self-organizing critical system simulator.

This Vite + React + TypeScript webapp implements the model in `PLAN.md`, `PSEUDOCODE.md`, and `APP.md`. It visualizes a rectangle where each pixel is an agent with a random initial fuel level from 0 to 0.5, energy, threshold, activation probability, deactivation probability, resistance, and vigor. Random trigger inputs inject energy for 1 to 10 steps, quiescence suppresses new triggers when average energy is high, active agents convert fuel into energy, neighbors absorb active excess energy through resistance, dissipation bleeds energy away, and inactive agents refuel.

## Using it

The whole app fits one desktop screen: the grid takes whatever space is left, controls sit in a compact panel (hover a control for its description), and narrow screens stack and scroll.

Every setting applies to the live world immediately — no Reset needed:

- World variables (trigger rate, dissipation, ...) are read on every step.
- Agent defaults and variability are re-applied to every existing agent. Each agent keeps its own random variation factors, so the spread survives the change.
- Width and height resize the running grid; agents keep their coordinates and new cells start from the current defaults.
- History length trims the charts at once; editing the seed rebuilds the world from that seed.

### Presets

The Scenario picker holds built-in presets alongside your saved setups. Each preset is a parameter set plus a seed, found by sweeping the model headlessly (`src/simulation/presets.ts`):

| Preset | What to watch |
| --- | --- |
| Boiling | The shipped defaults are supercritical: one spark ignites the sheet, which then seethes at ~40% active. |
| Embers | Subcritical. Sparks flicker and die before they spread. |
| Edge of chaos | Just below the wave transition: cascades of every size bloom, crescent, and fizzle. |
| Ripples | Excitable medium: rings with refractory wakes that annihilate on contact. |
| Spiral | Same medium, lucky seed: a broken front curls into a self-sustaining spiral by ~tick 1300. |
| Wildfire | Slow regrowth: fronts burn through a depleted landscape, then wait for fuel. |
| Turbulence | Maximum variability: fronts tear into drifting fragments. |

Seeds reproduce a run only at the preset's own grid size, and only in production builds (React StrictMode double-invokes state updaters in dev, which consumes extra random draws).

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
