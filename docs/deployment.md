# Deployment Strategy: Pocket Motion Counter

모바일 웹 가속도/자이로 센서 API(`DeviceMotionEvent`)의 필수 요건인 **Secure Context (HTTPS)** 환경을 보장하기 위한 빌드 및 배포 전략 문서입니다.

## 1. 배포 아키텍처 개요
모노레포 내의 프런트엔드 애플리케이션들은 정적 HTML/JS/CSS로 빌드되므로, 별도의 백엔드 가동 없이 CDN 기반의 고성능 정적 웹 호스팅 환경을 사용합니다.
- **코드 저장소**: GitHub
- **배포 플랫폼**: Vercel (또는 보조 배포처로 GitHub Pages)
- **배포 트리거**: GitHub `main` 브랜치 Push 시 자동 배포 (Production), Feature 브랜치 Push 시 Preview 배포.

## 2. 모노레포 Vercel 설정 방식
Vercel은 하나의 GitHub 저장소 내 모노레포의 여러 프로젝트를 개별 프로젝트로 생성하여 연동하는 방식을 완벽히 지원합니다.
- **프로젝트 1: sensor-lab**
  - **Root Directory**: `apps/sensor-lab`
  - **Build Command**: `npm run build` (또는 루트 수준 빌드)
  - **Output Directory**: `dist`
- **프로젝트 2: counter-demo**
  - **Root Directory**: `apps/counter-demo`
  - **Build Command**: `npm run build`
  - **Output Directory**: `dist`

Vercel 대시보드에서 각각의 프로젝트를 생성하고 해당 디렉터리를 Root로 연결하면 독립적인 HTTPS URL이 발급됩니다.

## 3. 로컬 HTTPS 환경 구축 (Local Development)
Vercel에 올리기 전 로컬 네트워크 내에서 모바일 폰으로 접속하여 센서를 테스트하고 싶을 때, 기본 HTTP로는 `DeviceMotionEvent`가 동작하지 않습니다. 이를 해결하기 위해 Vite의 `mkcert` 플러그인을 활성화하여 로컬 개발 서버를 HTTPS로 서빙합니다.

### 로컬 HTTPS 구동 플로우
1. 각 앱(`sensor-lab`, `counter-demo`)의 `vite.config.ts`에 `vite-plugin-mkcert`를 설치 및 등록합니다.
2. 로컬 개발 서버 구동 시:
   ```bash
   npm run dev:lab -- --host
   ```
3. 터미널에 출력되는 로컬 IP 주소(예: `https://192.168.0.15:5173`)로 스마트폰과 PC가 같은 공유기(Wi-Fi)에 접속되어 있으면 직접 접속할 수 있습니다.
4. (최초 접속 시) 브라우저의 '고급 설정'에서 '신뢰할 수 없는 인증서 계속 진행'을 선택하여 접근합니다.

## 4. GitHub Actions를 통한 품질 검증 (CI)
GitHub 저장소에 PR이나 Push 발생 시, 빌드 안정성과 비즈니스 로직 정상 동작 여부를 확인하기 위해 간단한 CI 워크플로를 도입합니다.
- `.github/workflows/ci.yml`을 신설하여 다음을 수행합니다.
  - 의존성 설치 및 캐싱
  - 핵심 엔진 단위 테스트 실행 (`npm run test`)
  - 전체 빌드 검증 (`npm run build`)
