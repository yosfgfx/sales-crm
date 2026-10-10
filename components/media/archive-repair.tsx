"use client";

import { useState } from "react";
import { postJson } from "@/lib/api-client";
import { pickFromDrive } from "@/lib/drive-picker";
import { useMediaStore } from "@/stores/media-store";
import { ActionButton, errorText } from "./ui";

type Scan = { projectFolder: "ok" | "missing" | "none"; checked: number; files: { attachmentId: string; name: string; kind: string; problem: "missing" | "trashed" | "moved" }[] };

const PROBLEM_TEXT = { missing: "محذوف من Drive", trashed: "في سلة Drive", moved: "نُقل خارج مجلد المشروع" };
const call = <T,>(body: Record<string, unknown>) => postJson<T>("/api/integrations/google", body);

export default function ArchiveRepair({ ideaId }: { ideaId: string }) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (action: () => Promise<void>, success?: string) => {
    setBusy(true); setMessage("");
    try { await action(); if (success) setMessage(success); } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  };
  const check = () => run(async () => { setScan((await call<{ scan: Scan }>({ action: "scanArchive", ideaId })).scan); });
  const repair = (attachmentId: string, mode: "restore" | "relink" | "ignore", success: string) => run(async () => {
    let fileId: string | undefined;
    if (mode === "relink") {
      const picked = await pickFromDrive("file", "اختر الملف البديل");
      if (!picked) return;
      fileId = picked.id;
    }
    await call({ action: "repairAttachment", attachmentId, mode, fileId });
    setScan((await call<{ scan: Scan }>({ action: "scanArchive", ideaId })).scan);
    await useMediaStore.getState().loadIdea(ideaId);
  }, success);
  return (
    <div className="space-y-3">
      <ActionButton disabled={busy} onClick={() => void check()}>فحص ملفات الأرشيف</ActionButton>
      {scan && (
        <div className="space-y-2 text-sm">
          {scan.projectFolder === "missing" && <p className="text-[var(--danger)]">مجلد المشروع غير موجود في Drive. أعد محاولة الأرشفة لإنشائه من جديد.</p>}
          {scan.files.length === 0 ? (
            <p className="text-[var(--soft)]">فُحص {scan.checked} ملف، وكلها في مكانها.</p>
          ) : (
            <ul className="space-y-2">
              {scan.files.map((file) => (
                <li key={file.attachmentId} className="space-y-2 rounded-lg bg-[var(--background)] p-3">
                  <p><bdi>{file.name}</bdi> · <span className="text-[var(--danger)]">{PROBLEM_TEXT[file.problem]}</span></p>
                  <div className="flex flex-wrap gap-2">
                    {file.problem === "trashed" && <ActionButton disabled={busy} onClick={() => void repair(file.attachmentId, "restore", "استُعيد الملف من السلة.")}>استعادة من السلة</ActionButton>}
                    <ActionButton disabled={busy} onClick={() => void repair(file.attachmentId, "relink", "رُبط الملف البديل.")}>ربط بملف بديل</ActionButton>
                    <ActionButton disabled={busy} onClick={() => void repair(file.attachmentId, "ignore", "أُزيل الملف من الفكرة.")}>إزالته من الفكرة</ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>
  );
}
