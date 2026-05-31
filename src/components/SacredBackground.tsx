/** Subtle mandala / chakra motif — low opacity, non-interactive. */
export default function SacredBackground() {
  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none"
      aria-hidden
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#0c0a08] via-[#14100c] to-[#0a0e14]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(240,99,6,0.12),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(180,120,40,0.08),transparent_45%)]" />

      {/* Sanskrit-inspired decorative band */}
      <div
        className="absolute top-0 left-0 right-0 h-px opacity-20"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,180,80,0.6), rgba(240,99,6,0.5), rgba(255,180,80,0.6), transparent)',
        }}
      />

      <svg
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(95vw,780px)] h-[min(95vw,780px)] text-saffron-400/90 animate-spin-slow"
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="200" cy="200" r="188" stroke="currentColor" strokeWidth="0.5" opacity="0.15" />
        <circle cx="200" cy="200" r="150" stroke="currentColor" strokeWidth="0.4" opacity="0.12" />
        <circle cx="200" cy="200" r="110" stroke="currentColor" strokeWidth="0.35" opacity="0.1" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const x1 = 200 + 110 * Math.cos(a);
          const y1 = 200 + 110 * Math.sin(a);
          const x2 = 200 + 188 * Math.cos(a);
          const y2 = 200 + 188 * Math.sin(a);
          return (
            <line
              key={`spoke-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth="0.35"
              opacity="0.14"
            />
          );
        })}
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * 45 * Math.PI) / 180;
          const cx = 200 + 70 * Math.cos(a);
          const cy = 200 + 70 * Math.sin(a);
          return (
            <circle
              key={`petal-${i}`}
              cx={cx}
              cy={cy}
              r="22"
              stroke="currentColor"
              strokeWidth="0.4"
              opacity="0.1"
            />
          );
        })}
        <circle cx="200" cy="200" r="28" stroke="currentColor" strokeWidth="0.6" opacity="0.18" />
        <circle cx="200" cy="200" r="8" fill="currentColor" opacity="0.12" />
      </svg>

      <svg
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(70vw,520px)] h-[min(70vw,520px)] text-amber-200/80 animate-spin-slow-reverse"
        viewBox="0 0 300 300"
        fill="none"
      >
        {Array.from({ length: 24 }).map((_, i) => {
          const rot = i * 15;
          return (
            <g key={`tri-${i}`} transform={`rotate(${rot} 150 150)`}>
              <path
                d="M150 40 L158 130 L142 130 Z"
                stroke="currentColor"
                strokeWidth="0.3"
                opacity="0.08"
                fill="currentColor"
                fillOpacity="0.03"
              />
            </g>
          );
        })}
      </svg>

      {/* Corner kalā arcs */}
      <svg className="absolute -top-20 -right-20 w-64 h-64 text-saffron-500/30" viewBox="0 0 100 100">
        <path
          d="M50 10 A40 40 0 0 1 90 50"
          stroke="currentColor"
          strokeWidth="0.5"
          fill="none"
          opacity="0.25"
        />
        <path
          d="M50 10 A30 30 0 0 1 80 50"
          stroke="currentColor"
          strokeWidth="0.4"
          fill="none"
          opacity="0.15"
        />
      </svg>
      <svg className="absolute -bottom-24 -left-24 w-72 h-72 text-amber-600/25" viewBox="0 0 100 100">
        <path
          d="M50 90 A40 40 0 0 1 10 50"
          stroke="currentColor"
          strokeWidth="0.5"
          fill="none"
          opacity="0.25"
        />
      </svg>

      <p
        className="absolute bottom-[12%] left-1/2 -translate-x-1/2 font-display text-[clamp(3rem,12vw,6rem)] text-saffron-500/[0.04] tracking-[0.3em] whitespace-nowrap"
        style={{ fontFamily: '"DM Serif Display", Georgia, serif' }}
      >
        ॐ
      </p>
    </div>
  );
}
