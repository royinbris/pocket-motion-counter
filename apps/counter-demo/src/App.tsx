import { useState, useEffect, useRef } from 'react';
import { Play, Square, RefreshCw, Trophy, ShieldAlert, Award, Smartphone, VolumeX, ChevronDown, ChevronUp } from 'lucide-react';
import { SquatCounter } from '@pocket-motion/core';
import { MotionSample, CounterState } from '@pocket-motion/types';

// Vite define 매크로를 통한 글로벌 컴파일 타임 상수
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

export default function App() {
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [count, setCount] = useState(0);
  const [currentState, setCurrentState] = useState<CounterState>('idle');
  const [targetCount, setTargetCount] = useState<number | "">(10);
  const [sensitivity, setSensitivity] = useState<number>(5);
  const [isCompleted, setIsCompleted] = useState(false);
  const [bump, setBump] = useState(false);
  const [ballOffset, setBallOffset] = useState({ x: 0, y: 0 });
  const [showAudioTip, setShowAudioTip] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugMag, setDebugMag] = useState(0);
  const [debugFilteredMag, setDebugFilteredMag] = useState(9.8);
  const [workoutType, setWorkoutType] = useState<'squat' | 'pushup'>('squat');

  const counterRef = useRef<SquatCounter | null>(null);

  // Audio Context 싱글톤으로 유지하기 위한 Ref
  const audioContextRef = useRef<AudioContext | null>(null);

  // 모바일 브라우저의 오디오 락 강제 해제용 더미 오디오 소스 재생 함수
  const unlockAudioContext = (ctx: AudioContext) => {
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      source.stop(0.001);
    } catch (e) {
      console.warn('더미 오디오 재생 실패 (무시 가능):', e);
    }
  };

  // Audio Context 가져오기 (없으면 생성하고, suspended 상태면 resume)
  const getOrCreateAudioContext = (): AudioContext | null => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }
      const ctx = audioContextRef.current;
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().then(() => {
            unlockAudioContext(ctx);
          });
        } else {
          unlockAudioContext(ctx);
        }
      }
      return ctx;
    } catch (e) {
      console.error('AudioContext 생성/재개 실패:', e);
      return null;
    }
  };

  // 1. 운동 시작 차임 (도-미-솔 상승음)
  const playStartChime = () => {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    
    const now = ctx.currentTime;
    const playNote = (freq: number, startDelay: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      gain.gain.setValueAtTime(0, now + startDelay);
      gain.gain.linearRampToValueAtTime(0.15, now + startDelay + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startDelay + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startDelay);
      osc.stop(now + startDelay + duration);
    };

    playNote(523.25, 0.0, 0.25); // C5
    playNote(659.25, 0.12, 0.25); // E5
    playNote(783.99, 0.24, 0.35); // G5
  };

  // 2. 매 회차 완료 차임 (딩~동~ 청아하고 빠른 2연음 - 지체 없이 반응)
  const playRepCompleteChime = () => {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const playNote = (freq: number, startDelay: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle'; // triangle wave gives a warmer, flute-like chime
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, now + startDelay);
      gain.gain.linearRampToValueAtTime(0.25, now + startDelay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startDelay + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startDelay);
      osc.stop(now + startDelay + duration);
    };

    // 솔-도 옥타브 도달음 (즉시 들리도록 매우 짧은 간격)
    playNote(987.77, 0.0, 0.15); // B5 (High Chime 1)
    playNote(1318.51, 0.05, 0.3); // E6 (High Chime 2)
  };

  // 3. 세트 완료 빵빠레 (화려한 트럼펫 스타일의 팡파르 연주)
  const playSetCompleteFanfare = () => {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // 차임벨(딩동~)이 끝난 뒤에 빵빠레가 겹치지 않고 자연스럽게 이어지도록 0.4초 시작 딜레이 부여
    const fanfareDelay = 0.4;

    const playNote = (freq: number, startDelay: number, duration: number, type: OscillatorType = 'triangle') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;

      const scheduleTime = now + fanfareDelay + startDelay;
      gain.gain.setValueAtTime(0, scheduleTime);
      gain.gain.linearRampToValueAtTime(0.2, scheduleTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, scheduleTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(scheduleTime);
      osc.stop(scheduleTime + duration);
    };

    const tempo = 0.12;
    playNote(523.25, 0.0, 0.18); // C5
    playNote(523.25, tempo, 0.18); // C5
    playNote(523.25, tempo * 2, 0.18); // C5
    
    playNote(659.25, tempo * 3, 0.22); // E5
    playNote(783.99, tempo * 4, 0.22); // G5
    playNote(1046.50, tempo * 5, 0.6, 'sawtooth'); // C6 (강한 소투스 파형으로 시원하게 지름)
    
    // 풍성함을 더해주는 베이스/하모니 동시 연주
    playNote(261.63, tempo * 5, 0.6); // C4
    playNote(392.00, tempo * 5, 0.6); // G4
  };

  // Vibration feedback helper (Android support)
  const triggerVibration = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  };

  // Request sensor permission
  const handleRequestPermission = async () => {
    // Web Audio context 활성화
    getOrCreateAudioContext();

    if (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof (DeviceMotionEvent as any).requestPermission === 'function'
    ) {
      try {
        const state = await (DeviceMotionEvent as any).requestPermission();
        setPermissionGranted(state === 'granted');
      } catch (err) {
        console.error('권한 팝업 호출 실패:', err);
        setPermissionGranted(false);
      }
    } else {
      setPermissionGranted(true);
    }
  };

  useEffect(() => {
    if (typeof DeviceMotionEvent === 'undefined') {
      setPermissionGranted(false);
      return;
    }
    if (typeof (DeviceMotionEvent as any).requestPermission !== 'function') {
      setPermissionGranted(true);
    }
  }, []);

  // 임계값 매핑 (스쿼트는 1.8~0.6, 푸시업은 0.6~0.12의 매우 예민하고 좁은 가속도 폭 적용)
  const isPushUp = workoutType === 'pushup';
  const minThreshold = isPushUp ? 0.6 : 1.8;
  const maxThreshold = isPushUp ? 0.12 : 0.6;
  const thresholdVal = Number((minThreshold - (sensitivity - 1) * ((minThreshold - maxThreshold) / 9)).toFixed(2));

  // Initialize Motion Engine
  useEffect(() => {
    const squatCounter = new SquatCounter({
      targetCount: targetCount === "" ? 10 : targetCount,
      thresholdDown: thresholdVal,
      thresholdUp: thresholdVal,
      minRepDurationMs: isPushUp ? 800 : 1200, // 푸시업은 최소 0.8초, 스쿼트는 1.2초 보장
      lpfAlpha: isPushUp ? 0.25 : 0.15 // 푸시업은 신호 지연 최소화를 위해 필터 계수 상향
    });

    // Subscribe to events
    squatCounter.onCount((newCount) => {
      setCount(newCount);
      setBump(true);
      setTimeout(() => setBump(false), 200);

      // 매 회차마다 즉시 차임벨과 진동 피드백 제공 (마지막 횟수 포함)
      playRepCompleteChime();
      triggerVibration(180); // 180ms vibration
    });

    squatCounter.onStateChange((state) => {
      setCurrentState(state);
    });

    squatCounter.onComplete(() => {
      setIsCompleted(true);
      setIsActive(false);
      
      // Fanfare sound
      playSetCompleteFanfare();
      triggerVibration([100, 50, 100, 50, 200]);
    });

    squatCounter.onDebug((data) => {
      setDebugMag(Number(data.magnitude.toFixed(3)));
      setDebugFilteredMag(Number(data.filteredMagnitude.toFixed(3)));
    });

    counterRef.current = squatCounter;

    return () => {
      squatCounter.stop();
    };
  }, [targetCount, sensitivity, workoutType]);

  // Motion event router
  useEffect(() => {
    if (!permissionGranted || !isActive || !counterRef.current) {
      setBallOffset({ x: 0, y: 0 });
      return;
    }

    const handleMotionEvent = (event: DeviceMotionEvent) => {
      const linear = event.acceleration || { x: null, y: null, z: null };
      const gyro = event.rotationRate || { alpha: null, beta: null, gamma: null };

      let accelX = event.accelerationIncludingGravity?.x;
      let accelY = event.accelerationIncludingGravity?.y;
      let accelZ = event.accelerationIncludingGravity?.z;

      // 만약 중력가속도 데이터가 완전히 누락되거나(null) 0으로 고정되는 경우, 순수 가속도로 가상 중력을 모사
      if (
        accelX === null || accelY === null || accelZ === null ||
        accelX === undefined || accelY === undefined || accelZ === undefined ||
        (accelX === 0 && accelY === 0 && accelZ === 0)
      ) {
        if (linear.x !== null && linear.y !== null && linear.z !== null) {
          accelX = linear.x;
          accelY = linear.y + 9.80665;
          accelZ = linear.z;
        } else {
          accelX = 0;
          accelY = 9.80665;
          accelZ = 0;
        }
      }

      // 가속도 센서값 기반으로 구슬 물리 오프셋 계산 (움직임 반대 관성 방향)
      const linearX = linear.x || 0;
      const linearY = linear.y || 0;
      
      const rawX = -linearX * 45;
      const rawY = linearY * 45;
      const distance = Math.sqrt(rawX * rawX + rawY * rawY);
      const maxRadius = 48; // 원의 내측 한계 기하 반경 (반지름 60px - 구슬 반지름 12px)

      let targetX = rawX;
      let targetY = rawY;

      if (distance > maxRadius) {
        targetX = rawX * (maxRadius / distance);
        targetY = rawY * (maxRadius / distance);
      }

      setBallOffset({ x: targetX, y: targetY });

      const sample: MotionSample = {
        timestamp: Date.now(),
        accelX: accelX,
        accelY: accelY,
        accelZ: accelZ,
        linearX: linear.x,
        linearY: linear.y,
        linearZ: linear.z,
        rotationAlpha: gyro.alpha,
        rotationBeta: gyro.beta,
        rotationGamma: gyro.gamma,
      };

      counterRef.current?.feed(sample);
    };

    window.addEventListener('devicemotion', handleMotionEvent);
    return () => {
      window.removeEventListener('devicemotion', handleMotionEvent);
      setBallOffset({ x: 0, y: 0 });
    };
  }, [permissionGranted, isActive]);

  const handleStartWorkout = () => {
    if (!counterRef.current) return;
    
    // 오디오 컨텍스트 사전 활성화
    getOrCreateAudioContext();

    setIsCompleted(false);
    setCount(0);
    counterRef.current.start();
    setIsActive(true);
    playStartChime(); // Start chime sound
  };

  const handleStopWorkout = () => {
    if (!counterRef.current) return;
    counterRef.current.stop();
    setIsActive(false);
    setBallOffset({ x: 0, y: 0 });
  };

  const handleReset = () => {
    if (counterRef.current) {
      counterRef.current.reset();
    }
    setCount(0);
    setCurrentState('idle');
    setIsCompleted(false);
    setIsActive(false);
    setBallOffset({ x: 0, y: 0 });
  };

  const handleTitleClick = () => {
    if (isReloading) return;
    setIsReloading(true);
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  const handleBlurTargetCount = () => {
    if (targetCount === "" || targetCount < 1) {
      setTargetCount(10);
    }
  };

  // Helper for generating state tag class
  const getStatusClass = (state: CounterState) => {
    switch (state) {
      case 'descending': return 'status-badge status-descending';
      case 'valley': return 'status-badge status-valley';
      case 'ascending': return 'status-badge status-ascending';
      default: return 'status-badge status-idle';
    }
  };

  // Helper for translating state text
  const getStatusText = (state: CounterState) => {
    switch (state) {
      case 'descending': return '하강 국면 (몸을 낮추는 중)';
      case 'valley': return '최저점 도달 (앉음)';
      case 'ascending': return '상승 국면 (밀어 올리는 중)';
      default: return '대기 중 (바르게 서기)';
    }
  };

  return (
    <div className="app-container">
      <header>
        <div 
          onClick={handleTitleClick} 
          title="새로고침"
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '0.6rem', 
            cursor: 'pointer',
            margin: '0 auto'
          }}
          className="title-container"
        >
          <h1 style={{ margin: 0 }}>POCKET MOTION</h1>
          {isReloading && (
            <RefreshCw 
              size={24} 
              color="#8b5cf6" 
              className="spinning-icon" 
            />
          )}
        </div>
        <div style={{ fontSize: '0.85rem', color: '#8b5cf6', marginTop: '0.4rem', letterSpacing: '0.05em', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
          <span>🚀</span>
          <span>v{__APP_VERSION__}</span>
        </div>
        <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: '0.2rem' }}>
          빌드: {__BUILD_TIME__}
        </div>
        <p style={{ marginTop: '0.6rem' }}>주머니 속 센서 기반 {workoutType === 'squat' ? '스쿼트' : '푸시업'} 카운터</p>
      </header>

      {/* Permission Block */}
      {permissionGranted === null && (
        <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
          <ShieldAlert size={48} color="#ec4899" style={{ marginBottom: '1rem' }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>모션 센서 접근 권한 필요</h3>
          <p style={{ textAlign: 'center', fontSize: '0.9rem', color: '#64748b', margin: '0 0 1.5rem 0' }}>
            기기의 중력 가속도 및 가이드 변화를 추적하기 위해 센서 접근 동의가 요청됩니다.
          </p>
          <button className="btn-main start" onClick={handleRequestPermission}>
            센서 연결하기
          </button>
        </div>
      )}

      {permissionGranted === false && (
        <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
          <ShieldAlert size={48} color="#f43f5e" style={{ marginBottom: '1rem' }} />
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#f43f5e' }}>센서 연결 실패</h3>
          <p style={{ textAlign: 'center', fontSize: '0.9rem', color: '#94a3b8', margin: '0' }}>
            HTTPS 주소로 접속 중인지 확인하십시오. 혹은 모바일 브라우저 설정에서 가속도 센서 권한이 꺼져 있을 수 있습니다.
          </p>
        </div>
      )}

      {permissionGranted === true && (
        <>
          {/* Workout Type Tabs Selector (상단 상시 표출, 운동 중에는 비활성화) */}
          <div style={{ 
            width: '100%', 
            maxWidth: '480px', 
            margin: '0 auto 1.5rem auto',
            opacity: isActive ? 0.6 : 1,
            pointerEvents: isActive ? 'none' : 'auto',
            transition: 'all 0.3s ease'
          }}>
            <div style={{ 
              display: 'flex', 
              background: 'rgba(15, 23, 42, 0.4)', 
              backdropFilter: 'blur(8px)',
              borderRadius: '20px', 
              padding: '0.4rem', 
              border: '1px solid rgba(139, 92, 246, 0.15)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
            }}>
              <button
                onClick={() => setWorkoutType('squat')}
                disabled={isActive}
                style={{
                  flex: 1,
                  padding: '0.85rem',
                  border: 'none',
                  borderRadius: '16px',
                  background: workoutType === 'squat' ? '#8b5cf6' : 'transparent',
                  color: workoutType === 'squat' ? '#fff' : '#64748b',
                  fontSize: '0.95rem',
                  fontWeight: '700',
                  cursor: isActive ? 'not-allowed' : 'pointer',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: workoutType === 'squat' ? '0 4px 12px rgba(139, 92, 246, 0.3)' : 'none'
                }}
              >
                🦵 스쿼트 (Squat)
              </button>
              <button
                onClick={() => setWorkoutType('pushup')}
                disabled={isActive}
                style={{
                  flex: 1,
                  padding: '0.85rem',
                  border: 'none',
                  borderRadius: '16px',
                  background: workoutType === 'pushup' ? '#8b5cf6' : 'transparent',
                  color: workoutType === 'pushup' ? '#fff' : '#64748b',
                  fontSize: '0.95rem',
                  fontWeight: '700',
                  cursor: isActive ? 'not-allowed' : 'pointer',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: workoutType === 'pushup' ? '0 4px 12px rgba(139, 92, 246, 0.3)' : 'none'
                }}
              >
                💪 푸시업 (Push-up)
              </button>
            </div>
            {isActive && (
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem', textAlign: 'center' }}>
                🔒 운동 진행 중에는 종목을 변경할 수 없습니다.
              </div>
            )}
          </div>

          {/* Settings before workout */}
          {!isActive && !isCompleted && (
            <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
              <div className="input-group" style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <label style={{ fontSize: '0.95rem', color: '#94a3b8', marginBottom: '1rem', display: 'block', fontWeight: '700' }}>
                  목표 운동 세트 설정
                </label>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="1"
                    max="100"
                    value={targetCount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setTargetCount("");
                      } else {
                        const parsed = parseInt(val, 10);
                        if (!isNaN(parsed)) {
                          setTargetCount(Math.min(100, Math.max(1, parsed)));
                        }
                      }
                    }}
                    onBlur={handleBlurTargetCount}
                    className="input-field-giant"
                  />
                  <span style={{ fontSize: '2rem', fontWeight: '800', color: '#64748b' }}>회</span>
                </div>
              </div>

              {/* Sensitivity Control Slider */}
              <div className="input-group" style={{ textAlign: 'center', marginBottom: '2rem', width: '100%' }}>
                <label style={{ fontSize: '0.95rem', color: '#94a3b8', marginBottom: '0.5rem', display: 'block', fontWeight: '700' }}>
                  센서 민감도 설정: <span style={{ color: '#8b5cf6' }}>{sensitivity}</span> {sensitivity === 5 ? '(보통)' : sensitivity > 5 ? '(민감)' : '(둔감)'}
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseInt(e.target.value, 10))}
                  style={{
                    width: '100%',
                    accentColor: '#8b5cf6',
                    height: '6px',
                    borderRadius: '3px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    outline: 'none',
                    marginTop: '0.5rem',
                    cursor: 'pointer'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem' }}>
                  <span>둔감함 (큰 움직임)</span>
                  <span>민감함 (작은 움직임)</span>
                </div>
              </div>

              <button className="btn-main start" onClick={handleStartWorkout}>
                <Play size={20} />
                운동 시작하기
              </button>
            </div>
          )}

          {/* Active Workout Board */}
          {(isActive || isCompleted) && (
            <div className={`dashboard-card ${isActive ? 'active' : ''}`} style={{ marginBottom: '1.5rem' }}>
              {/* Pocket alignment guide */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
                <Smartphone size={14} />
                <span>
                  {workoutType === 'squat' 
                    ? '우측 앞바지 주머니에 스마트폰을 고정하세요.' 
                    : '바지 주머니에 스마트폰을 흔들림 없게 넣고, 엉덩이와 골반을 상체와 함께 낮췄다 올려야 감지가 잘 됩니다.'}
                </span>
              </div>

              {/* State Badge */}
              <div className={getStatusClass(currentState)}>
                {getStatusText(currentState)}
              </div>

              {/* Inertia Motion Visualizer (관성 구슬 원형 UI) */}
              <div className="motion-container">
                <div 
                  className="motion-ball" 
                  style={{ 
                    transform: `translate3d(${ballOffset.x}px, ${ballOffset.y}px, 0)` 
                  }} 
                />
              </div>

              {/* Big Count Screen */}
              <div className={`counter-display ${bump ? 'bump' : ''}`}>
                {count}
              </div>

              <div style={{ fontSize: '0.95rem', color: '#64748b', marginBottom: '2rem' }}>
                목표 회수: <strong style={{ color: '#fff' }}>{targetCount || 10}</strong> 회
              </div>

              {/* Stop & Pause controls */}
              <div style={{ width: '100%', display: 'flex', gap: '1rem' }}>
                {isActive ? (
                  <button className="btn-main stop" onClick={handleStopWorkout}>
                    <Square size={18} />
                    일시 중지
                  </button>
                ) : (
                  <button className="btn-main start" onClick={handleStartWorkout}>
                    <Play size={18} />
                    이어서 진행
                  </button>
                )}
                <button
                  onClick={handleReset}
                  style={{
                    width: '60px',
                    height: '58px',
                    borderRadius: '16px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#fff'
                  }}
                >
                  <RefreshCw size={20} />
                </button>
              </div>
            </div>
          )}

          {/* Celebration Splash Screen */}
          {isCompleted && (
            <div className="overlay">
              <Award size={80} color="#ffd000" style={{ marginBottom: '1rem', animation: 'pulse-border 1.5s infinite' }} />
              <div className="celebration-title">세트 완료!</div>
              <p style={{ color: '#94a3b8', fontSize: '1.1rem', margin: '0 0 2rem 0' }}>
                {workoutType === 'squat' ? '스쿼트' : '푸시업'} <strong>{targetCount || 10}회</strong> 목표를 성공적으로 완료했습니다!
              </p>
              <div style={{ width: '100%', maxWidth: '280px' }}>
                <button className="btn-main start" onClick={handleReset}>
                  <Trophy size={18} />
                  새로운 세트 시작
                </button>
              </div>
            </div>
          )}

          {/* Audio Troubleshooter Guide (소리가 나지 않나요?) */}
          <div className="audio-guide-wrapper">
            <button 
              className={`audio-guide-toggle ${showAudioTip ? 'active' : ''}`}
              onClick={() => setShowAudioTip(!showAudioTip)}
            >
              <VolumeX size={16} />
              <span>소리가 나지 않나요?</span>
              {showAudioTip ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            
            {showAudioTip && (
              <div className="audio-guide-content">
                <div className="audio-tip-item">
                  <strong>1. 아이폰(iOS) 물리 무음 스위치 확인</strong>
                  <p>아이폰 측면의 물리 무음(진동) 스위치가 켜져(주황색이 보이게 내려져) 있으면 효과음이 재생되지 않습니다. 스위치를 위로 올려 <strong>벨소리 모드</strong>로 전환해 주세요.</p>
                </div>
                <div className="audio-tip-item">
                  <strong>2. 첫 터치(클릭) 상호작용 필수</strong>
                  <p>모바일 브라우저 보안 규정 상, 페이지 로드 후 사용자의 터치 입력이 없으면 소리 재생이 차단됩니다. 반드시 <strong>'운동 시작하기'</strong> 버튼 등을 직접 클릭하여 시작해 주세요.</p>
                </div>
                <div className="audio-tip-item">
                  <strong>3. 기기 미디어 볼륨 확인</strong>
                  <p>스마트폰의 미디어 음량이 음소거 또는 너무 낮게 설정되어 있는지 확인하고 볼륨을 키워 주세요.</p>
                </div>
              </div>
            )}
          </div>

          {/* Debug Toggle & Panel */}
          <div style={{ marginTop: '1.5rem', width: '100%', maxWidth: '480px', textAlign: 'center' }}>
            <button
              onClick={() => setShowDebug(!showDebug)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '0.4rem 0.8rem',
                borderRadius: '8px',
                color: '#64748b',
                fontSize: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {showDebug ? '⚙️ 디버그 패널 닫기' : '⚙️ 개발자 디버그 패널 열기'}
            </button>

            {showDebug && (
              <div style={{
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                borderRadius: '12px',
                padding: '1rem',
                marginTop: '0.5rem',
                textAlign: 'left',
                fontSize: '0.8rem',
                color: '#94a3b8',
                lineHeight: '1.6',
                fontFamily: 'monospace'
              }}>
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.25rem', marginBottom: '0.25rem', color: '#c084fc', fontWeight: 'bold' }}>
                  실시간 센서 디버그 데이터
                </div>
                <div>센서 수신 여부: <span style={{ color: debugMag !== 0 ? '#10b981' : '#f43f5e' }}>{debugMag !== 0 ? '정상 수신 중' : '대기 중 (0)'}</span></div>
                <div>실시간 가속도 크기 (mag): <strong style={{ color: '#fff' }}>{debugMag}</strong> m/s²</div>
                <div>LPF 필터링 가속도 (filtered): <strong style={{ color: '#8b5cf6' }}>{debugFilteredMag}</strong> m/s²</div>
                <div>카운터 상태 (FSM State): <strong style={{ color: '#f59e0b' }}>{currentState.toUpperCase()}</strong></div>
                <div>설정 임계값 (Threshold): <strong>{thresholdVal}</strong> (민감도: {sensitivity})</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.25rem' }}>
                  ※ {workoutType === 'squat' ? '스쿼트' : '푸시업'} 카운트 원리: 하강 시 가속도가 {Number((9.8 - thresholdVal).toFixed(2))} 이하로 감소하고, 최저점에서 회복된 후, 상승 시 {Number((9.8 + thresholdVal).toFixed(2))} 이상으로 가속도가 치솟아야 1회가 인정됩니다.
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <footer style={{ textAlign: 'center', fontSize: '0.75rem', color: '#475569', marginTop: 'auto', paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div>Pocket Motion Counter Demo v{__APP_VERSION__}</div>
        <div style={{ color: '#334155', fontSize: '0.65rem' }}>
          배포 버전: v{__APP_VERSION__} ({__BUILD_TIME__})
        </div>
      </footer>
    </div>
  );
}
