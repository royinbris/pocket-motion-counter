import {
  IMotionCounter,
  MotionSample,
  CounterState,
  CounterConfig,
  CounterCallback,
  StateChangeCallback,
  CompleteCallback,
  DebugCallback
} from '@pocket-motion/types';

export class SquatCounter implements IMotionCounter {
  private config: CounterConfig;
  private count = 0;
  private state: CounterState = 'idle';
  private isActive = false;

  // LPF state
  private lastFilteredMag = 9.8;

  // Callback lists
  private countCallbacks: CounterCallback[] = [];
  private stateChangeCallbacks: StateChangeCallback[] = [];
  private completeCallbacks: CompleteCallback[] = [];
  private debugCallbacks: DebugCallback[] = [];

  // Timing control
  private lastStateTransitionTime = 0;
  private repStartTime = 0;

  constructor(config?: Partial<CounterConfig>) {
    this.config = {
      lpfAlpha: 0.15,
      thresholdDown: 1.2, // Deviation from gravity (9.8 - 1.2 = 8.6 m/s^2)
      thresholdUp: 1.2,   // Deviation from gravity (9.8 + 1.2 = 11.0 m/s^2)
      minRepDurationMs: 1200, // Regular squat takes at least 1.2s
      targetCount: config?.targetCount,
      ...config
    };
  }

  public start(): void {
    this.isActive = true;
    this.reset();
  }

  public stop(): void {
    this.isActive = false;
  }

  /** 운동 중 민감도 등 설정을 런타임에 업데이트 (카운트 초기화 없음) */
  public setConfig(partial: Partial<CounterConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  public reset(): void {
    this.count = 0;
    this.state = 'idle';
    this.lastFilteredMag = 9.8;
    this.lastStateTransitionTime = Date.now();
    this.repStartTime = 0;
    this.notifyStateChange();
  }

  public feed(sample: MotionSample): void {
    if (!this.isActive) return;

    // Calculate acceleration magnitude (norm of 3D vector)
    const mag = Math.sqrt(
      sample.accelX * sample.accelX +
      sample.accelY * sample.accelY +
      sample.accelZ * sample.accelZ
    );

    // Apply Low-pass filter (EMA)
    const filteredMag = this.config.lpfAlpha * mag + (1 - this.config.lpfAlpha) * this.lastFilteredMag;
    this.lastFilteredMag = filteredMag;

    this.processFsm(filteredMag, sample.timestamp);
    this.triggerDebug(mag, filteredMag);
  }

  private processFsm(mag: number, timestamp: number): void {
    const gravity = 9.80665;
    const now = timestamp || Date.now();
    const timeInState = now - this.lastStateTransitionTime;

    switch (this.state) {
      case 'idle':
        // Descending detection: Acceleration drops below gravity - thresholdDown (freefall effect during squat start)
        if (mag < gravity - this.config.thresholdDown) {
          this.changeState('descending', now);
          this.repStartTime = now;
        }
        break;

      case 'descending':
        // Transition to Valley when acceleration returns close to gravity or rises (releasing downward speed)
        if (mag >= gravity - (this.config.thresholdDown * 0.25)) {
          this.changeState('valley', now);
        }
        break;

      case 'valley':
        // Transition to Ascending when acceleration shoots up above gravity + thresholdUp (pushing floor to rise)
        if (mag > gravity + this.config.thresholdUp) {
          this.changeState('ascending', now);
        }
        // Timeout check: if stayed in valley/descending too long without going up, reset to idle (not a clean rep)
        if (timeInState > 4000) {
          this.changeState('idle', now);
        }
        break;

      case 'ascending':
        // Return to Idle when acceleration stabilizes back around normal gravity range
        if (mag <= gravity + (this.config.thresholdUp * 0.25)) {
          const repDuration = now - this.repStartTime;

          // Validate rep duration
          if (repDuration >= this.config.minRepDurationMs) {
            this.count++;
            this.notifyCount();

            if (this.config.targetCount && this.count >= this.config.targetCount) {
              this.notifyComplete();
              this.stop();
            }
          }
          this.changeState('idle', now);
        }
        break;
    }
  }

  private changeState(newState: CounterState, timestamp: number): void {
    if (this.state !== newState) {
      this.state = newState;
      this.lastStateTransitionTime = timestamp;
      this.notifyStateChange();
    }
  }

  // Event registration
  public onCount(cb: CounterCallback): void {
    this.countCallbacks.push(cb);
  }

  public onStateChange(cb: StateChangeCallback): void {
    this.stateChangeCallbacks.push(cb);
  }

  public onComplete(cb: CompleteCallback): void {
    this.completeCallbacks.push(cb);
  }

  public onDebug(cb: DebugCallback): void {
    this.debugCallbacks.push(cb);
  }

  // Getters
  public getCount(): number {
    return this.count;
  }

  public getCurrentState(): CounterState {
    return this.state;
  }

  // Notification dispatchers
  private notifyCount(): void {
    this.countCallbacks.forEach(cb => cb(this.count));
  }

  private notifyStateChange(): void {
    this.stateChangeCallbacks.forEach(cb => cb(this.state));
  }

  private notifyComplete(): void {
    this.completeCallbacks.forEach(cb => cb());
  }

  private triggerDebug(rawMag: number, filteredMag: number): void {
    this.debugCallbacks.forEach(cb =>
      cb({
        magnitude: rawMag,
        filteredMagnitude: filteredMag,
        state: this.state
      })
    );
  }
}
