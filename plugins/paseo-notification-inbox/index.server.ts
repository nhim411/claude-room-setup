import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { AttentionObserver } from "./server/observer.ts";
import { dataFile, settingsFile } from "./server/paths.ts";
import { SettingsStore } from "./server/settings.ts";
import { InboxStore } from "./server/store.ts";
import {
  clearInbox,
  listInbox,
  markAllInboxRead,
  markInboxRead,
  setInboxFilter,
  unreadInbox,
} from "./shared/inbox.ts";

type Paseo = PluginHandlerContext["paseo"];

const RECONCILE_DELAY_MS = 1_500;

export default function contribute(server: PluginServerContext) {
  const store = new InboxStore(dataFile());
  const settings = new SettingsStore(settingsFile());
  // Attention before the first load is not replayed; later attention is recorded from here on.
  if (store.watermark === null) store.setWatermark(new Date().toISOString());
  const workspaceNames = new Map<string, string>();
  const observer = new AttentionObserver(store, (id) => (id ? (workspaceNames.get(id) ?? null) : null));
  const lifetime = new AbortController();
  // Agents already looked up for a role, so archived or deleted ones are not searched again on every poll.
  const roleLookups = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let observing: Paseo | null = null;

  async function refreshWorkspaceNames(paseo: Paseo): Promise<void> {
    try {
      const { entries } = await paseo.workspaces.list();
      for (const workspace of entries) workspaceNames.set(workspace.id, workspace.title ?? workspace.name);
    } catch (error) {
      console.error("[notification-inbox] workspace names unavailable:", error);
    }
  }

  async function reconcile(paseo: Paseo): Promise<void> {
    try {
      const { entries } = await paseo.agents.list();
      await refreshWorkspaceNames(paseo);
      observer.process(entries.map((entry) => entry.agent));
    } catch (error) {
      console.error("[notification-inbox] reconcile failed:", error);
    }
  }

  /** Gives pre-1.1.0 entries a role from the live agent list, when their agent still exists. */
  async function resolveMissingRoles(paseo: Paseo): Promise<void> {
    const wanted = store.unresolvedAgentIds().filter((id) => !roleLookups.has(id));
    if (wanted.length === 0) return;
    try {
      const { entries } = await paseo.agents.list();
      const providers = new Map(entries.map(({ agent }) => [agent.id, agent.provider]));
      for (const id of wanted) roleLookups.add(id);
      store.resolveRoles(providers);
    } catch (error) {
      console.error("[notification-inbox] role lookup failed:", error);
    }
  }

  // The server context has no Paseo handle at load; the first hook or RPC supplies one.
  async function ensureObserving(paseo: Paseo): Promise<void> {
    if (observing || lifetime.signal.aborted) return;
    observing = paseo;
    try {
      await refreshWorkspaceNames(paseo);
      const { entries, subscription } = await paseo.agents.list({
        subscribe: {},
        signal: lifetime.signal,
      });
      observer.process(entries.map((entry) => entry.agent));
      subscription.subscribe({
        snapshot: (snapshot) => observer.process(snapshot.entries.map((entry) => entry.agent)),
        update: (message) => {
          if (message.type !== "agent_update" || message.payload.kind !== "upsert") return;
          const agent = message.payload.agent;
          if (agent.workspaceId && !workspaceNames.has(agent.workspaceId)) void refreshWorkspaceNames(paseo);
          observer.process([agent]);
        },
        error: (error) => {
          console.error("[notification-inbox] agent subscription error:", error);
          observing = null;
        },
      });
      console.log("[notification-inbox] observing agent attention");
    } catch (error) {
      console.error("[notification-inbox] could not observe agents:", error);
      observing = null;
    }
  }

  function scheduleReconcile(paseo: Paseo): void {
    void ensureObserving(paseo);
    const timer = setTimeout(() => {
      timers.delete(timer);
      void reconcile(paseo);
    }, RECONCILE_DELAY_MS);
    timers.add(timer);
  }

  const removers = [
    server.on("agent.turn_ended", (_event, { paseo }) => scheduleReconcile(paseo)),
    server.on("agent.permission_requested", (_event, { paseo }) => scheduleReconcile(paseo)),
    server.on("agent.created", (_event, { paseo }) => void ensureObserving(paseo)),
  ];

  server.handle(listInbox, async (_input, { paseo }) => {
    void ensureObserving(paseo);
    await resolveMissingRoles(paseo);
    const filter = settings.filter;
    return {
      entries: store.list(filter),
      unreadCount: store.unreadCount(filter),
      total: store.list().length,
      filter,
    };
  });
  server.handle(unreadInbox, async (_input, { paseo }) => {
    void ensureObserving(paseo);
    await resolveMissingRoles(paseo);
    return { unreadCount: store.unreadCount(settings.filter) };
  });
  server.handle(setInboxFilter, (input) => settings.setFilter(input));
  server.handle(markInboxRead, ({ id }) => {
    store.markRead(id);
    return { unreadCount: store.unreadCount(settings.filter) };
  });
  server.handle(markAllInboxRead, () => {
    store.markAllRead(settings.filter);
    return { unreadCount: store.unreadCount(settings.filter) };
  });
  server.handle(clearInbox, () => {
    store.clear(settings.filter);
    return { unreadCount: store.unreadCount(settings.filter) };
  });

  console.log(`[notification-inbox] ready, storing to ${dataFile()}`);
  return () => {
    lifetime.abort();
    for (const timer of timers) clearTimeout(timer);
    for (const remove of removers) remove();
  };
}
