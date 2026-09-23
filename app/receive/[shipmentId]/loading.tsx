export default function CockpitLoading() {
  return (
    <div
      className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 animate-pulse"
      aria-busy="true"
      aria-label="Loading dock receiving cockpit"
    >
      {/* Header Bar Skeleton */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-4 w-24 rounded bg-slate-800" />
            <div className="h-3 w-3 rounded-full bg-slate-800" />
            <div className="h-4 w-28 rounded bg-slate-800/80" />
          </div>
          <div className="h-8 w-72 rounded bg-slate-800" />
          <div className="h-3.5 w-96 rounded bg-slate-800/60" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 w-24 rounded-lg bg-slate-800" />
          <div className="h-9 w-28 rounded-lg bg-slate-800" />
          <div className="h-9 w-32 rounded-lg bg-slate-800" />
        </div>
      </div>

      {/* Scenario Switcher Skeleton Bar */}
      <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-900/40 p-2.5 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-2">
          <div className="h-4 w-20 rounded bg-slate-800" />
          <div className="h-8 w-28 rounded-lg bg-slate-800" />
          <div className="h-8 w-28 rounded-lg bg-slate-800/70" />
          <div className="h-8 w-28 rounded-lg bg-slate-800/70" />
          <div className="h-8 w-28 rounded-lg bg-slate-800/70" />
        </div>
        <div className="h-8 w-32 rounded-lg bg-slate-800/50 hidden sm:block" />
      </div>

      {/* 3-Column Industrial Cockpit Skeleton */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 items-start">
        {/* Column 1: Intake & Manifest & Counter */}
        <div className="space-y-6 lg:col-span-1 min-w-0">
          {/* Manifest Card Skeleton */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-4 shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/70">
              <div className="h-4 w-32 rounded bg-slate-800" />
              <div className="h-5 w-20 rounded bg-slate-800" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-12 rounded bg-slate-950/60 border border-slate-800/60 p-2" />
              <div className="h-12 rounded bg-slate-950/60 border border-slate-800/60 p-2" />
              <div className="h-12 rounded bg-slate-950/60 border border-slate-800/60 p-2" />
              <div className="h-12 rounded bg-slate-950/60 border border-slate-800/60 p-2" />
            </div>
            <div className="rounded-lg bg-slate-950 p-4 border border-slate-800 space-y-3">
              <div className="flex justify-between">
                <div className="h-4 w-24 rounded bg-slate-800" />
                <div className="h-4 w-28 rounded bg-slate-800" />
              </div>
              <div className="h-3 w-40 rounded bg-slate-800/70" />
              <div className="h-10 w-20 rounded bg-slate-800" />
            </div>
          </div>

          {/* Observed Quantity Counter Skeleton */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="h-4 w-36 rounded bg-slate-800" />
              <div className="h-5 w-24 rounded-full bg-slate-800" />
            </div>
            <div className="rounded-lg bg-slate-950/80 p-5 border border-slate-800 text-center space-y-2">
              <div className="h-3 w-28 mx-auto rounded bg-slate-800" />
              <div className="h-12 w-24 mx-auto rounded bg-slate-800" />
              <div className="h-3 w-36 mx-auto rounded bg-slate-800/60" />
            </div>
            <div className="flex gap-2">
              <div className="h-10 flex-1 rounded-lg bg-slate-800" />
              <div className="h-10 flex-1 rounded-lg bg-slate-800" />
            </div>
          </div>
        </div>

        {/* Column 2: Voice Agent & Camera & Transcript */}
        <div className="space-y-6 lg:col-span-1 min-w-0">
          {/* Voice Agent Cockpit Card Skeleton */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-4 shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/70">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-slate-800" />
                <div className="space-y-1">
                  <div className="h-4 w-28 rounded bg-slate-800" />
                  <div className="h-2.5 w-40 rounded bg-slate-800/60" />
                </div>
              </div>
              <div className="h-6 w-20 rounded-full bg-slate-800" />
            </div>
            <div className="h-11 rounded-lg bg-slate-800/80" />
            <div className="h-16 rounded-lg bg-slate-950 border border-slate-800 p-3" />
          </div>

          {/* Photo Evidence Card Skeleton */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="h-4 w-32 rounded bg-slate-800" />
              <div className="h-8 w-28 rounded-lg bg-slate-800" />
            </div>
            <div className="h-24 rounded-lg bg-slate-950/60 border border-dashed border-slate-800 flex items-center justify-center">
              <div className="h-4 w-44 rounded bg-slate-800" />
            </div>
          </div>

          {/* Live Transcript Card Skeleton */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/70">
              <div className="h-4 w-32 rounded bg-slate-800" />
              <div className="h-4 w-12 rounded bg-slate-800" />
            </div>
            <div className="space-y-2.5 min-h-[140px]">
              <div className="h-14 rounded-lg bg-slate-950 p-3 border border-slate-800/80" />
              <div className="h-14 rounded-lg bg-slate-950 p-3 border border-slate-800/80" />
            </div>
          </div>
        </div>

        {/* Column 3: Driver Attestation & Agreement & Readiness */}
        <div className="space-y-6 lg:col-span-2 2xl:col-span-1 min-w-0">
          {/* Driver Attestation Card Skeleton */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-4 shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/70">
              <div className="h-4 w-36 rounded bg-slate-800" />
              <div className="h-5 w-24 rounded bg-slate-800" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-40 rounded bg-slate-800" />
              <div className="grid grid-cols-5 gap-1.5">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-11 rounded-lg bg-slate-800" />
                ))}
              </div>
            </div>
            <div className="h-9 rounded-lg bg-slate-950 border border-slate-800" />
            <div className="h-11 rounded-lg bg-slate-800" />
          </div>

          {/* Agreement Status Card Skeleton */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="h-4 w-36 rounded bg-slate-800" />
              <div className="h-5 w-24 rounded bg-slate-800" />
            </div>
            <div className="h-16 rounded-lg bg-slate-950 border border-slate-800 p-3" />
          </div>

          {/* Readiness Checklist Skeleton */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/70">
              <div className="h-4 w-36 rounded bg-slate-800" />
              <div className="h-5 w-24 rounded-full bg-slate-800" />
            </div>
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-9 rounded bg-slate-950/60 border border-slate-800/80 flex items-center justify-between px-3"
                >
                  <div className="h-3 w-32 rounded bg-slate-800" />
                  <div className="h-4 w-20 rounded bg-slate-800" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
