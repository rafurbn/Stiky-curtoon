import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutGrid,
  Stamp,
  Share2,
  History,
  Wand2,
  Send,
} from 'lucide-react';
import { renderComicToCanvas } from './lib/cartoonRenderer';
import { STARTER_COMIC, STARTER_COMICS } from './lib/defaultComic';
import {
  computeUpcomingBdSlots,
  DEFAULT_BD_SLOTS,
  formatBdTimeLabel,
} from './lib/scheduleHelper';
import type { AutomationSettings, ComicItem, LayoutMode } from './types/comic';
import { RafuFolkLogo } from './components/RafuFolkLogo';
import { StudioView } from './components/StudioView';
import { BrandingView } from './components/BrandingView';
import { FacebookAutoView } from './components/FacebookAutoView';
import { HistoryQueueView } from './components/HistoryQueueView';

type NavTab = 'studio' | 'branding' | 'automation' | 'history';

const STORAGE_SETTINGS_KEY = 'rafu_folk_settings_v2';
const STORAGE_COMICS_KEY = 'rafu_folk_comics_v2';

const DEFAULT_SETTINGS: AutomationSettings = {
  logoText: '@@RAFU FOLK@@',
  logoPlacement: 'bottom-right',
  logoStyle: 'stamp-dark',
  logoOpacity: 0.95,
  pageId: '',
  pageAccessToken: '',
  pageName: '',
  webhookUrl: '',
  autoPilotEnabled: false,
  intervalHours: 6,
  randomJitterMinutes: 0,
  dailyCap: 3,
  dailySlots: DEFAULT_BD_SLOTS,
  timezone: 'Asia/Dhaka',
  useExactSlots: true,
  preferredCategory: 'auto',
  languageMode: 'bangla',
};

function loadSavedSettings(): AutomationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      dailySlots:
        Array.isArray(parsed.dailySlots) && parsed.dailySlots.length > 0
          ? parsed.dailySlots
          : DEFAULT_BD_SLOTS,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadSavedComics(): ComicItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_COMICS_KEY);
    if (!raw) return STARTER_COMICS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : STARTER_COMICS;
  } catch {
    return STARTER_COMICS;
  }
}

async function renderOffscreenPng(
  comic: ComicItem,
  settings: AutomationSettings
): Promise<string> {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  const offscreen = document.createElement('canvas');
  renderComicToCanvas(offscreen, comic, settings);
  return offscreen.toDataURL('image/png');
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('studio');
  const [settings, setSettings] = useState<AutomationSettings>(loadSavedSettings);
  const [comics, setComics] = useState<ComicItem[]>(loadSavedComics);
  const [activeComicId, setActiveComicId] = useState<string>(
    () => loadSavedComics()[0]?.id || STARTER_COMIC.id
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    label: string;
  } | null>(null);
  const [batchBanner, setBatchBanner] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [nextAutoRunAt, setNextAutoRunAt] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeComic =
    comics.find((c) => c.id === activeComicId) || comics[0] || STARTER_COMIC;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage quota issues
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_COMICS_KEY, JSON.stringify(comics.slice(0, 50)));
    } catch {
      // Ignore storage quota issues
    }
  }, [comics]);

  const updateSettings = useCallback((patch: Partial<AutomationSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateComic = useCallback((updated: ComicItem) => {
    setComics((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
  }, []);

  const todayAutoCount = comics.filter((c) => {
    if (c.status !== 'published' || !c.publishedAt) return false;
    const today = new Date().toISOString().slice(0, 10);
    return c.publishedAt.slice(0, 10) === today;
  }).length;

  const publishedTotal = comics.filter((c) => c.status === 'published').length;
  const queuedUnsentComics = comics.filter(
    (c) => (c.status === 'scheduled' || c.status === 'draft') && !c.fbPostId
  );

  const generateComicRequest = useCallback(
    async (
      opts: {
        category: string;
        languageMode: AutomationSettings['languageMode'];
        layout: 'auto' | LayoutMode;
        customHint: string;
      },
      extraTitles: string[] = []
    ): Promise<ComicItem> => {
      setIsGenerating(true);
      setStatusBanner(null);
      try {
        const recentTitles = [
          ...extraTitles,
          ...comics.slice(0, 14).map((c) => c.title),
        ];
        const res = await fetch('/api/generate-comic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...opts,
            recentTitles,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'কার্টুন তৈরি করা যায়নি।');
        }
        const newItem: ComicItem = {
          ...data,
          status: 'draft',
        };
        setComics((prev) => [newItem, ...prev]);
        setActiveComicId(newItem.id);
        setStatusBanner({
          type: 'ok',
          text: `নতুন কার্টুন তৈরি হয়েছে: "${newItem.title}"`,
        });
        return newItem;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'কার্টুন তৈরিতে সমস্যা হয়েছে।';
        setStatusBanner({ type: 'err', text: message });
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [comics]
  );

  const publishComicItem = useCallback(
    async (comic: ComicItem, scheduledDate?: Date) => {
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
          if (!res.ok) {
            throw new Error(data.error || 'Facebook Page-এ পোস্ট করা যায়নি।');
          }

          if (scheduledDate) {
            const updated: ComicItem = {
              ...comic,
              status: 'scheduled',
              scheduledFor: scheduledDate.toISOString(),
              fbPostId: data.postId || data.id,
              publishTarget: 'facebook_page',
              errorMessage: undefined,
            };
            updateComic(updated);
            setStatusBanner({
              type: 'ok',
              text: `Facebook সার্ভারে শিডিউল হয়েছে (${formatBdTimeLabel(scheduledDate)})`,
            });
          } else {
            const updated: ComicItem = {
              ...comic,
              status: 'published',
              publishedAt: new Date().toISOString(),
              fbPostId: data.postId || data.id,
              publishTarget: 'facebook_page',
              errorMessage: undefined,
            };
            updateComic(updated);
            setStatusBanner({
              type: 'ok',
              text: `Facebook Page-এ সফলভাবে পোস্ট হয়েছে (Post ID: ${data.postId || data.id})`,
            });
          }
          return;
        }

        if (settings.webhookUrl && !scheduledDate) {
          const res = await fetch('/api/webhook/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              webhookUrl: settings.webhookUrl,
              payload: {
                id: comic.id,
                title: comic.title,
                category: comic.category,
                caption: comic.fbCaption,
                brand: settings.logoText,
                imageDataUrl,
                createdAt: comic.createdAt,
              },
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Webhook-এ পাঠানো যায়নি।');
          }
          const updated: ComicItem = {
            ...comic,
            status: 'published',
            publishedAt: new Date().toISOString(),
            publishTarget: 'webhook',
            errorMessage: undefined,
          };
          updateComic(updated);
          setStatusBanner({
            type: 'ok',
            text: 'Webhook অটোমেশনে সফলভাবে পাঠানো হয়েছে।',
          });
          return;
        }

        throw new Error(
          'পোস্ট/শিডিউল করার আগে "Facebook অটো-পোস্ট" ট্যাবে Page ID ও Access Token দিন।'
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'পোস্ট করা যায়নি।';
        updateComic({
          ...comic,
          status: 'failed',
          errorMessage: message,
        });
        setStatusBanner({ type: 'err', text: message });
        throw err;
      } finally {
        setPublishingId(null);
      }
    },
    [activeComic.id, settings, updateComic]
  );

  const handleGenerateAndPublish = useCallback(
    async (opts: {
      category: string;
      languageMode: AutomationSettings['languageMode'];
      layout: 'auto' | LayoutMode;
      customHint: string;
    }) => {
      try {
        const created = await generateComicRequest(opts);
        await publishComicItem(created);
      } catch {
        // Error banner already handled
      }
    },
    [generateComicRequest, publishComicItem]
  );

  const handleBatchSchedule = useCallback(
    async (daysCount: number, publishToFacebook: boolean) => {
      const slots = settings.dailySlots?.length ? settings.dailySlots : DEFAULT_BD_SLOTS;
      const total = daysCount * slots.length;
      const jitter = settings.useExactSlots ? 0 : settings.randomJitterMinutes;
      const targetDates = computeUpcomingBdSlots(slots, total, jitter);

      setBatchBanner(null);
      setBatchProgress({
        current: 0,
        total,
        label: publishToFacebook
          ? 'AI কার্টুন তৈরি করে Facebook-এ শিডিউল হচ্ছে...'
          : 'AI বিনা স্ক্রিপ্টে কার্টুন তৈরি করছে...',
      });

      const batchTitles: string[] = [];
      let successCount = 0;

      try {
        for (let i = 0; i < total; i++) {
          const slotDate = targetDates[i];
          setBatchProgress({
            current: i,
            total,
            label: `কার্টুন ${i + 1}/${total} তৈরি হচ্ছে (${formatBdTimeLabel(slotDate)})...`,
          });

          const created = await generateComicRequest(
            {
              category: settings.preferredCategory || 'auto',
              languageMode: settings.languageMode || 'bangla',
              layout: 'auto',
              customHint: '',
            },
            batchTitles
          );
          batchTitles.push(created.title);

          if (publishToFacebook) {
            await publishComicItem(created, slotDate);
          } else {
            updateComic({
              ...created,
              status: 'scheduled',
              scheduledFor: slotDate.toISOString(),
            });
          }
          successCount += 1;
        }

        setBatchProgress({ current: total, total, label: 'সম্পন্ন হয়েছে!' });
        setBatchBanner({
          type: 'ok',
          text: publishToFacebook
            ? `${successCount}টি নতুন কার্টুন তৈরি করে বাংলাদেশ সময় অনুযায়ী Facebook সার্ভারে শিডিউল করা হয়েছে।`
            : `${successCount}টি নতুন কার্টুন তৈরি করে হিস্ট্রি ও কিউতে সংরক্ষণ করা হয়েছে।`,
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'ব্যাচ প্রক্রিয়া সম্পন্ন হয়নি।';
        setBatchBanner({
          type: 'err',
          text: `${successCount}/${total} সম্পন্ন হয়েছে। ত্রুটি: ${msg}`,
        });
      } finally {
        setTimeout(() => setBatchProgress(null), 1500);
      }
    },
    [settings, generateComicRequest, publishComicItem, updateComic]
  );

  const handleScheduleDraftsToFacebook = useCallback(async () => {
    const slots = settings.dailySlots?.length ? settings.dailySlots : DEFAULT_BD_SLOTS;
    const jitter = settings.useExactSlots ? 0 : settings.randomJitterMinutes;
    const targets = queuedUnsentComics;
    if (targets.length === 0) return;

    const freshSlots = computeUpcomingBdSlots(slots, targets.length, jitter);
    setBatchBanner(null);
    setBatchProgress({
      current: 0,
      total: targets.length,
      label: 'কিউয়ের কার্টুনগুলো Facebook-এ শিডিউল হচ্ছে...',
    });

    let done = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        const existingMs = item.scheduledFor ? new Date(item.scheduledFor).getTime() : 0;
        const slotDate =
          existingMs >= Date.now() + 12 * 60 * 1000
            ? new Date(existingMs)
            : freshSlots[i];

        setBatchProgress({
          current: i,
          total: targets.length,
          label: `শিডিউল হচ্ছে: ${item.title} (${formatBdTimeLabel(slotDate)})`,
        });
        await publishComicItem(item, slotDate);
        done += 1;
      }
      setBatchProgress({ current: targets.length, total: targets.length, label: 'সম্পন্ন!' });
      setBatchBanner({
        type: 'ok',
        text: `কিউতে থাকা ${done}টি কার্টুন সফলভাবে Facebook সার্ভারে শিডিউল হয়েছে।`,
      });
    } catch (err) {
      setBatchBanner({
        type: 'err',
        text: `${done}/${targets.length} শিডিউল হয়েছে। ${
          err instanceof Error ? err.message : ''
        }`,
      });
    } finally {
      setTimeout(() => setBatchProgress(null), 1500);
    }
  }, [queuedUnsentComics, settings, publishComicItem]);

  const handleDownloadComic = useCallback(
    async (comic: ComicItem) => {
      const dataUrl =
        comic.id === activeComic.id && canvasRef.current
          ? canvasRef.current.toDataURL('image/png')
          : await renderOffscreenPng(comic, settings);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `rafu-folk-${comic.id}.png`;
      a.click();
    },
    [activeComic.id, settings]
  );

  // Compute next Bangladesh Time daily slot when live browser Auto-Pilot is active
  useEffect(() => {
    if (!settings.autoPilotEnabled) {
      setNextAutoRunAt(null);
      return;
    }
    const slots = settings.dailySlots?.length ? settings.dailySlots : DEFAULT_BD_SLOTS;
    const jitter = settings.useExactSlots ? 0 : settings.randomJitterMinutes;
    const [nextSlot] = computeUpcomingBdSlots(slots, 1, jitter);
    setNextAutoRunAt(nextSlot ? nextSlot.toISOString() : null);
  }, [
    settings.autoPilotEnabled,
    settings.dailySlots,
    settings.useExactSlots,
    settings.randomJitterMinutes,
  ]);

  // Background browser Auto-Pilot timer loop
  useEffect(() => {
    if (!settings.autoPilotEnabled || !nextAutoRunAt) return;

    const timer = setInterval(async () => {
      if (Date.now() < new Date(nextAutoRunAt).getTime()) return;
      const maxDaily = settings.dailySlots?.length || settings.dailyCap;
      if (todayAutoCount >= maxDaily) return;
      if (!settings.pageAccessToken && !settings.webhookUrl) return;
      if (isGenerating || publishingId) return;

      await handleGenerateAndPublish({
        category: settings.preferredCategory || 'auto',
        languageMode: settings.languageMode || 'bangla',
        layout: 'auto',
        customHint: '',
      });

      const slots = settings.dailySlots?.length ? settings.dailySlots : DEFAULT_BD_SLOTS;
      const jitter = settings.useExactSlots ? 0 : settings.randomJitterMinutes;
      const [nextSlot] = computeUpcomingBdSlots(slots, 1, jitter);
      setNextAutoRunAt(nextSlot ? nextSlot.toISOString() : null);
    }, 15_000);

    return () => clearInterval(timer);
  }, [
    settings,
    nextAutoRunAt,
    todayAutoCount,
    isGenerating,
    publishingId,
    handleGenerateAndPublish,
  ]);

  const navItems: Array<{ id: NavTab; label: string; icon: typeof LayoutGrid }> = [
    { id: 'studio', label: 'কার্টুন স্টুডিও', icon: LayoutGrid },
    { id: 'branding', label: 'লোগো ব্র্যান্ডিং', icon: Stamp },
    { id: 'automation', label: 'Facebook অটো-পোস্ট', icon: Share2 },
    { id: 'history', label: 'হিস্ট্রি ও কিউ', icon: History },
  ];

  const pageTitleMap: Record<NavTab, string> = {
    studio: 'কার্টুন স্টুডিও',
    branding: 'লোগো ব্র্যান্ডিং',
    automation: 'Facebook অটো-পোস্ট',
    history: 'হিস্ট্রি ও কিউ',
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-5 lg:flex">
        <div>
          <div className="pb-6">
            <RafuFolkLogo
              text={settings.logoText || '@@RAFU FOLK@@'}
              styleVariant={settings.logoStyle}
              size="md"
            />
          </div>

          <nav className="space-y-1" aria-label="Primary Navigation">
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
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-slate-200 pt-4 text-xs text-slate-600 space-y-2">
          <div className="flex items-center justify-between">
            <span>BD শিডিউল স্লট</span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {(settings.dailySlots || DEFAULT_BD_SLOTS).length}টি/দিন
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>কিউ / শিডিউলড</span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {queuedUnsentComics.length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>মোট প্রকাশিত</span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {publishedTotal}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>মোট কার্টুন</span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {comics.length}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar Contract: Breadcrumb Left — Primary Actions Right */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3.5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="lg:hidden">
              <RafuFolkLogo
                text={settings.logoText || '@@RAFU FOLK@@'}
                styleVariant={settings.logoStyle}
                size="sm"
              />
            </div>
            <div className="hidden items-center gap-2 text-sm sm:flex whitespace-nowrap">
              <span className="font-semibold text-slate-500">
                {settings.logoText || '@@RAFU FOLK@@'}
              </span>
              <span className="text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="font-bold text-slate-900">{pageTitleMap[activeTab]}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab('studio');
                generateComicRequest({
                  category: settings.preferredCategory || 'auto',
                  languageMode: settings.languageMode || 'bangla',
                  layout: 'auto',
                  customHint: '',
                });
              }}
              disabled={isGenerating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>{isGenerating ? 'তৈরি হচ্ছে...' : 'নতুন অটো কার্টুন'}</span>
            </button>

            <button
              type="button"
              onClick={() => publishComicItem(activeComic)}
              disabled={
                publishingId !== null ||
                (!settings.pageAccessToken && !settings.webhookUrl)
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{publishingId ? 'পোস্ট হচ্ছে...' : 'Page-এ পোস্ট'}</span>
            </button>
          </div>
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

        {/* Viewport Content */}
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-8">
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

          {activeTab === 'history' && (
            <HistoryQueueView
              comics={comics}
              publishingId={publishingId}
              onSelectComic={(item) => {
                setActiveComicId(item.id);
                setActiveTab('studio');
              }}
              onPublishComic={(item) => publishComicItem(item)}
              onDownloadComic={handleDownloadComic}
              onDeleteComic={(id) => {
                setComics((prev) => {
                  const next = prev.filter((c) => c.id !== id);
                  return next.length > 0 ? next : STARTER_COMICS;
                });
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
