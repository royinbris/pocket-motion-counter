import { useState, useEffect, useRef } from 'react';
import { Activity, ShieldCheck, Download, Trash2, StopCircle, Play, Smartphone } from 'lucide-react';
import { MotionSample, SessionData } from '@pocket-motion/types';

export default function App() {
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [samples, setSamples] = useState<MotionSample[]>([]);
  const [currentSample, setCurrentSample] = useState<MotionSample | null>(null);
  const [actualCount, setActualCount] = useState(10);
  const [exerciseType, setExerciseType] = useState('squat');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const samplesRef = useRef<MotionSample[]>([]);
  const animationFrameId = useRef<number | null>(null);

  // Synchronize samples state with ref for canvas access
  useEffect(() => {
    samplesRef.current = samples;
  }, [samples]);

  // Request sensor permission
  const handleRequestPermission = async () => {
    if (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof (DeviceMotionEvent as any).requestPermission === 'function'
    ) {
      try {
        const state = await (DeviceMotionEvent as any).requestPermission();
        setPermissionGranted(state === 'granted');
      } catch (err) {
        console.error('센서 권한 획득 오류:', err);
        setPermissionGranted(false);
      }
    } else {
      // standard android or desktop
      setPermissionGranted(true);
    }
  };

  // Check initial availability
  useEffect(() => {
    if (typeof DeviceMotionEvent === 'undefined') {
      setPermissionGranted(false);
      return;
    }
    // iOS require explicit trigger, so we default to null (show request button)
    if (typeof (DeviceMotionEvent as any).requestPermission !== 'function') {
      setPermissionGranted(true); // normal browser usually allow directly
    }
  }, []);

  // Listen to motion events
  useEffect(() => {
    if (!permissionGranted) return;

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

      setCurrentSample(sample);

      if (isRecording) {
        setSamples((prev) => [...prev, sample]);
      }
    };

    window.addEventListener('devicemotion', handleMotionEvent);
    return () => {
      window.removeEventListener('devicemotion', handleMotionEvent);
    };
  }, [permissionGranted, isRecording]);

  // Render Canvas Graph (Magnitude over time)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.height; i += 30) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }

      const activeSamples = samplesRef.current;
      if (activeSamples.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '14px Inter';
        ctx.fillText('녹화 시작 버튼을 누르면 신호 파형이 여기에 기록됩니다.', 20, canvas.height / 2);
        animationFrameId.current = requestAnimationFrame(draw);
        return;
      }

      // Show last 100 samples
      const sliceCount = 150;
      const displaySamples = activeSamples.slice(-sliceCount);

      ctx.beginPath();
      ctx.strokeStyle = '#00f2fe'; // cyan
      ctx.lineWidth = 2.5;

      displaySamples.forEach((sample, index) => {
        // Compute magnitude
        const mag = Math.sqrt(
          sample.accelX * sample.accelX +
          sample.accelY * sample.accelY +
          sample.accelZ * sample.accelZ
        );

        // Map magnitude (range approx 0 ~ 25) to canvas height (200)
        // Normal gravity 9.8 should sit near the center (100)
        const x = (index / (sliceCount - 1)) * canvas.width;
        const y = canvas.height - (mag / 22) * canvas.height;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw a line representing Gravity (9.8 m/s^2)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 208, 0, 0.3)'; // faded gold
      ctx.setLineDash([5, 5]);
      const gravityY = canvas.height - (9.80665 / 22) * canvas.height;
      ctx.moveTo(0, gravityY);
      ctx.lineTo(canvas.width, gravityY);
      ctx.stroke();
      ctx.setLineDash([]); // reset

      animationFrameId.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  const handleToggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
    } else {
      setSamples([]);
      setIsRecording(true);
    }
  };

  const handleExportData = () => {
    if (samples.length === 0) return;

    const session: SessionData = {
      sessionId: `session-${Math.random().toString(36).substr(2, 9)}`,
      exerciseType,
      actualCount,
      pocketLocation: 'right-front',
      recordedAt: new Date().toISOString(),
      samples,
    };

    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pocket-motion-${exerciseType}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper for computing magnitude of current sample
  const currentMag = currentSample
    ? Math.sqrt(
        currentSample.accelX * currentSample.accelX +
        currentSample.accelY * currentSample.accelY +
        currentSample.accelZ * currentSample.accelZ
      )
    : 0;

  return (
    <div className="app-container">
      <header>
        <h1>POCKET MOTION LAB</h1>
        <p>센서 가속도 데이터 수집 및 엔지니어링 실험 도구</p>
      </header>

      {/* 1. Permission status */}
      <div className="card">
        <h2 className="card-title">
          <ShieldCheck size={20} color="#00f2fe" />
          모바일 센서 접근 권한
        </h2>
        {permissionGranted === null && (
          <div>
            <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1rem' }}>
              모바일 기기의 가속도계 및 자이로스코프 데이터를 수집하기 위해 권한 허용이 필요합니다.
            </p>
            <button className="btn btn-primary" onClick={handleRequestPermission}>
              센서 권한 활성화
            </button>
          </div>
        )}
        {permissionGranted === true && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#00f2a1' }}>
            <Activity size={18} className="pulse" />
            <span style={{ fontWeight: 600 }}>센서 데이터 스트림 연결 성공 (정상 작동 중)</span>
          </div>
        )}
        {permissionGranted === false && (
          <div style={{ color: '#ff4a6b', fontSize: '0.9rem' }}>
            센서 정보를 가져올 수 없습니다. 안전한 웹 콘텍스트(HTTPS) 환경이거나 모바일 실기기인지 확인하십시오.
          </div>
        )}
      </div>

      {permissionGranted === true && (
        <>
          {/* 2. Realtime Data Display */}
          <div className="card">
            <h2 className="card-title">
              <Smartphone size={20} color="#00f2fe" />
              실시간 센서 모니터
            </h2>
            <div className="grid-2" style={{ marginBottom: '1rem' }}>
              <div className="data-item">
                <span className="data-label">가속도 크기 (Magnitude)</span>
                <span className="data-value" style={{ color: '#00f2fe' }}>
                  {currentMag.toFixed(3)} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>m/s²</span>
                </span>
              </div>
              <div className="data-item">
                <span className="data-label">Y축 가속도 (Vertical)</span>
                <span className="data-value">
                  {currentSample ? currentSample.accelY.toFixed(3) : '0.000'}
                </span>
              </div>
            </div>
            <div className="grid-2">
              <div className="data-item">
                <span className="data-label">X축 가속도</span>
                <span className="data-value">
                  {currentSample ? currentSample.accelX.toFixed(3) : '0.000'}
                </span>
              </div>
              <div className="data-item">
                <span className="data-label">Z축 가속도</span>
                <span className="data-value">
                  {currentSample ? currentSample.accelZ.toFixed(3) : '0.000'}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Recording Dashboard */}
          <div className="card">
            <h2 className="card-title">
              <Activity size={20} color={isRecording ? '#ff4a6b' : '#00f2a1'} />
              모션 로그 캡처
            </h2>

            <div style={{ marginBottom: '1.25rem' }}>
              <button
                className={`btn ${isRecording ? 'btn-danger' : 'btn-success'}`}
                onClick={handleToggleRecording}
              >
                {isRecording ? (
                  <>
                    <StopCircle size={18} />
                    수집 일시정지 (현재 {samples.length}개 누적)
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    신규 세션 레코딩 시작
                  </>
                )}
              </button>
            </div>

            <div className="graph-container">
              <canvas
                ref={canvasRef}
                width={500}
                height={200}
                style={{ width: '100%', height: '100%', display: 'block' }}
              />
            </div>
          </div>

          {/* 4. Session Meta Form and Export */}
          {samples.length > 0 && !isRecording && (
            <div className="card" style={{ border: '1px solid rgba(0, 242, 161, 0.2)' }}>
              <h2 className="card-title" style={{ color: '#00f2a1' }}>
                <Download size={20} />
                세션 데이터 저장 및 내보내기
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                    운동 종류
                  </label>
                  <select
                    value={exerciseType}
                    onChange={(e) => setExerciseType(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#161a22',
                      border: '1px solid var(--border-color)',
                      padding: '0.6rem',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                  >
                    <option value="squat">스쿼트 (Squat)</option>
                    <option value="test">단순 제자리 대기 / 걷기 노이즈</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                    실제 완료한 스쿼트 횟수 (유저 수동 기입)
                  </label>
                  <input
                    type="number"
                    value={actualCount}
                    onChange={(e) => setActualCount(parseInt(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      background: '#161a22',
                      border: '1px solid var(--border-color)',
                      padding: '0.6rem',
                      borderRadius: '8px',
                      color: '#fff',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div className="grid-2">
                <button className="btn btn-primary" onClick={handleExportData}>
                  <Download size={18} />
                  JSON 다운로드
                </button>
                <button
                  className="btn"
                  onClick={() => setSamples([])}
                  style={{ color: '#ff4a6b', borderColor: 'rgba(255, 74, 107, 0.2)' }}
                >
                  <Trash2 size={18} />
                  로그 초기화
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <footer style={{ textAlign: 'center', fontSize: '0.75rem', color: '#475569', marginTop: '2rem' }}>
        Pocket Motion Counter R&D Version 1.0.0
      </footer>
    </div>
  );
}
