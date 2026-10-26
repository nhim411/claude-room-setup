import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { detectTransitions, type AttentionAgent } from "../server/attention.ts";
import { AttentionObserver } from "../server/observer.ts";
import { InboxStore } from "../server/store.ts";

const ctx = (over: object = {}) => ({
  has: () => false,
  watermark: null,
  workspaceName: (id: string | null) => (id ? `ws-${id}` : null),
  ...over,
});
const agent = (over: Partial<AttentionAgent> = {}): AttentionAgent => ({
  id: "a1",
  title: "Task",
  workspaceId: "w1",
  requiresAttention: true,
  attentionReason: "finished",
  attentionTimestamp: "2026-01-01T00:00:10.000Z",
  ...over,
});

test("records requiresAttention transitions with workspace name", () => {
  const [entry] = detectTransitions([agent()], ctx());
  assert.equal(entry.id, "a1:2026-01-01T00:00:10.000Z");
  assert.equal(entry.reason, "finished");
  assert.equal(entry.workspaceName, "ws-w1");
  assert.equal(entry.agentTitle, "Task");
});

test("ignores agents without attention, reason, or timestamp", () => {
  const list = [
    agent({ requiresAttention: false }),
    agent({ id: "b", attentionReason: null }),
    agent({ id: "c", attentionTimestamp: null }),
    agent({ id: "d", requiresAttention: undefined }),
  ];
  assert.equal(detectTransitions(list, ctx()).length, 0);
});

test("dedupes by agentId + attentionTimestamp, new timestamp is a new entry", () => {
  const seen = new Set<string>();
  const run = (a: AttentionAgent) => {
    const found = detectTransitions([a], ctx({ has: (id: string) => seen.has(id) }));
    for (const e of found) seen.add(e.id);
    return found.length;
  };
  assert.equal(run(agent()), 1);
  assert.equal(run(agent()), 0);
  assert.equal(run(agent({ attentionTimestamp: "2026-01-01T00:00:20.000Z", attentionReason: "error" })), 1);
});

test("watermark skips older attention", () => {
  const list = [agent({ attentionTimestamp: "2026-01-01T00:00:05.000Z" }), agent({ id: "n" })];
  const found = detectTransitions(list, ctx({ watermark: "2026-01-01T00:00:05.000Z" }));
  assert.deepEqual(found.map((e) => e.agentId), ["n"]);
});

const tmpStore = () =>
  new InboxStore(path.join(mkdtempSync(path.join(os.tmpdir(), "obs-")), "n.json"));
const names = () => null;

test("observer: brand-new store treats existing attention as already seen", () => {
  const store = tmpStore();
  const observer = new AttentionObserver(store, names, () => "2026-01-01T00:01:00.000Z");
  assert.equal(observer.process([agent()]), 0);
  // same stale attention arriving again via an unrelated upsert stays ignored
  assert.equal(observer.process([agent()]), 0);
  // a genuinely new transition is recorded
  assert.equal(observer.process([agent({ attentionTimestamp: "2026-01-01T00:02:00.000Z" })]), 1);
  assert.equal(store.list().length, 1);
});

test("observer: after restart records attention newer than the stored watermark", () => {
  const store = tmpStore();
  store.add([{ ...detectTransitions([agent()], ctx())[0] }]);
  const restarted = new AttentionObserver(store, names);
  const found = restarted.process([
    agent(),
    agent({ id: "a2", attentionTimestamp: "2026-01-01T00:00:30.000Z", attentionReason: "permission" }),
  ]);
  assert.equal(found, 1);
  assert.equal(store.list()[0].reason, "permission");
});

test("observer: a late older transition from another agent is still recorded", () => {
  const store = tmpStore();
  const observer = new AttentionObserver(store, names, () => "2026-01-01T00:00:00.000Z");
  observer.process([]);
  assert.equal(observer.process([agent({ id: "x", attentionTimestamp: "2026-01-01T00:00:50.000Z" })]), 1);
  assert.equal(observer.process([agent({ id: "y", attentionTimestamp: "2026-01-01T00:00:40.000Z" })]), 1);
});

test("observer: unreadable store file does not throw", () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "obs-")), "n.json");
  writeFileSync(file, "{not json");
  const store = new InboxStore(file);
  assert.equal(store.list().length, 0);
});
