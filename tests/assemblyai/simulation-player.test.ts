import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ScenarioAudioSimulator,
  GOLDEN_SCENARIO_SCRIPTS,
} from "@/lib/assemblyai/simulation-player";
import { TranscriptTurn } from "@/lib/assemblyai/types";

describe("ScenarioAudioSimulator Offline Fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("contains valid golden scenario scripts for receiver and driver", () => {
    expect(GOLDEN_SCENARIO_SCRIPTS.receiver.fullText).toBe(
      "I have forty-seven cartons. Carton thirty-one is crushed underneath and wet on the right side."
    );
    expect(GOLDEN_SCENARIO_SCRIPTS.receiver.speakerRole).toBe("RECEIVER");

    expect(GOLDEN_SCENARIO_SCRIPTS.driver.fullText).toBe(
      "I confirm the damaged carton, but I dispute the shortage. The seal was intact."
    );
    expect(GOLDEN_SCENARIO_SCRIPTS.driver.speakerRole).toBe("DRIVER");
  });

  it("emits progressive partial text and committed final turn for receiver scenario", async () => {
    const simulator = new ScenarioAudioSimulator();
    const partials: string[] = [];
    let committedTurn: TranscriptTurn | null = null;
    let ended = false;

    const runPromise = simulator.run({
      scenario: "receiver",
      forceOffline: true,
      onPartialText: (text) => partials.push(text),
      onTurnCommitted: (turn) => {
        committedTurn = turn;
      },
      onEnded: () => {
        ended = true;
      },
    });

    expect(simulator.isSimulating()).toBe(true);

    // Fast-forward through the simulation duration
    await vi.runAllTimersAsync();
    await runPromise;

    expect(partials.length).toBeGreaterThan(5);
    expect(partials[0]).toBe("I");
    expect(partials[partials.length - 1]).toBe(GOLDEN_SCENARIO_SCRIPTS.receiver.fullText);

    expect(committedTurn).not.toBeNull();
    const turn = committedTurn as unknown as TranscriptTurn;
    expect(turn.speakerRole).toBe("RECEIVER");
    expect(turn.text).toBe(GOLDEN_SCENARIO_SCRIPTS.receiver.fullText);
    expect(turn.endOfTurn).toBe(true);
    expect(ended).toBe(true);
    expect(simulator.isSimulating()).toBe(false);
  });

  it("emits progressive partial text and committed final turn for driver scenario", async () => {
    const simulator = new ScenarioAudioSimulator();
    let committedTurn: TranscriptTurn | null = null;

    const runPromise = simulator.run({
      scenario: "driver",
      forceOffline: true,
      onTurnCommitted: (turn) => {
        committedTurn = turn;
      },
    });

    await vi.runAllTimersAsync();
    await runPromise;

    expect(committedTurn).not.toBeNull();
    const driverTurn = committedTurn as unknown as TranscriptTurn;
    expect(driverTurn.speakerRole).toBe("DRIVER");
    expect(driverTurn.text).toBe(GOLDEN_SCENARIO_SCRIPTS.driver.fullText);
  });

  it("cancels active simulation immediately on stop()", async () => {
    const simulator = new ScenarioAudioSimulator();
    let committed = false;

    simulator.run({
      scenario: "receiver",
      forceOffline: true,
      onTurnCommitted: () => {
        committed = true;
      },
    });

    expect(simulator.isSimulating()).toBe(true);
    simulator.stop();
    expect(simulator.isSimulating()).toBe(false);

    await vi.runAllTimersAsync();
    expect(committed).toBe(false);
  });
});
