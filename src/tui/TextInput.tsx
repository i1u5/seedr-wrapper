import React from "react";
import { Text, useInput } from "ink";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder?: string;
  mask?: string;
  focus?: boolean;
}

/**
 * Minimal text input built on useInput — no extra deps.
 */
export default function TextInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  mask,
  focus = true,
}: Props) {
  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit(value);
        return;
      }
      if (key.backspace || key.delete) {
        onChange(value.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        onChange(value + input);
      }
    },
    { isActive: focus },
  );

  if (!value && placeholder) {
    return <Text dimColor>{placeholder}</Text>;
  }
  return <Text>{mask ? mask.repeat(value.length) : value}</Text>;
}
