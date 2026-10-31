import { parseOrder } from "./parseOrder";
import type { IncomingMessage, OrderRow, RunStats, Settings } from "./types";

/**
 * Decides what one run should write, without touching Gmail or Sheets.
 * Keeping this pure means every rule below is covered by unit tests, and the
 * Apps Script side only has to read inputs and write outputs.
 */

export interface PlanInput {
  messages: readonly IncomingMessage[];
  /** Message IDs already written to the sheet in earlier runs. */
  processedIds: ReadonlySet<string>;
  /** Order numbers already on the sheet, to catch the same order sent twice. */
  knownOrderNos: ReadonlySet<string>;
  /** SKUs from the "Products" sheet. Empty means "do not check SKUs". */
  knownSkus: ReadonlySet<string>;
  settings: Settings;
}

export interface ReviewItem {
  messageId: string;
  subject: string;
  from: string;
  orderNo: string;
  reasons: string[];
}

export interface Plan {
  rows: OrderRow[];
  review: ReviewItem[];
  /** Threads to relabel as done (every message in the run, accepted or not). */
  doneThreadIds: string[];
  /** Messages left for the next run because of the per-run limit. */
  deferred: number;
  stats: RunStats;
}

export function buildPlan(input: PlanInput): Plan {
  const { settings } = input;
  const fresh = [...input.messages]
    .filter((m) => !input.processedIds.has(m.id))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
  const skipped = input.messages.length - fresh.length;
  const batch = fresh.slice(0, settings.maxMessagesPerRun);

  const rows: OrderRow[] = [];
  const review: ReviewItem[] = [];
  const seenOrderNos = new Set(input.knownOrderNos);
  const doneThreads = new Set<string>();
  // A thread with an unread (deferred) message must stay in the inbox label.
  const deferredThreads = new Set(fresh.slice(settings.maxMessagesPerRun).map((m) => m.threadId));

  for (const message of batch) {
    const order = parseOrder(message.body);
    const orderReasons = [...order.problems];
    const orderNo = order.orderNo ?? "";
    if (order.orderNo !== null) {
      if (seenOrderNos.has(order.orderNo)) orderReasons.push(`Order ${order.orderNo} was already received.`);
      seenOrderNos.add(order.orderNo);
    }

    const lineRows: OrderRow[] = order.lines.map((line) => {
      const reasons: string[] = [];
      if (line.quantity < 1) reasons.push("Quantity is 0.");
      if (line.quantity > settings.maxQuantityPerLine) reasons.push(`Quantity ${line.quantity} is above ${settings.maxQuantityPerLine}.`);
      if (input.knownSkus.size > 0 && !input.knownSkus.has(line.sku)) reasons.push(`SKU ${line.sku} is not on the Products sheet.`);
      return {
        receivedAt: message.receivedAt,
        messageId: message.id,
        orderNo,
        customerCode: order.customerCode ?? "",
        shipBy: order.shipBy ?? "",
        sku: line.sku,
        quantity: line.quantity,
        status: "accepted",
        reasons: reasons.join(" "),
      };
    });

    // If any part of an order is doubtful, the whole order goes to review:
    // shipping half an order is worse than holding it for a person to check.
    const lineReasons = lineRows.filter((r) => r.reasons !== "").map((r) => `${r.sku}: ${r.reasons}`);
    const allReasons = [...orderReasons, ...lineReasons];
    const needsReview = allReasons.length > 0;
    if (needsReview) {
      review.push({ messageId: message.id, subject: message.subject, from: message.from, orderNo, reasons: allReasons });
    }

    if (lineRows.length === 0) {
      // Nothing readable: still record the message so it is not read again and someone sees it.
      rows.push({
        receivedAt: message.receivedAt,
        messageId: message.id,
        orderNo,
        customerCode: order.customerCode ?? "",
        shipBy: order.shipBy ?? "",
        sku: "",
        quantity: 0,
        status: "review",
        reasons: allReasons.join(" "),
      });
    } else {
      for (const row of lineRows) {
        if (needsReview) {
          row.status = "review";
          row.reasons = [row.reasons, ...orderReasons].filter((s) => s !== "").join(" ") || "Another line of this order needs review.";
        }
        rows.push(row);
      }
    }
    if (!deferredThreads.has(message.threadId)) doneThreads.add(message.threadId);
  }

  return {
    rows,
    review,
    doneThreadIds: [...doneThreads],
    deferred: fresh.length - batch.length,
    stats: {
      messagesRead: batch.length,
      messagesSkipped: skipped,
      rowsAccepted: rows.filter((r) => r.status === "accepted").length,
      rowsForReview: rows.filter((r) => r.status === "review").length,
      ordersForReview: review.length,
    },
  };
}
