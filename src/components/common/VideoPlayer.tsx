import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, Maximize, Minimize, Volume2, VolumeX, Volume1,
  RefreshCw, AlertCircle, PictureInPicture, Gauge, Monitor, Lock, Unlock
} from 'lucide-react';
import { cn } from '@/utils/helpers';
import { loadH265Player, H265_TOKEN } from '@/utils/h265-loader';

interface VideoPlayerProps {
  src: string;
  className?: string;
  autoPlay?: boolean;
}

type Mode = 'native' | 'h265' | 'error';
type PlayState = 'loading' | 'ready' | 'playing' | 'paused' | 'error';

const SPEEDS = [0.5, 1, 1.5, 2];

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

let idCounter = 0;

export function VideoPlayer({ src, className, autoPlay = false }: VideoPlayerProps) {
  const [mode, setMode] = useState<Mode>('native');
  const [state, setState] = useState<PlayState>('loading');
  const [muted, setMuted] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [webFullscreen, setWebFullscreen] = useState(false);
  const [sysFullscreen, setSysFullscreen] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [videoRatio, setVideoRatio] = useState('16/9');
  const [locked, setLocked] = useState(false);

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeVideoRef = useRef<HTMLVideoElement>(null);
  const containerIdRef = useRef(`h265-player-${++idCounter}`);
  const mountedRef = useRef(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seekingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // 自动隐藏控件
  const startHideTimer = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (stateRef.current === 'playing') setShowControls(false);
    }, 5000);
  }, []);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    startHideTimer();
  }, [startHideTimer]);

  // h265web.js 清理
  const destroyH265 = useCallback(() => {
    if (playerRef.current) {
      try { playerRef.current.release(); } catch {}
      playerRef.current = null;
    }
  }, []);

  const getSize = () => {
    const el = containerRef.current;
    if (!el) return { w: 640, h: 360 };
    const w = el.clientWidth || 640;
    return { w, h: Math.round(w * 9 / 16) };
  };

  // 初始化 h265web.js
  const initH265 = useCallback(async () => {
    destroyH265();
    setState('loading');
    setErrMsg('');
    try {
      await loadH265Player();
      if (!mountedRef.current) return;

      const create = (window as any).new265webjs;
      if (!create) throw new Error('h265web.js 加载失败');

      const { w, h } = getSize();
      const player = create(src, {
        player: containerIdRef.current,
        width: w, height: h,
        token: H265_TOKEN,
        extInfo: { autoPlay: false, probeSize: 8192 },
      });

      player.onReadyShowDone = () => { if (mountedRef.current) setState('ready'); };
      player.onLoadFinish = () => { if (mountedRef.current) setState('ready'); };
      player.onPlayFinish = () => { if (mountedRef.current) setState('paused'); };

      playerRef.current = player;
      player.do();
    } catch (e: any) {
      if (mountedRef.current) {
        setErrMsg(e?.message || '播放器初始化失败');
        setState('error');
        setMode('error');
      }
    }
  }, [src, destroyH265]);

  const handleNativeError = useCallback(() => {
    if (!mountedRef.current) return;
    setMode('h265');
  }, []);

  const handleNativeReady = useCallback(() => {
    if (!mountedRef.current) return;
    setState(prev => prev === 'loading' ? 'ready' : prev);
    const v = nativeVideoRef.current;
    if (v) setDuration(v.duration || 0);
  }, []);

  useEffect(() => { if (mode === 'h265') initH265(); }, [mode, initH265]);

  // h265 resize
  useEffect(() => {
    if (mode !== 'h265' || !containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const p = playerRef.current;
      if (p?.resize) {
        const { w, h } = getSize();
        try { p.resize(w, h); } catch {}
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [mode]);

  // 清理
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      destroyH265();
      clearTimeout(hideTimerRef.current);
    };
  }, [destroyH265]);

  // src 变化重置
  useEffect(() => {
    destroyH265();
    setMode('native');
    setState('loading');
    setErrMsg('');
    setCurrentTime(0);
    setDuration(0);
    setSpeed(1);
    setVideoRatio('16/9');
  }, [src, destroyH265]);

  // 追踪系统全屏状态
  useEffect(() => {
    const handler = () => setSysFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // 播放时启动自动隐藏计时器
  useEffect(() => {
    if (state === 'playing') resetHideTimer();
  }, [state, resetHideTimer]);

  // autoPlay：就绪后自动播放
  useEffect(() => {
    if (!autoPlay || state !== 'ready') return;
    if (mode === 'native' && nativeVideoRef.current) {
      nativeVideoRef.current.play();
    } else if (playerRef.current) {
      playerRef.current.play();
      setState('playing');
    }
  }, [autoPlay, state, mode]);

  // ---- 控制函数 ----

  const togglePlay = () => {
    if (mode === 'native') {
      const v = nativeVideoRef.current;
      if (!v) return;
      if (v.paused) v.play();
      else v.pause();
      return;
    }
    const p = playerRef.current;
    if (!p) return;
    if (p.isPlaying()) { p.pause(); setState('paused'); }
    else { p.play(); setState('playing'); }
  };

  const toggleMute = () => {
    const next = !muted;
    if (mode === 'native' && nativeVideoRef.current) {
      nativeVideoRef.current.muted = next;
    } else {
      playerRef.current?.setVoice(next ? 0 : 1.0);
    }
    setMuted(next);
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    setMuted(val === 0);
    if (mode === 'native' && nativeVideoRef.current) {
      nativeVideoRef.current.volume = val;
      nativeVideoRef.current.muted = val === 0;
    } else {
      playerRef.current?.setVoice(val);
    }
  };

  const handleSeek = (ratio: number) => {
    const t = ratio * duration;
    if (mode === 'native' && nativeVideoRef.current) {
      nativeVideoRef.current.currentTime = t;
    } else {
      playerRef.current?.seek?.(t);
    }
    setCurrentTime(t);
  };

  const handleSpeedChange = (s: number) => {
    setSpeed(s);
    setShowSpeedMenu(false);
    if (mode === 'native' && nativeVideoRef.current) {
      nativeVideoRef.current.playbackRate = s;
    }
    // h265web.js 通常不支持倍速
  };

  const toggleWebFullscreen = () => {
    setWebFullscreen(prev => !prev);
  };

  const toggleSystemFullscreen = async () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      try { screen.orientation.unlock(); } catch {}
    } else {
      await containerRef.current?.requestFullscreen();
      const v = nativeVideoRef.current;
      if (v && v.videoWidth > v.videoHeight) {
        try { await (screen.orientation as any).lock('landscape'); } catch {}
      }
    }
  };

  const togglePiP = async () => {
    if (mode !== 'native' || !nativeVideoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await nativeVideoRef.current.requestPictureInPicture();
      }
    } catch {}
  };

  const retry = () => {
    if (mode === 'h265' || mode === 'error') {
      setMode('native');
      setState('loading');
      setErrMsg('');
    }
  };

  const isReady = state === 'ready' || state === 'playing' || state === 'paused';
  const isAnyFullscreen = webFullscreen || sysFullscreen;

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative rounded-xl overflow-hidden border border-border bg-black my-4 max-w-[800px] group/vp',
        isAnyFullscreen && 'flex items-center justify-center',
        webFullscreen && 'fixed inset-0 z-[9999] max-w-none rounded-none border-none my-0',
        className
      )}
      onMouseMove={() => { if (!locked) startHideTimer(); }}
      onMouseLeave={() => { if (state === 'playing' && !locked) setShowControls(false); }}
      style={!isAnyFullscreen && state === 'loading' ? { aspectRatio: videoRatio } : undefined}
      onClick={(e) => {
        if (locked) return;
        if ((e.target as HTMLElement).closest('.vp-controls')) return;
        if (!isReady) return;
        setShowControls(prev => {
          if (!prev) startHideTimer();
          return !prev;
        });
      }}
    >
      {/* 原生 video */}
      {mode === 'native' && (
        <video
          ref={nativeVideoRef}
          src={src}
          className={cn('block w-full !m-0', isAnyFullscreen ? 'h-full object-contain' : 'h-auto')}
          onCanPlay={handleNativeReady}
          onError={handleNativeError}
          onPlay={() => setState('playing')}
          onPause={() => setState('paused')}
          onTimeUpdate={() => {
            if (!seekingRef.current && nativeVideoRef.current) {
              setCurrentTime(nativeVideoRef.current.currentTime);
            }
          }}
          onLoadedMetadata={() => {
            const v = nativeVideoRef.current;
            if (v) {
              setDuration(v.duration);
              if (v.videoWidth && v.videoHeight) setVideoRatio(`${v.videoWidth}/${v.videoHeight}`);
            }
          }}
          playsInline
        />
      )}

      {/* h265web.js 渲染容器 */}
      {mode === 'h265' && (
        <div id={containerIdRef.current} className={cn('w-full', isAnyFullscreen ? 'h-full' : 'h-auto aspect-video')} />
      )}

      {/* 错误占位 */}
      {mode === 'error' && <div className="w-full h-full" />}

      {/* 加载中 */}
      {state === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
          <RefreshCw className="w-8 h-8 text-white/70 animate-spin" />
          <span className="text-sm text-white/70">
            {mode === 'native' ? '加载视频...' : '加载 H.265 播放器...'}
          </span>
        </div>
      )}

      {/* 错误 */}
      {state === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <span className="text-sm text-white/70">{errMsg || '播放失败'}</span>
          <button
            onClick={retry}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white/90 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            重试
          </button>
        </div>
      )}

      {/* 大播放按钮 */}
      {isReady && state !== 'playing' && !locked && (
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
        >
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            <Play className="w-8 h-8 text-white ml-1" />
          </div>
        </div>
      )}

      {/* 锁按钮 */}
      {isReady && isAnyFullscreen && (showControls || locked) && (
        <button
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white/90 hover:text-white transition-opacity duration-300',
            !showControls && !locked && 'opacity-0 pointer-events-none'
          )}
          onClick={(e) => { e.stopPropagation(); setLocked(prev => !prev); }}
        >
          {locked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
        </button>
      )}

      {/* 统一控制栏 */}
      {isReady && !locked && (
        <div
          className={cn(
            'vp-controls absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300',
            showControls || state !== 'playing' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 进度条 */}
          <ProgressBar
            current={currentTime}
            total={duration}
            onSeek={handleSeek}
            onSeeking={(v) => { seekingRef.current = v; }}
          />

          {/* 控件行 */}
          <div className="flex items-center gap-1 px-3 pb-2 pt-1">
            {/* 播放/暂停 */}
            <CtrlBtn onClick={togglePlay}>
              {state === 'playing' ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </CtrlBtn>

            {/* 时间 */}
            <span className="text-xs text-white/80 tabular-nums mx-1 select-none">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="flex-1" />

            {/* 音量 */}
            <div
              className="relative flex items-center"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <CtrlBtn onClick={toggleMute}>
                <VolumeIcon className="w-5 h-5" />
              </CtrlBtn>
              {showVolumeSlider && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black/90 rounded-lg p-2 flex flex-col items-center">
                  <input
                    type="range"
                    min={0} max={1} step={0.05}
                    value={muted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="vp-volume-slider"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl', height: '80px', width: '20px' }}
                  />
                </div>
              )}
            </div>

            {/* 倍速 */}
            <div className="relative">
              <CtrlBtn onClick={() => setShowSpeedMenu(!showSpeedMenu)}>
                <span className="text-xs font-medium">{speed === 1 ? <Gauge className="w-5 h-5" /> : `${speed}x`}</span>
              </CtrlBtn>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-black/90 rounded-lg py-1 min-w-[72px]">
                  {SPEEDS.map(s => (
                    <button
                      key={s}
                      onClick={() => handleSpeedChange(s)}
                      className={cn(
                        'w-full px-3 py-1.5 text-xs text-center transition-colors',
                        s === speed ? 'text-primary-400' : 'text-white/80 hover:text-white'
                      )}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 画中画（仅原生） */}
            {mode === 'native' && document.pictureInPictureEnabled && (
              <CtrlBtn onClick={togglePiP} title="画中画">
                <PictureInPicture className="w-5 h-5" />
              </CtrlBtn>
            )}

            {/* 网页全屏 */}
            <CtrlBtn onClick={toggleWebFullscreen} title="网页全屏">
              <Monitor className="w-5 h-5" />
            </CtrlBtn>

            {/* 系统全屏 */}
            <CtrlBtn onClick={toggleSystemFullscreen} title="全屏">
              {document.fullscreenElement ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </CtrlBtn>
          </div>
        </div>
      )}
    </div>
  );
}

// 控件按钮
function CtrlBtn({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 text-white/90 hover:text-white transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}

// 进度条
function ProgressBar({
  current, total, onSeek, onSeeking,
}: {
  current: number; total: number;
  onSeek: (ratio: number) => void;
  onSeeking: (v: boolean) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  const getRatio = (e: MouseEvent | React.MouseEvent) => {
    const rect = barRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      onSeek(getRatio(e));
    };
    const onUp = (e: MouseEvent) => {
      onSeek(getRatio(e));
      setDragging(false);
      onSeeking(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, onSeek, onSeeking]);

  const progress = total > 0 ? current / total : 0;
  const displayRatio = hoverRatio ?? progress;

  return (
    <div
      ref={barRef}
      className="group/pb relative h-5 flex items-center px-3 cursor-pointer"
      onMouseDown={(e) => {
        setDragging(true);
        onSeeking(true);
        onSeek(getRatio(e));
      }}
      onMouseMove={(e) => setHoverRatio(getRatio(e))}
      onMouseLeave={() => setHoverRatio(null)}
    >
      {/* 轨道 */}
      <div className="relative w-full h-1 group-hover/pb:h-1.5 bg-white/20 rounded-full transition-all">
        {/* 已播放 */}
        <div
          className="absolute inset-y-0 left-0 bg-primary-500 rounded-full"
          style={{ width: `${progress * 100}%` }}
        />
        {/* hover 预览 */}
        {hoverRatio !== null && (
          <div className="absolute top-0 bottom-0 left-0 bg-white/20 rounded-full" style={{ width: `${hoverRatio * 100}%` }} />
        )}
        {/* 拖拽手柄 */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover/pb:opacity-100 transition-opacity"
          style={{ left: `calc(${(dragging ? displayRatio : progress) * 100}% - 6px)` }}
        />
      </div>
      {/* hover 时间提示 */}
      {hoverRatio !== null && total > 0 && (
        <div
          className="absolute -top-7 bg-black/90 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none"
          style={{ left: `calc(${hoverRatio * 100}% + 12px - 20px)` }}
        >
          {formatTime(hoverRatio * total)}
        </div>
      )}
    </div>
  );
}
