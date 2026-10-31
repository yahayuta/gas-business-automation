import { buildPlan } from "./plan";
import { parseSettings } from "./settings";
import { buildFailureNotice, buildSummary } from "./summary";
import type { IncomingMessage, OrderRow, RunStats } from "./types";

/**
 * The run, written against small interfaces ("ports") instead of GmailApp / SpreadsheetApp.
 * src/gas/ implements these with Apps Script services; the tests implement them with fakes.
 */
export interface Ports {
  lock: { tryLock(timeoutMs: number): boolean; release(): void };
  settingsRows(): unknown[][];
  inbox: {
    /** Messages in threads that carry the label, oldest first, at most `limit`. */
    list(label: string, limit: number): IncomingMessage[];
    /** Moves threads from one label to another. */
    relabel(threadIds: readonly string[], from: string, to: string): void;
  };
  sheet: {
    processedIds(): Set<string>;
    knownOrderNos(): Set<string>;
    knownSkus(): Set<string>;
    appendOrders(rows: readonly OrderRow[]): void;
    appendRunLog(entry: RunLogEntry): void;
    url(): string;
  };
  notify(to: readonly string[], subject: string, body: string): void;
  /** Address used when the settings themselves are broken (the script owner). */
  ownerEmail(): string;
  now(): Date;
}

export type RunStatus = "ok" | "review" | "skipped" | "settings-error" | "error";

export interface RunLogEntry {
  startedAt: string;
  finishedAt: string;
  status: RunStatus;
  stats: RunStats | null;
  message: string;
}

const EMPTY_STATS: RunStats = { messagesRead: 0, messagesSkipped: 0, rowsAccepted: 0, rowsForReview: 0, ordersForReview: 0 };
/** Gmail can hold more than we read per run; fetch a little extra so already-processed ones do not block new ones. */
const FETCH_HEADROOM = 2;

export function runOrderIntake(ports: Ports): RunLogEntry {
  const startedAt = ports.now().toISOString();
  const finish = (status: RunStatus, stats: RunStats | null, message: string): RunLogEntry => {
    const entry = { startedAt, finishedAt: ports.now().toISOString(), status, stats, message };
    try {
      ports.sheet.appendRunLog(entry);
    } catch {
      // The run log is for people; failing to write it must not hide the real result.
    }
    return entry;
  };

  if (!ports.lock.tryLock(10_000)) {
    return finish("skipped", null, "Another run was still working, so this run did nothing.");
  }
  try {
    const { settings, errors } = parseSettings(ports.settingsRows());
    if (errors.length > 0) {
      const notice = buildFailureNotice(errors, ports.sheet.url());
      const to = settings.notifyTo.length > 0 ? settings.notifyTo : [ports.ownerEmail()];
      ports.notify(to, notice.subject, notice.body);
      return finish("settings-error", null, errors.join(" "));
    }

    const messages = ports.inbox.list(settings.inboxLabel, settings.maxMessagesPerRun * FETCH_HEADROOM);
    const plan = buildPlan({
      messages,
      processedIds: ports.sheet.processedIds(),
      knownOrderNos: ports.sheet.knownOrderNos(),
      knownSkus: ports.sheet.knownSkus(),
      settings,
    });

    // Write first, relabel second: if the run dies in between, the next run sees the
    // message IDs on the sheet and skips them instead of writing the orders twice.
    if (plan.rows.length > 0) ports.sheet.appendOrders(plan.rows);
    if (plan.doneThreadIds.length > 0) ports.inbox.relabel(plan.doneThreadIds, settings.inboxLabel, settings.doneLabel);

    const needsMail = plan.review.length > 0 || plan.deferred > 0 || (settings.notifyWhenClean && plan.stats.messagesRead > 0);
    if (needsMail) {
      const summary = buildSummary(plan, ports.sheet.url());
      ports.notify(settings.notifyTo, summary.subject, summary.body);
    }
    const status: RunStatus = plan.review.length > 0 ? "review" : "ok";
    const note = plan.deferred > 0 ? `${plan.deferred} email(s) left for the next run.` : "";
    return finish(status, plan.stats, note);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      const notice = buildFailureNotice([`Unexpected error: ${message}`], ports.sheet.url());
      ports.notify([ports.ownerEmail()], notice.subject, notice.body);
    } catch {
      // If even the notification fails, the run log below is the last record.
    }
    return finish("error", EMPTY_STATS, message);
  } finally {
    ports.lock.release();
  }
}
