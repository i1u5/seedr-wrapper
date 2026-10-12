#!/usr/bin/env -S deno run -A
/**
 * seedr-cli — TUI + Web UI wrapper for seedr.cc
 *
 * Usage:
 *   deno task start -- --pat 'sdp_...'
 *
 * The TUI is the primary interface. The web UI (if enabled in settings)
 * starts in the background on localhost:8000 by default.
 */

import React from "react";
import { render } from "ink";
import { SeedrClient } from "./api.ts";
import {
  configPath,
  effectivePat,
  getConfig,
  loadConfig,
  redactPat,
  setConfig,
} from "./config.ts";
import { hasVlc } from "./vlc.ts";
import { startWebServer, type WebServerHandle } from "./web/server.ts";
import App from "./tui/App.tsx";

function parsePatArg(): string | null {
  const args = Deno.args;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--pat") {
      const v = args[i + 1];
      if (v && !v.startsWith("--")) return v;
      return null;
    }
    if (a.startsWith("--pat=")) {
      return a.slice("--pat=".length);
    }
  }
  return null;
}

async function main() {
  const cfg = loadConfig();

  // --pat swap (validated before replacing)
  const cliPat = parsePatArg();
  if (cliPat && cliPat.trim()) {
    const candidate = cliPat.trim();
    if (candidate !== cfg.pat) {
      process.stderr.write(`[seedr-cli] validating --pat…\n`);
      try {
        const probe = new SeedrClient(candidate, cfg.debug);
        await probe.getUser();
        const next = { ...cfg, pat: candidate };
        setConfig(next);
        process.stderr.write(
          `[seedr-cli] new PAT validated and saved (${redactPat(candidate)})\n`,
        );
      } catch (e) {
        process.stderr.write(
          `[seedr-cli] --pat rejected (${(e as Error).message}). ` +
            `Keeping existing PAT if any.\n`,
        );
      }
    }
  }

  const finalCfg = getConfig();
  const pat = effectivePat(finalCfg);

  if (!pat) {
    process.stderr.write(
      `✗ no PAT configured.\n\n` +
        `  Usage:\n` +
        `    deno task start -- --pat 'sdp_...'\n` +
        `    SEEDR_PAT='sdp_...' deno task start\n\n` +
        `  Config file: ${configPath()}\n`,
    );
    Deno.exit(1);
  }

  if (!finalCfg.pat) {
    setConfig({ ...finalCfg, pat });
  }

  const client = new SeedrClient(pat, finalCfg.debug);
  const vlcAvailable = await hasVlc();

  let webHandle: WebServerHandle | null = null;
  if (finalCfg.webServer) {
    try {
      webHandle = await startWebServer();
      process.stderr.write(
        `[seedr-cli] web UI → http://localhost:${webHandle.port}\n`,
      );
    } catch (e) {
      process.stderr.write(
        `[seedr-cli] web server disabled: ${(e as Error).message}\n`,
      );
    }
  }

  const { waitUntilExit } = render(
    React.createElement(App, {
      client,
      hasVlc: vlcAvailable,
      initialConfig: getConfig(),
      webPort: webHandle?.port ?? null,
      initialMagnet: undefined,
    }),
    { exitOnCtrlC: true },
  );

  await waitUntilExit();

  if (webHandle) {
    await webHandle.shutdown();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    process.stderr.write(`fatal: ${(e as Error).message}\n`);
    Deno.exit(1);
  });
}
