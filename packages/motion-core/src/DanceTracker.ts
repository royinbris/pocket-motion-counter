import { MotionSample } from '@pocket-motion/types';

export type DanceAction = 'left_tilt' | 'right_tilt' | 'run' | 'walk' | 'up_motion' | 'down_motion';

export interface DanceMetrics {
  activeDurationMs: number;  // 춤춘 실시간 누적 시간 (ms)
  totalEnergy: number;       // 누적 모션 에너지 점수 (점수제 폐지로 항상 0)
  estimatedCalories: number; // 소모 칼로리 추정치 (kcal)
  totalScore: number;        // 누적 모션 점수 (점수제 폐지로 항상 0)
  intensity: number;         // 실시간 움직임 강도 (0 ~ 100)
  isActive: boolean;         // 운동 활성 상태
  detectedAction?: DanceAction; // 실시간 감지된 동작
}

export type DanceUpdateCallback = (metrics: DanceMetrics) => void;

export class DanceTracker {
  private activeDurationMs = 0;
  private totalEnergy = 0;
  private estimatedCalories = 0;
  private totalScore = 0;
  private intensity = 0;
  private isActive = false;
  private motionThreshold = 0.4; // 움직임 민감도 (사용자 설정 가능)
  private lastMotionTime = Date.now(); // 마지막 움직임 시간 (3분 Idle 체크용)

  private lastSampleTime = 0;
  private lpfAlpha = 0.2;
  private lastFilteredMag = 9.80665;

  private updateCallbacks: DanceUpdateCallback[] = []; // 업데이트 콜백 목록 (이전 누락 선언 수정)

  // 실시간 모션 감지용 상태 변수
  private tiltState: 'neutral' | 'left' | 'right' = 'neutral';
  private verticalState: 'neutral' | 'up' | 'down' = 'neutral';
  private lastRunTime = 0;
  private lastWalkTime = 0;

  constructor() {}

  public setMotionThreshold(threshold: number): void {
    this.motionThreshold = threshold;
  }

  public start(): void {
    this.isActive = true;
    this.lastMotionTime = Date.now();
    this.reset();
  }

  public stop(): void {
    this.isActive = false;
  }

  public reset(): void {
    this.activeDurationMs = 0;
    this.totalEnergy = 0;
    this.estimatedCalories = 0;
    this.totalScore = 0;
    this.intensity = 0;
    this.lastSampleTime = 0;
    this.lastFilteredMag = 9.80665;
    this.lastMotionTime = Date.now();
    this.tiltState = 'neutral';
    this.verticalState = 'neutral';
    this.lastRunTime = 0;
    this.lastWalkTime = 0;
    this.triggerUpdate();
  }

  public feed(sample: MotionSample): void {
    if (!this.isActive) return;

    const now = sample.timestamp || Date.now();
    
    // 3분(180,000ms) 동안 움직임이 없으면 일시정지
    if (now - this.lastMotionTime > 180000) {
      this.isActive = false;
      this.triggerUpdate(); 
      return;
    }

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

    // 중력을 제외한 순수 선형 가속도 데이터 활용
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

    // 5. 움직임 임계값 판정 및 점수 계산 (점수제 폐지로 칼로리/시간만 누적 계산)
    if (linearMag > this.motionThreshold && dt > 0 && dt < 1000) {
      this.activeDurationMs += dt;
      this.lastMotionTime = now; // 움직임 시간 갱신

      // 모션 에너지 누적 (linearMag * dt_sec)
      const dtSec = dt / 1000;
      const energyIncrement = linearMag * dtSec;
      
      // 칼로리 소모량 환산 모델링 (체중 65kg 기준 계수)
      this.estimatedCalories += energyIncrement * 0.015;
    }

    // 6. 실시간 동작 감지 및 사운드 트리거용 액션 판별
    let detectedAction: DanceAction | undefined = undefined;

    // 6-1. 좌우 기울임 감지 (accelX 기준)
    // 주머니 속 폰의 가로축 가속도 성분으로 감지
    if (sample.accelX < -2.5) {
      if (this.tiltState !== 'left') {
        this.tiltState = 'left';
        detectedAction = 'left_tilt';
      }
    } else if (sample.accelX > 2.5) {
      if (this.tiltState !== 'right') {
        this.tiltState = 'right';
        detectedAction = 'right_tilt';
      }
    } else if (Math.abs(sample.accelX) < 1.0) {
      this.tiltState = 'neutral';
    }

    // 6-2. 뜀 및 걸음 감지 (linearMag 기준)
    if (!detectedAction) {
      if (linearMag > 6.5) {
        if (now - this.lastRunTime > 400) {
          this.lastRunTime = now;
          this.lastWalkTime = now; // 걷기 소리가 즉시 겹치는 걸 방지
          detectedAction = 'run';
        }
      } else if (linearMag > 2.2) {
        if (now - this.lastWalkTime > 550) {
          this.lastWalkTime = now;
          detectedAction = 'walk';
        }
      }
    }

    // 6-3. 상하 운동 감지 (linearY 기준)
    // 뜀/걸음 같은 큰 충격이 아닐 때 몸을 위아래로 움직이는 가속도 감지
    if (!detectedAction && linearMag < 3.2) {
      if (sample.linearY !== null) {
        const yVal = sample.linearY;
        if (yVal > 1.6) {
          if (this.verticalState !== 'up') {
            this.verticalState = 'up';
            detectedAction = 'up_motion';
          }
        } else if (yVal < -1.6) {
          if (this.verticalState !== 'down') {
            this.verticalState = 'down';
            detectedAction = 'down_motion';
          }
        } else if (Math.abs(yVal) < 0.6) {
          this.verticalState = 'neutral';
        }
      }
    } else if (linearMag >= 3.2) {
      this.verticalState = 'neutral';
    }

    this.triggerUpdate(detectedAction);
  }

  public onUpdate(cb: DanceUpdateCallback): void {
    this.updateCallbacks.push(cb);
  }

  private triggerUpdate(detectedAction?: DanceAction): void {
    const metrics = this.getMetrics();
    if (detectedAction) {
      metrics.detectedAction = detectedAction;
    }
    this.updateCallbacks.forEach(cb => cb(metrics));
  }

  public getMetrics(): DanceMetrics {
    return {
      activeDurationMs: this.activeDurationMs,
      totalEnergy: Number(this.totalEnergy.toFixed(2)),
      estimatedCalories: Number(this.estimatedCalories.toFixed(2)),
      totalScore: Number(this.totalScore.toFixed(0)), // 점수는 항상 0으로 리턴하여 점수제 폐지
      intensity: this.intensity,
      isActive: this.isActive
    };
  }
}
