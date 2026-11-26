import type { HybridAssetItem, VideoCharacterState, VideoScript } from '../types/comic';

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
    id: 'cow',
    name: 'দেশি গরু (৪-ফ্রেম স্প্রাইট)',
    keywords: ['গরু', 'গাভী', 'ষাঁড়', 'গুতো', 'বাছুর', 'cow', 'bull', 'cattle'],
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
    id: 'tiger',
    name: 'রয়েল বেঙ্গল বাঘ (৪-ফ্রেম স্প্রাইট)',
    keywords: ['বাঘ', 'সিংহ', 'জঙ্গল', 'tiger', 'lion'],
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

let cachedCatalog: HybridAssetItem[] = [...BUILTIN_HYBRID_ASSETS];
const imageCache = new Map<string, HTMLImageElement>();
const pendingLoads = new Map<string, Promise<HTMLImageElement | null>>();

export function getCachedAssetCatalog(): HybridAssetItem[] {
  return cachedCatalog;
}

export function setCachedAssetCatalog(items: HybridAssetItem[]) {
  const byId = new Map<string, HybridAssetItem>();
  for (const b of BUILTIN_HYBRID_ASSETS) byId.set(b.id, b);
  for (const item of items) byId.set(item.id, item);
  cachedCatalog = Array.from(byId.values());
}

export async function refreshAssetCatalog(): Promise<HybridAssetItem[]> {
  try {
    const res = await fetch('/api/assets');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.assets)) {
        setCachedAssetCatalog(data.assets);
      }
    }
  } catch {
    // Keep builtin catalog fallback offline
  }
  return cachedCatalog;
}

export function findAssetByIdOrTheme(idOrTheme?: string): HybridAssetItem | undefined {
  if (!idOrTheme) return undefined;
  const normalized = idOrTheme.trim().toLowerCase();
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

export function loadImageFromUrl(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  const existing = imageCache.get(url);
  if (existing && existing.complete && existing.naturalWidth > 0) {
    return Promise.resolve(existing);
  }
  const inflight = pendingLoads.get(url);
  if (inflight) return inflight;

  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(url, img);
      pendingLoads.delete(url);
      resolve(img);
    };
    img.onerror = () => {
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
  // Trigger lazy background load if not started yet
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
      if (ch.spriteAssetId) {
        const actorAsset = findAssetByIdOrTheme(ch.spriteAssetId);
        if (actorAsset?.url) {
          tasks.push(loadImageFromUrl(actorAsset.url));
        }
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

export function resolveSpriteAssetForCharacter(
  char: VideoCharacterState
): HybridAssetItem | undefined {
  if (char.spriteAssetId) {
    const exact = findAssetByIdOrTheme(char.spriteAssetId);
    if (exact) return exact;
  }
  if (char.kind === 'sprite_actor') {
    const nameLower = (char.name || '').toLowerCase();
    return cachedCatalog.find(
      (a) =>
        a.category === 'sprite_actor' &&
        (a.name.toLowerCase().includes(nameLower) ||
          a.keywords.some((kw) => nameLower.includes(kw.toLowerCase())))
    );
  }
  return undefined;
}
