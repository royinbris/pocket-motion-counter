import { describe, it, expect, beforeEach } from 'vitest';
import { DanceTracker } from '../src/DanceTracker';
import { MotionSample } from '@pocket-motion/types';

describe('DanceTracker', () => {
  let tracker: DanceTracker;

  const createSample = (timestamp: number, linearMag: number): MotionSample => {
    // linear 가속도 크기를 모사하기 위해 X, Y, Z 중 하나에 값을 넣고 중력 9.8을 더함
    return {
      timestamp,
      accelX: 0,
      accelY: 9.80665 + linearMag, // Magnitude will be around 9.8 + linearMag
      accelZ: 0,
      linearX: 0,
      linearY: linearMag,
      linearZ: 0,
      rotationAlpha: null,
      rotationBeta: null,
      rotationGamma: null
    };
  };

  beforeEach(() => {
    tracker = new DanceTracker();
  });

  it('should initialize with zeros and inactive state', () => {
    const metrics = tracker.getMetrics();
    expect(metrics.activeDurationMs).toBe(0);
    expect(metrics.totalEnergy).toBe(0);
    expect(metrics.estimatedCalories).toBe(0);
    expect(metrics.intensity).toBe(0);
  });

  it('should not track metrics if not started', () => {
    tracker.feed(createSample(1000, 2.0));
    tracker.feed(createSample(1200, 2.5));
    const metrics = tracker.getMetrics();
    expect(metrics.activeDurationMs).toBe(0);
  });

  it('should accumulate duration, energy, and calories on active motion', () => {
    tracker.start();
    let now = 1000;

    // First sample to set initial timestamp
    tracker.feed(createSample(now, 2.0));

    // Active sample after 200ms (linear acceleration = 2.0 m/s^2)
    now += 200;
    tracker.feed(createSample(now, 2.0));

    let metrics = tracker.getMetrics();
    expect(metrics.activeDurationMs).toBe(200);
    // energy = linearMag * dt_sec = 2.0 * 0.2 = 0.4
    expect(metrics.totalEnergy).toBe(0.4);
    expect(metrics.estimatedCalories).toBe(0.01); 

    // Active sample after 300ms (linear acceleration = 4.0 m/s^2)
    now += 300;
    tracker.feed(createSample(now, 4.0));
    metrics = tracker.getMetrics();
    expect(metrics.activeDurationMs).toBe(500); // 200ms + 300ms
    // energy increment = 4.0 * 0.3 = 1.2. Total = 0.4 + 1.2 = 1.6
    expect(metrics.totalEnergy).toBe(1.6);
  });

  it('should not accumulate duration when motion is below threshold', () => {
    tracker.start();
    let now = 1000;

    tracker.feed(createSample(now, 2.0));

    // Active motion
    now += 200;
    tracker.feed(createSample(now, 2.0));
    expect(tracker.getMetrics().activeDurationMs).toBe(200);

    // Inactive motion (linear acceleration = 0.1 m/s^2, which is below 0.4 threshold)
    now += 200;
    tracker.feed(createSample(now, 0.1));
    expect(tracker.getMetrics().activeDurationMs).toBe(200); // Should stay at 200ms
  });

  it('should reset properly', () => {
    tracker.start();
    tracker.feed(createSample(1000, 2.0));
    tracker.feed(createSample(1200, 2.0));
    expect(tracker.getMetrics().activeDurationMs).toBe(200);

    tracker.reset();
    const metrics = tracker.getMetrics();
    expect(metrics.activeDurationMs).toBe(0);
    expect(metrics.totalEnergy).toBe(0);
  });
});
