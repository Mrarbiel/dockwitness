export default function TechnologyLoading() {
  return (
    <div
      className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 animate-pulse"
      aria-busy="true"
      aria-label="Loading system specifications and architecture"
    >
      {/* Header & Breadcrumbs Skeleton */}
      <div className="border-b border-slate-800 pb-6 space-y-3">
        <div className="h-4 w-32 rounded bg-slate-800" />
        <div className="flex items-center gap-2">
          <div className="h-4 w-56 rounded bg-slate-800" />
          <div className="h-4 w-40 rounded bg-slate-800/80" />
        </div>
        <div className="h-10 w-96 rounded bg-slate-800" />
        <div className="h-4 w-3/4 rounded bg-slate-800/60" />
      </div>

      <div className="mt-10 space-y-10">
        {/* Section 1 Skeleton: Core Principle */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 space-y-5 shadow-xl">
          <div className="flex items-center gap-2.5">
            <div className="h-5 w-5 rounded bg-slate-800" />
            <div className="h-6 w-44 rounded bg-slate-800" />
          </div>

          <div className="border-l-4 border-slate-800 bg-slate-950/60 p-4 rounded-r-lg space-y-2">
            <div className="h-5 w-3/4 rounded bg-slate-800" />
          </div>

          <div className="h-12 rounded-xl bg-slate-950 p-4 border border-slate-800" />
          <div className="h-16 rounded bg-slate-800/40" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
              <div className="h-4 w-48 rounded bg-slate-800" />
              <div className="h-3 w-full rounded bg-slate-800/60" />
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
              <div className="h-4 w-48 rounded bg-slate-800" />
              <div className="h-3 w-full rounded bg-slate-800/60" />
            </div>
          </div>
        </div>

        {/* Section 2 Skeleton: Matrix / Specifications */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 space-y-5 shadow-xl">
          <div className="h-6 w-56 rounded bg-slate-800" />
          <div className="h-4 w-80 rounded bg-slate-800/60" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-lg bg-slate-950 border border-slate-800 p-3 flex items-center justify-between"
              >
                <div className="h-4 w-36 rounded bg-slate-800" />
                <div className="h-6 w-28 rounded-full bg-slate-800" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
