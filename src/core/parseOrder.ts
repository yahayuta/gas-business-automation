import type { OrderLine, ParsedOrder } from "./types";

/**
 * Reads a purchase-order email written in the agreed plain-text format:
 *
 *   Order No: PO-2026-0001
 *   Customer: C-1001
 *   Ship by: 2026-11-10
 *   ---
 *   SKU-001, 12
 *   SKU-014, 3
 *
 * The items are the block of lines right after "---"; a blank line or a second "---" ends it.
 *
 * Real emails are messier than the agreement, so the parser is lenient where it is safe
 * (full-width characters, extra spaces, tabs or "x" instead of commas, quoted reply text)
 * and strict where a guess could ship the wrong goods (unknown header values, unreadable lines).
 * Anything it cannot read is reported in `problems`; nothing is silently dropped.
 */

const HEADER = /^\s*(order\s*no|customer|ship\s*by)\s*:\s*(.*)$/i;
const SEPARATOR = /^\s*-{3,}\s*$/;
const LINE = /^\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(?:,|\t|x|\*|\s)\s*([0-9]+)\s*$/i;
const ORDER_NO = /^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/;
const CUSTOMER = /^C-\d{4}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Turns full-width ASCII (U+FF01-U+FF5E), the ideographic space and the Japanese comma into half-width so that Japanese input methods do not break parsing. */
export function toHalfWidth(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .replace(/\u3001/g, ",");
}

function isRealDate(value: string): boolean {
  const m = DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function parseOrder(rawBody: string): ParsedOrder {
  const result: ParsedOrder = { orderNo: null, customerCode: null, shipBy: null, lines: [], problems: [] };
  const lines = toHalfWidth(rawBody).replace(/\r\n?/g, "\n").split("\n");

  let inItems = false;
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line === "") {
      // The items are one block: a blank line after them ends the list (sign-off below).
      if (inItems && (result.lines.length > 0 || result.problems.some((p) => p.startsWith("Line ")))) break;
      continue;
    }
    // Stop at quoted history ("> ...") or a reply header; the newest order is above it.
    if (line.startsWith(">") || /^On .+ wrote:$/.test(line)) break;

    if (!inItems) {
      if (SEPARATOR.test(line)) {
        inItems = true;
        continue;
      }
      const h = HEADER.exec(line);
      if (!h) continue; // greetings and signatures before the separator are ignored
      const key = h[1].toLowerCase().replace(/\s+/g, "");
      const value = h[2].trim();
      if (key === "orderno") {
        if (ORDER_NO.test(value)) result.orderNo = value.toUpperCase();
        else result.problems.push(`Order No "${value}" is not in the expected format.`);
      } else if (key === "customer") {
        if (CUSTOMER.test(value.toUpperCase())) result.customerCode = value.toUpperCase();
        else result.problems.push(`Customer "${value}" is not a customer code like C-1001.`);
      } else if (key === "shipby") {
        if (isRealDate(value)) result.shipBy = value;
        else result.problems.push(`Ship by "${value}" is not a date like 2026-11-10.`);
      }
      continue;
    }

    if (SEPARATOR.test(line)) break; // a second separator closes the item list (signature below)
    const m = LINE.exec(line);
    if (!m) {
      result.problems.push(`Line ${index + 1} could not be read: "${line}".`);
      continue;
    }
    const item: OrderLine = { sku: m[1].toUpperCase(), quantity: Number(m[2]) };
    result.lines.push(item);
  }

  if (result.orderNo === null && !result.problems.some((p) => p.startsWith("Order No"))) result.problems.push("Order No is missing.");
  if (result.customerCode === null && !result.problems.some((p) => p.startsWith("Customer"))) result.problems.push("Customer is missing.");
  if (!inItems) result.problems.push('The "---" line before the items is missing.');
  else if (result.lines.length === 0) result.problems.push("No order lines were found.");
  return result;
}
