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

const app = express();
app.use(express.json({ limit: '35mb' }));

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});

async function ensureDataDirs() {
  await fs.mkdir(SAVED_VIDEOS_DIR, { recursive: true });
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
      category = 'auto',
      theme = 'auto',
      renderStyle = 'stick_meme',
      aspectRatio = '9:16',
      dialogueMode = 'bangla',
      musicStyle = 'cinematic_parody',
      storyArc = 'viral_story',
      targetDurationSec = 22,
      customHint = '',
      recentTitles = [],
    } = req.body ?? {};

    const chosenCategory =
      category === 'auto'
        ? CATEGORY_POOL[Math.floor(Math.random() * CATEGORY_POOL.length)]
        : String(category);
    const safeRenderStyle = renderStyle === 'cartoon_2d' ? 'cartoon_2d' : 'stick_meme';
    const safeAspect = aspectRatio === '1:1' ? '1:1' : '9:16';
    const safeMusic = [
      'comedy',
      'quirky',
      'dramatic',
      'cinematic_parody',
      'none',
    ].includes(String(musicStyle))
      ? musicStyle
      : 'cinematic_parody';

    const isViralArc = storyArc === 'viral_story';
    const desiredSec = isViralArc
      ? Math.max(16, Math.min(36, Number(targetDurationSec) || 22))
      : Math.max(9, Math.min(16, Number(targetDurationSec) || 13));
    const sceneCount = isViralArc ? 4 : 3;

    const styleGuidance =
      safeRenderStyle === 'stick_meme'
        ? `STYLE: Viral Black-and-White Stick-Figure Comedy Meme Short (like Bangladeshi meme reels!).
Use rooms/themes: "room_door", "bathroom_rush", "bedroom_night", "exam_hall".
Use hilarious stick-figure meme actions: "knock_door", "desperate_squeeze", "scream_jaw", "dramatic_closeup", "door_peek", "collapsed_mess", "shocked_jump", "eye_pop", "facepalm", "hands_up".
Use stick props: "door_closed", "door_open", "toilet_squat", "splat_mess", "smartphone", "money", "clock", "none".
Include 1 split-screen scene (splitScreen: true) when two friends argue from different sides, and 1 dramatic parody close-up scene (action: "dramatic_closeup", voiceEffect: "dramatic_boss", sfx: "dramatic_boom") with an original copyright-free heroic movie-parody Bengali dialogue!`
        : `STYLE: Colorful 2D Bengali Comedy Cartoon Short.
Use themes: "tea_stall", "office_drama", "rain_storm", "desert_sun", "street_night".`;

    const themeInstruction =
      theme !== 'auto' && VALID_VIDEO_THEMES.includes(theme as (typeof VALID_VIDEO_THEMES)[number])
        ? `Center the story around theme "${theme}" (or switch themes cleanly if the punchline moves locations).`
        : '';

    const dialogueInstruction =
      dialogueMode === 'silent'
        ? 'Silent slapstick mode: set every character speech to "" and convey humor visually + SFX.'
        : 'Spoken Bengali AI Dubbing mode: write natural, punchy Bangladeshi Bengali dialogues (35–80 chars per line, NO emojis inside speech text so voice synthesis reads naturally!). Assign appropriate voiceEffect per character: "panicked" (urgent desperate friend), "dramatic_boss" (deep cinematic parody hero/villain line), "cartoon_high" (funny squeaky punchline), or "normal".';

    const avoidList =
      Array.isArray(recentTitles) && recentTitles.length > 0
        ? `Avoid repeating recent stories: ${recentTitles.slice(0, 8).join(' | ')}.`
        : '';

    const hintInstruction =
      typeof customHint === 'string' && customHint.trim()
        ? `User story idea: "${customHint.trim()}".`
        : 'Invent a super relatable, 100% original & copyright-free Bangladeshi friend comedy situation (e.g. bathroom emergency, hostel food theft, borrowing money, exam cheating panic, sudden rain/power cut) with an unexpected hilarious twist at the end!';

    const ai = getGeminiClient();
    const prompt = `Create a ${sceneCount}-scene animated comedy video storyboard (~${desiredSec} seconds total) for "@@RAFU FOLK@@".
Category: ${chosenCategory}.
${styleGuidance}
${themeInstruction}
${dialogueInstruction}
${hintInstruction}
${avoidList}

CRITICAL COPYRIGHT RULE:
Everything MUST be 100% original and copyright-free! Do NOT quote copyrighted movie scripts or songs verbatim; write original funny Bengali parody lines instead.

Also generate:
- title: short catchy Bengali title
- hookBanner: short viral 3-6 word Bengali meme hook for the top white box (e.g., "বন্ধুর যখন বাথরুম চাপ দেয় 🤣")
- fbCaption: engaging Facebook Reels caption with a question and 2-3 hashtags.`;

    const response = await generateJsonWithRetryAndFallback({
      ai,
      contents: prompt,
      systemInstruction:
        'You are a viral Bengali stick-figure comedy animation director. Return strictly valid JSON matching the schema.',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hookBanner: { type: Type.STRING },
          fbCaption: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sceneIndex: { type: Type.INTEGER },
                durationSec: { type: Type.NUMBER },
                theme: {
                  type: Type.STRING,
                  enum: [...VALID_VIDEO_THEMES],
                },
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
                          'exhausted',
                        ],
                      },
                      action: {
                        type: Type.STRING,
                        enum: [
                          'idle',
                          'walk_in',
                          'laugh',
                          'point_laugh',
                          'panting',
                          'shocked_jump',
                          'eye_pop',
                          'facepalm',
                          'hands_up',
                          'pour_water',
                          'sip_tea',
                          'run',
                          'knock_door',
                          'desperate_squeeze',
                          'scream_jaw',
                          'door_peek',
                          'collapsed_mess',
                          'dramatic_closeup',
                        ],
                      },
                      prop: {
                        type: Type.STRING,
                        enum: [
                          'none',
                          'door_closed',
                          'door_open',
                          'toilet_squat',
                          'splat_mess',
                          'umbrella_normal',
                          'umbrella_upside_down',
                          'broken_umbrella',
                          'water_tap_glass',
                          'tea_cup',
                          'smartphone',
                          'money',
                          'laptop',
                          'clock',
                        ],
                      },
                      voiceEffect: {
                        type: Type.STRING,
                        enum: ['normal', 'panicked', 'dramatic_boss', 'cartoon_high'],
                      },
                      speech: { type: Type.STRING },
                    },
                    required: ['id', 'name', 'side', 'expression', 'action', 'prop'],
                  },
                },
              },
              required: ['sceneIndex', 'durationSec', 'theme', 'camera', 'sfx', 'characters'],
            },
          },
        },
        required: ['title', 'hookBanner', 'fbCaption', 'scenes'],
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: 'AI থেকে খালি উত্তর এসেছে। আবার চেষ্টা করুন।' });
    }

    const parsed = JSON.parse(rawText);
    const scenes = (Array.isArray(parsed.scenes) ? parsed.scenes : [])
      .slice(0, sceneCount)
      .map((sc: Record<string, unknown>, idx: number) => ({
        ...sc,
        sceneIndex: idx,
        durationSec: Math.max(3.0, Math.min(7.5, Number(sc.durationSec) || 4.5)),
      }));

    const totalDurationSec = Number(
      scenes
        .reduce((acc: number, s: { durationSec: number }) => acc + s.durationSec, 0)
        .toFixed(1)
    );

    return res.json({
      id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: String(parsed.title || 'বন্ধুর মজার কাণ্ড'),
      hookBanner: String(parsed.hookBanner || parsed.title || 'বন্ধুর যখন এমন হয় 🤣'),
      category: chosenCategory,
      renderStyle: safeRenderStyle,
      aspectRatio: safeAspect,
      musicStyle: safeMusic,
      storyArc: isViralArc ? 'viral_story' : 'quick_short',
      subtitleStyle: safeRenderStyle === 'stick_meme' ? 'meme_clean' : 'reels_bold',
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
    const d = defaults[characterId] || { p: 1.0, t: 1.0 };
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
  const persona = CHARACTER_VOICE_MAP[characterId] || CHARACTER_VOICE_MAP.rafu;
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
  const persona = CHARACTER_VOICE_MAP[characterId] || CHARACTER_VOICE_MAP.rafu;
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
