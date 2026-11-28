import type { VideoMusicStyle, VideoScript, VideoSfx, VideoVoiceClip } from '../types/comic';
import { getAudioBackupDataUrl, resolveAssetUrlWithBackup } from './hybridSpriteCatalog';

export interface AudioSession {
  stream: MediaStream;
  stop: () => void;
}

function createNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    data[i] = (lastOut + 0.04 * white) / 1.04;
    lastOut = data[i];
    data[i] *= 2.5;
  }
  return buffer;
}

/**
 * 100% Copyright-Free Synthesized Sound Effects (Web Audio API)
 */
export function triggerSfx(
  ctx: AudioContext,
  target: AudioNode,
  sfx: VideoSfx,
  startTime: number
) {
  if (sfx === 'none') return;

  if (sfx === 'knock_door') {
    // 4 crisp hollow wooden door knocks
    [0, 0.22, 0.44, 0.72].forEach((offset) => {
      const t = startTime + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(165, t);
      osc.frequency.exponentialRampToValueAtTime(58, t + 0.07);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.42, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(gain).connect(target);
      osc.start(t);
      osc.stop(t + 0.1);
    });
    return;
  }

  if (sfx === 'dramatic_boom') {
    // Copyright-free deep cinematic bass impact + metallic sting
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(125, startTime);
    sub.frequency.exponentialRampToValueAtTime(34, startTime + 0.85);
    subGain.gain.setValueAtTime(0.001, startTime);
    subGain.gain.linearRampToValueAtTime(0.48, startTime + 0.02);
    subGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.95);
    sub.connect(subGain).connect(target);
    sub.start(startTime);
    sub.stop(startTime + 1.0);

    const brass = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(950, startTime);
    lp.frequency.exponentialRampToValueAtTime(180, startTime + 0.9);
    const bGain = ctx.createGain();
    brass.type = 'sawtooth';
    brass.frequency.setValueAtTime(110, startTime);
    bGain.gain.setValueAtTime(0.001, startTime);
    bGain.gain.linearRampToValueAtTime(0.2, startTime + 0.04);
    bGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.95);
    brass.connect(lp).connect(bGain).connect(target);
    brass.start(startTime);
    brass.stop(startTime + 1.0);
    return;
  }

  if (sfx === 'scream_sting') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, startTime);
    osc.frequency.exponentialRampToValueAtTime(860, startTime + 0.35);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.18, startTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);
    osc.connect(lp).connect(gain).connect(target);
    osc.start(startTime);
    osc.stop(startTime + 0.48);
    return;
  }

  if (sfx === 'door_creak') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(290, startTime);
    osc.frequency.linearRampToValueAtTime(420, startTime + 0.25);
    osc.frequency.linearRampToValueAtTime(240, startTime + 0.52);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 4;
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.16, startTime + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.55);
    osc.connect(bp).connect(gain).connect(target);
    osc.start(startTime);
    osc.stop(startTime + 0.58);
    return;
  }

  if (sfx === 'splat_funny') {
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(620, startTime);
    filter.frequency.exponentialRampToValueAtTime(160, startTime + 0.35);
    filter.Q.value = 2.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.38);
    noise.connect(filter).connect(gain).connect(target);
    noise.start(startTime);
    noise.stop(startTime + 0.4);

    // Funny boing sting
    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, startTime + 0.15);
    osc.frequency.exponentialRampToValueAtTime(520, startTime + 0.32);
    oGain.gain.setValueAtTime(0.2, startTime + 0.15);
    oGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);
    osc.connect(oGain).connect(target);
    osc.start(startTime + 0.15);
    osc.stop(startTime + 0.48);
    return;
  }

  if (sfx === 'pop') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, startTime);
    osc.frequency.exponentialRampToValueAtTime(980, startTime + 0.08);
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.22, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.13);
    osc.connect(gain).connect(target);
    osc.start(startTime);
    osc.stop(startTime + 0.14);
    return;
  }

  if (sfx === 'laugh') {
    const pitches = [420, 480, 450, 510, 460];
    pitches.forEach((freq, idx) => {
      const t = startTime + 0.12 + idx * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 0.1);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(gain).connect(target);
      osc.start(t);
      osc.stop(t + 0.12);
    });
    return;
  }

  if (sfx === 'gasp') {
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(140, startTime);
    sub.frequency.exponentialRampToValueAtTime(42, startTime + 0.35);
    subGain.gain.setValueAtTime(0.32, startTime);
    subGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.38);
    sub.connect(subGain).connect(target);
    sub.start(startTime);
    sub.stop(startTime + 0.4);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, startTime + 0.05);
    osc.frequency.exponentialRampToValueAtTime(920, startTime + 0.24);
    gain.gain.setValueAtTime(0.001, startTime + 0.05);
    gain.gain.linearRampToValueAtTime(0.14, startTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
    osc.connect(gain).connect(target);
    osc.start(startTime + 0.05);
    osc.stop(startTime + 0.32);
    return;
  }

  if (sfx === 'thunder') {
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 2.0);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, startTime);
    filter.frequency.exponentialRampToValueAtTime(75, startTime + 1.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.32, startTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.6);
    noise.connect(filter).connect(gain).connect(target);
    noise.start(startTime);
    noise.stop(startTime + 1.65);
    return;
  }

  if (sfx === 'pour') {
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 1.4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, startTime);
    filter.frequency.linearRampToValueAtTime(1900, startTime + 1.1);
    filter.Q.value = 3.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.18, startTime + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.2);
    noise.connect(filter).connect(gain).connect(target);
    noise.start(startTime);
    noise.stop(startTime + 1.25);
    return;
  }

  if (sfx === 'punchline') {
    [0, 0.14].forEach((offset, idx) => {
      const t = startTime + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(idx === 0 ? 190 : 140, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain).connect(target);
      osc.start(t);
      osc.stop(t + 0.13);
    });
    const cymbal = ctx.createBufferSource();
    cymbal.buffer = createNoiseBuffer(ctx, 0.6);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3800;
    const cGain = ctx.createGain();
    cGain.gain.setValueAtTime(0.18, startTime + 0.3);
    cGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.72);
    cymbal.connect(hp).connect(cGain).connect(target);
    cymbal.start(startTime + 0.3);
    cymbal.stop(startTime + 0.75);
    return;
  }

  if (sfx === 'sad_trombone') {
    const notes = [311.13, 293.66, 277.18, 261.63];
    notes.forEach((freq, idx) => {
      const t = startTime + idx * 0.28;
      const dur = idx === 3 ? 0.62 : 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      if (idx === 3) {
        osc.frequency.linearRampToValueAtTime(freq * 0.88, t + dur);
      }
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(lp).connect(gain).connect(target);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  }
}

function scheduleBackgroundMusic(
  ctx: AudioContext,
  musicTarget: GainNode,
  style: VideoMusicStyle,
  totalSec: number,
  startOffsetSec: number
) {
  if (style === 'none') return;

  if (style === 'cinematic_parody') {
    // 100% original copyright-free heroic bass pulse + tension strings pattern
    const tempo = 0.36;
    const bassNotes = [98.0, 98.0, 116.54, 98.0, 130.81, 116.54, 98.0, 87.31];
    const baseTime = ctx.currentTime + 0.05;
    const remaining = Math.max(0, totalSec - startOffsetSec);
    const steps = Math.floor(remaining / tempo);
    for (let i = 0; i < steps; i++) {
      const absTime = startOffsetSec + i * tempo;
      const t = baseTime + (absTime - startOffsetSec);
      const freq = bassNotes[i % bassNotes.length];
      const osc = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + tempo * 0.82);
      osc.connect(lp).connect(gain).connect(musicTarget);
      osc.start(t);
      osc.stop(t + tempo * 0.88);
    }
    return;
  }

  if (style === 'folk') {
    // 100% original copyright-free Bengali rural folk Dotara pluck + soft Bansuri pentatonic melody
    const tempo = 0.29;
    const dotaraNotes = [261.63, 293.66, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66];
    const bansuriNotes = [523.25, 0, 587.33, 659.25, 0, 783.99, 659.25, 587.33];
    const baseTime = ctx.currentTime + 0.05;
    const remaining = Math.max(0, totalSec - startOffsetSec);
    const steps = Math.floor(remaining / tempo);

    for (let i = 0; i < steps; i++) {
      const absTime = startOffsetSec + i * tempo;
      const t = baseTime + (absTime - startOffsetSec);
      const dFreq = dotaraNotes[i % dotaraNotes.length];

      const pluck = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1150;
      const pGain = ctx.createGain();
      pluck.type = 'triangle';
      pluck.frequency.setValueAtTime(dFreq, t);
      pGain.gain.setValueAtTime(0.001, t);
      pGain.gain.linearRampToValueAtTime(0.085, t + 0.014);
      pGain.gain.exponentialRampToValueAtTime(0.001, t + tempo * 0.72);
      pluck.connect(lp).connect(pGain).connect(musicTarget);
      pluck.start(t);
      pluck.stop(t + tempo * 0.78);

      const bFreq = bansuriNotes[i % bansuriNotes.length];
      if (bFreq > 0 && i % 2 === 0) {
        const flute = ctx.createOscillator();
        const fGain = ctx.createGain();
        flute.type = 'sine';
        flute.frequency.setValueAtTime(bFreq, t);
        flute.frequency.linearRampToValueAtTime(bFreq * 1.01, t + tempo * 0.9);
        fGain.gain.setValueAtTime(0.001, t);
        fGain.gain.linearRampToValueAtTime(0.04, t + 0.08);
        fGain.gain.exponentialRampToValueAtTime(0.001, t + tempo * 1.65);
        flute.connect(fGain).connect(musicTarget);
        flute.start(t);
        flute.stop(t + tempo * 1.75);
      }
    }
    return;
  }

  const tempo = style === 'dramatic' ? 0.34 : style === 'quirky' ? 0.25 : 0.28;
  const scales: Record<'comedy' | 'quirky' | 'dramatic', number[]> = {
    comedy: [261.63, 329.63, 392.0, 329.63, 293.66, 349.23, 392.0, 440.0],
    quirky: [293.66, 349.23, 440.0, 415.3, 349.23, 392.0, 493.88, 349.23],
    dramatic: [196.0, 233.08, 261.63, 233.08, 196.0, 185.0, 196.0, 146.83],
  };

  const notes = scales[style];
  const baseTime = ctx.currentTime + 0.05;
  const remaining = Math.max(0, totalSec - startOffsetSec);
  const steps = Math.floor(remaining / tempo);

  for (let i = 0; i < steps; i++) {
    const absTime = startOffsetSec + i * tempo;
    const t = baseTime + (absTime - startOffsetSec);
    const freq = notes[i % notes.length];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = style === 'dramatic' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.055, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + tempo * 0.78);
    osc.connect(gain).connect(musicTarget);
    osc.start(t);
    osc.stop(t + tempo * 0.85);
  }
}

async function decodeAudioDataUrl(
  ctx: AudioContext,
  urlOrDataUrl: string,
  backupDataUrl?: string
): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(urlOrDataUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.arrayBuffer();
    return await ctx.decodeAudioData(arr);
  } catch {
    if (backupDataUrl && backupDataUrl !== urlOrDataUrl) {
      try {
        const res2 = await fetch(backupDataUrl);
        const arr2 = await res2.arrayBuffer();
        return await ctx.decodeAudioData(arr2);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function startVideoAudioSession(
  script: VideoScript,
  startOffsetSec = 0,
  muteSpeaker = false
): Promise<AudioSession> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }

  const dest = ctx.createMediaStreamDestination();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 12;
  compressor.ratio.value = 4.5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.14;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 1.0;
  compressor.connect(masterGain);
  masterGain.connect(dest);

  if (!muteSpeaker) {
    masterGain.connect(ctx.destination);
  }

  const musicGain = ctx.createGain();
  musicGain.gain.value = 0.36;
  musicGain.connect(compressor);

  const sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.88;
  sfxGain.connect(compressor);

  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 1.65;
  voiceGain.connect(compressor);

  const totalSec = script.scenes.reduce((acc, s) => acc + Math.max(1.5, s.durationSec), 0);
  const baseTime = ctx.currentTime + 0.05;

  const customBgmSrc = resolveAssetUrlWithBackup(script.customBgmUrl, script.customBgmAssetId);
  let playedCustomBgm = false;
  if (customBgmSrc && script.musicStyle !== 'none') {
    const bgmBackup = getAudioBackupDataUrl(script.customBgmUrl, script.customBgmAssetId);
    const bgmBuf = await decodeAudioDataUrl(ctx, customBgmSrc, bgmBackup);
    if (bgmBuf && bgmBuf.duration > 0.2) {
      const remaining = Math.max(0.2, totalSec - startOffsetSec);
      const bgmSrcNode = ctx.createBufferSource();
      bgmSrcNode.buffer = bgmBuf;
      bgmSrcNode.loop = true;
      bgmSrcNode.connect(musicGain);
      const loopOffset = startOffsetSec % bgmBuf.duration;
      bgmSrcNode.start(baseTime, loopOffset, remaining);
      playedCustomBgm = true;
    }
  }

  if (!playedCustomBgm) {
    scheduleBackgroundMusic(ctx, musicGain, script.musicStyle, totalSec, startOffsetSec);
  }

  let cursor = 0;

  const duckWindows: Array<{ start: number; end: number }> = [];

  for (let sIdx = 0; sIdx < script.scenes.length; sIdx++) {
    const sc = script.scenes[sIdx];
    const sceneStart = cursor;
    const sceneDur = Math.max(1.5, sc.durationSec);
    cursor += sceneDur;

    if (sceneStart + 0.4 >= startOffsetSec) {
      const when = baseTime + Math.max(0, sceneStart - startOffsetSec + 0.08);
      triggerSfx(ctx, sfxGain, sc.sfx, when);
    }

    if (Array.isArray(sc.sfxCues)) {
      for (const cue of sc.sfxCues) {
        const tNorm = Math.max(0, Math.min(1, Number(cue.t) || 0));
        const absCueTime = sceneStart + tNorm * sceneDur;
        if (absCueTime + 0.25 >= startOffsetSec && cue.sfx && cue.sfx !== 'none') {
          const when = baseTime + Math.max(0, absCueTime - startOffsetSec);
          triggerSfx(ctx, sfxGain, cue.sfx, when);
        }
      }
    }

    for (let cIdx = 0; cIdx < sc.characters.length; cIdx++) {
      const ch = sc.characters[cIdx];
      const customCharAudio =
        ch.customAudioDataUrl ||
        resolveAssetUrlWithBackup(ch.customAudioUrl, ch.customAudioAssetId);
      if (customCharAudio) {
        const backup = getAudioBackupDataUrl(ch.customAudioUrl, ch.customAudioAssetId);
        const buf = await decodeAudioDataUrl(ctx, customCharAudio, backup);
        if (buf) {
          const offsetInScene = cIdx === 0 ? 0.2 : Math.min(sceneDur * 0.45, 2.0);
          const absStart = sceneStart + offsetInScene;
          if (absStart + buf.duration > startOffsetSec) {
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(voiceGain);
            const delay = Math.max(0, absStart - startOffsetSec);
            const trimStart = Math.max(0, startOffsetSec - absStart);
            const maxPlay = Math.max(0.2, sceneDur - offsetInScene + 0.35);
            src.start(baseTime + delay, trimStart, Math.min(buf.duration - trimStart, maxPlay));
            duckWindows.push({
              start: baseTime + delay,
              end: baseTime + delay + Math.max(0.2, Math.min(buf.duration - trimStart, maxPlay)),
            });
          }
        }
      }
    }
  }

  const clips: VideoVoiceClip[] = Array.isArray(script.voiceClips) ? script.voiceClips : [];
  if (clips.length > 0) {
    const sceneOffsets: number[] = [];
    let acc = 0;
    for (const sc of script.scenes) {
      sceneOffsets.push(acc);
      acc += Math.max(1.5, sc.durationSec);
    }

    for (const clip of clips) {
      const sc = script.scenes[clip.sceneIndex];
      const ch = sc?.characters?.[clip.charIndex];
      if (ch?.customAudioDataUrl || ch?.customAudioUrl || ch?.customAudioAssetId) continue;

      const sStart = sceneOffsets[clip.sceneIndex] ?? 0;
      const absStart = sStart + (clip.offsetInSceneSec ?? 0.2);
      const buf = await decodeAudioDataUrl(ctx, clip.audioDataUrl);
      if (!buf) continue;

      if (absStart + buf.duration > startOffsetSec) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(voiceGain);
        const delay = Math.max(0, absStart - startOffsetSec);
        const trimStart = Math.max(0, startOffsetSec - absStart);
        src.start(baseTime + delay, trimStart);
        duckWindows.push({
          start: baseTime + delay,
          end: baseTime + delay + Math.max(0.2, buf.duration - trimStart),
        });
      }
    }
  }

  // Auto-duck background music whenever someone is speaking or shouting
  for (const w of duckWindows) {
    const t0 = Math.max(ctx.currentTime, w.start - 0.08);
    const t1 = Math.max(t0 + 0.05, w.end + 0.12);
    musicGain.gain.setValueAtTime(0.36, t0);
    musicGain.gain.linearRampToValueAtTime(0.09, t0 + 0.08);
    musicGain.gain.setValueAtTime(0.09, t1);
    musicGain.gain.linearRampToValueAtTime(0.36, t1 + 0.18);
  }

  let stopped = false;
  return {
    stream: dest.stream,
    stop: () => {
      if (stopped) return;
      stopped = true;
      ctx.close().catch(() => {});
    },
  };
}
