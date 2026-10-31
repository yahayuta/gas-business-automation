import type { Settings } from "./types";

/**
 * Settings live on a two-column sheet (key | value) so that the business team can change
 * behaviour without opening the script editor. Unknown keys are ignored, missing keys fall
 * back to defaults, and every invalid value produces a message written for a non-engineer.
 */

export const DEFAULT_SETTINGS: Settings = {
  inboxLabel: "orders/new",
  doneLabel: "orders/done",
  notifyTo: [],
  maxQuantityPerLine: 500,
  maxMessagesPerRun: 50,
  notifyWhenClean: false,
};

/** Human-readable descriptions, also used to create the sheet the first time. */
export const SETTING_HELP: Record<keyof Settings, string> = {
  inboxLabel: "Gmail label of new order emails",
  doneLabel: "Gmail label for emails that have been read",
  notifyTo: "Who receives the summary (comma-separated emails)",
  maxQuantityPerLine: "Lines above this quantity go to review",
  maxMessagesPerRun: "Emails read per run (keep it small to stay under the time limit)",
  notifyWhenClean: "Send a summary even when nothing needs review (TRUE/FALSE)",
};

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const LABEL = /^[^\s,][^,]{0,99}$/;

export interface SettingsResult {
  settings: Settings;
  errors: string[];
}

function toText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function toPositiveInt(raw: string, key: string, errors: string[], fallback: number, max: number): number {
  if (raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    errors.push(`"${key}" must be a whole number between 1 and ${max} (it is "${raw}").`);
    return fallback;
  }
  return n;
}

function toBoolean(raw: string, key: string, errors: string[], fallback: boolean): boolean {
  if (raw === "") return fallback;
  const v = raw.toLowerCase();
  if (v === "true" || v === "yes") return true;
  if (v === "false" || v === "no") return false;
  errors.push(`"${key}" must be TRUE or FALSE (it is "${raw}").`);
  return fallback;
}

/** Reads the rows of the settings sheet (header row excluded). */
export function parseSettings(rows: ReadonlyArray<ReadonlyArray<unknown>>): SettingsResult {
  const values = new Map<string, string>();
  for (const row of rows) {
    const key = toText(row[0]);
    if (key !== "") values.set(key, toText(row[1]));
  }
  const get = (key: keyof Settings) => values.get(key) ?? "";
  const errors: string[] = [];

  const inboxLabel = get("inboxLabel") || DEFAULT_SETTINGS.inboxLabel;
  const doneLabel = get("doneLabel") || DEFAULT_SETTINGS.doneLabel;
  for (const [key, label] of [["inboxLabel", inboxLabel], ["doneLabel", doneLabel]] as const) {
    if (!LABEL.test(label)) errors.push(`"${key}" is not a valid Gmail label name ("${label}").`);
  }
  if (inboxLabel === doneLabel) errors.push(`"inboxLabel" and "doneLabel" must be different labels.`);

  const notifyTo = get("notifyTo")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  for (const address of notifyTo) {
    if (!EMAIL.test(address)) errors.push(`"notifyTo" contains an address that does not look valid: "${address}".`);
  }
  if (notifyTo.length === 0) errors.push(`"notifyTo" is empty. Enter at least one email address for the summary.`);

  const settings: Settings = {
    inboxLabel,
    doneLabel,
    notifyTo,
    maxQuantityPerLine: toPositiveInt(get("maxQuantityPerLine"), "maxQuantityPerLine", errors, DEFAULT_SETTINGS.maxQuantityPerLine, 100_000),
    maxMessagesPerRun: toPositiveInt(get("maxMessagesPerRun"), "maxMessagesPerRun", errors, DEFAULT_SETTINGS.maxMessagesPerRun, 200),
    notifyWhenClean: toBoolean(get("notifyWhenClean"), "notifyWhenClean", errors, DEFAULT_SETTINGS.notifyWhenClean),
  };
  return { settings, errors };
}

/** Rows used to create the settings sheet with defaults and help text. */
export function defaultSettingsRows(): string[][] {
  const show = (v: Settings[keyof Settings]): string => {
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  };
  return (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).map((key) => [key, show(DEFAULT_SETTINGS[key]), SETTING_HELP[key]]);
}
