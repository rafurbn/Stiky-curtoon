import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { HybridAssetCategory, HybridAssetItem } from '../types/comic';
import {
  getCachedAssetCatalog,
  loadImageFromUrl,
  refreshAssetCatalog,
} from '../lib/hybridSpriteCatalog';
import {
  deleteCustomAssetFromVault,
  saveCustomAssetToVault,
} from '../lib/videoStorage';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

function svgTextToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

interface SpritePreviewCanvasProps {
  asset: HybridAssetItem;
  animate?: boolean;
}

function SpritePreviewCanvas({ asset, animate = true }: SpritePreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let rafId: number | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isSheet =
      asset.category === 'sprite_actor' && (asset.frameCount || 1) > 1;
    const cols = Math.max(1, asset.cols || 1);
    const rows = Math.max(1, asset.rows || 1);
    const frameCount = Math.max(1, asset.frameCount || cols * rows);
    const fps = Math.max(1, asset.fps || 7);

    let loadedImg: HTMLImageElement | null = null;
    const startWall = performance.now();

    const drawFrame = () => {
      if (cancelled || !canvas) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Subtle checkerboard/paper floor for transparency inspection
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, w, h);
      if (asset.category === 'sprite_actor') {
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h - 18);
        ctx.lineTo(w, h - 18);
        ctx.stroke();
      }

      if (!loadedImg || !loadedImg.naturalWidth) {
        ctx.fillStyle = '#94A3B8';
        ctx.font = '12px "Hind Siliguri", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('লোড হচ্ছে...', w / 2, h / 2);
        return;
      }

      if (asset.category === 'background') {
        const scale = Math.max(w / loadedImg.naturalWidth, h / loadedImg.naturalHeight);
        const dw = loadedImg.naturalWidth * scale;
        const dh = loadedImg.naturalHeight * scale;
        ctx.drawImage(loadedImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
      } else if (isSheet) {
        const elapsed = (performance.now() - startWall) / 1000;
        const frameIdx = animate ? Math.floor(elapsed * fps) % frameCount : 0;
        const col = frameIdx % cols;
        const row = Math.floor(frameIdx / cols);
        const cw = loadedImg.naturalWidth / cols;
        const ch = loadedImg.naturalHeight / rows;
        const pad = 10;
        const scale = Math.min((w - pad * 2) / cw, (h - pad * 2) / ch);
        const dw = cw * scale;
        const dh = ch * scale;
        ctx.drawImage(
          loadedImg,
          col * cw,
          row * ch,
          cw,
          ch,
          (w - dw) / 2,
          h - 14 - dh,
          dw,
          dh
        );
      } else {
        const pad = 10;
        const scale = Math.min(
          (w - pad * 2) / loadedImg.naturalWidth,
          (h - pad * 2) / loadedImg.naturalHeight
        );
        const dw = loadedImg.naturalWidth * scale;
        const dh = loadedImg.naturalHeight * scale;
        ctx.drawImage(loadedImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }

      if (isSheet && animate) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    loadImageFromUrl(asset.url).then((img) => {
      if (cancelled) return;
      loadedImg = img;
      drawFrame();
    });

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [asset, animate]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={asset.category === 'background' ? 200 : 168}
      className="h-40 w-full rounded-lg border border-slate-200 bg-slate-50 object-contain"
    />
  );
}

interface AssetLibraryViewProps {
  onAssetsUpdated?: (assets: HybridAssetItem[]) => void;
}

export function AssetLibraryView({ onAssetsUpdated }: AssetLibraryViewProps) {
  const [assets, setAssets] = useState<HybridAssetItem[]>(() => getCachedAssetCatalog());
  const [filterCat, setFilterCat] = useState<'all' | 'background' | 'sprite_actor'>('all');
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string>('');
  const [uploadName, setUploadName] = useState('');
  const [uploadCategory, setUploadCategory] = useState<HybridAssetCategory>('sprite_actor');
  const [uploadKeywords, setUploadKeywords] = useState('');
  const [uploadCols, setUploadCols] = useState(4);
  const [uploadRows, setUploadRows] = useState(1);
  const [uploadFrameCount, setUploadFrameCount] = useState(4);
  const [uploadFps, setUploadFps] = useState(7);
  const [isUploading, setIsUploading] = useState(false);

  // AI SVG Generator state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiCategory, setAiCategory] = useState<'background' | 'sprite_actor'>('sprite_actor');
  const [aiName, setAiName] = useState('');
  const [isGeneratingSvg, setIsGeneratingSvg] = useState(false);

  const reloadAssets = useCallback(async () => {
    const fresh = await refreshAssetCatalog();
    setAssets(fresh);
    onAssetsUpdated?.(fresh);
  }, [onAssetsUpdated]);

  useEffect(() => {
    void reloadAssets();
  }, [reloadAssets]);

  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    };
  }, [uploadPreviewUrl]);

  const handleSelectFile = (file: File | undefined) => {
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    if (!file) {
      setUploadFile(null);
      setUploadPreviewUrl('');
      return;
    }
    setUploadFile(file);
    setUploadPreviewUrl(URL.createObjectURL(file));
    if (!uploadName.trim()) {
      setUploadName(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setStatusMsg({ type: 'err', text: 'অনুগ্রহ করে একটি .svg বা .png ফাইল নির্বাচন করুন।' });
      return;
    }
    setIsUploading(true);
    setStatusMsg(null);
    try {
      const dataUrl = await fileToDataUrl(uploadFile).catch(() => '');
      const form = new FormData();
      form.append('file', uploadFile);
      form.append('name', uploadName.trim() || uploadFile.name);
      form.append('category', uploadCategory);
      form.append('keywords', uploadKeywords.trim());
      form.append('cols', String(uploadCols));
      form.append('rows', String(uploadRows));
      form.append('frameCount', String(uploadFrameCount));
      form.append('fps', String(uploadFps));

      const res = await fetch('/api/assets/upload', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'আপলোড ব্যর্থ হয়েছে।');

      if (data.asset && dataUrl) {
        await saveCustomAssetToVault(data.asset, dataUrl);
      }

      setUploadFile(null);
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
      setUploadPreviewUrl('');
      setUploadName('');
      setUploadKeywords('');
      await reloadAssets();
      setStatusMsg({
        type: 'ok',
        text: `"${data.asset?.name || 'নতুন অ্যাসেট'}" হাইব্রিড লাইব্রেরিতে যুক্ত হয়েছে (ব্রাউজার ব্যাকআপসহ)!`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'আপলোড করা যায়নি।',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateAiSvg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) {
      setStatusMsg({
        type: 'err',
        text: 'AI দিয়ে বানাতে চাইলে দৃশ্য বা প্রাণীর বর্ণনা লিখুন।',
      });
      return;
    }
    setIsGeneratingSvg(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/assets/generate-svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          category: aiCategory,
          name: aiName.trim() || aiPrompt.trim().slice(0, 36),
          saveToLibrary: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI দিয়ে SVG বানানো যায়নি।');

      if (data.asset && typeof data.svg === 'string' && data.svg) {
        await saveCustomAssetToVault(data.asset, svgTextToDataUrl(data.svg));
      }

      setAiPrompt('');
      setAiName('');
      await reloadAssets();
      setStatusMsg({
        type: 'ok',
        text: `ফ্রি AI দিয়ে "${data.asset?.name || 'নতুন SVG'}" তৈরি ও সংরক্ষণ সম্পন্ন হয়েছে!`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'SVG তৈরি ব্যর্থ হয়েছে।',
      });
    } finally {
      setIsGeneratingSvg(false);
    }
  };

  const handleDeleteAsset = async (asset: HybridAssetItem) => {
    if (asset.source === 'builtin') return;
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'মুছে ফেলা যায়নি।');
      }
      await deleteCustomAssetFromVault(asset.id);
      await reloadAssets();
      setStatusMsg({ type: 'ok', text: `"${asset.name}" লাইব্রেরি থেকে সরানো হয়েছে।` });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'মুছে ফেলা যায়নি।',
      });
    }
  };

  const filteredAssets = assets.filter((a) =>
    filterCat === 'all' ? true : a.category === filterCat
  );
  const bgCount = assets.filter((a) => a.category === 'background').length;
  const actorCount = assets.filter((a) => a.category === 'sprite_actor').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            হাইব্রিড স্প্রাইট ও ব্যাকগ্রাউন্ড লাইব্রেরি
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            দেশীয় পরিবেশ, গরু-কুকুর-রিকশা ৪-ফ্রেম স্প্রাইট শিট, নিজস্ব SVG/PNG আপলোড এবং ফ্রি AI জেনারেটর
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setFilterCat('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              filterCat === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            সব ({assets.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterCat('background')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              filterCat === 'background' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            ব্যাকগ্রাউন্ড ({bgCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterCat('sprite_actor')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              filterCat === 'sprite_actor'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600'
            }`}
          >
            প্রাণী ও স্প্রাইট ({actorCount})
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

      {/* Top Tools: Upload Custom Sprite Sheet + Free AI SVG Generator */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upload SVG / PNG Sprite Sheet Card */}
        <form
          onSubmit={handleUploadSubmit}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-slate-800" />
            <h2 className="text-base font-bold text-slate-900">
              স্প্রাইট শিট / SVG / PNG আপলোড করুন
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">ধরন</label>
              <select
                value={uploadCategory}
                onChange={(e) => {
                  const cat = e.target.value as HybridAssetCategory;
                  setUploadCategory(cat);
                  if (cat === 'background') {
                    setUploadCols(1);
                    setUploadRows(1);
                    setUploadFrameCount(1);
                  } else {
                    setUploadCols(4);
                    setUploadRows(1);
                    setUploadFrameCount(4);
                  }
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                <option value="sprite_actor">প্রাণী / গাড়ি (স্প্রাইট অ্যাক্টর)</option>
                <option value="background">দৃশ্য / ব্যাকগ্রাউন্ড (৭২০x১২৮০)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">নাম</label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="যেমন: লাফানো খরগোশ বা নৌকা"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              স্ক্রিপ্ট ম্যাচিং কীওয়ার্ড (কমা দিয়ে লিখুন)
            </label>
            <input
              type="text"
              value={uploadKeywords}
              onChange={(e) => setUploadKeywords(e.target.value)}
              placeholder="যেমন: গরু ঘাস খাচ্ছে, গরু রাগান্বিত, হাম্বা, তাড়া করছে"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
          </div>

          {uploadCategory === 'sprite_actor' && (
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  কলাম (Cols)
                </label>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={uploadCols}
                  onChange={(e) => {
                    const c = Math.max(1, Number(e.target.value) || 1);
                    setUploadCols(c);
                    setUploadFrameCount(c * uploadRows);
                  }}
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 font-mono-tabular text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  সারি (Rows)
                </label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={uploadRows}
                  onChange={(e) => {
                    const r = Math.max(1, Number(e.target.value) || 1);
                    setUploadRows(r);
                    setUploadFrameCount(uploadCols * r);
                  }}
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 font-mono-tabular text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  মোট ফ্রেম
                </label>
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={uploadFrameCount}
                  onChange={(e) => setUploadFrameCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 font-mono-tabular text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">FPS</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={uploadFps}
                  onChange={(e) => setUploadFps(Math.max(1, Number(e.target.value) || 7))}
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 font-mono-tabular text-xs"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0">
              <ImageIcon className="h-4 w-4" />
              <span>{uploadFile ? uploadFile.name : 'SVG বা PNG ফাইল বেছে নিন'}</span>
              <input
                type="file"
                accept=".svg,.png,.webp,.jpg,.jpeg,image/svg+xml,image/png,image/webp,image/jpeg"
                className="hidden"
                onChange={(e) => handleSelectFile(e.target.files?.[0])}
              />
            </label>

            <button
              type="submit"
              disabled={isUploading || !uploadFile}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{isUploading ? 'সেইভ হচ্ছে...' : 'লাইব্রেরিতে যোগ করুন'}</span>
            </button>
          </div>

          {uploadPreviewUrl && (
            <SpritePreviewCanvas
              asset={{
                id: 'preview_tmp',
                name: uploadName || 'প্রিভিউ',
                keywords: [],
                category: uploadCategory,
                format: uploadFrameCount > 1 ? 'png_spritesheet' : 'png',
                source: 'uploaded',
                url: uploadPreviewUrl,
                cols: uploadCols,
                rows: uploadRows,
                frameCount: uploadFrameCount,
                fps: uploadFps,
              }}
            />
          )}
        </form>

        {/* Free AI SVG & Sprite Generator + PC Folder Tip */}
        <div className="flex flex-col justify-between gap-4">
          <form
            onSubmit={handleGenerateAiSvg}
            className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-slate-800" />
              <h2 className="text-base font-bold text-slate-900">
                ফ্রি AI দিয়ে নতুন SVG / ৪-ফ্রেম স্প্রাইট শিট বানান
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">কী বানাবেন</label>
                <select
                  value={aiCategory}
                  onChange={(e) =>
                    setAiCategory(e.target.value as 'background' | 'sprite_actor')
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  <option value="sprite_actor">৪-ফ্রেম স্প্রাইট অ্যাক্টর (প্রাণী/গাড়ি)</option>
                  <option value="background">৭২০x১২৮০ কার্টুন ব্যাকগ্রাউন্ড</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  সংক্ষিপ্ত নাম (ঐচ্ছিক)
                </label>
                <input
                  type="text"
                  value={aiName}
                  onChange={(e) => setAiName(e.target.value)}
                  placeholder="যেমন: দুষ্টু বানর / রেলস্টেশন"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                বাংলা বা ইংরেজিতে বর্ণনা দিন
              </label>
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="যেমন: একটি মজার বানর কলা হাতে দৌড়াচ্ছে, অথবা বাংলাদেশের গ্রামের রেলস্টেশন"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-xs text-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={isGeneratingSvg}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {isGeneratingSvg
                  ? 'ফ্রি AI SVG আঁকছে...'
                  : 'ফ্রি AI দিয়ে বানিয়ে লাইব্রেরিতে সেইভ করুন'}
              </span>
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-2.5">
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />
              <div className="space-y-1.5 text-xs text-slate-600">
                <p className="font-bold text-slate-900">স্থায়ী ফোল্ডার ও Render ফ্রি প্ল্যান নোট</p>
                <p>
                  অ্যাপ থেকে আপলোড করা স্প্রাইট আপনার বর্তমান ব্রাউজারের IndexedDB-তেও সংরক্ষিত থাকে। তবে Render ফ্রি প্ল্যান রিস্টার্ট হলে সার্ভার ডিস্ক রিসেট হয়—তাই সব ডিভাইস থেকে স্থায়ীভাবে পেতে চাইলে ফাইলগুলো সরাসরি GitHub রিপোর{' '}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono-tabular text-slate-800">
                    public/assets/actors/
                  </code>{' '}
                  বা{' '}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono-tabular text-slate-800">
                    public/assets/backgrounds/
                  </code>{' '}
                  ফোল্ডারে রাখুন।
                </p>
                <p>
                  একই প্রাণীর একাধিক ভঙ্গির স্প্রাইট (যেমন ঘাস খাওয়া, রাগ, তাড়া করা) আলাদা ফাইলে দিলে নামের শেষে গ্রিড সাইজ ও অবস্থার নাম দিন:{' '}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono-tabular">
                    cow_grazing_4x1.png
                  </code>
                  ,{' '}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono-tabular">
                    cow_angry_4x1.png
                  </code>
                  ,{' '}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono-tabular">
                    cow_chase_4x1.png
                  </code>
                  —তাহলে দৃশ্য অনুযায়ী সঠিক স্প্রাইট শিট বেছে নেবে।
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Asset Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredAssets.map((asset) => {
          const isSheet = asset.category === 'sprite_actor' && (asset.frameCount || 1) > 1;
          const metaLine = [
            asset.category === 'background' ? 'ব্যাকগ্রাউন্ড' : 'স্প্রাইট অ্যাক্টর',
            isSheet ? `${asset.frameCount} ফ্রেম · ${asset.fps || 7} FPS` : asset.format.toUpperCase(),
            asset.source === 'builtin'
              ? 'বিল্ট-ইন'
              : asset.source === 'folder'
                ? 'ফোল্ডার'
                : asset.source === 'ai_generated'
                  ? 'AI SVG'
                  : 'আপলোড',
          ].join(' · ');

          return (
            <div
              key={asset.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4"
            >
              <div>
                <SpritePreviewCanvas asset={asset} animate />
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-slate-900">{asset.name}</h3>
                    <p className="mt-0.5 font-mono-tabular text-[11px] text-slate-500">
                      {metaLine}
                    </p>
                  </div>
                  {asset.source !== 'builtin' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAsset(asset)}
                      title="মুছে ফেলুন"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 truncate">
                  <Layers className="h-3 w-3 shrink-0" />
                  <span className="truncate">ID: {asset.id}</span>
                </span>
                <span className="truncate max-w-[52%] text-right">
                  {asset.keywords.slice(0, 3).join(', ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
