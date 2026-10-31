import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import type { IncomingMessage, Settings } from "../src/core/types";

export function readFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

export const SETTINGS: Settings = { ...DEFAULT_SETTINGS, notifyTo: ["orders@example.com"] };

let seq = 0;
export function message(body: string, overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  seq += 1;
  return {
    id: `m${seq}`,
    threadId: `t${seq}`,
    from: "buyer@example.com",
    subject: `Order ${seq}`,
    receivedAt: `2026-11-02T00:${String(seq % 60).padStart(2, "0")}:00.000Z`,
    body,
    ...overrides,
  };
}

export function orderBody(orderNo: string, lines: string[], customer = "C-1001"): string {
  return [`Order No: ${orderNo}`, `Customer: ${customer}`, "---", ...lines].join("\n");
}
