export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width, marginBottom: 8 }} />;
}

export function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}
