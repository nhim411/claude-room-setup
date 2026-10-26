import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const InboxReasonSchema = z.enum(["finished", "error", "permission"]);

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
});

export type InboxEntry = z.infer<typeof InboxEntrySchema>;
export type InboxReason = z.infer<typeof InboxReasonSchema>;

export const INBOX_MAX_ENTRIES = 300;

const UnreadSchema = z.object({ unreadCount: z.number() });

export const listInbox = defineRpc({
  name: "inbox.list",
  input: z.object({}),
  output: z.object({ entries: z.array(InboxEntrySchema), unreadCount: z.number() }),
});

export const unreadInbox = defineRpc({
  name: "inbox.unread",
  input: z.object({}),
  output: UnreadSchema,
});

export const markInboxRead = defineRpc({
  name: "inbox.mark_read",
  input: z.object({ id: z.string() }),
  output: UnreadSchema,
});

export const markAllInboxRead = defineRpc({
  name: "inbox.mark_all_read",
  input: z.object({}),
  output: UnreadSchema,
});

export const clearInbox = defineRpc({
  name: "inbox.clear",
  input: z.object({}),
  output: UnreadSchema,
});
