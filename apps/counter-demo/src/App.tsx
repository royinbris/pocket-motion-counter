import { useState, useEffect, useRef } from 'react';
import { Play, Square, RefreshCw, Trophy, ShieldAlert, Award, Smartphone, ChevronDown, ChevronUp, Music, Flame, Clock, X, Volume2, VolumeX } from 'lucide-react';
import { SquatCounter, DanceTracker, DanceMetrics } from '@pocket-motion/core';
import { MotionSample, CounterState, WorkoutRecord } from '@pocket-motion/types';

// Vite define 매크로를 통한 글로벌 컴파일 타임 상수
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

export default function App() {
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [count, setCount] = useState(0);
  const [currentState, setCurrentState] = useState<CounterState>('idle');
  const [targetCount, setTargetCount] = useState<number | "">(10);
  const [sensitivity, setSensitivity] = useState<number>(5);
  const [isCompleted, setIsCompleted] = useState(false);
  // ballOffset은 초당 60회 이상 변경되므로 성능(UI 먹통 현상)을 위해 React state 대신 직접 DOM(ref)을 제어
  const ballRef = useRef<HTMLDivElement>(null);
  const [isReloading, setIsReloading] = useState(false);
  const [workoutType, setWorkoutType] = useState<'squat' | 'pushup' | 'walk' | 'dance'>('squat');
  const [isSoundOn, setIsSoundOn] = useState(true);

  // 마지막 감지 동작 표시 상태 (1.5초 유지)
  const [lastAction, setLastAction] = useState<string>('대기 중 🎵');
  const lastActionTimeoutRef = useRef<number | null>(null);

  // 운동 히스토리 기록 관련 상태 및 레프
  const [records, setRecords] = useState<WorkoutRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const totalAccumulatedCountRef = useRef<number>(0);
  const workoutActiveDurationMsRef = useRef<number>(0);
  const currentSegmentStartTimeRef = useRef<number | null>(null);

  const countRef = useRef(0);

  useEffect(() => {
    countRef.current = count;
  }, [count]);

  // 컴포넌트 마운트 시 LocalStorage에서 기록 읽어오기
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pocket-motion-history');
      if (stored) {
        setRecords(JSON.parse(stored));
      }
    } catch (e) {
      console.error('기록 불러오기 실패:', e);
    }
  }, []);

  // 운동 기록을 LocalStorage에 저장하는 핵심 유틸리티
  const saveWorkoutRecord = (completedSetsOverride?: number) => {
    // 순수 운동 시간 누적 반영
    let sessionDurationMs = workoutActiveDurationMsRef.current;
    if (isActive && !isResting && currentSegmentStartTimeRef.current) {
      sessionDurationMs += Date.now() - currentSegmentStartTimeRef.current;
    }

    const currentCount = countRef.current;
    const finalCompletedSets = completedSetsOverride !== undefined 
      ? completedSetsOverride 
      : (isCompleted ? totalSets : Math.max(0, currentSet - 1));
    
    // 댄스의 경우 completedSets는 무의미(0 또는 1)이므로 1로 지정
    const recordCompletedSets = workoutType === 'dance' ? 1 : finalCompletedSets;
    const recordTotalSets = workoutType === 'dance' ? 1 : totalSets;
    const recordTotalCount = workoutType === 'dance' ? 0 : (totalAccumulatedCountRef.current + (isActive && !isResting ? currentCount : 0));
    
    // 칼로리 계산
    let calculatedCalories = 0;
    if (workoutType === 'squat') {
      calculatedCalories = recordTotalCount * 0.4;
    } else if (workoutType === 'pushup') {
      calculatedCalories = recordTotalCount * 0.3;
    } else if (workoutType === 'walk') {
      calculatedCalories = recordTotalCount * 0.04;
    } else if (workoutType === 'dance') {
      calculatedCalories = danceMetricsRef.current.estimatedCalories;
    }
    calculatedCalories = Number(calculatedCalories.toFixed(2));

    // 유의미한 운동 결과만 저장 (예: 일반 운동 1회 이상 혹은 댄스 3초 이상)
    const isDance = workoutType === 'dance';
    const hasProgress = isDance ? danceMetricsRef.current.activeDurationMs > 3000 : recordTotalCount > 0;
    if (!hasProgress) return;

    const newRecord: WorkoutRecord = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      workoutType,
      workoutMode: workoutType === 'dance' ? 'dance' : (workoutMode as any),
      totalSets: recordTotalSets,
      completedSets: recordCompletedSets,
      totalCount: recordTotalCount,
      durationMs: workoutType === 'dance' ? danceMetricsRef.current.activeDurationMs : sessionDurationMs,
      calories: calculatedCalories,
      energy: workoutType === 'dance' ? danceMetricsRef.current.totalScore : 0
    };

    setRecords((prev) => {
      const updated = [newRecord, ...prev];
      try {
        localStorage.setItem('pocket-motion-history', JSON.stringify(updated));
      } catch (e) {
        console.error('LocalStorage 저장 실패:', e);
      }
      return updated;
    });

    // 기록 저장이 완료되었으므로 임시 세션 삭제
    localStorage.removeItem('pocket-motion-active-session');

    // 기록 저장이 완료되었으므로 누적 액티브 시간 초기화
    workoutActiveDurationMsRef.current = 0;
    if (isActive && !isResting) {
      currentSegmentStartTimeRef.current = Date.now();
    } else {
      currentSegmentStartTimeRef.current = null;
    }
  };

  // 다중 세트 및 시간 기반 루틴 관련 신규 상태
  const [workoutMode, setWorkoutMode] = useState<'rep' | 'time'>('rep');
  const [totalSets, setTotalSets] = useState<number>(3);
  const [currentSet, setCurrentSet] = useState<number>(1);
  const [restDuration, setRestDuration] = useState<number>(15);
  const [workDuration, setWorkDuration] = useState<number | "">(30);
  const [isResting, setIsResting] = useState<boolean>(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  // Dance tracker metrics state
  const [danceMetrics, setDanceMetrics] = useState<DanceMetrics>({
    activeDurationMs: 0,
    totalEnergy: 0,
    estimatedCalories: 0,
    totalScore: 0,
    intensity: 0,
    isActive: false
  });

  const danceMetricsRef = useRef(danceMetrics);
  useEffect(() => {
    danceMetricsRef.current = danceMetrics;
  }, [danceMetrics]);

  // Black Saver State
  const [showBlackSaver, setShowBlackSaver] = useState(false);

  const counterRef = useRef<SquatCounter | null>(null);
  const danceTrackerRef = useRef<DanceTracker | null>(null);
  const wakeLockSentinelRef = useRef<any | null>(null);
  const blackSaverTimerRef = useRef<number | null>(null);

  // 클로저 이슈 해결을 위한 Refs 선언
  const currentSetRef = useRef(1);
  const totalSetsRef = useRef(3);
  const workoutModeRef = useRef<'rep' | 'time'>('rep');
  const restDurationRef = useRef(15);
  const isRestingRef = useRef(false);
  const isActiveRef = useRef(false);
  const targetCountRef = useRef<number | "">(10);
  const sensitivityRef = useRef(5);

  useEffect(() => {
    currentSetRef.current = currentSet;
    totalSetsRef.current = totalSets;
    workoutModeRef.current = workoutMode;
    restDurationRef.current = restDuration;
    isRestingRef.current = isResting;
    isActiveRef.current = isActive;
    targetCountRef.current = targetCount;
    sensitivityRef.current = sensitivity;
  });

  // 센서 권한이 허용된 이후에 안전하게 세션 복구 수행
  useEffect(() => {
    if (permissionGranted === true && hasSavedSession) {
      const savedSession = localStorage.getItem('pocket-motion-active-session');
      if (savedSession) {
        try {
          const session = JSON.parse(savedSession);
          const recover = window.confirm("진행 중이던 운동 기록이 있습니다. 이어서 진행하시겠습니까?");
          if (recover) {
            setWorkoutType(session.workoutType);
            setWorkoutMode(session.workoutMode);
            setCurrentSet(session.currentSet);
            setCount(session.count);
            totalAccumulatedCountRef.current = session.totalAccumulatedCount;
            workoutActiveDurationMsRef.current = session.workoutActiveDurationMs;
            setIsResting(session.isResting);
            setTimeRemaining(session.timeRemaining);
            setTargetCount(session.targetCount);
            setTotalSets(session.totalSets);
            setWorkDuration(session.workDuration);
            setRestDuration(session.restDuration);
            if (session.danceMetrics) {
              setDanceMetrics(session.danceMetrics);
            }
            
            // 즉시 운동 활성화
            setIsActive(true);
          } else {
            localStorage.removeItem('pocket-motion-active-session');
          }
        } catch (e) {
          console.error('진행 중 세션 복구 실패:', e);
          localStorage.removeItem('pocket-motion-active-session');
        }
      }
      setHasSavedSession(false); // 팝업 1회만 실행하도록 초기화
    }
  }, [permissionGranted, hasSavedSession]);

  // 운동 진행 중 새로고침/탭 닫기 방지 경고
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isActive && !isCompleted) {
        e.preventDefault();
        e.returnValue = '운동이 진행 중입니다. 페이지를 벗어나면 진행 중인 기록이 유실될 수 있습니다.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isActive, isCompleted]);

  // 진행 중인 운동 상태를 로컬스토리지에 임시 저장 (새로고침 대응)
  useEffect(() => {
    if (isActive && !isCompleted) {
      const sessionData = {
        workoutType,
        workoutMode,
        currentSet,
        count,
        totalAccumulatedCount: totalAccumulatedCountRef.current,
        workoutActiveDurationMs: workoutActiveDurationMsRef.current,
        isResting,
        timeRemaining,
        targetCount,
        totalSets,
        workDuration,
        restDuration,
        danceMetrics
      };
      localStorage.setItem('pocket-motion-active-session', JSON.stringify(sessionData));
    } else if (isCompleted) {
      // 완료 시 임시 세션 삭제
      localStorage.removeItem('pocket-motion-active-session');
    }
  }, [
    isActive,
    isCompleted,
    workoutType,
    workoutMode,
    currentSet,
    count,
    isResting,
    timeRemaining,
    targetCount,
    totalSets,
    workDuration,
    restDuration,
    danceMetrics
  ]);

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

  // 4. 휴식 만료 3초 전 준비 비프 (짧은 삑 소리)
  const playCountdownTick = () => {
    if (!isSoundOn) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 523.25; // C5 (도)

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  };

  // 1. 운동 시작 차임 (도-미-솔 상승음)
  const playStartChime = () => {
    if (!isSoundOn) return;
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
    if (!isSoundOn) return;
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
    if (!isSoundOn) return;
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

  // 댄스 모드 6가지 동작별 고유 사운드 재생 함수 (Web Audio API)
  
  // 1. 좌로 기울일 때: 부드러운 상승음 (C4 -> E4)
  const playLeftTiltSound = () => {
    if (!isSoundOn) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    
    osc.frequency.setValueAtTime(261.63, now); // C4
    osc.frequency.exponentialRampToValueAtTime(329.63, now + 0.15); // E4
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  };

  // 2. 우로 기울일 때: 부드러운 하강음 (C5 -> G4)
  const playRightTiltSound = () => {
    if (!isSoundOn) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(392.00, now + 0.15); // G4
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  };

  // 3. 뛸 때: 짧고 강력한 고음 스타카토 비트음 (C6, 1046.50Hz)
  const playRunSound = () => {
    if (!isSoundOn) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1046.50, now); // C6
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  };

  // 4. 걸을 때: 낮고 따뜻한 둥~ 소리 (A3, 220.00Hz)
  const playWalkSound = () => {
    if (!isSoundOn) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220.00, now); // A3
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  };

  // 5. 상 운동할 때: 높은 피치의 쑝~ 상승 스윕음 (E5 -> E6)
  const playUpMotionSound = () => {
    if (!isSoundOn) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    
    osc.frequency.setValueAtTime(659.25, now); // E5
    osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.25); // E6
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  };

  // 6. 하 운동할 때: 낮은 피치의 쓔웅~ 하강 스윕음 (E4 -> E3)
  const playDownMotionSound = () => {
    if (!isSoundOn) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    
    osc.frequency.setValueAtTime(329.63, now); // E4
    osc.frequency.exponentialRampToValueAtTime(164.81, now + 0.25); // E3
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
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

  // 댄스 모드 민감도
  const [danceSensitivity, setDanceSensitivity] = useState<number>(5);

  // 댄스 민감도 변경 시 DanceTracker에 즉시 반영
  useEffect(() => {
    if (workoutType === 'dance' && danceTrackerRef.current) {
        // 민감도 1~10: threshold 1.0 → 0.1 (높을수록 더 예민하게)
        const threshold = 1.1 - danceSensitivity * 0.1;
        danceTrackerRef.current.setMotionThreshold(threshold);
    }
  }, [danceSensitivity, workoutType]);

  // 일반 운동 민감도 변경 시 SquatCounter에 즉시 반영
  useEffect(() => {
    if (workoutType !== 'dance' && counterRef.current) {
      const isPushUp = workoutType === 'pushup';
      const isWalk = workoutType === 'walk';
      const minThreshold = isWalk ? 1.2 : (isPushUp ? 0.6 : 1.8);
      const maxThreshold = isWalk ? 0.3 : (isPushUp ? 0.12 : 0.6);
      const thresholdVal = Number((minThreshold - (sensitivity - 1) * ((minThreshold - maxThreshold) / 9)).toFixed(2));
      (counterRef.current as any).setConfig({ thresholdDown: thresholdVal, thresholdUp: thresholdVal });
    }
  }, [sensitivity, workoutType]);

  // Wake Lock 제어 함수
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        const sentinel = await (navigator as any).wakeLock.request('screen');
        wakeLockSentinelRef.current = sentinel;
        console.log('Screen Wake Lock acquired.');
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
      }
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockSentinelRef.current) {
      try {
        await wakeLockSentinelRef.current.release();
        wakeLockSentinelRef.current = null;
        console.log('Screen Wake Lock released.');
      } catch (err) {
        console.error('Wake Lock release error:', err);
      }
    }
  };

  // Black Saver 타이머 제어 함수
  const resetBlackSaverTimer = () => {
    if (blackSaverTimerRef.current) {
      window.clearTimeout(blackSaverTimerRef.current);
      blackSaverTimerRef.current = null;
    }
    // 사용자의 요청에 따라 자동 실행 기능 비활성화 (수동으로만 작동)
  };

  const clearBlackSaverTimer = () => {
    if (blackSaverTimerRef.current) {
      window.clearTimeout(blackSaverTimerRef.current);
      blackSaverTimerRef.current = null;
    }
  };

  // 탭 활성/비활성 상태 변화에 따른 Wake Lock 관리
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isActive) {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive]);

  // 사용자 무터치 타이머 관리 (휴식 상태 변화 대응)
  useEffect(() => {
    if (isActive && !isResting) {
      resetBlackSaverTimer();
    } else {
      clearBlackSaverTimer();
      setShowBlackSaver(false);
    }
    return () => clearBlackSaverTimer();
  }, [isActive, isResting]);

  // 전역 터치/마우스 이벤트 감지로 타이머 리셋 및 오디오 컨텍스트 강제 해제
  useEffect(() => {
    const handleUserActivity = () => {
      resetBlackSaverTimer();
      // 모바일 웹 오디오 자동 재생 차단 해제 보완 로직
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(console.error);
      }
    };
    window.addEventListener('touchstart', handleUserActivity, { passive: true });
    window.addEventListener('mousedown', handleUserActivity, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('mousedown', handleUserActivity);
    };
  }, [isActive, isResting]);

  // 컴포넌트 언마운트 시 리소스 정리
  useEffect(() => {
    return () => {
      if (wakeLockSentinelRef.current) {
        wakeLockSentinelRef.current.release().catch(console.error);
      }
      clearBlackSaverTimer();
    };
  }, []);

  // 1초마다 남은 시간 차감 타이머
  useEffect(() => {
    if (!isActive) return;

    // 시간 타이머가 작동해야 하는 상황:
    // 1) 휴식 상태인 경우 (isResting)
    // 2) 휴식이 아니면서 시간 기반 모드인 경우 (workoutMode === 'time' && workoutType !== 'dance')
    const shouldRunTimer = isResting || (workoutMode === 'time' && workoutType !== 'dance');
    if (!shouldRunTimer) return;

    const timer = window.setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isActive, isResting, workoutMode, workoutType]);

  // 남은 시간 변화(timeRemaining)에 따른 상태 전이 및 알림음 재생 부수 효과
  useEffect(() => {
    if (!isActive) return;

    // 휴식 중이고 3초 이하로 남았을 때 카운트다운 비프음 재생
    if (isResting && timeRemaining > 0 && timeRemaining <= 3) {
      playCountdownTick();
    }

    // 시간이 0이 되었을 때 상태 전이 처리
    if (timeRemaining === 0) {
      if (isResting) {
        // 휴식 만료 -> 다음 세트 개시
        setIsResting(false);
        const nextSet = currentSet + 1;
        setCurrentSet(nextSet);
        setCount(0);
        
        playStartChime();
        
        if (workoutType !== 'dance') {
          if (workoutMode === 'time') {
            setTimeRemaining(Number(workDuration) || 30);
          }
          counterRef.current?.reset();
          counterRef.current?.start();
        }
        currentSegmentStartTimeRef.current = Date.now();
        resetBlackSaverTimer();
      } else {
        // 운동 중 시간 만료 -> 세트 완료 처리
        if (workoutMode === 'time' && workoutType !== 'dance') {
          handleSetCompleted();
        }
      }
    }
  }, [timeRemaining, isActive, isResting, currentSet, workoutMode, workDuration, workoutType]);

  // 세트 완료 처리 공통 함수
  const handleSetCompleted = () => {
    // 센서 일시 정지
    if (workoutType !== 'dance') {
      counterRef.current?.stop();
    }

    // 세그먼트 시간 누적
    if (currentSegmentStartTimeRef.current) {
      workoutActiveDurationMsRef.current += Date.now() - currentSegmentStartTimeRef.current;
      currentSegmentStartTimeRef.current = null;
    }
    
    // 현재 세트의 횟수를 누적 카운트에 더함
    totalAccumulatedCountRef.current += countRef.current;
    
    const curSet = currentSetRef.current;
    const totSets = totalSetsRef.current;
    
    if (curSet < totSets) {
      // 다음 세트가 있음 -> 휴식 진입
      setIsResting(true);
      setTimeRemaining(restDurationRef.current);
      playRepCompleteChime(); // 중간 세트 완료음
      triggerVibration([100, 50, 100]);
      
      // 휴식 중에는 블랙 세이버 해제
      clearBlackSaverTimer();
      setShowBlackSaver(false);
    } else {
      // 최종 세트 완료
      setIsCompleted(true);
      setIsActive(false);
      releaseWakeLock(); // 화면 꺼짐 해제
      playSetCompleteFanfare(); // 팡파르
      triggerVibration([100, 50, 100, 50, 200]);

      // 최종 기록 저장
      saveWorkoutRecord(totSets);
    }
  };

  // 휴식 건너뛰기 처리 함수
  const handleSkipRest = () => {
    setIsResting(false);
    const nextSet = currentSet + 1;
    setCurrentSet(nextSet);
    setCount(0);
    
    playStartChime();
    
    if (workoutType !== 'dance') {
      if (workoutMode === 'time') {
        setTimeRemaining(Number(workDuration) || 30);
      }
      counterRef.current?.reset();
      counterRef.current?.start();
    }
    currentSegmentStartTimeRef.current = Date.now();
    resetBlackSaverTimer();
  };

  // 수정된 댄스 감지 관련 useEffect
  useEffect(() => {
    if (workoutType === 'dance') {
        const tracker = new DanceTracker();
        tracker.onUpdate((metrics) => {
            setDanceMetrics(metrics);
            // 3분 무동작 일시정지 처리
            if (!metrics.isActive && isActiveRef.current) {
                handleStopWorkout();
                alert("3분 동안 움직임이 없어 운동이 일시정지되었습니다.");
            }

            // 실시간 동작 감지 효과음 및 화면 텍스트 연동
            if (metrics.detectedAction) {
                let actionText = '';
                switch (metrics.detectedAction) {
                    case 'left_tilt':
                        actionText = '좌로 기울임 ↩️';
                        playLeftTiltSound();
                        break;
                    case 'right_tilt':
                        actionText = '우로 기울임 ↪️';
                        playRightTiltSound();
                        break;
                    case 'run':
                        actionText = '뛰기 ⚡';
                        playRunSound();
                        break;
                    case 'walk':
                        actionText = '걷기 🚶';
                        playWalkSound();
                        break;
                    case 'up_motion':
                        actionText = '상 운동 🔼';
                        playUpMotionSound();
                        break;
                    case 'down_motion':
                        actionText = '하 운동 🔽';
                        break;
                }
                if (metrics.detectedAction === 'down_motion') {
                    // down_motion의 경우 block scope 밖에서 함수 호출할 수 있어 직접 호출 또는 안전하게 처리
                    playDownMotionSound();
                }

                if (actionText) {
                    setLastAction(actionText);
                    if (lastActionTimeoutRef.current) {
                        window.clearTimeout(lastActionTimeoutRef.current);
                    }
                    lastActionTimeoutRef.current = window.setTimeout(() => {
                        setLastAction('대기 중 🎵');
                    }, 1500);
                }
            }
        });
        danceTrackerRef.current = tracker;
        if (isActiveRef.current) tracker.start();

        return () => {
            tracker.stop();
            danceTrackerRef.current = null;
            if (lastActionTimeoutRef.current) {
                window.clearTimeout(lastActionTimeoutRef.current);
            }
        };
    } else {
        // 기존 스쿼트/푸시업/걷기 로직
        const isPushUp = workoutType === 'pushup';
        const isWalk = workoutType === 'walk';
        const minThreshold = isWalk ? 1.2 : (isPushUp ? 0.6 : 1.2); // 스쿼트 최저 민감도 낮춤 (1.8 -> 1.2)
        const maxThreshold = isWalk ? 0.3 : (isPushUp ? 0.12 : 0.2); // 스쿼트 최고 민감도 대폭 낮춤 (0.6 -> 0.2)
        const thresholdVal = Number((minThreshold - (sensitivityRef.current - 1) * ((minThreshold - maxThreshold) / 9)).toFixed(2));
        
        const squatCounter = new SquatCounter({
          targetCount: 9999,
          thresholdDown: thresholdVal,
          thresholdUp: thresholdVal,
          minRepDurationMs: isWalk ? 300 : (isPushUp ? 800 : 400), // 더 관대하게 400ms로 단축
          lpfAlpha: isWalk ? 0.25 : (isPushUp ? 0.25 : 0.35) // 필터 반응성을 높임 (0.15 -> 0.35)
        });

        squatCounter.onCount((newCount) => {
          setCount(newCount);
          setBump(true);
          setTimeout(() => setBump(false), 200);

          playRepCompleteChime();
          triggerVibration(180);

          if (workoutType === 'walk' && newCount % 10 === 0 && newCount > 0) {
            setTimeout(() => {
              playStartChime();
            }, 250);
          }

          if (workoutModeRef.current === 'rep') {
            const target = targetCountRef.current === "" ? 10 : targetCountRef.current;
            if (newCount >= target) {
              setTimeout(() => {
                handleSetCompleted();
              }, 100);
            }
          }
        });

        squatCounter.onStateChange((state) => {
          setCurrentState(state);
        });

        counterRef.current = squatCounter;
        if (isActiveRef.current) squatCounter.start();

        return () => {
          squatCounter.stop();
          counterRef.current = null;
        };
    }
  }, [workoutType]);

  // Motion event router
  useEffect(() => {
    if (!permissionGranted || !isActive || isResting) {
      if (ballRef.current) {
        ballRef.current.style.transform = `translate3d(0px, 0px, 0)`;
      }
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
      
      const rawX = -linearX * 25;
      const rawY = linearY * 25;
      const distance = Math.sqrt(rawX * rawX + rawY * rawY);
      const maxRadius = 28; // 원의 내측 한계 기하 반경 (반지름 36px - 구슬 반지름 8px)

      let targetX = rawX;
      let targetY = rawY;

      if (distance > maxRadius) {
        targetX = rawX * (maxRadius / distance);
        targetY = rawY * (maxRadius / distance);
      }

      if (ballRef.current) {
        ballRef.current.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
      }

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

      const isDance = workoutType === 'dance';
      if (isDance) {
        if (danceTrackerRef.current) {
          danceTrackerRef.current.feed(sample);
        }
      } else {
        if (counterRef.current) {
          counterRef.current.feed(sample);
        }
      }
    };

    window.addEventListener('devicemotion', handleMotionEvent);
    return () => {
      window.removeEventListener('devicemotion', handleMotionEvent);
      if (ballRef.current) {
        ballRef.current.style.transform = `translate3d(0px, 0px, 0)`;
      }
    };
  }, [permissionGranted, isActive, workoutType, isResting]);

  const handleStartWorkout = async () => {
    const isDance = workoutType === 'dance';
    if (isDance) {
      if (!danceTrackerRef.current) return;
      danceTrackerRef.current.start();
    } else {
      if (!counterRef.current) return;
      // 완전히 새로 운동을 시작하는 시나리오인 경우 상태 초기화
      if (!isActive && !isResting && !isCompleted && count === 0 && currentSet === 1) {
        setCurrentSet(1);
        setIsResting(false);
        if (workoutMode === 'time') {
          setTimeRemaining(Number(workDuration) || 30);
        }
        totalAccumulatedCountRef.current = 0;
        workoutActiveDurationMsRef.current = 0;
      }
      counterRef.current.start();
    }
    
    currentSegmentStartTimeRef.current = Date.now();
    
    // 오디오 컨텍스트 사전 활성화
    getOrCreateAudioContext();

    setIsCompleted(false);
    setIsActive(true);
    playStartChime(); // Start chime sound
    await requestWakeLock(); // 화면 꺼짐 방지 활성화
  };

  const handleStopWorkout = async () => {
    if (workoutType === 'dance') {
      danceTrackerRef.current?.stop();
      setLastAction('대기 중 🎵');
      if (lastActionTimeoutRef.current) {
        window.clearTimeout(lastActionTimeoutRef.current);
      }
    } else {
      counterRef.current?.stop();
    }

    if (currentSegmentStartTimeRef.current) {
      workoutActiveDurationMsRef.current += Date.now() - currentSegmentStartTimeRef.current;
      currentSegmentStartTimeRef.current = null;
    }

    setIsActive(false);
    if (ballRef.current) ballRef.current.style.transform = `translate3d(0px, 0px, 0)`;
    await releaseWakeLock(); // 화면 꺼짐 방지 해제
  };

  const handleReset = async () => {
    if (workoutType === 'dance') {
      danceTrackerRef.current?.stop();
    } else {
      counterRef.current?.stop();
    }

    if (currentSegmentStartTimeRef.current) {
      workoutActiveDurationMsRef.current += Date.now() - currentSegmentStartTimeRef.current;
      currentSegmentStartTimeRef.current = null;
    }

    const currentCount = countRef.current;
    const totalCountSoFar = totalAccumulatedCountRef.current + currentCount;
    const isDance = workoutType === 'dance';
    const hasProgress = isDance 
      ? danceMetricsRef.current.activeDurationMs > 3000 
      : totalCountSoFar > 0;

    if (hasProgress) {
      if (window.confirm("현재까지 수행한 운동을 기록에 저장하시겠습니까?")) {
        saveWorkoutRecord();
      }
    }

    if (workoutType === 'dance') {
      danceTrackerRef.current?.reset();
      setDanceMetrics({
        activeDurationMs: 0,
        totalEnergy: 0,
        estimatedCalories: 0,
        totalScore: 0,
        intensity: 0,
        isActive: false
      });
      setLastAction('대기 중 🎵');
      if (lastActionTimeoutRef.current) {
        window.clearTimeout(lastActionTimeoutRef.current);
      }
    } else {
      counterRef.current?.reset();
    }
    setCount(0);
    setCurrentState('idle');
    setIsCompleted(false);
    setIsActive(false);
    setCurrentSet(1);
    setIsResting(false);
    setTimeRemaining(0);
    if (ballRef.current) ballRef.current.style.transform = `translate3d(0px, 0px, 0)`;
    setShowBlackSaver(false);
    totalAccumulatedCountRef.current = 0;
    workoutActiveDurationMsRef.current = 0;
    currentSegmentStartTimeRef.current = null;
    localStorage.removeItem('pocket-motion-active-session');
    await releaseWakeLock(); // 화면 꺼짐 방지 해제
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

  const handleBlurWorkDuration = () => {
    if (workDuration === "" || workDuration < 10) {
      setWorkDuration(10);
    }
  };

  // 시간 포맷팅 헬퍼 (분:초 형식)
  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // 기록 내보내기 (JSON 다운로드)
  const exportHistory = () => {
    try {
      const dataStr = JSON.stringify(records, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `pocket-motion-history-${dateStr}.json`;

      const linkElement = document.createElement('a');
      linkElement.href = url;
      linkElement.download = filename;
      linkElement.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('기록 내보내기 실패:', e);
      alert('기록 내보내기에 실패했습니다.');
    }
  };

  // 기록 전체 삭제
  const clearHistory = () => {
    if (window.confirm("정말로 모든 운동 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      localStorage.removeItem('pocket-motion-history');
      setRecords([]);
    }
  };

  // 기록 개별 삭제
  const deleteRecord = (id: string) => {
    if (window.confirm("이 기록을 삭제하시겠습니까?")) {
      const updated = records.filter(r => r.id !== id);
      setRecords(updated);
      try {
        localStorage.setItem('pocket-motion-history', JSON.stringify(updated));
      } catch (e) {
        console.error('LocalStorage 저장 실패:', e);
      }
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
      {/* 절전형 블랙 세이버 오버레이 (Pure Black, 오터치 전면 차단) */}
      {showBlackSaver && isActive && (
        <div 
          className="black-saver-overlay"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setShowBlackSaver(false);
            resetBlackSaverTimer();
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setShowBlackSaver(false);
            resetBlackSaverTimer();
          }}
        >
          <div className="black-saver-content">
            <p className="black-saver-title">🔋 배터리 절전 가동 중</p>
            <p className="black-saver-desc">화면 터치 시 해제됩니다</p>
          </div>
        </div>
      )}

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
        <p style={{ marginTop: '0.6rem' }}>
          주머니 속 센서 기반 {
            workoutType === 'squat' ? '스쿼트' :
            workoutType === 'pushup' ? '푸시업' :
            workoutType === 'walk' ? '걷기' : '댄스'
          } 카운터
        </p>
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
          {/* Workout Type Tabs Selector - 운동 중에는 숨김 처리 */}
          {!isActive && !isCompleted && <div style={{ 
            width: '100%', 
            maxWidth: '480px', 
            margin: '0 auto 1.5rem auto',
            transition: 'all 0.3s ease'
          }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.5rem',
              background: 'rgba(15, 23, 42, 0.4)', 
              backdropFilter: 'blur(8px)',
              borderRadius: '20px', 
              padding: '0.4rem', 
              border: '1px solid rgba(139, 92, 246, 0.15)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
            }}>
              {[
                { id: 'squat', label: '🦵 스쿼트' },
                { id: 'pushup', label: '💪 푸시업' },
                { id: 'walk', label: '🚶 걷기' },
                { id: 'dance', label: '🎵 댄스' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    const newType = tab.id as any;
                    setWorkoutType(newType);
                    if (newType === 'walk') {
                      setWorkoutMode('time');
                      if (workDuration === "" || workDuration < 60) setWorkDuration(10 * 60);
                    } else if (newType !== 'dance' && workoutMode === 'time' && workDuration > 300) {
                      setWorkDuration(30);
                    }
                  }}
                  disabled={isActive}
                  style={{
                    padding: '0.85rem 0.5rem',
                    border: 'none',
                    borderRadius: '16px',
                    background: workoutType === tab.id ? '#8b5cf6' : 'transparent',
                    color: workoutType === tab.id ? '#fff' : '#64748b',
                    fontSize: '0.95rem',
                    fontWeight: '700',
                    cursor: isActive ? 'not-allowed' : 'pointer',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    boxShadow: workoutType === tab.id ? '0 4px 12px rgba(139, 92, 246, 0.3)' : 'none'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>}

          {/* Settings before workout */}
          {!isActive && !isCompleted && (
            <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
              {workoutType !== 'dance' ? (
                <>
                  {/* 운동 방식 선택 (세그먼트 컨트롤) */}
                  {workoutType !== 'walk' && (
                  <div style={{
                    display: 'flex',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    padding: '0.25rem',
                    marginBottom: '1.5rem',
                    width: '100%'
                  }}>
                    {[
                      { id: 'rep', label: '🔢 횟수 기반' },
                      { id: 'time', label: '⏱️ 시간 기반' }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setWorkoutMode(mode.id as any)}
                        style={{
                          flex: 1,
                          padding: '0.6rem 0',
                          borderRadius: '9px',
                          background: workoutMode === mode.id ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                          border: workoutMode === mode.id ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid transparent',
                          color: workoutMode === mode.id ? '#c084fc' : '#64748b',
                          fontSize: '0.85rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  )}

                  {/* 세트 수 / 휴식 시간 입력판 그리드 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '1rem',
                    width: '100%',
                    marginBottom: '1.5rem',
                    textAlign: 'left'
                  }}>
                    {/* 목표 세트 수 */}
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '700', display: 'block', marginBottom: '0.4rem' }}>
                        목표 세트 수
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          min="1"
                          max="10"
                          value={totalSets}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "") setTotalSets(1);
                            else setTotalSets(Math.min(10, Math.max(1, parseInt(val, 10) || 1)));
                          }}
                          style={{
                            width: '100%',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '10px',
                            padding: '0.6rem',
                            color: '#fff',
                            fontSize: '1rem',
                            fontWeight: '700',
                            textAlign: 'center'
                          }}
                        />
                        <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '700' }}>세트</span>
                      </div>
                    </div>

                    {/* 세트 간 휴식 시간 */}
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '700', display: 'block', marginBottom: '0.4rem' }}>
                        세트 간 휴식
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          min="5"
                          max="90"
                          value={restDuration}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "") setRestDuration(5);
                            else setRestDuration(Math.min(90, Math.max(5, parseInt(val, 10) || 5)));
                          }}
                          style={{
                            width: '100%',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '10px',
                            padding: '0.6rem',
                            color: '#fff',
                            fontSize: '1rem',
                            fontWeight: '700',
                            textAlign: 'center'
                          }}
                        />
                        <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '700' }}>초</span>
                      </div>
                    </div>

                    {/* 횟수 기반일 때 세트당 목표 횟수 */}
                    {workoutMode === 'rep' && (
                      <div style={{ gridColumn: 'span 2', textAlign: 'center', marginTop: '0.5rem' }}>
                        <label style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: '700', display: 'block', marginBottom: '0.5rem' }}>
                          세트당 목표 횟수
                        </label>
                        <div style={{ 
                          position: 'relative', 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          width: '100%', 
                          maxWidth: '320px', 
                          margin: '0 auto' 
                        }}>
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
                            style={{ 
                              margin: 0, 
                              width: '100%', 
                              paddingLeft: '4rem', 
                              paddingRight: '4rem',
                              textAlign: 'center' 
                            }}
                          />
                          <div style={{ 
                            position: 'absolute', 
                            right: '1.25rem', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            pointerEvents: 'auto' 
                          }}>
                            {targetCount !== "" && (
                              <button
                                type="button"
                                onClick={() => setTargetCount("")}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.1)',
                                  border: 'none',
                                  borderRadius: '50%',
                                  width: '28px',
                                  height: '28px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  color: '#94a3b8',
                                  padding: 0,
                                }}
                                title="지우기"
                              >
                                <X size={14} />
                              </button>
                            )}
                            <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#64748b', userSelect: 'none' }}>회</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 시간 기반일 때 세트당 운동 시간 */}
                    {workoutMode === 'time' && (
                      <div style={{ gridColumn: 'span 2', textAlign: 'center', marginTop: '0.5rem' }}>
                        <label style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: '700', display: 'block', marginBottom: '0.5rem' }}>
                          {workoutType === 'walk' ? '걷기 목표 시간' : '세트당 운동 시간'}
                        </label>
                        <div style={{ 
                          position: 'relative', 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          width: '100%', 
                          maxWidth: '320px', 
                          margin: '0 auto' 
                        }}>
                          <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min="10"
                            max="86400"
                            value={workoutType === 'walk' ? (workDuration === "" ? "" : (workDuration as number) / 60) : workDuration}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "") {
                                setWorkDuration("");
                              } else {
                                const parsed = parseInt(val, 10);
                                if (!isNaN(parsed)) {
                                  if (workoutType === 'walk') {
                                    setWorkDuration(Math.min(1440 * 60, Math.max(1 * 60, parsed * 60)));
                                  } else {
                                    setWorkDuration(Math.min(86400, Math.max(1, parsed)));
                                  }
                                }
                              }
                            }}
                            onBlur={handleBlurWorkDuration}
                            className="input-field-giant"
                            style={{ 
                              margin: 0, 
                              width: '100%', 
                              paddingLeft: '4rem', 
                              paddingRight: '4rem',
                              textAlign: 'center' 
                            }}
                          />
                          <div style={{ 
                            position: 'absolute', 
                            right: '1.25rem', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            pointerEvents: 'auto' 
                          }}>
                            {workDuration !== "" && (
                              <button
                                type="button"
                                onClick={() => setWorkDuration("")}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.1)',
                                  border: 'none',
                                  borderRadius: '50%',
                                  width: '28px',
                                  height: '28px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  color: '#94a3b8',
                                  padding: 0,
                                }}
                                title="지우기"
                              >
                                <X size={14} />
                              </button>
                            )}
                            <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#64748b', userSelect: 'none' }}>{workoutType === 'walk' ? '분' : '초'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                  {/* 기존 스쿼트/푸시업/걷기 민감도 설정은 유지 */}
                  <div style={{ gridColumn: 'span 2', marginTop: '0.8rem', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '0.8rem' }}>
                    <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '700', display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span>🏃 운동 민감도</span>
                      <span style={{ color: '#c084fc' }}>{sensitivity} / 10</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={sensitivity}
                      onChange={(e) => setSensitivity(parseInt(e.target.value, 10))}
                      className="sensitivity-slider"
                      style={{ margin: '0.25rem 0' }}
                    />
                  </div>

                  </div>
                </>
              ) : (
                <div className="input-group" style={{ textAlign: 'center', margin: '0.25rem 0' }}>
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: '1.6', margin: '0 0 1rem 0' }}>
                    🎵 댄스 모드는 주머니에 스마트폰을 넣고 자유롭게 리듬을 타며 춤을 추는 모드입니다.<br />
                    세트나 횟수 제한 없이 소모 칼로리와 춤 시간을 측정합니다.
                  </p>
                  {/* 댄스 모드 설정 (민감도) */}
                  <div style={{ marginTop: '0.8rem', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '0.8rem', textAlign: 'left' }}>
                    <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '700', display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span>🎵 댄스 민감도</span>
                      <span style={{ color: '#c084fc' }}>{danceSensitivity} / 10</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={danceSensitivity}
                      onChange={(e) => setDanceSensitivity(parseInt(e.target.value, 10))}
                      className="sensitivity-slider"
                      style={{ margin: '0.25rem 0' }}
                    />
                  </div>
                </div>
              )}

              {/* 운동 시작하기 버튼 */}
              <div style={{ marginTop: '1.2rem', width: '100%' }}>
                <button className="btn-main start" onClick={handleStartWorkout}>
                  <Play size={18} />
                  운동 시작하기
                </button>
              </div>
            </div>
          )}

          {/* Active Workout Board */}
          {(isActive || isCompleted) && (
            <div className={`dashboard-card ${isActive ? 'active' : ''}`} style={{ marginBottom: '0.6rem' }}>
              {/* 현재 운동 종목 표시 (상단 고정) */}
              <div style={{
                textAlign: 'center',
                marginBottom: '1.2rem',
                paddingBottom: '0.8rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '2rem', // 훨씬 크게 변경
                fontWeight: '900', // 더 굵게
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textShadow: '0 2px 10px rgba(0,0,0,0.3)', // 글씨가 더 잘 보이도록 그림자 추가
                letterSpacing: '-0.5px'
              }}>
                {workoutType === 'squat' && '🦵 스쿼트'}
                {workoutType === 'pushup' && '💪 푸시업'}
                {workoutType === 'walk' && '🚶 걷기'}
                {workoutType === 'dance' && '🎵 자유 댄스'}
              </div>

              {isResting ? (
                /* 휴식 중 화면 */
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  width: '100%'
                }}>
                  <div className="rest-timer-circle">
                    <span className="rest-timer-val">{timeRemaining}</span>
                    <span className="rest-timer-unit">초</span>
                  </div>
                  <h3 style={{ margin: '1.5rem 0 0.5rem 0', color: '#c084fc', fontSize: '1.25rem', fontWeight: '800' }}>🔋 세트 간 휴식 중</h3>
                  <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '2rem' }}>
                    다음은 {currentSet + 1}세트가 시작됩니다. 잠시 몸을 편안히 하세요.
                  </p>
                  <button 
                    className="btn-main start" 
                    onClick={handleSkipRest}
                    style={{
                      background: 'rgba(139, 92, 246, 0.15)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      color: '#c084fc',
                      maxWidth: '180px',
                      padding: '0.75rem 1rem',
                      fontSize: '0.9rem'
                    }}
                  >
                    휴식 건너뛰기 ➡️
                  </button>
                </div>
              ) : (
                /* 운동 중 화면 */
                <>
                  {/* 세트 진행 현황 표시 */}
                  {workoutType !== 'dance' && (
                    <div style={{
                       display: 'flex',
                       justifyContent: 'space-between',
                       alignItems: 'center',
                       width: '100%',
                       marginBottom: '0.6rem',
                       background: 'rgba(255,255,255,0.02)',
                       border: '1px solid rgba(255,255,255,0.05)',
                       padding: '0.5rem 0.75rem',
                       borderRadius: '10px'
                    }}>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '700' }}>
                        🏋️ 진행 세트: <strong style={{ color: '#fff' }}>{currentSet} / {totalSets}</strong> 세트
                      </span>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        color: workoutMode === 'time' ? '#38bdf8' : '#c084fc', 
                        fontWeight: '800',
                        background: workoutMode === 'time' ? 'rgba(56, 189, 248, 0.1)' : 'rgba(192, 132, 252, 0.1)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '6px'
                      }}>
                        {workoutMode === 'time' ? '⏱️ 시간제' : '🔢 횟수제'}
                      </span>
                    </div>
                  )}

                  {/* Pocket alignment guide */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: '#64748b', marginBottom: '0.5rem', width: '100%' }}>
                    <Smartphone size={13} style={{ flexShrink: 0 }} />
                    <span>
                      {workoutType === 'squat' && '우측 앞바지 주머니에 스마트폰을 고정하세요.'}
                      {workoutType === 'pushup' && '바지 주머니에 스마트폰을 고정하고 엉덩이를 낮췄다 올리세요.'}
                      {workoutType === 'walk' && '스마트폰을 바지 앞주머니에 넣고 걸으세요. (10보 주기 소리 피드백)'}
                      {workoutType === 'dance' && '스마트폰을 주머니에 넣고 자유롭게 리듬을 타며 춤추세요.'}
                    </span>
                  </div>

                  {/* State Badge (댄스는 불필요) */}
                  {workoutType !== 'dance' && (
                    <div className={getStatusClass(currentState)}>
                      {getStatusText(currentState)}
                    </div>
                  )}

                  {/* Inertia Motion Visualizer (관성 구슬 원형 UI) */}
                  <div className="motion-container">
                    <div 
                      className="motion-ball" 
                      ref={ballRef}
                      style={{ 
                        transform: `translate3d(0px, 0px, 0)` 
                      }} 
                    />
                  </div>

                  {/* Big Count Screen / Dance metrics UI */}
                  {workoutType !== 'dance' ? (
                    <>
                      {workoutMode === 'rep' ? (
                        <>
                          <div className={`counter-display ${bump ? 'bump' : ''}`}>
                            {count}
                          </div>
                          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#94a3b8', marginBottom: '0.6rem' }}>
                            {workoutType === 'walk' ? '목표 걸음 수' : '목표 횟수'}: <strong style={{ color: '#fff' }}>{targetCount || 10}</strong> {workoutType === 'walk' ? '걸음' : '회'}
                          </div>
                        </>
                      ) : (
                        <>
                          {workoutType === 'walk' ? (
                            <>
                              <div className={`counter-display ${bump ? 'bump' : ''}`} style={{ color: '#38bdf8' }}>
                                {count}
                              </div>
                              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#94a3b8', marginBottom: '0.6rem' }}>
                                남은 시간: <strong style={{ color: '#fff' }}>{timeRemaining}</strong>초 / {workoutType === 'walk' ? `목표: ${Math.floor((workDuration as number) / 60)}분` : `세트 시간: ${workDuration}초`}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="counter-display" style={{ color: '#38bdf8', fontFamily: 'monospace' }}>
                                {timeRemaining}s
                              </div>
                              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#94a3b8', marginBottom: '0.6rem' }}>
                                현재 수행 횟수: <strong style={{ color: '#fff' }}>{count}</strong> 회 / {workoutType === 'walk' ? `목표: ${Math.floor((workDuration as number) / 60)}분` : `세트 시간: ${workDuration}초`}
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <div style={{ width: '100%', marginBottom: '0.6rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      {/* Live Gauge */}
                      <div className="dance-intensity-wrapper" style={{ marginTop: '0.4rem' }}>
                        <div className="dance-intensity-label" style={{ marginBottom: '0.2rem' }}>
                          <span>실시간 춤 강도</span>
                          <span style={{ color: '#d946ef' }}>{danceMetrics.intensity}%</span>
                        </div>
                        <div className="dance-intensity-bar-container">
                          <div 
                            className="dance-intensity-bar" 
                            style={{ width: `${danceMetrics.intensity}%` }}
                          />
                        </div>
                      </div>
                      
                      {/* Dance Metrics Grid */}
                      <div className="dance-metrics-grid" style={{ marginTop: '0.6rem', gap: '0.5rem' }}>
                        <div className="dance-metric-card" style={{ padding: '0.4rem 0.3rem' }}>
                          <div className="dance-metric-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.1rem' }}>
                            <Clock size={11} color="#8b5cf6" />
                            <span>시간</span>
                          </div>
                          <div className="dance-metric-value" style={{ fontSize: '1rem' }}>
                            {formatDuration(danceMetrics.activeDurationMs)}
                          </div>
                        </div>
                        <div className="dance-metric-card" style={{ padding: '0.4rem 0.3rem' }}>
                          <div className="dance-metric-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.1rem' }}>
                            <Music size={11} color="#a78bfa" />
                            <span>동작</span>
                          </div>
                          <div className="dance-metric-value" style={{ 
                            color: lastAction !== '대기 중 🎵' ? '#e879f9' : '#64748b', 
                            fontWeight: '800', 
                            fontSize: '0.9rem',
                            whiteSpace: 'nowrap',
                            textShadow: lastAction !== '대기 중 🎵' ? '0 0 10px rgba(232, 121, 249, 0.4)' : 'none',
                            transition: 'all 0.15s ease'
                          }}>
                            {lastAction}
                          </div>
                        </div>
                        <div className="dance-metric-card" style={{ padding: '0.4rem 0.3rem' }}>
                          <div className="dance-metric-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.1rem' }}>
                            <Flame size={11} color="#ec4899" />
                            <span>칼로리</span>
                          </div>
                          <div className="dance-metric-value" style={{ color: '#ec4899', fontSize: '1rem' }}>
                            {danceMetrics.estimatedCalories} <span style={{ fontSize: '0.65rem', color: '#64748b' }}>kcal</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 실시간 설정 컨트롤 (소리, 절전, 민감도) */}
                  <div style={{ 
                    width: '100%', 
                    background: 'rgba(255, 255, 255, 0.01)', 
                    border: '1px solid rgba(255, 255, 255, 0.04)', 
                    borderRadius: '12px', 
                    padding: '0.6rem 0.8rem', 
                    marginBottom: '0.6rem',
                    textAlign: 'left'
                  }}>
                    {/* 소리 토글 & 절전 버튼 가로 2행 정렬 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.4rem' }}>
                      <button
                        type="button"
                        onClick={() => setIsSoundOn(!isSoundOn)}
                        style={{
                          background: isSoundOn ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                          border: isSoundOn ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                          borderRadius: '8px',
                          padding: '0.4rem 0.5rem',
                          color: isSoundOn ? '#c084fc' : '#64748b',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        {isSoundOn ? <Volume2 size={13} color="#c084fc" /> : <VolumeX size={13} color="#64748b" />}
                        {isSoundOn ? '알림음 켬' : '음소거'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowBlackSaver(true)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          borderRadius: '8px',
                          padding: '0.4rem 0.5rem',
                          color: '#e2e8f0',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        🔋 절전 화면
                      </button>
                    </div>

                    {/* 실시간 민감도 */}
                    <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: '0.4rem' }}>
                      {workoutType === 'dance' ? (
                        <>
                          <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '700', display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                            <span>🎵 댄스 민감도</span>
                            <span style={{ color: '#c084fc' }}>{danceSensitivity} / 10</span>
                          </label>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            value={danceSensitivity}
                            onChange={(e) => setDanceSensitivity(parseInt(e.target.value, 10))}
                            className="sensitivity-slider"
                            style={{ margin: '0.15rem 0', height: '6px' }}
                          />
                        </>
                      ) : (
                        <>
                          <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '700', display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                            <span>🏃 실시간 민감도</span>
                            <span style={{ color: '#c084fc' }}>{sensitivity} / 10</span>
                          </label>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            value={sensitivity}
                            onChange={(e) => setSensitivity(parseInt(e.target.value, 10))}
                            className="sensitivity-slider"
                            style={{ margin: '0.15rem 0', height: '6px' }}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Stop & Pause controls */}
                  <div style={{ width: '100%', display: 'flex', gap: '0.6rem' }}>
                    {isActive ? (
                      <button className="btn-main stop" onClick={handleStopWorkout}>
                        <Square size={16} />
                        일시 중지
                      </button>
                    ) : (
                      <button className="btn-main start" onClick={handleStartWorkout}>
                        <Play size={16} />
                        이어서 진행
                      </button>
                    )}
                    <button
                      onClick={handleReset}
                      style={{
                        width: '50px',
                        height: '48px',
                        borderRadius: '14px',
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
                </>
              )}
            </div>
          )}

          {/* Celebration Splash Screen */}
          {isCompleted && (
            <div className="overlay">
              <Award size={80} color="#ffd000" style={{ marginBottom: '1rem', animation: 'pulse-border 1.5s infinite' }} />
              <div className="celebration-title">전체 세트 완료!</div>
              <p style={{ color: '#94a3b8', fontSize: '1.15rem', margin: '0 0 2rem 0', lineHeight: '1.6' }}>
                축하합니다! {
                  workoutType === 'squat' ? '🦵 스쿼트' :
                  workoutType === 'pushup' ? '💪 푸시업' : '🚶 걷기'
                } <strong>{totalSets}세트</strong>를 모두 마쳤습니다.<br />
                <span style={{ fontSize: '0.95rem', color: '#64748b' }}>
                  ({workoutMode === 'rep' ? `세트당 목표: ${targetCount || 10}회` : (workoutType === 'walk' ? `목표 시간: ${Math.floor((workDuration as number) / 60)}분` : `세트당 시간: ${workDuration}초`)})
                </span>
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

      {/* 📊 나의 운동 히스토리 대시보드 */}
      {!isActive && (
        <div className="history-section">
          <button 
            className="history-toggle-btn"
            onClick={() => setShowHistory(!showHistory)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📊 나의 운동 히스토리</span>
              <span className="history-count-badge">{records.length}</span>
            </div>
            {showHistory ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {showHistory && (
            <div className="history-content-box animate-fade-in">
              {records.length > 0 && (
                <div className="history-actions-bar">
                  <button className="btn-history-action export" onClick={exportHistory}>
                    📥 기록 내보내기 (JSON)
                  </button>
                  <button className="btn-history-action clear" onClick={clearHistory}>
                    🗑️ 기록 전체 삭제
                  </button>
                </div>
              )}

              {records.length === 0 ? (
                <div className="history-empty-state">
                  <p>아직 운동 기록이 없습니다.</p>
                  <p style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.25rem' }}>
                    지금 시작해서 첫 기록을 남겨보세요! 🔥
                  </p>
                </div>
              ) : (
                <div className="history-list">
                  {records.map((record) => {
                    const date = new Date(record.timestamp);
                    const dateStr = `${date.getMonth() + 1}월 ${date.getDate()}일 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                    
                    let typeLabel = '';
                    let typeColor = '';
                    let typeBg = '';
                    if (record.workoutType === 'squat') {
                      typeLabel = '🦵 스쿼트';
                      typeColor = '#a78bfa'; // 보라
                      typeBg = 'rgba(167, 139, 250, 0.1)';
                    } else if (record.workoutType === 'pushup') {
                      typeLabel = '💪 푸시업';
                      typeColor = '#f472b6'; // 분홍
                      typeBg = 'rgba(244, 114, 182, 0.1)';
                    } else if (record.workoutType === 'walk') {
                      typeLabel = '🚶 걷기';
                      typeColor = '#38bdf8'; // 하늘
                      typeBg = 'rgba(56, 189, 248, 0.1)';
                    } else if (record.workoutType === 'dance') {
                      typeLabel = '🎵 댄스';
                      typeColor = '#fb7185'; // 장미
                      typeBg = 'rgba(251, 113, 133, 0.1)';
                    }

                    const isDance = record.workoutType === 'dance';
                    const isTimeMode = record.workoutMode === 'time';

                    return (
                      <div key={record.id} className="history-item-card">
                        <div className="history-item-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span 
                              className="history-item-badge" 
                              style={{ 
                                color: typeColor, 
                                background: typeBg, 
                                border: `1px solid ${typeColor === '#a78bfa' ? 'rgba(167, 139, 250, 0.2)' : typeColor === '#f472b6' ? 'rgba(244, 114, 182, 0.2)' : typeColor === '#38bdf8' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(251, 113, 133, 0.2)'}` 
                              }}
                            >
                              {typeLabel}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {dateStr}
                            </span>
                          </div>
                          <button 
                            className="btn-history-item-delete"
                            onClick={() => deleteRecord(record.id)}
                            title="삭제"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        <div className="history-item-body">
                          <div className="history-item-stats">
                            {!isDance ? (
                              <>
                                <div>
                                  <span className="stat-label">세트 달성도</span>
                                  <span className="stat-val">{record.completedSets} / {record.totalSets} 세트</span>
                                </div>
                                <div>
                                  <span className="stat-label">총 횟수</span>
                                  <span className="stat-val" style={{ color: '#fff' }}>{record.totalCount}회</span>
                                </div>
                                {isTimeMode && (
                                  <div>
                                    <span className="stat-label">운동 시간</span>
                                    <span className="stat-val">{formatDuration(record.durationMs)}</span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                <div>
                                  <span className="stat-label">댄스 시간</span>
                                  <span className="stat-val">{formatDuration(record.durationMs)}</span>
                                </div>
                                <div>
                                  <span className="stat-label">활동 구분</span>
                                  <span className="stat-val" style={{ color: '#fb7185', fontWeight: 'bold' }}>자유 댄스 🎵</span>
                                </div>
                              </>
                            )}
                          </div>
                          
                          <div className="history-item-calories">
                            <Flame size={12} color="#ec4899" />
                            <span>{record.calories} kcal 소모</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!isActive && (
        <footer style={{ textAlign: 'center', fontSize: '0.75rem', color: '#475569', marginTop: 'auto', paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <div>Pocket Motion Counter Demo v{__APP_VERSION__}</div>
      <div style={{ color: '#334155', fontSize: '0.65rem' }}>
        배포 버전: v{__APP_VERSION__} ({__BUILD_TIME__})
      </div>
    </footer>
  )}
</div>
  );
}
