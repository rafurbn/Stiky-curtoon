import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Link2,
  Clock,
  ShieldCheck,
  CalendarClock,
  Plus,
  X,
  Wand2,
} from 'lucide-react';
import type { AutomationSettings } from '../types/comic';
import {
  computeUpcomingBdSlots,
  DEFAULT_BD_SLOTS,
  formatBdTimeLabel,
  formatSlotTimeBn,
} from '../lib/scheduleHelper';

interface FacebookAutoViewProps {
  settings: AutomationSettings;
  nextAutoRunAt: string | null;
  todayAutoCount: number;
  batchProgress: { current: number; total: number; label: string } | null;
  batchBanner: { type: 'ok' | 'err'; text: string } | null;
  onUpdateSettings: (patch: Partial<AutomationSettings>) => void;
  onTriggerAutoCycleNow: () => Promise<void>;
  onBatchSchedule: (daysCount: number, publishToFacebook: boolean) => Promise<void>;
  onScheduleDraftsToFacebook: () => Promise<void>;
  scheduledQueueCount: number;
  isGeneratingOrPublishing: boolean;
}

export function FacebookAutoView({
  settings,
  nextAutoRunAt,
  todayAutoCount,
  batchProgress,
  batchBanner,
  onUpdateSettings,
  onTriggerAutoCycleNow,
  onBatchSchedule,
  onScheduleDraftsToFacebook,
  scheduledQueueCount,
  isGeneratingOrPublishing,
}: FacebookAutoViewProps) {
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [showToken, setShowToken] = useState(false);
  const [newSlotTime, setNewSlotTime] = useState('21:00');
  const [batchDays, setBatchDays] = useState(3);

  const slots = settings.dailySlots?.length ? settings.dailySlots : DEFAULT_BD_SLOTS;
  const totalPostsForBatch = batchDays * slots.length;

  const upcomingPreview = useMemo(() => {
    return computeUpcomingBdSlots(
      slots,
      Math.min(6, totalPostsForBatch),
      settings.useExactSlots ? 0 : settings.randomJitterMinutes
    );
  }, [slots, totalPostsForBatch, settings.useExactSlots, settings.randomJitterMinutes]);

  const handleVerifyPage = async () => {
    setVerifying(true);
    setVerifyMsg(null);
    try {
      const res = await fetch('/api/facebook/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: settings.pageId,
          pageAccessToken: settings.pageAccessToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyMsg({ type: 'err', text: data.error || 'Page যাচাই করা যায়নি।' });
        return;
      }
      onUpdateSettings({ pageName: data.name });
      setVerifyMsg({
        type: 'ok',
        text: `সংযুক্ত হয়েছে: ${data.name}${
          typeof data.fanCount === 'number'
            ? ` (${data.fanCount.toLocaleString()} followers)`
            : ''
        }`,
      });
    } catch (err) {
      setVerifyMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'নেটওয়ার্ক ত্রুটি।',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleUpdateSlot = (idx: number, val: string) => {
    const next = [...slots];
    next[idx] = val;
    onUpdateSettings({ dailySlots: next.sort() });
  };

  const handleAddSlot = () => {
    if (!newSlotTime || slots.includes(newSlotTime)) return;
    onUpdateSettings({ dailySlots: [...slots, newSlotTime].sort() });
  };

  const handleRemoveSlot = (idx: number) => {
    if (slots.length <= 1) return;
    onUpdateSettings({ dailySlots: slots.filter((_, i) => i !== idx) });
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-7">
        {/* Bangladesh Time Daily Slots + Native Facebook Batch Scheduler */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                বাংলাদেশ সময় দৈনিক ব্যাচ শিডিউলার (Asia/Dhaka)
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                প্রতিদিন সকাল ৮:৩০, দুপুর ৩:০০ ও রাত ৭:৫০-এ সরাসরি Facebook-এর নিজস্ব সার্ভারে পোস্ট শিডিউল করুন। একবার শিডিউল করলে পিসি ও Render বন্ধ থাকলেও Facebook নিজেই পোস্ট করে দেবে।
              </p>
            </div>
            <button
              type="button"
              onClick={() => onUpdateSettings({ dailySlots: DEFAULT_BD_SLOTS })}
              className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
            >
              ০৮:৩০ / ০৩:০০ / ০৭:৫০ রিসেট
            </button>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <span className="block text-xs font-semibold text-slate-700">
                প্রতিদিনের পোস্টের সময়সূচি (বাংলাদেশ সময় · UTC+6)
              </span>
              <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {slots.map((slot, idx) => (
                  <div
                    key={`${slot}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <input
                        type="time"
                        value={slot}
                        onChange={(e) => handleUpdateSlot(idx, e.target.value)}
                        className="bg-transparent font-mono-tabular text-sm font-bold text-slate-900 focus:outline-none"
                      />
                      <div className="text-xs text-slate-500">
                        {formatSlotTimeBn(slot)}
                      </div>
                    </div>
                    {slots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(idx)}
                        title="স্লট মুছুন"
                        className="rounded p-1 text-slate-400 hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="time"
                  value={newSlotTime}
                  onChange={(e) => setNewSlotTime(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono-tabular text-xs text-slate-900"
                />
                <button
                  type="button"
                  onClick={handleAddSlot}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>নতুন সময় যোগ</span>
                </button>
                <label className="ml-auto inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={settings.useExactSlots}
                    onChange={(e) =>
                      onUpdateSettings({ useExactSlots: e.target.checked })
                    }
                    className="h-4 w-4 rounded accent-blue-600"
                  />
                  <span>হুবহু নির্ধারিত সময়ে পোস্ট (র‍্যান্ডম গ্যাপ ছাড়া)</span>
                </label>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <label
                    htmlFor="batch-days-select"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    একসাথে কত দিনের পোস্ট শিডিউল করবেন?
                  </label>
                  <p className="text-xs text-slate-500">
                    মোট <span className="font-mono-tabular font-bold text-slate-800">{totalPostsForBatch}</span>টি কার্টুন তৈরি ও শিডিউল হবে
                  </p>
                </div>
                <select
                  id="batch-days-select"
                  value={batchDays}
                  onChange={(e) => setBatchDays(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value={1}>১ দিন ({slots.length}টি পোস্ট)</option>
                  <option value={3}>৩ দিন ({slots.length * 3}টি পোস্ট)</option>
                  <option value={5}>৫ দিন ({slots.length * 5}টি পোস্ট)</option>
                  <option value={7}>৭ দিন ({slots.length * 7}টি পোস্ট)</option>
                </select>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-xs font-semibold text-slate-700">
                  আসন্ন শিডিউল প্রিভিউ (বাংলাদেশ সময়):
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono-tabular text-xs text-slate-600">
                  {upcomingPreview.map((d, idx) => (
                    <span key={idx}>
                      {idx + 1}. {formatBdTimeLabel(d)}
                    </span>
                  ))}
                  {totalPostsForBatch > 6 && (
                    <span className="text-slate-400">
                      ... আরও {totalPostsForBatch - 6}টি
                    </span>
                  )}
                </div>
              </div>
            </div>

            {batchProgress && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-900">
                <div className="flex items-center justify-between">
                  <span>{batchProgress.label}</span>
                  <span className="font-mono-tabular">
                    {batchProgress.current} / {batchProgress.total}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-200">
                  <div
                    className="h-full bg-blue-700 transition-all"
                    style={{
                      width: `${Math.round(
                        (batchProgress.current / Math.max(1, batchProgress.total)) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {batchBanner && (
              <div
                className={`rounded-lg border px-4 py-3 text-xs font-medium ${
                  batchBanner.type === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-red-200 bg-red-50 text-red-900'
                }`}
              >
                {batchBanner.text}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onBatchSchedule(batchDays, false)}
                disabled={isGeneratingOrPublishing}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-900 bg-white px-4 py-2.5 text-xs font-bold text-slate-900 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                <Wand2 className="h-4 w-4" />
                <span>বিনা স্ক্রিপ্টে তৈরি করে কিউতে রাখুন</span>
              </button>

              <button
                type="button"
                onClick={() => onBatchSchedule(batchDays, true)}
                disabled={
                  isGeneratingOrPublishing ||
                  !settings.pageId ||
                  !settings.pageAccessToken
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CalendarClock className="h-4 w-4" />
                <span>তৈরি করে সরাসরি Facebook-এ শিডিউল</span>
              </button>
            </div>

            {scheduledQueueCount > 0 && (
              <button
                type="button"
                onClick={onScheduleDraftsToFacebook}
                disabled={
                  isGeneratingOrPublishing ||
                  !settings.pageId ||
                  !settings.pageAccessToken
                }
                className="w-full rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                কিউতে থাকা রেডি {scheduledQueueCount}টি কার্টুন এখনই Facebook-এ শিডিউল পাঠান
              </button>
            )}
          </div>
        </div>

        {/* Meta Graph API Page Connection */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Facebook Page সংযোগ (Meta Graph API)
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                সরাসরি Facebook Page-এ PNG কার্টুন ও বাংলা ক্যাপশন পোস্ট/শিডিউল করতে Page ID এবং Page Access Token দিন।
              </p>
            </div>
            {settings.pageName && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap shrink-0">
                <CheckCircle2 className="h-4 w-4" />
                <span>{settings.pageName}</span>
              </div>
            )}
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="fb-page-id" className="block text-sm font-semibold text-slate-800">
                Facebook Page ID
              </label>
              <input
                id="fb-page-id"
                type="text"
                value={settings.pageId}
                onChange={(e) => onUpdateSettings({ pageId: e.target.value })}
                placeholder="যেমন: 109482716251948"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono-tabular text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="fb-page-token"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Page Access Token (pages_manage_posts)
                </label>
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
                >
                  {showToken ? 'লুকান' : 'দেখুন'}
                </button>
              </div>
              <input
                id="fb-page-token"
                type={showToken ? 'text' : 'password'}
                value={settings.pageAccessToken}
                onChange={(e) => onUpdateSettings({ pageAccessToken: e.target.value })}
                placeholder="EAA..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono-tabular text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleVerifyPage}
                disabled={verifying || !settings.pageId || !settings.pageAccessToken}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Link2 className="h-4 w-4" />
                <span>{verifying ? 'যাচাই হচ্ছে...' : 'Page কানেকশন টেস্ট করুন'}</span>
              </button>
            </div>

            {verifyMsg && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm ${
                  verifyMsg.type === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {verifyMsg.type === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{verifyMsg.text}</span>
              </div>
            )}
          </div>
        </div>

        {/* Optional Make / Zapier / n8n Webhook */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="font-display text-base font-bold text-slate-900">
            বিকল্প: Webhook অটোমেশন (Make / Zapier / n8n)
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            আপনার আগের ভিডিও অ্যাপের মতো Make বা Zapier ওয়ার্কফ্লো থাকলে এখানে Webhook URL দিলে কার্টুন PNG ও ক্যাপশন সরাসরি সেখানে চলে যাবে।
          </p>
          <div className="mt-4">
            <label htmlFor="webhook-url" className="block text-sm font-semibold text-slate-800">
              Webhook URL (ঐচ্ছিক)
            </label>
            <input
              id="webhook-url"
              type="url"
              value={settings.webhookUrl}
              onChange={(e) => onUpdateSettings({ webhookUrl: e.target.value })}
              placeholder="https://hook.eu2.make.com/..."
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono-tabular text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Right Column: Live Auto-Pilot + Render Deploy Info */}
      <div className="space-y-6 lg:col-span-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                লাইভ ব্রাউজার অটো-পাইলট
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                ট্যাব খোলা থাকলে নির্ধারিত বাংলাদেশ সময়ে স্বয়ংক্রিয় পোস্ট
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ autoPilotEnabled: !settings.autoPilotEnabled })
              }
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                settings.autoPilotEnabled
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {settings.autoPilotEnabled ? 'অটো-পাইলট চালু' : 'চালু করুন'}
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="jitter-range"
                  className="text-xs font-semibold text-slate-700"
                >
                  র‍্যান্ডম টাইম গ্যাপ (যদি হুবহু সময় বন্ধ থাকে)
                </label>
                <span className="font-mono-tabular text-xs font-semibold text-slate-800">
                  ±{settings.randomJitterMinutes} মি.
                </span>
              </div>
              <input
                id="jitter-range"
                type="range"
                min={0}
                max={45}
                step={5}
                value={settings.randomJitterMinutes}
                onChange={(e) =>
                  onUpdateSettings({ randomJitterMinutes: Number(e.target.value) })
                }
                className="mt-2 w-full accent-blue-600"
              />
            </div>

            <div className="border-t border-slate-100 pt-4 text-xs text-slate-600 space-y-2">
              <div className="flex items-center justify-between">
                <span>আজকের প্রকাশিত পোস্ট:</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {todayAutoCount} / {slots.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>পরবর্তী নির্ধারিত সময় (BD):</span>
                </span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {settings.autoPilotEnabled && nextAutoRunAt
                    ? formatBdTimeLabel(nextAutoRunAt)
                    : 'বন্ধ আছে'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onTriggerAutoCycleNow}
              disabled={
                isGeneratingOrPublishing ||
                (!settings.pageAccessToken && !settings.webhookUrl)
              }
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingOrPublishing
                ? 'তৈরি ও পোস্ট হচ্ছে...'
                : 'এখনই ১টি বানিয়ে তাৎক্ষণিক পোস্ট করুন'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Render-এ লাইভ করার সহজ ধাপ
              </h3>
              <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600">
                <li>১. প্রোজেক্টটি GitHub-এ আপলোড করুন (প্রোজেক্টে `render.yaml` প্রস্তুত আছে)।</li>
                <li>২. Render.com-এ গিয়ে <strong>New + → Blueprint</strong> বা <strong>Web Service</strong> নির্বাচন করে GitHub রিপো কানেক্ট করুন।</li>
                <li>৩. Environment Variables-এ `GEMINI_API_KEY` এবং `NODE_ENV=production` দিন, তারপর Deploy ক্লিক করুন।</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
