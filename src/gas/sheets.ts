import type { RunLogEntry } from "../core/app";
import type { OrderRow } from "../core/types";

/** Sheet names and headers. Changing a name here is the only change needed to rename a sheet. */
export const SHEETS = {
  settings: { name: "Settings", header: ["key", "value", "what it does"] },
  orders: {
    name: "Orders",
    header: ["received at", "message id", "order no", "customer", "ship by", "sku", "quantity", "status", "reasons"],
  },
  products: { name: "Products", header: ["sku", "name"] },
  runLog: { name: "Run log", header: ["started at", "finished at", "status", "emails read", "lines accepted", "lines for review", "message"] },
} as const;

const REVIEW_BACKGROUND = "#fdecea";

/** Turns an order row into the cells of the Orders sheet (same order as the header). */
export function orderToCells(row: OrderRow): (string | number)[] {
  return [row.receivedAt, row.messageId, row.orderNo, row.customerCode, row.shipBy, row.sku, row.quantity, row.status, row.reasons];
}

export function runLogToCells(entry: RunLogEntry): (string | number)[] {
  return [
    entry.startedAt,
    entry.finishedAt,
    entry.status,
    entry.stats?.messagesRead ?? "",
    entry.stats?.rowsAccepted ?? "",
    entry.stats?.rowsForReview ?? "",
    entry.message,
  ];
}

export function getOrCreateSheet(book: GoogleAppsScript.Spreadsheet.Spreadsheet, def: { name: string; header: readonly string[] }) {
  let sheet = book.getSheetByName(def.name);
  if (!sheet) {
    sheet = book.insertSheet(def.name);
    sheet.getRange(1, 1, 1, def.header.length).setValues([[...def.header]]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Reads one column below the header as trimmed strings. */
function columnValues(sheet: GoogleAppsScript.Spreadsheet.Sheet, column: number): string[] {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet
    .getRange(2, column, last - 1, 1)
    .getValues()
    .map((r) => String(r[0]).trim())
    .filter((v) => v !== "");
}

export function sheetPort(book: GoogleAppsScript.Spreadsheet.Spreadsheet) {
  const orders = () => getOrCreateSheet(book, SHEETS.orders);
  return {
    processedIds: () => new Set(columnValues(orders(), 2)),
    knownOrderNos: () => {
      // Only accepted orders count as "already received": an order held for review
      // may be sent again corrected, and that resend must not be flagged as a duplicate.
      const sheet = orders();
      const last = sheet.getLastRow();
      if (last < 2) return new Set<string>();
      const values = sheet.getRange(2, 3, last - 1, 6).getValues();
      return new Set(values.filter((r) => r[5] === "accepted").map((r) => String(r[0]).trim()).filter((v) => v !== ""));
    },
    knownSkus: () => new Set(columnValues(getOrCreateSheet(book, SHEETS.products), 1).map((s) => s.toUpperCase())),
    appendOrders: (rows: readonly OrderRow[]) => {
      const sheet = orders();
      const start = sheet.getLastRow() + 1;
      sheet.getRange(start, 1, rows.length, SHEETS.orders.header.length).setValues(rows.map(orderToCells));
      rows.forEach((row, i) => {
        if (row.status === "review") sheet.getRange(start + i, 1, 1, SHEETS.orders.header.length).setBackground(REVIEW_BACKGROUND);
      });
    },
    appendRunLog: (entry: RunLogEntry) => {
      getOrCreateSheet(book, SHEETS.runLog).appendRow(runLogToCells(entry));
    },
    url: () => book.getUrl(),
  };
}
