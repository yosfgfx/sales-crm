export const SEGMENTS = ["Enterprise", "Mid-Market", "SMB", "Strategic"] as const;

export const STAGES = [
  "New Logo",
  "Upsell",
  "Expansion",
  "Renewal",
  "Pilot",
  "Co-Sell",
  "Land & Expand",
] as const;

export type Segment = (typeof SEGMENTS)[number];
export type Stage = (typeof STAGES)[number];
export type Tag = Segment | Stage;

export type TagTone =
  | "blue"
  | "purple"
  | "green"
  | "moss"
  | "red"
  | "orange"
  | "amber"
  | "teal"
  | "yellow"
  | "neutral";

export const TAG_TONES: Record<Tag, TagTone> = {
  Enterprise: "blue",
  "Mid-Market": "moss",
  SMB: "yellow",
  Strategic: "red",
  "New Logo": "green",
  Upsell: "purple",
  Expansion: "green",
  Renewal: "green",
  Pilot: "orange",
  "Co-Sell": "amber",
  "Land & Expand": "teal",
};

export type Owner = {
  name: string;
  avatar: string;
  email: string;
  phone: string;
  role: string;
  website?: string;
  whatsapp?: string;
};

const AVATARS = Array.from(
  { length: 10 },
  (_, i) => `/assets/images/_common/avatars/avatar-${i + 1}.png`,
);

const OWNER_NAMES = [
  "سارة القحطاني (Sarah)",
  "فيصل العتيبي (Faisal)",
  "مريم الدوسري (Mariam)",
  "خالد المنصور (Khaled)",
  "نورة الشهري (Noura)",
  "محمد الشمري (Mohammed)",
  "ريم الغامدي (Reem)",
  "عبدالله السالم (Abdullah)",
  "هند المطيري (Hind)",
  "طارق الزهراني (Tariq)",
  "شهد الحربي (Shahad)",
  "سلطان العنزي (Sultan)",
  "دلال العمري (Dalal)",
  "عمر باوزير (Omar)",
  "لمى المالكي (Lama)",
  "ياسر الخالدي (Yasser)",
  "منى السبيعي (Mona)",
  "فهد الرويلي (Fahad)",
];

const ROLES = [
  "مدير حملات إبداعية (Campaign Lead)",
  "كاتب محتوى وسيناريو (Scriptwriter)",
  "مخرج فني ومصمم (Art Director)",
  "مونتير ومشرف إنتاج (Video Producer)",
  "منسق إنتاج ميديا (Media Coordinator)",
  "أخصائي تقويم المحتوى (Content Planner)",
];

export const OWNERS: Owner[] = OWNER_NAMES.map((name, i) => ({
  name,
  avatar: AVATARS[i % AVATARS.length],
  email: `${name.split(" ")[0].toLowerCase()}@media.company.com`,
  phone: `+966 5${String(10000000 + i * 234567).slice(0, 8)}`,
  role: ROLES[i % ROLES.length],
}));

export const CURRENT_USER: Owner = {
  name: "يوسف حميد",
  avatar: "/assets/images/_common/avatars/yousef.png",
  email: "info@yosfgfx.com",
  phone: "0553159341",
  whatsapp: "0553159341",
  website: "yosfgfx.com",
  role: "مطور ومصمم النظام (Lead Developer & Creative Director)",
};

export function ownerByName(name: string): Owner {
  return OWNERS.find((owner) => owner.name === name) ?? OWNERS[0];
}

export function profileByName(name: string): Owner {
  return name === CURRENT_USER.name ? CURRENT_USER : ownerByName(name);
}

export type Company = {
  id: string;
  name: string;
  tags: Tag[];
  owner: string;
  openDeals: number;
  pipelineValue: number;
  winProbability: number;
  trend: number[];
  lastInteraction: { date: string; label: string };
  activityDays: number;
  logo?: string;
};

export const TREND_PATTERN = [
  false,
  true,
  true,
  false,
  true,
  true,
  false,
  true,
  false,
  true,
  false,
  true,
  true,
  false,
];

export const DEFAULT_TREND = [4, 4, 5, 5, 2, 7, 11, 7, 5, 7, 5, 3, 7, 14];

const TREND_A = [4, 4, 10, 3, 2, 4, 7, 4, 11, 4, 11, 7, 4, 14];
const TREND_B = [4, 4, 5, 5, 2, 7, 11, 7, 5, 7, 5, 3, 7, 14];
const TREND_C = [4, 4, 10, 5, 2, 7, 11, 7, 11, 7, 11, 7, 7, 14];
const TREND_D = [4, 4, 5, 12, 5, 7, 11, 3, 11, 3, 11, 3, 7, 14];

const COMPANY_RECORDS: Omit<Company, "logo">[] = [
  {
    id: "tech-solutions",
    name: "شركة حلول التقنية والابتكار (تابعة)",
    tags: ["Enterprise", "Co-Sell", "Expansion"],
    owner: OWNER_NAMES[0],
    openDeals: 7,
    pipelineValue: 420000,
    winProbability: 70,
    trend: TREND_A,
    lastInteraction: { date: "2026-02-21", label: "Discovery" },
    activityDays: 88,
  },
  {
    id: "hr-dept",
    name: "إدارة الموارد البشرية والتواصل الداخلي",
    tags: ["Mid-Market", "New Logo", "Pilot"],
    owner: OWNER_NAMES[1],
    openDeals: 4,
    pipelineValue: 180000,
    winProbability: 55,
    trend: TREND_B,
    lastInteraction: { date: "2026-02-22", label: "Demo" },
    activityDays: 87,
  },
  {
    id: "logistics-co",
    name: "شركة الخدمات اللوجستية والشحن (تابعة)",
    tags: ["Enterprise", "Expansion", "Renewal"],
    owner: OWNER_NAMES[2],
    openDeals: 5,
    pipelineValue: 310000,
    winProbability: 68,
    trend: TREND_C,
    lastInteraction: { date: "2026-03-12", label: "Pricing" },
    activityDays: 84,
  },
  {
    id: "marketing-pr",
    name: "إدارة التسويق والعلاقات المؤسسية",
    tags: ["Mid-Market", "Land & Expand", "Co-Sell"],
    owner: OWNER_NAMES[3],
    openDeals: 6,
    pipelineValue: 540000,
    winProbability: 85,
    trend: TREND_D,
    lastInteraction: { date: "2026-03-17", label: "Expansion" },
    activityDays: 81,
  },
  {
    id: "real-estate-co",
    name: "شركة التطوير والاستثمار العقاري (شقيقة)",
    tags: ["SMB", "Strategic", "Expansion"],
    owner: OWNER_NAMES[4],
    openDeals: 8,
    pipelineValue: 620000,
    winProbability: 82,
    trend: TREND_C,
    lastInteraction: { date: "2026-03-12", label: "Pilot" },
    activityDays: 83,
  },
  {
    id: "cx-dept",
    name: "قطاع تجربة العميل والعمليات",
    tags: ["Mid-Market", "Upsell", "Pilot"],
    owner: OWNER_NAMES[5],
    openDeals: 3,
    pipelineValue: 140000,
    winProbability: 60,
    trend: TREND_C,
    lastInteraction: { date: "2026-03-15", label: "Discovery" },
    activityDays: 79,
  },
  {
    id: "retail-ecommerce",
    name: "شركة التجزئة والتجارة الإلكترونية (تابعة)",
    tags: ["Enterprise", "Expansion", "Co-Sell"],
    owner: OWNER_NAMES[6],
    openDeals: 5,
    pipelineValue: 390000,
    winProbability: 75,
    trend: TREND_B,
    lastInteraction: { date: "2026-03-18", label: "Pricing" },
    activityDays: 78,
  },
  {
    id: "sustainability-csr",
    name: "إدارة المسؤولية المجتمعية والاستدامة",
    tags: ["Mid-Market", "New Logo", "Expansion"],
    owner: OWNER_NAMES[7],
    openDeals: 3,
    pipelineValue: 120000,
    winProbability: 65,
    trend: TREND_C,
    lastInteraction: { date: "2026-03-28", label: "Product" },
    activityDays: 74,
  },
  {
    id: "hospitality-tourism",
    name: "شركة الضيافة والسياحة الترفيهية (تابعة)",
    tags: ["Enterprise", "Strategic", "Land & Expand"],
    owner: OWNER_NAMES[8],
    openDeals: 4,
    pipelineValue: 480000,
    winProbability: 80,
    trend: TREND_C,
    lastInteraction: { date: "2026-06-14", label: "Pricing" },
    activityDays: 58,
  },
  {
    id: "executive-office",
    name: "المكتب التنفيذي والإدارة العامة",
    tags: ["Strategic", "Renewal", "Pilot"],
    owner: OWNER_NAMES[9],
    openDeals: 6,
    pipelineValue: 350000,
    winProbability: 90,
    trend: TREND_B,
    lastInteraction: { date: "2026-06-07", label: "Exec" },
    activityDays: 62,
  },
  {
    id: "energy-industry",
    name: "شركة الطاقة والصناعات الحديثة (تابعة)",
    tags: ["Enterprise", "Expansion", "Renewal"],
    owner: OWNER_NAMES[10],
    openDeals: 4,
    pipelineValue: 410000,
    winProbability: 72,
    trend: TREND_C,
    lastInteraction: { date: "2026-06-18", label: "Pilot" },
    activityDays: 55,
  },
  {
    id: "events-dept",
    name: "إدارة الفعاليات والمؤتمرات الكبرى",
    tags: ["Mid-Market", "Co-Sell", "Land & Expand"],
    owner: OWNER_NAMES[11],
    openDeals: 5,
    pipelineValue: 330000,
    winProbability: 88,
    trend: TREND_C,
    lastInteraction: { date: "2026-07-01", label: "Expansion" },
    activityDays: 48,
  },
  {
    id: "fintech-payments",
    name: "شركة الدفع الرقمي والحلول المالية (تابعة)",
    tags: ["Enterprise", "New Logo", "Expansion"],
    owner: OWNER_NAMES[12],
    openDeals: 6,
    pipelineValue: 290000,
    winProbability: 64,
    trend: TREND_C,
    lastInteraction: { date: "2026-07-18", label: "Renewal" },
    activityDays: 40,
  },
  {
    id: "innovation-digital",
    name: "إدارة الابتكار والتحول الرقمي",
    tags: ["Mid-Market", "Pilot", "Upsell"],
    owner: OWNER_NAMES[13],
    openDeals: 4,
    pipelineValue: 210000,
    winProbability: 58,
    trend: TREND_D,
    lastInteraction: { date: "2026-08-08", label: "Demo" },
    activityDays: 27,
  },
  {
    id: "media-production",
    name: "شركة الإنتاج الصوتي والمرئي (شقيقة)",
    tags: ["SMB", "Expansion", "Co-Sell"],
    owner: OWNER_NAMES[14],
    openDeals: 5,
    pipelineValue: 360000,
    winProbability: 79,
    trend: TREND_C,
    lastInteraction: { date: "2026-08-12", label: "Discovery" },
    activityDays: 24,
  },
  {
    id: "procurement-dept",
    name: "إدارة المشتريات وسلاسل الإمداد",
    tags: ["Mid-Market", "Renewal", "Pilot"],
    owner: OWNER_NAMES[15],
    openDeals: 2,
    pipelineValue: 150000,
    winProbability: 50,
    trend: TREND_C,
    lastInteraction: { date: "2026-09-09", label: "Product" },
    activityDays: 8,
  },
  {
    id: "training-academy",
    name: "أكاديمية التدريب والتطوير المؤسسي",
    tags: ["Mid-Market", "Upsell", "Co-Sell"],
    owner: OWNER_NAMES[16],
    openDeals: 3,
    pipelineValue: 175000,
    winProbability: 62,
    trend: TREND_C,
    lastInteraction: { date: "2026-09-11", label: "Pricing" },
    activityDays: 6,
  },
  {
    id: "legal-compliance",
    name: "إدارة الشؤون القانونية والامتثال",
    tags: ["Mid-Market", "Renewal"],
    owner: OWNER_NAMES[17],
    openDeals: 2,
    pipelineValue: 95000,
    winProbability: 70,
    trend: TREND_C,
    lastInteraction: { date: "2026-09-18", label: "Legal" },
    activityDays: 2,
  },
];

export const COMPANIES: Company[] = COMPANY_RECORDS.map((company) => ({
  ...company,
}));

export const SORT_OPTIONS = [
  { value: "pipelineValue", label: "Pipeline Value" },
  { value: "winProbability", label: "Win Probability" },
  { value: "openDeals", label: "Open Deals" },
  { value: "lastInteraction", label: "Last Interaction" },
  { value: "name", label: "Company Name" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

export const INTERACTION_TYPES = [
  "Discovery",
  "Demo",
  "Pricing",
  "Security",
  "Legal",
  "Product",
  "Pilot",
  "Exec",
  "QBR Call",
  "Partner",
  "Renewal",
  "Expansion",
] as const;

export const ACTIVITY_WINDOWS = [7, 30, 60, 90] as const;

export type ActivityWindow = (typeof ACTIVITY_WINDOWS)[number];

export const TREND_WINDOWS = ["Last 7 Days", "Last 30 Days", "Last 90 Days"];

export type ScoreCard = {
  title: string;
  description: string;
  reviewer: string;
  reviewerAvatar: string;
  updated: string;
  verdict: string;
  stars: number;
};

export const SCORE_CARDS: ScoreCard[] = [
  {
    title: "الجاهزية الإبداعية والإحاطة (Creative Brief)",
    description:
      "يقيس مدى وضوح موجز الحملة، الرسائل المستهدفة، وتوافق الفكرة مع هوية الجهة.",
    reviewer: "سارة القحطاني",
    reviewerAvatar: "/assets/images/_common/avatars/detail-2.png",
    updated: "محدث منذ ساعتين",
    verdict: "فكرة معتمدة ومكتملة",
    stars: 5,
  },
  {
    title: "الجاهزية الفنية والإنتاجية (Production Readiness)",
    description:
      "يقيس توفر أصول التصاميم، طاقم التصوير والمونتاج، وموافقة الجدول الزمني للتسليم.",
    reviewer: "فيصل العتيبي",
    reviewerAvatar: "/assets/images/_common/avatars/detail-3.png",
    updated: "محدث منذ 4 ساعات",
    verdict: "جاهز للتصوير والمونتاج",
    stars: 4,
  },
  {
    title: "التوافق مع أهداف وميزانية القطاع (Strategic Fit)",
    description:
      "يقيس تناسب تكاليف الإنتاج مع الميزانية المعتمدة للجهة ومدى تغطية المنصات المطلوبة.",
    reviewer: "مريم الدوسري",
    reviewerAvatar: "/assets/images/_common/avatars/detail-1.png",
    updated: "محدث منذ يوم",
    verdict: "ميزانية مستوفية",
    stars: 5,
  },
];

