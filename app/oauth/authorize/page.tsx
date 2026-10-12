import type { Metadata } from "next";
import AuthorizeConsent from "@/components/media/authorize-consent";

export const metadata: Metadata = { title: "ربط تطبيق بوصل", robots: { index: false, follow: false } };

const FIELDS = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const params = Object.fromEntries(FIELDS.map((key) => [key, typeof raw[key] === "string" ? raw[key] : ""])) as Record<(typeof FIELDS)[number], string>;
  return (
    <div dir="rtl" className="media-app flex min-h-dvh items-center justify-center bg-[var(--background)] p-4 text-[var(--foreground)]">
      <AuthorizeConsent params={params} />
    </div>
  );
}
