import { getConfig } from "../config.ts";
import {
  handleAccount,
  handleAddMagnet,
  handleAutoPick,
  handleDelete,
  handleFileUrl,
  handleFolderZip,
  handleGetConfig,
  handleGetTask,
  handleListFiles,
  handleListTasks,
  handlePutConfig,
  handleTaskFiles,
  handleVlcPlay,
  handleVlcStatus,
} from "./handlers.ts";

const SITE_DIR = new URL("../../site/", import.meta.url);

async function serveStatic(name: string): Promise<Response> {
  try {
    const url = new URL(name, SITE_DIR);
    const data = await Deno.readTextFile(url);
    const type = name.endsWith(".html")
      ? "text/html; charset=utf-8"
      : name.endsWith(".css")
      ? "text/css; charset=utf-8"
      : name.endsWith(".js")
      ? "application/javascript; charset=utf-8"
      : "text/plain; charset=utf-8";
    return new Response(data, {
      headers: { "Content-Type": type, "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  const m = req.method.toUpperCase();

  if (m === "GET") {
    if (p === "/" || p === "/index.html") return serveStatic("index.html");
    if (p === "/style.css") return serveStatic("style.css");
    if (p === "/app.js") return serveStatic("app.js");
  }

  if (p === "/api/account" && m === "GET") return handleAccount();
  if (p === "/api/files" && m === "GET") return handleListFiles(url);
  if (p === "/api/tasks" && m === "GET") return handleListTasks();
  if (p === "/api/config" && m === "GET") return handleGetConfig();
  if (p === "/api/config" && m === "PUT") return handlePutConfig(req);
  if (p === "/api/magnet" && m === "POST") return handleAddMagnet(req);
  if (p === "/api/delete" && m === "POST") return handleDelete(req);
  if (p === "/api/vlc" && m === "GET") return handleVlcStatus();
  if (p === "/api/vlc" && m === "POST") return handleVlcPlay(req);
  if (p === "/api/autopick" && m === "POST") return handleAutoPick(req);

  const fileMatch = p.match(/^\/api\/file\/(\d+)\/url$/);
  if (fileMatch && m === "GET") return handleFileUrl(Number(fileMatch[1]));

  const zipMatch = p.match(/^\/api\/folder\/(\d+)\/zip$/);
  if (zipMatch && m === "GET") return handleFolderZip(Number(zipMatch[1]));

  const taskMatch = p.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && m === "GET") return handleGetTask(Number(taskMatch[1]));

  const taskFilesMatch = p.match(/^\/api\/tasks\/(\d+)\/files$/);
  if (taskFilesMatch && m === "GET") return handleTaskFiles(Number(taskFilesMatch[1]));

  return new Response("not found", { status: 404 });
}

export interface WebServerHandle {
  port: number;
  shutdown: () => Promise<void>;
}

/**
 * Start the web UI. Default port comes from `config.webServerPort` (8000
 * by default — Deno.serve's own default, no root needed).
 *
 * If the requested port fails to bind (e.g. permission denied or already
 * in use), we retry on 8080 before giving up.
 */
export async function startWebServer(): Promise<WebServerHandle> {
  const cfg = getConfig();
  const desired = cfg.webServerPort;

  const tryListen = async (port: number): Promise<Deno.HttpServer> => {
    return Deno.serve(
      { port, hostname: "127.0.0.1", onListen: () => {} },
      route,
    );
  };

  let server: Deno.HttpServer;
  let actualPort = desired;
  try {
    server = await tryListen(desired);
    actualPort = (server.addr as Deno.NetAddr).port;
  } catch (e) {
    console.error(
      `[seedr-cli] failed to bind port ${desired} (${(e as Error).message}); ` +
        `falling back to 8080`,
    );
    server = await tryListen(8080);
    actualPort = (server.addr as Deno.NetAddr).port;
  }

  return {
    port: actualPort,
    shutdown: async () => {
      try {
        await server.shutdown();
      } catch {
        // ignore
      }
    },
  };
}
