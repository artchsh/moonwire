import { useId } from "react";

/**
 * Moonwire mark: one extra-bold crescent glyph, filled with a moon-white→cyan
 * gradient. Used alone or beside the wordmark.
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  const maskId = `mw-cut-${id}`;
  const gradId = `mw-grad-${id}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradId} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--mw-text)" />
          <stop offset="1" stopColor="var(--mw-cyan)" />
        </linearGradient>
        <mask id={maskId}>
          <rect width="32" height="32" fill="black" />
          <circle cx="16" cy="16" r="14" fill="white" />
          {/* Carve the crescent — offset up-right for a bold waxing moon. */}
          <circle cx="23" cy="11" r="12" fill="black" />
        </mask>
      </defs>
      <rect width="32" height="32" fill={`url(#${gradId})`} mask={`url(#${maskId})`} />
    </svg>
  );
}

export function Logo({ size = 24, label = true }: { size?: number; label?: boolean }) {
  return (
    <span className="mw-logo">
      <LogoMark size={size} />
      {label && <span className="mw-logo__name">Moonwire</span>}
    </span>
  );
}
