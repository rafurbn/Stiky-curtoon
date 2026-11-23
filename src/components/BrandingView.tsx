import type { AutomationSettings, ComicItem, LogoPlacement, LogoStyle } from '../types/comic';
import { ComicPreviewCanvas } from './ComicPreviewCanvas';
import { RafuFolkLogo } from './RafuFolkLogo';

interface BrandingViewProps {
  settings: AutomationSettings;
  previewComic: ComicItem;
  onUpdateSettings: (patch: Partial<AutomationSettings>) => void;
}

const STYLES: Array<{ id: LogoStyle; label: string; desc: string }> = [
  {
    id: 'stamp-dark',
    label: 'হলুদ-কালো স্ট্যাম্প সিল',
    desc: 'উচ্চ-কনট্রাস্ট কালো সিল ও হলুদ শ্যাডো',
  },
  {
    id: 'comic-badge',
    label: 'সাদা কমিক ডাবল বর্ডার',
    desc: 'লাল-কালো বর্ডারসহ পরিচ্ছন্ন পেজ ব্যাজ',
  },
  {
    id: 'minimal-mono',
    label: 'মিনিমাল মনোটোন',
    desc: 'হালকা ও পরিচ্ছন্ন সিগনেচার ট্যাগ',
  },
];

const PLACEMENTS: Array<{ id: LogoPlacement; label: string }> = [
  { id: 'bottom-right', label: 'নিচে ডানে (Recommended)' },
  { id: 'bottom-left', label: 'নিচে বামে' },
  { id: 'top-banner', label: 'উপরে ডানে' },
  { id: 'watermark-center', label: 'মাঝখানে ওয়াটারমার্ক' },
];

export function BrandingView({
  settings,
  previewComic,
  onUpdateSettings,
}: BrandingViewProps) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-lg font-bold text-slate-900">
            লোগো ও ওয়াটারমার্ক ব্র্যান্ডিং
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            প্রতিটি স্টিক কার্টুনে স্বয়ংক্রিয়ভাবে আপনার পেইজের নিজস্ব সিল বসে যাবে।
          </p>

          <div className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="logo-text-input"
                className="block text-sm font-semibold text-slate-800"
              >
                লোগো টেক্সট
              </label>
              <input
                id="logo-text-input"
                type="text"
                value={settings.logoText}
                onChange={(e) => onUpdateSettings({ logoText: e.target.value })}
                placeholder="@@RAFU FOLK@@"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
              />
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-slate-500">লাইভ ব্যাজ:</span>
                <RafuFolkLogo
                  text={settings.logoText || '@@RAFU FOLK@@'}
                  styleVariant={settings.logoStyle}
                  size="sm"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <span className="block text-sm font-semibold text-slate-800">
                লোগো স্টাইল
              </span>
              <div className="mt-2.5 space-y-2.5">
                {STYLES.map((st) => {
                  const active = settings.logoStyle === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => onUpdateSettings({ logoStyle: st.id })}
                      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50/50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{st.label}</div>
                        <div className="text-xs text-slate-500">{st.desc}</div>
                      </div>
                      <RafuFolkLogo
                        text={settings.logoText || '@@RAFU FOLK@@'}
                        styleVariant={st.id}
                        size="sm"
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <span className="block text-sm font-semibold text-slate-800">
                কার্টুনে অবস্থান
              </span>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {PLACEMENTS.map((pl) => {
                  const active = settings.logoPlacement === pl.id;
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => onUpdateSettings({ logoPlacement: pl.id })}
                      className={`rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap truncate ${
                        active
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {pl.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="logo-opacity-range"
                  className="text-sm font-semibold text-slate-800"
                >
                  স্বচ্ছতা (Opacity)
                </label>
                <span className="font-mono-tabular text-xs font-semibold text-slate-700">
                  {Math.round(settings.logoOpacity * 100)}%
                </span>
              </div>
              <input
                id="logo-opacity-range"
                type="range"
                min={0.35}
                max={1}
                step={0.05}
                value={settings.logoOpacity}
                onChange={(e) =>
                  onUpdateSettings({ logoOpacity: parseFloat(e.target.value) })
                }
                className="mt-2 w-full accent-blue-600"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-7">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-slate-900">
              কার্টুনে লাইভ লোগো প্রিভিউ
            </h3>
            <span className="text-xs text-slate-500">
              সর্বশেষ কার্টুন · {previewComic.layout}
            </span>
          </div>
          <ComicPreviewCanvas comic={previewComic} branding={settings} />
        </div>
      </div>
    </div>
  );
}
