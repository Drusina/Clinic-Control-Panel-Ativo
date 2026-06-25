import { useId } from "react";
import { cn } from "@/lib/utils";

const SWIRL_ROTATIONS = [0, 60, 120, 180, 240, 300];

/**
 * IONEX360 brand mark: gold hexagon with a 6-blade swirl. Self-colored
 * (gold gradient) so it reads on any surface. Decorative by default — the
 * accessible name is provided by the `Brand` wrapper.
 */
export function BrandMark({ className }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="24"
          y1="2.5"
          x2="24"
          y2="45.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#D9B45C" />
          <stop offset="0.55" stopColor="#C49A3D" />
          <stop offset="1" stopColor="#9F7C29" />
        </linearGradient>
      </defs>
      <polygon
        points="24,2.5 42.6,13.25 42.6,34.75 24,45.5 5.4,34.75 5.4,13.25"
        fill={`url(#${gradientId})`}
      />
      <g fill="#F7F0DC" fillOpacity="0.92">
        {SWIRL_ROTATIONS.map((deg) => (
          <path
            key={deg}
            transform={`rotate(${deg} 24 24)`}
            d="M24 24 C 26.5 16.5, 31.5 13.5, 38 15 C 34.5 20, 30 24, 24 24 Z"
          />
        ))}
      </g>
      <circle cx="24" cy="24" r="2.4" fill="#9F7C29" />
    </svg>
  );
}

/**
 * IONEX360 wordmark: "I" + hexagon mark (as the "O") + "NEX" in navy and
 * "360" in gold, set in Bricolage Grotesque. Size with a `text-*` class on
 * `className`; the mark scales with the font size (1em-based).
 */
export function Brand({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span
      role="img"
      aria-label="IONEX360"
      className={cn(
        "inline-flex items-center font-heading font-semibold leading-none tracking-tight",
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex items-center">
        <span className="text-primary">I</span>
        <BrandMark className={cn("mx-[0.03em] h-[1.05em] w-[1.05em]", markClassName)} />
        <span className="text-primary">NEX</span>
        <span className="text-brand-gold-strong">360</span>
      </span>
    </span>
  );
}
