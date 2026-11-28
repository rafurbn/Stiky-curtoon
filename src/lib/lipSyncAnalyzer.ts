import type { VideoScript } from '../types/comic';
import { getAudioBackupDataUrl, resolveAssetUrlWithBackup } from './hybridSpriteCatalog';

export type MouthViseme =
  | 'closed'
  | 'consonant'
  | 'mid_vowel'
  | 'round_o'
  | 'wide_shout';

export interface LipSyncSample {
  openness: number; // 0..1
  width: number; // 0.6..1.25
  viseme: MouthViseme;
}

interface AnalyzedClip {
  fps: number;
  durationSec: number;
  samples: LipSyncSample[];
}

const analyzedCache = new Map<string, AnalyzedClip>();
const pendingDecode = new Map<string, Promise<AnalyzedClip | null>>();

function cacheKeyForClip(
  audioDataUrl: string,
  sceneIndex: number,
  charIndex: number
): string {
  return `${sceneIndex}:${charIndex}:${audioDataUrl.length}:${audioDataUrl.slice(-48)}`;
}

async function analyzeAudioDataUrl(
  key: string,
  audioDataUrl: string,
  backupUrl?: string
): Promise<AnalyzedClip | null> {
  if (analyzedCache.has(key)) {
    return analyzedCache.get(key)!;
  }
  if (pendingDecode.has(key)) {
    return pendingDecode.get(key)!;
  }

  const job = (async (): Promise<AnalyzedClip | null> => {
    try {
      let arr: ArrayBuffer;
      try {
        const res = await fetch(audioDataUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        arr = await res.arrayBuffer();
      } catch (err) {
        if (backupUrl && backupUrl !== audioDataUrl) {
          const res2 = await fetch(backupUrl);
          if (!res2.ok) throw err;
          arr = await res2.arrayBuffer();
        } else {
          throw err;
        }
      }
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      let audioBuf: AudioBuffer;
      try {
        audioBuf = await ctx.decodeAudioData(arr);
      } finally {
        ctx.close().catch(() => {});
      }

      const channel = audioBuf.getChannelData(0);
      const sampleRate = audioBuf.sampleRate;
      const fps = 30;
      const step = Math.max(1, Math.floor(sampleRate / fps));
      const frameCount = Math.max(1, Math.ceil(channel.length / step));

      // First pass: compute raw RMS and Zero-Crossing Rate per frame
      const rawRms: number[] = [];
      const rawZcr: number[] = [];
      let peakRms = 0.01;

      for (let f = 0; f < frameCount; f++) {
        const start = f * step;
        const end = Math.min(channel.length, start + step);
        let sumSq = 0;
        let crossings = 0;
        let prev = channel[start] || 0;
        for (let i = start; i < end; i++) {
          const v = channel[i];
          sumSq += v * v;
          if ((v >= 0 && prev < 0) || (v < 0 && prev >= 0)) {
            crossings++;
          }
          prev = v;
        }
        const len = Math.max(1, end - start);
        const rms = Math.sqrt(sumSq / len);
        const zcr = crossings / len;
        rawRms.push(rms);
        rawZcr.push(zcr);
        if (rms > peakRms) peakRms = rms;
      }

      // Second pass: smooth envelope + classify into expressive visemes
      const samples: LipSyncSample[] = [];
      let smoothed = 0;

      for (let f = 0; f < frameCount; f++) {
        const norm = Math.min(1, rawRms[f] / Math.max(0.06, peakRms * 0.85));
        // Fast attack, slightly slower release for natural jaw motion
        const alpha = norm > smoothed ? 0.65 : 0.42;
        smoothed = smoothed * (1 - alpha) + norm * alpha;

        const zcr = rawZcr[f];
        let viseme: MouthViseme = 'closed';
        let width = 1.0;

        if (smoothed < 0.08) {
          viseme = 'closed';
          width = 0.95;
        } else if (smoothed > 0.72) {
          viseme = 'wide_shout';
          width = 1.15;
        } else if (zcr < 0.085 && smoothed > 0.36) {
          // Low-frequency vowel resonance -> O/U rounded shout shape
          viseme = 'round_o';
          width = 0.74;
        } else if (zcr > 0.19 && smoothed < 0.45) {
          // High-frequency sibilant/consonant -> narrow teeth/lip shape
          viseme = 'consonant';
          width = 1.12;
        } else {
          viseme = 'mid_vowel';
          width = 1.0;
        }

        samples.push({
          openness: smoothed < 0.08 ? 0 : Math.min(1, smoothed),
          width,
          viseme,
        });
      }

      const analyzed: AnalyzedClip = {
        fps,
        durationSec: audioBuf.duration,
        samples,
      };
      analyzedCache.set(key, analyzed);
      return analyzed;
    } catch {
      return null;
    } finally {
      pendingDecode.delete(key);
    }
  })();

  pendingDecode.set(key, job);
  return job;
}

export async function prepareLipSyncForScript(script: VideoScript): Promise<void> {
  const tasks: Array<Promise<AnalyzedClip | null>> = [];

  if (Array.isArray(script.voiceClips)) {
    for (const clip of script.voiceClips) {
      if (clip.audioDataUrl) {
        const key = cacheKeyForClip(clip.audioDataUrl, clip.sceneIndex, clip.charIndex);
        tasks.push(analyzeAudioDataUrl(key, clip.audioDataUrl));
      }
    }
  }

  script.scenes.forEach((sc, sIdx) => {
    sc.characters.forEach((ch, cIdx) => {
      const customSrc =
        ch.customAudioDataUrl ||
        resolveAssetUrlWithBackup(ch.customAudioUrl, ch.customAudioAssetId);
      if (customSrc) {
        const backup = getAudioBackupDataUrl(ch.customAudioUrl, ch.customAudioAssetId);
        const key = cacheKeyForClip(customSrc, sIdx, cIdx);
        tasks.push(analyzeAudioDataUrl(key, customSrc, backup));
      }
    });
  });

  await Promise.all(tasks);
}

export function sampleCharacterLipSync(
  script: VideoScript,
  sceneIndex: number,
  charIndex: number,
  localT: number,
  isFallbackSpeaking: boolean
): LipSyncSample {
  const scene = script.scenes[sceneIndex];
  const char = scene?.characters?.[charIndex];

  // 1. Custom uploaded/mic/library audio takes priority
  const customSrc =
    char?.customAudioDataUrl ||
    resolveAssetUrlWithBackup(char?.customAudioUrl, char?.customAudioAssetId);
  if (customSrc) {
    const key = cacheKeyForClip(customSrc, sceneIndex, charIndex);
    const analyzed = analyzedCache.get(key);
    const offset = charIndex === 0 ? 0.2 : Math.min((scene?.durationSec || 4) * 0.45, 2.0);
    const tInClip = localT - offset;
    if (analyzed && tInClip >= 0 && tInClip <= analyzed.durationSec) {
      const idx = Math.min(
        analyzed.samples.length - 1,
        Math.max(0, Math.floor(tInClip * analyzed.fps))
      );
      return analyzed.samples[idx];
    }
    if (analyzed) {
      return { openness: 0, width: 1, viseme: 'closed' };
    }
  }

  // 2. Synthesized AI voice clip matching this character in this scene
  const clip = Array.isArray(script.voiceClips)
    ? script.voiceClips.find(
        (c) => c.sceneIndex === sceneIndex && c.charIndex === charIndex
      )
    : undefined;

  if (clip && clip.audioDataUrl) {
    const key = cacheKeyForClip(clip.audioDataUrl, sceneIndex, charIndex);
    const analyzed = analyzedCache.get(key);
    const start = clip.offsetInSceneSec ?? 0.2;
    const tInClip = localT - start;

    if (analyzed) {
      if (tInClip < 0 || tInClip > analyzed.durationSec) {
        return { openness: 0, width: 1, viseme: 'closed' };
      }
      const idx = Math.min(
        analyzed.samples.length - 1,
        Math.max(0, Math.floor(tInClip * analyzed.fps))
      );
      return analyzed.samples[idx];
    }

    // Trigger background decode if not yet cached
    analyzeAudioDataUrl(key, clip.audioDataUrl).catch(() => {});
    if (tInClip >= 0 && tInClip <= clip.durationSec) {
      const wave = Math.abs(Math.sin(tInClip * 19) * Math.cos(tInClip * 7));
      return {
        openness: wave,
        width: 1,
        viseme: wave > 0.65 ? 'wide_shout' : wave > 0.25 ? 'mid_vowel' : 'consonant',
      };
    }
    return { openness: 0, width: 1, viseme: 'closed' };
  }

  // 3. Fallback when silent or before voice synthesis
  if (!isFallbackSpeaking) {
    return { openness: 0, width: 1, viseme: 'closed' };
  }
  const wave = Math.abs(Math.sin(localT * 16) * Math.cos(localT * 6.3));
  return {
    openness: wave,
    width: 1,
    viseme: wave > 0.65 ? 'wide_shout' : wave > 0.25 ? 'mid_vowel' : 'consonant',
  };
}
