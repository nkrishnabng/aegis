const SIZE = 96;
const STROKE = 9;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function Gauge({
  value,
  label,
  color = "var(--success)",
}: {
  value: number;
  label: string;
  color?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="22"
          fontWeight="700"
          fill="var(--text)"
        >
          {Math.round(clamped)}
        </text>
      </svg>
      <div>
        <div className="muted" style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </div>
      </div>
    </div>
  );
}
