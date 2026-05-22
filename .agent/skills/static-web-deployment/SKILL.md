# Skill: Static Web Deployment (정적 웹 배포)

이 스킬은 빌드된 운동 카운터 애플리케이션의 Vercel 호스팅 배포 절차, Vercel 설정 파일 관리 지침, 그리고 브라우저 보안 컨텍스트에 맞춰 도메인을 운용하는 지침에 대해 다룹니다.

## 사용 시점
- 신규 빌드 스크립트를 변경하거나 Vercel 설정 파일(`vercel.json`)을 조율할 때.
- 모노레포 내 신규 패키지 및 앱이 생성되어 배포 파이프라인을 연동해야 할 때.
- HTTPS 관련 보안 이슈 또는 도메인 리다이렉션 정책을 지정할 때.

## 수행 지침

### 1. Vercel 모노레포 설정 세부 사양
Vercel 대시보드에서 `sensor-lab`과 `counter-demo`를 개별적으로 배포할 때, 각 프로젝트는 다음 설정을 가져야 빌드가 정상적으로 완료됩니다.

- **프로젝트 공통 빌드 및 프레임워크 프리셋**:
  - **Framework Preset**: `Vite` (또는 `Other`)
  - **Build Command**: `npm run build`
  - **Root Directory**: `apps/sensor-lab` 또는 `apps/counter-demo`
- **모노레포 의존성 공유**:
  - Vercel은 Root Directory 바깥의 상위 디렉터리에 정의된 모노레포 패키지(`packages/*`)를 빌드 시 참조해야 하므로, 빌드 프로세스가 모노레포 루트에서 모듈을 설치할 수 있도록 해야 합니다.
  - Vercel 프로젝트 설정의 "Build & Development Settings"에서 **Override**를 통해 루트 경로에서의 의존성 설치가 자동으로 처리되도록 지원합니다.

### 2. HTTPS Redirection 설정 (`vercel.json`)
각 웹앱의 루트 디렉터리에 `vercel.json`을 배치하여 라우팅 및 헤더 설정을 직접 제어합니다.
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        }
      ]
    }
  ]
}
```
이 헤더는 브라우저가 강제 HTTPS(HSTS) 모드로 사이트에 접속하도록 유도하여 `DeviceMotionEvent`가 미접근 상태가 되는 상황을 원천 차단합니다.

### 3. Vercel CLI 배포 명령 (선택사항)
로컬에서 CLI 명령어를 이용해 즉시 배포 검증을 하고 싶을 때 사용하는 기본 구문:
- **Preview 배포**:
  ```bash
  npx vercel
  ```
- **Production 배포**:
  ```bash
  npx vercel --prod
  ```
- **주의**: 모노레포 루트가 아닌 개별 앱 폴더(`apps/sensor-lab` 등) 내부로 진입하여 명령어를 실행해야 해당 앱 컨텍스트로 정상 업로드됩니다.
