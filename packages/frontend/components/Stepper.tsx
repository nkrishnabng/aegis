export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="stepper">
      {steps.map((label, i) => (
        <div
          key={label}
          className={`stepper-step ${i === current ? "active" : ""} ${i < current ? "done" : ""}`}
        >
          {i < current ? "✓ " : `${i + 1}. `}
          {label}
        </div>
      ))}
    </div>
  );
}
