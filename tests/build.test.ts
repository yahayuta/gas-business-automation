import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { orderToCells, runLogToCells, SHEETS } from "../src/gas/sheets";

describe("Apps Script bundle", () => {
  let code = "";
  beforeAll(() => {
    execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "pipe" });
    code = readFileSync("dist/Code.js", "utf8");
  }, 30_000);

  it("exposes every entry point as a top-level function that Apps Script can call", () => {
    const context: Record<string, unknown> = {};
    runInNewContext(code, context);
    for (const name of ["onOpen", "runOrderIntake", "runOrderIntakeFromMenu", "setUp", "checkSettings", "installTrigger", "removeTriggers"]) {
      expect(typeof context[name], name).toBe("function");
    }
  });

  it("does not use module syntax that Apps Script cannot load", () => {
    expect(code).not.toMatch(/^\s*(import|export)\s/m);
  });
});

describe("sheet rows", () => {
  it("writes order cells in the same order as the header", () => {
    const cells = orderToCells({
      receivedAt: "2026-11-02T00:00:00.000Z",
      messageId: "m1",
      orderNo: "PO-1",
      customerCode: "C-1001",
      shipBy: "2026-11-10",
      sku: "SKU-001",
      quantity: 2,
      status: "accepted",
      reasons: "",
    });
    expect(cells).toHaveLength(SHEETS.orders.header.length);
    expect(cells[SHEETS.orders.header.indexOf("status")]).toBe("accepted");
  });

  it("writes run-log cells in the same order as the header", () => {
    const cells = runLogToCells({ startedAt: "a", finishedAt: "b", status: "ok", stats: null, message: "" });
    expect(cells).toHaveLength(SHEETS.runLog.header.length);
  });
});
