import React from "react";
import { Box, Text } from "ink";
import Spinner from "./Spinner.tsx";
import { buildBar, formatBytes } from "../utils.ts";
import type { SeedrTask } from "../types.ts";

interface Props {
  status: string;
  progress: number;
  task: SeedrTask | null;
  cancellable?: boolean;
}

export default function DownloadProgress({ status, progress, task, cancellable = true }: Props) {
  const pct = Math.max(0, Math.min(1, progress));
  const tp = task?.torrent_payload;
  return (
    <Box flexDirection="column" marginTop={1} paddingX={2}>
      <Box><Spinner /><Text bold> {status}</Text></Box>
      <Box marginTop={1}>
        <Text color="cyan">[{buildBar(pct)}]</Text>
        <Text bold> {Math.floor(pct * 100)}%</Text>
      </Box>
      {task && (
        <Box flexDirection="column" marginTop={1}>
          <Box><Text dimColor>name     </Text><Text>{task.name}</Text></Box>
          <Box><Text dimColor>size     </Text><Text>{formatBytes(task.size)}</Text></Box>
          <Box>
            <Text dimColor>state    </Text>
            <Text color={task.state === "finished" ? "green" : "yellow"}>{task.state}</Text>
          </Box>
          {tp && (
            <Box>
              <Text dimColor>seeders  </Text><Text color="green">{tp.seeders}</Text>
              <Text dimColor>  leechers  </Text><Text color="red">{tp.leechers}</Text>
              <Text dimColor>  rate  </Text><Text>{formatBytes(tp.download_rate)}/s</Text>
            </Box>
          )}
          {tp?.warnings?.length ? (
            <Box marginTop={1} flexDirection="column">
              {tp.warnings.map((w, i) => <Text key={i} color="yellow">⚠ {w}</Text>)}
            </Box>
          ) : null}
        </Box>
      )}
      {cancellable && <Box marginTop={1}><Text dimColor>esc cancel</Text></Box>}
    </Box>
  );
}
