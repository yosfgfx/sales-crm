"use client";

import { useState } from "react";
import type { MediaData } from "@/data/media";
import { ActionButton, Icon } from "./ui";

export type DiscussionTarget = {
  kind: "company" | "category" | "workspace";
  id: string;
  title: string;
  threadId?: string;
};

export default function DiscussionShortcuts({
  data,
  onOpen,
}: {
  data: MediaData;
  onOpen: (target: DiscussionTarget) => void;
}) {
  const [kind, setKind] = useState<DiscussionTarget["kind"]>("workspace");
  const [id, setId] = useState("main");
  const choices =
    kind === "company"
      ? data.companies
      : kind === "category"
        ? data.categories
        : [{ id: "main", name: "لوحة العمل العامة" }];
  const selected = choices.find((item) => item.id === id) || choices[0];
  return (
    <section className="media-card space-y-4 p-5">
      <div>
        <h2 className="!text-lg">تعليقات الأقسام</h2>
        <p className="mt-1 text-sm text-[var(--soft)]">
          ناقش موضوعًا يخص شركة أو تصنيفًا، أو شارك ملاحظة على لوحة العمل.
        </p>
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
        <label className="media-label !mb-0">
          القسم
          <select
            className="media-input mt-2"
            value={kind}
            onChange={(event) => {
              const next = event.target.value as DiscussionTarget["kind"];
              setKind(next);
              setId(
                next === "workspace"
                  ? "main"
                  : next === "company"
                    ? data.companies[0]?.id || ""
                    : data.categories[0]?.id || "",
              );
            }}
          >
            <option value="workspace">لوحة العمل</option>
            <option value="company">شركة</option>
            <option value="category">تصنيف محتوى</option>
          </select>
        </label>
        <label className="media-label !mb-0">
          النقاش
          <select
            className="media-input mt-2"
            value={selected?.id || ""}
            onChange={(event) => setId(event.target.value)}
          >
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            {choices.length === 0 && (
              <option value="">لا توجد عناصر متاحة</option>
            )}
          </select>
        </label>
        <ActionButton
          disabled={!selected}
          onClick={() =>
            selected && onOpen({ kind, id: selected.id, title: selected.name })
          }
        >
          <Icon name="chat" className="size-4" />
          فتح النقاش
        </ActionButton>
      </div>
    </section>
  );
}
