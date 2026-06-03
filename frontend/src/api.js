// Centralized API calls to the backend.

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
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
      }
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

export async function exportClips(videoId, segments) {
  const res = await fetch(`/api/export/${videoId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const videoUrl = (videoId) => `/api/video/${videoId}`;
