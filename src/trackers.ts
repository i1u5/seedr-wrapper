/**
 * Best-IP tracker list from ngosang/trackerslist.
 *
 * - Every call attempts a fresh fetch.
 * - On success, the session cache is updated.
 * - On failure, the cache from an earlier call in this session is used.
 * - Nothing is persisted to disk — cache dies with the process.
 */

const BEST_IP_URL =
  "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best_ip.txt";

let cache: string[] | null = null;

function parseList(text: string): string[] {
  return text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length > 0 &&
        !t.startsWith("#") &&
        (t.startsWith("http://") ||
          t.startsWith("https://") ||
          t.startsWith("udp://") ||
          t.startsWith("ws://") ||
          t.startsWith("wss://")),
    );
}

async function fetchFresh(): Promise<string[]> {
  const res = await fetch(BEST_IP_URL, {
    headers: { Accept: "text/plain, */*" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`best_ip fetch: HTTP ${res.status} ${res.statusText}`);
  }
  const list = parseList(await res.text());
  if (list.length === 0) throw new Error("best_ip list came back empty");
  return list;
}

export async function fetchBestIpTrackers(): Promise<string[]> {
  try {
    const fresh = await fetchFresh();
    cache = fresh;
    return fresh;
  } catch (err) {
    if (cache) {
      console.error(
        `[seedr-cli] best_ip fetch failed (${(err as Error).message}); ` +
          `using cached list from this session`,
      );
      return cache;
    }
    throw err;
  }
}

export function appendTrackersToMagnet(
  magnet: string,
  trackers: string[],
): string {
  if (trackers.length === 0) return magnet;
  let out = magnet;
  for (const t of trackers) {
    out += `&tr=${encodeURIComponent(t)}`;
  }
  return out;
}
