"use client";

import type { ComponentType, SVGProps } from "react";
import Sparkline from "@/components/_common/sparkline";
import type { Company } from "@/data/companies";
import { companyActivity } from "@/lib/companies";
import { useTranslation } from "@/hooks/use-translation";
import CursorClickIcon from "@/public/assets/images/companies/detail/cursor-click.svg";
import MailIcon from "@/public/assets/images/companies/detail/mail-03.svg";
import CalendarIcon from "@/public/assets/images/companies/detail/calendar.svg";
import PhoneCallIcon from "@/public/assets/images/companies/detail/phone-call.svg";

type ActivityTrendProps = {
  company: Company;
};

type Stat = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: number;
};

export default function ActivityTrend({ company }: ActivityTrendProps) {
  const activity = companyActivity(company);
  const { t } = useTranslation();

  const stats: Stat[] = [
    { icon: CursorClickIcon, label: t.companyDetail.totalTouches, value: activity.touches },
    { icon: MailIcon, label: t.companyDetail.emails, value: activity.emails },
    { icon: CalendarIcon, label: t.companyDetail.meetings, value: activity.meetings },
    { icon: PhoneCallIcon, label: t.companyDetail.callsAndNotes, value: activity.calls },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-[3px]">
          <span className="font-display block text-[24px] leading-none font-medium">
            {activity.total}
          </span>
          <Sparkline values={company.trend} className="h-[22px]" />
        </div>
        <span className="caption-style block text-soft">
          {t.companyDetail.trendNote}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-3 rounded-lg border border-line-strong p-[11px]"
          >
            <span className="caption-style flex items-center gap-1 text-soft">
              <stat.icon aria-hidden className="size-3 shrink-0" />
              {stat.label}
            </span>
            <span className="lead-style block">{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
