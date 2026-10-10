"use client";

import type { MouseEvent } from "react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import Tag from "@/components/_ui/tag";
import { TableCell, TableRow } from "@/components/_ui/table";
import SegmentBar from "@/components/_common/segment-bar";
import Sparkline from "@/components/_common/sparkline";
import { TAG_TONES, ownerByName, type Company } from "@/data/companies";
import { formatDate, formatMoney, splitTags } from "@/lib/companies";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";
import {
  TABLE_CELL_CLASS,
  TABLE_ROW_CLASS,
  columnClass,
  type TableColumnKey,
} from "./table-columns";
import CalendarIcon from "@/public/assets/images/_common/calendar.svg";
import DotsIcon from "@/public/assets/images/companies/table/dots-horizontal.svg";

type CompanyRowProps = {
  company: Company;
  selected: boolean;
  active: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onOpenOwner: () => void;
};

function cellClass(key: TableColumnKey) {
  return cn(TABLE_CELL_CLASS, columnClass(key));
}

function stop(event: MouseEvent) {
  event.stopPropagation();
}

export default function CompanyRow({
  company,
  selected,
  active,
  onToggle,
  onOpen,
  onOpenOwner,
}: CompanyRowProps) {
  const owner = ownerByName(company.owner);
  const { visible, hidden } = splitTags(company.tags);
  const { t, translateTag, translateInteraction, formatDateLocale } =
    useTranslation();

  return (
    <TableRow
      role="row"
      onClick={onOpen}
      data-active={active || selected}
      className={cn(
        TABLE_ROW_CLASS,
        "hover:bg-card/60 data-[active=true]:border-card data-[active=true]:bg-card cursor-pointer",
      )}
    >
      <TableCell role="cell" className={cellClass("name")}>
        <span className="flex items-center gap-5">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            onClick={stop}
            aria-label={t.table.selectCompany.replace("{name}", company.name)}
          />
          {company.name}
        </span>
      </TableCell>
      <TableCell role="cell" className={cellClass("segment")}>
        <span className="flex items-center gap-[3px]">
          {visible.map((tag) => (
            <Tag key={tag} tone={TAG_TONES[tag]}>
              {translateTag(tag)}
            </Tag>
          ))}
          {hidden > 0 && (
            <Tag tone="neutral" size="sm">
              +{hidden}
            </Tag>
          )}
        </span>
      </TableCell>
      <TableCell role="cell" className={cellClass("owner")} onClick={stop}>
        <Button
          variant="ghost"
          size="none"
          onClick={onOpenOwner}
          aria-label={t.table.openOwnerProfile.replace("{name}", owner.name)}
          className="text-foreground -mx-1.5 gap-1.5 px-1.5 py-1 font-normal"
        >
          <Avatar src={owner.avatar} alt="" />
          {owner.name}
        </Button>
      </TableCell>
      <TableCell role="cell" className={cellClass("openDeals")}>
        {company.openDeals}
      </TableCell>
      <TableCell role="cell" className={cellClass("pipelineValue")}>
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground">$</span>
          {formatMoney(company.pipelineValue)}
        </span>
      </TableCell>
      <TableCell role="cell" className={cellClass("winProbability")}>
        <span className="flex items-center gap-2">
          <SegmentBar percent={company.winProbability} className="w-[74px]" />
          <span className="w-[4ch] text-end">{company.winProbability}%</span>
        </span>
      </TableCell>
      <TableCell role="cell" className={cellClass("trend")}>
        <Sparkline values={company.trend} />
      </TableCell>
      <TableCell role="cell" className={cellClass("lastInteraction")}>
        <span className="flex items-center gap-1">
          <CalendarIcon
            aria-hidden
            className="text-foreground size-3.5 shrink-0"
          />
          <span className="tabular-nums">
            {formatDateLocale(company.lastInteraction.date)}
          </span>
          <span aria-hidden className="mx-[3px] h-2 w-px bg-white/15" />
          {translateInteraction(company.lastInteraction.label)}
        </span>
      </TableCell>
      <TableCell role="cell" className={cellClass("action")} onClick={stop}>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("text-foreground", active && "bg-white/6")}
          aria-label={t.table.openCompanyDetails.replace("{name}", company.name)}
          onClick={onOpen}
        >
          <DotsIcon aria-hidden className="size-3" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
