export type UserRole = 'user' | 'admin' | 'super_admin';
export type UserStatus = 'active' | 'suspended' | 'flagged';
export type AuthMethod = 'google' | 'email_otp' | 'mobile_otp';

export interface UserProfile {
  uid: string;
  publicUserId?: string;
  displayName: string;
  email: string;
  phone: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  photoURL: string;
  referralCode: string;
  referredBy: string;
  status: UserStatus;
  role: UserRole;
  authMethod?: AuthMethod;
  twoFactorEnabled: boolean;
  privacyProfileVisible: boolean;
  privacyAnalyticsOptIn: boolean;
  lastLoginAt?: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface UserCounterRecord {
  counterId: string;
  lastSeq: number;
  updatedAt: unknown;
}

export type AdminRoleType = 'super_admin' | 'admin' | 'support_staff' | 'read_only_staff' | 'finance_admin' | 'support_admin';

export interface AdminRoleRecord {
  uid: string;
  email: string;
  role: AdminRoleType;
  permissions: string[];
  grantedBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface Wallet {
  userId: string;
  availableCoins: number;
  pendingCoins: number;
  totalPurchasedCoins: number;
  totalCreditedCoins?: number;
  totalDebitedCoins?: number;
  simulatedCommissionBalance: number;
  lastTxId: string;
  updatedAt: unknown;
}

export interface WalletLedgerEntry {
  txId: string;
  userId: string;
  type: 'credit' | 'debit' | 'plan_credit' | 'commission_sim' | 'refund' | 'adjustment';
  amount: number;
  balanceAfter: number;
  referenceId: string;
  serverSignature: string;
  description: string;
  status: 'completed' | 'pending' | 'reversed';
  createdAt: unknown;
}

export interface CoinPackage {
  packageId: string;
  name: string;
  coinQuantity: number;
  purchasePrice: number;
  currency: string;
  description: string;
  status: 'active' | 'disabled' | 'archived';
  displayOrder: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PlanConfig {
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
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PlanPurchase {
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
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PlanCreditScheduleEvent {
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

export interface PaymentConfiguration {
  configId: string;
  label: string;
  upiId: string;
  merchantName: string;
  provider: string;
  enabled: boolean;
  mode: 'SANDBOX_ONLY';
  createdAt: unknown;
  updatedAt: unknown;
}

export type ProductCategory = 'Hardware' | 'Terminals' | 'Membership Kits' | 'Service Plans';

export interface Product {
  productId: string;
  title: string;
  description: string;
  category: ProductCategory;
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
  createdAt: unknown;
  updatedAt: unknown;
}

export interface Order {
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
  createdAt: unknown;
  updatedAt: unknown;
}

export type UpiAppOption = 'GPay Sandbox' | 'PhonePe Sandbox' | 'Paytm Sandbox' | 'BHIM Sandbox' | 'QR Sandbox';

export interface SandboxPayment {
  paymentId: string;
  userId: string;
  userEmail: string;
  idempotencyKey: string;
  amountInr: number;
  coinsRequested: number;
  upiApp: UpiAppOption;
  assignedConfigId?: string;
  sandboxUpiId: string;
  gatewayProvider: string;
  status: 'initiated' | 'webhook_verified' | 'credited' | 'failed' | 'expired' | 'refunded';
  webhookEventId: string;
  serverSignature: string;
  failureReason: string;
  isSimulated: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CoinRequest {
  requestId: string;
  userId: string;
  paymentId: string;
  amountInr: number;
  coinsRequested: number;
  status: 'pending' | 'approved' | 'rejected';
  adminNote: string;
  reviewedBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export type WithdrawalStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'processing'
  | 'successful'
  | 'rejected'
  | 'failed';

export interface WithdrawalRequest {
  withdrawalId: string;
  userId: string;
  userName?: string;
  userEmail: string;
  amountCoins: number;
  equivalentInr: number;
  payoutChannel: 'Simulated Bank Transfer' | 'Simulated UPI Sandbox';
  accountLabel: string;
  status: WithdrawalStatus;
  payoutReferenceNumber?: string;
  providerConfirmed?: boolean;
  debitedFromWallet?: boolean;
  adminNote: string;
  reviewedBy: string;
  isSimulated: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface WalletTransactionRecord {
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
  createdAt: unknown;
}

export interface AdminAuditLogRecord {
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
  createdAt: unknown;
}

export interface ReferralRecord {
  referralId: string;
  referrerId: string;
  referredUserId: string;
  referredName: string;
  referralCode: string;
  simulatedCommissionCoins: number;
  status: 'pending' | 'credited';
  createdAt: unknown;
}

export const SUPPORT_CATEGORIES = [
  'Login problem',
  'Payment problem',
  'Coin problem',
  'Product problem',
  'Plan problem',
  'Withdrawal problem',
  'Account problem',
  'Other',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export interface SupportTicket {
  ticketId: string;
  userId: string;
  userEmail: string;
  category: SupportCategory;
  subject: string;
  description: string;
  attachmentName: string;
  attachmentDataUrl: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'normal' | 'high';
  assignedTo?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface TicketMessage {
  messageId: string;
  ticketId: string;
  senderId: string;
  senderRole: 'user' | 'admin';
  senderName: string;
  body: string;
  createdAt: unknown;
}

export interface NotificationItem {
  notificationId: string;
  userId: string;
  title: string;
  body: string;
  category: 'wallet' | 'plan' | 'payment' | 'support' | 'security' | 'system';
  read: boolean;
  createdAt: unknown;
}

export interface GatewayConfig {
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
  updatedAt: unknown;
}

export interface AdminSettings {
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
  updatedAt: unknown;
}

export type AiModuleKey =
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

export interface AiFeatureSettings {
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
  updatedAt: unknown;
}

export interface AiUsageLog {
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

export interface SystemHealthLog {
  healthId: string;
  service: string;
  status: 'ok' | 'degraded' | 'error';
  message: string;
  createdAtIso: string;
}

export interface TickerEvent {
  eventId: string;
  maskedUserId: string;
  eventType: 'coin_credit' | 'withdrawal_completed';
  amountCoins: number;
  verifiedLabel: string;
  timestampIso: string;
}

export interface SecurityLog {
  logId: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  severity: 'info' | 'warning' | 'critical';
  targetId: string;
  details: string;
  ipHint: string;
  createdAt: unknown;
}

export interface AuthSessionUser {
  uid: string;
  publicUserId?: string;
  email: string;
  phone: string;
  displayName: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  photoURL: string;
  authMethod: AuthMethod;
  isAdmin: boolean;
  adminRole?: AdminRoleType;
  lastLoginAt?: string;
  otpToken?: string;
}

export interface AdminUserSearchResultRow {
  uid: string;
  publicUserId: string;
  displayName: string;
  email: string;
  phone: string;
  status: UserStatus;
  role: UserRole;
  emailVerified: boolean;
  phoneVerified: boolean;
  coinBalance: number;
  totalPurchaseInr: number;
  totalPurchasedCoins: number;
  totalWithdrawalCoins: number;
  successfulWithdrawalCoins: number;
  pendingWithdrawalCoins: number;
  activePlansCount: number;
  completedPlansCount: number;
  createdAt: string;
  lastLoginAt: string;
  piiMasked: boolean;
}

export interface UserFinancialSummary {
  currentCoinBalance: number;
  totalCoinsPurchased: number;
  totalCoinsAddedByAdmin: number;
  totalCoinsCreditedAutomatically: number;
  totalCoinsDeducted: number;
  totalCoinsDeductedByAdmin: number;
  totalCoinsSpentOnPurchases: number;
  totalPurchaseAmountInr: number;
  totalSuccessfulPurchasesCount: number;
  totalFailedPurchasesCount: number;
  totalWithdrawalsRequestedCoins: number;
  totalWithdrawalsApprovedCoins: number;
  totalSuccessfulWithdrawalsCoins: number;
  totalRejectedWithdrawalsCoins: number;
  pendingWithdrawalsCoins: number;
  activePlansCount: number;
  completedPlansCount: number;
}

export interface UserCompleteReport {
  user: UserProfile;
  wallet: Wallet;
  summary: UserFinancialSummary;
  coinTransactions: WalletTransactionRecord[];
  ledgerEntries: WalletLedgerEntry[];
  payments: SandboxPayment[];
  coinRequests: CoinRequest[];
  orders: Order[];
  planPurchases: PlanPurchase[];
  withdrawals: WithdrawalRequest[];
  activityLogs: SecurityLog[];
  auditLogs: AdminAuditLogRecord[];
  piiMasked: boolean;
  viewerRole: AdminRoleType | 'super_admin' | 'admin';
}

export function formatSequentialUserId(seq: number): string {
  const safeSeq = Math.max(1, Math.floor(seq));
  return `UID${safeSeq < 1000 ? String(safeSeq).padStart(3, '0') : String(safeSeq)}`;
}

export const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function makeSafeId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 14);
  return `${prefix}_${rand}`;
}

export function formatTimestamp(ts: unknown): string {
  if (!ts) return 'Just now';
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toLocaleString();
  }
  if (ts instanceof Date) return ts.toLocaleString();
  if (typeof ts === 'string') return new Date(ts).toLocaleString();
  return 'Pending sync';
}

export function toMillis(ts: unknown): number {
  if (!ts) return Date.now();
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().getTime();
  }
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
  if (typeof ts === 'number') return ts;
  return Date.now();
}
