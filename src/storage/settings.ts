import {
  DEFAULT_PARAMETERS,
  type HistorySample,
  type WorldParameters
} from "../simulation/criticality";

export const CURRENT_SETTINGS_STORAGE_KEY = "criticality.currentSettings.v1";
export const SAVED_PARAMETER_SETS_STORAGE_KEY = "criticality.parameterSets.v1";

const STORAGE_VERSION = 1;
const MAX_SEED = 0xffff_ffff;

export interface AppSettings {
  parameters: WorldParameters;
  seed: number;
}

export interface SavedParameterSet extends AppSettings {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  history: HistorySample[];
}

export type SettingsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type Range = {
  min: number;
  max: number;
  integer?: boolean;
};

type UnknownRecord = Record<string, unknown>;

const PARAMETER_RANGES: Record<keyof WorldParameters, Range> = {
  width: { min: 1, max: 512, integer: true },
  height: { min: 1, max: 512, integer: true },
  triggerRate: { min: 0, max: 1 },
  triggerMagnitude: { min: 0, max: 1 },
  dissipationRate: { min: 0, max: 1 },
  conversionRate: { min: 0, max: 1 },
  defaultThreshold: { min: 0, max: 1 },
  defaultActivationProbability: { min: 0, max: 1 },
  defaultDeactivationProbability: { min: 0, max: 1 },
  defaultResistance: { min: 0, max: 1 },
  defaultVigor: { min: 0, max: 0.1 },
  variability: { min: 0, max: 0.5 },
  quiescence: { min: 0, max: 1 },
  ticksPerSecond: { min: 1, max: 60, integer: true },
  maxHistory: { min: 1, max: 600, integer: true }
};

const PARAMETER_KEYS = Object.keys(DEFAULT_PARAMETERS) as Array<keyof WorldParameters>;

export function loadCurrentSettings(storage?: SettingsStorage): AppSettings | null {
  const source = resolveStorage(storage);

  if (!source) {
    return null;
  }

  const record = parseStoredRecord(source.getItem(CURRENT_SETTINGS_STORAGE_KEY));

  if (!isRecord(record) || record.version !== STORAGE_VERSION) {
    return null;
  }

  return normalizeAppSettings(record);
}

export function saveCurrentSettings(
  settings: AppSettings,
  storage?: SettingsStorage
): boolean {
  const target = resolveStorage(storage);
  const normalized = normalizeAppSettings(settings);

  if (!target || !normalized) {
    return false;
  }

  try {
    target.setItem(
      CURRENT_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, ...normalized })
    );
    return true;
  } catch {
    return false;
  }
}

export function loadSavedParameterSets(storage?: SettingsStorage): SavedParameterSet[] {
  const source = resolveStorage(storage);

  if (!source) {
    return [];
  }

  const record = parseStoredRecord(source.getItem(SAVED_PARAMETER_SETS_STORAGE_KEY));

  if (!isRecord(record) || record.version !== STORAGE_VERSION || !Array.isArray(record.sets)) {
    return [];
  }

  return sortSavedParameterSets(
    record.sets
      .map(normalizeSavedParameterSet)
      .filter((set): set is SavedParameterSet => set !== null)
  );
}

export function saveParameterSet(
  input: Pick<SavedParameterSet, "name" | "parameters" | "seed" | "history">,
  storage?: SettingsStorage,
  now: () => Date = () => new Date()
): SavedParameterSet | null {
  const target = resolveStorage(storage);
  const name = input.name.trim();
  const settings = normalizeAppSettings(input);

  if (!target || name.length === 0 || !settings) {
    return null;
  }

  const savedAt = now().toISOString();
  const existingSets = loadSavedParameterSets(target);
  const existing = existingSets.find((set) => namesMatch(set.name, name));
  const saved: SavedParameterSet = {
    id: existing?.id ?? makeParameterSetId(name, savedAt, existingSets),
    name,
    createdAt: existing?.createdAt ?? savedAt,
    updatedAt: savedAt,
    parameters: settings.parameters,
    seed: settings.seed,
    history: normalizeHistory(input.history)
  };
  const nextSets = sortSavedParameterSets([
    saved,
    ...existingSets.filter((set) => set.id !== saved.id && !namesMatch(set.name, name))
  ]);

  try {
    writeSavedParameterSets(target, nextSets);
    return saved;
  } catch {
    return null;
  }
}

export function deleteSavedParameterSet(
  id: string,
  storage?: SettingsStorage
): SavedParameterSet[] {
  const target = resolveStorage(storage);

  if (!target) {
    return [];
  }

  const nextSets = loadSavedParameterSets(target).filter((set) => set.id !== id);

  try {
    writeSavedParameterSets(target, nextSets);
  } catch {
    return loadSavedParameterSets(target);
  }

  return nextSets;
}

function resolveStorage(storage: SettingsStorage | undefined): SettingsStorage | null {
  if (storage) {
    return storage;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseStoredRecord(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeAppSettings(value: unknown): AppSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const parameters = normalizeParameters(value.parameters);
  const seed = normalizeSeed(value.seed);

  if (!parameters || seed === null) {
    return null;
  }

  return { parameters, seed };
}

function normalizeSavedParameterSet(value: unknown): SavedParameterSet | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = normalizeName(value.name);
  const id = normalizeName(value.id);
  const createdAt = normalizeDate(value.createdAt);
  const updatedAt = normalizeDate(value.updatedAt);
  const settings = normalizeAppSettings(value);

  if (!name || !id || !createdAt || !updatedAt || !settings) {
    return null;
  }

  return {
    id,
    name,
    createdAt,
    updatedAt,
    parameters: settings.parameters,
    seed: settings.seed,
    history: normalizeHistory(value.history)
  };
}

function normalizeParameters(value: unknown): WorldParameters | null {
  if (!isRecord(value)) {
    return null;
  }

  const parameters = { ...DEFAULT_PARAMETERS };

  for (const key of PARAMETER_KEYS) {
    parameters[key] = normalizeParameterValue(key, value[key]);
  }

  return parameters;
}

function normalizeParameterValue(key: keyof WorldParameters, value: unknown): number {
  const range = PARAMETER_RANGES[key];
  const fallback = DEFAULT_PARAMETERS[key];
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const bounded = Math.min(range.max, Math.max(range.min, numeric));

  return range.integer ? Math.round(bounded) : bounded;
}

function normalizeSeed(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(MAX_SEED, Math.max(0, Math.round(value)));
}

function normalizeHistory(value: unknown): HistorySample[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeHistorySample)
    .filter((sample): sample is HistorySample => sample !== null);
}

function normalizeHistorySample(value: unknown): HistorySample | null {
  if (!isRecord(value)) {
    return null;
  }

  const tick = readFiniteNumber(value, "tick");
  const activeCount = readFiniteNumber(value, "activeCount");
  const activeRatio = readFiniteNumber(value, "activeRatio");
  const totalEnergy = readFiniteNumber(value, "totalEnergy");
  const averageEnergy = readFiniteNumber(value, "averageEnergy");
  const totalFuel = readFiniteNumber(value, "totalFuel");
  const averageFuel = readFiniteNumber(value, "averageFuel");
  const triggeredEnergy = readFiniteNumber(value, "triggeredEnergy");
  const triggeredDuration = readFiniteNumber(value, "triggeredDuration");
  const activeTriggerCount = readFiniteNumber(value, "activeTriggerCount");
  const dissipatedEnergy = readFiniteNumber(value, "dissipatedEnergy");
  const avalanche = readFiniteNumber(value, "avalanche");

  if (
    tick === null ||
    activeCount === null ||
    activeRatio === null ||
    totalEnergy === null ||
    averageEnergy === null ||
    totalFuel === null ||
    averageFuel === null ||
    typeof value.triggered !== "boolean" ||
    triggeredEnergy === null ||
    triggeredDuration === null ||
    activeTriggerCount === null ||
    dissipatedEnergy === null ||
    avalanche === null
  ) {
    return null;
  }

  const triggeredIndex =
    value.triggeredIndex === null ? null : readFiniteNumber(value, "triggeredIndex");

  if (triggeredIndex === null && value.triggeredIndex !== null) {
    return null;
  }

  return {
    tick,
    activeCount,
    activeRatio,
    totalEnergy,
    averageEnergy,
    totalFuel,
    averageFuel,
    triggered: value.triggered,
    triggeredIndex,
    triggeredEnergy,
    triggeredDuration,
    activeTriggerCount,
    dissipatedEnergy,
    avalanche
  };
}

function readFiniteNumber(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function writeSavedParameterSets(storage: SettingsStorage, sets: SavedParameterSet[]): void {
  storage.setItem(
    SAVED_PARAMETER_SETS_STORAGE_KEY,
    JSON.stringify({ version: STORAGE_VERSION, sets })
  );
}

function sortSavedParameterSets(sets: SavedParameterSet[]): SavedParameterSet[] {
  return [...sets].sort((left, right) => {
    const dateOrder = right.updatedAt.localeCompare(left.updatedAt);
    return dateOrder === 0 ? left.name.localeCompare(right.name) : dateOrder;
  });
}

function makeParameterSetId(
  name: string,
  savedAt: string,
  existingSets: readonly SavedParameterSet[]
): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "set";
  const timestamp = Date.parse(savedAt).toString(36);
  let id = `${slug}-${timestamp}`;
  let index = 2;

  while (existingSets.some((set) => set.id === id)) {
    id = `${slug}-${timestamp}-${index}`;
    index += 1;
  }

  return id;
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function namesMatch(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
