import { describe, expect, it } from "vitest";
import { buildPlan, type PlanInput } from "../src/core/plan";
import { message, orderBody, SETTINGS } from "./helpers";

function input(overrides: Partial<PlanInput>): PlanInput {
  return {
    messages: [],
    processedIds: new Set(),
    knownOrderNos: new Set(),
    knownSkus: new Set(["SKU-001", "SKU-002"]),
    settings: SETTINGS,
    ...overrides,
  };
}

describe("buildPlan", () => {
  it("accepts a clean order as one row per line and marks the thread done", () => {
    const m = message(orderBody("PO-1", ["SKU-001, 2", "SKU-002, 3"]));
    const plan = buildPlan(input({ messages: [m] }));
    expect(plan.rows.map((r) => [r.sku, r.quantity, r.status])).toEqual([
      ["SKU-001", 2, "accepted"],
      ["SKU-002", 3, "accepted"],
    ]);
    expect(plan.review).toEqual([]);
    expect(plan.doneThreadIds).toEqual([m.threadId]);
    expect(plan.stats).toEqual({ messagesRead: 1, messagesSkipped: 0, rowsAccepted: 2, rowsForReview: 0, ordersForReview: 0 });
  });

  it("holds the whole order for review when one line is doubtful", () => {
    const plan = buildPlan(input({ messages: [message(orderBody("PO-2", ["SKU-001, 2", "SKU-999, 1"]))] }));
    expect(plan.rows.map((r) => r.status)).toEqual(["review", "review"]);
    expect(plan.rows[0].reasons).toBe("Another line of this order needs review.");
    expect(plan.rows[1].reasons).toBe("SKU SKU-999 is not on the Products sheet.");
    expect(plan.review[0].reasons).toEqual(["SKU-999: SKU SKU-999 is not on the Products sheet."]);
  });

  it("flags quantities of zero and above the limit", () => {
    const plan = buildPlan(input({ messages: [message(orderBody("PO-3", ["SKU-001, 0", "SKU-002, 501"]))] }));
    expect(plan.rows.map((r) => r.reasons)).toEqual(["Quantity is 0.", "Quantity 501 is above 500."]);
  });

  it("does not check SKUs when the Products sheet is empty", () => {
    const plan = buildPlan(input({ knownSkus: new Set(), messages: [message(orderBody("PO-4", ["ANY-SKU, 1"]))] }));
    expect(plan.rows[0].status).toBe("accepted");
  });

  it("skips messages already on the sheet, so a rerun never writes an order twice", () => {
    const m = message(orderBody("PO-5", ["SKU-001, 1"]));
    const plan = buildPlan(input({ messages: [m], processedIds: new Set([m.id]) }));
    expect(plan.rows).toEqual([]);
    expect(plan.stats.messagesSkipped).toBe(1);
  });

  it("flags an order number that was already accepted, and the same order sent twice in one run", () => {
    const earlier = buildPlan(input({ knownOrderNos: new Set(["PO-6"]), messages: [message(orderBody("PO-6", ["SKU-001, 1"]))] }));
    expect(earlier.review[0].reasons).toEqual(["Order PO-6 was already received."]);

    const twice = buildPlan(input({ messages: [message(orderBody("PO-7", ["SKU-001, 1"])), message(orderBody("PO-7", ["SKU-001, 1"]))] }));
    expect(twice.rows.map((r) => r.status)).toEqual(["accepted", "review"]);
  });

  it("records an unreadable email as one review row so that it is not read again", () => {
    const m = message("Hi, can you send the usual?");
    const plan = buildPlan(input({ messages: [m] }));
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({ messageId: m.id, sku: "", quantity: 0, status: "review" });
    expect(plan.doneThreadIds).toEqual([m.threadId]);
  });

  it("reads oldest first, stops at the per-run limit, and keeps the rest of a thread for the next run", () => {
    const settings = { ...SETTINGS, maxMessagesPerRun: 2 };
    const a = message(orderBody("PO-10", ["SKU-001, 1"]), { receivedAt: "2026-11-02T03:00:00.000Z", threadId: "t-a" });
    const b = message(orderBody("PO-11", ["SKU-001, 1"]), { receivedAt: "2026-11-02T01:00:00.000Z", threadId: "t-b" });
    const c = message(orderBody("PO-12", ["SKU-001, 1"]), { receivedAt: "2026-11-02T02:00:00.000Z", threadId: "t-b" });
    const d = message(orderBody("PO-13", ["SKU-001, 1"]), { receivedAt: "2026-11-02T04:00:00.000Z", threadId: "t-b" });
    const plan = buildPlan(input({ settings, messages: [a, b, c, d] }));
    expect(plan.rows.map((r) => r.orderNo)).toEqual(["PO-11", "PO-12"]);
    expect(plan.deferred).toBe(2);
    // Thread t-b still has PO-13 unread, so it must keep the inbox label.
    expect(plan.doneThreadIds).toEqual([]);
  });
});
