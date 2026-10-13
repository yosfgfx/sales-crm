"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { MediaData, TeamMember } from "@/data/media";
import { HONOR_WEIGHTS, addressed } from "@/data/engagement";
import { useEngagement } from "@/stores/engagement-store";
import { errorText } from "../ui";
import { Icon3D } from "./icons-3d";
import { PersonAvatar } from "./person";
import { arNum } from "./format";

const EASE = [0.25, 1, 0.5, 1] as const;
const monthName = (month: string) => new Intl.DateTimeFormat("ar-SA", { calendar: "gregory", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
const nextMonthName = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-SA", { calendar: "gregory", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(number === 12 ? year + 1 : year, number % 12, 15)));
};

const CRITERIA = [
  { key: "completion", label: "الإنجاز", hint: "عدد الأعمال المُنجزة خلال الشهر", wash: "#EEEBFC", ink: "#3F2FA0" },
  { key: "onTime", label: "الالتزام بالمواعيد", hint: "لا يؤخر البطاقات المسندة إليه", wash: "#E7F6EF", ink: "#155F43" },
  { key: "response", label: "سرعة الاستجابة", hint: "يبدأ العمل فور إسناده إليه", wash: "#FFF4E3", ink: "#8A4B0A" },
  { key: "participation", label: "المشاركة والحضور", hint: "تعليقاته ورسائله وحضوره المستمر على المنصة", wash: "#EAF7F5", ink: "#11665E" },
] as const;

const PODIUM = {
  1: { height: 150, width: "w-[170px]", block: "linear-gradient(180deg,#FFE7A3 0%,#F2A33A 100%)", ink: "#6B3E06", ring: "#F2B04F", avatar: "lg" as const },
  2: { height: 110, width: "w-[150px]", block: "linear-gradient(180deg,#E4E7EF 0%,#C8CDD9 100%)", ink: "#4A5468", ring: "#C8CDD9", avatar: "md" as const },
  3: { height: 84, width: "w-[150px]", block: "linear-gradient(180deg,#F6DCCB 0%,#E0B293 100%)", ink: "#7A4520", ring: "#E0B293", avatar: "md" as const },
};

export function HonorBoard({ data, currentUser, onOpenProfile }: { data: MediaData; currentUser: TeamMember; onOpenProfile?: (memberId: string) => void }) {
  const { state, act } = useEngagement();
  const reduce = useReducedMotion();
  const [message, setMessage] = useState("");
  const honor = state?.honor;
  if (!honor) return <p role="status" className="text-[var(--soft)]">جارٍ تحميل لوحة الشرف…</p>;
  const member = (id: string) => data.members.find((item) => item.id === id);
  const winner = honor.current ? member(honor.current.memberId) : undefined;
  const order = [2, 1, 3].map((rank) => honor.podium.find((entry) => entry.rank === rank)).filter(Boolean) as { memberId: string; rank: 1 | 2 | 3 }[];
  const cheer = async () => {
    try {
      await act({ action: "cheer", month: honor.current!.month });
      setMessage("وصلت تهنئتك!");
    } catch (cause) {
      setMessage(errorText(cause));
    }
  };
  return (
    <div className="space-y-6">
      {winner && honor.current ? (
        <motion.section
          initial={reduce ? false : { opacity: 0, scale: 1.04, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 1, ease: EASE }}
          className="relative flex flex-wrap items-center justify-between gap-8 overflow-hidden rounded-[32px] bg-[radial-gradient(90%_120%_at_15%_0%,#3A3170_0%,#1D243C_60%)] p-7 text-white sm:p-10"
        >
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-3">
            <span className="font-medium text-[#F7C873]">{winner.addressForm === "f" ? "الموظفة المثالية" : "الموظف المثالي"} لشهر {monthName(honor.current.month)}</span>
            <h2 className="font-display !text-[clamp(2.25rem,5vw,3.5rem)] !font-medium !leading-[1.15] text-white">{winner.name}</h2>
            {honor.current.summary && <p className="max-w-[35em] text-lg text-[#D7DBEA]">{honor.current.summary}.</p>}
            <div className="mt-2 flex flex-wrap gap-2.5">
              {winner.id !== currentUser.id && (
                <button type="button" disabled={honor.current.cheered} onClick={() => void cheer()} className="min-h-12 rounded-2xl bg-[#F2A33A] px-5 font-bold text-[#1D243C] transition-[transform,background-color] duration-200 ease-power3-out hover:bg-[#f6b558] active:scale-95 disabled:opacity-70">
                  {honor.current.cheered ? "هنّأته ✓" : `${addressed(currentUser.addressForm, "هنّئ", "هنّئي")} ${winner.name.split(" ")[0]}`}
                </button>
              )}
              <span className="inline-flex items-center rounded-2xl bg-white/10 px-3.5 text-sm text-[#D7DBEA]">
                {honor.current.cheers ? `${arNum(honor.current.cheers)} ${honor.current.cheers === 1 ? "زميل هنّأ" : "زملاء هنّأوا"}` : addressed(currentUser.addressForm, "كن أول من يهنئ", "كوني أول من يهنئ")}
              </span>
              {message && <span role="status" className="inline-flex items-center text-sm text-[#F7C873]">{message}</span>}
            </div>
          </div>
          <div className="relative mx-auto grid size-[280px] place-items-center">
            <motion.div aria-hidden="true" className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(247_200_115/0.35)_0%,rgb(247_200_115/0)_68%)]" animate={reduce ? undefined : { scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
            <motion.div initial={reduce ? false : { y: 40, rotate: -12, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} transition={{ duration: 1.2, ease: EASE, delay: 0.3 }}>
              <Icon3D name="trophy" className="relative size-[190px]" />
            </motion.div>
            <motion.span className="absolute bottom-2 translate-y-[30%]" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.9 }}>
              <PersonAvatar member={winner} size="xl" ring="#F7C873" showPresence={false} />
            </motion.span>
          </div>
        </motion.section>
      ) : (
        <section className="flex items-center gap-4 rounded-[28px] bg-[radial-gradient(90%_120%_at_15%_0%,#3A3170_0%,#1D243C_60%)] p-7 text-white">
          <Icon3D name="trophy" className="size-16" />
          <div>
            <h2 className="!text-2xl text-white">أول تتويج قريباً</h2>
            <p className="text-[#D7DBEA]">يُعلن الموظف المثالي أول يوم من كل شهر بناءً على أداء الشهر السابق، ويصل الإعلان للجميع.</p>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <section className="media-card flex min-w-0 flex-[999_1_560px] flex-col gap-5 p-6 sm:px-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="!text-[22px]">سباق {monthName(honor.month).split(" ")[0]} حتى الآن</h2>
            <span className="text-[13px] text-[var(--soft)]">يُعلن الفائز أول يوم من {nextMonthName(honor.month)}</span>
          </div>
          {order.length ? (
            <div className="flex items-end justify-center gap-3 pt-3 sm:gap-5">
              {order.map((entry) => {
                const person = member(entry.memberId);
                const style = PODIUM[entry.rank];
                return (
                  <div key={entry.memberId} className={`flex flex-col items-center gap-2 ${style.width} max-w-[32%]`}>
                    <motion.span initial={reduce ? false : { opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.5 + (3 - entry.rank) * 0.15 }}>
                      <PersonAvatar member={person} size={style.avatar} ring={style.ring} />
                    </motion.span>
                    <button type="button" disabled={!onOpenProfile} onClick={() => onOpenProfile?.(entry.memberId)} className="text-center font-bold enabled:hover:text-[var(--primary)]">{person?.name || "عضو"}</button>
                    <motion.div
                      className="grid w-full origin-bottom place-items-center rounded-t-[18px] rounded-b-lg font-display text-4xl"
                      style={{ height: style.height, background: style.block, color: style.ink }}
                      initial={reduce ? false : { scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.9, ease: EASE, delay: 0.15 + (3 - entry.rank) * 0.12 }}
                    >
                      {arNum(entry.rank)}
                    </motion.div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-[var(--soft)]">السباق يبدأ مع أول عمل يُسلَّم هذا الشهر.</p>
          )}
          <p className="text-center text-sm text-[var(--soft)]">الترتيب يتحدث يومياً. تظهر الدرجات التفصيلية لمدير النظام ومدير الإدارة فقط.</p>
          {honor.ranking && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36em] text-sm">
                <caption className="sr-only">الدرجات التفصيلية لهذا الشهر</caption>
                <thead className="text-xs text-[var(--soft)]">
                  <tr>
                    <th className="p-2 text-start font-medium">العضو</th>
                    <th className="p-2 font-medium">الدرجة</th>
                    {CRITERIA.map((item) => <th key={item.key} className="p-2 font-medium">{item.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {honor.ranking.map((entry) => (
                    <tr key={entry.memberId} className="border-t border-[var(--border)]">
                      <td className="p-2">
                        <button type="button" disabled={!onOpenProfile} onClick={() => onOpenProfile?.(entry.memberId)} className="flex items-center gap-2 enabled:hover:text-[var(--primary)]">
                          <PersonAvatar member={member(entry.memberId)} size="sm" />
                          {member(entry.memberId)?.name}
                        </button>
                      </td>
                      <td className="p-2 text-center font-bold tabular-nums">{arNum(entry.score)}</td>
                      {CRITERIA.map((item) => <td key={item.key} className="p-2 text-center tabular-nums text-[var(--soft)]">{arNum(entry.breakdown[item.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="media-card flex min-w-0 flex-[1_1_360px] flex-col gap-3.5 p-6">
          <h2 className="!text-[22px]">كيف يُختار الموظف المثالي؟</h2>
          {CRITERIA.map((item) => (
            <div key={item.key} className="flex items-start gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl font-bold" style={{ background: item.wash, color: item.ink }}>{arNum(HONOR_WEIGHTS[item.key])}</span>
              <div>
                <b>{item.label}</b>
                <span className="block text-[13px] text-[var(--soft)]">{item.hint}</span>
              </div>
            </div>
          ))}
        </section>
      </div>

      {honor.past.length > 0 && (
        <section className="media-card space-y-3.5 p-6">
          <h2 className="!text-xl">أبطال الأشهر السابقة</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
            {honor.past.map((award, index) => {
              const person = member(award.memberId);
              return (
                <div key={award.month} className={`flex items-center gap-3 rounded-2xl p-3.5 ${index === 0 ? "bg-[#FFF8E8]" : "bg-[var(--background)]"}`}>
                  <PersonAvatar member={person} size="lg" showPresence={false} />
                  <div>
                    <b className="block">{person?.name || "عضو سابق"}</b>
                    <span className="text-[13px] text-[var(--soft)]">{monthName(award.month)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
