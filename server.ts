import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '15mb' }));

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

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You are a top Bengali humorist and stick-figure comic writer for "@@RAFU FOLK@@". Always output strictly valid JSON matching the schema.',
        responseMimeType: 'application/json',
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
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: 'Empty response from Gemini API.' });
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
    const message = err instanceof Error ? err.message : 'Failed to generate comic script.';
    console.error('Generate comic error:', err);
    return res.status(500).json({ error: message });
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
