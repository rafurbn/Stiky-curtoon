import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Download,
  Send,
  CalendarClock,
  Wand2,
  Film,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  AutomationSettings,
  VideoAction,
  VideoAspectRatio,
  VideoCamera,
  VideoItem,
  VideoMusicStyle,
  VideoProp,
  VideoScene,
  VideoSfx,
  VideoTheme,
} from '../types/comic';
import { STARTER_VIDEOS } from '../lib/defaultVideos';
import {
  getSceneAtTime,
  getVideoDimensions,
  recordVideoFromScript,
  renderVideoFrame,
  type RenderedVideoResult,
} from '../lib/videoRenderer';
import { startVideoAudioSession, type AudioSession } from '../lib/videoAudioEngine';
import { computeUpcomingBdSlots, DEFAULT_BD_SLOTS, formatBdTimeLabel } from '../lib/scheduleHelper';

interface VideoStudioViewProps {
  video: VideoItem;
  videos: VideoItem[];
  settings: AutomationSettings;
  onSelectVideo: (video: VideoItem) => void;
  onUpdateVideo: (updated: VideoItem) => void;
  onCreateVideo: (newVideo: VideoItem) => void;
  onPublishVideo: (
    video: VideoItem,
    rendered: RenderedVideoResult,
    scheduledDate?: Date
  ) => Promise<void>;
}

const THEME_OPTIONS: Array<{ value: 'auto' | VideoTheme; label: string }> = [
  { value: 'auto', label: 'অটো (দৃশ্য অনুযায়ী বৈচিত্র্য)' },
  { value: 'rain_storm', label: 'বৃষ্টি ও বজ্রপাত' },
  { value: 'desert_sun', label: 'রোদ ও মরুভূমি' },
  { value: 'office_drama', label: 'অফিস ও বস' },
  { value: 'tea_stall', label: 'চা-দোকান ও আড্ডা' },
  { value: 'street_night', label: 'রাতের রাস্তা' },
];

const CAMERA_OPTIONS: Array<{ value: VideoCamera; label: string }> = [
  { value: 'wide', label: 'ওয়াইড শট' },
  { value: 'zoom_left', label: 'বামে জুম' },
  { value: 'zoom_right', label: 'ডানে জুম' },
  { value: 'zoom_center', label: 'মাঝে জুম' },
  { value: 'shake', label: 'কমিক শেক' },
];

const SFX_OPTIONS: Array<{ value: VideoSfx; label: string }> = [
  { value: 'laugh', label: 'হাসি (Haha)' },
  { value: 'gasp', label: 'শকড গ্যাস্প' },
  { value: 'thunder', label: 'বজ্রপাত' },
  { value: 'pour', label: 'পানি ঢালা' },
  { value: 'punchline', label: 'পাঞ্চলাইন হিট' },
  { value: 'pop', label: 'বাবল পপ' },
  { value: 'sad_trombone', label: 'স্যাড ট্রম্বোন' },
  { value: 'none', label: 'সাউন্ড ছাড়া' },
];

const ACTION_OPTIONS: Array<{ value: VideoAction; label: string }> = [
  { value: 'idle', label: 'দাঁড়িয়ে থাকা' },
  { value: 'walk_in', label: 'হেঁটে আসা' },
  { value: 'laugh', label: 'হাসা' },
  { value: 'point_laugh', label: 'আঙুল তুলে হাসা' },
  { value: 'panting', label: 'হাঁপানো (পিপাসা)' },
  { value: 'shocked_jump', label: 'চমকে লাফ' },
  { value: 'eye_pop', label: 'চোখ বেরিয়ে আসা' },
  { value: 'facepalm', label: 'মাথায় হাত' },
  { value: 'hands_up', label: 'হাত তোলা' },
  { value: 'pour_water', label: 'পানি ঢালা' },
  { value: 'sip_tea', label: 'চা পান' },
  { value: 'run', label: 'দৌড়ানো' },
];

const PROP_OPTIONS: Array<{ value: VideoProp; label: string }> = [
  { value: 'none', label: 'কিছু নেই' },
  { value: 'umbrella_normal', label: 'স্বাভাবিক ছাতা' },
  { value: 'umbrella_upside_down', label: 'উল্টো ছাতা (পানিভর্তি)' },
  { value: 'broken_umbrella', label: 'ভাঙা ছাতা' },
  { value: 'water_tap_glass', label: 'ট্যাপ ও পানির গ্লাস' },
  { value: 'tea_cup', label: 'চায়ের কাপ' },
  { value: 'smartphone', label: 'স্মার্টফোন' },
  { value: 'money', label: 'টাকা' },
  { value: 'laptop', label: 'ল্যাপটপ' },
  { value: 'clock', label: 'ঘড়ি' },
];

export function VideoStudioView({
  video,
  videos,
  settings,
  onSelectVideo,
  onUpdateVideo,
  onCreateVideo,
  onPublishVideo,
}: VideoStudioViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<AudioSession | null>(null);
  const rafRef = useRef<number>(0);
  const playStartWallRef = useRef<number>(0);
  const playOffsetRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Generator controls
  const [themeChoice, setThemeChoice] = useState<'auto' | VideoTheme>('auto');
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(video.aspectRatio || '9:16');
  const [dialogueMode, setDialogueMode] = useState<'bangla' | 'silent'>('bangla');
  const [musicStyle, setMusicStyle] = useState<VideoMusicStyle>(video.musicStyle || 'comedy');
  const [targetDurationSec, setTargetDurationSec] = useState(10);
  const [customHint, setCustomHint] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Render & publish state
  const [renderProgress, setRenderProgress] = useState<number | null>(null);
  const [renderedResult, setRenderedResult] = useState<RenderedVideoResult | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [showSceneEditor, setShowSceneEditor] = useState(false);
  const [activeSceneIdx, setActiveSceneIdx] = useState(0);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    cancelAnimationFrame(rafRef.current);
    if (audioRef.current) {
      audioRef.current.stop();
      audioRef.current = null;
    }
  }, []);

  // Draw static frame whenever video/time/branding changes and not actively animating
  useEffect(() => {
    if (!canvasRef.current || isPlaying) return;
    let alive = true;
    const draw = async () => {
      try {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
      } catch {
        // Ignore font readiness fallback
      }
      if (!alive || !canvasRef.current) return;
      renderVideoFrame(canvasRef.current, video, settings, currentTime);
    };
    draw();
    return () => {
      alive = false;
    };
  }, [video, settings, currentTime, isPlaying]);

  // Clear cached rendered blob when script or branding changes
  useEffect(() => {
    setRenderedResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  }, [video.id, video.scenes, video.aspectRatio, video.musicStyle, settings.logoText, settings.logoOpacity]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (audioRef.current) {
        audioRef.current.stop();
        audioRef.current = null;
      }
    };
  }, []);

  const startPlayback = useCallback(
    (fromTime?: number) => {
      stopPlayback();
      const startAt =
        fromTime !== undefined
          ? fromTime
          : currentTime >= video.totalDurationSec - 0.1
            ? 0
            : currentTime;

      playOffsetRef.current = startAt;
      playStartWallRef.current = performance.now();
      setCurrentTime(startAt);
      setIsPlaying(true);

      if (!isMuted) {
        audioRef.current = startVideoAudioSession(video, {
          outputToSpeakers: true,
          outputToStream: false,
          startOffsetSec: startAt,
        });
      }

      const tick = (now: number) => {
        const elapsed = (now - playStartWallRef.current) / 1000;
        const nextT = Math.min(video.totalDurationSec, playOffsetRef.current + elapsed);
        setCurrentTime(nextT);
        if (canvasRef.current) {
          renderVideoFrame(canvasRef.current, video, settings, nextT);
        }

        if (nextT < video.totalDurationSec) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          stopPlayback();
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [currentTime, isMuted, settings, stopPlayback, video]
  );

  const togglePlay = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  };

  const handleRestart = () => {
    startPlayback(0);
  };

  const handleScrub = (val: number) => {
    stopPlayback();
    setCurrentTime(val);
  };

  const handleGenerateVideo = async () => {
    stopPlayback();
    setIsGenerating(true);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: settings.preferredCategory || 'auto',
          theme: themeChoice,
          aspectRatio,
          dialogueMode,
          musicStyle,
          targetDurationSec,
          customHint,
          recentTitles: videos.slice(0, 10).map((v) => v.title),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'ভিডিও স্টোরিবোর্ড তৈরি করা যায়নি।');
      }
      const created: VideoItem = {
        ...data,
        status: 'draft',
      };
      onCreateVideo(created);
      setCurrentTime(0);
      setActiveSceneIdx(0);
      setStatusBanner({
        type: 'ok',
        text: `নতুন ${created.totalDurationSec} সেকেন্ডের ভিডিও তৈরি হয়েছে: "${created.title}"`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'ভিডিও তৈরিতে সমস্যা হয়েছে।',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const ensureRenderedVideo = async (): Promise<RenderedVideoResult> => {
    if (renderedResult) return renderedResult;
    stopPlayback();
    setRenderProgress(0);
    try {
      const result = await recordVideoFromScript(video, settings, (pct) => {
        setRenderProgress(pct);
      });
      setRenderedResult(result);
      return result;
    } finally {
      setTimeout(() => setRenderProgress(null), 600);
    }
  };

  const handleRenderAndDownload = async () => {
    setStatusBanner(null);
    try {
      const res = await ensureRenderedVideo();
      const a = document.createElement('a');
      a.href = res.objectUrl;
      a.download = `rafu-folk-${video.id}.${res.extension}`;
      a.click();
      setStatusBanner({
        type: 'ok',
        text: `${res.durationSec} সেকেন্ডের অ্যানিমেটেড ভিডিও (.${res.extension}) ডাউনলোড শুরু হয়েছে!`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'ভিডিও রেন্ডার করা যায়নি।',
      });
    }
  };

  const handlePublish = async (scheduleNextSlot: boolean) => {
    setIsPublishing(true);
    setStatusBanner(null);
    try {
      const res = await ensureRenderedVideo();
      let scheduledDate: Date | undefined;
      if (scheduleNextSlot) {
        const slots = settings.dailySlots?.length ? settings.dailySlots : DEFAULT_BD_SLOTS;
        const [nextSlot] = computeUpcomingBdSlots(slots, 1, 0, new Date(), 15);
        scheduledDate = nextSlot;
      }
      await onPublishVideo(video, res, scheduledDate);
      setStatusBanner({
        type: 'ok',
        text: scheduledDate
          ? `ভিডিও সফলভাবে Facebook সার্ভারে শিডিউল হয়েছে (${formatBdTimeLabel(scheduledDate)})`
          : 'ভিডিও সফলভাবে Facebook Page-এ পোস্ট হয়েছে!',
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Facebook-এ ভিডিও পাঠানো যায়নি।',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(video.fbCaption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const activeScene: VideoScene | undefined = video.scenes[activeSceneIdx] || video.scenes[0];
  const currentPlayingScene = getSceneAtTime(video, currentTime).scene;
  const dims = getVideoDimensions(video.aspectRatio);

  const updateActiveScene = (patch: Partial<VideoScene>) => {
    const nextScenes = video.scenes.map((sc, idx) =>
      idx === activeSceneIdx ? { ...sc, ...patch } : sc
    );
    const totalDurationSec = Number(
      nextScenes.reduce((sum, s) => sum + s.durationSec, 0).toFixed(1)
    );
    onUpdateVideo({ ...video, scenes: nextScenes, totalDurationSec });
  };

  const updateSceneChar = (
    charIdx: number,
    patch: Partial<VideoScene['characters'][number]>
  ) => {
    if (!activeScene) return;
    const nextChars = activeScene.characters.map((c, ci) =>
      ci === charIdx ? { ...c, ...patch } : c
    );
    updateActiveScene({ characters: nextChars });
  };

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
      {/* Left Column: Live Animated Player & Export / Facebook Video Publish */}
      <div className="space-y-6 xl:col-span-7">
        {statusBanner && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm font-medium ${
              statusBanner.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            {statusBanner.text}
          </div>
        )}

        {/* Quick Preset Strip */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                {video.title}
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{video.category}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">{video.totalDurationSec} সেকেন্ড</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">
                  {dims.width}×{dims.height} ({video.aspectRatio})
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {STARTER_VIDEOS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    stopPlayback();
                    setCurrentTime(0);
                    setActiveSceneIdx(0);
                    onSelectVideo(preset);
                  }}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    video.id === preset.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {preset.title}
                </button>
              ))}
            </div>
          </div>

          {/* Animated Canvas Stage */}
          <div className="mt-4 flex justify-center rounded-xl bg-slate-950 p-4">
            <canvas
              ref={canvasRef}
              onClick={togglePlay}
              className={`cursor-pointer rounded-lg border border-slate-800 shadow-sm ${
                video.aspectRatio === '9:16'
                  ? 'max-h-[540px] w-auto max-w-full'
                  : 'max-h-[480px] w-auto max-w-full'
              }`}
              aria-label={`Animated stickman video preview: ${video.title}`}
            />
          </div>

          {/* Playback Controls & Scrub Bar */}
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                <span>{isPlaying ? 'থামান' : 'প্লে করুন'}</span>
              </button>

              <button
                type="button"
                onClick={handleRestart}
                title="শুরু থেকে দেখুন"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>রিস্টার্ট</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !isMuted;
                  setIsMuted(next);
                  if (next && audioRef.current) {
                    audioRef.current.stop();
                    audioRef.current = null;
                  }
                }}
                title={isMuted ? 'সাউন্ড চালু' : 'মিউট'}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                <span>{isMuted ? 'মিউট' : 'সাউন্ড চালু'}</span>
              </button>

              <div className="ml-auto font-mono-tabular text-xs font-semibold text-slate-600 whitespace-nowrap">
                {currentTime.toFixed(1)}s / {video.totalDurationSec.toFixed(1)}s · দৃশ্য{' '}
                {currentPlayingScene.sceneIndex + 1}
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={video.totalDurationSec}
              step={0.1}
              value={currentTime}
              onChange={(e) => handleScrub(Number(e.target.value))}
              className="w-full accent-slate-900"
              aria-label="Video timeline scrubber"
            />
          </div>

          {renderProgress !== null && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-900">
              <div className="flex items-center justify-between">
                <span>অডিওসহ HD ভিডিও রেন্ডার হচ্ছে...</span>
                <span className="font-mono-tabular">{renderProgress}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-200">
                <div
                  className="h-full bg-blue-700 transition-all"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Primary Export & Facebook Video Actions */}
          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={handleRenderAndDownload}
              disabled={renderProgress !== null || isPublishing}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-900 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>ভিডিও ডাউনলোড</span>
            </button>

            <button
              type="button"
              onClick={() => handlePublish(false)}
              disabled={
                renderProgress !== null ||
                isPublishing ||
                !settings.pageId ||
                !settings.pageAccessToken
              }
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="h-4 w-4 shrink-0" />
              <span>{isPublishing ? 'আপলোড হচ্ছে...' : 'Page-এ ভিডিও পোস্ট'}</span>
            </button>

            <button
              type="button"
              onClick={() => handlePublish(true)}
              disabled={
                renderProgress !== null ||
                isPublishing ||
                !settings.pageId ||
                !settings.pageAccessToken
              }
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
            >
              <CalendarClock className="h-4 w-4 shrink-0" />
              <span>BD স্লটে শিডিউল</span>
            </button>
          </div>
        </div>

        {/* Caption Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="video-fb-caption" className="text-sm font-bold text-slate-900">
              Facebook Reels / Video ক্যাপশন
            </label>
            <button
              type="button"
              onClick={handleCopyCaption}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span>কপি হয়েছে</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>কপি</span>
                </>
              )}
            </button>
          </div>
          <textarea
            id="video-fb-caption"
            rows={2}
            value={video.fbCaption}
            onChange={(e) => onUpdateVideo({ ...video, fbCaption: e.target.value })}
            className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
          />
          {!settings.pageAccessToken && (
            <p className="mt-2 text-xs text-slate-500">
              সরাসরি Facebook Page-এ ভিডিও পোস্ট বা শিডিউল করতে "Facebook অটো-পোস্ট" ট্যাবে Page ID ও Token যুক্ত করুন।
            </p>
          )}
        </div>
      </div>

      {/* Right Column: AI 5-15s Video Generator & Scene Timeline Editor */}
      <div className="space-y-6 xl:col-span-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-slate-900" />
            <h3 className="font-display text-lg font-bold text-slate-900">
              ৫–১৫ সেকেন্ড AI স্টিকম্যান ভিডিও
            </h3>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            রঙিন থিম ব্যাকগ্রাউন্ড, স্মুথ ক্যামেরা জুম, চোখ-মুখের অ্যানিমেশন ও কমিক সাউন্ড ইফেক্টসহ ফানি শর্ট ভিডিও বানান।
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="vid-theme" className="block text-xs font-semibold text-slate-700">
                ব্যাকগ্রাউন্ড থিম
              </label>
              <select
                id="vid-theme"
                value={themeChoice}
                onChange={(e) => setThemeChoice(e.target.value as 'auto' | VideoTheme)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {THEME_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="vid-ratio" className="block text-xs font-semibold text-slate-700">
                  ভিডিও ফরম্যাট
                </label>
                <select
                  id="vid-ratio"
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as VideoAspectRatio)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="9:16">9:16 (Reels / Shorts)</option>
                  <option value="1:1">1:1 (Square ফিড)</option>
                </select>
              </div>

              <div>
                <label htmlFor="vid-music" className="block text-xs font-semibold text-slate-700">
                  মিউজিক স্টাইল
                </label>
                <select
                  id="vid-music"
                  value={musicStyle}
                  onChange={(e) => setMusicStyle(e.target.value as VideoMusicStyle)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="comedy">ফানি কমেডি</option>
                  <option value="quirky">দুষ্টু / কুইর্কি</option>
                  <option value="dramatic">নাটকীয় টুইস্ট</option>
                  <option value="none">শুধু সাউন্ড ইফেক্ট</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="vid-dialogue" className="block text-xs font-semibold text-slate-700">
                ডায়ালগ ধরন
              </label>
              <select
                id="vid-dialogue"
                value={dialogueMode}
                onChange={(e) => setDialogueMode(e.target.value as 'bangla' | 'silent')}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="bangla">ছোট বাংলা ডায়ালগ + সাউন্ড ইফেক্ট</option>
                <option value="silent">ডায়ালগ ছাড়া (শুধু এক্সপ্রেশন ও সাউন্ড)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="vid-duration" className="text-xs font-semibold text-slate-700">
                  ভিডিওর দৈর্ঘ্য (লক্ষ্যমাত্রা)
                </label>
                <span className="font-mono-tabular text-xs font-bold text-slate-900">
                  {targetDurationSec} সেকেন্ড
                </span>
              </div>
              <input
                id="vid-duration"
                type="range"
                min={6}
                max={15}
                step={1}
                value={targetDurationSec}
                onChange={(e) => setTargetDurationSec(Number(e.target.value))}
                className="mt-2 w-full accent-slate-900"
              />
            </div>

            <div>
              <label htmlFor="vid-hint" className="block text-xs font-semibold text-slate-700">
                গল্পের আইডিয়া (ঐচ্ছিক — ফাঁকা রাখলেও AI নিজেই বানাবে)
              </label>
              <input
                id="vid-hint"
                type="text"
                value={customHint}
                onChange={(e) => setCustomHint(e.target.value)}
                placeholder="যেমন: বন্ধু ছাতা নিয়ে হাসল, পরে মরুভূমিতে বিপদে..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerateVideo}
              disabled={isGenerating}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
            >
              <Wand2 className="h-4 w-4" />
              <span>
                {isGenerating
                  ? 'AI ফানি স্টিকম্যান ভিডিও বানাচ্ছে...'
                  : 'নতুন ৫–১৫ সে. ফানি ভিডিও বানান'}
              </span>
            </button>
          </div>
        </div>

        {/* Scene-by-Scene Fine-Tuning Editor */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setShowSceneEditor((v) => !v)}
            className="flex w-full items-center justify-between px-6 py-4 text-left"
          >
            <div>
              <div className="text-sm font-bold text-slate-900">
                দৃশ্য, ক্যামেরা ও সাউন্ড এডিটর (ঐচ্ছিক)
              </div>
              <div className="text-xs text-slate-500">
                প্রতিটি দৃশ্যের ব্যাকগ্রাউন্ড, জুম, অ্যাকশন ও সাউন্ড ইফেক্ট কাস্টমাইজ করুন
              </div>
            </div>
            {showSceneEditor ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>

          {showSceneEditor && activeScene && (
            <div className="border-t border-slate-200 px-6 py-5 space-y-4">
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {video.scenes.map((sc, idx) => (
                  <button
                    key={sc.sceneIndex}
                    type="button"
                    onClick={() => setActiveSceneIdx(idx)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                      activeSceneIdx === idx
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    দৃশ্য {idx + 1} ({sc.durationSec}s)
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">থিম</label>
                  <select
                    value={activeScene.theme}
                    onChange={(e) =>
                      updateActiveScene({ theme: e.target.value as VideoTheme })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                  >
                    {THEME_OPTIONS.filter((t) => t.value !== 'auto').map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">ক্যামেরা</label>
                  <select
                    value={activeScene.camera}
                    onChange={(e) =>
                      updateActiveScene({ camera: e.target.value as VideoCamera })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                  >
                    {CAMERA_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">সাউন্ড ইফেক্ট</label>
                  <select
                    value={activeScene.sfx}
                    onChange={(e) => updateActiveScene({ sfx: e.target.value as VideoSfx })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                  >
                    {SFX_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    সময় ({activeScene.durationSec}s)
                  </label>
                  <input
                    type="range"
                    min={2}
                    max={5.5}
                    step={0.5}
                    value={activeScene.durationSec}
                    onChange={(e) =>
                      updateActiveScene({ durationSec: Number(e.target.value) })
                    }
                    className="mt-2.5 w-full accent-slate-900"
                  />
                </div>
              </div>

              {activeScene.characters.map((ch, ci) => (
                <div
                  key={`${ch.id}-${ci}`}
                  className="space-y-2 border-t border-slate-100 pt-3"
                >
                  <div className="text-xs font-bold text-slate-800">
                    চরিত্র {ci + 1}: {ch.name}
                  </div>
                  <input
                    type="text"
                    value={ch.speech || ''}
                    onChange={(e) => updateSceneChar(ci, { speech: e.target.value })}
                    placeholder="সংলাপ (বা ফাঁকা রাখুন)..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={ch.action}
                      onChange={(e) =>
                        updateSceneChar(ci, { action: e.target.value as VideoAction })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                    >
                      {ACTION_OPTIONS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={ch.prop}
                      onChange={(e) =>
                        updateSceneChar(ci, { prop: e.target.value as VideoProp })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                    >
                      {PROP_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
