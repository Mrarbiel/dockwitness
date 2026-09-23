export default function IncidentLoading() {
  return (
    <div
      className="mx-auto max-w-7xl px-6 py-8 animate-pulse"
      aria-busy="true"
      aria-label="Loading incident audit timeline"
    >
      {/* Navigation and Header Skeleton */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-slate-800" />
          <div className="flex items-center gap-2">
            <div className="h-4 w-48 rounded bg-slate-800" />
            <div className="h-4 w-28 rounded bg-slate-800/80" />
          </div>
          <div className="h-8 w-64 rounded bg-slate-800" />
          <div className="h-3 w-80 rounded bg-slate-800/60" />
        </div>

        <div className="text-right space-y-1.5 hidden sm:block">
          <div className="h-3 w-40 rounded bg-slate-800 ml-auto" />
          <div className="h-4 w-32 rounded bg-slate-800 ml-auto" />
        </div>
      </div>

      {/* Main Timeline Display Skeleton */}
      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/70">
          <div className="h-5 w-48 rounded bg-slate-800" />
          <div className="h-4 w-24 rounded bg-slate-800/60" />
        </div>

        {/* Timeline Nodes */}
        <div className="relative pl-6 sm:pl-8 space-y-6 border-l-2 border-slate-800 ml-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="relative space-y-2">
              <div className="absolute -left-[31px] sm:-left-[39px] top-1.5 h-4 w-4 rounded-full bg-slate-800 border-2 border-slate-900" />
              <div className="flex items-center justify-between">
                <div className="h-4 w-36 rounded bg-slate-800" />
                <div className="h-3 w-20 rounded bg-slate-800/60" />
              </div>
              <div className="rounded-lg bg-slate-950 p-4 border border-slate-800/80 space-y-2">
                <div className="h-3.5 w-3/4 rounded bg-slate-800" />
                <div className="h-3 w-1/2 rounded bg-slate-800/60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
