import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS, type HistorySample } from "../simulation/criticality";
import {
  CURRENT_SETTINGS_STORAGE_KEY,
  SAVED_PARAMETER_SETS_STORAGE_KEY,
  deleteSavedParameterSet,
  loadCurrentSettings,
  loadSavedParameterSets,
  saveCurrentSettings,
  saveParameterSet,
  type SavedParameterSet
} from "./settings";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const historySample: HistorySample = {
  tick: 12,
  activeCount: 4,
  activeRatio: 0.25,
  totalEnergy: 2.5,
  averageEnergy: 0.16,
  totalFuel: 8,
  averageFuel: 0.5,
  triggered: true,
  triggeredIndex: 3,
  triggeredEnergy: 0.42,
  triggeredDuration: 2,
  activeTriggerCount: 1,
  dissipatedEnergy: 0.1,
  avalanche: 2
};

function requireSaved(value: SavedParameterSet | null): SavedParameterSet {
  expect(value).not.toBeNull();
  return value as SavedParameterSet;
}

describe("settings storage", () => {
  it("persists and reloads the current parameters and seed", () => {
    const storage = new MemoryStorage();
    const settings = {
      parameters: { ...DEFAULT_PARAMETERS, width: 96, triggerRate: 0.42 },
      seed: 12345
    };

    expect(saveCurrentSettings(settings, storage)).toBe(true);
    expect(loadCurrentSettings(storage)).toEqual(settings);
  });

  it("ignores malformed or incompatible current settings", () => {
    const storage = new MemoryStorage();

    storage.setItem(CURRENT_SETTINGS_STORAGE_KEY, "{");
    expect(loadCurrentSettings(storage)).toBeNull();

    storage.setItem(
      CURRENT_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 99, parameters: DEFAULT_PARAMETERS, seed: 1 })
    );
    expect(loadCurrentSettings(storage)).toBeNull();
  });

  it("saves named parameter sets with retained run history", () => {
    const storage = new MemoryStorage();
    const now = () => new Date("2026-07-08T12:00:00.000Z");

    const saved = requireSaved(saveParameterSet(
      {
        name: "  Baseline  ",
        parameters: { ...DEFAULT_PARAMETERS, height: 72 },
        seed: 99,
        history: [historySample]
      },
      storage,
      now
    ));

    expect(saved?.name).toBe("Baseline");
    expect(loadSavedParameterSets(storage)).toEqual([
      {
        ...saved,
        history: [historySample]
      }
    ]);
  });

  it("updates an existing named parameter set instead of duplicating it", () => {
    const storage = new MemoryStorage();
    const firstNow = () => new Date("2026-07-08T12:00:00.000Z");
    const secondNow = () => new Date("2026-07-08T12:05:00.000Z");
    const first = requireSaved(saveParameterSet(
      { name: "Baseline", parameters: DEFAULT_PARAMETERS, seed: 1, history: [historySample] },
      storage,
      firstNow
    ));
    const second = requireSaved(saveParameterSet(
      { name: "baseline", parameters: { ...DEFAULT_PARAMETERS, width: 48 }, seed: 2, history: [] },
      storage,
      secondNow
    ));

    const sets = loadSavedParameterSets(storage);

    expect(sets).toHaveLength(1);
    expect(second?.id).toBe(first?.id);
    expect(sets[0]?.name).toBe("baseline");
    expect(sets[0]?.createdAt).toBe("2026-07-08T12:00:00.000Z");
    expect(sets[0]?.updatedAt).toBe("2026-07-08T12:05:00.000Z");
    expect(sets[0]?.seed).toBe(2);
    expect(sets[0]?.parameters.width).toBe(48);
    expect(sets[0]?.history).toEqual([]);
  });

  it("deletes saved parameter sets by id", () => {
    const storage = new MemoryStorage();
    const saved = requireSaved(saveParameterSet(
      { name: "Baseline", parameters: DEFAULT_PARAMETERS, seed: 1, history: [] },
      storage,
      () => new Date("2026-07-08T12:00:00.000Z")
    ));

    expect(deleteSavedParameterSet(saved.id, storage)).toEqual([]);
    expect(loadSavedParameterSets(storage)).toEqual([]);
  });

  it("drops invalid saved parameter-set records", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SAVED_PARAMETER_SETS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        sets: [
          {
            id: "bad",
            name: "",
            createdAt: "not a date",
            updatedAt: "not a date",
            parameters: {},
            seed: Number.NaN,
            history: [{}]
          }
        ]
      })
    );

    expect(loadSavedParameterSets(storage)).toEqual([]);
  });
});
