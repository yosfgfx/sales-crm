import { postJson } from "@/lib/api-client";

type PickerResult = { action: string; docs?: { id: string; name: string }[] };
type PickerView = { setIncludeFolders(v: boolean): unknown; setSelectFolderEnabled(v: boolean): unknown; setMimeTypes(v: string): unknown };
type PickerBuilder = { addView(view: unknown): PickerBuilder; setOAuthToken(token: string): PickerBuilder; setDeveloperKey(key: string): PickerBuilder; setAppId(id: string): PickerBuilder; setLocale(locale: string): PickerBuilder; setTitle(title: string): PickerBuilder; setCallback(callback: (result: PickerResult) => void): PickerBuilder; build(): { setVisible(visible: boolean): void } };
declare global {
  interface Window {
    gapi?: { load(name: string, callback: () => void): void };
    google?: { picker: { PickerBuilder: new () => PickerBuilder; DocsView: new (viewId?: unknown) => PickerView; ViewId: { FOLDERS: unknown; DOCS: unknown }; Action: { PICKED: string } } };
  }
}

let pickerReady: Promise<void> | null = null;
function loadPicker() {
  if (!pickerReady) pickerReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = () => window.gapi?.load("picker", () => resolve());
    script.onerror = () => { pickerReady = null; reject(new Error("تعذّر تحميل نافذة Google Drive. تحقق من الاتصال.")); };
    document.head.appendChild(script);
  });
  return pickerReady;
}

export async function pickFromDrive(kind: "folder" | "file", title: string) {
  const { accessToken, apiKey, appId } = await postJson<{ accessToken: string; apiKey: string; appId: string }>("/api/integrations/google", { action: "pickerToken" });
  await loadPicker();
  const picker = window.google!.picker;
  return new Promise<{ id: string; name: string } | null>((resolve) => {
    const view = new picker.DocsView(kind === "folder" ? picker.ViewId.FOLDERS : picker.ViewId.DOCS);
    if (kind === "folder") { view.setIncludeFolders(true); view.setSelectFolderEnabled(true); view.setMimeTypes("application/vnd.google-apps.folder"); }
    new picker.PickerBuilder().addView(view).setOAuthToken(accessToken).setDeveloperKey(apiKey).setAppId(appId).setLocale("ar").setTitle(title)
      .setCallback((result) => { if (result.action === picker.Action.PICKED) resolve(result.docs?.[0] || null); else if (result.action === "cancel") resolve(null); }).build().setVisible(true);
  });
}
