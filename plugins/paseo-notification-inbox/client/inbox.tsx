import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, SidebarRow } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import {
  clearInbox,
  listInbox,
  markAllInboxRead,
  markInboxRead,
  unreadInbox,
  type InboxEntry,
  type InboxReason,
} from "../shared/inbox.ts";
import { relativeTime } from "./time.ts";

const REFRESH_MS = 5_000;
const LIST_KEY = ["notification-inbox", "list"] as const;
const UNREAD_KEY = ["notification-inbox", "unread"] as const;

const REASON_LABEL: Record<InboxReason, string> = {
  finished: "Finished",
  error: "Error",
  permission: "Needs permission",
};
const REASON_ICON: Record<InboxReason, string> = {
  finished: "CircleCheck",
  error: "CircleAlert",
  permission: "ShieldQuestion",
};

function reasonColor(theme: PluginTheme, reason: InboxReason): string {
  if (reason === "error") return theme.colors.statusDanger;
  if (reason === "permission") return theme.colors.statusWarning;
  return theme.colors.statusSuccess;
}

export function InboxSidebarItem({ currentScreen, openScreen, theme }: PluginSidebarItemProps) {
  const unread = useRpc(unreadInbox);
  const { data } = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => unread({}),
    refetchInterval: REFRESH_MS,
  });
  const count = data?.unreadCount ?? 0;
  return (
    <SidebarRow
      icon="Bell"
      active={currentScreen?.screenId === "inbox"}
      onPress={() => openScreen({ screenId: "inbox" })}
      trailing={
        count > 0 ? (
          <View
            accessibilityLabel={`${count} unread notifications`}
            style={{
              minWidth: 20,
              height: 20,
              paddingHorizontal: 6,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.accent,
            }}
          >
            <Text style={{ color: theme.colors.accentForeground, fontSize: 12 }}>
              {count > 99 ? "99+" : String(count)}
            </Text>
          </View>
        ) : null
      }
    />
  );
}

export function InboxScreen({ theme, layout, host, navigation }: PluginScreenProps) {
  const queryClient = useQueryClient();
  const list = useRpc(listInbox);
  const markRead = useRpc(markInboxRead);
  const markAll = useRpc(markAllInboxRead);
  const clear = useRpc(clearInbox);

  const query = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => list({}),
    refetchInterval: REFRESH_MS,
  });
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: LIST_KEY }),
      queryClient.invalidateQueries({ queryKey: UNREAD_KEY }),
    ]);
  const readMutation = useMutation({ mutationFn: (id: string) => markRead({ id }), onSuccess: invalidate });
  const readAllMutation = useMutation({ mutationFn: () => markAll({}), onSuccess: invalidate });
  const clearMutation = useMutation({ mutationFn: () => clear({}), onSuccess: invalidate });

  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      toolbar: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: 8,
        padding: layout.compact ? 12 : 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      summary: { color: theme.colors.foregroundMuted, fontSize: 14, flexShrink: 1 },
      actions: { flexDirection: "row" as const, gap: 8 },
      button: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.surface2,
      },
      buttonText: { color: theme.colors.foreground, fontSize: 14 },
      row: {
        flexDirection: "row" as const,
        alignItems: "flex-start" as const,
        gap: 12,
        padding: layout.compact ? 12 : 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      rowBody: { flex: 1, gap: 2 },
      title: { color: theme.colors.foreground, fontSize: 15 },
      meta: { color: theme.colors.foregroundMuted, fontSize: 13 },
      empty: { color: theme.colors.foregroundMuted, padding: 24, textAlign: "center" as const },
    }),
    [theme, layout.compact],
  );

  const entries = query.data?.entries ?? [];
  const unreadCount = query.data?.unreadCount ?? 0;

  function open(entry: InboxEntry) {
    if (!entry.read) readMutation.mutate(entry.id);
    navigation?.openAgent({ agentId: entry.agentId, serverId: host.id });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Text style={styles.summary}>
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications read"
            disabled={unreadCount === 0}
            onPress={() => readAllMutation.mutate()}
            style={[styles.button, unreadCount === 0 && { opacity: 0.5 }]}
          >
            <Text style={styles.buttonText}>Mark all read</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear all notifications"
            disabled={entries.length === 0}
            onPress={() => clearMutation.mutate()}
            style={[styles.button, entries.length === 0 && { opacity: 0.5 }]}
          >
            <Text style={styles.buttonText}>Clear</Text>
          </Pressable>
        </View>
      </View>
      {query.isError ? (
        <Text style={styles.empty}>Could not load notifications. Retrying.</Text>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(entry) => entry.id}
          ListEmptyComponent={
            query.isPending ? undefined : <Text style={styles.empty}>No notifications yet.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${REASON_LABEL[item.reason]}: ${item.agentTitle ?? "Untitled agent"}${item.read ? "" : ", unread"}`}
              onPress={() => open(item)}
              style={styles.row}
            >
              <Icon
                name={REASON_ICON[item.reason]}
                size={18}
                color={reasonColor(theme, item.reason)}
              />
              <View style={styles.rowBody}>
                <Text
                  numberOfLines={1}
                  style={[styles.title, !item.read && { fontWeight: "700" }]}
                >
                  {item.agentTitle ?? "Untitled agent"}
                </Text>
                <Text numberOfLines={1} style={styles.meta}>
                  {[REASON_LABEL[item.reason], item.workspaceName, relativeTime(item.at)]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              {!item.read ? (
                <View
                  accessibilityLabel="Unread"
                  style={{
                    width: 8,
                    height: 8,
                    marginTop: 6,
                    borderRadius: 4,
                    backgroundColor: theme.colors.accent,
                  }}
                />
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
