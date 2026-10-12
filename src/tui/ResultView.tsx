import React from "react";
import { Box, Text, useInput } from "ink";
import { launchVlc } from "../vlc.ts";
import { osc8 } from "../utils.ts";

interface Props {
  url: string;
  name: string;
  size: number;
  hasVlc: boolean;
  onBack: () => void;
}

export default function ResultView({ url, name, size, hasVlc, onBack }: Props) {
  useInput((input, key) => {
    if (key.escape || key.return) {
      onBack();
      return;
    }
    if ((input === "v" || input === "V") && hasVlc) {
      try {
        launchVlc(url);
      } catch {
        // ignore launch failures from the TUI
      }
    }
  });

  const vlcHref = osc8(`vlc://${url}`, "▶ Play in VLC");
  const sizeGb = size > 0 ? `${(size / 1e9).toFixed(2)} GB` : null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box paddingX={2}>
        <Text bold color="green">✓ ready — download link generated</Text>
      </Box>

      <Box paddingX={2} flexDirection="column" marginTop={1}>
        <Text dimColor>file</Text>
        <Text bold>{name}</Text>
        {sizeGb && <Text dimColor>{sizeGb}</Text>}
      </Box>

      <Box paddingX={2} marginTop={1}><Text dimColor>download link</Text></Box>
      <Text color="cyan">{url}</Text>

      <Box paddingX={2} marginTop={1} flexDirection="column">
        <Text dimColor>play</Text>
        {hasVlc ? (
          <Text>
            {vlcHref}
            <Text dimColor>  or press </Text>
            <Text color="cyan" bold>v</Text>
          </Text>
        ) : (
          <Text dimColor>VLC not found on this system</Text>
        )}
      </Box>

      <Box paddingX={2} marginTop={1}>
        <Text dimColor>esc back to menu</Text>
      </Box>
    </Box>
  );
}
