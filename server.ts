import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const BOOTSTRAPPED_SUPER_ADMIN_EMAIL = 'arvisaini16@gmail.com';
const HMAC_SECRET = process.env.LEDGER_HMAC_SECRET || crypto.randomBytes(32).toString('hex');
const OTP_SECRET = process.env.OTP_HMAC_SECRET || HMAC_SECRET;

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  authDomain?: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as FirebaseAppletConfig;
}

const firebaseConfig = loadFirebaseConfig();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

type AiModuleKey =
  | 'aiSmartAssistant'
  | 'aiAdminDashboard'
  | 'aiFraudDetection'
  | 'aiSmartSuggestions'
  | 'aiHelpdesk'
  | 'aiVoiceAssistant'
  | 'multilingualAi'
  | 'aiBusinessIntelligence'
  | 'aiThemeDesigner'
  | 'smartNotificationEngine'
  | 'aiDatabaseHealthMonitor';

interface StoredUser {
  uid: string;
  publicUserId: string;
  displayName: string;
  email: string;
  phone: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  photoURL: string;
  referralCode: string;
  referredBy: string;
  status: 'active' | 'suspended' | 'flagged';
  role: 'user' | 'admin' | 'super_admin';
  authMethod: 'google' | 'email_otp' | 'mobile_otp';
  twoFactorEnabled: boolean;
  privacyProfileVisible: boolean;
  privacyAnalyticsOptIn: boolean;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredWallet {
  userId: string;
  availableCoins: number;
  pendingCoins: number;
  totalPurchasedCoins: number;
  totalCreditedCoins: number;
  totalDebitedCoins: number;
  simulatedCommissionBalance: number;
  lastTxId: string;
  updatedAt: string;
}

interface StoredLedgerEntry {
  txId: string;
  userId: string;
  type: 'credit' | 'debit' | 'plan_credit' | 'commission_sim' | 'refund' | 'adjustment';
  amount: number;
  balanceAfter: number;
  referenceId: string;
  serverSignature: string;
  description: string;
  status: 'completed' | 'pending' | 'reversed';
  createdAt: string;
}

interface StoredCoinPackage {
  packageId: string;
  name: string;
  coinQuantity: number;
  purchasePrice: number;
  currency: string;
  description: string;
  status: 'active' | 'disabled' | 'archived';
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface StoredPlanConfig {
  planId: string;
  name: string;
  purchasePrice: number;
  currency: string;
  durationDays: number;
  totalScheduledCredits: number;
  creditIntervalHours: 24;
  description: string;
  status: 'active' | 'disabled' | 'archived';
  displayOrder: number;
  availableFrom: string;
  availableUntil: string;
  terms: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredPlanPurchase {
  purchaseId: string;
  userId: string;
  planId: string;
  planName: string;
  purchasePrice: number;
  currency: string;
  durationDays: number;
  totalScheduledCredits: number;
  creditIntervalHours: 24;
  completedEvents: number;
  totalEvents: number;
  creditedCoinsSoFar: number;
  status: 'active' | 'completed' | 'cancelled';
  activatedAtIso: string;
  completesAtIso: string;
  nextCreditAtIso: string;
  termsSnapshot: string;
  overrideReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredScheduleEvent {
  scheduleId: string;
  purchaseId: string;
  userId: string;
  eventIndex: number;
  scheduledCoins: number;
  dueAtIso: string;
  status: 'pending' | 'credited' | 'cancelled';
  creditedAtIso: string;
  txId: string;
}

interface StoredPaymentConfig {
  configId: string;
  label: string;
  upiId: string;
  merchantName: string;
  provider: string;
  enabled: boolean;
  mode: 'SANDBOX_ONLY';
  createdAt: string;
  updatedAt: string;
}

interface StoredProduct {
  productId: string;
  title: string;
  description: string;
  category: 'Hardware' | 'Terminals' | 'Membership Kits' | 'Service Plans';
  itemType: 'product' | 'plan';
  coinPrice: number;
  inrPrice: number;
  imageUrl: string;
  active: boolean;
  stock: number;
  billingCycle: 'one_time' | 'monthly' | 'annual';
  eligibility: string;
  terms: string;
  features: string[];
  createdAt: string;
  updatedAt: string;
}

interface StoredPayment {
  paymentId: string;
  userId: string;
  userEmail: string;
  idempotencyKey: string;
  amountInr: number;
  coinsRequested: number;
  upiApp: string;
  assignedConfigId: string;
  sandboxUpiId: string;
  gatewayProvider: string;
  status: 'initiated' | 'webhook_verified' | 'credited' | 'failed' | 'expired' | 'refunded';
  webhookEventId: string;
  serverSignature: string;
  failureReason: string;
  isSimulated: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredCoinRequest {
  requestId: string;
  userId: string;
  paymentId: string;
  amountInr: number;
  coinsRequested: number;
  status: 'pending' | 'approved' | 'rejected';
  adminNote: string;
  reviewedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredOrder {
  orderId: string;
  userId: string;
  productId: string;
  productTitle: string;
  itemType: 'product' | 'plan';
  quantity: number;
  coinAmount: number;
  status: 'completed' | 'fulfilled' | 'refunded';
  referenceId: string;
  serverSignature: string;
  createdAt: string;
  updatedAt: string;
}

type StoredWithdrawalStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'processing'
  | 'successful'
  | 'rejected'
  | 'failed';

interface StoredWithdrawal {
  withdrawalId: string;
  userId: string;
  userName?: string;
  userEmail: string;
  amountCoins: number;
  equivalentInr: number;
  payoutChannel: 'Simulated Bank Transfer' | 'Simulated UPI Sandbox';
  accountLabel: string;
  status: StoredWithdrawalStatus;
  payoutReferenceNumber?: string;
  providerConfirmed?: boolean;
  debitedFromWallet?: boolean;
  adminNote: string;
  reviewedBy: string;
  isSimulated: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredWalletTransaction {
  txId: string;
  idempotencyKey: string;
  userId: string;
  adminId: string;
  adminEmail: string;
  action: 'add' | 'deduct';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  status: 'completed';
  createdAt: string;
}

interface StoredAdminAuditLog {
  auditId: string;
  adminId: string;
  adminEmail: string;
  actionType:
    | 'COIN_ADD'
    | 'COIN_DEDUCT'
    | 'WITHDRAWAL_STATUS_UPDATE'
    | 'WITHDRAWAL_APPROVED'
    | 'WITHDRAWAL_REJECTED'
    | 'WITHDRAWAL_SUCCESSFUL'
    | 'WITHDRAWAL_FAILED'
    | 'ADMIN_USER_SEARCH'
    | 'USER_STATUS_UPDATED'
    | 'USER_IDS_MIGRATED';
  targetUserId: string;
  targetEntityId: string;
  amount: number;
  reason: string;
  payoutReferenceNumber: string;
  details: string;
  createdAt: string;
}

interface StoredTicket {
  ticketId: string;
  userId: string;
  userEmail: string;
  category: string;
  subject: string;
  description: string;
  attachmentName: string;
  attachmentDataUrl: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'normal' | 'high';
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredTicketMessage {
  messageId: string;
  ticketId: string;
  senderId: string;
  senderRole: 'user' | 'admin';
  senderName: string;
  body: string;
  createdAt: string;
}

interface StoredNotification {
  notificationId: string;
  userId: string;
  title: string;
  body: string;
  category: 'wallet' | 'plan' | 'payment' | 'support' | 'security' | 'system';
  read: boolean;
  createdAt: string;
}

interface StoredSecurityLog {
  logId: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  severity: 'info' | 'warning' | 'critical';
  targetId: string;
  details: string;
  ipHint: string;
  createdAt: string;
}

interface StoredAdminRole {
  uid: string;
  email: string;
  role: 'super_admin' | 'admin' | 'support_staff' | 'read_only_staff' | 'finance_admin' | 'support_admin';
  permissions: string[];
  grantedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredAdminSettings {
  settingId: string;
  brandName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  accentColor: string;
  defaultTheme: 'light' | 'dark';
  tickerEnabled: boolean;
  referralsEnabled: boolean;
  withdrawalsEnabled: boolean;
  whatsappNumber: string;
  telegramUrl: string;
  supportEmail: string;
  updatedBy: string;
  updatedAt: string;
}

interface StoredAiFeatureSettings {
  settingId: string;
  masterEnabled: boolean;
  dailyLimitPerUser: number;
  aiSmartAssistant: boolean;
  aiAdminDashboard: boolean;
  aiFraudDetection: boolean;
  aiSmartSuggestions: boolean;
  aiHelpdesk: boolean;
  aiVoiceAssistant: boolean;
  multilingualAi: boolean;
  aiBusinessIntelligence: boolean;
  aiThemeDesigner: boolean;
  smartNotificationEngine: boolean;
  aiDatabaseHealthMonitor: boolean;
  updatedBy: string;
  updatedAt: string;
}

interface StoredGatewayConfig {
  configId: string;
  gatewayMode: 'SANDBOX_ONLY';
  providerName: string;
  sandboxVpa: string;
  merchantName: string;
  coinRateInr: number;
  minWithdrawalCoins: number;
  maxDailyWithdrawalCoins: number;
  realMoneyDisabledNotice: string;
  updatedBy: string;
  updatedAt: string;
}

interface StoredAiUsageLog {
  logId: string;
  userId: string;
  userEmail: string;
  moduleKey: AiModuleKey;
  language: 'en' | 'hi';
  success: boolean;
  errorMessage: string;
  latencyMs: number;
  createdAtIso: string;
}

interface StoredSystemHealthLog {
  healthId: string;
  service: string;
  status: 'ok' | 'degraded' | 'error';
  message: string;
  createdAtIso: string;
}

interface PlatformStore {
  userCounter: number;
  users: StoredUser[];
  wallets: StoredWallet[];
  ledger: StoredLedgerEntry[];
  coinPackages: StoredCoinPackage[];
  plans: StoredPlanConfig[];
  planPurchases: StoredPlanPurchase[];
  planCreditSchedules: StoredScheduleEvent[];
  paymentConfigurations: StoredPaymentConfig[];
  products: StoredProduct[];
  payments: StoredPayment[];
  coinRequests: StoredCoinRequest[];
  orders: StoredOrder[];
  withdrawals: StoredWithdrawal[];
  walletTransactions: StoredWalletTransaction[];
  adminAuditLogs: StoredAdminAuditLog[];
  tickets: StoredTicket[];
  ticketMessages: StoredTicketMessage[];
  notifications: StoredNotification[];
  securityLogs: StoredSecurityLog[];
  admins: StoredAdminRole[];
  adminSettings: StoredAdminSettings;
  aiFeatureSettings: StoredAiFeatureSettings;
  gatewayConfig: StoredGatewayConfig;
  aiUsageLogs: StoredAiUsageLog[];
  systemHealthLogs: StoredSystemHealthLog[];
}

const DATA_DIR = path.resolve(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'kestrel-backend.json');

function createDefaultStore(): PlatformStore {
  const now = new Date().toISOString();
  return {
    userCounter: 0,
    users: [],
    wallets: [],
    ledger: [],
    coinPackages: [
      { packageId: 'pkg_100', name: 'Starter 100 Coins', coinQuantity: 100, purchasePrice: 100, currency: 'INR', description: 'Entry-level sandbox coin pack for quick testing.', status: 'active', displayOrder: 1, createdAt: now, updatedAt: now },
      { packageId: 'pkg_200', name: 'Basic 200 Coins', coinQuantity: 200, purchasePrice: 200, currency: 'INR', description: 'Standard 200 coin ledger credit bundle.', status: 'active', displayOrder: 2, createdAt: now, updatedAt: now },
      { packageId: 'pkg_400', name: 'Plus 400 Coins', coinQuantity: 400, purchasePrice: 400, currency: 'INR', description: 'Ideal for short-cycle plan enrollment.', status: 'active', displayOrder: 3, createdAt: now, updatedAt: now },
      { packageId: 'pkg_500', name: 'Core 500 Coins', coinQuantity: 500, purchasePrice: 500, currency: 'INR', description: 'Mid-tier sandbox treasury allocation.', status: 'active', displayOrder: 4, createdAt: now, updatedAt: now },
      { packageId: 'pkg_1000', name: 'Growth 1,000 Coins', coinQuantity: 1000, purchasePrice: 1000, currency: 'INR', description: 'Covers standard hardware & workspace plans.', status: 'active', displayOrder: 5, createdAt: now, updatedAt: now },
      { packageId: 'pkg_2000', name: 'Merchant 2,000 Coins', coinQuantity: 2000, purchasePrice: 2000, currency: 'INR', description: 'Built for multi-order sandbox fulfillment.', status: 'active', displayOrder: 6, createdAt: now, updatedAt: now },
      { packageId: 'pkg_10000', name: 'Treasury 10,000 Coins', coinQuantity: 10000, purchasePrice: 10000, currency: 'INR', description: 'High-volume merchant POS & annual plan balance.', status: 'active', displayOrder: 7, createdAt: now, updatedAt: now },
      { packageId: 'pkg_50000', name: 'Enterprise 50,000 Coins', coinQuantity: 50000, purchasePrice: 50000, currency: 'INR', description: 'Maximum sandbox treasury cap for enterprise QA.', status: 'active', displayOrder: 8, createdAt: now, updatedAt: now },
    ],
    plans: [
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
        createdAt: now,
        updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
      },
    ],
    planPurchases: [],
    planCreditSchedules: [],
    paymentConfigurations: [
      { configId: 'upi_cfg_alpha', label: 'Primary Sandbox Desk A', upiId: 'kestrel.desk.a@testupi', merchantName: 'Kestrel Sandbox Commerce A', provider: 'Sandbox UPI Gateway Alpha', enabled: true, mode: 'SANDBOX_ONLY', createdAt: now, updatedAt: now },
      { configId: 'upi_cfg_beta', label: 'Merchant Pool Desk B', upiId: 'kestrel.pool.b@testupi', merchantName: 'Kestrel Sandbox Commerce B', provider: 'Sandbox UPI Gateway Beta', enabled: true, mode: 'SANDBOX_ONLY', createdAt: now, updatedAt: now },
      { configId: 'upi_cfg_gamma', label: 'Settlement Node Desk C', upiId: 'kestrel.node.c@testupi', merchantName: 'Kestrel Sandbox Commerce C', provider: 'Sandbox UPI Gateway Gamma', enabled: true, mode: 'SANDBOX_ONLY', createdAt: now, updatedAt: now },
    ],
    products: [
      {
        productId: 'prod_hardware_vault_x1',
        title: 'Kestrel Titanium Security Key & NFC Card',
        description: 'Precision-milled brushed titanium FIDO2 hardware authenticator paired with a matte obsidian NFC verification card for enterprise workspace access.',
        category: 'Hardware',
        itemType: 'product',
        coinPrice: 2400,
        inrPrice: 2400,
        imageUrl: '/src/assets/images/product_hardware_vault_1795278016184.jpg',
        active: true,
        stock: 48,
        billingCycle: 'one_time',
        eligibility: 'Verified Kestrel accounts with confirmed email or phone profile.',
        terms: 'Physical hardware dispatch within 5 business days. 2-year hardware replacement warranty.',
        features: ['FIDO2 / WebAuthn hardware key', 'Encrypted NFC tap card included', 'Tamper-evident titanium housing', '24-month hardware warranty'],
        createdAt: now,
        updatedAt: now,
      },
      {
        productId: 'prod_pos_terminal_m2',
        title: 'Kestrel Wireless UPI & NFC Counter Terminal',
        description: 'Compact matte graphite merchant checkout terminal engineered for contactless QR display, tap-to-pay acceptance, and instant ledger reconciliation.',
        category: 'Terminals',
        itemType: 'product',
        coinPrice: 6800,
        inrPrice: 6800,
        imageUrl: '/src/assets/images/product_pos_terminal_1795278017658.jpg',
        active: true,
        stock: 22,
        billingCycle: 'one_time',
        eligibility: 'Registered merchant or business workspace accounts in good standing.',
        terms: 'Includes sandbox test firmware preloaded. Live settlement activation requires independent KYC.',
        features: ['Dynamic QR & NFC tap display', 'Dual-band Wi-Fi and LTE fallback', '72-hour battery autonomy', 'Receipt audit export support'],
        createdAt: now,
        updatedAt: now,
      },
      {
        productId: 'prod_exec_member_kit',
        title: 'Executive Leather Folio & Metal Member Kit',
        description: 'Full-grain dark slate leather document folio accompanied by an anodized aluminum pen and serialized brushed steel membership credential.',
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
        features: ['Full-grain slate leather folio', 'Precision-machined aluminum pen', 'Laser-etched steel member card', 'Priority support desk routing'],
        createdAt: now,
        updatedAt: now,
      },
    ],
    payments: [],
    coinRequests: [],
    orders: [],
    withdrawals: [],
    walletTransactions: [],
    adminAuditLogs: [],
    tickets: [],
    ticketMessages: [],
    notifications: [],
    securityLogs: [],
    admins: [
      {
        uid: 'admin_boot_arvi',
        email: BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
        role: 'super_admin',
        permissions: ['users', 'products', 'plans', 'ledger', 'withdrawals', 'support', 'ai', 'config'],
        grantedBy: 'system_bootstrap',
        createdAt: now,
        updatedAt: now,
      },
    ],
    adminSettings: {
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
      updatedBy: BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
      updatedAt: now,
    },
    aiFeatureSettings: {
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
      updatedBy: BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
      updatedAt: now,
    },
    gatewayConfig: {
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
      updatedBy: BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
      updatedAt: now,
    },
    aiUsageLogs: [],
    systemHealthLogs: [
      {
        healthId: 'hlth_boot',
        service: 'ledger-scheduler',
        status: 'ok',
        message: '24-hour automatic plan credit scheduler initialized cleanly.',
        createdAtIso: now,
      },
    ],
  };
}

function loadStore(): PlatformStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      const def = createDefaultStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(def, null, 2));
      return def;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PlatformStore>;
    const def = createDefaultStore();
    const parsedAdmin: Partial<PlatformStore['adminSettings']> = parsed.adminSettings || {};
    const mergedAdminSettings = {
      ...def.adminSettings,
      ...parsedAdmin,
      logoUrl: !parsedAdmin.logoUrl || parsedAdmin.logoUrl === '/icon.svg' ? def.adminSettings.logoUrl : parsedAdmin.logoUrl,
      faviconUrl:
        !parsedAdmin.faviconUrl || parsedAdmin.faviconUrl === '/icon.svg'
          ? def.adminSettings.faviconUrl
          : parsedAdmin.faviconUrl,
    };
    const mergedStore: PlatformStore = {
      ...def,
      ...parsed,
      userCounter: typeof parsed.userCounter === 'number' && parsed.userCounter >= 0 ? parsed.userCounter : 0,
      walletTransactions: parsed.walletTransactions || [],
      adminAuditLogs: parsed.adminAuditLogs || [],
      adminSettings: mergedAdminSettings,
      aiFeatureSettings: { ...def.aiFeatureSettings, ...(parsed.aiFeatureSettings || {}) },
      gatewayConfig: { ...def.gatewayConfig, ...(parsed.gatewayConfig || {}) },
    };

    // Idempotent historical migration: assign UID001, UID002... to any legacy users missing publicUserId
    let maxSeq = mergedStore.userCounter;
    const usedIds = new Set<string>();
    for (const u of mergedStore.users) {
      if (typeof u.publicUserId === 'string' && /^UID[0-9]{3,}$/.test(u.publicUserId)) {
        usedIds.add(u.publicUserId);
        const parsedSeq = Number(u.publicUserId.slice(3));
        if (Number.isFinite(parsedSeq) && parsedSeq > maxSeq) maxSeq = parsedSeq;
      }
    }
    const sortedByAge = [...mergedStore.users].sort(
      (a, b) => Date.parse(a.createdAt || '') - Date.parse(b.createdAt || '')
    );
    let mutated = false;
    for (const u of sortedByAge) {
      if (!u.publicUserId || !/^UID[0-9]{3,}$/.test(u.publicUserId)) {
        let candidate = '';
        do {
          maxSeq += 1;
          candidate = `UID${maxSeq < 1000 ? String(maxSeq).padStart(3, '0') : String(maxSeq)}`;
        } while (usedIds.has(candidate));
        u.publicUserId = candidate;
        usedIds.add(candidate);
        mutated = true;
      }
      if (!u.lastLoginAt) {
        u.lastLoginAt = u.updatedAt || u.createdAt || new Date().toISOString();
      }
    }
    if (mergedStore.userCounter !== maxSeq) {
      mergedStore.userCounter = maxSeq;
      mutated = true;
    }
    if (mutated) {
      fs.writeFileSync(STORE_PATH, JSON.stringify(mergedStore, null, 2));
    }
    return mergedStore;
  } catch (err) {
    console.error('Store initialization error, using defaults:', err);
    return createDefaultStore();
  }
}

const store: PlatformStore = loadStore();

function formatPublicUserId(seq: number): string {
  const safe = Math.max(1, Math.floor(seq));
  return `UID${safe < 1000 ? String(safe).padStart(3, '0') : String(safe)}`;
}

function allocateNextPublicUserId(): string {
  const used = new Set(store.users.map((u) => u.publicUserId).filter(Boolean));
  let seq = Number(store.userCounter || 0);
  for (const existing of store.users) {
    if (typeof existing.publicUserId === 'string' && /^UID[0-9]{3,}$/.test(existing.publicUserId)) {
      const n = Number(existing.publicUserId.slice(3));
      if (Number.isFinite(n) && n > seq) seq = n;
    }
  }
  let candidate = '';
  do {
    seq += 1;
    candidate = formatPublicUserId(seq);
  } while (used.has(candidate));
  store.userCounter = seq;
  return candidate;
}

function persistStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2));
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

interface VerifiedCaller {
  uid: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  displayName: string;
  authMethod: 'google' | 'email_otp' | 'mobile_otp';
}

interface AuthenticatedRequest extends Request {
  caller?: VerifiedCaller;
}

interface OtpChallenge {
  channel: 'email' | 'mobile';
  identifier: string;
  salt: string;
  otpHash: string;
  expiresAt: number;
  lastSentAt: number;
  requestTimestamps: number[];
  failedAttempts: number;
  lockedUntil: number;
}

const otpChallenges = new Map<string, OtpChallenge>();
const revokedTokens = new Set<string>();
const processedIdempotencyKeys = new Map<string, { paymentId: string; createdAt: number }>();
const processedWebhookEvents = new Set<string>();
const authorizedAdminEmails = new Set<string>([
  BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
  ...store.admins.map((a) => a.email.toLowerCase()),
]);

function signPayload(parts: Array<string | number | boolean>): string {
  const hmac = crypto.createHmac('sha256', HMAC_SECRET);
  hmac.update(parts.join('|'));
  return hmac.digest('hex').slice(0, 48);
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
}

function hashOtp(code: string, salt: string): string {
  return crypto.scryptSync(code, salt, 32).toString('hex');
}

function verifyOtpHash(code: string, salt: string, expectedHex: string): boolean {
  const derived = crypto.scryptSync(code, salt, 32);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function issueOtpSessionToken(user: StoredUser): string {
  const payload = {
    uid: user.uid,
    email: user.email,
    phone: user.phone,
    authMethod: user.authMethod,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    jti: makeId('jti'),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', OTP_SECRET).update(encoded).digest('base64url');
  return `kestrel_otp_${encoded}.${sig}`;
}

function verifyOtpSessionToken(token: string): VerifiedCaller {
  if (!token.startsWith('kestrel_otp_') || revokedTokens.has(token)) {
    throw new Error('Invalid or signed-out OTP session token.');
  }
  const raw = token.slice('kestrel_otp_'.length);
  const parts = raw.split('.');
  if (parts.length !== 2) {
    throw new Error('Malformed OTP session token.');
  }
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', OTP_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Session signature verification failed.');
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as {
    uid: string;
    email: string;
    phone: string;
    authMethod: 'email_otp' | 'mobile_otp';
    exp: number;
  };
  if (Date.now() > payload.exp) {
    throw new Error('OTP session token has expired. Please sign in again.');
  }
  const storedUser = store.users.find((u) => u.uid === payload.uid);
  if (!storedUser) {
    throw new Error('Account no longer exists.');
  }
  if (storedUser.status === 'suspended') {
    throw new Error('Account is suspended.');
  }
  return {
    uid: storedUser.uid,
    email: storedUser.email,
    phone: storedUser.phone,
    emailVerified: storedUser.emailVerified,
    phoneVerified: storedUser.phoneVerified,
    displayName: storedUser.displayName,
    authMethod: storedUser.authMethod === 'google' ? 'email_otp' : storedUser.authMethod,
  };
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedCaller> {
  if (!idToken || typeof idToken !== 'string' || idToken.length < 20) {
    throw new Error('Missing or malformed session token.');
  }

  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!resp.ok) {
    throw new Error('Firebase token verification rejected.');
  }

  const data = (await resp.json()) as {
    users?: Array<{
      localId?: string;
      email?: string;
      emailVerified?: boolean;
      displayName?: string;
      phoneNumber?: string;
    }>;
  };

  const user = data.users?.[0];
  if (!user || !user.localId || !user.email) {
    throw new Error('Verified user record incomplete.');
  }

  return {
    uid: user.localId,
    email: user.email.toLowerCase(),
    phone: user.phoneNumber || '',
    emailVerified: Boolean(user.emailVerified),
    phoneVerified: Boolean(user.phoneNumber),
    displayName: user.displayName || user.email.split('@')[0],
    authMethod: 'google',
  };
}

async function resolveCallerFromToken(token: string): Promise<VerifiedCaller> {
  if (token.startsWith('kestrel_otp_')) {
    return verifyOtpSessionToken(token);
  }
  return verifyFirebaseIdToken(token);
}

function ensureServerUserAndWallet(caller: VerifiedCaller): { user: StoredUser; wallet: StoredWallet } {
  const now = new Date().toISOString();
  let user = store.users.find(
    (u) =>
      u.uid === caller.uid ||
      (caller.email && u.email && u.email.toLowerCase() === caller.email.toLowerCase()) ||
      (caller.phone && u.phone && u.phone === caller.phone)
  );
  if (!user) {
    const publicUserId = allocateNextPublicUserId();
    user = {
      uid: caller.uid,
      publicUserId,
      displayName: caller.displayName || 'Member',
      email: caller.email,
      phone: caller.phone,
      phoneVerified: caller.phoneVerified,
      emailVerified: caller.emailVerified,
      photoURL: '',
      referralCode: `KST${caller.uid.slice(0, 6).toUpperCase()}`,
      referredBy: '',
      status: 'active',
      role: authorizedAdminEmails.has(caller.email.toLowerCase()) ? 'super_admin' : 'user',
      authMethod: caller.authMethod,
      twoFactorEnabled: false,
      privacyProfileVisible: false,
      privacyAnalyticsOptIn: true,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    };
    store.users.push(user);
    persistStore();
  } else {
    let dirty = false;
    if (!user.publicUserId || !/^UID[0-9]{3,}$/.test(user.publicUserId)) {
      user.publicUserId = allocateNextPublicUserId();
      dirty = true;
    }
    if (!user.lastLoginAt) {
      user.lastLoginAt = now;
      dirty = true;
    }
    if (dirty) persistStore();
  }
  let wallet = store.wallets.find((w) => w.userId === user!.uid);
  if (!wallet) {
    wallet = {
      userId: user.uid,
      availableCoins: 0,
      pendingCoins: 0,
      totalPurchasedCoins: 0,
      totalCreditedCoins: 0,
      totalDebitedCoins: 0,
      simulatedCommissionBalance: 0,
      lastTxId: 'init',
      updatedAt: now,
    };
    store.wallets.push(wallet);
    persistStore();
  }
  return { user, wallet };
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required (Bearer token missing).' });
      return;
    }
    const token = authHeader.slice(7).trim();
    const caller = await resolveCallerFromToken(token);
    if (caller.authMethod === 'google' && !caller.emailVerified) {
      res.status(403).json({ error: 'Verified email address required for this operation.' });
      return;
    }
    ensureServerUserAndWallet(caller);
    req.caller = caller;
    next();
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Invalid session token.' });
  }
}

function getCallerAdminRole(caller: VerifiedCaller): StoredAdminRole['role'] | null {
  const email = caller.email.toLowerCase();
  const roleRec = store.admins.find((a) => a.uid === caller.uid || (email && a.email.toLowerCase() === email));
  if (roleRec) return roleRec.role;
  if (email === BOOTSTRAPPED_SUPER_ADMIN_EMAIL || (email && authorizedAdminEmails.has(email))) {
    return 'super_admin';
  }
  return null;
}

function isCallerAdmin(caller: VerifiedCaller): boolean {
  return getCallerAdminRole(caller) !== null;
}

function canAdminViewFullPii(role: StoredAdminRole['role'] | null): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'finance_admin';
}

function canAdminMutateFinancials(role: StoredAdminRole['role'] | null): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'finance_admin';
}

function maskEmailValue(email: string): string {
  if (!email || !email.includes('@')) return email ? `${email.slice(0, 2)}***` : '';
  const [local, domain] = email.split('@');
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}

function maskPhoneValue(phone: string): string {
  if (!phone) return '';
  if (phone.length <= 4) return '****';
  return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
}

async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    const caller = req.caller;
    if (!caller || !isCallerAdmin(caller)) {
      res.status(403).json({ error: 'Super Admin or authorized Administrator privileges required.' });
      return;
    }
    next();
  });
}

function isValidSafeId(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0 && val.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(val);
}

function addSecurityLog(params: {
  actorUid: string;
  actorEmail: string;
  action: string;
  severity: 'info' | 'warning' | 'critical';
  targetId: string;
  details: string;
}) {
  store.securityLogs.unshift({
    logId: makeId('log'),
    actorUid: params.actorUid,
    actorEmail: params.actorEmail.slice(0, 160),
    action: params.action.slice(0, 120),
    severity: params.severity,
    targetId: params.targetId.slice(0, 128),
    details: params.details.slice(0, 500),
    ipHint: 'server-api',
    createdAt: new Date().toISOString(),
  });
  if (store.securityLogs.length > 500) {
    store.securityLogs.length = 500;
  }
}

function addNotification(params: {
  userId: string;
  title: string;
  body: string;
  category: StoredNotification['category'];
}) {
  store.notifications.unshift({
    notificationId: makeId('ntf'),
    userId: params.userId,
    title: params.title.slice(0, 140),
    body: params.body.slice(0, 500),
    category: params.category,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

function computeDailyAmounts(totalCredits: number, durationDays: number): number[] {
  const days = Math.max(1, Math.floor(durationDays));
  const total = Math.max(0, Math.round(totalCredits));
  const base = Math.floor(total / days);
  const rem = total - base * days;
  const out: number[] = [];
  for (let i = 0; i < days; i++) {
    out.push(i === days - 1 ? base + rem : base);
  }
  return out;
}

// --- 24-Hour Automatic Plan Credit Engine ---
let schedulerRunning = false;

function processDuePlanCredits(actorLabel = 'auto_24h_scheduler'): {
  processedCount: number;
  creditedCoins: number;
  completedPlans: number;
  ranAtIso: string;
} {
  if (schedulerRunning) {
    return { processedCount: 0, creditedCoins: 0, completedPlans: 0, ranAtIso: new Date().toISOString() };
  }
  schedulerRunning = true;
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  let processedCount = 0;
  let creditedCoins = 0;
  let completedPlans = 0;

  try {
    for (const evt of store.planCreditSchedules) {
      if (evt.status !== 'pending') continue;
      if (Date.parse(evt.dueAtIso) > nowMs) continue;

      const purchase = store.planPurchases.find((p) => p.purchaseId === evt.purchaseId);
      if (!purchase || purchase.status !== 'active') {
        evt.status = 'cancelled';
        continue;
      }

      const wallet = store.wallets.find((w) => w.userId === evt.userId);
      if (!wallet) continue;

      const txId = makeId('tx');
      const sig = signPayload(['PLAN_CREDIT', txId, evt.userId, evt.scheduledCoins, evt.scheduleId]);

      evt.status = 'credited';
      evt.creditedAtIso = nowIso;
      evt.txId = txId;

      wallet.availableCoins += evt.scheduledCoins;
      wallet.totalCreditedCoins = (wallet.totalCreditedCoins || 0) + evt.scheduledCoins;
      wallet.lastTxId = txId;
      wallet.updatedAt = nowIso;

      store.ledger.unshift({
        txId,
        userId: evt.userId,
        type: 'plan_credit',
        amount: evt.scheduledCoins,
        balanceAfter: wallet.availableCoins,
        referenceId: evt.purchaseId,
        serverSignature: sig,
        description: `${purchase.planName} · 24h cycle #${evt.eventIndex}/${purchase.totalEvents}`,
        status: 'completed',
        createdAt: nowIso,
      });

      purchase.completedEvents += 1;
      purchase.creditedCoinsSoFar += evt.scheduledCoins;
      purchase.updatedAt = nowIso;

      const nextPending = store.planCreditSchedules
        .filter((s) => s.purchaseId === purchase.purchaseId && s.status === 'pending')
        .sort((a, b) => Date.parse(a.dueAtIso) - Date.parse(b.dueAtIso))[0];

      if (nextPending) {
        purchase.nextCreditAtIso = nextPending.dueAtIso;
      } else {
        purchase.status = 'completed';
        purchase.nextCreditAtIso = '';
        completedPlans += 1;
      }

      addNotification({
        userId: evt.userId,
        title: `24h Plan Credit: +${evt.scheduledCoins} Coins`,
        body: `Cycle ${evt.eventIndex}/${purchase.totalEvents} for ${purchase.planName} credited ${evt.scheduledCoins} coins (Ref ${txId}).`,
        category: 'plan',
      });

      addSecurityLog({
        actorUid: actorLabel,
        actorEmail: actorLabel,
        action: 'PLAN_24H_CREDIT_EXECUTED',
        severity: 'info',
        targetId: purchase.purchaseId,
        details: `Credited ${evt.scheduledCoins} coins (${evt.eventIndex}/${purchase.totalEvents}) to ${evt.userId}.`,
      });

      processedCount += 1;
      creditedCoins += evt.scheduledCoins;
    }

    if (processedCount > 0) {
      persistStore();
    }
  } catch (err) {
    store.systemHealthLogs.unshift({
      healthId: makeId('hlth'),
      service: 'plan-24h-scheduler',
      status: 'error',
      message: err instanceof Error ? err.message : 'Scheduler run failed',
      createdAtIso: nowIso,
    });
    persistStore();
  } finally {
    schedulerRunning = false;
  }

  return { processedCount, creditedCoins, completedPlans, ranAtIso: nowIso };
}

function getRealTickerEvents() {
  if (!store.adminSettings.tickerEnabled) return [];
  const events: Array<{
    eventId: string;
    maskedUserId: string;
    eventType: 'coin_credit' | 'withdrawal_completed';
    amountCoins: number;
    verifiedLabel: string;
    timestampIso: string;
  }> = [];

  for (const entry of store.ledger) {
    if ((entry.type === 'credit' || entry.type === 'plan_credit') && entry.status === 'completed') {
      const uid = entry.userId;
      const masked = uid.length > 8 ? `${uid.slice(0, 4)}···${uid.slice(-4)}` : uid;
      events.push({
        eventId: entry.txId,
        maskedUserId: masked,
        eventType: 'coin_credit',
        amountCoins: entry.amount,
        verifiedLabel: entry.type === 'plan_credit' ? 'Verified 24h Plan Credit' : 'Verified Coin Addition',
        timestampIso: entry.createdAt,
      });
    }
  }

  for (const wd of store.withdrawals) {
    if (wd.status === 'successful' && wd.providerConfirmed === true) {
      const uid = wd.userId;
      const masked = uid.length > 8 ? `${uid.slice(0, 4)}···${uid.slice(-4)}` : uid;
      events.push({
        eventId: wd.withdrawalId,
        maskedUserId: masked,
        eventType: 'withdrawal_completed',
        amountCoins: wd.amountCoins,
        verifiedLabel: 'Settled Withdrawal',
        timestampIso: wd.updatedAt,
      });
    }
  }

  return events
    .sort((a, b) => Date.parse(b.timestampIso) - Date.parse(a.timestampIso))
    .slice(0, 20);
}

async function runGeminiModule(params: {
  caller: VerifiedCaller;
  moduleKey: AiModuleKey;
  language?: 'en' | 'hi';
  isVoice?: boolean;
  prompt: string;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
}) {
  const aiCfg = store.aiFeatureSettings;
  const lang: 'en' | 'hi' = params.language === 'hi' ? 'hi' : 'en';

  if (!aiCfg.masterEnabled) {
    throw new Error('AI features are currently disabled by the administrator.');
  }
  if (!aiCfg[params.moduleKey]) {
    throw new Error(`The "${params.moduleKey}" module is currently disabled by the administrator.`);
  }
  if (lang === 'hi' && !aiCfg.multilingualAi) {
    throw new Error('Multilingual AI (Hindi support) is currently disabled by the administrator.');
  }
  if (params.isVoice && !aiCfg.aiVoiceAssistant) {
    throw new Error('AI Voice Assistant is currently disabled by the administrator.');
  }

  // Daily quota check per user
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayCount = store.aiUsageLogs.filter(
    (l) => l.userId === params.caller.uid && Date.parse(l.createdAtIso) >= dayStart.getTime()
  ).length;

  if (todayCount >= aiCfg.dailyLimitPerUser && !isCallerAdmin(params.caller)) {
    throw new Error(`Daily AI usage limit (${aiCfg.dailyLimitPerUser}) reached for today.`);
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in server secrets.');
  }

  const startedAt = Date.now();
  try {
    const langInstruction =
      lang === 'hi'
        ? 'Respond in clear, natural Hindi (Devanagari script) while keeping technical IDs and coin numbers intact.'
        : 'Respond in clear, concise English.';

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: params.prompt,
      config: {
        systemInstruction: `${params.systemInstruction} ${langInstruction}`,
        responseMimeType: 'application/json',
        responseSchema: params.responseSchema as never,
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
    store.aiUsageLogs.unshift({
      logId: makeId('ailog'),
      userId: params.caller.uid,
      userEmail: params.caller.email || params.caller.phone,
      moduleKey: params.moduleKey,
      language: lang,
      success: true,
      errorMessage: '',
      latencyMs: Date.now() - startedAt,
      createdAtIso: new Date().toISOString(),
    });
    if (store.aiUsageLogs.length > 300) store.aiUsageLogs.length = 300;
    persistStore();
    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gemini API call failed.';
    store.aiUsageLogs.unshift({
      logId: makeId('ailog'),
      userId: params.caller.uid,
      userEmail: params.caller.email || params.caller.phone,
      moduleKey: params.moduleKey,
      language: lang,
      success: false,
      errorMessage: msg.slice(0, 300),
      latencyMs: Date.now() - startedAt,
      createdAtIso: new Date().toISOString(),
    });
    store.systemHealthLogs.unshift({
      healthId: makeId('hlth'),
      service: `ai:${params.moduleKey}`,
      status: 'degraded',
      message: msg.slice(0, 300),
      createdAtIso: new Date().toISOString(),
    });
    persistStore();
    throw err;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Start 24-hour scheduled plan credit processor (checks every 60s)
  processDuePlanCredits('startup_recovery');
  setInterval(() => {
    processDuePlanCredits('auto_24h_scheduler');
  }, 60_000);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'kestrel-ledger-commerce',
      mode: 'SANDBOX_ONLY',
      schedulerActive: true,
      authModes: ['google_firebase', 'email_otp', 'mobile_otp'],
    });
  });

  // --- PUBLIC BOOTSTRAP & LIVE REAL ACTIVITY TICKER ---
  app.get('/api/v1/public/bootstrap', (_req: Request, res: Response) => {
    res.json({
      coinPackages: store.coinPackages.filter((p) => p.status === 'active').sort((a, b) => a.displayOrder - b.displayOrder),
      plans: store.plans.filter((p) => p.status === 'active').sort((a, b) => a.displayOrder - b.displayOrder),
      products: store.products.filter((p) => p.active),
      adminSettings: store.adminSettings,
      aiFeatureSettings: store.aiFeatureSettings,
      gatewayConfig: store.gatewayConfig,
      ticker: getRealTickerEvents(),
    });
  });

  app.get('/api/v1/ticker', (_req: Request, res: Response) => {
    res.json({
      enabled: store.adminSettings.tickerEnabled,
      events: getRealTickerEvents(),
    });
  });

  // --- AUTHENTICATION: OPTION A (MOBILE OTP) & OPTION B (EMAIL OTP) ---
  app.post('/api/v1/auth/otp/request', async (req: Request, res: Response) => {
    const { channel, identifier, displayName, mode } = req.body as {
      channel?: 'email' | 'mobile';
      identifier?: string;
      displayName?: string;
      mode?: 'login' | 'register';
    };

    if (channel !== 'email' && channel !== 'mobile') {
      res.status(400).json({ error: 'Channel must be "email" or "mobile".' });
      return;
    }
    const cleanId = typeof identifier === 'string' ? identifier.trim() : '';
    const normalizedId = channel === 'email' ? cleanId.toLowerCase() : cleanId.replace(/\s+/g, '');

    if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedId)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (channel === 'mobile' && !/^\+?[0-9]{8,15}$/.test(normalizedId)) {
      res.status(400).json({ error: 'Please enter a valid mobile number (8-15 digits, optional +).' });
      return;
    }

    const existingUser = store.users.find((u) =>
      channel === 'email' ? u.email.toLowerCase() === normalizedId : u.phone === normalizedId
    );
    if (mode === 'register' && existingUser) {
      res.status(409).json({
        error: `An account with this ${channel === 'email' ? 'email' : 'mobile number'} already exists. Switch to Sign In.`,
      });
      return;
    }

    const challengeKey = `${channel}:${normalizedId}`;
    const now = Date.now();
    const existingChallenge = otpChallenges.get(challengeKey);

    if (existingChallenge) {
      if (existingChallenge.lockedUntil > now) {
        const mins = Math.ceil((existingChallenge.lockedUntil - now) / 60000);
        res.status(429).json({ error: `Too many failed attempts. Locked for ${mins} minute(s).` });
        return;
      }
      if (now - existingChallenge.lastSentAt < 30_000) {
        const secs = Math.ceil((30_000 - (now - existingChallenge.lastSentAt)) / 1000);
        res.status(429).json({ error: `Please wait ${secs}s before requesting another OTP.` });
        return;
      }
      const recentReqs = existingChallenge.requestTimestamps.filter((t) => now - t < 5 * 60_000);
      if (recentReqs.length >= 3) {
        res.status(429).json({ error: 'OTP rate limit reached (max 3 per 5 minutes). Try again shortly.' });
        return;
      }
    }

    const code = String(crypto.randomInt(100000, 999999));
    const salt = crypto.randomBytes(16).toString('hex');
    const otpHash = hashOtp(code, salt);
    const prevReqs = existingChallenge ? existingChallenge.requestTimestamps.filter((t) => now - t < 5 * 60_000) : [];

    otpChallenges.set(challengeKey, {
      channel,
      identifier: normalizedId,
      salt,
      otpHash,
      expiresAt: now + 5 * 60_000,
      lastSentAt: now,
      requestTimestamps: [...prevReqs, now],
      failedAttempts: existingChallenge?.failedAttempts || 0,
      lockedUntil: 0,
    });

    // Optional real provider dispatch if keys exist
    let deliveryMode: 'live_email' | 'live_sms' | 'sandbox_preview' = 'sandbox_preview';
    if (channel === 'email' && process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'noreply@kestrel-sandbox.example',
            to: normalizedId,
            subject: 'Your Kestrel Verification Code',
            text: `Your Kestrel one-time verification code is ${code}. It expires in 5 minutes.`,
          }),
        });
        deliveryMode = 'live_email';
      } catch {
        deliveryMode = 'sandbox_preview';
      }
    } else if (channel === 'mobile' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
      try {
        const form = new URLSearchParams({
          To: normalizedId,
          From: process.env.TWILIO_FROM_NUMBER,
          Body: `Your Kestrel verification code is ${code}. Expires in 5 minutes.`,
        });
        const authBasic = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authBasic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        });
        deliveryMode = 'live_sms';
      } catch {
        deliveryMode = 'sandbox_preview';
      }
    }

    res.json({
      ok: true,
      channel,
      identifier: normalizedId,
      expiresInSeconds: 300,
      resendCooldownSeconds: 30,
      deliveryMode,
      displayNameHint: displayName || '',
      sandboxNotice:
        deliveryMode === 'sandbox_preview'
          ? `Sandbox OTP preview (no live SMS/SMTP key configured): ${code}`
          : 'Verification code dispatched to your verified destination.',
    });
  });

  app.post('/api/v1/auth/otp/verify', (req: Request, res: Response) => {
    const { channel, identifier, otp, displayName, referralCode } = req.body as {
      channel?: 'email' | 'mobile';
      identifier?: string;
      otp?: string;
      displayName?: string;
      referralCode?: string;
    };

    if ((channel !== 'email' && channel !== 'mobile') || typeof identifier !== 'string' || typeof otp !== 'string') {
      res.status(400).json({ error: 'Channel, identifier, and 6-digit OTP are required.' });
      return;
    }

    const normalizedId = channel === 'email' ? identifier.trim().toLowerCase() : identifier.trim().replace(/\s+/g, '');
    const challengeKey = `${channel}:${normalizedId}`;
    const challenge = otpChallenges.get(challengeKey);
    const now = Date.now();

    if (!challenge) {
      res.status(400).json({ error: 'No active OTP challenge found. Request a new OTP.' });
      return;
    }
    if (challenge.lockedUntil > now) {
      const mins = Math.ceil((challenge.lockedUntil - now) / 60000);
      res.status(429).json({ error: `Account OTP temporarily locked (${mins}m remaining).` });
      return;
    }
    if (now > challenge.expiresAt) {
      otpChallenges.delete(challengeKey);
      res.status(400).json({ error: 'OTP has expired. Request a new code.' });
      return;
    }

    const matches = verifyOtpHash(otp.trim(), challenge.salt, challenge.otpHash);
    if (!matches) {
      challenge.failedAttempts += 1;
      if (challenge.failedAttempts >= 5) {
        challenge.lockedUntil = now + 15 * 60_000;
        addSecurityLog({
          actorUid: 'anonymous',
          actorEmail: normalizedId,
          action: 'OTP_BRUTE_FORCE_LOCKOUT',
          severity: 'warning',
          targetId: normalizedId,
          details: `5 failed OTP verification attempts for ${channel} ${normalizedId}.`,
        });
        persistStore();
      }
      res.status(401).json({
        error:
          challenge.failedAttempts >= 5
            ? '5 failed attempts. Verification locked for 15 minutes.'
            : `Incorrect OTP (${5 - challenge.failedAttempts} attempts remaining).`,
      });
      return;
    }

    otpChallenges.delete(challengeKey);
    const nowIso = new Date().toISOString();

    let user = store.users.find((u) =>
      channel === 'email' ? u.email.toLowerCase() === normalizedId : u.phone === normalizedId
    );

    if (!user) {
      const uid = makeId('usr');
      const publicUserId = allocateNextPublicUserId();
      const isSuper = channel === 'email' && normalizedId === BOOTSTRAPPED_SUPER_ADMIN_EMAIL;
      user = {
        uid,
        publicUserId,
        displayName:
          (typeof displayName === 'string' && displayName.trim()) ||
          (channel === 'email' ? normalizedId.split('@')[0] : `Member_${normalizedId.slice(-4)}`),
        email: channel === 'email' ? normalizedId : '',
        phone: channel === 'mobile' ? normalizedId : '',
        phoneVerified: channel === 'mobile',
        emailVerified: channel === 'email',
        photoURL: '',
        referralCode: `KST${uid.slice(-6).toUpperCase()}`,
        referredBy: typeof referralCode === 'string' ? referralCode.trim().slice(0, 24) : '',
        status: 'active',
        role: isSuper ? 'super_admin' : 'user',
        authMethod: channel === 'email' ? 'email_otp' : 'mobile_otp',
        twoFactorEnabled: false,
        privacyProfileVisible: false,
        privacyAnalyticsOptIn: true,
        lastLoginAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      store.users.push(user);
      store.wallets.push({
        userId: uid,
        availableCoins: 0,
        pendingCoins: 0,
        totalPurchasedCoins: 0,
        totalCreditedCoins: 0,
        totalDebitedCoins: 0,
        simulatedCommissionBalance: 0,
        lastTxId: 'init',
        updatedAt: nowIso,
      });
    } else {
      if (!user.publicUserId || !/^UID[0-9]{3,}$/.test(user.publicUserId)) {
        user.publicUserId = allocateNextPublicUserId();
      }
      if (channel === 'email') user.emailVerified = true;
      if (channel === 'mobile') user.phoneVerified = true;
      user.lastLoginAt = nowIso;
      user.updatedAt = nowIso;
    }

    const token = issueOtpSessionToken(user);
    const isAdmin = isCallerAdmin({
      uid: user.uid,
      email: user.email,
      phone: user.phone,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      displayName: user.displayName,
      authMethod: user.authMethod === 'google' ? 'email_otp' : user.authMethod,
    });
    const adminRec = store.admins.find(
      (a) => a.uid === user!.uid || (user!.email && a.email.toLowerCase() === user!.email.toLowerCase())
    );

    addSecurityLog({
      actorUid: user.uid,
      actorEmail: user.email || user.phone,
      action: channel === 'email' ? 'EMAIL_OTP_LOGIN' : 'MOBILE_OTP_LOGIN',
      severity: 'info',
      targetId: user.uid,
      details: `Authenticated via ${channel} OTP (${user.publicUserId}).`,
    });
    persistStore();

    res.json({
      ok: true,
      token,
      session: {
        uid: user.uid,
        publicUserId: user.publicUserId,
        email: user.email,
        phone: user.phone,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        photoURL: user.photoURL,
        authMethod: user.authMethod,
        isAdmin,
        adminRole: adminRec?.role,
        lastLoginAt: user.lastLoginAt,
      },
    });
  });

  app.get('/api/v1/auth/session', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const { user } = ensureServerUserAndWallet(caller);
    const adminRec = store.admins.find(
      (a) => a.uid === user.uid || (user.email && a.email.toLowerCase() === user.email.toLowerCase())
    );
    res.json({
      session: {
        uid: user.uid,
        publicUserId: user.publicUserId,
        email: user.email,
        phone: user.phone,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        photoURL: user.photoURL,
        authMethod: user.authMethod,
        isAdmin: isCallerAdmin(caller),
        adminRole: adminRec?.role,
        lastLoginAt: user.lastLoginAt,
      },
    });
  });

  app.post('/api/v1/auth/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer kestrel_otp_')) {
      revokedTokens.add(authHeader.slice(7).trim());
    }
    res.json({ ok: true });
  });

  // --- USER WORKSPACE STATE & PROFILE ---
  app.get('/api/v1/user/state', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const { user, wallet } = ensureServerUserAndWallet(caller);
    const sixMonthsAgo = Date.now() - 183 * 24 * 60 * 60 * 1000;

    res.json({
      profile: user,
      wallet,
      ledger: store.ledger.filter(
        (l) => l.userId === user.uid && Date.parse(l.createdAt) >= sixMonthsAgo
      ),
      planPurchases: store.planPurchases.filter((p) => p.userId === user.uid),
      planCreditSchedules: store.planCreditSchedules.filter((s) => s.userId === user.uid),
      orders: store.orders.filter((o) => o.userId === user.uid),
      payments: store.payments.filter((p) => p.userId === user.uid),
      coinRequests: store.coinRequests.filter((r) => r.userId === user.uid),
      withdrawals: store.withdrawals.filter((w) => w.userId === user.uid),
      tickets: store.tickets.filter((t) => t.userId === user.uid),
      ticketMessages: store.ticketMessages.filter((m) =>
        store.tickets.some((t) => t.ticketId === m.ticketId && t.userId === user.uid)
      ),
      notifications: store.notifications.filter((n) => n.userId === user.uid),
      coinPackages: store.coinPackages.filter((c) => c.status === 'active').sort((a, b) => a.displayOrder - b.displayOrder),
      plans: store.plans.filter((p) => p.status === 'active').sort((a, b) => a.displayOrder - b.displayOrder),
      products: store.products.filter((p) => p.active),
      adminSettings: store.adminSettings,
      aiFeatureSettings: store.aiFeatureSettings,
      gatewayConfig: store.gatewayConfig,
    });
  });

  app.patch('/api/v1/user/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const { user } = ensureServerUserAndWallet(caller);
    const { displayName, email, phone, twoFactorEnabled, privacyProfileVisible, privacyAnalyticsOptIn } =
      req.body as Partial<StoredUser>;

    if (typeof email === 'string' && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        res.status(400).json({ error: 'Invalid email format.' });
        return;
      }
      const conflict = store.users.find((u) => u.uid !== user.uid && u.email.toLowerCase() === cleanEmail);
      if (conflict) {
        res.status(409).json({ error: 'This email address is already registered to another account.' });
        return;
      }
      user.email = cleanEmail;
    }

    if (typeof phone === 'string' && phone.trim()) {
      const cleanPhone = phone.trim().replace(/\s+/g, '');
      if (!/^\+?[0-9]{8,15}$/.test(cleanPhone)) {
        res.status(400).json({ error: 'Invalid phone number format.' });
        return;
      }
      const conflict = store.users.find((u) => u.uid !== user.uid && u.phone === cleanPhone);
      if (conflict) {
        res.status(409).json({ error: 'This mobile number is already registered to another account.' });
        return;
      }
      user.phone = cleanPhone;
    }

    if (typeof displayName === 'string' && displayName.trim()) {
      user.displayName = displayName.trim().slice(0, 100);
    }
    if (typeof twoFactorEnabled === 'boolean') user.twoFactorEnabled = twoFactorEnabled;
    if (typeof privacyProfileVisible === 'boolean') user.privacyProfileVisible = privacyProfileVisible;
    if (typeof privacyAnalyticsOptIn === 'boolean') user.privacyAnalyticsOptIn = privacyAnalyticsOptIn;
    user.updatedAt = new Date().toISOString();
    persistStore();
    res.json({ ok: true, profile: user });
  });

  // --- AUTOMATIC RANDOM UPI CONFIGURATION SELECTION & PAYMENT INTENT ---
  app.post('/api/v1/payments/create-intent', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const { user } = ensureServerUserAndWallet(caller);
    const { packageId, amountInr, upiApp, idempotencyKey } = req.body as {
      packageId?: string;
      amountInr?: number;
      upiApp?: string;
      idempotencyKey?: string;
    };

    const allowedApps = ['GPay Sandbox', 'PhonePe Sandbox', 'Paytm Sandbox', 'BHIM Sandbox', 'QR Sandbox'];
    if (!upiApp || !allowedApps.includes(upiApp)) {
      res.status(400).json({ error: 'Unsupported UPI sandbox application selection.' });
      return;
    }
    if (!isValidSafeId(idempotencyKey)) {
      res.status(400).json({ error: 'Valid idempotencyKey is required.' });
      return;
    }

    const existing = processedIdempotencyKeys.get(`${user.uid}:${idempotencyKey}`);
    if (existing) {
      res.status(409).json({
        error: 'Duplicate payment request blocked by idempotency guard.',
        duplicatePaymentId: existing.paymentId,
      });
      return;
    }

    let resolvedAmount = Number(amountInr);
    let coinsRequested = 0;

    if (packageId) {
      const pkg = store.coinPackages.find((p) => p.packageId === packageId && p.status === 'active');
      if (!pkg) {
        res.status(404).json({ error: 'Selected coin package is unavailable.' });
        return;
      }
      resolvedAmount = pkg.purchasePrice;
      coinsRequested = pkg.coinQuantity;
    } else {
      if (!Number.isFinite(resolvedAmount) || resolvedAmount < 10 || resolvedAmount > 500000) {
        res.status(400).json({ error: 'Amount must be between INR 10 and INR 500,000.' });
        return;
      }
      coinsRequested = Math.floor(resolvedAmount * store.gatewayConfig.coinRateInr);
    }

    const enabledConfigs = store.paymentConfigurations.filter((c) => c.enabled);
    if (enabledConfigs.length === 0) {
      res.status(503).json({ error: 'No enabled sandbox UPI configurations are available.' });
      return;
    }

    // Backend randomly selects one enabled UPI configuration and fixes it to this request
    const selectedCfg = enabledConfigs[crypto.randomInt(0, enabledConfigs.length)];
    const paymentId = makeId('pay');
    const serverSignature = signPayload([
      'INTENT',
      paymentId,
      user.uid,
      resolvedAmount,
      coinsRequested,
      selectedCfg.configId,
      idempotencyKey,
    ]);
    const now = new Date().toISOString();

    processedIdempotencyKeys.set(`${user.uid}:${idempotencyKey}`, {
      paymentId,
      createdAt: Date.now(),
    });

    const payment: StoredPayment = {
      paymentId,
      userId: user.uid,
      userEmail: user.email || user.phone,
      idempotencyKey,
      amountInr: resolvedAmount,
      coinsRequested,
      upiApp,
      assignedConfigId: selectedCfg.configId,
      sandboxUpiId: selectedCfg.upiId,
      gatewayProvider: selectedCfg.provider,
      status: 'initiated',
      webhookEventId: '',
      serverSignature,
      failureReason: '',
      isSimulated: true,
      createdAt: now,
      updatedAt: now,
    };

    store.payments.unshift(payment);
    persistStore();

    const upiUri = `upi://pay?pa=${encodeURIComponent(selectedCfg.upiId)}&pn=${encodeURIComponent(
      selectedCfg.merchantName
    )}&am=${resolvedAmount.toFixed(2)}&cu=INR&tr=${encodeURIComponent(paymentId)}&tn=${encodeURIComponent(
      'SANDBOX_SIMULATION_NO_REAL_FUNDS'
    )}`;

    res.json({
      payment,
      assignedConfig: {
        configId: selectedCfg.configId,
        label: selectedCfg.label,
        upiId: selectedCfg.upiId,
        merchantName: selectedCfg.merchantName,
        provider: selectedCfg.provider,
      },
      upiUri,
      isSimulated: true,
      warning: 'SANDBOX ONLY: Assigned random sandbox UPI desk. Never enter a real UPI PIN.',
    });
  });

  app.post('/api/v1/payments/webhook', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const { user } = ensureServerUserAndWallet(caller);
    const { paymentId, outcome } = req.body as {
      paymentId?: string;
      outcome?: 'success' | 'failed';
    };

    if (!isValidSafeId(paymentId)) {
      res.status(400).json({ error: 'Invalid paymentId.' });
      return;
    }
    const payment = store.payments.find((p) => p.paymentId === paymentId && p.userId === user.uid);
    if (!payment) {
      res.status(404).json({ error: 'Payment request not found.' });
      return;
    }
    if (processedWebhookEvents.has(paymentId) || payment.status !== 'initiated') {
      res.status(409).json({ error: 'Webhook already processed for this paymentId (duplicate blocked).' });
      return;
    }

    processedWebhookEvents.add(paymentId);
    const now = new Date().toISOString();
    const webhookEventId = makeId('wh_sbx');
    const status = outcome === 'failed' ? 'failed' : 'webhook_verified';
    const failureReason =
      outcome === 'failed' ? 'Simulated gateway timeout / sandbox decline (SANDBOX_ERR_402).' : '';
    const serverSignature = signPayload([
      'WEBHOOK',
      paymentId,
      webhookEventId,
      user.uid,
      payment.amountInr,
      payment.coinsRequested,
      status,
    ]);

    payment.status = status;
    payment.webhookEventId = webhookEventId;
    payment.failureReason = failureReason;
    payment.serverSignature = serverSignature;
    payment.updatedAt = now;

    let coinRequest: StoredCoinRequest | null = null;
    if (status === 'webhook_verified') {
      coinRequest = {
        requestId: makeId('creq'),
        userId: user.uid,
        paymentId,
        amountInr: payment.amountInr,
        coinsRequested: payment.coinsRequested,
        status: 'pending',
        adminNote: '',
        reviewedBy: '',
        createdAt: now,
        updatedAt: now,
      };
      store.coinRequests.unshift(coinRequest);
    }

    addNotification({
      userId: user.uid,
      title:
        status === 'webhook_verified'
          ? 'Sandbox Payment Verified — Pending Admin Approval'
          : 'Sandbox Payment Failed',
      body:
        status === 'webhook_verified'
          ? `Ref ${paymentId} verified in sandbox. Coin request ${coinRequest?.requestId} queued for ledger approval.`
          : `Ref ${paymentId} failed: ${failureReason}`,
      category: 'payment',
    });

    addSecurityLog({
      actorUid: user.uid,
      actorEmail: user.email || user.phone,
      action: status === 'webhook_verified' ? 'SANDBOX_PAYMENT_WEBHOOK_VERIFIED' : 'SANDBOX_PAYMENT_FAILED',
      severity: status === 'failed' ? 'warning' : 'info',
      targetId: paymentId,
      details:
        status === 'webhook_verified'
          ? `Webhook ${webhookEventId} verified (${payment.coinsRequested} coins via ${payment.sandboxUpiId}).`
          : failureReason,
    });
    persistStore();

    res.json({ payment, coinRequest, isSimulated: true });
  });

  // --- PLAN PURCHASE + 24-HOUR IMMUTABLE SCHEDULE SNAPSHOT ---
  app.post('/api/v1/plans/purchase', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const { user, wallet } = ensureServerUserAndWallet(caller);
    const { planId } = req.body as { planId?: string };

    if (!isValidSafeId(planId)) {
      res.status(400).json({ error: 'Valid planId is required.' });
      return;
    }
    const plan = store.plans.find((p) => p.planId === planId && p.status === 'active');
    if (!plan) {
      res.status(404).json({ error: 'Selected plan is disabled or does not exist.' });
      return;
    }
    if (wallet.availableCoins < plan.purchasePrice) {
      res.status(400).json({
        error: `Insufficient coins. Need ${plan.purchasePrice} coins, available ${wallet.availableCoins}.`,
      });
      return;
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const purchaseId = makeId('ppur');
    const txId = makeId('tx');
    const serverSignature = signPayload(['PLAN_PURCHASE', txId, user.uid, plan.purchasePrice, purchaseId]);

    wallet.availableCoins -= plan.purchasePrice;
    wallet.totalDebitedCoins = (wallet.totalDebitedCoins || 0) + plan.purchasePrice;
    wallet.lastTxId = txId;
    wallet.updatedAt = nowIso;

    store.ledger.unshift({
      txId,
      userId: user.uid,
      type: 'debit',
      amount: plan.purchasePrice,
      balanceAfter: wallet.availableCoins,
      referenceId: purchaseId,
      serverSignature,
      description: `Purchased Plan: ${plan.name} (${plan.durationDays}d · ${plan.totalScheduledCredits} scheduled credits)`,
      status: 'completed',
      createdAt: nowIso,
    });

    const dailyAmounts = computeDailyAmounts(plan.totalScheduledCredits, plan.durationDays);
    const DAY_MS = 24 * 60 * 60 * 1000;
    const completesAtIso = new Date(nowMs + plan.durationDays * DAY_MS).toISOString();
    const firstDueIso = new Date(nowMs + DAY_MS).toISOString();

    const purchase: StoredPlanPurchase = {
      purchaseId,
      userId: user.uid,
      planId: plan.planId,
      planName: plan.name,
      purchasePrice: plan.purchasePrice,
      currency: plan.currency,
      durationDays: plan.durationDays,
      totalScheduledCredits: plan.totalScheduledCredits,
      creditIntervalHours: 24,
      completedEvents: 0,
      totalEvents: dailyAmounts.length,
      creditedCoinsSoFar: 0,
      status: 'active',
      activatedAtIso: nowIso,
      completesAtIso,
      nextCreditAtIso: firstDueIso,
      termsSnapshot: plan.terms,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.planPurchases.unshift(purchase);

    const schedules: StoredScheduleEvent[] = dailyAmounts.map((amt, idx) => ({
      scheduleId: makeId('psch'),
      purchaseId,
      userId: user.uid,
      eventIndex: idx + 1,
      scheduledCoins: amt,
      dueAtIso: new Date(nowMs + (idx + 1) * DAY_MS).toISOString(),
      status: 'pending',
      creditedAtIso: '',
      txId: '',
    }));
    store.planCreditSchedules.push(...schedules);

    addNotification({
      userId: user.uid,
      title: `Plan Activated: ${plan.name}`,
      body: `Deducted ${plan.purchasePrice} coins. First automatic 24h credit (${dailyAmounts[0]} coins) scheduled for ${new Date(firstDueIso).toLocaleString()}.`,
      category: 'plan',
    });

    addSecurityLog({
      actorUid: user.uid,
      actorEmail: user.email || user.phone,
      action: 'PLAN_PURCHASED',
      severity: 'info',
      targetId: purchaseId,
      details: `Purchased ${plan.name} (${plan.durationDays}d / ${plan.totalScheduledCredits} credits).`,
    });

    persistStore();
    res.json({ ok: true, purchase, schedules, wallet });
  });

  // --- PRODUCT ORDER ---
  app.post('/api/v1/orders/purchase', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const { user, wallet } = ensureServerUserAndWallet(caller);
    const { productId, quantity = 1 } = req.body as { productId?: string; quantity?: number };

    const product = store.products.find((p) => p.productId === productId && p.active);
    if (!product) {
      res.status(404).json({ error: 'Product is inactive or not found.' });
      return;
    }
    const qty = Math.max(1, Math.min(100, Math.floor(Number(quantity) || 1)));
    const cost = product.coinPrice * qty;
    if (wallet.availableCoins < cost) {
      res.status(400).json({ error: 'Insufficient available coins.' });
      return;
    }
    if (product.stock < qty) {
      res.status(400).json({ error: 'Requested quantity exceeds stock.' });
      return;
    }

    const now = new Date().toISOString();
    const orderId = makeId('ord');
    const txId = makeId('tx');
    const sig = signPayload(['ORDER', txId, user.uid, cost, orderId]);

    wallet.availableCoins -= cost;
    wallet.totalDebitedCoins = (wallet.totalDebitedCoins || 0) + cost;
    wallet.lastTxId = txId;
    wallet.updatedAt = now;
    product.stock -= qty;
    product.updatedAt = now;

    const order: StoredOrder = {
      orderId,
      userId: user.uid,
      productId: product.productId,
      productTitle: product.title,
      itemType: product.itemType,
      quantity: qty,
      coinAmount: cost,
      status: 'completed',
      referenceId: txId,
      serverSignature: sig,
      createdAt: now,
      updatedAt: now,
    };
    store.orders.unshift(order);

    store.ledger.unshift({
      txId,
      userId: user.uid,
      type: 'debit',
      amount: cost,
      balanceAfter: wallet.availableCoins,
      referenceId: orderId,
      serverSignature: sig,
      description: `Purchased ${qty}x ${product.title}`,
      status: 'completed',
      createdAt: now,
    });

    addNotification({
      userId: user.uid,
      title: 'Order Confirmed',
      body: `Purchased ${qty}x ${product.title} for ${cost} coins (Ref ${orderId}).`,
      category: 'wallet',
    });

    persistStore();
    res.json({ ok: true, order, wallet });
  });

  // --- SIMULATED WITHDRAWALS ---
  app.post('/api/v1/withdrawals', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const { user, wallet } = ensureServerUserAndWallet(caller);
    if (!store.adminSettings.withdrawalsEnabled) {
      res.status(403).json({ error: 'Simulated withdrawals are currently paused by the administrator.' });
      return;
    }
    const { amountCoins, payoutChannel, accountLabel } = req.body as {
      amountCoins?: number;
      payoutChannel?: 'Simulated Bank Transfer' | 'Simulated UPI Sandbox';
      accountLabel?: string;
    };

    const amt = Math.floor(Number(amountCoins) || 0);
    if (amt < store.gatewayConfig.minWithdrawalCoins || amt > wallet.availableCoins) {
      res.status(400).json({ error: 'Invalid withdrawal amount or insufficient coin balance.' });
      return;
    }
    if (!accountLabel || accountLabel.trim().length < 2) {
      res.status(400).json({ error: 'Valid sandbox destination label is required.' });
      return;
    }

    const now = new Date().toISOString();
    const withdrawal: StoredWithdrawal = {
      withdrawalId: makeId('wd'),
      userId: user.uid,
      userName: user.displayName || 'Member',
      userEmail: user.email || user.phone,
      amountCoins: amt,
      equivalentInr: Math.round((amt / Math.max(1, store.gatewayConfig.coinRateInr)) * 100) / 100,
      payoutChannel: payoutChannel === 'Simulated Bank Transfer' ? 'Simulated Bank Transfer' : 'Simulated UPI Sandbox',
      accountLabel: accountLabel.trim().slice(0, 120),
      status: 'pending',
      payoutReferenceNumber: '',
      providerConfirmed: false,
      debitedFromWallet: false,
      adminNote: '',
      reviewedBy: '',
      isSimulated: true,
      createdAt: now,
      updatedAt: now,
    };
    store.withdrawals.unshift(withdrawal);
    addSecurityLog({
      actorUid: user.uid,
      actorEmail: user.email || user.phone,
      action: 'SIMULATED_WITHDRAWAL_REQUESTED',
      severity: amt >= 10000 ? 'warning' : 'info',
      targetId: withdrawal.withdrawalId,
      details: `Requested simulated withdrawal of ${amt} coins.`,
    });
    persistStore();
    res.json({ ok: true, withdrawal });
  });

  // --- SUPPORT TICKETS ---
  app.post('/api/v1/support/tickets', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const { user } = ensureServerUserAndWallet(caller);
    const { category, subject, description, attachmentName, attachmentDataUrl } = req.body as {
      category?: string;
      subject?: string;
      description?: string;
      attachmentName?: string;
      attachmentDataUrl?: string;
    };

    if (!subject || subject.trim().length < 3 || !description || description.trim().length < 5) {
      res.status(400).json({ error: 'Subject (min 3 chars) and description (min 5 chars) required.' });
      return;
    }
    const now = new Date().toISOString();
    const ticketId = makeId('tkt');
    const ticket: StoredTicket = {
      ticketId,
      userId: user.uid,
      userEmail: user.email || user.phone,
      category: category || 'Other',
      subject: subject.trim().slice(0, 160),
      description: description.trim().slice(0, 2000),
      attachmentName: (attachmentName || '').slice(0, 160),
      attachmentDataUrl: (attachmentDataUrl || '').slice(0, 200000),
      status: 'open',
      priority: category === 'Payment problem' || category === 'Withdrawal problem' ? 'high' : 'normal',
      createdAt: now,
      updatedAt: now,
    };
    store.tickets.unshift(ticket);
    store.ticketMessages.push({
      messageId: makeId('msg'),
      ticketId,
      senderId: user.uid,
      senderRole: 'user',
      senderName: user.displayName,
      body: description.trim().slice(0, 2000),
      createdAt: now,
    });
    persistStore();
    res.json({ ok: true, ticket });
  });

  app.post('/api/v1/support/tickets/:ticketId/reply', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const { user } = ensureServerUserAndWallet(caller);
    const { ticketId } = req.params;
    const { body } = req.body as { body?: string };
    const ticket = store.tickets.find((t) => t.ticketId === ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }
    const admin = isCallerAdmin(caller);
    if (ticket.userId !== user.uid && !admin) {
      res.status(403).json({ error: 'Unauthorized ticket reply.' });
      return;
    }
    if (!body || !body.trim()) {
      res.status(400).json({ error: 'Message body required.' });
      return;
    }
    const now = new Date().toISOString();
    const msg: StoredTicketMessage = {
      messageId: makeId('msg'),
      ticketId,
      senderId: user.uid,
      senderRole: admin ? 'admin' : 'user',
      senderName: user.displayName,
      body: body.trim().slice(0, 2000),
      createdAt: now,
    };
    store.ticketMessages.push(msg);
    ticket.updatedAt = now;
    if (admin && ticket.status === 'open') ticket.status = 'in_progress';
    persistStore();
    res.json({ ok: true, message: msg });
  });

  app.post('/api/v1/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const ntf = store.notifications.find((n) => n.notificationId === req.params.id && n.userId === caller.uid);
    if (ntf) {
      ntf.read = true;
      persistStore();
    }
    res.json({ ok: true });
  });

  // --- ADMIN ENDPOINTS (/api/v1/admin/*) ---
  function computeUserFinancialReport(user: StoredUser, viewerRole: StoredAdminRole['role']) {
    const fullPii = canAdminViewFullPii(viewerRole);
    const wallet =
      store.wallets.find((w) => w.userId === user.uid) ||
      ({
        userId: user.uid,
        availableCoins: 0,
        pendingCoins: 0,
        totalPurchasedCoins: 0,
        totalCreditedCoins: 0,
        totalDebitedCoins: 0,
        simulatedCommissionBalance: 0,
        lastTxId: 'init',
        updatedAt: user.updatedAt,
      } as StoredWallet);

    const userWalletTxs = store.walletTransactions.filter((t) => t.userId === user.uid);
    const userLedger = store.ledger.filter((l) => l.userId === user.uid);
    const userPayments = store.payments.filter((p) => p.userId === user.uid);
    const userCoinRequests = store.coinRequests.filter((c) => c.userId === user.uid);
    const userOrders = store.orders.filter((o) => o.userId === user.uid);
    const userPlans = store.planPurchases.filter((p) => p.userId === user.uid);
    const userWithdrawals = store.withdrawals.filter((w) => w.userId === user.uid);
    const userActivity = store.securityLogs.filter(
      (s) => s.actorUid === user.uid || s.targetId === user.uid
    );
    const userAudits = store.adminAuditLogs.filter((a) => a.targetUserId === user.uid);

    // Non-overlapping financial aggregates (no double-counting purchases vs plan credits vs admin credits)
    const creditedPayments = userPayments.filter((p) => p.status === 'credited');
    const failedPayments = userPayments.filter((p) => p.status === 'failed' || p.status === 'expired');

    const totalCoinsPurchased = creditedPayments.reduce((s, p) => s + Number(p.coinsRequested || 0), 0);
    const totalPurchaseAmountInr = creditedPayments.reduce((s, p) => s + Number(p.amountInr || 0), 0);
    const totalCoinsAddedByAdmin = userWalletTxs
      .filter((t) => t.action === 'add')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalCoinsDeductedByAdmin = userWalletTxs
      .filter((t) => t.action === 'deduct')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalCoinsCreditedAutomatically = userLedger
      .filter((l) => l.type === 'plan_credit' && l.status === 'completed')
      .reduce((s, l) => s + Number(l.amount || 0), 0);

    const orderAndPlanDebits = userLedger
      .filter(
        (l) =>
          l.type === 'debit' &&
          l.status === 'completed' &&
          (userOrders.some((o) => o.orderId === l.referenceId) ||
            userPlans.some((pl) => pl.purchaseId === l.referenceId))
      )
      .reduce((s, l) => s + Number(l.amount || 0), 0);
    const withdrawalDebits = userLedger
      .filter(
        (l) =>
          l.type === 'debit' &&
          l.status === 'completed' &&
          userWithdrawals.some((w) => w.withdrawalId === l.referenceId)
      )
      .reduce((s, l) => s + Number(l.amount || 0), 0);

    const totalCoinsDeducted = totalCoinsDeductedByAdmin + orderAndPlanDebits + withdrawalDebits;

    const totalWithdrawalsRequestedCoins = userWithdrawals.reduce(
      (s, w) => s + Number(w.amountCoins || 0),
      0
    );
    const totalWithdrawalsApprovedCoins = userWithdrawals
      .filter((w) => w.status === 'approved' || w.status === 'processing' || w.status === 'successful')
      .reduce((s, w) => s + Number(w.amountCoins || 0), 0);
    const totalSuccessfulWithdrawalsCoins = userWithdrawals
      .filter((w) => w.status === 'successful' && w.providerConfirmed === true)
      .reduce((s, w) => s + Number(w.amountCoins || 0), 0);
    const totalRejectedWithdrawalsCoins = userWithdrawals
      .filter((w) => w.status === 'rejected' || w.status === 'failed')
      .reduce((s, w) => s + Number(w.amountCoins || 0), 0);
    const pendingWithdrawalsCoins = userWithdrawals
      .filter(
        (w) =>
          w.status === 'pending' ||
          w.status === 'under_review' ||
          w.status === 'approved' ||
          w.status === 'processing'
      )
      .reduce((s, w) => s + Number(w.amountCoins || 0), 0);

    const maskedUser: StoredUser = fullPii
      ? user
      : {
          ...user,
          email: maskEmailValue(user.email),
          phone: maskPhoneValue(user.phone),
        };

    const maskedWithdrawals = fullPii
      ? userWithdrawals
      : userWithdrawals.map((w) => ({
          ...w,
          userEmail: maskEmailValue(w.userEmail),
          accountLabel: w.accountLabel ? `****${w.accountLabel.slice(-4)}` : '****',
        }));

    return {
      user: maskedUser,
      wallet,
      summary: {
        currentCoinBalance: Number(wallet.availableCoins || 0),
        totalCoinsPurchased,
        totalCoinsAddedByAdmin,
        totalCoinsCreditedAutomatically,
        totalCoinsDeducted,
        totalCoinsDeductedByAdmin,
        totalCoinsSpentOnPurchases: orderAndPlanDebits,
        totalPurchaseAmountInr,
        totalSuccessfulPurchasesCount: creditedPayments.length,
        totalFailedPurchasesCount: failedPayments.length,
        totalWithdrawalsRequestedCoins,
        totalWithdrawalsApprovedCoins,
        totalSuccessfulWithdrawalsCoins,
        totalRejectedWithdrawalsCoins,
        pendingWithdrawalsCoins,
        activePlansCount: userPlans.filter((p) => p.status === 'active').length,
        completedPlansCount: userPlans.filter((p) => p.status === 'completed').length,
      },
      coinTransactions: userWalletTxs,
      ledgerEntries: userLedger,
      payments: fullPii
        ? userPayments
        : userPayments.map((p) => ({ ...p, userEmail: maskEmailValue(p.userEmail) })),
      coinRequests: userCoinRequests,
      orders: userOrders,
      planPurchases: userPlans,
      withdrawals: maskedWithdrawals,
      activityLogs: userActivity,
      auditLogs: userAudits,
      piiMasked: !fullPii,
      viewerRole,
    };
  }

  app.get('/api/v1/admin/overview', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      users: store.users,
      wallets: store.wallets,
      ledger: store.ledger,
      coinPackages: store.coinPackages,
      plans: store.plans,
      planPurchases: store.planPurchases,
      planCreditSchedules: store.planCreditSchedules,
      paymentConfigurations: store.paymentConfigurations,
      products: store.products,
      payments: store.payments,
      coinRequests: store.coinRequests,
      orders: store.orders,
      withdrawals: store.withdrawals,
      walletTransactions: store.walletTransactions,
      adminAuditLogs: store.adminAuditLogs,
      tickets: store.tickets,
      ticketMessages: store.ticketMessages,
      securityLogs: store.securityLogs,
      admins: store.admins,
      adminSettings: store.adminSettings,
      aiFeatureSettings: store.aiFeatureSettings,
      gatewayConfig: store.gatewayConfig,
      aiUsageLogs: store.aiUsageLogs,
      systemHealthLogs: store.systemHealthLogs,
      ticker: getRealTickerEvents(),
    });
  });

  app.get('/api/v1/admin/users/search', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const viewerRole = getCallerAdminRole(caller) || 'read_only_staff';
    const fullPii = canAdminViewFullPii(viewerRole);

    const q = String(req.query.q || '').trim().toLowerCase();
    const statusFilter = String(req.query.status || 'all');
    const fromDate = String(req.query.from || '');
    const toDate = String(req.query.to || '');
    const sortBy = String(req.query.sort || 'createdAt');
    const sortDir = String(req.query.dir || 'desc') === 'asc' ? 1 : -1;
    const logAudit = String(req.query.logAudit || '') === '1';

    const fromMs = fromDate ? Date.parse(`${fromDate}T00:00:00`) : null;
    const toMs = toDate ? Date.parse(`${toDate}T23:59:59`) : null;

    const rows = store.users
      .filter((u) => {
        if (statusFilter !== 'all' && u.status !== statusFilter) return false;
        const createdMs = Date.parse(u.createdAt || '');
        if (fromMs !== null && !Number.isNaN(fromMs) && createdMs < fromMs) return false;
        if (toMs !== null && !Number.isNaN(toMs) && createdMs > toMs) return false;
        if (!q) return true;
        const normPhone = (u.phone || '').replace(/\s+/g, '').toLowerCase();
        const qNoSpaces = q.replace(/\s+/g, '');
        return (
          (u.publicUserId || '').toLowerCase().includes(q) ||
          u.uid.toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          normPhone.includes(qNoSpaces) ||
          u.displayName.toLowerCase().includes(q)
        );
      })
      .map((u) => {
        const rep = computeUserFinancialReport(u, viewerRole);
        return {
          uid: u.uid,
          publicUserId: u.publicUserId,
          displayName: u.displayName,
          email: fullPii ? u.email : maskEmailValue(u.email),
          phone: fullPii ? u.phone : maskPhoneValue(u.phone),
          status: u.status,
          role: u.role,
          emailVerified: u.emailVerified,
          phoneVerified: u.phoneVerified,
          coinBalance: rep.summary.currentCoinBalance,
          totalPurchaseInr: rep.summary.totalPurchaseAmountInr,
          totalPurchasedCoins: rep.summary.totalCoinsPurchased,
          totalWithdrawalCoins: rep.summary.totalWithdrawalsRequestedCoins,
          successfulWithdrawalCoins: rep.summary.totalSuccessfulWithdrawalsCoins,
          pendingWithdrawalCoins: rep.summary.pendingWithdrawalsCoins,
          activePlansCount: rep.summary.activePlansCount,
          completedPlansCount: rep.summary.completedPlansCount,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt || u.updatedAt || u.createdAt,
          piiMasked: !fullPii,
        };
      })
      .sort((a, b) => {
        if (sortBy === 'publicUserId') return sortDir * a.publicUserId.localeCompare(b.publicUserId);
        if (sortBy === 'displayName') return sortDir * a.displayName.localeCompare(b.displayName);
        if (sortBy === 'coinBalance') return sortDir * (a.coinBalance - b.coinBalance);
        if (sortBy === 'totalPurchaseInr') return sortDir * (a.totalPurchaseInr - b.totalPurchaseInr);
        if (sortBy === 'totalWithdrawalCoins') return sortDir * (a.totalWithdrawalCoins - b.totalWithdrawalCoins);
        return sortDir * (Date.parse(a.createdAt || '') - Date.parse(b.createdAt || ''));
      });

    if (logAudit && q) {
      const now = new Date().toISOString();
      store.adminAuditLogs.unshift({
        auditId: makeId('aud'),
        adminId: caller.uid,
        adminEmail: caller.email || caller.uid,
        actionType: 'ADMIN_USER_SEARCH',
        targetUserId: rows[0]?.uid || 'search_query',
        targetEntityId: makeId('srch'),
        amount: rows.length,
        reason: `Searched users: "${q}"`,
        payoutReferenceNumber: '',
        details: `Admin (${viewerRole}) searched "${q}" (${rows.length} match${rows.length === 1 ? '' : 'es'}).`,
        createdAt: now,
      });
      persistStore();
    }

    res.json({
      results: rows,
      totalUsers: store.users.length,
      viewerRole,
      piiMasked: !fullPii,
    });
  });

  app.get('/api/v1/admin/users/:id/report', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const viewerRole = getCallerAdminRole(caller) || 'read_only_staff';
    const lookupKey = String(req.params.id || '').trim();
    const user = store.users.find(
      (u) => u.uid === lookupKey || (u.publicUserId && u.publicUserId.toUpperCase() === lookupKey.toUpperCase())
    );
    if (!user) {
      res.status(404).json({ error: `No user account found matching "${lookupKey}".` });
      return;
    }

    if (String(req.query.logAudit || '') === '1') {
      const now = new Date().toISOString();
      store.adminAuditLogs.unshift({
        auditId: makeId('aud'),
        adminId: caller.uid,
        adminEmail: caller.email || caller.uid,
        actionType: 'ADMIN_USER_SEARCH',
        targetUserId: user.uid,
        targetEntityId: user.publicUserId || user.uid,
        amount: 0,
        reason: `Opened full user report (${user.publicUserId || user.uid})`,
        payoutReferenceNumber: '',
        details: `Admin (${viewerRole}) inspected profile & financial report for ${user.publicUserId || user.uid}.`,
        createdAt: now,
      });
      persistStore();
    }

    res.json(computeUserFinancialReport(user, viewerRole));
  });

  app.post('/api/v1/admin/users/migrate-ids', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const viewerRole = getCallerAdminRole(caller);
    if (!canAdminMutateFinancials(viewerRole)) {
      res.status(403).json({ error: 'Only Admin or Super Admin roles can run user ID migration.' });
      return;
    }

    let migratedCount = 0;
    const sortedByAge = [...store.users].sort(
      (a, b) => Date.parse(a.createdAt || '') - Date.parse(b.createdAt || '')
    );
    for (const u of sortedByAge) {
      if (!u.publicUserId || !/^UID[0-9]{3,}$/.test(u.publicUserId)) {
        u.publicUserId = allocateNextPublicUserId();
        u.updatedAt = new Date().toISOString();
        migratedCount += 1;
      }
    }

    const now = new Date().toISOString();
    store.adminAuditLogs.unshift({
      auditId: makeId('aud'),
      adminId: caller.uid,
      adminEmail: caller.email || caller.uid,
      actionType: 'USER_IDS_MIGRATED',
      targetUserId: 'all_users',
      targetEntityId: makeId('mig'),
      amount: migratedCount,
      reason: 'Sequential UID001+ historical backfill migration',
      payoutReferenceNumber: '',
      details: `Assigned sequential publicUserId to ${migratedCount} legacy account(s). Latest counter: ${store.userCounter}.`,
      createdAt: now,
    });
    addSecurityLog({
      actorUid: caller.uid,
      actorEmail: caller.email,
      action: 'USER_IDS_MIGRATED',
      severity: 'info',
      targetId: 'userCounters',
      details: `Migrated ${migratedCount} user(s); active sequence counter at ${store.userCounter}.`,
    });
    persistStore();
    res.json({ ok: true, migratedCount, userCounter: store.userCounter });
  });

  app.post('/api/v1/admin/plans/run-scheduler', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const result = processDuePlanCredits(req.caller!.email || req.caller!.uid);
    res.json({ ok: true, ...result });
  });

  app.post('/api/v1/admin/coin-packages', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const pkgInput = req.body as Partial<StoredCoinPackage>;
    if (!pkgInput.name || !pkgInput.coinQuantity || !pkgInput.purchasePrice) {
      res.status(400).json({ error: 'Name, coinQuantity, and purchasePrice are required.' });
      return;
    }
    const now = new Date().toISOString();
    const existing = pkgInput.packageId ? store.coinPackages.find((p) => p.packageId === pkgInput.packageId) : undefined;
    if (existing) {
      existing.name = pkgInput.name.trim();
      existing.coinQuantity = Number(pkgInput.coinQuantity);
      existing.purchasePrice = Number(pkgInput.purchasePrice);
      existing.currency = pkgInput.currency || 'INR';
      existing.description = pkgInput.description || '';
      existing.status = pkgInput.status || existing.status;
      existing.displayOrder = Number(pkgInput.displayOrder ?? existing.displayOrder);
      existing.updatedAt = now;
    } else {
      store.coinPackages.push({
        packageId: pkgInput.packageId || makeId('pkg'),
        name: pkgInput.name.trim(),
        coinQuantity: Number(pkgInput.coinQuantity),
        purchasePrice: Number(pkgInput.purchasePrice),
        currency: pkgInput.currency || 'INR',
        description: pkgInput.description || '',
        status: pkgInput.status || 'active',
        displayOrder: Number(pkgInput.displayOrder ?? store.coinPackages.length + 1),
        createdAt: now,
        updatedAt: now,
      });
    }
    persistStore();
    res.json({ ok: true, coinPackages: store.coinPackages });
  });

  app.post('/api/v1/admin/plans', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const planInput = req.body as Partial<StoredPlanConfig>;
    if (!planInput.name || !planInput.purchasePrice || !planInput.durationDays || !planInput.totalScheduledCredits) {
      res.status(400).json({ error: 'Name, purchasePrice, durationDays, and totalScheduledCredits are required.' });
      return;
    }
    const now = new Date().toISOString();
    const existing = planInput.planId ? store.plans.find((p) => p.planId === planInput.planId) : undefined;
    if (existing) {
      existing.name = planInput.name.trim();
      existing.purchasePrice = Number(planInput.purchasePrice);
      existing.currency = planInput.currency || 'Coins';
      existing.durationDays = Math.max(1, Math.floor(Number(planInput.durationDays)));
      existing.totalScheduledCredits = Math.max(1, Number(planInput.totalScheduledCredits));
      existing.creditIntervalHours = 24;
      existing.description = planInput.description || '';
      existing.status = planInput.status || existing.status;
      existing.displayOrder = Number(planInput.displayOrder ?? existing.displayOrder);
      existing.availableFrom = planInput.availableFrom || '';
      existing.availableUntil = planInput.availableUntil || '';
      existing.terms = planInput.terms || existing.terms;
      existing.updatedAt = now;
    } else {
      store.plans.push({
        planId: planInput.planId || makeId('plan'),
        name: planInput.name.trim(),
        purchasePrice: Number(planInput.purchasePrice),
        currency: planInput.currency || 'Coins',
        durationDays: Math.max(1, Math.floor(Number(planInput.durationDays))),
        totalScheduledCredits: Math.max(1, Number(planInput.totalScheduledCredits)),
        creditIntervalHours: 24,
        description: planInput.description || '',
        status: planInput.status || 'active',
        displayOrder: Number(planInput.displayOrder ?? store.plans.length + 1),
        availableFrom: planInput.availableFrom || '',
        availableUntil: planInput.availableUntil || '',
        terms: planInput.terms || '24-hour interval schedule locked upon purchase.',
        createdAt: now,
        updatedAt: now,
      });
    }
    addSecurityLog({
      actorUid: req.caller!.uid,
      actorEmail: req.caller!.email,
      action: existing ? 'PLAN_CONFIG_UPDATED' : 'PLAN_CONFIG_CREATED',
      severity: 'info',
      targetId: existing?.planId || 'new_plan',
      details: `${planInput.name} (${planInput.durationDays}d / ${planInput.totalScheduledCredits} coins, 24h interval).`,
    });
    persistStore();
    res.json({ ok: true, plans: store.plans });
  });

  app.post('/api/v1/admin/plans/override', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    if (!canAdminMutateFinancials(getCallerAdminRole(req.caller!))) {
      res.status(403).json({ error: 'Support/Read-only staff cannot override user plans.' });
      return;
    }
    const { purchaseId, action, extraDays, reason } = req.body as {
      purchaseId?: string;
      action?: 'extend' | 'cancel' | 'complete_now';
      extraDays?: number;
      reason?: string;
    };
    if (!reason || reason.trim().length < 4) {
      res.status(400).json({ error: 'Audit reason (min 4 chars) is required for plan override.' });
      return;
    }
    const purchase = store.planPurchases.find((p) => p.purchaseId === purchaseId);
    if (!purchase) {
      res.status(404).json({ error: 'Plan purchase record not found.' });
      return;
    }
    const nowIso = new Date().toISOString();
    if (action === 'cancel') {
      purchase.status = 'cancelled';
      purchase.nextCreditAtIso = '';
      purchase.overrideReason = reason.trim();
      purchase.updatedAt = nowIso;
      for (const s of store.planCreditSchedules) {
        if (s.purchaseId === purchase.purchaseId && s.status === 'pending') {
          s.status = 'cancelled';
        }
      }
    } else if (action === 'extend') {
      const add = Math.max(1, Math.min(90, Math.floor(Number(extraDays) || 1)));
      const lastDue =
        store.planCreditSchedules
          .filter((s) => s.purchaseId === purchase.purchaseId)
          .map((s) => Date.parse(s.dueAtIso))
          .sort((a, b) => b - a)[0] || Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;
      const dailyRate = Math.max(1, Math.floor(purchase.totalScheduledCredits / Math.max(1, purchase.durationDays)));
      for (let i = 1; i <= add; i++) {
        const dueAtIso = new Date(lastDue + i * DAY_MS).toISOString();
        store.planCreditSchedules.push({
          scheduleId: makeId('psch'),
          purchaseId: purchase.purchaseId,
          userId: purchase.userId,
          eventIndex: purchase.totalEvents + i,
          scheduledCoins: dailyRate,
          dueAtIso,
          status: 'pending',
          creditedAtIso: '',
          txId: '',
        });
      }
      purchase.durationDays += add;
      purchase.totalEvents += add;
      purchase.totalScheduledCredits += dailyRate * add;
      purchase.completesAtIso = new Date(lastDue + add * DAY_MS).toISOString();
      purchase.status = 'active';
      purchase.overrideReason = reason.trim();
      purchase.updatedAt = nowIso;
    } else if (action === 'complete_now') {
      for (const s of store.planCreditSchedules) {
        if (s.purchaseId === purchase.purchaseId && s.status === 'pending') {
          s.dueAtIso = nowIso;
        }
      }
      purchase.overrideReason = reason.trim();
      processDuePlanCredits(`admin_override:${req.caller!.email}`);
    }

    addSecurityLog({
      actorUid: req.caller!.uid,
      actorEmail: req.caller!.email,
      action: `ADMIN_PLAN_OVERRIDE_${(action || 'UPDATE').toUpperCase()}`,
      severity: 'warning',
      targetId: purchase.purchaseId,
      details: `Override (${action}) on ${purchase.purchaseId} for ${purchase.userId}: ${reason.trim()}`,
    });
    persistStore();
    res.json({ ok: true, purchase });
  });

  app.post('/api/v1/admin/payment-configs', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const input = req.body as Partial<StoredPaymentConfig> & { deleteConfigId?: string };
    if (input.deleteConfigId) {
      store.paymentConfigurations = store.paymentConfigurations.filter((c) => c.configId !== input.deleteConfigId);
      persistStore();
      res.json({ ok: true, paymentConfigurations: store.paymentConfigurations });
      return;
    }
    if (!input.label || !input.upiId || !input.merchantName) {
      res.status(400).json({ error: 'Label, sandbox UPI ID, and merchantName are required.' });
      return;
    }
    const now = new Date().toISOString();
    const existing = input.configId
      ? store.paymentConfigurations.find((c) => c.configId === input.configId)
      : undefined;
    if (existing) {
      existing.label = input.label.trim();
      existing.upiId = input.upiId.trim();
      existing.merchantName = input.merchantName.trim();
      existing.provider = input.provider || existing.provider;
      existing.enabled = typeof input.enabled === 'boolean' ? input.enabled : existing.enabled;
      existing.updatedAt = now;
    } else {
      store.paymentConfigurations.push({
        configId: input.configId || makeId('upi_cfg'),
        label: input.label.trim(),
        upiId: input.upiId.trim(),
        merchantName: input.merchantName.trim(),
        provider: input.provider || 'Sandbox UPI Pool',
        enabled: input.enabled !== false,
        mode: 'SANDBOX_ONLY',
        createdAt: now,
        updatedAt: now,
      });
    }
    persistStore();
    res.json({ ok: true, paymentConfigurations: store.paymentConfigurations });
  });

  app.put('/api/v1/admin/settings', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const updates = req.body as Partial<StoredAdminSettings>;
    store.adminSettings = {
      ...store.adminSettings,
      ...updates,
      settingId: 'default',
      updatedBy: req.caller!.email || req.caller!.uid,
      updatedAt: new Date().toISOString(),
    };
    addSecurityLog({
      actorUid: req.caller!.uid,
      actorEmail: req.caller!.email,
      action: 'ADMIN_BRANDING_SETTINGS_UPDATED',
      severity: 'info',
      targetId: 'default',
      details: `Updated platform settings (brand: ${store.adminSettings.brandName}, ticker: ${store.adminSettings.tickerEnabled}).`,
    });
    persistStore();
    res.json({ ok: true, adminSettings: store.adminSettings });
  });

  app.put('/api/v1/admin/ai-settings', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const updates = req.body as Partial<StoredAiFeatureSettings>;
    store.aiFeatureSettings = {
      ...store.aiFeatureSettings,
      ...updates,
      settingId: 'default',
      updatedBy: req.caller!.email || req.caller!.uid,
      updatedAt: new Date().toISOString(),
    };
    addSecurityLog({
      actorUid: req.caller!.uid,
      actorEmail: req.caller!.email,
      action: 'AI_FEATURE_CONTROLS_UPDATED',
      severity: 'warning',
      targetId: 'default',
      details: `Updated AI controls (masterEnabled=${store.aiFeatureSettings.masterEnabled}, dailyLimit=${store.aiFeatureSettings.dailyLimitPerUser}).`,
    });
    persistStore();
    res.json({ ok: true, aiFeatureSettings: store.aiFeatureSettings });
  });

  app.put('/api/v1/admin/gateway-config', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const updates = req.body as Partial<StoredGatewayConfig>;
    store.gatewayConfig = {
      ...store.gatewayConfig,
      ...updates,
      configId: 'default',
      gatewayMode: 'SANDBOX_ONLY',
      updatedBy: req.caller!.email || req.caller!.uid,
      updatedAt: new Date().toISOString(),
    };
    persistStore();
    res.json({ ok: true, gatewayConfig: store.gatewayConfig });
  });

  app.post('/api/v1/admin/coin-requests/:id/review', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    if (!canAdminMutateFinancials(getCallerAdminRole(req.caller!))) {
      res.status(403).json({ error: 'Support/Read-only staff cannot approve or reject coin requests.' });
      return;
    }
    const { decision, adminNote } = req.body as { decision?: 'approved' | 'rejected'; adminNote?: string };
    const coinReq = store.coinRequests.find((r) => r.requestId === req.params.id);
    if (!coinReq || coinReq.status !== 'pending') {
      res.status(404).json({ error: 'Pending coin request not found.' });
      return;
    }
    const now = new Date().toISOString();
    coinReq.status = decision === 'rejected' ? 'rejected' : 'approved';
    coinReq.adminNote = (adminNote || '').slice(0, 400);
    coinReq.reviewedBy = req.caller!.email;
    coinReq.updatedAt = now;

    if (coinReq.status === 'approved') {
      const wallet = store.wallets.find((w) => w.userId === coinReq.userId);
      const payment = store.payments.find((p) => p.paymentId === coinReq.paymentId);
      if (wallet) {
        const txId = makeId('tx');
        const sig = signPayload(['CREDIT', txId, coinReq.userId, coinReq.coinsRequested, coinReq.requestId]);
        wallet.availableCoins += coinReq.coinsRequested;
        wallet.totalPurchasedCoins += coinReq.coinsRequested;
        wallet.totalCreditedCoins = (wallet.totalCreditedCoins || 0) + coinReq.coinsRequested;
        wallet.lastTxId = txId;
        wallet.updatedAt = now;

        store.ledger.unshift({
          txId,
          userId: coinReq.userId,
          type: 'credit',
          amount: coinReq.coinsRequested,
          balanceAfter: wallet.availableCoins,
          referenceId: coinReq.requestId,
          serverSignature: sig,
          description: `Sandbox coin top-up approved (Payment ${coinReq.paymentId})`,
          status: 'completed',
          createdAt: now,
        });

        addNotification({
          userId: coinReq.userId,
          title: 'Coins Credited to Wallet',
          body: `${coinReq.coinsRequested} coins credited to your wallet (Ref ${txId}).`,
          category: 'wallet',
        });
      }
      if (payment) {
        payment.status = 'credited';
        payment.updatedAt = now;
      }
    } else {
      addNotification({
        userId: coinReq.userId,
        title: 'Coin Addition Request Rejected',
        body: `Request ${coinReq.requestId} was rejected: ${coinReq.adminNote || 'Verification incomplete.'}`,
        category: 'payment',
      });
    }

    addSecurityLog({
      actorUid: req.caller!.uid,
      actorEmail: req.caller!.email,
      action: `ADMIN_COIN_REQUEST_${coinReq.status.toUpperCase()}`,
      severity: 'info',
      targetId: coinReq.requestId,
      details: `${coinReq.status} ${coinReq.coinsRequested} coins for ${coinReq.userId}.`,
    });
    persistStore();
    res.json({ ok: true, coinRequest: coinReq });
  });

  function executeAdminCoinAdjustment(params: {
    caller: VerifiedCaller;
    userId?: string;
    action: 'add' | 'deduct';
    amountCoins?: number;
    reason?: string;
    idempotencyKey?: string;
  }): { status: number; body: Record<string, unknown> } {
    const wallet = store.wallets.find((w) => w.userId === params.userId);
    if (!wallet) {
      return { status: 404, body: { error: 'Target user wallet not found.' } };
    }
    const amt = Math.floor(Number(params.amountCoins) || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      return { status: 400, body: { error: 'Coin amount must be a positive whole number.' } };
    }
    const cleanReason = (params.reason || '').trim().slice(0, 300);
    if (cleanReason.length < 3) {
      return { status: 400, body: { error: 'Transaction reason (min 3 characters) is required.' } };
    }
    const cleanIdem =
      typeof params.idempotencyKey === 'string' && isValidSafeId(params.idempotencyKey)
        ? params.idempotencyKey
        : makeId('idem');
    if (store.walletTransactions.some((t) => t.idempotencyKey === cleanIdem)) {
      return { status: 409, body: { error: 'Duplicate transaction blocked by idempotency guard.' } };
    }
    if (params.action === 'deduct' && wallet.availableCoins < amt) {
      return {
        status: 400,
        body: {
          error: `Insufficient wallet balance (${wallet.availableCoins.toLocaleString()} coins available). Negative balances are prohibited.`,
        },
      };
    }

    const now = new Date().toISOString();
    const txId = makeId('wtx');
    const refId = makeId('adj');
    const balanceBefore = wallet.availableCoins;
    const balanceAfter = params.action === 'add' ? balanceBefore + amt : balanceBefore - amt;
    const sig = signPayload(['ADMIN_COIN_ADJ', params.action, txId, wallet.userId, amt, refId]);

    wallet.availableCoins = balanceAfter;
    if (params.action === 'add') {
      wallet.totalCreditedCoins = (wallet.totalCreditedCoins || 0) + amt;
    } else {
      wallet.totalDebitedCoins = (wallet.totalDebitedCoins || 0) + amt;
    }
    wallet.lastTxId = txId;
    wallet.updatedAt = now;

    const walletTx: StoredWalletTransaction = {
      txId,
      idempotencyKey: cleanIdem,
      userId: wallet.userId,
      adminId: params.caller.uid,
      adminEmail: params.caller.email || params.caller.uid,
      action: params.action,
      amount: amt,
      balanceBefore,
      balanceAfter,
      reason: cleanReason,
      status: 'completed',
      createdAt: now,
    };
    store.walletTransactions.unshift(walletTx);

    store.ledger.unshift({
      txId,
      userId: wallet.userId,
      type: 'adjustment',
      amount: amt,
      balanceAfter,
      referenceId: refId,
      serverSignature: sig,
      description: `Admin ${params.action === 'add' ? 'Credit' : 'Deduction'}: ${cleanReason}`.slice(0, 300),
      status: 'completed',
      createdAt: now,
    });

    const auditEntry: StoredAdminAuditLog = {
      auditId: makeId('aud'),
      adminId: params.caller.uid,
      adminEmail: params.caller.email || params.caller.uid,
      actionType: params.action === 'add' ? 'COIN_ADD' : 'COIN_DEDUCT',
      targetUserId: wallet.userId,
      targetEntityId: txId,
      amount: amt,
      reason: cleanReason,
      payoutReferenceNumber: '',
      details: `${params.action === 'add' ? 'Added' : 'Deducted'} ${amt} coins (${balanceBefore} -> ${balanceAfter}).`,
      createdAt: now,
    };
    store.adminAuditLogs.unshift(auditEntry);

    addNotification({
      userId: wallet.userId,
      title: params.action === 'add' ? `Wallet Credited: +${amt} Coins` : `Wallet Deducted: -${amt} Coins`,
      body: `${params.action === 'add' ? 'Added' : 'Deducted'} ${amt} coins by Admin (${cleanReason}). Updated balance: ${balanceAfter.toLocaleString()} coins.`,
      category: 'wallet',
    });
    addSecurityLog({
      actorUid: params.caller.uid,
      actorEmail: params.caller.email,
      action: params.action === 'add' ? 'ADMIN_COIN_ADDED' : 'ADMIN_COIN_DEDUCTED',
      severity: 'warning',
      targetId: wallet.userId,
      details: `${params.action === 'add' ? '+' : '-'}${amt} coins (${balanceBefore} -> ${balanceAfter}): ${cleanReason}`,
    });
    persistStore();
    return { status: 200, body: { ok: true, wallet, transaction: walletTx, audit: auditEntry } };
  }

  app.post('/api/v1/admin/wallets/adjust', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const callerRole = getCallerAdminRole(req.caller!);
    if (!canAdminMutateFinancials(callerRole)) {
      res.status(403).json({ error: 'Support/Read-only staff cannot adjust coin wallets.' });
      return;
    }
    const { userId, action, amountCoins, reason, idempotencyKey } = req.body as {
      userId?: string;
      action?: 'add' | 'deduct';
      amountCoins?: number;
      reason?: string;
      idempotencyKey?: string;
    };
    const resolvedAction: 'add' | 'deduct' = action === 'deduct' ? 'deduct' : 'add';
    const result = executeAdminCoinAdjustment({
      caller: req.caller!,
      userId,
      action: resolvedAction,
      amountCoins,
      reason,
      idempotencyKey,
    });
    res.status(result.status).json(result.body);
  });

  app.post('/api/v1/admin/wallets/credit', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    if (!canAdminMutateFinancials(getCallerAdminRole(req.caller!))) {
      res.status(403).json({ error: 'Support/Read-only staff cannot adjust coin wallets.' });
      return;
    }
    const { userId, amountCoins, reason, idempotencyKey } = req.body as {
      userId?: string;
      amountCoins?: number;
      reason?: string;
      idempotencyKey?: string;
    };
    const result = executeAdminCoinAdjustment({
      caller: req.caller!,
      userId,
      action: 'add',
      amountCoins,
      reason: reason || 'Admin manual credit',
      idempotencyKey,
    });
    res.status(result.status).json(result.body);
  });

  app.post('/api/v1/admin/payments/:id/refund', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    if (!canAdminMutateFinancials(getCallerAdminRole(req.caller!))) {
      res.status(403).json({ error: 'Support/Read-only staff cannot process payment refunds.' });
      return;
    }
    const payment = store.payments.find((p) => p.paymentId === req.params.id);
    if (!payment || payment.status === 'refunded') {
      res.status(404).json({ error: 'Payment not eligible for refund.' });
      return;
    }
    const now = new Date().toISOString();
    const wasCredited = payment.status === 'credited';
    payment.status = 'refunded';
    payment.updatedAt = now;

    if (wasCredited) {
      const wallet = store.wallets.find((w) => w.userId === payment.userId);
      if (wallet) {
        const txId = makeId('tx');
        const sig = signPayload(['REFUND', txId, payment.userId, payment.coinsRequested, payment.paymentId]);
        wallet.availableCoins = Math.max(0, wallet.availableCoins - payment.coinsRequested);
        wallet.lastTxId = txId;
        wallet.updatedAt = now;
        store.ledger.unshift({
          txId,
          userId: payment.userId,
          type: 'refund',
          amount: payment.coinsRequested,
          balanceAfter: wallet.availableCoins,
          referenceId: payment.paymentId,
          serverSignature: sig,
          description: `Sandbox payment ${payment.paymentId} refunded & coins reversed`,
          status: 'reversed',
          createdAt: now,
        });
      }
    }
    addSecurityLog({
      actorUid: req.caller!.uid,
      actorEmail: req.caller!.email,
      action: 'SANDBOX_PAYMENT_REFUNDED',
      severity: 'warning',
      targetId: payment.paymentId,
      details: `Refunded ${payment.paymentId}.`,
    });
    persistStore();
    res.json({ ok: true, payment });
  });

  function executeWithdrawalStatusUpdate(params: {
    caller: VerifiedCaller;
    withdrawalId: string;
    status: StoredWithdrawalStatus;
    reason?: string;
    payoutReferenceNumber?: string;
    providerConfirmed?: boolean;
  }): { status: number; body: Record<string, unknown> } {
    const allowed: StoredWithdrawalStatus[] = [
      'pending',
      'under_review',
      'approved',
      'processing',
      'successful',
      'rejected',
      'failed',
    ];
    if (!allowed.includes(params.status)) {
      return { status: 400, body: { error: 'Unsupported withdrawal status.' } };
    }
    const wd = store.withdrawals.find((w) => w.withdrawalId === params.withdrawalId);
    if (!wd) {
      return { status: 404, body: { error: 'Withdrawal request not found.' } };
    }

    const cleanReason = (params.reason || '').trim().slice(0, 400);
    const cleanRef = (params.payoutReferenceNumber ?? wd.payoutReferenceNumber ?? '').trim().slice(0, 128);
    const confirmed = Boolean(params.providerConfirmed);

    if ((params.status === 'rejected' || params.status === 'failed') && cleanReason.length < 3) {
      return {
        status: 400,
        body: { error: `A detailed reason (min 3 characters) is required when marking a withdrawal ${params.status}.` },
      };
    }

    if (params.status === 'successful') {
      if (!confirmed || cleanRef.length < 4) {
        return {
          status: 400,
          body: {
            error:
              'A withdrawal can only be marked Successful after authorized payout provider confirmation and a valid Payout Reference Number (min 4 chars).',
          },
        };
      }
    }

    const wallet = store.wallets.find((w) => w.userId === wd.userId);
    const now = new Date().toISOString();
    const shouldDebit = params.status === 'approved' || params.status === 'processing' || params.status === 'successful';
    const shouldRefund = params.status === 'rejected' || params.status === 'failed';

    if (shouldDebit && !wd.debitedFromWallet) {
      if (!wallet || wallet.availableCoins < wd.amountCoins) {
        return {
          status: 400,
          body: {
            error: `User wallet lacks ${wd.amountCoins.toLocaleString()} available coins to approve/process this withdrawal.`,
          },
        };
      }
      const txId = makeId('tx');
      wallet.availableCoins -= wd.amountCoins;
      wallet.totalDebitedCoins = (wallet.totalDebitedCoins || 0) + wd.amountCoins;
      wallet.lastTxId = txId;
      wallet.updatedAt = now;
      wd.debitedFromWallet = true;
      store.ledger.unshift({
        txId,
        userId: wd.userId,
        type: 'debit',
        amount: wd.amountCoins,
        balanceAfter: wallet.availableCoins,
        referenceId: wd.withdrawalId,
        serverSignature: signPayload(['WD', txId, wd.userId, wd.amountCoins, wd.withdrawalId]),
        description: `Withdrawal ${params.status.replace('_', ' ')} (${wd.payoutChannel})`,
        status: 'completed',
        createdAt: now,
      });
    } else if (shouldRefund && wd.debitedFromWallet && wallet) {
      const txId = makeId('tx');
      wallet.availableCoins += wd.amountCoins;
      wallet.lastTxId = txId;
      wallet.updatedAt = now;
      wd.debitedFromWallet = false;
      store.ledger.unshift({
        txId,
        userId: wd.userId,
        type: 'refund',
        amount: wd.amountCoins,
        balanceAfter: wallet.availableCoins,
        referenceId: wd.withdrawalId,
        serverSignature: signPayload(['WD_REFUND', txId, wd.userId, wd.amountCoins, wd.withdrawalId]),
        description: `Withdrawal ${params.status} coin reversal (${cleanReason || 'Cancelled'})`.slice(0, 300),
        status: 'reversed',
        createdAt: now,
      });
    }

    wd.status = params.status;
    wd.adminNote = cleanReason || wd.adminNote;
    wd.reviewedBy = params.caller.email || params.caller.uid;
    wd.payoutReferenceNumber = cleanRef;
    wd.providerConfirmed = params.status === 'successful' ? true : confirmed || wd.providerConfirmed || false;
    wd.updatedAt = now;

    const actionType: StoredAdminAuditLog['actionType'] =
      params.status === 'approved'
        ? 'WITHDRAWAL_APPROVED'
        : params.status === 'rejected'
        ? 'WITHDRAWAL_REJECTED'
        : params.status === 'successful'
        ? 'WITHDRAWAL_SUCCESSFUL'
        : params.status === 'failed'
        ? 'WITHDRAWAL_FAILED'
        : 'WITHDRAWAL_STATUS_UPDATE';

    const auditEntry: StoredAdminAuditLog = {
      auditId: makeId('aud'),
      adminId: params.caller.uid,
      adminEmail: params.caller.email || params.caller.uid,
      actionType,
      targetUserId: wd.userId,
      targetEntityId: wd.withdrawalId,
      amount: wd.amountCoins,
      reason: cleanReason,
      payoutReferenceNumber: cleanRef,
      details: `Withdrawal ${wd.withdrawalId} -> ${params.status}${cleanRef ? ` (Ref ${cleanRef})` : ''}.`,
      createdAt: now,
    };
    store.adminAuditLogs.unshift(auditEntry);

    const statusLabelMap: Record<StoredWithdrawalStatus, string> = {
      pending: 'Pending',
      under_review: 'Under Review',
      approved: 'Approved',
      processing: 'Processing',
      successful: 'Successful',
      rejected: 'Rejected',
      failed: 'Failed',
    };

    addNotification({
      userId: wd.userId,
      title: `Withdrawal Status: ${statusLabelMap[params.status]}`,
      body: `Request ${wd.withdrawalId} (${wd.amountCoins.toLocaleString()} coins) is now ${statusLabelMap[params.status]}.${cleanRef ? ` Ref: ${cleanRef}.` : ''} ${cleanReason}`,
      category: 'wallet',
    });
    addSecurityLog({
      actorUid: params.caller.uid,
      actorEmail: params.caller.email,
      action: `WITHDRAWAL_${params.status.toUpperCase()}`,
      severity: params.status === 'failed' || params.status === 'rejected' ? 'warning' : 'info',
      targetId: wd.withdrawalId,
      details: `Set ${wd.withdrawalId} (${wd.amountCoins} coins) to ${params.status}. ${cleanRef ? `Ref: ${cleanRef}. ` : ''}${cleanReason}`,
    });
    persistStore();
    return { status: 200, body: { ok: true, withdrawal: wd, audit: auditEntry } };
  }

  app.post('/api/v1/admin/withdrawals/:id/status', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const callerRole = getCallerAdminRole(req.caller!);
    if (!canAdminMutateFinancials(callerRole)) {
      res.status(403).json({ error: 'Support/Read-only staff cannot modify withdrawal payouts.' });
      return;
    }
    const { status, reason, payoutReferenceNumber, providerConfirmed } = req.body as {
      status?: StoredWithdrawalStatus;
      reason?: string;
      payoutReferenceNumber?: string;
      providerConfirmed?: boolean;
    };
    if (!status) {
      res.status(400).json({ error: 'Target withdrawal status is required.' });
      return;
    }
    const result = executeWithdrawalStatusUpdate({
      caller: req.caller!,
      withdrawalId: req.params.id,
      status,
      reason,
      payoutReferenceNumber,
      providerConfirmed,
    });
    res.status(result.status).json(result.body);
  });

  app.post('/api/v1/admin/withdrawals/:id/review', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    if (!canAdminMutateFinancials(getCallerAdminRole(req.caller!))) {
      res.status(403).json({ error: 'Support/Read-only staff cannot modify withdrawal payouts.' });
      return;
    }
    const { decision, adminNote, payoutReferenceNumber, providerConfirmed } = req.body as {
      decision?: StoredWithdrawalStatus;
      adminNote?: string;
      payoutReferenceNumber?: string;
      providerConfirmed?: boolean;
    };
    const result = executeWithdrawalStatusUpdate({
      caller: req.caller!,
      withdrawalId: req.params.id,
      status: decision || 'approved',
      reason: adminNote,
      payoutReferenceNumber,
      providerConfirmed,
    });
    res.status(result.status).json(result.body);
  });

  app.post('/api/v1/admin/users/:uid/status', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const callerRole = getCallerAdminRole(req.caller!);
    if (!canAdminMutateFinancials(callerRole)) {
      res.status(403).json({ error: 'Only Admin or Super Admin roles can suspend or reactivate accounts.' });
      return;
    }
    const { status, reason } = req.body as { status?: StoredUser['status']; reason?: string };
    const u = store.users.find(
      (x) => x.uid === req.params.uid || (x.publicUserId && x.publicUserId.toUpperCase() === req.params.uid.toUpperCase())
    );
    if (!u || !status || !['active', 'flagged', 'suspended'].includes(status)) {
      res.status(400).json({ error: 'Valid user and status required.' });
      return;
    }
    const prevStatus = u.status;
    const now = new Date().toISOString();
    const cleanReason = (reason || `Admin set account status from ${prevStatus} to ${status}`).trim().slice(0, 300);
    u.status = status;
    u.updatedAt = now;

    store.adminAuditLogs.unshift({
      auditId: makeId('aud'),
      adminId: req.caller!.uid,
      adminEmail: req.caller!.email || req.caller!.uid,
      actionType: 'USER_STATUS_UPDATED',
      targetUserId: u.uid,
      targetEntityId: u.publicUserId || u.uid,
      amount: 0,
      reason: cleanReason,
      payoutReferenceNumber: '',
      details: `Account ${u.publicUserId || u.uid} status changed ${prevStatus} -> ${status}.`,
      createdAt: now,
    });
    addSecurityLog({
      actorUid: req.caller!.uid,
      actorEmail: req.caller!.email,
      action: 'USER_STATUS_CHANGED',
      severity: status === 'suspended' ? 'warning' : 'info',
      targetId: u.uid,
      details: `Set ${u.publicUserId || u.uid} (${u.email || u.phone}) status to ${status}. ${cleanReason}`,
    });
    persistStore();
    res.json({ ok: true, user: u });
  });

  app.post('/api/v1/admin/roles', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const callerRole = getCallerAdminRole(req.caller!);
    if (callerRole !== 'super_admin' && callerRole !== 'admin') {
      res.status(403).json({ error: 'Only Super Admin or Admin roles can assign RBAC privileges.' });
      return;
    }
    const { uid, email, role } = req.body as {
      uid?: string;
      email?: string;
      role?: StoredAdminRole['role'];
    };
    if (!email || !role) {
      res.status(400).json({ error: 'Email and role are required.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const targetUid = (uid || makeId('adm')).trim();
    const now = new Date().toISOString();
    const existing = store.admins.find((a) => a.email.toLowerCase() === cleanEmail || a.uid === targetUid);
    const perms =
      role === 'super_admin'
        ? ['users', 'products', 'plans', 'ledger', 'withdrawals', 'support', 'ai', 'config']
        : role === 'admin'
        ? ['users', 'products', 'plans', 'ledger', 'withdrawals', 'support']
        : role === 'support_staff'
        ? ['support', 'users']
        : ['read_only'];

    if (existing) {
      existing.role = role;
      existing.permissions = perms;
      existing.updatedAt = now;
    } else {
      store.admins.push({
        uid: targetUid,
        email: cleanEmail,
        role,
        permissions: perms,
        grantedBy: req.caller!.email,
        createdAt: now,
        updatedAt: now,
      });
    }
    authorizedAdminEmails.add(cleanEmail);
    persistStore();
    res.json({ ok: true, admins: store.admins });
  });

  app.post('/api/v1/admin/notifications/broadcast', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const { userId, title, body } = req.body as { userId?: string; title?: string; body?: string };
    if (!title || !body) {
      res.status(400).json({ error: 'Title and body are required.' });
      return;
    }
    if (userId === 'ALL') {
      for (const u of store.users) {
        addNotification({ userId: u.uid, title, body, category: 'system' });
      }
    } else if (userId) {
      addNotification({ userId, title, body, category: 'system' });
    }
    persistStore();
    res.json({ ok: true });
  });

  // --- LEGACY COMPATIBILITY ROUTES (FOR EXISTING FIREBASE SYNC FLOWS) ---
  app.post('/api/admin/verify-session', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    if (!isCallerAdmin(caller)) {
      res.status(403).json({
        authorized: false,
        error: 'This account is not listed in the Super Admin registry.',
      });
      return;
    }
    const isSuper = caller.email.toLowerCase() === BOOTSTRAPPED_SUPER_ADMIN_EMAIL;
    const sessionToken = signPayload(['ADMIN_SESSION', caller.uid, caller.email, Date.now()]);
    res.json({
      authorized: true,
      role: isSuper ? 'super_admin' : 'admin',
      email: caller.email,
      sessionSignature: sessionToken,
    });
  });

  app.post('/api/admin/sync-role', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const { targetEmail, action } = req.body as { targetEmail?: string; action?: 'grant' | 'revoke' };
    if (typeof targetEmail !== 'string' || !targetEmail.includes('@')) {
      res.status(400).json({ error: 'Valid targetEmail is required.' });
      return;
    }
    const normalized = targetEmail.trim().toLowerCase();
    if (action === 'revoke') {
      if (normalized === BOOTSTRAPPED_SUPER_ADMIN_EMAIL) {
        res.status(400).json({ error: 'Cannot revoke bootstrapped Super Admin.' });
        return;
      }
      authorizedAdminEmails.delete(normalized);
    } else {
      authorizedAdminEmails.add(normalized);
    }
    res.json({ ok: true, targetEmail: normalized, action: action || 'grant' });
  });

  app.post('/api/payments/sandbox-intent', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const { amountInr, coinRateInr = 1, upiApp, idempotencyKey } = req.body as {
      amountInr?: number;
      coinRateInr?: number;
      upiApp?: string;
      idempotencyKey?: string;
    };

    const allowedApps = ['GPay Sandbox', 'PhonePe Sandbox', 'Paytm Sandbox', 'BHIM Sandbox', 'QR Sandbox'];
    if (typeof amountInr !== 'number' || !Number.isFinite(amountInr) || amountInr < 10 || amountInr > 500000) {
      res.status(400).json({ error: 'Amount must be between INR 10 and INR 500,000.' });
      return;
    }
    if (!upiApp || !allowedApps.includes(upiApp) || !isValidSafeId(idempotencyKey)) {
      res.status(400).json({ error: 'Invalid UPI app or idempotencyKey.' });
      return;
    }

    const existing = processedIdempotencyKeys.get(`${caller.uid}:${idempotencyKey}`);
    if (existing) {
      res.status(409).json({
        error: 'Duplicate payment request blocked by idempotency guard.',
        duplicatePaymentId: existing.paymentId,
      });
      return;
    }

    const enabledConfigs = store.paymentConfigurations.filter((c) => c.enabled);
    const chosen =
      enabledConfigs.length > 0
        ? enabledConfigs[crypto.randomInt(0, enabledConfigs.length)]
        : {
            configId: 'default',
            upiId: store.gatewayConfig.sandboxVpa,
            merchantName: store.gatewayConfig.merchantName,
            provider: store.gatewayConfig.providerName,
          };

    const paymentId = makeId('pay');
    const coinsRequested = Math.floor(amountInr * coinRateInr);
    const serverSignature = signPayload(['INTENT', paymentId, caller.uid, amountInr, coinsRequested, chosen.configId, idempotencyKey]);
    processedIdempotencyKeys.set(`${caller.uid}:${idempotencyKey}`, { paymentId, createdAt: Date.now() });

    const upiUri = `upi://pay?pa=${encodeURIComponent(chosen.upiId)}&pn=${encodeURIComponent(
      chosen.merchantName
    )}&am=${amountInr.toFixed(2)}&cu=INR&tr=${encodeURIComponent(paymentId)}&tn=${encodeURIComponent(
      'SANDBOX_SIMULATION_NO_REAL_FUNDS'
    )}`;

    res.json({
      paymentId,
      coinsRequested,
      upiUri,
      sandboxVpa: chosen.upiId,
      assignedConfigId: chosen.configId,
      merchantName: chosen.merchantName,
      gatewayProvider: chosen.provider,
      serverSignature,
      isSimulated: true,
      warning: 'SANDBOX ONLY: Assigned random sandbox UPI desk. No real UPI rails are connected.',
    });
  });

  app.post('/api/payments/sandbox-webhook', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const { paymentId, amountInr, coinsRequested, outcome } = req.body as {
      paymentId?: string;
      amountInr?: number;
      coinsRequested?: number;
      outcome?: 'success' | 'failed';
    };

    if (!isValidSafeId(paymentId) || typeof amountInr !== 'number' || typeof coinsRequested !== 'number') {
      res.status(400).json({ error: 'Invalid webhook payload.' });
      return;
    }
    if (processedWebhookEvents.has(paymentId)) {
      res.status(409).json({ error: 'Webhook already processed for this paymentId (duplicate blocked).' });
      return;
    }
    processedWebhookEvents.add(paymentId);
    const webhookEventId = makeId('wh_sbx');
    const status = outcome === 'failed' ? 'failed' : 'webhook_verified';
    const failureReason = outcome === 'failed' ? 'Simulated gateway timeout / sandbox decline (SANDBOX_ERR_402).' : '';
    const serverSignature = signPayload(['WEBHOOK', paymentId, webhookEventId, caller.uid, amountInr, coinsRequested, status]);

    res.json({
      paymentId,
      webhookEventId,
      status,
      failureReason,
      serverSignature,
      isSimulated: true,
      note: 'Webhook verified in sandbox. Coin credit requires Admin ledger approval.',
    });
  });

  app.post('/api/ledger/attest', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const caller = req.caller!;
    const { actionType, targetUserId, amount, referenceId } = req.body as {
      actionType?: 'credit' | 'debit' | 'plan_credit' | 'commission_sim' | 'refund' | 'adjustment';
      targetUserId?: string;
      amount?: number;
      referenceId?: string;
    };

    if (!actionType || !isValidSafeId(targetUserId) || !isValidSafeId(referenceId) || typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ error: 'Invalid ledger attestation payload.' });
      return;
    }

    const isPrivilegedAction = actionType !== 'debit';
    if (isPrivilegedAction && !isCallerAdmin(caller)) {
      res.status(403).json({ error: 'Only authorized administrators can attest coin credits or adjustments.' });
      return;
    }
    if (!isPrivilegedAction && targetUserId !== caller.uid && !isCallerAdmin(caller)) {
      res.status(403).json({ error: 'Cannot attest debit for another user.' });
      return;
    }

    const txId = makeId('tx');
    const serverSignature = signPayload(['LEDGER', txId, actionType, targetUserId, amount, referenceId]);
    res.json({ txId, serverSignature, attestedAt: new Date().toISOString() });
  });

  // --- 11 AI SMART PLATFORM ENDPOINTS (/api/v1/ai/* + compatibility) ---

  // 1. AI Smart Assistant (User + Admin, Voice & Multilingual EN/HI)
  app.post('/api/v1/ai/smart-assistant', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const caller = req.caller!;
      const { message, language, isVoice, contextSummary } = req.body as {
        message?: string;
        language?: 'en' | 'hi';
        isVoice?: boolean;
        contextSummary?: Record<string, unknown>;
      };
      if (!message || message.trim().length < 2) {
        res.status(400).json({ error: 'Message is required.' });
        return;
      }

      const { wallet } = ensureServerUserAndWallet(caller);
      const activePlans = store.planPurchases.filter((p) => p.userId === caller.uid);
      const userContext = {
        wallet: {
          availableCoins: wallet.availableCoins,
          totalPurchasedCoins: wallet.totalPurchasedCoins,
          totalCreditedCoins: wallet.totalCreditedCoins,
        },
        activePlans,
        availablePlans: store.plans.filter((p) => p.status === 'active'),
        availableCoinPackages: store.coinPackages.filter((c) => c.status === 'active'),
        ...(contextSummary || {}),
      };

      const result = await runGeminiModule({
        caller,
        moduleKey: 'aiSmartAssistant',
        language,
        isVoice,
        systemInstruction:
          'You are the Kestrel Smart Fintech Assistant. Explain coin packages, 24-hour scheduled plan credits, sandbox UPI verification, and helpdesk policies clearly. Never promise financial profits or bypass admin approval. If isVoice is true, keep spokenReply brief and natural.',
        prompt: `User question: "${message.trim()}"\nUser Context:\n${JSON.stringify(userContext, null, 2).slice(0, 12000)}`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            spokenSummary: { type: Type.STRING },
            suggestedFollowUps: { type: Type.ARRAY, items: { type: Type.STRING } },
            safetyNote: { type: Type.STRING },
          },
        },
      });
      res.json({ result, model: 'gemini-4-hydrogen' });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Smart Assistant error.' });
    }
  });

  // 2. AI Admin Dashboard (Admin Assistant)
  const handleAdminAssistant = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { command, platformSnapshot, language } = req.body as {
        command?: string;
        platformSnapshot?: Record<string, unknown>;
        language?: 'en' | 'hi';
      };
      if (typeof command !== 'string' || command.trim().length < 2 || command.length > 2000) {
        res.status(400).json({ error: 'Valid command (2-2000 chars) is required.' });
        return;
      }
      const mergedSnapshot = {
        ...(platformSnapshot || {}),
        serverSummary: {
          users: store.users.length,
          activePlans: store.planPurchases.filter((p) => p.status === 'active').length,
          pendingSchedules: store.planCreditSchedules.filter((s) => s.status === 'pending').length,
          paymentsCount: store.payments.length,
          pendingCoinRequests: store.coinRequests.filter((r) => r.status === 'pending').length,
          recentAiErrors: store.aiUsageLogs.filter((l) => !l.success).slice(0, 10),
        },
      };
      const result = await runGeminiModule({
        caller: req.caller!,
        moduleKey: 'aiAdminDashboard',
        language,
        systemInstruction:
          'You are the Kestrel Super Admin AI Analyst. Analyze platform telemetry, coin wallets, 24h plan schedules, sandbox UPI requests, and security logs. AI is strictly advisory-only; never claim to approve payments or modify balances.',
        prompt: `Admin Command: "${command.trim()}"\nSnapshot:\n${JSON.stringify(mergedSnapshot, null, 2).slice(0, 16000)}`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            category: { type: Type.STRING },
            metrics: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { label: { type: Type.STRING }, value: { type: Type.STRING } },
              },
            },
            anomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendedActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            complianceNotice: { type: Type.STRING },
          },
        },
      });
      res.json({ result, model: 'gemini-4-hydrogen' });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Admin AI failed.' });
    }
  };
  app.post('/api/ai/admin-assistant', requireAdmin, handleAdminAssistant);
  app.post('/api/v1/ai/admin-dashboard', requireAdmin, handleAdminAssistant);

  // 3. AI Fraud Detection
  app.post('/api/v1/ai/fraud-detection', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { telemetrySnapshot, language } = req.body as {
        telemetrySnapshot?: Record<string, unknown>;
        language?: 'en' | 'hi';
      };
      const payload = telemetrySnapshot || {
        payments: store.payments.slice(0, 40),
        withdrawals: store.withdrawals.slice(0, 30),
        securityLogs: store.securityLogs.slice(0, 40),
        users: store.users.slice(0, 30).map((u) => ({ uid: u.uid, status: u.status, authMethod: u.authMethod })),
      };
      const result = await runGeminiModule({
        caller: req.caller!,
        moduleKey: 'aiFraudDetection',
        language,
        systemInstruction:
          'Analyze fintech platform telemetry for suspicious patterns: duplicate payment intent retries, repeated OTP lockouts, high-frequency failed payments, rapid withdrawal requests, or flagged accounts. Output structured risk alerts.',
        prompt: `Inspect telemetry for anomalies:\n${JSON.stringify(payload, null, 2).slice(0, 16000)}`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallRiskLevel: { type: Type.STRING },
            riskScore: { type: Type.NUMBER },
            flaggedSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendedReviews: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      });
      res.json({ result, model: 'gemini-4-hydrogen' });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Fraud analysis failed.' });
    }
  });

  // 4. AI Smart Suggestions
  app.post('/api/v1/ai/smart-suggestions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const caller = req.caller!;
      const { wallet } = ensureServerUserAndWallet(caller);
      const { language } = req.body as { language?: 'en' | 'hi' };
      const result = await runGeminiModule({
        caller,
        moduleKey: 'aiSmartSuggestions',
        language,
        systemInstruction:
          'Provide 3 grounded, factual recommendations for a Kestrel user based strictly on their current coin balance, active plans, and available catalog plans/packages. Never fabricate returns or financial promises.',
        prompt: `User coins: ${wallet.availableCoins}. Plans: ${JSON.stringify(
          store.plans.filter((p) => p.status === 'active')
        )}. Coin packages: ${JSON.stringify(store.coinPackages.filter((c) => c.status === 'active').slice(0, 6))}`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  actionTab: { type: Type.STRING },
                },
              },
            },
          },
        },
      });
      res.json({ result, model: 'gemini-4-hydrogen' });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Smart suggestions failed.' });
    }
  });

  // 5. AI Helpdesk (Ticket Classifier & Self-Help)
  const handleHelpdeskAi = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { subject, description, category, language } = req.body as {
        subject?: string;
        description?: string;
        category?: string;
        language?: 'en' | 'hi';
      };
      const result = await runGeminiModule({
        caller: req.caller!,
        moduleKey: 'aiHelpdesk',
        language,
        systemInstruction:
          'Triage fintech support tickets accurately. Suggest priority (normal or high), fraud/security risk flag, triage note, and a polite helpful draft reply grounded in sandbox rules.',
        prompt: `Category: ${category || 'Other'}\nSubject: ${subject || ''}\nDescription: ${description || ''}`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedPriority: { type: Type.STRING },
            riskFlag: { type: Type.BOOLEAN },
            triageNote: { type: Type.STRING },
            draftReply: { type: Type.STRING },
          },
        },
      });
      res.json({ triage: result });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Helpdesk AI failed.' });
    }
  };
  app.post('/api/ai/classify-ticket', requireAdmin, handleHelpdeskAi);
  app.post('/api/v1/ai/helpdesk', requireAuth, handleHelpdeskAi);

  // 6. AI Theme Designer (Preview JSON before Publish)
  app.post('/api/v1/ai/theme-designer', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { stylePrompt } = req.body as { stylePrompt?: string };
      if (!stylePrompt || stylePrompt.trim().length < 3) {
        res.status(400).json({ error: 'Provide a theme description prompt.' });
        return;
      }
      const result = await runGeminiModule({
        caller: req.caller!,
        moduleKey: 'aiThemeDesigner',
        systemInstruction:
          'Generate an accessible fintech UI theme proposal JSON. Provide a hex accentColor with strong contrast, recommended defaultTheme ("light" or "dark"), refined tagline (max 80 chars), and brief rationale. Admin will preview before publishing.',
        prompt: `Requested aesthetic: "${stylePrompt.trim()}"`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            accentColor: { type: Type.STRING },
            defaultTheme: { type: Type.STRING },
            tagline: { type: Type.STRING },
            rationale: { type: Type.STRING },
          },
        },
      });
      res.json({ proposal: result, model: 'gemini-4-hydrogen' });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Theme Designer AI failed.' });
    }
  });

  // 7. Smart Notification Engine
  app.post('/api/v1/ai/smart-notifications', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { topic, language } = req.body as { topic?: string; language?: 'en' | 'hi' };
      const result = await runGeminiModule({
        caller: req.caller!,
        moduleKey: 'smartNotificationEngine',
        language,
        systemInstruction:
          'Draft concise, trustworthy fintech platform notification copy (title <= 60 chars, body <= 200 chars) for users about 24-hour plan credits, sandbox payment verification, or account security.',
        prompt: `Draft notification for topic: "${topic || '24-hour plan credit reminder'}"`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            body: { type: Type.STRING },
          },
        },
      });
      res.json({ draft: result });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Smart notification draft failed.' });
    }
  });

  // 8. AI Database Health Monitor
  app.post('/api/v1/ai/db-health', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const nowMs = Date.now();
      const overdueEvents = store.planCreditSchedules.filter(
        (s) => s.status === 'pending' && Date.parse(s.dueAtIso) < nowMs - 120_000
      ).length;
      const healthSnapshot = {
        walletsCount: store.wallets.length,
        ledgerEntriesCount: store.ledger.length,
        activePlanPurchases: store.planPurchases.filter((p) => p.status === 'active').length,
        overduePlanEvents: overdueEvents,
        recentSystemHealthLogs: store.systemHealthLogs.slice(0, 20),
        recentAiErrors: store.aiUsageLogs.filter((l) => !l.success).slice(0, 15),
      };
      const result = await runGeminiModule({
        caller: req.caller!,
        moduleKey: 'aiDatabaseHealthMonitor',
        systemInstruction:
          'Analyze ledger integrity, overdue 24h plan schedules, system health logs, and AI error rates. Provide status ("healthy", "attention", "degraded"), findings, and remediation steps.',
        prompt: `Database & Scheduler Health Telemetry:\n${JSON.stringify(healthSnapshot, null, 2)}`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            healthStatus: { type: Type.STRING },
            summary: { type: Type.STRING },
            findings: { type: Type.ARRAY, items: { type: Type.STRING } },
            remediationSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      });
      res.json({ report: result, snapshot: healthSnapshot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'DB Health Monitor failed.' });
    }
  });

  // 9. AI Business Intelligence
  app.post('/api/v1/ai/business-intelligence', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { language } = req.body as { language?: 'en' | 'hi' };
      const biSnapshot = {
        totalCoinsInCirculation: store.wallets.reduce((s, w) => s + w.availableCoins, 0),
        totalPendingPlanObligations: store.planCreditSchedules
          .filter((s) => s.status === 'pending')
          .reduce((s, x) => s + x.scheduledCoins, 0),
        topCoinPackages: store.coinPackages.map((c) => c.name),
        planEnrollmentCounts: store.plans.map((p) => ({
          name: p.name,
          purchases: store.planPurchases.filter((pp) => pp.planId === p.planId).length,
        })),
        withdrawalVolume: store.withdrawals.reduce((s, w) => s + w.amountCoins, 0),
      };
      const result = await runGeminiModule({
        caller: req.caller!,
        moduleKey: 'aiBusinessIntelligence',
        language,
        systemInstruction:
          'Provide executive sandbox business intelligence insights: coin velocity, upcoming 24h plan credit obligations, popular package tiers, and operational suggestions.',
        prompt: `BI Snapshot:\n${JSON.stringify(biSnapshot, null, 2)}`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING },
            obligationsForecast: { type: Type.STRING },
            highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      });
      res.json({ bi: result, snapshot: biSnapshot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'BI analysis failed.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kestrel server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
