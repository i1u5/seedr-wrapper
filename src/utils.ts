export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

export function buildBar(progress: number, width = 30): string {
  const pct = Math.max(0, Math.min(1, progress));
  const filled = Math.floor(pct * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function pctColor(pct: number): "green" | "yellow" | "red" {
  if (pct > 0.9) return "red";
  if (pct > 0.7) return "yellow";
  return "green";
}

export function isVideoFile(name: string): boolean {
  return /\.(mp4|mkv|avi|mov|webm|m4v|flv|wmv|mpg|mpeg)$/i.test(name);
}

export function isMainVideoCandidate(name: string): boolean {
  return /\.(mp4|mkv)$/i.test(name);
}

export function isSubtitleFile(name: string): boolean {
  return /\.(srt|vtt|ass|ssa|sub)$/i.test(name);
}

export function isArchiveFile(name: string): boolean {
  return /\.(rar|zip|7z|tar|gz)$/i.test(name);
}

export interface FileLike {
  id: number;
  name: string;
  size: number;
}

export function pickMainVideo<T extends FileLike>(files: T[]): T | null {
  const videos = files.filter((f) => isMainVideoCandidate(f.name));
  if (videos.length === 0) return null;
  if (videos.length === 1) return videos[0];

  const sorted = [...videos].sort((a, b) => b.size - a.size);
  const largest = sorted[0];
  const second = sorted[1];

  const MIN_SIZE = 100 * 1024 * 1024;
  if (largest.size >= MIN_SIZE && largest.size >= second.size * 3) {
    return largest;
  }
  return null;
}

export function isValidMagnet(s: string): boolean {
  return /^magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}/i.test(s.trim());
}

export function parseMagnetSize(magnet: string): number | null {
  const m = magnet.match(/[?&]xl=(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function buildCrumbPath(names: string[]): string {
  if (names.length === 0) return "/";
  const cleaned = names.map((n) => n.trim()).filter((n) => n.length > 0);
  if (cleaned.length === 0) return "/";
  return "/ " + cleaned.join(" / ");
}

export function formatTimeout(v: number): string {
  return v === 0 ? "never (wait)" : `${v}s`;
}

export function osc8(url: string, label?: string): string {
  const text = label ?? url;
  return `\u001b]8;;${url}\u001b\\${text}\u001b]8;;\u001b\\`;
}

export function urlEncode(s: string): string {
  return encodeURIComponent(s);
}

export function urlDecode(s: string): string {
  return decodeURIComponent(s);
}
