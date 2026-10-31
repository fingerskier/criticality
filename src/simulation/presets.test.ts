import { describe, expect, it } from "vitest";
import { createSeededRandom, createWorld, stepWorld, type WorldParameters } from "./criticality";
import { PRESETS, type Preset } from "./presets";
import { loadCurrentSettings, saveCurrentSettings, type SettingsStorage } from "../storage/settings";

function memoryStorage(): SettingsStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key)
  };
}

function requirePreset(id: string): Preset {
  const found = PRESETS.find((candidate) => candidate.id === id);

  if (!found) {
    throw new Error(`Missing preset ${id}`);
  }

  return found;
}

function peakActiveRatio(parameters: WorldParameters, seed: number, ticks: number): number {
  const random = createSeededRandom(seed);
  let world = createWorld(parameters, random);
  let peak = 0;

  for (let tick = 0; tick < ticks; tick += 1) {
    world = stepWorld(world, parameters, random);
    peak = Math.max(peak, world.stats.activeRatio);
  }

  return peak;
}

describe("built-in presets", () => {
  it("have unique ids and names", () => {
    expect(new Set(PRESETS.map((entry) => entry.id)).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((entry) => entry.name)).size).toBe(PRESETS.length);
  });

  it("survive settings normalization unchanged, so a reload still recognizes them", () => {
    for (const entry of PRESETS) {
      const storage = memoryStorage();
      saveCurrentSettings({ parameters: entry.parameters, seed: entry.seed }, storage);

      expect(loadCurrentSettings(storage)).toEqual({
        parameters: entry.parameters,
        seed: entry.seed
      });
    }
  });

  // Guards against model changes silently making a preset's name a lie.
  it("keep Embers subcritical and let Boiling ignite", () => {
    const embers = requirePreset("embers");
    const boiling = requirePreset("boiling");

    expect(peakActiveRatio(embers.parameters, embers.seed, 250)).toBeLessThan(0.01);
    expect(peakActiveRatio(boiling.parameters, boiling.seed, 250)).toBeGreaterThan(0.2);
  });
});
