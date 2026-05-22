import { describe, it, expect, beforeEach } from 'vitest';
import { SquatCounter } from '../src/SquatCounter';
import { MotionSample } from '@pocket-motion/types';

describe('SquatCounter', () => {
  let counter: SquatCounter;

  // Helper to generate a dummy motion sample
  const createSample = (timestamp: number, accel: number): MotionSample => ({
    timestamp,
    accelX: 0,
    accelY: accel, // Focus acceleration on Y-axis
    accelZ: 0,
    linearX: null,
    linearY: null,
    linearZ: null,
    rotationAlpha: null,
    rotationBeta: null,
    rotationGamma: null
  });

  beforeEach(() => {
    // Basic settings: threshold 1.0, duration 1000ms
    counter = new SquatCounter({
      lpfAlpha: 1.0, // Set LPF to 1.0 to bypass filter calculation in tests for exact numbers
      thresholdDown: 1.0,
      thresholdUp: 1.0,
      minRepDurationMs: 1000
    });
  });

  it('should initialize with count 0 and idle state', () => {
    expect(counter.getCount()).toBe(0);
    expect(counter.getCurrentState()).toBe('idle');
  });

  it('should not count if not started', () => {
    const sample = createSample(1000, 5.0); // Dropping acceleration
    counter.feed(sample);
    expect(counter.getCurrentState()).toBe('idle'); // Should stay idle because it is inactive
  });

  it('should count 1 rep for a valid squat motion cycle', () => {
    counter.start();
    let now = 1000;

    // 1. Stand still (gravity around 9.8)
    counter.feed(createSample(now, 9.8));
    expect(counter.getCurrentState()).toBe('idle');

    // 2. Start descending (acceleration drops below 9.8 - 1.0 = 8.8)
    now += 200;
    counter.feed(createSample(now, 8.0));
    expect(counter.getCurrentState()).toBe('descending');

    // 3. Reach bottom/stabilize (returns above 9.6)
    now += 400;
    counter.feed(createSample(now, 9.7));
    expect(counter.getCurrentState()).toBe('valley');

    // 4. Stand up (acceleration exceeds 9.8 + 1.0 = 10.8)
    now += 400;
    counter.feed(createSample(now, 11.5));
    expect(counter.getCurrentState()).toBe('ascending');

    // 5. Stabilize back to standing still (accel returns to 9.8, duration is 1000ms)
    now += 200;
    counter.feed(createSample(now, 9.8));
    expect(counter.getCurrentState()).toBe('idle');
    expect(counter.getCount()).toBe(1);
  });

  it('should filter out a quick bump that is shorter than minRepDurationMs', () => {
    counter.start();
    let now = 1000;

    // Start descending
    counter.feed(createSample(now, 9.8));
    now += 100;
    counter.feed(createSample(now, 8.0)); // descending
    expect(counter.getCurrentState()).toBe('descending');

    // Valley
    now += 100;
    counter.feed(createSample(now, 9.8)); // valley
    expect(counter.getCurrentState()).toBe('valley');

    // Ascending
    now += 100;
    counter.feed(createSample(now, 11.5)); // ascending
    expect(counter.getCurrentState()).toBe('ascending');

    // Back to stand (total duration only 400ms, which is < 1000ms)
    now += 100;
    counter.feed(createSample(now, 9.8)); // idle
    expect(counter.getCurrentState()).toBe('idle');
    expect(counter.getCount()).toBe(0); // Count must remain 0
  });
});
