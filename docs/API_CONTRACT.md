# Kestrel Ledger & Commerce — Shared API Contract (`/api/v1`)

Both the **React Web Application** and **Native Android Jetpack Compose Client** consume this unified backend REST API alongside Firebase Firestore real-time streams.

## Authentication Headers
- **Firebase Auth**: `Authorization: Bearer <firebase_id_token>`
- **Email / Mobile OTP Session**: `Authorization: Bearer kestrel_otp_<token>`

---

## 1. Public & Ticker Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health check (`status`, `geminiConfigured`, `schedulerIntervalHours: 24`). |
| `GET` | `/api/v1/public/bootstrap` | Returns active `coinPackages` (8 tiers), `plans` (24h interval), `products`, `adminSettings`, `aiFeatureSettings`, `gatewayConfig`, and `ticker`. |
| `GET` | `/api/v1/ticker` | Returns ONLY real verified `coin_credit` and `withdrawal_completed` events with masked UID (`KST••12`) and zero PII. Returns empty array if none exist. |

---

## 2. Authentication (Email OTP & Mobile OTP)
| Method | Endpoint | Body | Notes |
|---|---|---|---|
| `POST` | `/api/v1/auth/otp/request` | `{ channel: "email" \| "mobile", identifier, displayName?, mode: "login" \| "register" }` | Enforces 30s cooldown, 5-min expiry, `scrypt` hashed storage, duplicate email/phone protection. Sends real email/SMS if SMTP/Twilio configured, else sandbox notice. |
| `POST` | `/api/v1/auth/otp/verify` | `{ channel, identifier, otp, displayName?, referralCode? }` | Constant-time `timingSafeEqual` check, max 5 attempts before lockout, returns HMAC-signed `kestrel_otp_*` Bearer token. |
| `GET` | `/api/v1/auth/session` | — | Validates Bearer token and returns `AuthSessionUser`. |
| `POST` | `/api/v1/auth/logout` | — | Revokes OTP session token. |

---

## 3. User Workspace, Plans & Random Sandbox UPI
| Method | Endpoint | Body / Behavior |
|---|---|---|
| `GET` | `/api/v1/user/state` | Hydrates full user `profile`, `wallet`, 6-month `ledger`, `planPurchases`, `planCreditSchedules`, `orders`, `payments`, `coinRequests`, `withdrawals`, `tickets`, `notifications`. |
| `PATCH` | `/api/v1/user/profile` | Updates permitted non-privileged fields (`displayName`, `phone`, `twoFactorEnabled`, privacy flags). Never touches wallet balances. |
| `POST` | `/api/v1/payments/create-intent` | `{ packageId?, amountInr?, upiApp, idempotencyKey }`. **Randomly selects** one enabled Sandbox UPI configuration from `paymentConfigurations`, fixes it to `paymentId`, and returns `upi://pay?...` URI. |
| `POST` | `/api/v1/payments/webhook` | `{ paymentId, outcome: "success" \| "failed" }`. Simulates authorized gateway webhook verification and queues a pending `coin_request` for Admin approval. |
| `POST` | `/api/v1/plans/purchase` | `{ planId }`. Deducts `purchasePrice` server-side, snapshots plan terms immutably into `planPurchases`, and generates `durationDays` schedule events spaced strictly at **24-hour intervals** with exact final-day remainder reconciliation. |
| `POST` | `/api/v1/orders/purchase` | `{ productId, quantity }`. Server-atomic coin deduction and order creation. |
| `POST` | `/api/v1/withdrawals` | `{ amountCoins, payoutChannel, accountLabel }`. Simulation-only withdrawal request queued for Admin review. |
| `POST` | `/api/v1/support/tickets` | Creates ticket in 8 categories with optional screenshot/document attachment. |
| `POST` | `/api/v1/support/tickets/:ticketId/reply` | Appends user/admin reply to ticket thread. |
| `POST` | `/api/v1/notifications/:id/read` | Marks notification read. |

---

## 4. Admin Management Endpoints (Authorized Admins Only)
| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/admin/overview` | Full telemetry, users, wallets, packages, plans, active schedules, UPI configs, tickets, AI usage & DB health logs. |
| `POST` | `/api/v1/admin/plans/run-scheduler` | Triggers immediate execution of due **24-hour** `planCreditSchedules` (also runs automatically every 60s on server and `onSchedule("every 24 hours")` in Cloud Functions). |
| `POST` | `/api/v1/admin/coin-packages` | Create / edit / disable / archive any of the Coin Packages. |
| `POST` | `/api/v1/admin/plans` | Create / edit / disable / archive configurable 24h Plans. |
| `POST` | `/api/v1/admin/plans/override` | Manual admin override (`extend`, `cancel`, `complete_now`) requiring an audit `reason`. |
| `POST` | `/api/v1/admin/payment-configs` | CRUD for multiple Sandbox Merchant UPI endpoints used in random assignment. |
| `PUT` | `/api/v1/admin/settings` | Updates brand name, logo URL, favicon URL, accent color, default theme, ticker toggle, withdrawals toggle, and WhatsApp/Telegram contact settings. |
| `PUT` | `/api/v1/admin/ai-settings` | Updates Master AI toggle + 11 individual AI module toggles + daily per-user quota. |
| `POST` | `/api/v1/admin/coin-requests/:id/review` | Approves or rejects verified sandbox coin requests and emits ticker event when approved. |
| `POST` | `/api/v1/admin/wallets/credit` | Manual server-signed admin ledger credit adjustment with reason & audit trail. |
| `POST` | `/api/v1/admin/payments/:id/refund` | Marks sandbox payment refunded and reverses wallet coins if previously credited. |
| `POST` | `/api/v1/admin/withdrawals/:id/review` | Approves or rejects simulated withdrawal; emits verified ticker event on completion. |

---

## 5. 11 Server-Side Gemini AI Endpoints (`@google/genai`)
All AI endpoints verify authentication, enforce the **Master AI switch**, enforce each module's individual switch, enforce `dailyLimitPerUser`, call `gemini-4-hydrogen` server-side only, and record latency/outcome in `aiUsageLogs`.

- `POST /api/v1/ai/smart-assistant` (Covers Smart Assistant, Voice Assistant, Multilingual EN/HI)
- `POST /api/v1/ai/smart-suggestions`
- `POST /api/v1/ai/helpdesk`
- `POST /api/v1/ai/admin-dashboard` *(Admin)*
- `POST /api/v1/ai/fraud-detection` *(Admin)*
- `POST /api/v1/ai/theme-designer` *(Admin — returns structured JSON proposal before publishing)*
- `POST /api/v1/ai/smart-notifications` *(Admin)*
- `POST /api/v1/ai/db-health` *(Admin)*
- `POST /api/v1/ai/business-intelligence` *(Admin)*
