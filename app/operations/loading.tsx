export default function OperationsLoading() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-pulse"
      aria-busy="true"
      aria-label="Loading operations exception ledger"
    >
      {/* Header Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-4 w-36 rounded bg-slate-800" />
            <div className="h-4 w-28 rounded bg-slate-800/80" />
          </div>
          <div className="h-8 w-80 rounded bg-slate-800" />
          <div className="h-3.5 w-96 rounded bg-slate-800/60" />
        </div>

        <div className="flex items-center gap-2">
          <div className="h-10 w-28 rounded-lg bg-slate-800" />
          <div className="h-10 w-32 rounded-lg bg-slate-800" />
        </div>
      </div>

      {/* 4 KPI Cards Skeleton */}
      <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 rounded bg-slate-800" />
              <div className="h-4 w-4 rounded bg-slate-800" />
            </div>
            <div className="h-8 w-16 rounded bg-slate-800" />
            <div className="h-3 w-32 rounded bg-slate-800/60" />
          </div>
        ))}
      </div>

      {/* Filter and Search Bar Skeleton */}
      <div className="mt-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 w-24 rounded-lg bg-slate-800" />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-48 sm:w-64 rounded-lg bg-slate-800" />
          <div className="h-8 w-32 rounded-lg bg-slate-800" />
        </div>
      </div>

      {/* Table Rows Pulsing Skeleton */}
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 shadow-xl">
        <div className="border-b border-slate-800 bg-slate-950/80 px-5 py-3.5 flex items-center justify-between">
          <div className="h-3.5 w-32 rounded bg-slate-800" />
          <div className="h-3.5 w-24 rounded bg-slate-800 hidden sm:block" />
          <div className="h-3.5 w-28 rounded bg-slate-800 hidden md:block" />
          <div className="h-3.5 w-20 rounded bg-slate-800" />
        </div>
        <div className="divide-y divide-slate-800/60">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="px-5 py-4 flex items-center justify-between gap-4"
            >
              <div className="space-y-1.5 w-36">
                <div className="h-4 w-28 rounded bg-slate-800" />
                <div className="h-2.5 w-20 rounded bg-slate-800/60" />
              </div>
              <div className="space-y-1.5 w-32 hidden sm:block">
                <div className="h-4 w-24 rounded bg-slate-800" />
                <div className="h-2.5 w-16 rounded bg-slate-800/60" />
              </div>
              <div className="h-5 w-28 rounded bg-slate-800 hidden md:block" />
              <div className="h-6 w-24 rounded-full bg-slate-800" />
              <div className="h-8 w-20 rounded-lg bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
