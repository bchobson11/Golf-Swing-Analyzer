// Centralized API calls to the backend.

// --- auth ---
export async function getMe() {
  const res = await fetch("/api/auth/me");
  if (!res.ok) throw new Error("not authenticated");
  return res.json();
}
export async function googleLogin(credential) {
  const res = await fetch("/api/auth/google", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function devLogin() {
  const res = await fetch("/api/auth/dev-login", { method: "POST" });
  if (!res.ok) throw new Error("Dev login unavailable");
  return res.json();
}
export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
}
export async function updateMe(name) {
  const res = await fetch("/api/auth/me", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to update profile");
  return res.json();
}

// Upload with progress via XHR (fetch lacks upload progress events).
export function uploadVideo(file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(form);
  });
}

export async function startAnalysis(videoId) {
  const res = await fetch(`/api/analyze/${videoId}`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to start analysis");
  return res.json();
}

export async function getAnalysis(videoId) {
  const res = await fetch(`/api/analyze/${videoId}`);
  if (!res.ok) throw new Error("Failed to fetch analysis status");
  return res.json();
}

// Save swings to the library. meta = {name, recorded_date, tags}.
export async function saveSwings(videoId, meta, segments) {
  const res = await fetch(`/api/save/${videoId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...meta, segments }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getLibrary() {
  const res = await fetch("/api/library");
  if (res.status === 401) { window.dispatchEvent(new Event("auth:401")); throw new Error("unauthorized"); }
  if (!res.ok) throw new Error("Failed to load library");
  return res.json();
}

export async function deleteSession(id) {
  const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete session");
  return res.json();
}

export async function updateSwingClub(id, club) {
  const res = await fetch(`/api/swings/${id}/club`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(club),
  });
  if (!res.ok) throw new Error("Failed to update club");
  return res.json();
}

// Update a swing's tags and/or notes.
export async function updateSwingMeta(id, meta) {
  const res = await fetch(`/api/swings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  if (!res.ok) throw new Error("Failed to update swing");
  return res.json();
}

export async function updateSession(id, { name, recorded_date }) {
  const res = await fetch(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, recorded_date }),
  });
  if (!res.ok) throw new Error("Failed to update session");
  return res.json();
}

// Add/remove tags across all swings in a session (session edit page "retag").
// Only touches the given tags; swing-specific tags are preserved.
export async function retagSession(id, { add = [], remove = [] }) {
  const res = await fetch(`/api/sessions/${id}/tags`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ add, remove }),
  });
  if (!res.ok) throw new Error("Failed to retag session");
  return res.json();
}

// --- tag management (canonical tag list) ---
export async function createTag(name) {
  const res = await fetch("/api/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to create tag");
  return res.json();
}
export async function renameTag(id, name) {
  const res = await fetch(`/api/tags/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to rename tag");
  return res.json();
}
export async function deleteTag(id) {
  const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete tag");
  return res.json();
}

export async function deleteSwing(id) {
  const res = await fetch(`/api/swings/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete swing");
  return res.json();
}

export async function getSwingPose(swingId) {
  const res = await fetch(`/api/clips/${swingId}/pose`);
  if (!res.ok) throw new Error("Failed to load pose data");
  return res.json();
}

export const videoUrl = (videoId) => `/api/video/${videoId}`;
