import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { detectTransitions, type AttentionAgent } from "../server/attention.ts";
import { SettingsStore } from "../server/settings.ts";
import { InboxStore } from "../server/store.ts";
import { InboxEntrySchema, entryRole, roleFromProvider, type InboxFilter } from "../shared/inbox.ts";

const dir = () => mkdtempSync(path.join(os.tmpdir(), "roles-"));
const entry = (n: number, role?: "supervisor" | "lead" | "peer" | "other") => ({
  id: `a${n}:2026-01-01T00:00:${String(n).padStart(2, "0")}.000Z`,
  agentId: `a${n}`,
  agentTitle: `Agent ${n}`,
  reason: "finished" as const,
  workspaceId: null,
  workspaceName: null,
  at: `2026-01-01T00:00:${String(n).padStart(2, "0")}.000Z`,
  ...(role ? { role, provider: `claude-${role}` } : {}),
});
const only = (...roles: InboxFilter["roles"]): InboxFilter => ({ roles });

test("roleFromProvider maps the room providers and everything else to other", () => {
  assert.equal(roleFromProvider("claude-supervisor"), "supervisor");
  assert.equal(roleFromProvider("claude-lead"), "lead");
  assert.equal(roleFromProvider("claude-peer"), "peer");
  assert.equal(roleFromProvider("claude-peer/claude-haiku-5-5"), "peer");
  assert.equal(roleFromProvider("claude"), "other");
  assert.equal(roleFromProvider("claude-leader"), "other");
  assert.equal(roleFromProvider(null), "other");
  assert.equal(roleFromProvider(undefined), "other");
});

test("new transitions record role and raw provider", () => {
  const agent: AttentionAgent = {
    id: "a1",
    provider: "claude-lead",
    requiresAttention: true,
    attentionReason: "finished",
    attentionTimestamp: "2026-01-01T00:00:10.000Z",
  };
  const ctx = { has: () => false, watermark: null, workspaceName: () => null };
  const [lead] = detectTransitions([agent], ctx);
  assert.equal(lead.role, "lead");
  assert.equal(lead.provider, "claude-lead");
  const [other] = detectTransitions([{ ...agent, id: "a2", provider: "codex/gpt" }], ctx);
  assert.equal(other.role, "other");
  assert.equal(other.provider, "codex/gpt");
  const [missing] = detectTransitions([{ ...agent, id: "a3", provider: undefined }], ctx);
  assert.equal(missing.role, "other");
  assert.equal(missing.provider, null);
});

test("old store file without roles still loads; entries count as other", () => {
  const file = path.join(dir(), "notifications.json");
  const old = { ...entry(1), read: false };
  writeFileSync(file, JSON.stringify({ version: 1, watermark: old.at, entries: [old] }));
  assert.equal(InboxEntrySchema.parse(old).role, undefined);
  const store = new InboxStore(file);
  assert.equal(store.list().length, 1);
  assert.equal(entryRole(store.list()[0]), "other");
  assert.equal(store.list(only("other")).length, 1);
  assert.equal(store.list(only("peer")).length, 0);
});

test("resolveRoles fills role-less entries from live agents and persists", () => {
  const file = path.join(dir(), "notifications.json");
  const store = new InboxStore(file);
  store.add([entry(1), entry(2), entry(3, "lead")]);
  assert.deepEqual(store.unresolvedAgentIds().sort(), ["a1", "a2"]);
  const changed = store.resolveRoles(new Map([["a1", "claude-peer"], ["a3", "claude-peer"]]));
  assert.equal(changed, 1);
  const byAgent = Object.fromEntries(store.list().map((e) => [e.agentId, e]));
  assert.equal(byAgent.a1.role, "peer");
  assert.equal(byAgent.a1.provider, "claude-peer");
  assert.equal(byAgent.a2.role, undefined);
  assert.equal(byAgent.a3.role, "lead"); // an existing role is never overwritten
  assert.deepEqual(store.unresolvedAgentIds(), ["a2"]);
  assert.equal(new InboxStore(file).list().find((e) => e.agentId === "a1")?.role, "peer");
});

test("unread count only counts entries matching the filter", () => {
  const store = new InboxStore(path.join(dir(), "n.json"));
  store.add([entry(1, "supervisor"), entry(2, "lead"), entry(3, "peer"), entry(4, "peer"), entry(5)]);
  assert.equal(store.unreadCount(), 5);
  assert.equal(store.unreadCount(only("supervisor", "lead")), 2);
  assert.equal(store.unreadCount(only("peer")), 2);
  assert.equal(store.unreadCount(only("other")), 1);
  assert.equal(store.unreadCount(only()), 0);
});

test("markAllRead with a filter leaves other roles unread", () => {
  const store = new InboxStore(path.join(dir(), "n.json"));
  store.add([entry(1, "lead"), entry(2, "peer"), entry(3, "peer")]);
  store.markAllRead(only("lead"));
  assert.equal(store.unreadCount(only("lead")), 0);
  assert.equal(store.unreadCount(only("peer")), 2);
  store.markAllRead();
  assert.equal(store.unreadCount(), 0);
});

test("clear with a filter removes only matching entries and keeps the watermark", () => {
  const store = new InboxStore(path.join(dir(), "n.json"));
  store.add([entry(1, "lead"), entry(2, "peer"), entry(3, "peer"), entry(4)]);
  const watermark = store.watermark;
  store.clear(only("peer", "other"));
  assert.deepEqual(store.list().map((e) => e.agentId), ["a1"]);
  assert.equal(store.watermark, watermark);
  store.clear(only());
  assert.equal(store.list().length, 1);
  store.clear();
  assert.equal(store.list().length, 0);
});

test("filter defaults to every role and persists across instances", () => {
  const file = path.join(dir(), "settings.json");
  const first = new SettingsStore(file);
  assert.deepEqual(first.filter.roles, ["supervisor", "lead", "peer", "other"]);
  first.setFilter(only("lead", "supervisor"));
  assert.deepEqual(first.filter.roles, ["supervisor", "lead"]); // canonical order
  assert.deepEqual(new SettingsStore(file).filter.roles, ["supervisor", "lead"]);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).version, 1);
  new SettingsStore(file).setFilter(only());
  assert.deepEqual(new SettingsStore(file).filter.roles, []);
});

test("corrupt settings file falls back to all roles", () => {
  const file = path.join(dir(), "settings.json");
  writeFileSync(file, "{nope");
  assert.equal(new SettingsStore(file).filter.roles.length, 4);
});
