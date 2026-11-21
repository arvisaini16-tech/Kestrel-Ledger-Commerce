# Setup, Security & Deployment Guide

## 1. Environment Variables
Configure secrets in the server environment (never prefix secrets with `VITE_` and never bundle into client JS or Android source):
- `GEMINI_API_KEY`: Required for all 11 server-side Gemini AI modules (`@google/genai`).
- `ATTESTATION_HMAC_SECRET`: Secret key used to sign OTP session Bearer tokens and ledger attestations.
- `BOOTSTRAP_ADMIN_EMAIL`: Defaults to `arvisaini16@gmail.com`.
- **Optional Live Messaging Providers** (when omitted, OTP runs in explicit Sandbox Preview mode without external SMS/SMTP delivery):
  - `RESEND_API_KEY` + `OTP_FROM_EMAIL`: Enables real Email OTP delivery.
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`: Enables real SMS Mobile OTP delivery.

---

## 2. Running Locally
```bash
npm install
npm run lint     # TypeScript check (tsc --noEmit)
npm run build    # Production Vite + PWA bundle
npm run dev      # Express + Vite middleware on port 3000
```

---

## 3. Firebase Deployment (Firestore Rules + Functions v2 + App Check)
1. Deploy hardened Firestore security rules (`firestore.rules`):
   ```bash
   npx eslint firestore.rules
   firebase deploy --only firestore:rules
   ```
2. Deploy Cloud Functions v2 (`/functions`):
   ```bash
   cd functions
   npm install
   npm run build
   firebase deploy --only functions
   ```
   This provisions `processScheduledPlanCredits` (`every 24 hours` via Cloud Scheduler), `activatePlanAppCheck` (App Check enforced), and `auditCoinRequestWrites`.
3. **Firebase App Check**: Enable Play Integrity (Android) and reCAPTCHA Enterprise (Web) in the Firebase Console before public production release.

---

## 4. Android Application Build Instructions (`/android`)
> **Important Delivery Disclosure**: This workspace provides the full native Android Kotlin + Jetpack Compose + Material 3 source code under `/android/`. A compiled `.apk` or `.aab` binary has **not** been generated inside this Node/Web container because the Android Gradle SDK toolchain is not installed in the container runtime.

To compile the `.apk` / `.aab` locally or in CI:
1. Open `/android` in Android Studio Ladybug+ (JDK 17, Android SDK 35).
2. Download your `google-services.json` from Firebase Console into `/android/app/google-services.json`.
3. Update `ApiClient(baseUrl = "...")` in `MainActivity.kt` to point to your deployed Cloud Run backend URL.
4. Build debug APK or release App Bundle:
   ```bash
   cd android
   ./gradlew assembleRelease
   # or ./gradlew bundleRelease
   ```

---

## 5. External Credentials Required for Full Live Production
The following items remain explicitly in **Sandbox / Simulation Mode** until authorized third-party credentials and legal compliance sign-off are added:
1. **Live UPI Acquirer / Payment Gateway**: Replace sandbox UPI IDs with authorized merchant keys (Razorpay / Cashfree / PayU / NPCI-licensed acquirer) and signed webhook verification secrets.
2. **Real-Money Payouts / Withdrawals**: Currently simulation-only (`isSimulated: true`); requires licensed banking rails & KYC/AML review before enabling real payouts.
3. **Live Email & SMS OTP Providers**: Configure `RESEND_API_KEY` and `TWILIO_*` environment variables for live OTP dispatch.
