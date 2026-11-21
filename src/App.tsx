import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { AuthModal } from './components/AuthModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineIndicator } from './components/OfflineIndicator';
import { StorefrontLanding } from './components/StorefrontLanding';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { ToastProvider, useToast } from './components/ToastContext';
import { UserWorkspace, type UserTab } from './components/UserWorkspace';
import {
  fetchOtpSessionApi,
  fetchPublicBootstrapApi,
  fetchTickerApi,
  getStoredOtpToken,
  logoutOtpSessionApi,
  setStoredOtpToken,
} from './lib/api';
import { OperationType, auth, db, handleFirestoreError, signInWithGoogle, signOutAccount } from './lib/firebase';
import { ensureUserBootstrap, logSecurityEvent } from './lib/firestoreService';
import {
  DEFAULT_ADMIN_SETTINGS,
  DEFAULT_AI_FEATURE_SETTINGS,
  DEFAULT_GATEWAY_CONFIG,
  INITIAL_COIN_PACKAGES,
  INITIAL_PLAN_CONFIGS,
} from './lib/seedData';
import type {
  AdminSettings,
  AiFeatureSettings,
  AuthSessionUser,
  CoinPackage,
  GatewayConfig,
  PlanConfig,
  Product,
  TickerEvent,
  UserProfile,
  Wallet,
} from './types/platform';

type AppView = 'storefront' | 'user' | 'admin';
const THEME_STORAGE_KEY = 'kestrel_theme';

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore
  }
  return 'light';
}

function PlatformRoot() {
  const { pushToast } = useToast();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [otpSession, setOtpSession] = useState<AuthSessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isFirebaseAdmin, setIsFirebaseAdmin] = useState(false);

  const [view, setView] = useState<AppView>('storefront');
  const [userInitialTab, setUserInitialTab] = useState<UserTab>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);

  const [products, setProducts] = useState<Product[]>([]);
  const [coinPackages, setCoinPackages] = useState<CoinPackage[]>(INITIAL_COIN_PACKAGES as CoinPackage[]);
  const [plans, setPlans] = useState<PlanConfig[]>(INITIAL_PLAN_CONFIGS as PlanConfig[]);
  const [adminSettings, setAdminSettings] = useState<AdminSettings>({
    ...DEFAULT_ADMIN_SETTINGS,
    updatedAt: '',
  });
  const [aiFeatureSettings, setAiFeatureSettings] = useState<AiFeatureSettings>({
    ...DEFAULT_AI_FEATURE_SETTINGS,
    updatedAt: '',
  });
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig | null>({
    ...DEFAULT_GATEWAY_CONFIG,
    updatedAt: '',
  });
  const [tickerEvents, setTickerEvents] = useState<TickerEvent[]>([]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);

  const isSignedIn = Boolean(firebaseUser || otpSession);
  const isAdmin = Boolean(isFirebaseAdmin || otpSession?.isAdmin);
  const activeEmail = firebaseUser?.email || otpSession?.email || otpSession?.phone || null;

  // Apply Tailwind v4 dark class & sync localStorage
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // Dynamic document title & favicon synced with AdminSettings
  useEffect(() => {
    if (adminSettings.brandName) {
      document.title = `${adminSettings.brandName} · ${adminSettings.tagline || 'Ledger & Commerce Platform'}`;
    }
    const resolvedFavicon =
      !adminSettings.faviconUrl || adminSettings.faviconUrl === '/icon.svg'
        ? '/favicon-32x32.png'
        : adminSettings.faviconUrl;
    let iconLink = document.querySelector<HTMLLinkElement>("link[rel='icon'][sizes='32x32']") ||
      document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!iconLink) {
      iconLink = document.createElement('link');
      iconLink.rel = 'icon';
      document.head.appendChild(iconLink);
    }
    iconLink.href = resolvedFavicon;
  }, [adminSettings.brandName, adminSettings.tagline, adminSettings.faviconUrl]);

  const refreshBootstrap = useCallback(async () => {
    try {
      const data = await fetchPublicBootstrapApi();
      if (Array.isArray(data.products) && data.products.length > 0) setProducts(data.products);
      if (Array.isArray(data.coinPackages) && data.coinPackages.length > 0) setCoinPackages(data.coinPackages);
      if (Array.isArray(data.plans) && data.plans.length > 0) setPlans(data.plans);
      if (data.adminSettings) {
        setAdminSettings(data.adminSettings);
        try {
          if (!localStorage.getItem(THEME_STORAGE_KEY) && data.adminSettings.defaultTheme) {
            setTheme(data.adminSettings.defaultTheme);
          }
        } catch {
          // ignore
        }
      }
      if (data.aiFeatureSettings) setAiFeatureSettings(data.aiFeatureSettings);
      if (data.gatewayConfig) setGatewayConfig(data.gatewayConfig);
      if (Array.isArray(data.ticker)) setTickerEvents(data.ticker);
    } catch {
      // Fallback to seeded defaults + Firestore listeners if backend unavailable
    }
  }, []);

  const refreshTicker = useCallback(async () => {
    try {
      const res = await fetchTickerApi();
      if (Array.isArray(res.events)) setTickerEvents(res.events);
    } catch {
      // ignore transient errors
    }
  }, []);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  // Poll verified ticker updates every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      void refreshTicker();
    }, 30000);
    return () => clearInterval(timer);
  }, [refreshTicker]);

  // Restore OTP session if token present, and subscribe to Firebase Auth
  useEffect(() => {
    let mounted = true;
    const initOtpAndFirebase = async () => {
      const storedToken = getStoredOtpToken();
      if (storedToken) {
        try {
          const { session } = await fetchOtpSessionApi();
          if (mounted) {
            setOtpSession({ ...session, otpToken: storedToken });
          }
        } catch {
          setStoredOtpToken(null);
        }
      }
    };
    void initOtpAndFirebase();

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setFirebaseUser(currentUser);
      if (currentUser) {
        try {
          const { isAdmin: adminFlag } = await ensureUserBootstrap(currentUser);
          setIsFirebaseAdmin(adminFlag);
          await logSecurityEvent({
            actorUid: currentUser.uid,
            actorEmail: currentUser.email || '',
            action: 'USER_SESSION_ESTABLISHED',
            severity: 'info',
            targetId: currentUser.uid,
            details: `Authenticated session started (${currentUser.email}).`,
          });
        } catch (err) {
          console.error('Bootstrap warning:', err);
        }
      } else {
        setIsFirebaseAdmin(false);
        setProfile(null);
        setWallet(null);
      }
      if (mounted) setAuthReady(true);
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Products subscription from Firestore (active for public/user; all for Firebase admin)
  useEffect(() => {
    const q = isFirebaseAdmin
      ? query(collection(db, 'products'))
      : query(collection(db, 'products'), where('active', '==', true));

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          setProducts(snap.docs.map((d) => d.data() as Product));
        }
      },
      () => {
        // Keep API bootstrap data if Firestore rules reject unauthenticated or non-Firebase reads
      }
    );
    return () => unsub();
  }, [isFirebaseAdmin]);

  // Authenticated Firebase user profile, wallet, config, packages, plans listeners
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const unsubProfile = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) setProfile(snap.data() as UserProfile);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`)
    );

    const unsubWallet = onSnapshot(
      doc(db, 'wallets', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) setWallet(snap.data() as Wallet);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `wallets/${firebaseUser.uid}`)
    );

    const unsubConfig = onSnapshot(
      doc(db, 'gateway_config', 'default'),
      (snap) => {
        if (snap.exists()) setGatewayConfig(snap.data() as GatewayConfig);
      },
      () => {}
    );

    const unsubAdminSettings = onSnapshot(
      doc(db, 'adminSettings', 'default'),
      (snap) => {
        if (snap.exists()) setAdminSettings(snap.data() as AdminSettings);
      },
      () => {}
    );

    const unsubAiSettings = onSnapshot(
      doc(db, 'aiFeatureSettings', 'default'),
      (snap) => {
        if (snap.exists()) setAiFeatureSettings(snap.data() as AiFeatureSettings);
      },
      () => {}
    );

    const unsubPackages = onSnapshot(
      collection(db, 'coinPackages'),
      (snap) => {
        if (!snap.empty) setCoinPackages(snap.docs.map((d) => d.data() as CoinPackage));
      },
      () => {}
    );

    const unsubPlans = onSnapshot(
      collection(db, 'plans'),
      (snap) => {
        if (!snap.empty) setPlans(snap.docs.map((d) => d.data() as PlanConfig));
      },
      () => {}
    );

    return () => {
      unsubProfile();
      unsubWallet();
      unsubConfig();
      unsubAdminSettings();
      unsubAiSettings();
      unsubPackages();
      unsubPlans();
    };
  }, [authReady, firebaseUser]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleGoogleSignIn = async () => {
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
      setAuthModalOpen(false);
      setView('user');
      pushToast('success', 'Signed in with Google', 'Your Kestrel workspace session is active.');
    } catch (err) {
      pushToast('error', 'Google Sign-In Failed', err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleOtpAuthenticated = (session: AuthSessionUser) => {
    setOtpSession(session);
    setAuthModalOpen(false);
    setView(session.isAdmin ? 'admin' : 'user');
    void refreshBootstrap();
  };

  const handleSignOut = async () => {
    if (otpSession) {
      await logoutOtpSessionApi().catch(() => {});
      setStoredOtpToken(null);
      setOtpSession(null);
    }
    if (firebaseUser) {
      await signOutAccount().catch(() => {});
    }
    setProfile(null);
    setWallet(null);
    setView('storefront');
    pushToast('info', 'Signed Out', 'Your session has been closed securely.');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-3 px-6">
        <div className="w-48 h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div className="h-full w-1/2 bg-blue-600 rounded-full" />
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Initializing {adminSettings.brandName} workspace...
        </p>
      </div>
    );
  }

  return (
    <>
      {view === 'admin' && isSignedIn && isAdmin ? (
        <SuperAdminDashboard
          firebaseUser={firebaseUser}
          otpSession={otpSession}
          products={products}
          gatewayConfig={gatewayConfig}
          adminSettings={adminSettings}
          aiFeatureSettings={aiFeatureSettings}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onRefreshBootstrap={refreshBootstrap}
          onExitAdmin={() => setView('user')}
        />
      ) : view === 'user' && isSignedIn ? (
        <UserWorkspace
          firebaseUser={firebaseUser}
          otpSession={otpSession}
          profile={profile}
          wallet={wallet}
          products={products}
          coinPackages={coinPackages}
          plans={plans}
          gatewayConfig={gatewayConfig}
          adminSettings={adminSettings}
          aiFeatureSettings={aiFeatureSettings}
          isAdmin={isAdmin}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          initialTab={userInitialTab}
          onBackToStorefront={() => {
            setView('storefront');
            void refreshTicker();
          }}
          onOpenAdmin={() => setView('admin')}
          onSignOut={() => void handleSignOut()}
        />
      ) : (
        <StorefrontLanding
          products={products}
          coinPackages={coinPackages}
          plans={plans}
          adminSettings={adminSettings}
          tickerEvents={tickerEvents}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          isSignedIn={isSignedIn}
          isAdmin={isAdmin}
          userEmail={activeEmail}
          authBusy={googleBusy}
          onOpenAuthModal={() => setAuthModalOpen(true)}
          onOpenUserApp={(tab) => {
            setUserInitialTab((tab as UserTab) || 'dashboard');
            setView('user');
          }}
          onOpenAdminApp={() => setView('admin')}
        />
      )}

      <AuthModal
        open={authModalOpen}
        brandName={adminSettings.brandName}
        logoUrl={adminSettings.logoUrl}
        accentColor={adminSettings.accentColor}
        googleBusy={googleBusy}
        onClose={() => setAuthModalOpen(false)}
        onGoogleSignIn={() => void handleGoogleSignIn()}
        onOtpAuthenticated={handleOtpAuthenticated}
      />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <PlatformRoot />
        <OfflineIndicator />
      </ToastProvider>
    </ErrorBoundary>
  );
}
