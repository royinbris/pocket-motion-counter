# Skill: Motion Data Capture (모션 데이터 캡처)

이 스킬은 사용자의 모바일 기기로부터 가속도 및 자이로 센서 데이터를 안전하게 수집하고, 분석을 위해 규격화된 로그 파일로 내보내는 기능의 구현과 디버깅 절차를 설명합니다.

## 사용 시점
- 모바일 웹 브라우저 센서 권한(`DeviceMotionEvent`) 획득 기능을 신설하거나 수정할 때.
- 센서 데이터 스트림의 수집 주기(Sampling Rate) 및 데이터 구조를 조정할 때.
- `sensor-lab` 앱에서 내보내는 JSON 세션 데이터 포맷을 업데이트할 때.

## 수행 지침

### 1. 센서 API 권한 요청 흐름 준수
iOS(Safari) 13+ 및 일부 안드로이드 브라우저에서는 사용자 명시적 조작(예: 버튼 클릭)에 반응해서만 센서 권한 팝업을 띄울 수 있습니다.
- **구현 패턴**:
  ```typescript
  export async function requestSensorPermission(): Promise<boolean> {
    if (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof (DeviceMotionEvent as any).requestPermission === 'function'
    ) {
      try {
        const permissionState = await (DeviceMotionEvent as any).requestPermission();
        return permissionState === 'granted';
      } catch (error) {
        console.error("센서 권한 획득 실패:", error);
        return false;
      }
    } else {
      // 일반 안드로이드 등 권한 팝업이 불필요하거나 즉시 접근 가능한 브라우저
      return true;
    }
  }
  ```
- **주의**: 이 함수는 비동기 리액트 상태 전환 중간이나, 딜레이 뒤에 호출하면 브라우저에 의해 차단당합니다. 반드시 `onClick` 핸들러 직속의 첫 번째 동기 흐름에서 호출되어야 합니다.

### 2. 센서 데이터 로그 표준 포맷
수집된 데이터 세션은 다음과 같은 일관된 TypeScript 인터페이스 구조를 만족해야 합니다.
```typescript
export interface MotionSample {
  timestamp: number; // millisecond 타임스탬프
  // 중력 포함 가속도 (m/s^2)
  accelX: number;
  accelY: number;
  accelZ: number;
  // 중력 제외 가속도 (m/s^2) - 사용 가능 시
  linearX: number | null;
  linearY: number | null;
  linearZ: number | null;
  // 자이로 회전 속도 (deg/s)
  rotationAlpha: number | null; // Z축 기준 회전
  rotationBeta: number | null;  // X축 기준 회전
  rotationGamma: number | null; // Y축 기준 회전
}

export interface SessionData {
  sessionId: string;
  exerciseType: 'squat' | string;
  actualCount: number; // 유저가 수동 기입한 실제 스쿼트 횟수
  pocketLocation: 'right-front' | string;
  recordedAt: string; // ISO 8601 string
  samples: MotionSample[];
}
```

### 3. 세션 Export (내보내기) 가이드라인
- `sensor-lab`에서 데이터 수집 종료 시, JSON 파일을 브라우저의 파일 다운로드 형태로 쉽게 내보낼 수 있도록 설계합니다.
- 내보내기 파일 이름은 `pocket-motion-session-{exerciseType}-{recordedAt}.json` 규식을 지켜 디버깅 편의성을 제공합니다.
