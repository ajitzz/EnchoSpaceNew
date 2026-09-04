import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, PictureInPicture2, ArrowRight } from 'lucide-react';

interface CinematicVideoPlayerProps {
  videoUrl: string;
  posterUrl?: string;
  className?: string;
  title?: string;
  price?: number;
  currency?: string;
  onReserveClick?: () => void;
}

export const CinematicVideoPlayer: React.FC<CinematicVideoPlayerProps> = ({
  videoUrl,
  posterUrl,
  className = '',
  title = 'Sanctuary Reel',
  price,
  currency = 'USD',
  onReserveClick
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPiP, setIsPiP] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const userExplicitlyPausedRef = useRef<boolean>(false);
  const userExplicitlyMutedRef = useRef<boolean>(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Compute final streaming source URL
  const isMux = videoUrl?.startsWith('mux://');
  const playbackId = isMux ? videoUrl.replace('mux://', '') : '';
  const finalSrc = isMux
    ? `https://stream.mux.com/${playbackId}.m3u8`
    : videoUrl;

  // Format seconds to mm:ss
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Enforce full-volume unmuted audio unless manually muted
  const forceUnmute = useCallback(() => {
    if (userExplicitlyMutedRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    try {
      video.muted = false;
      video.volume = 1;
      setIsMuted(false);
      if (video.paused && !userExplicitlyPausedRef.current) {
        video.play().catch(() => {});
      }
    } catch (_) {}
  }, []);

  // Initialize HLS.js or Native Video Streaming
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !finalSrc) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Default to unmuted 100% volume
    video.volume = 1;
    if (!userExplicitlyMutedRef.current) {
      video.muted = false;
    }

    const tryAutoplay = () => {
      if (userExplicitlyPausedRef.current || !video) return;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            if (!userExplicitlyMutedRef.current) {
              video.muted = false;
              setIsMuted(false);
            }
          })
          .catch(() => {
            // Browser autoplay policy restricted unmuted -> fallback to muted until first interaction
            video.muted = true;
            setIsMuted(true);
            video.play().then(() => setIsPlaying(true)).catch(() => {});
          });
      }
    };

    if (finalSrc.includes('.m3u8')) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari on Mac / iOS)
        video.src = finalSrc;
        video.addEventListener('loadedmetadata', tryAutoplay, { once: true });
        video.addEventListener('canplay', tryAutoplay, { once: true });
      } else if (Hls.isSupported()) {
        // HLS.js for Chrome, Firefox, Edge, Android
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        });
        hls.loadSource(finalSrc);
        hls.attachMedia(video);
        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          tryAutoplay();
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.warn('[CinematicPlayer] HLS network error, retrying...', data);
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.warn('[CinematicPlayer] HLS media error, recovering...', data);
                hls.recoverMediaError();
                break;
              default:
                console.error('[CinematicPlayer] Unrecoverable HLS error', data);
                hls.destroy();
                break;
            }
          }
        });
      } else {
        video.src = finalSrc;
        video.addEventListener('loadedmetadata', tryAutoplay, { once: true });
      }
    } else {
      video.src = finalSrc;
      video.addEventListener('loadedmetadata', tryAutoplay, { once: true });
      video.addEventListener('canplay', tryAutoplay, { once: true });
    }

    // Try immediate play if ready
    tryAutoplay();

    // Global listener to unlock unmuted audio on ANY first user touch/scroll/click
    const unlockAudio = () => {
      if (!userExplicitlyMutedRef.current && video) {
        video.muted = false;
        video.volume = 1;
        setIsMuted(false);
      }
      if (!userExplicitlyPausedRef.current && video && video.paused) {
        video.play().catch(() => {});
      }
    };

    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('scroll', unlockAudio, { passive: true });
    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('scroll', unlockAudio);
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [finalSrc]);

  // Sync fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Sync PiP state
  useEffect(() => {
    const handleLeavePiP = () => setIsPiP(false);
    const handleEnterPiP = () => setIsPiP(true);
    document.addEventListener('leavepictureinpicture', handleLeavePiP);
    document.addEventListener('enterpictureinpicture', handleEnterPiP);
    return () => {
      document.removeEventListener('leavepictureinpicture', handleLeavePiP);
      document.removeEventListener('enterpictureinpicture', handleEnterPiP);
    };
  }, []);

  // Controls auto-hide
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 2500);
  };

  // Toggle Play / Pause (Only pauses if user explicitly clicks button)
  const handleTogglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      userExplicitlyPausedRef.current = false;
      if (!userExplicitlyMutedRef.current) {
        video.muted = false;
        video.volume = 1;
        setIsMuted(false);
      }
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      userExplicitlyPausedRef.current = true;
      video.pause();
      setIsPlaying(false);
    }
  };

  // Toggle Mute (Only mutes if user explicitly clicks button)
  const handleToggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (isMuted || video.muted) {
      userExplicitlyMutedRef.current = false;
      video.muted = false;
      video.volume = 1;
      setIsMuted(false);
    } else {
      userExplicitlyMutedRef.current = true;
      video.muted = true;
      setIsMuted(true);
    }
  };

  // Scrubber Seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const targetTime = parseFloat(e.target.value);
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  // Picture-in-Picture Toggle
  const handleTogglePiP = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else if (typeof video.requestPictureInPicture === 'function') {
        await video.requestPictureInPicture();
        setIsPiP(true);
      }
    } catch (err) {
      console.warn('[CinematicPlayer] PiP toggle error:', err);
    }
  };

  // Fullscreen Toggle
  const handleToggleFullscreen = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as any)?.webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn('[CinematicPlayer] Fullscreen error:', err);
    }
  };

  // Update time & ensure continuous playback and volume
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    setCurrentTime(video.currentTime || 0);
    if (video.duration && !isNaN(video.duration)) {
      setDuration(video.duration);
    }

    // Guarantee unmuted full volume if user didn't explicitly mute
    if (!userExplicitlyMutedRef.current && video.muted) {
      video.muted = false;
      video.volume = 1;
      setIsMuted(false);
    }

    // Guarantee continuous play if user didn't explicitly pause
    if (!userExplicitlyPausedRef.current && video.paused) {
      video.play().catch(() => {});
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video && video.duration && !isNaN(video.duration)) {
      setDuration(video.duration);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className={`relative w-full h-full bg-black overflow-hidden select-none group/player ${className}`}
    >
      {/* Native Hardware Video Layer (Zero Shadow DOM, Continuous Play) */}
      <video
        ref={videoRef}
        poster={posterUrl}
        autoPlay
        loop
        playsInline
        crossOrigin="anonymous"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          if (!userExplicitlyPausedRef.current && videoRef.current) {
            videoRef.current.play().catch(() => {});
          } else {
            setIsPlaying(false);
          }
        }}
        className="w-full h-full object-cover"
      />

      {/* Ultra-Minimal, Slim 20px Control Bar (100% Pure White, Non-Intrusive) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 inset-x-0 z-30 transition-all duration-300 pointer-events-auto bg-gradient-to-t from-black/50 to-transparent pt-2 pb-1.5 px-2.5 sm:px-4 flex items-center gap-2 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
        }`}
      >
        {/* 1. Play / Pause Button */}
        <button
          type="button"
          onClick={handleTogglePlay}
          className="p-1 text-white hover:opacity-80 transition-opacity active:scale-95 focus:outline-none shrink-0"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-3.5 h-3.5 fill-white text-white" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />
          )}
        </button>

        {/* 2. Ultra-Thin 1.5px Progress Scrubber */}
        <div className="relative flex-1 flex items-center group/scrubber h-3 cursor-pointer">
          <div className="w-full h-[1.5px] bg-white/30 rounded-full overflow-hidden relative group-hover/scrubber:h-[2.5px] transition-all">
            <div
              className="h-full bg-white transition-all duration-75 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* 3. Sound / Mute Toggle (Pure White) */}
        <button
          type="button"
          onClick={handleToggleMute}
          className="p-1 text-white hover:opacity-80 transition-opacity active:scale-95 focus:outline-none shrink-0"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <VolumeX className="w-3.5 h-3.5 text-white" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-white" />
          )}
        </button>

        {/* 4. Picture-in-Picture Button (Pure White) */}
        <button
          type="button"
          onClick={handleTogglePiP}
          className="p-1 text-white hover:opacity-80 transition-opacity active:scale-95 focus:outline-none shrink-0"
          title="Picture-in-Picture"
        >
          <PictureInPicture2 className="w-3.5 h-3.5 text-white" />
        </button>

        {/* 5. Fullscreen Toggle (Pure White) */}
        <button
          type="button"
          onClick={handleToggleFullscreen}
          className="p-1 text-white hover:opacity-80 transition-opacity active:scale-95 focus:outline-none shrink-0"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5 text-white" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5 text-white" />
          )}
        </button>
      </div>
    </div>
  );
};
export default CinematicVideoPlayer;
