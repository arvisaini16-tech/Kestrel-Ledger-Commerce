import React, { useEffect, useMemo, useState } from 'react';
import { type User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Bot,
  CalendarClock,
  CheckCircle2,
  Coins,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  HelpCircle,
  History,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MessageSquare,
  Mic,
  MicOff,
  Moon,
  Package,
  QrCode,
  RefreshCw,
  Send,
  Settings,
  ShoppingBag,
  Sparkles,
  Sun,
  Upload,
  Users,
  Volume2,
  Wallet as WalletIcon,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  createSupportTicketApi,
  createV1PaymentIntentApi,
  fetchSmartSuggestionsApi,
  fetchUserWorkspaceStateApi,
  markNotificationReadApi,
  purchasePlanApi,
  purchaseProductOrderApi,
  querySmartAssistantApi,
  replySupportTicketApi,
  submitWithdrawalApi,
  triggerV1PaymentWebhookApi,
  updateUserProfileApi,
} from '../lib/api';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import {
  createSupportTicketWithMessage,
  executeAtomicProductPurchase,
  initiateSandboxUpiPayment,
  postSupportReply,
  purchasePlanWithSnapshot,
  simulateSandboxWebhook,
  submitSimulatedWithdrawalRequest,
  updateUserProfileFields,
} from '../lib/firestoreService';
import {
  DEFAULT_ADMIN_SETTINGS,
  DEFAULT_AI_FEATURE_SETTINGS,
  DEFAULT_GATEWAY_CONFIG,
  INITIAL_CATALOG_SEED,
  INITIAL_COIN_PACKAGES,
  INITIAL_PLAN_CONFIGS,
  computeDailyScheduleAmounts,
} from '../lib/seedData';
import {
  AdminSettings,
  AiFeatureSettings,
  AuthSessionUser,
  CoinPackage,
  CoinRequest,
  GatewayConfig,
  NotificationItem,
  Order,
  PlanConfig,
  PlanCreditScheduleEvent,
  PlanPurchase,
  Product,
  ReferralRecord,
  SUPPORT_CATEGORIES,
  SandboxPayment,
  SupportCategory,
  SupportTicket,
  TicketMessage,
  UpiAppOption,
  UserProfile,
  Wallet,
  WalletLedgerEntry,
  WithdrawalRequest,
  WithdrawalStatus,
  formatTimestamp,
  makeSafeId,
  toMillis,
} from '../types/platform';
import { BrandLogo } from './BrandLogo';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './ToastContext';

export type UserTab =
  | 'dashboard'
  | 'wallet'
  | 'history'
  | 'catalog'
  | 'orders'
  | 'withdrawals'
  | 'ai'
  | 'support'
  | 'notifications'
  | 'settings';

interface UserWorkspaceProps {
  firebaseUser: User | null;
  otpSession: AuthSessionUser | null;
  profile: UserProfile | null;
  wallet: Wallet | null;
  products: Product[];
  coinPackages: CoinPackage[];
  plans: PlanConfig[];
  gatewayConfig: GatewayConfig | null;
  adminSettings: AdminSettings | null;
  aiFeatureSettings: AiFeatureSettings | null;
  isAdmin: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  initialTab?: UserTab;
  onBackToStorefront: () => void;
  onOpenAdmin: () => void;
  onSignOut: () => void;
}

const UPI_APPS: UpiAppOption[] = [
  'GPay Sandbox',
  'PhonePe Sandbox',
  'Paytm Sandbox',
  'BHIM Sandbox',
  'QR Sandbox',
];

const USER_WITHDRAWAL_STATUS_META: Record<WithdrawalStatus, { label: string; colorClass: string }> = {
  pending: { label: 'Pending', colorClass: 'text-amber-700 dark:text-amber-400' },
  under_review: { label: 'Under Review', colorClass: 'text-sky-700 dark:text-sky-400' },
  approved: { label: 'Approved', colorClass: 'text-indigo-700 dark:text-indigo-400' },
  processing: { label: 'Processing', colorClass: 'text-blue-700 dark:text-blue-400' },
  successful: { label: 'Successful', colorClass: 'text-emerald-700 dark:text-emerald-400' },
  rejected: { label: 'Rejected', colorClass: 'text-red-700 dark:text-red-400' },
  failed: { label: 'Failed', colorClass: 'text-rose-700 dark:text-rose-400' },
};

export const UserWorkspace: React.FC<UserWorkspaceProps> = ({
  firebaseUser,
  otpSession,
  profile: propProfile,
  wallet: propWallet,
  products: propProducts,
  coinPackages: propCoinPackages,
  plans: propPlans,
  gatewayConfig: propGatewayConfig,
  adminSettings: propAdminSettings,
  aiFeatureSettings: propAiSettings,
  isAdmin,
  theme,
  onToggleTheme,
  initialTab = 'dashboard',
  onBackToStorefront,
  onOpenAdmin,
  onSignOut,
}) => {
  const { pushToast } = useToast();
  const isOtpMode = !firebaseUser && Boolean(otpSession);
  const currentUid = firebaseUser?.uid || otpSession?.uid || '';
  const currentEmail = firebaseUser?.email || otpSession?.email || otpSession?.phone || '';
  const currentName = propProfile?.displayName || firebaseUser?.displayName || otpSession?.displayName || 'Member';

  const [activeTab, setActiveTab] = useState<UserTab>(initialTab);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // State hydrated from Firestore OR shared /api/v1/user/state
  const [otpProfile, setOtpProfile] = useState<UserProfile | null>(null);
  const [otpWallet, setOtpWallet] = useState<Wallet | null>(null);
  const [otpPackages, setOtpPackages] = useState<CoinPackage[]>([]);
  const [otpPlans, setOtpPlans] = useState<PlanConfig[]>([]);
  const [otpProducts, setOtpProducts] = useState<Product[]>([]);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [planPurchases, setPlanPurchases] = useState<PlanPurchase[]>([]);
  const [planSchedules, setPlanSchedules] = useState<PlanCreditScheduleEvent[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<SandboxPayment[]>([]);
  const [coinRequests, setCoinRequests] = useState<CoinRequest[]>([]);
  const [otpWithdrawals, setOtpWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [fbReqWithdrawals, setFbReqWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [fbLegacyWithdrawals, setFbLegacyWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Wallet & Random UPI Sandbox state
  const [selectedPackageId, setSelectedPackageId] = useState<string>('pkg_500');
  const [customAmountInr, setCustomAmountInr] = useState<string>('500');
  const [selectedUpiApp, setSelectedUpiApp] = useState<UpiAppOption>('QR Sandbox');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => makeSafeId('idem'));
  const [activePaymentIntent, setActivePaymentIntent] = useState<{
    payment: SandboxPayment;
    upiUri: string;
    assignedLabel?: string;
  } | null>(null);

  // 6-Month Transaction History Filters
  const [txWindow, setTxWindow] = useState<'6m' | '30d' | '7d'>('6m');
  const [txTypeFilter, setTxTypeFilter] = useState<string>('all');
  const [txSearch, setTxSearch] = useState('');
  const [txPage, setTxPage] = useState(1);

  // Catalogue & Plans state
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogFilter, setCatalogFilter] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [confirmPlanTarget, setConfirmPlanTarget] = useState<PlanConfig | null>(null);

  // Withdrawal state
  const [wdAmountCoins, setWdAmountCoins] = useState('250');
  const [wdChannel, setWdChannel] = useState<'Simulated Bank Transfer' | 'Simulated UPI Sandbox'>('Simulated UPI Sandbox');
  const [wdAccountLabel, setWdAccountLabel] = useState('Sandbox Account **** 4021');

  // Support & Consent dialog state
  const [ticketCategory, setTicketCategory] = useState<SupportCategory>('Payment problem');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentDataUrl, setAttachmentDataUrl] = useState('');
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
  const [allOtpMessages, setAllOtpMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [consentChannel, setConsentChannel] = useState<'whatsapp' | 'telegram' | null>(null);

  // AI Smart Assistant + Voice + Multilingual state
  const [aiLang, setAiLang] = useState<'en' | 'hi'>('en');
  const [aiInput, setAiInput] = useState('');
  const [aiChat, setAiChat] = useState<Array<{ role: 'user' | 'assistant'; text: string; spoken?: string }>>([]);
  const [aiFollowUps, setAiFollowUps] = useState<string[]>([
    'How does the 24-hour plan credit work?',
    'Which plan fits my current coin balance?',
    'Explain sandbox UPI verification.',
  ]);
  const [smartSuggestions, setSmartSuggestions] = useState<Array<{ title: string; reason: string; actionTab: string }>>([]);
  const [listeningVoice, setListeningVoice] = useState(false);

  // Settings state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [copiedUid, setCopiedUid] = useState(false);

  const profile = isOtpMode ? otpProfile : propProfile;
  const wallet = isOtpMode ? otpWallet : propWallet;
  const displayPublicUserId = profile?.publicUserId || otpSession?.publicUserId || 'Assigning ID...';
  const copyableUserId = profile?.publicUserId || otpSession?.publicUserId || currentUid;
  const effectiveConfig: GatewayConfig = propGatewayConfig || { ...DEFAULT_GATEWAY_CONFIG, updatedAt: '' };
  const brand: AdminSettings = propAdminSettings || { ...DEFAULT_ADMIN_SETTINGS, updatedAt: '' };
  const aiFlags: AiFeatureSettings = propAiSettings || { ...DEFAULT_AI_FEATURE_SETTINGS, updatedAt: '' };

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (profile) {
      setEditName(profile.displayName);
      setEditPhone(profile.phone);
    }
  }, [profile]);

  const loadOtpState = async () => {
    try {
      const data = await fetchUserWorkspaceStateApi();
      setOtpProfile(data.profile);
      setOtpWallet(data.wallet);
      setOtpPackages(data.coinPackages);
      setOtpPlans(data.plans);
      setOtpProducts(data.products);
      setLedger(data.ledger);
      setPlanPurchases(data.planPurchases);
      setPlanSchedules(data.planCreditSchedules);
      setOrders(data.orders);
      setPayments(data.payments);
      setCoinRequests(data.coinRequests);
      setOtpWithdrawals(data.withdrawals);
      setTickets(data.tickets);
      setAllOtpMessages(data.ticketMessages);
      setNotifications(data.notifications);
    } catch (err) {
      pushToast('error', 'Workspace Sync Error', err instanceof Error ? err.message : 'Unable to sync state.');
    } finally {
      setLoadingInitial(false);
    }
  };

  useEffect(() => {
    if (!currentUid) return;
    if (isOtpMode) {
      void loadOtpState();
      const timer = setInterval(() => void loadOtpState(), 30_000);
      return () => clearInterval(timer);
    }

    const unsubs = [
      onSnapshot(
        query(collection(db, 'wallet_ledger'), where('userId', '==', currentUid), orderBy('createdAt', 'desc')),
        (snap) => setLedger(snap.docs.map((d) => d.data() as WalletLedgerEntry)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'wallet_ledger')
      ),
      onSnapshot(
        query(collection(db, 'planPurchases'), where('userId', '==', currentUid), orderBy('createdAt', 'desc')),
        (snap) => setPlanPurchases(snap.docs.map((d) => d.data() as PlanPurchase)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'planPurchases')
      ),
      onSnapshot(
        query(collection(db, 'planCreditSchedules'), where('userId', '==', currentUid)),
        (snap) => setPlanSchedules(snap.docs.map((d) => d.data() as PlanCreditScheduleEvent)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'planCreditSchedules')
      ),
      onSnapshot(
        query(collection(db, 'orders'), where('userId', '==', currentUid), orderBy('createdAt', 'desc')),
        (snap) => setOrders(snap.docs.map((d) => d.data() as Order)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
      ),
      onSnapshot(
        query(collection(db, 'payments'), where('userId', '==', currentUid), orderBy('createdAt', 'desc')),
        (snap) => setPayments(snap.docs.map((d) => d.data() as SandboxPayment)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
      ),
      onSnapshot(
        query(collection(db, 'coin_requests'), where('userId', '==', currentUid), orderBy('createdAt', 'desc')),
        (snap) => setCoinRequests(snap.docs.map((d) => d.data() as CoinRequest)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'coin_requests')
      ),
      onSnapshot(
        query(collection(db, 'withdrawalRequests'), where('userId', '==', currentUid)),
        (snap) => setFbReqWithdrawals(snap.docs.map((d) => d.data() as WithdrawalRequest)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawalRequests')
      ),
      onSnapshot(
        query(collection(db, 'withdrawals'), where('userId', '==', currentUid)),
        (snap) => setFbLegacyWithdrawals(snap.docs.map((d) => d.data() as WithdrawalRequest)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals')
      ),
      onSnapshot(
        query(collection(db, 'referrals'), where('referrerId', '==', currentUid), orderBy('createdAt', 'desc')),
        (snap) => setReferrals(snap.docs.map((d) => d.data() as ReferralRecord)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'referrals')
      ),
      onSnapshot(
        query(collection(db, 'support_tickets'), where('userId', '==', currentUid), orderBy('createdAt', 'desc')),
        (snap) => setTickets(snap.docs.map((d) => d.data() as SupportTicket)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'support_tickets')
      ),
      onSnapshot(
        query(collection(db, 'notifications'), where('userId', '==', currentUid), orderBy('createdAt', 'desc')),
        (snap) => setNotifications(snap.docs.map((d) => d.data() as NotificationItem)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
      ),
    ];

    setLoadingInitial(false);
    return () => unsubs.forEach((u) => u());
  }, [currentUid, isOtpMode]);

  useEffect(() => {
    if (!activeTicketId) {
      setTicketMessages([]);
      return;
    }
    if (isOtpMode) {
      setTicketMessages(allOtpMessages.filter((m) => m.ticketId === activeTicketId));
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'support_tickets', activeTicketId, 'messages'), orderBy('createdAt', 'asc')),
      (snap) => setTicketMessages(snap.docs.map((d) => d.data() as TicketMessage)),
      (err) => handleFirestoreError(err, OperationType.LIST, `support_tickets/${activeTicketId}/messages`)
    );
    return () => unsub();
  }, [activeTicketId, isOtpMode, allOtpMessages]);

  const activeCoinPackages = useMemo(() => {
    const src = isOtpMode ? otpPackages : propCoinPackages;
    if (src.length > 0) return src.filter((c) => c.status === 'active').sort((a, b) => a.displayOrder - b.displayOrder);
    return INITIAL_COIN_PACKAGES as CoinPackage[];
  }, [isOtpMode, otpPackages, propCoinPackages]);

  const activePlans = useMemo(() => {
    const src = isOtpMode ? otpPlans : propPlans;
    if (src.length > 0) return src.filter((p) => p.status === 'active').sort((a, b) => a.displayOrder - b.displayOrder);
    return INITIAL_PLAN_CONFIGS as PlanConfig[];
  }, [isOtpMode, otpPlans, propPlans]);

  const visibleCatalog = useMemo(() => {
    const base = (isOtpMode ? otpProducts : propProducts.length > 0 ? propProducts : INITIAL_CATALOG_SEED) as Product[];
    return base.filter((p) => {
      if (!p.active) return false;
      const matchesCat = catalogFilter === 'All' || p.category === catalogFilter;
      const matchesSearch =
        !catalogSearch.trim() ||
        p.title.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        p.description.toLowerCase().includes(catalogSearch.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [isOtpMode, otpProducts, propProducts, catalogFilter, catalogSearch]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const pendingCoinTotal = useMemo(
    () => coinRequests.filter((r) => r.status === 'pending').reduce((sum, r) => sum + r.coinsRequested, 0),
    [coinRequests]
  );

  const activePlan = useMemo(
    () => planPurchases.find((p) => p.status === 'active') || planPurchases[0] || null,
    [planPurchases]
  );

  const activePlanRemainingDays = useMemo(() => {
    if (!activePlan || activePlan.status !== 'active') return 0;
    const msLeft = Math.max(0, Date.parse(activePlan.completesAtIso) - Date.now());
    return Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  }, [activePlan]);

  const withdrawals = useMemo<WithdrawalRequest[]>(() => {
    if (isOtpMode) {
      return [...otpWithdrawals].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    }
    const map = new Map<string, WithdrawalRequest>();
    fbLegacyWithdrawals.forEach((w) => map.set(w.withdrawalId, w));
    fbReqWithdrawals.forEach((w) => map.set(w.withdrawalId, w));
    return Array.from(map.values()).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }, [isOtpMode, otpWithdrawals, fbReqWithdrawals, fbLegacyWithdrawals]);

  const withdrawalSummary = useMemo(() => {
    const minCoins = effectiveConfig.minWithdrawalCoins;
    const availCoins = wallet?.availableCoins ?? 0;
    const isEligible = Boolean(brand.withdrawalsEnabled && availCoins >= minCoins);
    const activeStatuses: WithdrawalStatus[] = ['pending', 'under_review', 'approved', 'processing'];
    const activeList = withdrawals.filter((w) => activeStatuses.includes(w.status));
    const totalPendingCoins = activeList.reduce((sum, w) => sum + w.amountCoins, 0);
    const latest = withdrawals[0] || null;
    return {
      minCoins,
      availCoins,
      isEligible,
      activeList,
      totalPendingCoins,
      latest,
    };
  }, [brand.withdrawalsEnabled, effectiveConfig.minWithdrawalCoins, wallet?.availableCoins, withdrawals]);

  // 6-Month Filterable Transaction History
  const filteredLedger = useMemo(() => {
    const now = Date.now();
    const cutoff =
      txWindow === '7d'
        ? now - 7 * 24 * 60 * 60 * 1000
        : txWindow === '30d'
        ? now - 30 * 24 * 60 * 60 * 1000
        : now - 183 * 24 * 60 * 60 * 1000;
    return ledger.filter((entry) => {
      if (toMillis(entry.createdAt) < cutoff) return false;
      if (txTypeFilter !== 'all' && entry.type !== txTypeFilter) return false;
      if (
        txSearch.trim() &&
        !entry.description.toLowerCase().includes(txSearch.toLowerCase()) &&
        !entry.txId.toLowerCase().includes(txSearch.toLowerCase()) &&
        !entry.referenceId.toLowerCase().includes(txSearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [ledger, txWindow, txTypeFilter, txSearch]);

  const txPageSize = 10;
  const totalTxPages = Math.max(1, Math.ceil(filteredLedger.length / txPageSize));
  const pagedLedger = filteredLedger.slice((txPage - 1) * txPageSize, txPage * txPageSize);

  const handleSelectPackage = (pkg: CoinPackage) => {
    setSelectedPackageId(pkg.packageId);
    setCustomAmountInr(String(pkg.purchasePrice));
  };

  const handleCreateSandboxIntent = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(customAmountInr);
    if (!Number.isFinite(amountNum) || amountNum < 10) {
      pushToast('error', 'Invalid Amount', 'Enter at least INR 10.');
      return;
    }
    setBusyAction('upi-intent');
    try {
      if (isOtpMode) {
        const res = await createV1PaymentIntentApi({
          packageId: selectedPackageId || undefined,
          amountInr: amountNum,
          upiApp: selectedUpiApp,
          idempotencyKey,
        });
        setActivePaymentIntent({
          payment: res.payment,
          upiUri: res.upiUri,
          assignedLabel: `${res.assignedConfig.label} (${res.assignedConfig.upiId})`,
        });
        pushToast('success', 'Random Sandbox UPI Desk Assigned', `Assigned ${res.assignedConfig.upiId} for payment ${res.payment.paymentId}.`);
        await loadOtpState();
      } else if (firebaseUser) {
        const intent = await initiateSandboxUpiPayment({
          user: firebaseUser,
          amountInr: amountNum,
          upiApp: selectedUpiApp,
          config: effectiveConfig,
          idempotencyKey,
        });
        const paymentObj: SandboxPayment = {
          paymentId: intent.paymentId,
          userId: firebaseUser.uid,
          userEmail: firebaseUser.email || '',
          idempotencyKey,
          amountInr: amountNum,
          coinsRequested: intent.coinsRequested,
          upiApp: selectedUpiApp,
          assignedConfigId: intent.assignedConfigId,
          sandboxUpiId: intent.sandboxVpa,
          gatewayProvider: intent.gatewayProvider || effectiveConfig.providerName,
          status: 'initiated',
          webhookEventId: '',
          serverSignature: intent.serverSignature,
          failureReason: '',
          isSimulated: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setActivePaymentIntent({
          payment: paymentObj,
          upiUri: intent.upiUri,
          assignedLabel: `${intent.merchantName || effectiveConfig.merchantName} (${intent.sandboxVpa})`,
        });
        pushToast('success', 'Random Sandbox UPI Assigned', `Assigned VPA ${intent.sandboxVpa} to ${intent.paymentId}.`);
      }
    } catch (err) {
      pushToast('error', 'Payment Intent Failed', err instanceof Error ? err.message : 'Unable to initiate sandbox UPI.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSimulateWebhook = async (outcome: 'success' | 'failed') => {
    if (!activePaymentIntent) return;
    setBusyAction(`webhook-${outcome}`);
    try {
      if (isOtpMode) {
        const res = await triggerV1PaymentWebhookApi({
          paymentId: activePaymentIntent.payment.paymentId,
          outcome,
        });
        setActivePaymentIntent(null);
        setIdempotencyKey(makeSafeId('idem'));
        await loadOtpState();
        if (res.payment.status === 'webhook_verified') {
          pushToast('success', 'Webhook Verified', `Coin request ${res.coinRequest?.requestId} queued for Admin credit approval.`);
        } else {
          pushToast('warning', 'Sandbox Decline Recorded', res.payment.failureReason);
        }
      } else if (firebaseUser) {
        const res = await simulateSandboxWebhook({
          user: firebaseUser,
          payment: activePaymentIntent.payment,
          outcome,
        });
        setActivePaymentIntent(null);
        setIdempotencyKey(makeSafeId('idem'));
        if (res.status === 'webhook_verified') {
          pushToast('success', 'Webhook Verified', `Coin request ${res.requestId} queued for Admin approval.`);
        } else {
          pushToast('warning', 'Sandbox Failure Recorded', res.failureReason);
        }
      }
    } catch (err) {
      pushToast('error', 'Webhook Error', err instanceof Error ? err.message : 'Simulation failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmPlanPurchase = async () => {
    if (!confirmPlanTarget || !wallet) return;
    setBusyAction('plan-purchase');
    try {
      if (isOtpMode) {
        const res = await purchasePlanApi(confirmPlanTarget.planId);
        await loadOtpState();
        pushToast('success', 'Plan Activated', `${confirmPlanTarget.name} active (${res.schedules.length} x 24h credits scheduled).`);
      } else if (firebaseUser) {
        const res = await purchasePlanWithSnapshot({
          user: firebaseUser,
          wallet,
          plan: confirmPlanTarget,
        });
        pushToast('success', 'Plan Activated', `Purchase ${res.purchaseId} confirmed. 24-hour credit schedule locked.`);
      }
      setConfirmPlanTarget(null);
    } catch (err) {
      pushToast('error', 'Plan Activation Failed', err instanceof Error ? err.message : 'Unable to activate plan.');
    } finally {
      setBusyAction(null);
    }
  };

  const handlePurchaseProduct = async () => {
    if (!selectedProduct || !wallet) return;
    setBusyAction('purchase');
    try {
      if (isOtpMode) {
        const res = await purchaseProductOrderApi(selectedProduct.productId, purchaseQty);
        await loadOtpState();
        pushToast('success', 'Order Confirmed', `Order ${res.order.orderId} recorded.`);
      } else if (firebaseUser) {
        const res = await executeAtomicProductPurchase({
          user: firebaseUser,
          wallet,
          product: selectedProduct,
          quantity: purchaseQty,
        });
        pushToast('success', 'Order Confirmed', `Order ${res.orderId} confirmed (${res.txId}).`);
      }
      setSelectedProduct(null);
      setPurchaseQty(1);
    } catch (err) {
      pushToast('error', 'Purchase Failed', err instanceof Error ? err.message : 'Order error.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSubmitWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand.withdrawalsEnabled) {
      pushToast('warning', 'Withdrawals Paused', 'Simulated withdrawals are currently paused by admin settings.');
      return;
    }
    const amount = Number(wdAmountCoins);
    if (!Number.isFinite(amount) || amount < effectiveConfig.minWithdrawalCoins || amount > (wallet?.availableCoins || 0)) {
      pushToast('error', 'Invalid Amount', `Must be between ${effectiveConfig.minWithdrawalCoins} and your available balance.`);
      return;
    }
    setBusyAction('withdrawal');
    try {
      if (isOtpMode) {
        const res = await submitWithdrawalApi({
          amountCoins: amount,
          payoutChannel: wdChannel,
          accountLabel: wdAccountLabel,
        });
        await loadOtpState();
        pushToast('success', 'Simulated Withdrawal Submitted', `Ref ${res.withdrawal.withdrawalId} queued.`);
      } else if (firebaseUser) {
        const id = await submitSimulatedWithdrawalRequest({
          user: firebaseUser,
          amountCoins: amount,
          coinRateInr: effectiveConfig.coinRateInr,
          payoutChannel: wdChannel,
          accountLabel: wdAccountLabel,
        });
        pushToast('success', 'Simulated Withdrawal Submitted', `Request ${id} queued for Admin review.`);
      }
    } catch (err) {
      pushToast('error', 'Withdrawal Failed', err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportHistoryCsv = () => {
    if (filteredLedger.length === 0) {
      pushToast('info', 'No Rows', 'No ledger entries match the current 6-month filters.');
      return;
    }
    const headers = ['txId', 'type', 'amount', 'balanceAfter', 'referenceId', 'description', 'status', 'timestamp'];
    const lines = [
      headers.join(','),
      ...filteredLedger.map((r) =>
        [
          r.txId,
          r.type,
          r.amount,
          r.balanceAfter,
          r.referenceId,
          `"${r.description.replace(/"/g, '""')}"`,
          r.status,
          `"${formatTimestamp(r.createdAt)}"`,
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kestrel_history_${currentUid.slice(0, 8)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleAskSmartAssistant = async (overrideMsg?: string, viaVoice = false) => {
    const prompt = (overrideMsg ?? aiInput).trim();
    if (!prompt) return;
    setAiChat((prev) => [...prev, { role: 'user', text: prompt }]);
    if (!overrideMsg) setAiInput('');
    setBusyAction('ai-chat');
    try {
      const res = await querySmartAssistantApi({
        message: prompt,
        language: aiLang,
        isVoice: viaVoice,
        contextSummary: {
          availableCoins: wallet?.availableCoins || 0,
          activePlanName: activePlan?.planName || 'None',
        },
      });
      setAiChat((prev) => [
        ...prev,
        { role: 'assistant', text: res.result.reply, spoken: res.result.spokenSummary },
      ]);
      if (res.result.suggestedFollowUps?.length) {
        setAiFollowUps(res.result.suggestedFollowUps.slice(0, 4));
      }
      if (viaVoice && aiFlags.aiVoiceAssistant && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(res.result.spokenSummary || res.result.reply);
        utter.lang = aiLang === 'hi' ? 'hi-IN' : 'en-US';
        window.speechSynthesis.speak(utter);
      }
    } catch (err) {
      pushToast('error', 'AI Assistant Unavailable', err instanceof Error ? err.message : 'Unable to reach AI.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleLoadSmartSuggestions = async () => {
    setBusyAction('ai-suggest');
    try {
      const res = await fetchSmartSuggestionsApi(aiLang);
      setSmartSuggestions(res.result.suggestions || []);
    } catch (err) {
      pushToast('error', 'Smart Suggestions Disabled', err instanceof Error ? err.message : 'Unavailable.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleVoiceCapture = () => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      pushToast('warning', 'Voice Input Unsupported', 'This browser does not expose Web SpeechRecognition.');
      return;
    }

    const recognition = new SpeechRec() as {
      lang: string;
      interimResults: boolean;
      onstart: () => void;
      onend: () => void;
      onerror: () => void;
      onresult: (ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      start: () => void;
    };
    recognition.lang = aiLang === 'hi' ? 'hi-IN' : 'en-US';
    recognition.interimResults = false;
    recognition.onstart = () => setListeningVoice(true);
    recognition.onend = () => setListeningVoice(false);
    recognition.onerror = () => setListeningVoice(false);
    recognition.onresult = (ev) => {
      const transcript = ev.results?.[0]?.[0]?.transcript || '';
      if (transcript.trim()) {
        void handleAskSmartAssistant(transcript.trim(), true);
      }
    };
    recognition.start();
  };

  const handleSpeakText = (text: string) => {
    if (!aiFlags.aiVoiceAssistant || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = aiLang === 'hi' ? 'hi-IN' : 'en-US';
    window.speechSynthesis.speak(utter);
  };

  const handleFileAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 150000) {
      pushToast('error', 'File Too Large', 'Attachment must be under 150 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentName(file.name);
      setAttachmentDataUrl(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsDataURL(file);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ticketSubject.trim().length < 3 || ticketDescription.trim().length < 5) {
      pushToast('error', 'Incomplete Ticket', 'Provide a subject and description.');
      return;
    }
    setBusyAction('ticket');
    try {
      if (isOtpMode) {
        const res = await createSupportTicketApi({
          category: ticketCategory,
          subject: ticketSubject,
          description: ticketDescription,
          attachmentName,
          attachmentDataUrl,
        });
        setActiveTicketId(res.ticket.ticketId);
        await loadOtpState();
      } else if (firebaseUser) {
        const id = await createSupportTicketWithMessage({
          user: firebaseUser,
          category: ticketCategory,
          subject: ticketSubject,
          description: ticketDescription,
          attachmentName,
          attachmentDataUrl,
        });
        setActiveTicketId(id);
      }
      setTicketSubject('');
      setTicketDescription('');
      setAttachmentName('');
      setAttachmentDataUrl('');
      pushToast('success', 'Support Ticket Created', 'Ticket queued with our support team.');
    } catch (err) {
      pushToast('error', 'Ticket Failed', err instanceof Error ? err.message : 'Unable to create ticket.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicketId || !replyText.trim()) return;
    setBusyAction('reply');
    try {
      if (isOtpMode) {
        await replySupportTicketApi(activeTicketId, replyText);
        await loadOtpState();
      } else if (firebaseUser) {
        await postSupportReply({
          ticketId: activeTicketId,
          sender: firebaseUser,
          senderRole: 'user',
          body: replyText,
        });
      }
      setReplyText('');
    } catch (err) {
      pushToast('error', 'Reply Failed', err instanceof Error ? err.message : 'Could not post reply.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('profile');
    try {
      if (isOtpMode) {
        await updateUserProfileApi({ displayName: editName.trim(), phone: editPhone.trim() });
        await loadOtpState();
      } else if (firebaseUser) {
        await updateUserProfileFields(firebaseUser.uid, {
          displayName: editName.trim().slice(0, 100) || 'Member',
          phone: editPhone.trim().slice(0, 32),
        });
      }
      pushToast('success', 'Profile Updated', 'Account details saved.');
    } catch (err) {
      pushToast('error', 'Save Failed', err instanceof Error ? err.message : 'Could not update profile.');
    } finally {
      setBusyAction(null);
    }
  };

  const navItems: Array<{ id: UserTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Overview & Plan', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'wallet', label: 'Coin Wallet & UPI', icon: <WalletIcon className="w-4 h-4" /> },
    { id: 'history', label: '6-Month History', icon: <History className="w-4 h-4" /> },
    { id: 'catalog', label: 'Plans & Catalogue', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'orders', label: 'My Orders', icon: <Package className="w-4 h-4" /> },
    { id: 'withdrawals', label: 'Withdrawals & Ref', icon: <Users className="w-4 h-4" /> },
    { id: 'ai', label: 'AI Assistant', icon: <Bot className="w-4 h-4" /> },
    { id: 'support', label: 'Helpdesk', icon: <HelpCircle className="w-4 h-4" /> },
    {
      id: 'notifications',
      label: unreadCount > 0 ? `Alerts (${unreadCount})` : 'Alerts',
      icon: <Bell className="w-4 h-4" />,
    },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  const activeTicket = tickets.find((t) => t.ticketId === activeTicketId) || null;
  const externalSupportHref =
    consentChannel === 'whatsapp'
      ? `https://wa.me/${brand.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
          `Hello ${brand.brandName} Support, my User ID is ${copyableUserId}. I need assistance with my workspace.`
        )}`
      : brand.telegramUrl || 'https://t.me/kestrel_sandbox_support';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row transition-colors">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-white dark:bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBackToStorefront}
            className="inline-flex items-center gap-2 cursor-pointer text-left min-w-0"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500 shrink-0" />
            <BrandLogo brandName={brand.brandName} logoUrl={brand.logoUrl} accentColor={brand.accentColor} size="sm" subtitle="Workspace" />
          </button>
        </div>

        <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === item.id
                  ? 'bg-slate-900 dark:bg-blue-700 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto p-4 border-t border-slate-200 dark:border-slate-800 hidden lg:block space-y-2">
          <div className="text-xs">
            <p className="font-medium text-slate-900 dark:text-white truncate">{currentName}</p>
            <p className="text-blue-700 dark:text-blue-400 font-mono font-semibold text-xs">{displayPublicUserId}</p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="w-full px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 cursor-pointer"
            >
              Open Super Admin
            </button>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span>Workspace</span>
            <span className="mx-2">/</span>
            <span className="font-medium text-slate-900 dark:text-white capitalize">{activeTab}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Available Coins</p>
              <p className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                {(wallet?.availableCoins ?? 0).toLocaleString()} Coins
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Toggle Light/Dark theme"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {isOtpMode && (
              <button
                type="button"
                onClick={() => void loadOtpState()}
                aria-label="Refresh workspace"
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        <main className="p-6 max-w-6xl w-full mx-auto space-y-6">
          {loadingInitial && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
              ))}
            </div>
          )}

          {/* TAB 1: DASHBOARD & ACTIVE PLAN SUMMARY */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Permanent Public User ID</p>
                  <div className="mt-1 flex items-center gap-2.5">
                    <span className="font-mono text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                      {displayPublicUserId}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(copyableUserId);
                        setCopiedUid(true);
                        pushToast('success', 'User ID Copied', `${copyableUserId} copied to clipboard.`);
                        setTimeout(() => setCopiedUid(false), 2000);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedUid ? 'Copied' : 'Copy User ID'}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                  <span>
                    Auth:{' '}
                    <strong className="text-slate-900 dark:text-white font-medium">
                      {firebaseUser ? 'Google Identity' : otpSession?.authMethod === 'mobile_otp' ? 'Mobile OTP' : 'Email OTP'}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Status:{' '}
                    <strong
                      className={`capitalize font-semibold ${
                        profile?.status === 'suspended'
                          ? 'text-red-700 dark:text-red-400'
                          : profile?.status === 'flagged'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {profile?.status || 'active'}
                    </strong>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Available Coin Balance</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {(wallet?.availableCoins ?? 0).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pending top-up: {pendingCoinTotal.toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Credited</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {(wallet?.totalCreditedCoins ?? wallet?.totalPurchasedCoins ?? 0).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Purchases + 24h plan releases</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Debited</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {(wallet?.totalDebitedCoins ?? 0).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Orders &amp; plan enrollments</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Simulated Commissions</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {(wallet?.simulatedCommissionBalance ?? 0).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Sandbox referral credits</p>
                </div>
              </div>

              {/* Active 24-Hour Plan Summary Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <CalendarClock className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      Active Membership Plan &amp; 24-Hour Credit Schedule
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('catalog')}
                    className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Browse 24h Plans →
                  </button>
                </div>

                {!activePlan ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No active 24-hour scheduled plan enrolled yet. Open Plans &amp; Catalogue to activate one with your coin balance.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Plan Name</p>
                        <p className="mt-1 font-semibold text-slate-900 dark:text-white">{activePlan.planName}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Activation Date</p>
                        <p className="mt-1 font-mono text-slate-800 dark:text-slate-200">
                          {new Date(activePlan.activatedAtIso).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Completion Date</p>
                        <p className="mt-1 font-mono text-slate-800 dark:text-slate-200">
                          {new Date(activePlan.completesAtIso).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Next Scheduled Credit</p>
                        <p className="mt-1 font-mono text-blue-700 dark:text-blue-400">
                          {activePlan.nextCreditAtIso ? new Date(activePlan.nextCreditAtIso).toLocaleString() : 'Completed'}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Remaining Duration</p>
                        <p className="mt-1 font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                          {activePlanRemainingDays} day(s)
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Completed / Total Cycles</p>
                        <p className="mt-1 font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {activePlan.completedEvents} / {activePlan.totalEvents} ({activePlan.creditedCoinsSoFar}/
                          {activePlan.totalScheduledCredits} Coins)
                        </p>
                      </div>
                    </div>

                    {planSchedules.filter((s) => s.purchaseId === activePlan.purchaseId).length > 0 && (
                      <div className="overflow-x-auto max-h-48 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                            <tr>
                              <th className="py-2 pr-4">24h Event #</th>
                              <th className="py-2 pr-4">Scheduled Due Time</th>
                              <th className="py-2 pr-4 text-right">Coins</th>
                              <th className="py-2">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {planSchedules
                              .filter((s) => s.purchaseId === activePlan.purchaseId)
                              .sort((a, b) => a.eventIndex - b.eventIndex)
                              .map((evt) => (
                                <tr key={evt.scheduleId}>
                                  <td className="py-2 pr-4 font-mono">Cycle #{evt.eventIndex}</td>
                                  <td className="py-2 pr-4 font-mono">{new Date(evt.dueAtIso).toLocaleString()}</td>
                                  <td className="py-2 pr-4 font-mono text-right tabular-nums">{evt.scheduledCoins}</td>
                                  <td className="py-2 capitalize font-medium">{evt.status}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Withdrawal Eligibility & Status Summary Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      Withdrawal Eligibility &amp; Request Status
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Simulated payouts require minimum {withdrawalSummary.minCoins.toLocaleString()} available coins and authorized provider confirmation before settlement.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('withdrawals')}
                    className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
                  >
                    Manage Withdrawals →
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">Eligibility</p>
                    <p
                      className={`mt-1 font-semibold ${
                        !brand.withdrawalsEnabled
                          ? 'text-amber-700 dark:text-amber-400'
                          : withdrawalSummary.isEligible
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {!brand.withdrawalsEnabled
                        ? 'Paused by Admin'
                        : withdrawalSummary.isEligible
                        ? 'Eligible to Request'
                        : `Need ${(withdrawalSummary.minCoins - withdrawalSummary.availCoins).toLocaleString()} More Coins`}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">Minimum Threshold</p>
                    <p className="mt-1 font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {withdrawalSummary.minCoins.toLocaleString()} Coins
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">In-Progress Withdrawals</p>
                    <p className="mt-1 font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {withdrawalSummary.activeList.length} ({withdrawalSummary.totalPendingCoins.toLocaleString()} Coins)
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">Latest Request Status</p>
                    {withdrawalSummary.latest ? (
                      <div className="mt-1">
                        <span
                          className={`font-semibold ${
                            (USER_WITHDRAWAL_STATUS_META[withdrawalSummary.latest.status] || USER_WITHDRAWAL_STATUS_META.pending).colorClass
                          }`}
                        >
                          {(USER_WITHDRAWAL_STATUS_META[withdrawalSummary.latest.status] || USER_WITHDRAWAL_STATUS_META.pending).label}
                        </span>
                        <span className="ml-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {withdrawalSummary.latest.withdrawalId}
                        </span>
                        {withdrawalSummary.latest.payoutReferenceNumber && (
                          <p className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                            Ref: {withdrawalSummary.latest.payoutReferenceNumber}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-slate-500 dark:text-slate-400">No requests yet</p>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Smart Suggestions & Recent Ledger */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                        AI Smart Suggestions
                      </h3>
                    </div>
                    <button
                      type="button"
                      disabled={busyAction === 'ai-suggest' || !aiFlags.masterEnabled || !aiFlags.aiSmartSuggestions}
                      onClick={() => void handleLoadSmartSuggestions()}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      {busyAction === 'ai-suggest' ? 'Generating...' : 'Refresh Tips'}
                    </button>
                  </div>
                  {!aiFlags.masterEnabled || !aiFlags.aiSmartSuggestions ? (
                    <p className="text-xs text-slate-500">AI Smart Suggestions are disabled by administrator.</p>
                  ) : smartSuggestions.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Click Refresh Tips to get personalized wallet and 24-hour plan suggestions grounded in your current balance.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {smartSuggestions.map((s) => (
                        <div key={s.title} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-xs">
                          <p className="font-semibold text-slate-900 dark:text-white">{s.title}</p>
                          <p className="mt-1 text-slate-600 dark:text-slate-300">{s.reason}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                      Recent Ledger Activity
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Full 6-Month History
                    </button>
                  </div>
                  {ledger.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                      No transactions yet. Select a coin package under Coin Wallet &amp; UPI to begin.
                    </p>
                  ) : (
                    <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                      {ledger.slice(0, 5).map((entry) => (
                        <div key={entry.txId} className="py-3 flex items-center justify-between gap-4 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white truncate">{entry.description}</p>
                            <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              {entry.referenceId} · {entry.type}
                            </p>
                          </div>
                          <span
                            className={`font-mono font-semibold tabular-nums shrink-0 ${
                              entry.type === 'debit' || entry.type === 'refund'
                                ? 'text-slate-900 dark:text-slate-200'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {entry.type === 'debit' || entry.type === 'refund' ? '-' : '+'}
                            {entry.amount.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COIN WALLET, PACKAGES & RANDOM UPI SANDBOX */}
          {activeTab === 'wallet' && (
            <div className="space-y-6">
              <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-xs text-amber-900 dark:text-amber-200">
                <strong>Sandbox Random UPI Notice:</strong> {effectiveConfig.realMoneyDisabledNotice} The backend
                automatically selects an active merchant UPI configuration at random and locks it to your payment
                intent. Never enter a real UPI PIN.
              </div>

              {/* 8 Coin Purchase Packages Selector */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  1. Choose Coin Purchase Package (100 to 50,000) or Custom Amount
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {activeCoinPackages.map((pkg) => (
                    <button
                      key={pkg.packageId}
                      type="button"
                      onClick={() => handleSelectPackage(pkg)}
                      className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        selectedPackageId === pkg.packageId
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                      }`}
                    >
                      <p className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                        {pkg.coinQuantity.toLocaleString()} Coins
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {pkg.currency} {pkg.purchasePrice.toLocaleString()}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                      2. Initiate Sandbox UPI Request
                    </h3>
                  </div>

                  <form onSubmit={handleCreateSandboxIntent} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Sandbox Amount (INR) — Rate: {effectiveConfig.coinRateInr} Coin / INR
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={500000}
                        value={customAmountInr}
                        onChange={(e) => {
                          setSelectedPackageId('');
                          setCustomAmountInr(e.target.value);
                        }}
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        UPI App Channel
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {UPI_APPS.map((appName) => (
                          <button
                            key={appName}
                            type="button"
                            onClick={() => setSelectedUpiApp(appName)}
                            className={`px-3 py-2 text-xs font-medium rounded-lg border text-left cursor-pointer ${
                              selectedUpiApp === appName
                                ? 'bg-slate-900 dark:bg-blue-700 text-white border-slate-900 dark:border-blue-700'
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {appName}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={busyAction === 'upi-intent'}
                      className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-60 cursor-pointer"
                    >
                      {busyAction === 'upi-intent' ? 'Assigning Random UPI...' : 'Assign Random UPI & Generate QR'}
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                      3. Dynamic Sandbox QR &amp; Webhook Simulator
                    </h3>
                  </div>

                  {!activePaymentIntent ? (
                    <div className="mt-6 py-10 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Generate a sandbox payment request to receive a randomly assigned merchant UPI QR and test webhook verification.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                      <div className="p-4 bg-white rounded-xl border border-slate-200 flex flex-col items-center">
                        <QRCodeSVG value={activePaymentIntent.upiUri} size={160} />
                        <p className="mt-3 font-mono text-[11px] text-slate-700 text-center break-all">
                          {activePaymentIntent.payment.sandboxUpiId}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-amber-700">SIMULATED QR — NO REAL FUNDS</p>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Assigned Random Merchant UPI</p>
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {activePaymentIntent.assignedLabel || activePaymentIntent.payment.sandboxUpiId}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Payment Ref &amp; Coins</p>
                          <p className="font-mono font-semibold text-slate-900 dark:text-white">
                            {activePaymentIntent.payment.paymentId} · {activePaymentIntent.payment.coinsRequested} Coins
                          </p>
                        </div>
                        <div className="pt-2 space-y-2">
                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => void handleSimulateWebhook('success')}
                            className="w-full py-2 px-3 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                          >
                            Simulate Verified Webhook (Success)
                          </button>
                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => void handleSimulateWebhook('failed')}
                            className="w-full py-2 px-3 font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer"
                          >
                            Simulate Failed Payment Webhook
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 6-MONTH TRANSACTION HISTORY */}
          {activeTab === 'history' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    Six-Month Transaction History
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Retains 6 months of verified credits, debits, 24h plan distributions, and simulated withdrawals.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportHistoryCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={txWindow}
                  onChange={(e) => {
                    setTxWindow(e.target.value as '6m' | '30d' | '7d');
                    setTxPage(1);
                  }}
                  className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                >
                  <option value="6m">Last 6 Months (Full History)</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="7d">Last 7 Days</option>
                </select>
                <select
                  value={txTypeFilter}
                  onChange={(e) => {
                    setTxTypeFilter(e.target.value);
                    setTxPage(1);
                  }}
                  className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                >
                  <option value="all">All Transaction Types</option>
                  <option value="credit">Coin Top-Up Credits</option>
                  <option value="plan_credit">24h Scheduled Plan Credits</option>
                  <option value="debit">Purchases &amp; Withdrawals</option>
                  <option value="adjustment">Admin Adjustments</option>
                  <option value="refund">Refunds / Reversals</option>
                </select>
                <input
                  type="search"
                  value={txSearch}
                  onChange={(e) => {
                    setTxSearch(e.target.value);
                    setTxPage(1);
                  }}
                  placeholder="Search Tx ID, Ref, or description..."
                  className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                />
              </div>

              {pagedLedger.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No ledger entries found for the selected filter window.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-2.5 pr-4">Tx ID</th>
                        <th className="py-2.5 pr-4">Date</th>
                        <th className="py-2.5 pr-4">Type</th>
                        <th className="py-2.5 pr-4">Description</th>
                        <th className="py-2.5 pr-4 text-right">Amount</th>
                        <th className="py-2.5 pr-4 text-right">Balance After</th>
                        <th className="py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {pagedLedger.map((tx) => (
                        <tr key={tx.txId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-3 pr-4 font-mono">{tx.txId}</td>
                          <td className="py-3 pr-4 font-mono text-[11px] text-slate-500">{formatTimestamp(tx.createdAt)}</td>
                          <td className="py-3 pr-4 capitalize">{tx.type.replace('_', ' ')}</td>
                          <td className="py-3 pr-4">{tx.description}</td>
                          <td className="py-3 pr-4 font-mono text-right tabular-nums">
                            {tx.type === 'debit' || tx.type === 'refund' ? '-' : '+'}
                            {tx.amount.toLocaleString()}
                          </td>
                          <td className="py-3 pr-4 font-mono text-right tabular-nums">
                            {tx.balanceAfter.toLocaleString()}
                          </td>
                          <td className="py-3 capitalize">{tx.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {totalTxPages > 1 && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                  <span>
                    Page {txPage} of {totalTxPages} ({filteredLedger.length} records)
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={txPage <= 1}
                      onClick={() => setTxPage((p) => p - 1)}
                      className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded disabled:opacity-40 cursor-pointer"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={txPage >= totalTxPages}
                      onClick={() => setTxPage((p) => p + 1)}
                      className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CONFIGURABLE 24H PLANS & PRODUCT CATALOGUE */}
          {activeTab === 'catalog' && (
            <div className="space-y-8">
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    Configurable 24-Hour Scheduled Plans
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Purchasing locks the exact plan configuration, duration, and 24-hour release schedule to your account snapshot.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {activePlans.map((pl) => {
                    const sched = computeDailyScheduleAmounts(pl.totalScheduledCredits, pl.durationDays);
                    return (
                      <div
                        key={pl.planId}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between"
                      >
                        <div>
                          <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                            {pl.durationDays} Days · Strict 24h Credits
                          </span>
                          <h3 className="mt-1 font-display text-sm font-bold text-slate-900 dark:text-white">{pl.name}</h3>
                          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{pl.description}</p>
                          <div className="mt-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-xs space-y-1">
                            <div className="flex justify-between">
                              <span>Cost</span>
                              <span className="font-mono font-bold tabular-nums">{pl.purchasePrice} Coins</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Total Credits</span>
                              <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                {pl.totalScheduledCredits} Coins
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Schedule</span>
                              <span className="font-mono text-[11px]">
                                {sched[0]} / 24h {sched[0] !== sched[sched.length - 1] ? `(+rem ${sched[sched.length - 1]} final)` : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirmPlanTarget(pl)}
                          className="mt-4 w-full py-2 px-3 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                        >
                          Activate Plan ({pl.purchasePrice} Coins)
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-lg">
                    {['All', 'Hardware', 'Terminals', 'Membership Kits', 'Service Plans'].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCatalogFilter(cat)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                          catalogFilter === cat
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <input
                    type="search"
                    placeholder="Search hardware or products..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="px-3.5 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg sm:w-64"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {visibleCatalog.map((item) => (
                    <div
                      key={item.productId}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col"
                    >
                      <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-5 flex-1 flex flex-col">
                        <span className="text-xs text-slate-500 dark:text-slate-400">{item.category}</span>
                        <h3 className="mt-1 font-display text-base font-semibold text-slate-900 dark:text-white">
                          {item.title}
                        </h3>
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{item.description}</p>
                        <div className="mt-auto pt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                          <span className="font-mono text-sm font-bold tabular-nums">
                            {item.coinPrice.toLocaleString()} Coins
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProduct(item);
                              setPurchaseQty(1);
                            }}
                            className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 rounded-lg hover:bg-slate-800 cursor-pointer"
                          >
                            Buy Now
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: ORDERS */}
          {activeTab === 'orders' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Purchase &amp; Plan Order History
              </h2>
              {orders.length === 0 && planPurchases.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No completed purchases yet.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-2.5 pr-4">Order / Plan ID</th>
                        <th className="py-2.5 pr-4">Item</th>
                        <th className="py-2.5 pr-4 text-right">Coins</th>
                        <th className="py-2.5 pr-4">Status</th>
                        <th className="py-2.5">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {planPurchases.map((pp) => (
                        <tr key={pp.purchaseId}>
                          <td className="py-3 pr-4 font-mono">{pp.purchaseId}</td>
                          <td className="py-3 pr-4 font-medium">{pp.planName} ({pp.durationDays}d)</td>
                          <td className="py-3 pr-4 font-mono text-right tabular-nums">{pp.purchasePrice}</td>
                          <td className="py-3 pr-4 capitalize">{pp.status}</td>
                          <td className="py-3 text-slate-500">
                            {pp.completedEvents}/{pp.totalEvents} 24h credits issued ({pp.creditedCoinsSoFar} Coins)
                          </td>
                        </tr>
                      ))}
                      {orders.map((ord) => (
                        <tr key={ord.orderId}>
                          <td className="py-3 pr-4 font-mono">{ord.orderId}</td>
                          <td className="py-3 pr-4 font-medium">{ord.productTitle} x{ord.quantity}</td>
                          <td className="py-3 pr-4 font-mono text-right tabular-nums">{ord.coinAmount}</td>
                          <td className="py-3 pr-4 capitalize">{ord.status}</td>
                          <td className="py-3 font-mono text-slate-500">{ord.referenceId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: SIMULATED WITHDRAWALS & REFERRALS */}
          {activeTab === 'withdrawals' && (
            <div className="space-y-6">
              {/* Eligibility & Status Summary Header */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Withdrawal Eligibility</p>
                  <p
                    className={`mt-1.5 text-sm font-bold ${
                      !brand.withdrawalsEnabled
                        ? 'text-amber-700 dark:text-amber-400'
                        : withdrawalSummary.isEligible
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {!brand.withdrawalsEnabled
                      ? 'Paused by Admin'
                      : withdrawalSummary.isEligible
                      ? 'Eligible'
                      : 'Below Minimum Threshold'}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Min {withdrawalSummary.minCoins.toLocaleString()} Coins required
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Available Wallet Balance</p>
                  <p className="mt-1.5 font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                    {withdrawalSummary.availCoins.toLocaleString()} Coins
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    1 INR = {effectiveConfig.coinRateInr} Coin(s)
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pending / Active Requests</p>
                  <p className="mt-1.5 font-mono text-lg font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                    {withdrawalSummary.activeList.length}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {withdrawalSummary.totalPendingCoins.toLocaleString()} Coins awaiting settlement
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Latest Request Status</p>
                  {withdrawalSummary.latest ? (
                    <>
                      <p
                        className={`mt-1.5 text-sm font-bold ${
                          (USER_WITHDRAWAL_STATUS_META[withdrawalSummary.latest.status] || USER_WITHDRAWAL_STATUS_META.pending).colorClass
                        }`}
                      >
                        {(USER_WITHDRAWAL_STATUS_META[withdrawalSummary.latest.status] || USER_WITHDRAWAL_STATUS_META.pending).label}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {withdrawalSummary.latest.withdrawalId}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">None</p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">No requests submitted</p>
                    </>
                  )}
                </div>
              </div>

              {/* Active / Pending Withdrawal Highlight */}
              {withdrawalSummary.activeList.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      Active Withdrawal Under Review / Processing ({withdrawalSummary.activeList.length})
                    </h3>
                    <span className="text-xs font-medium text-sky-700 dark:text-sky-400">
                      Settled only upon provider confirmation
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {withdrawalSummary.activeList.map((wd) => {
                      const statusMeta = USER_WITHDRAWAL_STATUS_META[wd.status] || USER_WITHDRAWAL_STATUS_META.pending;
                      return (
                        <div
                          key={wd.withdrawalId}
                          className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1 min-w-0">
                            <p className="font-mono font-bold text-slate-900 dark:text-white">{wd.withdrawalId}</p>
                            <p className="text-slate-500 dark:text-slate-400 truncate">
                              {wd.payoutChannel} · {wd.accountLabel}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Requested: {formatTimestamp(wd.createdAt)}
                            </p>
                            {wd.payoutReferenceNumber && (
                              <p className="font-mono text-[11px] text-blue-700 dark:text-blue-400">
                                Payout Ref: {wd.payoutReferenceNumber}
                              </p>
                            )}
                            {wd.adminNote && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                                Note: {wd.adminNote}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                              {wd.amountCoins.toLocaleString()} Coins
                            </p>
                            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              INR {wd.equivalentInr.toLocaleString()}
                            </p>
                            <p className={`mt-1 font-semibold ${statusMeta.colorClass}`}>{statusMeta.label}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Simulated Withdrawal Request
                  </h2>
                  <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                    Simulation only. Real bank payouts are disabled. Every request progresses through Pending → Under Review → Approved → Processing → Successful (upon provider confirmation).
                  </p>
                  <form onSubmit={handleSubmitWithdrawal} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Coins to Withdraw (Min {withdrawalSummary.minCoins.toLocaleString()})
                      </label>
                      <input
                        type="number"
                        min={effectiveConfig.minWithdrawalCoins}
                        value={wdAmountCoins}
                        onChange={(e) => setWdAmountCoins(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg font-mono"
                        placeholder="Coins to withdraw"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Simulated Payout Channel
                      </label>
                      <select
                        value={wdChannel}
                        onChange={(e) => setWdChannel(e.target.value as 'Simulated Bank Transfer' | 'Simulated UPI Sandbox')}
                        className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                      >
                        <option value="Simulated UPI Sandbox">Simulated UPI Sandbox</option>
                        <option value="Simulated Bank Transfer">Simulated Bank Transfer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Account / Sandbox VPA Label
                      </label>
                      <input
                        type="text"
                        value={wdAccountLabel}
                        onChange={(e) => setWdAccountLabel(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busyAction === 'withdrawal' || !brand.withdrawalsEnabled}
                      className="w-full py-2.5 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      {brand.withdrawalsEnabled ? 'Submit Simulated Withdrawal' : 'Withdrawals Disabled by Admin'}
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                      Withdrawal History &amp; Referrals ({referrals.length})
                    </h3>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      Referral Code: {profile?.referralCode || 'N/A'}
                    </span>
                  </div>
                  {withdrawals.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No simulated withdrawals requested yet.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-[34rem] overflow-y-auto pr-1">
                      {withdrawals.map((wd) => {
                        const statusMeta = USER_WITHDRAWAL_STATUS_META[wd.status] || USER_WITHDRAWAL_STATUS_META.pending;
                        return (
                          <div
                            key={wd.withdrawalId}
                            className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold text-slate-900 dark:text-white">{wd.withdrawalId}</span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {formatTimestamp(wd.createdAt)}
                                </span>
                              </div>
                              <p className="text-slate-600 dark:text-slate-300 truncate">
                                {wd.payoutChannel} · {wd.accountLabel}
                              </p>
                              {wd.payoutReferenceNumber && (
                                <p className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                                  Payout Reference: {wd.payoutReferenceNumber}
                                </p>
                              )}
                              {wd.adminNote && (
                                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                                  Admin Note: {wd.adminNote}
                                </p>
                              )}
                            </div>
                            <div className="sm:text-right shrink-0">
                              <p className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                                {wd.amountCoins.toLocaleString()} Coins
                              </p>
                              <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                INR {wd.equivalentInr.toLocaleString()}
                              </p>
                              <p className={`mt-1 font-semibold ${statusMeta.colorClass}`}>{statusMeta.label}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: AI SMART ASSISTANT (VOICE + MULTILINGUAL EN/HI) */}
          {activeTab === 'ai' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    Kestrel AI Smart &amp; Voice Assistant
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Powered by Gemini via secure backend. Governed by Admin AI Feature Switches.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!aiFlags.multilingualAi}
                    onClick={() => setAiLang('en')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                      aiLang === 'en' ? 'bg-slate-900 dark:bg-blue-700 text-white' : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    disabled={!aiFlags.multilingualAi}
                    onClick={() => setAiLang('hi')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                      aiLang === 'hi' ? 'bg-slate-900 dark:bg-blue-700 text-white' : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    हिन्दी (Hindi)
                  </button>
                </div>
              </div>

              {!aiFlags.masterEnabled || !aiFlags.aiSmartAssistant ? (
                <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500">
                  The AI Smart Assistant is currently switched OFF by the platform administrator.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {aiFollowUps.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => void handleAskSmartAssistant(q)}
                        className="px-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3 max-h-96 overflow-y-auto p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                    {aiChat.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Ask a question by typing or using Voice Input below (English or Hindi).
                      </p>
                    ) : (
                      aiChat.map((m, idx) => (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-xl text-xs leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-blue-700 text-white ml-8'
                              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mr-8'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-semibold opacity-80">{m.role === 'user' ? 'You' : 'Kestrel AI'}</span>
                            {m.role === 'assistant' && aiFlags.aiVoiceAssistant && (
                              <button
                                type="button"
                                onClick={() => handleSpeakText(m.spoken || m.text)}
                                aria-label="Read aloud"
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <p>{m.text}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleAskSmartAssistant();
                    }}
                    className="flex gap-2.5"
                  >
                    {aiFlags.aiVoiceAssistant && (
                      <button
                        type="button"
                        onClick={handleVoiceCapture}
                        className={`px-3.5 py-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                          listeningVoice
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {listeningVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        {listeningVoice ? 'Listening...' : 'Voice'}
                      </button>
                    )}
                    <input
                      type="text"
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      placeholder={aiLang === 'hi' ? 'अपना प्रश्न पूछें...' : 'Ask about coins, 24h plans, or sandbox payments...'}
                      className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                    <button
                      type="submit"
                      disabled={busyAction === 'ai-chat' || !aiInput.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Send
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          {/* TAB 8: HELPDESK + WHATSAPP/TELEGRAM CONSENT */}
          {activeTab === 'support' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Direct Support Channels (Consent Required)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Optional external support links. We always ask your confirmation before sharing your User ID externally.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => setConsentChannel('whatsapp')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp Support
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsentChannel('telegram')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Telegram Desk
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Create Support Ticket
                  </h3>
                  <form onSubmit={handleCreateTicket} className="space-y-3">
                    <select
                      value={ticketCategory}
                      onChange={(e) => setTicketCategory(e.target.value as SupportCategory)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    >
                      {SUPPORT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      placeholder="Brief subject"
                      className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                    <textarea
                      rows={4}
                      value={ticketDescription}
                      onChange={(e) => setTicketDescription(e.target.value)}
                      placeholder="Describe issue and transaction/plan ID..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                    />
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{attachmentName || 'Attach screenshot (<= 150 KB)'}</span>
                      <input type="file" accept="image/*" onChange={handleFileAttachment} className="sr-only" />
                    </label>
                    <button
                      type="submit"
                      disabled={busyAction === 'ticket'}
                      className="w-full py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                    >
                      Submit Ticket
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    My Tickets ({tickets.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {tickets.map((t) => (
                      <button
                        key={t.ticketId}
                        type="button"
                        onClick={() => setActiveTicketId(t.ticketId)}
                        className={`p-3 rounded-lg border text-left text-xs cursor-pointer ${
                          activeTicketId === t.ticketId
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50'
                            : 'border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <p className="font-semibold text-slate-900 dark:text-white truncate">{t.subject}</p>
                        <p className="mt-1 text-slate-500">
                          {t.category} · {t.status}
                        </p>
                      </button>
                    ))}
                  </div>

                  {activeTicket && (
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {ticketMessages.map((m) => (
                          <div
                            key={m.messageId}
                            className={`p-2.5 rounded-lg text-xs ${
                              m.senderRole === 'admin'
                                ? 'bg-blue-50 dark:bg-blue-950/60'
                                : 'bg-slate-100 dark:bg-slate-800'
                            }`}
                          >
                            <p className="font-semibold">
                              {m.senderName} ({m.senderRole})
                            </p>
                            <p className="mt-0.5">{m.body}</p>
                          </div>
                        ))}
                      </div>
                      <form onSubmit={handleSendReply} className="flex gap-2">
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Write reply..."
                          className="flex-1 px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                        />
                        <button
                          type="submit"
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 rounded-lg cursor-pointer"
                        >
                          Reply
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                In-App &amp; Push Notifications ({unreadCount} unread)
              </h2>
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500">No alerts received yet.</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.notificationId}
                    className={`p-4 rounded-xl border flex items-start justify-between gap-4 text-xs ${
                      n.read
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
                        : 'border-blue-300 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40'
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{n.title}</p>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">{n.body}</p>
                    </div>
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isOtpMode) {
                            void markNotificationReadApi(n.notificationId).then(loadOtpState);
                          } else {
                            void updateDoc(doc(db, 'notifications', n.notificationId), { read: true });
                          }
                        }}
                        className="text-blue-700 dark:text-blue-400 font-semibold shrink-0 cursor-pointer"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 10: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-xl space-y-4">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Profile, Verification &amp; Preferences
              </h2>
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Permanent Public User ID</p>
                  <p className="font-mono text-base font-bold text-slate-900 dark:text-white">{displayPublicUserId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(copyableUserId);
                    setCopiedUid(true);
                    pushToast('success', 'User ID Copied', `${copyableUserId} copied to clipboard.`);
                    setTimeout(() => setCopiedUid(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedUid ? 'Copied' : 'Copy ID'}
                </button>
              </div>
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Display Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
                  />
                </div>
                <div className="text-xs text-slate-500 space-y-1 pt-1">
                  <p>Email Status: {profile?.emailVerified || firebaseUser?.emailVerified ? 'Verified' : 'Unverified'}</p>
                  <p>Phone Status: {profile?.phoneVerified ? 'Verified' : 'Unverified'}</p>
                </div>
                <button
                  type="submit"
                  disabled={busyAction === 'profile'}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  Save Profile
                </button>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Plan Purchase Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(confirmPlanTarget)}
        title="Confirm 24-Hour Plan Activation"
        description={
          confirmPlanTarget
            ? `Activating "${confirmPlanTarget.name}" immediately deducts ${confirmPlanTarget.purchasePrice} coins from your available wallet and locks a ${confirmPlanTarget.durationDays}-day, ${confirmPlanTarget.totalScheduledCredits}-coin 24-hour release schedule.`
            : ''
        }
        confirmLabel="Activate Plan"
        busy={busyAction === 'plan-purchase'}
        onCancel={() => setConfirmPlanTarget(null)}
        onConfirm={() => void handleConfirmPlanPurchase()}
      />

      {/* Product Checkout Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-lg font-bold">{selectedProduct.title}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">{selectedProduct.terms}</p>
            <div className="flex items-center justify-between text-sm">
              <span>Quantity</span>
              <input
                type="number"
                min={1}
                max={20}
                value={purchaseQty}
                onChange={(e) => setPurchaseQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-right font-mono"
              />
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg flex justify-between text-sm font-bold">
              <span>Total Deduction</span>
              <span className="font-mono tabular-nums">{(selectedProduct.coinPrice * purchaseQty).toLocaleString()} Coins</span>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="px-4 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyAction === 'purchase'}
                onClick={() => void handlePurchaseProduct()}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                Confirm Purchase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* External WhatsApp / Telegram User Consent Modal */}
      {consentChannel && (
        <div className="fixed inset-0 z-[65] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                External Support Sharing Consent
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              You are opening {consentChannel === 'whatsapp' ? 'WhatsApp' : 'Telegram'} outside {brand.brandName}. Only
              your User ID (<span className="font-mono font-semibold">{copyableUserId}</span>) will be pre-filled in your
              message if you choose to send it. Do not share OTPs or private passwords.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConsentChannel(null)}
                className="px-3.5 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <a
                href={externalSupportHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setConsentChannel(null)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
              >
                Continue to {consentChannel === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
