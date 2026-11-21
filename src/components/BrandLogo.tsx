import React from 'react';

export const DEFAULT_KESTREL_LOGO = '/assets/aistudio/image_d2358f68.png';

interface BrandLogoProps {
  brandName?: string;
  logoUrl?: string;
  accentColor?: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  brandName = 'Kestrel',
  logoUrl,
  subtitle,
  size = 'md',
}) => {
  const effectiveLogoUrl =
    !logoUrl || logoUrl.trim() === '' || logoUrl === '/icon.svg'
      ? DEFAULT_KESTREL_LOGO
      : logoUrl;

  const isOfficialKestrelLogo = effectiveLogoUrl === DEFAULT_KESTREL_LOGO;
  const heightClass =
    size === 'sm'
      ? 'h-8 sm:h-9'
      : size === 'lg'
      ? 'h-12 sm:h-14'
      : 'h-9 sm:h-11';

  const showSeparateBrandText =
    !isOfficialKestrelLogo && brandName.trim().toLowerCase() !== 'kestrel';

  return (
    <div className="inline-flex items-center gap-2.5 shrink-0 max-w-full">
      <div className="rounded-lg overflow-hidden bg-[#06112b] border border-slate-200/80 dark:border-slate-700/80 shadow-xs shrink-0 flex items-center justify-center">
        <img
          src={effectiveLogoUrl}
          alt={`${brandName} Logo`}
          className={`${heightClass} w-auto object-contain block select-none`}
          referrerPolicy="no-referrer"
        />
      </div>

      {(showSeparateBrandText || subtitle) && (
        <div className="leading-tight min-w-0">
          {showSeparateBrandText && (
            <span className="font-display font-bold tracking-tight text-slate-900 dark:text-white block whitespace-nowrap text-sm sm:text-base">
              {brandName}
            </span>
          )}
          {subtitle && (
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block whitespace-nowrap">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
