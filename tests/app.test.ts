import { describe, expect, it } from "vitest";
import { runOrderIntake, type Ports, type RunLogEntry } from "../src/core/app";
import type { IncomingMessage, OrderRow } from "../src/core/types";
import { message, orderBody } from "./helpers";

interface Fake {
  ports: Ports;
  orders: OrderRow[];
  runLog: RunLogEntry[];
  mails: { to: readonly string[]; subject: string; body: string }[];
  relabeled: string[];
  calls: string[];
  locked: boolean;
}

function fake(options: { settings?: unknown[][]; inbox?: IncomingMessage[]; lockFree?: boolean; listThrows?: Error } = {}): Fake {
  const f: Fake = { orders: [], runLog: [], mails: [], relabeled: [], calls: [], locked: false, ports: undefined as unknown as Ports };
  const inbox = options.inbox ?? [];
  f.ports = {
    lock: {
      tryLock: () => {
        if (options.lockFree === false) return false;
        f.locked = true;
        return true;
      },
      release: () => {
        f.locked = false;
      },
    },
    settingsRows: () => options.settings ?? [["notifyTo", "orders@example.com"]],
    inbox: {
      list: (_label, limit) => {
        if (options.listThrows) throw options.listThrows;
        return inbox.slice(0, limit);
      },
      relabel: (ids) => {
        f.calls.push("relabel");
        f.relabeled.push(...ids);
      },
    },
    sheet: {
      processedIds: () => new Set(f.orders.map((r) => r.messageId)),
      knownOrderNos: () => new Set(f.orders.filter((r) => r.status === "accepted").map((r) => r.orderNo)),
      knownSkus: () => new Set(),
      appendOrders: (rows) => {
        f.calls.push("append");
        f.orders.push(...rows);
      },
      appendRunLog: (entry) => {
        f.runLog.push(entry);
      },
      url: () => "https://docs.google.com/spreadsheets/d/example",
    },
    notify: (to, subject, body) => {
      f.mails.push({ to, subject, body });
    },
    ownerEmail: () => "owner@example.com",
    now: () => new Date("2026-11-02T00:00:00.000Z"),
  };
  return f;
}

describe("runOrderIntake", () => {
  it("writes the orders before relabeling the threads, and stays quiet when nothing needs review", () => {
    const f = fake({ inbox: [message(orderBody("PO-1", ["SKU-001, 1"]))] });
    const entry = runOrderIntake(f.ports);
    expect(entry.status).toBe("ok");
    expect(f.calls).toEqual(["append", "relabel"]);
    expect(f.mails).toEqual([]);
    expect(f.runLog).toHaveLength(1);
    expect(f.locked).toBe(false);
  });

  it("sends one summary listing the orders that need review", () => {
    const f = fake({ inbox: [message(orderBody("PO-2", ["SKU-001, 9999"])), message(orderBody("PO-3", ["SKU-001, 1"]))] });
    const entry = runOrderIntake(f.ports);
    expect(entry.status).toBe("review");
    expect(f.mails).toHaveLength(1);
    expect(f.mails[0].to).toEqual(["orders@example.com"]);
    expect(f.mails[0].subject).toBe("[Order intake] 1 order(s) need review");
    expect(f.mails[0].body).toContain("Quantity 9999 is above 500.");
  });

  it("is safe to run twice: the second run writes nothing", () => {
    const f = fake({ inbox: [message(orderBody("PO-4", ["SKU-001, 1"]))] });
    runOrderIntake(f.ports);
    const second = runOrderIntake(f.ports);
    expect(f.orders).toHaveLength(1);
    expect(second.stats?.messagesSkipped).toBe(1);
  });

  it("does nothing when another run holds the lock", () => {
    const f = fake({ lockFree: false, inbox: [message(orderBody("PO-5", ["SKU-001, 1"]))] });
    expect(runOrderIntake(f.ports).status).toBe("skipped");
    expect(f.orders).toEqual([]);
  });

  it("stops before reading email when the settings are wrong, and tells the owner in plain words", () => {
    const f = fake({ settings: [["maxQuantityPerLine", "lots"]], inbox: [message(orderBody("PO-6", ["SKU-001, 1"]))] });
    const entry = runOrderIntake(f.ports);
    expect(entry.status).toBe("settings-error");
    expect(f.orders).toEqual([]);
    expect(f.mails[0].to).toEqual(["owner@example.com"]);
    expect(f.mails[0].body).toContain("No order was lost");
    expect(f.mails[0].body).toContain('"maxQuantityPerLine" must be a whole number');
  });

  it("records and reports an unexpected error, and still releases the lock", () => {
    const f = fake({ listThrows: new Error('The Gmail label "orders/new" does not exist.') });
    const entry = runOrderIntake(f.ports);
    expect(entry.status).toBe("error");
    expect(entry.message).toContain("does not exist");
    expect(f.mails[0].subject).toBe("[Order intake] The order intake did not run");
    expect(f.locked).toBe(false);
    expect(f.runLog).toHaveLength(1);
  });

  it("mails a summary for a clean run only when notifyWhenClean is TRUE", () => {
    const f = fake({ settings: [["notifyTo", "orders@example.com"], ["notifyWhenClean", "TRUE"]], inbox: [message(orderBody("PO-7", ["SKU-001, 1"]))] });
    runOrderIntake(f.ports);
    expect(f.mails[0].subject).toBe("[Order intake] 1 order email(s) read, nothing to review");
  });
});
