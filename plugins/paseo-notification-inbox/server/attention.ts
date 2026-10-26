import type { InboxEntry, InboxReason } from "../shared/inbox.ts";

/** The subset of an agent snapshot the transition logic needs. */
export interface AttentionAgent {
  id: string;
  title?: string | null;
  workspaceId?: string | null;
  requiresAttention?: boolean;
  attentionReason?: InboxReason | null;
  attentionTimestamp?: string | null;
}

export interface AttentionContext {
  /** True when an entry with this id is already stored. */
  has(id: string): boolean;
  /** Attention at or before this ISO time predates the inbox and is not recorded. */
  watermark: string | null;
  workspaceName(workspaceId: string | null): string | null;
}

/**
 * Entries for agents that are currently in a new attention transition: requiresAttention with a reason and
 * timestamp, not stored yet, and newer than the watermark. Identity is agentId + attentionTimestamp.
 */
export function detectTransitions(
  agents: readonly AttentionAgent[],
  context: AttentionContext,
): Omit<InboxEntry, "read">[] {
  const result: Omit<InboxEntry, "read">[] = [];
  const seen = new Set<string>();
  for (const agent of agents) {
    if (!agent.requiresAttention || !agent.attentionReason || !agent.attentionTimestamp) continue;
    const id = `${agent.id}:${agent.attentionTimestamp}`;
    if (seen.has(id) || context.has(id)) continue;
    if (context.watermark !== null && agent.attentionTimestamp <= context.watermark) continue;
    seen.add(id);
    const workspaceId = agent.workspaceId ?? null;
    result.push({
      id,
      agentId: agent.id,
      agentTitle: agent.title ?? null,
      reason: agent.attentionReason,
      workspaceId,
      workspaceName: context.workspaceName(workspaceId),
      at: agent.attentionTimestamp,
    });
  }
  return result;
}
