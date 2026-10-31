import { DEFAULT_PARAMETERS, type WorldParameters } from "./criticality";

export interface Preset {
  id: string;
  name: string;
  /** One line on what to watch for. */
  description: string;
  seed: number;
  parameters: WorldParameters;
}

function preset(
  id: string,
  name: string,
  description: string,
  seed: number,
  overrides: Partial<WorldParameters>
): Preset {
  return { id, name, description, seed, parameters: { ...DEFAULT_PARAMETERS, ...overrides } };
}

/**
 * Built-in scenarios, each a parameter set plus a seed. Regimes were found by
 * sweeping threshold, dissipation, vigor and variability headlessly; seeds were
 * picked so the interesting behavior shows up early. Seeds only reproduce the
 * same run at the preset's own grid size.
 */
export const PRESETS: readonly Preset[] = [
  preset(
    "boiling",
    "Boiling",
    "The shipped defaults: supercritical. One spark ignites the sheet, which then seethes at ~40% active.",
    23,
    {}
  ),
  preset(
    "embers",
    "Embers",
    "Subcritical: high threshold and dissipation. Sparks flicker and die before they can spread.",
    12,
    { defaultThreshold: 0.22, dissipationRate: 0.07 }
  ),
  preset(
    "edge-of-chaos",
    "Edge of chaos",
    "Tuned just below the wave transition: cascades of every size bloom, crescent, and fizzle.",
    23,
    { defaultThreshold: 0.14, dissipationRate: 0.077 }
  ),
  preset(
    "ripples",
    "Ripples",
    "Excitable medium: triggers launch rings that trail a refractory wake and annihilate on contact.",
    10,
    { defaultThreshold: 0.14, dissipationRate: 0.07 }
  ),
  preset(
    "spiral",
    "Spiral",
    "Same medium, lucky seed: a broken front curls into a self-sustaining spiral by ~tick 1300.",
    7,
    { defaultThreshold: 0.18, dissipationRate: 0.04, ticksPerSecond: 60 }
  ),
  preset(
    "wildfire",
    "Wildfire",
    "Slow regrowth (low vigor): fronts burn through a depleted landscape, then wait for fuel.",
    22,
    { defaultVigor: 0.002 }
  ),
  preset(
    "turbulence",
    "Turbulence",
    "Maximum agent variability: fronts tear on heterogeneous cells into drifting fragments.",
    23,
    { defaultThreshold: 0.16, dissipationRate: 0.06, variability: 0.5 }
  )
];
