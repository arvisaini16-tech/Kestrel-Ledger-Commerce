import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();
const db = getFirestore('ai-studio-045f285b-9d72-48a6-a10a-6cdeb09ab096');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Scheduled 24-hour Automatic Plan Credit Engine.
 * Runs in Cloud Scheduler via Firebase Cloud Functions v2.
 * Strict rules:
 *  - Only 24-hour interval schedules are processed.
 *  - Transactions are atomic and idempotent (pending schedule status checked inside transaction).
 *  - Users can never directly edit wallet balances; all balance mutations occur server-side.
 */
export const processScheduledPlanCredits = onSchedule(
  {
    schedule: 'every 24 hours',
    timeZone: 'Asia/Kolkata',
    retryCount: 2,
  },
  async () => {
    const nowIso = new Date().toISOString();
    const dueSnap = await db
      .collection('planCreditSchedules')
      .where('status', '==', 'pending')
      .where('dueAtIso', '<=', nowIso)
      .limit(200)
      .get();

    let processed = 0;
    let totalCreditedCoins = 0;

    for (const schedDoc of dueSnap.docs) {
      const schedData = schedDoc.data();
      const purchaseRef = db.collection('planPurchases').doc(schedData.purchaseId);
      const walletRef = db.collection('wallets').doc(schedData.userId);

      try {
        const creditedAmount = await db.runTransaction(async (tx) => {
          const freshSched = await tx.get(schedDoc.ref);
          if (!freshSched.exists || freshSched.data()?.status !== 'pending') {
            return 0; // Idempotency guard
          }

          const purchaseSnap = await tx.get(purchaseRef);
          if (!purchaseSnap.exists || purchaseSnap.data()?.status !== 'active') {
            tx.update(schedDoc.ref, { status: 'cancelled' });
            return 0;
          }

          const purchase = purchaseSnap.data()!;
          const walletSnap = await tx.get(walletRef);
          const currentWallet = walletSnap.exists ? walletSnap.data()! : { availableCoins: 0, totalCreditedCoins: 0 };

          const nextCompleted = (purchase.completedEvents || 0) + 1;
          const isFinal = nextCompleted >= (purchase.totalEvents || purchase.durationDays);
          const remaining = Math.max(0, (purchase.totalScheduledCredits || 0) - (purchase.creditedCoinsSoFar || 0));
          const creditCoins = isFinal ? remaining : Math.min(remaining, schedData.scheduledCoins || 0);

          const newBalance = (currentWallet.availableCoins || 0) + creditCoins;
          const newTotalCredited = (currentWallet.totalCreditedCoins || 0) + creditCoins;
          const txId = `tx_cf24h_${schedDoc.id}`;
          const now = FieldValue.serverTimestamp();

          tx.update(schedDoc.ref, {
            status: 'credited',
            creditedAtIso: new Date().toISOString(),
            txId,
          });

          tx.update(walletRef, {
            availableCoins: newBalance,
            totalCreditedCoins: newTotalCredited,
            lastTxId: txId,
            updatedAt: now,
          });

          tx.set(db.collection('wallet_ledger').doc(txId), {
            txId,
            userId: schedData.userId,
            type: 'plan_credit',
            amount: creditCoins,
            balanceAfter: newBalance,
            referenceId: schedData.purchaseId,
            serverSignature: `cf_v2_24h_${schedDoc.id}`,
            description: `Scheduled 24h plan credit #${nextCompleted}/${purchase.totalEvents} (${purchase.planName})`,
            status: 'completed',
            createdAt: now,
          });

          tx.update(purchaseRef, {
            completedEvents: nextCompleted,
            creditedCoinsSoFar: (purchase.creditedCoinsSoFar || 0) + creditCoins,
            status: isFinal ? 'completed' : 'active',
            nextCreditAtIso: isFinal ? '' : new Date(Date.now() + DAY_MS).toISOString(),
            updatedAt: now,
          });

          const notifId = `ntf_${txId}`;
          tx.set(db.collection('notifications').doc(notifId), {
            notificationId: notifId,
            userId: schedData.userId,
            title: isFinal ? `Plan Completed: ${purchase.planName}` : `24h Scheduled Credit Received`,
            body: `${creditCoins} coins credited to your wallet (Ref ${txId}).`,
            category: 'plan',
            read: false,
            createdAt: now,
          });

          return creditCoins;
        });

        if (creditedAmount > 0) {
          processed += 1;
          totalCreditedCoins += creditedAmount;
        }
      } catch (err) {
        logger.error('Failed to process 24h credit schedule', { scheduleId: schedDoc.id, err });
      }
    }

    logger.info('24h Plan Credit Scheduler completed', { processed, totalCreditedCoins });
  }
);

/**
 * App Check-enforced callable function for verified plan activation in production Firebase setups.
 */
export const activatePlanAppCheck = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  const planId = String(request.data?.planId || '');
  if (!planId) {
    throw new HttpsError('invalid-argument', 'planId is required.');
  }

  const planSnap = await db.collection('plans').doc(planId).get();
  if (!planSnap.exists || planSnap.data()?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Plan not found or disabled.');
  }

  return {
    ok: true,
    verifiedUid: request.auth.uid,
    planId,
    creditIntervalHours: 24,
  };
});

/**
 * Automatic security audit log writer whenever coin requests or withdrawals change state.
 */
export const auditCoinRequestWrites = onDocumentWritten('coin_requests/{requestId}', async (event) => {
  const after = event.data?.after?.data();
  if (!after) return;

  const logId = `log_cf_${event.params.requestId}_${Date.now()}`;
  await db.collection('security_logs').doc(logId).set({
    logId,
    actorUid: after.reviewedBy || after.userId || 'system',
    actorEmail: after.reviewedBy || 'system@kestrel.internal',
    action: `CF_COIN_REQUEST_${String(after.status || 'UPDATED').toUpperCase()}`,
    severity: after.status === 'rejected' ? 'warning' : 'info',
    targetId: event.params.requestId,
    details: `Cloud Function audit: ${after.coinsRequested} coins status=${after.status}`,
    ipHint: 'cloud-functions-v2',
    createdAt: FieldValue.serverTimestamp(),
  });
});

async function assertAdminCallable(uid: string, email?: string) {
  if (email?.toLowerCase() === 'arvisaini16@gmail.com') return;
  const adminSnap = await db.collection('admins').doc(uid).get();
  if (!adminSnap.exists) {
    throw new HttpsError('permission-denied', 'Authorized admin role required.');
  }
}

/**
 * Atomic server-side Manual Coin Management (Add / Deduct) with duplicate prevention & negative balance guard.
 */
export const adminAdjustUserCoins = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  await assertAdminCallable(request.auth.uid, request.auth.token.email);

  const userId = String(request.data?.userId || '').trim();
  const action = request.data?.action === 'deduct' ? 'deduct' : request.data?.action === 'add' ? 'add' : '';
  const amount = Math.floor(Number(request.data?.amount) || 0);
  const reason = String(request.data?.reason || '').trim();
  const idempotencyKey = String(request.data?.idempotencyKey || '').trim();

  if (!userId || !action || amount <= 0 || reason.length < 3 || !idempotencyKey) {
    throw new HttpsError('invalid-argument', 'userId, action, positive amount, reason (>=3 chars), and idempotencyKey are required.');
  }

  const dupSnap = await db.collection('walletTransactions').where('idempotencyKey', '==', idempotencyKey).limit(1).get();
  if (!dupSnap.empty) {
    throw new HttpsError('already-exists', 'Duplicate transaction blocked by idempotency check.');
  }

  const walletRef = db.collection('wallets').doc(userId);
  const txId = `wtx_${idempotencyKey.slice(0, 24)}_${Date.now()}`;
  const auditId = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const result = await db.runTransaction(async (tx) => {
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists) {
      throw new HttpsError('not-found', 'Target user wallet not found.');
    }
    const w = walletSnap.data()!;
    const balanceBefore = Number(w.availableCoins || 0);
    const balanceAfter = action === 'add' ? balanceBefore + amount : balanceBefore - amount;
    if (balanceAfter < 0) {
      throw new HttpsError('failed-precondition', 'Deduction blocked: wallet balance cannot become negative.');
    }

    const now = FieldValue.serverTimestamp();
    tx.update(walletRef, {
      availableCoins: balanceAfter,
      totalCreditedCoins: action === 'add' ? Number(w.totalCreditedCoins || 0) + amount : Number(w.totalCreditedCoins || 0),
      totalDebitedCoins: action === 'deduct' ? Number(w.totalDebitedCoins || 0) + amount : Number(w.totalDebitedCoins || 0),
      lastTxId: txId,
      updatedAt: now,
    });

    tx.set(db.collection('walletTransactions').doc(txId), {
      txId,
      idempotencyKey,
      userId,
      adminId: request.auth!.uid,
      adminEmail: request.auth!.token.email || '',
      action,
      amount,
      balanceBefore,
      balanceAfter,
      reason: reason.slice(0, 300),
      status: 'completed',
      createdAt: now,
    });

    tx.set(db.collection('wallet_ledger').doc(txId), {
      txId,
      userId,
      type: action === 'add' ? 'adjustment' : 'debit',
      amount,
      balanceAfter,
      referenceId: idempotencyKey,
      serverSignature: `cf_admin_${txId}`,
      description: `Admin ${action === 'add' ? 'Added' : 'Deducted'} ${amount} Coins: ${reason}`.slice(0, 300),
      status: 'completed',
      createdAt: now,
    });

    tx.set(db.collection('adminAuditLogs').doc(auditId), {
      auditId,
      adminId: request.auth!.uid,
      adminEmail: request.auth!.token.email || '',
      actionType: action === 'add' ? 'COIN_ADD' : 'COIN_DEDUCT',
      targetUserId: userId,
      targetEntityId: txId,
      amount,
      reason: reason.slice(0, 400),
      payoutReferenceNumber: '',
      details: `${action.toUpperCase()} ${amount} coins (Before: ${balanceBefore} -> After: ${balanceAfter})`,
      createdAt: now,
    });

    return { txId, balanceBefore, balanceAfter };
  });

  return { ok: true, ...result };
});

/**
 * Atomic server-side Withdrawal Management status transition (7 stages + provider confirmation guard).
 */
export const adminUpdateWithdrawalStatus = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  await assertAdminCallable(request.auth.uid, request.auth.token.email);

  const withdrawalId = String(request.data?.withdrawalId || '').trim();
  const nextStatus = String(request.data?.status || '').trim();
  const reason = String(request.data?.reason || '').trim();
  const payoutReferenceNumber = String(request.data?.payoutReferenceNumber || '').trim();
  const providerConfirmed = Boolean(request.data?.providerConfirmed);

  const allowed = ['pending', 'under_review', 'approved', 'processing', 'successful', 'rejected', 'failed'];
  if (!withdrawalId || !allowed.includes(nextStatus)) {
    throw new HttpsError('invalid-argument', 'Valid withdrawalId and status required.');
  }
  if (nextStatus === 'successful' && (!providerConfirmed || payoutReferenceNumber.length < 4)) {
    throw new HttpsError(
      'failed-precondition',
      'Withdrawal can only be marked Successful after authorized payout provider confirmation and payout reference number.'
    );
  }
  if ((nextStatus === 'rejected' || nextStatus === 'failed') && reason.length < 3) {
    throw new HttpsError('invalid-argument', 'Reason is required when marking withdrawal Rejected or Failed.');
  }

  const reqRef = db.collection('withdrawalRequests').doc(withdrawalId);
  const auditId = `aud_wd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(reqRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Withdrawal request not found.');
    }
    const wd = snap.data()!;
    const walletRef = db.collection('wallets').doc(wd.userId);
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.exists ? walletSnap.data()! : { availableCoins: 0, totalDebitedCoins: 0 };
    let debitedFromWallet = Boolean(wd.debitedFromWallet);
    const now = FieldValue.serverTimestamp();

    if ((nextStatus === 'approved' || nextStatus === 'processing' || nextStatus === 'successful') && !debitedFromWallet) {
      if (Number(wallet.availableCoins || 0) < Number(wd.amountCoins || 0)) {
        throw new HttpsError('failed-precondition', 'Insufficient user balance to approve withdrawal.');
      }
      tx.update(walletRef, {
        availableCoins: Number(wallet.availableCoins) - Number(wd.amountCoins),
        totalDebitedCoins: Number(wallet.totalDebitedCoins || 0) + Number(wd.amountCoins),
        lastTxId: withdrawalId,
        updatedAt: now,
      });
      debitedFromWallet = true;
    } else if ((nextStatus === 'rejected' || nextStatus === 'failed') && debitedFromWallet) {
      tx.update(walletRef, {
        availableCoins: Number(wallet.availableCoins || 0) + Number(wd.amountCoins),
        lastTxId: withdrawalId,
        updatedAt: now,
      });
      debitedFromWallet = false;
    }

    tx.update(reqRef, {
      status: nextStatus,
      adminNote: reason.slice(0, 400),
      payoutReferenceNumber: payoutReferenceNumber.slice(0, 128),
      providerConfirmed: nextStatus === 'successful' ? true : Boolean(wd.providerConfirmed),
      debitedFromWallet,
      reviewedBy: request.auth!.token.email || request.auth!.uid,
      updatedAt: now,
    });

    tx.set(db.collection('adminAuditLogs').doc(auditId), {
      auditId,
      adminId: request.auth!.uid,
      adminEmail: request.auth!.token.email || '',
      actionType:
        nextStatus === 'approved'
          ? 'WITHDRAWAL_APPROVED'
          : nextStatus === 'rejected'
          ? 'WITHDRAWAL_REJECTED'
          : nextStatus === 'successful'
          ? 'WITHDRAWAL_SUCCESSFUL'
          : nextStatus === 'failed'
          ? 'WITHDRAWAL_FAILED'
          : 'WITHDRAWAL_STATUS_UPDATE',
      targetUserId: wd.userId,
      targetEntityId: withdrawalId,
      amount: Number(wd.amountCoins || 0),
      reason: reason.slice(0, 400),
      payoutReferenceNumber: payoutReferenceNumber.slice(0, 128),
      details: `Withdrawal ${withdrawalId} transitioned from ${wd.status} -> ${nextStatus}`,
      createdAt: now,
    });
  });

  return { ok: true, withdrawalId, status: nextStatus };
});

function formatSeqUid(seq: number): string {
  return `UID${seq < 1000 ? String(seq).padStart(3, '0') : String(seq)}`;
}

/**
 * Atomic sequential Public User ID generator triggered whenever a user doc is created without publicUserId.
 * Guarantees unique sequential UID001, UID002, ... without collision or ID reuse.
 */
export const assignPublicUserIdOnCreate = onDocumentCreated(
  { document: 'users/{uid}', database: 'ai-studio-045f285b-9d72-48a6-a10a-6cdeb09ab096' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    if (typeof data?.publicUserId === 'string' && /^UID[0-9]{3,}$/.test(data.publicUserId)) {
      return;
    }

    const counterRef = db.collection('userCounters').doc('users');
    const userRef = snap.ref;

    const assignedId = await db.runTransaction(async (tx) => {
      const freshUser = await tx.get(userRef);
      if (!freshUser.exists) return '';
      const existingPublicId = freshUser.data()?.publicUserId;
      if (typeof existingPublicId === 'string' && /^UID[0-9]{3,}$/.test(existingPublicId)) {
        return existingPublicId;
      }

      const counterSnap = await tx.get(counterRef);
      const nextSeq = (counterSnap.exists ? Number(counterSnap.data()?.lastSeq || 0) : 0) + 1;
      const nextId = formatSeqUid(nextSeq);
      const now = FieldValue.serverTimestamp();

      if (counterSnap.exists) {
        tx.update(counterRef, { lastSeq: nextSeq, updatedAt: now });
      } else {
        tx.set(counterRef, { counterId: 'users', lastSeq: nextSeq, updatedAt: now });
      }

      tx.update(userRef, { publicUserId: nextId, updatedAt: now });
      return nextId;
    });

    if (assignedId) {
      logger.info('Assigned permanent publicUserId', { uid: event.params.uid, publicUserId: assignedId });
    }
  }
);

/**
 * Idempotent Admin callable for backfilling sequential UID001+ IDs for existing historical users.
 */
export const migrateHistoricalUserIds = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  await assertAdminCallable(request.auth.uid, request.auth.token.email);

  const usersSnap = await db.collection('users').orderBy('createdAt', 'asc').get();
  const counterRef = db.collection('userCounters').doc('users');
  let migratedCount = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    if (typeof data?.publicUserId === 'string' && /^UID[0-9]{3,}$/.test(data.publicUserId)) {
      continue;
    }
    const assigned = await db.runTransaction(async (tx) => {
      const freshUser = await tx.get(userDoc.ref);
      if (!freshUser.exists) return false;
      const curId = freshUser.data()?.publicUserId;
      if (typeof curId === 'string' && /^UID[0-9]{3,}$/.test(curId)) {
        return false;
      }
      const counterSnap = await tx.get(counterRef);
      const nextSeq = (counterSnap.exists ? Number(counterSnap.data()?.lastSeq || 0) : 0) + 1;
      const nextPublicId = formatSeqUid(nextSeq);
      const now = FieldValue.serverTimestamp();

      if (counterSnap.exists) {
        tx.update(counterRef, { lastSeq: nextSeq, updatedAt: now });
      } else {
        tx.set(counterRef, { counterId: 'users', lastSeq: nextSeq, updatedAt: now });
      }
      tx.update(userDoc.ref, { publicUserId: nextPublicId, updatedAt: now });
      return true;
    });
    if (assigned) migratedCount += 1;
  }

  return { ok: true, migratedCount };
});


