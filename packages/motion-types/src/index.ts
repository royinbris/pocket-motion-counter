export interface MotionSample {
  timestamp: number;
  accelX: number; // m/s^2 (includes gravity)
  accelY: number; // m/s^2 (includes gravity)
  accelZ: number; // m/s^2 (includes gravity)
  linearX: number | null; // m/s^2 (without gravity)
  linearY: number | null;
  linearZ: number | null;
  rotationAlpha: number | null; // deg/s
  rotationBeta: number | null;
  rotationGamma: number | null;
}

export interface SessionData {
  sessionId: string;
  exerciseType: string;
  actualCount: number;
  pocketLocation: string;
  recordedAt: string;
  samples: MotionSample[];
}

export type CounterState = 'idle' | 'descending' | 'valley' | 'ascending';

export interface CounterConfig {
  lpfAlpha: number; // Low-pass filter smoothing coefficient (e.g. 0.15)
  thresholdDown: number; // Acceleration/Orientation threshold to trigger descending (e.g., -1.5m/s^2 change)
  thresholdUp: number; // Acceleration/Orientation threshold to trigger ascending (e.g., +1.5m/s^2 change)
  minRepDurationMs: number; // Minimum time duration for a valid rep to filter quick noise (e.g., 1000ms)
  targetCount?: number;
}

export type CounterCallback = (count: number) => void;
export type StateChangeCallback = (state: CounterState) => void;
export type CompleteCallback = () => void;
export type DebugCallback = (data: {
  magnitude: number;
  filteredMagnitude: number;
  state: CounterState;
}) => void;

export interface IMotionCounter {
  start(): void;
  stop(): void;
  reset(): void;
  feed(sample: MotionSample): void;
  onCount(cb: CounterCallback): void;
  onStateChange(cb: StateChangeCallback): void;
  onComplete(cb: CompleteCallback): void;
  onDebug(cb: DebugCallback): void;
  getCount(): number;
  getCurrentState(): CounterState;
}
