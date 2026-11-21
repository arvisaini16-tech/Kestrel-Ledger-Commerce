# Kestrel Ledger & Commerce Platform

A full-stack AI-powered Fintech Ledger, Coin Wallet, 24-Hour Scheduled Plan Engine, and Sandbox Commerce platform built with **React 19 + TypeScript + Tailwind CSS v4**, **Node.js + Express**, **Firebase Auth & Cloud Firestore**, **Firebase Cloud Functions v2**, **Google Gemini AI (`@google/genai`)**, and **Native Android (Kotlin + Jetpack Compose + Material 3)**.

---

## Implemented Architecture & Deliverables

1. **Responsive Web Application & PWA (`/src`)**
   - Light & Dark theme toggle synced to user preference and Admin defaults.
   - PWA Web App Manifest, custom geometric SVG & PNG app icons, Service Worker offline caching, install prompt button, and live offline status banner.
   - **Real Transaction Activity Ticker**: Positioned directly below the main hero heading, displaying only verified coin additions and completed withdrawals with masked user IDs (`KST••42`) and zero PII. Shows a neutral empty state when no verified events exist; toggleable by Admin.
   - **6-Month Filterable Ledger & CSV Export**: Filter by type (`credit`, `debit`, `plan_credit`, `refund`, `adjustment`), date range (up to 6 months), and search query.
   - **Support Helpdesk & Consent-Gated External Contact**: Ticket categories, file/screenshot attachments, replies, plus WhatsApp/Telegram contact links gated by explicit User Consent confirmation dialog.

2. **Authentication (`/api/v1/auth/otp/*` & Firebase Auth)**
   - **Option A — Mobile OTP** and **Option B — Email OTP** with server-side `scrypt` hashed OTPs, 30-second resend cooldown, 5-minute expiry, 5-attempt lockout, HMAC Bearer tokens, and duplicate email/phone protection.
   - **Option C — Google Sign-In** via Firebase Authentication.

3. **Coin Wallet, 8 Coin Packages & 24-Hour Scheduled Plan Credit Engine**
   - 8 configurable Coin Packages (`100` to `50,000` Coins) manageable by Admin.
   - **24-Hour Plan Engine**: Admin creates, edits, enables/disables, or archives plans with price, currency, duration (days), total scheduled credits, and terms. Purchases snapshot terms immutably and schedule exactly `durationDays` payouts at **24-hour intervals** with exact remainder reconciliation and idempotent locking. Includes automated background execution (`server.ts` + Cloud Functions `onSchedule("every 24 hours")`) and manual Admin override with required audit reason.

4. **Multiple Sandbox UPI Pool & Random Assignment**
   - Admin maintains multiple enabled Sandbox UPI configurations (`paymentConfigurations`).
   - Each new payment request (`POST /api/v1/payments/create-intent`) randomly assigns one enabled configuration on the backend and locks it to that payment request ID.
   - Screenshot uploads are never used to auto-credit coins; only verified sandbox webhook flows + Admin ledger approval mint wallet balance.

5. **11 AI Smart Modules & AI Features Control Center**
   - Powered server-side by `@google/genai` (`gemini-4-hydrogen`): Smart Assistant, AI Admin Dashboard, AI Fraud Detection, AI Smart Suggestions, AI Helpdesk Triage, AI Voice Assistant (Web Speech API), Multilingual AI (English & Hindi), AI Business Intelligence, AI Theme Designer (JSON preview before publish), Smart Notification Engine, and AI Database Health Monitor.
   - Governed by a **Master AI ON/OFF Switch**, **11 individual module switches**, daily per-user usage limits, and server audit logs.

6. **Super Admin Dashboard**
   - RBAC role management, user flagging/suspension, coin & withdrawal approvals, refund reversal, branding/logo/favicon customization, multiple UPI pool CRUD, 24h plan management & scheduler trigger, and security audit logs.

7. **Native Android App (`/android`) & Cloud Functions v2 (`/functions`)**
   - Kotlin + Jetpack Compose + Material 3 client wired to the shared `/api/v1/*` contract (`ApiClient.kt`) and Firebase (`FirebaseRepository.kt`).
   - Firebase Cloud Functions v2 scheduled 24h processor & App Check callable in `/functions/src/index.ts`.

---

## Documentation
- [Shared API Contract (`/docs/API_CONTRACT.md`)](./docs/API_CONTRACT.md)
- [Setup, Security & Deployment Guide (`/docs/SETUP_AND_DEPLOYMENT.md`)](./docs/SETUP_AND_DEPLOYMENT.md)
