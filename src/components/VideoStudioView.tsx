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
  Square,
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from 'lucide-react';
import type {
  AutomationSettings,
  SavedRenderedVideo,
  VideoAction,
  VideoAspectRatio,
  VideoCamera,
  VideoItem,
  VideoMusicStyle,
  VideoProp,
  VideoRenderStyle,
  VideoScene,
  VideoSfx,
  VideoStoryArc,
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

const THEME_OPTIONS: Array<{ value: 'auto' | VideoTheme; label: string }> = [
  { value: 'auto', label: 'অটো (দৃশ্য অনুযায়ী)' },
  { value: 'room_door', label: 'ঘরের দরজা ও করিডোর' },
  { value: 'bathroom_rush', label: 'বাথরুম ও টয়লেট' },
  { value: 'bedroom_night', label: 'রাতের রুম' },
  { value: 'exam_hall', label: 'পরীক্ষার হল' },
  { value: 'tea_stall', label: 'চা-দোকান ও আড্ডা' },
  { value: 'office_drama', label: 'অফিস ও বস' },
  { value: 'rain_storm', label: 'বৃষ্টি ও বজ্রপাত' },
  { value: 'desert_sun', label: 'রোদ ও মরুভূমি' },
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
  { value: 'knock_door', label: 'দরজায় কড়া নাড়া (ঠক ঠক)' },
  { value: 'dramatic_boom', label: 'সিনেমার ড্রামাটিক বুম' },
  { value: 'scream_sting', label: 'চমকানো চিৎকার স্টিং' },
  { value: 'door_creak', label: 'দরজা খোলার শব্দ' },
  { value: 'splat_funny', label: 'ফানি স্প্ল্যাট ও বোয়িং' },
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
  { value: 'knock_door', label: 'দরজা ধাক্কানো' },
  { value: 'desperate_squeeze', label: 'চেপে ধরে কাঁপা' },
  { value: 'scream_jaw', label: 'মুখ লম্বা করে চিৎকার' },
  { value: 'dramatic_closeup', label: 'হিরো/ভিলেন ক্লোজ-আপ' },
  { value: 'door_peek', label: 'দরজা খুলে উঁকি' },
  { value: 'collapsed_mess', label: 'মাটিতে বসে পড়া' },
  { value: 'idle', label: 'দাঁড়িয়ে থাকা' },
  { value: 'walk_in', label: 'হেঁটে আসা' },
  { value: 'laugh', label: 'হাসা' },
  { value: 'point_laugh', label: 'আঙুল তুলে হাসা' },
  { value: 'panting', label: 'হাঁপানো' },
  { value: 'shocked_jump', label: 'চমকে লাফ' },
  { value: 'eye_pop', label: 'চোখ বেরিয়ে আসা' },
  { value: 'facepalm', label: 'মাথায় হাত' },
  { value: 'hands_up', label: 'হাত তোলা' },
  { value: 'run', label: 'দৌড়ানো' },
];

const PROP_OPTIONS: Array<{ value: VideoProp; label: string }> = [
  { value: 'none', label: 'কিছু নেই' },
  { value: 'door_closed', label: 'বন্ধ দরজা' },
  { value: 'door_open', label: 'খোলা দরজা' },
  { value: 'toilet_squat', label: 'টয়লেট প্যান' },
  { value: 'splat_mess', label: 'মেঝেতে ছিটকে পড়া দাগ' },
  { value: 'tea_cup', label: 'চায়ের কাপ' },
  { value: 'smartphone', label: 'স্মার্টফোন' },
  { value: 'money', label: 'টাকার নোট' },
  { value: 'clock', label: 'ঘড়ি' },
];

const VOICE_EFFECT_OPTIONS: Array<{ value: VoiceEffectPreset; label: string }> = [
  { value: 'normal', label: 'স্বাভাবিক কণ্ঠ' },
  { value: 'panicked', label: 'আতঙ্কিত / তাড়াহুড়ো' },
  { value: 'dramatic_boss', label: 'ড্রামাটিক সিনেমার বেজ + ইকো' },
  { value: 'cartoon_high', label: 'ফানি কার্টুন চিকন কণ্ঠ' },
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
  const [renderStyle, setRenderStyle] = useState<VideoRenderStyle>(
    video.renderStyle || 'stick_meme'
  );
  const [category, setCategory] = useState<string>('auto');
  const [themeChoice, setThemeChoice] = useState<'auto' | VideoTheme>('auto');
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(video.aspectRatio || '9:16');
  const [dialogueMode, setDialogueMode] = useState<'bangla' | 'silent'>('bangla');
  const [musicStyle, setMusicStyle] = useState<VideoMusicStyle>(
    video.musicStyle || 'cinematic_parody'
  );
  const [voiceEngine, setVoiceEngine] = useState<VideoVoiceEngine>(video.voiceEngine || 'auto');
  const [storyArc, setStoryArc] = useState<VideoStoryArc>(video.storyArc || 'viral_story');
  const [subtitleStyle, setSubtitleStyle] = useState<VideoSubtitleStyle>(
    video.subtitleStyle || 'meme_clean'
  );
  const [customHint, setCustomHint] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSynthesizingVoices, setIsSynthesizingVoices] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  const [renderStage, setRenderStage] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [lastRendered, setLastRendered] = useState<RenderedVideoResult | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [expandedScene, setExpandedScene] = useState<number | null>(0);
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [playingSavedUrl, setPlayingSavedUrl] = useState<{ id: string; url: string; title: string } | null>(null);

  const totalDuration = video.scenes.reduce((acc, s) => acc + Math.max(1.5, s.durationSec), 0);

  useEffect(() => {
    preloadThemeBackgrounds().catch(() => {});
  }, []);

  useEffect(() => {
    setRenderStyle(video.renderStyle || 'stick_meme');
    setAspectRatio(video.aspectRatio || '9:16');
    setMusicStyle(video.musicStyle || 'cinematic_parody');
    setSubtitleStyle(video.subtitleStyle || 'meme_clean');
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

  // Paint frame whenever elapsedSec or video changes while paused
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
  }, [video, settings, elapsedSec, isPlaying]);

  useEffect(() => {
    if (video.voiceClips && video.voiceClips.length > 0) {
      prepareLipSyncForScript(video).catch(() => {});
    }
  }, [video.id, video.voiceClips]);

  const needsVoiceSynthesis = (target: VideoItem): boolean => {
    if ((target.voiceEngine || voiceEngine) === 'none') return false;
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

  const startPlayback = async (fromSec = elapsedSec) => {
    stopPlayback();

    let workingVideo = video;
    if (needsVoiceSynthesis(video)) {
      setStatusMsg({
        type: 'ok',
        text: 'স্ক্রিপ্ট অনুযায়ী লাউড বাংলা ভয়েস ও লিপ-সিংক তৈরি হচ্ছে...',
      });
      try {
        workingVideo = await handleSynthesizeVoicesForScript(video, voiceEngine);
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

  const handleSynthesizeVoicesForScript = async (
    targetScript: VideoItem,
    engineOverride?: VideoVoiceEngine
  ): Promise<VideoItem> => {
    const engine = engineOverride || voiceEngine;
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

  const handleAutoGenerate = async () => {
    stopPlayback();
    setIsGenerating(true);
    setStatusMsg(null);
    setLastRendered(null);

    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          theme: themeChoice,
          renderStyle,
          aspectRatio,
          dialogueMode,
          musicStyle,
          storyArc,
          targetDurationSec: storyArc === 'viral_story' ? 22 : 13,
          customHint,
          recentTitles: videos.slice(0, 8).map((v) => v.title),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI ভিডিও তৈরি করা যায়নি।');

      const newVideo: VideoItem = {
        ...data,
        status: 'draft',
        voiceEngine,
        subtitleStyle,
      };
      onCreateVideo(newVideo);

      if (dialogueMode === 'bangla' && voiceEngine !== 'none') {
        setStatusMsg({
          type: 'ok',
          text: 'গল্প তৈরি হয়েছে! এখন কপিরাইট-ফ্রি বাংলা ডাবিং ও ভয়েস ইফেক্ট যুক্ত হচ্ছে...',
        });
        await handleSynthesizeVoicesForScript(newVideo, voiceEngine);
      }

      setStatusMsg({
        type: 'ok',
        text: '১০০% কপিরাইট-ফ্রি অটো ভিডিও ও ডাবিং প্রস্তুত! এখন Play বা Render & Save চাপুন।',
      });
      setExpandedScene(0);
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
      const hasSpeech = video.scenes.some((s) =>
        s.characters.some((c) => (c.speech || '').trim().length > 0 && !c.customAudioDataUrl)
      );
      if (hasSpeech && (!video.voiceClips || video.voiceClips.length === 0) && voiceEngine !== 'none') {
        setRenderStage('বাংলা AI ডাবিং তৈরি হচ্ছে...');
        workingVideo = await handleSynthesizeVoicesForScript(video, voiceEngine);
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
      {/* Top Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            স্টিক ফিগার ও কার্টুন ভিডিও স্টুডিও
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            ১০০% কপিরাইট-ফ্রি · অটো বাংলা স্ক্রিপ্ট ও ড্রামাটিক ডাবিং · স্থায়ী MP4 সংরক্ষণ
          </p>
        </div>

        {/* Style Mode Segmented Switcher */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setRenderStyle('stick_meme');
              onUpdateVideo({ ...video, renderStyle: 'stick_meme', subtitleStyle: 'meme_clean' });
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              renderStyle === 'stick_meme'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            স্টিক ফিগার মিম (সাদাকালো)
          </button>
          <button
            type="button"
            onClick={() => {
              setRenderStyle('cartoon_2d');
              onUpdateVideo({ ...video, renderStyle: 'cartoon_2d', subtitleStyle: 'reels_bold' });
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              renderStyle === 'cartoon_2d'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ২ডি রঙিন কার্টুন
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
        {/* LEFT: AI Generator + Scene Storyboard */}
        <div className="space-y-6 lg:col-span-7">
          {/* Auto AI Generator Panel */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">
                ১. অটোমেটিক কপিরাইট-ফ্রি মিম ভিডিও তৈরি (AI)
              </h2>
              <span className="font-mono-tabular text-xs text-slate-500">
                {storyArc === 'viral_story' ? '৪ দৃশ্য · ~২২ সেকেন্ড' : '৩ দৃশ্য · ~১৩ সেকেন্ড'}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  গল্পের ধরন
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="auto">অটো (সেরা ভাইরাল ক্যাটাগরি)</option>
                  <option value="বন্ধুদের আড্ডা ও মেস লাইফ">বন্ধুদের আড্ডা ও মেস লাইফ</option>
                  <option value="টাকা ধার ও কৃপণ বন্ধু">টাকা ধার ও কৃপণ বন্ধু</option>
                  <option value="দৈনন্দিন মজার বিব্রতকর ঘটনা">দৈনন্দিন বিব্রতকর ঘটনা</option>
                  <option value="চা-দোকানের বুদ্ধিজীবী গপ্পো">চা-দোকানের গপ্পো</option>
                  <option value="অফিস, বস ও ছুটির বাহানা">অফিস ও বস</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  ভয়েস ও ব্যাকগ্রাউন্ড মিউজিক
                </label>
                <select
                  value={musicStyle}
                  onChange={(e) => {
                    const val = e.target.value as VideoMusicStyle;
                    setMusicStyle(val);
                    onUpdateVideo({ ...video, musicStyle: val });
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="cinematic_parody">ড্রামাটিক প্যারোডি (কপিরাইট-ফ্রি)</option>
                  <option value="comedy">কমেডি পপ মিউজিক (কপিরাইট-ফ্রি)</option>
                  <option value="quirky">মজার কুইর্কি টিউন</option>
                  <option value="dramatic">সিরিয়াস টেনশন টিউন</option>
                  <option value="none">মিউজিক ছাড়া</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  পরিবেশ / দৃশ্যপট
                </label>
                <select
                  value={themeChoice}
                  onChange={(e) => setThemeChoice(e.target.value as 'auto' | VideoTheme)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {THEME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  ডাবিং ভয়েস ইঞ্জিন
                </label>
                <select
                  value={voiceEngine}
                  onChange={(e) => setVoiceEngine(e.target.value as VideoVoiceEngine)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="auto">অটো নিউরাল বাংলা + FFmpeg FX</option>
                  <option value="gemini_tts">Gemini AI ভয়েস + ড্রামাটিক FX</option>
                  <option value="none">নীরব (সাবটাইটেল + সাউন্ড ইফেক্ট)</option>
                </select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setStoryArc('viral_story')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                    storyArc === 'viral_story'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  ভাইরাল গল্প (~২২ সে.)
                </button>
                <button
                  type="button"
                  onClick={() => setStoryArc('quick_short')}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                    storyArc === 'quick_short'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  শর্ট মিম (~১৩ সে.)
                </button>
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAspectRatio('9:16');
                    onUpdateVideo({ ...video, aspectRatio: '9:16' });
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                    aspectRatio === '9:16'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  ৯:১৬ Reels/Shorts
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAspectRatio('1:1');
                    onUpdateVideo({ ...video, aspectRatio: '1:1' });
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                    aspectRatio === '1:1'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  ১:১ বর্গাকার
                </button>
              </div>

              <button
                type="button"
                onClick={() => setDialogueMode(dialogueMode === 'bangla' ? 'silent' : 'bangla')}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                {dialogueMode === 'bangla' ? 'কথা বলবে (বাংলা ডাবিং)' : 'নীরব স্ল্যাপস্টিক'}
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
              <input
                type="text"
                value={customHint}
                onChange={(e) => setCustomHint(e.target.value)}
                placeholder="আপনার গল্পের আইডিয়া লিখুন (যেমন: মেসের বাথরুমে বন্ধু আটকা, পরীক্ষার হলে নকল ধরা...)"
                className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={handleAutoGenerate}
                disabled={isGenerating || isSynthesizingVoices}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <Wand2 className="h-4 w-4" />
                <span>
                  {isGenerating
                    ? 'স্ক্রিপ্ট তৈরি হচ্ছে...'
                    : isSynthesizingVoices
                      ? 'ডাবিং হচ্ছে...'
                      : 'অটো ভিডিও বানান'}
                </span>
              </button>
            </div>
          </section>

          {/* Starter Templates & Recent Projects Strip */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                প্রজেক্ট ও রেডি টেমপ্লেট ({videos.length})
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
                      {item.renderStyle === 'cartoon_2d' ? '2D' : 'Stick'} · {item.scenes.length}{' '}
                      দৃশ্য · {item.totalDurationSec}s
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

          {/* Top Hook Banner & Scene Storyboard Editor */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">২. দৃশ্য, অ্যাকশন ও ডাবিং এডিটর</h2>
              <button
                type="button"
                onClick={() => handleSynthesizeVoicesForScript(video)}
                disabled={isSynthesizingVoices}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <Mic className="h-3.5 w-3.5" />
                <span>{isSynthesizingVoices ? 'ডাবিং হচ্ছে...' : 'ডাবিং রিজেনারেট করুন'}</span>
              </button>
            </div>

            {/* Viral Hook Banner Input */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  ওপরের ভাইরাল হুক বক্স (Hook Text)
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
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  সাবটাইটেল স্টাইল
                </label>
                <select
                  value={video.subtitleStyle || subtitleStyle}
                  onChange={(e) => {
                    const val = e.target.value as VideoSubtitleStyle;
                    setSubtitleStyle(val);
                    onUpdateVideo({ ...video, subtitleStyle: val });
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="meme_clean">ক্লিন মিম সাবটাইটেল (ভিডিওর মতো)</option>
                  <option value="reels_bold">বোল্ড কালো বক্স Reels</option>
                </select>
              </div>
            </div>

            {/* Scenes Accordion */}
            <div className="mt-4 space-y-2.5">
              {video.scenes.map((sc, sIdx) => {
                const isOpen = expandedScene === sIdx;
                const isActivePlaying = isPlaying && currentSceneInfo.sceneIndex === sIdx;
                return (
                  <div
                    key={sIdx}
                    className={`rounded-lg border ${
                      isActivePlaying ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedScene(isOpen ? null : sIdx)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-900">
                          দৃশ্য {sIdx + 1}: {sc.captionTop || sc.theme}
                        </span>
                        <span className="ml-2 font-mono-tabular text-xs text-slate-500">
                          {sc.durationSec}s · {sc.splitScreen ? 'স্প্লিট-স্ক্রিন' : 'সিঙ্গেল'} · {sc.sfx}
                        </span>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-200 p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                              থিম / রুম
                            </label>
                            <select
                              value={sc.theme}
                              onChange={(e) => {
                                const next = video.scenes.map((item, i) =>
                                  i === sIdx ? { ...item, theme: e.target.value as VideoTheme } : item
                                );
                                onUpdateVideo({ ...video, scenes: next });
                              }}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                            >
                              {THEME_OPTIONS.filter((o) => o.value !== 'auto').map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                              ক্যামেরা
                            </label>
                            <select
                              value={sc.camera}
                              onChange={(e) => {
                                const next = video.scenes.map((item, i) =>
                                  i === sIdx
                                    ? { ...item, camera: e.target.value as VideoCamera }
                                    : item
                                );
                                onUpdateVideo({ ...video, scenes: next });
                              }}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                            >
                              {CAMERA_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                              সাউন্ড ইফেক্ট (কপিরাইট-ফ্রি)
                            </label>
                            <select
                              value={sc.sfx}
                              onChange={(e) => {
                                const next = video.scenes.map((item, i) =>
                                  i === sIdx ? { ...item, sfx: e.target.value as VideoSfx } : item
                                );
                                onUpdateVideo({ ...video, scenes: next });
                              }}
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                            >
                              {SFX_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                              সময় (সেকেন্ড)
                            </label>
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
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono-tabular text-xs"
                            />
                          </div>
                        </div>

                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={Boolean(sc.splitScreen)}
                            onChange={(e) => {
                              const next = video.scenes.map((item, i) =>
                                i === sIdx ? { ...item, splitScreen: e.target.checked } : item
                              );
                              onUpdateVideo({ ...video, scenes: next });
                            }}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span>স্প্লিট-স্ক্রিন (দুই পর্দায় দুই চরিত্র)</span>
                        </label>

                        {/* Characters inside scene */}
                        <div className="space-y-3">
                          {sc.characters.map((ch, cIdx) => {
                            const recKey = `${sIdx}-${cIdx}`;
                            const isMicOn = recordingKey === recKey;
                            return (
                              <div
                                key={cIdx}
                                className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-slate-900">
                                    চরিত্র {cIdx + 1}: {ch.name} ({ch.side})
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleMicRecording(sIdx, cIdx)}
                                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
                                        isMicOn
                                          ? 'bg-red-600 text-white'
                                          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
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
                                          <span>নিজের ভয়েস দিন</span>
                                        </>
                                      )}
                                    </button>
                                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
                                      <Upload className="h-3 w-3" />
                                      <span>MP3 দিন</span>
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
                                        কাস্টম অডিও সরান
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                  <select
                                    value={ch.action}
                                    onChange={(e) => {
                                      const next = video.scenes.map((item, i) =>
                                        i === sIdx
                                          ? {
                                              ...item,
                                              characters: item.characters.map((cc, j) =>
                                                j === cIdx
                                                  ? { ...cc, action: e.target.value as VideoAction }
                                                  : cc
                                              ),
                                            }
                                          : item
                                      );
                                      onUpdateVideo({ ...video, scenes: next });
                                    }}
                                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
                                  >
                                    {ACTION_OPTIONS.map((o) => (
                                      <option key={o.value} value={o.value}>
                                        অ্যাকশন: {o.label}
                                      </option>
                                    ))}
                                  </select>

                                  <select
                                    value={ch.prop}
                                    onChange={(e) => {
                                      const next = video.scenes.map((item, i) =>
                                        i === sIdx
                                          ? {
                                              ...item,
                                              characters: item.characters.map((cc, j) =>
                                                j === cIdx
                                                  ? { ...cc, prop: e.target.value as VideoProp }
                                                  : cc
                                              ),
                                            }
                                          : item
                                      );
                                      onUpdateVideo({ ...video, scenes: next });
                                    }}
                                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
                                  >
                                    {PROP_OPTIONS.map((o) => (
                                      <option key={o.value} value={o.value}>
                                        প্রপ: {o.label}
                                      </option>
                                    ))}
                                  </select>

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
                                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
                                  >
                                    {VOICE_EFFECT_OPTIONS.map((o) => (
                                      <option key={o.value} value={o.value}>
                                        ভয়েস FX: {o.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

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
                                  placeholder="বাংলা ডায়লগ লিখুন..."
                                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
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
                          text: err instanceof Error ? err.message : 'Facebook পোস্ট ব্যর্থ হয়েছে।',
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
                  {copiedCaption ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
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
                <strong>"ভিডিও রেন্ডার ও স্থায়ীভাবে সেইভ করুন"</strong> বাটনে চাপ দিলে এখানে স্থায়ীভাবে জমা হবে।
              </div>
            ) : (
              <div className="mt-3 space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {savedRenderedVideos.map((sv) => (
                  <div
                    key={sv.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-slate-900">{sv.title}</div>
                      <div className="font-mono-tabular text-[11px] text-slate-500">
                        {sv.durationSec.toFixed(1)}s · {(sv.sizeBytes / (1024 * 1024)).toFixed(2)} MB ·{' '}
                        {sv.aspectRatio}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
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
