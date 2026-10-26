import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { InboxStore } from "../server/store.ts";

const item = (n: number, extra: object = {}) => ({
  id: `a${n}:2026-01-01T00:00:${String(n).padStart(2, "0")}.000Z`,
  agentId: `a${n}`,
  agentTitle: `Agent ${n}`,
  reason: "finished" as const,
  workspaceId: null,
  workspaceName: null,
  at: `2026-01-01T00:00:${String(n).padStart(2, "0")}.000Z`,
  ...extra,
});
const tmp = () => path.join(mkdtempSync(path.join(os.tmpdir(), "inbox-")), "sub", "notifications.json");

test("adds newest first, deduped by id", () => {
  const store = new InboxStore(tmp());
  assert.equal(store.add([item(1), item(2)]).length, 2);
  assert.equal(store.add([item(2), item(3)]).length, 1);
  assert.deepEqual(store.list().map((e) => e.agentId), ["a3", "a2", "a1"]);
  assert.equal(store.unreadCount(), 3);
});

test("caps history, dropping oldest", () => {
  const store = new InboxStore(tmp(), 3);
  store.add([1, 2, 3, 4, 5].map((n) => item(n)));
  assert.deepEqual(store.list().map((e) => e.agentId), ["a5", "a4", "a3"]);
});

test("markRead, markAllRead, clear", () => {
  const store = new InboxStore(tmp());
  store.add([item(1), item(2), item(3)]);
  store.markRead(item(2).id);
  assert.equal(store.unreadCount(), 2);
  store.markRead("missing");
  assert.equal(store.unreadCount(), 2);
  store.markAllRead();
  assert.equal(store.unreadCount(), 0);
  assert.equal(store.list().length, 3);
  store.clear();
  assert.equal(store.list().length, 0);
});

test("persists across instances with atomic write (no temp left)", () => {
  const file = tmp();
  const first = new InboxStore(file);
  first.add([item(1), item(2)]);
  first.markRead(item(1).id);
  const second = new InboxStore(file);
  assert.equal(second.list().length, 2);
  assert.equal(second.unreadCount(), 1);
  assert.equal(second.watermark, item(2).at);
  assert.deepEqual(readdirSync(path.dirname(file)), ["notifications.json"]);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).version, 1);
});

test("clear keeps the watermark so cleared attention is not replayed", () => {
  const store = new InboxStore(tmp());
  store.add([item(5)]);
  store.clear();
  assert.equal(store.watermark, item(5).at);
});

test("corrupt file starts empty and recovers on next write", () => {
  const file = tmp();
  const seed = new InboxStore(file);
  seed.add([item(1)]);
  writeFileSync(file, "{not json");
  const store = new InboxStore(file);
  assert.equal(store.list().length, 0);
  store.add([item(2)]);
  assert.equal(new InboxStore(file).list().length, 1);
});
