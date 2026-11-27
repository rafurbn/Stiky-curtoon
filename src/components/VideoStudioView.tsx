import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Film,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Save,
  Send,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from 'lucide-react';
import type {
  AutomationSettings,
  CharacterKind,
  HybridAssetItem,
  OutfitStyle,
  SavedRenderedVideo,
  VideoAspectRatio,
  VideoCamera,
  VideoItem,
  VideoMusicStyle,
  VideoRenderStyle,
  VideoScene,
  VideoSfx,
  VideoSubtitleStyle,
  VideoTheme,
  VideoVoiceEngine,
  VoiceEffectPreset,
} from '../types/comic';
import { STARTER_VIDEOS } from '../lib/defaultVideos';
import {
  getSceneAtTime,
  getVideoDimensions,
  preloadThemeBackgrounds,
  recordVideoFromScript,
  renderVideoFrame,
  type RenderedVideoResult,
} from '../lib/videoRenderer';
import {
  findAssetByIdOrTheme,
  getCachedAssetCatalog,
  getClientCustomAssetSummaries,
  preloadScriptAssets,
  refreshAssetCatalog,
  resolveSpriteAssetForCharacter,
} from '../lib/hybridSpriteCatalog';
import { startVideoAudioSession, type AudioSession } from '../lib/videoAudioEngine';
import { prepareLipSyncForScript } from '../lib/lipSyncAnalyzer';
import { getRenderedVideoBlobFromVault } from '../lib/videoStorage';

interface VideoStudioViewProps {
  video: VideoItem;
  videos: VideoItem[];
  savedRenderedVideos: SavedRenderedVideo[];
  settings: AutomationSettings;
  onSelectVideo: (video: VideoItem) => void;
  onUpdateVideo: (updated: VideoItem) => void;
  onCreateVideo: (newVideo: VideoItem) => void;
  onSaveRenderedVideo: (video: VideoItem, rendered: RenderedVideoResult) => Promise<SavedRenderedVideo>;
  onDeleteSavedRenderedVideo: (id: string) => Promise<void>;
  onPublishVideo: (
    video: VideoItem,
    rendered: RenderedVideoResult,
    scheduledDate?: Date
  ) => Promise<void>;
}

const PROCEDURAL_THEME_OPTIONS: Array<{ value: VideoTheme; label: string }> = [
  { value: 'tea_stall', label: 'চা-দোকান (রঙিন)' },
  { value: 'rain_storm', label: 'বৃষ্টি ও বজ্রপাত' },
  { value: 'desert_sun', label: 'রোদ ও মরুভূমি' },
  { value: 'office_drama', label: 'অফিস' },
  { value: 'street_night', label: 'রাতের রাস্তা' },
  { value: 'room_door', label: 'ঘরের ভেতর' },
];

const OUTFIT_OPTIONS: Array<{ value: OutfitStyle; label: string }> = [
  { value: 'casual', label: 'সাধারণ টি-শার্ট' },
  { value: 'lungi_panjabi', label: 'লুঙ্গি ও পাঞ্জাবি' },
  { value: 'farmer', label: 'চাষী / গামছা' },
  { value: 'office_suit', label: 'অফিস স্যুট ও টাই' },
  { value: 'student', label: 'ছাত্র পোশাক' },
  { value: 'shopkeeper', label: 'দোকানদার' },
  { value: 'police', label: 'পুলিশ ইউনিফর্ম' },
];

const CAMERA_OPTIONS: Array<{ value: VideoCamera; label: string }> = [
  { value: 'wide', label: 'ওয়াইড শট' },
  { value: 'zoom_left', label: 'বামে জুম' },
  { value: 'zoom_right', label: 'ডানে জুম' },
  { value: 'zoom_center', label: 'মাঝে জুম' },
  { value: 'shake', label: 'কমিক শেক' },
];

const SFX_OPTIONS: Array<{ value: VideoSfx; label: string }> = [
  { value: 'pop', label: 'বাবল পপ' },
  { value: 'dramatic_boom', label: 'ড্রামাটিক বুম' },
  { value: 'punchline', label: 'পাঞ্চলাইন হিট' },
  { value: 'laugh', label: 'হাসি' },
  { value: 'gasp', label: 'চমকানো গ্যাস্প' },
  { value: 'scream_sting', label: 'চিৎকার স্টিং' },
  { value: 'splat_funny', label: 'ফানি স্প্ল্যাট' },
  { value: 'thunder', label: 'বজ্রপাত' },
  { value: 'pour', label: 'পানি ঢালা' },
  { value: 'knock_door', label: 'কড়া নাড়া' },
  { value: 'door_creak', label: 'দরজা খোলা' },
  { value: 'sad_trombone', label: 'স্যাড ট্রম্বোন' },
  { value: 'none', label: 'সাউন্ড ছাড়া' },
];

const VOICE_EFFECT_OPTIONS: Array<{ value: VoiceEffectPreset; label: string }> = [
  { value: 'normal', label: 'স্বাভাবিক ভয়েস' },
  { value: 'panicked', label: 'আতঙ্কিত / চেঁচামেচি' },
  { value: 'dramatic_boss', label: 'ভারী নাটকীয় ভয়েস' },
  { value: 'cartoon_high', label: 'কার্টুন চিকন ভয়েস' },
];

export function VideoStudioView({
  video,
  videos,
  savedRenderedVideos,
  settings,
  onSelectVideo,
  onUpdateVideo,
  onCreateVideo,
  onSaveRenderedVideo,
  onDeleteSavedRenderedVideo,
  onPublishVideo,
}: VideoStudioViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioSessionRef = useRef<AudioSession | null>(null);
  const rafRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Only essential user choices
  const [creationMode, setCreationMode] = useState<'custom_script' | 'auto'>('custom_script');
  const [styleChoice, setStyleChoice] = useState<'auto' | VideoRenderStyle>('auto');
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(video.aspectRatio || '9:16');
  const [customScript, setCustomScript] = useState('');
  const [customHint, setCustomHint] = useState('');

  // Optional hidden advanced controls (for users who want manual fine-tuning)
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSynthesizingVoices, setIsSynthesizingVoices] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  const [renderStage, setRenderStage] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [lastRendered, setLastRendered] = useState<RenderedVideoResult | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [playingSavedUrl, setPlayingSavedUrl] = useState<{
    id: string;
    url: string;
    title: string;
  } | null>(null);

  const [hybridAssets, setHybridAssets] = useState<HybridAssetItem[]>(() =>
    getCachedAssetCatalog()
  );
  const [assetLoadTick, setAssetLoadTick] = useState(0);

  const totalDuration = video.scenes.reduce((acc, s) => acc + Math.max(1.5, s.durationSec), 0);

  useEffect(() => {
    preloadThemeBackgrounds().catch(() => {});
    refreshAssetCatalog()
      .then((list) => {
        setHybridAssets(list);
        setAssetLoadTick((t) => t + 1);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    preloadScriptAssets(video)
      .then(() => {
        if (active) setAssetLoadTick((t) => t + 1);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [video]);

  useEffect(() => {
    setAspectRatio(video.aspectRatio || '9:16');
    setLastRendered(null);
    setElapsedSec(0);
    setIsPlaying(false);
  }, [video.id]);

  const stopPlayback = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioSessionRef.current) {
      audioSessionRef.current.stop();
      audioSessionRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  // Paint frame whenever elapsedSec, video, or loaded hybrid assets change while paused
  useEffect(() => {
    if (isPlaying) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dims = getVideoDimensions(video.aspectRatio);
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      renderVideoFrame(ctx, video, settings, elapsedSec);
    }
  }, [video, settings, elapsedSec, isPlaying, assetLoadTick]);

  useEffect(() => {
    if (video.voiceClips && video.voiceClips.length > 0) {
      prepareLipSyncForScript(video).catch(() => {});
    }
  }, [video.id, video.voiceClips]);

  const needsVoiceSynthesis = (target: VideoItem): boolean => {
    if (target.voiceEngine === 'none') return false;
    const existing = Array.isArray(target.voiceClips) ? target.voiceClips : [];
    for (let sIdx = 0; sIdx < target.scenes.length; sIdx++) {
      const sc = target.scenes[sIdx];
      for (let cIdx = 0; cIdx < sc.characters.length; cIdx++) {
        const ch = sc.characters[cIdx];
        if (ch.customAudioDataUrl) continue;
        const speech = (ch.speech || '').trim();
        if (!speech) continue;
        const matched = existing.find(
          (c) => c.sceneIndex === sIdx && c.charIndex === cIdx && c.text.trim() === speech
        );
        if (!matched) return true;
      }
    }
    return false;
  };

  const handleSynthesizeVoicesForScript = async (
    targetScript: VideoItem,
    engineOverride?: VideoVoiceEngine
  ): Promise<VideoItem> => {
    const engine = engineOverride || targetScript.voiceEngine || 'auto';
    if (engine === 'none') {
      const cleaned = { ...targetScript, voiceClips: [] };
      onUpdateVideo(cleaned);
      return cleaned;
    }

    setIsSynthesizingVoices(true);
    try {
      const res = await fetch('/api/video/synthesize-voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: targetScript.scenes,
          voiceEngine: engine,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ভয়েস তৈরি করা যায়নি।');

      const nextScenes = Array.isArray(data.scenes) ? data.scenes : targetScript.scenes;
      const nextDuration = Number(
        nextScenes
          .reduce((acc: number, s: VideoScene) => acc + Math.max(1.5, s.durationSec), 0)
          .toFixed(1)
      );
      const updated: VideoItem = {
        ...targetScript,
        voiceEngine: engine,
        scenes: nextScenes,
        totalDurationSec: nextDuration,
        voiceClips: Array.isArray(data.voiceClips) ? data.voiceClips : [],
      };
      onUpdateVideo(updated);
      return updated;
    } finally {
      setIsSynthesizingVoices(false);
    }
  };

  const startPlayback = async (fromSec = elapsedSec) => {
    stopPlayback();

    let workingVideo = video;
    if (needsVoiceSynthesis(video)) {
      setStatusMsg({
        type: 'ok',
        text: 'স্ক্রিপ্ট অনুযায়ী লাউড বাংলা ভয়েস ও লিপ-সিংক তৈরি হচ্ছে...',
      });
      try {
        workingVideo = await handleSynthesizeVoicesForScript(video, video.voiceEngine || 'auto');
        setStatusMsg(null);
      } catch (err) {
        setStatusMsg({
          type: 'err',
          text: err instanceof Error ? err.message : 'ভয়েস তৈরি করা যায়নি, সাউন্ড ইফেক্টসহ চলছে।',
        });
      }
    }

    await prepareLipSyncForScript(workingVideo).catch(() => {});

    const workingTotalDuration = workingVideo.scenes.reduce(
      (acc, s) => acc + Math.max(1.5, s.durationSec),
      0
    );
    const startAt = fromSec >= workingTotalDuration - 0.1 ? 0 : fromSec;
    setElapsedSec(startAt);
    setIsPlaying(true);

    try {
      const session = await startVideoAudioSession(workingVideo, startAt, false);
      audioSessionRef.current = session;
    } catch {
      // Ignore audio block if autoplay prevented
    }

    const startWall = performance.now();
    const tick = () => {
      const nowElapsed = startAt + (performance.now() - startWall) / 1000;
      const canvas = canvasRef.current;
      if (canvas) {
        const dims = getVideoDimensions(workingVideo.aspectRatio);
        if (canvas.width !== dims.width || canvas.height !== dims.height) {
          canvas.width = dims.width;
          canvas.height = dims.height;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          renderVideoFrame(
            ctx,
            workingVideo,
            settings,
            Math.min(nowElapsed, workingTotalDuration - 0.01)
          );
        }
      }

      if (nowElapsed >= workingTotalDuration) {
        setElapsedSec(0);
        stopPlayback();
        return;
      }
      setElapsedSec(nowElapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const handleGenerateVideo = async () => {
    if (creationMode === 'custom_script' && !customScript.trim()) {
      setStatusMsg({
        type: 'err',
        text: 'অনুগ্রহ করে আপনার গল্প বা সংলাপটি নিচের বক্সে লিখুন, অথবা "AI অটো গল্প" বেছে নিন।',
      });
      return;
    }

    stopPlayback();
    setIsGenerating(true);
    setStatusMsg(null);
    setLastRendered(null);

    try {
      await refreshAssetCatalog().catch(() => {});
      const clientCustomAssets = getClientCustomAssetSummaries();
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: creationMode,
          customScript: creationMode === 'custom_script' ? customScript : '',
          customHint: creationMode === 'auto' ? customHint : '',
          renderStyle: styleChoice,
          aspectRatio,
          dialogueMode: 'bangla',
          recentTitles: videos.slice(0, 8).map((v) => v.title),
          clientCustomAssets,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ভিডিও তৈরি করা যায়নি।');

      const newVideo: VideoItem = {
        ...data,
        status: 'draft',
        voiceEngine: 'auto',
      };
      const freshAssets = await refreshAssetCatalog().catch(() => hybridAssets);
      setHybridAssets(freshAssets);
      await preloadScriptAssets(newVideo).catch(() => {});
      setAssetLoadTick((t) => t + 1);
      onCreateVideo(newVideo);

      setStatusMsg({
        type: 'ok',
        text: 'স্ক্রিপ্ট বুঝে দৃশ্য সাজানো হয়েছে! এখন লাউড বাংলা ভয়েস ও লিপ-সিংক তৈরি হচ্ছে...',
      });
      await handleSynthesizeVoicesForScript(newVideo, 'auto');

      setStatusMsg({
        type: 'ok',
        text: 'সবকিছু প্রস্তুত! এখন Play চাপুন অথবা MP4 হিসেবে সেইভ করুন।',
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'ভিডিও তৈরি ব্যর্থ হয়েছে।',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRenderAndSave = async () => {
    stopPlayback();
    setIsRecording(true);
    setRenderPct(0);
    setRenderStage('প্রস্তুত হচ্ছে...');
    setStatusMsg(null);

    try {
      let workingVideo = video;
      if (needsVoiceSynthesis(video)) {
        setRenderStage('বাংলা AI ডাবিং তৈরি হচ্ছে...');
        workingVideo = await handleSynthesizeVoicesForScript(video, video.voiceEngine || 'auto');
      }

      const rendered = await recordVideoFromScript(workingVideo, settings, (pct, label) => {
        setRenderPct(pct);
        if (label) setRenderStage(label);
      });

      setLastRendered(rendered);
      await onSaveRenderedVideo(workingVideo, rendered);

      setStatusMsg({
        type: 'ok',
        text: `ভিডিও রেন্ডার হয়ে স্থায়ীভাবে সেইভ হয়েছে (${(rendered.blob.size / (1024 * 1024)).toFixed(2)} MB · ${rendered.extension.toUpperCase()})!`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'ভিডিও রেন্ডার করা যায়নি।',
      });
    } finally {
      setIsRecording(false);
    }
  };

  const handleDownloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const handleUploadCustomAudio = async (
    sceneIdx: number,
    charIdx: number,
    file: File | undefined
  ) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      const nextScenes = video.scenes.map((sc, sI) =>
        sI === sceneIdx
          ? {
              ...sc,
              characters: sc.characters.map((ch, cI) =>
                cI === charIdx ? { ...ch, customAudioDataUrl: dataUrl } : ch
              ),
            }
          : sc
      );
      onUpdateVideo({ ...video, scenes: nextScenes });
      setStatusMsg({
        type: 'ok',
        text: 'আপনার নিজস্ব কপিরাইট-ফ্রি অডিও ক্লিপ দৃশ্যে যুক্ত হয়েছে!',
      });
    };
    reader.readAsDataURL(file);
  };

  const toggleMicRecording = async (sceneIdx: number, charIdx: number) => {
    const key = `${sceneIdx}-${charIdx}`;
    if (recordingKey === key && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecordingKey(null);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          const nextScenes = video.scenes.map((sc, sI) =>
            sI === sceneIdx
              ? {
                  ...sc,
                  characters: sc.characters.map((ch, cI) =>
                    cI === charIdx ? { ...ch, customAudioDataUrl: dataUrl } : ch
                  ),
                }
              : sc
          );
          onUpdateVideo({ ...video, scenes: nextScenes });
          setStatusMsg({ type: 'ok', text: 'আপনার ভয়েস রেকর্ড সফলভাবে যুক্ত হয়েছে!' });
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecordingKey(key);
    } catch {
      setStatusMsg({
        type: 'err',
        text: 'মাইক্রোফোন অনুমতি পাওয়া যায়নি। ব্রাউজার সেটিংস চেক করুন।',
      });
    }
  };

  const handlePlaySavedItem = async (item: SavedRenderedVideo) => {
    if (playingSavedUrl?.id === item.id) {
      setPlayingSavedUrl(null);
      return;
    }
    const localBlob = await getRenderedVideoBlobFromVault(item.id);
    if (localBlob) {
      const url = URL.createObjectURL(localBlob);
      setPlayingSavedUrl({ id: item.id, url, title: item.title });
      return;
    }
    if (item.serverUrl) {
      setPlayingSavedUrl({ id: item.id, url: item.serverUrl, title: item.title });
    }
  };

  const handleDownloadSavedItem = async (item: SavedRenderedVideo) => {
    const localBlob = await getRenderedVideoBlobFromVault(item.id);
    const ext = item.mimeType?.includes('mp4') ? 'mp4' : 'webm';
    if (localBlob) {
      handleDownloadBlob(localBlob, `${item.id}.${ext}`);
      return;
    }
    if (item.serverUrl) {
      const a = document.createElement('a');
      a.href = `${item.serverUrl}?download=1`;
      a.download = `${item.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const currentSceneInfo = getSceneAtTime(video, elapsedSec);

  return (
    <div className="space-y-6">
      {/* Clean Top Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            স্বাধীন কার্টুন ভিডিও স্টুডিও
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            শুধু স্ক্রিপ্ট লিখুন বা আইডিয়া দিন — দৃশ্য, ভয়েস, লিপসিংক ও মিউজিক এআই নিজেই সাজাবে
          </p>
        </div>

        {/* Essential Option 1: Aspect Ratio */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setAspectRatio('9:16');
              onUpdateVideo({ ...video, aspectRatio: '9:16' });
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              aspectRatio === '9:16'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ৯:১৬ Reels / Shorts
          </button>
          <button
            type="button"
            onClick={() => {
              setAspectRatio('1:1');
              onUpdateVideo({ ...video, aspectRatio: '1:1' });
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              aspectRatio === '1:1'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ১:১ বর্গাকার
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-medium ${
            statusMsg.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Main 2-Column Studio Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT: Minimal Freeform Creator + Simple Dialogue Review */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            {/* Creation Mode Tabs + Essential Style Switch */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setCreationMode('custom_script')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    creationMode === 'custom_script'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  নিজে স্ক্রিপ্ট লিখুন
                </button>
                <button
                  type="button"
                  onClick={() => setCreationMode('auto')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    creationMode === 'auto'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  AI দিয়ে অটো গল্প
                </button>
              </div>

              {/* Essential Option 2: Visual Style (Auto / B&W / Color) */}
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setStyleChoice('auto')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    styleChoice === 'auto'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  অটো স্টাইল
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStyleChoice('stick_meme');
                    onUpdateVideo({
                      ...video,
                      renderStyle: 'stick_meme',
                      subtitleStyle: 'meme_clean',
                    });
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    styleChoice === 'stick_meme'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  সাদাকালো
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStyleChoice('cartoon_2d');
                    onUpdateVideo({
                      ...video,
                      renderStyle: 'cartoon_2d',
                      subtitleStyle: 'reels_bold',
                    });
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    styleChoice === 'cartoon_2d'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  রঙিন
                </button>
              </div>
            </div>

            {creationMode === 'custom_script' ? (
              <div className="space-y-3">
                <textarea
                  rows={6}
                  value={customScript}
                  onChange={(e) => setCustomScript(e.target.value)}
                  placeholder={`আপনার স্প্রাইট চরিত্র (গরু, বাঘ, রফু/রাফু) ও পটভূমি অনুযায়ী যেকোনো গল্প লিখুন...\n\nউদাহরণ:\nসবুজ মাঠে রফু হাঁটছে আর গরু আরামে ঘাস খাচ্ছে।\nহঠাৎ জঙ্গল থেকে বাঘ হালুম করে হাঁটতে হাঁটতে সামনে এলো!\nরফু ভয় পেয়ে চিৎকার করে দৌড়ে পালাল, আর গরু রেগে বাঘকে তাড়া করল!`}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    যেকোনো গল্প ও পটভূমি লিখুন — AI স্প্রাইট, দৃশ্য, ক্যামেরা ও ভয়েস স্বাধীনভাবে সাজিয়ে নেবে
                  </span>
                  {!customScript.trim() && (
                    <button
                      type="button"
                      onClick={() =>
                        setCustomScript(
                          'সবুজ মাঠে রফু মনের আনন্দে হাঁটছে আর গরু ঘাস খাচ্ছে।\nহঠাৎ বাঘ হালুম করে সামনে এসে গর্জন করল!\nরফু (ভয়ে): ওরে বাবা রে! বাঘ এসেছে, বাঁচাও!\nবাঘ তাড়া করতেই রফু দৌড়ে পালাল, আর সাহসী গরু রেগে হাম্বা বলে বাঘকে গুতো দিতে তেড়ে এলো!'
                        )
                      }
                      className="font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900 whitespace-nowrap"
                    >
                      নমুনা স্ক্রিপ্ট বসান
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <input
                  type="text"
                  value={customHint}
                  onChange={(e) => setCustomHint(e.target.value)}
                  placeholder="চাইলে ১ লাইনে গল্পের আইডিয়া দিন (খালি রাখলে AI নিজেই স্প্রাইট চরিত্র নিয়ে নতুন গল্প লিখবে)"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />
                <p className="text-xs text-slate-500">
                  AI স্বাধীনভাবে দৃশ্যের সংখ্যা, স্প্রাইট চরিত্র, ব্যাকগ্রাউন্ড ও ডাবিং সাজাবে
                </p>
              </div>
            )}

            {/* Available Sprite Sheets & Backgrounds Helper */}
            {hybridAssets.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-800">
                    স্টুডিওতে যুক্ত স্প্রাইট শিট ও ব্যাকগ্রাউন্ড
                  </span>
                  <span className="text-[11px] text-slate-500">
                    নামে ক্লিক করলে স্ক্রিপ্টে যুক্ত হবে
                  </span>
                </div>

                {hybridAssets.some((a) => a.category === 'sprite_actor') && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 mr-1">
                      স্প্রাইট চরিত্র:
                    </span>
                    {hybridAssets
                      .filter((a) => a.category === 'sprite_actor')
                      .map((a) => {
                        const shortLabel = a.name.replace(/\s*\(.*?\)\s*/g, '').trim() || a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              if (creationMode === 'custom_script') {
                                setCustomScript((prev) =>
                                  prev.trim() ? `${prev.trimEnd()} ${shortLabel}` : shortLabel
                                );
                              } else {
                                setCustomHint((prev) =>
                                  prev.trim() ? `${prev.trimEnd()} ${shortLabel}` : shortLabel
                                );
                              }
                            }}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-slate-400 hover:text-slate-900 whitespace-nowrap"
                          >
                            {shortLabel}
                          </button>
                        );
                      })}
                  </div>
                )}

                {hybridAssets.some((a) => a.category === 'background') && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 mr-1">
                      ব্যাকগ্রাউন্ড:
                    </span>
                    {hybridAssets
                      .filter((a) => a.category === 'background')
                      .map((a) => {
                        const shortLabel = a.name.replace(/\s*\(.*?\)\s*/g, '').trim() || a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              if (creationMode === 'custom_script') {
                                setCustomScript((prev) =>
                                  prev.trim() ? `${prev.trimEnd()} (${shortLabel})` : shortLabel
                                );
                              } else {
                                setCustomHint((prev) =>
                                  prev.trim() ? `${prev.trimEnd()} (${shortLabel})` : shortLabel
                                );
                              }
                            }}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-slate-400 hover:text-slate-900 whitespace-nowrap"
                          >
                            {shortLabel}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerateVideo}
              disabled={isGenerating || isSynthesizingVoices}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
            >
              <Wand2 className="h-4 w-4" />
              <span>
                {isGenerating
                  ? 'AI স্ক্রিপ্ট ও দৃশ্য সাজাচ্ছে...'
                  : isSynthesizingVoices
                    ? 'লাউড বাংলা ডাবিং ও লিপ-সিংক তৈরি হচ্ছে...'
                    : creationMode === 'custom_script'
                      ? 'আমার স্ক্রিপ্ট থেকে ভিডিও বানান'
                      : 'AI দিয়ে সম্পূর্ণ নতুন ভিডিও বানান'}
              </span>
            </button>
          </section>

          {/* Recent Projects Strip */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                তৈরি করা প্রজেক্ট ({videos.length})
              </h2>
              <span className="text-xs text-slate-500">স্বয়ংক্রিয়ভাবে সেইভ থাকে</span>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {videos.map((item) => {
                const active = item.id === video.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectVideo(item)}
                    className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="max-w-[190px] truncate text-xs font-bold">{item.title}</div>
                    <div
                      className={`mt-0.5 font-mono-tabular text-[11px] ${
                        active ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {item.renderStyle === 'cartoon_2d' ? 'রঙিন' : 'সাদাকালো'} ·{' '}
                      {item.scenes.length} দৃশ্য · {item.totalDurationSec}s
                    </div>
                  </button>
                );
              })}
              {STARTER_VIDEOS.filter((sv) => !videos.some((v) => v.id === sv.id)).map((sv) => (
                <button
                  key={sv.id}
                  type="button"
                  onClick={() => onSelectVideo(sv)}
                  className="shrink-0 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                >
                  <div className="max-w-[190px] truncate text-xs font-bold">{sv.title}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">টেমপ্লেট খুলুন</div>
                </button>
              ))}
            </div>
          </section>

          {/* Clean Dialogue & Voice Line Editor (No cluttered technical dropdowns by default) */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">সংলাপ ও ভয়েস এডিটর</h2>
                <p className="text-xs text-slate-500">
                  দরকার হলে সংলাপ বদলান বা নিজের মাইক্রোফোন ভয়েস দিন · Play দিলেই আপডেট হবে
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSynthesizeVoicesForScript(video)}
                  disabled={isSynthesizingVoices}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                >
                  <Mic className="h-3.5 w-3.5" />
                  <span>{isSynthesizingVoices ? 'ডাবিং হচ্ছে...' : 'ভয়েস আপডেট'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdvancedEditor((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>{showAdvancedEditor ? 'সাধারণ ভিউ' : 'দৃশ্য টিউনিং'}</span>
                  {showAdvancedEditor ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Viral Hook Banner */}
            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                ভিডিওর ওপরের শিরোনাম (Hook Text)
              </label>
              <input
                type="text"
                value={video.hookBanner ?? video.title}
                onChange={(e) =>
                  onUpdateVideo({
                    ...video,
                    hookBanner: e.target.value,
                    title: e.target.value || video.title,
                  })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
              />
            </div>

            {showAdvancedEditor && (
              <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    ব্যাকগ্রাউন্ড মিউজিক
                  </label>
                  <select
                    value={video.musicStyle || 'cinematic_parody'}
                    onChange={(e) =>
                      onUpdateVideo({
                        ...video,
                        musicStyle: e.target.value as VideoMusicStyle,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="cinematic_parody">ড্রামাটিক প্যারোডি</option>
                    <option value="comedy">কমেডি পপ</option>
                    <option value="quirky">মজার কুইর্কি</option>
                    <option value="dramatic">টেনশন</option>
                    <option value="none">মিউজিক ছাড়া</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    সাবটাইটেল ধরন
                  </label>
                  <select
                    value={video.subtitleStyle || 'meme_clean'}
                    onChange={(e) =>
                      onUpdateVideo({
                        ...video,
                        subtitleStyle: e.target.value as VideoSubtitleStyle,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="meme_clean">ক্লিন মিম সাবটাইটেল</option>
                    <option value="reels_bold">বোল্ড কালো বক্স Reels</option>
                  </select>
                </div>
              </div>
            )}

            {/* Simple Dialogue Rows per Scene */}
            <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {video.scenes.map((sc, sIdx) => {
                const isActivePlaying = isPlaying && currentSceneInfo.sceneIndex === sIdx;
                const bgAsset = findAssetByIdOrTheme(sc.backgroundAssetId || sc.theme);
                const bgLabel =
                  bgAsset?.name ||
                  PROCEDURAL_THEME_OPTIONS.find((t) => t.value === sc.theme)?.label ||
                  sc.backgroundAssetId ||
                  sc.theme;
                const actorSummary = sc.characters
                  .map((ch) => {
                    const sprite =
                      ch.kind === 'human_rig'
                        ? undefined
                        : resolveSpriteAssetForCharacter(ch, sc.captionTop);
                    return sprite
                      ? `${ch.name} (স্প্রাইট: ${sprite.name})`
                      : `${ch.name} (${video.renderStyle === 'cartoon_2d' ? 'কার্টুন মানুষ' : 'স্টিক মানুষ'})`;
                  })
                  .join(' · ');

                return (
                  <div
                    key={sIdx}
                    className={`p-4 space-y-3 ${isActivePlaying ? 'bg-slate-50' : 'bg-white'}`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-slate-900">
                          দৃশ্য {sIdx + 1}
                          {sc.captionTop ? ` — ${sc.captionTop}` : ''}
                        </span>
                        <span className="font-mono-tabular text-slate-500">{sc.durationSec}s</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        ব্যাকগ্রাউন্ড: {bgLabel}
                        {actorSummary ? ` · চরিত্র: ${actorSummary}` : ''}
                      </p>
                    </div>

                    {showAdvancedEditor && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <select
                          value={sc.backgroundAssetId || sc.theme}
                          onChange={(e) => {
                            const val = e.target.value as VideoTheme;
                            const next = video.scenes.map((item, i) =>
                              i === sIdx
                                ? { ...item, theme: val, backgroundAssetId: val }
                                : item
                            );
                            onUpdateVideo({ ...video, scenes: next });
                          }}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
                        >
                          {hybridAssets
                            .filter((a) => a.category === 'background')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          {PROCEDURAL_THEME_OPTIONS.filter(
                            (o) => !hybridAssets.some((a) => a.id === o.value)
                          ).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={sc.camera}
                          onChange={(e) => {
                            const next = video.scenes.map((item, i) =>
                              i === sIdx ? { ...item, camera: e.target.value as VideoCamera } : item
                            );
                            onUpdateVideo({ ...video, scenes: next });
                          }}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
                        >
                          {CAMERA_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={sc.sfx}
                          onChange={(e) => {
                            const next = video.scenes.map((item, i) =>
                              i === sIdx ? { ...item, sfx: e.target.value as VideoSfx } : item
                            );
                            onUpdateVideo({ ...video, scenes: next });
                          }}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
                        >
                          {SFX_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>

                        <input
                          type="number"
                          min={2}
                          max={12}
                          step={0.5}
                          value={sc.durationSec}
                          onChange={(e) => {
                            const val = Math.max(2, Math.min(12, Number(e.target.value) || 4));
                            const next = video.scenes.map((item, i) =>
                              i === sIdx ? { ...item, durationSec: val } : item
                            );
                            const nextTotal = Number(
                              next.reduce((a, b) => a + b.durationSec, 0).toFixed(1)
                            );
                            onUpdateVideo({
                              ...video,
                              scenes: next,
                              totalDurationSec: nextTotal,
                            });
                          }}
                          className="rounded-md border border-slate-300 px-2 py-1.5 font-mono-tabular text-xs"
                        />
                      </div>
                    )}

                    <div className="space-y-2.5">
                      {sc.characters.map((ch, cIdx) => {
                        const recKey = `${sIdx}-${cIdx}`;
                        const isMicOn = recordingKey === recKey;
                        return (
                          <div key={cIdx} className="space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-700">
                                {ch.name}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleMicRecording(sIdx, cIdx)}
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
                                    isMicOn
                                      ? 'bg-red-600 text-white'
                                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  {isMicOn ? (
                                    <>
                                      <Square className="h-3 w-3" />
                                      <span>থামান</span>
                                    </>
                                  ) : (
                                    <>
                                      <Mic className="h-3 w-3" />
                                      <span>নিজের ভয়েস</span>
                                    </>
                                  )}
                                </button>
                                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100">
                                  <Upload className="h-3 w-3" />
                                  <span>MP3</span>
                                  <input
                                    type="file"
                                    accept="audio/*"
                                    className="hidden"
                                    onChange={(e) =>
                                      handleUploadCustomAudio(sIdx, cIdx, e.target.files?.[0])
                                    }
                                  />
                                </label>
                                {ch.customAudioDataUrl && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = video.scenes.map((item, i) =>
                                        i === sIdx
                                          ? {
                                              ...item,
                                              characters: item.characters.map((cc, j) =>
                                                j === cIdx
                                                  ? { ...cc, customAudioDataUrl: undefined }
                                                  : cc
                                              ),
                                            }
                                          : item
                                      );
                                      onUpdateVideo({ ...video, scenes: next });
                                    }}
                                    className="text-[11px] font-semibold text-red-600 hover:underline"
                                  >
                                    সরান
                                  </button>
                                )}
                              </div>
                            </div>

                            {showAdvancedEditor && (
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <select
                                    value={ch.kind || 'human_rig'}
                                    onChange={(e) => {
                                      const nextKind = e.target.value as CharacterKind;
                                      const defaultSprite = hybridAssets.find(
                                        (a) => a.category === 'sprite_actor'
                                      )?.id;
                                      const next = video.scenes.map((item, i) =>
                                        i === sIdx
                                          ? {
                                              ...item,
                                              characters: item.characters.map((cc, j) =>
                                                j === cIdx
                                                  ? {
                                                      ...cc,
                                                      kind: nextKind,
                                                      spriteAssetId:
                                                        nextKind === 'sprite_actor'
                                                          ? cc.spriteAssetId || defaultSprite
                                                          : undefined,
                                                    }
                                                  : cc
                                              ),
                                            }
                                          : item
                                      );
                                      onUpdateVideo({ ...video, scenes: next });
                                    }}
                                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                                  >
                                    <option value="human_rig">মানুষ (আর্টিকুলেটেড রিগ)</option>
                                    <option value="sprite_actor">প্রাণী / গাড়ি (স্প্রাইট শিট)</option>
                                  </select>

                                  {ch.kind === 'sprite_actor' ? (
                                    <select
                                      value={ch.spriteAssetId || ''}
                                      onChange={(e) => {
                                        const spId = e.target.value;
                                        const next = video.scenes.map((item, i) =>
                                          i === sIdx
                                            ? {
                                                ...item,
                                                characters: item.characters.map((cc, j) =>
                                                  j === cIdx
                                                    ? { ...cc, spriteAssetId: spId }
                                                    : cc
                                                ),
                                              }
                                            : item
                                        );
                                        onUpdateVideo({ ...video, scenes: next });
                                      }}
                                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                                    >
                                      {hybridAssets
                                        .filter((a) => a.category === 'sprite_actor')
                                        .map((a) => (
                                          <option key={a.id} value={a.id}>
                                            {a.name}
                                          </option>
                                        ))}
                                    </select>
                                  ) : (
                                    <select
                                      value={ch.outfitStyle || 'casual'}
                                      onChange={(e) => {
                                        const outfit = e.target.value as OutfitStyle;
                                        const next = video.scenes.map((item, i) =>
                                          i === sIdx
                                            ? {
                                                ...item,
                                                characters: item.characters.map((cc, j) =>
                                                  j === cIdx
                                                    ? { ...cc, outfitStyle: outfit }
                                                    : cc
                                                ),
                                              }
                                            : item
                                        );
                                        onUpdateVideo({ ...video, scenes: next });
                                      }}
                                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                                    >
                                      {OUTFIT_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                          {o.label}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <input
                                    type="text"
                                    value={ch.action || ''}
                                    onChange={(e) => {
                                      const next = video.scenes.map((item, i) =>
                                        i === sIdx
                                          ? {
                                              ...item,
                                              characters: item.characters.map((cc, j) =>
                                                j === cIdx
                                                  ? { ...cc, action: e.target.value }
                                                  : cc
                                              ),
                                            }
                                          : item
                                      );
                                      onUpdateVideo({ ...video, scenes: next });
                                    }}
                                    placeholder="অ্যাকশন (যেমন: walk_in, run, charge_butt)"
                                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900"
                                  />

                                  <select
                                    value={ch.voiceEffect || 'normal'}
                                    onChange={(e) => {
                                      const next = video.scenes.map((item, i) =>
                                        i === sIdx
                                          ? {
                                              ...item,
                                              characters: item.characters.map((cc, j) =>
                                                j === cIdx
                                                  ? {
                                                      ...cc,
                                                      voiceEffect: e.target
                                                        .value as VoiceEffectPreset,
                                                    }
                                                  : cc
                                              ),
                                            }
                                          : item
                                      );
                                      onUpdateVideo({ ...video, scenes: next });
                                    }}
                                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                                  >
                                    {VOICE_EFFECT_OPTIONS.map((o) => (
                                      <option key={o.value} value={o.value}>
                                        {o.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}

                            <input
                              type="text"
                              value={ch.speech || ''}
                              onChange={(e) => {
                                const next = video.scenes.map((item, i) =>
                                  i === sIdx
                                    ? {
                                        ...item,
                                        characters: item.characters.map((cc, j) =>
                                          j === cIdx ? { ...cc, speech: e.target.value } : cc
                                        ),
                                      }
                                    : item
                                );
                                onUpdateVideo({ ...video, scenes: next });
                              }}
                              placeholder="বাংলা সংলাপ লিখুন..."
                              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* RIGHT: Live 9:16 Video Preview + Render & Save */}
        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">লাইভ প্রিভিউ ও MP4 রেন্ডার</h2>
              <span className="font-mono-tabular text-xs text-slate-500">
                {elapsedSec.toFixed(1)}s / {totalDuration.toFixed(1)}s
              </span>
            </div>

            <div className="mt-3 flex justify-center rounded-xl border border-slate-200 bg-slate-100 p-3">
              <canvas
                ref={canvasRef}
                className={`rounded-lg border border-slate-300 bg-white shadow-sm ${
                  video.aspectRatio === '1:1'
                    ? 'aspect-square w-full max-w-[340px]'
                    : 'aspect-[9/16] max-h-[500px] w-auto'
                }`}
              />
            </div>

            {/* Scrubber */}
            <input
              type="range"
              min={0}
              max={Math.max(1, totalDuration)}
              step={0.1}
              value={elapsedSec}
              onChange={(e) => {
                stopPlayback();
                setElapsedSec(Number(e.target.value));
              }}
              className="mt-3 w-full accent-slate-900"
            />

            {/* Player Controls */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => (isPlaying ? stopPlayback() : startPlayback(elapsedSec))}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    <span>বিরতি</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    <span>প্লে করুন</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => startPlayback(0)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>শুরু</span>
              </button>
            </div>

            {/* Render & Permanent Save CTA */}
            <div className="mt-4 border-t border-slate-100 pt-4 space-y-2.5">
              <button
                type="button"
                onClick={handleRenderAndSave}
                disabled={isRecording || isGenerating}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                <span>
                  {isRecording
                    ? `${renderStage} (${renderPct}%)`
                    : 'ভিডিও রেন্ডার ও স্থায়ীভাবে সেইভ করুন (MP4)'}
                </span>
              </button>

              {isRecording && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-emerald-600 transition-all"
                    style={{ width: `${renderPct}%` }}
                  />
                </div>
              )}

              {lastRendered && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadBlob(
                        lastRendered.blob,
                        `rafu-folk-${Date.now()}.${lastRendered.extension}`
                      )
                    }
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>MP4 ডাউনলোড</span>
                  </button>

                  <button
                    type="button"
                    disabled={isPublishing || (!settings.pageAccessToken && !settings.webhookUrl)}
                    onClick={async () => {
                      setIsPublishing(true);
                      try {
                        await onPublishVideo(video, lastRendered);
                        setStatusMsg({
                          type: 'ok',
                          text: 'ভিডিও Facebook Page-এ সফলভাবে পোস্ট হয়েছে!',
                        });
                      } catch (err) {
                        setStatusMsg({
                          type: 'err',
                          text:
                            err instanceof Error ? err.message : 'Facebook পোস্ট ব্যর্থ হয়েছে।',
                        });
                      } finally {
                        setIsPublishing(false);
                      }
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{isPublishing ? 'পোস্ট হচ্ছে...' : 'Facebook-এ পোস্ট'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Facebook Caption Copy Box */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Facebook / Reels ক্যাপশন</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(video.fbCaption || '');
                    setCopiedCaption(true);
                    setTimeout(() => setCopiedCaption(false), 1800);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  {copiedCaption ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedCaption ? 'কপি হয়েছে' : 'কপি'}</span>
                </button>
              </div>
              <textarea
                rows={2}
                value={video.fbCaption}
                onChange={(e) => onUpdateVideo({ ...video, fbCaption: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800"
              />
            </div>
          </div>

          {/* Saved Rendered Videos Vault Panel */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Film className="h-4 w-4 text-slate-700" />
                <span>সংরক্ষিত ভিডিও গ্যালারি ({savedRenderedVideos.length})</span>
              </h2>
              <span className="text-xs text-slate-500">রিলোড করলেও থাকবে</span>
            </div>

            {playingSavedUrl && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-900 p-2.5">
                <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-white">
                  <span className="truncate">{playingSavedUrl.title}</span>
                  <button
                    type="button"
                    onClick={() => setPlayingSavedUrl(null)}
                    className="text-slate-300 hover:text-white"
                  >
                    বন্ধ করুন
                  </button>
                </div>
                <video
                  src={playingSavedUrl.url}
                  controls
                  autoPlay
                  className="max-h-[340px] w-full rounded bg-black"
                />
              </div>
            )}

            {savedRenderedVideos.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                এখনো কোনো রেন্ডার করা ভিডিও সেইভ করা হয়নি। ওপরের{' '}
                <strong>"ভিডিও রেন্ডার ও স্থায়ীভাবে সেইভ করুন"</strong> বাটনে চাপ দিলে এখানে স্থায়ীভাবে
                জমা হবে।
              </div>
            ) : (
              <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
                {savedRenderedVideos.map((sv) => (
                  <div
                    key={sv.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-slate-900">{sv.title}</div>
                      <div className="font-mono-tabular text-[11px] text-slate-500">
                        {sv.durationSec.toFixed(1)}s · {(sv.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                        · {sv.aspectRatio}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handlePlaySavedItem(sv)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        <span>দেখুন</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadSavedItem(sv)}
                        title="MP4 ডাউনলোড"
                        className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-100"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSavedRenderedVideo(sv.id)}
                        title="মুছে ফেলুন"
                        className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-500 hover:border-red-200 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
