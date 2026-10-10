"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import type { Attachment } from "@/data/media";
import { downloadInChunks, needsChunks } from "@/lib/download-client";
import { useMediaStore } from "@/stores/media-store";
import { errorText } from "./ui";

type Props = { file: Pick<Attachment, "name" | "size" | "url">; className?: string; download?: boolean; label?: string; children: ReactNode };

export default function AttachmentLink({ file, className, download, label, children }: Props) {
  const [percent, setPercent] = useState<number | null>(null);
  const large = needsChunks(file.url, file.size);
  const href = large ? file.url.replace(/[?&]inline=1\b/, "") : file.url;
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!large) return;
    event.preventDefault();
    if (percent !== null) return;
    setPercent(0);
    downloadInChunks(href, file.name, file.size, (received, total) => setPercent(Math.floor((received / total) * 100)))
      .catch((error) => useMediaStore.setState({ error: errorText(error) }))
      .finally(() => setPercent(null));
  };
  return (
    <a
      href={href}
      onClick={onClick}
      aria-label={label}
      aria-busy={percent !== null}
      {...(download || large ? { download: file.name } : { target: "_blank", rel: "noopener noreferrer" })}
      className={className}
    >
      {children}
      {percent !== null && <span role="status" className="ms-2 text-xs text-[var(--soft)]">جارٍ التنزيل {percent}٪</span>}
    </a>
  );
}
