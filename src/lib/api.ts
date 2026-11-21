import { auth } from './firebase';
import type {
  AdminAuditLogRecord,
  AdminRoleRecord,
  AdminSettings,
  AdminUserSearchResultRow,
  AiFeatureSettings,
  AiUsageLog,
  AuthSessionUser,
  CoinPackage,
  CoinRequest,
  GatewayConfig,
  NotificationItem,
  Order,
  PaymentConfiguration,
  PlanConfig,
  PlanCreditScheduleEvent,
  PlanPurchase,
  Product,
  SandboxPayment,
  SecurityLog,
  SupportTicket,
  SystemHealthLog,
  TickerEvent,
  TicketMessage,
  UserCompleteReport,
  UserProfile,
  Wallet,
  WalletLedgerEntry,
  WalletTransactionRecord,
  WithdrawalRequest,
  WithdrawalStatus,
} from '../types/platform';

const OTP_TOKEN_STORAGE_KEY = 'kestrel_otp_token';

export function getStoredOtpToken(): string | null {
  try {
    return localStorage.getItem(OTP_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredOtpToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(OTP_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(OTP_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

async function getAuthHeaders(optional = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const fbUser = auth.currentUser;
  if (fbUser) {
    const token = await fbUser.getIdToken();
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  const otpToken = getStoredOtpToken();
  if (otpToken) {
    headers.Authorization = `Bearer ${otpToken}`;
    return headers;
  }
  if (!optional) {
    throw new Error('You must be signed in to perform this action.');
  }
  return headers;
}

async function requestJson<T>(
  url: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH'; body?: unknown; authOptional?: boolean } = {}
): Promise<T> {
  const headers = await getAuthHeaders(options.authOptional);
  const resp = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await resp.json().catch(() => ({}))) as T & { error?: string };
  if (!resp.ok) {
    throw new Error(data.error || `Request failed with status ${resp.status}`);
  }
  return data;
}

// --- Public & Ticker ---
export interface PublicBootstrapPayload {
  coinPackages: CoinPackage[];
  plans: PlanConfig[];
  products: Product[];
  adminSettings: AdminSettings;
  aiFeatureSettings: AiFeatureSettings;
  gatewayConfig: GatewayConfig;
  ticker: TickerEvent[];
}

export function fetchPublicBootstrapApi() {
  return requestJson<PublicBootstrapPayload>('/api/v1/public/bootstrap', { authOptional: true });
}

export function fetchTickerApi() {
  return requestJson<{ enabled: boolean; events: TickerEvent[] }>('/api/v1/ticker', { authOptional: true });
}

// --- Auth: Email OTP & Mobile OTP ---
export function requestOtpApi(payload: {
  channel: 'email' | 'mobile';
  identifier: string;
  displayName?: string;
  mode: 'login' | 'register';
}) {
  return requestJson<{
    ok: boolean;
    channel: 'email' | 'mobile';
    identifier: string;
    expiresInSeconds: number;
    resendCooldownSeconds: number;
    deliveryMode: 'live_email' | 'live_sms' | 'sandbox_preview';
    sandboxNotice: string;
  }>('/api/v1/auth/otp/request', { method: 'POST', body: payload, authOptional: true });
}

export function verifyOtpApi(payload: {
  channel: 'email' | 'mobile';
  identifier: string;
  otp: string;
  displayName?: string;
  referralCode?: string;
}) {
  return requestJson<{ ok: boolean; token: string; session: AuthSessionUser }>('/api/v1/auth/otp/verify', {
    method: 'POST',
    body: payload,
    authOptional: true,
  });
}

export function fetchOtpSessionApi() {
  return requestJson<{ session: AuthSessionUser }>('/api/v1/auth/session');
}

export function logoutOtpSessionApi() {
  return requestJson<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST', authOptional: true });
}

// --- Shared User Workspace Endpoints (Used by OTP Sessions & Mobile) ---
export interface UserWorkspaceStatePayload {
  profile: UserProfile;
  wallet: Wallet;
  ledger: WalletLedgerEntry[];
  planPurchases: PlanPurchase[];
  planCreditSchedules: PlanCreditScheduleEvent[];
  orders: Order[];
  payments: SandboxPayment[];
  coinRequests: CoinRequest[];
  withdrawals: WithdrawalRequest[];
  tickets: SupportTicket[];
  ticketMessages: TicketMessage[];
  notifications: NotificationItem[];
  coinPackages: CoinPackage[];
  plans: PlanConfig[];
  products: Product[];
  adminSettings: AdminSettings;
  aiFeatureSettings: AiFeatureSettings;
  gatewayConfig: GatewayConfig;
}

export function fetchUserWorkspaceStateApi() {
  return requestJson<UserWorkspaceStatePayload>('/api/v1/user/state');
}

export function updateUserProfileApi(updates: Partial<UserProfile>) {
  return requestJson<{ ok: boolean; profile: UserProfile }>('/api/v1/user/profile', {
    method: 'PATCH',
    body: updates,
  });
}

export function createV1PaymentIntentApi(payload: {
  packageId?: string;
  amountInr?: number;
  upiApp: string;
  idempotencyKey: string;
}) {
  return requestJson<{
    payment: SandboxPayment;
    assignedConfig: { configId: string; label: string; upiId: string; merchantName: string; provider: string };
    upiUri: string;
    isSimulated: boolean;
    warning: string;
  }>('/api/v1/payments/create-intent', { method: 'POST', body: payload });
}

export function triggerV1PaymentWebhookApi(payload: { paymentId: string; outcome: 'success' | 'failed' }) {
  return requestJson<{ payment: SandboxPayment; coinRequest: CoinRequest | null; isSimulated: boolean }>(
    '/api/v1/payments/webhook',
    { method: 'POST', body: payload }
  );
}

export function purchasePlanApi(planId: string) {
  return requestJson<{ ok: boolean; purchase: PlanPurchase; schedules: PlanCreditScheduleEvent[]; wallet: Wallet }>(
    '/api/v1/plans/purchase',
    { method: 'POST', body: { planId } }
  );
}

export function purchaseProductOrderApi(productId: string, quantity: number) {
  return requestJson<{ ok: boolean; order: Order; wallet: Wallet }>('/api/v1/orders/purchase', {
    method: 'POST',
    body: { productId, quantity },
  });
}

export function submitWithdrawalApi(payload: {
  amountCoins: number;
  payoutChannel: 'Simulated Bank Transfer' | 'Simulated UPI Sandbox';
  accountLabel: string;
}) {
  return requestJson<{ ok: boolean; withdrawal: WithdrawalRequest }>('/api/v1/withdrawals', {
    method: 'POST',
    body: payload,
  });
}

export function createSupportTicketApi(payload: {
  category: string;
  subject: string;
  description: string;
  attachmentName: string;
  attachmentDataUrl: string;
}) {
  return requestJson<{ ok: boolean; ticket: SupportTicket }>('/api/v1/support/tickets', {
    method: 'POST',
    body: payload,
  });
}

export function replySupportTicketApi(ticketId: string, body: string) {
  return requestJson<{ ok: boolean; message: TicketMessage }>(`/api/v1/support/tickets/${ticketId}/reply`, {
    method: 'POST',
    body: { body },
  });
}

export function markNotificationReadApi(notificationId: string) {
  return requestJson<{ ok: boolean }>(`/api/v1/notifications/${notificationId}/read`, { method: 'POST' });
}

// --- Legacy + Firebase Compatibility Wrappers ---
export function verifyAdminSessionApi() {
  return requestJson<{ authorized: boolean; role: string; email: string; sessionSignature: string }>(
    '/api/admin/verify-session',
    { method: 'POST', body: {} }
  );
}

export function syncAdminRoleApi(targetEmail: string, action: 'grant' | 'revoke') {
  return requestJson<{ ok: boolean }>('/api/admin/sync-role', {
    method: 'POST',
    body: { targetEmail, action },
  });
}

export function createSandboxIntentApi(payload: {
  amountInr: number;
  coinRateInr: number;
  upiApp: string;
  idempotencyKey: string;
  sandboxVpa: string;
  merchantName: string;
}) {
  return requestJson<{
    paymentId: string;
    coinsRequested: number;
    upiUri: string;
    sandboxVpa: string;
    assignedConfigId?: string;
    merchantName?: string;
    gatewayProvider?: string;
    serverSignature: string;
    isSimulated: boolean;
    warning: string;
  }>('/api/payments/sandbox-intent', { method: 'POST', body: payload });
}

export function triggerSandboxWebhookApi(payload: {
  paymentId: string;
  amountInr: number;
  coinsRequested: number;
  outcome: 'success' | 'failed';
}) {
  return requestJson<{
    paymentId: string;
    webhookEventId: string;
    status: 'webhook_verified' | 'failed';
    failureReason: string;
    serverSignature: string;
    isSimulated: boolean;
    note: string;
  }>('/api/payments/sandbox-webhook', { method: 'POST', body: payload });
}

export function attestLedgerActionApi(payload: {
  actionType: 'credit' | 'debit' | 'plan_credit' | 'commission_sim' | 'refund' | 'adjustment';
  targetUserId: string;
  amount: number;
  referenceId: string;
}) {
  return requestJson<{ txId: string; serverSignature: string; attestedAt: string }>('/api/ledger/attest', {
    method: 'POST',
    body: payload,
  });
}

// --- Admin Management APIs ---
export interface AdminOverviewPayload {
  users: UserProfile[];
  wallets: Wallet[];
  ledger: WalletLedgerEntry[];
  coinPackages: CoinPackage[];
  plans: PlanConfig[];
  planPurchases: PlanPurchase[];
  planCreditSchedules: PlanCreditScheduleEvent[];
  paymentConfigurations: PaymentConfiguration[];
  products: Product[];
  payments: SandboxPayment[];
  coinRequests: CoinRequest[];
  orders: Order[];
  withdrawals: WithdrawalRequest[];
  walletTransactions: WalletTransactionRecord[];
  adminAuditLogs: AdminAuditLogRecord[];
  tickets: SupportTicket[];
  ticketMessages: TicketMessage[];
  securityLogs: SecurityLog[];
  admins: AdminRoleRecord[];
  adminSettings: AdminSettings;
  aiFeatureSettings: AiFeatureSettings;
  gatewayConfig: GatewayConfig;
  aiUsageLogs: AiUsageLog[];
  systemHealthLogs: SystemHealthLog[];
  ticker: TickerEvent[];
}

export function fetchAdminOverviewApi() {
  return requestJson<AdminOverviewPayload>('/api/v1/admin/overview');
}

export function runPlanSchedulerApi() {
  return requestJson<{ ok: boolean; processedCount: number; creditedCoins: number; completedPlans: number; ranAtIso: string }>(
    '/api/v1/admin/plans/run-scheduler',
    { method: 'POST', body: {} }
  );
}

export function saveAdminCoinPackageApi(pkg: Partial<CoinPackage>) {
  return requestJson<{ ok: boolean; coinPackages: CoinPackage[] }>('/api/v1/admin/coin-packages', {
    method: 'POST',
    body: pkg,
  });
}

export function saveAdminPlanConfigApi(plan: Partial<PlanConfig>) {
  return requestJson<{ ok: boolean; plans: PlanConfig[] }>('/api/v1/admin/plans', {
    method: 'POST',
    body: plan,
  });
}

export function overridePlanPurchaseApi(payload: {
  purchaseId: string;
  action: 'extend' | 'cancel' | 'complete_now';
  extraDays?: number;
  reason: string;
}) {
  return requestJson<{ ok: boolean; purchase: PlanPurchase }>('/api/v1/admin/plans/override', {
    method: 'POST',
    body: payload,
  });
}

export function saveAdminPaymentConfigApi(cfg: Partial<PaymentConfiguration> & { deleteConfigId?: string }) {
  return requestJson<{ ok: boolean; paymentConfigurations: PaymentConfiguration[] }>('/api/v1/admin/payment-configs', {
    method: 'POST',
    body: cfg,
  });
}

export function saveAdminSettingsApi(settings: Partial<AdminSettings>) {
  return requestJson<{ ok: boolean; adminSettings: AdminSettings }>('/api/v1/admin/settings', {
    method: 'PUT',
    body: settings,
  });
}

export function saveAiFeatureSettingsApi(settings: Partial<AiFeatureSettings>) {
  return requestJson<{ ok: boolean; aiFeatureSettings: AiFeatureSettings }>('/api/v1/admin/ai-settings', {
    method: 'PUT',
    body: settings,
  });
}

export function saveGatewayConfigApi(cfg: Partial<GatewayConfig>) {
  return requestJson<{ ok: boolean; gatewayConfig: GatewayConfig }>('/api/v1/admin/gateway-config', {
    method: 'PUT',
    body: cfg,
  });
}

export function reviewCoinRequestApi(requestId: string, decision: 'approved' | 'rejected', adminNote: string) {
  return requestJson<{ ok: boolean; coinRequest: CoinRequest }>(`/api/v1/admin/coin-requests/${requestId}/review`, {
    method: 'POST',
    body: { decision, adminNote },
  });
}

export function adminAdjustWalletApi(payload: {
  userId: string;
  action: 'add' | 'deduct';
  amountCoins: number;
  reason: string;
  idempotencyKey: string;
}) {
  return requestJson<{
    ok: boolean;
    wallet: Wallet;
    transaction: WalletTransactionRecord;
    audit: AdminAuditLogRecord;
  }>('/api/v1/admin/wallets/adjust', {
    method: 'POST',
    body: payload,
  });
}

export function adminCreditWalletApi(userId: string, amountCoins: number, reason: string) {
  return requestJson<{ ok: boolean; wallet: Wallet }>('/api/v1/admin/wallets/credit', {
    method: 'POST',
    body: { userId, amountCoins, reason },
  });
}

export function adminRefundPaymentApi(paymentId: string) {
  return requestJson<{ ok: boolean; payment: SandboxPayment }>(`/api/v1/admin/payments/${paymentId}/refund`, {
    method: 'POST',
    body: {},
  });
}

export function adminUpdateWithdrawalStatusApi(
  withdrawalId: string,
  payload: {
    status: WithdrawalStatus;
    reason?: string;
    payoutReferenceNumber?: string;
    providerConfirmed?: boolean;
  }
) {
  return requestJson<{ ok: boolean; withdrawal: WithdrawalRequest; audit: AdminAuditLogRecord }>(
    `/api/v1/admin/withdrawals/${withdrawalId}/status`,
    {
      method: 'POST',
      body: payload,
    }
  );
}

export function reviewWithdrawalApi(withdrawalId: string, decision: 'approved' | 'rejected', adminNote: string) {
  return requestJson<{ ok: boolean; withdrawal: WithdrawalRequest }>(`/api/v1/admin/withdrawals/${withdrawalId}/review`, {
    method: 'POST',
    body: { decision, adminNote },
  });
}

export function searchAdminUsersApi(params: {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  logAudit?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.sort) qs.set('sort', params.sort);
  if (params.dir) qs.set('dir', params.dir);
  if (params.logAudit) qs.set('logAudit', '1');
  return requestJson<{
    results: AdminUserSearchResultRow[];
    totalUsers: number;
    viewerRole: string;
    piiMasked: boolean;
  }>(`/api/v1/admin/users/search?${qs.toString()}`);
}

export function fetchAdminUserReportApi(uidOrPublicId: string, logAudit = true) {
  return requestJson<UserCompleteReport>(
    `/api/v1/admin/users/${encodeURIComponent(uidOrPublicId)}/report${logAudit ? '?logAudit=1' : ''}`
  );
}

export function migrateHistoricalUserIdsApi() {
  return requestJson<{ ok: boolean; migratedCount: number; userCounter: number }>('/api/v1/admin/users/migrate-ids', {
    method: 'POST',
    body: {},
  });
}

export function updateUserStatusApi(uid: string, status: 'active' | 'flagged' | 'suspended', reason?: string) {
  return requestJson<{ ok: boolean; user: UserProfile }>(`/api/v1/admin/users/${uid}/status`, {
    method: 'POST',
    body: { status, reason },
  });
}

export function saveAdminRoleApi(payload: { uid?: string; email: string; role: AdminRoleRecord['role'] }) {
  return requestJson<{ ok: boolean; admins: AdminRoleRecord[] }>('/api/v1/admin/roles', {
    method: 'POST',
    body: payload,
  });
}

export function broadcastNotificationApi(payload: { userId: string; title: string; body: string }) {
  return requestJson<{ ok: boolean }>('/api/v1/admin/notifications/broadcast', {
    method: 'POST',
    body: payload,
  });
}

// --- 11 Gemini AI API Wrappers ---
export interface AiAssistantResponse {
  result: {
    summary: string;
    category: string;
    metrics?: Array<{ label: string; value: string }>;
    anomalies?: string[];
    recommendedActions?: string[];
    complianceNotice?: string;
  };
  model: string;
}

export function queryAiAdminAssistantApi(
  command: string,
  platformSnapshot: Record<string, unknown>,
  language: 'en' | 'hi' = 'en'
) {
  return requestJson<AiAssistantResponse>('/api/v1/ai/admin-dashboard', {
    method: 'POST',
    body: { command, platformSnapshot, language },
  });
}

export function querySmartAssistantApi(payload: {
  message: string;
  language?: 'en' | 'hi';
  isVoice?: boolean;
  contextSummary?: Record<string, unknown>;
}) {
  return requestJson<{
    result: {
      reply: string;
      spokenSummary: string;
      suggestedFollowUps?: string[];
      safetyNote?: string;
    };
    model: string;
  }>('/api/v1/ai/smart-assistant', { method: 'POST', body: payload });
}

export function fetchSmartSuggestionsApi(language: 'en' | 'hi' = 'en') {
  return requestJson<{
    result: {
      suggestions: Array<{ title: string; reason: string; actionTab: string }>;
    };
  }>('/api/v1/ai/smart-suggestions', { method: 'POST', body: { language } });
}

export function classifySupportTicketApi(payload: {
  subject: string;
  description: string;
  category: string;
  language?: 'en' | 'hi';
}) {
  return requestJson<{
    triage: {
      suggestedPriority: string;
      riskFlag: boolean;
      triageNote: string;
      draftReply: string;
    };
  }>('/api/v1/ai/helpdesk', { method: 'POST', body: payload });
}

export function runAiFraudDetectionApi(telemetrySnapshot?: Record<string, unknown>, language: 'en' | 'hi' = 'en') {
  return requestJson<{
    result: {
      overallRiskLevel: string;
      riskScore: number;
      flaggedSignals: string[];
      recommendedReviews: string[];
    };
  }>('/api/v1/ai/fraud-detection', { method: 'POST', body: { telemetrySnapshot, language } });
}

export function generateAiThemeProposalApi(stylePrompt: string) {
  return requestJson<{
    proposal: {
      accentColor: string;
      defaultTheme: 'light' | 'dark';
      tagline: string;
      rationale: string;
    };
  }>('/api/v1/ai/theme-designer', { method: 'POST', body: { stylePrompt } });
}

export function draftSmartNotificationApi(topic: string, language: 'en' | 'hi' = 'en') {
  return requestJson<{ draft: { title: string; body: string } }>('/api/v1/ai/smart-notifications', {
    method: 'POST',
    body: { topic, language },
  });
}

export function runAiDbHealthCheckApi() {
  return requestJson<{
    report: {
      healthStatus: string;
      summary: string;
      findings: string[];
      remediationSteps: string[];
    };
    snapshot: Record<string, unknown>;
  }>('/api/v1/ai/db-health', { method: 'POST', body: {} });
}

export function runAiBusinessIntelligenceApi(language: 'en' | 'hi' = 'en') {
  return requestJson<{
    bi: {
      executiveSummary: string;
      obligationsForecast: string;
      highlights: string[];
    };
    snapshot: Record<string, unknown>;
  }>('/api/v1/ai/business-intelligence', { method: 'POST', body: { language } });
}
