import { describe, expect, it } from "vitest";
import { parseOrder, toHalfWidth } from "../src/core/parseOrder";
import { readFixture } from "./helpers";

describe("parseOrder", () => {
  it("reads a clean order", () => {
    const order = parseOrder(readFixture("clean.txt"));
    expect(order.problems).toEqual([]);
    expect(order.orderNo).toBe("PO-2026-0001");
    expect(order.customerCode).toBe("C-1001");
    expect(order.shipBy).toBe("2026-11-10");
    expect(order.lines).toEqual([
      { sku: "SKU-001", quantity: 12 },
      { sku: "SKU-014", quantity: 3 },
    ]);
  });

  it("accepts full-width characters typed with a Japanese input method", () => {
    const order = parseOrder(readFixture("fullwidth.txt"));
    expect(order.problems).toEqual([]);
    expect(order.orderNo).toBe("PO-2026-0002");
    expect(order.lines).toEqual([
      { sku: "SKU-002", quantity: 5 },
      { sku: "SKU-003", quantity: 40 },
    ]);
  });

  it("accepts tabs, 'x' and spaces between SKU and quantity", () => {
    const order = parseOrder("Order No: PO-1\nCustomer: C-1001\n---\nSKU-001\t2\nSKU-002 x 3\nSKU-003 4\n");
    expect(order.lines.map((l) => l.quantity)).toEqual([2, 3, 4]);
  });

  it("ignores greetings, the signature after a second separator, and quoted history", () => {
    const order = parseOrder(readFixture("with-reply.txt"));
    expect(order.problems).toEqual([]);
    expect(order.lines).toEqual([{ sku: "SKU-007", quantity: 1 }]);
  });

  it("reports lines it cannot read instead of dropping them", () => {
    const order = parseOrder("Order No: PO-9\nCustomer: C-1001\n---\nSKU-001, 2\nplease add the blue ones too\n");
    expect(order.lines).toEqual([{ sku: "SKU-001", quantity: 2 }]);
    expect(order.problems).toEqual(['Line 5 could not be read: "please add the blue ones too".']);
  });

  it("reports missing and malformed headers", () => {
    const order = parseOrder("Customer: ACME\nShip by: 2026-02-30\n---\nSKU-001, 1\n");
    expect(order.problems).toContain('Customer "ACME" is not a customer code like C-1001.');
    expect(order.problems).toContain('Ship by "2026-02-30" is not a date like 2026-11-10.');
    expect(order.problems).toContain("Order No is missing.");
  });

  it("reports a missing separator and an empty item list", () => {
    expect(parseOrder("Order No: PO-1\nCustomer: C-1001\nSKU-001, 1\n").problems).toContain('The "---" line before the items is missing.');
    expect(parseOrder("Order No: PO-1\nCustomer: C-1001\n---\n").problems).toContain("No order lines were found.");
  });

  it("handles Windows line endings", () => {
    const order = parseOrder("Order No: PO-3\r\nCustomer: C-1001\r\n---\r\nSKU-001, 1\r\n");
    expect(order.problems).toEqual([]);
    expect(order.lines).toHaveLength(1);
  });
});

describe("toHalfWidth", () => {
  it("converts full-width ASCII, the ideographic space and the Japanese comma", () => {
    expect(toHalfWidth("ＳＫＵ－００１、１２　")).toBe("SKU-001,12 ");
  });
});
