import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { SeedrClient, SeedrError } from "../api.ts";
import { getConfig, setConfig } from "../config.ts";
import { appendTrackersToMagnet, fetchBestIpTrackers } from "../trackers.ts";
import type {
  CLIConfig,
  QuotaResponse,
  SeedrFile,
  SeedrTask,
  UserResponse,
} from "../types.ts";
import { formatBytes, pickMainVideo } from "../utils.ts";
import Header from "./Header.tsx";
import Menu from "./Menu.tsx";
import MagnetPrompt from "./MagnetPrompt.tsx";
import DownloadProgress from "./DownloadProgress.tsx";
import FileSelector from "./FileSelector.tsx";
import ResultView from "./ResultView.tsx";
import Browser, { type BrowserEntry, type BrowserState } from "./Browser.tsx";
import Settings from "./Settings.tsx";

const POLL_ACTIVE_MS = 3000;
const POLL_STALLED_MS = 5000;
const MAX_POLL_MINUTES = 60;

type Screen =
  | { kind: "menu" }
  | { kind: "magnet-input" }
  | { kind: "processing"; message: string }
  | { kind: "downloading"; progress: number; task: SeedrTask | null }
  | { kind: "selecting"; files: SeedrFile[]; reason: string }
  | { kind: "result"; url: string; name: string; size: number }
  | { kind: "browsing" }
  | { kind: "settings"; draft: CLIConfig; cursor: number }
  | { kind: "notice"; title: string; message: string }
  | { kind: "error"; message: string; hint?: string };

interface Props {
  client: SeedrClient;
  hasVlc: boolean;
  initialConfig: CLIConfig;
  webPort: number | null;
  initialMagnet?: string;
}

export default function App({
  client,
  hasVlc,
  initialConfig,
  webPort,
  initialMagnet,
}: Props) {
  const { exit } = useApp();
  const [config, setLocalConfig] = useState<CLIConfig>(initialConfig);
  const [user, setUser] = useState<UserResponse | null>(null);
  const [quota, setQuota] = useState<QuotaResponse | null>(null);
  const [screen, setScreen] = useState<Screen>(
    initialMagnet ? { kind: "processing", message: "starting…" } : { kind: "menu" },
  );
  const [busy, setBusy] = useState(false);
  const [browser, setBrowser] = useState<BrowserState>({
    crumbs: [],
    entries: [],
    cursor: 0,
    loading: false,
    error: null,
    pendingDelete: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    client.setDebug(config.debug);
  }, [client, config.debug]);

  const refreshAccount = useCallback(async () => {
    const [u, q] = await Promise.all([
      client.getUser().catch(() => null),
      client.getQuota().catch(() => null),
    ]);
    if (u) setUser(u);
    if (q) setQuota(q);
  }, [client]);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  const persistConfig = useCallback((next: CLIConfig) => {
    setLocalConfig(next);
    setConfig(next);
    client.setDebug(next.debug);
  }, [client]);

  const loadBrowser = useCallback(async (folderId: number) => {
    setBrowser((b) => ({ ...b, loading: true, error: null }));
    try {
      const listing = folderId === 0
        ? await client.listRoot()
        : await client.listFolder(folderId);
      const entries: BrowserEntry[] = [
        ...listing.folders.map((f) => ({
          kind: "folder" as const,
          id: f.id,
          name: f.path || `folder-${f.id}`,
          size: f.size,
        })),
        ...listing.torrents.map((t) => ({
          kind: "torrent" as const,
          id: t.id,
          name: t.name,
          size: t.size,
          progress: Math.max(0, Math.min(1, (t.progress ?? 0) / 100)),
        })),
        ...listing.files.map((f) => ({
          kind: "file" as const,
          id: f.id,
          name: f.name,
          size: f.size,
        })),
      ];
      entries.sort((a, b) => {
        const rank = (e: BrowserEntry) =>
          e.kind === "folder" ? 0 : e.kind === "torrent" ? 1 : 2;
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        return a.name.localeCompare(b.name);
      });
      setBrowser((prev) => ({ ...prev, entries, cursor: 0, loading: false }));
    } catch (e) {
      setBrowser((prev) => ({
        ...prev,
        loading: false,
        error: (e as Error).message,
      }));
    }
  }, [client]);

  const enterBrowser = useCallback(() => {
    setBrowser({
      crumbs: [],
      entries: [],
      cursor: 0,
      loading: true,
      error: null,
      pendingDelete: null,
    });
    setScreen({ kind: "browsing" });
    loadBrowser(0);
  }, [loadBrowser]);

  const runMagnet = useCallback(async (magnet: string) => {
    if (busy) return;
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      let effectiveMagnet = magnet;
      if (config.appendBestIpTrackers) {
        setScreen({ kind: "processing", message: "fetching best_ip trackers…" });
        try {
          const trackers = await fetchBestIpTrackers();
          effectiveMagnet = appendTrackersToMagnet(magnet, trackers);
          setScreen({
            kind: "processing",
            message: `appended ${trackers.length} trackers to magnet`,
          });
        } catch (e) {
          setScreen({
            kind: "processing",
            message: `couldn't fetch trackers (${(e as Error).message}) — using magnet as-is`,
          });
        }
      }

      if (ac.signal.aborted) throw new Error("aborted");

      if (config.deleteBeforeDownload) {
        setScreen({ kind: "processing", message: "deleting remote files…" });
        try {
          const root = await client.listRoot();
          const items: { type: string; id: number }[] = [
            ...root.folders.map((f) => ({ type: "folder", id: f.id })),
            ...root.files.map((f) => ({ type: "file", id: f.id })),
          ];
          if (items.length > 0) await client.batchDelete(items);
          const tasks = await client.listTasks().catch(() => []);
          for (const t of tasks) {
            await client.deleteTask(t.id).catch(() => {});
          }
        } catch (e) {
          console.error("[seedr-cli] cleanup warning:", (e as Error).message);
        }
      }

      setScreen({ kind: "processing", message: "adding magnet to seedr…" });
      const added = await client.addMagnet(effectiveMagnet);
      refreshAccount();

      const startedAt = Date.now();
      const maxMs = MAX_POLL_MINUTES * 60_000;
      const backgroundMs = config.backgroundAfterSeconds > 0
        ? config.backgroundAfterSeconds * 1000
        : Infinity;
      let lastProgress = -1;
      let stalled = 0;

      setScreen({ kind: "downloading", progress: 0, task: null });

      while (Date.now() - startedAt < maxMs) {
        if (ac.signal.aborted) throw new Error("aborted");
        if (Date.now() - startedAt >= backgroundMs) {
          setScreen({
            kind: "notice",
            title: "Torrent is downloading in the background",
            message:
              `It didn't finish within ${config.backgroundAfterSeconds}s. ` +
              `It'll keep downloading on seedr. Press 'b' when it's ready.`,
          });
          return;
        }

        let task: SeedrTask | null = null;
        try {
          task = await client.getTask(added.user_torrent_id);
        } catch {
          // keep polling
        }

        if (task) {
          const frac = Math.max(0, Math.min(1, (task.progress ?? 0) / 100));
          setScreen({ kind: "downloading", progress: frac, task });

          if (task.state === "finished" || task.progress >= 100) break;
          if (task.state === "error" || task.error) {
            setScreen({
              kind: "error",
              message: `torrent failed: ${task.error ?? "unknown"}`,
            });
            return;
          }

          if (Math.abs(frac - lastProgress) < 0.0001) stalled++;
          else stalled = 0;
          lastProgress = frac;
        }

        const interval = stalled >= 2 ? POLL_STALLED_MS : POLL_ACTIVE_MS;
        await new Promise((r) => setTimeout(r, interval));
      }

      if (ac.signal.aborted) throw new Error("aborted");

      setScreen({ kind: "processing", message: "fetching files…" });
      const finished = await client.getTask(added.user_torrent_id);
      const files = await client.collectFilesForTask(finished);

      if (files.length === 0) {
        setScreen({
          kind: "error",
          message: "Torrent finished but no files were returned.",
        });
        return;
      }

      const auto = config.forceManualFileSelection ? null : pickMainVideo(files);

      if (auto) {
        setScreen({ kind: "processing", message: "generating download link…" });
        const url = await client.getFileUrl(auto.id);
        setScreen({ kind: "result", url, name: auto.name, size: auto.size });
      } else if (files.length === 1) {
        setScreen({ kind: "processing", message: "generating download link…" });
        const url = await client.getFileUrl(files[0].id);
        setScreen({ kind: "result", url, name: files[0].name, size: files[0].size });
      } else {
        const reason = config.forceManualFileSelection
          ? "forced manual selection is ON"
          : "no single dominant video found";
        setScreen({ kind: "selecting", files, reason });
      }
    } catch (e) {
      if ((e as Error).message === "aborted") {
        setScreen({ kind: "menu" });
      } else {
        setScreen({
          kind: "error",
          message: (e as Error).message,
          hint: e instanceof SeedrError && e.status === 413
            ? "torrent may be larger than your quota — try a smaller release"
            : undefined,
        });
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      refreshAccount();
    }
  }, [busy, client, config, refreshAccount]);

  const initialMagnetHandled = useRef(false);
  useEffect(() => {
    if (initialMagnetHandled.current) return;
    if (!initialMagnet) return;
    initialMagnetHandled.current = true;
    runMagnet(initialMagnet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openFile = useCallback(async (file: SeedrFile) => {
    try {
      setScreen({ kind: "processing", message: "generating download link…" });
      const url = await client.getFileUrl(file.id);
      setScreen({ kind: "result", url, name: file.name, size: file.size });
    } catch (e) {
      setScreen({ kind: "error", message: (e as Error).message });
    }
  }, [client]);

  const openFolderArchive = useCallback(async (id: number, name: string, size: number) => {
    try {
      setScreen({
        kind: "processing",
        message: `packaging folder "${name}" as .zip…`,
      });
      const url = await client.getFolderArchiveUrl(id);
      setScreen({ kind: "result", url, name: `${name}.zip`, size });
    } catch (e) {
      setScreen({
        kind: "error",
        message: (e as Error).message,
        hint: "the folder may not be archivable, or the endpoint needs a session cookie",
      });
    }
  }, [client]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      abortRef.current?.abort();
      exit();
      return;
    }
    if (key.escape && busy) {
      abortRef.current?.abort();
      return;
    }
    if (screen.kind === "menu" && !busy) {
      if (input === "a") setScreen({ kind: "magnet-input" });
      else if (input === "b" || input === "l") enterBrowser();
      else if (input === "s") {
        setScreen({ kind: "settings", draft: config, cursor: 0 });
      } else if (input === "q" || key.escape) exit();
    } else if (screen.kind === "notice" || screen.kind === "error") {
      if (key.escape || key.return) setScreen({ kind: "menu" });
    }
  });

  const footer = useMemo(() => {
    switch (screen.kind) {
      case "menu":
        return "a add magnet · b browse files · s settings · q quit";
      case "magnet-input":
        return "enter submit · esc back";
      case "processing":
      case "downloading":
        return "esc cancel";
      case "selecting":
        return "↑/↓ navigate · enter select · esc back";
      case "browsing":
        return "↑/↓ · enter · z zip · backspace up · d delete · r refresh · esc exit";
      case "settings":
        return "↑/↓ · space toggle · ←/→ adjust · esc save";
      case "result":
        return hasVlc ? "v play in VLC · esc back" : "esc back";
      case "notice":
      case "error":
        return "esc back · ctrl+c quit";
      default:
        return "";
    }
  }, [screen.kind, hasVlc]);

  const isResult = screen.kind === "result";

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box paddingX={1}>
        <Header user={user} quota={quota} />
      </Box>
      <Box flexDirection="column" paddingX={isResult ? 0 : 1}>
        {screen.kind === "menu" && (
          <Menu config={config} webPort={webPort} />
        )}

        {screen.kind === "magnet-input" && (
          <MagnetPrompt
            onSubmit={(m) => runMagnet(m)}
            onCancel={() => setScreen({ kind: "menu" })}
          />
        )}

        {screen.kind === "processing" && (
          <DownloadProgress status={screen.message} progress={0} task={null} />
        )}

        {screen.kind === "downloading" && (
          <DownloadProgress
            status={`downloading · ${screen.task?.name ?? "…"}`}
            progress={screen.progress}
            task={screen.task}
          />
        )}

        {screen.kind === "selecting" && (
          <Box flexDirection="column">
            <Box paddingX={2} marginTop={1}><Text dimColor>({screen.reason})</Text></Box>
            <FileSelector
              files={screen.files}
              onSelect={(f) => openFile(f)}
              onCancel={() => setScreen({ kind: "menu" })}
            />
          </Box>
        )}

        {screen.kind === "result" && (
          <ResultView
            url={screen.url}
            name={screen.name}
            size={screen.size}
            hasVlc={hasVlc}
            onBack={() => setScreen({ kind: "menu" })}
          />
        )}

        {screen.kind === "browsing" && (
          <Browser
            state={browser}
            onNavigate={(id, name) => {
              setBrowser((b) => ({
                ...b,
                crumbs: [...b.crumbs, { id, name }],
              }));
              loadBrowser(id);
            }}
            onUp={() => {
              if (browser.crumbs.length === 0) {
                setScreen({ kind: "menu" });
                return;
              }
              const next = browser.crumbs.slice(0, -1);
              setBrowser((b) => ({ ...b, crumbs: next }));
              loadBrowser(next.length > 0 ? next[next.length - 1].id : 0);
            }}
            onOpenFile={(f) => openFile(f)}
            onZipFolder={(id, name, size) => openFolderArchive(id, name, size)}
            onDelete={async (idx) => {
              const e = browser.entries[idx];
              if (!e) return;
              try {
                if (e.kind === "folder") await client.deleteFolder(e.id);
                else if (e.kind === "file") await client.deleteFile(e.id);
                else await client.deleteTask(e.id);
                refreshAccount();
              } catch (err) {
                setScreen({ kind: "error", message: `delete failed: ${(err as Error).message}` });
                return;
              }
              setBrowser((b) => ({ ...b, pendingDelete: null }));
              loadBrowser(browser.crumbs.length > 0 ? browser.crumbs[browser.crumbs.length - 1].id : 0);
            }}
            onRefresh={() => loadBrowser(browser.crumbs.length > 0 ? browser.crumbs[browser.crumbs.length - 1].id : 0)}
            onExit={() => setScreen({ kind: "menu" })}
            onSetCursor={(i) => setBrowser((b) => ({ ...b, cursor: i }))}
            onSetPendingDelete={(i) => setBrowser((b) => ({ ...b, pendingDelete: i }))}
          />
        )}

        {screen.kind === "settings" && (
          <Settings
            draft={screen.draft}
            cursor={screen.cursor}
            onSetDraft={(d) => setScreen({ kind: "settings", draft: d, cursor: screen.cursor })}
            onSetCursor={(i) => setScreen({ kind: "settings", draft: screen.draft, cursor: i })}
            onSave={() => {
              persistConfig(screen.draft);
              setScreen({ kind: "menu" });
            }}
            onCancel={() => setScreen({ kind: "menu" })}
          />
        )}

        {screen.kind === "notice" && (
          <Box flexDirection="column" marginTop={1} paddingX={2}>
            <Text bold color="yellow">⏳ {screen.title}</Text>
            <Box marginTop={1}><Text>{screen.message}</Text></Box>
            <Box marginTop={1}><Text dimColor>esc or enter to go back</Text></Box>
          </Box>
        )}

        {screen.kind === "error" && (
          <Box flexDirection="column" marginTop={1} paddingX={2}>
            <Text bold color="red">✗ error</Text>
            <Text>{screen.message}</Text>
            {screen.hint && (
              <Box marginTop={1}><Text color="yellow">💡 {screen.hint}</Text></Box>
            )}
            <Box marginTop={1}><Text dimColor>esc to go back · ctrl+c to exit</Text></Box>
          </Box>
        )}

        <Box marginTop={1} paddingX={2}>
          <Text dimColor>{footer}</Text>
        </Box>
      </Box>
    </Box>
  );
}
