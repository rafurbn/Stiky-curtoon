import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  Film,
  Layers,
  LayoutGrid,
  Palette,
  Share2,
  Wand2,
} from 'lucide-react';
import type {
  AutomationSettings,
  ComicItem,
  LayoutMode,
  PublishLogEntry,
  SavedRenderedVideo,
  VideoItem,
} from './types/comic';
import { STARTER_COMICS } from './lib/defaultComic';
import { STARTER_VIDEOS } from './lib/defaultVideos';
import { renderOffscreenPng } from './lib/cartoonRenderer';
import type { RenderedVideoResult } from './lib/videoRenderer';
import {
  computeUpcomingBdSlots,
  DEFAULT_BD_SLOTS,
  getBdDateKey,
} from './lib/scheduleHelper';
import {
  deleteRenderedVideoFromVault,
  listRenderedVideosFromVault,
  loadVideoProjectsFromVault,
  saveRenderedVideoToVault,
  saveVideoProjectsToVault,
} from './lib/videoStorage';
import { RafuFolkLogo } from './components/RafuFolkLogo';
import { StudioView } from './components/StudioView';
import { VideoStudioView } from './components/VideoStudioView';
import { AssetLibraryView } from './components/AssetLibraryView';
import { BrandingView } from './components/BrandingView';
import { FacebookAutoView } from './components/FacebookAutoView';
import { HistoryQueueView } from './components/HistoryQueueView';

type AppTab = 'video' | 'assets' | 'studio' | 'history' | 'branding' | 'automation';

const SETTINGS_KEY = 'rafu_folk_settings_v2';
const COMICS_KEY = 'rafu_folk_comics_v2';
const LOGS_KEY = 'rafu_folk_logs_v2';

const DEFAULT_SETTINGS: AutomationSettings = {
  logoText: '@@RAFU FOLK@@',
  logoPlacement: 'bottom-right',
  logoStyle: 'stamp-dark',
  logoOpacity: 0.55,
  pageId: '',
  pageAccessToken: '',
  webhookUrl: '',
  autoPilotEnabled: false,
  intervalHours: 6,
  randomJitterMinutes: 10,
  dailyCap: 3,
  dailySlots: DEFAULT_BD_SLOTS,
  timezone: 'Asia/Dhaka',
  useExactSlots: true,
  preferredCategory: 'auto',
  languageMode: 'bangla',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('video');

  const [settings, setSettings] = useState<AutomationSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [comics, setComics] = useState<ComicItem[]>(() => {
    try {
      const saved = localStorage.getItem(COMICS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return STARTER_COMICS;
  });

  const [videos, setVideos] = useState<VideoItem[]>(STARTER_VIDEOS);
  const [activeVideoId, setActiveVideoId] = useState<string>(STARTER_VIDEOS[0].id);
  const [activeComicId, setActiveComicId] = useState<string>(comics[0]?.id || STARTER_COMICS[0].id);
  const [savedRenderedVideos, setSavedRenderedVideos] = useState<SavedRenderedVideo[]>([]);
  const [vaultReady, setVaultReady] = useState(false);

  const [logs, setLogs] = useState<PublishLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem(LOGS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    label: string;
  } | null>(null);
  const [batchBanner, setBatchBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hydrate persistent Video Projects & Saved MP4 Videos from IndexedDB + Server Disk
  useEffect(() => {
    let cancelled = false;
    async function hydratePersistence() {
      const [vaultProjects, serverProjectsRes, vaultRendered, serverRenderedRes] =
        await Promise.all([
          loadVideoProjectsFromVault(),
          fetch('/api/video-projects')
            .then((r) => r.json())
            .catch(() => ({ projects: [] })),
          listRenderedVideosFromVault(),
          fetch('/api/saved-videos')
            .then((r) => r.json())
            .catch(() => ({ videos: [] })),
        ]);

      if (cancelled) return;

      const serverProjects = Array.isArray(serverProjectsRes?.projects)
        ? (serverProjectsRes.projects as VideoItem[])
        : [];
      const mergedMap = new Map<string, VideoItem>();
      [...vaultProjects, ...serverProjects, ...STARTER_VIDEOS].forEach((v) => {
        if (v && v.id && !mergedMap.has(v.id)) {
          mergedMap.set(v.id, v);
        }
      });
      const mergedProjects = Array.from(mergedMap.values());
      if (mergedProjects.length > 0) {
        setVideos(mergedProjects);
        setActiveVideoId(mergedProjects[0].id);
      }

      const serverRendered = Array.isArray(serverRenderedRes?.videos)
        ? (serverRenderedRes.videos as SavedRenderedVideo[])
        : [];
      const renderedMap = new Map<string, SavedRenderedVideo>();
      [...vaultRendered, ...serverRendered].forEach((rv) => {
        if (rv && rv.id && !renderedMap.has(rv.id)) {
          renderedMap.set(rv.id, rv);
        }
      });
      setSavedRenderedVideos(
        Array.from(renderedMap.values()).sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        )
      );
      setVaultReady(true);
    }
    hydratePersistence();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist settings, comics, and logs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(COMICS_KEY, JSON.stringify(comics.slice(0, 40)));
    } catch {
      // ignore
    }
  }, [comics]);

  useEffect(() => {
    try {
      localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, 50)));
    } catch {
      // ignore
    }
  }, [logs]);

  // Persist video projects to IndexedDB + Server JSON whenever updated (after hydration)
  useEffect(() => {
    if (!vaultReady) return;
    saveVideoProjectsToVault(videos).catch(() => {});
    // Save lightweight project metadata (without huge voiceClips if >15MB, keep all scenes)
    fetch('/api/video-projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projects: videos.slice(0, 25).map((v) => ({ ...v, voiceClips: undefined })),
      }),
    }).catch(() => {});
  }, [videos, vaultReady]);

  const activeVideo = videos.find((v) => v.id === activeVideoId) || videos[0] || STARTER_VIDEOS[0];
  const activeComic = comics.find((c) => c.id === activeComicId) || comics[0] || STARTER_COMICS[0];

  const updateSettings = useCallback((patch: Partial<AutomationSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateVideo = useCallback((updated: VideoItem) => {
    setVideos((prev) => {
      const exists = prev.some((v) => v.id === updated.id);
      if (!exists) return [updated, ...prev];
      return prev.map((v) => (v.id === updated.id ? updated : v));
    });
  }, []);

  const updateComic = useCallback((updated: ComicItem) => {
    setComics((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }, []);

  const handleSaveRenderedVideo = useCallback(
    async (vid: VideoItem, rendered: RenderedVideoResult): Promise<SavedRenderedVideo> => {
      const id = `saved_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      let meta: SavedRenderedVideo = {
        id,
        videoId: vid.id,
        title: vid.title,
        category: vid.category,
        renderStyle: vid.renderStyle || 'stick_meme',
        aspectRatio: vid.aspectRatio,
        durationSec: rendered.durationSec,
        sizeBytes: rendered.blob.size,
        mimeType: rendered.mimeType,
        createdAt: new Date().toISOString(),
        fbCaption: vid.fbCaption,
      };

      // Upload & permanently save to Server Disk
      try {
        const form = new FormData();
        form.append('video', rendered.blob, `${id}.${rendered.extension}`);
        form.append('id', id);
        form.append('videoId', vid.id);
        form.append('title', vid.title);
        form.append('category', vid.category);
        form.append('renderStyle', vid.renderStyle || 'stick_meme');
        form.append('aspectRatio', vid.aspectRatio);
        form.append('durationSec', String(rendered.durationSec));
        form.append('fbCaption', vid.fbCaption || '');

        const res = await fetch('/api/saved-videos', {
          method: 'POST',
          body: form,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.saved) {
            meta = { ...meta, ...data.saved };
          }
        }
      } catch (err) {
        console.warn('Server video save fallback to IndexedDB:', err);
      }

      // Always mirror in browser IndexedDB for instant offline playback
      await saveRenderedVideoToVault(meta, rendered.blob);
      setSavedRenderedVideos((prev) => [meta, ...prev.filter((x) => x.id !== meta.id)]);
      return meta;
    },
    []
  );

  const handleDeleteSavedRenderedVideo = useCallback(async (id: string) => {
    await deleteRenderedVideoFromVault(id);
    await fetch(`/api/saved-videos/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
      () => {}
    );
    setSavedRenderedVideos((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const generateComicRequest = async (opts: {
    category: string;
    languageMode: 'bangla' | 'banglish' | 'mixed';
    layout: LayoutMode | 'auto';
    customHint: string;
  }) => {
    setIsGenerating(true);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/generate-comic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'কার্টুন তৈরি ব্যর্থ হয়েছে।');
      const newComic: ComicItem = { ...data, status: 'draft' };
      setComics((prev) => [newComic, ...prev]);
      setActiveComicId(newComic.id);
      setStatusBanner({ type: 'ok', text: 'নতুন অটো কার্টুন তৈরি হয়েছে!' });
      return newComic;
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'কার্টুন তৈরি করা যায়নি।',
      });
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const publishComicItem = async (comic: ComicItem, scheduledDate?: Date) => {
    setPublishingId(comic.id);
    setStatusBanner(null);
    try {
      const imageDataUrl =
        comic.id === activeComic.id && canvasRef.current
          ? canvasRef.current.toDataURL('image/png')
          : await renderOffscreenPng(comic, settings);

      if (settings.pageId && settings.pageAccessToken) {
        const scheduledPublishTime = scheduledDate
          ? Math.floor(scheduledDate.getTime() / 1000)
          : undefined;
        const res = await fetch('/api/facebook/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageId: settings.pageId,
            pageAccessToken: settings.pageAccessToken,
            caption: comic.fbCaption,
            imageDataUrl,
            scheduledPublishTime,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Facebook পোস্ট ব্যর্থ হয়েছে।');

        const updated: ComicItem = {
          ...comic,
          status: scheduledDate ? 'scheduled' : 'published',
          scheduledFor: scheduledDate?.toISOString(),
          publishedAt: scheduledDate ? undefined : new Date().toISOString(),
          fbPostId: data.postId,
          publishTarget: 'facebook_page',
        };
        updateComic(updated);
        setLogs((prev) => [
          {
            id: `log_${Date.now()}`,
            comicId: comic.id,
            title: comic.title,
            target: 'facebook_page',
            status: 'published',
            fbPostId: data.postId,
            timestamp: new Date().toISOString(),
          },
          ...prev,
        ]);
        setStatusBanner({ type: 'ok', text: 'Facebook Page-এ সফলভাবে পোস্ট হয়েছে!' });
      } else if (settings.webhookUrl) {
        const res = await fetch('/api/webhook/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            webhookUrl: settings.webhookUrl,
            payload: { comic, imageDataUrl },
          }),
        });
        if (!res.ok) throw new Error('Webhook পোস্ট ব্যর্থ হয়েছে।');
        updateComic({ ...comic, status: 'published', publishedAt: new Date().toISOString() });
        setStatusBanner({ type: 'ok', text: 'Webhook-এ পাঠানো হয়েছে!' });
      } else {
        throw new Error('আগে Facebook অটো ট্যাব থেকে Page ID ও Token দিন।');
      }
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'পোস্ট ব্যর্থ হয়েছে।',
      });
    } finally {
      setPublishingId(null);
    }
  };

  const publishVideoItem = async (
    vid: VideoItem,
    rendered: RenderedVideoResult,
    scheduledDate?: Date
  ) => {
    if (!settings.pageId || !settings.pageAccessToken) {
      throw new Error('Facebook-এ পোস্ট করতে Page ID ও Access Token সেট করুন।');
    }
    const form = new FormData();
    form.append('video', rendered.blob, `rafu-folk-${Date.now()}.${rendered.extension}`);
    form.append('pageId', settings.pageId);
    form.append('pageAccessToken', settings.pageAccessToken);
    form.append('title', vid.title);
    form.append('description', vid.fbCaption);
    if (scheduledDate) {
      form.append('scheduledPublishTime', String(Math.floor(scheduledDate.getTime() / 1000)));
    }
    const res = await fetch('/api/facebook/publish-video', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ভিডিও পোস্ট ব্যর্থ হয়েছে।');

    updateVideo({
      ...vid,
      status: scheduledDate ? 'scheduled' : 'published',
      fbPostId: data.postId,
      publishedAt: scheduledDate ? undefined : new Date().toISOString(),
    });
  };

  const handleDownloadComic = async (comic: ComicItem) => {
    const dataUrl =
      comic.id === activeComic.id && canvasRef.current
        ? canvasRef.current.toDataURL('image/png')
        : await renderOffscreenPng(comic, settings);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${comic.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleGenerateAndPublish = async (opts: {
    category: string;
    languageMode: 'bangla' | 'banglish' | 'mixed';
    layout: LayoutMode | 'auto';
    customHint: string;
  }) => {
    const created = await generateComicRequest(opts);
    if (created) {
      await publishComicItem(created);
    }
  };

  const handleBatchSchedule = async (daysCount: number, publishToFacebook = true) => {
    setBatchBanner(null);
    const totalCount = Math.max(1, daysCount * Math.max(1, settings.dailySlots.length));
    const slots = computeUpcomingBdSlots(
      settings.dailySlots,
      totalCount,
      settings.randomJitterMinutes
    );
    for (let i = 0; i < totalCount; i++) {
      setBatchProgress({
        current: i + 1,
        total: totalCount,
        label: `কার্টুন তৈরি ও শিডিউল হচ্ছে (${i + 1}/${totalCount})`,
      });
      const created = await generateComicRequest({
        category: settings.preferredCategory || 'auto',
        languageMode: settings.languageMode || 'bangla',
        layout: 'auto',
        customHint: '',
      });
      if (created && slots[i] && publishToFacebook) {
        await publishComicItem(created, slots[i]);
      }
    }
    setBatchProgress(null);
    setBatchBanner({ type: 'ok', text: `${totalCount}টি কার্টুন শিডিউল সম্পন্ন হয়েছে!` });
  };

  const handleScheduleDraftsToFacebook = async () => {
    const drafts = comics.filter((c) => c.status === 'draft').slice(0, 6);
    if (drafts.length === 0) return;
    const slots = computeUpcomingBdSlots(
      settings.dailySlots,
      drafts.length,
      settings.randomJitterMinutes
    );
    for (let i = 0; i < drafts.length; i++) {
      setBatchProgress({
        current: i + 1,
        total: drafts.length,
        label: `ড্রাফট শিডিউল হচ্ছে (${i + 1}/${drafts.length})`,
      });
      if (slots[i]) await publishComicItem(drafts[i], slots[i]);
    }
    setBatchProgress(null);
  };

  const todayKey = getBdDateKey();
  const todayAutoCount = logs.filter(
    (l) => l.status === 'published' && getBdDateKey(l.timestamp) === todayKey
  ).length;
  const nextSlotDate = computeUpcomingBdSlots(settings.dailySlots, 1, 0)[0] || null;
  const nextAutoRunAt = nextSlotDate ? nextSlotDate.toISOString() : null;
  const queuedUnsentComics = comics.filter((c) => c.status === 'draft');

  const navItems: Array<{ id: AppTab; label: string; icon: typeof Film }> = [
    { id: 'video', label: 'ভিডিও স্টুডিও', icon: Film },
    { id: 'assets', label: 'অ্যাসেট ও স্প্রাইট', icon: Layers },
    { id: 'history', label: 'সেইভ করা ভিডিও', icon: Archive },
    { id: 'studio', label: 'কমিক ছবি', icon: LayoutGrid },
    { id: 'branding', label: 'লোগো ও ব্র্যান্ডিং', icon: Palette },
    { id: 'automation', label: 'Facebook অটো', icon: Share2 },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
        <div className="px-2">
          <RafuFolkLogo
            text={settings.logoText || '@@RAFU FOLK@@'}
            styleVariant={settings.logoStyle}
            size="md"
          />
        </div>

        <nav className="mt-8 flex-1 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-6 space-y-1.5 border-t border-slate-100 px-2 pt-4 text-xs text-slate-500">
          <div className="flex items-center justify-between">
            <span>সেইভ করা MP4</span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {savedRenderedVideos.length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>ভিডিও প্রজেক্ট</span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {videos.length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>কমিক স্ট্রিপ</span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {comics.length}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Strict 3-Zone Top Bar Contract */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-8 border-b border-slate-200 bg-white px-4 py-3.5 sm:px-8">
          <span className="font-display text-base font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            {settings.logoText || '@@RAFU FOLK@@'}
          </span>

          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === item.id
                    ? 'font-semibold text-slate-900 underline underline-offset-4'
                    : 'hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => setActiveTab('video')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span>ভিডিও স্টুডিও</span>
          </button>
        </header>

        {/* Mobile Tab Strip */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-8">
          {activeTab === 'video' && (
            <VideoStudioView
              video={activeVideo}
              videos={videos}
              savedRenderedVideos={savedRenderedVideos}
              settings={settings}
              onSelectVideo={(vid) => {
                setVideos((prev) =>
                  prev.some((v) => v.id === vid.id) ? prev : [vid, ...prev]
                );
                setActiveVideoId(vid.id);
              }}
              onUpdateVideo={updateVideo}
              onCreateVideo={(newVid) => {
                setVideos((prev) => [newVid, ...prev]);
                setActiveVideoId(newVid.id);
              }}
              onSaveRenderedVideo={handleSaveRenderedVideo}
              onDeleteSavedRenderedVideo={handleDeleteSavedRenderedVideo}
              onPublishVideo={publishVideoItem}
            />
          )}

          {activeTab === 'assets' && <AssetLibraryView />}

          {activeTab === 'history' && (
            <HistoryQueueView
              comics={comics}
              videos={videos}
              savedRenderedVideos={savedRenderedVideos}
              publishingId={publishingId}
              onSelectComic={(item) => {
                setActiveComicId(item.id);
                setActiveTab('studio');
              }}
              onSelectVideo={(vid) => {
                setActiveVideoId(vid.id);
                setActiveTab('video');
              }}
              onPublishComic={(item) => publishComicItem(item)}
              onDownloadComic={handleDownloadComic}
              onDeleteComic={(id) => {
                setComics((prev) => {
                  const next = prev.filter((c) => c.id !== id);
                  return next.length > 0 ? next : STARTER_COMICS;
                });
              }}
              onDeleteVideoProject={(id) => {
                setVideos((prev) => {
                  const next = prev.filter((v) => v.id !== id);
                  return next.length > 0 ? next : STARTER_VIDEOS;
                });
              }}
              onDeleteSavedRenderedVideo={handleDeleteSavedRenderedVideo}
            />
          )}

          {activeTab === 'studio' && (
            <StudioView
              comic={activeComic}
              settings={settings}
              isGenerating={isGenerating}
              isPublishing={publishingId === activeComic.id}
              statusBanner={statusBanner}
              onGenerateComic={async (opts) => {
                await generateComicRequest(opts);
              }}
              onGenerateAndPublish={handleGenerateAndPublish}
              onUpdateComic={updateComic}
              onPublishCurrent={() => publishComicItem(activeComic)}
              onDownloadCurrent={() => handleDownloadComic(activeComic)}
              onCanvasReady={(el) => {
                canvasRef.current = el;
              }}
            />
          )}

          {activeTab === 'branding' && (
            <BrandingView
              settings={settings}
              previewComic={activeComic}
              onUpdateSettings={updateSettings}
            />
          )}

          {activeTab === 'automation' && (
            <FacebookAutoView
              settings={settings}
              nextAutoRunAt={nextAutoRunAt}
              todayAutoCount={todayAutoCount}
              batchProgress={batchProgress}
              batchBanner={batchBanner}
              onUpdateSettings={updateSettings}
              isGeneratingOrPublishing={isGenerating || publishingId !== null}
              onTriggerAutoCycleNow={() =>
                handleGenerateAndPublish({
                  category: settings.preferredCategory || 'auto',
                  languageMode: settings.languageMode || 'bangla',
                  layout: 'auto',
                  customHint: '',
                })
              }
              onBatchSchedule={handleBatchSchedule}
              onScheduleDraftsToFacebook={handleScheduleDraftsToFacebook}
              scheduledQueueCount={queuedUnsentComics.length}
            />
          )}
        </main>
      </div>
    </div>
  );
}
