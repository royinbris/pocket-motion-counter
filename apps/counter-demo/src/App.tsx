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

  // Sound feedback helper using Web Audio API
  const triggerAudioFeedback = (freq: number = 880, duration: number = 0.2) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = freq;

      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('오디오 피드백 실패 (브라우저 정책에 의해 제약될 수 있음):', e);
    }
  };

  // Vibration feedback helper (Android support)
  const triggerVibration = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  };

  // Request sensor permission
  const handleRequestPermission = async () => {
    // Also resume Web Audio context to satisfy safari requirements
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const dummyCtx = new AudioCtx();
      if (dummyCtx.state === 'suspended') {
        dummyCtx.resume();
      }
    }

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

      // Sound/Vibrate feedback on each successful count
      triggerAudioFeedback(880, 0.15); // Normal High pitch beep
      triggerVibration(150); // 150ms vibration
    });

    squatCounter.onStateChange((state) => {
      setCurrentState(state);
      // Soft feedback on posture state changes
      if (state === 'valley') {
        // Deep squat bottom reached: play a soft low pitch indicator
        triggerAudioFeedback(440, 0.08);
      }
    });

    squatCounter.onComplete(() => {
      setIsCompleted(true);
      setIsActive(false);
      // Grand celebration sound and vibration pattern
      triggerAudioFeedback(1200, 0.4);
      setTimeout(() => triggerAudioFeedback(1500, 0.5), 150);
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
    setIsCompleted(false);
    setCount(0);
    counterRef.current.start();
    setIsActive(true);
    triggerAudioFeedback(660, 0.2); // Start beep
  };

  const handleStopWorkout = () => {
    if (!counterRef.current) return;
    counterRef.current.stop();
    setIsActive(false);
    triggerAudioFeedback(330, 0.2); // Stop beep
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
            <div className="dashboard-card" style={{ marginBottom: '1.5rem', alignItems: 'stretch' }}>
              <div className="input-group">
                <label>목표 운동 세트 설정 (회)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={targetCount}
                  onChange={(e) => setTargetCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="input-field"
                />
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
