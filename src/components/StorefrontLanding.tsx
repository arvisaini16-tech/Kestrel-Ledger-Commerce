import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  Coins,
  Moon,
  Package,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  DEFAULT_ADMIN_SETTINGS,
  HERO_BANNER_IMAGE,
  INITIAL_CATALOG_SEED,
  INITIAL_COIN_PACKAGES,
  INITIAL_PLAN_CONFIGS,
  computeDailyScheduleAmounts,
} from '../lib/seedData';
import type { AdminSettings, CoinPackage, PlanConfig, Product, TickerEvent } from '../types/platform';
import { BrandLogo } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallButton';

interface StorefrontLandingProps {
  products: Product[];
  coinPackages: CoinPackage[];
  plans: PlanConfig[];
  adminSettings: AdminSettings | null;
  tickerEvents: TickerEvent[];
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  isSignedIn: boolean;
  isAdmin: boolean;
  userEmail?: string | null;
  authBusy: boolean;
  onOpenAuthModal: () => void;
  onOpenUserApp: (initialTab?: string) => void;
  onOpenAdminApp: () => void;
}

export const StorefrontLanding: React.FC<StorefrontLandingProps> = ({
  products,
  coinPackages,
  plans,
  adminSettings,
  tickerEvents,
  theme,
  onToggleTheme,
  isSignedIn,
  isAdmin,
  authBusy,
  onOpenAuthModal,
  onOpenUserApp,
  onOpenAdminApp,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeProduct, setActiveProduct] = useState<(Product | (typeof INITIAL_CATALOG_SEED)[number]) | null>(null);

  const brand = adminSettings || { ...DEFAULT_ADMIN_SETTINGS, updatedAt: '' };

  const activePackages = useMemo(() => {
    const src = coinPackages.length > 0 ? coinPackages.filter((p) => p.status === 'active') : INITIAL_COIN_PACKAGES;
    return [...src].sort((a, b) => a.displayOrder - b.displayOrder);
  }, [coinPackages]);

  const activePlans = useMemo(() => {
    const src = plans.length > 0 ? plans.filter((p) => p.status === 'active') : INITIAL_PLAN_CONFIGS;
    return [...src].sort((a, b) => a.displayOrder - b.displayOrder);
  }, [plans]);

  const catalogList = useMemo(() => {
    const source = products.length > 0 ? products.filter((p) => p.active) : INITIAL_CATALOG_SEED;
    if (selectedCategory === 'All') return source;
    return source.filter((item) => item.category === selectedCategory);
  }, [products, selectedCategory]);

  const categories = ['All', 'Hardware', 'Terminals', 'Membership Kits', 'Service Plans'];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-950/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <a href="#top" className="shrink-0">
            <BrandLogo brandName={brand.brandName} logoUrl={brand.logoUrl} accentColor={brand.accentColor} size="md" />
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#packages" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Coins
            </a>
            <a href="#plans-24h" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              24h Plans
            </a>
            <a href="#catalogue" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Catalogue
            </a>
            <a href="#architecture" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              AI &amp; Security
            </a>
            <a href="#faq" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {isSignedIn ? (
              <button
                type="button"
                onClick={() => onOpenUserApp('dashboard')}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{ backgroundColor: brand.accentColor || '#1d4ed8' }}
              >
                Open Workspace
              </button>
            ) : (
              <button
                type="button"
                disabled={authBusy}
                onClick={onOpenAuthModal}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 rounded-lg hover:bg-slate-800 dark:hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {authBusy ? 'Connecting...' : 'Sign In / OTP'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Split Section */}
      <section id="top" className="max-w-7xl mx-auto px-6 pt-10 pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="lg:col-span-6 flex flex-col justify-center py-2"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 tracking-wide">
              Server-Validated Coin Ledger · 24h Automatic Credit Engine · Sandbox UPI Pool
            </p>
            <h1
              className="mt-3 font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.08]"
              style={{ textWrap: 'balance' }}
            >
              Precision commerce, coin treasury, and AI-powered operations.
            </h1>

            {/* Real Transaction Activity Ticker immediately below main heading */}
            {brand.tickerEnabled && (
              <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Real Transaction Activity</span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Verified Additions &amp; Withdrawals · Zero PII
                  </span>
                </div>

                {tickerEvents.length === 0 ? (
                  <p className="pt-2.5 text-xs text-slate-500 dark:text-slate-400">
                    No verified coin additions or completed withdrawals recorded yet.
                  </p>
                ) : (
                  <div className="pt-2.5 flex flex-col gap-1.5 max-h-28 overflow-y-auto">
                    {tickerEvents.slice(0, 4).map((ev) => (
                      <div
                        key={ev.eventId}
                        className="flex items-center justify-between gap-3 text-xs py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/60"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                            {ev.maskedUserId}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-600 dark:text-slate-300 truncate">{ev.verifiedLabel}</span>
                        </div>
                        <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
                          {ev.eventType === 'withdrawal_completed' ? '-' : '+'}
                          {ev.amountCoins.toLocaleString()} Coins
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="mt-5 text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              {brand.tagline}. Sign in with Mobile OTP, Email OTP, or Google Identity to manage coin packages,
              enroll in automated 24-hour credit plans, and explore 11 admin-controlled Gemini AI features.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3.5">
              {isSignedIn ? (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenUserApp('dashboard')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    style={{ backgroundColor: brand.accentColor || '#1d4ed8' }}
                  >
                    Enter User Dashboard
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={onOpenAdminApp}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Super Admin Console
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={onOpenAuthModal}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  style={{ backgroundColor: brand.accentColor || '#1d4ed8' }}
                >
                  {authBusy ? 'Signing In...' : 'Sign In (OTP or Google)'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              <a
                href="#plans-24h"
                className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
              >
                Explore 24h Plans
              </a>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Payment Mode</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">Random Sandbox UPI</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Plan Engine</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">Strict 24h Schedule</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Companion Apps</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">PWA + Android</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="lg:col-span-6"
          >
            <div className="h-full min-h-[360px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-200 dark:bg-slate-900 relative">
              <img
                src={HERO_BANNER_IMAGE}
                alt="Kestrel hardware security key and mobile ledger console"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent text-white">
                <p className="text-xs text-slate-200">
                  Mobile OTP · Email OTP · Automatic 24-Hour Credit Ledger
                </p>
                <p className="mt-1 text-sm font-medium">
                  Every coin credit, plan schedule, and random sandbox UPI assignment is cryptographically signed.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Coin Purchase Packages */}
      <section id="packages" className="max-w-7xl mx-auto px-6 py-14 border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Standard Coin Bundles</p>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              Coin Purchase Packages (100 to 50,000)
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Backend automatically selects an enabled Sandbox UPI configuration per checkout.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {activePackages.map((pkg) => (
            <div
              key={pkg.packageId}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Coins className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{pkg.currency}</span>
                </div>
                <p className="mt-3 font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {pkg.coinQuantity.toLocaleString()} Coins
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{pkg.name}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{pkg.description}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {pkg.currency} {pkg.purchasePrice.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => (isSignedIn ? onOpenUserApp('wallet') : onOpenAuthModal())}
                  className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Select
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Configurable 24-Hour Plans Showcase */}
      <section id="plans-24h" className="max-w-7xl mx-auto px-6 py-14 border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Automatic Scheduled Disbursements</p>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              Configurable 24-Hour Membership Plans
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Credits execute strictly once every 24 hours; purchased terms lock permanently to your snapshot.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {activePlans.map((plan) => {
            const schedule = computeDailyScheduleAmounts(plan.totalScheduledCredits, plan.durationDays);
            const firstDay = schedule[0];
            const lastDay = schedule[schedule.length - 1];
            return (
              <div
                key={plan.planId}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 font-semibold">
                    <CalendarClock className="w-4 h-4" />
                    <span>{plan.durationDays} Days · 24h Cycle</span>
                  </div>
                  <h3 className="mt-3 font-display text-base font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{plan.description}</p>

                  <div className="mt-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Plan Cost</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                        {plan.purchasePrice.toLocaleString()} {plan.currency}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Total Scheduled</span>
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {plan.totalScheduledCredits.toLocaleString()} Coins
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Per 24h Release</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">
                        {firstDay === lastDay ? `${firstDay} / day` : `${firstDay} (final ${lastDay})`}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => (isSignedIn ? onOpenUserApp('catalog') : onOpenAuthModal())}
                  className="mt-5 w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-700 hover:bg-slate-800 dark:hover:bg-blue-800 rounded-lg transition-colors cursor-pointer"
                >
                  {isSignedIn ? 'Activate in Workspace' : 'Sign In to Subscribe'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Featured Hardware & Service Catalogue */}
      <section id="catalogue" className="max-w-7xl mx-auto px-6 py-14 border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Catalogue &amp; Hardware</p>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              Security Keys, Terminals, and Operating Suites
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-lg">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
          {catalogList.map((item) => (
            <article
              key={item.productId}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col transition-transform duration-150 hover:-translate-y-0.5"
            >
              <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>

              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{item.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.itemType === 'plan' ? `${item.billingCycle} plan` : 'Physical hardware'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.stock > 0 ? 'In stock' : 'Waitlist'}</span>
                </div>

                <h3 className="mt-2 font-display text-base font-semibold text-slate-900 dark:text-white leading-snug">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>

                <div className="mt-auto pt-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="font-mono text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                      {item.coinPrice.toLocaleString()} Coins
                    </p>
                    <p className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      INR {item.inrPrice.toLocaleString()} equiv.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveProduct(item)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Inspect Details
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Architecture & AI Platform Section */}
      <section id="architecture" className="max-w-7xl mx-auto px-6 py-14 border-t border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <ShieldCheck className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-white">
              01. Cryptographic OTP &amp; Ledger Auth
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Mobile OTP, Email OTP, and Google Identity enforce strict server-side scrypt hashing, rate
              limits, brute-force lockouts, and zero client balance tampering.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <Package className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-white">
              02. Random Sandbox UPI &amp; 24h Plans
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Backend randomly pairs each coin checkout with an enabled sandbox UPI desk and fires
              idempotent 24-hour scheduled plan credits without duplicates.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <Bot className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-white">
              03. 11 Controlled Gemini AI Modules
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Smart Assistant (English/Hindi + Voice), Fraud Detection, Business Intelligence, Theme
              Designer, Helpdesk Triage, and DB Health governed by Admin switches.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="max-w-7xl mx-auto px-6 py-14 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl">
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Frequently Asked Questions</h2>
          <dl className="mt-6 space-y-6 divide-y divide-slate-200 dark:divide-slate-800">
            <div className="pt-4">
              <dt className="text-sm font-semibold text-slate-900 dark:text-white">
                How does the 24-hour scheduled plan credit engine work?
              </dt>
              <dd className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                When you purchase an active plan, the backend locks your plan snapshot and generates sequential
                24-hour credit events. Remainder coins from division are cleanly reconciled on the final event,
                and an idempotency lock guarantees zero double-credits.
              </dd>
            </div>
            <div className="pt-4">
              <dt className="text-sm font-semibold text-slate-900 dark:text-white">
                How are UPI merchant accounts assigned during coin top-ups?
              </dt>
              <dd className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                Each time you generate a sandbox payment intent, the backend randomly selects one enabled
                sandbox UPI configuration and locks it to that payment request. No real UPI PINs or live rails
                are used.
              </dd>
            </div>
            <div className="pt-4">
              <dt className="text-sm font-semibold text-slate-900 dark:text-white">
                What appears in the Real Transaction Activity ticker?
              </dt>
              <dd className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                Only real verified coin additions and completed withdrawals from the platform ledger appear,
                masked to User ID + coin amount with zero personal emails, phones, or names exposed.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <BrandLogo brandName={brand.brandName} logoUrl={brand.logoUrl} accentColor={brand.accentColor} size="sm" />
            <span>Sandbox Fintech &amp; Product Platform · PWA + Android Synced</span>
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => (isSignedIn ? onOpenUserApp('support') : onOpenAuthModal())}
              className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Help &amp; Support Desk
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={onOpenAdminApp}
                className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Super Admin Portal
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Product / Plan Detail Modal */}
      {activeProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl w-full overflow-hidden shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {activeProduct.category} · {activeProduct.itemType === 'plan' ? 'Service Plan' : 'Product'}
              </span>
              <button
                type="button"
                onClick={() => setActiveProduct(null)}
                aria-label="Close details"
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-5">
              <div className="aspect-[16/9] rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                <img
                  src={activeProduct.imageUrl}
                  alt={activeProduct.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">{activeProduct.title}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {activeProduct.description}
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-4 border-y border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Coin Price</p>
                  <p className="font-mono text-base font-semibold text-slate-900 dark:text-white tabular-nums">
                    {activeProduct.coinPrice.toLocaleString()} Coins
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Reference Value</p>
                  <p className="font-mono text-base font-semibold text-slate-900 dark:text-white tabular-nums">
                    INR {activeProduct.inrPrice.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Billing Cycle</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white capitalize">
                    {activeProduct.billingCycle.replace('_', ' ')}
                  </p>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Included Specifications</p>
                  <ul className="mt-1.5 space-y-1 text-slate-600 dark:text-slate-300">
                    {activeProduct.features.map((feat) => (
                      <li key={feat} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Eligibility</p>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-300">{activeProduct.eligibility}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Terms</p>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-300">{activeProduct.terms}</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveProduct(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveProduct(null);
                  if (isSignedIn) {
                    onOpenUserApp('catalog');
                  } else {
                    onOpenAuthModal();
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
              >
                {isSignedIn ? 'Proceed in Catalogue' : 'Sign In to Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
