"use client";

import { useEffect, useState } from "react";
import type { Attachment } from "@/data/media";
import { fetchInChunks, needsChunks } from "@/lib/download-client";

export function useAttachmentSrc(file?: Pick<Attachment, "url" | "size" | "mime">) {
  const chunked = Boolean(file && needsChunks(file.url, file.size));
  const [objectUrl, setObjectUrl] = useState<{ key: string; url: string } | null>(null);
  const key = file ? `${file.url}|${file.size}` : "";
  useEffect(() => {
    if (!file || !chunked) return;
    let cancelled = false;
    let created = "";
    fetchInChunks(file.url.replace(/[?&]inline=1\b/, ""), file.size, file.mime)
      .then((blob) => { if (cancelled) return; created = URL.createObjectURL(blob); setObjectUrl({ key, url: created }); })
      .catch(() => undefined);
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
  }, [chunked, file, key]);
  if (!file) return undefined;
  if (!chunked) return file.url;
  return objectUrl?.key === key ? objectUrl.url : undefined;
}
