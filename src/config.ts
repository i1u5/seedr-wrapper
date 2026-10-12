import type { CLIConfig } from "./types.ts";

const CONFIG_DIR = "./.seedr-cli";
const CONFIG_FILE = `${CONFIG_DIR}/config.json`;

/** Deno.serve()'s own default port — no root required. */
export const DEFAULT_WEB_PORT = 8000;

export const DEFAULT_CONFIG: CLIConfig = {
  pat: "",
  deleteBeforeDownload: false,
  forceManualFileSelection: false,
  backgroundAfterSeconds: 10,
  appendBestIpTrackers: true,
  webServer: true,
  webServerPort: DEFAULT_WEB_PORT,
  debug: false,
};

let current: CLIConfig = { ...DEFAULT_CONFIG };

export function loadConfig(): CLIConfig {
  try {
    const text = Deno.readTextFileSync(CONFIG_FILE);
    const parsed = JSON.parse(text) as Partial<CLIConfig>;
    current = {
      pat: typeof parsed.pat === "string" ? parsed.pat : "",
      deleteBeforeDownload: !!parsed.deleteBeforeDownload,
      forceManualFileSelection: !!parsed.forceManualFileSelection,
      backgroundAfterSeconds:
        typeof parsed.backgroundAfterSeconds === "number" &&
        parsed.backgroundAfterSeconds >= 0
          ? parsed.backgroundAfterSeconds
          : DEFAULT_CONFIG.backgroundAfterSeconds,
      appendBestIpTrackers: parsed.appendBestIpTrackers !== false,
      webServer: parsed.webServer !== false,
      webServerPort:
        typeof parsed.webServerPort === "number" && parsed.webServerPort > 0
          ? parsed.webServerPort
          : DEFAULT_WEB_PORT,
      debug: !!parsed.debug,
    };
  } catch {
    current = { ...DEFAULT_CONFIG };
  }
  return current;
}

export function saveConfig(cfg: CLIConfig): void {
  Deno.mkdirSync(CONFIG_DIR, { recursive: true });
  Deno.writeTextFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
}

export function getConfig(): CLIConfig {
  return current;
}

export function setConfig(cfg: CLIConfig): void {
  current = cfg;
  try {
    saveConfig(cfg);
  } catch {
    // ignore write failures — the in-memory config still updates.
  }
}

export function configPath(): string {
  return CONFIG_FILE;
}

export function effectivePat(cfg: CLIConfig): string {
  return cfg.pat || Deno.env.get("SEEDR_PAT") || "";
}

export function redactPat(pat: string): string {
  if (!pat) return "(unset)";
  if (pat.length <= 10) return "***";
  return `${pat.slice(0, 6)}…${pat.slice(-4)}`;
}
