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
  INBOX_ROLES,
  entryRole,
  markInboxRead,
  setInboxFilter,
  unreadInbox,
  type InboxEntry,
  type InboxFilter,
  type InboxReason,
  type InboxRole,
} from "../shared/inbox.ts";
import { relativeTime } from "./time.ts";

type ListData = { entries: InboxEntry[]; unreadCount: number; total: number; filter: InboxFilter };

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

const ROLE_LABEL: Record<InboxRole, string> = {
  supervisor: "Supervisor",
  lead: "Lead",
  peer: "Peer",
  other: "Other",
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
  const saveFilter = useRpc(setInboxFilter);

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
  const filterMutation = useMutation({
    mutationFn: (filter: InboxFilter) => saveFilter(filter),
    onMutate: (filter) => {
      queryClient.setQueryData<ListData>(LIST_KEY, (old) => (old ? { ...old, filter } : old));
    },
    onSettled: invalidate,
  });

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
      chips: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: layout.compact ? 12 : 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      chip: {
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      chipOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
      chipText: { color: theme.colors.foregroundMuted, fontSize: 13 },
      chipTextOn: { color: theme.colors.accentForeground },
      titleLine: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      roleTag: {
        color: theme.colors.foregroundMuted,
        fontSize: 11,
        paddingHorizontal: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
      },
      empty: { color: theme.colors.foregroundMuted, padding: 24, textAlign: "center" as const },
    }),
    [theme, layout.compact],
  );

  const entries = query.data?.entries ?? [];
  const unreadCount = query.data?.unreadCount ?? 0;
  const total = query.data?.total ?? 0;
  const activeRoles = query.data?.filter.roles ?? INBOX_ROLES;
  const filtered = activeRoles.length < INBOX_ROLES.length;
  const shown = filtered ? "shown" : "all";

  function toggleRole(role: InboxRole) {
    const roles = activeRoles.includes(role)
      ? activeRoles.filter((r) => r !== role)
      : INBOX_ROLES.filter((r) => r === role || activeRoles.includes(r));
    filterMutation.mutate({ roles });
  }

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
            accessibilityLabel={`Mark ${shown} notifications read`}
            disabled={unreadCount === 0}
            onPress={() => readAllMutation.mutate()}
            style={[styles.button, unreadCount === 0 && { opacity: 0.5 }]}
          >
            <Text style={styles.buttonText}>{filtered ? "Mark shown read" : "Mark all read"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${shown} notifications`}
            disabled={entries.length === 0}
            onPress={() => clearMutation.mutate()}
            style={[styles.button, entries.length === 0 && { opacity: 0.5 }]}
          >
            <Text style={styles.buttonText}>{filtered ? `Clear shown (${entries.length})` : "Clear"}</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.chips}>
        {INBOX_ROLES.map((role) => {
          const on = activeRoles.includes(role);
          return (
            <Pressable
              key={role}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${ROLE_LABEL[role]} notifications ${on ? "shown" : "hidden"}`}
              onPress={() => toggleRole(role)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{ROLE_LABEL[role]}</Text>
            </Pressable>
          );
        })}
      </View>
      {query.isError ? (
        <Text style={styles.empty}>Could not load notifications. Retrying.</Text>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(entry) => entry.id}
          ListEmptyComponent={
            query.isPending ? undefined : (
              <Text style={styles.empty}>
                {total > 0 ? "No notifications match the selected roles." : "No notifications yet."}
              </Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${ROLE_LABEL[entryRole(item)]} ${REASON_LABEL[item.reason]}: ${item.agentTitle ?? "Untitled agent"}${item.read ? "" : ", unread"}`}
              onPress={() => open(item)}
              style={styles.row}
            >
              <Icon
                name={REASON_ICON[item.reason]}
                size={18}
                color={reasonColor(theme, item.reason)}
              />
              <View style={styles.rowBody}>
                <View style={styles.titleLine}>
                  <Text
                    numberOfLines={1}
                    style={[styles.title, !item.read && { fontWeight: "700" }, { flexShrink: 1 }]}
                  >
                    {item.agentTitle ?? "Untitled agent"}
                  </Text>
                  <Text style={styles.roleTag}>{ROLE_LABEL[entryRole(item)]}</Text>
                </View>
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
