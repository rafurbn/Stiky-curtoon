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

const app = express();
app.use(express.json({ limit: '25mb' }));

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 65 * 1024 * 1024 },
});

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
    // Keep original message if not JSON
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
  if (
    info.code === 401 ||
    info.code === 403 ||
    msg.includes('api_key') ||
    msg.includes('permission_denied')
  ) {
    return {
      httpStatus: 403,
      message: 'GEMINI_API_KEY সঠিক নয় বা অনুমোদন পায়নি। সার্ভারের Environment Variable যাচাই করুন।',
    };
  }
  if (info.code === 404 || info.status === 'NOT_FOUND') {
    return {
      httpStatus: 404,
      message: 'নির্বাচিত AI মডেলটি পাওয়া যায়নি (404)। অনুগ্রহ করে পরে আবার চেষ্টা করুন।',
    };
  }

  return {
    httpStatus: 500,
    message: info.message || 'AI জেনারেশনে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
  };
}

async function generateJsonWithRetryAndFallback(params: {
  ai: GoogleGenAI;
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
}) {
  const attempts: Array<{ model: string; useThinkingLow: boolean; delayBeforeMs: number }> = [
    { model: 'gemini-4-hydrogen', useThinkingLow: true, delayBeforeMs: 0 },
    { model: 'gemini-4-hydrogen', useThinkingLow: true, delayBeforeMs: 900 },
    { model: 'gemini-3.1-flash-lite', useThinkingLow: false, delayBeforeMs: 1200 },
  ];

  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (attempt.delayBeforeMs > 0) {
      await sleep(attempt.delayBeforeMs);
    }
    try {
      const response = await params.ai.models.generateContent({
        model: attempt.model,
        contents: params.contents,
        config: {
          ...(attempt.useThinkingLow
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
          systemInstruction: params.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema,
        },
      });
      return response;
    } catch (err) {
      lastErr = err;
      console.warn(
        `Gemini attempt ${i + 1} (${attempt.model}) failed:`,
        extractGeminiErrorInfo(err).message
      );
      if (!shouldRetryOrFallback(err)) {
        throw err;
      }
    }
  }
  throw lastErr;
}

const CATEGORY_POOL = [
  'বন্ধুদের আড্ডা ও টাকা ধার',
  'অফিস, বস ও ছুটির বাহানা',
  'চা-দোকানের বুদ্ধিজীবী গপ্পো',
  'ভালোবাসা ও সিঙ্গেল জীবনের কষ্ট',
  'মায়ের ঝাড়ি ও ঘরোয়া কমেডি',
  'পরীক্ষা, পড়াশোনা ও রাত জাগা',
  'মোবাইল, নেট ও অনলাইন শপিং',
];

const VALID_LAYOUTS = ['1-panel', '2-panel', '3-panel', '4-panel'] as const;
const VALID_THEMES = [
  'cream_sketch',
  'studio_white',
  'notebook_grid',
  'sunny_tint',
  'chalk_mint',
] as const;

app.post('/api/generate-comic', async (req, res) => {
  try {
    const {
      category = 'auto',
      languageMode = 'bangla',
      layout = 'auto',
      customHint = '',
      recentTitles = [],
    } = req.body ?? {};

    const chosenCategory =
      category === 'auto'
        ? CATEGORY_POOL[Math.floor(Math.random() * CATEGORY_POOL.length)]
        : String(category);

    const chosenLayout =
      layout === 'auto'
        ? VALID_LAYOUTS[Math.floor(Math.random() * VALID_LAYOUTS.length)]
        : VALID_LAYOUTS.includes(layout)
          ? layout
          : '3-panel';

    const panelCount =
      chosenLayout === '1-panel'
        ? 1
        : chosenLayout === '2-panel'
          ? 2
          : chosenLayout === '3-panel'
            ? 3
            : 4;

    const chosenTheme = VALID_THEMES[Math.floor(Math.random() * VALID_THEMES.length)];

    const languageInstruction =
      languageMode === 'banglish'
        ? 'Write character dialogues and title in funny natural Banglish (Bengali written in English letters, e.g., "Mama, chai er bill ta de").'
        : languageMode === 'mixed'
          ? 'Write dialogues primarily in crisp natural Bengali with occasional humorous English words like Boss, Deadline, Recharge, WiFi.'
          : 'Write dialogues, panel captions, title, and Facebook caption in crisp, natural, everyday spoken Bangladeshi Bengali.';

    const avoidList =
      Array.isArray(recentTitles) && recentTitles.length > 0
        ? `Do NOT repeat or copy these recent titles/jokes: ${recentTitles.slice(0, 12).join(' | ')}.`
        : '';

    const hintInstruction =
      typeof customHint === 'string' && customHint.trim()
        ? `User optional vibe/topic hint: "${customHint.trim()}".`
        : 'Invent a completely fresh, original, viral funny situation automatically with zero user script needed.';

    const ai = getGeminiClient();

    const prompt = `Create a hilarious ${panelCount}-panel stick-figure comic strip for a popular Facebook comedy page called "@@RAFU FOLK@@".
Category: ${chosenCategory}.
${languageInstruction}
${hintInstruction}
${avoidList}

Rules for great stick comics:
1. Keep every speech bubble super short and punchy (maximum 42 characters per bubble) so it fits cleanly inside a comic speech bubble.
2. Build up a relatable setup in the early panels and deliver a sharp, unexpected comedic twist or deadpan punchline in the final panel.
3. Each panel must have 1 or 2 characters from these IDs: "rafu" (spiky hair), "folk" (glasses), "boss" (tie), "chacha" (mustache & topi), "friend" (cap).
4. Vary expressions ("happy", "laughing", "shocked", "angry", "deadpan", "confused", "crying", "smug", "wink") and poses ("standing", "pointing", "facepalm", "hands_up", "shrugging", "holding_phone", "holding_tea", "sitting_desk", "running") so each panel feels visually alive!
5. Write an engaging, natural-sounding Facebook Page post caption ("fbCaption") in 1-2 short conversational lines with a playful question for comments and 1-2 natural hashtags (never spammy).
6. Return exact panel count: ${panelCount} panels (panelIndex 0 to ${panelCount - 1}).`;

    const response = await generateJsonWithRetryAndFallback({
      ai,
      contents: prompt,
      systemInstruction:
        'You are a top Bengali humorist and stick-figure comic writer for "@@RAFU FOLK@@". Always output strictly valid JSON matching the schema.',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Short catchy comic strip title (max 38 characters).',
          },
          fbCaption: {
            type: Type.STRING,
            description: 'Natural human-style Bengali Facebook caption with 1 question and 1-2 hashtags.',
          },
          panels: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                panelIndex: { type: Type.INTEGER },
                captionTop: {
                  type: Type.STRING,
                  description: 'Optional very short scene note like "সকাল ৯টা" or empty string.',
                },
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
                      speech: {
                        type: Type.STRING,
                        description: 'Short witty dialogue (max 42 characters).',
                      },
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

    const comicScript = {
      id: `rf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: String(parsed.title || 'রাফু ও ফোকের কাণ্ড'),
      category: chosenCategory,
      layout: chosenLayout,
      paperTheme: chosenTheme,
      panels: Array.isArray(parsed.panels) ? parsed.panels.slice(0, panelCount) : [],
      fbCaption: String(parsed.fbCaption || 'কার সাথে এমন হয়েছে? কমেন্টে জানান!'),
      createdAt: new Date().toISOString(),
      seed: Math.floor(Math.random() * 900000) + 100000,
    };

    return res.json(comicScript);
  } catch (err) {
    const friendly = formatFriendlyGeminiError(err);
    console.error('Generate comic error:', err);
    return res.status(friendly.httpStatus).json({ error: friendly.message });
  }
});

const VALID_VIDEO_THEMES = [
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
      aspectRatio = '9:16',
      dialogueMode = 'bangla',
      musicStyle = 'comedy',
      storyArc = 'viral_story',
      targetDurationSec = 26,
      customHint = '',
      recentTitles = [],
    } = req.body ?? {};

    const chosenCategory =
      category === 'auto'
        ? CATEGORY_POOL[Math.floor(Math.random() * CATEGORY_POOL.length)]
        : String(category);

    const safeAspect = aspectRatio === '1:1' ? '1:1' : '9:16';
    const safeMusic = ['comedy', 'quirky', 'dramatic', 'none'].includes(String(musicStyle))
      ? musicStyle
      : 'comedy';
    const isViralArc = storyArc === 'viral_story';
    const desiredSec = isViralArc
      ? Math.max(18, Math.min(45, Number(targetDurationSec) || 26))
      : Math.max(8, Math.min(15, Number(targetDurationSec) || 12));
    const sceneCount = isViralArc ? 5 : 3;

    const themeInstruction =
      theme !== 'auto' && VALID_THEMES.includes(theme)
        ? `Start or center the story in theme "${theme}" (you may switch theme on a twist scene if funny).`
        : 'Pick vivid visual themes from: "rain_storm", "desert_sun", "office_drama", "tea_stall", "street_night" — changing themes across scenes when the plot jumps in time/place!';

    const dialogueInstruction =
      dialogueMode === 'silent'
        ? 'Silent slapstick mode: set every character speech to empty string "" and convey the entire joke via exaggerated actions, props, expressions, and SFX.'
        : 'Spoken Bengali AI Voiceover mode: write natural, conversational Bangladeshi Bengali dialogues (45–85 characters per speaking line, NO emojis inside speech text so TTS reads smoothly!). Keep 1 or 2 characters speaking per scene.';

    const avoidList =
      Array.isArray(recentTitles) && recentTitles.length > 0
        ? `Avoid repeating these recent stories: ${recentTitles.slice(0, 10).join(' | ')}.`
        : '';

    const hintInstruction =
      typeof customHint === 'string' && customHint.trim()
        ? `User story idea: "${customHint.trim()}".`
        : 'Invent a viral, relatable Bengali comedy mini-story automatically with a hook in Scene 1, funny escalation in the middle scenes, and a hilarious karmic twist punchline at the end!';

    const ai = getGeminiClient();

    const prompt = `Create a ${sceneCount}-scene animated 2D cartoon comedy video storyboard (~${desiredSec} seconds total) for "@@RAFU FOLK@@" Facebook Reels.
Category: ${chosenCategory}.
${themeInstruction}
${dialogueInstruction}
${hintInstruction}
${avoidList}

Rules:
1. Return exactly ${sceneCount} scenes (sceneIndex 0 to ${sceneCount - 1}). Total duration should be around ${desiredSec}s (each scene 3.5s to 7.0s).
2. Each scene MUST specify:
   - theme: "rain_storm" | "desert_sun" | "office_drama" | "tea_stall" | "street_night"
   - camera: "wide" | "zoom_left" | "zoom_right" | "zoom_center" | "shake"
   - sfx: "none" | "laugh" | "gasp" | "thunder" | "pour" | "punchline" | "pop" | "sad_trombone"
   - captionTop: short Bengali scene header (e.g., "সকাল ১০টা · চা-দোকান")
   - characters (1 or 2 characters): id ("rafu", "folk", "boss", "chacha", "friend"), name (Bengali name), side ("left" or "right"), expression, action, prop, speech (clean natural Bengali without emojis).
3. Make the characters visually active using actions ("walk_in", "laugh", "point_laugh", "panting", "shocked_jump", "eye_pop", "facepalm", "hands_up", "pour_water", "sip_tea", "run", "idle") and props ("umbrella_normal", "umbrella_upside_down", "broken_umbrella", "water_tap_glass", "tea_cup", "smartphone", "money", "laptop", "clock", "none").
4. Write an engaging Facebook Reels caption ("fbCaption") with 1 comment-bait question and 2-3 natural hashtags.`;

    const response = await generateJsonWithRetryAndFallback({
      ai,
      contents: prompt,
      systemInstruction:
        'You are a viral Bengali 2D cartoon animation director for "@@RAFU FOLK@@". Return strictly valid JSON matching the schema.',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
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
                  enum: ['rain_storm', 'desert_sun', 'office_drama', 'tea_stall', 'street_night'],
                },
                camera: {
                  type: Type.STRING,
                  enum: ['wide', 'zoom_left', 'zoom_right', 'zoom_center', 'shake'],
                },
                sfx: {
                  type: Type.STRING,
                  enum: [
                    'none',
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
                        ],
                      },
                      prop: {
                        type: Type.STRING,
                        enum: [
                          'none',
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
        required: ['title', 'fbCaption', 'scenes'],
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: 'AI থেকে খালি উত্তর এসেছে। আবার চেষ্টা করুন।' });
    }

    const parsed = JSON.parse(rawText);
    const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes.slice(0, 6) : [];
    const normalizedScenes = rawScenes.map((sc: Record<string, unknown>, idx: number) => ({
      sceneIndex: idx,
      durationSec: Math.max(3.0, Math.min(7.5, Number(sc.durationSec) || 4.5)),
      theme: VALID_VIDEO_THEMES.includes(sc.theme as (typeof VALID_VIDEO_THEMES)[number])
        ? sc.theme
        : 'tea_stall',
      camera: ['wide', 'zoom_left', 'zoom_right', 'zoom_center', 'shake'].includes(
        String(sc.camera)
      )
        ? sc.camera
        : 'wide',
      sfx: [
        'none',
        'laugh',
        'gasp',
        'thunder',
        'pour',
        'punchline',
        'pop',
        'sad_trombone',
      ].includes(String(sc.sfx))
        ? sc.sfx
        : 'pop',
      captionTop: typeof sc.captionTop === 'string' ? sc.captionTop.slice(0, 48) : '',
      characters: Array.isArray(sc.characters)
        ? sc.characters.slice(0, 2).map((ch: Record<string, unknown>) => ({
            ...ch,
            speech: dialogueMode === 'silent' ? '' : String(ch.speech || '').slice(0, 95),
          }))
        : [],
    }));

    const totalDurationSec = Number(
      normalizedScenes
        .reduce((sum: number, s: { durationSec: number }) => sum + s.durationSec, 0)
        .toFixed(1)
    );

    const videoScript = {
      id: `rfv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: String(parsed.title || 'রাফুর মজার কাণ্ড'),
      category: chosenCategory,
      aspectRatio: safeAspect,
      musicStyle: safeMusic,
      storyArc: isViralArc ? 'viral_story' : 'quick_short',
      subtitleStyle: 'reels_bold',
      totalDurationSec,
      scenes: normalizedScenes,
      fbCaption: String(parsed.fbCaption || 'কার সাথে এমন হয়েছে? 😂 #RafuFolk #BanglaCartoon'),
      createdAt: new Date().toISOString(),
      seed: Math.floor(Math.random() * 900000) + 100000,
    };

    return res.json(videoScript);
  } catch (err) {
    const friendly = formatFriendlyGeminiError(err);
    console.error('Generate video error:', err);
    return res.status(friendly.httpStatus).json({ error: friendly.message });
  }
});

// Character voice persona profiles for Edge TTS (free neural Bengali) & Gemini TTS
const CHARACTER_VOICE_MAP: Record<
  string,
  {
    edgeVoice: string;
    edgePitch: string;
    edgeRate: string;
    geminiVoice: string;
    geminiStyle: string;
  }
> = {
  rafu: {
    edgeVoice: 'bn-BD-PradeepNeural',
    edgePitch: '+12Hz',
    edgeRate: '+10%',
    geminiVoice: 'Puck',
    geminiStyle: 'Energetic, witty young Bangladeshi male speaking expressive Bengali',
  },
  folk: {
    edgeVoice: 'bn-BD-PradeepNeural',
    edgePitch: '-6Hz',
    edgeRate: '+0%',
    geminiVoice: 'Charon',
    geminiStyle: 'Calm, deadpan clever Bangladeshi male speaking crisp Bengali',
  },
  boss: {
    edgeVoice: 'bn-BD-PradeepNeural',
    edgePitch: '-24Hz',
    edgeRate: '-4%',
    geminiVoice: 'Fenrir',
    geminiStyle: 'Deep, authoritative, slightly irritated Bangladeshi office boss',
  },
  chacha: {
    edgeVoice: 'bn-BD-PradeepNeural',
    edgePitch: '-16Hz',
    edgeRate: '-6%',
    geminiVoice: 'Fenrir',
    geminiStyle: 'Playful, senior Bangladeshi tea-stall uncle with warm humor',
  },
  friend: {
    edgeVoice: 'bn-BD-NabanitaNeural',
    edgePitch: '+6Hz',
    edgeRate: '+8%',
    geminiVoice: 'Kore',
    geminiStyle: 'Lively, expressive Bangladeshi friend speaking natural Bengali',
  },
};

function stripEmojisForTts(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWavDurationSec(wavBuffer: Buffer): number {
  try {
    if (wavBuffer.length > 44 && wavBuffer.toString('ascii', 0, 4) === 'RIFF') {
      const byteRate = wavBuffer.readUInt32LE(28);
      if (byteRate > 0) {
        return Math.max(0.8, (wavBuffer.length - 44) / byteRate);
      }
    }
  } catch {
    // fallback
  }
  return 2.0;
}

async function getAudioDurationWithFfmpeg(audioBuffer: Buffer, ext: 'mp3' | 'wav'): Promise<number> {
  if (ext === 'wav') {
    return getWavDurationSec(audioBuffer);
  }
  const tmpFile = path.join(os.tmpdir(), `rafu-dur-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  try {
    await fs.writeFile(tmpFile, audioBuffer);
    const stderr = await new Promise<string>((resolve) => {
      const proc = spawn(FFMPEG_PATH, ['-i', tmpFile, '-f', 'null', '-']);
      let errOut = '';
      proc.stderr.on('data', (chunk) => {
        errOut += chunk.toString();
      });
      proc.on('close', () => resolve(errOut));
      proc.on('error', () => resolve(''));
    });
    const match = stderr.match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/);
    if (match) {
      const hours = Number(match[1]);
      const mins = Number(match[2]);
      const secs = Number(match[3]);
      return Math.max(0.7, hours * 3600 + mins * 60 + secs);
    }
  } catch {
    // Fallback estimate: 48kbps mono MP3 -> 6000 bytes/sec
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
  return Math.max(0.8, audioBuffer.length / 6000);
}

async function pitchShiftMp3WithFfmpeg(
  mp3Buffer: Buffer,
  pitchFactor: number,
  tempoFactor: number
): Promise<Buffer> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const inPath = path.join(os.tmpdir(), `rafu-tts-in-${id}.mp3`);
  const outPath = path.join(os.tmpdir(), `rafu-tts-out-${id}.mp3`);
  await fs.writeFile(inPath, mp3Buffer);

  try {
    // Shift pitch cleanly using asetrate + aresample + atempo to preserve natural speed
    const clampedPitch = Math.max(0.72, Math.min(1.32, pitchFactor));
    const compensatingTempo = Math.max(0.65, Math.min(1.6, tempoFactor / clampedPitch));
    const filterChain = `asetrate=24000*${clampedPitch.toFixed(3)},aresample=24000,atempo=${compensatingTempo.toFixed(3)}`;

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
        '64k',
        outPath,
      ]);
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg pitch shift exited ${code}`));
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
  characterId: string
): Promise<{ buffer: Buffer; mime: string; durationSec: number }> {
  // Split long sentences safely under 180 chars for free Bengali TTS endpoint
  const chunksText = text.length <= 180 ? [text] : text.match(/.{1,170}(\s|$)/g) || [text];
  const rawParts: Buffer[] = [];

  for (const part of chunksText) {
    const q = part.trim();
    if (!q) continue;
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(q)}&tl=bn&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!res.ok) {
      throw new Error(`Free Bengali TTS HTTP ${res.status}`);
    }
    const arr = await res.arrayBuffer();
    rawParts.push(Buffer.from(arr));
  }

  const rawBuffer = Buffer.concat(rawParts);
  if (rawBuffer.length < 128) {
    throw new Error('Empty Bengali TTS output');
  }

  // Distinct character cartoon voice shaping via FFmpeg
  const voiceShape: Record<string, { pitch: number; tempo: number }> = {
    rafu: { pitch: 1.12, tempo: 1.12 },
    folk: { pitch: 0.96, tempo: 1.02 },
    boss: { pitch: 0.80, tempo: 0.98 },
    chacha: { pitch: 0.86, tempo: 0.95 },
    friend: { pitch: 1.18, tempo: 1.14 },
  };
  const shape = voiceShape[characterId] || { pitch: 1.05, tempo: 1.06 };

  let finalBuffer: Buffer = rawBuffer;
  try {
    finalBuffer = await pitchShiftMp3WithFfmpeg(rawBuffer, shape.pitch, shape.tempo);
  } catch {
    finalBuffer = rawBuffer;
  }

  const durationSec = await getAudioDurationWithFfmpeg(finalBuffer, 'mp3');
  return { buffer: finalBuffer, mime: 'audio/mpeg', durationSec };
}

async function synthesizeWithEdgeTts(
  text: string,
  characterId: string
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
  if (rawBuffer.length < 128) {
    throw new Error('Empty Edge TTS audio output');
  }

  const voiceShape: Record<string, { pitch: number; tempo: number }> = {
    rafu: { pitch: 1.09, tempo: 1.08 },
    folk: { pitch: 0.96, tempo: 1.0 },
    boss: { pitch: 0.84, tempo: 0.96 },
    chacha: { pitch: 0.88, tempo: 0.94 },
    friend: { pitch: 1.06, tempo: 1.08 },
  };
  const shape = voiceShape[characterId] || { pitch: 1.0, tempo: 1.0 };
  let finalBuffer: Buffer = rawBuffer;
  if (shape.pitch !== 1.0 || shape.tempo !== 1.0) {
    try {
      finalBuffer = await pitchShiftMp3WithFfmpeg(rawBuffer, shape.pitch, shape.tempo);
    } catch {
      finalBuffer = rawBuffer;
    }
  }

  const durationSec = await getAudioDurationWithFfmpeg(finalBuffer, 'mp3');
  return { buffer: finalBuffer, mime: 'audio/mpeg', durationSec };
}

async function synthesizeWithGeminiTts(
  text: string,
  characterId: string
): Promise<{ buffer: Buffer; mime: string; durationSec: number }> {
  const persona = CHARACTER_VOICE_MAP[characterId] || CHARACTER_VOICE_MAP.rafu;
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: `${persona.geminiStyle}. Speak clearly in natural Bengali: ${text}`,
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
  if (!base64Audio) {
    throw new Error('Empty Gemini TTS audio output');
  }
  const buffer = Buffer.from(base64Audio, 'base64');
  const durationSec = getWavDurationSec(buffer);
  return { buffer, mime: 'audio/wav', durationSec };
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
        }>;
      };
      const chars = Array.isArray(sc.characters) ? sc.characters : [];
      let sceneCursor = 0.25;

      for (let cIdx = 0; cIdx < chars.length; cIdx++) {
        const ch = chars[cIdx];
        const rawSpeech = String(ch.speech || '').trim();
        const cleanSpeech = stripEmojisForTts(rawSpeech);
        if (!cleanSpeech) continue;

        let synth: { buffer: Buffer; mime: string; durationSec: number } | null = null;
        let usedProvider: 'edge_tts' | 'gemini_tts' = 'edge_tts';

        if (voiceEngine === 'gemini_tts' && process.env.GEMINI_API_KEY) {
          try {
            synth = await synthesizeWithGeminiTts(cleanSpeech, ch.id);
            usedProvider = 'gemini_tts';
          } catch (gemErr) {
            console.warn('Gemini TTS fallback to Edge/Free TTS:', extractGeminiErrorInfo(gemErr).message);
            try {
              synth = await synthesizeWithEdgeTts(cleanSpeech, ch.id);
              usedProvider = 'edge_tts';
            } catch {
              synth = await synthesizeWithFreeBengaliTts(cleanSpeech, ch.id);
              usedProvider = 'edge_tts';
            }
          }
        } else {
          // 'auto': Neural Edge TTS (bn-BD-PradeepNeural / NabanitaNeural) -> instant Free Bengali TTS fallback
          try {
            synth = await synthesizeWithEdgeTts(cleanSpeech, ch.id);
            usedProvider = 'edge_tts';
          } catch (edgeErr) {
            console.warn('Edge TTS failed, falling back to Free Bengali TTS:', edgeErr);
            synth = await synthesizeWithFreeBengaliTts(cleanSpeech, ch.id);
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

      // Auto-expand scene duration if voice dialogue needs more time so speech never cuts off
      const minRequired = Number((sceneCursor + 0.35).toFixed(1));
      if (minRequired > Number(sc.durationSec || 0)) {
        sc.durationSec = minRequired;
      }
    }

    const totalDurationSec = Number(
      updatedScenes
        .reduce((sum: number, s: { durationSec?: number }) => sum + Number(s.durationSec || 4), 0)
        .toFixed(1)
    );

    return res.json({
      voiceClips,
      scenes: updatedScenes,
      totalDurationSec,
    });
  } catch (err) {
    console.error('Voice synthesis error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'বাংলা AI ভয়েস তৈরি করা যায়নি।',
    });
  }
});

function detectVideoFormat(
  file: Express.Multer.File
): 'mp4' | 'webm' | 'quicktime' | null {
  const baseMime = String(file.mimetype || '').split(';')[0].trim().toLowerCase();
  if (baseMime === 'video/mp4') return 'mp4';
  if (baseMime === 'video/webm') return 'webm';
  if (baseMime === 'video/quicktime') return 'quicktime';

  const ext = path.extname(String(file.originalname || '')).toLowerCase();
  if (ext === '.mp4' || ext === '.m4v') return 'mp4';
  if (ext === '.webm') return 'webm';
  if (ext === '.mov') return 'quicktime';

  // Magic-byte inspection when browser sends application/octet-stream
  const buf = file.buffer;
  if (buf && buf.length >= 12) {
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
      return 'webm';
    }
    if (buf.toString('ascii', 4, 8) === 'ftyp') {
      return 'mp4';
    }
  }
  return null;
}

async function transcodeBufferToFacebookMp4(
  inputBuffer: Buffer,
  inputExt: 'mp4' | 'webm' | 'quicktime'
): Promise<Buffer> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inExt = inputExt === 'quicktime' ? 'mov' : inputExt;
  const inPath = path.join(os.tmpdir(), `rafu-in-${id}.${inExt}`);
  const outPath = path.join(os.tmpdir(), `rafu-out-${id}.mp4`);

  await fs.writeFile(inPath, inputBuffer);

  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-y',
        '-i',
        inPath,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ar',
        '44100',
        '-movflags',
        '+faststart',
        outPath,
      ];

      const proc = spawn(FFMPEG_PATH, args);
      let stderr = '';
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg transcode failed (code ${code}): ${stderr.slice(-300)}`));
        }
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
    const detected = detectVideoFormat(file);
    if (!detected) {
      return res.status(400).json({ error: 'কেবল MP4 বা WebM ভিডিও ফাইল সমর্থিত।' });
    }

    const mp4Buffer = await transcodeBufferToFacebookMp4(file.buffer, detected);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="rafu-folk-${Date.now()}.mp4"`);
    return res.send(mp4Buffer);
  } catch (err) {
    console.error('Transcode MP4 error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'MP4 কনভার্সন ব্যর্থ হয়েছে।',
    });
  }
});

app.post('/api/facebook/verify', async (req, res) => {
  try {
    const { pageId, pageAccessToken } = req.body ?? {};
    if (!pageId || !pageAccessToken) {
      return res.status(400).json({ error: 'Page ID এবং Page Access Token দুটোই দিতে হবে।' });
    }

    const url = new URL(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(String(pageId).trim())}`
    );
    url.searchParams.set('fields', 'id,name,fan_count,link');
    url.searchParams.set('access_token', String(pageAccessToken).trim());

    const fbRes = await fetch(url.toString());
    const data = await fbRes.json();

    if (!fbRes.ok || data.error) {
      return res.status(400).json({
        error:
          data?.error?.message ||
          'Facebook Page যাচাই করা যায়নি। Token বা Page ID চেক করুন।',
      });
    }

    return res.json({
      id: data.id,
      name: data.name,
      fanCount: data.fan_count ?? null,
      link: data.link ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Facebook verification failed.';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/facebook/publish', async (req, res) => {
  try {
    const {
      pageId,
      pageAccessToken,
      caption,
      imageDataUrl,
      scheduledPublishTime,
    } = req.body ?? {};

    if (!pageId || !pageAccessToken || !imageDataUrl) {
      return res.status(400).json({
        error: 'পোস্ট করার জন্য Page ID, Page Access Token এবং ছবি প্রয়োজন।',
      });
    }

    const match = String(imageDataUrl).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid image data format.' });
    }

    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: mimeType });

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
      if (unixSec > nowSec + 30 * 24 * 60 * 60) {
        return res.status(400).json({
          error: 'Facebook সর্বোচ্চ ৩০ দিনের মধ্যে পোস্ট শিডিউল করতে দেয়।',
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
      {
        method: 'POST',
        body: form,
      }
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
    const message =
      err instanceof Error ? err.message : 'Failed to publish to Facebook Page.';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/facebook/publish-video', uploadVideo.single('video'), async (req, res) => {
  try {
    const { pageId, pageAccessToken, title, description, scheduledPublishTime } =
      req.body ?? {};
    const file = req.file;

    if (!pageId || !pageAccessToken || !file) {
      return res.status(400).json({
        error: 'ভিডিও পোস্ট করার জন্য Page ID, Page Access Token এবং ভিডিও ফাইল প্রয়োজন।',
      });
    }

    const cleanPageId = String(pageId).trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(cleanPageId)) {
      return res.status(400).json({ error: 'সঠিক Facebook Page ID দিন।' });
    }

    const detected = detectVideoFormat(file);
    if (!detected) {
      return res.status(400).json({
        error: 'কেবল MP4 বা WebM ভিডিও আপলোড করা যাবে।',
      });
    }

    // Always normalize/transcode to Facebook-compliant H.264 + AAC MP4 via FFmpeg
    let uploadBuffer = file.buffer;
    try {
      uploadBuffer = await transcodeBufferToFacebookMp4(file.buffer, detected);
    } catch (transcodeErr) {
      console.warn('FFmpeg transcode warning, falling back if MP4:', transcodeErr);
      if (detected !== 'mp4') {
        return res.status(500).json({
          error: 'ভিডিও MP4 ফরম্যাটে কনভার্ট করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।',
        });
      }
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
      if (unixSec > nowSec + 30 * 24 * 60 * 60) {
        return res.status(400).json({
          error: 'Facebook সর্বোচ্চ ৩০ দিনের মধ্যে পোস্ট শিডিউল করতে দেয়।',
        });
      }
      form.append('published', 'false');
      form.append('scheduled_publish_time', String(unixSec));
    } else {
      form.append('published', 'true');
    }

    form.append('access_token', String(pageAccessToken).trim());

    const fbRes = await fetch(
      `https://graph-video.facebook.com/v21.0/${encodeURIComponent(cleanPageId)}/videos`,
      {
        method: 'POST',
        body: form,
      }
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
    const message =
      err instanceof Error ? err.message : 'Failed to publish video to Facebook Page.';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/webhook/publish', async (req, res) => {
  try {
    const { webhookUrl, payload } = req.body ?? {};
    if (!webhookUrl) {
      return res.status(400).json({ error: 'Webhook URL দেওয়া হয়নি।' });
    }

    const hookRes = await fetch(String(webhookUrl).trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });

    if (!hookRes.ok) {
      const text = await hookRes.text().catch(() => '');
      return res.status(400).json({
        error: `Webhook HTTP ${hookRes.status}: ${text.slice(0, 140) || 'Failed'}`,
      });
    }

    return res.json({ ok: true, status: hookRes.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook publish failed.';
    return res.status(500).json({ error: message });
  }
});

async function startServer() {
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
    console.log(`@@RAFU FOLK@@ Cartoon & Reels Studio listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});
