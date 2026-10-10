import { WorkflowError } from "@/lib/media-workflow";

export const DIRECT_DOWNLOAD_LIMIT = 4 * 1024 * 1024;
const CHUNK = 4 * 1024 * 1024;

async function fetchRange(url: string, start: number, end: number) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, cache: "no-store" });
      if (response.status === 401) throw new WorkflowError("انتهت جلستك. سجّل الدخول مجدداً.", "AUTH_REQUIRED", 401);
      if (response.status !== 206) throw new WorkflowError("تعذّر تنزيل الملف على أجزاء. أعد المحاولة.", "DOWNLOAD_FAILED", response.status);
      return await response.blob();
    } catch (error) {
      if ((error instanceof WorkflowError && error.status < 500 && error.status !== 0) || attempt >= 4) throw error instanceof WorkflowError ? error : new WorkflowError("انقطع التنزيل. تحقق من الشبكة ثم أعد المحاولة.", "NETWORK_ERROR", 0);
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
}

export async function downloadInChunks(url: string, name: string, size: number, onProgress?: (received: number, total: number) => void) {
  const parts: Blob[] = [];
  for (let start = 0; start < size; start += CHUNK) {
    const end = Math.min(start + CHUNK, size) - 1;
    parts.push(await fetchRange(url, start, end));
    onProgress?.(end + 1, size);
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(parts));
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}
