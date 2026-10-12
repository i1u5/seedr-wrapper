import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SeedrFile } from "../types.ts";
import {
  formatBytes,
  isArchiveFile,
  isSubtitleFile,
  isVideoFile,
  truncate,
} from "../utils.ts";

interface Props {
  files: SeedrFile[];
  onSelect: (file: SeedrFile) => void;
  onCancel: () => void;
}

function classify(name: string): { icon: string; color: string } {
  if (isVideoFile(name)) return { icon: "🎬", color: "green" };
  if (isSubtitleFile(name)) return { icon: "💬", color: "yellow" };
  if (isArchiveFile(name)) return { icon: "📦", color: "magenta" };
  return { icon: "📄", color: "white" };
}

export default function FileSelector({ files, onSelect, onCancel }: Props) {
  const [cursor, setCursor] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow) setCursor((c) => Math.min(files.length - 1, c + 1));
    else if (key.return) {
      const f = files[cursor];
      if (f) onSelect(f);
    } else if (key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" marginTop={1} paddingX={2}>
      <Text bold color="cyan">Pick the file you want to download</Text>
      <Text dimColor>↑/↓ navigate · enter select · esc back</Text>
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
        {files.map((f, i) => {
          const active = i === cursor;
          const { icon, color } = classify(f.name);
          return (
            <Box key={f.id}>
              <Text color={active ? "cyan" : undefined}>{active ? "❯ " : "  "}</Text>
              <Text>{icon} </Text>
              <Text color={active ? "cyan" : color} bold={active}>{truncate(f.name, 70)}</Text>
              <Text dimColor>  {formatBytes(f.size)}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
