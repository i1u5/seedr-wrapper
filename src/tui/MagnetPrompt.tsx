import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "./TextInput.tsx";
import { isValidMagnet } from "../utils.ts";

interface Props {
  onSubmit: (magnet: string) => void;
  onCancel: () => void;
}

export default function MagnetPrompt({ onSubmit, onCancel }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  const handleSubmit = (input: string) => {
    const magnet = input.trim();
    if (!magnet) return;
    if (!isValidMagnet(magnet)) {
      setError("Not a valid magnet link (must start with magnet:?xt=urn:btih:…)");
      return;
    }
    setError(null);
    onSubmit(magnet);
  };

  return (
    <Box flexDirection="column" marginTop={1} paddingX={2}>
      <Text bold color="cyan">❯ paste magnet link</Text>
      <Box marginTop={1}>
        <Text color="cyan">› </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="magnet:?xt=urn:btih:…"
        />
      </Box>
      {error && <Box marginTop={1}><Text color="red">✗ {error}</Text></Box>}
      <Box marginTop={1}><Text dimColor>enter submit · esc back</Text></Box>
    </Box>
  );
}
