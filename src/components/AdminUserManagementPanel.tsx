import React, { useEffect, useMemo, useState } from 'react';
import { type User } from 'firebase/auth';
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  Ban,
  CalendarClock,
  CheckCircle2,
  Coins,
  Copy,
  CreditCard,
  Download,
  FileSearch,
  History,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  UserCheck,
  UserCog,
} from 'lucide-react';
import {
  fetchAdminUserReportApi,
  migrateHistoricalUserIdsApi,
  searchAdminUsersApi,
  updateUserStatusApi,
} from '../lib/api';
import {
  adminUpdateUserStatus,
  logAdminUserSearchFirestore,
  migrateHistoricalUsersFirestore,
} from '../lib/firestoreService';
import {
  AdminAuditLogRecord,
  AdminRoleType,
  AdminUserSearchResultRow,
  CoinRequest,
  Order,
  PlanPurchase,
  SandboxPayment,
  SecurityLog,
  UserCompleteReport,
  UserProfile,
  UserStatus,
  Wallet,
  WalletLedgerEntry,
  WalletTransactionRecord,
  WithdrawalRequest,
  WithdrawalStatus,
  formatTimestamp,
  toMillis,
} from '../types/platform';
import { useToast } from './ToastContext';

interface AdminUserManagementPanelProps {
  firebaseUser: User | null;
  isOtpMode: boolean;
  adminEmail: string;
  viewerRole: AdminRoleType | 'super_admin' | 'admin';
  users: UserProfile[];
  wallets: Wallet[];
  walletTransactions: WalletTransactionRecord[];
  ledger: WalletLedgerEntry[];
  payments: SandboxPayment[];
  coinRequests: CoinRequest[];
  orders: Order[];
  planPurchases: PlanPurchase[];
  withdrawals: WithdrawalRequest[];
  securityLogs: SecurityLog[];
  adminAuditLogs: AdminAuditLogRecord[];
  onRefreshData: () => Promise<void>;
  onJumpToCoinManagement: (uid: string, action: 'add' | 'deduct') => void;
  onExportCsv: (name: string, rows: Array<Record<string, unknown>>) => void;
  onRequestConfirm: (cfg: {
    title: string;
    description: string;
    variant?: 'primary' | 'danger';
    onConfirm: () => Promise<void>;
  }) => void;
  initialSelectedUserId?: string;
}

type ReportSectionTab =
  | 'all'
  | 'basic'
  | 'wallet'
  | 'purchases'
  | 'plans'
  | 'withdrawals'
  | 'activity';

const WD_STATUS_LABEL: Record<WithdrawalStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'text-amber-700 dark:text-amber-400' },
  under_review: { label: 'Under Review', cls: 'text-sky-700 dark:text-sky-400' },
  approved: { label: 'Approved', cls: 'text-indigo-700 dark:text-indigo-400' },
  processing: { label: 'Processing', cls: 'text-blue-700 dark:text-blue-400' },
  successful: { label: 'Successful', cls: 'text-emerald-700 dark:text-emerald-400' },
  rejected: { label: 'Rejected', cls: 'text-red-700 dark:text-red-400' },
  failed: { label: 'Failed', cls: 'text-rose-700 dark:text-rose-400' },
};

function maskEmailLocal(email: string): string {
  if (!email || !email.includes('@')) return email ? `${email.slice(0, 2)}***` : '—';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}

function maskPhoneLocal(phone: string): string {
  if (!phone) return '—';
  if (phone.length <= 4) return '****';
  return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
}

export const AdminUserManagementPanel: React.FC<AdminUserManagementPanelProps> = ({
  firebaseUser,
  isOtpMode,
  viewerRole,
  users,
  wallets,
  walletTransactions,
  ledger,
  payments,
  coinRequests,
  orders,
  planPurchases,
  withdrawals,
  securityLogs,
  adminAuditLogs,
  onRefreshData,
  onJumpToCoinManagement,
  onExportCsv,
  onRequestConfirm,
  initialSelectedUserId,
}) => {
  const { pushToast } = useToast();

  const canFullPii = viewerRole === 'super_admin' || viewerRole === 'admin' || viewerRole === 'finance_admin';
  const canMutate = viewerRole === 'super_admin' || viewerRole === 'admin' || viewerRole === 'finance_admin';

  // Search, Filters, Sort, Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState<'publicUserId' | 'displayName' | 'coinBalance' | 'totalPurchaseInr' | 'totalWithdrawalCoins' | 'createdAt'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Report selection & section navigation
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [serverReport, setServerReport] = useState<UserCompleteReport | null>(null);
  const [searchingBusy, setSearchingBusy] = useState(false);
  const [migratingBusy, setMigratingBusy] = useState(false);
  const [reportTab, setReportTab] = useState<ReportSectionTab>('all');
  const [copiedId, setCopiedId] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  useEffect(() => {
    if (initialSelectedUserId) {
      setSelectedUserId(initialSelectedUserId);
      setReportTab('all');
    }
  }, [initialSelectedUserId]);

  // Count historical users missing UID001+ format
  const usersWithoutPublicId = useMemo(
    () => users.filter((u) => !u.publicUserId || !/^UID[0-9]{3,}$/.test(u.publicUserId)),
    [users]
  );

  // Build local search rows from synced collections (stays live with Firestore snapshots or OTP polls)
  const localSearchRows: AdminUserSearchResultRow[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const qPhone = q.replace(/\s+/g, '');
    const fromMs = dateFrom ? Date.parse(`${dateFrom}T00:00:00`) : null;
    const toMs = dateTo ? Date.parse(`${dateTo}T23:59:59`) : null;

    return users
      .filter((u) => {
        if (statusFilter !== 'all' && u.status !== statusFilter) return false;
        const createdMs = toMillis(u.createdAt);
        if (fromMs !== null && !Number.isNaN(fromMs) && createdMs < fromMs) return false;
        if (toMs !== null && !Number.isNaN(toMs) && createdMs > toMs) return false;
        if (!q) return true;
        const normPhone = (u.phone || '').replace(/\s+/g, '').toLowerCase();
        return (
          (u.publicUserId || '').toLowerCase().includes(q) ||
          u.uid.toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          normPhone.includes(qPhone) ||
          u.displayName.toLowerCase().includes(q)
        );
      })
      .map((u) => {
        const w = wallets.find((x) => x.userId === u.uid);
        const uPayments = payments.filter((p) => p.userId === u.uid && p.status === 'credited');
        const uWds = withdrawals.filter((wd) => wd.userId === u.uid);
        const uPlans = planPurchases.filter((pp) => pp.userId === u.uid);

        const totalPurchaseInr = uPayments.reduce((s, p) => s + Number(p.amountInr || 0), 0);
        const totalPurchasedCoins = uPayments.reduce((s, p) => s + Number(p.coinsRequested || 0), 0);
        const totalWithdrawalCoins = uWds.reduce((s, wd) => s + Number(wd.amountCoins || 0), 0);
        const successfulWithdrawalCoins = uWds
          .filter((wd) => wd.status === 'successful' && wd.providerConfirmed === true)
          .reduce((s, wd) => s + Number(wd.amountCoins || 0), 0);
        const pendingWithdrawalCoins = uWds
          .filter((wd) => wd.status === 'pending' || wd.status === 'under_review' || wd.status === 'approved' || wd.status === 'processing')
          .reduce((s, wd) => s + Number(wd.amountCoins || 0), 0);

        return {
          uid: u.uid,
          publicUserId: u.publicUserId || 'Pending Migration',
          displayName: u.displayName,
          email: canFullPii ? u.email : maskEmailLocal(u.email),
          phone: canFullPii ? u.phone : maskPhoneLocal(u.phone),
          status: u.status,
          role: u.role,
          emailVerified: u.emailVerified,
          phoneVerified: u.phoneVerified,
          coinBalance: Number(w?.availableCoins || 0),
          totalPurchaseInr,
          totalPurchasedCoins,
          totalWithdrawalCoins,
          successfulWithdrawalCoins,
          pendingWithdrawalCoins,
          activePlansCount: uPlans.filter((p) => p.status === 'active').length,
          completedPlansCount: uPlans.filter((p) => p.status === 'completed').length,
          createdAt: String(u.createdAt || ''),
          lastLoginAt: String(u.lastLoginAt || u.updatedAt || u.createdAt || ''),
          piiMasked: !canFullPii,
        };
      })
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        if (sortField === 'publicUserId') return dir * a.publicUserId.localeCompare(b.publicUserId);
        if (sortField === 'displayName') return dir * a.displayName.localeCompare(b.displayName);
        if (sortField === 'coinBalance') return dir * (a.coinBalance - b.coinBalance);
        if (sortField === 'totalPurchaseInr') return dir * (a.totalPurchaseInr - b.totalPurchaseInr);
        if (sortField === 'totalWithdrawalCoins') return dir * (a.totalWithdrawalCoins - b.totalWithdrawalCoins);
        return dir * (toMillis(a.createdAt) - toMillis(b.createdAt));
      });
  }, [users, wallets, payments, withdrawals, planPurchases, searchQuery, statusFilter, dateFrom, dateTo, sortField, sortDir, canFullPii]);

  const totalPages = Math.max(1, Math.ceil(localSearchRows.length / pageSize));
  const paginatedRows = useMemo(
    () => localSearchRows.slice((page - 1) * pageSize, page * pageSize),
    [localSearchRows, page]
  );

  // Build reactive local report for selectedUserId, falling back to serverReport when in OTP/backend mode
  const activeReport: UserCompleteReport | null = useMemo(() => {
    if (!selectedUserId) return null;
    const u = users.find((x) => x.uid === selectedUserId || (x.publicUserId && x.publicUserId.toUpperCase() === selectedUserId.toUpperCase()));
    if (!u) return serverReport;

    const w: Wallet = wallets.find((x) => x.userId === u.uid) || {
      userId: u.uid,
      availableCoins: 0,
      pendingCoins: 0,
      totalPurchasedCoins: 0,
      totalCreditedCoins: 0,
      totalDebitedCoins: 0,
      simulatedCommissionBalance: 0,
      lastTxId: 'init',
      updatedAt: u.updatedAt,
    };

    const uWalletTxs = walletTransactions.filter((t) => t.userId === u.uid);
    const uLedger = ledger.filter((l) => l.userId === u.uid);
    const uPayments = payments.filter((p) => p.userId === u.uid);
    const uCoinReqs = coinRequests.filter((c) => c.userId === u.uid);
    const uOrders = orders.filter((o) => o.userId === u.uid);
    const uPlans = planPurchases.filter((p) => p.userId === u.uid);
    const uWithdrawals = withdrawals.filter((wd) => wd.userId === u.uid);
    const uActivity = securityLogs.filter((s) => s.actorUid === u.uid || s.targetId === u.uid);
    const uAudits = adminAuditLogs.filter((a) => a.targetUserId === u.uid);

    const creditedPayments = uPayments.filter((p) => p.status === 'credited');
    const failedPayments = uPayments.filter((p) => p.status === 'failed' || p.status === 'expired');

    const totalCoinsPurchased = creditedPayments.reduce((s, p) => s + Number(p.coinsRequested || 0), 0);
    const totalPurchaseAmountInr = creditedPayments.reduce((s, p) => s + Number(p.amountInr || 0), 0);
    const totalCoinsAddedByAdmin = uWalletTxs.filter((t) => t.action === 'add').reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalCoinsDeductedByAdmin = uWalletTxs.filter((t) => t.action === 'deduct').reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalCoinsCreditedAutomatically = uLedger
      .filter((l) => l.type === 'plan_credit' && l.status === 'completed')
      .reduce((s, l) => s + Number(l.amount || 0), 0);
    const orderAndPlanDebits = uLedger
      .filter(
        (l) =>
          l.type === 'debit' &&
          l.status === 'completed' &&
          (uOrders.some((o) => o.orderId === l.referenceId) || uPlans.some((pl) => pl.purchaseId === l.referenceId))
      )
      .reduce((s, l) => s + Number(l.amount || 0), 0);
    const withdrawalDebits = uLedger
      .filter(
        (l) =>
          l.type === 'debit' &&
          l.status === 'completed' &&
          uWithdrawals.some((wd) => wd.withdrawalId === l.referenceId)
      )
      .reduce((s, l) => s + Number(l.amount || 0), 0);

    const totalCoinsDeducted = totalCoinsDeductedByAdmin + orderAndPlanDebits + withdrawalDebits;

    const totalWithdrawalsRequestedCoins = uWithdrawals.reduce((s, wd) => s + Number(wd.amountCoins || 0), 0);
    const totalWithdrawalsApprovedCoins = uWithdrawals
      .filter((wd) => wd.status === 'approved' || wd.status === 'processing' || wd.status === 'successful')
      .reduce((s, wd) => s + Number(wd.amountCoins || 0), 0);
    const totalSuccessfulWithdrawalsCoins = uWithdrawals
      .filter((wd) => wd.status === 'successful' && wd.providerConfirmed === true)
      .reduce((s, wd) => s + Number(wd.amountCoins || 0), 0);
    const totalRejectedWithdrawalsCoins = uWithdrawals
      .filter((wd) => wd.status === 'rejected' || wd.status === 'failed')
      .reduce((s, wd) => s + Number(wd.amountCoins || 0), 0);
    const pendingWithdrawalsCoins = uWithdrawals
      .filter((wd) => wd.status === 'pending' || wd.status === 'under_review' || wd.status === 'approved' || wd.status === 'processing')
      .reduce((s, wd) => s + Number(wd.amountCoins || 0), 0);

    return {
      user: canFullPii ? u : { ...u, email: maskEmailLocal(u.email), phone: maskPhoneLocal(u.phone) },
      wallet: w,
      summary: {
        currentCoinBalance: Number(w.availableCoins || 0),
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
        activePlansCount: uPlans.filter((p) => p.status === 'active').length,
        completedPlansCount: uPlans.filter((p) => p.status === 'completed').length,
      },
      coinTransactions: uWalletTxs,
      ledgerEntries: uLedger,
      payments: canFullPii ? uPayments : uPayments.map((p) => ({ ...p, userEmail: maskEmailLocal(p.userEmail) })),
      coinRequests: uCoinReqs,
      orders: uOrders,
      planPurchases: uPlans,
      withdrawals: canFullPii
        ? uWithdrawals
        : uWithdrawals.map((wd) => ({
            ...wd,
            userEmail: maskEmailLocal(wd.userEmail),
            accountLabel: wd.accountLabel ? `****${wd.accountLabel.slice(-4)}` : '****',
          })),
      activityLogs: uActivity,
      auditLogs: uAudits,
      piiMasked: !canFullPii,
      viewerRole,
    };
  }, [selectedUserId, users, wallets, walletTransactions, ledger, payments, coinRequests, orders, planPurchases, withdrawals, securityLogs, adminAuditLogs, serverReport, canFullPii, viewerRole]);

  const handleExecuteSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    setPage(1);
    setSearchingBusy(true);
    try {
      if (isOtpMode) {
        const res = await searchAdminUsersApi({
          q,
          status: statusFilter,
          from: dateFrom,
          to: dateTo,
          sort: sortField,
          dir: sortDir,
          logAudit: Boolean(q),
        });
        if (q && res.results.length > 0) {
          const exact =
            res.results.find((r) => r.publicUserId.toUpperCase() === q.toUpperCase() || r.uid === q) ||
            res.results[0];
          const rep = await fetchAdminUserReportApi(exact.uid, true);
          setSelectedUserId(exact.uid);
          setServerReport(rep);
        } else if (q) {
          pushToast('info', 'No Match Found', `No user account matched "${q}".`);
        }
        await onRefreshData();
      } else {
        if (firebaseUser && q) {
          await logAdminUserSearchFirestore({
            adminUser: firebaseUser,
            searchQuery: q,
            targetUserId: localSearchRows[0]?.uid || 'search_query',
            matchCount: localSearchRows.length,
          });
        }
        if (q && localSearchRows.length > 0) {
          const exact =
            localSearchRows.find((r) => r.publicUserId.toUpperCase() === q.toUpperCase() || r.uid === q) ||
            localSearchRows[0];
          setSelectedUserId(exact.uid);
        } else if (q) {
          pushToast('info', 'No Match Found', `No user account matched "${q}".`);
        }
      }
    } catch (err) {
      pushToast('error', 'Search Error', err instanceof Error ? err.message : 'Unable to execute user search.');
    } finally {
      setSearchingBusy(false);
    }
  };

  const handleOpenProfile = async (uid: string) => {
    setSelectedUserId(uid);
    setReportTab('all');
    if (isOtpMode) {
      try {
        const rep = await fetchAdminUserReportApi(uid, true);
        setServerReport(rep);
      } catch {
        // fallback to synced state
      }
    } else if (firebaseUser) {
      void logAdminUserSearchFirestore({
        adminUser: firebaseUser,
        searchQuery: uid,
        targetUserId: uid,
        matchCount: 1,
      });
    }
  };

  const handleRunHistoricalMigration = () => {
    if (!canMutate) {
      pushToast('error', 'Permission Denied', 'Only Admin or Super Admin roles can run ID migration.');
      return;
    }
    onRequestConfirm({
      title: 'Run Safe Sequential User ID Migration',
      description: `Assign permanent sequential User IDs (UID001, UID002, ...) to ${usersWithoutPublicId.length} legacy account(s) lacking one? Existing UIDs, balances, plans, purchases, and withdrawals remain untouched.`,
      onConfirm: async () => {
        setMigratingBusy(true);
        try {
          if (isOtpMode) {
            const res = await migrateHistoricalUserIdsApi();
            await onRefreshData();
            pushToast('success', 'ID Migration Complete', `Assigned sequential IDs to ${res.migratedCount} user(s).`);
          } else if (firebaseUser) {
            const count = await migrateHistoricalUsersFirestore(firebaseUser);
            await migrateHistoricalUserIdsApi().catch(() => undefined);
            await onRefreshData();
            pushToast('success', 'ID Migration Complete', `Assigned sequential IDs to ${count} Firebase user(s).`);
          }
        } finally {
          setMigratingBusy(false);
        }
      },
    });
  };

  const handleChangeAccountStatus = (targetUser: UserProfile, nextStatus: UserStatus) => {
    if (!canMutate) {
      pushToast('error', 'Restricted Action', 'Your staff role cannot suspend or reactivate accounts.');
      return;
    }
    const label = nextStatus === 'suspended' ? 'Suspend Account' : 'Reactivate Account';
    onRequestConfirm({
      title: `${label} (${targetUser.publicUserId || targetUser.uid})`,
      description: `Change ${targetUser.displayName} (${targetUser.publicUserId || targetUser.uid}) from ${targetUser.status} to ${nextStatus}?${
        suspendReason.trim() ? ` Reason: "${suspendReason.trim()}"` : ''
      }`,
      variant: nextStatus === 'suspended' ? 'danger' : 'primary',
      onConfirm: async () => {
        const reason = suspendReason.trim() || `Admin ${label.toLowerCase()} via User Management`;
        if (isOtpMode) {
          await updateUserStatusApi(targetUser.uid, nextStatus, reason);
          await onRefreshData();
        } else if (firebaseUser) {
          await adminUpdateUserStatus({
            adminUser: firebaseUser,
            targetUser,
            status: nextStatus,
            reason,
          });
          await updateUserStatusApi(targetUser.uid, nextStatus, reason).catch(() => undefined);
        }
        setSuspendReason('');
        pushToast('success', 'Account Updated', `${targetUser.publicUserId || targetUser.uid} is now ${nextStatus}.`);
      },
    });
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  // Unified Coin Transaction + Ledger History for Section B
  const combinedWalletHistory = useMemo(() => {
    if (!activeReport) return [];
    const items: Array<{
      id: string;
      source: string;
      type: string;
      amount: number;
      balanceAfter: number | null;
      reason: string;
      actor: string;
      createdAt: unknown;
    }> = [];

    for (const tx of activeReport.coinTransactions) {
      items.push({
        id: tx.txId,
        source: 'Admin Manual',
        type: tx.action === 'add' ? 'credit' : 'debit',
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        reason: tx.reason,
        actor: tx.adminEmail,
        createdAt: tx.createdAt,
      });
    }
    const manualIds = new Set(activeReport.coinTransactions.map((t) => t.txId));
    for (const l of activeReport.ledgerEntries) {
      if (manualIds.has(l.txId)) continue;
      items.push({
        id: l.txId,
        source: l.type === 'plan_credit' ? '24h Auto Plan' : 'Platform Ledger',
        type: l.type,
        amount: l.amount,
        balanceAfter: l.balanceAfter,
        reason: l.description,
        actor: l.referenceId,
        createdAt: l.createdAt,
      });
    }
    return items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }, [activeReport]);

  return (
    <div className="space-y-6">
      {/* Historical ID Migration Banner if legacy accounts lack UID001+ */}
      {usersWithoutPublicId.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-950 dark:text-amber-200">
                {usersWithoutPublicId.length} Historical Account(s) Need Permanent Sequential IDs (UID001+)
              </p>
              <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                Safe idempotent migration assigns unique UID001, UID002... ordered by creation date without altering balances or orders.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={migratingBusy || !canMutate}
            onClick={handleRunHistoricalMigration}
            className="px-4 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-40 rounded-lg shrink-0 cursor-pointer"
          >
            {migratingBusy ? 'Migrating...' : 'Assign Sequential IDs Now'}
          </button>
        </div>
      )}

      {/* Search Bar & Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              User Management &amp; Search Engine
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Search by Permanent User ID (UID001), Mobile Number, Email Address, or User Name to inspect full financial &amp; audit reports.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canFullPii && (
              <button
                type="button"
                onClick={() =>
                  onExportCsv(
                    'users_directory',
                    localSearchRows.map((r) => ({
                      publicUserId: r.publicUserId,
                      uid: r.uid,
                      displayName: r.displayName,
                      email: r.email,
                      phone: r.phone,
                      coinBalance: r.coinBalance,
                      totalPurchaseInr: r.totalPurchaseInr,
                      totalWithdrawalCoins: r.totalWithdrawalCoins,
                      successfulWithdrawalCoins: r.successfulWithdrawalCoins,
                      status: r.status,
                      createdAt: r.createdAt,
                    }))
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            )}
            <button
              type="button"
              onClick={() => void onRefreshData()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>

        <form onSubmit={handleExecuteSearch} className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search UID001, Mobile Number, Email, or Name..."
              className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | UserStatus);
              setPage(1);
            }}
            className="lg:col-span-2 px-3 py-2.5 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="flagged">Flagged</option>
            <option value="suspended">Suspended</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            aria-label="Registered from date"
            className="lg:col-span-2 px-2.5 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            aria-label="Registered to date"
            className="lg:col-span-2 px-2.5 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg"
          />
          <button
            type="submit"
            disabled={searchingBusy}
            className="lg:col-span-1 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
          >
            {searchingBusy ? '...' : 'Search'}
          </button>
        </form>

        {/* Results Table */}
        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2.5 pr-4">
                  <button type="button" onClick={() => toggleSort('publicUserId')} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer">
                    User ID <ArrowDownUp className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 pr-4">
                  <button type="button" onClick={() => toggleSort('displayName')} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer">
                    User Name <ArrowDownUp className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 pr-4 text-right">
                  <button type="button" onClick={() => toggleSort('coinBalance')} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer">
                    Coin Balance <ArrowDownUp className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 pr-4 text-right">
                  <button type="button" onClick={() => toggleSort('totalPurchaseInr')} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer">
                    Total Purchases <ArrowDownUp className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 pr-4 text-right">
                  <button type="button" onClick={() => toggleSort('totalWithdrawalCoins')} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer">
                    Withdrawals <ArrowDownUp className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 pr-4">Status</th>
                <th className="py-2.5">Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    No matching users found for current filters.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const isSelected = selectedUserId === row.uid;
                  return (
                    <tr
                      key={row.uid}
                      className={isSelected ? 'bg-blue-50/70 dark:bg-blue-950/30' : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'}
                    >
                      <td className="py-2.5 pr-4">
                        <p className="font-mono font-bold text-slate-900 dark:text-white">{row.publicUserId}</p>
                        <p className="font-mono text-[11px] text-slate-400">{row.uid.slice(0, 12)}</p>
                      </td>
                      <td className="py-2.5 pr-4">
                        <p className="font-semibold text-slate-900 dark:text-white">{row.displayName}</p>
                        <p className="text-[11px] text-slate-500">
                          {row.email || '—'} · {row.phone || '—'}
                        </p>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono font-bold tabular-nums text-blue-700 dark:text-blue-400">
                        {row.coinBalance.toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                        <p className="font-semibold">₹{row.totalPurchaseInr.toLocaleString()}</p>
                        <p className="text-[11px] text-slate-500">{row.totalPurchasedCoins.toLocaleString()} Coins</p>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                        <p className="font-semibold">{row.successfulWithdrawalCoins.toLocaleString()} Settled</p>
                        <p className="text-[11px] text-slate-500">{row.pendingWithdrawalCoins.toLocaleString()} Pending</p>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`font-semibold capitalize ${
                            row.status === 'suspended'
                              ? 'text-red-700 dark:text-red-400'
                              : row.status === 'flagged'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          onClick={() => void handleOpenProfile(row.uid)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-slate-900 dark:bg-blue-700 hover:bg-slate-800 rounded-lg cursor-pointer"
                        >
                          <FileSearch className="w-3 h-3" />
                          Open Report
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
          <span>
            Showing {paginatedRows.length} of {localSearchRows.length} matching accounts ({users.length} total)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
            >
              Prev
            </button>
            <span className="font-mono tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* COMPLETE USER PROFILE & 9 FINANCIAL SUMMARY CARDS */}
      {activeReport && (
        <div className="space-y-6">
          {/* Header & Admin Action Buttons */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xl font-bold text-blue-700 dark:text-blue-400">
                    {activeReport.user.publicUserId || 'UID_UNASSIGNED'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const val = activeReport.user.publicUserId || activeReport.user.uid;
                      void navigator.clipboard.writeText(val);
                      setCopiedId(true);
                      pushToast('success', 'Copied User ID', `${val} copied.`);
                      setTimeout(() => setCopiedId(false), 1800);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 rounded cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedId ? 'Copied' : 'Copy'}
                  </button>
                  <span className="text-slate-400" aria-hidden="true">·</span>
                  <span
                    className={`text-xs font-bold uppercase ${
                      activeReport.user.status === 'suspended'
                        ? 'text-red-700 dark:text-red-400'
                        : activeReport.user.status === 'flagged'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {activeReport.user.status}
                  </span>
                </div>
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white mt-1">
                  {activeReport.user.displayName} — Complete Account Profile Report
                </h3>
                {activeReport.piiMasked && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    PII masking active for role ({viewerRole}): full contact strings and financial modifications are restricted.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  disabled={!canMutate}
                  onClick={() => onJumpToCoinManagement(activeReport.user.uid, 'add')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Coins
                </button>
                <button
                  type="button"
                  disabled={!canMutate}
                  onClick={() => onJumpToCoinManagement(activeReport.user.uid, 'deduct')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-white bg-rose-700 hover:bg-rose-800 disabled:opacity-40 rounded-lg cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                  Deduct Coins
                </button>
                <button
                  type="button"
                  onClick={() => setReportTab('wallet')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  <History className="w-3.5 h-3.5" />
                  View Transactions
                </button>
                <button
                  type="button"
                  onClick={() => setReportTab('purchases')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  View Purchase History
                </button>
                <button
                  type="button"
                  onClick={() => setReportTab('plans')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  View Plan History
                </button>
                <button
                  type="button"
                  onClick={() => setReportTab('withdrawals')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  View Withdrawal History
                </button>
                <button
                  type="button"
                  onClick={() => setReportTab('activity')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5" />
                  View Account Activity
                </button>
              </div>
            </div>

            {/* Suspend / Reactivate Control Strip */}
            {canMutate && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs">
                <input
                  type="text"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Optional audit reason for account status change..."
                  className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg"
                />
                {activeReport.user.status !== 'suspended' ? (
                  <button
                    type="button"
                    onClick={() => handleChangeAccountStatus(activeReport.user, 'suspended')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg shrink-0 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Suspend Account
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleChangeAccountStatus(activeReport.user, 'active')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shrink-0 cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Reactivate Account
                  </button>
                )}
              </div>
            )}

            {/* 9 User Financial Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-3.5">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                <p className="text-[11px] text-slate-500">1. Current Coin Balance</p>
                <p className="mt-1 font-mono text-xl font-bold tabular-nums text-blue-700 dark:text-blue-400">
                  {activeReport.summary.currentCoinBalance.toLocaleString()} Coins
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                <p className="text-[11px] text-slate-500">2. Total Coins Purchased</p>
                <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {activeReport.summary.totalCoinsPurchased.toLocaleString()} Coins
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                <p className="text-[11px] text-slate-500">3. Total Coins Added by Admin</p>
                <p className="mt-1 font-mono text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  +{activeReport.summary.totalCoinsAddedByAdmin.toLocaleString()} Coins
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                <p className="text-[11px] text-slate-500">4. Total Coins Deducted</p>
                <p className="mt-1 font-mono text-xl font-bold tabular-nums text-rose-700 dark:text-rose-400">
                  -{activeReport.summary.totalCoinsDeducted.toLocaleString()} Coins
                </p>
                <p className="text-[11px] text-slate-500">
                  Admin: {activeReport.summary.totalCoinsDeductedByAdmin.toLocaleString()} · Spent: {activeReport.summary.totalCoinsSpentOnPurchases.toLocaleString()}
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                <p className="text-[11px] text-slate-500">5. Total Purchase Amount (INR)</p>
                <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                  ₹{activeReport.summary.totalPurchaseAmountInr.toLocaleString()}
                </p>
                <p className="text-[11px] text-slate-500">
                  {activeReport.summary.totalSuccessfulPurchasesCount} verified purchase(s)
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                <p className="text-[11px] text-slate-500">6. Total Successful Withdrawals</p>
                <p className="mt-1 font-mono text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {activeReport.summary.totalSuccessfulWithdrawalsCoins.toLocaleString()} Coins
                </p>
                <p className="text-[11px] text-slate-500">Provider-confirmed settled only</p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                <p className="text-[11px] text-slate-500">7. Pending Withdrawals</p>
                <p className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  {activeReport.summary.pendingWithdrawalsCoins.toLocaleString()} Coins
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                <p className="text-[11px] text-slate-500">8. Active Plans</p>
                <p className="mt-1 font-mono text-xl font-bold tabular-nums text-blue-700 dark:text-blue-400">
                  {activeReport.summary.activePlansCount}
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                <p className="text-[11px] text-slate-500">9. Completed Plans</p>
                <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {activeReport.summary.completedPlansCount}
                </p>
              </div>
            </div>

            {/* Section View Tabs */}
            <div className="flex flex-wrap gap-1.5 border-t border-slate-200 dark:border-slate-800 pt-4 text-xs">
              {(
                [
                  { id: 'all', label: 'All Sections (A–F)' },
                  { id: 'basic', label: 'A. Basic Info' },
                  { id: 'wallet', label: 'B. Coin Wallet Report' },
                  { id: 'purchases', label: 'C. Purchase History' },
                  { id: 'plans', label: 'D. Plan History' },
                  { id: 'withdrawals', label: 'E. Withdrawal History' },
                  { id: 'activity', label: 'F. Account Activity' },
                ] as Array<{ id: ReportSectionTab; label: string }>
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setReportTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer ${
                    reportTab === t.id
                      ? 'bg-slate-900 dark:bg-blue-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* SECTION A: BASIC INFORMATION */}
          {(reportTab === 'all' || reportTab === 'basic') && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <UserCog className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <h4 className="font-display text-base font-bold">A. Basic Information</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-slate-500">User Name</p>
                  <p className="mt-0.5 font-semibold">{activeReport.user.displayName}</p>
                </div>
                <div>
                  <p className="text-slate-500">Permanent Unique User ID</p>
                  <p className="mt-0.5 font-mono font-bold text-blue-700 dark:text-blue-400">
                    {activeReport.user.publicUserId || 'Pending Assignment'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Internal Auth UID (Admin Reference)</p>
                  <p className="mt-0.5 font-mono text-[11px] break-all">{activeReport.user.uid}</p>
                </div>
                <div>
                  <p className="text-slate-500">Registered Mobile Number</p>
                  <p className="mt-0.5 font-mono font-medium">{activeReport.user.phone || 'Not provided'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Registered Email</p>
                  <p className="mt-0.5 font-mono font-medium break-all">{activeReport.user.email || 'Not provided'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Registration Date</p>
                  <p className="mt-0.5 font-mono">{formatTimestamp(activeReport.user.createdAt)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Account Status</p>
                  <p className="mt-0.5 font-semibold capitalize">{activeReport.user.status}</p>
                </div>
                <div>
                  <p className="text-slate-500">Verification Status</p>
                  <p className="mt-0.5 font-medium">
                    Email: {activeReport.user.emailVerified ? 'Verified' : 'Unverified'} · Mobile:{' '}
                    {activeReport.user.phoneVerified ? 'Verified' : 'Unverified'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Last Login</p>
                  <p className="mt-0.5 font-mono">
                    {formatTimestamp(activeReport.user.lastLoginAt || activeReport.user.updatedAt)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SECTION B: COIN WALLET REPORT */}
          {(reportTab === 'all' || reportTab === 'wallet') && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <h4 className="font-display text-base font-bold">B. Coin Wallet Report</h4>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Current Balance</p>
                  <p className="mt-1 font-mono font-bold tabular-nums">{activeReport.summary.currentCoinBalance.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Purchased Coins</p>
                  <p className="mt-1 font-mono font-bold tabular-nums">{activeReport.summary.totalCoinsPurchased.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Added by Admin</p>
                  <p className="mt-1 font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    +{activeReport.summary.totalCoinsAddedByAdmin.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Auto Plan Credits</p>
                  <p className="mt-1 font-mono font-bold tabular-nums text-blue-700 dark:text-blue-400">
                    +{activeReport.summary.totalCoinsCreditedAutomatically.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Total Deducted</p>
                  <p className="mt-1 font-mono font-bold tabular-nums text-rose-700 dark:text-rose-400">
                    -{activeReport.summary.totalCoinsDeducted.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Coins Withdrawn</p>
                  <p className="mt-1 font-mono font-bold tabular-nums">{activeReport.summary.totalSuccessfulWithdrawalsCoins.toLocaleString()}</p>
                </div>
              </div>

              {combinedWalletHistory.length === 0 ? (
                <p className="text-xs text-slate-500">No coin wallet transactions recorded yet.</p>
              ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">Tx ID</th>
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Source / Type</th>
                        <th className="py-2 pr-4 text-right">Amount</th>
                        <th className="py-2 pr-4 text-right">Balance After</th>
                        <th className="py-2 pr-4">Reason / Description</th>
                        <th className="py-2">Actor / Ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {combinedWalletHistory.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 pr-4 font-mono">{item.id}</td>
                          <td className="py-2 pr-4 font-mono text-[11px] text-slate-500">{formatTimestamp(item.createdAt)}</td>
                          <td className="py-2 pr-4 font-medium">{item.source} · {item.type}</td>
                          <td className="py-2 pr-4 text-right font-mono font-bold tabular-nums">
                            {item.type === 'debit' ? '-' : '+'}
                            {Number(item.amount || 0).toLocaleString()}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono tabular-nums">
                            {item.balanceAfter !== null ? item.balanceAfter.toLocaleString() : '—'}
                          </td>
                          <td className="py-2 pr-4">{item.reason}</td>
                          <td className="py-2 font-mono text-[11px] text-slate-500">{item.actor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SECTION C: PURCHASE HISTORY */}
          {(reportTab === 'all' || reportTab === 'purchases') && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <h4 className="font-display text-base font-bold">C. Purchase History</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Total Purchase Amount</p>
                  <p className="mt-1 font-mono font-bold tabular-nums">
                    ₹{activeReport.summary.totalPurchaseAmountInr.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Total Successful Purchases</p>
                  <p className="mt-1 font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {activeReport.summary.totalSuccessfulPurchasesCount}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Total Failed / Expired Purchases</p>
                  <p className="mt-1 font-mono font-bold tabular-nums text-red-700 dark:text-red-400">
                    {activeReport.summary.totalFailedPurchasesCount}
                  </p>
                </div>
              </div>

              {activeReport.payments.length === 0 && activeReport.orders.length === 0 ? (
                <p className="text-xs text-slate-500">No coin top-up or storefront purchases found for this user.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">Purchase Date</th>
                        <th className="py-2 pr-4">Payment / Order Tx ID</th>
                        <th className="py-2 pr-4 text-right">Coin Quantity</th>
                        <th className="py-2 pr-4 text-right">Amount</th>
                        <th className="py-2 pr-4">Payment Method</th>
                        <th className="py-2">Payment Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {activeReport.payments.map((p) => (
                        <tr key={p.paymentId}>
                          <td className="py-2 pr-4 font-mono text-[11px] text-slate-500">{formatTimestamp(p.createdAt)}</td>
                          <td className="py-2 pr-4 font-mono">{p.paymentId}</td>
                          <td className="py-2 pr-4 text-right font-mono font-semibold tabular-nums">
                            {p.coinsRequested.toLocaleString()} Coins
                          </td>
                          <td className="py-2 pr-4 text-right font-mono tabular-nums">₹{p.amountInr.toLocaleString()}</td>
                          <td className="py-2 pr-4">{p.upiApp}</td>
                          <td className="py-2 font-semibold capitalize">{p.status.replace('_', ' ')}</td>
                        </tr>
                      ))}
                      {activeReport.orders.map((o) => (
                        <tr key={o.orderId}>
                          <td className="py-2 pr-4 font-mono text-[11px] text-slate-500">{formatTimestamp(o.createdAt)}</td>
                          <td className="py-2 pr-4 font-mono">{o.orderId}</td>
                          <td className="py-2 pr-4 text-right font-mono tabular-nums">
                            {o.productTitle} (x{o.quantity})
                          </td>
                          <td className="py-2 pr-4 text-right font-mono tabular-nums">{o.coinAmount.toLocaleString()} Coins</td>
                          <td className="py-2 pr-4">Coin Wallet Debit</td>
                          <td className="py-2 font-semibold capitalize">{o.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SECTION D: PLAN PURCHASE HISTORY */}
          {(reportTab === 'all' || reportTab === 'plans') && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <h4 className="font-display text-base font-bold">D. Plan Purchase History ({activeReport.planPurchases.length})</h4>
              </div>
              {activeReport.planPurchases.length === 0 ? (
                <p className="text-xs text-slate-500">This user has not purchased any 24h plans.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">Plan Name</th>
                        <th className="py-2 pr-4 text-right">Purchase Price</th>
                        <th className="py-2 pr-4 text-right">Duration</th>
                        <th className="py-2 pr-4 text-right">Total Scheduled</th>
                        <th className="py-2 pr-4 text-right">Credited</th>
                        <th className="py-2 pr-4 text-right">Remaining</th>
                        <th className="py-2 pr-4">Activation Date</th>
                        <th className="py-2 pr-4">Expiry Date</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {activeReport.planPurchases.map((pp) => {
                        const remaining = Math.max(0, pp.totalScheduledCredits - pp.creditedCoinsSoFar);
                        return (
                          <tr key={pp.purchaseId}>
                            <td className="py-2 pr-4 font-semibold">{pp.planName}</td>
                            <td className="py-2 pr-4 text-right font-mono tabular-nums">{pp.purchasePrice.toLocaleString()} {pp.currency}</td>
                            <td className="py-2 pr-4 text-right font-mono tabular-nums">{pp.durationDays}d</td>
                            <td className="py-2 pr-4 text-right font-mono tabular-nums">{pp.totalScheduledCredits.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                              {pp.creditedCoinsSoFar.toLocaleString()}
                            </td>
                            <td className="py-2 pr-4 text-right font-mono tabular-nums text-blue-700 dark:text-blue-400">
                              {remaining.toLocaleString()}
                            </td>
                            <td className="py-2 pr-4 font-mono text-[11px] text-slate-500">{formatTimestamp(pp.activatedAtIso)}</td>
                            <td className="py-2 pr-4 font-mono text-[11px] text-slate-500">{formatTimestamp(pp.completesAtIso)}</td>
                            <td className="py-2 font-semibold capitalize">{pp.status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SECTION E: WITHDRAWAL HISTORY */}
          {(reportTab === 'all' || reportTab === 'withdrawals') && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <h4 className="font-display text-base font-bold">E. Withdrawal History ({activeReport.withdrawals.length})</h4>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Total Requested</p>
                  <p className="mt-1 font-mono font-bold tabular-nums">{activeReport.summary.totalWithdrawalsRequestedCoins.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Total Approved</p>
                  <p className="mt-1 font-mono font-bold tabular-nums">{activeReport.summary.totalWithdrawalsApprovedCoins.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Successful (Verified)</p>
                  <p className="mt-1 font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {activeReport.summary.totalSuccessfulWithdrawalsCoins.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Rejected / Failed</p>
                  <p className="mt-1 font-mono font-bold tabular-nums text-red-700 dark:text-red-400">
                    {activeReport.summary.totalRejectedWithdrawalsCoins.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-slate-500">Pending / Processing</p>
                  <p className="mt-1 font-mono font-bold tabular-nums text-amber-700 dark:text-amber-400">
                    {activeReport.summary.pendingWithdrawalsCoins.toLocaleString()}
                  </p>
                </div>
              </div>

              {activeReport.withdrawals.length === 0 ? (
                <p className="text-xs text-slate-500">No withdrawal requests submitted by this user.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">Request ID</th>
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4 text-right">Amount</th>
                        <th className="py-2 pr-4">Channel</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Payout Reference #</th>
                        <th className="py-2">Admin Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {activeReport.withdrawals.map((wd) => {
                        const meta = WD_STATUS_LABEL[wd.status] || WD_STATUS_LABEL.pending;
                        return (
                          <tr key={wd.withdrawalId}>
                            <td className="py-2 pr-4 font-mono">{wd.withdrawalId}</td>
                            <td className="py-2 pr-4 font-mono text-[11px] text-slate-500">{formatTimestamp(wd.createdAt)}</td>
                            <td className="py-2 pr-4 text-right font-mono font-semibold tabular-nums">
                              {wd.amountCoins.toLocaleString()} Coins
                            </td>
                            <td className="py-2 pr-4">{wd.payoutChannel} ({wd.accountLabel})</td>
                            <td className={`py-2 pr-4 font-semibold ${meta.cls}`}>
                              {meta.label}
                              {wd.status === 'successful' && wd.providerConfirmed ? (
                                <CheckCircle2 className="w-3 h-3 inline ml-1" />
                              ) : null}
                            </td>
                            <td className="py-2 pr-4 font-mono">{wd.payoutReferenceNumber || '—'}</td>
                            <td className="py-2 text-slate-500">{wd.adminNote || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SECTION F: ACCOUNT ACTIVITY & ADMIN AUDIT */}
          {(reportTab === 'all' || reportTab === 'activity') && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <h4 className="font-display text-base font-bold">
                  F. Account Activity &amp; Security Audit Trail ({activeReport.activityLogs.length + activeReport.auditLogs.length})
                </h4>
              </div>
              {activeReport.activityLogs.length === 0 && activeReport.auditLogs.length === 0 ? (
                <p className="text-xs text-slate-500">No security or admin audit events recorded for this account yet.</p>
              ) : (
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">Timestamp</th>
                        <th className="py-2 pr-4">Event / Action</th>
                        <th className="py-2 pr-4">Details</th>
                        <th className="py-2">Actor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {activeReport.auditLogs.map((a) => (
                        <tr key={a.auditId}>
                          <td className="py-2 pr-4 font-mono text-[11px] text-slate-500">{formatTimestamp(a.createdAt)}</td>
                          <td className="py-2 pr-4 font-mono font-semibold">{a.actionType}</td>
                          <td className="py-2 pr-4">{a.reason || a.details}</td>
                          <td className="py-2 text-slate-500">{a.adminEmail}</td>
                        </tr>
                      ))}
                      {activeReport.activityLogs.map((s) => (
                        <tr key={s.logId}>
                          <td className="py-2 pr-4 font-mono text-[11px] text-slate-500">{formatTimestamp(s.createdAt)}</td>
                          <td className="py-2 pr-4 font-mono font-semibold">{s.action}</td>
                          <td className="py-2 pr-4">{s.details}</td>
                          <td className="py-2 text-slate-500">{s.actorEmail || s.actorUid}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
