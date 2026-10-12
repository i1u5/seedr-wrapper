import { SeedrClient, SeedrError } from "../api.ts";
import { effectivePat, getConfig, setConfig } from "../config.ts";
import { appendTrackersToMagnet, fetchBestIpTrackers } from "../trackers.ts";
import { launchVlc } from "../vlc.ts";
import { pickMainVideo } from "../utils.ts";

function client(): SeedrClient {
  const cfg = getConfig();
  return new SeedrClient(effectivePat(cfg), cfg.debug);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function statusOf(e: unknown): number {
  if (e instanceof SeedrError) return e.status ?? 500;
  return 500;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function handleAccount(): Promise<Response> {
  try {
    const c = client();
    const [u, q] = await Promise.all([c.getUser(), c.getQuota()]);
    return json({ user: u, quota: q });
  } catch (e) {
    return err(messageOf(e), statusOf(e));
  }
}

export async function handleListFiles(url: URL): Promise<Response> {
  const folderParam = url.searchParams.get("folder");
  const folderId = folderParam ? Number(folderParam) : 0;
  if (!Number.isFinite(folderId) || folderId < 0) {
    return err("invalid folder id");
  }
  try {
    const c = client();
    const listing = folderId === 0
      ? await c.listRoot()
      : await c.listFolder(folderId);
    return json(listing);
  } catch (e) {
    return err(messageOf(e), statusOf(e));
  }
}

export async function handleFileUrl(id: number): Promise<Response> {
  try {
    const c = client();
    const u = await c.getFileUrl(id);
    return json({ url: u });
  } catch (e) {
    return err(messageOf(e), statusOf(e));
  }
}

export async function handleFolderZip(id: number): Promise<Response> {
  try {
    const c = client();
    const u = await c.getFolderArchiveUrl(id);
    return json({ url: u });
  } catch (e) {
    return err(messageOf(e), statusOf(e));
  }
}

export async function handleListTasks(): Promise<Response> {
  try {
    const c = client();
    const tasks = await c.listTasks();
    return json({ tasks });
  } catch (e) {
    return err(messageOf(e), statusOf(e));
  }
}

export async function handleGetTask(id: number): Promise<Response> {
  try {
    const c = client();
    const t = await c.getTask(id);
    return json({ task: t });
  } catch (e) {
    return err(messageOf(e), statusOf(e));
  }
}

export async function handleTaskFiles(id: number): Promise<Response> {
  try {
    const c = client();
    const t = await c.getTask(id);
    const files = await c.collectFilesForTask(t);
    return json({ files });
  } catch (e) {
    return err(messageOf(e), statusOf(e));
  }
}

export async function handleAddMagnet(req: Request): Promise<Response> {
  const body = await readJson(req);
  const magnet = String(body.magnet ?? "").trim();
  if (!magnet) return err("magnet is required");

  const cfg = getConfig();
  try {
    let effective = magnet;
    if (cfg.appendBestIpTrackers) {
      try {
        const trackers = await fetchBestIpTrackers();
        effective = appendTrackersToMagnet(magnet, trackers);
      } catch {
        // use magnet as-is
      }
    }
    if (cfg.deleteBeforeDownload) {
      try {
        const c = client();
        const root = await c.listRoot();
        const items = [
          ...root.folders.map((f) => ({ type: "folder", id: f.id })),
          ...root.files.map((f) => ({ type: "file", id: f.id })),
        ];
        if (items.length > 0) await c.batchDelete(items);
        const tasks = await c.listTasks().catch(() => []);
        for (const t of tasks) await c.deleteTask(t.id).catch(() => {});
      } catch {
        // continue
      }
    }
    const c = client();
    const res = await c.addMagnet(effective);
    return json({ taskId: res.user_torrent_id, hash: res.torrent_hash });
  } catch (e) {
    return err(messageOf(e), statusOf(e));
  }
}

export async function handleDelete(req: Request): Promise<Response> {
  const body = await readJson(req);
  const kind = String(body.type ?? "");
  const id = Number(body.id ?? 0);
  if (!Number.isFinite(id) || id <= 0) return err("invalid id");
  if (!["folder", "file", "torrent"].includes(kind)) return err("invalid type");
  try {
    const c = client();
    if (kind === "folder") await c.deleteFolder(id);
    else if (kind === "file") await c.deleteFile(id);
    else await c.deleteTask(id);
    return json({ ok: true });
  } catch (e) {
    return err(messageOf(e), statusOf(e));
  }
}

export async function handleGetConfig(): Promise<Response> {
  const cfg = getConfig();
  const { pat: _pat, ...safe } = cfg;
  return json({ config: safe });
}

export async function handlePutConfig(req: Request): Promise<Response> {
  const body = await readJson(req);
  const current = getConfig();
  const next = {
    ...current,
    deleteBeforeDownload: boolOr(body.deleteBeforeDownload, current.deleteBeforeDownload),
    forceManualFileSelection: boolOr(body.forceManualFileSelection, current.forceManualFileSelection),
    backgroundAfterSeconds: numOr(body.backgroundAfterSeconds, current.backgroundAfterSeconds),
    appendBestIpTrackers: boolOr(body.appendBestIpTrackers, current.appendBestIpTrackers),
    webServer: boolOr(body.webServer, current.webServer),
    webServerPort: numOr(body.webServerPort, current.webServerPort),
    debug: boolOr(body.debug, current.debug),
  };
  setConfig(next);
  const { pat: _pat, ...safe } = next;
  return json({ config: safe });
}

export async function handleVlcStatus(): Promise<Response> {
  const { hasVlc } = await import("../vlc.ts");
  return json({ available: await hasVlc() });
}

export async function handleVlcPlay(req: Request): Promise<Response> {
  const body = await readJson(req);
  const url = String(body.url ?? "");
  if (!url.startsWith("http")) return err("invalid url");
  try {
    launchVlc(url);
    return json({ ok: true });
  } catch (e) {
    return err(messageOf(e), 500);
  }
}

export async function handleAutoPick(req: Request): Promise<Response> {
  const body = await readJson(req);
  const files = Array.isArray(body.files) ? body.files : [];
  const picked = pickMainVideo(files as { id: number; name: string; size: number }[]);
  return json({ picked: picked ? picked.id : null });
}

function boolOr(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}
