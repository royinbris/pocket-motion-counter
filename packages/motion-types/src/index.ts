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

export interface WorkoutRecord {
  id: string;             // 고유 ID (timestamp 기반)
  timestamp: number;      // 운동 완료/중단 일시 (Date.now())
  workoutType: 'squat' | 'pushup' | 'walk' | 'dance';
  workoutMode: 'rep' | 'time' | 'dance';
  totalSets: number;      // 설정된 목표 세트 수 (댄스 모드는 1)
  completedSets: number;  // 실제 수행 완료한 세트 수
  totalCount: number;     // 누적 운동 횟수
  durationMs: number;     // 댄스/시간제 운동인 경우 수행 시간(ms)
  calories: number;       // 소모 칼로리 (kcal)
  energy: number;         // 댄스 에너지 점수
}

