import { MotionSample } from '@pocket-motion/types';

export interface DanceMetrics {
  activeDurationMs: number;  // 춤춘 실시간 누적 시간 (ms)
  totalEnergy: number;       // 누적 모션 에너지 점수
  estimatedCalories: number; // 소모 칼로리 추정치 (kcal)
  intensity: number;         // 실시간 움직임 강도 (0 ~ 100)
}

export type DanceUpdateCallback = (metrics: DanceMetrics) => void;

export class DanceTracker {
  private activeDurationMs = 0;
  private totalEnergy = 0;
  private estimatedCalories = 0;
  private intensity = 0;
  private isActive = false;

  private lastSampleTime = 0;
  private lpfAlpha = 0.2;
  private lastFilteredMag = 9.80665;

  private updateCallbacks: DanceUpdateCallback[] = [];

  constructor() {}

  public start(): void {
    this.isActive = true;
    this.reset();
  }

  public stop(): void {
    this.isActive = false;
  }

  public reset(): void {
    this.activeDurationMs = 0;
    this.totalEnergy = 0;
    this.estimatedCalories = 0;
    this.intensity = 0;
    this.lastSampleTime = 0;
    this.lastFilteredMag = 9.80665;
    this.triggerUpdate();
  }

  public feed(sample: MotionSample): void {
    if (!this.isActive) return;

    const now = sample.timestamp || Date.now();
    const dt = this.lastSampleTime > 0 ? (now - this.lastSampleTime) : 0;
    this.lastSampleTime = now;

    // 1. 중력을 포함한 3D 가속도 벡터 크기
    const mag = Math.sqrt(
      sample.accelX * sample.accelX +
      sample.accelY * sample.accelY +
      sample.accelZ * sample.accelZ
    );

    // 2. 가속도에 LPF 적용
    const filteredMag = this.lpfAlpha * mag + (1 - this.lpfAlpha) * this.lastFilteredMag;
    this.lastFilteredMag = filteredMag;

    // 3. 중력을 제외한 변동 크기 계산
    const deviation = Math.abs(mag - 9.80665);

    // 중력을 제외한 순수 선형 가속도 데이터 활용 (없으면 deviation으로 대체)
    let linearMag = 0;
    if (sample.linearX !== null && sample.linearY !== null && sample.linearZ !== null) {
      linearMag = Math.sqrt(
        sample.linearX * sample.linearX +
        sample.linearY * sample.linearY +
        sample.linearZ * sample.linearZ
      );
    } else {
      linearMag = deviation;
    }

    // 4. 실시간 운동 강도 Intensity (linearMag 값을 0~100 사이로 매핑, 대략 8.0 m/s^2을 최대치 100으로 설정)
    this.intensity = Math.min(100, Math.round(linearMag * 12.5));

    // 5. 움직임 임계값 판정 (선형 가속도가 0.4 m/s^2을 초과하여 활동적 상태인 경우에만 춤 시간 누적)
    const motionThreshold = 0.4;
    if (linearMag > motionThreshold && dt > 0 && dt < 1000) {
      this.activeDurationMs += dt;

      // 모션 에너지 누적 (linearMag * dt_sec)
      const dtSec = dt / 1000;
      const energyIncrement = linearMag * dtSec;
      this.totalEnergy += energyIncrement;

      // 칼로리 소모량 환산 모델링 (체중 65kg 기준 계수)
      // 초당 칼로리 소모량: 약 0.015 kcal * 선형 가속도 크기
      this.estimatedCalories += energyIncrement * 0.015;
    }

    this.triggerUpdate();
  }

  public onUpdate(cb: DanceUpdateCallback): void {
    this.updateCallbacks.push(cb);
  }

  private triggerUpdate(): void {
    const metrics = this.getMetrics();
    this.updateCallbacks.forEach(cb => cb(metrics));
  }

  public getMetrics(): DanceMetrics {
    return {
      activeDurationMs: this.activeDurationMs,
      totalEnergy: Number(this.totalEnergy.toFixed(2)),
      estimatedCalories: Number(this.estimatedCalories.toFixed(2)),
      intensity: this.intensity
    };
  }
}
