import type { VideoMusicStyle, VideoScript, VideoSfx, VideoVoiceClip } from '../types/comic';

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

function triggerSfx(
  ctx: AudioContext,
  target: AudioNode,
  sfx: VideoSfx,
  startTime: number
) {
  if (sfx === 'none') return;

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
    // Dramatic Vine-style shock sting + gasp
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
    // Rimshot Ba-dum-tss!
    const hits = [0, 0.14];
    hits.forEach((offset, idx) => {
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

  const tempo = style === 'dramatic' ? 0.34 : style === 'quirky' ? 0.25 : 0.28;
  const scales: Record<Exclude<VideoMusicStyle, 'none'>, number[]> = {
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
    gain.gain.linearRampToValueAtTime(0.06, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + tempo * 0.78);
    osc.connect(gain).connect(musicTarget);
    osc.start(t);
    osc.stop(t + tempo * 0.85);
  }
}

async function decodeVoiceBuffer(
  ctx: AudioContext,
  dataUrl: string
): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(dataUrl);
    const arr = await res.arrayBuffer();
    return await ctx.decodeAudioData(arr);
  } catch {
    return null;
  }
}

export function startVideoAudioSession(
  script: VideoScript,
  options?: {
    outputToSpeakers?: boolean;
    outputToStream?: boolean;
    startOffsetSec?: number;
  }
): AudioSession {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const master = ctx.createGain();
  master.gain.value = 0.95;

  const musicBus = ctx.createGain();
  musicBus.gain.value = 0.55;
  musicBus.connect(master);

  const sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.65;
  sfxBus.connect(master);

  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 1.0;
  voiceBus.connect(master);

  const dest = ctx.createMediaStreamDestination();
  if (options?.outputToSpeakers !== false) {
    master.connect(ctx.destination);
  }
  if (options?.outputToStream) {
    master.connect(dest);
  }

  const startOffsetSec = options?.startOffsetSec ?? 0;
  const baseTime = ctx.currentTime + 0.05;

  // Schedule background music (automatically ducked when voices play)
  scheduleBackgroundMusic(ctx, musicBus, script.musicStyle, script.totalDurationSec, startOffsetSec);

  // Build scene start timestamps
  const sceneStarts: number[] = [];
  let cursor = 0;
  for (const scene of script.scenes) {
    sceneStarts.push(cursor);
    const sceneEnd = cursor + scene.durationSec;
    if (sceneEnd > startOffsetSec) {
      const sfxAt = Math.max(startOffsetSec, cursor + 0.08);
      const when = baseTime + (sfxAt - startOffsetSec);
      if (cursor >= startOffsetSec - 0.3) {
        triggerSfx(ctx, sfxBus, scene.sfx, when);
      }
    }
    cursor = sceneEnd;
  }

  // Schedule synthesized AI voiceover clips & duck BGM while talking
  let stopped = false;
  const voiceClips: VideoVoiceClip[] = script.voiceClips || [];

  if (voiceClips.length > 0) {
    voiceClips.forEach((clip) => {
      const sceneStart = sceneStarts[clip.sceneIndex] ?? 0;
      const absStart = sceneStart + clip.offsetInSceneSec;
      const absEnd = absStart + clip.durationSec;
      if (absEnd <= startOffsetSec) return;

      // Duck music bus smoothly around speech
      const duckStart = baseTime + Math.max(0, absStart - startOffsetSec);
      const duckEnd = baseTime + Math.max(0.05, absEnd - startOffsetSec);
      musicBus.gain.setTargetAtTime(0.22, duckStart, 0.05);
      musicBus.gain.setTargetAtTime(0.58, duckEnd, 0.08);

      decodeVoiceBuffer(ctx, clip.audioDataUrl).then((audioBuffer) => {
        if (stopped || !audioBuffer || ctx.state === 'closed') return;
        const src = ctx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(voiceBus);

        if (absStart >= startOffsetSec) {
          src.start(baseTime + (absStart - startOffsetSec));
        } else {
          const skipOffset = startOffsetSec - absStart;
          if (skipOffset < audioBuffer.duration) {
            src.start(baseTime, skipOffset);
          }
        }
      });
    });
  }

  return {
    stream: dest.stream,
    stop: () => {
      stopped = true;
      try {
        master.disconnect();
        if (ctx.state !== 'closed') {
          ctx.close().catch(() => {});
        }
      } catch {
        // Ignore teardown errors
      }
    },
  };
}
