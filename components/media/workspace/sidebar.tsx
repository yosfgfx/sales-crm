"use client";

import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import { memberDisplayLabel, type TeamMember } from "@/data/media";
import { isAdministrator } from "@/lib/media-workflow";
import { ActionButton, Icon } from "../ui";
import { Avatar } from "./avatar";
import { navigation, type View } from "./shared";

export function Sidebar({
  view,
  pending,
  currentUser,
  go,
  setAccount,
}: {
  view: View;
  pending: number;
  currentUser: TeamMember;
  go: (next: View) => void;
  setAccount: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-6 pt-8 pb-7">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-[#8170ef] text-white">
          <Icon name="spark" className="size-7" />
        </span>
        <div>
          <span className="block text-2xl font-bold">
            وصْل
            <span className="ms-2 text-xs font-normal text-[#b8b9d3]">
              WASL
            </span>
          </span>
          <span className="text-xs text-[#b8b9d3]">مساحة التواصل الداخلي</span>
        </div>
      </div>
      <div className="mx-4 mb-6 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
        <span className="mb-1 block text-xs text-[#b8b9d3]">
          مساحة العمل
        </span>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>فريق الاتصال المؤسسي</span>
          <span className="size-2 rounded-full bg-[#80d6b1]" />
        </div>
      </div>
      <nav aria-label="التنقل الرئيسي" className="space-y-1 px-3">
        {navigation.map((item) => (
          <ActionButton
            key={item.id}
            onClick={() => go(item.id)}
            aria-current={view === item.id ? "page" : undefined}
            className={`w-full justify-start gap-3 border-0 px-4 py-3 !shadow-none ${view === item.id ? "!bg-[#8170ef]/20 !text-[#dfd9ff]" : "!bg-transparent !text-[#b8b9d3] hover:!bg-white/5 hover:!text-white"}`}
          >
            <Icon name={item.icon} />
            <span className="flex-1 text-start">{item.label}</span>
            {item.id === "approvals" && pending > 0 && (
              <span className="rounded-md bg-[#f3bd77] px-1.5 text-xs text-[#43311c]">
                {pending}
              </span>
            )}
          </ActionButton>
        ))}
      </nav>
      <div className="mt-7 px-7 text-xs text-[#898da9]">الفريق</div>
      <div className="space-y-3 px-7 py-4">
        <div className="flex items-center gap-2 text-xs text-[#b8b9d3]">
          <span className="size-2 rounded-full bg-[#bea9ff]" />
          كتابة المحتوى والتنسيق
        </div>
        <div className="flex items-center gap-2 text-xs text-[#b8b9d3]">
          <span className="size-2 rounded-full bg-[#8ecbc4]" />
          التصميم والإنتاج
        </div>
      </div>
      <div className="mt-auto space-y-4 px-4 pt-8 pb-4">
        {isAdministrator(currentUser) && (
          <ActionButton
            onClick={() => go("admin")}
            aria-current={view === "admin" ? "page" : undefined}
            className={`w-full justify-start gap-3 !shadow-none ${view === "admin" ? "!bg-[#8170ef]/20 !text-white" : "!bg-transparent !text-[#b8b9d3]"}`}
          >
            <Icon name="settings" />
            إدارة النظام
          </ActionButton>
        )}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-[#d4d0f7]">
            <Icon name="spark" className="size-4" />
            أفكار أوضح. أثر أكبر.
          </div>
          <p className="text-xs text-[#b8b9d3]">
            مساحة تجمع إبداع الفريق وتوثّق كل إنجاز.
          </p>
          <Link href="/guide" className="mt-3 inline-block text-xs text-[#dfd9ff] underline underline-offset-4">
            دليل الاستخدام
          </Link>
        </div>
        <ActionButton
          onClick={() => setAccount(true)}
          className="w-full justify-start gap-3 !bg-transparent !px-1 !text-white !shadow-none"
        >
          <Avatar name={currentUser.name} />
          <div className="flex-1 text-start">
            <span className="block text-sm">{currentUser.name}</span>
            <span className="text-xs text-[#b8b9d3]">
              {memberDisplayLabel(currentUser)}
            </span>
          </div>
          <Icon name="settings" className="size-4 text-[#b8b9d3]" />
        </ActionButton>
      </div>
    </>
  );
}
