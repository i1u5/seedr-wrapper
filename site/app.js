// seedr-cli web UI

const state = {
  tab: "dashboard",
  folderId: 0,
  crumbs: [],
  config: null,
  vlcAvailable: false,
  lastTaskId: null,
  pollHandle: null,
  lastUrl: null,
  lastResultName: null,
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = data && data.error ? data.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function formatBytes(n) {
  if (!n || n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(2)} ${u[i]}`;
}

function $(id) { return document.getElementById(id); }
function show(el, yes = true) { el.classList.toggle("hidden", !yes); }

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.tab = btn.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    document.getElementById(`tab-${state.tab}`).classList.remove("hidden");
    if (state.tab === "files") loadFiles();
    if (state.tab === "settings") loadConfig();
  });
});

async function loadAccount() {
  try {
    const data = await api("/api/account");
    const email = data.user?.profile?.email ?? data.user?.profile?.username ?? "unknown";
    $("userEmail").textContent = email;
    const used = data.quota?.space_used ?? 0;
    const max = data.quota?.space_max ?? 0;
    const pct = max > 0 ? used / max : 0;
    const bar = $("quotaBar");
    bar.style.width = `${Math.min(100, pct * 100)}%`;
    bar.classList.toggle("warn", pct > 0.7 && pct <= 0.9);
    bar.classList.toggle("danger", pct > 0.9);
    $("quotaText").textContent = `${formatBytes(used)} / ${formatBytes(max)}`;
  } catch (e) {
    $("userEmail").textContent = "error";
    console.error(e);
  }
}

$("addBtn").addEventListener("click", addMagnet);
$("magnetInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addMagnet();
});

function setError(msg) {
  show($("errorCard"), true);
  $("errorMsg").textContent = msg;
}
function clearError() { show($("errorCard"), false); }

async function addMagnet() {
  const magnet = $("magnetInput").value.trim();
  if (!magnet) return;
  clearError();
  show($("resultCard"), false);
  show($("pickerCard"), false);

  try {
    const res = await api("/api/magnet", {
      method: "POST",
      body: JSON.stringify({ magnet }),
    });
    state.lastTaskId = res.taskId;
    show($("progressCard"), true);
    $("progressStatus").textContent = "starting…";
    $("progressBar").style.width = "0%";
    $("progressPct").textContent = "0%";

    if (state.pollHandle) clearInterval(state.pollHandle);
    state.pollHandle = setInterval(pollTask, 2000);
  } catch (e) {
    setError(e.message);
  }
}

async function pollTask() {
  if (!state.lastTaskId) return;
  try {
    const { task } = await api(`/api/tasks/${state.lastTaskId}`);
    const pct = Math.max(0, Math.min(1, (task.progress ?? 0) / 100));
    $("progressBar").style.width = `${pct * 100}%`;
    $("progressPct").textContent = `${Math.floor(pct * 100)}%`;
    $("progressStatus").textContent = `${task.name || "…"} · ${task.state}`;

    if (task.state === "finished" || task.progress >= 100) {
      clearInterval(state.pollHandle);
      state.pollHandle = null;
      await finishTask(state.lastTaskId);
    }
  } catch (e) {
    console.warn("poll error", e);
  }
}

async function finishTask(taskId) {
  show($("progressCard"), false);
  try {
    const { files } = await api(`/api/tasks/${taskId}/files`);
    if (!files || files.length === 0) {
      setError("torrent finished but no files were returned");
      return;
    }

    if (state.config && state.config.forceManualFileSelection) {
      showPicker(files);
      return;
    }

    const pick = await api("/api/autopick", {
      method: "POST",
      body: JSON.stringify({ files }),
    });

    if (pick.picked) {
      const file = files.find((f) => f.id === pick.picked);
      await openFile(file);
    } else if (files.length === 1) {
      await openFile(files[0]);
    } else {
      showPicker(files);
    }
  } catch (e) {
    setError(e.message);
  }
}

function showPicker(files) {
  show($("pickerCard"), true);
  const list = $("pickerList");
  list.innerHTML = "";
  for (const f of files) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="icon">${iconFor(f.name)}</span>
      <span class="name">${escapeHtml(f.name)}</span>
      <span class="size">${formatBytes(f.size)}</span>
    `;
    li.addEventListener("click", () => openFile(f));
    list.appendChild(li);
  }
}

async function openFile(file) {
  if (!file) return;
  show($("pickerCard"), false);
  show($("resultCard"), false);
  $("progressStatus").textContent = "generating download link…";
  show($("progressCard"), true);
  try {
    const { url } = await api(`/api/file/${file.id}/url`);
    show($("progressCard"), false);
    show($("resultCard"), true);
    $("resultName").textContent = file.name;
    $("resultSize").textContent = formatBytes(file.size);
    $("resultUrl").textContent = url;
    state.lastUrl = url;
    state.lastResultName = file.name;
  } catch (e) {
    show($("progressCard"), false);
    setError(e.message);
  }
}

$("copyBtn").addEventListener("click", async () => {
  if (!state.lastUrl) return;
  try {
    await navigator.clipboard.writeText(state.lastUrl);
    $("copyBtn").textContent = "Copied!";
    setTimeout(() => ($("copyBtn").textContent = "Copy link"), 1200);
  } catch {
    const range = document.createRange();
    range.selectNodeContents($("resultUrl"));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
});

$("vlcBtn").addEventListener("click", async () => {
  if (!state.lastUrl) return;
  try {
    await api("/api/vlc", {
      method: "POST",
      body: JSON.stringify({ url: state.lastUrl }),
    });
    $("vlcBtn").textContent = "Launched!";
    setTimeout(() => ($("vlcBtn").textContent = "▶ Play in VLC"), 1200);
  } catch (e) {
    setError(`VLC launch failed: ${e.message}`);
  }
});

async function loadFiles() {
  const list = $("fileList");
  list.innerHTML = "";
  try {
    const data = await api(`/api/files?folder=${state.folderId}`);
    renderCrumbs();

    const entries = [
      ...(data.folders ?? []).map((f) => ({ kind: "folder", ...f })),
      ...(data.torrents ?? []).map((t) => ({ kind: "torrent", ...t })),
      ...(data.files ?? []).map((f) => ({ kind: "file", ...f })),
    ];

    if (entries.length === 0) {
      show($("fileListEmpty"), true);
      return;
    }
    show($("fileListEmpty"), false);

    for (const e of entries) {
      const li = document.createElement("li");
      li.className = `entry-${e.kind}`;

      const name = e.kind === "folder"
        ? (e.path || `folder-${e.id}`)
        : e.name;

      const sizeOrProgress = e.kind === "torrent"
        ? `<span class="progress">[${progressBarText((e.progress ?? 0) / 100)}] ${Math.floor(e.progress ?? 0)}% · active</span>`
        : `<span class="size">${formatBytes(e.size)}</span>`;

      li.innerHTML = `
        <span class="icon">${iconFor(e.kind, name)}</span>
        <span class="name">${escapeHtml(name)}</span>
        ${sizeOrProgress}
        <span class="actions"></span>
      `;

      const actions = li.querySelector(".actions");

      if (e.kind === "folder") {
        li.querySelector(".name").addEventListener("click", () => {
          state.crumbs.push({ id: e.id, name });
          state.folderId = e.id;
          loadFiles();
        });
        const zipBtn = document.createElement("button");
        zipBtn.className = "small ghost";
        zipBtn.textContent = "zip";
        zipBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          try {
            const { url } = await api(`/api/folder/${e.id}/zip`);
            showResultInline(`${name}.zip`, e.size, url);
          } catch (err) { setError(err.message); }
        });
        actions.appendChild(zipBtn);
      } else if (e.kind === "file") {
        li.querySelector(".name").addEventListener("click", () => openFile(e));
        const dlBtn = document.createElement("button");
        dlBtn.className = "small ghost";
        dlBtn.textContent = "download";
        dlBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          openFile(e);
        });
        actions.appendChild(dlBtn);
      }

      const delBtn = document.createElement("button");
      delBtn.className = "small ghost";
      delBtn.textContent = "delete";
      delBtn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (!confirm(`Delete "${name}"?`)) return;
        try {
          await api("/api/delete", {
            method: "POST",
            body: JSON.stringify({
              type: e.kind === "torrent" ? "torrent" : e.kind,
              id: e.id,
            }),
          });
          loadFiles();
        } catch (err) { setError(err.message); }
      });
      actions.appendChild(delBtn);

      list.appendChild(li);
    }
  } catch (e) {
    setError(e.message);
  }
}

function renderCrumbs() {
  const el = $("crumbs");
  el.innerHTML = "";
  const root = document.createElement("a");
  root.textContent = "/";
  root.addEventListener("click", () => {
    state.crumbs = [];
    state.folderId = 0;
    loadFiles();
  });
  el.appendChild(root);
  state.crumbs.forEach((c, i) => {
    const sep = document.createElement("span");
    sep.className = "sep";
    sep.textContent = "/";
    el.appendChild(sep);
    const a = document.createElement("a");
    a.textContent = c.name;
    a.addEventListener("click", () => {
      state.crumbs = state.crumbs.slice(0, i + 1);
      state.folderId = c.id;
      loadFiles();
    });
    el.appendChild(a);
  });
}

$("refreshBtn").addEventListener("click", loadFiles);

async function loadConfig() {
  try {
    const { config } = await api("/api/config");
    state.config = config;
    renderSettings(config);
  } catch (e) {
    setError(e.message);
  }
}

function renderSettings(cfg) {
  const list = $("settingsList");
  list.innerHTML = "";

  const items = [
    { key: "deleteBeforeDownload", label: "Delete before download", type: "bool", desc: "Wipe remote storage before each magnet." },
    { key: "forceManualFileSelection", label: "Force manual file selection", type: "bool", desc: "Always show the file picker." },
    { key: "backgroundAfterSeconds", label: "Background after", type: "num", desc: "Seconds before handing back control (0 = wait).", values: [0, 5, 10, 15, 30, 60, 120, 300] },
    { key: "appendBestIpTrackers", label: "Append best_ip trackers", type: "bool", desc: "Fetch + append ngosang trackers to magnets." },
    { key: "webServer", label: "Web server", type: "bool", desc: "Run the web UI on the configured port." },
    { key: "webServerPort", label: "Web server port", type: "num", desc: "Port for the web UI (8000 = Deno's default).", values: [8000, 8080, 3000, 5000, 9000, 80] },
    { key: "debug", label: "Debug logging", type: "bool", desc: "Print raw HTTP requests." },
  ];

  for (const it of items) {
    const row = document.createElement("div");
    row.className = "setting";
    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML = `<span class="title">${it.label}</span><span class="desc">${it.desc}</span>`;
    row.appendChild(info);

    if (it.type === "bool") {
      const t = document.createElement("div");
      t.className = `toggle${cfg[it.key] ? " on" : ""}`;
      t.addEventListener("click", () => {
        cfg[it.key] = !cfg[it.key];
        t.classList.toggle("on", cfg[it.key]);
      });
      row.appendChild(t);
    } else {
      const sel = document.createElement("select");
      sel.className = "select-num";
      for (const v of it.values) {
        const o = document.createElement("option");
        o.value = String(v);
        o.textContent = it.key === "backgroundAfterSeconds" && v === 0 ? "never" : String(v);
        if (Number(cfg[it.key]) === v) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener("change", () => {
        cfg[it.key] = Number(sel.value);
      });
      row.appendChild(sel);
    }

    list.appendChild(row);
  }
}

$("saveSettingsBtn").addEventListener("click", async () => {
  try {
    const { config } = await api("/api/config", {
      method: "PUT",
      body: JSON.stringify(state.config),
    });
    state.config = config;
    $("saveSettingsBtn").textContent = "Saved!";
    setTimeout(() => ($("saveSettingsBtn").textContent = "Save"), 1200);
  } catch (e) {
    setError(e.message);
  }
});

function iconFor(kindOrName, name) {
  if (kindOrName === "folder") return "📁";
  if (kindOrName === "torrent") return "⏬";
  const n = (name || kindOrName || "").toLowerCase();
  if (/\.(mp4|mkv|avi|mov|webm|m4v|flv|wmv|mpg|mpeg)$/.test(n)) return "🎬";
  if (/\.(srt|vtt|ass|ssa|sub)$/.test(n)) return "💬";
  if (/\.(rar|zip|7z|tar|gz)$/.test(n)) return "📦";
  return "📄";
}

function progressBarText(fraction) {
  const width = 12;
  const filled = Math.floor(Math.max(0, Math.min(1, fraction)) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showResultInline(name, size, url) {
  show($("resultCard"), true);
  $("resultName").textContent = name;
  $("resultSize").textContent = formatBytes(size);
  $("resultUrl").textContent = url;
  state.lastUrl = url;
  state.lastResultName = name;
}

(async function init() {
  await loadAccount();
  await loadConfig();
  try {
    const v = await api("/api/vlc");
    state.vlcAvailable = v.available;
    if (!v.available) {
      $("vlcBtn").disabled = true;
      $("vlcBtn").textContent = "VLC not found";
      $("vlcBtn").classList.remove("primary");
    }
  } catch {}
})();
