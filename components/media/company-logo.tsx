import Asset from "@/components/_ui/asset";
import { companyBrand } from "@/lib/company-branding";
import { cn } from "@/lib/utils";
import { ALL_COMPANIES_LABEL, ideaCompanyIds, ideaCompanyLabel, type Company, type Idea } from "@/data/media";

export function CompanyLogo({
  companyId,
  companyName,
  decorative = false,
  className,
}: {
  companyId: string;
  companyName?: string;
  decorative?: boolean;
  className?: string;
}) {
  const brand = companyBrand(companyId);
  if (!brand) return null;
  return (
    <span
      className={cn(
        "inline-flex h-10 w-28 shrink-0 items-center justify-center rounded-lg bg-white p-1.5",
        className,
      )}
    >
      <Asset
        type="image"
        src={brand.logoUrl}
        width={brand.width}
        height={brand.height}
        fit="contain"
        sizes="160px"
        alt={decorative ? "" : `شعار ${companyName || brand.name}`}
        className="max-h-full"
      />
    </span>
  );
}

export function IdeaCompanies({
  idea,
  companies,
  className,
  logoClassName = "h-8 w-24 p-1",
  showNames = true,
}: {
  idea: Pick<Idea, "companyId" | "companyIds" | "allCompanies">;
  companies: Company[];
  className?: string;
  logoClassName?: string;
  showNames?: boolean;
}) {
  const ids = ideaCompanyIds(idea);
  const extra = idea.allCompanies ? 0 : ids.length - 1;
  return (
    <span className={cn("flex flex-wrap items-center gap-2", className)}>
      {idea.allCompanies ? (
        <span className="media-badge media-badge-accent">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 drop-shadow-[0_2px_2px_rgba(32,39,60,.25)]">
            <defs>
              <linearGradient id="all-companies-globe" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#8F80F0" />
                <stop offset="1" stopColor="#4B3CC0" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" fill="url(#all-companies-globe)" />
            <path d="M2.5 12h19M12 2.2c3 3 3 16.6 0 19.6M12 2.2c-3 3-3 16.6 0 19.6" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="1.3" />
          </svg>
          {ALL_COMPANIES_LABEL}
        </span>
      ) : (
        <>
          <CompanyLogo companyId={idea.companyId} decorative className={logoClassName} />
          {extra > 0 && (
            <span className="media-badge media-badge-accent tabular-nums" aria-hidden="true">
              +{extra.toLocaleString("ar-SA")}
            </span>
          )}
        </>
      )}
      {showNames && <span className="min-w-0">{ideaCompanyLabel(idea, companies)}</span>}
    </span>
  );
}
