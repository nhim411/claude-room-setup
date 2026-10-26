import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const InboxReasonSchema = z.enum(["finished", "error", "permission"]);

export const INBOX_ROLES = ["supervisor", "lead", "peer", "other"] as const;
export const InboxRoleSchema = z.enum(INBOX_ROLES);
export type InboxRole = z.infer<typeof InboxRoleSchema>;

const ROLE_BY_PROVIDER: Record<string, InboxRole> = {
  "claude-supervisor": "supervisor",
  "claude-lead": "lead",
  "claude-peer": "peer",
};

/** Room role from an agent snapshot's `provider`. A `provider/model` form is read by its provider part. */
export function roleFromProvider(provider: string | null | undefined): InboxRole {
  if (!provider) return "other";
  return ROLE_BY_PROVIDER[provider.split("/")[0] ?? ""] ?? "other";
}

export const InboxEntrySchema = z.object({
  /** `${agentId}:${attentionTimestamp}`: one entry per attention transition. */
  id: z.string(),
  agentId: z.string(),
  agentTitle: z.string().nullable(),
  reason: InboxReasonSchema,
  workspaceId: z.string().nullable(),
  workspaceName: z.string().nullable(),
  /** ISO time of the attention transition. */
  at: z.string(),
  read: z.boolean(),
  /** Absent on entries recorded before 1.1.0 until the agent can be looked up; such entries count as "other". */
  role: InboxRoleSchema.optional(),
  /** Raw agent provider id at record time. */
  provider: z.string().nullable().optional(),
});

export type InboxEntry = z.infer<typeof InboxEntrySchema>;
export type InboxReason = z.infer<typeof InboxReasonSchema>;

export const INBOX_MAX_ENTRIES = 300;

/** Role an entry is filtered by: unresolved entries are "other". */
export function entryRole(entry: Pick<InboxEntry, "role">): InboxRole {
  return entry.role ?? "other";
}

/** Which roles the inbox shows; view-only, every agent is still recorded. */
export const InboxFilterSchema = z.object({ roles: z.array(InboxRoleSchema) });
export type InboxFilter = z.infer<typeof InboxFilterSchema>;
export const DEFAULT_INBOX_FILTER: InboxFilter = { roles: [...INBOX_ROLES] };

const UnreadSchema = z.object({ unreadCount: z.number() });

/** Entries, unread count and counts are for the saved filter; `total` is every stored entry. */
export const listInbox = defineRpc({
  name: "inbox.list",
  input: z.object({}),
  output: z.object({
    entries: z.array(InboxEntrySchema),
    unreadCount: z.number(),
    total: z.number(),
    filter: InboxFilterSchema,
  }),
});

export const unreadInbox = defineRpc({
  name: "inbox.unread",
  input: z.object({}),
  output: UnreadSchema,
});

export const setInboxFilter = defineRpc({
  name: "inbox.set_filter",
  input: InboxFilterSchema,
  output: InboxFilterSchema,
});

export const markInboxRead = defineRpc({
  name: "inbox.mark_read",
  input: z.object({ id: z.string() }),
  output: UnreadSchema,
});

/** Marks read only the entries matching the saved filter. */
export const markAllInboxRead = defineRpc({
  name: "inbox.mark_all_read",
  input: z.object({}),
  output: UnreadSchema,
});

/** Removes only the entries matching the saved filter. */
export const clearInbox = defineRpc({
  name: "inbox.clear",
  input: z.object({}),
  output: UnreadSchema,
});
