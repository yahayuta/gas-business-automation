import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, defaultSettingsRows, parseSettings } from "../src/core/settings";

describe("parseSettings", () => {
  it("reads values typed on the sheet, including numbers and booleans stored as cells", () => {
    const { settings, errors } = parseSettings([
      ["inboxLabel", "orders/new"],
      ["doneLabel", "orders/done"],
      ["notifyTo", " a@example.com , b@example.com "],
      ["maxQuantityPerLine", 200],
      ["maxMessagesPerRun", "20"],
      ["notifyWhenClean", true],
    ]);
    expect(errors).toEqual([]);
    expect(settings).toEqual({
      inboxLabel: "orders/new",
      doneLabel: "orders/done",
      notifyTo: ["a@example.com", "b@example.com"],
      maxQuantityPerLine: 200,
      maxMessagesPerRun: 20,
      notifyWhenClean: true,
    });
  });

  it("falls back to defaults for missing keys and ignores unknown ones", () => {
    const { settings, errors } = parseSettings([["notifyTo", "a@example.com"], ["colour", "blue"], ["", "x"]]);
    expect(errors).toEqual([]);
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, notifyTo: ["a@example.com"] });
  });

  it("explains every bad value in plain words and keeps the defaults for them", () => {
    const { settings, errors } = parseSettings([
      ["notifyTo", "a@example.com, not-an-email"],
      ["maxQuantityPerLine", "lots"],
      ["maxMessagesPerRun", 0],
      ["notifyWhenClean", "maybe"],
      ["doneLabel", "orders/new"],
    ]);
    expect(errors).toEqual([
      '"inboxLabel" and "doneLabel" must be different labels.',
      '"notifyTo" contains an address that does not look valid: "not-an-email".',
      '"maxQuantityPerLine" must be a whole number between 1 and 100000 (it is "lots").',
      '"maxMessagesPerRun" must be a whole number between 1 and 200 (it is "0").',
      '"notifyWhenClean" must be TRUE or FALSE (it is "maybe").',
    ]);
    expect(settings.maxQuantityPerLine).toBe(DEFAULT_SETTINGS.maxQuantityPerLine);
    expect(settings.maxMessagesPerRun).toBe(DEFAULT_SETTINGS.maxMessagesPerRun);
  });

  it("requires someone to receive the summary", () => {
    expect(parseSettings([]).errors).toEqual(['"notifyTo" is empty. Enter at least one email address for the summary.']);
  });

  it("creates the first sheet from the defaults, with help text for each key", () => {
    const rows = defaultSettingsRows();
    expect(rows.map((r) => r[0])).toEqual(Object.keys(DEFAULT_SETTINGS));
    expect(rows.find((r) => r[0] === "notifyWhenClean")?.[1]).toBe("FALSE");
    expect(rows.every((r) => r[2].length > 0)).toBe(true);
  });
});
