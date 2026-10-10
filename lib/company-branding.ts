export interface CompanyBrand {
  logoUrl: string;
  name: string;
  width: number;
  height: number;
}

/** Original supplied assets, keyed by durable company IDs rather than display names. */
export const COMPANY_BRANDS: Readonly<Record<string, CompanyBrand>> = {
  mawaredcom: {
    logoUrl: "/assets/media/companies/mawaridcom.svg",
    name: "مواردكم لحلول الأعمال",
    width: 365,
    height: 106,
  },
  hayyen: {
    logoUrl: "/assets/media/companies/hayyen.svg",
    name: "شركة هيّن للموارد البشرية",
    width: 876,
    height: 302,
  },
  secureline: {
    logoUrl: "/assets/media/companies/secure-line.svg",
    name: "شركة سيكيور لاين للتأمين",
    width: 391,
    height: 108,
  },
};

export function companyBrand(companyId: string): CompanyBrand | undefined {
  return Object.hasOwn(COMPANY_BRANDS, companyId)
    ? COMPANY_BRANDS[companyId]
    : undefined;
}
