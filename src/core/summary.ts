import type { Plan } from "./plan";

/** Builds the summary email. Written for the people who handle the orders, not for engineers. */
export function buildSummary(plan: Plan, sheetUrl: string): { subject: string; body: string } {
  const { stats } = plan;
  const subject =
    stats.ordersForReview > 0
      ? `[Order intake] ${stats.ordersForReview} order(s) need review`
      : `[Order intake] ${stats.messagesRead} order email(s) read, nothing to review`;

  const lines: string[] = [
    `Emails read: ${stats.messagesRead}`,
    `Order lines accepted: ${stats.rowsAccepted}`,
    `Order lines held for review: ${stats.rowsForReview}`,
  ];
  if (plan.deferred > 0) {
    lines.push(`Emails left for the next run: ${plan.deferred} (the per-run limit was reached)`);
  }
  if (plan.review.length > 0) {
    lines.push("", "Please check these orders and fix them on the Orders sheet or ask the customer:");
    for (const item of plan.review) {
      lines.push("", `- ${item.orderNo || "(no order number)"} from ${item.from}`, `  Subject: ${item.subject}`);
      for (const reason of item.reasons) lines.push(`  * ${reason}`);
    }
  }
  lines.push("", `Orders sheet: ${sheetUrl}`);
  return { subject, body: lines.join("\n") };
}

/** The email sent when the script cannot run at all. */
export function buildFailureNotice(problem: string[], sheetUrl: string): { subject: string; body: string } {
  return {
    subject: "[Order intake] The order intake did not run",
    body: [
      "The order intake stopped before reading any email. No order was lost: the emails are still under the inbox label.",
      "",
      ...problem.map((p) => `- ${p}`),
      "",
      "What to do: fix the value on the Settings sheet, then use the menu Order intake > Run now.",
      "If the message mentions something else, forward this email to the owner of the script (see the Handover sheet).",
      "",
      `Spreadsheet: ${sheetUrl}`,
    ].join("\n"),
  };
}
