import React, { useEffect, useMemo, useState } from 'react';
import { type User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bot,
  CalendarClock,
  CheckCircle2,
  Coins,
  CreditCard,
  Database,
  Download,
  HelpCircle,
  Lock,
  Minus,
  Moon,
  Package,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  Trash2,
  Users,
  Wallet as WalletIcon,
} from 'lucide-react';
import {
  AiAssistantResponse,
  adminAdjustWalletApi,
  adminCreditWalletApi,
  adminRefundPaymentApi,
  adminUpdateWithdrawalStatusApi,
  broadcastNotificationApi,
  classifySupportTicketApi,
  draftSmartNotificationApi,
  fetchAdminOverviewApi,
  generateAiThemeProposalApi,
  overridePlanPurchaseApi,
  queryAiAdminAssistantApi,
  replySupportTicketApi,
  reviewCoinRequestApi,
  reviewWithdrawalApi,
  runAiBusinessIntelligenceApi,
  runAiDbHealthCheckApi,
  runAiFraudDetectionApi,
  runPlanSchedulerApi,
  saveAdminCoinPackageApi,
  saveAdminPaymentConfigApi,
  saveAdminPlanConfigApi,
  saveAdminRoleApi,
  saveAdminSettingsApi,
  saveAiFeatureSettingsApi,
  saveGatewayConfigApi,
  updateUserStatusApi,
  verifyAdminSessionApi,
} from '../lib/api';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import {
  adminAdjustUserCoinsFirestore,
  adminApproveCoinRequest,
  adminGrantRole,
  adminGrantSandboxCoins,
  adminRefundSandboxPayment,
  adminRejectCoinRequest,
  adminReviewWithdrawal,
  adminSaveAdminSettingsFirestore,
  adminSaveAiFeatureSettingsFirestore,
  adminSaveCoinPackageFirestore,
  adminSaveGatewayConfig,
  adminSavePaymentConfigFirestore,
  adminSavePlanConfigFirestore,
  adminSaveProduct,
  adminUpdateUserStatus,
  adminUpdateWithdrawalStatusFirestore,
  logSecurityEvent,
  postSupportReply,
  seedPlatformDefaultsIfNeeded,
} from '../lib/firestoreService';
import {
  DEFAULT_ADMIN_SETTINGS,
  DEFAULT_AI_FEATURE_SETTINGS,
  DEFAULT_GATEWAY_CONFIG,
  STUDIO_IMAGE_OPTIONS,
  computeDailyScheduleAmounts,
} from '../lib/seedData';
import {
  AdminAuditLogRecord,
  AdminRoleRecord,
  AdminRoleType,
  AdminSettings,
  AiFeatureSettings,
  AiModuleKey,
  AiUsageLog,
  AuthSessionUser,
  CoinPackage,
  CoinRequest,
  GatewayConfig,
  Order,
  PaymentConfiguration,
  PlanConfig,
  PlanPurchase,
  Product,
  ProductCategory,
  SandboxPayment,
  SecurityLog,
  SupportTicket,
  SystemHealthLog,
  TicketMessage,
  UserProfile,
  UserStatus,
  Wallet,
  WalletLedgerEntry,
  WalletTransactionRecord,
  WithdrawalRequest,
  WithdrawalStatus,
  formatTimestamp,
  makeSafeId,
  toMillis,
} from '../types/platform';
import { AdminUserManagementPanel } from './AdminUserManagementPanel';
import { BrandLogo } from './BrandLogo';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './ToastContext';

type AdminTab =
  | 'analytics'
  | 'user_management'
  | 'coin_management'
  | 'withdrawals'
  | 'ai'
  | 'plans'
  | 'packages_upi'
  | 'users'
  | 'products'
  | 'ledger'
  | 'support'
  | 'settings';

const WITHDRAWAL_STATUS_META: Record<WithdrawalStatus, { label: string; colorClass: string }> = {
  pending: { label: 'Pending', colorClass: 'text-amber-700 dark:text-amber-400' },
  under_review: { label: 'Under Review', colorClass: 'text-sky-700 dark:text-sky-400' },
  approved: { label: 'Approved', colorClass: 'text-indigo-700 dark:text-indigo-400' },
  processing: { label: 'Processing', colorClass: 'text-blue-700 dark:text-blue-400' },
  successful: { label: 'Successful', colorClass: 'text-emerald-700 dark:text-emerald-400' },
  rejected: { label: 'Rejected', colorClass: 'text-red-700 dark:text-red-400' },
  failed: { label: 'Failed', colorClass: 'text-rose-700 dark:text-rose-400' },
};

interface SuperAdminDashboardProps {
  firebaseUser: User | null;
  otpSession: AuthSessionUser | null;
  products: Product[];
  gatewayConfig: GatewayConfig | null;
  adminSettings: AdminSettings | null;
  aiFeatureSettings: AiFeatureSettings | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onRefreshBootstrap: () => Promise<void>;
  onExitAdmin: () => void;
}

const AI_MODULES_META: Array<{ key: AiModuleKey; label: string; desc: string }> = [
  { key: 'aiSmartAssistant', label: '01. AI Smart Assistant', desc: 'User & admin conversational help desk.' },
  { key: 'aiAdminDashboard', label: '02. AI Admin Dashboard', desc: 'Natural language telemetry query console.' },
  { key: 'aiFraudDetection', label: '03. AI Fraud Detection', desc: 'Anomaly detection for failed payments & OTP bursts.' },
  { key: 'aiSmartSuggestions', label: '04. AI Smart Suggestions', desc: 'Personalized coin & plan guidance.' },
  { key: 'aiHelpdesk', label: '05. AI Helpdesk Triage', desc: 'Automatic ticket severity & draft response.' },
  { key: 'aiVoiceAssistant', label: '06. AI Voice Assistant', desc: 'Browser speech input & spoken reply mode.' },
  { key: 'multilingualAi', label: '07. Multilingual AI (EN/HI)', desc: 'English & Hindi AI conversation support.' },
  { key: 'aiBusinessIntelligence', label: '08. AI Business Intelligence', desc: 'Executive coin velocity & obligations forecast.' },
  { key: 'aiThemeDesigner', label: '09. AI Theme Designer', desc: 'JSON theme proposals with live preview.' },
  { key: 'smartNotificationEngine', label: '10. Smart Notification Engine', desc: 'AI-drafted user alerts & reminders.' },
  { key: 'aiDatabaseHealthMonitor', label: '11. AI Database Health Monitor', desc: 'Audits scheduler lag, errors & ledger integrity.' },
];

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  firebaseUser,
  otpSession,
  products: propProducts,
  gatewayConfig: propGateway,
  adminSettings: propAdminSettings,
  aiFeatureSettings: propAiSettings,
  theme,
  onToggleTheme,
  onRefreshBootstrap,
  onExitAdmin,
}) => {
  const { pushToast } = useToast();
  const isOtpMode = !firebaseUser && Boolean(otpSession);
  const adminEmail = firebaseUser?.email || otpSession?.email || '';
  const adminUid = firebaseUser?.uid || otpSession?.uid || '';

  const [sessionVerified, setSessionVerified] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');

  // Data collections
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [admins, setAdmins] = useState<AdminRoleRecord[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<SandboxPayment[]>([]);
  const [coinRequests, setCoinRequests] = useState<CoinRequest[]>([]);
  const [otpWithdrawals, setOtpWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [fbReqWithdrawals, setFbReqWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [fbLegacyWithdrawals, setFbLegacyWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransactionRecord[]>([]);
  const [adminAuditLogs, setAdminAuditLogs] = useState<AdminAuditLogRecord[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>([]);
  const [coinPackages, setCoinPackages] = useState<CoinPackage[]>([]);
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [planPurchases, setPlanPurchases] = useState<PlanPurchase[]>([]);
  const [paymentConfigs, setPaymentConfigs] = useState<PaymentConfiguration[]>([]);
  const [aiUsageLogs, setAiUsageLogs] = useState<AiUsageLog[]>([]);
  const [systemHealthLogs, setSystemHealthLogs] = useState<SystemHealthLog[]>([]);

  const withdrawals = useMemo(() => {
    if (isOtpMode) return otpWithdrawals;
    const map = new Map<string, WithdrawalRequest>();
    for (const w of fbLegacyWithdrawals) map.set(w.withdrawalId, w);
    for (const w of fbReqWithdrawals) map.set(w.withdrawalId, w);
    return Array.from(map.values()).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }, [isOtpMode, otpWithdrawals, fbReqWithdrawals, fbLegacyWithdrawals]);

  // Settings Forms
  const [brandForm, setBrandForm] = useState<Omit<AdminSettings, 'updatedAt'>>(DEFAULT_ADMIN_SETTINGS);
  const [aiForm, setAiForm] = useState<Omit<AiFeatureSettings, 'updatedAt'>>(DEFAULT_AI_FEATURE_SETTINGS);
  const [cfgForm, setCfgForm] = useState<Omit<GatewayConfig, 'updatedAt'>>(DEFAULT_GATEWAY_CONFIG);

  // AI Operations state
  const [aiCommand, setAiCommand] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOutput, setAiOutput] = useState<AiAssistantResponse | null>(null);
  const [fraudResult, setFraudResult] = useState<{ overallRiskLevel: string; riskScore: number; flaggedSignals: string[]; recommendedReviews: string[] } | null>(null);
  const [dbHealthResult, setDbHealthResult] = useState<{ healthStatus: string; summary: string; findings: string[]; remediationSteps: string[] } | null>(null);
  const [biResult, setBiResult] = useState<{ executiveSummary: string; obligationsForecast: string; highlights: string[] } | null>(null);
  const [themePrompt, setThemePrompt] = useState('Executive slate navy with crisp emerald accents');
  const [themeProposal, setThemeProposal] = useState<{ accentColor: string; defaultTheme: 'light' | 'dark'; tagline: string; rationale: string } | null>(null);

  // Plans & Packages & UPI Pool Editors
  const [planForm, setPlanForm] = useState({
    planId: '',
    name: '',
    purchasePrice: '500',
    currency: 'Coins',
    durationDays: '7',
    totalScheduledCredits: '100',
    description: '',
    terms: '24-hour interval schedule locked upon purchase.',
    status: 'active' as 'active' | 'disabled' | 'archived',
  });
  const [pkgForm, setPkgForm] = useState({
    packageId: '',
    name: '',
    coinQuantity: '500',
    purchasePrice: '500',
    currency: 'INR',
    description: '',
    status: 'active' as 'active' | 'disabled' | 'archived',
  });
  const [upiForm, setUpiForm] = useState({
    configId: '',
    label: '',
    upiId: '',
    merchantName: '',
    provider: 'Sandbox UPI Gateway',
    enabled: true,
  });

  // Plan Override Modal state
  const [overrideTarget, setOverrideTarget] = useState<PlanPurchase | null>(null);
  const [overrideAction, setOverrideAction] = useState<'extend' | 'cancel' | 'complete_now'>('extend');
  const [overrideDays, setOverrideDays] = useState('3');
  const [overrideReason, setOverrideReason] = useState('');

  // Confirm Dialog generic state
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: string;
    variant?: 'primary' | 'danger';
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Manual Coin Management state
  const [coinSearchQuery, setCoinSearchQuery] = useState('');
  const [selectedCoinUserId, setSelectedCoinUserId] = useState('');
  const [coinActionType, setCoinActionType] = useState<'add' | 'deduct'>('add');
  const [coinAmountInput, setCoinAmountInput] = useState('500');
  const [coinReasonInput, setCoinReasonInput] = useState('');
  const [coinIdempotencyKey, setCoinIdempotencyKey] = useState(() => makeSafeId('idem'));

  // Withdrawal Management state
  const [wdSearchQuery, setWdSearchQuery] = useState('');
  const [wdStatusFilter, setWdStatusFilter] = useState<'all' | WithdrawalStatus>('all');
  const [wdDateFrom, setWdDateFrom] = useState('');
  const [wdDateTo, setWdDateTo] = useState('');
  const [selectedWdId, setSelectedWdId] = useState<string | null>(null);
  const [wdActionReason, setWdActionReason] = useState('');
  const [wdPayoutRef, setWdPayoutRef] = useState('');
  const [wdProviderConfirmed, setWdProviderConfirmed] = useState(false);

  // User, Product, Support, Ledger states
  const [userSearch, setUserSearch] = useState('');
  const [jumpReportUid, setJumpReportUid] = useState('');
  const [grantCoinUid, setGrantCoinUid] = useState('');
  const [grantCoinAmount, setGrantCoinAmount] = useState('1000');
  const [grantCoinReason, setGrantCoinReason] = useState('Sandbox onboarding credit');
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<AdminRoleRecord['role']>('admin');
  const [reviewNoteMap, setReviewNoteMap] = useState<Record<string, string>>({});
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState('all');

  // Product editor state
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodTitle, setProdTitle] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodCategory, setProdCategory] = useState<ProductCategory>('Hardware');
  const [prodType, setProdType] = useState<'product' | 'plan'>('product');
  const [prodCoinPrice, setProdCoinPrice] = useState('1500');
  const [prodInrPrice, setProdInrPrice] = useState('1500');
  const [prodStock, setProdStock] = useState('50');
  const [prodImage, setProdImage] = useState(STUDIO_IMAGE_OPTIONS[0].url);
  const [prodActive, setProdActive] = useState(true);

  // Support & Notification Broadcast state
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
  const [adminReply, setAdminReply] = useState('');
  const [notifTopic, setNotifTopic] = useState('Scheduled 24h credit reminder');
  const [notifTargetUid, setNotifTargetUid] = useState('ALL');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');

  const loadBackendAdminOverview = async () => {
    try {
      const ov = await fetchAdminOverviewApi();
      setCoinPackages(ov.coinPackages);
      setPlans(ov.plans);
      setPlanPurchases(ov.planPurchases);
      setPaymentConfigs(ov.paymentConfigurations);
      setAiUsageLogs(ov.aiUsageLogs);
      setSystemHealthLogs(ov.systemHealthLogs);
      if (ov.adminSettings) {
        const { updatedAt: _u, ...rest } = ov.adminSettings;
        setBrandForm(rest);
      }
      if (ov.aiFeatureSettings) {
        const { updatedAt: _u, ...rest } = ov.aiFeatureSettings;
        setAiForm(rest);
      }
      if (ov.gatewayConfig) {
        const { updatedAt: _u, ...rest } = ov.gatewayConfig;
        setCfgForm(rest);
      }
      if (isOtpMode) {
        setUsers(ov.users);
        setAdmins(ov.admins);
        setWallets(ov.wallets);
        setLedger(ov.ledger);
        setOrders(ov.orders);
        setPayments(ov.payments);
        setCoinRequests(ov.coinRequests);
        setOtpWithdrawals(ov.withdrawals);
        setWalletTransactions(ov.walletTransactions || []);
        setAdminAuditLogs(ov.adminAuditLogs || []);
        setTickets(ov.tickets);
        setSecurityLogs(ov.securityLogs);
      }
    } catch (err) {
      pushToast('error', 'Admin Overview Sync Warning', err instanceof Error ? err.message : 'Sync failed.');
    }
  };

  const verifyAdminAccess = async () => {
    setVerifying(true);
    setSessionError(null);
    try {
      const res = await verifyAdminSessionApi();
      if (res.authorized) {
        setSessionVerified(true);
        if (firebaseUser) {
          await seedPlatformDefaultsIfNeeded(adminEmail);
        }
        await loadBackendAdminOverview();
      } else {
        setSessionError('Account is not authorized for Super Admin access.');
      }
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Admin verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    void verifyAdminAccess();
  }, [adminUid]);

  useEffect(() => {
    if (propGateway) {
      const { updatedAt: _o, ...rest } = propGateway;
      setCfgForm(rest);
    }
  }, [propGateway]);

  useEffect(() => {
    if (propAdminSettings) {
      const { updatedAt: _o, ...rest } = propAdminSettings;
      setBrandForm(rest);
    }
  }, [propAdminSettings]);

  useEffect(() => {
    if (propAiSettings) {
      const { updatedAt: _o, ...rest } = propAiSettings;
      setAiForm(rest);
    }
  }, [propAiSettings]);

  useEffect(() => {
    if (!sessionVerified || isOtpMode) return;

    const unsubs = [
      onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc')), (s) =>
        setUsers(s.docs.map((d) => d.data() as UserProfile))
      ),
      onSnapshot(query(collection(db, 'admins')), (s) => setAdmins(s.docs.map((d) => d.data() as AdminRoleRecord))),
      onSnapshot(query(collection(db, 'wallets')), (s) => setWallets(s.docs.map((d) => d.data() as Wallet))),
      onSnapshot(query(collection(db, 'wallet_ledger'), orderBy('createdAt', 'desc')), (s) =>
        setLedger(s.docs.map((d) => d.data() as WalletLedgerEntry))
      ),
      onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (s) =>
        setOrders(s.docs.map((d) => d.data() as Order))
      ),
      onSnapshot(query(collection(db, 'payments'), orderBy('createdAt', 'desc')), (s) =>
        setPayments(s.docs.map((d) => d.data() as SandboxPayment))
      ),
      onSnapshot(query(collection(db, 'coin_requests'), orderBy('createdAt', 'desc')), (s) =>
        setCoinRequests(s.docs.map((d) => d.data() as CoinRequest))
      ),
      onSnapshot(query(collection(db, 'withdrawalRequests'), orderBy('createdAt', 'desc')), (s) =>
        setFbReqWithdrawals(s.docs.map((d) => d.data() as WithdrawalRequest))
      ),
      onSnapshot(query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc')), (s) =>
        setFbLegacyWithdrawals(s.docs.map((d) => d.data() as WithdrawalRequest))
      ),
      onSnapshot(query(collection(db, 'walletTransactions'), orderBy('createdAt', 'desc')), (s) =>
        setWalletTransactions(s.docs.map((d) => d.data() as WalletTransactionRecord))
      ),
      onSnapshot(query(collection(db, 'adminAuditLogs'), orderBy('createdAt', 'desc')), (s) =>
        setAdminAuditLogs(s.docs.map((d) => d.data() as AdminAuditLogRecord))
      ),
      onSnapshot(query(collection(db, 'support_tickets'), orderBy('createdAt', 'desc')), (s) =>
        setTickets(s.docs.map((d) => d.data() as SupportTicket))
      ),
      onSnapshot(query(collection(db, 'security_logs'), orderBy('createdAt', 'desc')), (s) =>
        setSecurityLogs(s.docs.map((d) => d.data() as SecurityLog))
      ),
      onSnapshot(query(collection(db, 'coinPackages')), (s) => {
        if (!s.empty) setCoinPackages(s.docs.map((d) => d.data() as CoinPackage));
      }),
      onSnapshot(query(collection(db, 'plans')), (s) => {
        if (!s.empty) setPlans(s.docs.map((d) => d.data() as PlanConfig));
      }),
      onSnapshot(query(collection(db, 'planPurchases'), orderBy('createdAt', 'desc')), (s) => {
        if (!s.empty) setPlanPurchases(s.docs.map((d) => d.data() as PlanPurchase));
      }),
      onSnapshot(query(collection(db, 'paymentConfigurations')), (s) => {
        if (!s.empty) setPaymentConfigs(s.docs.map((d) => d.data() as PaymentConfiguration));
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [sessionVerified, isOtpMode]);

  useEffect(() => {
    if (!selectedTicketId || isOtpMode) return;
    const unsub = onSnapshot(
      query(collection(db, 'support_tickets', selectedTicketId, 'messages'), orderBy('createdAt', 'asc')),
      (snap) => setTicketMessages(snap.docs.map((d) => d.data() as TicketMessage)),
      (err) => handleFirestoreError(err, OperationType.LIST, `support_tickets/${selectedTicketId}/messages`)
    );
    return () => unsub();
  }, [selectedTicketId, isOtpMode]);

  const metrics = useMemo(() => {
    const totalCoinsAddedByAdmin = walletTransactions
      .filter((t) => t.action === 'add')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalCoinsDeductedByAdmin = walletTransactions
      .filter((t) => t.action === 'deduct')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const pendingWithdrawals = withdrawals.filter((w) => w.status === 'pending' || w.status === 'under_review').length;
    const successfulWithdrawals = withdrawals.filter((w) => w.status === 'successful').length;
    const rejectedWithdrawals = withdrawals.filter((w) => w.status === 'rejected').length;

    return {
      totalUsers: users.length,
      totalCoinsInCirculation: wallets.reduce((s, w) => s + Number(w.availableCoins || 0), 0),
      totalCoinsAddedByAdmin,
      totalCoinsDeductedByAdmin,
      pendingWithdrawals,
      successfulWithdrawals,
      rejectedWithdrawals,
      pendingCoinReqs: coinRequests.filter((r) => r.status === 'pending').length,
      activePlanSubs: planPurchases.filter((p) => p.status === 'active').length,
      openTickets: tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
      failedPayments: payments.filter((p) => p.status === 'failed').length,
    };
  }, [users, wallets, walletTransactions, coinRequests, withdrawals, planPurchases, tickets, payments]);

  const viewerRole: AdminRoleType | 'super_admin' | 'admin' = useMemo(() => {
    if (otpSession?.adminRole) return otpSession.adminRole;
    const match = admins.find(
      (a) => a.uid === adminUid || a.email.toLowerCase() === adminEmail.toLowerCase()
    );
    if (match) return match.role;
    return adminEmail.toLowerCase() === 'arvisaini16@gmail.com' ? 'super_admin' : 'admin';
  }, [otpSession?.adminRole, admins, adminUid, adminEmail]);

  const handleExportCsv = (name: string, rows: Array<Record<string, unknown>>) => {
    if (rows.length === 0) {
      pushToast('info', 'Empty Export', `No ${name} rows to export.`);
      return;
    }
    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kestrel_${name}_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveAiControls = async (next: Omit<AiFeatureSettings, 'updatedAt'>) => {
    setAiForm(next);
    try {
      await saveAiFeatureSettingsApi(next);
      if (firebaseUser) await adminSaveAiFeatureSettingsFirestore(firebaseUser, next);
      await onRefreshBootstrap();
      pushToast('success', 'AI Feature Controls Saved', `Master AI: ${next.masterEnabled ? 'ON' : 'OFF'}`);
    } catch (err) {
      pushToast('error', 'Save Failed', err instanceof Error ? err.message : 'Unable to save AI toggles.');
    }
  };

  const handleSaveBrandSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveAdminSettingsApi(brandForm);
      if (firebaseUser) await adminSaveAdminSettingsFirestore(firebaseUser, brandForm);
      await onRefreshBootstrap();
      pushToast('success', 'Platform Branding Saved', 'Site branding, ticker, and support links updated.');
    } catch (err) {
      pushToast('error', 'Save Failed', err instanceof Error ? err.message : 'Unable to save branding.');
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      planId: planForm.planId || makeSafeId('plan'),
      name: planForm.name.trim(),
      purchasePrice: Math.max(1, Number(planForm.purchasePrice) || 100),
      currency: planForm.currency || 'Coins',
      durationDays: Math.max(1, Math.floor(Number(planForm.durationDays) || 7)),
      totalScheduledCredits: Math.max(1, Number(planForm.totalScheduledCredits) || 100),
      creditIntervalHours: 24 as const,
      description: planForm.description.trim() || `${planForm.durationDays}-day plan with strict 24h credits.`,
      status: planForm.status,
      displayOrder: plans.length + 1,
      availableFrom: '',
      availableUntil: '',
      terms: planForm.terms.trim(),
    };
    try {
      await saveAdminPlanConfigApi(payload);
      if (firebaseUser) await adminSavePlanConfigFirestore(payload, !planForm.planId);
      await loadBackendAdminOverview();
      await onRefreshBootstrap();
      setPlanForm({
        planId: '',
        name: '',
        purchasePrice: '500',
        currency: 'Coins',
        durationDays: '7',
        totalScheduledCredits: '100',
        description: '',
        terms: '24-hour interval schedule locked upon purchase.',
        status: 'active',
      });
      pushToast('success', 'Plan Saved', `${payload.name} updated.`);
    } catch (err) {
      pushToast('error', 'Plan Save Failed', err instanceof Error ? err.message : 'Failed to save plan.');
    }
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      packageId: pkgForm.packageId || makeSafeId('pkg'),
      name: pkgForm.name.trim(),
      coinQuantity: Math.max(1, Number(pkgForm.coinQuantity) || 100),
      purchasePrice: Math.max(1, Number(pkgForm.purchasePrice) || 100),
      currency: pkgForm.currency || 'INR',
      description: pkgForm.description.trim() || 'Sandbox coin allocation pack.',
      status: pkgForm.status,
      displayOrder: coinPackages.length + 1,
    };
    try {
      await saveAdminCoinPackageApi(payload);
      if (firebaseUser) await adminSaveCoinPackageFirestore(payload, !pkgForm.packageId);
      await loadBackendAdminOverview();
      await onRefreshBootstrap();
      setPkgForm({ packageId: '', name: '', coinQuantity: '500', purchasePrice: '500', currency: 'INR', description: '', status: 'active' });
      pushToast('success', 'Coin Package Saved', `${payload.name} updated.`);
    } catch (err) {
      pushToast('error', 'Save Failed', err instanceof Error ? err.message : 'Unable to save package.');
    }
  };

  const handleSaveUpiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      configId: upiForm.configId || makeSafeId('upi_cfg'),
      label: upiForm.label.trim(),
      upiId: upiForm.upiId.trim(),
      merchantName: upiForm.merchantName.trim(),
      provider: upiForm.provider.trim() || 'Sandbox UPI Pool',
      enabled: upiForm.enabled,
      mode: 'SANDBOX_ONLY' as const,
    };
    try {
      await saveAdminPaymentConfigApi(payload);
      if (firebaseUser) await adminSavePaymentConfigFirestore(payload, !upiForm.configId);
      await loadBackendAdminOverview();
      setUpiForm({ configId: '', label: '', upiId: '', merchantName: '', provider: 'Sandbox UPI Gateway', enabled: true });
      pushToast('success', 'Sandbox UPI Config Saved', `${payload.label} (${payload.upiId}) added to random selection pool.`);
    } catch (err) {
      pushToast('error', 'UPI Save Failed', err instanceof Error ? err.message : 'Unable to save UPI config.');
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 max-w-md w-full text-center">
          <Lock className="w-6 h-6 text-blue-700 dark:text-blue-400 mx-auto" />
          <h2 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-white">
            Verifying Super Admin Credentials
          </h2>
          <p className="mt-2 text-xs text-slate-500">Validating RBAC signature for {adminEmail}...</p>
        </div>
      </div>
    );
  }

  if (!sessionVerified || sessionError) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 max-w-md w-full space-y-4">
          <ShieldAlert className="w-6 h-6 text-red-600" />
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">Super Admin Access Restricted</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{sessionError || 'Authorized admin credentials required.'}</p>
          <div className="flex gap-3">
            <button type="button" onClick={onExitAdmin} className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg cursor-pointer">
              Return to User Workspace
            </button>
            <button type="button" onClick={() => void verifyAdminAccess()} className="px-4 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer">
              Retry Verification
            </button>
          </div>
        </div>
      </div>
    );
  }

  const adminNav: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'analytics', label: 'Analytics & BI', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'user_management', label: 'User Management & Search', icon: <Users className="w-4 h-4" /> },
    { id: 'coin_management', label: 'Coin Management', icon: <Coins className="w-4 h-4" /> },
    { id: 'withdrawals', label: 'Withdrawal Management', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'ai', label: 'AI Control Center', icon: <Bot className="w-4 h-4" /> },
    { id: 'plans', label: 'Plans & 24h Engine', icon: <CalendarClock className="w-4 h-4" /> },
    { id: 'packages_upi', label: 'Packages & UPI Pool', icon: <Coins className="w-4 h-4" /> },
    { id: 'users', label: 'Users & RBAC', icon: <Users className="w-4 h-4" /> },
    { id: 'products', label: 'Catalogue CRUD', icon: <Package className="w-4 h-4" /> },
    { id: 'ledger', label: 'Approvals & 6m Ledger', icon: <WalletIcon className="w-4 h-4" /> },
    { id: 'support', label: 'Support & Alerts', icon: <HelpCircle className="w-4 h-4" /> },
    { id: 'settings', label: 'Branding & Security', icon: <Settings className="w-4 h-4" /> },
  ];

  const previewSchedule = computeDailyScheduleAmounts(
    Number(planForm.totalScheduledCredits) || 100,
    Number(planForm.durationDays) || 7
  );

  const filteredUsers = users.filter(
    (u) =>
      !userSearch.trim() ||
      (u.publicUserId || '').toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.phone || '').toLowerCase().includes(userSearch.toLowerCase()) ||
      u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.uid.toLowerCase().includes(userSearch.toLowerCase())
  );

  const coinSearchMatchedUsers = useMemo(() => {
    const q = coinSearchQuery.trim().toLowerCase();
    if (!q) return users.slice(0, 20);
    return users.filter(
      (u) =>
        (u.publicUserId || '').toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q)
    );
  }, [users, coinSearchQuery]);

  const selectedCoinUser = useMemo(
    () => users.find((u) => u.uid === selectedCoinUserId) || null,
    [users, selectedCoinUserId]
  );

  const selectedCoinWallet = useMemo(
    () => (selectedCoinUserId ? wallets.find((w) => w.userId === selectedCoinUserId) || null : null),
    [wallets, selectedCoinUserId]
  );

  const filteredWithdrawals = useMemo(() => {
    const q = wdSearchQuery.trim().toLowerCase();
    const fromMs = wdDateFrom ? Date.parse(`${wdDateFrom}T00:00:00`) : null;
    const toMs = wdDateTo ? Date.parse(`${wdDateTo}T23:59:59`) : null;
    return withdrawals.filter((w) => {
      if (wdStatusFilter !== 'all' && w.status !== wdStatusFilter) return false;
      if (q) {
        const userRec = users.find((u) => u.uid === w.userId);
        const matchPublicId = (userRec?.publicUserId || '').toLowerCase().includes(q);
        const matchUid = w.userId.toLowerCase().includes(q);
        const matchId = w.withdrawalId.toLowerCase().includes(q);
        const matchEmail = (w.userEmail || '').toLowerCase().includes(q);
        const matchName = (w.userName || '').toLowerCase().includes(q);
        if (!matchPublicId && !matchUid && !matchId && !matchEmail && !matchName) return false;
      }
      const createdMs = toMillis(w.createdAt);
      if (fromMs !== null && !Number.isNaN(fromMs) && createdMs < fromMs) return false;
      if (toMs !== null && !Number.isNaN(toMs) && createdMs > toMs) return false;
      return true;
    });
  }, [withdrawals, users, wdSearchQuery, wdStatusFilter, wdDateFrom, wdDateTo]);

  const selectedWithdrawal = useMemo(
    () => withdrawals.find((w) => w.withdrawalId === selectedWdId) || null,
    [withdrawals, selectedWdId]
  );

  const filteredLedger = ledger.filter((l) => ledgerTypeFilter === 'all' || l.type === ledgerTypeFilter);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row transition-colors">
      <aside className="w-full lg:w-64 bg-slate-950 text-slate-100 flex flex-col shrink-0">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <button type="button" onClick={onExitAdmin} className="inline-flex items-center gap-2 cursor-pointer min-w-0">
            <ArrowLeft className="w-4 h-4 text-slate-400 shrink-0" />
            <BrandLogo brandName={brandForm.brandName} logoUrl={brandForm.logoUrl} accentColor={brandForm.accentColor} size="sm" subtitle="Super Admin" />
          </button>
        </div>

        <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
          {adminNav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === item.id ? 'bg-blue-700 text-white' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto p-4 border-t border-slate-800 hidden lg:block text-xs space-y-2">
          <p className="font-medium text-white truncate">{adminEmail}</p>
          <p className="text-slate-400">Super Admin Console</p>
          <button
            type="button"
            onClick={onExitAdmin}
            className="w-full px-3 py-2 text-xs font-medium text-slate-200 bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            Back to User Workspace
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span>Super Admin</span>
            <span className="mx-2">/</span>
            <span className="font-semibold text-slate-900 dark:text-white capitalize">{activeTab.replace('_', ' ')}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void loadBackendAdminOverview()}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer"
              aria-label="Refresh admin data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ai')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 rounded-lg cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5" />
              AI Center
            </button>
          </div>
        </header>

        <main className="p-6 max-w-7xl w-full mx-auto space-y-6">
          {/* ANALYTICS & BUSINESS INTELLIGENCE — 7 REQUIRED REAL-DATA CARDS */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <p className="text-xs text-slate-500">1. Total Users</p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums">{metrics.totalUsers.toLocaleString()}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{metrics.activePlanSubs} active 24h plans</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <p className="text-xs text-slate-500">2. Total Coins in Circulation</p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-blue-700 dark:text-blue-400">
                    {metrics.totalCoinsInCirculation.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">Across {wallets.length} wallets</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <p className="text-xs text-slate-500">3. Total Coins Added by Admin</p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    +{metrics.totalCoinsAddedByAdmin.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {walletTransactions.filter((t) => t.action === 'add').length} manual credit entries
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <p className="text-xs text-slate-500">4. Total Coins Deducted by Admin</p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-rose-700 dark:text-rose-400">
                    -{metrics.totalCoinsDeductedByAdmin.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {walletTransactions.filter((t) => t.action === 'deduct').length} manual deduction entries
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <p className="text-xs text-slate-500">5. Pending Withdrawal Requests</p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                    {metrics.pendingWithdrawals}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('withdrawals')}
                    className="mt-1 text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Review queue →
                  </button>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <p className="text-xs text-slate-500">6. Successful Withdrawals</p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {metrics.successfulWithdrawals}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">Provider-confirmed &amp; settled</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <p className="text-xs text-slate-500">7. Rejected Withdrawals</p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-red-700 dark:text-red-400">
                    {metrics.rejectedWithdrawals}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {metrics.openTickets} open support tickets · {metrics.failedPayments} failed payments
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-base font-bold">AI Business Intelligence &amp; Exports</h2>
                    <p className="text-xs text-slate-500">Forecast upcoming 24-hour scheduled coin obligations and export CSVs.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void runAiBusinessIntelligenceApi()
                          .then((res) => setBiResult(res.bi))
                          .catch((e) => pushToast('error', 'BI Error', e instanceof Error ? e.message : 'Failed'))
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Run BI Insights
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportCsv('ledger', ledger as unknown as Array<Record<string, unknown>>)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Ledger CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportCsv('payments', payments as unknown as Array<Record<string, unknown>>)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Payments CSV
                    </button>
                  </div>
                </div>
                {biResult && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-2 text-xs">
                    <p className="font-semibold text-slate-900 dark:text-white">{biResult.executiveSummary}</p>
                    <p className="text-slate-600 dark:text-slate-300">{biResult.obligationsForecast}</p>
                    <ul className="list-disc pl-4 text-slate-600 dark:text-slate-300">
                      {biResult.highlights?.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* USER MANAGEMENT & ADVANCED SEARCH ENGINE */}
          {activeTab === 'user_management' && (
            <AdminUserManagementPanel
              firebaseUser={firebaseUser}
              isOtpMode={isOtpMode}
              adminEmail={adminEmail}
              viewerRole={viewerRole}
              users={users}
              wallets={wallets}
              walletTransactions={walletTransactions}
              ledger={ledger}
              payments={payments}
              coinRequests={coinRequests}
              orders={orders}
              planPurchases={planPurchases}
              withdrawals={withdrawals}
              securityLogs={securityLogs}
              adminAuditLogs={adminAuditLogs}
              onRefreshData={loadBackendAdminOverview}
              onJumpToCoinManagement={(uid, action) => {
                setSelectedCoinUserId(uid);
                setCoinActionType(action);
                setActiveTab('coin_management');
              }}
              onExportCsv={handleExportCsv}
              onRequestConfirm={setPendingConfirm}
              initialSelectedUserId={jumpReportUid || undefined}
            />
          )}

          {/* MANUAL COIN MANAGEMENT */}
          {activeTab === 'coin_management' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: User Search & Selector */}
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                  <div>
                    <h2 className="font-display text-base font-bold">1. Find User Account</h2>
                    <p className="text-xs text-slate-500">Search by User ID, Mobile Number, Email, or Display Name.</p>
                  </div>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={coinSearchQuery}
                      onChange={(e) => setCoinSearchQuery(e.target.value)}
                      placeholder="User ID, Email, or Mobile..."
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {coinSearchMatchedUsers.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">No matching users found.</p>
                    ) : (
                      coinSearchMatchedUsers.map((u) => {
                        const w = wallets.find((x) => x.userId === u.uid);
                        const isSelected = selectedCoinUserId === u.uid;
                        return (
                          <button
                            key={u.uid}
                            type="button"
                            onClick={() => setSelectedCoinUserId(u.uid)}
                            className={`w-full p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                              isSelected
                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60'
                                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-slate-900 dark:text-white truncate">{u.displayName}</span>
                              <span className="font-mono font-bold tabular-nums text-blue-700 dark:text-blue-400 shrink-0">
                                {(w?.availableCoins ?? 0).toLocaleString()} Coins
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-500 truncate">{u.email || u.phone || 'No contact'}</p>
                            <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              <span className="font-bold text-slate-900 dark:text-white">{u.publicUserId || 'Pending ID'}</span>
                              <span> · {u.uid}</span>
                            </p>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right: Manual Add / Deduct Coins Form */}
                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                    <div>
                      <h2 className="font-display text-base font-bold">2. Add or Deduct Coins</h2>
                      <p className="text-xs text-slate-500">
                        Atomic ledger adjustment with negative-balance block and idempotency protection.
                      </p>
                    </div>
                  </div>

                  {!selectedCoinUser ? (
                    <div className="py-12 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                      <p className="text-sm text-slate-500">Select a user from the directory on the left to adjust coins.</p>
                    </div>
                  ) : (
                    (() => {
                      const currentBal = Number(selectedCoinWallet?.availableCoins ?? 0);
                      const parsedAmt = Math.floor(Number(coinAmountInput) || 0);
                      const validAmt = Number.isFinite(parsedAmt) && parsedAmt > 0;
                      const projectedBal = coinActionType === 'add' ? currentBal + parsedAmt : currentBal - parsedAmt;
                      const negativeBlocked = coinActionType === 'deduct' && (!validAmt || projectedBal < 0);
                      const canSubmit = Boolean(
                        selectedCoinWallet &&
                          validAmt &&
                          coinReasonInput.trim().length >= 3 &&
                          !(coinActionType === 'deduct' && projectedBal < 0)
                      );

                      return (
                        <div className="space-y-5">
                          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                            <div>
                              <p className="text-slate-500">Selected User</p>
                              <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{selectedCoinUser.displayName}</p>
                              <p className="text-[11px] text-slate-500 truncate">{selectedCoinUser.email || selectedCoinUser.phone}</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Permanent User ID</p>
                              <p className="mt-0.5 font-mono font-bold text-slate-900 dark:text-white">
                                {selectedCoinUser.publicUserId || 'Pending ID'}
                              </p>
                              <p className="mt-0.5 font-mono text-[10px] text-slate-400 break-all">{selectedCoinUser.uid}</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Current Coin Balance</p>
                              <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-blue-700 dark:text-blue-400">
                                {currentBal.toLocaleString()} Coins
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              onClick={() => setCoinActionType('add')}
                              className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border cursor-pointer ${
                                coinActionType === 'add'
                                  ? 'bg-emerald-700 text-white border-emerald-700'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              <Plus className="w-4 h-4" />
                              Add Coins
                            </button>
                            <button
                              type="button"
                              onClick={() => setCoinActionType('deduct')}
                              className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border cursor-pointer ${
                                coinActionType === 'deduct'
                                  ? 'bg-red-700 text-white border-red-700'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              <Minus className="w-4 h-4" />
                              Deduct Coins
                            </button>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                              Quick Presets &amp; Exact Coin Amount
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {[100, 500, 1000].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => setCoinAmountInput(String(preset))}
                                  className="px-3 py-1.5 text-xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                                >
                                  {coinActionType === 'add' ? `+${preset.toLocaleString()}` : `-${preset.toLocaleString()}`} Coins
                                </button>
                              ))}
                            </div>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={coinAmountInput}
                              onChange={(e) => setCoinAmountInput(e.target.value)}
                              placeholder="Enter exact coin amount"
                              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Transaction Reason / Description (Mandatory Audit Trail)
                            </label>
                            <input
                              type="text"
                              value={coinReasonInput}
                              onChange={(e) => setCoinReasonInput(e.target.value)}
                              placeholder="e.g. Manual top-up bonus or authorized reversal adjustment..."
                              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                            />
                          </div>

                          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                            <span className="text-slate-500">Projected Balance After Execution</span>
                            <span
                              className={`font-mono font-bold tabular-nums ${
                                negativeBlocked
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {currentBal.toLocaleString()} → {validAmt ? projectedBal.toLocaleString() : '—'} Coins
                              {negativeBlocked ? ' (Negative balance blocked)' : ''}
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={!canSubmit}
                            onClick={() => {
                              if (!selectedCoinWallet || !canSubmit) return;
                              const actionLabel = coinActionType === 'add' ? 'Add' : 'Deduct';
                              const targetUser = selectedCoinUser;
                              const targetWallet = selectedCoinWallet;
                              const amt = parsedAmt;
                              const reason = coinReasonInput.trim();
                              const idem = coinIdempotencyKey;

                              setPendingConfirm({
                                title: `Confirm ${actionLabel} ${amt.toLocaleString()} Coins`,
                                description: `${actionLabel} ${amt.toLocaleString()} coins ${
                                  coinActionType === 'add' ? 'to' : 'from'
                                } ${targetUser.displayName} (${targetUser.uid}). Balance will update from ${targetWallet.availableCoins.toLocaleString()} to ${projectedBal.toLocaleString()} coins. Reason: "${reason}"`,
                                variant: coinActionType === 'deduct' ? 'danger' : 'primary',
                                onConfirm: async () => {
                                  if (isOtpMode) {
                                    await adminAdjustWalletApi({
                                      userId: targetUser.uid,
                                      action: coinActionType,
                                      amountCoins: amt,
                                      reason,
                                      idempotencyKey: idem,
                                    });
                                    await loadBackendAdminOverview();
                                  } else if (firebaseUser) {
                                    await adminAdjustUserCoinsFirestore({
                                      adminUser: firebaseUser,
                                      targetUserId: targetUser.uid,
                                      action: coinActionType,
                                      amountCoins: amt,
                                      reason,
                                      idempotencyKey: idem,
                                    });
                                  }
                                  setCoinIdempotencyKey(makeSafeId('idem'));
                                  setCoinReasonInput('');
                                  pushToast(
                                    'success',
                                    `Coins ${coinActionType === 'add' ? 'Added' : 'Deducted'}`,
                                    `Updated ${targetUser.displayName}'s balance to ${projectedBal.toLocaleString()} coins.`
                                  );
                                },
                              });
                            }}
                            className={`w-full py-2.5 text-xs font-semibold text-white rounded-lg disabled:opacity-40 cursor-pointer ${
                              coinActionType === 'add' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-red-700 hover:bg-red-800'
                            }`}
                          >
                            Review &amp; Confirm {coinActionType === 'add' ? 'Coin Addition' : 'Coin Deduction'}
                          </button>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>

              {/* Manual Coin Transactions Audit Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold">
                    Admin Manual Coin Transactions ({walletTransactions.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      handleExportCsv('coin_transactions', walletTransactions as unknown as Array<Record<string, unknown>>)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                </div>
                {walletTransactions.length === 0 ? (
                  <p className="text-xs text-slate-500">No manual admin coin additions or deductions recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <tr>
                          <th className="py-2 pr-4">Transaction ID</th>
                          <th className="py-2 pr-4">Date</th>
                          <th className="py-2 pr-4">User ID</th>
                          <th className="py-2 pr-4">Action</th>
                          <th className="py-2 pr-4 text-right">Amount</th>
                          <th className="py-2 pr-4 text-right">Before → After</th>
                          <th className="py-2 pr-4">Reason</th>
                          <th className="py-2">Admin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {walletTransactions.map((tx) => (
                          <tr key={tx.txId}>
                            <td className="py-2.5 pr-4 font-mono">{tx.txId}</td>
                            <td className="py-2.5 pr-4 font-mono text-[11px] text-slate-500">{formatTimestamp(tx.createdAt)}</td>
                            <td className="py-2.5 pr-4 font-mono">{tx.userId}</td>
                            <td
                              className={`py-2.5 pr-4 font-semibold uppercase ${
                                tx.action === 'add' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                              }`}
                            >
                              {tx.action}
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-right font-semibold tabular-nums">
                              {tx.action === 'add' ? '+' : '-'}
                              {tx.amount.toLocaleString()}
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-right tabular-nums text-slate-500">
                              {tx.balanceBefore.toLocaleString()} → {tx.balanceAfter.toLocaleString()}
                            </td>
                            <td className="py-2.5 pr-4">{tx.reason}</td>
                            <td className="py-2.5 text-slate-500">{tx.adminEmail || tx.adminId}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WITHDRAWAL MANAGEMENT (7 STATUSES + PROVIDER CONFIRMATION + AUDIT LOG) */}
          {activeTab === 'withdrawals' && (
            <div className="space-y-6">
              {/* 7-Status Summary Strip */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
                {(Object.keys(WITHDRAWAL_STATUS_META) as WithdrawalStatus[]).map((st) => {
                  const count = withdrawals.filter((w) => w.status === st).length;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setWdStatusFilter(wdStatusFilter === st ? 'all' : st)}
                      className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                        wdStatusFilter === st
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <p className={`font-semibold ${WITHDRAWAL_STATUS_META[st].colorClass}`}>
                        {WITHDRAWAL_STATUS_META[st].label}
                      </p>
                      <p className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-white">{count}</p>
                    </button>
                  );
                })}
              </div>

              {/* Filters Bar */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold">
                      Withdrawal Requests ({filteredWithdrawals.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Requests can only be marked Successful after authorized payout provider confirmation and reference logging.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleExportCsv('withdrawals', filteredWithdrawals as unknown as Array<Record<string, unknown>>)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Withdrawals CSV
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <input
                    type="search"
                    value={wdSearchQuery}
                    onChange={(e) => setWdSearchQuery(e.target.value)}
                    placeholder="Search User ID, Request ID, Name..."
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                  />
                  <select
                    value={wdStatusFilter}
                    onChange={(e) => setWdStatusFilter(e.target.value as 'all' | WithdrawalStatus)}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                  >
                    <option value="all">All 7 Statuses</option>
                    {(Object.keys(WITHDRAWAL_STATUS_META) as WithdrawalStatus[]).map((st) => (
                      <option key={st} value={st}>
                        {WITHDRAWAL_STATUS_META[st].label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={wdDateFrom}
                    onChange={(e) => setWdDateFrom(e.target.value)}
                    aria-label="Filter from date"
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                  />
                  <input
                    type="date"
                    value={wdDateTo}
                    onChange={(e) => setWdDateTo(e.target.value)}
                    aria-label="Filter to date"
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                  />
                </div>

                {filteredWithdrawals.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500">No withdrawal requests match the selected filters.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <tr>
                          <th className="py-2 pr-4">User</th>
                          <th className="py-2 pr-4">User ID</th>
                          <th className="py-2 pr-4">Request ID</th>
                          <th className="py-2 pr-4 text-right">Amount</th>
                          <th className="py-2 pr-4">Request Date</th>
                          <th className="py-2 pr-4">Payment Details (Admin)</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">Payout Ref</th>
                          <th className="py-2">Control</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredWithdrawals.map((wd) => {
                          const userMatch = users.find((u) => u.uid === wd.userId);
                          const displayName = wd.userName || userMatch?.displayName || wd.userEmail || 'Member';
                          const statusMeta = WITHDRAWAL_STATUS_META[wd.status] || WITHDRAWAL_STATUS_META.pending;
                          return (
                            <tr key={wd.withdrawalId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-2.5 pr-4">
                                <p className="font-semibold text-slate-900 dark:text-white">{displayName}</p>
                                <p className="text-[11px] text-slate-500">{wd.userEmail}</p>
                              </td>
                              <td className="py-2.5 pr-4 font-mono text-[11px]">
                                <span className="font-bold text-slate-900 dark:text-white">{userMatch?.publicUserId || '—'}</span>
                                <span className="block text-[10px] text-slate-400">{wd.userId}</span>
                              </td>
                              <td className="py-2.5 pr-4 font-mono">{wd.withdrawalId}</td>
                              <td className="py-2.5 pr-4 font-mono text-right font-bold tabular-nums">
                                {wd.amountCoins.toLocaleString()} Coins
                                <span className="block text-[11px] font-normal text-slate-500">
                                  INR {wd.equivalentInr.toLocaleString()}
                                </span>
                              </td>
                              <td className="py-2.5 pr-4 font-mono text-[11px] text-slate-500">
                                {formatTimestamp(wd.createdAt)}
                              </td>
                              <td className="py-2.5 pr-4">
                                <p className="font-medium">{wd.payoutChannel}</p>
                                <p className="font-mono text-[11px] text-slate-500">{wd.accountLabel}</p>
                              </td>
                              <td className={`py-2.5 pr-4 font-semibold ${statusMeta.colorClass}`}>
                                {statusMeta.label}
                              </td>
                              <td className="py-2.5 pr-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                {wd.payoutReferenceNumber || '—'}
                              </td>
                              <td className="py-2.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedWdId(wd.withdrawalId);
                                    setWdActionReason(wd.adminNote || '');
                                    setWdPayoutRef(wd.payoutReferenceNumber || '');
                                    setWdProviderConfirmed(Boolean(wd.providerConfirmed));
                                  }}
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 rounded-lg cursor-pointer"
                                >
                                  Manage
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Withdrawal Audit History */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                <h3 className="font-display text-base font-bold">
                  Withdrawal &amp; Admin Action Audit Trail ({adminAuditLogs.length})
                </h3>
                {adminAuditLogs.length === 0 ? (
                  <p className="text-xs text-slate-500">No withdrawal status transitions or coin audit records yet.</p>
                ) : (
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <tr>
                          <th className="py-2 pr-4">Audit ID</th>
                          <th className="py-2 pr-4">Timestamp</th>
                          <th className="py-2 pr-4">Action</th>
                          <th className="py-2 pr-4">Target Entity / User</th>
                          <th className="py-2 pr-4">Ref #</th>
                          <th className="py-2 pr-4">Reason / Details</th>
                          <th className="py-2">Admin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {adminAuditLogs.slice(0, 60).map((log) => (
                          <tr key={log.auditId}>
                            <td className="py-2 pr-4 font-mono">{log.auditId}</td>
                            <td className="py-2 pr-4 font-mono text-[11px] text-slate-500">{formatTimestamp(log.createdAt)}</td>
                            <td className="py-2 pr-4 font-mono font-semibold">{log.actionType}</td>
                            <td className="py-2 pr-4 font-mono text-[11px]">
                              {log.targetEntityId} · {log.targetUserId}
                            </td>
                            <td className="py-2 pr-4 font-mono text-[11px]">{log.payoutReferenceNumber || '—'}</td>
                            <td className="py-2 pr-4">{log.reason || log.details}</td>
                            <td className="py-2 text-slate-500">{log.adminEmail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI CONTROL CENTER (MASTER + 11 SWITCHES + 5 TOOLS + LOGS) */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              {/* Master & 11 Switches */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <h2 className="font-display text-lg font-bold">AI Features Control Center (Master + 11 Modules)</h2>
                    <p className="text-xs text-slate-500">
                      Disable Master AI to shut down every Gemini feature platform-wide, or toggle modules individually.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium flex items-center gap-2">
                      Daily Limit / User:
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={aiForm.dailyLimitPerUser}
                        onChange={(e) =>
                          void handleSaveAiControls({
                            ...aiForm,
                            dailyLimitPerUser: Math.max(1, Number(e.target.value) || 50),
                          })
                        }
                        className="w-20 px-2 py-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded font-mono text-xs"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleSaveAiControls({ ...aiForm, masterEnabled: !aiForm.masterEnabled })}
                      className={`px-4 py-2 text-xs font-bold rounded-lg text-white cursor-pointer ${
                        aiForm.masterEnabled ? 'bg-emerald-700' : 'bg-red-700'
                      }`}
                    >
                      Master AI: {aiForm.masterEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {AI_MODULES_META.map((mod) => {
                    const enabled = aiForm[mod.key];
                    return (
                      <div
                        key={mod.key}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3"
                      >
                        <div className="text-xs">
                          <p className="font-semibold text-slate-900 dark:text-white">{mod.label}</p>
                          <p className="mt-0.5 text-slate-500 dark:text-slate-400">{mod.desc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSaveAiControls({ ...aiForm, [mod.key]: !enabled })}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-md shrink-0 cursor-pointer ${
                            enabled
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {enabled ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AI Admin Command + Fraud + DB Health + Theme Designer */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                  <h3 className="font-display text-base font-bold">AI Admin Dashboard Query</h3>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!aiCommand.trim()) return;
                      setAiLoading(true);
                      void queryAiAdminAssistantApi(aiCommand, { metrics, ledgerCount: ledger.length })
                        .then(setAiOutput)
                        .catch((err) => pushToast('error', 'AI Error', err instanceof Error ? err.message : 'Failed'))
                        .finally(() => setAiLoading(false));
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={aiCommand}
                      onChange={(e) => setAiCommand(e.target.value)}
                      placeholder="Ask about registrations, 24h plans, payment failures..."
                      className="flex-1 px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                    <button
                      type="submit"
                      disabled={aiLoading}
                      className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg cursor-pointer"
                    >
                      {aiLoading ? 'Running...' : 'Analyze'}
                    </button>
                  </form>
                  {aiOutput && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-xs space-y-2">
                      <p className="font-semibold">{aiOutput.result.summary}</p>
                      {aiOutput.result.anomalies?.map((a) => (
                        <p key={a} className="text-amber-700 dark:text-amber-400">• {a}</p>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                      <h3 className="font-display text-base font-bold">AI Theme Designer (Preview First)</h3>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={themePrompt}
                      onChange={(e) => setThemePrompt(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void generateAiThemeProposalApi(themePrompt)
                          .then((r) => setThemeProposal(r.proposal))
                          .catch((e) => pushToast('error', 'Theme AI Error', e instanceof Error ? e.message : 'Failed'))
                      }
                      className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 rounded-lg cursor-pointer"
                    >
                      Generate Preview
                    </button>
                  </div>
                  {themeProposal && (
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-5 h-5 rounded border border-slate-300"
                          style={{ backgroundColor: themeProposal.accentColor }}
                        />
                        <span className="font-mono font-semibold">{themeProposal.accentColor}</span>
                        <span>Default: {themeProposal.defaultTheme}</span>
                      </div>
                      <p className="font-medium">{themeProposal.tagline}</p>
                      <p className="text-slate-500">{themeProposal.rationale}</p>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingConfirm({
                            title: 'Publish AI Theme Proposal',
                            description: `Apply accent color ${themeProposal.accentColor}, default mode "${themeProposal.defaultTheme}", and tagline to the live platform?`,
                            onConfirm: async () => {
                              const next = {
                                ...brandForm,
                                accentColor: themeProposal.accentColor,
                                defaultTheme: themeProposal.defaultTheme === 'dark' ? ('dark' as const) : ('light' as const),
                                tagline: themeProposal.tagline,
                              };
                              await saveAdminSettingsApi(next);
                              if (firebaseUser) await adminSaveAdminSettingsFirestore(firebaseUser, next);
                              setBrandForm(next);
                              await onRefreshBootstrap();
                              pushToast('success', 'Theme Published', 'New AI-assisted theme applied live.');
                            },
                          })
                        }
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg cursor-pointer"
                      >
                        Publish Theme Live
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold">AI Fraud Detection</h3>
                    <button
                      type="button"
                      onClick={() =>
                        void runAiFraudDetectionApi()
                          .then((r) => setFraudResult(r.result))
                          .catch((e) => pushToast('error', 'Fraud AI Error', e instanceof Error ? e.message : 'Failed'))
                      }
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-red-700 rounded-lg cursor-pointer"
                    >
                      Scan Telemetry
                    </button>
                  </div>
                  {fraudResult && (
                    <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-xs space-y-1.5">
                      <p className="font-semibold">
                        Risk Level: {fraudResult.overallRiskLevel} (Score {fraudResult.riskScore}/100)
                      </p>
                      {fraudResult.flaggedSignals?.map((s) => (
                        <p key={s} className="text-amber-700 dark:text-amber-400">• {s}</p>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                      <h3 className="font-display text-base font-bold">AI Database &amp; Scheduler Health</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void runAiDbHealthCheckApi()
                          .then((r) => setDbHealthResult(r.report))
                          .catch((e) => pushToast('error', 'Health AI Error', e instanceof Error ? e.message : 'Failed'))
                      }
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 rounded-lg cursor-pointer"
                    >
                      Run Diagnostics
                    </button>
                  </div>
                  {dbHealthResult && (
                    <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-xs space-y-1">
                      <p className="font-semibold capitalize">Status: {dbHealthResult.healthStatus}</p>
                      <p>{dbHealthResult.summary}</p>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Recorded AI Calls: {aiUsageLogs.length} · System Health Events: {systemHealthLogs.length}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* PLANS & 24-HOUR SCHEDULER */}
          {activeTab === 'plans' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-bold">24-Hour Plan Credit Engine</h2>
                  <p className="text-xs text-slate-500">
                    Runs automatically every 60s on server and executes due 24-hour credits idempotently. Use recovery run for manual audit.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void runPlanSchedulerApi()
                      .then((res) => {
                        pushToast('success', 'Scheduler Audited', `Processed ${res.processedCount} due events (${res.creditedCoins} coins).`);
                        void loadBackendAdminOverview();
                      })
                      .catch((e) => pushToast('error', 'Scheduler Error', e instanceof Error ? e.message : 'Failed'))
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run 24h Credit Scheduler Now
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                  <h3 className="font-display text-base font-bold">
                    {planForm.planId ? 'Edit Configurable Plan' : 'Create Configurable 24h Plan'}
                  </h3>
                  <form onSubmit={handleSavePlan} className="space-y-3 text-xs">
                    <input
                      type="text"
                      required
                      value={planForm.name}
                      onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                      placeholder="Plan Name (e.g. 15-Day Ledger Plan)"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Price (Coins)</label>
                        <input
                          type="number"
                          min={1}
                          value={planForm.purchasePrice}
                          onChange={(e) => setPlanForm({ ...planForm, purchasePrice: e.target.value })}
                          className="w-full px-2.5 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Duration (Days)</label>
                        <input
                          type="number"
                          min={1}
                          value={planForm.durationDays}
                          onChange={(e) => setPlanForm({ ...planForm, durationDays: e.target.value })}
                          className="w-full px-2.5 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Total Credits</label>
                        <input
                          type="number"
                          min={1}
                          value={planForm.totalScheduledCredits}
                          onChange={(e) => setPlanForm({ ...planForm, totalScheduledCredits: e.target.value })}
                          className="w-full px-2.5 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                        />
                      </div>
                    </div>
                    <p className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/70 font-mono text-[11px]">
                      24h Distribution Preview: {previewSchedule.slice(0, 6).join(', ')}
                      {previewSchedule.length > 6 ? ` ... final ${previewSchedule[previewSchedule.length - 1]}` : ''} (Sum ={' '}
                      {previewSchedule.reduce((a, b) => a + b, 0)} Coins)
                    </p>
                    <textarea
                      rows={2}
                      value={planForm.description}
                      onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                      placeholder="Plan description"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                    <select
                      value={planForm.status}
                      onChange={(e) => setPlanForm({ ...planForm, status: e.target.value as 'active' | 'disabled' | 'archived' })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    >
                      <option value="active">Active</option>
                      <option value="disabled">Disabled</option>
                      <option value="archived">Archived</option>
                    </select>
                    <button type="submit" className="w-full py-2.5 font-semibold text-white bg-blue-700 rounded-lg cursor-pointer">
                      Save Plan Configuration
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                  <h3 className="font-display text-base font-bold">Configured Plans ({plans.length})</h3>
                  <div className="space-y-2.5">
                    {plans.map((pl) => (
                      <div key={pl.planId} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-semibold">{pl.name} · <span className="uppercase">{pl.status}</span></p>
                          <p className="text-slate-500 font-mono">
                            {pl.purchasePrice} Coins · {pl.durationDays}d · {pl.totalScheduledCredits} credits (24h)
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setPlanForm({
                              planId: pl.planId,
                              name: pl.name,
                              purchasePrice: String(pl.purchasePrice),
                              currency: pl.currency,
                              durationDays: String(pl.durationDays),
                              totalScheduledCredits: String(pl.totalScheduledCredits),
                              description: pl.description,
                              terms: pl.terms,
                              status: pl.status,
                            })
                          }
                          className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Active User Plan Subscriptions & Manual Override */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <h3 className="font-display text-base font-bold">Subscriber Plan Purchases &amp; Manual Override</h3>
                {planPurchases.length === 0 ? (
                  <p className="text-xs text-slate-500">No active or historical plan subscriptions yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <tr>
                          <th className="py-2 pr-4">Purchase ID</th>
                          <th className="py-2 pr-4">User UID</th>
                          <th className="py-2 pr-4">Plan</th>
                          <th className="py-2 pr-4">Progress</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2">Override</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {planPurchases.map((pp) => (
                          <tr key={pp.purchaseId}>
                            <td className="py-2.5 pr-4 font-mono">{pp.purchaseId}</td>
                            <td className="py-2.5 pr-4 font-mono">{pp.userId}</td>
                            <td className="py-2.5 pr-4">{pp.planName} ({pp.durationDays}d)</td>
                            <td className="py-2.5 pr-4 font-mono">
                              {pp.completedEvents}/{pp.totalEvents} ({pp.creditedCoinsSoFar}/{pp.totalScheduledCredits})
                            </td>
                            <td className="py-2.5 pr-4 capitalize">{pp.status}</td>
                            <td className="py-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setOverrideTarget(pp);
                                  setOverrideReason('');
                                }}
                                className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded font-semibold cursor-pointer"
                              >
                                Override
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* COIN PACKAGES & MULTIPLE MERCHANT UPI CONFIGS */}
          {activeTab === 'packages_upi' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Coin Packages CRUD */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-base font-bold">Coin Packages ({coinPackages.length})</h2>
                <form onSubmit={handleSavePackage} className="grid grid-cols-2 gap-2.5 text-xs">
                  <input
                    type="text"
                    required
                    value={pkgForm.name}
                    onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })}
                    placeholder="Package Name"
                    className="col-span-2 px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                  />
                  <input
                    type="number"
                    min={1}
                    value={pkgForm.coinQuantity}
                    onChange={(e) => setPkgForm({ ...pkgForm, coinQuantity: e.target.value })}
                    placeholder="Coins"
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                  />
                  <input
                    type="number"
                    min={1}
                    value={pkgForm.purchasePrice}
                    onChange={(e) => setPkgForm({ ...pkgForm, purchasePrice: e.target.value })}
                    placeholder="INR Price"
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                  />
                  <button type="submit" className="col-span-2 py-2 font-semibold text-white bg-blue-700 rounded-lg cursor-pointer">
                    {pkgForm.packageId ? 'Update Package' : 'Add Coin Package'}
                  </button>
                </form>

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {coinPackages.map((p) => (
                    <div key={p.packageId} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs">
                      <span>{p.name} ({p.coinQuantity} Coins / {p.currency} {p.purchasePrice})</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPkgForm({
                            packageId: p.packageId,
                            name: p.name,
                            coinQuantity: String(p.coinQuantity),
                            purchasePrice: String(p.purchasePrice),
                            currency: p.currency,
                            description: p.description,
                            status: p.status,
                          })
                        }
                        className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded cursor-pointer"
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Multiple Merchant UPI Configurations CRUD */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-base font-bold">
                  Random Sandbox UPI Pool ({paymentConfigs.filter((c) => c.enabled).length} enabled)
                </h2>
                <form onSubmit={handleSaveUpiConfig} className="grid grid-cols-2 gap-2.5 text-xs">
                  <input
                    type="text"
                    required
                    value={upiForm.label}
                    onChange={(e) => setUpiForm({ ...upiForm, label: e.target.value })}
                    placeholder="Config Label (e.g. Desk D)"
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                  />
                  <input
                    type="text"
                    required
                    value={upiForm.upiId}
                    onChange={(e) => setUpiForm({ ...upiForm, upiId: e.target.value })}
                    placeholder="Sandbox VPA (e.g. desk.d@testupi)"
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                  />
                  <input
                    type="text"
                    required
                    value={upiForm.merchantName}
                    onChange={(e) => setUpiForm({ ...upiForm, merchantName: e.target.value })}
                    placeholder="Merchant Name"
                    className="col-span-2 px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                  />
                  <button type="submit" className="col-span-2 py-2 font-semibold text-white bg-slate-900 dark:bg-blue-700 rounded-lg cursor-pointer">
                    {upiForm.configId ? 'Update Sandbox UPI' : 'Add Sandbox UPI Configuration'}
                  </button>
                </form>

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {paymentConfigs.map((cfg) => (
                    <div key={cfg.configId} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <p className="font-semibold">{cfg.label} · {cfg.enabled ? 'Enabled' : 'Disabled'}</p>
                        <p className="font-mono text-slate-500">{cfg.upiId}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            void saveAdminPaymentConfigApi({ ...cfg, enabled: !cfg.enabled }).then(loadBackendAdminOverview)
                          }
                          className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded cursor-pointer"
                        >
                          {cfg.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void saveAdminPaymentConfigApi({ deleteConfigId: cfg.configId }).then(loadBackendAdminOverview)
                          }
                          className="p-1 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                          aria-label="Delete UPI configuration"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* USERS & RBAC */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="font-display text-base font-bold">User Directory ({users.length})</h2>
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Filter by UID, email, or name..."
                    className="px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg sm:w-64"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">User</th>
                        <th className="py-2 pr-4">User ID</th>
                        <th className="py-2 pr-4 text-right">Coins</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredUsers.map((u) => {
                        const w = wallets.find((x) => x.userId === u.uid);
                        return (
                          <tr key={u.uid}>
                            <td className="py-2.5 pr-4">
                              <p className="font-medium">{u.displayName}</p>
                              <p className="text-slate-500">{u.email || u.phone}</p>
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-[11px]">
                              <span className="font-bold text-slate-900 dark:text-white">{u.publicUserId || 'Pending'}</span>
                              <span className="block text-[10px] text-slate-400">{u.uid}</span>
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-right tabular-nums">
                              {(w?.availableCoins ?? 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 pr-4 capitalize">{u.status}</td>
                            <td className="py-2.5 flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setJumpReportUid(u.uid);
                                  setActiveTab('user_management');
                                }}
                                className="px-2 py-1 text-[11px] font-semibold bg-slate-900 dark:bg-blue-700 text-white rounded cursor-pointer"
                              >
                                Full Report
                              </button>
                              {(['active', 'flagged', 'suspended'] as UserStatus[]).map((st) => (
                                <button
                                  key={st}
                                  type="button"
                                  disabled={u.status === st}
                                  onClick={() => {
                                    if (isOtpMode) {
                                      void updateUserStatusApi(u.uid, st).then(loadBackendAdminOverview);
                                    } else if (firebaseUser) {
                                      void adminUpdateUserStatus({ adminUser: firebaseUser, targetUser: u, status: st });
                                    }
                                  }}
                                  className="px-2 py-1 text-[11px] bg-slate-100 dark:bg-slate-800 rounded disabled:opacity-40 cursor-pointer"
                                >
                                  {st}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCoinUserId(u.uid);
                                  setActiveTab('coin_management');
                                }}
                                className="px-2 py-1 text-[11px] bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded cursor-pointer"
                              >
                                Manage Coins
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                  <h3 className="font-display text-base font-bold">Server-Attested Admin Coin Credit</h3>
                  <select
                    value={grantCoinUid}
                    onChange={(e) => setGrantCoinUid(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                  >
                    <option value="">Select user...</option>
                    {users.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.publicUserId ? `[${u.publicUserId}] ` : ''}{u.email || u.phone || u.displayName} ({u.uid})
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={1}
                      value={grantCoinAmount}
                      onChange={(e) => setGrantCoinAmount(e.target.value)}
                      className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                    />
                    <input
                      type="text"
                      value={grantCoinReason}
                      onChange={(e) => setGrantCoinReason(e.target.value)}
                      className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const targetWallet = wallets.find((w) => w.userId === grantCoinUid);
                      if (!targetWallet) {
                        pushToast('error', 'Wallet Not Found', 'Select an initialized user wallet.');
                        return;
                      }
                      const amt = Math.max(1, Number(grantCoinAmount) || 100);
                      setPendingConfirm({
                        title: 'Confirm Admin Ledger Credit',
                        description: `Credit ${amt} sandbox coins to ${grantCoinUid} with reason "${grantCoinReason}"?`,
                        onConfirm: async () => {
                          if (isOtpMode) {
                            await adminCreditWalletApi(grantCoinUid, amt, grantCoinReason);
                            await loadBackendAdminOverview();
                          } else if (firebaseUser) {
                            await adminGrantSandboxCoins({ adminUser: firebaseUser, targetWallet, amountCoins: amt, reason: grantCoinReason });
                          }
                          pushToast('success', 'Coins Credited', `${amt} coins credited.`);
                        },
                      });
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg cursor-pointer"
                  >
                    Execute Ledger Credit
                  </button>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                  <h3 className="font-display text-base font-bold">Role-Based Access Control (RBAC)</h3>
                  <div className="space-y-1.5 text-xs">
                    {admins.map((a) => (
                      <div key={a.uid} className="p-2 rounded bg-slate-50 dark:bg-slate-800/70 flex justify-between">
                        <span>{a.email}</span>
                        <span className="font-mono font-semibold">{a.role}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <input
                      type="text"
                      value={newAdminUid}
                      onChange={(e) => setNewAdminUid(e.target.value)}
                      placeholder="UID"
                      className="px-2.5 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                    />
                    <input
                      type="email"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="Email"
                      className="px-2.5 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                    <select
                      value={newAdminRole}
                      onChange={(e) => setNewAdminRole(e.target.value as AdminRoleRecord['role'])}
                      className="px-2.5 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    >
                      <option value="super_admin">super_admin</option>
                      <option value="admin">admin</option>
                      <option value="support_staff">support_staff</option>
                      <option value="read_only_staff">read_only_staff</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newAdminEmail.includes('@')) return;
                      void saveAdminRoleApi({ uid: newAdminUid || undefined, email: newAdminEmail, role: newAdminRole })
                        .then(async () => {
                          if (firebaseUser && newAdminUid) {
                            await adminGrantRole({
                              adminUser: firebaseUser,
                              targetUid: newAdminUid,
                              targetEmail: newAdminEmail,
                              role: newAdminRole,
                            });
                          }
                          await loadBackendAdminOverview();
                          pushToast('success', 'RBAC Updated', `Assigned ${newAdminRole} to ${newAdminEmail}.`);
                        });
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 rounded-lg cursor-pointer"
                  >
                    Save Admin Role
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PRODUCTS CATALOGUE CRUD */}
          {activeTab === 'products' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                <h2 className="font-display text-base font-bold">{editingProductId ? 'Edit Product' : 'Create Product'}</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!firebaseUser) {
                      pushToast('info', 'Firebase Required', 'Product catalog Firestore writes require Google Admin session.');
                      return;
                    }
                    const pid = editingProductId || makeSafeId('prod');
                    void adminSaveProduct({
                      adminUser: firebaseUser,
                      isNew: !editingProductId,
                      product: {
                        productId: pid,
                        title: prodTitle.trim(),
                        description: prodDesc.trim(),
                        category: prodCategory,
                        itemType: prodType,
                        coinPrice: Number(prodCoinPrice) || 100,
                        inrPrice: Number(prodInrPrice) || 100,
                        imageUrl: prodImage,
                        active: prodActive,
                        stock: Number(prodStock) || 10,
                        billingCycle: 'one_time',
                        eligibility: 'Verified platform accounts.',
                        terms: 'Standard hardware/service terms.',
                        features: ['Verified platform product'],
                      },
                    }).then(() => {
                      pushToast('success', 'Product Saved', prodTitle);
                      setEditingProductId(null);
                      setProdTitle('');
                      setProdDesc('');
                    });
                  }}
                  className="space-y-3 text-xs"
                >
                  <input
                    type="text"
                    required
                    value={prodTitle}
                    onChange={(e) => setProdTitle(e.target.value)}
                    placeholder="Product Title"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                  />
                  <textarea
                    rows={3}
                    required
                    value={prodDesc}
                    onChange={(e) => setProdDesc(e.target.value)}
                    placeholder="Description"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={prodCategory}
                      onChange={(e) => setProdCategory(e.target.value as ProductCategory)}
                      className="px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    >
                      <option value="Hardware">Hardware</option>
                      <option value="Terminals">Terminals</option>
                      <option value="Membership Kits">Membership Kits</option>
                      <option value="Service Plans">Service Plans</option>
                    </select>
                    <input
                      type="number"
                      value={prodCoinPrice}
                      onChange={(e) => setProdCoinPrice(e.target.value)}
                      placeholder="Coins"
                      className="px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                    />
                  </div>
                  <select
                    value={prodImage}
                    onChange={(e) => setProdImage(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                  >
                    {STUDIO_IMAGE_OPTIONS.map((o) => (
                      <option key={o.url} value={o.url}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="w-full py-2.5 font-semibold text-white bg-blue-700 rounded-lg cursor-pointer">
                    Save Catalogue Item
                  </button>
                </form>
              </div>

              <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                <h3 className="font-display text-base font-bold">Live Catalogue ({propProducts.length})</h3>
                {propProducts.map((p) => (
                  <div key={p.productId} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold">{p.title}</p>
                      <p className="text-slate-500 font-mono">{p.coinPrice} Coins · Stock {p.stock}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProductId(p.productId);
                        setProdTitle(p.title);
                        setProdDesc(p.description);
                        setProdCategory(p.category);
                        setProdType(p.itemType);
                        setProdCoinPrice(String(p.coinPrice));
                        setProdInrPrice(String(p.inrPrice));
                        setProdStock(String(p.stock));
                        setProdImage(p.imageUrl);
                        setProdActive(p.active);
                      }}
                      className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* COIN APPROVALS, WITHDRAWALS & 6-MONTH GLOBAL LEDGER */}
          {activeTab === 'ledger' && (
            <div className="space-y-6">
              {/* Coin Top-Up Approvals */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                <h2 className="font-display text-base font-bold">Coin Top-Up Verification Queue</h2>
                {coinRequests.filter((r) => r.status === 'pending').length === 0 ? (
                  <p className="text-xs text-slate-500">No pending verified sandbox payment requests.</p>
                ) : (
                  coinRequests
                    .filter((r) => r.status === 'pending')
                    .map((req) => (
                      <div key={req.requestId} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-mono font-semibold">{req.requestId} · Payment {req.paymentId}</p>
                          <p className="text-slate-500">
                            User {req.userId} · INR {req.amountInr} → <strong>{req.coinsRequested} Coins</strong>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Review note..."
                            value={reviewNoteMap[req.requestId] || ''}
                            onChange={(e) => setReviewNoteMap({ ...reviewNoteMap, [req.requestId]: e.target.value })}
                            className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPendingConfirm({
                                title: 'Approve & Credit Coins',
                                description: `Credit ${req.coinsRequested} coins to ${req.userId} for verified sandbox payment ${req.paymentId}?`,
                                onConfirm: async () => {
                                  const w = wallets.find((x) => x.userId === req.userId);
                                  if (isOtpMode) {
                                    await reviewCoinRequestApi(req.requestId, 'approved', reviewNoteMap[req.requestId] || 'Approved');
                                    await loadBackendAdminOverview();
                                  } else if (firebaseUser && w) {
                                    await adminApproveCoinRequest({
                                      adminUser: firebaseUser,
                                      coinRequest: req,
                                      targetWallet: w,
                                      adminNote: reviewNoteMap[req.requestId] || 'Approved',
                                    });
                                  }
                                  pushToast('success', 'Coins Approved', `${req.coinsRequested} coins credited.`);
                                },
                              })
                            }
                            className="px-3 py-1.5 font-semibold text-white bg-emerald-700 rounded-lg cursor-pointer"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isOtpMode) {
                                void reviewCoinRequestApi(req.requestId, 'rejected', reviewNoteMap[req.requestId] || 'Rejected').then(loadBackendAdminOverview);
                              } else if (firebaseUser) {
                                void adminRejectCoinRequest({
                                  adminUser: firebaseUser,
                                  coinRequest: req,
                                  adminNote: reviewNoteMap[req.requestId] || 'Rejected',
                                });
                              }
                            }}
                            className="px-3 py-1.5 font-semibold text-red-700 bg-red-50 rounded-lg cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>

              {/* Simulated Withdrawals Queue Shortcut */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold">
                    Pending &amp; Under Review Withdrawals ({metrics.pendingWithdrawals})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('withdrawals')}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 rounded-lg cursor-pointer"
                  >
                    Open Full Withdrawal Management →
                  </button>
                </div>
                {withdrawals.filter((w) => w.status === 'pending' || w.status === 'under_review').length === 0 ? (
                  <p className="text-xs text-slate-500">No pending or under-review withdrawals.</p>
                ) : (
                  withdrawals
                    .filter((w) => w.status === 'pending' || w.status === 'under_review')
                    .map((wd) => (
                      <div key={wd.withdrawalId} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-mono font-semibold">
                            {wd.withdrawalId} · {wd.amountCoins.toLocaleString()} Coins ({WITHDRAWAL_STATUS_META[wd.status].label})
                          </p>
                          <p className="text-slate-500">{wd.userId} · {wd.payoutChannel}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWdId(wd.withdrawalId);
                            setWdActionReason(wd.adminNote || '');
                            setWdPayoutRef(wd.payoutReferenceNumber || '');
                            setWdProviderConfirmed(Boolean(wd.providerConfirmed));
                            setActiveTab('withdrawals');
                          }}
                          className="px-3 py-1.5 font-semibold text-white bg-blue-700 rounded-lg cursor-pointer"
                        >
                          Manage Request
                        </button>
                      </div>
                    ))
                )}
              </div>

              {/* Global 6-Month Ledger + Payments Refund */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold">Global Ledger ({filteredLedger.length})</h3>
                  <select
                    value={ledgerTypeFilter}
                    onChange={(e) => setLedgerTypeFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                  >
                    <option value="all">All Types</option>
                    <option value="credit">Top-Up Credits</option>
                    <option value="plan_credit">24h Plan Credits</option>
                    <option value="debit">Debits</option>
                    <option value="refund">Refunds</option>
                  </select>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">Tx ID</th>
                        <th className="py-2 pr-4">User</th>
                        <th className="py-2 pr-4">Type</th>
                        <th className="py-2 pr-4">Description</th>
                        <th className="py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredLedger.slice(0, 60).map((entry) => (
                        <tr key={entry.txId}>
                          <td className="py-2 pr-4 font-mono">{entry.txId}</td>
                          <td className="py-2 pr-4 font-mono">{entry.userId}</td>
                          <td className="py-2 pr-4 capitalize">{entry.type}</td>
                          <td className="py-2 pr-4">{entry.description}</td>
                          <td className="py-2 font-mono text-right tabular-nums">{entry.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                <h3 className="font-display text-base font-bold">Sandbox Payments &amp; Refunds</h3>
                {payments.slice(0, 15).map((pay) => (
                  <div key={pay.paymentId} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-mono">{pay.paymentId} · {pay.sandboxUpiId} · {pay.coinsRequested} Coins ({pay.status})</span>
                    {pay.status !== 'refunded' && (
                      <button
                        type="button"
                        onClick={() =>
                          setPendingConfirm({
                            title: 'Refund Sandbox Payment',
                            description: `Mark ${pay.paymentId} refunded and reverse credited coins if applicable?`,
                            variant: 'danger',
                            onConfirm: async () => {
                              const w = wallets.find((x) => x.userId === pay.userId);
                              if (isOtpMode) {
                                await adminRefundPaymentApi(pay.paymentId);
                                await loadBackendAdminOverview();
                              } else if (firebaseUser) {
                                await adminRefundSandboxPayment({ adminUser: firebaseUser, payment: pay, wallet: w });
                              }
                              pushToast('warning', 'Sandbox Payment Refunded');
                            },
                          })
                        }
                        className="px-2.5 py-1 text-red-700 bg-red-50 rounded cursor-pointer"
                      >
                        Refund
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUPPORT DESK & SMART NOTIFICATIONS */}
          {activeTab === 'support' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-base font-bold">Support Tickets ({tickets.length})</h2>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {tickets.map((t) => (
                    <button
                      key={t.ticketId}
                      type="button"
                      onClick={() => setSelectedTicketId(t.ticketId)}
                      className={`w-full p-3 rounded-lg border text-left text-xs cursor-pointer ${
                        selectedTicketId === t.ticketId ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50' : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <p className="font-semibold">{t.subject}</p>
                      <p className="text-slate-500">{t.category} · {t.userEmail || t.userId} · {t.status}</p>
                    </button>
                  ))}
                </div>
                {selectedTicketId && (
                  <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        const t = tickets.find((x) => x.ticketId === selectedTicketId);
                        if (!t) return;
                        void classifySupportTicketApi({ subject: t.subject, description: t.description, category: t.category })
                          .then((res) => setAdminReply(res.triage.draftReply))
                          .catch((e) => pushToast('error', 'AI Helpdesk Error', e instanceof Error ? e.message : 'Failed'));
                      }}
                      className="px-3 py-1 text-xs font-semibold text-blue-700 bg-blue-50 dark:bg-blue-950 rounded cursor-pointer"
                    >
                      Draft Reply with AI Helpdesk
                    </button>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!adminReply.trim()) return;
                        if (isOtpMode) {
                          void replySupportTicketApi(selectedTicketId, adminReply).then(() => {
                            setAdminReply('');
                            void loadBackendAdminOverview();
                          });
                        } else if (firebaseUser) {
                          void postSupportReply({ ticketId: selectedTicketId, sender: firebaseUser, senderRole: 'admin', body: adminReply }).then(() =>
                            setAdminReply('')
                          );
                        }
                      }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={adminReply}
                        onChange={(e) => setAdminReply(e.target.value)}
                        placeholder="Write admin reply..."
                        className="flex-1 px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                      />
                      <button type="submit" className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg cursor-pointer">
                        Send
                      </button>
                    </form>
                  </div>
                )}
              </div>

              <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-bold">Smart Notification Engine &amp; Broadcast</h2>
                  <button
                    type="button"
                    onClick={() =>
                      void draftSmartNotificationApi(notifTopic)
                        .then((r) => {
                          setNotifTitle(r.draft.title);
                          setNotifBody(r.draft.body);
                        })
                        .catch((e) => pushToast('error', 'Smart Notification Error', e instanceof Error ? e.message : 'Failed'))
                    }
                    className="px-3 py-1 text-xs font-semibold text-blue-700 bg-blue-50 dark:bg-blue-950 rounded cursor-pointer"
                  >
                    AI Draft Copy
                  </button>
                </div>
                <input
                  type="text"
                  value={notifTopic}
                  onChange={(e) => setNotifTopic(e.target.value)}
                  placeholder="Notification topic for AI draft..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                />
                <input
                  type="text"
                  value={notifTargetUid}
                  onChange={(e) => setNotifTargetUid(e.target.value)}
                  placeholder="Target UID or ALL"
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                />
                <input
                  type="text"
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  placeholder="Notification Title"
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                />
                <textarea
                  rows={3}
                  value={notifBody}
                  onChange={(e) => setNotifBody(e.target.value)}
                  placeholder="Message body"
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!notifTitle.trim() || !notifBody.trim()) return;
                    void broadcastNotificationApi({ userId: notifTargetUid, title: notifTitle, body: notifBody }).then(() => {
                      setNotifTitle('');
                      setNotifBody('');
                      pushToast('success', 'Notification Dispatched');
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 rounded-lg cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send Notification
                </button>
              </div>
            </div>
          )}

          {/* BRANDING, PLATFORM SETTINGS & SECURITY LOGS */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <form onSubmit={handleSaveBrandSettings} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-base font-bold">Platform Branding, Ticker &amp; Support Contacts</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block mb-1 text-slate-500">Brand Name</label>
                    <input
                      type="text"
                      value={brandForm.brandName}
                      onChange={(e) => setBrandForm({ ...brandForm, brandName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-slate-500">Tagline</label>
                    <input
                      type="text"
                      value={brandForm.tagline}
                      onChange={(e) => setBrandForm({ ...brandForm, tagline: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-slate-500">Accent Color (Hex)</label>
                    <input
                      type="text"
                      value={brandForm.accentColor}
                      onChange={(e) => setBrandForm({ ...brandForm, accentColor: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-slate-500">Logo URL</label>
                    <input
                      type="text"
                      value={brandForm.logoUrl}
                      onChange={(e) => setBrandForm({ ...brandForm, logoUrl: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-slate-500">WhatsApp Number</label>
                    <input
                      type="text"
                      value={brandForm.whatsappNumber}
                      onChange={(e) => setBrandForm({ ...brandForm, whatsappNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-slate-500">Telegram Support URL</label>
                    <input
                      type="text"
                      value={brandForm.telegramUrl}
                      onChange={(e) => setBrandForm({ ...brandForm, telegramUrl: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-xs pt-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={brandForm.tickerEnabled}
                      onChange={(e) => setBrandForm({ ...brandForm, tickerEnabled: e.target.checked })}
                    />
                    Enable Real Transaction Activity Ticker on Landing
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={brandForm.withdrawalsEnabled}
                      onChange={(e) => setBrandForm({ ...brandForm, withdrawalsEnabled: e.target.checked })}
                    />
                    Enable Simulated Withdrawals
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={brandForm.referralsEnabled}
                      onChange={(e) => setBrandForm({ ...brandForm, referralsEnabled: e.target.checked })}
                    />
                    Enable Simulated Referrals
                  </label>
                </div>

                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg cursor-pointer">
                  Save Branding &amp; Platform Settings
                </button>
              </form>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                <h3 className="font-display text-base font-bold">Audit &amp; Security Logs ({securityLogs.length})</h3>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {securityLogs.slice(0, 40).map((log) => (
                    <div key={log.logId} className="py-2 flex items-center justify-between gap-4">
                      <div>
                        <span className="font-mono font-semibold">{log.action}</span>
                        <span className="mx-2 text-slate-400">·</span>
                        <span>{log.details}</span>
                      </div>
                      <span className="font-mono text-[11px] uppercase text-slate-500 shrink-0">{log.severity}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Plan Override Modal */}
      {overrideTarget && (
        <div className="fixed inset-0 z-[65] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-base font-bold">Manual Plan Override ({overrideTarget.purchaseId})</h3>
            <div className="space-y-3 text-xs">
              <select
                value={overrideAction}
                onChange={(e) => setOverrideAction(e.target.value as 'extend' | 'cancel' | 'complete_now')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
              >
                <option value="extend">Extend Plan Duration (Add 24h cycles)</option>
                <option value="complete_now">Set Due Events Now &amp; Execute 24h Scheduler</option>
                <option value="cancel">Cancel Remaining Pending Schedule</option>
              </select>
              {overrideAction === 'extend' && (
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={overrideDays}
                  onChange={(e) => setOverrideDays(e.target.value)}
                  placeholder="Extra days"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                />
              )}
              <textarea
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Mandatory audit reason (min 4 chars)..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOverrideTarget(null)} className="px-3.5 py-2 text-xs bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer">
                Cancel
              </button>
              <button
                type="button"
                disabled={overrideReason.trim().length < 4}
                onClick={() =>
                  void overridePlanPurchaseApi({
                    purchaseId: overrideTarget.purchaseId,
                    action: overrideAction,
                    extraDays: Number(overrideDays) || 1,
                    reason: overrideReason,
                  }).then(() => {
                    setOverrideTarget(null);
                    pushToast('success', 'Plan Override Executed');
                    void loadBackendAdminOverview();
                  })
                }
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-700 rounded-lg disabled:opacity-40 cursor-pointer"
              >
                Confirm Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal Management Modal */}
      {selectedWithdrawal && (
        <div className="fixed inset-0 z-[65] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-display text-base font-bold">Manage Withdrawal Request</h3>
                <p className="font-mono text-xs text-slate-500">{selectedWithdrawal.withdrawalId}</p>
              </div>
              <span className={`text-xs font-bold ${WITHDRAWAL_STATUS_META[selectedWithdrawal.status].colorClass}`}>
                {WITHDRAWAL_STATUS_META[selectedWithdrawal.status].label}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-xs">
              <div>
                <p className="text-slate-500">User</p>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {selectedWithdrawal.userName || selectedWithdrawal.userEmail || 'Member'}
                </p>
                <p className="font-mono text-[11px] text-slate-500 break-all">{selectedWithdrawal.userId}</p>
              </div>
              <div>
                <p className="text-slate-500">Requested Amount</p>
                <p className="font-mono text-sm font-bold tabular-nums">
                  {selectedWithdrawal.amountCoins.toLocaleString()} Coins
                </p>
                <p className="text-[11px] text-slate-500">INR {selectedWithdrawal.equivalentInr.toLocaleString()}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-500">Payment Details (Authorized Admin Only)</p>
                <p className="font-semibold">
                  {selectedWithdrawal.payoutChannel} · <span className="font-mono">{selectedWithdrawal.accountLabel}</span>
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                  Admin Review Note / Reason (Required for Rejection or Failure)
                </label>
                <textarea
                  rows={2}
                  value={wdActionReason}
                  onChange={(e) => setWdActionReason(e.target.value)}
                  placeholder="Enter approval note, review update, or mandatory rejection/failure reason..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                  Payout Reference Number (Required for Successful Status)
                </label>
                <input
                  type="text"
                  value={wdPayoutRef}
                  onChange={(e) => setWdPayoutRef(e.target.value)}
                  placeholder="e.g. UTR_20261121_99812 (min 4 chars)"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                />
              </div>

              <label className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wdProviderConfirmed}
                  onChange={(e) => setWdProviderConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                  <strong>Provider Settlement Confirmation:</strong> I confirm the authorized payout provider has
                  completed settlement and the Payout Reference Number above is verified.
                </span>
              </label>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Transition Withdrawal Status</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {(
                  [
                    { st: 'under_review', label: 'Under Review', cls: 'bg-sky-700 hover:bg-sky-800 text-white' },
                    { st: 'approved', label: 'Approve', cls: 'bg-indigo-700 hover:bg-indigo-800 text-white' },
                    { st: 'processing', label: 'Processing', cls: 'bg-blue-700 hover:bg-blue-800 text-white' },
                    { st: 'rejected', label: 'Reject', cls: 'bg-red-700 hover:bg-red-800 text-white' },
                    { st: 'failed', label: 'Mark Failed', cls: 'bg-rose-700 hover:bg-rose-800 text-white' },
                    { st: 'successful', label: 'Mark Successful', cls: 'bg-emerald-700 hover:bg-emerald-800 text-white' },
                  ] as Array<{ st: WithdrawalStatus; label: string; cls: string }>
                ).map((btn) => {
                  const needsReason = (btn.st === 'rejected' || btn.st === 'failed') && wdActionReason.trim().length < 3;
                  const needsProvider =
                    btn.st === 'successful' && (!wdProviderConfirmed || wdPayoutRef.trim().length < 4);
                  const disabled = needsReason || needsProvider;
                  return (
                    <button
                      key={btn.st}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        const wdTarget = selectedWithdrawal;
                        const targetStatus = btn.st;
                        const reason = wdActionReason.trim();
                        const refNum = wdPayoutRef.trim();
                        const confirmed = wdProviderConfirmed;
                        setPendingConfirm({
                          title: `Confirm Withdrawal: ${WITHDRAWAL_STATUS_META[targetStatus].label}`,
                          description: `Transition withdrawal ${wdTarget.withdrawalId} (${wdTarget.amountCoins.toLocaleString()} coins for ${
                            wdTarget.userName || wdTarget.userId
                          }) from ${WITHDRAWAL_STATUS_META[wdTarget.status].label} to ${
                            WITHDRAWAL_STATUS_META[targetStatus].label
                          }?${refNum ? ` Payout Ref: ${refNum}.` : ''}${reason ? ` Reason: "${reason}".` : ''}`,
                          variant: targetStatus === 'rejected' || targetStatus === 'failed' ? 'danger' : 'primary',
                          onConfirm: async () => {
                            if (isOtpMode) {
                              await adminUpdateWithdrawalStatusApi(wdTarget.withdrawalId, {
                                status: targetStatus,
                                reason,
                                payoutReferenceNumber: refNum,
                                providerConfirmed: confirmed,
                              });
                              await loadBackendAdminOverview();
                            } else if (firebaseUser) {
                              await adminUpdateWithdrawalStatusFirestore({
                                adminUser: firebaseUser,
                                withdrawal: wdTarget,
                                status: targetStatus,
                                reason,
                                payoutReferenceNumber: refNum,
                                providerConfirmed: confirmed,
                              });
                            }
                            setSelectedWdId(null);
                            pushToast(
                              'success',
                              `Withdrawal ${WITHDRAWAL_STATUS_META[targetStatus].label}`,
                              `Request ${wdTarget.withdrawalId} updated.`
                            );
                          },
                        });
                      }}
                      className={`px-3 py-2 font-semibold rounded-lg disabled:opacity-40 cursor-pointer ${btn.cls}`}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedWdId(null)}
                  className="px-4 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generic Sensitive Action Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title || ''}
        description={pendingConfirm?.description || ''}
        variant={pendingConfirm?.variant || 'primary'}
        busy={confirmBusy}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={async () => {
          if (!pendingConfirm) return;
          setConfirmBusy(true);
          try {
            await pendingConfirm.onConfirm();
            setPendingConfirm(null);
          } catch (err) {
            pushToast('error', 'Action Failed', err instanceof Error ? err.message : 'Operation rejected.');
          } finally {
            setConfirmBusy(false);
          }
        }}
      />
    </div>
  );
};
