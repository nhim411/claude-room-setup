import type { PluginClientContext } from "@getpaseo/plugin/client";
import { InboxScreen, InboxSidebarItem } from "./client/inbox.tsx";

export default function contribute(client: PluginClientContext) {
  const removers = [
    client.addScreen({ id: "inbox", title: "Notifications", Component: InboxScreen }),
    client.addSidebarHeaderItem({
      id: "inbox",
      title: "Notifications",
      Component: InboxSidebarItem,
    }),
  ];
  return () => {
    for (const remove of removers) remove();
  };
}
