export default function GlobalLoading() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-pulse"
      aria-busy="true"
      aria-label="Loading page content"
    >
      {/* Top Banner Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-slate-800" />
          <div className="h-8 w-64 rounded bg-slate-800" />
          <div className="h-3.5 w-80 rounded bg-slate-800/70" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-10 w-28 rounded-lg bg-slate-800" />
          <div className="h-10 w-28 rounded-lg bg-slate-800" />
        </div>
      </div>

      {/* KPI Card Skeletons */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-slate-800" />
              <div className="h-4 w-4 rounded bg-slate-800" />
            </div>
            <div className="h-8 w-16 rounded bg-slate-800" />
            <div className="h-2.5 w-32 rounded bg-slate-800/60" />
          </div>
        ))}
      </div>

      {/* Table / Content Skeleton */}
      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/60">
          <div className="h-4 w-40 rounded bg-slate-800" />
          <div className="h-8 w-48 rounded bg-slate-800" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-3 border-b border-slate-800/40 last:border-0"
          >
            <div className="space-y-1.5 flex-1 pr-4">
              <div className="h-4 w-48 rounded bg-slate-800" />
              <div className="h-3 w-32 rounded bg-slate-800/60" />
            </div>
            <div className="h-6 w-24 rounded bg-slate-800/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
