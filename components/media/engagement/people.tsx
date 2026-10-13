"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { memberDisplayLabel, type MediaData, type TeamMember } from "@/data/media";
import { HONOR_WEIGHTS, type MemberProfile } from "@/data/engagement";
import { isAdministrator } from "@/lib/media-workflow";
import { useEngagement } from "@/stores/engagement-store";
import { Icon, errorText } from "../ui";
import { Icon3D } from "./icons-3d";
import { PersonAvatar, useOnline } from "./person";
import { arNum, minutesText, relativeTime } from "./format";

const EASE = [0.25, 1, 0.5, 1] as const;
const HEAT = ["#EEF0F5", "#D9D3FA", "#A99BF1", "#7D6AE6", "#5340C9"];
const heatLevel = (minutes: number) => (minutes <= 0 ? 0 : minutes < 30 ? 1 : minutes < 120 ? 2 : minutes < 240 ? 3 : 4);
export const canSeeProfiles = (member: TeamMember | null) => !!member && (isAdministrator(member) || member.role === "manager");

function Kpi({ label, value, hint, index }: { label: string; value: string; hint: string; index: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.1 + index * 0.05 }} className="media-card flex flex-col gap-1.5 p-5">
      <span className="text-[13px] text-[var(--soft)]">{label}</span>
      <strong className="font-display text-[34px] leading-tight font-medium">{value}</strong>
      <span className="text-[13px] text-[var(--soft)]">{hint}</span>
    </motion.div>
  );
}

function PersonCard({ member, data, onOpen, canOpen }: { member: TeamMember; data: MediaData; onOpen: () => void; canOpen: boolean }) {
  const { state } = useEngagement();
  const online = useOnline(member.id);
  const entry = state?.team.find((item) => item.memberId === member.id);
  const idea = entry?.working?.ideaId ? data.ideas.find((item) => item.id === entry.working!.ideaId) : undefined;
  const status = entry?.working ? `يعمل على «${idea?.title || entry.working.label || "مهمة"}»` : online ? "متصل الآن" : `آخر ظهور ${relativeTime(entry?.lastSeenAt || null)}`;
  const body = (
    <>
      <PersonAvatar member={member} size="lg" />
      <div className="min-w-0 flex-1">
        <strong className="block truncate">{member.name}</strong>
        <span className="block truncate text-[13px] text-[var(--soft)]">{memberDisplayLabel(member)}</span>
        <span className={`mt-1 block truncate text-[13px] ${online ? "text-[#155F43]" : "text-[var(--soft)]"}`}>{status}</span>
      </div>
      {canOpen && <Icon name="chevron" className="size-4 rotate-180 text-[var(--soft)]" />}
    </>
  );
  return canOpen ? (
    <button type="button" onClick={onOpen} className="media-card flex items-center gap-3.5 p-4 text-start transition-transform duration-300 ease-power3-out hover:-translate-y-0.5">
      {body}
    </button>
  ) : (
    <div className="media-card flex items-center gap-3.5 p-4">{body}</div>
  );
}

function Profile({ member, data, onBack }: { member: TeamMember; data: MediaData; onBack: () => void }) {
  const { profiles, loadProfile, state } = useEngagement();
  const reduce = useReducedMotion();
  const [error, setError] = useState("");
  const profile: MemberProfile | undefined = profiles[member.id];
  const online = useOnline(member.id);
  useEffect(() => {
    void loadProfile(member.id).catch((cause) => setError(errorText(cause)));
  }, [member.id, loadProfile]);
  const won = state?.honor.past.filter((award) => award.memberId === member.id) || [];
  const working = state?.team.find((item) => item.memberId === member.id)?.working;
  const workingIdea = working?.ideaId ? data.ideas.find((idea) => idea.id === working.ideaId) : undefined;
  const recent = data.ideas
    .filter((idea) => idea.status === "delivered" && (idea.designerId === member.id || idea.ownerId === member.id))
    .sort((a, b) => (b.deliveredAt || "").localeCompare(a.deliveredAt || ""))
    .slice(0, 3);
  const maxContribution = Math.max(1, profile ? Math.max(profile.ideasCreated, profile.comments, profile.messages, profile.reactions, profile.meetingsAttended) : 1);
  const weeks = profile ? [0, 1, 2, 3, 4].map((week) => profile.heatmap.slice(week * 7, week * 7 + 7)) : [];
  return (
    <div className="space-y-6">
      <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE }} className="media-card flex flex-wrap items-center justify-between gap-5 p-6 sm:p-7">
        <div className="flex items-center gap-4">
          <button type="button" onClick={onBack} aria-label="العودة إلى الفريق" className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_var(--border)] hover:bg-[var(--background)]">
            <Icon name="arrow" className="size-4 rotate-180" />
          </button>
          <PersonAvatar member={member} size="xl" className="!size-20 !text-3xl" />
          <div className="min-w-0">
            <h1 className="font-display !text-[32px] !font-medium">{member.name}</h1>
            <span className="text-[var(--soft)]">
              {memberDisplayLabel(member)} · {online ? (working ? `متصل الآن، يعمل على «${workingIdea?.title || working.label || "مهمة"}»` : "متصل الآن") : `آخر ظهور ${relativeTime(profile?.lastSeenAt || null)}`}
            </span>
            {won.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {won.slice(0, 3).map((award) => (
                  <span key={award.month} className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF4E3] py-1 ps-1.5 pe-3 text-[13px] font-medium text-[#8A4B0A]">
                    <Icon3D name="medal" className="size-6" />
                    {member.addressForm === "f" ? "الموظفة المثالية" : "الموظف المثالي"} لـ{new Intl.DateTimeFormat("ar-SA", { calendar: "gregory", month: "long", timeZone: "UTC" }).format(new Date(`${award.month}-15T12:00:00Z`))}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--background)] px-3.5 py-2 text-[13px] text-[var(--soft)]">
          <Icon3D name="sparkle" className="size-5" />
          لوحة الإنجاز تظهر لمدير النظام ومدير الإدارة فقط
        </span>
      </motion.div>
      {error && <p role="alert" className="text-[var(--danger)]">{error}</p>}
      {!profile && !error && <p role="status" className="text-[var(--soft)]">جارٍ تجهيز لوحة الإنجاز…</p>}
      {profile && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Kpi index={0} label="أعمال مُنجزة آخر ٣٠ يوماً" value={arNum(profile.delivered)} hint={profile.delivered ? "بصفته صاحب الفكرة أو المصمم" : "لا تسليمات بعد"} />
            <Kpi index={1} label="في موعدها" value={profile.onTimeRate === null ? "—" : `${arNum(profile.onTimeRate)}٪`} hint={profile.onTimeRate === 100 ? "لم تتأخر أي بطاقة" : "نسبة التسليم قبل الموعد أو فيه"} />
            <Kpi index={2} label="متوسط مدة الإنجاز" value={profile.averageCompletionDays === null ? "—" : `${arNum(profile.averageCompletionDays)} يوم`} hint="من بدء التنفيذ إلى التسليم" />
            <Kpi index={3} label="سرعة الاستجابة للإسناد" value={profile.responseHours === null ? "—" : minutesText(profile.responseHours * 60)} hint="من الإسناد إلى أول إجراء" />
            <Kpi index={4} label="المساهمات" value={arNum(profile.ideasCreated + profile.comments + profile.messages)} hint="أفكار وتعليقات ورسائل" />
            <Kpi index={5} label="معدل النشاط" value={`${arNum(profile.activityRate)}٪`} hint={`${arNum(profile.activeDays)} يوم عمل من ${arNum(profile.workDays)} · تركيز ${minutesText(profile.focusMinutes)}`} />
          </div>
          <div className="flex flex-wrap items-start gap-6">
            <section className="media-card min-w-0 flex-[999_1_520px] space-y-4 p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="!text-xl">نشاط آخر ٥ أسابيع</h2>
                <span className="text-[13px] text-[var(--soft)]">كلما غمق اللون زاد النشاط</span>
              </div>
              <div className="grid max-w-[34em] grid-cols-[auto_repeat(7,minmax(0,1fr))] items-center gap-1.5 text-xs text-[var(--soft)]">
                <span />
                {(weeks[0] || []).map((day) => <span key={day.day} className="text-center">{new Intl.DateTimeFormat("ar-SA", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day.day}T12:00:00Z`))}</span>)}
                {weeks.map((week, row) => (
                  <div key={row} className="contents">
                    <span className="pe-2 whitespace-nowrap">{new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${week[0]?.day}T12:00:00Z`))}</span>
                    {week.map((day, column) => (
                      <motion.span
                        key={day.day}
                        title={`${day.day}: ${minutesText(day.minutes)}`}
                        className="aspect-square rounded-md"
                        style={{ background: HEAT[heatLevel(day.minutes)] }}
                        initial={reduce ? false : { scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.35, ease: EASE, delay: 0.2 + (row * 7 + column) * 0.012 }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </section>
            <section className="media-card min-w-0 flex-[1_1_340px] space-y-3.5 p-6">
              <h2 className="!text-xl">تفاصيل المشاركة</h2>
              {[
                ["أفكار جديدة", profile.ideasCreated],
                ["تعليقات على الأعمال", profile.comments],
                ["رسائل في النقاشات", profile.messages],
                ["تفاعلات مع الزملاء", profile.reactions],
                ["حضور الاجتماعات", profile.meetingsAttended],
              ].map(([label, value], index) => (
                <div key={label as string}>
                  <div className="mb-1.5 flex justify-between text-sm"><span>{label}</span><b>{arNum(value as number)}</b></div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#EEF0F5]">
                    <motion.div className="h-full origin-right rounded-full bg-[var(--primary)]" style={{ width: `${((value as number) / maxContribution) * 100}%` }} initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, ease: EASE, delay: 0.2 + index * 0.08 }} />
                  </div>
                </div>
              ))}
            </section>
          </div>
          <div className="flex flex-wrap items-start gap-6">
            <section className="media-card min-w-0 flex-[999_1_520px] space-y-3 p-6">
              <h2 className="!text-xl">آخر الإنجازات</h2>
              {recent.length ? recent.map((idea) => (
                <div key={idea.id} className="flex items-start gap-3">
                  <Icon3D name="check" className="size-7" />
                  <div>
                    <b>{member.addressForm === "f" ? "سلّمت" : "سلّم"} «{idea.title}»</b>
                    <span className="block text-[13px] text-[var(--soft)]">{idea.dueDate && idea.deliveredAt && idea.deliveredAt < idea.dueDate ? "قبل موعدها" : idea.dueDate && idea.deliveredAt && idea.deliveredAt > idea.dueDate ? "بعد موعدها" : "في موعدها"} · {relativeTime(`${idea.deliveredAt}T12:00:00+03:00`)}</span>
                  </div>
                </div>
              )) : <p className="text-sm text-[var(--soft)]">لا توجد تسليمات بعد.</p>}
            </section>
            {profile.honor && (
              <section className="media-card min-w-0 flex-[1_1_340px] space-y-3 p-6">
                <h2 className="!text-xl">رصيد لوحة الشرف هذا الشهر</h2>
                <strong className="font-display text-5xl font-medium">{arNum(profile.honor.score)} <span className="text-base text-[var(--soft)]">من ١٠٠</span></strong>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span>الإنجاز <b>{arNum(profile.honor.breakdown.completion)} / {arNum(HONOR_WEIGHTS.completion)}</b></span>
                  <span>الالتزام بالمواعيد <b>{arNum(profile.honor.breakdown.onTime)} / {arNum(HONOR_WEIGHTS.onTime)}</b></span>
                  <span>سرعة الاستجابة <b>{arNum(profile.honor.breakdown.response)} / {arNum(HONOR_WEIGHTS.response)}</b></span>
                  <span>المشاركة والحضور <b>{arNum(profile.honor.breakdown.participation)} / {arNum(HONOR_WEIGHTS.participation)}</b></span>
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function People({ data, currentUser, selectedId, onSelect }: { data: MediaData; currentUser: TeamMember; selectedId?: string; onSelect: (id?: string) => void }) {
  const canOpen = canSeeProfiles(currentUser);
  const members = data.members.filter((member) => member.active && member.role !== "superadmin");
  const selected = canOpen ? members.find((member) => member.id === selectedId) : undefined;
  if (selected) return <Profile key={selected.id} member={selected} data={data} onBack={() => onSelect(undefined)} />;
  return (
    <div className="space-y-5">
      {canOpen && (
        <p className="flex items-center gap-2 text-sm text-[var(--soft)]">
          <Icon3D name="chart" className="size-6" />
          اختر أي عضو لعرض لوحة إنجازه. تظهر هذه اللوحات لمدير النظام ومدير الإدارة فقط.
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {members.map((member) => (
          <PersonCard key={member.id} member={member} data={data} canOpen={canOpen} onOpen={() => onSelect(member.id)} />
        ))}
      </div>
    </div>
  );
}
