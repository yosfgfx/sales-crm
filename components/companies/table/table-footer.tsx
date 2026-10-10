"use client";

import PlusIcon from "@/public/assets/images/_common/plus.svg";
import { useTranslation } from "@/hooks/use-translation";

type TableFooterProps = {
  count: number;
};

export default function TableFooter({ count }: TableFooterProps) {
  const { t } = useTranslation();

  const calculations = [
    t.table.sumOfPipeline,
    t.table.avgWinProbability,
    t.table.addCalculation,
  ];

  return (
    <div className="caption-style grid shrink-0 grid-cols-2 gap-px border-b border-border bg-background p-px sm:grid-cols-4">
      <div className="flex items-center gap-2 p-3 outline-1 outline-border">
        <span className="text-foreground">{count}</span>
        <span className="text-muted-foreground">{t.table.companiesInView}</span>
      </div>
      {calculations.map((label) => (
        <div
          key={label}
          className="flex items-center gap-2 p-3 text-muted-foreground outline-1 outline-border"
        >
          <PlusIcon aria-hidden className="size-3 text-muted-foreground" />
          {label}
        </div>
      ))}
    </div>
  );
}
