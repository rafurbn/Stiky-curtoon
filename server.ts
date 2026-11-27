import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import ffmpegStatic from 'ffmpeg-static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FFMPEG_PATH =
  typeof ffmpegStatic === 'string' && ffmpegStatic.length > 0 ? ffmpegStatic : 'ffmpeg';

const DATA_DIR = path.resolve(__dirname, 'data');
const SAVED_VIDEOS_DIR = path.join(DATA_DIR, 'saved-videos');
const SAVED_VIDEOS_INDEX = path.join(SAVED_VIDEOS_DIR, 'index.json');
const SAVED_PROJECTS_FILE = path.join(DATA_DIR, 'video-projects.json');
const CUSTOM_ASSETS_DIR = path.join(DATA_DIR, 'custom-assets');
const CUSTOM_ASSETS_INDEX = path.join(CUSTOM_ASSETS_DIR, 'index.json');
const PUBLIC_ASSETS_ROOT = path.resolve(__dirname, 'public', 'assets');
const PUBLIC_BACKGROUNDS_DIR = path.resolve(__dirname, 'public', 'assets', 'backgrounds');
const PUBLIC_ACTORS_DIR = path.resolve(__dirname, 'public', 'assets', 'actors');

const app = express();
app.use(express.json({ limit: '35mb' }));
app.use('/assets', express.static(path.resolve(__dirname, 'public', 'assets')));

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});

const uploadAsset = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

async function ensureDataDirs() {
  await fs.mkdir(SAVED_VIDEOS_DIR, { recursive: true });
  await fs.mkdir(CUSTOM_ASSETS_DIR, { recursive: true });
}

interface SavedVideoMeta {
  id: string;
  videoId: string;
  title: string;
  category: string;
  renderStyle: 'stick_meme' | 'cartoon_2d';
  aspectRatio: '9:16' | '1:1';
  durationSec: number;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  fbCaption?: string;
  fileName: string;
  serverUrl: string;
}

async function readSavedVideosIndex(): Promise<SavedVideoMeta[]> {
  await ensureDataDirs();
  try {
    const raw = await fs.readFile(SAVED_VIDEOS_INDEX, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeSavedVideosIndex(items: SavedVideoMeta[]): Promise<void> {
  await ensureDataDirs();
  await fs.writeFile(SAVED_VIDEOS_INDEX, JSON.stringify(items, null, 2), 'utf8');
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractGeminiErrorInfo(err: unknown): {
  code?: number;
  status?: string;
  message: string;
} {
  const rawMessage = err instanceof Error ? err.message : String(err || 'Unknown error');
  const errObj = err as { status?: number; code?: number };
  let code =
    typeof errObj?.status === 'number'
      ? errObj.status
      : typeof errObj?.code === 'number'
        ? errObj.code
        : undefined;
  let statusText: string | undefined;
  let cleanMessage = rawMessage;

  try {
    const jsonStart = rawMessage.indexOf('{');
    if (jsonStart !== -1) {
      const parsed = JSON.parse(rawMessage.slice(jsonStart));
      const inner = parsed?.error ?? parsed;
      if (typeof inner?.code === 'number') code = inner.code;
      if (typeof inner?.status === 'string') statusText = inner.status;
      if (typeof inner?.message === 'string') cleanMessage = inner.message;
    }
  } catch {
    // Keep original message
  }
  return { code, status: statusText, message: cleanMessage };
}

function shouldRetryOrFallback(err: unknown): boolean {
  const info = extractGeminiErrorInfo(err);
  const msg = info.message.toLowerCase();
  return (
    info.code === 503 ||
    info.code === 429 ||
    info.code === 500 ||
    info.code === 404 ||
    info.status === 'UNAVAILABLE' ||
    info.status === 'RESOURCE_EXHAUSTED' ||
    info.status === 'NOT_FOUND' ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('resource_exhausted') ||
    msg.includes('not_found') ||
    msg.includes('fetch failed')
  );
}

function formatFriendlyGeminiError(err: unknown): { httpStatus: number; message: string } {
  const info = extractGeminiErrorInfo(err);
  const msg = info.message.toLowerCase();
  if (info.code === 503 || info.status === 'UNAVAILABLE' || msg.includes('high demand')) {
    return {
      httpStatus: 503,
      message:
        'AI সার্ভারে এই মুহূর্তে অতিরিক্ত চাপ রয়েছে (503)। অনুগ্রহ করে ১০–১৫ সেকেন্ড পর আবার চেষ্টা করুন।',
    };
  }
  if (info.code === 429 || info.status === 'RESOURCE_EXHAUSTED' || msg.includes('quota')) {
    return {
      httpStatus: 429,
      message:
        'Gemini API রেট লিমিট বা ফ্রি কোটা সাময়িকভাবে পূর্ণ হয়েছে (429)। কিছুক্ষণ পর আবার চেষ্টা করুন।',
    };
  }
  return {
    httpStatus: 500,
    message: info.message || 'AI স্ক্রিপ্ট তৈরি করা যায়নি।',
  };
}

const GEMINI_TEXT_MODEL_CHAIN = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;

async function generateJsonWithRetryAndFallback(params: {
  ai: GoogleGenAI;
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
}) {
  let lastError: unknown;
  for (const model of GEMINI_TEXT_MODEL_CHAIN) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const isGemini4 = model.startsWith('gemini-4');
        const response = await params.ai.models.generateContent({
          model,
          contents: params.contents,
          config: {
            systemInstruction: params.systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: params.responseSchema as never,
            ...(isGemini4
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        });
        if (response.text?.trim()) {
          return response;
        }
      } catch (err) {
        lastError = err;
        if (!shouldRetryOrFallback(err)) {
          throw err;
        }
        await sleep(800 * (attempt + 1));
      }
    }
  }
  throw lastError || new Error('All Gemini models failed.');
}

async function generateTextWithRetryAndFallback(params: {
  ai: GoogleGenAI;
  contents: string;
  systemInstruction: string;
}) {
  let lastError: unknown;
  for (const model of GEMINI_TEXT_MODEL_CHAIN) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const isGemini4 = model.startsWith('gemini-4');
        const response = await params.ai.models.generateContent({
          model,
          contents: params.contents,
          config: {
            systemInstruction: params.systemInstruction,
            ...(isGemini4
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        });
        if (response.text?.trim()) {
          return response.text.trim();
        }
      } catch (err) {
        lastError = err;
        if (!shouldRetryOrFallback(err)) {
          throw err;
        }
        await sleep(800 * (attempt + 1));
      }
    }
  }
  throw lastError || new Error('All Gemini models failed.');
}

/* ============================================================================
 * HYBRID SPRITE & BACKGROUND ASSET MANAGER (Builtin + Local Folder + Upload + AI SVG)
 * ========================================================================== */

interface HybridAssetMeta {
  id: string;
  name: string;
  keywords: string[];
  category: 'background' | 'sprite_actor' | 'prop';
  format: 'svg' | 'svg_spritesheet' | 'png_spritesheet' | 'png';
  source: 'builtin' | 'folder' | 'uploaded' | 'ai_generated';
  url: string;
  fileName?: string;
  cols?: number;
  rows?: number;
  frameCount?: number;
  fps?: number;
  createdAt?: string;
}

const BUILTIN_ASSET_DEFS: HybridAssetMeta[] = [
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
    id: 'boy_scared',
    name: 'রাফু / ছেলে ভয় পেয়েছে (৮-ফ্রেম স্প্রাইট)',
    keywords: ['ভয়', 'চমকে', 'আতঙ্ক', 'কান্না', 'ভীত', 'ছেলে ভয়', 'রাফু ভয়', 'রফু ভয়', 'boy scared', 'scared', 'shocked', 'afraid', 'panicked', 'crying', 'rafu'],
    category: 'sprite_actor',
    format: 'svg_spritesheet',
    source: 'builtin',
    url: '/assets/actors/boy_scared.svg',
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

function sanitizeSvg(rawInput: string): string {
  const trimmed = String(rawInput || '')
    .replace(/^```(?:svg|xml|html)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = trimmed.search(/<svg[\s>]/i);
  const end = trimmed.toLowerCase().lastIndexOf('</svg>');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('বৈধ SVG কোড পাওয়া যায়নি।');
  }
  let svg = trimmed.slice(start, end + 6);
  // Strip dangerous executable or embedded tags
  svg = svg.replace(/<(script|iframe|object|embed|foreignObject|link|meta)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  svg = svg.replace(/<(script|iframe|object|embed|foreignObject|link|meta)\b[^>]*\/?>/gi, '');
  // Strip inline event handlers like onload=, onclick=, onmouseover=
  svg = svg.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Neutralize javascript:/vbscript:/data:text/html URIs
  svg = svg.replace(/(href|xlink:href|src)\s*=\s*(['"])\s*(?:javascript|vbscript|data:text\/html|data:application)[^'"]*\2/gi, '$1=""');
  svg = svg.replace(/javascript\s*:/gi, '');
  if (!/xmlns\s*=/i.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  const openTagMatch = svg.match(/^<svg\b[^>]*>/i);
  if (openTagMatch) {
    let openTag = openTagMatch[0];
    const vbMatch = openTag.match(/\bviewBox\s*=\s*["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*["']/i);
    if (vbMatch) {
      const vbW = Number(vbMatch[1]);
      const vbH = Number(vbMatch[2]);
      if (vbW > 0 && vbH > 0) {
        if (!/\bwidth\s*=/i.test(openTag)) {
          openTag = openTag.replace(/^<svg\b/i, `<svg width="${vbW}"`);
        }
        if (!/\bheight\s*=/i.test(openTag)) {
          openTag = openTag.replace(/^<svg\b/i, `<svg height="${vbH}"`);
        }
        svg = openTag + svg.slice(openTagMatch[0].length);
      }
    }
  }
  return svg;
}

function resolveConfinedAssetPath(filename: string): string | null {
  const safeBase = path.basename(String(filename || '')).replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!safeBase || safeBase !== filename) return null;
  const resolved = path.resolve(CUSTOM_ASSETS_DIR, safeBase);
  if (!resolved.startsWith(CUSTOM_ASSETS_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

async function readCustomAssetsIndex(): Promise<HybridAssetMeta[]> {
  await ensureDataDirs();
  try {
    const raw = await fs.readFile(CUSTOM_ASSETS_INDEX, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeCustomAssetsIndex(items: HybridAssetMeta[]): Promise<void> {
  await ensureDataDirs();
  await fs.writeFile(CUSTOM_ASSETS_INDEX, JSON.stringify(items, null, 2), 'utf8');
}

async function scanFolderAssets(
  dirPath: string,
  category: 'background' | 'sprite_actor',
  urlPrefix: string,
  builtinIds: Set<string>
): Promise<HybridAssetMeta[]> {
  const results: HybridAssetMeta[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!['.svg', '.png', '.webp', '.jpg', '.jpeg'].includes(ext)) continue;
      const stem = path.basename(entry.name, ext);
      const id = stem.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      if (builtinIds.has(id)) continue;

      const isSvg = ext === '.svg';
      let cols = 1;
      let rows = 1;
      let frameCount = 1;
      let fps = 1;

      if (category === 'sprite_actor') {
        const gridMatch = stem.match(/_(\d+)x(\d+)$/i);
        if (gridMatch) {
          cols = Math.max(1, Math.min(16, Number(gridMatch[1]) || 4));
          rows = Math.max(1, Math.min(8, Number(gridMatch[2]) || 1));
          frameCount = cols * rows;
          fps = 7;
        } else if (stem.toLowerCase().includes('spritesheet') || isSvg) {
          if (isSvg) {
            try {
              const svgHead = await fs.readFile(path.join(dirPath, entry.name), 'utf8');
              const vbMatch = svgHead.match(
                /viewBox\s*=\s*["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*["']/i
              );
              const vbW = vbMatch ? Number(vbMatch[1]) : 0;
              const vbH = vbMatch ? Number(vbMatch[2]) : 0;
              if (vbW >= 1280 && vbW <= 1600 && vbH >= 640 && vbH <= 900) {
                cols = 4;
                rows = 2;
                frameCount = 8;
                fps = 8;
              } else if (/viewBox\s*=\s*["']0\s+0\s+1200\s+/i.test(svgHead)) {
                cols = 4;
                rows = 1;
                frameCount = 4;
                fps = 7;
              }
            } catch {
              // ignore
            }
          } else if (stem.toLowerCase().includes('spritesheet')) {
            cols = 4;
            rows = 1;
            frameCount = 4;
            fps = 7;
          }
        }
      }

      const format: HybridAssetMeta['format'] =
        category === 'sprite_actor' && frameCount > 1
          ? isSvg
            ? 'svg_spritesheet'
            : 'png_spritesheet'
          : isSvg
            ? 'svg'
            : 'png';

      const displayName = stem.replace(/[_-]+/g, ' ').replace(/\b\d+x\d+\b/g, '').trim();
      results.push({
        id,
        name: displayName || id,
        keywords: displayName.toLowerCase().split(/\s+/).filter(Boolean),
        category,
        format,
        source: 'folder',
        url: `${urlPrefix}/${encodeURIComponent(entry.name)}`,
        cols,
        rows,
        frameCount,
        fps,
      });
    }
  } catch {
    // Folder might not exist yet
  }
  return results;
}

async function getAllHybridAssets(): Promise<HybridAssetMeta[]> {
  const builtinIds = new Set(BUILTIN_ASSET_DEFS.map((a) => a.id));
  const [folderBgs, folderActors, folderRootActors, customAssets] = await Promise.all([
    scanFolderAssets(PUBLIC_BACKGROUNDS_DIR, 'background', '/assets/backgrounds', builtinIds),
    scanFolderAssets(PUBLIC_ACTORS_DIR, 'sprite_actor', '/assets/actors', builtinIds),
    scanFolderAssets(PUBLIC_ASSETS_ROOT, 'sprite_actor', '/assets', builtinIds),
    readCustomAssetsIndex(),
  ]);
  const byId = new Map<string, HybridAssetMeta>();
  for (const a of BUILTIN_ASSET_DEFS) byId.set(a.id, a);
  for (const a of folderBgs) byId.set(a.id, a);
  for (const a of folderActors) byId.set(a.id, a);
  for (const a of folderRootActors) if (!byId.has(a.id)) byId.set(a.id, a);
  for (const a of customAssets) byId.set(a.id, a);
  return Array.from(byId.values());
}

async function generateAndSaveHybridSvgAsset(params: {
  prompt: string;
  category: 'background' | 'sprite_actor';
  requestedId?: string;
  name?: string;
  keywords?: string[];
  saveToLibrary?: boolean;
}): Promise<{ asset?: HybridAssetMeta; svg: string }> {
  const ai = getGeminiClient();
  const isBg = params.category === 'background';

  const systemInstruction = isBg
    ? `You are a professional 2D cartoon vector background illustrator.
Return ONLY a single valid, clean, flat-design colorful SVG (no markdown fences, no commentary).
Rules:
- Root element: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1280" width="720" height="1280">
- Horizon/ground line MUST sit at y="922" (72% from top): sky/buildings/trees occupy y=0..922 and ground/road/grass/floor occupies y=922..1280.
- Use crisp Bengali 2D cartoon shapes, soft <linearGradient> sky, warm outlines, zero text watermarks, zero <script>, zero external href/url links.`
    : `You are a professional 2D cartoon sprite-sheet vector artist.
Return ONLY a single valid, clean, colorful 4-frame horizontal sprite sheet SVG (no markdown fences, no commentary).
Rules:
- Root element: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 260" width="1200" height="260">
- Strictly 4 equal animation frames placed side-by-side:
  Frame 0 (x: 0..300): Idle standing pose facing RIGHT, feet/wheels touching y=245
  Frame 1 (x: 300..600): Walk/move stride A facing RIGHT, feet/wheels touching y=245
  Frame 2 (x: 600..900): Walk/move stride B facing RIGHT, feet/wheels touching y=245
  Frame 3 (x: 900..1200): Dramatic action / charge / jump / attack pose facing RIGHT
- Keep each frame strictly centered inside its 300px cell (centers at x=150, 450, 750, 1050) without overlapping neighbor cells.
- Use bold dark cartoon outlines (#1E293B stroke-width="3"), vivid flat colors, transparent background, zero <script>, zero external links.`;

  const rawSvg = await generateTextWithRetryAndFallback({
    ai,
    systemInstruction,
    contents: isBg
      ? `Draw a colorful 2D Bangladeshi cartoon background scene for: "${params.prompt}". Keep horizon strictly at y=922.`
      : `Draw a 4-frame horizontal 2D cartoon sprite sheet (facing RIGHT, transparent background) for: "${params.prompt}".`,
  });

  const cleanSvg = sanitizeSvg(rawSvg);

  if (params.saveToLibrary === false) {
    return { svg: cleanSvg };
  }

  await ensureDataDirs();
  const slugBase = (params.requestedId || params.name || params.prompt)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  const id = slugBase
    ? `${slugBase}_${Date.now().toString(36).slice(-4)}`
    : `ai_${Date.now().toString(36)}`;
  const fileName = `${id}.svg`;
  const filePath = resolveConfinedAssetPath(fileName);
  if (!filePath) throw new Error('অবৈধ ফাইল নাম।');

  await fs.writeFile(filePath, cleanSvg, 'utf8');

  const meta: HybridAssetMeta = {
    id,
    name: params.name || params.prompt.slice(0, 40),
    keywords:
      params.keywords && params.keywords.length > 0
        ? params.keywords
        : params.prompt.toLowerCase().split(/[\s,]+/).filter(Boolean).slice(0, 8),
    category: params.category,
    format: isBg ? 'svg' : 'svg_spritesheet',
    source: 'ai_generated',
    url: `/api/assets/file/${encodeURIComponent(fileName)}`,
    fileName,
    ...(isBg ? {} : { cols: 4, rows: 1, frameCount: 4, fps: 7 }),
    createdAt: new Date().toISOString(),
  };

  const existing = await readCustomAssetsIndex();
  await writeCustomAssetsIndex([meta, ...existing.filter((x) => x.id !== id)]);
  return { asset: meta, svg: cleanSvg };
}

app.get('/api/assets', async (_req, res) => {
  try {
    const assets = await getAllHybridAssets();
    return res.json({ assets });
  } catch (err) {
    console.error('List assets error:', err);
    return res.status(500).json({ error: 'অ্যাসেট তালিকা লোড করা যায়নি।' });
  }
});

app.get('/api/assets/file/:filename', async (req, res) => {
  try {
    const filePath = resolveConfinedAssetPath(req.params.filename);
    if (!filePath) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === '.svg'
        ? 'image/svg+xml'
        : ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(filePath);
  } catch {
    return res.status(404).json({ error: 'অ্যাসেট ফাইল পাওয়া যায়নি।' });
  }
});

app.post('/api/assets/upload', uploadAsset.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'আপলোড করার জন্য একটি SVG বা PNG ফাইল নির্বাচন করুন।' });
    }
    const origExt = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    const isSvg = origExt === '.svg' || mime.includes('svg');
    const isRaster =
      ['.png', '.webp', '.jpg', '.jpeg'].includes(origExt) ||
      ['image/png', 'image/webp', 'image/jpeg'].includes(mime);

    if (!isSvg && !isRaster) {
      return res.status(400).json({
        error: 'শুধুমাত্র .svg, .png, .webp অথবা .jpg ফাইল আপলোড করা যাবে।',
      });
    }

    await ensureDataDirs();
    const {
      name = '',
      category = 'sprite_actor',
      keywords = '',
      cols = '4',
      rows = '1',
      frameCount = '4',
      fps = '7',
    } = req.body ?? {};

    const cleanCategory: HybridAssetMeta['category'] =
      category === 'background' ? 'background' : category === 'prop' ? 'prop' : 'sprite_actor';

    const parsedCols = Math.max(1, Math.min(16, Number(cols) || 1));
    const parsedRows = Math.max(1, Math.min(8, Number(rows) || 1));
    const parsedFrames = Math.max(1, Math.min(64, Number(frameCount) || parsedCols * parsedRows));
    const parsedFps = Math.max(1, Math.min(24, Number(fps) || 7));

    const baseName = String(name || path.basename(file.originalname, origExt) || 'custom_asset').trim();
    const slug = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
    const id = `${slug || 'asset'}_${Date.now().toString(36).slice(-5)}`;
    const safeExt = isSvg ? '.svg' : origExt === '.webp' ? '.webp' : origExt === '.jpg' || origExt === '.jpeg' ? '.jpg' : '.png';
    const fileName = `${id}${safeExt}`;
    const filePath = resolveConfinedAssetPath(fileName);
    if (!filePath) {
      return res.status(400).json({ error: 'অবৈধ ফাইল নাম।' });
    }

    if (isSvg) {
      const sanitized = sanitizeSvg(file.buffer.toString('utf8'));
      await fs.writeFile(filePath, sanitized, 'utf8');
    } else {
      await fs.writeFile(filePath, file.buffer);
    }

    const parsedKeywords = Array.isArray(keywords)
      ? keywords.map((k) => String(k).trim()).filter(Boolean)
      : String(keywords || '')
          .split(/[,।\n]+/)
          .map((k) => k.trim())
          .filter(Boolean);

    const isSheet = cleanCategory === 'sprite_actor' && parsedFrames > 1;
    const format: HybridAssetMeta['format'] = isSheet
      ? isSvg
        ? 'svg_spritesheet'
        : 'png_spritesheet'
      : isSvg
        ? 'svg'
        : 'png';

    const autoKeywords = Array.from(
      new Set([
        baseName.toLowerCase(),
        ...baseName
          .toLowerCase()
          .split(/[\s,_\-।()]+/)
          .map((w) => w.trim())
          .filter((w) => w.length >= 2),
      ])
    ).filter(Boolean);

    const meta: HybridAssetMeta = {
      id,
      name: baseName,
      keywords: parsedKeywords.length > 0 ? parsedKeywords : autoKeywords,
      category: cleanCategory,
      format,
      source: 'uploaded',
      url: `/api/assets/file/${encodeURIComponent(fileName)}`,
      fileName,
      ...(cleanCategory === 'sprite_actor'
        ? { cols: parsedCols, rows: parsedRows, frameCount: parsedFrames, fps: parsedFps }
        : {}),
      createdAt: new Date().toISOString(),
    };

    const existing = await readCustomAssetsIndex();
    await writeCustomAssetsIndex([meta, ...existing.filter((x) => x.id !== id)]);
    return res.json({ asset: meta });
  } catch (err) {
    console.error('Asset upload error:', err);
    return res.status(400).json({
      error: err instanceof Error ? err.message : 'অ্যাসেট আপলোড করা যায়নি।',
    });
  }
});

app.post('/api/assets/generate-svg', async (req, res) => {
  try {
    const {
      prompt = '',
      category = 'sprite_actor',
      name = '',
      keywords = '',
      saveToLibrary = true,
    } = req.body ?? {};
    const cleanPrompt = String(prompt || '').trim();
    if (!cleanPrompt) {
      return res.status(400).json({ error: 'SVG তৈরি করার জন্য বর্ণনা (Prompt) লিখুন।' });
    }
    const cleanCategory = category === 'background' ? 'background' : 'sprite_actor';
    const kwList = Array.isArray(keywords)
      ? keywords.map((k) => String(k).trim()).filter(Boolean)
      : String(keywords || '')
          .split(/[,।\n]+/)
          .map((k) => k.trim())
          .filter(Boolean);

    const result = await generateAndSaveHybridSvgAsset({
      prompt: cleanPrompt,
      category: cleanCategory,
      name: String(name || '').trim() || undefined,
      keywords: kwList,
      saveToLibrary: saveToLibrary !== false,
    });

    return res.json(result);
  } catch (err) {
    const friendly = formatFriendlyGeminiError(err);
    console.error('Generate SVG asset error:', err);
    return res.status(friendly.httpStatus).json({ error: friendly.message });
  }
});

app.delete('/api/assets/:id', async (req, res) => {
  try {
    const cleanId = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (BUILTIN_ASSET_DEFS.some((a) => a.id === cleanId)) {
      return res.status(400).json({ error: 'বিল্ট-ইন অ্যাসেট মুছে ফেলা যাবে না।' });
    }
    const existing = await readCustomAssetsIndex();
    const target = existing.find((x) => x.id === cleanId);
    if (!target) {
      return res.status(404).json({ error: 'কাস্টম অ্যাসেট খুঁজে পাওয়া যায়নি।' });
    }
    if (target.fileName) {
      const filePath = resolveConfinedAssetPath(target.fileName);
      if (filePath) {
        await fs.unlink(filePath).catch(() => {});
      }
    }
    await writeCustomAssetsIndex(existing.filter((x) => x.id !== cleanId));
    return res.json({ ok: true });
  } catch (err) {
    console.error('Delete asset error:', err);
    return res.status(500).json({ error: 'অ্যাসেট মুছে ফেলা যায়নি।' });
  }
});

const CATEGORY_POOL = [
  'বন্ধুদের আড্ডা ও মেস লাইফ',
  'টাকা ধার ও কৃপণ বন্ধু',
  'দৈনন্দিন মজার বিব্রতকর ঘটনা',
  'চা-দোকানের বুদ্ধিজীবী গপ্পো',
  'অফিস, বস ও ছুটির বাহানা',
  'মোবাইল, নেট ও পরীক্ষার হল',
];

app.post('/api/generate-comic', async (req, res) => {
  try {
    const {
      category = 'auto',
      languageMode = 'bangla',
      layout = 'auto',
      paperTheme = 'studio_white',
      customHint = '',
    } = req.body ?? {};

    const chosenCategory =
      category === 'auto'
        ? CATEGORY_POOL[Math.floor(Math.random() * CATEGORY_POOL.length)]
        : String(category);
    const chosenLayout = ['1-panel', '2-panel', '3-panel', '4-panel'].includes(String(layout))
      ? String(layout)
      : '2-panel';
    const panelCount = parseInt(chosenLayout, 10) || 2;
    const chosenTheme = [
      'cream_sketch',
      'studio_white',
      'notebook_grid',
      'sunny_tint',
      'chalk_mint',
    ].includes(String(paperTheme))
      ? String(paperTheme)
      : 'studio_white';

    const langRule =
      languageMode === 'banglish'
        ? 'Write witty Bangladeshi Banglish (Bengali words in English letters).'
        : 'Write natural, witty Bangladeshi colloquial Bengali (বাংলা).';

    const ai = getGeminiClient();
    const prompt = `Create a ${panelCount}-panel 100% original copyright-free Bengali stick-figure comic strip for "@@RAFU FOLK@@".
Category: ${chosenCategory}.
${customHint ? `Topic hint: "${String(customHint).trim()}".` : ''}
${langRule}
Keep speeches short (max 42 characters). Write an engaging Facebook caption with 2-3 hashtags.`;

    const response = await generateJsonWithRetryAndFallback({
      ai,
      contents: prompt,
      systemInstruction:
        'You are a viral Bengali stick-figure comic writer for "@@RAFU FOLK@@". Return strictly valid JSON.',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          fbCaption: { type: Type.STRING },
          panels: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                panelIndex: { type: Type.INTEGER },
                captionTop: { type: Type.STRING },
                sceneProp: {
                  type: Type.STRING,
                  enum: [
                    'none',
                    'tea_cup',
                    'smartphone',
                    'laptop',
                    'money',
                    'clock',
                    'book',
                    'heart',
                    'sweat',
                    'anger_vein',
                    'question',
                    'exclamation',
                    'lightbulb',
                  ],
                },
                moodFx: {
                  type: Type.STRING,
                  enum: [
                    'none',
                    'sweat',
                    'anger_vein',
                    'sparkles',
                    'question',
                    'exclamation',
                    'lightbulb',
                  ],
                },
                characters: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: {
                        type: Type.STRING,
                        enum: ['rafu', 'folk', 'boss', 'chacha', 'friend'],
                      },
                      name: { type: Type.STRING },
                      side: { type: Type.STRING, enum: ['left', 'right', 'center'] },
                      expression: {
                        type: Type.STRING,
                        enum: [
                          'happy',
                          'laughing',
                          'shocked',
                          'angry',
                          'deadpan',
                          'confused',
                          'crying',
                          'smug',
                          'wink',
                        ],
                      },
                      pose: {
                        type: Type.STRING,
                        enum: [
                          'standing',
                          'pointing',
                          'facepalm',
                          'hands_up',
                          'shrugging',
                          'holding_phone',
                          'holding_tea',
                          'sitting_desk',
                          'running',
                        ],
                      },
                      speech: { type: Type.STRING },
                      thought: { type: Type.BOOLEAN },
                    },
                    required: ['id', 'name', 'side', 'expression', 'pose'],
                  },
                },
              },
              required: ['panelIndex', 'sceneProp', 'characters'],
            },
          },
        },
        required: ['title', 'fbCaption', 'panels'],
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: 'AI থেকে খালি উত্তর এসেছে। আবার চেষ্টা করুন।' });
    }
    const parsed = JSON.parse(rawText);
    return res.json({
      id: `rf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: String(parsed.title || 'রাফু ও ফোকের কাণ্ড'),
      category: chosenCategory,
      layout: chosenLayout,
      paperTheme: chosenTheme,
      panels: Array.isArray(parsed.panels) ? parsed.panels.slice(0, panelCount) : [],
      fbCaption: String(parsed.fbCaption || 'কার সাথে এমন হয়েছে? কমেন্টে জানান!'),
      createdAt: new Date().toISOString(),
      seed: Math.floor(Math.random() * 900000) + 100000,
    });
  } catch (err) {
    const friendly = formatFriendlyGeminiError(err);
    console.error('Generate comic error:', err);
    return res.status(friendly.httpStatus).json({ error: friendly.message });
  }
});

const VALID_VIDEO_THEMES = [
  'bathroom_rush',
  'room_door',
  'bedroom_night',
  'exam_hall',
  'rain_storm',
  'desert_sun',
  'office_drama',
  'tea_stall',
  'street_night',
] as const;

app.post('/api/generate-video', async (req, res) => {
  try {
    const {
      mode = 'auto',
      customScript = '',
      customHint = '',
      renderStyle = 'auto',
      aspectRatio = '9:16',
      dialogueMode = 'bangla',
      recentTitles = [],
      clientCustomAssets = [],
    } = req.body ?? {};

    const safeAspect = aspectRatio === '1:1' ? '1:1' : '9:16';
    const requestedStyle =
      renderStyle === 'stick_meme' || renderStyle === 'cartoon_2d' ? renderStyle : 'auto';
    const rawUserScript = typeof customScript === 'string' ? customScript.trim() : '';
    const rawHint = typeof customHint === 'string' ? customHint.trim() : '';
    const isCustomScriptMode = mode === 'custom_script' && rawUserScript.length > 0;

    if (mode === 'custom_script' && !rawUserScript) {
      return res.status(400).json({ error: 'অনুগ্রহ করে আপনার স্ক্রিপ্ট বা গল্পটি লিখুন।' });
    }

    const serverCatalog = await getAllHybridAssets();
    const mergedById = new Map<string, HybridAssetMeta>();
    for (const a of serverCatalog) mergedById.set(a.id.toLowerCase(), a);
    if (Array.isArray(clientCustomAssets)) {
      for (const ca of clientCustomAssets as Array<Record<string, unknown>>) {
        const cid = typeof ca?.id === 'string' ? ca.id.trim() : '';
        if (!cid || mergedById.has(cid.toLowerCase())) continue;
        mergedById.set(cid.toLowerCase(), {
          id: cid,
          name: String(ca.name || cid),
          keywords: Array.isArray(ca.keywords) ? ca.keywords.map((k) => String(k)) : [String(ca.name || cid)],
          category:
            ca.category === 'background'
              ? 'background'
              : ca.category === 'prop'
                ? 'prop'
                : 'sprite_actor',
          format:
            ca.format === 'svg' || ca.format === 'png' || ca.format === 'png_spritesheet' || ca.format === 'svg_spritesheet'
              ? ca.format
              : 'png_spritesheet',
          source: 'uploaded',
          url: '',
          cols: Number(ca.cols) || undefined,
          rows: Number(ca.rows) || undefined,
          frameCount: Number(ca.frameCount) || undefined,
          fps: Number(ca.fps) || undefined,
        });
      }
    }
    const hybridCatalog = Array.from(mergedById.values());

    const availableBackgrounds = hybridCatalog
      .filter((a) => a.category === 'background')
      .map((a) => `${a.id} ("${a.name}" · keywords: ${a.keywords.slice(0, 6).join(', ')})`)
      .join(' | ');
    const availableSpriteActors = hybridCatalog
      .filter((a) => a.category === 'sprite_actor')
      .map((a) => `${a.id} ("${a.name}" · keywords: ${a.keywords.slice(0, 6).join(', ')})`)
      .join(' | ');

    const styleGuidance =
      requestedStyle === 'stick_meme'
        ? `Visual style is locked to "stick_meme" (Black-and-white expressive stick-figure comedy meme on white paper). Still use uploaded sprite_actor assets cleanly whenever the script mentions them.`
        : requestedStyle === 'cartoon_2d'
          ? `Visual style is locked to "cartoon_2d" (Colorful 2D cartoon animation powered by the user's Hybrid Sprite Sheets & SVG Backgrounds!).`
          : `Visual style is "auto": Choose "cartoon_2d" whenever the story uses ANY sprite-sheet character from the catalog, outdoor/colorful settings, or narrative storytelling; choose "stick_meme" only for classic black-and-white human stick-figure indoor/office/room memes.`;

    const dialogueInstruction =
      dialogueMode === 'silent'
        ? 'Silent slapstick mode: set every character speech to "" and convey humor visually + SFX.'
        : 'Spoken Bengali AI Dubbing mode: keep lines punchy, natural, and conversational in Bangladeshi Bengali (or preserve Banglish if written in Banglish). Remove stage-direction parentheses or emojis from spoken "speech" text so TTS reads cleanly. Set "voiceEffect" based on the emotion of each line: "panicked" for shouting, screaming, panic, crying, or lines with "!" / "?!"; "dramatic_boss" for deep heroic/boss/villain/cinematic lines; "cartoon_high" for silly squeaky punchlines; or "normal" for calm speech.';

    const avoidList =
      Array.isArray(recentTitles) && recentTitles.length > 0
        ? `Avoid repeating these recent stories: ${recentTitles.slice(0, 8).join(' | ')}.`
        : '';

    const coreTaskPrompt = isCustomScriptMode
      ? `THE USER WROTE THIS SCRIPT/STORY FREELY:
"""
${rawUserScript}
"""

YOUR JOB AS AN INDEPENDENT CREATIVE AI ANIMATION DIRECTOR:
1. You have COMPLETE creative freedom over story pacing, camera angles, comedy/drama timing, visual effects, and choreography — NEVER force preset templates (like bathroom/office memes) onto the user's story! Build everything 100% from the user's script and setting!
2. Read EVERY setting/environment detail in the script ("পরিষ্কার আকাশ", "গ্রাম", "বাজার", "মাঠ", "নদী", "চা-দোকান", "জঙ্গল", "রেল স্টেশন", etc.):
   - Pick the best matching "backgroundAssetId" from the Background catalog below.
   - If the script's setting is NOT in the catalog, invent a clear snake_case "backgroundAssetId" AND write a vivid "backgroundDescription" so our AI auto-draws a bespoke colorful SVG background for that scene!
3. Cast ONLY the characters that appear in the user's script! If the script only has sprite-sheet animals/vehicles (e.g. গরু ও কুকুর, বাঘ ও ছাগল, রিকশা ও সিএনজি), DO NOT invent unrelated human characters! Keep the user's exact character names ("name") and spoken words ("speech") faithful.
4. SPRITE-SHEET ACTORS vs HUMANS:
   - Whenever গরু (cow), বাঘ (tiger), or রাফু/রফু/ছেলে (Rafu/boy) appear, ALWAYS set kind="sprite_actor", renderStyle="cartoon_2d", and pick the matching 8-frame spriteAssetId per scene action:
     * গরু: "cow_grass_eating" (grazing/idle/walking calmly), "cow_mooing" (mooing/speaking/হাম্বা), "cow_attacking" (charging/chasing/angry/গুতো)
     * বাঘ: "tiger_walk_roar" (walking/roaring/talking/idle), "tiger_run_attack" (running/chasing/pouncing/attacking)
     * রাফু / রফু / ছেলে: "rafu_walk_talk" (walking/talking/idle), "boy_scared" (scared/shocked/crying/panicked), "rafu_running_away" (running away/fleeing/escaping)
   - Any other character matching our Sprite Actor catalog (কুকুর, ছাগল, বিড়াল, কাক, রিকশা, সিএনজি, or user-uploaded custom sheets): set kind="sprite_actor", renderStyle="cartoon_2d", and set the matching "spriteAssetId" per scene!
   - Any other human character (ফোক, চাচা, বস, দোকানদার) with NO sprite sheet: set kind="human_rig", pick a fitting "outfitStyle", and animate with articulated limb keyframes.
5. Break the script naturally into 2 to 8 expressive scenes (each 2.5–8.5s). Use descriptive freeform "action" values matching the story (e.g., "grazing", "mooing", "walk_in", "run", "flee", "scared", "chasing", "roar", "charge_butt", "shocked_jump", "idle", etc.).
6. SILENT VS SPOKEN CHARACTERS: Only give spoken "speech" lines to characters who actually speak or make sounds in the script. If an animal acts silently in a scene, set speech="" and tell the action via captionTop, keyframes, effects, and sfxCues!`
      : `CREATE AN ORIGINAL, 100% COPYRIGHT-FREE BENGALI SHORT VIDEO FREELY:
${
  rawHint
    ? `User idea / prompt: "${rawHint}". Build a vivid, entertaining animated video faithfully around this idea using the available sprite sheets & backgrounds.`
    : `You have COMPLETE creative freedom! Invent a fresh, relatable, hilarious or heartfelt Bangladeshi short animated story using our available sprite-sheet characters, human puppets, and backgrounds.`
}
${avoidList}
1. Choose 2 to 7 scenes freely based on story flow and comedic timing.
2. Cast matching characters from the Sprite Actor catalog below (kind="sprite_actor") and/or humans (kind="human_rig"), and pair every scene with the best matching Background ("backgroundAssetId") or a fresh "backgroundDescription".`;

    const hybridAssetSpec = `
AVAILABLE ASSET CATALOG (USER-UPLOADED + BUILT-IN):
- Backgrounds ("backgroundAssetId"): ${availableBackgrounds || 'none yet (provide backgroundDescription)'}
  (Optional fallback themes if stick_meme: ${VALID_VIDEO_THEMES.join(', ')})
- Sprite-Sheet Characters ("spriteAssetId" when kind="sprite_actor"): ${availableSpriteActors || 'none'}

ANIMATION & KEYFRAME DIRECTION RULES:
- Canvas coordinates: x = 0.0 (left edge) to 1.0 (right edge), center = 0.5. Keep static speaking characters between x = 0.16 and x = 0.84. When entering or exiting offscreen, animate x from/to -0.25 or 1.25!
- Vertical y: 0.0 = standing firmly on ground (never below -0.02 for ground poses). Use y = +0.12 to +0.38 for jumping/airborne!
- facing: 1 = facing right, -1 = facing left. Face the direction of movement or toward the scene partner.
- For kind="sprite_actor" (all sprite-sheet characters):
  * Always set kind="sprite_actor" and a valid "spriteAssetId" from the catalog above.
  * Provide clean keyframes with t, x, y (>=0), facing, rotationDeg (0 upright), scale, expression.
  * IMPORTANT: Leave "spriteFrame" UNSET during walking/running/moving keyframes so the engine smoothly animates across the sprite sheet frames! Only set spriteFrame: 3 at a brief climax impact/attack keyframe if desired.
- For kind="human_rig" (humans):
  * outfitStyle: "casual" | "lungi_panjabi" | "farmer" | "office_suit" | "student" | "shopkeeper" | "police".
  * Set keyframes with t, x, y, facing, rotationDeg, curlBall, torsoLeanDeg, headTiltDeg, leftArmDeg, rightArmDeg, leftLegDeg, rightLegDeg, vibrate, heldProp ("none", "smartphone", "tea_cup", "money", "stick", "umbrella", "football", "bucket", "book").
- Scene "effects": ALWAYS set "targetCharIndex" (0-based index in scene.characters) for "impact_star", "tickle_sparks", "sweat_burst", and "laugh_burst" so effects anchor onto the character.
- Scene "sfxCues": fire timed SFX at exact comedic/dramatic moments t (0..1) inside the scene.`;

    const ai = getGeminiClient();
    const prompt = `${coreTaskPrompt}

${hybridAssetSpec}

${styleGuidance}
${dialogueInstruction}

COPYRIGHT RULE:
Everything must be 100% original and copyright-free. Never quote copyrighted movie scripts or songs verbatim; write original natural Bengali dialogue instead.

Output JSON with:
- title: short catchy Bengali title
- hookBanner: short viral 3-6 word Bengali hook for the top banner
- category: short Bengali topic label
- renderStyle: "cartoon_2d" or "stick_meme"
- musicStyle: "comedy" | "quirky" | "dramatic" | "cinematic_parody" | "none"
- fbCaption: engaging Facebook Reels caption with a question and 2-3 hashtags
- scenes: array of 2 to 8 scenes with backgroundAssetId (and optional backgroundDescription), character kind/spriteAssetId/outfitStyle, keyframes, effects, and sfxCues.`;

    const response = await generateJsonWithRetryAndFallback({
      ai,
      contents: prompt,
      systemInstruction:
        'You are an independent, creative 2D animation director. Freely direct any story written by the user using their uploaded & built-in sprite-sheet characters (kind="sprite_actor" + spriteAssetId), human puppets (kind="human_rig"), and matching backgrounds (backgroundAssetId or backgroundDescription). Never lock stories into preset memes. Return strictly valid JSON matching the schema.',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hookBanner: { type: Type.STRING },
          category: { type: Type.STRING },
          renderStyle: { type: Type.STRING, enum: ['stick_meme', 'cartoon_2d'] },
          musicStyle: {
            type: Type.STRING,
            enum: ['comedy', 'quirky', 'dramatic', 'cinematic_parody', 'none'],
          },
          fbCaption: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sceneIndex: { type: Type.INTEGER },
                durationSec: { type: Type.NUMBER },
                theme: { type: Type.STRING },
                backgroundAssetId: { type: Type.STRING },
                backgroundDescription: { type: Type.STRING },
                camera: {
                  type: Type.STRING,
                  enum: ['wide', 'zoom_left', 'zoom_right', 'zoom_center', 'shake'],
                },
                sfx: {
                  type: Type.STRING,
                  enum: [
                    'none',
                    'knock_door',
                    'dramatic_boom',
                    'scream_sting',
                    'door_creak',
                    'splat_funny',
                    'laugh',
                    'gasp',
                    'thunder',
                    'pour',
                    'punchline',
                    'pop',
                    'sad_trombone',
                  ],
                },
                captionTop: { type: Type.STRING },
                splitScreen: { type: Type.BOOLEAN },
                effects: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      t: { type: Type.NUMBER },
                      duration: { type: Type.NUMBER },
                      type: {
                        type: Type.STRING,
                        enum: [
                          'impact_star',
                          'speed_lines',
                          'tickle_sparks',
                          'dust_puff',
                          'sweat_burst',
                          'laugh_burst',
                          'screen_shake',
                        ],
                      },
                      x: { type: Type.NUMBER },
                      y: { type: Type.NUMBER },
                      text: { type: Type.STRING },
                      targetCharIndex: { type: Type.INTEGER },
                    },
                    required: ['t', 'type', 'x', 'y'],
                  },
                },
                sfxCues: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      t: { type: Type.NUMBER },
                      sfx: {
                        type: Type.STRING,
                        enum: [
                          'none',
                          'knock_door',
                          'dramatic_boom',
                          'scream_sting',
                          'door_creak',
                          'splat_funny',
                          'laugh',
                          'gasp',
                          'thunder',
                          'pour',
                          'punchline',
                          'pop',
                          'sad_trombone',
                        ],
                      },
                    },
                    required: ['t', 'sfx'],
                  },
                },
                characters: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      name: { type: Type.STRING },
                      kind: {
                        type: Type.STRING,
                        enum: ['human_rig', 'sprite_actor'],
                      },
                      spriteAssetId: { type: Type.STRING },
                      actorDescription: { type: Type.STRING },
                      outfitStyle: {
                        type: Type.STRING,
                        enum: [
                          'casual',
                          'lungi_panjabi',
                          'farmer',
                          'office_suit',
                          'student',
                          'shopkeeper',
                          'police',
                        ],
                      },
                      side: { type: Type.STRING, enum: ['left', 'right', 'center'] },
                      expression: {
                        type: Type.STRING,
                        enum: [
                          'happy',
                          'laughing',
                          'shocked',
                          'angry',
                          'deadpan',
                          'confused',
                          'crying',
                          'smug',
                          'wink',
                          'exhausted',
                        ],
                      },
                      action: { type: Type.STRING },
                      prop: { type: Type.STRING },
                      voiceEffect: {
                        type: Type.STRING,
                        enum: ['normal', 'panicked', 'dramatic_boss', 'cartoon_high'],
                      },
                      speech: { type: Type.STRING },
                      keyframes: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            t: { type: Type.NUMBER },
                            x: { type: Type.NUMBER },
                            y: { type: Type.NUMBER },
                            facing: { type: Type.INTEGER },
                            rotationDeg: { type: Type.NUMBER },
                            curlBall: { type: Type.NUMBER },
                            torsoLeanDeg: { type: Type.NUMBER },
                            headTiltDeg: { type: Type.NUMBER },
                            leftArmDeg: {
                              type: Type.OBJECT,
                              properties: {
                                shoulder: { type: Type.NUMBER },
                                elbow: { type: Type.NUMBER },
                              },
                              required: ['shoulder', 'elbow'],
                            },
                            rightArmDeg: {
                              type: Type.OBJECT,
                              properties: {
                                shoulder: { type: Type.NUMBER },
                                elbow: { type: Type.NUMBER },
                              },
                              required: ['shoulder', 'elbow'],
                            },
                            leftLegDeg: {
                              type: Type.OBJECT,
                              properties: {
                                hip: { type: Type.NUMBER },
                                knee: { type: Type.NUMBER },
                              },
                              required: ['hip', 'knee'],
                            },
                            rightLegDeg: {
                              type: Type.OBJECT,
                              properties: {
                                hip: { type: Type.NUMBER },
                                knee: { type: Type.NUMBER },
                              },
                              required: ['hip', 'knee'],
                            },
                            vibrate: { type: Type.NUMBER },
                            scale: { type: Type.NUMBER },
                            heldProp: {
                              type: Type.STRING,
                              enum: [
                                'none',
                                'smartphone',
                                'tea_cup',
                                'money',
                                'stick',
                                'umbrella',
                                'football',
                                'bucket',
                                'book',
                              ],
                            },
                            expression: {
                              type: Type.STRING,
                              enum: [
                                'happy',
                                'laughing',
                                'shocked',
                                'angry',
                                'deadpan',
                                'confused',
                                'crying',
                                'smug',
                                'wink',
                                'exhausted',
                              ],
                            },
                            spriteFrame: { type: Type.INTEGER },
                          },
                          required: ['t', 'x', 'y', 'facing'],
                        },
                      },
                    },
                    required: ['id', 'name', 'kind', 'side', 'expression', 'action', 'keyframes'],
                  },
                },
              },
              required: ['sceneIndex', 'durationSec', 'theme', 'camera', 'sfx', 'characters'],
            },
          },
        },
        required: ['title', 'hookBanner', 'renderStyle', 'musicStyle', 'fbCaption', 'scenes'],
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: 'AI থেকে খালি উত্তর এসেছে। আবার চেষ্টা করুন।' });
    }

    const parsed = JSON.parse(rawText);
    const fullStoryContext = `${rawUserScript} ${rawHint} ${String(parsed.title || '')} ${JSON.stringify(parsed.scenes || [])}`
      .toLowerCase()
      .replace(/গুরু/g, 'গরু');

    const matchesCatalogAsset = hybridCatalog.some((asset) => {
      const idLow = asset.id.toLowerCase();
      if (idLow.length >= 2 && fullStoryContext.includes(idLow)) return true;
      for (const kw of asset.keywords) {
        const k = kw.toLowerCase().replace(/গুরু/g, 'গরু').trim();
        if (k.length >= 2 && fullStoryContext.includes(k)) return true;
      }
      for (const word of asset.name.toLowerCase().replace(/গুরু/g, 'গরু').split(/[\s,_\-()]+/)) {
        if (word.length >= 2 && fullStoryContext.includes(word)) return true;
      }
      return false;
    });

    const hasOutdoorOrStorySetting =
      /(আকাশ|গ্রাম|মাঠ|নদী|বাজার|চা|বাগান|বৃষ্টি|রাস্তা|রেল|স্কুল|বন|জঙ্গল|সাগর|পাহাড়|মেলা|স্টেশন|ছাদ|পার্ক|ঘাস|outdoor|sky|village|meadow|field|river|bazar|forest)/.test(
        fullStoryContext
      );

    const anyParsedUsesSpriteOrBg =
      Array.isArray(parsed.scenes) &&
      parsed.scenes.some((sc: Record<string, unknown>) => {
        if (typeof sc.backgroundAssetId === 'string' && sc.backgroundAssetId.trim()) return true;
        return (
          Array.isArray(sc.characters) &&
          sc.characters.some((c: Record<string, unknown>) => c?.kind === 'sprite_actor' || Boolean(c?.spriteAssetId))
        );
      });

    const chosenStyle =
      requestedStyle !== 'auto'
        ? requestedStyle
        : matchesCatalogAsset || hasOutdoorOrStorySetting || anyParsedUsesSpriteOrBg || parsed.renderStyle === 'cartoon_2d'
          ? 'cartoon_2d'
          : 'stick_meme';

    const chosenMusic = [
      'comedy',
      'quirky',
      'dramatic',
      'cinematic_parody',
      'none',
    ].includes(String(parsed.musicStyle))
      ? parsed.musicStyle
      : 'cinematic_parody';

    const knownAssetIds = new Set(hybridCatalog.map((a) => a.id.toLowerCase()));
    const knownLegacyThemes = new Set<string>([...VALID_VIDEO_THEMES]);
    const autoSvgCache = new Map<string, { assetId?: string; svg: string }>();
    const spriteCatalog = hybridCatalog.filter((a) => a.category === 'sprite_actor');
    const bgCatalog = hybridCatalog.filter((a) => a.category === 'background');

    const scoreAssetMatch = (asset: HybridAssetMeta, queryLower: string, requestedIdLower: string): number => {
      let score = 0;
      const idLow = asset.id.toLowerCase();
      const assetNameLow = asset.name.toLowerCase().replace(/গুরু/g, 'গরু');
      if (requestedIdLower && idLow === requestedIdLower) {
        score += asset.source === 'builtin' ? 5 : 8;
      }
      for (const kw of asset.keywords) {
        const k = kw.toLowerCase().replace(/গুরু/g, 'গরু').trim();
        if (k.length >= 2 && queryLower.includes(k)) {
          score += asset.source === 'builtin' ? 3 : 7;
        }
      }
      for (const word of assetNameLow.split(/[\s,_\-()]+/)) {
        if (word.length >= 2 && queryLower.includes(word)) {
          score += asset.source === 'builtin' ? 2 : 5;
        }
      }
      return score;
    };

    const selectActionAwareEightFrameId = (
      charName: string,
      charAction: string,
      charExpr: string,
      charSpeech: string,
      requestedId: string,
      sceneCaption: string
    ): HybridAssetMeta | undefined => {
      const nameLow = charName.toLowerCase().replace(/গুরু/g, 'গরু');
      const spLow = requestedId.toLowerCase();
      const ctxLow = `${charAction} ${charExpr} ${charSpeech} ${sceneCaption}`.toLowerCase();

      const findById = (id: string) =>
        spriteCatalog.find((a) => a.id.toLowerCase() === id.toLowerCase());

      if (
        spLow.startsWith('cow') ||
        /(গরু|গাভী|ষাঁড়|বাছুর|\bcow\b|\bbull\b|\bcattle\b)/.test(nameLow)
      ) {
        if (
          spLow === 'cow_attacking' ||
          charExpr.toLowerCase() === 'angry' ||
          /(attack|charge|butt|chase|angry|গুতো|গুঁতো|তাড়া|তেড়ে|আক্রমণ|ধাক্কা|রাগ)/.test(ctxLow)
        ) {
          return findById('cow_attacking');
        }
        if (
          spLow === 'cow_mooing' ||
          charSpeech.trim().length > 0 ||
          /(moo|হাম্বা|ডাক|talk|speak|কথা)/.test(ctxLow)
        ) {
          return findById('cow_mooing');
        }
        return findById('cow_grass_eating');
      }

      if (
        spLow.startsWith('tiger') ||
        /(বাঘ|রয়েল|সিংহ|\btiger\b|\blion\b)/.test(nameLow)
      ) {
        if (
          spLow === 'tiger_run_attack' ||
          /(run|attack|chase|pounce|jump|charge|দৌড়|তাড়া|ঝাঁপ|আক্রমণ|শিকার)/.test(ctxLow)
        ) {
          return findById('tiger_run_attack');
        }
        return findById('tiger_walk_roar');
      }

      if (
        spLow.startsWith('rafu') ||
        spLow === 'boy_scared' ||
        /(রাফু|রফু|rafu|rofu|ছেলে|বালক|\bboy\b)/.test(nameLow)
      ) {
        if (
          spLow === 'rafu_running_away' ||
          /(run|flee|escape|দৌড়|পালা|ভাগ)/.test(ctxLow)
        ) {
          return findById('rafu_running_away');
        }
        if (
          spLow === 'boy_scared' ||
          ['shocked', 'crying', 'exhausted', 'confused'].includes(charExpr.toLowerCase()) ||
          /(scared|shocked|afraid|fear|panick|scream|jump|cry|ভয়|আতঙ্ক|চমক|কান্না|ওরে|বাঁচাও)/.test(ctxLow)
        ) {
          return findById('boy_scared');
        }
        return findById('rafu_walk_talk');
      }

      return undefined;
    };

    const pickBestSpriteForContext = (
      charName: string,
      charContext: string,
      requestedSpriteId: string
    ): HybridAssetMeta | undefined => {
      const normalizedQuery = `${charName} ${charContext}`.toLowerCase().replace(/গুরু/g, 'গরু');
      const reqLow = requestedSpriteId.toLowerCase();
      const requestedAsset = spriteCatalog.find((a) => a.id.toLowerCase() === reqLow);

      let best: HybridAssetMeta | undefined;
      let bestScore = 0;

      for (const asset of spriteCatalog) {
        const multiFrameBonus = (asset.frameCount || 1) >= 8 ? 3 : 0;
        const score = scoreAssetMatch(asset, normalizedQuery, reqLow) + multiFrameBonus;
        if (score > bestScore && score > multiFrameBonus) {
          bestScore = score;
          best = asset;
        }
      }

      if (bestScore > 0) return best;
      return requestedAsset;
    };

    const nameMatchesSpriteCatalog = (charName: string): HybridAssetMeta | undefined => {
      const cleanName = charName.toLowerCase().replace(/গুরু/g, 'গরু').trim();
      if (!cleanName) return undefined;
      const eightFrameDefault = selectActionAwareEightFrameId(charName, '', '', '', '', '');
      if (eightFrameDefault) return eightFrameDefault;
      let best: HybridAssetMeta | undefined;
      let bestScore = 0;
      for (const asset of spriteCatalog) {
        const score = scoreAssetMatch(asset, cleanName, cleanName);
        if (score > bestScore) {
          bestScore = score;
          best = asset;
        }
      }
      return bestScore >= 3 ? best : undefined;
    };

    const pickBestBackgroundForContext = (
      sceneText: string,
      requestedBgId: string,
      requestedDesc: string
    ): HybridAssetMeta | undefined => {
      const reqLow = requestedBgId.toLowerCase();
      const exact = bgCatalog.find((a) => a.id.toLowerCase() === reqLow);
      const query = `${sceneText} ${requestedDesc} ${requestedBgId.replace(/_/g, ' ')}`
        .toLowerCase()
        .replace(/গুরু/g, 'গরু');

      let best: HybridAssetMeta | undefined;
      let bestScore = 0;
      for (const asset of bgCatalog) {
        const score = scoreAssetMatch(asset, query, reqLow);
        if (score > bestScore) {
          bestScore = score;
          best = asset;
        }
      }
      if (exact && !requestedDesc && bestScore <= 5) return exact;
      if (bestScore >= 3) return best;
      return exact;
    };

    const rawScenes = (Array.isArray(parsed.scenes) ? parsed.scenes : []).slice(0, 8);
    const scenes = [];

    for (let idx = 0; idx < rawScenes.length; idx++) {
      const sc = rawScenes[idx] as Record<string, unknown>;
      const bgId = typeof sc.backgroundAssetId === 'string' ? sc.backgroundAssetId.trim() : '';
      const bgDesc =
        typeof sc.backgroundDescription === 'string' ? sc.backgroundDescription.trim() : '';
      let themeVal = typeof sc.theme === 'string' ? sc.theme.trim() : 'clear_day_sky';
      let resolvedBgId = bgId || themeVal;
      let backgroundInlineSvg: string | undefined;

      const sceneTextLow = `${String(sc.captionTop || '')} ${bgDesc}`
        .toLowerCase()
        .replace(/গুরু/g, 'গরু');

      const matchedBgAsset = pickBestBackgroundForContext(
        `${sceneTextLow} ${rawUserScript}`,
        resolvedBgId,
        bgDesc
      );

      // Upgrade stick-room defaults to matching catalog background or outdoor sky when story is cartoon_2d
      if (
        chosenStyle === 'cartoon_2d' &&
        (!resolvedBgId || ['room_door', 'bathroom_rush', 'bedroom_night'].includes(resolvedBgId))
      ) {
        if (matchedBgAsset) {
          resolvedBgId = matchedBgAsset.id;
          themeVal = matchedBgAsset.id;
        } else if (hasOutdoorOrStorySetting || matchesCatalogAsset) {
          resolvedBgId = /(ঘাস|মাঠ|meadow|field|cow|গরু|ছাগল)/.test(`${sceneTextLow} ${rawUserScript}`.toLowerCase())
            ? 'field_meadow'
            : 'clear_day_sky';
          themeVal = resolvedBgId;
        }
      } else if (matchedBgAsset && knownAssetIds.has(matchedBgAsset.id.toLowerCase())) {
        // Use matched uploaded/builtin catalog background when requested id isn't explicitly a brand-new environment
        if (!bgDesc || knownAssetIds.has(resolvedBgId.toLowerCase())) {
          resolvedBgId = matchedBgAsset.id;
          themeVal = matchedBgAsset.id;
        }
      }

      // Auto-generate missing custom background SVG if AI requested a brand-new environment
      if (
        chosenStyle === 'cartoon_2d' &&
        resolvedBgId &&
        !knownAssetIds.has(resolvedBgId.toLowerCase()) &&
        !knownLegacyThemes.has(resolvedBgId) &&
        (bgDesc || bgId)
      ) {
        const cacheKey = `bg:${resolvedBgId.toLowerCase()}`;
        if (autoSvgCache.has(cacheKey)) {
          const cached = autoSvgCache.get(cacheKey)!;
          if (cached.assetId) resolvedBgId = cached.assetId;
          backgroundInlineSvg = cached.svg;
        } else {
          try {
            const gen = await generateAndSaveHybridSvgAsset({
              prompt: bgDesc || resolvedBgId.replace(/_/g, ' '),
              category: 'background',
              requestedId: resolvedBgId,
              name: bgDesc ? bgDesc.slice(0, 40) : resolvedBgId,
              saveToLibrary: true,
            });
            if (gen.asset) {
              resolvedBgId = gen.asset.id;
              knownAssetIds.add(gen.asset.id.toLowerCase());
            }
            backgroundInlineSvg = gen.svg;
            autoSvgCache.set(cacheKey, { assetId: resolvedBgId, svg: gen.svg });
          } catch {
            // Graceful fallback to procedural background if rate-limited
          }
        }
      }

      const rawChars = Array.isArray(sc.characters)
        ? (sc.characters as Array<Record<string, unknown>>)
        : [];
      const resolvedChars = [];
      for (const ch of rawChars) {
        const nextCh = { ...ch };
        nextCh.id = String(nextCh.id || 'actor');
        nextCh.action = String(nextCh.action || 'idle');
        nextCh.prop = String(nextCh.prop || 'none');

        const charName = String(nextCh.name || '');
        const spId =
          typeof nextCh.spriteAssetId === 'string' ? nextCh.spriteAssetId.trim() : '';
        const spDesc =
          typeof nextCh.actorDescription === 'string' ? nextCh.actorDescription.trim() : '';
        const charSpeech = String(nextCh.speech || '');
        const charExpr = String(nextCh.expression || 'happy');

        // Priority 1: Action-aware 8-frame sheets for গরু, বাঘ, রাফু/রফু/ছেলে
        const eightFrameMatch = selectActionAwareEightFrameId(
          charName,
          String(nextCh.action),
          charExpr,
          charSpeech,
          spId,
          String(sc.captionTop || '')
        );

        // Strictly separate human_rig from sprite_actor unless character matches 8-frame sheets or catalog sprite
        const nameSpriteMatch = eightFrameMatch || nameMatchesSpriteCatalog(charName);
        const shouldResolveAsSprite =
          Boolean(eightFrameMatch) ||
          nextCh.kind === 'sprite_actor' ||
          Boolean(spId) ||
          Boolean(nameSpriteMatch);

        if (shouldResolveAsSprite) {
          const charCtx = `${spDesc} ${String(nextCh.action || '')} ${charSpeech}`;
          const matchedSprite =
            eightFrameMatch ||
            pickBestSpriteForContext(charName, charCtx, spId) ||
            nameSpriteMatch;

          nextCh.kind = 'sprite_actor';
          if (matchedSprite) {
            nextCh.spriteAssetId = matchedSprite.id;
            // Clear static spriteFrame pins on 8-frame sheets so all 8 frames animate smoothly
            if ((matchedSprite.frameCount || 1) > 4 && Array.isArray(nextCh.keyframes)) {
              nextCh.keyframes = nextCh.keyframes.map((kf) => {
                if (kf && typeof kf === 'object') {
                  const copy = { ...(kf as Record<string, unknown>) };
                  delete copy.spriteFrame;
                  return copy;
                }
                return kf;
              });
            }
          } else if (spId && !knownAssetIds.has(spId.toLowerCase())) {
            const cacheKey = `actor:${spId.toLowerCase()}`;
            if (autoSvgCache.has(cacheKey)) {
              const cached = autoSvgCache.get(cacheKey)!;
              if (cached.assetId) nextCh.spriteAssetId = cached.assetId;
              nextCh.inlineSvg = cached.svg;
            } else {
              try {
                const gen = await generateAndSaveHybridSvgAsset({
                  prompt: spDesc || String(nextCh.name || spId.replace(/_/g, ' ')),
                  category: 'sprite_actor',
                  requestedId: spId,
                  name: String(nextCh.name || spId),
                  saveToLibrary: true,
                });
                if (gen.asset) {
                  nextCh.spriteAssetId = gen.asset.id;
                  knownAssetIds.add(gen.asset.id.toLowerCase());
                }
                nextCh.inlineSvg = gen.svg;
                autoSvgCache.set(cacheKey, {
                  assetId: typeof nextCh.spriteAssetId === 'string' ? nextCh.spriteAssetId : spId,
                  svg: gen.svg,
                });
              } catch {
                // Keep inline fallback silently
              }
            }
          }
        } else {
          nextCh.kind = 'human_rig';
          delete nextCh.spriteAssetId;
        }
        delete nextCh.actorDescription;
        resolvedChars.push(nextCh);
      }

      const cleanedScene: Record<string, unknown> = {
        ...sc,
        sceneIndex: idx,
        durationSec: Math.max(2.2, Math.min(9.5, Number(sc.durationSec) || 4.0)),
        theme: themeVal || resolvedBgId || 'clear_day_sky',
        backgroundAssetId: resolvedBgId || undefined,
        ...(backgroundInlineSvg ? { backgroundInlineSvg } : {}),
        characters: resolvedChars,
      };
      delete cleanedScene.backgroundDescription;
      scenes.push(cleanedScene);
    }

    const totalDurationSec = Number(
      scenes
        .reduce((acc: number, s) => acc + Number(s.durationSec || 4.0), 0)
        .toFixed(1)
    );

    return res.json({
      id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: String(parsed.title || 'বন্ধুর মজার কাণ্ড'),
      hookBanner: String(parsed.hookBanner || parsed.title || 'বন্ধুর যখন এমন হয় 🤣'),
      category: String(parsed.category || (isCustomScriptMode ? 'নিজস্ব স্ক্রিপ্ট' : 'বাংলা কমেডি')),
      renderStyle: chosenStyle,
      aspectRatio: safeAspect,
      musicStyle: chosenMusic,
      storyArc: scenes.length <= 3 ? 'quick_short' : 'viral_story',
      subtitleStyle: chosenStyle === 'stick_meme' ? 'meme_clean' : 'reels_bold',
      totalDurationSec,
      scenes,
      fbCaption: String(parsed.fbCaption || 'কার সাথে এমন হয়েছে? 😂 #RafuFolk #BanglaMeme'),
      createdAt: new Date().toISOString(),
      seed: Math.floor(Math.random() * 900000) + 100000,
    });
  } catch (err) {
    const friendly = formatFriendlyGeminiError(err);
    console.error('Generate video error:', err);
    return res.status(friendly.httpStatus).json({ error: friendly.message });
  }
});

/* ============================================================================
 * COPYRIGHT-FREE AI VOICE DUBBING & DRAMATIC FFmpeg VOICE FX
 * ========================================================================== */

const CHARACTER_VOICE_MAP: Record<
  string,
  { edgeVoice: string; geminiVoice: string; geminiStyle: string }
> = {
  rafu: {
    edgeVoice: 'bn-BD-PradeepNeural',
    geminiVoice: 'Puck',
    geminiStyle: 'Animated, energetic young Bangladeshi male voice',
  },
  folk: {
    edgeVoice: 'bn-BD-PradeepNeural',
    geminiVoice: 'Charon',
    geminiStyle: 'Deadpan or dramatic witty Bangladeshi male voice',
  },
  boss: {
    edgeVoice: 'bn-BD-PradeepNeural',
    geminiVoice: 'Fenrir',
    geminiStyle: 'Deep authoritative bossy Bangladeshi voice',
  },
  chacha: {
    edgeVoice: 'bn-BD-PradeepNeural',
    geminiVoice: 'Charon',
    geminiStyle: 'Warm elderly Bangladeshi tea-stall uncle voice',
  },
  friend: {
    edgeVoice: 'bn-BD-NabanitaNeural',
    geminiVoice: 'Kore',
    geminiStyle: 'Lively expressive Bangladeshi friend voice',
  },
};

function resolveVoicePersonaKey(characterId: string): string {
  const key = String(characterId || '').toLowerCase();
  if (key in CHARACTER_VOICE_MAP) return key;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const keys = ['rafu', 'folk', 'chacha', 'friend', 'boss'];
  return keys[hash % keys.length];
}

function stripEmojisForTts(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWavDurationSec(buf: Buffer): number {
  if (buf.length < 44) return 2.5;
  const byteRate = buf.readUInt32LE(28);
  const dataSize = buf.readUInt32LE(40);
  if (!byteRate || !dataSize) return 2.5;
  return Math.max(0.6, dataSize / byteRate);
}

async function getAudioDurationWithFfmpeg(buf: Buffer, ext: 'mp3' | 'wav'): Promise<number> {
  const tmpPath = path.join(os.tmpdir(), `dur_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
  await fs.writeFile(tmpPath, buf);
  try {
    const stderr = await new Promise<string>((resolve) => {
      const proc = spawn(FFMPEG_PATH, ['-i', tmpPath]);
      let log = '';
      proc.stderr.on('data', (d) => {
        log += String(d);
      });
      proc.on('close', () => resolve(log));
      proc.on('error', () => resolve(''));
    });
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (m) {
      return Math.max(0.6, Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    }
    return 2.6;
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

async function applyVoiceFxWithFfmpeg(
  rawBuffer: Buffer,
  inputExt: 'mp3' | 'wav',
  characterId: string,
  voiceEffect: string
): Promise<Buffer> {
  let pitch = 1.0;
  let tempo = 1.0;
  let extraFilters = '';

  if (voiceEffect === 'panicked') {
    pitch = 1.15;
    tempo = 1.18;
    extraFilters =
      ',treble=g=4:f=3200,acompressor=threshold=-20dB:ratio=4.5:attack=4:release=55,volume=2.3,alimiter=limit=0.95';
  } else if (voiceEffect === 'dramatic_boss') {
    pitch = 0.77;
    tempo = 0.90;
    extraFilters =
      ',bass=g=8:f=105,aecho=0.8:0.75:48:0.38,acompressor=threshold=-18dB:ratio=5:attack=4:release=75,volume=2.45,alimiter=limit=0.95';
  } else if (voiceEffect === 'cartoon_high') {
    pitch = 1.24;
    tempo = 1.12;
    extraFilters =
      ',treble=g=3:f=2800,acompressor=threshold=-19dB:ratio=4:attack=5:release=60,volume=2.15,alimiter=limit=0.95';
  } else {
    const defaults: Record<string, { p: number; t: number }> = {
      rafu: { p: 1.08, t: 1.07 },
      folk: { p: 0.96, t: 1.02 },
      boss: { p: 0.84, t: 0.96 },
      chacha: { p: 0.88, t: 0.95 },
      friend: { p: 1.09, t: 1.07 },
    };
    const d = defaults[resolveVoicePersonaKey(characterId)] || { p: 1.0, t: 1.0 };
    pitch = d.p;
    tempo = d.t;
    extraFilters =
      ',acompressor=threshold=-20dB:ratio=3.5:attack=5:release=70,volume=1.95,alimiter=limit=0.95';
  }

  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inPath = path.join(os.tmpdir(), `vfx_in_${id}.${inputExt}`);
  const outPath = path.join(os.tmpdir(), `vfx_out_${id}.mp3`);
  await fs.writeFile(inPath, rawBuffer);

  try {
    const clampedPitch = Math.max(0.72, Math.min(1.32, pitch));
    const compensatingTempo = Math.max(0.65, Math.min(1.6, tempo / clampedPitch));
    const filterChain = `asetrate=24000*${clampedPitch.toFixed(3)},aresample=24000,atempo=${compensatingTempo.toFixed(3)}${extraFilters}`;

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG_PATH, [
        '-y',
        '-i',
        inPath,
        '-ar',
        '24000',
        '-af',
        filterChain,
        '-c:a',
        'libmp3lame',
        '-b:a',
        '96k',
        outPath,
      ]);
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg voice FX exited ${code}`));
      });
    });

    return await fs.readFile(outPath);
  } finally {
    await fs.unlink(inPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
}

async function synthesizeWithFreeBengaliTts(
  text: string,
  characterId: string,
  voiceEffect: string
): Promise<{ buffer: Buffer; mime: string; durationSec: number }> {
  const chunksText = text.length <= 180 ? [text] : text.match(/.{1,170}(\s|$)/g) || [text];
  const rawParts: Buffer[] = [];
  for (const part of chunksText) {
    const q = part.trim();
    if (!q) continue;
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(q)}&tl=bn&client=tw-ob`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`Free Bengali TTS HTTP ${res.status}`);
    rawParts.push(Buffer.from(await res.arrayBuffer()));
  }
  const rawBuffer = Buffer.concat(rawParts);
  if (rawBuffer.length < 128) throw new Error('Empty Bengali TTS output');

  let finalBuffer: Buffer = rawBuffer;
  try {
    finalBuffer = Buffer.from(
      await applyVoiceFxWithFfmpeg(rawBuffer, 'mp3', characterId, voiceEffect)
    );
  } catch {
    finalBuffer = rawBuffer;
  }
  const durationSec = await getAudioDurationWithFfmpeg(finalBuffer, 'mp3');
  return { buffer: finalBuffer, mime: 'audio/mpeg', durationSec };
}

async function synthesizeWithEdgeTts(
  text: string,
  characterId: string,
  voiceEffect: string
): Promise<{ buffer: Buffer; mime: string; durationSec: number }> {
  const persona = CHARACTER_VOICE_MAP[resolveVoicePersonaKey(characterId)] || CHARACTER_VOICE_MAP.rafu;
  const tts = new MsEdgeTTS();
  await tts.setMetadata(persona.edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Edge TTS timeout')), 7000);
    audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    audioStream.on('end', () => {
      clearTimeout(timer);
      resolve();
    });
    audioStream.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  tts.close();

  const rawBuffer = Buffer.concat(chunks);
  if (rawBuffer.length < 128) throw new Error('Empty Edge TTS audio');

  let finalBuffer: Buffer = rawBuffer;
  try {
    finalBuffer = Buffer.from(
      await applyVoiceFxWithFfmpeg(rawBuffer, 'mp3', characterId, voiceEffect)
    );
  } catch {
    finalBuffer = rawBuffer;
  }
  const durationSec = await getAudioDurationWithFfmpeg(finalBuffer, 'mp3');
  return { buffer: finalBuffer, mime: 'audio/mpeg', durationSec };
}

async function synthesizeWithGeminiTts(
  text: string,
  characterId: string,
  voiceEffect: string
): Promise<{ buffer: Buffer; mime: string; durationSec: number }> {
  const persona = CHARACTER_VOICE_MAP[resolveVoicePersonaKey(characterId)] || CHARACTER_VOICE_MAP.rafu;
  const styleHint =
    voiceEffect === 'dramatic_boss'
      ? 'Loud, roaring, furious dramatic movie villain shouting in Bangladeshi Bengali with heavy intensity'
      : voiceEffect === 'panicked'
        ? 'Loud, frantic, desperate panicked shouting and crying in Bangladeshi Bengali, urgent high energy'
        : voiceEffect === 'cartoon_high'
          ? 'Loud, excited, animated funny cartoon shouting in Bangladeshi Bengali'
          : `${persona.geminiStyle}, expressive loud comedic Bangladeshi Bengali delivery`;

  const ai = getGeminiClient();
  const useExpressiveModel =
    voiceEffect === 'dramatic_boss' || voiceEffect === 'panicked' || voiceEffect === 'cartoon_high';

  const response = await ai.models.generateContent({
    model: useExpressiveModel ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text,
            speechMetadata: {
              style: styleHint,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: persona.geminiVoice,
          },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error('Empty Gemini TTS audio output');
  const rawBuffer = Buffer.from(base64Audio, 'base64');

  try {
    const fxBuffer = await applyVoiceFxWithFfmpeg(rawBuffer, 'wav', characterId, voiceEffect);
    const durationSec = await getAudioDurationWithFfmpeg(fxBuffer, 'mp3');
    return { buffer: fxBuffer, mime: 'audio/mpeg', durationSec };
  } catch {
    const durationSec = getWavDurationSec(rawBuffer);
    return { buffer: rawBuffer, mime: 'audio/wav', durationSec };
  }
}

app.post('/api/video/synthesize-voices', async (req, res) => {
  try {
    const { scenes = [], voiceEngine = 'auto' } = req.body ?? {};
    if (!Array.isArray(scenes) || scenes.length === 0 || voiceEngine === 'none') {
      return res.json({ voiceClips: [], scenes });
    }

    const voiceClips: Array<{
      sceneIndex: number;
      charIndex: number;
      characterId: string;
      characterName: string;
      text: string;
      audioDataUrl: string;
      durationSec: number;
      offsetInSceneSec: number;
      provider: 'edge_tts' | 'gemini_tts';
    }> = [];

    const updatedScenes = scenes.map((sc: Record<string, unknown>) => ({ ...sc }));

    for (let sIdx = 0; sIdx < updatedScenes.length; sIdx++) {
      const sc = updatedScenes[sIdx] as {
        sceneIndex: number;
        durationSec: number;
        characters?: Array<{
          id: string;
          name: string;
          speech?: string;
          voiceEffect?: string;
          customAudioDataUrl?: string;
        }>;
      };

      const chars = Array.isArray(sc.characters) ? sc.characters : [];
      let sceneCursor = 0.25;

      for (let cIdx = 0; cIdx < chars.length; cIdx++) {
        const ch = chars[cIdx];
        if (ch.customAudioDataUrl) {
          sceneCursor += 1.5;
          continue;
        }
        const rawSpeech = String(ch.speech || '').trim();
        const cleanSpeech = stripEmojisForTts(rawSpeech);
        if (!cleanSpeech) continue;

        let effect = String(ch.voiceEffect || 'normal');
        if (effect === 'normal' && (rawSpeech.includes('!') || rawSpeech.includes('?!'))) {
          effect = 'panicked';
        }

        let synth: { buffer: Buffer; mime: string; durationSec: number } | null = null;
        let usedProvider: 'edge_tts' | 'gemini_tts' = 'edge_tts';

        const tryGeminiFirst =
          Boolean(process.env.GEMINI_API_KEY) &&
          (voiceEngine === 'gemini_tts' ||
            (voiceEngine === 'auto' && (effect === 'dramatic_boss' || effect === 'panicked')));

        if (tryGeminiFirst) {
          try {
            synth = await synthesizeWithGeminiTts(cleanSpeech, ch.id, effect);
            usedProvider = 'gemini_tts';
          } catch {
            try {
              synth = await synthesizeWithEdgeTts(cleanSpeech, ch.id, effect);
              usedProvider = 'edge_tts';
            } catch {
              synth = await synthesizeWithFreeBengaliTts(cleanSpeech, ch.id, effect);
              usedProvider = 'edge_tts';
            }
          }
        } else {
          try {
            synth = await synthesizeWithEdgeTts(cleanSpeech, ch.id, effect);
            usedProvider = 'edge_tts';
          } catch {
            synth = await synthesizeWithFreeBengaliTts(cleanSpeech, ch.id, effect);
            usedProvider = 'edge_tts';
          }
        }

        if (synth) {
          const roundedDur = Number(synth.durationSec.toFixed(2));
          voiceClips.push({
            sceneIndex: sIdx,
            charIndex: cIdx,
            characterId: ch.id,
            characterName: ch.name,
            text: rawSpeech,
            audioDataUrl: `data:${synth.mime};base64,${synth.buffer.toString('base64')}`,
            durationSec: roundedDur,
            offsetInSceneSec: Number(sceneCursor.toFixed(2)),
            provider: usedProvider,
          });
          sceneCursor += roundedDur + 0.35;
        }
      }

      if (sceneCursor > sc.durationSec) {
        sc.durationSec = Number(Math.min(12.0, sceneCursor + 0.3).toFixed(1));
      }
    }

    return res.json({ voiceClips, scenes: updatedScenes });
  } catch (err) {
    console.error('Voice synthesis error:', err);
    return res.status(500).json({ error: 'ভয়েস ডাবিং তৈরি করা যায়নি।' });
  }
});

/* ============================================================================
 * FFMPEG MP4 TRANSCODING + PERSISTENT VIDEO DISK STORAGE
 * ========================================================================== */

function detectVideoFormat(file: Express.Multer.File): 'mp4' | 'webm' | null {
  const mime = (file.mimetype || '').toLowerCase();
  const name = (file.originalname || '').toLowerCase();
  if (mime.includes('mp4') || name.endsWith('.mp4')) return 'mp4';
  if (mime.includes('webm') || name.endsWith('.webm')) return 'webm';
  return null;
}

async function transcodeBufferToFacebookMp4(
  inputBuffer: Buffer,
  inputExt: 'mp4' | 'webm'
): Promise<Buffer> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inPath = path.join(os.tmpdir(), `in_${id}.${inputExt}`);
  const outPath = path.join(os.tmpdir(), `out_${id}.mp4`);
  await fs.writeFile(inPath, inputBuffer);

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG_PATH, [
        '-y',
        '-i',
        inPath,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outPath,
      ]);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += String(d);
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-300)}`));
      });
    });
    return await fs.readFile(outPath);
  } finally {
    await fs.unlink(inPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
}

app.post('/api/video/transcode-mp4', uploadVideo.single('video'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'ভিডিও ফাইল পাওয়া যায়নি।' });
    }
    const detected = detectVideoFormat(file) || 'webm';
    const mp4Buffer =
      detected === 'mp4' ? file.buffer : await transcodeBufferToFacebookMp4(file.buffer, detected);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="rafu-folk-${Date.now()}.mp4"`);
    return res.send(mp4Buffer);
  } catch (err) {
    console.error('MP4 transcode error:', err);
    return res.status(500).json({ error: 'MP4 কনভার্শন সম্পন্ন করা যায়নি।' });
  }
});

// Persistent Saved Rendered Videos API
app.get('/api/saved-videos', async (_req, res) => {
  try {
    const items = await readSavedVideosIndex();
    return res.json({ videos: items });
  } catch {
    return res.json({ videos: [] });
  }
});

app.post('/api/saved-videos', uploadVideo.single('video'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'সেইভ করার জন্য ভিডিও ফাইল প্রয়োজন।' });
    }

    await ensureDataDirs();
    const {
      id,
      videoId,
      title = '@@RAFU FOLK@@ ভিডিও',
      category = 'স্টিক ফিগার কমেডি',
      renderStyle = 'stick_meme',
      aspectRatio = '9:16',
      durationSec = '15',
      fbCaption = '',
    } = req.body ?? {};

    const cleanId =
      String(id || `saved_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).replace(
        /[^a-zA-Z0-9_-]/g,
        ''
      );
    const detected = detectVideoFormat(file) || 'mp4';
    let finalBuffer = file.buffer;
    let ext: 'mp4' | 'webm' = detected;
    let mimeType = detected === 'mp4' ? 'video/mp4' : 'video/webm';

    if (detected !== 'mp4') {
      try {
        finalBuffer = await transcodeBufferToFacebookMp4(file.buffer, detected);
        ext = 'mp4';
        mimeType = 'video/mp4';
      } catch {
        // Keep original WebM if ffmpeg fallback fails
      }
    }

    const fileName = `${cleanId}.${ext}`;
    const filePath = path.join(SAVED_VIDEOS_DIR, fileName);
    await fs.writeFile(filePath, finalBuffer);

    const meta: SavedVideoMeta = {
      id: cleanId,
      videoId: String(videoId || cleanId),
      title: String(title),
      category: String(category),
      renderStyle: renderStyle === 'cartoon_2d' ? 'cartoon_2d' : 'stick_meme',
      aspectRatio: aspectRatio === '1:1' ? '1:1' : '9:16',
      durationSec: Number(durationSec) || 15,
      sizeBytes: finalBuffer.length,
      mimeType,
      createdAt: new Date().toISOString(),
      fbCaption: String(fbCaption || ''),
      fileName,
      serverUrl: `/api/saved-videos/${cleanId}/file`,
    };

    const existing = await readSavedVideosIndex();
    const updated = [meta, ...existing.filter((v) => v.id !== cleanId)];
    await writeSavedVideosIndex(updated);

    return res.json({ saved: meta });
  } catch (err) {
    console.error('Save video error:', err);
    return res.status(500).json({ error: 'ভিডিও সার্ভারে সেইভ করা যায়নি।' });
  }
});

app.get('/api/saved-videos/:id/file', async (req, res) => {
  try {
    const cleanId = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const items = await readSavedVideosIndex();
    const item = items.find((v) => v.id === cleanId);
    if (!item) {
      return res.status(404).json({ error: 'ভিডিও পাওয়া যায়নি।' });
    }
    const filePath = path.join(SAVED_VIDEOS_DIR, item.fileName);
    res.setHeader('Content-Type', item.mimeType || 'video/mp4');
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${item.fileName}"`);
    }
    return res.sendFile(filePath);
  } catch {
    return res.status(404).json({ error: 'ভিডিও ফাইল পাওয়া যায়নি।' });
  }
});

app.delete('/api/saved-videos/:id', async (req, res) => {
  try {
    const cleanId = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const items = await readSavedVideosIndex();
    const target = items.find((v) => v.id === cleanId);
    if (target) {
      await fs.unlink(path.join(SAVED_VIDEOS_DIR, target.fileName)).catch(() => {});
    }
    const updated = items.filter((v) => v.id !== cleanId);
    await writeSavedVideosIndex(updated);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: 'ভিডিও মুছে ফেলা যায়নি।' });
  }
});

// Persistent Video Projects JSON API (Server backup alongside IndexedDB)
app.get('/api/video-projects', async (_req, res) => {
  try {
    await ensureDataDirs();
    const raw = await fs.readFile(SAVED_PROJECTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return res.json({ projects: Array.isArray(parsed) ? parsed : [] });
  } catch {
    return res.json({ projects: [] });
  }
});

app.post('/api/video-projects', async (req, res) => {
  try {
    await ensureDataDirs();
    const { projects } = req.body ?? {};
    if (!Array.isArray(projects)) {
      return res.status(400).json({ error: 'Invalid projects array' });
    }
    await fs.writeFile(SAVED_PROJECTS_FILE, JSON.stringify(projects.slice(0, 40), null, 2), 'utf8');
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: 'Failed to save video projects' });
  }
});

/* ============================================================================
 * FACEBOOK PAGE & WEBHOOK PUBLISHING
 * ========================================================================== */

app.post('/api/facebook/verify', async (req, res) => {
  try {
    const { pageId, pageAccessToken } = req.body ?? {};
    if (!pageId || !pageAccessToken) {
      return res.status(400).json({ error: 'Page ID এবং Page Access Token দুটিই দিতে হবে।' });
    }
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(String(pageId).trim())}?fields=id,name,fan_count,link&access_token=${encodeURIComponent(String(pageAccessToken).trim())}`;
    const fbRes = await fetch(url);
    const data = await fbRes.json();
    if (!fbRes.ok || data.error) {
      return res.status(400).json({
        error: data?.error?.message || 'Facebook Page যাচাই করা যায়নি।',
      });
    }
    return res.json({
      id: data.id,
      name: data.name,
      fanCount: data.fan_count ?? null,
      link: data.link ?? null,
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Facebook verification failed.',
    });
  }
});

app.post('/api/facebook/publish', async (req, res) => {
  try {
    const { pageId, pageAccessToken, caption, imageDataUrl, scheduledPublishTime } =
      req.body ?? {};
    if (!pageId || !pageAccessToken || !imageDataUrl) {
      return res.status(400).json({
        error: 'পোস্ট করার জন্য Page ID, Page Access Token এবং ছবি প্রয়োজন।',
      });
    }
    const match = String(imageDataUrl).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid image data format.' });

    const buffer = Buffer.from(match[2], 'base64');
    const blob = new Blob([buffer], { type: match[1] });
    const form = new FormData();
    form.append('source', blob, `rafu-folk-${Date.now()}.png`);
    form.append('caption', String(caption || ''));

    if (scheduledPublishTime !== undefined && scheduledPublishTime !== null) {
      const unixSec = Math.floor(Number(scheduledPublishTime));
      const nowSec = Math.floor(Date.now() / 1000);
      if (!Number.isFinite(unixSec) || unixSec < nowSec + 600) {
        return res.status(400).json({
          error: 'Facebook শিডিউল সময় অবশ্যই বর্তমান সময়ের অন্তত ১০ মিনিট পরের হতে হবে।',
        });
      }
      form.append('published', 'false');
      form.append('scheduled_publish_time', String(unixSec));
    } else {
      form.append('published', 'true');
    }
    form.append('access_token', String(pageAccessToken).trim());

    const fbRes = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(String(pageId).trim())}/photos`,
      { method: 'POST', body: form }
    );
    const data = await fbRes.json();
    if (!fbRes.ok || data.error) {
      return res.status(400).json({
        error: data?.error?.message || 'Facebook Page-এ পোস্ট করা যায়নি।',
      });
    }
    return res.json({
      id: data.id,
      postId: data.post_id || data.id,
      scheduled: Boolean(scheduledPublishTime),
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to publish to Facebook Page.',
    });
  }
});

app.post('/api/facebook/publish-video', uploadVideo.single('video'), async (req, res) => {
  try {
    const { pageId, pageAccessToken, title, description, scheduledPublishTime } = req.body ?? {};
    const file = req.file;
    if (!pageId || !pageAccessToken || !file) {
      return res.status(400).json({
        error: 'ভিডিও পোস্ট করার জন্য Page ID, Page Access Token এবং ভিডিও ফাইল প্রয়োজন।',
      });
    }

    const detected = detectVideoFormat(file) || 'mp4';
    let uploadBuffer = file.buffer;
    if (detected !== 'mp4') {
      uploadBuffer = await transcodeBufferToFacebookMp4(file.buffer, detected);
    }

    const blob = new Blob([new Uint8Array(uploadBuffer)], { type: 'video/mp4' });
    const form = new FormData();
    form.append('source', blob, `rafu-folk-${Date.now()}.mp4`);
    form.append('title', String(title || '@@RAFU FOLK@@ Cartoon').slice(0, 255));
    form.append('description', String(description || ''));

    if (
      scheduledPublishTime !== undefined &&
      scheduledPublishTime !== null &&
      String(scheduledPublishTime).trim() !== ''
    ) {
      const unixSec = Math.floor(Number(scheduledPublishTime));
      const nowSec = Math.floor(Date.now() / 1000);
      if (!Number.isFinite(unixSec) || unixSec < nowSec + 600) {
        return res.status(400).json({
          error: 'Facebook শিডিউল সময় অবশ্যই বর্তমান সময়ের অন্তত ১০ মিনিট পরের হতে হবে।',
        });
      }
      form.append('published', 'false');
      form.append('scheduled_publish_time', String(unixSec));
    } else {
      form.append('published', 'true');
    }
    form.append('access_token', String(pageAccessToken).trim());

    const fbRes = await fetch(
      `https://graph-video.facebook.com/v21.0/${encodeURIComponent(String(pageId).trim())}/videos`,
      { method: 'POST', body: form }
    );
    const data = await fbRes.json();
    if (!fbRes.ok || data.error) {
      return res.status(400).json({
        error: data?.error?.message || 'Facebook Page-এ ভিডিও পোস্ট করা যায়নি।',
      });
    }
    return res.json({
      id: data.id,
      postId: data.id,
      scheduled: Boolean(scheduledPublishTime),
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to publish video to Facebook Page.',
    });
  }
});

app.post('/api/webhook/publish', async (req, res) => {
  try {
    const { webhookUrl, payload } = req.body ?? {};
    if (!webhookUrl) return res.status(400).json({ error: 'Webhook URL দেওয়া হয়নি।' });
    const hookRes = await fetch(String(webhookUrl).trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
    if (!hookRes.ok) {
      return res.status(400).json({ error: `Webhook HTTP ${hookRes.status}` });
    }
    return res.json({ ok: true, status: hookRes.status });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Webhook publish failed.',
    });
  }
});

async function startServer() {
  await ensureDataDirs();
  const PORT = Number(process.env.PORT) || 3000;
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`@@RAFU FOLK@@ Stick-Meme & Cartoon Studio listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});
