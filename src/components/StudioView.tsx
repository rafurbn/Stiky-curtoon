import { useState } from 'react';
import {
  Wand2,
  Download,
  Copy,
  Check,
  Send,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  AutomationSettings,
  ComicItem,
  ComicScript,
  ExpressionType,
  LayoutMode,
  PaperTheme,
  PoseType,
} from '../types/comic';
import { ComicPreviewCanvas } from './ComicPreviewCanvas';

interface StudioViewProps {
  comic: ComicItem;
  settings: AutomationSettings;
  isGenerating: boolean;
  isPublishing: boolean;
  statusBanner: { type: 'ok' | 'err'; text: string } | null;
  onGenerateComic: (opts: {
    category: string;
    languageMode: AutomationSettings['languageMode'];
    layout: 'auto' | LayoutMode;
    customHint: string;
  }) => Promise<void>;
  onGenerateAndPublish: (opts: {
    category: string;
    languageMode: AutomationSettings['languageMode'];
    layout: 'auto' | LayoutMode;
    customHint: string;
  }) => Promise<void>;
  onUpdateComic: (updated: ComicItem) => void;
  onPublishCurrent: () => Promise<void>;
  onDownloadCurrent: () => Promise<void>;
  onCanvasReady: (canvas: HTMLCanvasElement | null) => void;
}

const CATEGORIES = [
  { value: 'auto', label: 'অটো (AI নিজেই বাছাই করবে)' },
  { value: 'বন্ধুদের আড্ডা ও টাকা ধার', label: 'বন্ধুদের আড্ডা ও টাকা ধার' },
  { value: 'অফিস, বস ও ছুটির বাহানা', label: 'অফিস, বস ও ছুটির বাহানা' },
  { value: 'চা-দোকানের বুদ্ধিজীবী গপ্পো', label: 'চা-দোকানের বুদ্ধিজীবী গপ্পো' },
  { value: 'ভালোবাসা ও সিঙ্গেল জীবনের কষ্ট', label: 'ভালোবাসা ও সিঙ্গেল জীবনের কষ্ট' },
  { value: 'মায়ের ঝাড়ি ও ঘরোয়া কমেডি', label: 'মায়ের ঝাড়ি ও ঘরোয়া কমেডি' },
  { value: 'পরীক্ষা, পড়াশোনা ও রাত জাগা', label: 'পরীক্ষা, পড়াশোনা ও রাত জাগা' },
];

const PAPER_THEMES: Array<{ id: PaperTheme; label: string; swatch: string }> = [
  { id: 'cream_sketch', label: 'ক্রিম স্কেচ', swatch: '#FCF8EE' },
  { id: 'studio_white', label: 'সাদা পেপার', swatch: '#FFFFFF' },
  { id: 'notebook_grid', label: 'নোটবুক রুল', swatch: '#FAF9F4' },
  { id: 'sunny_tint', label: 'হালকা হলুদ', swatch: '#FFFBEB' },
  { id: 'chalk_mint', label: 'হালকা মিন্ট', swatch: '#F4FAF7' },
];

const EXPRESSIONS: ExpressionType[] = [
  'happy',
  'laughing',
  'shocked',
  'angry',
  'deadpan',
  'confused',
  'crying',
  'smug',
  'wink',
];

const POSES: PoseType[] = [
  'standing',
  'pointing',
  'facepalm',
  'hands_up',
  'shrugging',
  'holding_phone',
  'holding_tea',
  'sitting_desk',
  'running',
];

export function StudioView({
  comic,
  settings,
  isGenerating,
  isPublishing,
  statusBanner,
  onGenerateComic,
  onGenerateAndPublish,
  onUpdateComic,
  onPublishCurrent,
  onDownloadCurrent,
  onCanvasReady,
}: StudioViewProps) {
  const [category, setCategory] = useState(settings.preferredCategory || 'auto');
  const [languageMode, setLanguageMode] = useState<AutomationSettings['languageMode']>(
    settings.languageMode || 'bangla'
  );
  const [layoutChoice, setLayoutChoice] = useState<'auto' | LayoutMode>('auto');
  const [customHint, setCustomHint] = useState('');
  const [copied, setCopied] = useState(false);
  const [showDialogueEditor, setShowDialogueEditor] = useState(false);
  const [activePanelIdx, setActivePanelIdx] = useState(0);

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(comic.fbCaption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleLayoutSwitch = (nextLayout: LayoutMode) => {
    const needed =
      nextLayout === '1-panel'
        ? 1
        : nextLayout === '2-panel'
          ? 2
          : nextLayout === '3-panel'
            ? 3
            : 4;
    const panels = [...comic.panels];
    while (panels.length < needed) {
      panels.push({
        panelIndex: panels.length,
        captionTop: '',
        sceneProp: 'none',
        moodFx: 'none',
        characters: [
          {
            id: 'rafu',
            name: 'রাফু',
            side: 'left',
            expression: 'deadpan',
            pose: 'standing',
            speech: 'কী আর বলব ভাই!',
          },
        ],
      });
    }
    onUpdateComic({
      ...comic,
      layout: nextLayout,
      panels: panels.slice(0, needed),
    });
    if (activePanelIdx >= needed) setActivePanelIdx(0);
  };

  const activePanel = comic.panels[activePanelIdx] || comic.panels[0];

  const updatePanelChar = (
    charIdx: number,
    patch: Partial<ComicScript['panels'][number]['characters'][number]>
  ) => {
    const nextPanels = comic.panels.map((p, idx) => {
      if (idx !== activePanelIdx) return p;
      const nextChars = p.characters.map((c, ci) =>
        ci === charIdx ? { ...c, ...patch } : c
      );
      return { ...p, characters: nextChars };
    });
    onUpdateComic({ ...comic, panels: nextPanels });
  };

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
      {/* Primary Canvas & Caption Area */}
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

        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                {comic.title}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {comic.category} · {comic.panels.length} প্যানেল · সিল: {settings.logoText}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdateComic({
                    ...comic,
                    seed: Math.floor(Math.random() * 900000) + 100000,
                  })
                }
                title="হাতের আঁকার ভঙ্গি রিফ্রেশ করুন"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>রি-স্কেচ</span>
              </button>
              <button
                type="button"
                onClick={onDownloadCurrent}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>PNG সেভ</span>
              </button>
            </div>
          </div>

          <ComicPreviewCanvas
            comic={comic}
            branding={settings}
            onCanvasReady={onCanvasReady}
          />
        </div>

        {/* Facebook Caption Box & Direct Publish */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="fb-caption-editor"
              className="text-sm font-bold text-slate-900"
            >
              Facebook পোস্ট ক্যাপশন
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
                  <span>ক্যাপশন কপি</span>
                </>
              )}
            </button>
          </div>
          <textarea
            id="fb-caption-editor"
            rows={3}
            value={comic.fbCaption}
            onChange={(e) => onUpdateComic({ ...comic, fbCaption: e.target.value })}
            className="mt-2.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="text-xs text-slate-500">
              {settings.pageName
                ? `টার্গেট পেইজ: ${settings.pageName}`
                : settings.webhookUrl
                  ? 'টার্গেট: Webhook অটোমেশন'
                  : 'Facebook Page সংযুক্ত না থাকলে PNG সেভ করে পোস্ট করতে পারবেন'}
            </div>
            <button
              type="button"
              onClick={onPublishCurrent}
              disabled={isPublishing || (!settings.pageAccessToken && !settings.webhookUrl)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Send className="h-4 w-4" />
              <span>{isPublishing ? 'পোস্ট হচ্ছে...' : 'এখনই Page-এ পোস্ট করুন'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Zero-Script AI Engine & Optional Controls */}
      <div className="space-y-6 xl:col-span-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="font-display text-lg font-bold text-slate-900">
            জিরো-স্ক্রিপ্ট AI কার্টুন জেনারেটর
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            কোনো স্ক্রিপ্ট লিখতে হবে না। এক ক্লিকে AI নিজেই মজার গল্প, ডায়ালগ, স্টিক ফিগার ও ক্যাপশন বানিয়ে দেবে।
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="ai-category"
                className="block text-xs font-semibold text-slate-700"
              >
                কমেডির বিষয়
              </label>
              <select
                id="ai-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="ai-language"
                  className="block text-xs font-semibold text-slate-700"
                >
                  ভাষার ধরন
                </label>
                <select
                  id="ai-language"
                  value={languageMode}
                  onChange={(e) =>
                    setLanguageMode(e.target.value as AutomationSettings['languageMode'])
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="bangla">খাঁটি বাংলা</option>
                  <option value="mixed">মিশ্র বাংলা-ইংলিশ</option>
                  <option value="banglish">Banglish</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="ai-layout"
                  className="block text-xs font-semibold text-slate-700"
                >
                  প্যানেল সংখ্যা
                </label>
                <select
                  id="ai-layout"
                  value={layoutChoice}
                  onChange={(e) => setLayoutChoice(e.target.value as 'auto' | LayoutMode)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="auto">অটো বৈচিত্র্য</option>
                  <option value="1-panel">১-প্যানেল (মিম)</option>
                  <option value="2-panel">২-প্যানেল</option>
                  <option value="3-panel">৩-প্যানেল</option>
                  <option value="4-panel">৪-প্যানেল (২×২)</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="custom-hint"
                className="block text-xs font-semibold text-slate-700"
              >
                হালকা আইডিয়া (ঐচ্ছিক — ফাঁকা রাখলেও AI নিজেই বানাবে)
              </label>
              <input
                id="custom-hint"
                type="text"
                value={customHint}
                onChange={(e) => setCustomHint(e.target.value)}
                placeholder="যেমন: বেতন পাওয়ার পরদিন পকেট ফাঁকা..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={() =>
                  onGenerateComic({
                    category,
                    languageMode,
                    layout: layoutChoice,
                    customHint,
                  })
                }
                disabled={isGenerating}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
              >
                <Wand2 className="h-4 w-4" />
                <span>
                  {isGenerating ? 'AI কার্টুন বানাচ্ছে...' : 'বিনা স্ক্রিপ্টে নতুন কার্টুন বানান'}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onGenerateAndPublish({
                    category,
                    languageMode,
                    layout: layoutChoice,
                    customHint,
                  })
                }
                disabled={
                  isGenerating ||
                  isPublishing ||
                  (!settings.pageAccessToken && !settings.webhookUrl)
                }
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-700 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send className="h-4 w-4" />
                <span>তৈরি করে সরাসরি Page-এ পোস্ট</span>
              </button>
            </div>
          </div>
        </div>

        {/* Paper Style & Quick Layout Switcher */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="font-display text-sm font-bold text-slate-900">
            পেপার থিম ও গ্রিড স্টাইল
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {PAPER_THEMES.map((pt) => {
              const active = comic.paperTheme === pt.id;
              return (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => onUpdateComic({ ...comic, paperTheme: pt.id })}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className="h-3 w-3 rounded-xs border border-slate-300"
                    style={{ backgroundColor: pt.swatch }}
                  />
                  <span>{pt.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {(['1-panel', '2-panel', '3-panel', '4-panel'] as const).map((lm) => (
              <button
                key={lm}
                type="button"
                onClick={() => handleLayoutSwitch(lm)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  comic.layout === lm
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {lm}
              </button>
            ))}
          </div>
        </div>

        {/* Optional Fine-Tune Dialogue Drawer */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setShowDialogueEditor((v) => !v)}
            className="flex w-full items-center justify-between px-6 py-4 text-left"
          >
            <div>
              <div className="text-sm font-bold text-slate-900">
                ডায়ালগ ও এক্সপ্রেশন এডিট (ঐচ্ছিক)
              </div>
              <div className="text-xs text-slate-500">
                চাইলে কার্টুনের লেখা বা মুখের ভঙ্গি বদলাতে পারেন
              </div>
            </div>
            {showDialogueEditor ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>

          {showDialogueEditor && activePanel && (
            <div className="border-t border-slate-200 px-6 py-5 space-y-4">
              <div>
                <label
                  htmlFor="comic-title-edit"
                  className="block text-xs font-semibold text-slate-700"
                >
                  কার্টুন শিরোনাম
                </label>
                <input
                  id="comic-title-edit"
                  type="text"
                  value={comic.title}
                  onChange={(e) => onUpdateComic({ ...comic, title: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {comic.panels.map((p, idx) => (
                  <button
                    key={p.panelIndex}
                    type="button"
                    onClick={() => setActivePanelIdx(idx)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                      activePanelIdx === idx
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    প্যানেল {idx + 1}
                  </button>
                ))}
              </div>

              {activePanel.characters.map((char, ci) => (
                <div
                  key={`${char.id}-${ci}`}
                  className="space-y-2.5 border-t border-slate-100 pt-3"
                >
                  <div className="text-xs font-bold text-slate-800">
                    চরিত্র {ci + 1}: {char.name}
                  </div>
                  <input
                    type="text"
                    value={char.speech || ''}
                    onChange={(e) => updatePanelChar(ci, { speech: e.target.value })}
                    placeholder="সংলাপ লিখুন..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={char.expression}
                      onChange={(e) =>
                        updatePanelChar(ci, {
                          expression: e.target.value as ExpressionType,
                        })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                    >
                      {EXPRESSIONS.map((ex) => (
                        <option key={ex} value={ex}>
                          Mood: {ex}
                        </option>
                      ))}
                    </select>
                    <select
                      value={char.pose}
                      onChange={(e) =>
                        updatePanelChar(ci, { pose: e.target.value as PoseType })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                    >
                      {POSES.map((po) => (
                        <option key={po} value={po}>
                          Pose: {po}
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
