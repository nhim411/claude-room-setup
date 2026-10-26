import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  INBOX_MAX_ENTRIES,
  InboxEntrySchema,
  entryRole,
  roleFromProvider,
  type InboxEntry,
  type InboxFilter,
} from "../shared/inbox.ts";
import { z } from "zod";

const FileSchema = z.object({
  version: z.literal(1),
  /** Newest attention timestamp ever considered; older snapshot attention is not recorded. */
  watermark: z.string().nullable(),
  entries: z.array(InboxEntrySchema),
});

export class InboxStore {
  private entries: InboxEntry[] = [];
  private watermarkValue: string | null = null;
  private loaded = false;

  private readonly file: string;
  private readonly cap: number;

  constructor(file: string, cap: number = INBOX_MAX_ENTRIES) {
    this.file = file;
    this.cap = cap;
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed = FileSchema.parse(JSON.parse(readFileSync(this.file, "utf8")));
      this.entries = parsed.entries;
      this.watermarkValue = parsed.watermark;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`[notification-inbox] unreadable store ${this.file}, starting empty:`, error);
      }
    }
  }

  private save(): void {
    const body = JSON.stringify(
      { version: 1, watermark: this.watermarkValue, entries: this.entries },
      null,
      2,
    );
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, body);
    renameSync(tmp, this.file);
  }

  get watermark(): string | null {
    this.load();
    return this.watermarkValue;
  }

  has(id: string): boolean {
    this.load();
    return this.entries.some((entry) => entry.id === id);
  }

  /** Records a baseline timestamp without adding entries (first run). */
  setWatermark(value: string): void {
    this.load();
    if (this.watermarkValue !== null && this.watermarkValue >= value) return;
    this.watermarkValue = value;
    this.save();
  }

  /** Adds new entries (deduped by id), keeps newest first, caps the history. Returns those added. */
  add(incoming: readonly Omit<InboxEntry, "read">[]): InboxEntry[] {
    this.load();
    const added: InboxEntry[] = [];
    for (const item of incoming) {
      if (this.entries.some((entry) => entry.id === item.id) || added.some((e) => e.id === item.id)) continue;
      added.push({ ...item, read: false });
    }
    if (added.length === 0) return added;
    this.entries = [...added, ...this.entries]
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, this.cap);
    for (const entry of added) {
      if (this.watermarkValue === null || entry.at > this.watermarkValue) this.watermarkValue = entry.at;
    }
    this.save();
    return added;
  }

  /** Entries whose role passes the filter; everything when no filter is given. */
  list(filter?: InboxFilter): InboxEntry[] {
    this.load();
    if (!filter) return this.entries;
    return this.entries.filter((entry) => filter.roles.includes(entryRole(entry)));
  }

  unreadCount(filter?: InboxFilter): number {
    return this.list(filter).filter((entry) => !entry.read).length;
  }

  /** Agent ids of entries recorded before roles existed. */
  unresolvedAgentIds(): string[] {
    this.load();
    return [...new Set(this.entries.filter((entry) => entry.role === undefined).map((e) => e.agentId))];
  }

  /** Fills role and provider on role-less entries whose agent is in `providers`. Returns how many changed. */
  resolveRoles(providers: ReadonlyMap<string, string>): number {
    this.load();
    let changed = 0;
    for (const entry of this.entries) {
      const provider = entry.role === undefined ? providers.get(entry.agentId) : undefined;
      if (provider === undefined) continue;
      entry.role = roleFromProvider(provider);
      entry.provider = provider;
      changed += 1;
    }
    if (changed > 0) this.save();
    return changed;
  }

  markRead(id: string): void {
    this.load();
    const target = this.entries.find((entry) => entry.id === id);
    if (!target || target.read) return;
    target.read = true;
    this.save();
  }

  /** Marks read the entries passing the filter (all when none is given). */
  markAllRead(filter?: InboxFilter): void {
    const unread = this.list(filter).filter((entry) => !entry.read);
    if (unread.length === 0) return;
    for (const entry of unread) entry.read = true;
    this.save();
  }

  /** Removes the entries passing the filter (all when none is given). */
  clear(filter?: InboxFilter): void {
    this.load();
    if (!filter) this.entries = [];
    else this.entries = this.entries.filter((entry) => !filter.roles.includes(entryRole(entry)));
    this.save();
  }
}
