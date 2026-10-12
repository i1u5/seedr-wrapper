import React from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "./Spinner.tsx";
import type { SeedrFile } from "../types.ts";
import {
  buildBar,
  buildCrumbPath,
  formatBytes,
  isArchiveFile,
  isSubtitleFile,
  isVideoFile,
  truncate,
} from "../utils.ts";

export type BrowserEntry =
  | { kind: "folder"; id: number; name: string; size: number }
  | { kind: "file"; id: number; name: string; size: number }
  | { kind: "torrent"; id: number; name: string; size: number; progress: number };

export interface BrowserState {
  crumbs: { id: number; name: string }[];
  entries: BrowserEntry[];
  cursor: number;
  loading: boolean;
  error: string | null;
  pendingDelete: number | null;
}

interface Props {
  state: BrowserState;
  onNavigate: (folderId: number, folderName: string) => void;
  onUp: () => void;
  onOpenFile: (file: SeedrFile) => void;
  onZipFolder: (id: number, name: string, size: number) => void;
  onDelete: (idx: number) => void;
  onRefresh: () => void;
  onExit: () => void;
  onSetCursor: (i: number) => void;
  onSetPendingDelete: (i: number | null) => void;
}

function entryIcon(e: BrowserEntry): { icon: string; color: string } {
  if (e.kind === "folder") return { icon: "📁", color: "cyan" };
  if (e.kind === "torrent") return { icon: "⏬", color: "magenta" };
  if (isVideoFile(e.name)) return { icon: "🎬", color: "green" };
  if (isSubtitleFile(e.name)) return { icon: "💬", color: "yellow" };
  if (isArchiveFile(e.name)) return { icon: "📦", color: "magenta" };
  return { icon: "📄", color: "white" };
}

export default function Browser(props: Props) {
  const { state } = props;

  useInput((input, key) => {
    if (state.pendingDelete !== null) {
      if (input === "y" || input === "Y" || key.return) {
        props.onDelete(state.pendingDelete);
      } else if (input === "n" || input === "N" || key.escape) {
        props.onSetPendingDelete(null);
      }
      return;
    }
    if (state.loading) {
      if (key.escape) props.onExit();
      return;
    }
    const len = state.entries.length;
    if (key.upArrow) props.onSetCursor(Math.max(0, state.cursor - 1));
    else if (key.downArrow) props.onSetCursor(Math.min(len - 1, state.cursor + 1));
    else if (key.return) {
      const e = state.entries[state.cursor];
      if (!e) return;
      if (e.kind === "folder") {
        props.onNavigate(e.id, e.name);
      } else if (e.kind === "file") {
        props.onOpenFile({ id: e.id, name: e.name, size: e.size });
      }
    } else if (input === "z" || input === "Z") {
      const e = state.entries[state.cursor];
      if (e && e.kind === "folder") props.onZipFolder(e.id, e.name, e.size);
    } else if (key.backspace || key.delete) {
      props.onUp();
    } else if (input === "d" || input === "D") {
      if (state.entries.length > 0) props.onSetPendingDelete(state.cursor);
    } else if (input === "r" || input === "R") {
      props.onRefresh();
    } else if (key.escape) {
      props.onExit();
    }
  });

  const crumbPath = buildCrumbPath(state.crumbs.map((c) => c.name));
  const pending = state.pendingDelete !== null
    ? state.entries[state.pendingDelete]
    : null;

  return (
    <Box flexDirection="column" marginTop={1} paddingX={2}>
      <Box>
        <Text bold color="cyan">files</Text>
        <Text dimColor>  ·  </Text>
        <Text>{crumbPath}</Text>
      </Box>
      <Text dimColor>
        ↑/↓ navigate · enter open/select · z zip folder · backspace up · d delete · r refresh · esc exit
      </Text>

      {state.loading && (
        <Box marginTop={1}><Spinner /><Text> loading…</Text></Box>
      )}

      {state.error && (
        <Box marginTop={1}><Text color="red">✗ {state.error}</Text></Box>
      )}

      {!state.loading && !state.error && state.entries.length === 0 && (
        <Box marginTop={1}><Text dimColor>this folder is empty</Text></Box>
      )}

      {!state.loading && !state.error && state.entries.length > 0 && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
          {state.entries.map((e, i) => {
            const active = i === state.cursor;
            const { icon, color } = entryIcon(e);
            const selectable = e.kind !== "torrent";
            return (
              <Box key={`${e.kind}-${e.id}`} flexDirection="column">
                <Box>
                  <Text color={active ? "cyan" : undefined}>{active ? "❯ " : "  "}</Text>
                  <Text>{icon} </Text>
                  <Text color={active ? "cyan" : color} bold={active} dimColor={!selectable && !active}>
                    {truncate(e.name, 60)}
                  </Text>
                  {e.kind === "torrent" ? (
                    <Text dimColor>  [{buildBar(e.progress, 12)}] {Math.floor(e.progress * 100)}% · active download</Text>
                  ) : (
                    <Text dimColor>  {formatBytes(e.size)}</Text>
                  )}
                </Box>
                {active && e.kind === "folder" && (
                  <Box paddingLeft={3}><Text dimColor>enter to open · z to download as .zip</Text></Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {pending && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="red">
            delete "{truncate(pending.name, 60)}"
            {pending.kind === "folder" ? " (folder + contents)" : ""}
            {pending.kind === "torrent" ? " (active torrent)" : ""}?
          </Text>
          <Text dimColor>y / enter = confirm · n / esc = cancel</Text>
        </Box>
      )}
    </Box>
  );
}
