import { cn } from "@/components/ui";

/**
 * Engosoft identity.
 *
 * The mark is a geometric "e" — a single thick stroke that runs along the
 * crossbar and wraps the ring, carrying the logo's azure→navy gradient, with
 * the three descending dots at the lower left.
 *
 * If you have the original vector, drop it at `public/engosoft-logo.svg` and
 * swap <LogoMark /> for <img src="/engosoft-logo.svg" /> — nothing else changes.
 */
export function LogoMark({ className, id = "engo" }: { className?: string; id?: string }) {
  const grad = `${id}-gradient`;
  return (
    <svg viewBox="0 0 64 64" fill="none" role="img" aria-label="Engosoft" className={className}>
      <defs>
        <linearGradient id={grad} x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgb(var(--brand-400))" />
          <stop offset="0.45" stopColor="rgb(var(--brand-500))" />
          <stop offset="1" stopColor="rgb(var(--navy))" />
        </linearGradient>
      </defs>

      {/* crossbar → ring, drawn as one continuous stroke, aperture at lower-right */}
      <path
        d="M15 31 H52 A21 21 0 1 0 45.4 47.9"
        stroke={`url(#${grad})`}
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* the descending dots */}
      <circle cx="13.5" cy="52" r="3.1" fill="rgb(var(--brand-500))" />
      <circle cx="6.5" cy="58" r="2.1" fill="rgb(var(--brand-400))" />
      <circle cx="1.6" cy="62.4" r="1.3" fill="rgb(var(--brand-400))" opacity="0.7" />
    </svg>
  );
}

/** Full lock-up: mark + ENGO·SOFT wordmark. */
export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="h-9 w-9 shrink-0" />
      {showWordmark && (
        <span
          className="select-none text-[19px] font-extrabold leading-none tracking-tight"
          style={{ direction: "ltr" }}
        >
          <span className="text-navy">ENGO</span>
          <span className="text-brand-500">SOFT</span>
        </span>
      )}
    </span>
  );
}
