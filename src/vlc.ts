/**
 * VLC detection and launching.
 * Spawns the VLC binary directly — works on all platforms without
 * requiring a registered protocol handler.
 */

function candidates(): string[] {
  if (Deno.build.os === "windows") {
    return [
      "vlc.exe",
      "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
      "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe",
    ];
  }
  if (Deno.build.os === "darwin") {
    return [
      "vlc",
      "/Applications/VLC.app/Contents/MacOS/VLC",
    ];
  }
  return ["vlc"];
}

async function probe(bin: string): Promise<boolean> {
  try {
    const cmd = new Deno.Command(bin, {
      args: ["--version"],
      stdout: "null",
      stderr: "null",
    });
    const { success } = await cmd.output();
    return success;
  } catch {
    return false;
  }
}

let detected: boolean | null = null;

export async function hasVlc(): Promise<boolean> {
  if (detected !== null) return detected;
  for (const bin of candidates()) {
    if (await probe(bin)) {
      detected = true;
      return true;
    }
  }
  detected = false;
  return false;
}

export function launchVlc(url: string): void {
  for (const bin of candidates()) {
    try {
      new Deno.Command(bin, {
        args: [url],
        stdout: "null",
        stderr: "null",
      }).spawn();
      return;
    } catch {
      // try next candidate
    }
  }
  throw new Error("VLC not found. Install it from https://www.videolan.org/vlc/");
}
