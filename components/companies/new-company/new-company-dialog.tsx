"use client";

import { useRef, useState, type FormEvent } from "react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/_ui/select";
import { Slider } from "@/components/_ui/slider";
import SegmentBar from "@/components/_common/segment-bar";
import FormSection from "./form-section";
import LogoUpload from "./logo-upload";
import {
  DEFAULT_TREND,
  INTERACTION_TYPES,
  OWNERS,
  SEGMENTS,
  STAGES,
  type Company,
  type Segment,
  type Stage,
} from "@/data/companies";
import { TODAY, daysSince } from "@/lib/companies";
import { slugify } from "@/lib/utils";
import { useCompaniesStore } from "@/stores/companies-store";
import { useTranslation } from "@/hooks/use-translation";
import PlusIcon from "@/public/assets/images/_common/plus.svg";

type FormState = {
  logo: string | null;
  name: string;
  segment: Segment;
  stage: Stage;
  owner: string;
  pipelineValue: string;
  openDeals: string;
  winProbability: number;
  interactionDate: string;
  interactionType: string;
};

const EMPTY_FORM: FormState = {
  logo: null,
  name: "",
  segment: SEGMENTS[0],
  stage: STAGES[0],
  owner: OWNERS[0].name,
  pipelineValue: "",
  openDeals: "1",
  winProbability: 50,
  interactionDate: TODAY,
  interactionType: INTERACTION_TYPES[0],
};

export default function NewCompanyDialog() {
  const open = useCompaniesStore((state) => state.newCompanyOpen);
  const setOpen = useCompaniesStore((state) => state.setNewCompanyOpen);
  const addCompany = useCompaniesStore((state) => state.addCompany);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const { t, translateTag, translateInteraction } = useTranslation();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setNameError(t.newCompany.nameRequired);
      nameRef.current?.focus();
      return;
    }

    const company: Company = {
      id: `${slugify(name)}-${Date.now()}`,
      name,
      logo: form.logo ?? undefined,
      tags: [form.segment, form.stage],
      owner: form.owner,
      openDeals: Math.max(0, Math.round(Number(form.openDeals) || 0)),
      pipelineValue: Math.max(0, Math.round(Number(form.pipelineValue) || 0)),
      winProbability: form.winProbability,
      trend: DEFAULT_TREND,
      lastInteraction: {
        date: form.interactionDate || TODAY,
        label: form.interactionType,
      },
      activityDays: daysSince(form.interactionDate || TODAY),
    };

    addCompany(company);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-[560px]"
        onCloseAutoFocus={() => {
          setForm(EMPTY_FORM);
          setNameError(null);
        }}
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col">
          <DialogHeader>
            <DialogTitle>{t.newCompany.title}</DialogTitle>
            <DialogDescription>
              {t.newCompany.description}
            </DialogDescription>
          </DialogHeader>

          <FormSection title={t.newCompany.sectionCompany}>
            <LogoUpload
              value={form.logo}
              companyName={form.name}
              onChange={(logo) => update("logo", logo)}
            />

            <Field
              label={t.newCompany.companyName}
              htmlFor="company-name"
              required
              error={nameError ?? undefined}
            >
              <Input
                ref={nameRef}
                id="company-name"
                value={form.name}
                onChange={(event) => {
                  update("name", event.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder={t.newCompany.namePlaceholder}
                autoComplete="off"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "company-name-error" : undefined}
                className="aria-invalid:border-danger"
                autoFocus
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.newCompany.segment} htmlFor="company-segment">
                <Select
                  value={form.segment}
                  onValueChange={(value) => update("segment", value as Segment)}
                >
                  <SelectTrigger id="company-segment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEGMENTS.map((segment) => (
                      <SelectItem key={segment} value={segment}>
                        {translateTag(segment)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t.newCompany.stage} htmlFor="company-stage">
                <Select
                  value={form.stage}
                  onValueChange={(value) => update("stage", value as Stage)}
                >
                  <SelectTrigger id="company-stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {translateTag(stage)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FormSection>

          <FormSection title={t.newCompany.sectionDeal}>
            <Field label={t.newCompany.accountOwner} htmlFor="company-owner">
              <Select
                value={form.owner}
                onValueChange={(value) => update("owner", value)}
              >
                <SelectTrigger id="company-owner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OWNERS.map((owner) => (
                    <SelectItem key={owner.name} value={owner.name}>
                      <span className="flex items-center gap-2">
                        <Avatar src={owner.avatar} alt="" />
                        {owner.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.newCompany.pipelineValue} htmlFor="company-pipeline">
                <div className="relative">
                  <span
                    aria-hidden
                    className="text-subtle pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-[14px] leading-none"
                  >
                    $
                  </span>
                  <Input
                    id="company-pipeline"
                    type="number"
                    min={0}
                    step={1000}
                    inputMode="numeric"
                    value={form.pipelineValue}
                    onChange={(event) =>
                      update("pipelineValue", event.target.value)
                    }
                    placeholder="250000"
                    className="ps-6 tabular-nums"
                  />
                </div>
              </Field>
              <Field label={t.newCompany.openDeals} htmlFor="company-deals">
                <Input
                  id="company-deals"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.openDeals}
                  onChange={(event) => update("openDeals", event.target.value)}
                  className="tabular-nums"
                />
              </Field>
            </div>

            <Field
              label={t.newCompany.winProbability}
              htmlFor="company-win"
              trailing={
                <span className="caption-style text-foreground tabular-nums">
                  {form.winProbability}%
                </span>
              }
            >
              <div className="flex flex-col gap-3">
                <Slider
                  id="company-win"
                  aria-label={t.newCompany.winProbability}
                  min={0}
                  max={100}
                  step={1}
                  value={[form.winProbability]}
                  onValueChange={([value]) => update("winProbability", value)}
                />
                <SegmentBar
                  percent={form.winProbability}
                  segments={40}
                  className="h-3 w-full border border-white/4 px-px"
                  segmentClassName="h-2"
                  trackClassName="bg-white/8"
                />
              </div>
            </Field>
          </FormSection>

          <FormSection title={t.newCompany.sectionInteraction}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.newCompany.date} htmlFor="company-interaction-date">
                <Input
                  id="company-interaction-date"
                  type="date"
                  max={TODAY}
                  value={form.interactionDate}
                  onChange={(event) =>
                    update("interactionDate", event.target.value)
                  }
                  className="tabular-nums"
                />
              </Field>
              <Field label={t.newCompany.type} htmlFor="company-interaction-type">
                <Select
                  value={form.interactionType}
                  onValueChange={(value) => update("interactionType", value)}
                >
                  <SelectTrigger id="company-interaction-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERACTION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {translateInteraction(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FormSection>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="subtle" size="sm">
                {t.common.cancel}
              </Button>
            </DialogClose>
            <Button variant="primary" size="sm" type="submit">
              <PlusIcon aria-hidden className="size-3" />
              {t.newCompany.title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
