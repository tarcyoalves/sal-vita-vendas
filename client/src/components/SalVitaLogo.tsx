interface SalVitaLogoProps {
  className?: string;
  /** "dark" = white logo (for dark/navy backgrounds), "light" = navy logo (for white backgrounds) */
  variant?: "dark" | "light";
  onClick?: () => void;
}

export default function SalVitaLogo({ className = "", variant = "light", onClick }: SalVitaLogoProps) {
  const navy = "#0C3680";
  const fg = variant === "dark" ? "#ffffff" : navy;
  const bg = variant === "dark" ? "transparent" : "white";

  return (
    <svg
      viewBox="0 0 400 300"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Sal Vita"
      onClick={onClick}
    >
      <defs>
        <clipPath id="sv-clip">
          <ellipse cx="200" cy="150" rx="188" ry="133" />
        </clipPath>
      </defs>

      {/* Oval background */}
      <ellipse cx="200" cy="150" rx="188" ry="133" fill={bg} />

      {/* Oval border */}
      <ellipse cx="200" cy="150" rx="188" ry="133" fill="none" stroke={fg} strokeWidth="12" />

      {/* Mountain hills */}
      <path
        d="M12 215 Q70 158 135 192 Q170 212 200 182 Q230 152 268 180 Q312 210 388 198 L388 283 H12 Z"
        fill={fg}
        clipPath="url(#sv-clip)"
      />

      {/* "Sal Vita" text — Pacifico loaded via Google Fonts in index.html */}
      <text
        x="200"
        y="178"
        textAnchor="middle"
        fontFamily="'Pacifico', 'Georgia', cursive"
        fontSize="88"
        fill={fg}
        letterSpacing="-1"
      >
        Sal Vita
      </text>
    </svg>
  );
}
