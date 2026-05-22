import { useState, useEffect, useRef } from 'react';
import { Play, Square, RefreshCw, Trophy, ShieldAlert, Award, Smartphone } from 'lucide-react';
import { SquatCounter } from '@pocket-motion/core';
import { MotionSample, CounterState } from '@pocket-motion/types';

export default function App() {
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [count, setCount] = useState(0);
  const [currentState, setCurrentState] = useState<CounterState>('idle');
  const [targetCount, setTargetCount] = useState(10);
  const [isCompleted, setIsCompleted] = useState(false);
  const [bump, setBump] = useState(false);

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

  // Initialize Motion Engine
  useEffect(() => {
    const squatCounter = new SquatCounter({
      targetCount: targetCount,
      minRepDurationMs: 1200 // 스쿼트 1회 최소 소요 시간 1.2초 보장
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

    counterRef.current = squatCounter;

    return () => {
      squatCounter.stop();
    };
  }, [targetCount]);

  // Motion event router
  useEffect(() => {
    if (!permissionGranted || !isActive || !counterRef.current) return;

    const handleMotionEvent = (event: DeviceMotionEvent) => {
      const accel = event.accelerationIncludingGravity || { x: 0, y: 0, z: 0 };
      const linear = event.acceleration || { x: null, y: null, z: null };
      const gyro = event.rotationRate || { alpha: null, beta: null, gamma: null };

      const sample: MotionSample = {
        timestamp: Date.now(),
        accelX: accel.x || 0,
        accelY: accel.y || 0,
        accelZ: accel.z || 0,
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
  };

  const handleReset = () => {
    if (counterRef.current) {
      counterRef.current.reset();
    }
    setCount(0);
    setCurrentState('idle');
    setIsCompleted(false);
    setIsActive(false);
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
        <h1>POCKET MOTION</h1>
        <p>주머니 속 센서 기반 스쿼트 카운터</p>
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
                    onChange={(e) => setTargetCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="input-field-giant"
                  />
                  <span style={{ fontSize: '2rem', fontWeight: '800', color: '#64748b' }}>회</span>
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
                <span>우측 앞바지 주머니에 스마트폰을 고정하세요.</span>
              </div>

              {/* State Badge */}
              <div className={getStatusClass(currentState)}>
                {getStatusText(currentState)}
              </div>

              {/* Big Count Screen */}
              <div className={`counter-display ${bump ? 'bump' : ''}`}>
                {count}
              </div>

              <div style={{ fontSize: '0.95rem', color: '#64748b', marginBottom: '2rem' }}>
                목표 회수: <strong style={{ color: '#fff' }}>{targetCount}</strong> 회
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
                스쿼트 <strong>{targetCount}회</strong> 목표를 성공적으로 완료했습니다!
              </p>
              <div style={{ width: '100%', maxWidth: '280px' }}>
                <button className="btn-main start" onClick={handleReset}>
                  <Trophy size={18} />
                  새로운 세트 시작
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <footer style={{ textAlign: 'center', fontSize: '0.75rem', color: '#475569', marginTop: 'auto', paddingTop: '2rem' }}>
        Pocket Motion Counter Demo v1.0.0
      </footer>
    </div>
  );
}
