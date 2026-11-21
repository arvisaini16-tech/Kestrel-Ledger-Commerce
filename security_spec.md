# Security Specification & Payload-First TDD

## 1. Data Invariants

1. **Zero Self-Elevation**: A user cannot create or update their `/users/{userId}` document with `role: "admin"` or `role: "super_admin"`, nor create `/admins/{userId}` unless already a verified Super Admin.
2. **Wallet Tamper Prevention**: Non-admin users can only initialize `/wallets/{userId}` with `0` balances (`availableCoins == 0`, `pendingCoins == 0`, `totalPurchasedCoins == 0`). Users can never increase their own `availableCoins` or `totalPurchasedCoins`; deductions require an atomic batch creating a matching `/orders/{orderId}` referencing an active `/products/{productId}` with exact coin cost.
3. **Immutable Ledger & Orders**: `/wallet_ledger/{txId}` entries are append-only; non-admin users cannot update or delete ledger history, and can only append `debit` entries atomically paired with an `/orders/{orderId}` write.
4. **Sandbox Payment Integrity**: `/payments/{paymentId}` documents created by users must start in `status: "initiated"` with `isSimulated: true`. Users cannot mark payments `credited` or `refunded`.
5. **Withdrawal Simulation Lock**: `/withdrawals/{withdrawalId}` must be created with `status: "pending"`, `isSimulated: true`, and `adminNote: ""`. Once `approved` or `rejected` (terminal state), non-admins cannot mutate the request.
6. **PII Isolation**: `/users/{userId}` is strictly readable only by the owner (`request.auth.uid == userId`) or verified Admins (`isAdmin()`). No blanket `isSignedIn()` reads on PII collections.
7. **Master Gate on Ticket Messages**: `/support_tickets/{ticketId}/messages/{messageId}` checks parent `/support_tickets/{ticketId}` ownership via `get()` before permitting reads or writes.
8. **Temporal & Path Integrity**: All document IDs match `^[a-zA-Z0-9_\-]+$` (<= 128 chars). Timestamps (`createdAt`, `updatedAt`) strictly enforce `request.time`.

## 2. The "Dirty Dozen" Payloads

1. **Self-Admin Role Escalation (`/users/{uid}` create)**: `{"uid":"attacker","role":"super_admin","status":"active"}` -> `PERMISSION_DENIED`
2. **Profile Role Shadow Update (`/users/{uid}` update)**: `{"role":"admin","updatedAt":"<serverTimestamp>"}` -> `PERMISSION_DENIED`
3. **Wallet Self-Credit on Create (`/wallets/{uid}` create)**: `{"userId":"attacker","availableCoins":99999,"pendingCoins":0,"totalPurchasedCoins":99999}` -> `PERMISSION_DENIED`
4. **Wallet Arbitrary Balance Edit (`/wallets/{uid}` update)**: `{"availableCoins":50000,"updatedAt":"<serverTimestamp>"}` -> `PERMISSION_DENIED`
5. **Unpaired Wallet Deduction Without Order (`/wallets/{uid}` update)**: `{"availableCoins":10,"lastTxId":"fake_tx","updatedAt":"<serverTimestamp>"}` -> `PERMISSION_DENIED`
6. **Pre-Credited Payment Spoof (`/payments/{id}` create)**: `{"paymentId":"p1","userId":"attacker","status":"credited","isSimulated":true}` -> `PERMISSION_DENIED`
7. **Withdrawal Self-Approval (`/withdrawals/{id}` update)**: `{"status":"approved","reviewedBy":"attacker","updatedAt":"<serverTimestamp>"}` -> `PERMISSION_DENIED`
8. **Ghost Field Injection on Ticket (`/support_tickets/{id}` create)**: `{"ticketId":"t1","userId":"attacker","isAdminEscalated":true}` -> `PERMISSION_DENIED`
9. **Client Timestamp Forgery (`/orders/{id}` create)**: `{"orderId":"o1","createdAt":"2020-01-01T00:00:00Z"}` -> `PERMISSION_DENIED`
10. **ID Poisoning 1.5KB Document ID (`/support_tickets/{200_char_id}` create)**: Oversized ID -> `PERMISSION_DENIED`
11. **Cross-Tenant Ticket Message Read (`/support_tickets/other_ticket/messages/m1` get)**: Non-owner, non-admin -> `PERMISSION_DENIED`
12. **Unverified Email Admin Spoof (`/products/p1` create)**: `email: "arvisaini16@gmail.com"`, `email_verified: false` -> `PERMISSION_DENIED`
