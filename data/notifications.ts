export type NotificationKind =
  | "mention"
  | "stage"
  | "alert"
  | "update"
  | "invite";

export type Notification = {
  id: string;
  kind: NotificationKind;
  actor?: string;
  companyId: string;
  message: string;
  quote?: string;
  time: string;
  unread: boolean;
};

export const NOTIFICATIONS: Notification[] = [
  {
    id: "n1",
    kind: "mention",
    actor: "خالد المنصور (Khaled)",
    companyId: "tech-solutions",
    message: "mentioned you on Tech Solutions Co.",
    quote:
      "تم رفع فكرة حملة التطبيق الجديد إلى المستودع وبانتظار اعتماد المدير لجدولة الإنتاج والتصوير.",
    time: "2m ago",
    unread: true,
  },
  {
    id: "n2",
    kind: "stage",
    actor: "سارة القحطاني (Sarah)",
    companyId: "hr-dept",
    message: "moved HR Dept request to Final Video Editing",
    time: "18m ago",
    unread: true,
  },
  {
    id: "n3",
    kind: "alert",
    companyId: "logistics-co",
    message: "Schedule updated for Logistics Services Co.",
    time: "1h ago",
    unread: true,
  },
  {
    id: "n4",
    kind: "update",
    actor: "نورة الشهري (Noura)",
    companyId: "marketing-pr",
    message: "Manager approved National Day campaign idea for Marketing Dept",
    time: "3h ago",
    unread: false,
  },
  {
    id: "n5",
    kind: "update",
    actor: "فيصل العتيبي (Faisal)",
    companyId: "retail-ecommerce",
    message: "Delivered promotional video for Retail & E-commerce Co.",
    time: "Yesterday",
    unread: false,
  },
  {
    id: "n6",
    kind: "alert",
    companyId: "real-estate-co",
    message: "Production budget for Real Estate Co. increased to 520,000 SAR",
    time: "2d ago",
    unread: false,
  },
  {
    id: "n7",
    kind: "invite",
    actor: "مريم الدوسري (Mariam)",
    companyId: "cx-dept",
    message: "added you to the Customer Experience campaign team",
    time: "3d ago",
    unread: false,
  },
];

