import React from "react";
import { Box, Text, useInput } from "ink";
import type { CLIConfig } from "../types.ts";
import { formatTimeout } from "../utils.ts";
import { DEFAULT_WEB_PORT } from "../config.ts";

interface SettingDef {
  key: keyof CLIConfig;
  label: string;
  description: string;
  type: "boolean" | "number";
  values?: number[];
  format?: (v: number) => string;
}

const SETTINGS: SettingDef[] = [
  {
    key: "deleteBeforeDownload",
    label: "Delete before download",
    description: "Wipe every remote file/folder/torrent before adding a new magnet.",
    type: "boolean",
  },
  {
    key: "forceManualFileSelection",
    label: "Force manual file selection",
    description: "Always show the file picker after a magnet finishes.",
    type: "boolean",
  },
  {
    key: "backgroundAfterSeconds",
    label: "Background after",
    description: "Return to the menu if a torrent hasn't finished after N seconds. 0 = wait.",
    type: "number",
    values: [0, 5, 10, 15, 30, 60, 120, 300],
    format: formatTimeout,
  },
  {
    key: "appendBestIpTrackers",
    label: "Append best_ip trackers",
    description: "Fetch + append ngosang best_ip tracker list to magnets.",
    type: "boolean",
  },
  {
    key: "webServer",
    label: "Web server",
    description: "Run the local web UI on the configured port.",
    type: "boolean",
  },
  {
    key: "webServerPort",
    label: "Web server port",
    description: `Port for the web UI (default ${DEFAULT_WEB_PORT} — Deno's default, no root needed).`,
    type: "number",
    values: [DEFAULT_WEB_PORT, 8080, 3000, 5000, 9000, 80],
    format: (v) => String(v),
  },
  {
    key: "debug",
    label: "Debug logging",
    description: "Print raw HTTP requests/responses to stderr.",
    type: "boolean",
  },
];

interface Props {
  draft: CLIConfig;
  cursor: number;
  onSetDraft: (d: CLIConfig) => void;
  onSetCursor: (i: number) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function Settings({
  draft,
  cursor,
  onSetDraft,
  onSetCursor,
  onSave,
  onCancel,
}: Props) {
  const update = <K extends keyof CLIConfig>(k: K, v: CLIConfig[K]) => {
    onSetDraft({ ...draft, [k]: v });
  };

  const cycleNumber = (def: SettingDef, dir: 1 | -1) => {
    const values = def.values ?? [];
    if (values.length === 0) return;
    const current = draft[def.key] as number;
    const idx = values.indexOf(current);
    const base = idx === -1 ? 0 : idx;
    const next = (base + dir + values.length) % values.length;
    update(def.key, values[next] as never);
  };

  useInput((input, key) => {
    if (key.escape) {
      onSave();
      return;
    }
    if (key.upArrow) onSetCursor(Math.max(0, cursor - 1));
    else if (key.downArrow) onSetCursor(Math.min(SETTINGS.length - 1, cursor + 1));
    else if (input === " " || input === "t") {
      const def = SETTINGS[cursor];
      if (def.type === "boolean") update(def.key, !draft[def.key] as never);
    } else if (key.leftArrow && SETTINGS[cursor].type === "number") {
      cycleNumber(SETTINGS[cursor], -1);
    } else if (key.rightArrow && SETTINGS[cursor].type === "number") {
      cycleNumber(SETTINGS[cursor], 1);
    } else if (key.return) {
      const def = SETTINGS[cursor];
      if (def.type === "boolean") update(def.key, !draft[def.key] as never);
      else cycleNumber(def, 1);
    } else if (input === "q") {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" marginTop={1} paddingX={2}>
      <Text bold color="cyan">settings</Text>
      <Text dimColor>↑/↓ navigate · space/enter toggle · ←/→ adjust · esc save · q cancel</Text>

      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
        {SETTINGS.map((def, i) => {
          const active = i === cursor;
          const value = draft[def.key];
          return (
            <Box key={String(def.key)} flexDirection="column">
              <Box>
                <Text color={active ? "cyan" : undefined}>{active ? "❯ " : "  "}</Text>
                <Text bold={active}>{def.label.padEnd(28, " ")}</Text>
                {def.type === "boolean" ? (
                  <Text color={value ? "green" : "red"}>[{value ? "ON " : "OFF"}]</Text>
                ) : (
                  <Text color="cyan">{def.format ? def.format(value as number) : String(value)}</Text>
                )}
              </Box>
              {active && (
                <Box paddingLeft={3}><Text dimColor>{def.description}</Text></Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>saved instantly to ./.seedr-cli/config.json · applies immediately</Text>
      </Box>
    </Box>
  );
}
