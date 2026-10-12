import type {
  AddMagnetResponse,
  FolderListing,
  QuotaResponse,
  SeedrFile,
  SeedrFolder,
  SeedrTask,
  SeedrTorrentLegacy,
  UserResponse,
} from "./types.ts";

const BASE = "https://www.seedr.cc/api/v0.1";

export class SeedrError extends Error {
  status?: number;
  body?: string;
  constructor(message: string, status?: number, body?: string) {
    super(message);
    this.name = "SeedrError";
    this.status = status;
    this.body = body;
  }
}

export class SeedrClient {
  private pat: string;
  private debug = false;

  constructor(pat: string, debug = false) {
    if (!pat) throw new SeedrError("PAT token is empty");
    this.pat = pat;
    this.debug = debug;
  }

  setDebug(v: boolean): void {
    this.debug = v;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.pat}`,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en",
      "User-Agent": "seedr-cli/2.0",
      "Sec-GPC": "1",
      ...extra,
    };
  }

  private log(msg: string) {
    if (this.debug) console.error(`[seedr-cli debug] ${msg}`);
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const url = `${BASE}${path}`;
    const method = init.method ?? "GET";
    this.log(`→ ${method} ${path}`);
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: this.headers((init.headers as Record<string, string>) ?? {}),
      });
    } catch (e) {
      throw new SeedrError(`network: ${(e as Error).message}`);
    }
    const text = await res.text();
    this.log(`← ${res.status} ${text.slice(0, 300)}`);
    if (!res.ok) {
      throw new SeedrError(
        `HTTP ${res.status} ${res.statusText} — ${text.slice(0, 200)}`,
        res.status,
        text,
      );
    }
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  getUser(): Promise<UserResponse> {
    return this.request<UserResponse>("/p/user");
  }

  getQuota(): Promise<QuotaResponse> {
    return this.request<QuotaResponse>("/p/me/quota");
  }

  async listRoot(): Promise<FolderListing> {
    const raw = await this.request<Record<string, unknown>>("/p/fs/root/contents");
    return this.parseListing(raw);
  }

  async listFolder(folderId: number): Promise<FolderListing> {
    const raw = await this.request<Record<string, unknown>>(
      `/p/fs/folder/${folderId}/contents`,
    );
    return this.parseListing(raw);
  }

  private parseListing(raw: Record<string, unknown>): FolderListing {
    const folders = Array.isArray(raw?.folders)
      ? (raw.folders as SeedrFolder[]).filter((f) => f.id > 0)
      : [];
    const files = Array.isArray(raw?.files)
      ? (raw.files as SeedrFile[]).filter((f) => f.id > 0)
      : [];
    const torrents = Array.isArray(raw?.torrents)
      ? (raw.torrents as SeedrTorrentLegacy[])
      : [];
    return { folders, files, torrents };
  }

  async getFileUrl(id: number): Promise<string> {
    const res = await this.request<{ url?: string } | string>(
      `/p/download/file/${id}/url`,
    );
    if (typeof res === "string" && res.startsWith("http")) return res;
    if (res && typeof res === "object" && typeof res.url === "string") {
      return res.url;
    }
    throw new SeedrError("no URL in download response");
  }

  async getFolderArchiveUrl(folderId: number): Promise<string> {
    const url = `${BASE}/p/download/archive/${folderId}`;
    this.log(`→ GET (manual redirect) /p/download/archive/${folderId}`);
    const res = await fetch(url, {
      headers: this.headers(),
      redirect: "manual",
    });
    const loc = res.headers.get("location");
    if (loc) return loc;
    const text = await res.text();
    if (!res.ok) {
      throw new SeedrError(
        `archive endpoint: HTTP ${res.status} — ${text.slice(0, 200)}`,
        res.status,
        text,
      );
    }
    try {
      const j = JSON.parse(text) as { url?: string };
      if (typeof j.url === "string") return j.url;
    } catch {
      // fall through
    }
    if (text.startsWith("http")) return text.trim();
    throw new SeedrError(
      `could not obtain archive URL — ${text.slice(0, 200)}`,
    );
  }

  async listTasks(): Promise<SeedrTask[]> {
    const raw = await this.request<{ tasks?: SeedrTask[] } | SeedrTask[]>(
      "/p/tasks",
    );
    if (Array.isArray(raw)) return raw;
    return raw.tasks ?? [];
  }

  async getTask(id: number): Promise<SeedrTask> {
    const raw = await this.request<{ task?: SeedrTask } | SeedrTask>(
      `/p/tasks/${id}`,
    );
    if (raw && typeof raw === "object" && "task" in raw && raw.task) {
      return raw.task;
    }
    if (raw && typeof raw === "object" && "id" in raw && "state" in raw) {
      return raw as SeedrTask;
    }
    throw new SeedrError("unexpected task response shape");
  }

  async addMagnet(magnet: string, folderId = 0): Promise<AddMagnetResponse> {
    const trimmed = magnet.trim();
    try {
      const res = await this.request<AddMagnetResponse>("/p/tasks", {
        method: "POST",
        body: JSON.stringify({ torrent_magnet: trimmed, folder_id: folderId }),
        headers: { "Content-Type": "application/json" },
      });
      if (res && typeof res === "object" && "success" in res && !res.success) {
        throw new SeedrError(`seedr rejected: ${JSON.stringify(res)}`);
      }
      return res;
    } catch (err) {
      if (
        !(err instanceof SeedrError) ||
        ![400, 415, 422].includes(err.status ?? 0)
      ) {
        throw err;
      }
    }
    const body = new URLSearchParams({
      folder_id: String(folderId),
      torrent_magnet: trimmed,
    }).toString();
    const res = await this.request<AddMagnetResponse>("/p/tasks", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (res && typeof res === "object" && "success" in res && !res.success) {
      throw new SeedrError(`seedr rejected: ${JSON.stringify(res)}`);
    }
    return res;
  }

  async deleteTask(id: number): Promise<void> {
    await this.request<unknown>(`/p/tasks/${id}`, { method: "DELETE" });
  }

  async deleteFolder(id: number): Promise<void> {
    await this.request<unknown>(`/p/fs/folder/${id}`, { method: "DELETE" });
  }

  async deleteFile(id: number): Promise<void> {
    await this.request<unknown>(`/p/fs/file/${id}`, { method: "DELETE" });
  }

  async batchDelete(items: { type: string; id: number }[]): Promise<void> {
    if (items.length === 0) return;
    const arr = items.map((i) => ({ type: i.type, id: String(i.id) }));
    const body = `delete_arr=${encodeURIComponent(JSON.stringify(arr))}`;
    await this.request<unknown>("/p/fs/batch/delete", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }

  async collectFilesForTask(task: SeedrTask): Promise<SeedrFile[]> {
    if (task.folder_created_id) {
      try {
        const l = await this.listFolder(task.folder_created_id);
        if (l.files.length > 0) return l.files;
      } catch {
        // fall through
      }
    }
    const root = await this.listRoot();
    return root.files;
  }
}
