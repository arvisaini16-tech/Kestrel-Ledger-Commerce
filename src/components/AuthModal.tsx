import React, { useEffect, useState } from 'react';
import { ArrowRight, KeyRound, Mail, ShieldCheck, Smartphone, X } from 'lucide-react';
import { requestOtpApi, setStoredOtpToken, verifyOtpApi } from '../lib/api';
import type { AuthSessionUser } from '../types/platform';
import { BrandLogo } from './BrandLogo';
import { useToast } from './ToastContext';

interface AuthModalProps {
  open: boolean;
  brandName?: string;
  logoUrl?: string;
  accentColor?: string;
  googleBusy: boolean;
  onClose: () => void;
  onGoogleSignIn: () => void;
  onOtpAuthenticated: (session: AuthSessionUser) => void;
}

type AuthTab = 'mobile' | 'email' | 'google';

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  brandName = 'Kestrel',
  logoUrl,
  accentColor,
  googleBusy,
  onClose,
  onGoogleSignIn,
  onOtpAuthenticated,
}) => {
  const { pushToast } = useToast();
  const [tab, setTab] = useState<AuthTab>('mobile');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [challengeSent, setChallengeSent] = useState(false);
  const [sandboxNotice, setSandboxNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!open) return null;

  const channel: 'mobile' | 'email' = tab === 'email' ? 'email' : 'mobile';

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);
    setBusy(true);
    try {
      const res = await requestOtpApi({
        channel,
        identifier: identifier.trim(),
        displayName: displayName.trim() || undefined,
        mode,
      });
      setChallengeSent(true);
      setSandboxNotice(res.sandboxNotice);
      setCooldown(res.resendCooldownSeconds || 30);
      pushToast('info', 'Verification Code Ready', 'OTP generated and hashed on the server (5-minute expiry).');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Unable to send OTP.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);
    setBusy(true);
    try {
      const res = await verifyOtpApi({
        channel,
        identifier: identifier.trim(),
        otp: otpCode.trim(),
        displayName: displayName.trim() || undefined,
        referralCode: referralCode.trim() || undefined,
      });
      setStoredOtpToken(res.token);
      pushToast('success', `Welcome to ${brandName}`, 'OTP verified and authenticated session established.');
      onOtpAuthenticated({ ...res.session, otpToken: res.token });
      onClose();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'OTP verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const resetChallenge = (nextTab: AuthTab) => {
    setTab(nextTab);
    setChallengeSent(false);
    setOtpCode('');
    setSandboxNotice('');
    setErrorText(null);
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <BrandLogo brandName={brandName} logoUrl={logoUrl} accentColor={accentColor} size="md" subtitle="Sign In & Register" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Option A / B / C Method Switcher */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => resetChallenge('mobile')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                tab === 'mobile'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Mobile OTP
            </button>
            <button
              type="button"
              onClick={() => resetChallenge('email')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                tab === 'email'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              Email OTP
            </button>
            <button
              type="button"
              onClick={() => resetChallenge('google')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                tab === 'google'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Google ID
            </button>
          </div>

          {errorText && (
            <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 text-xs text-red-800 dark:text-red-300">
              {errorText}
            </div>
          )}

          {tab === 'google' ? (
            <div className="space-y-4 py-2">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Sign in with your verified Google Identity account synced directly to Cloud Firestore and
                Role-Based Super Admin policies.
              </p>
              <button
                type="button"
                disabled={googleBusy}
                onClick={onGoogleSignIn}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl disabled:opacity-60 cursor-pointer"
              >
                {googleBusy ? 'Connecting Google Auth...' : 'Continue with Google Sign-In'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {mode === 'login' ? 'Sign In with Verified OTP' : 'Create New Account'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setErrorText(null);
                  }}
                  className="text-blue-700 dark:text-blue-400 font-medium hover:underline cursor-pointer"
                >
                  {mode === 'login' ? 'New user? Register' : 'Existing user? Sign In'}
                </button>
              </div>

              {!challengeSent ? (
                <form onSubmit={handleRequestOtp} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {tab === 'email' ? 'Verified Email Address' : 'Mobile Number (with country code)'}
                    </label>
                    <input
                      type={tab === 'email' ? 'email' : 'tel'}
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={tab === 'email' ? 'name@example.com' : '+919876543210'}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {mode === 'register' && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Full Name"
                          className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Referral Code (Optional)
                        </label>
                        <input
                          type="text"
                          value={referralCode}
                          onChange={(e) => setReferralCode(e.target.value)}
                          placeholder="KST..."
                          className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl font-mono"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 hover:bg-slate-800 dark:hover:bg-blue-800 rounded-xl disabled:opacity-60 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {busy ? 'Generating Server OTP...' : `Send ${tab === 'email' ? 'Email' : 'Mobile'} OTP`}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-3">
                  {sandboxNotice && (
                    <div className="p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-xs text-amber-900 dark:text-amber-200 font-mono">
                      {sandboxNotice}
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Enter 6-Digit Verification Code for {identifier}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="6-digit OTP"
                      className="w-full px-3.5 py-2.5 text-base tracking-[0.25em] font-mono text-center border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy || otpCode.trim().length < 6}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl disabled:opacity-50 cursor-pointer"
                  >
                    {busy ? 'Verifying OTP...' : 'Verify OTP & Enter Workspace'}
                  </button>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <button
                      type="button"
                      onClick={() => setChallengeSent(false)}
                      className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      Change {tab === 'email' ? 'email' : 'number'}
                    </button>
                    <button
                      type="button"
                      disabled={cooldown > 0 || busy}
                      onClick={(e) => void handleRequestOtp(e as unknown as React.FormEvent)}
                      className="text-blue-700 dark:text-blue-400 font-medium disabled:opacity-50 cursor-pointer"
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                    </button>
                  </div>
                </form>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Protected by server-side scrypt OTP hashing, 5-minute expiry, 30s resend cooldown, and
                brute-force lockout after 5 failed attempts. One verified email or phone maps to one unique account.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
