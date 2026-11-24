import type { VideoMusicStyle, VideoScript, VideoSfx, VideoTheme } from '../types/comic';

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
    // Soft pink-ish filtering
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
    osc.frequency.setValueAtTime(320, startTime);
    osc.frequency.exponentialRampToValueAtTime(920, startTime + 0.08);
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.24, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
    osc.connect(gain).connect(target);
    osc.start(startTime);
    osc.stop(startTime + 0.13);
    return;
  }

  if (sfx === 'laugh') {
    // Playful comic "Ha-ha-ha-ha!" staccato bursts
    const pitches = [440, 490, 460, 520, 480];
    pitches.forEach((freq, idx) => {
      const t = startTime + 0.18 + idx * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 0.11);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain).connect(target);
      osc.start(t);
      osc.stop(t + 0.13);
    });
    return;
  }

  if (sfx === 'gasp') {
    // Cartoon upward slide whistle + shock hit
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, startTime + 0.05);
    osc.frequency.exponentialRampToValueAtTime(1180, startTime + 0.36);
    gain.gain.setValueAtTime(0.001, startTime + 0.05);
    gain.gain.linearRampToValueAtTime(0.24, startTime + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.42);
    osc.connect(gain).connect(target);
    osc.start(startTime + 0.05);
    osc.stop(startTime + 0.44);
    return;
  }

  if (sfx === 'thunder') {
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 1.8);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, startTime + 0.1);
    filter.frequency.exponentialRampToValueAtTime(95, startTime + 1.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, startTime + 0.1);
    gain.gain.linearRampToValueAtTime(0.45, startTime + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.65);
    noise.connect(filter).connect(gain).connect(target);
    noise.start(startTime + 0.1);
    noise.stop(startTime + 1.7);
    return;
  }

  if (sfx === 'pour') {
    // Bubbly water glugs + surprise pop
    for (let i = 0; i < 8; i++) {
      const t = startTime + 0.15 + i * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const base = 360 + (i % 3) * 110 + i * 25;
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 1.55, t + 0.09);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain).connect(target);
      osc.start(t);
      osc.stop(t + 0.11);
    }
    return;
  }

  if (sfx === 'punchline') {
    // Classic comedic ba-dum-tss + boing
    const hitTimes = [0.1, 0.28, 0.48];
    const hitFreqs = [180, 220, 660];
    hitTimes.forEach((offset, idx) => {
      const t = startTime + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 2 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(hitFreqs[idx], t);
      osc.frequency.exponentialRampToValueAtTime(
        idx === 2 ? 980 : 90,
        t + (idx === 2 ? 0.28 : 0.14)
      );
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain).connect(target);
      osc.start(t);
      osc.stop(t + 0.32);
    });
    return;
  }

  if (sfx === 'sad_trombone') {
    // Wah-wah-wah-waaaah
    const notes = [
      { f1: 311, f2: 293, dur: 0.28, at: 0.15 },
      { f1: 293, f2: 277, dur: 0.28, at: 0.48 },
      { f1: 277, f2: 261, dur: 0.28, at: 0.81 },
      { f1: 261, f2: 205, dur: 0.85, at: 1.14 },
    ];
    notes.forEach((n) => {
      const t = startTime + n.at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, t);
      osc.frequency.setValueAtTime(n.f1, t);
      osc.frequency.linearRampToValueAtTime(n.f2, t + n.dur);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur);
      osc.connect(filter).connect(gain).connect(target);
      osc.start(t);
      osc.stop(t + n.dur + 0.02);
    });
  }
}

function scheduleBackgroundMusic(
  ctx: AudioContext,
  target: AudioNode,
  musicStyle: VideoMusicStyle,
  themesPresent: VideoTheme[],
  totalDurationSec: number,
  startTime: number
) {
  // Subtle ambient rain hiss if rain_storm is in any scene
  if (themesPresent.includes('rain_storm')) {
    const rain = ctx.createBufferSource();
    rain.buffer = createNoiseBuffer(ctx, 2);
    rain.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, startTime);
    bp.Q.setValueAtTime(0.8, startTime);
    const rainGain = ctx.createGain();
    rainGain.gain.setValueAtTime(0.06, startTime);
    rain.connect(bp).connect(rainGain).connect(target);
    rain.start(startTime);
    rain.stop(startTime + Math.min(totalDurationSec, 4.5));
  }

  if (musicStyle === 'none') return;

  const patterns: Record<Exclude<VideoMusicStyle, 'none'>, number[]> = {
    comedy: [261.6, 329.6, 392.0, 329.6, 293.7, 349.2, 440.0, 392.0],
    quirky: [329.6, 392.0, 311.1, 392.0, 293.7, 349.2, 329.6, 261.6],
    dramatic: [220.0, 220.0, 261.6, 246.9, 220.0, 196.0, 220.0, 174.6],
  };

  const notes = patterns[musicStyle];
  const stepSec = musicStyle === 'dramatic' ? 0.42 : 0.3;
  const steps = Math.floor(totalDurationSec / stepSec);

  for (let i = 0; i < steps; i++) {
    const t = startTime + i * stepSec;
    const freq = notes[i % notes.length];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = musicStyle === 'dramatic' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.085, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + stepSec * 0.85);
    osc.connect(gain).connect(target);
    osc.start(t);
    osc.stop(t + stepSec * 0.9);
  }
}

export function startVideoAudioSession(
  script: VideoScript,
  options: {
    outputToSpeakers: boolean;
    outputToStream: boolean;
    startOffsetSec?: number;
  }
): AudioSession {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.85, ctx.currentTime);

  const dest = ctx.createMediaStreamDestination();
  if (options.outputToSpeakers) {
    master.connect(ctx.destination);
  }
  if (options.outputToStream) {
    master.connect(dest);
  }

  const startOffset = options.startOffsetSec ?? 0;
  const baseTime = ctx.currentTime + 0.04;
  const remaining = Math.max(0.5, script.totalDurationSec - startOffset);

  const themes = script.scenes.map((s) => s.theme);
  scheduleBackgroundMusic(
    ctx,
    master,
    script.musicStyle,
    themes,
    remaining,
    baseTime
  );

  let cursor = 0;
  for (const scene of script.scenes) {
    const sceneEnd = cursor + scene.durationSec;
    if (sceneEnd > startOffset) {
      const relStart = Math.max(0, cursor - startOffset);
      triggerSfx(ctx, master, scene.sfx, baseTime + relStart);
    }
    cursor = sceneEnd;
  }

  return {
    stream: dest.stream,
    stop: () => {
      try {
        master.disconnect();
        if (ctx.state !== 'closed') {
          void ctx.close();
        }
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}
