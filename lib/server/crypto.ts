import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { MediaServerError } from "./http";

function key() {
  const raw = Buffer.from(process.env.WASL_ENCRYPTION_KEY || "", "base64");
  if (raw.length !== 32) throw new MediaServerError("مفتاح التشفير على الخادم غير مهيأ. تواصل مع مسؤول النظام.", 503, "ENCRYPTION_CONFIGURATION");
  return raw;
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function decryptSecret(sealed: string) {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new MediaServerError("بيانات الربط المحفوظة تالفة. أعد ربط Google Drive.", 503, "SECRET_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
