import React from "react";
import { Box, Text } from "ink";
import type { CLIConfig } from "../types.ts";
import { formatTimeout } from "../utils.ts";

interface Props {
  config: CLIConfig;
  webPort: number | null;
}

export default function Menu({ config, webPort }: Props) {
  return (
    <Box flexDirection="column" marginTop={1} paddingX={2}>
      <Text bold color="cyan">menu</Text>
      <Text>  <Text color="cyan" bold>a</Text>  add a magnet link</Text>
      <Text>  <Text color="cyan" bold>b</Text>  browse files (folders, files, active torrents)</Text>
      <Text>  <Text color="cyan" bold>s</Text>  <Text bold color="yellow">settings</Text></Text>
      <Text>  <Text color="cyan" bold>q</Text>  quit</Text>

      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text dimColor>current settings (press s to change)</Text>
        <Row label="delete-before-download" value={onOff(config.deleteBeforeDownload)} on={config.deleteBeforeDownload} />
        <Row label="force-manual-file-selection" value={onOff(config.forceManualFileSelection)} on={config.forceManualFileSelection} />
        <Row label="background-after" value={formatTimeout(config.backgroundAfterSeconds)} />
        <Row label="append-best-ip-trackers" value={onOff(config.appendBestIpTrackers)} on={config.appendBestIpTrackers} />
        <Row label="web-server" value={config.webServer ? (webPort ? `on :${webPort}` : "on (failed)") : "off"} on={config.webServer} />
        <Row label="web-server-port" value={String(config.webServerPort)} />
        <Row label="debug-logging" value={onOff(config.debug)} on={config.debug} />
      </Box>
    </Box>
  );
}

function Row({ label, value, on }: { label: string; value: string; on?: boolean }) {
  return (
    <Box>
      <Text dimColor>  {label.padEnd(28)}</Text>
      {on === undefined ? (
        <Text color="cyan">{value}</Text>
      ) : (
        <Text color={on ? "green" : "red"} bold>{value}</Text>
      )}
    </Box>
  );
}

function onOff(v: boolean): string {
  return v ? "ON" : "OFF";
}
