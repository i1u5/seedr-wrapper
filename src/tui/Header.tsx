import React from "react";
import { Box, Text } from "ink";
import type { QuotaResponse, UserResponse } from "../types.ts";
import { buildBar, formatBytes, pctColor } from "../utils.ts";

interface Props {
  user: UserResponse | null;
  quota: QuotaResponse | null;
}

export default function Header({ user, quota }: Props) {
  const used = quota?.space_used ?? 0;
  const max = quota?.space_max ?? 0;
  const pct = max > 0 ? used / max : 0;
  const email = user?.profile?.email ?? user?.profile?.username ?? "…";
  const free = Math.max(0, max - used);

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">seedr-cli</Text>
        <Text dimColor> · </Text>
        <Text>{email}</Text>
      </Box>
      {max > 0 && (
        <Box paddingX={1} flexDirection="column">
          <Box>
            <Text dimColor>storage </Text>
            <Text color={pctColor(pct)}>[{buildBar(pct)}]</Text>
            <Text> {formatBytes(used)}</Text>
            <Text dimColor> / {formatBytes(max)}</Text>
          </Box>
          <Box>
            <Text dimColor>free    </Text>
            <Text color="green">{formatBytes(free)}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
