"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  Volume2,
  VolumeX,
  Play,
  ArrowRight,
  ShieldCheck,
  Mic,
  Users2,
  Camera,
  FileText,
} from "lucide-react";

export default function DemoPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [hasStartedWithSound, setHasStartedWithSound] = useState<boolean>(false);
  const [showUnmutePill, setShowUnmutePill] = useState<boolean>(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Attempt muted autoplay for instant visual hook
    video.muted = true;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setIsMuted(true);
        })
        .catch(() => {
          // Autoplay policy prevented playback, show clear play button
          setIsPlaying(false);
        });
    }

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onVolumeChange = () => {
      setIsMuted(video.muted);
      if (!video.muted) {
        setShowUnmutePill(false);
        setHasStartedWithSound(true);
      }
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolumeChange);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolumeChange);
    };
  }, []);

  const handleUnmuteAndPlayFromStart = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = false;
    setIsMuted(false);
    setShowUnmutePill(false);
    setHasStartedWithSound(true);

    // If currently muted playing through the intro, restart so they don't miss the first seconds of audio
    if (video.currentTime < 10) {
      video.currentTime = 0;
    }
    video.play().catch(() => {});
  };

  const handleTogglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      if (isMuted && !hasStartedWithSound) {
        video.muted = false;
        setIsMuted(false);
        setShowUnmutePill(false);
        setHasStartedWithSound(true);
      }
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-140px)] bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Subtle ambient gradient backdrops */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-amber-500/10 rounded-full blur-[120px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-1/3 left-1/4 w-[500px] h-[300px] bg-emerald-500/5 rounded-full blur-[140px]"
        aria-hidden="true"
      />

      <div className="relative max-w-5xl mx-auto flex flex-col items-center">
        {/* Top Operational Eyebrow Pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-mono font-semibold text-amber-300 shadow-sm mb-4">
          <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span>70-SECOND PRODUCT WALKTHROUGH</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-center tracking-tight text-white max-w-3xl leading-[1.15] mb-4">
          Voice-first evidence at the freight handoff
        </h1>

        {/* Short Supporting Subtitle */}
        <p className="text-base sm:text-lg text-slate-300 text-center max-w-2xl font-normal leading-relaxed mb-8">
          Capture what arrived, what was damaged, and what each side confirmed or disputed — before the truck leaves the dock.
        </p>

        {/* Video Player Box */}
        <div className="w-full relative rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl shadow-black/80 overflow-hidden group">
          {/* Subtle browser header bar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800/80 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
              <span className="ml-2 font-mono text-[11px] text-slate-400 hidden sm:inline-block">
                dockwitness-prospect-demo.mp4
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Full HD 1080p</span>
            </div>
          </div>

          {/* Video Container */}
          <div className="relative aspect-video w-full bg-black">
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              playsInline
              preload="metadata"
              controls
              poster="/videos/dockwitness-prospect-demo-poster.jpg"
            >
              <source
                src="https://github.com/Mrarbiel/dockwitness/releases/download/v1.0.0-final/dockwitness-prospect-demo-v1.mp4"
                type="video/mp4"
              />
              <source src="/videos/dockwitness-prospect-demo-v1.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>

            {/* Tap to Unmute Overlay Pill (shown when video is autoplaying muted) */}
            {isPlaying && isMuted && showUnmutePill && (
              <button
                type="button"
                onClick={handleUnmuteAndPlayFromStart}
                className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 text-xs sm:text-sm font-bold shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                aria-label="Unmute video with sound"
              >
                <VolumeX className="w-4 h-4 text-slate-950 animate-bounce" />
                <span>Tap for Sound</span>
              </button>
            )}

            {/* Center Play Button Overlay (shown when paused before initial play) */}
            {!isPlaying && (
              <div
                onClick={handleTogglePlay}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] cursor-pointer group-hover:bg-black/30 transition-all"
                role="button"
                aria-label="Play product demo video"
              >
                <div className="flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-500 text-slate-950 shadow-2xl transition-transform group-hover:scale-110">
                  <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current translate-x-0.5" />
                </div>
                <span className="mt-4 text-sm sm:text-base font-bold text-white drop-shadow">
                  Watch 70s Product Walkthrough
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Discovery & Operational Problem Validation Box */}
        <div className="w-full max-w-5xl mt-10 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800/80">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                Discovery & Validation
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
                Does this match a problem in your receiving operation?
              </h2>
              <p className="text-sm text-slate-300 mt-1.5 max-w-2xl">
                DockWitness replaces ambiguous paper BOL notes with structured, voice-captured receiving truth before carrier liability transfers.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <Link
                href="/receive/shipment-po44891"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-3 text-sm shadow-md transition-all hover:shadow-amber-500/20 active:scale-95"
              >
                <span>Try Live Receiving Cockpit</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/incident/incident-1790228695534-yjlp"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-3 text-sm border border-slate-700 transition-colors"
              >
                <FileText className="w-4 h-4 text-slate-400" />
                <span>View Sample Evidence Record</span>
              </Link>
            </div>
          </div>

          {/* Three Core Invariants */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                <Mic className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Voice-First Intake</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Receivers speak counts and damages hands-free. Spoken numbers are deterministically parsed.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
                <Users2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Two-Party Consensus</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  The carrier driver explicitly confirms or disputes. Silence never counts as consent.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Photo-Backed Ledger</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Reported damage requires photographic evidence, locked into an append-only timeline.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
