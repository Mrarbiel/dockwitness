"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, AlertTriangle, CheckCircle2, Loader2, Sparkles, X, RefreshCw } from "lucide-react";
import { EvidenceItem } from "./types";
import { createSampleDamagedCartonFile } from "./sample-photo";

export interface CameraCaptureProps {
  incidentId: string;
  damageContext?: {
    cartonReference?: string | null;
    condition?: string | null;
    sourceQuote?: string | null;
  };
  onPhotoUploaded: (evidence: EvidenceItem) => void;
  disabled?: boolean;
}

export function CameraCapture({
  incidentId,
  damageContext,
  onPhotoUploaded,
  disabled = false,
}: CameraCaptureProps) {
  const [activeTab, setActiveTab] = useState<"file" | "camera">("file");
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [description, setDescription] = useState<string>(
    damageContext?.condition
      ? `${damageContext.cartonReference || "Damaged carton"}: ${damageContext.condition}`
      : "Damaged freight photo evidence"
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (damageContext?.condition) {
      setDescription(
        `${damageContext.cartonReference || "Damaged carton"}: ${damageContext.condition}`
      );
    }
  }, [damageContext]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API not supported in this browser environment.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to access camera device";
      setCameraError(msg);
      setIsCameraActive(false);
    }
  };

  const handleCaptureFrame = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      stopCamera();
      const file = new File(
        [blob],
        `camera-snap-${Date.now()}.jpg`,
        { type: "image/jpeg" }
      );
      await uploadFile(file);
    }, "image/jpeg", 0.9);
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"];
    const MAX_SIZE = 15 * 1024 * 1024;
    const fileMime = file.type ? file.type.toLowerCase() : "";

    if (!ALLOWED_MIMES.includes(fileMime)) {
      setUploadError("Invalid file type. Only JPEG, PNG, and WEBP are supported.");
      setIsUploading(false);
      return;
    }

    if (file.size > MAX_SIZE) {
      setUploadError("File size exceeds 15 MB limit.");
      setIsUploading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("incidentId", incidentId);
      formData.append("capturedBy", "RECEIVER");
      formData.append("description", description.trim() || "Damage evidence photo");

      const res = await fetch("/api/evidence", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        if (res.status === 404) {
          const fallbackRes = await fetch(`/api/incidents/${incidentId}/photo`, {
            method: "POST",
            body: formData,
          });
          if (fallbackRes.ok) {
            const fbData = await fallbackRes.json();
            const record: EvidenceItem = {
              id: fbData.id,
              incidentId,
              type: "PHOTO",
              storagePath: fbData.storagePath || `incidents/${incidentId}/photos/${file.name}`,
              description,
              capturedBy: "RECEIVER",
              createdAt: fbData.createdAt || new Date().toISOString(),
              previewUrl: URL.createObjectURL(file),
            };
            setUploadSuccess("Photo uploaded and registered successfully.");
            onPhotoUploaded(record);
            return;
          }
        }
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Upload failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      const evidenceRecord: EvidenceItem = {
        id: data.id,
        incidentId: data.incidentId || incidentId,
        type: "PHOTO",
        storagePath: data.storagePath,
        description: data.description || description,
        capturedBy: data.capturedBy || "RECEIVER",
        createdAt: data.createdAt || new Date().toISOString(),
        previewUrl: URL.createObjectURL(file),
      };

      setUploadSuccess("Photo uploaded and registered successfully.");
      onPhotoUploaded(evidenceRecord);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload photo";
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleOneClickSample = async () => {
    setIsUploading(true);
    try {
      const sampleFile = await createSampleDamagedCartonFile(
        damageContext?.cartonReference || "Carton 31",
        damageContext?.condition || "Crushed & Wet"
      );
      await uploadFile(sampleFile);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Failed to generate sample");
      setIsUploading(false);
    }
  };

  return (
    <div
      data-testid="camera-capture-panel"
      className="rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-inner"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={disabled || isUploading}
            onClick={() => {
              stopCamera();
              setActiveTab("file");
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              activeTab === "file"
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Photo
          </button>

          <button
            type="button"
            disabled={disabled || isUploading}
            onClick={() => {
              setActiveTab("camera");
              startCamera();
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              activeTab === "camera"
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
            Camera
          </button>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || isUploading}
          onClick={handleOneClickSample}
          className="border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-[11px] font-bold h-7 shrink-0"
          title="Generates a synthetic demo sample photo for rapid evaluation without a physical camera"
        >
          <Sparkles className="mr-1 h-3 w-3 text-amber-400" />
          Sample Demo Evidence
        </Button>
      </div>

      <div className="mt-3">
        <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
          Evidence Description / Target:
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={disabled || isUploading}
          placeholder="e.g. Carton 31 crushed seam and wet right side"
          className="w-full rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {activeTab === "file" && (
        <div className="mt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={handleFileInputChange}
            disabled={disabled || isUploading}
          />

          <div
            onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
            className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-700 bg-slate-900/50 p-6 text-center transition-all hover:border-amber-500/70 hover:bg-slate-900 ${
              isUploading ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            <div className="rounded-full bg-slate-800 p-3 text-slate-300 group-hover:bg-amber-500/10 group-hover:text-amber-400 transition-colors">
              <Upload className="h-6 w-6" />
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-200">
              Click or tap to snap / select evidence photo
            </p>
            <p className="mt-1 font-mono text-[10px] text-slate-400">
              JPG, PNG, WEBP up to 15 MB • Uploads directly to <span className="text-amber-400">/api/evidence</span>
            </p>
          </div>
        </div>
      )}

      {activeTab === "camera" && (
        <div className="mt-3">
          {cameraError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center">
              <AlertTriangle className="mx-auto h-6 w-6 text-red-400" />
              <p className="mt-2 text-xs font-semibold text-red-300">{cameraError}</p>
              <div className="mt-3 flex justify-center gap-2">
                <Button size="sm" variant="outline" onClick={startCamera} className="text-xs">
                  <RefreshCw className="mr-1.5 h-3 w-3" /> Retry Camera
                </Button>
                <Button size="sm" variant="outline" onClick={() => setActiveTab("file")} className="text-xs">
                  Switch to File Upload
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-lg border border-slate-700 bg-black aspect-video flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  LIVE DOCK VIEWFINDER
                </div>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="absolute top-2 right-2 rounded bg-slate-900/80 p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={handleCaptureFrame}
                  disabled={!isCameraActive || isUploading}
                  className="flex-1 font-bold text-xs bg-amber-500 hover:bg-amber-600 text-black"
                >
                  <Camera className="mr-1.5 h-4 w-4" /> Snap & Upload Evidence Photo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={stopCamera}
                  className="text-xs border-slate-700 text-slate-300"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {isUploading && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded bg-slate-900 p-2.5 text-xs text-amber-300 border border-amber-500/30">
          <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
          <span className="font-mono">POSTing photo to /api/evidence & recording in append-only audit trail...</span>
        </div>
      )}

      {uploadError && (
        <div className="mt-3 flex items-start gap-2 rounded bg-red-950/40 p-2.5 text-xs text-red-300 border border-red-500/30">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Upload Error:</span> {uploadError}
          </div>
        </div>
      )}

      {uploadSuccess && (
        <div className="mt-3 flex items-center gap-2 rounded bg-emerald-950/40 p-2.5 text-xs text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="font-mono">{uploadSuccess}</span>
        </div>
      )}
    </div>
  );
}
