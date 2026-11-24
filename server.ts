import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '15mb' }));

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 45 * 1024 * 1024 },
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
  let code = typeof errObj?.status === 'number' ? errObj.status : typeof errObj?.code === 'number' ? errObj.code : undefined;
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
      message: 'AI সার্ভারে এই মুহূর্তে অতিরিক্ত চাপ রয়েছে (503)। অনুগ্রহ করে ১০–১৫ সেকেন্ড পর আবার চেষ্টা করুন।',
    };
  }
  if (info.code === 429 || info.status === 'RESOURCE_EXHAUSTED' || msg.includes('quota')) {
    return {
      httpStatus: 429,
      message: 'Gemini API রেট লিমিট বা ফ্রি কোটা সাময়িকভাবে পূর্ণ হয়েছে (429)। কিছুক্ষণ পর আবার চেষ্টা করুন।',
    };
  }
  if (info.code === 401 || info.code === 403 || msg.includes('api_key') || msg.includes('permission_denied')) {
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
      console.warn(`Gemini attempt ${i + 1} (${attempt.model}) failed:`, extractGeminiErrorInfo(err).message);
      if (!shouldRetryOrFallback(err)) {
        throw err;
      }
    }
  }
  throw lastErr;
}

const VALID_LAYOUTS = ['1-panel', '2-panel', '3-panel', '4-panel'];
const VALID_THEMES = [
  'cream_sketch',
  'studio_white',
  'notebook_grid',
  'sunny_tint',
  'chalk_mint',
];

const CATEGORY_POOL = [
  'বন্ধুদের আড্ডা ও টাকা ধার',
  'অফিস, বস ও ছুটির বাহানা',
  'চা-দোকানের বুদ্ধিজীবী গপ্পো',
  'ভালোবাসা ও সিঙ্গেল জীবনের কষ্ট',
  'মায়ের ঝাড়ি ও ঘরোয়া কমেডি',
  'পরীক্ষা, পড়াশোনা ও রাত জাগা',
  'মোবাইল, নেট ও অনলাইন শপিং',
];

app.post('/api/generate-comic', async (req, res) => {
  try {
    const {
      category = 'auto',
      languageMode = 'bangla',
      layout = 'auto',
      recentTitles = [],
      customHint = '',
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
      targetDurationSec = 10,
      customHint = '',
      recentTitles = [],
    } = req.body ?? {};

    const chosenCategory =
      category === 'auto'
        ? CATEGORY_POOL[Math.floor(Math.random() * CATEGORY_POOL.length)]
        : String(category);

    const safeTargetSec = Math.max(5, Math.min(15, Number(targetDurationSec) || 10));
    const safeAspect = aspectRatio === '1:1' ? '1:1' : '9:16';
    const safeMusic = ['comedy', 'quirky', 'dramatic', 'none'].includes(musicStyle)
      ? musicStyle
      : 'comedy';

    const themeInstruction =
      theme !== 'auto' && VALID_VIDEO_THEMES.includes(theme)
        ? `Start or center the visual scenes around the "${theme}" background theme (you may shift to a contrasting theme for a karma/twist punchline if funnier).`
        : 'Pick vivid contrasting themes across scenes (e.g., "rain_storm" -> "desert_sun", or "office_drama" -> "tea_stall", or "tea_stall" -> "street_night") so the story has visual variety.';

    const dialogueInstruction =
      dialogueMode === 'silent'
        ? 'SILENT VISUAL SLAPSTICK MODE: Leave every character "speech" field as an empty string ""! Convey the entire joke purely through expressive poses, facial expressions, props, camera zooms, and sound effects.'
        : 'Include ultra-short, punchy natural Bangladeshi Bengali speech bubbles (maximum 32 characters per bubble) only on key lines so viewers read instantly in 1 second.';

    const avoidList =
      Array.isArray(recentTitles) && recentTitles.length > 0
        ? `Do NOT repeat these recent titles: ${recentTitles.slice(0, 10).join(' | ')}.`
        : '';

    const hintInstruction =
      typeof customHint === 'string' && customHint.trim()
        ? `User optional story hint: "${customHint.trim()}".`
        : 'Invent a completely fresh, viral, relatable 3-beat funny slapstick or karma twist story.';

    const ai = getGeminiClient();

    const prompt = `Create a hilarious 3-scene animated stick-figure short video storyboard (total length ~${safeTargetSec} seconds, strictly between 5 and 15 seconds) for "@@RAFU FOLK@@".
Category: ${chosenCategory}.
${themeInstruction}
${dialogueInstruction}
${hintInstruction}
${avoidList}

Rules:
1. Create exactly 3 scenes (sceneIndex 0, 1, 2). Sum of durationSec must be between 7 and ${safeTargetSec + 2} seconds (each scene 2.5 to 5 seconds).
2. Make Scene 0 the funny setup, Scene 1 the escalation/twist, and Scene 2 the hilarious punchline with dramatic camera zoom ("zoom_left", "zoom_right", "zoom_center", or "shake") and "eye_pop" / "point_laugh" / "shocked_jump" / "pour_water" / "run" action!
3. Choose matching sound effect ("sfx") for each scene: "thunder", "laugh", "gasp", "pour", "punchline", "pop", "sad_trombone".
4. Write a short catchy Bengali title (max 34 chars) and a natural 1-2 line Bengali Facebook Reels caption ("fbCaption") with 1 comment question and 2 hashtags.`;

    const response = await generateJsonWithRetryAndFallback({
      ai,
      contents: prompt,
      systemInstruction:
        'You are a viral Bengali short-form stickman animation director. Output strictly valid JSON matching the schema.',
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
                    enum: ['none', 'laugh', 'gasp', 'thunder', 'pour', 'punchline', 'pop', 'sad_trombone'],
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
    const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes.slice(0, 4) : [];
    const normalizedScenes = rawScenes.map((sc: Record<string, unknown>, idx: number) => ({
      sceneIndex: idx,
      durationSec: Math.max(2, Math.min(5.5, Number(sc.durationSec) || 3.5)),
      theme: VALID_VIDEO_THEMES.includes(sc.theme as (typeof VALID_VIDEO_THEMES)[number])
        ? sc.theme
        : 'tea_stall',
      camera: ['wide', 'zoom_left', 'zoom_right', 'zoom_center', 'shake'].includes(
        String(sc.camera)
      )
        ? sc.camera
        : 'wide',
      sfx: ['none', 'laugh', 'gasp', 'thunder', 'pour', 'punchline', 'pop', 'sad_trombone'].includes(
        String(sc.sfx)
      )
        ? sc.sfx
        : 'pop',
      captionTop: typeof sc.captionTop === 'string' ? sc.captionTop.slice(0, 42) : '',
      characters: Array.isArray(sc.characters)
        ? sc.characters.slice(0, 2).map((ch: Record<string, unknown>) => ({
            ...ch,
            speech: dialogueMode === 'silent' ? '' : String(ch.speech || '').slice(0, 42),
          }))
        : [],
    }));

    // Enforce 5-15 second total duration cleanly
    let totalDurationSec = normalizedScenes.reduce(
      (sum: number, s: { durationSec: number }) => sum + s.durationSec,
      0
    );
    if (totalDurationSec > 15 && totalDurationSec > 0) {
      const ratio = 14.5 / totalDurationSec;
      normalizedScenes.forEach((s: { durationSec: number }) => {
        s.durationSec = Math.max(1.8, Number((s.durationSec * ratio).toFixed(1)));
      });
      totalDurationSec = normalizedScenes.reduce(
        (sum: number, s: { durationSec: number }) => sum + s.durationSec,
        0
      );
    } else if (totalDurationSec < 5 && normalizedScenes.length > 0) {
      normalizedScenes.forEach((s: { durationSec: number }) => {
        s.durationSec = Math.max(2.5, s.durationSec);
      });
      totalDurationSec = normalizedScenes.reduce(
        (sum: number, s: { durationSec: number }) => sum + s.durationSec,
        0
      );
    }

    const videoScript = {
      id: `rfv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: String(parsed.title || 'রাফুর মজার কাণ্ড'),
      category: chosenCategory,
      aspectRatio: safeAspect,
      musicStyle: safeMusic,
      totalDurationSec: Number(totalDurationSec.toFixed(1)),
      scenes: normalizedScenes,
      fbCaption: String(parsed.fbCaption || 'কার সাথে এমন হয়েছে? 😂 #RafuFolk'),
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

app.post('/api/facebook/verify', async (req, res) => {
  try {
    const { pageId, pageAccessToken } = req.body ?? {};
    if (!pageId || !pageAccessToken) {
      return res.status(400).json({ error: 'Page ID এবং Page Access Token দুটোই দিতে হবে।' });
    }

    const url = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(String(pageId).trim())}`);
    url.searchParams.set('fields', 'id,name,fan_count,link');
    url.searchParams.set('access_token', String(pageAccessToken).trim());

    const fbRes = await fetch(url.toString());
    const data = await fbRes.json();

    if (!fbRes.ok || data.error) {
      return res.status(400).json({
        error: data?.error?.message || 'Facebook Page যাচাই করা যায়নি। Token বা Page ID চেক করুন।',
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
    const message = err instanceof Error ? err.message : 'Failed to publish to Facebook Page.';
    return res.status(500).json({ error: message });
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

    const cleanPageId = String(pageId).trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(cleanPageId)) {
      return res.status(400).json({ error: 'সঠিক Facebook Page ID দিন।' });
    }

    const allowedMimes = ['video/mp4', 'video/webm', 'video/quicktime'];
    const baseMime = String(file.mimetype || '').split(';')[0].trim().toLowerCase();
    if (!allowedMimes.includes(baseMime)) {
      return res.status(400).json({ error: 'কেবল MP4 বা WebM ভিডিও আপলোড করা যাবে।' });
    }

    const ext = baseMime === 'video/mp4' ? 'mp4' : 'webm';
    const blob = new Blob([new Uint8Array(file.buffer)], { type: baseMime });

    const form = new FormData();
    form.append('source', blob, `rafu-folk-${Date.now()}.${ext}`);
    form.append('title', String(title || '@@RAFU FOLK@@ Stick Comedy').slice(0, 255));
    form.append('description', String(description || ''));

    if (scheduledPublishTime !== undefined && scheduledPublishTime !== null && String(scheduledPublishTime).trim() !== '') {
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
    const message = err instanceof Error ? err.message : 'Failed to publish video to Facebook Page.';
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
    console.log(`@@RAFU FOLK@@ Comic Studio listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});
