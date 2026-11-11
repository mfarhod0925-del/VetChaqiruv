import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";

/** Rasmni kichraytiradi (qishloqda internet sekin): eng katta tomoni 1280px, JPEG. */
export async function compressImage(file, max = 1280, quality = 0.8) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", quality));
    if (!blob) throw new Error("Rasmni o'qib bo'lmadi");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const uuid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/** Rasmni yuklaydi va saqlangan yo'lni qaytaradi: "<uid>/<id>.jpg". */
export async function uploadPhoto(uid, file) {
  if (file.size > 25 * 1024 * 1024) throw new Error("Rasm juda katta (25 MB dan oshmasin)");
  let blob = file;
  try { blob = await compressImage(file); } catch { /* asl faylni yuboramiz */ }
  const type = ["image/jpeg", "image/png", "image/webp"].includes(blob.type) ? blob.type : "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${uid}/${uuid()}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: type, upsert: false });
  if (error) throw error;
  return path;
}

const urlCache = new Map();
/** Maxfiy rasm uchun vaqtinchalik havola (1 soat). */
export function useSignedUrl(path) {
  const [url, setUrl] = useState(() => urlCache.get(path)?.url || null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!path) return;
    const c = urlCache.get(path);
    if (c && c.exp > Date.now()) { setUrl(c.url); return; }
    let alive = true;
    supabase.storage.from("photos").createSignedUrl(path, 3600).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data?.signedUrl) { setFailed(true); return; }
      urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3500 * 1000 });
      setUrl(data.signedUrl);
    });
    return () => { alive = false; };
  }, [path]);
  return { url, failed };
}
