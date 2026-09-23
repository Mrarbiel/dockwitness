"use client";

import React, { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  analyserNode: AnalyserNode | null;
  isActive: boolean;
  barCount?: number;
}

export function AudioVisualizer({
  analyserNode,
  isActive,
  barCount = 16,
}: AudioVisualizerProps) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!isActive || !analyserNode) {
      barsRef.current.forEach((bar) => {
        if (bar) bar.style.height = "4px";
      });
      return;
    }

    let animationId: number;
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

    const updateBars = () => {
      analyserNode.getByteFrequencyData(dataArray);

      // Distribute bins evenly across visible bars
      const step = Math.max(1, Math.floor(dataArray.length / barCount));
      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * step] || 0;
        const normalized = Math.min(100, Math.max(8, (value / 255) * 100));
        const bar = barsRef.current[i];
        if (bar) {
          bar.style.height = `${normalized}%`;
        }
      }

      animationId = requestAnimationFrame(updateBars);
    };

    animationId = requestAnimationFrame(updateBars);
    return () => cancelAnimationFrame(animationId);
  }, [analyserNode, isActive, barCount]);

  return (
    <div
      data-testid="audio-visualizer"
      className="flex h-8 items-end justify-between gap-1 rounded bg-slate-950 px-3 py-1.5 border border-slate-800"
    >
      {Array.from({ length: barCount }).map((_, i) => {
        const isPeak = i >= barCount - 3;
        const isMid = i >= barCount - 6 && !isPeak;
        const colorClass = !isActive
          ? "bg-slate-800"
          : isPeak
          ? "bg-red-500"
          : isMid
          ? "bg-amber-400"
          : "bg-emerald-400";

        return (
          <div
            key={i}
            ref={(el) => {
              barsRef.current[i] = el;
            }}
            className={`w-full rounded-xs transition-all duration-75 ${colorClass}`}
            style={{ height: "4px" }}
          />
        );
      })}
    </div>
  );
}
