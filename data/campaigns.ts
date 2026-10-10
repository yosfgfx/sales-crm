export type CampaignType = "advertising" | "design" | "coverage";

export type CampaignStage =
  | "idea"
  | "quotations"
  | "manager_review"
  | "in_production"
  | "media_coverage"
  | "completed";

export type ManagerApprovalStatus =
  | "pending"
  | "approved"
  | "conditional"
  | "rejected";

export type CampaignQuotation = {
  id: string;
  vendorName: string;
  serviceScope: string;
  amount: number;
  durationDays: number;
  isRecommended: boolean;
  status: "approved" | "pending" | "rejected";
  quoteDate: string;
  fileName: string;
  notes?: string;
};

export type BudgetItemCategory =
  | "video"
  | "design"
  | "crew_equipment"
  | "media_ads"
  | "licensing";

export type BudgetItem = {
  id: string;
  category: BudgetItemCategory;
  title: string;
  allocated: number;
  spent: number;
  notes?: string;
};

export type PaymentDirective = {
  directiveNumber: string;
  approvedAmount: number;
  authorizedDate: string;
  paymentMethod: string;
  accountantNotes: string;
  voucherFile?: string;
};

export type ManagerApproval = {
  status: ManagerApprovalStatus;
  managerName: string;
  managerRole: string;
  decisionDate: string;
  feedback: string;
  signature?: string;
  paymentDirective?: PaymentDirective;
};

export type AttachmentCategory =
  | "brief"
  | "quotation"
  | "mockup"
  | "directive"
  | "payment";

export type CampaignAttachment = {
  id: string;
  title: string;
  category: AttachmentCategory;
  fileName: string;
  fileType: "pdf" | "figma" | "png" | "mp4" | "doc";
  fileSize: string;
  uploadDate: string;
  uploadedBy: string;
};

export type Campaign = {
  id: string;
  title: string;
  type: CampaignType;
  entityId: string;
  entityName: string;
  creativeLead: string;
  stage: CampaignStage;
  priority: "urgent" | "high" | "medium";
  startDate: string;
  dueDate: string;
  eventDate?: string;
  progress: number;
  totalBudget: number;
  spentBudget: number;
  brief: {
    overview: string;
    targetAudience: string;
    keyDeliverables: string[];
    distributionChannels: string[];
  };
  quotations: CampaignQuotation[];
  budgetItems: BudgetItem[];
  managerApproval: ManagerApproval;
  attachments: CampaignAttachment[];
};

export const CAMPAIGN_STAGES_CONFIG: {
  id: CampaignStage;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  tone: "blue" | "purple" | "orange" | "amber" | "teal" | "green";
}[] = [
  {
    id: "idea",
    labelAr: "مستودع الأفكار والموجز",
    labelEn: "Ideas & Creative Briefs",
    descriptionAr: "بلورة الفكرة، الأهداف، والإحاطة الإبداعية",
    tone: "blue",
  },
  {
    id: "quotations",
    labelAr: "عروض الأسعار والدراسة",
    labelEn: "Quotations & Costing",
    descriptionAr: "استدراج ومقارنة عروض الموردين والاستوديوهات",
    tone: "amber",
  },
  {
    id: "manager_review",
    labelAr: "مراجعة واعتماد المدير",
    labelEn: "Manager Review & Approval",
    descriptionAr: "دراسة العروض، إبداء المرئيات، وأمر الصرف المالي",
    tone: "orange",
  },
  {
    id: "in_production",
    labelAr: "قيد التصميم والإنتاج",
    labelEn: "In Production & Design",
    descriptionAr: "التصوير، التصاميم، المونتاج وإخراج الأصول",
    tone: "purple",
  },
  {
    id: "media_coverage",
    labelAr: "التغطية الإعلامية والنشر",
    labelEn: "Media Coverage & Launch",
    descriptionAr: "التغطية الميدانية، البث المباشر، وجدولة النشر",
    tone: "teal",
  },
  {
    id: "completed",
    labelAr: "مكتمل ومصروف نهائياً",
    labelEn: "Delivered & Paid",
    descriptionAr: "اعتماد التسليم النهائي وإقفال التعميد المالي",
    tone: "green",
  },
];

export const CAMPAIGN_TYPES_CONFIG: Record<
  CampaignType,
  {
    labelAr: string;
    labelEn: string;
    badgeAr: string;
    badgeTone: "blue" | "purple" | "teal";
  }
> = {
  advertising: {
    labelAr: "حملات إعلانية وترويجية",
    labelEn: "Advertising Campaigns",
    badgeAr: "إعلان وحملة ممولة",
    badgeTone: "blue",
  },
  design: {
    labelAr: "مشاريع التصميم والهوية والموشن",
    labelEn: "Design & Visual Identity",
    badgeAr: "تصميم وهوية بصرية",
    badgeTone: "purple",
  },
  coverage: {
    labelAr: "تغطيات إعلامية وتوثيق فعاليات",
    labelEn: "Media Coverage & Events",
    badgeAr: "تغطية إعلامية وتصوير",
    badgeTone: "teal",
  },
};

export const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: "national-day-94",
    title: "حملة اليوم الوطني 94 - مسيرة فخر وعطاء",
    type: "advertising",
    entityId: "marketing-pr",
    entityName: "إدارة التسويق والعلاقات المؤسسية",
    creativeLead: "سارة القحطاني (Sarah)",
    stage: "in_production",
    priority: "urgent",
    startDate: "2026-08-15",
    dueDate: "2026-09-23",
    eventDate: "2026-09-23",
    progress: 75,
    totalBudget: 380000,
    spentBudget: 245000,
    brief: {
      overview:
        "حملة إعلامية وإعلانية كبرى بمناسبة اليوم الوطني للمملكة تستعرض إنجازات المجموعة وقصص نجاح الكوادر الوطنية مع إنتاج فيلم سينمائي رئيسي وشاشات طرق رقمية في الرياض وجدة والدمام.",
      targetAudience: "الجمهور العام، عملاء المجموعة، والجهات الشريكة في المملكة",
      keyDeliverables: [
        "فيلم رئيسي بجودة 4K مدته 90 ثانية",
        "3 فيديوهات قصيرة للمنصات الرقمية (15 ثانية)",
        "تصاميم شاشات الطرق والشاشات الإعلانية الذكية",
        "حقيبة قوالب السوشيال ميديا للمنشورات التفاعلية",
      ],
      distributionChannels: [
        "شاشات الطرق الرقمية (Mega Screen)",
        "منصة X و Snapchat و TikTok",
        "شاشات الاستقبال والمقرات الداخلية",
        "القنوات التلفزيونية والمنصات الإخبارية",
      ],
    },
    quotations: [
      {
        id: "q-101",
        vendorName: "استوديو مدار للإنتاج السينمائي",
        serviceScope:
          "التصوير السينمائي الكامل بطواقم متخصصة، تصوير درون معتمد، هندسة الصوت والتلوين الموسيقي وتأليف المعزوفة الوطنية الخاصة.",
        amount: 210000,
        durationDays: 20,
        isRecommended: true,
        status: "approved",
        quoteDate: "2026-08-18",
        fileName: "Quotation_Madar_Studios_NationalDay94.pdf",
        notes: "أفضل سجل أعمال وسعر منافس مع الالتزام التام بالجدول الزمني المسبق.",
      },
      {
        id: "q-102",
        vendorName: "وكالة أفق للدعاية والاتصال",
        serviceScope:
          "إنتاج الفيلم والتصاميم مع حجز مساحات إعلانية مخفضة بنسبة 10%.",
        amount: 245000,
        durationDays: 25,
        isRecommended: false,
        status: "pending",
        quoteDate: "2026-08-19",
        fileName: "Proposal_Ufuq_National_Campaign.pdf",
        notes: "سعر مرتفع مقارنة بنطاق أعمال المونتاج.",
      },
      {
        id: "q-103",
        vendorName: "شركة رؤية ميديا للإنتاج الرقمي",
        serviceScope: "تصوير خارجي فقط بدون الموسيقى التعبيرية.",
        amount: 190000,
        durationDays: 18,
        isRecommended: false,
        status: "rejected",
        quoteDate: "2026-08-17",
        fileName: "Vision_Media_Quote_ND94.pdf",
        notes: "نطاق الخدمات لا يغطي تأليف المقطوعة الموسيقية الحصرية.",
      },
    ],
    budgetItems: [
      {
        id: "b-1",
        category: "video",
        title: "الإنتاج السينمائي والتصوير الخارجي والموسيقى",
        allocated: 160000,
        spent: 120000,
        notes: "تم سداد الدفعة الأولى من عقد استوديو مدار.",
      },
      {
        id: "b-2",
        category: "design",
        title: "تصاميم اللوحات الإعلانية وشاشات الطرق ومواد النشر",
        allocated: 50000,
        spent: 35000,
        notes: "المصمم الداخلي وفريق الجرافيك.",
      },
      {
        id: "b-3",
        category: "media_ads",
        title: "الحملة الإعلانية الممولة (سناب شات، إكس، تيك توك)",
        allocated: 130000,
        spent: 90000,
        notes: "تفعيل الحملات الترويجية الموجهة.",
      },
      {
        id: "b-4",
        category: "licensing",
        title: "تصاريح التصوير الجوي وهيئة الإعلام المرئي",
        allocated: 40000,
        spent: 0,
        notes: "قيد استكمال الدفع بعد صدور الاعتماد.",
      },
    ],
    managerApproval: {
      status: "approved",
      managerName: "د. عبدالعزيز السالم",
      managerRole: "المشرف العام على قطاع الإعلام والاتصال المؤسسي",
      decisionDate: "2026-08-22",
      feedback:
        "فكرة الحملة إبداعية ومواكبة لمستهدفات المناسبة الوطنية. تم اعتماد عرض استوديو مدار للإنتاج السينمائي بمبلغ 210,000 ريال، مع التوجيه بالتشديد على جودة التلوين الصوري وإبراز الوجوه السعودية الشابة من منسوبي المجموعة. يُعتمد أمر الصرف والبدء فوراً.",
      signature: "د. عبدالعزيز السالم / معتمد رقميا",
      paymentDirective: {
        directiveNumber: "DIR-2026-9411",
        approvedAmount: 210000,
        authorizedDate: "2026-08-23",
        paymentMethod: "دفعة أولى 50% فوري، و50% بعد إجازة المخرجات النهائية",
        accountantNotes:
          "يُصرف من بند ميزانية التسويق المؤسسي لحملات المناسبات الوطنية لعام 2026 بموجب التعميد المرفق.",
        voucherFile: "Payment_Authorization_DIR_9411.pdf",
      },
    },
    attachments: [
      {
        id: "att-1",
        title: "وثيقة الإحاطة الإبداعية الشاملة (Creative Brief)",
        category: "brief",
        fileName: "Brief_National_Day_94_Official.pdf",
        fileType: "pdf",
        fileSize: "2.4 MB",
        uploadDate: "2026-08-16",
        uploadedBy: "سارة القحطاني",
      },
      {
        id: "att-2",
        title: "عرض السعر المعتمد - استوديو مدار",
        category: "quotation",
        fileName: "Quotation_Madar_Approved_Signed.pdf",
        fileType: "pdf",
        fileSize: "1.8 MB",
        uploadDate: "2026-08-20",
        uploadedBy: "سارة القحطاني",
      },
      {
        id: "att-3",
        title: "توجيه المدير وقرار الاعتماد والتعميد المالي",
        category: "directive",
        fileName: "Executive_Directive_DIR_9411.pdf",
        fileType: "pdf",
        fileSize: "950 KB",
        uploadDate: "2026-08-23",
        uploadedBy: "د. عبدالعزيز السالم",
      },
      {
        id: "att-4",
        title: "مسودة تصاميم شاشات الطرق واللوحات (Mockups)",
        category: "mockup",
        fileName: "Highway_Billboards_NationalDay_v3.figma",
        fileType: "figma",
        fileSize: "14.2 MB",
        uploadDate: "2026-08-28",
        uploadedBy: "فريق التصميم الداخلي",
      },
      {
        id: "att-5",
        title: "إذن الدفع والتحويل للدفعة الأولى (50%)",
        category: "payment",
        fileName: "Payment_Voucher_Advance_50pct.pdf",
        fileType: "pdf",
        fileSize: "680 KB",
        uploadDate: "2026-08-25",
        uploadedBy: "الإدارة المالية",
      },
    ],
  },
  {
    id: "tech-forum-coverage",
    title: "التغطية الإعلامية الشاملة لمنتدى التحول الرقمي والابتكار",
    type: "coverage",
    entityId: "tech-solutions",
    entityName: "شركة حلول التقنية والابتكار",
    creativeLead: "فيصل العتيبي (Faisal)",
    stage: "manager_review",
    priority: "high",
    startDate: "2026-09-01",
    dueDate: "2026-09-28",
    eventDate: "2026-09-25",
    progress: 40,
    totalBudget: 195000,
    spentBudget: 45000,
    brief: {
      overview:
        "تغطية وتوثيق فعاليات منتدى التقنية السنوي المنعقد في فندق الفورسيزونز، يشمل التوثيق الفوتوغرافي والفيديو السينمائي، تجهيز استوديو المقابلات السريعة للمتحدثين الدوليين، وإدارة البث المباشر على منصات اليوتيوب وX.",
      targetAudience:
        "المشاركون في المنتدى، قادة القطاع التقني، والمستثمرون وصناع القرار",
      keyDeliverables: [
        "بث مباشر عالي الجودة متصل بمنصات التواصل",
        "فيديو تلخيصي يومي سريع للنشر خلال 3 ساعات من ختام الجلسات",
        "تغطية فوتوغرافية فورية من خلال رابط سحابي مباشر للحضور",
        "فيلم وثائقي شامل لختام المنتدى (3 دقائق)",
      ],
      distributionChannels: [
        "قناة يوتيوب الرسمية (بث مباشر)",
        "منصة إكس وتغطيات لحظية",
        "شاشات العرض داخل قاعة المنتدى",
      ],
    },
    quotations: [
      {
        id: "q-201",
        vendorName: "مؤسسة العدسة الذهبية للتغطيات والبث",
        serviceScope:
          "عربة نقل وبث مباشر 4K، طاقم من 6 مصورين محترفين، درون داخلي مخصص للقاعات، استوديو مقابلات مجهز بالصوتيات والإضاءة المتكاملة.",
        amount: 140000,
        durationDays: 4,
        isRecommended: true,
        status: "pending",
        quoteDate: "2026-09-04",
        fileName: "Quote_GoldenLens_TechForum2026.pdf",
        notes: "عرض متكامل يغطي البث التلفزيوني والرقمي مع سوابق أعمال مع وزارات كبرى.",
      },
      {
        id: "q-202",
        vendorName: "استوديو البث الحي المتخصص (Live Stream Pro)",
        serviceScope:
          "بث مباشر عبر الإنترنت وتصوير فوتوغرافي بدون توثيق درون وبدون استوديو مقابلات.",
        amount: 125000,
        durationDays: 3,
        isRecommended: false,
        status: "pending",
        quoteDate: "2026-09-05",
        fileName: "LiveStreamPro_Proposal.pdf",
        notes: "العرض يستثني استوديو مقابلات الشخصيات الهامة VIP.",
      },
    ],
    budgetItems: [
      {
        id: "b-21",
        category: "crew_equipment",
        title: "طواقم التصوير الميداني والبث المباشر (مؤسسة العدسة الذهبية)",
        allocated: 140000,
        spent: 0,
        notes: "بانتظار اعتماد المدير لإصدار الدفعة الأولى.",
      },
      {
        id: "b-22",
        category: "video",
        title: "المونتاج السريع والتغطيات اليومية والفيلم الختامي",
        allocated: 35000,
        spent: 25000,
        notes: "فريق الميديا الرقمية الداخلي وتجهيز الهويات البصرية المتحركة.",
      },
      {
        id: "b-23",
        category: "design",
        title: "شاشات المنصة والخلفيات الإعلامية وبطاقات التغطية",
        allocated: 20000,
        spent: 20000,
        notes: "تم الانتهاء من تصاميم الشاشات واللوحات الخلفية.",
      },
    ],
    managerApproval: {
      status: "pending",
      managerName: "د. عبدالعزيز السالم",
      managerRole: "المشرف العام على قطاع الإعلام والاتصال المؤسسي",
      decisionDate: "2026-09-08",
      feedback:
        "المقترح وخطة التغطية قيد الدراسة. يرجى التأكيد على إضافة ترجمة إنجليزية فورية لمقابلات المتحدثين العالميين، وتقديم جدول زمني مفصل لساعات البث، وتوضيح اشتراطات الأمان للطائرات المسيرة داخل بهو الفندق قبل اعتماد التعميد المالي النهائي.",
      signature: "قيد المراجعة الإدارية",
    },
    attachments: [
      {
        id: "att-201",
        title: "مخطط التغطية ومواقع الكاميرات واستوديو اللقاءات",
        category: "brief",
        fileName: "FloorPlan_Cameras_TechForum.pdf",
        fileType: "pdf",
        fileSize: "4.1 MB",
        uploadDate: "2026-09-02",
        uploadedBy: "فيصل العتيبي",
      },
      {
        id: "att-202",
        title: "عرض سعر مؤسسة العدسة الذهبية للتغطيات",
        category: "quotation",
        fileName: "GoldenLens_FullQuotation_v2.pdf",
        fileType: "pdf",
        fileSize: "2.1 MB",
        uploadDate: "2026-09-04",
        uploadedBy: "فيصل العتيبي",
      },
      {
        id: "att-203",
        title: "تصاميم الشاشات التفاعلية والهوية البصرية للمنتدى",
        category: "mockup",
        fileName: "Forum_Stage_Screens_Identity.png",
        fileType: "png",
        fileSize: "6.8 MB",
        uploadDate: "2026-09-06",
        uploadedBy: "مريم الدوسري",
      },
    ],
  },
  {
    id: "sustainability-brand-identity",
    title: "تصميم وتطوير الهوية البصرية لبرنامج الابتكار والاستدامة",
    type: "design",
    entityId: "sustainability-csr",
    entityName: "إدارة المسؤولية المجتمعية والاستدامة",
    creativeLead: "مريم الدوسري (Mariam)",
    stage: "media_coverage",
    priority: "high",
    startDate: "2026-07-10",
    dueDate: "2026-09-18",
    progress: 90,
    totalBudget: 110000,
    spentBudget: 95000,
    brief: {
      overview:
        "ابتكار هوية بصرية كاملة متناغمة مع الهوية الأم للمجموعة تعبر عن مبادرات الاستدامة والتشجير ومشاريع الطاقة المتجددة، مع تصميم دليل العلامة (Brand Guidelines)، وأيقونات حصرية، وفيديو موشن جرافيك 3D للإطلاق.",
      targetAudience:
        "المجتمع، الموظفون، الجهات البيئية والتنظيمية في المملكة",
      keyDeliverables: [
        "الشعار الرسمي باللغتين العربية والإنجليزية بأنماطه المختلفة",
        "دليل معايير الهوية البصرية (Brand Book) 80 صفحة",
        "حزمة قوالب تقارير الاستدامة وعروض البوربوينت",
        "فيديو موشن جرافيك ثلاثي الأبعاد 60 ثانية لتدشين البرنامج",
      ],
      distributionChannels: [
        "الموقع الإلكتروني والمنصات الرقمية",
        "التقارير السنوية ومطبوعات الاستدامة",
        "شاشات العرض والمؤتمرات البيئية",
      ],
    },
    quotations: [
      {
        id: "q-301",
        vendorName: "استوديو علامة لتصميم الهويات الإبداعية",
        serviceScope:
          "تطوير الهوية البصرية المتكاملة، الخط الطباعي الخاص، تصميم دليل المعايير، وفيديو الموشن جرافيك ثلاثي الأبعاد.",
        amount: 95000,
        durationDays: 35,
        isRecommended: true,
        status: "approved",
        quoteDate: "2026-07-15",
        fileName: "Allamah_Studio_BrandIdentity_Quote.pdf",
        notes: "تم التفاوض واعتماد السعر شاملاً حقوق الملكية الفكرية والخط العربي الخاص.",
      },
    ],
    budgetItems: [
      {
        id: "b-31",
        category: "design",
        title: "ابتكار الشعار ودليل الهوية وحقيبة القوالب الرسمية",
        allocated: 65000,
        spent: 65000,
        notes: "مكتمل ومسدد بالكامل للاستوديو.",
      },
      {
        id: "b-32",
        category: "video",
        title: "إنتاج فيديو الموشن جرافيك ثلاثي الأبعاد والتعليق الصوتي",
        allocated: 30000,
        spent: 30000,
        notes: "تم تسليم النسخة النهائية واعتماد التعليق الصوتي الفصيح.",
      },
      {
        id: "b-33",
        category: "licensing",
        title: "تسجيل وحماية حقوق الملكية الفكرية للشعار والاسم",
        allocated: 15000,
        spent: 0,
        notes: "بانتظار الفاتورة الرسمية من الهيئة السعودية للملكية الفكرية.",
      },
    ],
    managerApproval: {
      status: "approved",
      managerName: "د. عبدالعزيز السالم",
      managerRole: "المشرف العام على قطاع الإعلام والاتصال المؤسسي",
      decisionDate: "2026-07-20",
      feedback:
        "الهوية جاءت بمستوى رفيع جداً يدمج اللون الأخضر المستدام مع هوية المجموعة الرسمية. اعتمدت الميزانية وعرض استوديو علامة. نوصي بالتجهيز لحفل تدشين الهوية بالتزامن مع أسبوع البيئة الوطني.",
      signature: "د. عبدالعزيز السالم / معتمد",
      paymentDirective: {
        directiveNumber: "DIR-2026-7732",
        approvedAmount: 95000,
        authorizedDate: "2026-07-21",
        paymentMethod: "دفعات مرحلية مرتبطة بنسب تسليم مخرجات الهوية",
        accountantNotes:
          "تم إرفاق جدول الاستحقاقات وعقد حماية الملكية الفكرية لإدارة الحسابات.",
        voucherFile: "Brand_Payment_Directive_DIR_7732.pdf",
      },
    },
    attachments: [
      {
        id: "att-301",
        title: "دليل الهوية البصرية المعتمد (Brand Guidelines)",
        category: "mockup",
        fileName: "Sustainability_Brand_Guidelines_Final.pdf",
        fileType: "pdf",
        fileSize: "18.5 MB",
        uploadDate: "2026-08-30",
        uploadedBy: "مريم الدوسري",
      },
      {
        id: "att-302",
        title: "عرض استوديو علامة وعقد التكليف",
        category: "quotation",
        fileName: "Allamah_Contract_Signed_DIR7732.pdf",
        fileType: "pdf",
        fileSize: "1.4 MB",
        uploadDate: "2026-07-22",
        uploadedBy: "مريم الدوسري",
      },
      {
        id: "att-303",
        title: "توجيه المدير باعتماد الهوية وتعميد الصرف",
        category: "directive",
        fileName: "Approval_Brand_Directive_7732.pdf",
        fileType: "pdf",
        fileSize: "720 KB",
        uploadDate: "2026-07-21",
        uploadedBy: "د. عبدالعزيز السالم",
      },
    ],
  },
  {
    id: "ecommerce-app-launch",
    title: "الحملة الإعلانية الرقمية لإطلاق تطبيق التجزئة ومنصة الولاء",
    type: "advertising",
    entityId: "retail-ecommerce",
    entityName: "شركة التجزئة والتجارة الإلكترونية",
    creativeLead: "خالد المنصور (Khaled)",
    stage: "quotations",
    priority: "high",
    startDate: "2026-09-10",
    dueDate: "2026-10-30",
    progress: 25,
    totalBudget: 260000,
    spentBudget: 0,
    brief: {
      overview:
        "حملة إعلانات ممولة متعددة القنوات تستهدف زيادة تحميلات التطبيق واستقطاب 100 ألف مستخدم جديد خلال أول 30 يوماً مع تفعيل عروض ترويجية وكوبونات ترحيبية بالتعاون مع مشاهير وصناع محتوى رقمي.",
      targetAudience: "المتسوقون عبر الجوال، العائلات، والشباب من سن 18 إلى 45 سنة",
      keyDeliverables: [
        "10 إعلانات فيديو رأسية (9:16) مخصصة لتيك توك وإنستغرام وسناب شات",
        "تنسيق وتنفيذ حملات مع 4 صناع محتوى متخصصين",
        "بنرات وحملات إعادة استهداف برمجية (Programmatic Ads)",
      ],
      distributionChannels: [
        "Apple Search Ads & Google UAC",
        "Snapchat Ads & TikTok Spark Ads",
        "Instagram Reels & Meta Ads",
      ],
    },
    quotations: [
      {
        id: "q-401",
        vendorName: "وكالة ترافيك للتسويق الرقمي وإدارة الحملات",
        serviceScope:
          "إدارة الحملات الممولة، تصوير الإعلانات التيك توك العفوية (UGC)، وتحسين تكلفة التحميل (CPI).",
        amount: 185000,
        durationDays: 45,
        isRecommended: true,
        status: "pending",
        quoteDate: "2026-09-12",
        fileName: "Traffic_Agency_UGC_Campaign_Quote.pdf",
        notes: "تتضمن ضمان تحقيق تكلفة أقل من 2.5 ريال لكل تحميل جديد.",
      },
      {
        id: "q-402",
        vendorName: "مجموعة التأثير للإعلانات الموجهة",
        serviceScope:
          "التعاقد مع مشاهير المنصات والإعلانات المؤثرة شاملاً تكاليف العقود.",
        amount: 215000,
        durationDays: 30,
        isRecommended: false,
        status: "pending",
        quoteDate: "2026-09-13",
        fileName: "Influence_Group_Pricing_Retail.pdf",
        notes: "سعر مرتفع لنسبة أتعاب الإدارة.",
      },
    ],
    budgetItems: [
      {
        id: "b-41",
        category: "media_ads",
        title: "ميزانية المنصات الإعلانية الممولة المباشرة",
        allocated: 150000,
        spent: 0,
        notes: "بانتظار أمر تعميد الصرف المالي.",
      },
      {
        id: "b-42",
        category: "video",
        title: "إنتاج الفيديوهات القصيرة ونماذج UGC الإعلانية",
        allocated: 65000,
        spent: 0,
        notes: "استوديو الإنتاج الرقمي.",
      },
      {
        id: "b-43",
        category: "licensing",
        title: "عقود صناع المحتوى المؤثرين وتصاريح موثوق",
        allocated: 45000,
        spent: 0,
        notes: "التنسيق مع الهيئة العامة لتنظيم الإعلام لتراخيص الإعلانات.",
      },
    ],
    managerApproval: {
      status: "pending",
      managerName: "د. عبدالعزيز السالم",
      managerRole: "المشرف العام على قطاع الإعلام والاتصال المؤسسي",
      decisionDate: "2026-09-14",
      feedback:
        "المشروع واعد وضروري لقطاع التجزئة. بانتظار استكمال مقارنة عروض الأسعار واستلام الضمانات التعاقدية لنسب التحميل قبل اعتماد أمر الدفع.",
    },
    attachments: [
      {
        id: "att-401",
        title: "استراتيجية الإطلاق وخطة التحويل الرقمي",
        category: "brief",
        fileName: "Retail_App_Launch_Strategy_v1.pdf",
        fileType: "pdf",
        fileSize: "3.7 MB",
        uploadDate: "2026-09-11",
        uploadedBy: "خالد المنصور",
      },
      {
        id: "att-402",
        title: "عرض وكالة ترافيك المفصل",
        category: "quotation",
        fileName: "Traffic_Agency_Proposal_Full.pdf",
        fileType: "pdf",
        fileSize: "2.8 MB",
        uploadDate: "2026-09-12",
        uploadedBy: "خالد المنصور",
      },
    ],
  },
  {
    id: "cityscape-realestate-coverage",
    title: "تغطية معرض سيتي سكيب العقاري وتدشين الأبراج السكنية",
    type: "coverage",
    entityId: "real-estate-co",
    entityName: "شركة التطوير والاستثمار العقاري",
    creativeLead: "نورة الشهري (Noura)",
    stage: "in_production",
    priority: "high",
    startDate: "2026-08-20",
    dueDate: "2026-10-15",
    eventDate: "2026-10-10",
    progress: 60,
    totalBudget: 320000,
    spentBudget: 180000,
    brief: {
      overview:
        "تغطية جناح الشركة في معرض سيتي سكيب العالمي وتوثيق إطلاق أحدث مشاريع الأبراج السكنية في شمال الرياض، مع إنتاج عروض الواقع الافتراضي 3D والفيديوهات الإعلانية لجناح العرض.",
      targetAudience: "المستثمرون العقاريون، المشترون، والوفود الدولية المشاركة",
      keyDeliverables: [
        "فيلم تعريفي ثلاثي الأبعاد للأبراج لعرضه على شاشات الجناح",
        "تغطية إعلامية حية لحفل توقيع مذكرات التفاهم",
        "توثيق زيارات كبار الشخصيات والوزراء للجناح",
      ],
      distributionChannels: [
        "شاشات الجناح التفاعلية والمجسمات الرقمية",
        "تغطيات الصحف والمنصات الاقتصادية الكبرى",
        "حسابات الشركة على منصات التواصل",
      ],
    },
    quotations: [
      {
        id: "q-501",
        vendorName: "شركة أفق ميديا للفعاليات والإنتاج المرئي",
        serviceScope:
          "تصوير سينمائي متكامل، تصوير مجسمات ثلاثية الأبعاد، تجهيز فريق مونتاج لحظي داخل المعرض، وإنتاج الريلز الإخبارية.",
        amount: 220000,
        durationDays: 7,
        isRecommended: true,
        status: "approved",
        quoteDate: "2026-08-25",
        fileName: "Cityscape_OfuqMedia_Quote_Approved.pdf",
        notes: "معتمد من الإدارة نظراً لخبرتهم الطويلة في سيتي سكيب.",
      },
    ],
    budgetItems: [
      {
        id: "b-51",
        category: "crew_equipment",
        title: "طواقم التغطية الميدانية والمعدات والكاميرات السينمائية",
        allocated: 140000,
        spent: 100000,
        notes: "تم سداد الدفعة الأولى المعتمدة.",
      },
      {
        id: "b-52",
        category: "video",
        title: "إنتاج فيلم الأبراج ثلاثي الأبعاد لشاشات الجناح",
        allocated: 120000,
        spent: 80000,
        notes: "تم تسليم المسودة الثانية للمشروع العقاري.",
      },
      {
        id: "b-53",
        category: "media_ads",
        title: "التغطيات الصحفية والنشر في المواقع الاقتصادية",
        allocated: 60000,
        spent: 0,
        notes: "بانتظار انطلاق المعرض الفعلي.",
      },
    ],
    managerApproval: {
      status: "approved",
      managerName: "د. عبدالعزيز السالم",
      managerRole: "المشرف العام على قطاع الإعلام والاتصال المؤسسي",
      decisionDate: "2026-08-28",
      feedback:
        "معتمد بالكامل. المشاركة في سيتي سكيب ذات أولوية استراتيجية عليا. نؤكد على جودة إبراز التفاصيل المعمارية للأبراج وحضور المصورين بكامل الزي الرسمي الموحد.",
      signature: "د. عبدالعزيز السالم / معتمد",
      paymentDirective: {
        directiveNumber: "DIR-2026-8841",
        approvedAmount: 220000,
        authorizedDate: "2026-08-29",
        paymentMethod: "دفعة مقدمة 40%، و40% أثناء المعرض، و20% عند استلام الأرشيف",
        accountantNotes:
          "يُخصم من ميزانية تسويق وتغطيات المشاريع العقارية لشركة التطوير.",
        voucherFile: "Payment_Directive_Cityscape_DIR8841.pdf",
      },
    },
    attachments: [
      {
        id: "att-501",
        title: "عرض السعر المعتمد لشركة أفق ميديا",
        category: "quotation",
        fileName: "Approved_Quote_DIR8841.pdf",
        fileType: "pdf",
        fileSize: "2.3 MB",
        uploadDate: "2026-08-26",
        uploadedBy: "نورة الشهري",
      },
      {
        id: "att-502",
        title: "أمر التعميد وتوجيه الدفع الإداري",
        category: "directive",
        fileName: "Payment_Auth_Cityscape_8841.pdf",
        fileType: "pdf",
        fileSize: "890 KB",
        uploadDate: "2026-08-29",
        uploadedBy: "د. عبدالعزيز السالم",
      },
    ],
  },
  {
    id: "cx-explainer-videos",
    title: "سلسلة فيديوهات موشن جرافيك توعوية لتجربة العملاء والخدمات",
    type: "design",
    entityId: "cx-dept",
    entityName: "قطاع تجربة العميل والعمليات",
    creativeLead: "محمد الشمري (Mohammed)",
    stage: "completed",
    priority: "medium",
    startDate: "2026-06-01",
    dueDate: "2026-07-25",
    progress: 100,
    totalBudget: 85000,
    spentBudget: 85000,
    brief: {
      overview:
        "إنتاج 5 فيديوهات موشن جرافيك احترافية تشرح قنوات الدعم الرقمي وطرق تقديم الطلبات ومتابعتها عبر بوابة الخدمة الموحدة.",
      targetAudience: "عملاء المجموعة والمراجعون",
      keyDeliverables: [
        "5 فيديوهات موشن جرافيك بدقة Full HD مع مؤثرات بصرية وصوتية",
        "تعليق صوتي فصيح مسجل في استوديو معتمد",
      ],
      distributionChannels: [
        "شاشات مراكز خدمة العملاء",
        "قنوات الواتساب للأعمال وقنوات الدعم الفني",
      ],
    },
    quotations: [
      {
        id: "q-601",
        vendorName: "استوديو أنيميشن ستيشن لإنتاج الموشن",
        serviceScope: "كتابة السيناريو ورسم المشاهد والتحريك والتسجيل الصوتي.",
        amount: 85000,
        durationDays: 30,
        isRecommended: true,
        status: "approved",
        quoteDate: "2026-06-05",
        fileName: "AnimationStation_Final_Quote.pdf",
        notes: "تم إنجاز كافة الفيديوهات وتسليم الملفات المفتوحة للمجموعة.",
      },
    ],
    budgetItems: [
      {
        id: "b-61",
        category: "design",
        title: "رسم المشاهد والشخصيات الكرتونية وتصميم الهوية",
        allocated: 35000,
        spent: 35000,
        notes: "مكتمل ومصروف.",
      },
      {
        id: "b-62",
        category: "video",
        title: "التحريك المتقدم ثلاثي وثنائي الأبعاد وهندسة الصوت",
        allocated: 50000,
        spent: 50000,
        notes: "مكتمل ومصروف.",
      },
    ],
    managerApproval: {
      status: "approved",
      managerName: "د. عبدالعزيز السالم",
      managerRole: "المشرف العام على قطاع الإعلام والاتصال المؤسسي",
      decisionDate: "2026-06-10",
      feedback:
        "تمت مراجعة السيناريوهات والمسودات واعتماد الصرف والإغلاق المالي بعد التأكد من اكتمال كافة التسليمات وإيداعها في أرشيف الميديا.",
      signature: "د. عبدالعزيز السالم / معتمد ومغلق",
      paymentDirective: {
        directiveNumber: "DIR-2026-6112",
        approvedAmount: 85000,
        authorizedDate: "2026-06-11",
        paymentMethod: "تم السداد بالكامل وإقفال أمر الشراء",
        accountantNotes: "تمت التصفية المالية وإصدار المخالصة النهائية للمورد.",
        voucherFile: "Final_Settlement_DIR6112.pdf",
      },
    },
    attachments: [
      {
        id: "att-601",
        title: "مخالصة الإقفال النهائي للمشروع وأمر الصرف",
        category: "payment",
        fileName: "Final_Settlement_Receipt_CX.pdf",
        fileType: "pdf",
        fileSize: "1.1 MB",
        uploadDate: "2026-07-28",
        uploadedBy: "الإدارة المالية",
      },
    ],
  },
  {
    id: "logistics-roadshow",
    title: "فكرة حملة إطلاق المنصة اللوجستية وتغطية الشراكات الإقليمية",
    type: "advertising",
    entityId: "logistics-co",
    entityName: "شركة الخدمات اللوجستية والشحن",
    creativeLead: "طارق الزهراني (Tariq)",
    stage: "idea",
    priority: "medium",
    startDate: "2026-09-15",
    dueDate: "2026-11-20",
    progress: 10,
    totalBudget: 175000,
    spentBudget: 0,
    brief: {
      overview:
        "حملة تسويقية متزامنة مع تدشين المستودعات الذكية ومراكز التوزيع السريعة بين المدن الكبرى، تتضمن إعلانات بي تو بي وحملات إعلامية متخصصة في سلاسل الإمداد.",
      targetAudience: "الشركات التجارية، الموردون، والمستوردون في المملكة والخليج",
      keyDeliverables: [
        "فيديو سينمائي يستعرض أسطول الشحن والتقنيات الذكية",
        "كتيب رقمي تفاعلي لخدمات النقل والتخزين",
        "تغطية صحفية لتدشين المركز اللوجستي الجديد",
      ],
      distributionChannels: [
        "منصة لينكد إن والمواقع الاقتصادية",
        "البريد الإلكتروني المباشر لكبار العملاء",
      ],
    },
    quotations: [],
    budgetItems: [
      {
        id: "b-71",
        category: "video",
        title: "تصوير الأسطول والمستودعات بكاميرات ومعدات سينمائية",
        allocated: 90000,
        spent: 0,
        notes: "تقدير أولي قيد استدراج عروض الأسعار.",
      },
      {
        id: "b-72",
        category: "media_ads",
        title: "حملة إعلانات لينكد إن ومجلات قطاع سلاسل الإمداد",
        allocated: 60000,
        spent: 0,
        notes: "قيد التخطيط.",
      },
      {
        id: "b-73",
        category: "design",
        title: "تصميم الكتيب الرقمي والبروفايل التعريفي",
        allocated: 25000,
        spent: 0,
        notes: "فريق التصميم الداخلي.",
      },
    ],
    managerApproval: {
      status: "pending",
      managerName: "د. عبدالعزيز السالم",
      managerRole: "المشرف العام على قطاع الإعلام والاتصال المؤسسي",
      decisionDate: "2026-09-15",
      feedback:
        "الفكرة معتمدة مبدئياً ومجدية. يرجى البدء فوراً في استدراج ثلاثة عروض أسعار من شركات إنتاج مؤهلة وتجهيز الموجز الإبداعي لعرضه على اللجنة.",
    },
    attachments: [
      {
        id: "att-701",
        title: "مسودة المقترح الأولي لحملة الشحن واللوجستيات",
        category: "brief",
        fileName: "Logistics_Campaign_Concept_v1.pdf",
        fileType: "pdf",
        fileSize: "1.9 MB",
        uploadDate: "2026-09-15",
        uploadedBy: "طارق الزهراني",
      },
    ],
  },
  {
    id: "hr-leadership-coverage",
    title: "التغطية التوثيقية لملتقى القيادات السنوي والتواصل الداخلي",
    type: "coverage",
    entityId: "hr-dept",
    entityName: "إدارة الموارد البشرية والتواصل الداخلي",
    creativeLead: "ريم الغامدي (Reem)",
    stage: "manager_review",
    priority: "urgent",
    startDate: "2026-09-12",
    dueDate: "2026-10-05",
    eventDate: "2026-09-30",
    progress: 45,
    totalBudget: 95000,
    spentBudget: 20000,
    brief: {
      overview:
        "توثيق احترافي لملتقى القيادات السنوي المنعقد برعاية الرئيس التنفيذي، يشمل تصوير جلسات العصف الذهني، تصوير البورتريهات الفردية لـ 60 قيادياً للملفات الرسمية، وإنتاج فيديو تحفيزي داخلي.",
      targetAudience: "قيادات وموظفو المجموعة",
      keyDeliverables: [
        "ألبوم صور فوتوغرافية معالج رقمياً للقيادات",
        "فيديو يلخص مخرجات الملتقى وأبرز القرارات الإدارية (دقيقتان)",
        "تصميم كتاب ملخص توصيات الملتقى للطباعة والتوزيع الرقمي",
      ],
      distributionChannels: [
        "بوابة الموظفين الداخلية وتطبيق التواصل المؤسسي",
        "البريد الإلكتروني الداخلي لكافة منسوبي المجموعة",
      ],
    },
    quotations: [
      {
        id: "q-801",
        vendorName: "استوديو بورتريه المتخصص في تصوير الأعمال",
        serviceScope:
          "تجهيز استوديو إضاءة متنقل في موقع الفعالية، طاقم مصورين شخصيات، تسليم الصور في نفس اليوم.",
        amount: 68000,
        durationDays: 2,
        isRecommended: true,
        status: "pending",
        quoteDate: "2026-09-14",
        fileName: "PortraitStudio_HR_Leaders_Quote.pdf",
        notes: "سعر مناسب جداً يشمل معالجة وتعديل 60 صورة بورتريه بجودة طباعة عالية.",
      },
    ],
    budgetItems: [
      {
        id: "b-81",
        category: "crew_equipment",
        title: "طاقم تصوير البورتريه والأستوديو المتنقل الميداني",
        allocated: 68000,
        spent: 0,
        notes: "بانتظار توقيع الاعتماد والتعميد.",
      },
      {
        id: "b-82",
        category: "video",
        title: "مونتاج الفيديو التحفيزي الداخلي والمؤثرات الصوتية",
        allocated: 27000,
        spent: 20000,
        notes: "فريق المونتاج الداخلي.",
      },
    ],
    managerApproval: {
      status: "pending",
      managerName: "د. عبدالعزيز السالم",
      managerRole: "المشرف العام على قطاع الإعلام والاتصال المؤسسي",
      decisionDate: "2026-09-16",
      feedback:
        "المشروع معتمد من حيث المبدأ. يرجى مراجعة عرض استوديو بورتريه والتأكد من توفير مصورات إناث للقيادات النسائية، ثم رفع التعميد النهائي للاعتماد الفوري.",
    },
    attachments: [
      {
        id: "att-801",
        title: "الموجز التنفيذي وبرنامج ملتقى القيادات",
        category: "brief",
        fileName: "HR_Leadership_Program_Brief.pdf",
        fileType: "pdf",
        fileSize: "1.5 MB",
        uploadDate: "2026-09-13",
        uploadedBy: "ريم الغامدي",
      },
      {
        id: "att-802",
        title: "عرض سعر استوديو بورتريه لتصوير القيادات",
        category: "quotation",
        fileName: "PortraitStudio_HR_Quote.pdf",
        fileType: "pdf",
        fileSize: "1.2 MB",
        uploadDate: "2026-09-14",
        uploadedBy: "ريم الغامدي",
      },
    ],
  },
];
