/** A purchase order line as written in the email. */
export interface OrderLine {
  sku: string;
  quantity: number;
}

/** Result of reading one order email. `problems` is empty when the email could be read cleanly. */
export interface ParsedOrder {
  orderNo: string | null;
  customerCode: string | null;
  shipBy: string | null;
  lines: OrderLine[];
  problems: string[];
}

/** One incoming email, as the Gmail adapter hands it to the core. */
export interface IncomingMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  receivedAt: string; // ISO 8601
  body: string;
}

/** Settings that a non-engineer can change on the "Settings" sheet. */
export interface Settings {
  /** Gmail label that holds new order emails, e.g. "orders/new". */
  inboxLabel: string;
  /** Label to move processed threads to, e.g. "orders/done". */
  doneLabel: string;
  /** Comma-separated addresses that receive the run summary. */
  notifyTo: string[];
  /** A line above this quantity is sent to review instead of being accepted. */
  maxQuantityPerLine: number;
  /** Stop after this many emails in one run so a run never hits the 6-minute limit. */
  maxMessagesPerRun: number;
  /** Send a summary even when nothing needs review. */
  notifyWhenClean: boolean;
}

export type RowStatus = "accepted" | "review";

/** A row appended to the "Orders" sheet. One row per order line. */
export interface OrderRow {
  receivedAt: string;
  messageId: string;
  orderNo: string;
  customerCode: string;
  shipBy: string;
  sku: string;
  quantity: number;
  status: RowStatus;
  reasons: string;
}

export interface RunStats {
  messagesRead: number;
  messagesSkipped: number;
  rowsAccepted: number;
  rowsForReview: number;
  ordersForReview: number;
}
