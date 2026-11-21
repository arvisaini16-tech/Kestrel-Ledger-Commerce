import type {
  AdminSettings,
  AiFeatureSettings,
  CoinPackage,
  GatewayConfig,
  PaymentConfiguration,
  PlanConfig,
  Product,
} from '../types/platform';

export const HERO_BANNER_IMAGE = '/src/assets/images/hero_fintech_commerce_1795278018093.jpg';

export const STUDIO_IMAGE_OPTIONS = [
  {
    label: 'Titanium Hardware Vault',
    url: '/src/assets/images/product_hardware_vault_1795278016184.jpg',
  },
  {
    label: 'UPI & NFC POS Terminal',
    url: '/src/assets/images/product_pos_terminal_1795278017658.jpg',
  },
  {
    label: 'Executive Member Kit',
    url: '/src/assets/images/product_merch_kit_1795278017842.jpg',
  },
  {
    label: 'Enterprise Modular Plan',
    url: '/src/assets/images/product_enterprise_plan_1795278016480.jpg',
  },
];

export const DEFAULT_GATEWAY_CONFIG: Omit<GatewayConfig, 'updatedAt'> = {
  configId: 'default',
  gatewayMode: 'SANDBOX_ONLY',
  providerName: 'Kestrel UPI Sandbox Gateway',
  sandboxVpa: 'kestrel.sandbox@testupi',
  merchantName: 'Kestrel Sandbox Commerce',
  coinRateInr: 1,
  minWithdrawalCoins: 100,
  maxDailyWithdrawalCoins: 50000,
  realMoneyDisabledNotice:
    'Sandbox and simulation mode only. No live UPI rails, real bank payouts, or investment profit-sharing features are enabled.',
  updatedBy: 'arvisaini16@gmail.com',
};

export const DEFAULT_ADMIN_SETTINGS: Omit<AdminSettings, 'updatedAt'> = {
  settingId: 'default',
  brandName: 'Kestrel',
  tagline: 'AI-Powered Fintech & E-Commerce Ledger',
  logoUrl: '/assets/aistudio/image_d2358f68.png',
  faviconUrl: '/favicon-32x32.png',
  accentColor: '#1d4ed8',
  defaultTheme: 'light',
  tickerEnabled: true,
  referralsEnabled: true,
  withdrawalsEnabled: true,
  whatsappNumber: '+919900000000',
  telegramUrl: 'https://t.me/kestrel_sandbox_support',
  supportEmail: 'support@kestrel-sandbox.example',
  updatedBy: 'arvisaini16@gmail.com',
};

export const DEFAULT_AI_FEATURE_SETTINGS: Omit<AiFeatureSettings, 'updatedAt'> = {
  settingId: 'default',
  masterEnabled: true,
  dailyLimitPerUser: 50,
  aiSmartAssistant: true,
  aiAdminDashboard: true,
  aiFraudDetection: true,
  aiSmartSuggestions: true,
  aiHelpdesk: true,
  aiVoiceAssistant: true,
  multilingualAi: true,
  aiBusinessIntelligence: true,
  aiThemeDesigner: true,
  smartNotificationEngine: true,
  aiDatabaseHealthMonitor: true,
  updatedBy: 'arvisaini16@gmail.com',
};

export const INITIAL_COIN_PACKAGES: Array<Omit<CoinPackage, 'createdAt' | 'updatedAt'>> = [
  { packageId: 'pkg_100', name: 'Starter 100 Coins', coinQuantity: 100, purchasePrice: 100, currency: 'INR', description: 'Entry-level sandbox coin pack for quick testing.', status: 'active', displayOrder: 1 },
  { packageId: 'pkg_200', name: 'Basic 200 Coins', coinQuantity: 200, purchasePrice: 200, currency: 'INR', description: 'Standard 200 coin ledger credit bundle.', status: 'active', displayOrder: 2 },
  { packageId: 'pkg_400', name: 'Plus 400 Coins', coinQuantity: 400, purchasePrice: 400, currency: 'INR', description: 'Ideal for short-cycle plan enrollment.', status: 'active', displayOrder: 3 },
  { packageId: 'pkg_500', name: 'Core 500 Coins', coinQuantity: 500, purchasePrice: 500, currency: 'INR', description: 'Mid-tier sandbox treasury allocation.', status: 'active', displayOrder: 4 },
  { packageId: 'pkg_1000', name: 'Growth 1,000 Coins', coinQuantity: 1000, purchasePrice: 1000, currency: 'INR', description: 'Covers standard hardware & workspace plans.', status: 'active', displayOrder: 5 },
  { packageId: 'pkg_2000', name: 'Merchant 2,000 Coins', coinQuantity: 2000, purchasePrice: 2000, currency: 'INR', description: 'Built for multi-order sandbox fulfillment.', status: 'active', displayOrder: 6 },
  { packageId: 'pkg_10000', name: 'Treasury 10,000 Coins', coinQuantity: 10000, purchasePrice: 10000, currency: 'INR', description: 'High-volume merchant POS & annual plan balance.', status: 'active', displayOrder: 7 },
  { packageId: 'pkg_50000', name: 'Enterprise 50,000 Coins', coinQuantity: 50000, purchasePrice: 50000, currency: 'INR', description: 'Maximum sandbox treasury cap for enterprise QA.', status: 'active', displayOrder: 8 },
];

export const INITIAL_PLAN_CONFIGS: Array<Omit<PlanConfig, 'createdAt' | 'updatedAt'>> = [
  {
    planId: 'plan_3day_starter',
    name: '3-Day Sandbox Onboarding Plan',
    purchasePrice: 300,
    currency: 'Coins',
    durationDays: 3,
    totalScheduledCredits: 36,
    creditIntervalHours: 24,
    description: 'Introductory 3-day membership with 12 coins released automatically every 24 hours alongside workspace audit access.',
    status: 'active',
    displayOrder: 1,
    availableFrom: '',
    availableUntil: '',
    terms: 'Credits are disbursed strictly once every 24 hours (3 events total). Snapshot pricing & schedule are locked upon purchase.',
  },
  {
    planId: 'plan_7day_commerce',
    name: '7-Day Commerce Plus Plan',
    purchasePrice: 800,
    currency: 'Coins',
    durationDays: 7,
    totalScheduledCredits: 100,
    creditIntervalHours: 24,
    description: '7-day active merchant tooling window delivering 100 total scheduled coin credits (14/day for 6 cycles + 16 final cycle).',
    status: 'active',
    displayOrder: 2,
    availableFrom: '',
    availableUntil: '',
    terms: '100 scheduled credits distributed across 7 strict 24-hour intervals (14x6 + 16 final adjustment). No financial return guarantees.',
  },
  {
    planId: 'plan_15day_growth',
    name: '15-Day Ledger Operations Plan',
    purchasePrice: 1500,
    currency: 'Coins',
    durationDays: 15,
    totalScheduledCredits: 180,
    creditIntervalHours: 24,
    description: '15-day operational access suite with 180 total scheduled credits released at fixed 24-hour intervals (12 Coins/day).',
    status: 'active',
    displayOrder: 3,
    availableFrom: '',
    availableUntil: '',
    terms: '15 daily 24-hour intervals delivering 12 coins per cycle (180 total). Terms remain immutable for active subscribers.',
  },
  {
    planId: 'plan_30day_enterprise',
    name: '30-Day Enterprise Audit Plan',
    purchasePrice: 3000,
    currency: 'Coins',
    durationDays: 30,
    totalScheduledCredits: 450,
    creditIntervalHours: 24,
    description: 'Full 30-day enterprise analytics and API seat plan issuing 450 scheduled credits across 30 24-hour cycles.',
    status: 'active',
    displayOrder: 4,
    availableFrom: '',
    availableUntil: '',
    terms: '30 sequential 24-hour credit intervals (15 Coins/cycle). Service utility plan only; sandbox environment.',
  },
];

export const INITIAL_PAYMENT_CONFIGURATIONS: Array<Omit<PaymentConfiguration, 'createdAt' | 'updatedAt'>> = [
  {
    configId: 'upi_cfg_alpha',
    label: 'Primary Sandbox Desk A',
    upiId: 'kestrel.desk.a@testupi',
    merchantName: 'Kestrel Sandbox Commerce A',
    provider: 'Sandbox UPI Gateway Alpha',
    enabled: true,
    mode: 'SANDBOX_ONLY',
  },
  {
    configId: 'upi_cfg_beta',
    label: 'Merchant Pool Desk B',
    upiId: 'kestrel.pool.b@testupi',
    merchantName: 'Kestrel Sandbox Commerce B',
    provider: 'Sandbox UPI Gateway Beta',
    enabled: true,
    mode: 'SANDBOX_ONLY',
  },
  {
    configId: 'upi_cfg_gamma',
    label: 'Settlement Node Desk C',
    upiId: 'kestrel.node.c@testupi',
    merchantName: 'Kestrel Sandbox Commerce C',
    provider: 'Sandbox UPI Gateway Gamma',
    enabled: true,
    mode: 'SANDBOX_ONLY',
  },
];

export function computeDailyScheduleAmounts(totalCredits: number, durationDays: number): number[] {
  const days = Math.max(1, Math.floor(durationDays));
  const total = Math.max(0, Math.round(totalCredits));
  const base = Math.floor(total / days);
  const remainder = total - base * days;
  const arr: number[] = [];
  for (let i = 0; i < days; i++) {
    arr.push(i === days - 1 ? base + remainder : base);
  }
  return arr;
}

export const INITIAL_CATALOG_SEED: Array<Omit<Product, 'createdAt' | 'updatedAt'>> = [
  {
    productId: 'prod_hardware_vault_x1',
    title: 'Kestrel Titanium Security Key & NFC Card',
    description:
      'Precision-milled brushed titanium FIDO2 hardware authenticator paired with a matte obsidian NFC verification card for enterprise workspace access.',
    category: 'Hardware',
    itemType: 'product',
    coinPrice: 2400,
    inrPrice: 2400,
    imageUrl: '/src/assets/images/product_hardware_vault_1795278016184.jpg',
    active: true,
    stock: 48,
    billingCycle: 'one_time',
    eligibility: 'Verified Kestrel accounts with confirmed email or phone profile.',
    terms: 'Physical hardware dispatch within 5 business days. 2-year hardware replacement warranty. Non-refundable once cryptographic seal is opened.',
    features: [
      'FIDO2 / WebAuthn hardware key',
      'Encrypted NFC tap card included',
      'Tamper-evident titanium housing',
      '24-month hardware warranty',
    ],
  },
  {
    productId: 'prod_pos_terminal_m2',
    title: 'Kestrel Wireless UPI & NFC Counter Terminal',
    description:
      'Compact matte graphite merchant checkout terminal engineered for contactless QR display, tap-to-pay acceptance, and instant ledger reconciliation.',
    category: 'Terminals',
    itemType: 'product',
    coinPrice: 6800,
    inrPrice: 6800,
    imageUrl: '/src/assets/images/product_pos_terminal_1795278017658.jpg',
    active: true,
    stock: 22,
    billingCycle: 'one_time',
    eligibility: 'Registered merchant or business workspace accounts in good standing.',
    terms: 'Includes sandbox test firmware preloaded. Live settlement activation requires independent KYC & acquirer onboarding.',
    features: [
      'Dynamic QR & NFC tap display',
      'Dual-band Wi-Fi and LTE fallback',
      '72-hour battery autonomy',
      'Receipt audit export support',
    ],
  },
  {
    productId: 'prod_exec_member_kit',
    title: 'Executive Leather Folio & Metal Member Kit',
    description:
      'Full-grain dark slate leather document folio accompanied by an anodized aluminum pen and serialized brushed steel membership credential.',
    category: 'Membership Kits',
    itemType: 'product',
    coinPrice: 1850,
    inrPrice: 1850,
    imageUrl: '/src/assets/images/product_merch_kit_1795278017842.jpg',
    active: true,
    stock: 65,
    billingCycle: 'one_time',
    eligibility: 'Available to all active platform members.',
    terms: 'Standard courier fulfillment included. 14-day unused return window.',
    features: [
      'Full-grain slate leather folio',
      'Precision-machined aluminum pen',
      'Laser-etched steel member card',
      'Priority support desk routing',
    ],
  },
  {
    productId: 'plan_merchant_analytics_pro',
    title: 'Merchant Ledger & AI Operations Plan',
    description:
      'Monthly software subscription providing automated ledger export, extended audit log retention, webhook replay tools, and multi-seat team roles.',
    category: 'Service Plans',
    itemType: 'plan',
    coinPrice: 950,
    inrPrice: 950,
    imageUrl: '/src/assets/images/product_enterprise_plan_1795278016480.jpg',
    active: true,
    stock: 500,
    billingCycle: 'monthly',
    eligibility: 'All verified user and merchant accounts.',
    terms: '30-day software service access per coin billing cycle. No guaranteed financial returns or profit-sharing claims. Cancel anytime.',
    features: [
      '12-month security audit retention',
      'CSV & JSON ledger exports',
      'Priority ticket triage SLA',
      'Up to 5 team operator seats',
    ],
  },
  {
    productId: 'plan_enterprise_compliance_suite',
    title: 'Annual Enterprise Compliance & Audit Suite',
    description:
      'Annual governance package covering custom webhook verification endpoints, dedicated security log archiving, and quarterly platform reviews.',
    category: 'Service Plans',
    itemType: 'plan',
    coinPrice: 9200,
    inrPrice: 9200,
    imageUrl: '/src/assets/images/product_enterprise_plan_1795278016480.jpg',
    active: true,
    stock: 200,
    billingCycle: 'annual',
    eligibility: 'Verified organizations requiring compliance-grade audit trails.',
    terms: '365-day software license for platform tooling and compliance exports only. Purely service-based fee; no investment yield.',
    features: [
      'Unlimited audit log history',
      'Dedicated sandbox webhook inspector',
      'Role-based admin seat controls',
      'Annual configuration review',
    ],
  },
];
