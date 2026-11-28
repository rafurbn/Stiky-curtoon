import type { HybridAssetItem, VideoCharacterState, VideoScript } from '../types/comic';
import { loadCustomAssetsFromVault } from './videoStorage';

export const BUILTIN_HYBRID_ASSETS: HybridAssetItem[] = [
  {
    id: 'clear_day_sky',
    name: 'পরিষ্কার আকাশ ও মাঠ',
    keywords: ['পরিষ্কার আকাশ', 'আকাশ', 'রোদ', 'সবুজ মাঠ', 'ঘোরাঘুরি', 'clear sky', 'day', 'sunny'],
    category: 'background',
    format: 'svg',
    source: 'builtin',
    url: '/assets/backgrounds/clear_day_sky.svg',
  },
  {
    id: 'village_road',
    name: 'গ্রামীণ মেঠো রাস্তা',
    keywords: ['গ্রাম', 'রাস্তা', 'কুঁড়েঘর', 'তালগাছ', 'মেঠোপথ', 'village', 'rural'],
    category: 'background',
    format: 'svg',
    source: 'builtin',
    url: '/assets/backgrounds/village_road.svg',
  },
  {
    id: 'bazar_street',
    name: 'হাট-বাজার ও দোকান',
    keywords: ['বাজার', 'হাট', 'দোকান', 'রাস্তা', 'market', 'bazar', 'shop'],
    category: 'background',
    format: 'svg',
    source: 'builtin',
    url: '/assets/backgrounds/bazar_street.svg',
  },
  {
    id: 'river_ghat',
    name: 'নদীর ঘাট ও নৌকা',
    keywords: ['নদী', 'ঘাট', 'নৌকা', 'পানি', 'পুকুর', 'river', 'boat'],
    category: 'background',
    format: 'svg',
    source: 'builtin',
    url: '/assets/backgrounds/river_ghat.svg',
  },
  {
    id: 'field_meadow',
    name: 'সবুজ খোলা মাঠ ও বেড়া',
    keywords: ['মাঠ', 'ঘাস', 'খামার', 'চারণভূমি', 'field', 'meadow', 'pasture'],
    category: 'background',
    format: 'svg',
    source: 'builtin',
    url: '/assets/backgrounds/field_meadow.svg',
  },
  {
    id: 'tea_stall_day',
    name: 'দিনের টং চা-স্টল',
    keywords: ['চা দোকান', 'টং দোকান', 'চা-স্টল', 'tea stall', 'addaa'],
    category: 'background',
    format: 'svg',
    source: 'builtin',
    url: '/assets/backgrounds/tea_stall_day.svg',
  },
  {
    id: 'cow_grass_eating',
    name: 'গরু ঘাস খাচ্ছে (৮-ফ্রেম স্প্রাইট)',
    keywords: ['গরু', 'গুরু', 'গাভী', 'ঘাস', 'খাচ্ছে', 'চরে', 'সবুজ মাঠ', 'শান্ত গরু', 'cow', 'cow grass eating', 'grazing', 'eat grass', 'idle'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/cow_grass_eating.svg',
    cols: 4,
    rows: 2,
    frameCount: 8,
    fps: 7,
  },
  {
    id: 'cow_mooing',
    name: 'গরু ডাকছে / হাম্বা (৮-ফ্রেম স্প্রাইট)',
    keywords: ['গরু ডাকছে', 'হাম্বা', 'হাম্বাআ', 'গরু কথা', 'ডাক', 'গরু', 'গুরু', 'cow mooing', 'moo', 'talking cow', 'speaking'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/cow_mooing.svg',
    cols: 4,
    rows: 2,
    frameCount: 8,
    fps: 8,
  },
  {
    id: 'cow_attacking',
    name: 'গরু তাড়া ও আক্রমণ (৮-ফ্রেম স্প্রাইট)',
    keywords: ['গরু তাড়া', 'গরু আক্রমণ', 'গুতো', 'গুঁতো', 'তেড়ে', 'রাগান্বিত গরু', 'ধাক্কা', 'গরু', 'গুরু', 'cow attacking', 'charge', 'attack', 'butt', 'angry cow', 'chasing'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/cow_attacking.svg',
    cols: 4,
    rows: 2,
    frameCount: 8,
    fps: 9,
  },
  {
    id: 'tiger_walk_roar',
    name: 'বাঘ হাঁটছে ও গর্জন (৮-ফ্রেম স্প্রাইট)',
    keywords: ['বাঘ', 'রয়েল বেঙ্গল', 'বাঘ মামা', 'হালুম', 'গর্জন', 'হাঁটছে', 'জঙ্গল', 'বন', 'tiger', 'tiger walk roar', 'roar', 'walk', 'jungle'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/tiger_walk_roar.svg',
    cols: 4,
    rows: 2,
    frameCount: 8,
    fps: 8,
  },
  {
    id: 'tiger_run_attack',
    name: 'বাঘ দৌড় ও ঝাঁপ (৮-ফ্রেম স্প্রাইট)',
    keywords: ['বাঘ দৌড়', 'বাঘ তাড়া', 'বাঘ আক্রমণ', 'ঝাঁপ', 'শিকার', 'ভয়ানক বাঘ', 'বাঘ', 'tiger run attack', 'tiger run', 'tiger attack', 'chase', 'pounce', 'running tiger'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/tiger_run_attack.svg',
    cols: 4,
    rows: 2,
    frameCount: 8,
    fps: 10,
  },
  {
    id: 'rafu_walk_talk',
    name: 'রাফু হাঁটা ও কথা বলা (৮-ফ্রেম স্প্রাইট)',
    keywords: ['রাফু', 'রফু', 'রফু ভাই', 'ছেলে', 'হাঁটা', 'কথা', 'বন্ধু', 'rafu', 'rofu', 'rafu walk talk', 'walk', 'talk', 'boy'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/rafu_walk_talk.svg',
    cols: 4,
    rows: 2,
    frameCount: 8,
    fps: 8,
  },
  {
    id: 'rafu_running_away',
    name: 'রাফু ভয়ে দৌড়ে পালাচ্ছে (৮-ফ্রেম স্প্রাইট)',
    keywords: ['রাফু পালাচ্ছে', 'রফু পালাচ্ছে', 'রাফু দৌড়', 'রফু দৌড়', 'পালা', 'দৌড়ে', 'ভাগ', 'রাফু', 'রফু', 'rafu running away', 'running away', 'flee', 'escape', 'run'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/rafu_running_away.svg',
    cols: 4,
    rows: 2,
    frameCount: 8,
    fps: 10,
  },
  {
    id: 'rafu_scared',
    name: 'রাফু / ছেলে ভয় পেয়েছে (৮-ফ্রেম স্প্রাইট)',
    keywords: ['ভয়', 'চমকে', 'আতঙ্ক', 'কান্না', 'ভীত', 'ছেলে ভয়', 'রাফু ভয়', 'রফু ভয়', 'rafu scared', 'boy scared', 'scared', 'shocked', 'afraid', 'panicked', 'crying', 'rafu'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/rafu_scared.svg',
    cols: 4,
    rows: 2,
    frameCount: 8,
    fps: 8,
  },
  {
    id: 'dog',
    name: 'রাস্তার কুকুর (৪-ফ্রেম স্প্রাইট)',
    keywords: ['কুকুর', 'কুকুরের তাড়া', 'ঘেউ', 'পাগলা কুকুর', 'dog', 'puppy'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/dog.svg',
    cols: 4,
    rows: 1,
    frameCount: 4,
    fps: 8,
  },
  {
    id: 'goat',
    name: 'ছাগল (৪-ফ্রেম স্প্রাইট)',
    keywords: ['ছাগল', 'খাসি', 'গুতো', 'goat'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/goat.svg',
    cols: 4,
    rows: 1,
    frameCount: 4,
    fps: 7,
  },
  {
    id: 'rickshaw',
    name: 'রিকশা (৪-ফ্রেম স্প্রাইট)',
    keywords: ['রিকশা', 'রিক্সা', 'ভ্যান', 'গাড়ি', 'rickshaw'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/rickshaw.svg',
    cols: 4,
    rows: 1,
    frameCount: 4,
    fps: 8,
  },
  {
    id: 'auto_cng',
    name: 'সিএনজি অটোরিকশা (৪-ফ্রেম স্প্রাইট)',
    keywords: ['সিএনজি', 'অটো', 'টেম্পু', 'cng', 'auto'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/auto_cng.svg',
    cols: 4,
    rows: 1,
    frameCount: 4,
    fps: 8,
  },
  {
    id: 'crow',
    name: 'কাক / পাখি (৪-ফ্রেম স্প্রাইট)',
    keywords: ['কাক', 'পাখি', 'উড়ে', 'crow', 'bird'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/crow.svg',
    cols: 4,
    rows: 1,
    frameCount: 4,
    fps: 8,
  },
  {
    id: 'cat',
    name: 'বিড়াল (৪-ফ্রেম স্প্রাইট)',
    keywords: ['বিড়াল', 'মিনি', 'মিউ', 'cat', 'kitty'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/cat.svg',
    cols: 4,
    rows: 1,
    frameCount: 4,
    fps: 7,
  },
  {
    id: 'cow',
    name: 'দেশি গরু পুরনো (৪-ফ্রেম স্প্রাইট)',
    keywords: ['গরু পুরনো', 'cow legacy'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/cow.svg',
    cols: 4,
    rows: 1,
    frameCount: 4,
    fps: 6,
  },
  {
    id: 'tiger',
    name: 'রয়েল বেঙ্গল বাঘ পুরনো (৪-ফ্রেম স্প্রাইট)',
    keywords: ['বাঘ পুরনো', 'tiger legacy'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/tiger.svg',
    cols: 4,
    rows: 1,
    frameCount: 4,
    fps: 7,
  },
];

export interface SpriteSheetMetrics {
  cols: number;
  rows: number;
  cellBottomRatios: number[];
  maxBottomRatio: number;
  minBottomRatio: number;
}

let cachedCatalog: HybridAssetItem[] = [...BUILTIN_HYBRID_ASSETS];
const imageCache = new Map<string, HTMLImageElement>();
const spriteMetricsByImg = new WeakMap<HTMLImageElement, SpriteSheetMetrics>();
const fallbackDataUrlByAssetUrl = new Map<string, string>();
const pendingLoads = new Map<string, Promise<HTMLImageElement | null>>();

export function isAudioAssetCategory(cat?: HybridAssetItem['category']): boolean {
  return cat === 'audio_song' || cat === 'audio_bgm' || cat === 'audio_sfx';
}

export function resolveAssetUrlWithBackup(url?: string, assetId?: string): string | undefined {
  if (assetId && fallbackDataUrlByAssetUrl.has(assetId)) {
    const byId = fallbackDataUrlByAssetUrl.get(assetId);
    if (url && !url.startsWith('data:')) return url;
    if (byId) return byId;
  }
  if (url) {
    return url;
  }
  if (assetId) {
    const asset = findAssetByIdOrTheme(assetId);
    return asset?.url || fallbackDataUrlByAssetUrl.get(assetId);
  }
  return undefined;
}

export function getAudioBackupDataUrl(url?: string, assetId?: string): string | undefined {
  if (assetId && fallbackDataUrlByAssetUrl.has(assetId)) {
    return fallbackDataUrlByAssetUrl.get(assetId);
  }
  if (url && fallbackDataUrlByAssetUrl.has(url)) {
    return fallbackDataUrlByAssetUrl.get(url);
  }
  return undefined;
}

export function getSpriteSheetMetrics(
  img: HTMLImageElement | null | undefined
): SpriteSheetMetrics | undefined {
  if (!img) return undefined;
  return spriteMetricsByImg.get(img);
}

export function getCachedAssetCatalog(): HybridAssetItem[] {
  return cachedCatalog;
}

export function getClientCustomAssetSummaries(): Array<{
  id: string;
  name: string;
  keywords: string[];
  category: HybridAssetItem['category'];
  format: HybridAssetItem['format'];
  cols?: number;
  rows?: number;
  frameCount?: number;
  fps?: number;
}> {
  return cachedCatalog
    .filter((a) => a.source !== 'builtin')
    .map((a) => ({
      id: a.id,
      name: a.name,
      keywords: a.keywords,
      category: a.category,
      format: a.format,
      cols: a.cols,
      rows: a.rows,
      frameCount: a.frameCount,
      fps: a.fps,
    }));
}

export function setCachedAssetCatalog(items: HybridAssetItem[]) {
  const byId = new Map<string, HybridAssetItem>();
  for (const b of BUILTIN_HYBRID_ASSETS) byId.set(b.id, b);
  for (const item of items) byId.set(item.id, item);
  cachedCatalog = Array.from(byId.values());
}

export async function refreshAssetCatalog(): Promise<HybridAssetItem[]> {
  let serverAssets: HybridAssetItem[] = [];
  try {
    const res = await fetch('/api/assets');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.assets)) {
        serverAssets = data.assets;
      }
    }
  } catch {
    // Keep offline fallback
  }

  const vaultRecords = await loadCustomAssetsFromVault().catch(() => []);
  const byId = new Map<string, HybridAssetItem>();
  for (const b of BUILTIN_HYBRID_ASSETS) byId.set(b.id, b);

  // Register IndexedDB backups first (in case Render free disk slept/reset)
  for (const rec of vaultRecords) {
    if (!rec?.asset?.id) continue;
    if (rec.dataUrl) {
      fallbackDataUrlByAssetUrl.set(rec.asset.url, rec.dataUrl);
      fallbackDataUrlByAssetUrl.set(rec.asset.id, rec.dataUrl);
    }
    byId.set(rec.asset.id, {
      ...rec.asset,
      url: rec.dataUrl || rec.asset.url,
    });
  }

  // Merge server assets (preferring server URL if available, while keeping vault dataUrl fallback)
  for (const sa of serverAssets) {
    if (!sa?.id) continue;
    const vaultBackup = fallbackDataUrlByAssetUrl.get(sa.id);
    if (vaultBackup && sa.url) {
      fallbackDataUrlByAssetUrl.set(sa.url, vaultBackup);
    }
    byId.set(sa.id, sa);
  }

  cachedCatalog = Array.from(byId.values());
  return cachedCatalog;
}

export function findAssetByIdOrTheme(idOrTheme?: string): HybridAssetItem | undefined {
  if (!idOrTheme) return undefined;
  let normalized = idOrTheme.trim().toLowerCase();
  if (normalized === 'boy_scared') normalized = 'rafu_scared';
  return cachedCatalog.find((a) => a.id.toLowerCase() === normalized);
}

function hashKey(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `svg_${(h >>> 0).toString(16)}`;
}

function isNearWhitePixel(data: Uint8ClampedArray, idx4: number, minLum = 212): boolean {
  const a = data[idx4 + 3];
  if (a < 25) return false;
  const r = data[idx4];
  const g = data[idx4 + 1];
  const b = data[idx4 + 2];
  const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
  const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
  return minC >= minLum && maxC - minC <= 26;
}

function measureCellBottomMetrics(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cols: number,
  rows: number
): SpriteSheetMetrics {
  const safeCols = Math.max(1, cols);
  const safeRows = Math.max(1, rows);
  const cellBottomRatios: number[] = [];
  let maxBottomRatio = 0;
  let minBottomRatio = 1;

  for (let r = 0; r < safeRows; r++) {
    const y0 = Math.floor((r * h) / safeRows);
    const y1 = Math.floor(((r + 1) * h) / safeRows);
    const cellH = Math.max(1, y1 - y0);
    for (let c = 0; c < safeCols; c++) {
      const x0 = Math.floor((c * w) / safeCols);
      const x1 = Math.floor(((c + 1) * w) / safeCols);

      let bottomY = -1;
      for (let py = y1 - 2; py >= y0 + 2; py--) {
        let opaqueCount = 0;
        const rowOffset = py * w;
        for (let px = x0 + 2; px < x1 - 2; px++) {
          if (data[(rowOffset + px) * 4 + 3] >= 80) {
            opaqueCount++;
            if (opaqueCount >= 2) {
              bottomY = py;
              break;
            }
          }
        }
        if (bottomY !== -1) break;
      }

      const ratio = bottomY !== -1 ? (bottomY - y0 + 1) / cellH : 0.94;
      cellBottomRatios.push(ratio);
      if (ratio > maxBottomRatio) maxBottomRatio = ratio;
      if (ratio < minBottomRatio) minBottomRatio = ratio;
    }
  }

  return {
    cols: safeCols,
    rows: safeRows,
    cellBottomRatios,
    maxBottomRatio: maxBottomRatio || 0.94,
    minBottomRatio: minBottomRatio <= 1 ? minBottomRatio : 0.94,
  };
}

function cleanOpaqueSpriteSheetWhiteBg(
  img: HTMLImageElement,
  cols: number,
  rows: number
): Promise<HTMLImageElement> {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w <= 0 || h <= 0 || typeof document === 'undefined') {
    return Promise.resolve(img);
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return Promise.resolve(img);

    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Quick corner check: only strip if corners are opaque near-white (e.g. PNG-traced SVGs)
    const sampleCoords = [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1],
    ];
    let opaqueWhiteCorners = 0;
    for (const [sx, sy] of sampleCoords) {
      const idx = (sy * w + sx) * 4;
      if (data[idx + 3] >= 200 && isNearWhitePixel(data, idx, 224)) {
        opaqueWhiteCorners++;
      }
    }
    if (opaqueWhiteCorners === 0) {
      spriteMetricsByImg.set(img, measureCellBottomMetrics(data, w, h, cols, rows));
      return Promise.resolve(img);
    }

    const safeCols = Math.max(1, cols);
    const safeRows = Math.max(1, rows);
    const visited = new Uint8Array(w * h);
    const maxCellW = Math.ceil(w / safeCols) + 2;
    const maxCellH = Math.ceil(h / safeRows) + 2;
    const queue = new Int32Array(maxCellW * maxCellH);

    for (let r = 0; r < safeRows; r++) {
      const y0 = Math.floor((r * h) / safeRows);
      const y1 = Math.floor(((r + 1) * h) / safeRows);
      for (let c = 0; c < safeCols; c++) {
        const x0 = Math.floor((c * w) / safeCols);
        const x1 = Math.floor(((c + 1) * w) / safeCols);

        let head = 0;
        let tail = 0;

        const trySeed = (px: number, py: number) => {
          const p = py * w + px;
          if (visited[p]) return;
          if (isNearWhitePixel(data, p * 4, 212)) {
            visited[p] = 1;
            queue[tail++] = p;
          }
        };

        for (let px = x0; px < x1; px++) {
          trySeed(px, y0);
          trySeed(px, y1 - 1);
        }
        for (let py = y0; py < y1; py++) {
          trySeed(x0, py);
          trySeed(x1 - 1, py);
        }

        while (head < tail) {
          const p = queue[head++];
          data[p * 4 + 3] = 0;
          const px = p % w;
          const py = (p / w) | 0;

          if (px > x0) {
            const np = p - 1;
            if (!visited[np] && isNearWhitePixel(data, np * 4, 212)) {
              visited[np] = 1;
              queue[tail++] = np;
            }
          }
          if (px + 1 < x1) {
            const np = p + 1;
            if (!visited[np] && isNearWhitePixel(data, np * 4, 212)) {
              visited[np] = 1;
              queue[tail++] = np;
            }
          }
          if (py > y0) {
            const np = p - w;
            if (!visited[np] && isNearWhitePixel(data, np * 4, 212)) {
              visited[np] = 1;
              queue[tail++] = np;
            }
          }
          if (py + 1 < y1) {
            const np = p + w;
            if (!visited[np] && isNearWhitePixel(data, np * 4, 212)) {
              visited[np] = 1;
              queue[tail++] = np;
            }
          }
        }
      }
    }

    // Softly feather 1px anti-aliased bright-gray edge touching cleared background
    for (let y = 1; y < h - 1; y++) {
      const rowOff = y * w;
      for (let x = 1; x < w - 1; x++) {
        const p = rowOff + x;
        if (visited[p]) continue;
        const idx4 = p * 4;
        if (data[idx4 + 3] === 0) continue;
        if (
          !visited[p - 1] &&
          !visited[p + 1] &&
          !visited[p - w] &&
          !visited[p + w]
        ) {
          continue;
        }
        const lum = (data[idx4] + data[idx4 + 1] + data[idx4 + 2]) / 3;
        const spread =
          Math.max(data[idx4], data[idx4 + 1], data[idx4 + 2]) -
          Math.min(data[idx4], data[idx4 + 1], data[idx4 + 2]);
        if (lum >= 175 && spread <= 24) {
          data[idx4 + 3] = lum >= 200 ? 0 : Math.round(((215 - lum) / 40) * 180);
        }
      }
    }

    const metrics = measureCellBottomMetrics(data, w, h, safeCols, safeRows);
    ctx.putImageData(imgData, 0, 0);
    const pngDataUrl = canvas.toDataURL('image/png');
    return new Promise<HTMLImageElement>((resolve) => {
      const cleaned = new Image();
      cleaned.onload = () => {
        spriteMetricsByImg.set(cleaned, metrics);
        resolve(cleaned);
      };
      cleaned.onerror = () => {
        spriteMetricsByImg.set(img, metrics);
        resolve(img);
      };
      cleaned.src = pngDataUrl;
    });
  } catch {
    return Promise.resolve(img);
  }
}

export function loadImageFromUrl(
  url: string,
  metaHint?: Pick<HybridAssetItem, 'category' | 'cols' | 'rows'>
): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  const existing = imageCache.get(url);
  if (existing && existing.complete && existing.naturalWidth > 0) {
    return Promise.resolve(existing);
  }
  const inflight = pendingLoads.get(url);
  if (inflight) return inflight;

  const catalogMatch =
    metaHint || cachedCatalog.find((a) => a.url === url || `/api/assets/file/${a.id}` === url);

  const finalizeLoaded = async (loaded: HTMLImageElement): Promise<HTMLImageElement> => {
    const ratio = loaded.naturalHeight > 0 ? loaded.naturalWidth / loaded.naturalHeight : 0;
    const isLikely4x2 =
      loaded.naturalWidth >= 1100 &&
      loaded.naturalHeight >= 550 &&
      ratio >= 1.55 &&
      ratio <= 2.15;
    const isSprite = catalogMatch?.category === 'sprite_actor' || isLikely4x2;
    if (isSprite && catalogMatch?.category !== 'background') {
      const cols = Math.max(1, catalogMatch?.cols || 4);
      const rows = Math.max(1, catalogMatch?.rows || (isLikely4x2 ? 2 : 1));
      return cleanOpaqueSpriteSheetWhiteBg(loaded, cols, rows);
    }
    return loaded;
  };

  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      finalizeLoaded(img)
        .then((readyImg) => {
          imageCache.set(url, readyImg);
          pendingLoads.delete(url);
          resolve(readyImg);
        })
        .catch(() => {
          imageCache.set(url, img);
          pendingLoads.delete(url);
          resolve(img);
        });
    };
    img.onerror = () => {
      const backup = fallbackDataUrlByAssetUrl.get(url);
      if (backup && backup !== url) {
        const retryImg = new Image();
        retryImg.onload = () => {
          finalizeLoaded(retryImg)
            .then((readyImg) => {
              imageCache.set(url, readyImg);
              pendingLoads.delete(url);
              resolve(readyImg);
            })
            .catch(() => {
              imageCache.set(url, retryImg);
              pendingLoads.delete(url);
              resolve(retryImg);
            });
        };
        retryImg.onerror = () => {
          pendingLoads.delete(url);
          resolve(null);
        };
        retryImg.src = backup;
        return;
      }
      pendingLoads.delete(url);
      resolve(null);
    };
    img.src = url;
  });

  pendingLoads.set(url, p);
  return p;
}

export function getLoadedImageSync(url?: string): HTMLImageElement | null {
  if (!url) return null;
  const img = imageCache.get(url);
  if (img && img.complete && img.naturalWidth > 0) return img;
  if (!pendingLoads.has(url)) {
    void loadImageFromUrl(url);
  }
  return null;
}

export function getInlineSvgDataUrl(svgMarkup?: string): string | null {
  if (!svgMarkup || !svgMarkup.includes('<svg')) return null;
  const key = hashKey(svgMarkup);
  if (!imageCache.has(key)) {
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
    if (!pendingLoads.has(key)) {
      const p = new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          imageCache.set(key, img);
          pendingLoads.delete(key);
          resolve(img);
        };
        img.onerror = () => {
          pendingLoads.delete(key);
          resolve(null);
        };
        img.src = dataUrl;
      });
      pendingLoads.set(key, p);
    }
  }
  return key;
}

export function getLoadedInlineSvgSync(svgMarkup?: string): HTMLImageElement | null {
  const key = getInlineSvgDataUrl(svgMarkup);
  if (!key) return null;
  const img = imageCache.get(key);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

export async function preloadScriptAssets(script: VideoScript): Promise<void> {
  await refreshAssetCatalog();
  const tasks: Array<Promise<unknown>> = [];

  for (const sc of script.scenes) {
    const bgAsset =
      findAssetByIdOrTheme(sc.backgroundAssetId) || findAssetByIdOrTheme(sc.theme);
    if (bgAsset?.url) {
      tasks.push(loadImageFromUrl(bgAsset.url));
    }
    if (sc.backgroundInlineSvg) {
      const key = getInlineSvgDataUrl(sc.backgroundInlineSvg);
      if (key && pendingLoads.has(key)) {
        tasks.push(pendingLoads.get(key)!);
      }
    }
    for (const ch of sc.characters) {
      const actorAsset = resolveSpriteAssetForCharacter(ch, sc.captionTop);
      if (actorAsset?.url) {
        tasks.push(loadImageFromUrl(actorAsset.url));
      }
      if (ch.inlineSvg) {
        const key = getInlineSvgDataUrl(ch.inlineSvg);
        if (key && pendingLoads.has(key)) {
          tasks.push(pendingLoads.get(key)!);
        }
      }
    }
  }

  await Promise.all(tasks);
}

function isActionMatch(text: string, patterns: RegExp): boolean {
  return patterns.test(text);
}

export function selectActionAwareSpriteId(
  char: Pick<VideoCharacterState, 'id' | 'name' | 'action' | 'expression' | 'speech' | 'spriteAssetId'>,
  sceneContext = ''
): string | undefined {
  const charNameLow = (char.name || '').toLowerCase().replace(/গুরু/g, 'গরু');
  const spIdLow = (char.spriteAssetId || '').toLowerCase();
  const actionLow = (char.action || '').toLowerCase();
  const expLow = (char.expression || '').toLowerCase();
  const speechLow = (char.speech || '').toLowerCase();
  const normalizedCtx = `${actionLow} ${speechLow} ${sceneContext.toLowerCase()}`
    .replace(/গুতু/g, 'গুঁতো')
    .replace(/দোড়ানি/g, 'দৌড়ানি');

  // Cow family -> 8-frame sheets
  if (
    spIdLow.startsWith('cow') ||
    /(গরু|গাভী|ষাঁড়|বাছুর|\bcow\b|\bbull\b|\bcattle\b)/.test(charNameLow)
  ) {
    const calmGrazing = /(graz|eat_grass|eat|idle|calm|rest)/.test(actionLow);
    const mooCue =
      spIdLow === 'cow_mooing' ||
      isActionMatch(actionLow, /(moo|হাম্বা|ডাক)/) ||
      isActionMatch(normalizedCtx, /(moo|হাম্বা|ডাক|talk|speak|কথা)/);
    const attackCue = isActionMatch(
      normalizedCtx,
      /(attack|charge|butt|chase|গুতো|গুঁতো|তাড়া|তেড়ে|আক্রমণ|ধাক্কা|দৌড়ানি)/
    );
    if (
      spIdLow === 'cow_attacking' ||
      attackCue ||
      (expLow === 'angry' && !calmGrazing && !mooCue)
    ) {
      return 'cow_attacking';
    }
    if (mooCue || speechLow.trim().length > 0) {
      return 'cow_mooing';
    }
    return 'cow_grass_eating';
  }

  // Tiger family -> 8-frame sheets
  if (
    spIdLow.startsWith('tiger') ||
    /(বাঘ|রয়েল|সিংহ|\btiger\b|\blion\b)/.test(charNameLow)
  ) {
    if (
      spIdLow === 'tiger_run_attack' ||
      isActionMatch(
        `${actionLow} ${speechLow} ${sceneContext.toLowerCase()}`,
        /(run|attack|chase|pounce|jump|charge|দৌড়|তাড়া|ঝাঁপ|আক্রমণ|শিকার)/
      )
    ) {
      return 'tiger_run_attack';
    }
    return 'tiger_walk_roar';
  }

  // Rafu / Boy family -> 8-frame sheets
  if (
    spIdLow.startsWith('rafu') ||
    spIdLow === 'boy_scared' ||
    /(রাফু|রফু|rafu|rofu|ছেলে|বালক|\bboy\b)/.test(charNameLow)
  ) {
    if (
      spIdLow === 'rafu_running_away' ||
      isActionMatch(
        `${actionLow} ${speechLow} ${sceneContext.toLowerCase()}`,
        /(run|flee|escape|দৌড়|পালা|ভাগ)/
      )
    ) {
      return 'rafu_running_away';
    }
    if (
      spIdLow === 'rafu_scared' ||
      spIdLow === 'boy_scared' ||
      ['shocked', 'crying', 'exhausted', 'confused'].includes(expLow) ||
      isActionMatch(
        `${actionLow} ${speechLow} ${sceneContext.toLowerCase()}`,
        /(scared|shocked|afraid|fear|panick|scream|jump|cry|ভয়|আতঙ্ক|চমক|কান্না|ওরে|বাঁচাও)/
      )
    ) {
      return 'rafu_scared';
    }
    return 'rafu_walk_talk';
  }

  return undefined;
}

export function shouldCharacterUseSpriteSheet(
  char: VideoCharacterState
): boolean {
  const usesLegacyStickPropScene =
    ['knock_door', 'desperate_squeeze', 'scream_jaw', 'dramatic_closeup', 'collapsed_mess', 'pour_water'].includes(
      String(char.action || '')
    ) || Boolean(char.prop && char.prop !== 'none');

  if (char.kind === 'sprite_actor' || Boolean(char.spriteAssetId)) return true;
  if (usesLegacyStickPropScene) return false;

  const charNameLow = (char.name || '').toLowerCase().replace(/গুরু/g, 'গরু');
  return /(গরু|গাভী|ষাঁড়|বাঘ|রাফু|রফু|rafu|rofu|ছেলে|বালক|\bcow\b|\btiger\b|\bboy\b)/.test(
    charNameLow
  );
}

export function resolveSpriteAssetForCharacter(
  char: VideoCharacterState,
  sceneContext = ''
): HybridAssetItem | undefined {
  // Humans rendered with articulated rig stay human_rig unless they match Rafu/Cow/Tiger 8-frame sheets
  if (char.kind === 'human_rig' && !shouldCharacterUseSpriteSheet(char)) {
    return undefined;
  }

  // Prioritize action-aware 8-frame sheet for Cow, Tiger, and Rafu/Boy
  const smartId = selectActionAwareSpriteId(char, sceneContext);
  if (smartId) {
    const smartAsset = findAssetByIdOrTheme(smartId);
    if (smartAsset) return smartAsset;
  }

  if (char.spriteAssetId) {
    const exact = findAssetByIdOrTheme(char.spriteAssetId);
    if (exact) return exact;
  }

  const hay =
    char.kind === 'sprite_actor'
      ? `${char.name || ''} ${char.speech || ''} ${sceneContext || ''}`
          .toLowerCase()
          .replace(/গুরু/g, 'গরু')
      : `${char.name || ''}`.toLowerCase().replace(/গুরু/g, 'গরু');

  if (!hay.trim()) return undefined;

  const spriteActors = cachedCatalog.filter((a) => a.category === 'sprite_actor');
  let best: HybridAssetItem | undefined;
  let bestScore = 0;

  for (const asset of spriteActors) {
    let score = 0;
    const nameLower = asset.name.toLowerCase().replace(/গুরু/g, 'গরু');
    const idLower = asset.id.toLowerCase();
    const charNameLow = (char.name || '').toLowerCase().replace(/গুরু/g, 'গরু').trim();
    const multiFrameBonus = (asset.frameCount || 1) >= 8 ? 3 : 0;

    if (charNameLow && (nameLower.includes(charNameLow) || idLower === charNameLow)) {
      score += 6 + multiFrameBonus;
    }
    for (const kw of asset.keywords) {
      const k = kw.toLowerCase().replace(/গুরু/g, 'গরু').trim();
      if (k && hay.includes(k)) {
        score += (asset.source === 'builtin' ? 3 : 6) + multiFrameBonus;
      }
    }
    for (const word of nameLower.split(/[\s,_\-()]+/)) {
      if (word.length >= 2 && hay.includes(word)) {
        score += asset.source === 'builtin' ? 2 : 4;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = asset;
    }
  }

  return bestScore > 0 ? best : undefined;
}
