import { runOrderIntake as runCore, type Ports } from "../core/app";
import { defaultSettingsRows, parseSettings } from "../core/settings";
import type { IncomingMessage } from "../core/types";
import { getOrCreateSheet, SHEETS, sheetPort } from "./sheets";

/**
 * Apps Script entry points. The build (scripts/build.mjs) exposes every function exported
 * from this file as a top-level function, which is what triggers and menus can call.
 */

const TRIGGER_HANDLER = "runOrderIntake";
const TRIGGER_MINUTES = 15;
const THREAD_FETCH_LIMIT = 100;

function book() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function inboxPort(selfEmail: string): Ports["inbox"] {
  return {
    list(labelName: string, limit: number): IncomingMessage[] {
      const label = GmailApp.getUserLabelByName(labelName);
      if (!label) throw new Error(`The Gmail label "${labelName}" does not exist. Create it, or fix "inboxLabel" on the Settings sheet.`);
      const out: IncomingMessage[] = [];
      for (const thread of label.getThreads(0, THREAD_FETCH_LIMIT)) {
        for (const m of thread.getMessages()) {
          // Replies we sent from this account sit in the same thread; they are not orders.
          if (selfEmail !== "" && m.getFrom().toLowerCase().includes(selfEmail.toLowerCase())) continue;
          out.push({
            id: m.getId(),
            threadId: thread.getId(),
            from: m.getFrom(),
            subject: m.getSubject(),
            receivedAt: m.getDate().toISOString(),
            body: m.getPlainBody(),
          });
        }
      }
      out.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
      return out.slice(0, limit);
    },
    relabel(threadIds, from, to) {
      const fromLabel = GmailApp.getUserLabelByName(from);
      const toLabel = GmailApp.getUserLabelByName(to) ?? GmailApp.createLabel(to);
      for (const id of threadIds) {
        const thread = GmailApp.getThreadById(id);
        if (!thread) continue;
        thread.addLabel(toLabel);
        if (fromLabel) thread.removeLabel(fromLabel);
      }
    },
  };
}

function ports(): Ports {
  const self = Session.getEffectiveUser().getEmail();
  const lock = LockService.getScriptLock();
  return {
    lock: { tryLock: (ms) => lock.tryLock(ms), release: () => lock.releaseLock() },
    settingsRows: () => {
      const sheet = getOrCreateSheet(book(), SHEETS.settings);
      const last = sheet.getLastRow();
      return last < 2 ? [] : sheet.getRange(2, 1, last - 1, 2).getValues();
    },
    inbox: inboxPort(self),
    sheet: sheetPort(book()),
    notify: (to, subject, body) => MailApp.sendEmail(to.join(","), subject, body),
    ownerEmail: () => self,
    now: () => new Date(),
  };
}

/** Called by the time-based trigger and by the "Run now" menu item. */
export function runOrderIntake(): void {
  const entry = runCore(ports());
  console.log(JSON.stringify(entry));
}

/** Adds the menu so that nobody needs to open the script editor. */
export function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu("Order intake")
    .addItem("Run now", "runOrderIntakeFromMenu")
    .addItem("Check settings", "checkSettings")
    .addSeparator()
    .addItem("Set up sheets and labels", "setUp")
    .addItem("Turn on automatic runs (every 15 minutes)", "installTrigger")
    .addItem("Turn off automatic runs", "removeTriggers")
    .addToUi();
}

export function runOrderIntakeFromMenu(): void {
  const entry = runCore(ports());
  SpreadsheetApp.getUi().alert(`Finished: ${entry.status}${entry.message ? `\n${entry.message}` : ""}\nSee the "${SHEETS.runLog.name}" sheet for details.`);
}

/** Creates any missing sheet (with headers and default settings) and the two Gmail labels. Safe to run again. */
export function setUp(): void {
  const b = book();
  const settingsSheet = getOrCreateSheet(b, SHEETS.settings);
  if (settingsSheet.getLastRow() < 2) {
    const rows = defaultSettingsRows();
    settingsSheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  getOrCreateSheet(b, SHEETS.orders);
  getOrCreateSheet(b, SHEETS.products);
  getOrCreateSheet(b, SHEETS.runLog);
  const { settings } = parseSettings(ports().settingsRows());
  for (const name of [settings.inboxLabel, settings.doneLabel]) {
    if (!GmailApp.getUserLabelByName(name)) GmailApp.createLabel(name);
  }
  SpreadsheetApp.getUi().alert("Sheets and labels are ready. Fill in notifyTo on the Settings sheet, then use Check settings.");
}

export function checkSettings(): void {
  const { errors } = parseSettings(ports().settingsRows());
  SpreadsheetApp.getUi().alert(errors.length === 0 ? "Settings look good." : `Please fix the Settings sheet:\n\n${errors.map((e) => `- ${e}`).join("\n")}`);
}

/** Installs exactly one time-based trigger, removing older copies first. */
export function installTrigger(): void {
  removeTriggers();
  ScriptApp.newTrigger(TRIGGER_HANDLER).timeBased().everyMinutes(TRIGGER_MINUTES).create();
}

export function removeTriggers(): void {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === TRIGGER_HANDLER) ScriptApp.deleteTrigger(t);
  }
}
