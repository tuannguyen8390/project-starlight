// Thin client for the Starlight API. All URLs are relative, so the same build
// works on the home PC, behind Tailscale, or on a cloud host.

async function handle(res) {
  if (res.status === 401) {
    window.dispatchEvent(new Event("starlight-login"));
    throw new Error("Please sign in");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* not json */
    }
    throw new Error(typeof detail === "string" ? detail : "Something went wrong");
  }
  return res.json();
}

const send = (method, path, body) =>
  fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then(handle);

const qs = (o = {}) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && v !== false && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const api = {
  auth: () => send("GET", "/auth"),
  login: (password) => send("POST", "/login", { password }),
  stats: () => send("GET", "/stats"),
  paintings: (f) => send("GET", `/paintings${qs(f)}`),
  painting: (id) => send("GET", `/paintings/${id}`),
  patchPainting: (id, b) => send("PATCH", `/paintings/${id}`, b),
  bulkPaintings: (b) => send("POST", "/paintings/bulk", b),
  deletePainting: (id) => send("DELETE", `/paintings/${id}`),
  clips: (f) => send("GET", `/clips${qs(f)}`),
  patchClip: (id, b) => send("PATCH", `/clips/${id}`, b),
  deleteClip: (id) => send("DELETE", `/clips/${id}`),
  suggestions: (id) => send("GET", `/clips/${id}/suggestions`),
  transcribe: (id) => send("POST", `/clips/${id}/transcribe`),
  link: (painting_id, clip_id) => send("POST", "/links", { painting_id, clip_id }),
  unlink: (painting_id, clip_id) => send("DELETE", `/links${qs({ painting_id, clip_id })}`),
};

/**
 * Upload many files a few at a time so a big batch shows progress and one
 * failure does not lose the rest. Sends each file's own last-modified time,
 * which is how clips get matched to paintings later.
 */
export async function uploadFiles(files, onProgress, batch = 4) {
  const total = { added: [], duplicates: [], skipped: [] };
  const list = Array.from(files);
  for (let i = 0; i < list.length; i += batch) {
    const part = list.slice(i, i + batch);
    const fd = new FormData();
    part.forEach((f) => {
      fd.append("files", f, f.name);
      fd.append("last_modified", String(f.lastModified || Date.now()));
    });
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd, credentials: "same-origin" }).then(handle);
      total.added.push(...r.added);
      total.duplicates.push(...r.duplicates);
      total.skipped.push(...r.skipped);
    } catch (e) {
      part.forEach((f) => total.skipped.push({ name: f.name, reason: e.message }));
    }
    onProgress?.(Math.min(i + batch, list.length), list.length);
  }
  return total;
}

export function summary(r) {
  const bits = [`${r.added.length} added`];
  if (r.duplicates.length) bits.push(`${r.duplicates.length} duplicate${r.duplicates.length > 1 ? "s" : ""} skipped`);
  if (r.skipped.length) bits.push(`${r.skipped.length} couldn't be read`);
  return bits.join(" · ");
}
