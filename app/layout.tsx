import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { TopProgressBar } from "@/components/navigation/top-progress-bar";
import { HeaderNav } from "@/components/navigation/header-nav";

export const metadata: Metadata = {
  title: "DockWitness | Proof Before the Truck Leaves",
  description:
    "Voice-first freight receiving evidence system that captures shortages, overages, visible damage, and two-party disagreement while the driver is still at the dock door. Built with AssemblyAI · Universal-3.5 Pro + Voice Agent API.",
  metadataBase: new URL("https://dockwitness.vercel.app"),
  openGraph: {
    title: "DockWitness | Proof Before the Truck Leaves",
    description:
      "Voice-first freight receiving evidence system powered by AssemblyAI Universal-3.5 Pro and Voice Agent API.",
    url: "https://dockwitness.vercel.app",
    siteName: "DockWitness",
    images: [
      {
        url: "/brand/opengraph-cover.png",
        width: 1200,
        height: 630,
        alt: "DockWitness - Built with AssemblyAI Universal-3.5 Pro + Voice Agent API",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DockWitness | Proof Before the Truck Leaves",
    description:
      "Voice-first freight receiving evidence system powered by AssemblyAI Universal-3.5 Pro and Voice Agent API.",
    images: ["/brand/opengraph-cover.png"],
  },
  icons: {
    icon: "/brand/icon.svg",
    shortcut: "/brand/icon.svg",
    apple: "/brand/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark overflow-x-hidden">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-amber-500 selection:text-slate-950 overflow-x-hidden w-full max-w-full">
        {/* Skip to Main Content Link for Keyboard / Screen Reader A11y */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-50 bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-md shadow-lg outline-none"
        >
          Skip to main content
        </a>

        {/* Global Route Transition Top Progress Bar */}
        <TopProgressBar />

        <div className="flex min-h-screen flex-col w-full max-w-full overflow-x-hidden">
          {/* Header */}
          <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 px-3 py-2.5 backdrop-blur-md sm:px-6">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
              <div className="flex items-center space-x-2 shrink-0">
                <span className="hidden sm:inline-block rounded bg-amber-500/20 px-2 py-1 text-[10px] font-mono font-bold tracking-wider text-amber-400 uppercase border border-amber-500/30">
                  Dock Evidence
                </span>
                <Link
                  href="/"
                  className="flex items-center gap-2 text-base sm:text-xl font-black tracking-tight text-white hover:text-amber-400 transition-colors group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/brand/dockwitness-mark.svg"
                    alt="DockWitness Logo Mark"
                    className="h-7 w-7 rounded-md shadow-sm transition-transform group-hover:scale-105"
                    width={28}
                    height={28}
                  />
                  <span>DockWitness</span>
                </Link>
              </div>

              {/* Dynamic Active Header Navigation */}
              <HeaderNav />
            </div>
          </header>

          {/* Main Content */}
          <main id="main-content" className="flex-1 w-full max-w-full overflow-x-hidden">
            {children}
          </main>

          {/* Footer */}
          <footer className="border-t border-slate-800/80 bg-slate-950/80 px-4 py-6 text-center text-xs text-slate-400">
            <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-300">DockWitness</span>
                <span>&copy; {new Date().getFullYear()}</span>
                <span>&bull;</span>
                <span className="text-amber-400">Proof Before the Truck Leaves</span>
              </div>
              <div className="font-mono text-[11px] text-slate-400">
                Built with AssemblyAI &middot; Universal-3.5 Pro + Voice Agent API
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}