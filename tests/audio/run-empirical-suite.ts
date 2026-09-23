import fs from "fs";
import path from "path";

// Set up mock AudioWorklet environment
class MockAudioWorkletProcessor {
  port = {
    messages: [] as any[],
    onmessage: null as ((event: any) => void) | null,
    postMessage(data: any, transferables?: any[]) {
      this.messages.push({ data, transferables });
    },
  };
}

(global as any).AudioWorkletProcessor = MockAudioWorkletProcessor;
const registeredProcessors: Record<string, any> = {};
(global as any).registerProcessor = (name: string, cls: any) => {
  registeredProcessors[name] = cls;
};

const workletCode = fs.readFileSync(
  path.resolve(__dirname, "../../public/worklets/pcm-processor.js"),
  "utf8"
);
new Function(workletCode)();

const ProcClass = registeredProcessors["pcm-processor"];

function runEmpiricalSimulation(sampleRate: number, numBlocks = 10000, blockSize = 128) {
  (global as any).sampleRate = sampleRate;
  const proc = new ProcClass();

  const totalInputSamples = numBlocks * blockSize;
  const ratio = sampleRate / 16000;
  const theoreticalFloor = Math.floor((totalInputSamples * 16000) / sampleRate);
  const theoreticalExact = (totalInputSamples * 16000) / sampleRate;

  let minPhase = Infinity;
  let maxPhase = -Infinity;
  let non1600Chunks = 0;
  let totalChunksEmitted = 0;

  const t0 = performance.now();

  for (let b = 0; b < numBlocks; b++) {
    const channel = new Float32Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
      const t = (b * blockSize + i) / sampleRate;
      channel[i] = 0.5 * Math.sin(2 * Math.PI * 440 * t) + 0.25 * Math.sin(2 * Math.PI * 1000 * t);
    }

    const prevMsgCount = proc.port.messages.length;
    proc.process([[channel]], [], {});
    const newMsgCount = proc.port.messages.length;

    for (let m = prevMsgCount; m < newMsgCount; m++) {
      totalChunksEmitted++;
      const byteLen = proc.port.messages[m].data.buffer.byteLength;
      if (byteLen !== 1600) {
        non1600Chunks++;
      }
    }

    if (proc.phase < minPhase) minPhase = proc.phase;
    if (proc.phase > maxPhase) maxPhase = proc.phase;
  }

  const t1 = performance.now();
  const elapsedMs = t1 - t0;

  const remainderSamplesBeforeFlush = proc.bufferIndex;
  const totalBeforeFlush = totalChunksEmitted * 800 + remainderSamplesBeforeFlush;

  // Flush
  proc.port.onmessage?.({ data: { command: "flush" } });

  let flushByteLen = 0;
  let flushIsFinal = false;
  if (remainderSamplesBeforeFlush > 0) {
    const lastMsg = proc.port.messages[proc.port.messages.length - 1];
    flushByteLen = lastMsg.data.buffer.byteLength;
    flushIsFinal = lastMsg.data.isFinal === true;
  }

  const totalSamplesTransmitted =
    totalChunksEmitted * 800 + (flushByteLen > 0 ? flushByteLen / 2 : 0);

  const driftFromFloor = totalSamplesTransmitted - theoreticalFloor;
  const driftFromExact = totalSamplesTransmitted - theoreticalExact;

  return {
    sampleRate,
    numBlocks,
    blockSize,
    totalInputSamples,
    inputDurationSec: totalInputSamples / sampleRate,
    theoreticalFloor,
    theoreticalExact: theoreticalExact.toFixed(4),
    totalChunksEmitted,
    remainderSamplesBeforeFlush,
    flushByteLen,
    flushIsFinal,
    totalSamplesTransmitted,
    driftFromFloor,
    driftFromExact: driftFromExact.toFixed(4),
    minPhase: minPhase.toFixed(6),
    maxPhase: maxPhase.toFixed(6),
    phaseLimit: ratio.toFixed(6),
    non1600Chunks,
    elapsedMs: elapsedMs.toFixed(2),
    speedupFactor: ((totalInputSamples / sampleRate) / (elapsedMs / 1000)).toFixed(1),
  };
}

function runClampingStressTest() {
  (global as any).sampleRate = 48000;
  const proc = new ProcClass();

  const testVectors = [
    { input: 2.0, expected: 32767, name: "+2.0 overflow" },
    { input: -2.0, expected: -32768, name: "-2.0 underflow" },
    { input: 100.0, expected: 32767, name: "+100.0 extreme" },
    { input: -100.0, expected: -32768, name: "-100.0 extreme" },
    { input: 1.0, expected: 32767, name: "+1.0 boundary" },
    { input: -1.0, expected: -32768, name: "-1.0 boundary" },
    { input: 0.0, expected: 0, name: "0.0 center" },
    { input: NaN, expected: 0, name: "NaN guard" },
    { input: Infinity, expected: 0, name: "+Infinity guard" },
    { input: -Infinity, expected: 0, name: "-Infinity guard" },
    { input: 1e-30, expected: 0, name: "subnormal tiny float" },
  ];

  const results = [];
  for (const v of testVectors) {
    const ch = new Float32Array(128).fill(v.input);
    proc.bufferIndex = 0;
    proc.phase = 0;
    proc.process([[ch]], [], {});
    const actual = proc.buffer[0];
    const pass = actual === v.expected;
    results.push({ name: v.name, input: v.input, expected: v.expected, actual, pass });
  }

  // Extreme random torture stream
  let anyOverflow = false;
  let anyUnderflow = false;
  let anyNaN = false;
  const tortureProc = new ProcClass();
  for (let b = 0; b < 1000; b++) {
    const ch = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      ch[i] = (Math.random() - 0.5) * 20.0; // range [-10.0, +10.0]
    }
    tortureProc.process([[ch]], [], {});
  }
  for (const msg of tortureProc.port.messages) {
    const view = new Int16Array(msg.data.buffer);
    for (let i = 0; i < view.length; i++) {
      if (view[i] > 32767) anyOverflow = true;
      if (view[i] < -32768) anyUnderflow = true;
      if (Number.isNaN(view[i])) anyNaN = true;
    }
  }

  return { vectorResults: results, randomTorturePass: !anyOverflow && !anyUnderflow && !anyNaN };
}

function runMultiChannelTest() {
  (global as any).sampleRate = 48000;

  // Stereo
  const stereoProc = new ProcClass();
  const ch0 = new Float32Array(128).fill(0.3);
  const ch1 = new Float32Array(128).fill(0.7);
  stereoProc.process([[ch0, ch1]], [], {});
  const stereoActual = stereoProc.buffer[0];
  const stereoExpected = Math.round(0.5 * 32767); // 16384

  // Stereo Cancellation
  const cancelProc = new ProcClass();
  const c0 = new Float32Array(128).fill(0.6);
  const c1 = new Float32Array(128).fill(-0.6);
  cancelProc.process([[c0, c1]], [], {});
  const cancelActual = cancelProc.buffer[0];

  // 4-Channel Array
  const quadProc = new ProcClass();
  const q0 = new Float32Array(128).fill(0.1);
  const q1 = new Float32Array(128).fill(0.2);
  const q2 = new Float32Array(128).fill(0.3);
  const q3 = new Float32Array(128).fill(0.4);
  quadProc.process([[q0, q1, q2, q3]], [], {});
  const quadActual = quadProc.buffer[0];
  const quadExpected = Math.round(0.25 * 32767); // 8192

  return {
    stereo: { expected: stereoExpected, actual: stereoActual, pass: stereoActual === stereoExpected },
    cancellation: { expected: 0, actual: cancelActual, pass: cancelActual === 0 },
    quad: { expected: quadExpected, actual: quadActual, pass: quadActual === quadExpected },
  };
}

console.log("================================================================================");
console.log("MILLESTONE 1 EMPIRICAL STRESS TEST SUITE REPORT");
console.log("================================================================================");

const res44 = runEmpiricalSimulation(44100, 10000, 128);
console.log("\n[1] 44.1 kHz -> 16.0 kHz Simulation across 10,000 blocks:");
console.dir(res44, { depth: null });

const res48 = runEmpiricalSimulation(48000, 10000, 128);
console.log("\n[2] 48.0 kHz -> 16.0 kHz Simulation across 10,000 blocks:");
console.dir(res48, { depth: null });

const res96 = runEmpiricalSimulation(96000, 10000, 128);
console.log("\n[3] 96.0 kHz -> 16.0 kHz Simulation across 10,000 blocks:");
console.dir(res96, { depth: null });

const clampRes = runClampingStressTest();
console.log("\n[4] Clamping & Value Safety Test:");
console.dir(clampRes, { depth: null });

const mcRes = runMultiChannelTest();
console.log("\n[5] Multi-Channel Downmix Test:");
console.dir(mcRes, { depth: null });

console.log("\n================================================================================");
console.log("ALL EMPIRICAL TESTS COMPLETED");
console.log("================================================================================");
