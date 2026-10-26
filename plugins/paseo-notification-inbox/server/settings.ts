import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_INBOX_FILTER, InboxFilterSchema, type InboxFilter } from "../shared/inbox.ts";

const FileSchema = z.object({ version: z.literal(1), filter: InboxFilterSchema });

/** Daemon-side view settings, so the role filter survives reloads and is the same for every client. */
export class SettingsStore {
  private filterValue: InboxFilter | null = null;

  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  get filter(): InboxFilter {
    if (this.filterValue === null) {
      try {
        this.filterValue = FileSchema.parse(JSON.parse(readFileSync(this.file, "utf8"))).filter;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(`[notification-inbox] unreadable settings ${this.file}, using defaults:`, error);
        }
        this.filterValue = DEFAULT_INBOX_FILTER;
      }
    }
    return this.filterValue;
  }

  setFilter(filter: InboxFilter): InboxFilter {
    const roles = DEFAULT_INBOX_FILTER.roles.filter((role) => filter.roles.includes(role));
    this.filterValue = { roles };
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, filter: this.filterValue }, null, 2));
    renameSync(tmp, this.file);
    return this.filterValue;
  }
}
