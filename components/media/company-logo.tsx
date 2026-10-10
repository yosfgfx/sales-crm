import Asset from "@/components/_ui/asset";
import { companyBrand } from "@/lib/company-branding";
import { cn } from "@/lib/utils";

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
