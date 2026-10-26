import { detectTransitions, type AttentionAgent } from "./attention.ts";
import type { InboxStore } from "./store.ts";

/**
 * Turns agent snapshots into stored inbox entries. The first snapshot after startup only records attention
 * newer than the store's watermark (everything on a brand-new store is treated as already seen), so old
 * attention is not replayed; later snapshots dedupe by id.
 */
export class AttentionObserver {
  private initialized = false;
  private readonly ignored = new Set<string>();

  private readonly store: InboxStore;
  private readonly workspaceName: (workspaceId: string | null) => string | null;
  private readonly now: () => string;

  constructor(
    store: InboxStore,
    workspaceName: (workspaceId: string | null) => string | null,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.store = store;
    this.workspaceName = workspaceName;
    this.now = now;
  }

  process(agents: readonly AttentionAgent[]): number {
    let watermark: string | null = null;
    const initial = !this.initialized;
    if (initial) {
      this.initialized = true;
      watermark = this.store.watermark ?? this.now();
    }
    const context = {
      has: (id: string) => this.ignored.has(id) || this.store.has(id),
      watermark,
      workspaceName: this.workspaceName,
    };
    const found = detectTransitions(agents, context);
    if (initial) {
      // Attention that predates the inbox stays ignored for later snapshots of the same agent.
      const recorded = new Set(found.map((entry) => entry.id));
      for (const agent of agents) {
        if (agent.requiresAttention && agent.attentionTimestamp) {
          const id = `${agent.id}:${agent.attentionTimestamp}`;
          if (!recorded.has(id) && !this.store.has(id)) this.ignored.add(id);
        }
      }
      if (this.store.watermark === null) this.store.setWatermark(watermark ?? this.now());
    }
    return this.store.add(found).length;
  }
}
