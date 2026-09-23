/**
 * Generates a realistic warehouse dock damage photo as a File object.
 * Used for zero-friction hackathon demos, test runners, and fallback environments.
 */
export async function createSampleDamagedCartonFile(
  cartonRef: string = "Carton 31",
  condition: string = "Crushed & Wet"
): Promise<File> {
  // 1. Prefer high-fidelity photorealistic warehouse evidence asset when available
  try {
    const res = await fetch("/photos/sample-damaged-carton-ax17.jpg");
    if (res.ok) {
      const blob = await res.blob();
      return new File(
        [blob],
        `sample-evidence-${cartonRef.toLowerCase().replace(/\s+/g, "-")}.jpg`,
        { type: "image/jpeg" }
      );
    }
  } catch {
    // Fall back to dynamic synthetic canvas below
  }

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    const fallbackBuffer = Uint8Array.from(
      atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
      (c) => c.charCodeAt(0)
    );
    return new File([fallbackBuffer], "dock-damage-carton31.jpg", { type: "image/jpeg" });
  }

  // Draw warehouse background
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, 640, 480);

  // Draw carton box
  ctx.fillStyle = "#92400e";
  ctx.fillRect(80, 60, 480, 360);

  // Draw carton tape
  ctx.fillStyle = "#b45309";
  ctx.fillRect(80, 220, 480, 40);

  // Draw crushed corner effect
  ctx.fillStyle = "#451a03";
  ctx.beginPath();
  ctx.moveTo(420, 60);
  ctx.lineTo(560, 60);
  ctx.lineTo(560, 200);
  ctx.lineTo(470, 160);
  ctx.closePath();
  ctx.fill();

  // Draw water stain
  ctx.fillStyle = "rgba(30, 58, 138, 0.45)";
  ctx.beginPath();
  ctx.ellipse(450, 320, 90, 50, Math.PI / 6, 0, 2 * Math.PI);
  ctx.fill();

  // Industrial hazard header bar
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(0, 0, 640, 32);

  ctx.fillStyle = "#000000";
  ctx.font = "bold 14px monospace";
  ctx.fillText("DEMO / SAMPLE EVIDENCE • SYNTHETIC TEST ASSET", 15, 22);

  // Text markings on carton
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px monospace";
  ctx.fillText(cartonRef.toUpperCase(), 110, 120);

  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 18px monospace";
  ctx.fillText(`DEFECT: ${condition.toUpperCase()}`, 110, 160);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "14px monospace";
  ctx.fillText("SKU: AX-17 | PO: #44891 | LOT: 2026-09A", 110, 200);

  // Barcode representation
  ctx.fillStyle = "#000000";
  ctx.fillRect(110, 280, 260, 70);
  ctx.fillStyle = "#ffffff";
  for (let i = 120; i < 360; i += 8) {
    if ((i * 7) % 3 !== 0) {
      ctx.fillRect(i, 285, (i % 5) + 2, 60);
    }
  }

  // Bold watermark across center
  ctx.save();
  ctx.translate(320, 240);
  ctx.rotate(-Math.PI / 6);
  ctx.fillStyle = "rgba(239, 68, 68, 0.45)";
  ctx.font = "bold 36px monospace";
  ctx.textAlign = "center";
  ctx.fillText("DEMO / SAMPLE EVIDENCE", 0, 0);
  ctx.restore();

  // Watermark timestamp
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = "13px monospace";
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  ctx.fillText(`TIMESTAMP: ${now} UTC`, 15, 465);

  return new Promise<File>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(
          new File(
            [blob],
            `demo-sample-evidence-${Date.now()}-${cartonRef.toLowerCase().replace(/\s+/g, "-")}.jpg`,
            { type: "image/jpeg" }
          )
        );
      } else {
        const fallback = new File([], "demo-sample-evidence.jpg", { type: "image/jpeg" });
        resolve(fallback);
      }
    }, "image/jpeg", 0.9);
  });
}
