import { type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  AdminAuditLogRecord,
  AdminRoleRecord,
  AdminSettings,
  AiFeatureSettings,
  CoinPackage,
  CoinRequest,
  GatewayConfig,
  PaymentConfiguration,
  PlanConfig,
  Product,
  SandboxPayment,
  SupportCategory,
  UpiAppOption,
  UserProfile,
  UserStatus,
  Wallet,
  WithdrawalRequest,
  WithdrawalStatus,
  formatSequentialUserId,
  makeSafeId,
  toMillis,
} from '../types/platform';
import {
  attestLedgerActionApi,
  createSandboxIntentApi,
  syncAdminRoleApi,
  triggerSandboxWebhookApi,
} from './api';
import { OperationType, db, handleFirestoreError } from './firebase';
import {
  DEFAULT_ADMIN_SETTINGS,
  DEFAULT_AI_FEATURE_SETTINGS,
  DEFAULT_GATEWAY_CONFIG,
  INITIAL_CATALOG_SEED,
  INITIAL_COIN_PACKAGES,
  INITIAL_PAYMENT_CONFIGURATIONS,
  INITIAL_PLAN_CONFIGS,
  computeDailyScheduleAmounts,
} from './seedData';

const BOOTSTRAPPED_SUPER_ADMIN_EMAIL = 'arvisaini16@gmail.com';

export async function logSecurityEvent(params: {
  actorUid: string;
  actorEmail: string;
  action: string;
  severity: 'info' | 'warning' | 'critical';
  targetId: string;
  details: string;
}) {
  const logId = makeSafeId('log');
  const path = `security_logs/${logId}`;
  try {
    await setDoc(doc(db, 'security_logs', logId), {
      logId,
      actorUid: params.actorUid,
      actorEmail: params.actorEmail.slice(0, 160),
      action: params.action.slice(0, 120),
      severity: params.severity,
      targetId: params.targetId.slice(0, 128),
      details: params.details.slice(0, 500),
      ipHint: 'web-client',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function ensureUserBootstrap(user: User): Promise<{ isAdmin: boolean }> {
  const uid = user.uid;
  const email = (user.email || '').toLowerCase();
  const isBootstrappedAdmin = email === BOOTSTRAPPED_SUPER_ADMIN_EMAIL;

  const userRef = doc(db, 'users', uid);
  const counterRef = doc(db, 'userCounters', 'users');
  const walletRef = doc(db, 'wallets', uid);

  try {
    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) {
        const counterSnap = await tx.get(counterRef);
        const nextSeq = counterSnap.exists() ? Number(counterSnap.data()?.lastSeq || 0) + 1 : 1;
        const publicUserId = formatSequentialUserId(nextSeq);
        const refCode = `KST${uid.slice(0, 6).toUpperCase()}`;

        if (counterSnap.exists()) {
          tx.update(counterRef, { lastSeq: nextSeq, updatedAt: serverTimestamp() });
        } else {
          tx.set(counterRef, { counterId: 'users', lastSeq: nextSeq, updatedAt: serverTimestamp() });
        }

        tx.set(userRef, {
          uid,
          publicUserId,
          displayName: (user.displayName || email.split('@')[0] || 'Member').slice(0, 100),
          email: email.slice(0, 160),
          phone: (user.phoneNumber || '').slice(0, 32),
          phoneVerified: Boolean(user.phoneNumber),
          emailVerified: Boolean(user.emailVerified),
          photoURL: (user.photoURL || '').slice(0, 500),
          referralCode: refCode,
          referredBy: '',
          status: 'active',
          role: 'user',
          authMethod: 'google',
          twoFactorEnabled: false,
          privacyProfileVisible: false,
          privacyAnalyticsOptIn: true,
          lastLoginAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.update(userRef, {
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }

  try {
    const walletSnap = await getDoc(walletRef);
    if (!walletSnap.exists()) {
      await setDoc(walletRef, {
        userId: uid,
        availableCoins: 0,
        pendingCoins: 0,
        totalPurchasedCoins: 0,
        totalCreditedCoins: 0,
        totalDebitedCoins: 0,
        simulatedCommissionBalance: 0,
        lastTxId: 'init',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `wallets/${uid}`);
  }

  let hasAdminDoc = false;
  try {
    const adminSnap = await getDoc(doc(db, 'admins', uid));
    hasAdminDoc = adminSnap.exists();
  } catch {
    hasAdminDoc = false;
  }

  if (isBootstrappedAdmin && !hasAdminDoc) {
    try {
      await setDoc(doc(db, 'admins', uid), {
        uid,
        email,
        role: 'super_admin',
        permissions: ['users', 'products', 'plans', 'ledger', 'withdrawals', 'support', 'ai', 'config'],
        grantedBy: 'system_bootstrap',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      hasAdminDoc = true;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `admins/${uid}`);
    }
  }

  if (isBootstrappedAdmin || hasAdminDoc) {
    await seedPlatformDefaultsIfNeeded(email);
  }

  return { isAdmin: isBootstrappedAdmin || hasAdminDoc };
}

export async function seedPlatformDefaultsIfNeeded(adminEmail: string) {
  try {
    const productsSnap = await getDocs(query(collection(db, 'products'), limit(1)));
    if (productsSnap.empty) {
      const batch = writeBatch(db);
      for (const item of INITIAL_CATALOG_SEED) {
        batch.set(doc(db, 'products', item.productId), {
          ...item,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products');
  }

  try {
    const pkgSnap = await getDocs(query(collection(db, 'coinPackages'), limit(1)));
    if (pkgSnap.empty) {
      const batch = writeBatch(db);
      for (const pkg of INITIAL_COIN_PACKAGES) {
        batch.set(doc(db, 'coinPackages', pkg.packageId), {
          ...pkg,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'coinPackages');
  }

  try {
    const plansSnap = await getDocs(query(collection(db, 'plans'), limit(1)));
    if (plansSnap.empty) {
      const batch = writeBatch(db);
      for (const pl of INITIAL_PLAN_CONFIGS) {
        batch.set(doc(db, 'plans', pl.planId), {
          ...pl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'plans');
  }

  try {
    const payCfgSnap = await getDocs(query(collection(db, 'paymentConfigurations'), limit(1)));
    if (payCfgSnap.empty) {
      const batch = writeBatch(db);
      for (const cfg of INITIAL_PAYMENT_CONFIGURATIONS) {
        batch.set(doc(db, 'paymentConfigurations', cfg.configId), {
          ...cfg,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'paymentConfigurations');
  }

  try {
    const cfgSnap = await getDoc(doc(db, 'gateway_config', 'default'));
    if (!cfgSnap.exists()) {
      await setDoc(doc(db, 'gateway_config', 'default'), {
        ...DEFAULT_GATEWAY_CONFIG,
        updatedBy: adminEmail.slice(0, 160),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'gateway_config/default');
  }

  try {
    const adminSettingsSnap = await getDoc(doc(db, 'adminSettings', 'default'));
    if (!adminSettingsSnap.exists()) {
      await setDoc(doc(db, 'adminSettings', 'default'), {
        ...DEFAULT_ADMIN_SETTINGS,
        updatedBy: adminEmail.slice(0, 160),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'adminSettings/default');
  }

  try {
    const aiSettingsSnap = await getDoc(doc(db, 'aiFeatureSettings', 'default'));
    if (!aiSettingsSnap.exists()) {
      await setDoc(doc(db, 'aiFeatureSettings', 'default'), {
        ...DEFAULT_AI_FEATURE_SETTINGS,
        updatedBy: adminEmail.slice(0, 160),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'aiFeatureSettings/default');
  }
}

export async function updateUserProfileFields(
  uid: string,
  updates: Partial<
    Pick<
      UserProfile,
      'displayName' | 'phone' | 'phoneVerified' | 'twoFactorEnabled' | 'privacyProfileVisible' | 'privacyAnalyticsOptIn'
    >
  >
) {
  try {
    await updateDoc(doc(db, 'users', uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function initiateSandboxUpiPayment(params: {
  user: User;
  amountInr: number;
  upiApp: UpiAppOption;
  config: GatewayConfig;
  idempotencyKey: string;
}) {
  const intent = await createSandboxIntentApi({
    amountInr: params.amountInr,
    coinRateInr: params.config.coinRateInr,
    upiApp: params.upiApp,
    idempotencyKey: params.idempotencyKey,
    sandboxVpa: params.config.sandboxVpa,
    merchantName: params.config.merchantName,
  });

  const paymentDoc: Record<string, unknown> = {
    paymentId: intent.paymentId,
    userId: params.user.uid,
    userEmail: (params.user.email || '').slice(0, 160),
    idempotencyKey: params.idempotencyKey,
    amountInr: params.amountInr,
    coinsRequested: intent.coinsRequested,
    upiApp: params.upiApp,
    assignedConfigId: intent.assignedConfigId || 'default',
    sandboxUpiId: intent.sandboxVpa,
    gatewayProvider: (intent.gatewayProvider || params.config.providerName).slice(0, 64),
    status: 'initiated',
    webhookEventId: '',
    serverSignature: intent.serverSignature,
    failureReason: '',
    isSimulated: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'payments', intent.paymentId), paymentDoc);
    batch.set(doc(db, 'paymentRequests', intent.paymentId), paymentDoc);
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `payments/${intent.paymentId}`);
  }

  return intent;
}

export async function simulateSandboxWebhook(params: {
  user: User;
  payment: SandboxPayment;
  outcome: 'success' | 'failed';
}) {
  const webhook = await triggerSandboxWebhookApi({
    paymentId: params.payment.paymentId,
    amountInr: params.payment.amountInr,
    coinsRequested: params.payment.coinsRequested,
    outcome: params.outcome,
  });

  const batch = writeBatch(db);
  const paymentPatch = {
    status: webhook.status,
    webhookEventId: webhook.webhookEventId,
    serverSignature: webhook.serverSignature,
    failureReason: webhook.failureReason,
    updatedAt: serverTimestamp(),
  };
  batch.update(doc(db, 'payments', params.payment.paymentId), paymentPatch);
  batch.set(
    doc(db, 'paymentRequests', params.payment.paymentId),
    { ...params.payment, ...paymentPatch, updatedAt: serverTimestamp() },
    { merge: true }
  );

  let requestId = '';
  if (webhook.status === 'webhook_verified') {
    requestId = makeSafeId('creq');
    batch.set(doc(db, 'coin_requests', requestId), {
      requestId,
      userId: params.user.uid,
      paymentId: params.payment.paymentId,
      amountInr: params.payment.amountInr,
      coinsRequested: params.payment.coinsRequested,
      status: 'pending',
      adminNote: '',
      reviewedBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  const notifId = makeSafeId('ntf');
  batch.set(doc(db, 'notifications', notifId), {
    notificationId: notifId,
    userId: params.user.uid,
    title:
      webhook.status === 'webhook_verified'
        ? 'Sandbox Payment Verified — Pending Admin Credit'
        : 'Sandbox Payment Failed',
    body:
      webhook.status === 'webhook_verified'
        ? `Ref ${params.payment.paymentId} verified in sandbox. Coin request ${requestId} queued for admin ledger approval.`
        : `Ref ${params.payment.paymentId} failed: ${webhook.failureReason}`,
    category: 'payment',
    read: false,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `payments/${params.payment.paymentId}`);
  }

  await logSecurityEvent({
    actorUid: params.user.uid,
    actorEmail: params.user.email || '',
    action: webhook.status === 'webhook_verified' ? 'SANDBOX_PAYMENT_WEBHOOK_VERIFIED' : 'SANDBOX_PAYMENT_FAILED',
    severity: webhook.status === 'failed' ? 'warning' : 'info',
    targetId: params.payment.paymentId,
    details:
      webhook.status === 'webhook_verified'
        ? `Webhook ${webhook.webhookEventId} verified for ${params.payment.coinsRequested} coins.`
        : webhook.failureReason,
  });

  return { ...webhook, requestId };
}

export async function purchasePlanWithSnapshot(params: {
  user: User;
  wallet: Wallet;
  plan: PlanConfig;
}) {
  if (params.wallet.availableCoins < params.plan.purchasePrice) {
    throw new Error('Insufficient available coins for this plan.');
  }
  if (params.plan.status !== 'active') {
    throw new Error('This plan is currently disabled or archived.');
  }

  const purchaseId = makeSafeId('ppur');
  const attestation = await attestLedgerActionApi({
    actionType: 'debit',
    targetUserId: params.user.uid,
    amount: params.plan.purchasePrice,
    referenceId: purchaseId,
  });

  const nowMs = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const activatedAtIso = new Date(nowMs).toISOString();
  const completesAtIso = new Date(nowMs + params.plan.durationDays * DAY_MS).toISOString();
  const nextCreditAtIso = new Date(nowMs + DAY_MS).toISOString();
  const dailyAmounts = computeDailyScheduleAmounts(params.plan.totalScheduledCredits, params.plan.durationDays);
  const newBalance = params.wallet.availableCoins - params.plan.purchasePrice;
  const newDebited = (params.wallet.totalDebitedCoins || 0) + params.plan.purchasePrice;
  const notifId = makeSafeId('ntf');
  const batch = writeBatch(db);

  batch.set(doc(db, 'planPurchases', purchaseId), {
    purchaseId,
    userId: params.user.uid,
    planId: params.plan.planId,
    planName: params.plan.name.slice(0, 140),
    purchasePrice: params.plan.purchasePrice,
    currency: params.plan.currency,
    durationDays: params.plan.durationDays,
    totalScheduledCredits: params.plan.totalScheduledCredits,
    creditIntervalHours: 24,
    completedEvents: 0,
    totalEvents: dailyAmounts.length,
    creditedCoinsSoFar: 0,
    status: 'active',
    activatedAtIso,
    completesAtIso,
    nextCreditAtIso,
    termsSnapshot: params.plan.terms.slice(0, 1000),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  dailyAmounts.forEach((coins, idx) => {
    const scheduleId = makeSafeId('psch');
    batch.set(doc(db, 'planCreditSchedules', scheduleId), {
      scheduleId,
      purchaseId,
      userId: params.user.uid,
      eventIndex: idx + 1,
      scheduledCoins: coins,
      dueAtIso: new Date(nowMs + (idx + 1) * DAY_MS).toISOString(),
      status: 'pending',
      creditedAtIso: '',
      txId: '',
    });
  });

  batch.update(doc(db, 'wallets', params.user.uid), {
    availableCoins: newBalance,
    totalDebitedCoins: newDebited,
    lastTxId: purchaseId,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'wallet_ledger', attestation.txId), {
    txId: attestation.txId,
    userId: params.user.uid,
    type: 'debit',
    amount: params.plan.purchasePrice,
    balanceAfter: newBalance,
    referenceId: purchaseId,
    serverSignature: attestation.serverSignature,
    description: `Plan Activated: ${params.plan.name} (${params.plan.durationDays}d · ${params.plan.totalScheduledCredits} credits)`,
    status: 'completed',
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'notifications', notifId), {
    notificationId: notifId,
    userId: params.user.uid,
    title: `Plan Activated: ${params.plan.name}`,
    body: `Deducted ${params.plan.purchasePrice} coins. First 24h credit (${dailyAmounts[0]} coins) scheduled for ${new Date(nextCreditAtIso).toLocaleString()}.`,
    category: 'plan',
    read: false,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `planPurchases/${purchaseId}`);
  }

  return { purchaseId, txId: attestation.txId };
}

export async function executeAtomicProductPurchase(params: {
  user: User;
  wallet: Wallet;
  product: Product;
  quantity: number;
}) {
  const totalCost = params.product.coinPrice * params.quantity;
  if (params.wallet.availableCoins < totalCost) {
    throw new Error('Insufficient available coins for this purchase.');
  }
  if (!params.product.active) {
    throw new Error('This product or plan is currently disabled.');
  }

  const orderId = makeSafeId('ord');
  const attestation = await attestLedgerActionApi({
    actionType: 'debit',
    targetUserId: params.user.uid,
    amount: totalCost,
    referenceId: orderId,
  });

  const newBalance = params.wallet.availableCoins - totalCost;
  const newDebited = (params.wallet.totalDebitedCoins || 0) + totalCost;
  const notifId = makeSafeId('ntf');
  const batch = writeBatch(db);

  batch.set(doc(db, 'orders', orderId), {
    orderId,
    userId: params.user.uid,
    productId: params.product.productId,
    productTitle: params.product.title.slice(0, 160),
    itemType: params.product.itemType,
    quantity: params.quantity,
    coinAmount: totalCost,
    status: 'completed',
    referenceId: attestation.txId,
    serverSignature: attestation.serverSignature,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'wallets', params.user.uid), {
    availableCoins: newBalance,
    totalDebitedCoins: newDebited,
    lastTxId: orderId,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'wallet_ledger', attestation.txId), {
    txId: attestation.txId,
    userId: params.user.uid,
    type: 'debit',
    amount: totalCost,
    balanceAfter: newBalance,
    referenceId: orderId,
    serverSignature: attestation.serverSignature,
    description: `Purchased ${params.quantity}x ${params.product.title}`.slice(0, 300),
    status: 'completed',
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'notifications', notifId), {
    notificationId: notifId,
    userId: params.user.uid,
    title: 'Order Confirmed',
    body: `Purchased ${params.quantity}x ${params.product.title} for ${totalCost} coins (Ref ${orderId}).`,
    category: 'wallet',
    read: false,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `orders/${orderId}`);
  }

  return { orderId, txId: attestation.txId };
}

export async function submitSimulatedWithdrawalRequest(params: {
  user: User;
  amountCoins: number;
  coinRateInr: number;
  payoutChannel: 'Simulated Bank Transfer' | 'Simulated UPI Sandbox';
  accountLabel: string;
}) {
  const withdrawalId = makeSafeId('wd');
  const equivalentInr = Math.round((params.amountCoins / Math.max(1, params.coinRateInr)) * 100) / 100;

  try {
    await setDoc(doc(db, 'withdrawalRequests', withdrawalId), {
      withdrawalId,
      userId: params.user.uid,
      userName: (params.user.displayName || params.user.email?.split('@')[0] || 'Member').slice(0, 120),
      userEmail: (params.user.email || '').slice(0, 160),
      amountCoins: params.amountCoins,
      equivalentInr,
      payoutChannel: params.payoutChannel,
      accountLabel: params.accountLabel.trim().slice(0, 120),
      status: 'pending',
      payoutReferenceNumber: '',
      providerConfirmed: false,
      debitedFromWallet: false,
      adminNote: '',
      reviewedBy: '',
      isSimulated: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `withdrawalRequests/${withdrawalId}`);
  }

  await logSecurityEvent({
    actorUid: params.user.uid,
    actorEmail: params.user.email || '',
    action: 'SIMULATED_WITHDRAWAL_REQUESTED',
    severity: params.amountCoins >= 10000 ? 'warning' : 'info',
    targetId: withdrawalId,
    details: `Requested simulated withdrawal of ${params.amountCoins} coins via ${params.payoutChannel}.`,
  });

  return withdrawalId;
}

export async function createSupportTicketWithMessage(params: {
  user: User;
  category: SupportCategory;
  subject: string;
  description: string;
  attachmentName: string;
  attachmentDataUrl: string;
}) {
  const ticketId = makeSafeId('tkt');
  const messageId = makeSafeId('msg');
  const batch = writeBatch(db);

  batch.set(doc(db, 'support_tickets', ticketId), {
    ticketId,
    userId: params.user.uid,
    userEmail: (params.user.email || '').slice(0, 160),
    category: params.category,
    subject: params.subject.trim().slice(0, 160),
    description: params.description.trim().slice(0, 2000),
    attachmentName: params.attachmentName.slice(0, 160),
    attachmentDataUrl: params.attachmentDataUrl.slice(0, 200000),
    status: 'open',
    priority: params.category === 'Payment problem' || params.category === 'Withdrawal problem' ? 'high' : 'normal',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'support_tickets', ticketId, 'messages', messageId), {
    messageId,
    ticketId,
    senderId: params.user.uid,
    senderRole: 'user',
    senderName: (params.user.displayName || params.user.email || 'User').slice(0, 120),
    body: params.description.trim().slice(0, 2000),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `support_tickets/${ticketId}`);
  }

  return ticketId;
}

export async function postSupportReply(params: {
  ticketId: string;
  sender: User;
  senderRole: 'user' | 'admin';
  body: string;
}) {
  const messageId = makeSafeId('msg');
  try {
    await setDoc(doc(db, 'support_tickets', params.ticketId, 'messages', messageId), {
      messageId,
      ticketId: params.ticketId,
      senderId: params.sender.uid,
      senderRole: params.senderRole,
      senderName: (params.sender.displayName || params.sender.email || params.senderRole).slice(0, 120),
      body: params.body.trim().slice(0, 2000),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `support_tickets/${params.ticketId}/messages/${messageId}`);
  }
}

// --- Admin Operations ---

export async function adminApproveCoinRequest(params: {
  adminUser: User;
  coinRequest: CoinRequest;
  targetWallet: Wallet;
  adminNote: string;
}) {
  const attestation = await attestLedgerActionApi({
    actionType: 'credit',
    targetUserId: params.coinRequest.userId,
    amount: params.coinRequest.coinsRequested,
    referenceId: params.coinRequest.requestId,
  });

  const newBalance = params.targetWallet.availableCoins + params.coinRequest.coinsRequested;
  const newPurchased = params.targetWallet.totalPurchasedCoins + params.coinRequest.coinsRequested;
  const newCredited = (params.targetWallet.totalCreditedCoins || 0) + params.coinRequest.coinsRequested;
  const notifId = makeSafeId('ntf');
  const batch = writeBatch(db);

  batch.update(doc(db, 'coin_requests', params.coinRequest.requestId), {
    status: 'approved',
    adminNote: (params.adminNote || 'Approved after sandbox payment verification').slice(0, 400),
    reviewedBy: (params.adminUser.email || '').slice(0, 160),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'payments', params.coinRequest.paymentId), {
    status: 'credited',
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'wallets', params.coinRequest.userId), {
    availableCoins: newBalance,
    totalPurchasedCoins: newPurchased,
    totalCreditedCoins: newCredited,
    lastTxId: attestation.txId,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'wallet_ledger', attestation.txId), {
    txId: attestation.txId,
    userId: params.coinRequest.userId,
    type: 'credit',
    amount: params.coinRequest.coinsRequested,
    balanceAfter: newBalance,
    referenceId: params.coinRequest.requestId,
    serverSignature: attestation.serverSignature,
    description: `Sandbox coin top-up approved (Payment ${params.coinRequest.paymentId})`.slice(0, 300),
    status: 'completed',
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'notifications', notifId), {
    notificationId: notifId,
    userId: params.coinRequest.userId,
    title: 'Coins Credited to Wallet',
    body: `${params.coinRequest.coinsRequested} coins have been credited to your wallet (Ref ${attestation.txId}).`,
    category: 'wallet',
    read: false,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `coin_requests/${params.coinRequest.requestId}`);
  }

  await logSecurityEvent({
    actorUid: params.adminUser.uid,
    actorEmail: params.adminUser.email || '',
    action: 'ADMIN_COIN_REQUEST_APPROVED',
    severity: 'info',
    targetId: params.coinRequest.requestId,
    details: `Credited ${params.coinRequest.coinsRequested} coins to ${params.coinRequest.userId}.`,
  });
}

export async function adminGrantSandboxCoins(params: {
  adminUser: User;
  targetWallet: Wallet;
  amountCoins: number;
  reason: string;
}) {
  const refId = makeSafeId('adj');
  const attestation = await attestLedgerActionApi({
    actionType: 'adjustment',
    targetUserId: params.targetWallet.userId,
    amount: params.amountCoins,
    referenceId: refId,
  });

  const newBalance = params.targetWallet.availableCoins + params.amountCoins;
  const newCredited = (params.targetWallet.totalCreditedCoins || 0) + params.amountCoins;
  const notifId = makeSafeId('ntf');
  const batch = writeBatch(db);

  batch.update(doc(db, 'wallets', params.targetWallet.userId), {
    availableCoins: newBalance,
    totalCreditedCoins: newCredited,
    lastTxId: attestation.txId,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'wallet_ledger', attestation.txId), {
    txId: attestation.txId,
    userId: params.targetWallet.userId,
    type: 'adjustment',
    amount: params.amountCoins,
    balanceAfter: newBalance,
    referenceId: refId,
    serverSignature: attestation.serverSignature,
    description: (params.reason || 'Admin sandbox ledger credit').slice(0, 300),
    status: 'completed',
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'notifications', notifId), {
    notificationId: notifId,
    userId: params.targetWallet.userId,
    title: 'Admin Ledger Adjustment',
    body: `${params.amountCoins} sandbox coins credited: ${params.reason}`,
    category: 'wallet',
    read: false,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `wallets/${params.targetWallet.userId}`);
  }

  await logSecurityEvent({
    actorUid: params.adminUser.uid,
    actorEmail: params.adminUser.email || '',
    action: 'ADMIN_LEDGER_ADJUSTMENT',
    severity: 'warning',
    targetId: params.targetWallet.userId,
    details: `Granted ${params.amountCoins} coins (${params.reason}).`,
  });
}

export async function adminRejectCoinRequest(params: {
  adminUser: User;
  coinRequest: CoinRequest;
  adminNote: string;
}) {
  const notifId = makeSafeId('ntf');
  const batch = writeBatch(db);

  batch.update(doc(db, 'coin_requests', params.coinRequest.requestId), {
    status: 'rejected',
    adminNote: (params.adminNote || 'Rejected during manual review').slice(0, 400),
    reviewedBy: (params.adminUser.email || '').slice(0, 160),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'notifications', notifId), {
    notificationId: notifId,
    userId: params.coinRequest.userId,
    title: 'Coin Addition Request Rejected',
    body: `Request ${params.coinRequest.requestId} was rejected: ${params.adminNote || 'Verification incomplete.'}`,
    category: 'payment',
    read: false,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `coin_requests/${params.coinRequest.requestId}`);
  }
}

export async function adminRefundSandboxPayment(params: {
  adminUser: User;
  payment: SandboxPayment;
  wallet?: Wallet;
}) {
  const attestation = await attestLedgerActionApi({
    actionType: 'refund',
    targetUserId: params.payment.userId,
    amount: params.payment.coinsRequested,
    referenceId: params.payment.paymentId,
  });

  const batch = writeBatch(db);
  batch.update(doc(db, 'payments', params.payment.paymentId), {
    status: 'refunded',
    updatedAt: serverTimestamp(),
  });

  if (params.payment.status === 'credited' && params.wallet) {
    const updatedCoins = Math.max(0, params.wallet.availableCoins - params.payment.coinsRequested);
    batch.update(doc(db, 'wallets', params.payment.userId), {
      availableCoins: updatedCoins,
      lastTxId: attestation.txId,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'wallet_ledger', attestation.txId), {
      txId: attestation.txId,
      userId: params.payment.userId,
      type: 'refund',
      amount: params.payment.coinsRequested,
      balanceAfter: updatedCoins,
      referenceId: params.payment.paymentId,
      serverSignature: attestation.serverSignature,
      description: `Sandbox payment ${params.payment.paymentId} refunded & coins reversed`.slice(0, 300),
      status: 'reversed',
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `payments/${params.payment.paymentId}`);
  }

  await logSecurityEvent({
    actorUid: params.adminUser.uid,
    actorEmail: params.adminUser.email || '',
    action: 'SANDBOX_PAYMENT_REFUNDED',
    severity: 'warning',
    targetId: params.payment.paymentId,
    details: `Refunded sandbox payment ${params.payment.paymentId} for ${params.payment.userEmail}.`,
  });
}

export async function adminAdjustUserCoinsFirestore(params: {
  adminUser: User;
  targetUserId: string;
  action: 'add' | 'deduct';
  amountCoins: number;
  reason: string;
  idempotencyKey: string;
}): Promise<{ txId: string; balanceAfter: number }> {
  const amt = Math.floor(Number(params.amountCoins) || 0);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('Coin amount must be a positive whole number.');
  }
  const cleanReason = params.reason.trim().slice(0, 300);
  if (cleanReason.length < 3) {
    throw new Error('Transaction reason (min 3 characters) is required.');
  }
  const cleanIdem = params.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || makeSafeId('idem');
  const txId = cleanIdem.startsWith('wtx_') ? cleanIdem : `wtx_${cleanIdem}`;

  const attestation = await attestLedgerActionApi({
    actionType: 'adjustment',
    targetUserId: params.targetUserId,
    amount: amt,
    referenceId: txId,
  });

  const auditId = makeSafeId('aud');
  const notifId = makeSafeId('ntf');
  const logId = makeSafeId('log');
  const adminEmail = (params.adminUser.email || '').slice(0, 160);

  let nextBalance = 0;

  try {
    await runTransaction(db, async (tx) => {
      const txRef = doc(db, 'walletTransactions', txId);
      const existingTxSnap = await tx.get(txRef);
      if (existingTxSnap.exists()) {
        throw new Error('Duplicate transaction blocked by idempotency guard.');
      }

      const walletRef = doc(db, 'wallets', params.targetUserId);
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists()) {
        throw new Error('Target user wallet not found.');
      }
      const walletData = walletSnap.data() as Wallet;
      const balanceBefore = Number(walletData.availableCoins || 0);

      if (params.action === 'deduct' && balanceBefore < amt) {
        throw new Error(
          `Insufficient wallet balance (${balanceBefore.toLocaleString()} coins available). Negative balances are prohibited.`
        );
      }

      nextBalance = params.action === 'add' ? balanceBefore + amt : balanceBefore - amt;
      const nextCredited = (Number(walletData.totalCreditedCoins) || 0) + (params.action === 'add' ? amt : 0);
      const nextDebited = (Number(walletData.totalDebitedCoins) || 0) + (params.action === 'deduct' ? amt : 0);

      tx.update(walletRef, {
        availableCoins: nextBalance,
        totalCreditedCoins: nextCredited,
        totalDebitedCoins: nextDebited,
        lastTxId: txId,
        updatedAt: serverTimestamp(),
      });

      tx.set(txRef, {
        txId,
        idempotencyKey: cleanIdem,
        userId: params.targetUserId,
        adminId: params.adminUser.uid,
        adminEmail,
        action: params.action,
        amount: amt,
        balanceBefore,
        balanceAfter: nextBalance,
        reason: cleanReason,
        status: 'completed',
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'wallet_ledger', attestation.txId), {
        txId: attestation.txId,
        userId: params.targetUserId,
        type: 'adjustment',
        amount: amt,
        balanceAfter: nextBalance,
        referenceId: txId,
        serverSignature: attestation.serverSignature,
        description: `Admin ${params.action === 'add' ? 'Credit' : 'Deduction'}: ${cleanReason}`.slice(0, 300),
        status: 'completed',
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'adminAuditLogs', auditId), {
        auditId,
        adminId: params.adminUser.uid,
        adminEmail,
        actionType: params.action === 'add' ? 'COIN_ADD' : 'COIN_DEDUCT',
        targetUserId: params.targetUserId,
        targetEntityId: txId,
        amount: amt,
        reason: cleanReason,
        payoutReferenceNumber: '',
        details: `${params.action === 'add' ? 'Added' : 'Deducted'} ${amt} coins (${balanceBefore} -> ${nextBalance}).`,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'notifications', notifId), {
        notificationId: notifId,
        userId: params.targetUserId,
        title: params.action === 'add' ? `Wallet Credited: +${amt} Coins` : `Wallet Deducted: -${amt} Coins`,
        body: `${params.action === 'add' ? 'Added' : 'Deducted'} ${amt} coins by Admin (${cleanReason}). Updated balance: ${nextBalance.toLocaleString()} coins.`,
        category: 'wallet',
        read: false,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'security_logs', logId), {
        logId,
        actorUid: params.adminUser.uid,
        actorEmail: adminEmail,
        action: params.action === 'add' ? 'ADMIN_COIN_ADDED' : 'ADMIN_COIN_DEDUCTED',
        severity: 'warning',
        targetId: params.targetUserId,
        details: `${params.action === 'add' ? '+' : '-'}${amt} coins (${balanceBefore} -> ${nextBalance}): ${cleanReason}`.slice(0, 500),
        ipHint: 'web-client',
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('idempotency') ||
        error.message.includes('Negative balances') ||
        error.message.includes('not found'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `wallets/${params.targetUserId}`);
  }

  return { txId, balanceAfter: nextBalance };
}

export async function adminUpdateWithdrawalStatusFirestore(params: {
  adminUser: User;
  withdrawal: WithdrawalRequest;
  status: WithdrawalStatus;
  reason: string;
  payoutReferenceNumber: string;
  providerConfirmed: boolean;
}) {
  const cleanReason = params.reason.trim().slice(0, 400);
  const cleanRef = params.payoutReferenceNumber.trim().slice(0, 128);

  if ((params.status === 'rejected' || params.status === 'failed') && cleanReason.length < 3) {
    throw new Error(`A detailed reason (min 3 characters) is required when marking a withdrawal ${params.status}.`);
  }
  if (params.status === 'successful' && (!params.providerConfirmed || cleanRef.length < 4)) {
    throw new Error(
      'Withdrawal can only be marked Successful after authorized payout provider confirmation and a valid Payout Reference Number (min 4 chars).'
    );
  }

  const attestation = await attestLedgerActionApi({
    actionType: params.status === 'rejected' || params.status === 'failed' ? 'refund' : 'debit',
    targetUserId: params.withdrawal.userId,
    amount: params.withdrawal.amountCoins,
    referenceId: params.withdrawal.withdrawalId,
  });

  const auditId = makeSafeId('aud');
  const notifId = makeSafeId('ntf');
  const logId = makeSafeId('log');
  const adminEmail = (params.adminUser.email || '').slice(0, 160);

  const actionType: AdminAuditLogRecord['actionType'] =
    params.status === 'approved'
      ? 'WITHDRAWAL_APPROVED'
      : params.status === 'rejected'
      ? 'WITHDRAWAL_REJECTED'
      : params.status === 'successful'
      ? 'WITHDRAWAL_SUCCESSFUL'
      : params.status === 'failed'
      ? 'WITHDRAWAL_FAILED'
      : 'WITHDRAWAL_STATUS_UPDATE';

  const statusLabels: Record<WithdrawalStatus, string> = {
    pending: 'Pending',
    under_review: 'Under Review',
    approved: 'Approved',
    processing: 'Processing',
    successful: 'Successful',
    rejected: 'Rejected',
    failed: 'Failed',
  };

  try {
    await runTransaction(db, async (tx) => {
      const reqRef = doc(db, 'withdrawalRequests', params.withdrawal.withdrawalId);
      const reqSnap = await tx.get(reqRef);
      const legacyRef = doc(db, 'withdrawals', params.withdrawal.withdrawalId);
      const legacySnap = reqSnap.exists() ? null : await tx.get(legacyRef);

      const targetRef = reqSnap.exists() ? reqRef : legacyRef;
      const targetSnap = reqSnap.exists() ? reqSnap : legacySnap;
      if (!targetSnap || !targetSnap.exists()) {
        throw new Error('Withdrawal request document not found.');
      }

      const wdData = targetSnap.data() as WithdrawalRequest;
      const walletRef = doc(db, 'wallets', wdData.userId);
      const walletSnap = await tx.get(walletRef);

      const alreadyDebited = Boolean(wdData.debitedFromWallet);
      const shouldDebit = params.status === 'approved' || params.status === 'processing' || params.status === 'successful';
      const shouldRefund = params.status === 'rejected' || params.status === 'failed';
      let nextDebited = alreadyDebited;

      if (shouldDebit && !alreadyDebited) {
        if (!walletSnap.exists()) {
          throw new Error('User wallet not found.');
        }
        const wData = walletSnap.data() as Wallet;
        if (wData.availableCoins < wdData.amountCoins) {
          throw new Error(
            `Insufficient wallet balance (${wData.availableCoins.toLocaleString()} coins) for withdrawal of ${wdData.amountCoins.toLocaleString()} coins.`
          );
        }
        const nextBalance = wData.availableCoins - wdData.amountCoins;
        const nextTotalDebited = (Number(wData.totalDebitedCoins) || 0) + wdData.amountCoins;
        tx.update(walletRef, {
          availableCoins: nextBalance,
          totalDebitedCoins: nextTotalDebited,
          lastTxId: attestation.txId,
          updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, 'wallet_ledger', attestation.txId), {
          txId: attestation.txId,
          userId: wdData.userId,
          type: 'debit',
          amount: wdData.amountCoins,
          balanceAfter: nextBalance,
          referenceId: wdData.withdrawalId,
          serverSignature: attestation.serverSignature,
          description: `Withdrawal ${statusLabels[params.status]} (${wdData.payoutChannel})`.slice(0, 300),
          status: 'completed',
          createdAt: serverTimestamp(),
        });
        nextDebited = true;
      } else if (shouldRefund && alreadyDebited && walletSnap.exists()) {
        const wData = walletSnap.data() as Wallet;
        const nextBalance = wData.availableCoins + wdData.amountCoins;
        tx.update(walletRef, {
          availableCoins: nextBalance,
          lastTxId: attestation.txId,
          updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, 'wallet_ledger', attestation.txId), {
          txId: attestation.txId,
          userId: wdData.userId,
          type: 'refund',
          amount: wdData.amountCoins,
          balanceAfter: nextBalance,
          referenceId: wdData.withdrawalId,
          serverSignature: attestation.serverSignature,
          description: `Withdrawal ${statusLabels[params.status]} reversal (${cleanReason || 'Cancelled'})`.slice(0, 300),
          status: 'reversed',
          createdAt: serverTimestamp(),
        });
        nextDebited = false;
      }

      const finalRef = cleanRef || wdData.payoutReferenceNumber || '';
      const finalConfirmed =
        params.status === 'successful' ? true : params.providerConfirmed || Boolean(wdData.providerConfirmed);

      tx.update(targetRef, {
        status: params.status,
        adminNote: (cleanReason || wdData.adminNote || '').slice(0, 400),
        reviewedBy: adminEmail,
        payoutReferenceNumber: finalRef,
        providerConfirmed: finalConfirmed,
        debitedFromWallet: nextDebited,
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'adminAuditLogs', auditId), {
        auditId,
        adminId: params.adminUser.uid,
        adminEmail,
        actionType,
        targetUserId: wdData.userId,
        targetEntityId: wdData.withdrawalId,
        amount: wdData.amountCoins,
        reason: cleanReason,
        payoutReferenceNumber: finalRef,
        details: `Withdrawal ${wdData.withdrawalId} -> ${statusLabels[params.status]}${finalRef ? ` (Ref ${finalRef})` : ''}.`.slice(
          0,
          500
        ),
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'notifications', notifId), {
        notificationId: notifId,
        userId: wdData.userId,
        title: `Withdrawal Status: ${statusLabels[params.status]}`,
        body: `Request ${wdData.withdrawalId} (${wdData.amountCoins.toLocaleString()} coins) is now ${statusLabels[params.status]}.${finalRef ? ` Ref: ${finalRef}.` : ''} ${cleanReason}`.slice(
          0,
          500
        ),
        category: 'wallet',
        read: false,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'security_logs', logId), {
        logId,
        actorUid: params.adminUser.uid,
        actorEmail: adminEmail,
        action: `WITHDRAWAL_${params.status.toUpperCase()}`,
        severity: params.status === 'rejected' || params.status === 'failed' ? 'warning' : 'info',
        targetId: wdData.withdrawalId,
        details: `Set ${wdData.withdrawalId} (${wdData.amountCoins} coins) to ${params.status}. ${cleanReason}`.slice(0, 500),
        ipHint: 'web-client',
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Insufficient wallet balance') ||
        error.message.includes('not found') ||
        error.message.includes('provider confirmation'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `withdrawalRequests/${params.withdrawal.withdrawalId}`);
  }
}

export async function adminReviewWithdrawal(params: {
  adminUser: User;
  withdrawal: WithdrawalRequest;
  decision: 'approved' | 'rejected';
  adminNote: string;
}) {
  return adminUpdateWithdrawalStatusFirestore({
    adminUser: params.adminUser,
    withdrawal: params.withdrawal,
    status: params.decision,
    reason: params.adminNote || (params.decision === 'approved' ? 'Approved by admin' : 'Rejected by admin'),
    payoutReferenceNumber: params.withdrawal.payoutReferenceNumber || '',
    providerConfirmed: Boolean(params.withdrawal.providerConfirmed),
  });
}

export async function adminSaveProduct(params: {
  adminUser: User;
  product: Omit<Product, 'createdAt' | 'updatedAt'>;
  isNew: boolean;
}) {
  const path = `products/${params.product.productId}`;
  try {
    if (params.isNew) {
      await setDoc(doc(db, 'products', params.product.productId), {
        ...params.product,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'products', params.product.productId), {
        title: params.product.title,
        description: params.product.description,
        category: params.product.category,
        itemType: params.product.itemType,
        coinPrice: params.product.coinPrice,
        inrPrice: params.product.inrPrice,
        imageUrl: params.product.imageUrl,
        active: params.product.active,
        stock: params.product.stock,
        billingCycle: params.product.billingCycle,
        eligibility: params.product.eligibility,
        terms: params.product.terms,
        features: params.product.features,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, params.isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }

  await logSecurityEvent({
    actorUid: params.adminUser.uid,
    actorEmail: params.adminUser.email || '',
    action: params.isNew ? 'PRODUCT_CREATED' : 'PRODUCT_UPDATED',
    severity: 'info',
    targetId: params.product.productId,
    details: `${params.isNew ? 'Created' : 'Updated'} ${params.product.title} (${params.product.coinPrice} coins).`,
  });
}

export async function adminSaveCoinPackageFirestore(pkg: Omit<CoinPackage, 'createdAt' | 'updatedAt'>, isNew: boolean) {
  const ref = doc(db, 'coinPackages', pkg.packageId);
  if (isNew) {
    await setDoc(ref, { ...pkg, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } else {
    await updateDoc(ref, { ...pkg, updatedAt: serverTimestamp() });
  }
}

export async function adminSavePlanConfigFirestore(plan: Omit<PlanConfig, 'createdAt' | 'updatedAt'>, isNew: boolean) {
  const ref = doc(db, 'plans', plan.planId);
  if (isNew) {
    await setDoc(ref, { ...plan, creditIntervalHours: 24, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } else {
    await updateDoc(ref, { ...plan, creditIntervalHours: 24, updatedAt: serverTimestamp() });
  }
}

export async function adminSavePaymentConfigFirestore(cfg: Omit<PaymentConfiguration, 'createdAt' | 'updatedAt'>, isNew: boolean) {
  const ref = doc(db, 'paymentConfigurations', cfg.configId);
  if (isNew) {
    await setDoc(ref, { ...cfg, mode: 'SANDBOX_ONLY', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } else {
    await updateDoc(ref, { ...cfg, mode: 'SANDBOX_ONLY', updatedAt: serverTimestamp() });
  }
}

export async function adminSaveAdminSettingsFirestore(adminUser: User, settings: Omit<AdminSettings, 'updatedAt'>) {
  await setDoc(doc(db, 'adminSettings', 'default'), {
    ...settings,
    settingId: 'default',
    updatedBy: (adminUser.email || adminUser.uid).slice(0, 160),
    updatedAt: serverTimestamp(),
  });
}

export async function adminSaveAiFeatureSettingsFirestore(adminUser: User, settings: Omit<AiFeatureSettings, 'updatedAt'>) {
  await setDoc(doc(db, 'aiFeatureSettings', 'default'), {
    ...settings,
    settingId: 'default',
    updatedBy: (adminUser.email || adminUser.uid).slice(0, 160),
    updatedAt: serverTimestamp(),
  });
}

export async function adminUpdateUserStatus(params: {
  adminUser: User;
  targetUser: UserProfile;
  status: UserStatus;
  reason?: string;
}) {
  const cleanReason = (params.reason || `Admin updated status to ${params.status}`).trim().slice(0, 300);
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', params.targetUser.uid), {
      status: params.status,
      updatedAt: serverTimestamp(),
    });
    const auditId = makeSafeId('aud');
    batch.set(doc(db, 'adminAuditLogs', auditId), {
      auditId,
      adminId: params.adminUser.uid,
      adminEmail: (params.adminUser.email || params.adminUser.uid).slice(0, 160),
      actionType: 'USER_STATUS_UPDATED',
      targetUserId: params.targetUser.uid,
      targetEntityId: params.targetUser.publicUserId || params.targetUser.uid,
      amount: 0,
      reason: cleanReason,
      payoutReferenceNumber: '',
      details: `Account ${params.targetUser.publicUserId || params.targetUser.uid} status changed -> ${params.status}.`,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${params.targetUser.uid}`);
  }

  await logSecurityEvent({
    actorUid: params.adminUser.uid,
    actorEmail: params.adminUser.email || '',
    action: 'USER_STATUS_CHANGED',
    severity: params.status === 'suspended' ? 'warning' : 'info',
    targetId: params.targetUser.uid,
    details: `Changed user ${params.targetUser.publicUserId || params.targetUser.email} status to ${params.status}. ${cleanReason}`,
  });
}

export async function logAdminUserSearchFirestore(params: {
  adminUser: User;
  searchQuery: string;
  targetUserId: string;
  matchCount: number;
}) {
  const auditId = makeSafeId('aud');
  try {
    await setDoc(doc(db, 'adminAuditLogs', auditId), {
      auditId,
      adminId: params.adminUser.uid,
      adminEmail: (params.adminUser.email || params.adminUser.uid).slice(0, 160),
      actionType: 'ADMIN_USER_SEARCH',
      targetUserId: (params.targetUserId || 'search_query').slice(0, 128),
      targetEntityId: makeSafeId('srch'),
      amount: params.matchCount,
      reason: `Searched users: "${params.searchQuery.slice(0, 120)}"`,
      payoutReferenceNumber: '',
      details: `Admin searched "${params.searchQuery.slice(0, 120)}" (${params.matchCount} matches).`,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking audit log best effort for restricted staff roles
  }
}

export async function migrateHistoricalUsersFirestore(adminUser: User): Promise<number> {
  let migratedCount = 0;
  try {
    const snap = await getDocs(collection(db, 'users'));
    const docsSorted = [...snap.docs].sort(
      (a, b) => toMillis(a.data()?.createdAt) - toMillis(b.data()?.createdAt)
    );
    const counterRef = doc(db, 'userCounters', 'users');

    for (const userDoc of docsSorted) {
      const existingId = userDoc.data()?.publicUserId;
      if (typeof existingId === 'string' && /^UID[0-9]{3,}$/.test(existingId)) {
        continue;
      }
      const didMigrate = await runTransaction(db, async (tx) => {
        const fresh = await tx.get(userDoc.ref);
        if (!fresh.exists()) return false;
        const curId = fresh.data()?.publicUserId;
        if (typeof curId === 'string' && /^UID[0-9]{3,}$/.test(curId)) {
          return false;
        }
        const counterSnap = await tx.get(counterRef);
        const nextSeq = counterSnap.exists() ? Number(counterSnap.data()?.lastSeq || 0) + 1 : 1;
        const publicUserId = formatSequentialUserId(nextSeq);
        if (counterSnap.exists()) {
          tx.update(counterRef, { lastSeq: nextSeq, updatedAt: serverTimestamp() });
        } else {
          tx.set(counterRef, { counterId: 'users', lastSeq: nextSeq, updatedAt: serverTimestamp() });
        }
        tx.update(userDoc.ref, { publicUserId, updatedAt: serverTimestamp() });
        return true;
      });
      if (didMigrate) migratedCount += 1;
    }

    const auditId = makeSafeId('aud');
    await setDoc(doc(db, 'adminAuditLogs', auditId), {
      auditId,
      adminId: adminUser.uid,
      adminEmail: (adminUser.email || adminUser.uid).slice(0, 160),
      actionType: 'USER_IDS_MIGRATED',
      targetUserId: 'all_users',
      targetEntityId: makeSafeId('mig'),
      amount: migratedCount,
      reason: 'Sequential UID001+ historical backfill migration',
      payoutReferenceNumber: '',
      details: `Assigned sequential publicUserId to ${migratedCount} historical user doc(s).`,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'users');
  }
  return migratedCount;
}

export async function adminGrantRole(params: {
  adminUser: User;
  targetUid: string;
  targetEmail: string;
  role: AdminRoleRecord['role'];
}) {
  try {
    await setDoc(doc(db, 'admins', params.targetUid), {
      uid: params.targetUid,
      email: params.targetEmail.toLowerCase().slice(0, 160),
      role: params.role,
      permissions:
        params.role === 'super_admin'
          ? ['users', 'products', 'plans', 'ledger', 'withdrawals', 'support', 'ai', 'config']
          : params.role === 'admin'
          ? ['users', 'products', 'plans', 'ledger', 'withdrawals', 'support']
          : params.role === 'support_staff' || params.role === 'support_admin'
          ? ['support', 'users']
          : ['read_only'],
      grantedBy: params.adminUser.email || params.adminUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await syncAdminRoleApi(params.targetEmail, 'grant');
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `admins/${params.targetUid}`);
  }

  await logSecurityEvent({
    actorUid: params.adminUser.uid,
    actorEmail: params.adminUser.email || '',
    action: 'ADMIN_ROLE_GRANTED',
    severity: 'warning',
    targetId: params.targetUid,
    details: `Granted ${params.role} to ${params.targetEmail}.`,
  });
}

export async function adminSaveGatewayConfig(adminUser: User, config: Omit<GatewayConfig, 'updatedAt'>) {
  try {
    await setDoc(doc(db, 'gateway_config', 'default'), {
      ...config,
      gatewayMode: 'SANDBOX_ONLY',
      updatedBy: (adminUser.email || adminUser.uid).slice(0, 160),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'gateway_config/default');
  }

  await logSecurityEvent({
    actorUid: adminUser.uid,
    actorEmail: adminUser.email || '',
    action: 'GATEWAY_CONFIG_UPDATED',
    severity: 'warning',
    targetId: 'default',
    details: `Updated sandbox VPA ${config.sandboxVpa}, rate ${config.coinRateInr}.`,
  });
}
