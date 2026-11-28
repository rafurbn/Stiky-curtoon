import type {
  BrandingConfig,
  CharacterId,
  VideoAction,
  VideoAspectRatio,
  VideoCharacterState,
  VideoProp,
  VideoScene,
  VideoScript,
  VideoTheme,
} from '../types/comic';
import { startVideoAudioSession } from './videoAudioEngine';
import {
  prepareLipSyncForScript,
  sampleCharacterLipSync,
  type LipSyncSample,
} from './lipSyncAnalyzer';
import {
  drawAnimatedMouth,
  drawArticulatedRigCharacter,
  drawSceneVisualEffects,
  drawSpriteSheetActor,
  interpolateCharacterKeyframes,
} from './keyframeRigRenderer';
import {
  BUILTIN_HYBRID_ASSETS,
  findAssetByIdOrTheme,
  getLoadedImageSync,
  getLoadedInlineSvgSync,
  loadImageFromUrl,
  preloadScriptAssets,
  refreshAssetCatalog,
  resolveSpriteAssetForCharacter,
} from './hybridSpriteCatalog';

export interface RenderedVideoResult {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
  durationSec: number;
}

export function getVideoDimensions(aspectRatio: VideoAspectRatio): {
  width: number;
  height: number;
} {
  if (aspectRatio === '1:1') {
    return { width: 720, height: 720 };
  }
  return { width: 720, height: 1280 };
}

export async function preloadThemeBackgrounds(): Promise<void> {
  await refreshAssetCatalog();
  await Promise.all(BUILTIN_HYBRID_ASSETS.map((a) => loadImageFromUrl(a.url)));
}

function easeInOutCubic(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function getSceneAtTime(
  script: VideoScript,
  elapsedSec: number
): {
  scene: VideoScene;
  sceneIndex: number;
  localT: number;
  totalDurationSec: number;
} {
  const scenes = script.scenes.length > 0 ? script.scenes : [];
  const totalDurationSec = scenes.reduce(
    (sum, s) => sum + Math.max(1.5, s.durationSec),
    0
  );
  if (scenes.length === 0) {
    return {
      scene: {
        sceneIndex: 0,
        durationSec: 4,
        theme: 'room_door',
        camera: 'wide',
        sfx: 'none',
        characters: [],
      },
      sceneIndex: 0,
      localT: 0,
      totalDurationSec: 4,
    };
  }

  const clamped = Math.max(0, Math.min(elapsedSec, Math.max(0.01, totalDurationSec - 0.001)));
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) {
    const dur = Math.max(1.5, scenes[i].durationSec);
    if (clamped < acc + dur || i === scenes.length - 1) {
      return {
        scene: scenes[i],
        sceneIndex: i,
        localT: clamped - acc,
        totalDurationSec,
      };
    }
    acc += dur;
  }

  return {
    scene: scenes[0],
    sceneIndex: 0,
    localT: 0,
    totalDurationSec,
  };
}

function getActiveSpeakerInScene(
  script: VideoScript,
  sceneIndex: number,
  localT: number,
  scene: VideoScene
): { charIndex: number; speech: string } | null {
  const clips = Array.isArray(script.voiceClips)
    ? script.voiceClips.filter((c) => c.sceneIndex === sceneIndex)
    : [];

  if (clips.length > 0) {
    for (const clip of clips) {
      const start = clip.offsetInSceneSec ?? 0.2;
      const end = start + Math.max(0.8, clip.durationSec);
      if (localT >= start && localT <= end + 0.15) {
        return { charIndex: clip.charIndex, speech: clip.text };
      }
    }
    // Outside active clip window, check if near any clip
    const first = clips[0];
    if (localT < (first.offsetInSceneSec ?? 0.2)) {
      return { charIndex: first.charIndex, speech: first.text };
    }
    const last = clips[clips.length - 1];
    return { charIndex: last.charIndex, speech: last.text };
  }

  const speakingChars = scene.characters
    .map((c, idx) => ({ idx, speech: (c.speech || '').trim() }))
    .filter((x) => x.speech.length > 0);

  if (speakingChars.length === 0) return null;
  if (speakingChars.length === 1) {
    return { charIndex: speakingChars[0].idx, speech: speakingChars[0].speech };
  }

  const half = Math.max(1.5, scene.durationSec) / speakingChars.length;
  const slot = Math.min(speakingChars.length - 1, Math.floor(localT / half));
  return {
    charIndex: speakingChars[slot].idx,
    speech: speakingChars[slot].speech,
  };
}

/* ============================================================================
 * 1. STICK-FIGURE MEME RENDERER (White Background + Black Ink + Viral Meme Expressions)
 * ========================================================================== */

function drawStickRoomBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: VideoTheme,
  splitScreen: boolean,
  groundY: number
) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);

  // Subtle paper texture specks
  ctx.fillStyle = 'rgba(15, 23, 42, 0.025)';
  for (let i = 0; i < 65; i++) {
    const px = ((i * 197) % w);
    const py = ((i * 313) % h);
    ctx.fillRect(px, py, 2, 2);
  }

  ctx.save();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (splitScreen) {
    // Vertical crisp divider for split-screen dual rooms
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w / 2, 180);
    ctx.lineTo(w / 2, h - 140);
    ctx.stroke();

    // Left room floor & corner
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(20, groundY);
    ctx.lineTo(w / 2 - 14, groundY);
    ctx.moveTo(w / 2 + 14, groundY);
    ctx.lineTo(w - 20, groundY);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Minimalist room perspective walls
  if (theme === 'bathroom_rush') {
    const boxLeft = w * 0.16;
    const boxRight = w * 0.84;
    const boxTop = h * 0.22;
    const boxBottom = groundY - 35;

    ctx.lineWidth = 2.5;
    ctx.strokeRect(boxLeft, boxTop, boxRight - boxLeft, boxBottom - boxTop);

    // Corner ceiling perspective lines
    ctx.beginPath();
    ctx.moveTo(0, h * 0.08);
    ctx.lineTo(boxLeft, boxTop);
    ctx.moveTo(w, h * 0.08);
    ctx.lineTo(boxRight, boxTop);
    ctx.stroke();

    // Raised tile platform
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(boxLeft + 6, boxBottom - 26, boxRight - boxLeft - 12, 34);
    ctx.strokeRect(boxLeft + 6, boxBottom - 26, boxRight - boxLeft - 12, 34);

    // Wall tap on left wall
    const tapX = boxLeft + 46;
    const tapY = boxBottom - 165;
    ctx.beginPath();
    ctx.moveTo(tapX - 24, tapY);
    ctx.lineTo(tapX + 8, tapY);
    ctx.arc(tapX + 8, tapY + 12, 12, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tapX - 8, tapY - 12, 7, 0, Math.PI * 2);
    ctx.stroke();
  } else if (theme === 'room_door') {
    // Hallway wall and floor perspective
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, groundY - 260);
    ctx.lineTo(w * 0.24, groundY - 340);
    ctx.lineTo(w, groundY - 340);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, groundY + 30);
    ctx.lineTo(w * 0.24, groundY - 30);
    ctx.lineTo(w, groundY - 30);
    ctx.stroke();
  } else {
    // Clean minimalist horizon ground line
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(28, groundY);
    ctx.lineTo(w - 28, groundY);
    ctx.stroke();
  }

  ctx.restore();
}

function drawStickProp(
  ctx: CanvasRenderingContext2D,
  prop: VideoProp,
  x: number,
  groundY: number,
  t: number,
  isKnocking: boolean
) {
  if (prop === 'none') return;
  ctx.save();
  ctx.strokeStyle = '#111827';
  ctx.fillStyle = '#FFFFFF';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (prop === 'door_closed') {
    const shake = isKnocking ? Math.sin(t * 48) * 3 : 0;
    const dw = 185;
    const dh = 410;
    const dx = x - dw / 2 + shake;
    const dy = groundY - dh;

    ctx.lineWidth = 4;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeRect(dx, dy, dw, dh);

    // Door handle
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(dx + dw - 30, dy + dh * 0.52, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(dx + dw - 30, dy + dh * 0.52);
    ctx.lineTo(dx + dw - 46, dy + dh * 0.52);
    ctx.stroke();

    // Knock vibration lines when knocking
    if (isKnocking) {
      ctx.lineWidth = 2.5;
      const pulse = Math.abs(Math.sin(t * 14));
      if (pulse > 0.35) {
        const kx = dx + 38;
        const ky = dy + dh * 0.38;
        for (let a = -1; a <= 1; a++) {
          ctx.beginPath();
          ctx.moveTo(kx + 18, ky + a * 16);
          ctx.lineTo(kx + 38, ky + a * 26);
          ctx.stroke();
        }
      }
    }
  } else if (prop === 'door_open') {
    const dw = 175;
    const dh = 390;
    const frameX = x - dw / 2;
    const frameY = groundY - dh;

    // Doorway black/white frame
    ctx.lineWidth = 3.5;
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(frameX, frameY, dw, dh);
    ctx.strokeRect(frameX, frameY, dw, dh);

    // Swung-open door panel angled left
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(frameX, frameY);
    ctx.lineTo(frameX - 115, frameY + 26);
    ctx.lineTo(frameX - 115, frameY + dh + 22);
    ctx.lineTo(frameX, frameY + dh);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Handle on swung door
    ctx.beginPath();
    ctx.arc(frameX - 92, frameY + dh * 0.53, 8, 0, Math.PI * 2);
    ctx.stroke();
  } else if (prop === 'toilet_squat') {
    ctx.lineWidth = 3.5;
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(ctx, x - 58, groundY - 38, 116, 36, 12);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, groundY - 22, 34, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (prop === 'splat_mess') {
    // Classic comic black ink splat around floor
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.ellipse(x - 18, groundY - 4, 48, 13, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 62, groundY - 12, 8, 0, Math.PI * 2);
    ctx.arc(x + 36, groundY - 9, 6, 0, Math.PI * 2);
    ctx.arc(x - 42, groundY - 24, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop === 'tea_cup') {
    ctx.lineWidth = 3;
    ctx.fillRect(x - 16, groundY - 118, 30, 26);
    ctx.strokeRect(x - 16, groundY - 118, 30, 26);
    ctx.beginPath();
    ctx.arc(x + 14, groundY - 105, 8, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  } else if (prop === 'smartphone') {
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, x - 14, groundY - 145, 28, 46, 5);
    ctx.fill();
    ctx.stroke();
  } else if (prop === 'money') {
    ctx.lineWidth = 3;
    ctx.fillRect(x - 24, groundY - 135, 48, 26);
    ctx.strokeRect(x - 24, groundY - 135, 48, 26);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('৳', x, groundY - 122);
  } else if (prop === 'clock') {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, groundY - 190, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, groundY - 190);
    ctx.lineTo(x, groundY - 208);
    ctx.moveTo(x, groundY - 190);
    ctx.lineTo(x + 14, groundY - 190);
    ctx.stroke();
  }

  ctx.restore();
}


function drawStickMemeCharacter(
  ctx: CanvasRenderingContext2D,
  char: VideoCharacterState,
  baseX: number,
  groundY: number,
  facing: 1 | -1,
  globalT: number,
  localT: number,
  sceneDur: number,
  lip: LipSyncSample,
  scale = 1
) {
  ctx.save();
  ctx.strokeStyle = '#111827';
  ctx.fillStyle = '#FFFFFF';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const action = char.action;

  // Dramatic close-up fills center with intense face + speed lines
  if (action === 'dramatic_closeup') {
    const cx = baseX;
    const cy = groundY - 250;

    // Radial black ink speed-lines
    ctx.save();
    ctx.strokeStyle = 'rgba(17, 24, 39, 0.22)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2 + Math.sin(globalT * 6) * 0.04;
      const r1 = 175 + ((i * 23) % 35);
      const r2 = 460;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      ctx.stroke();
    }
    ctx.restore();

    // Big shoulders + stick neck with subtle speech-loudness shake
    const isAudible = lip.openness > 0.12;
    const shakeX = isAudible ? Math.sin(globalT * 32) * (2 + lip.openness * 4) : 0;
    const shakeY = lip.viseme === 'wide_shout' ? Math.cos(globalT * 26) * 2.5 : 0;
    ctx.translate(cx + shakeX, cy + shakeY);
    ctx.lineWidth = 5;

    ctx.beginPath();
    ctx.moveTo(-88, 220);
    ctx.quadraticCurveTo(-78, 120, -14, 108);
    ctx.lineTo(14, 108);
    ctx.quadraticCurveTo(78, 120, 88, 220);
    ctx.stroke();

    // Big intense bald head
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(0, 0, 96, 112, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ears
    ctx.beginPath();
    ctx.arc(-96, 8, 16, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(96, 8, 16, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.stroke();

    // Angry furrowed eyebrows reacting to shout loudness
    const browDip = lip.openness * 6;
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(-64, -44 - browDip * 0.4);
    ctx.lineTo(-16, -24 + browDip);
    ctx.moveTo(64, -44 - browDip * 0.4);
    ctx.lineTo(16, -24 + browDip);
    ctx.stroke();

    // Intense glare eyes
    ctx.lineWidth = 4;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(-38, -14, 24, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(38, -14, 24, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(-34, -13, 6.5, 0, Math.PI * 2);
    ctx.arc(34, -13, 6.5, 0, Math.PI * 2);
    ctx.fill();

    // Nose wrinkle lines
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, 16);
    ctx.quadraticCurveTo(0, 6, 8, 16);
    ctx.stroke();

    // Audio-reactive dramatic shouting mouth
    drawAnimatedMouth(ctx, 0, 56, lip, 'angry', 36, 44);

    ctx.restore();
    return;
  }

  let x = baseX;
  let yOffset = 0;
  let tilt = 0;

  if (action === 'walk_in') {
    const p = easeInOutCubic(Math.min(1, localT / Math.min(1.4, sceneDur * 0.5)));
    x = baseX + facing * -180 * (1 - p);
    yOffset = -Math.abs(Math.sin(localT * 10)) * 10 * (1 - p);
  } else if (action === 'run') {
    const p = Math.min(1, localT / Math.max(0.8, sceneDur));
    x = baseX - facing * p * 160;
    yOffset = -Math.abs(Math.sin(localT * 18)) * 15;
    tilt = -facing * 0.14;
  } else if (action === 'desperate_squeeze') {
    x += Math.sin(globalT * 38) * 3.5;
    yOffset = Math.abs(Math.sin(globalT * 18)) * 5;
    tilt = facing * 0.08;
  } else if (action === 'shocked_jump') {
    const jumpP = Math.sin(Math.min(1, localT * 2.4) * Math.PI);
    yOffset = -jumpP * 60;
  } else if (action === 'laugh' || action === 'point_laugh') {
    yOffset = -Math.abs(Math.sin(globalT * 12)) * 8;
  }

  ctx.translate(x, groundY + yOffset);
  ctx.scale(scale, scale);
  ctx.rotate(tilt);

  // Collapsed sitting on floor pose
  if (action === 'collapsed_mess') {
    ctx.lineWidth = 4.5;
    // Wide bent legs sitting on ground
    ctx.beginPath();
    ctx.moveTo(-16, -24);
    ctx.lineTo(-44, -46);
    ctx.lineTo(-32, -8);
    ctx.moveTo(16, -24);
    ctx.lineTo(44, -46);
    ctx.lineTo(32, -8);
    ctx.stroke();

    // Big oval shoes
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(-34, -6, 16, 8, -0.2, 0, Math.PI * 2);
    ctx.ellipse(34, -6, 16, 8, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Round sitting torso
    ctx.beginPath();
    ctx.ellipse(0, -52, 26, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Flailing/resting stick arms
    ctx.beginPath();
    ctx.moveTo(-22, -64);
    ctx.lineTo(-50, -34);
    ctx.moveTo(22, -64);
    ctx.lineTo(50, -34);
    ctx.stroke();

    // Huge shocked round head
    ctx.beginPath();
    ctx.arc(0, -112, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Giant popping cartoon eyes
    ctx.beginPath();
    ctx.arc(-15, -122, 16, 0, Math.PI * 2);
    ctx.arc(15, -122, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(-13, -122, 4.5, 0, Math.PI * 2);
    ctx.arc(13, -122, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Wide open comical mouth
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(0, -90, 22, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.ellipse(0, -88, 16, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return;
  }

  // Standard stick figure legs & cartoon shoes
  ctx.lineWidth = 4.5;
  const walkSwing =
    action === 'walk_in' || action === 'run'
      ? Math.sin(globalT * 14) * 20
      : 0;

  if (action === 'desperate_squeeze') {
    // Crossed/squeezed knees
    ctx.beginPath();
    ctx.moveTo(-10, -82);
    ctx.lineTo(6, -42);
    ctx.lineTo(-14, -10);
    ctx.moveTo(10, -82);
    ctx.lineTo(-6, -42);
    ctx.lineTo(14, -10);
    ctx.stroke();
  } else if (action === 'scream_jaw' && char.prop === 'toilet_squat') {
    // Squatting pose
    ctx.beginPath();
    ctx.moveTo(-14, -76);
    ctx.lineTo(-48, -56);
    ctx.lineTo(-34, -12);
    ctx.moveTo(14, -76);
    ctx.lineTo(48, -56);
    ctx.lineTo(34, -12);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-12, -88);
    ctx.lineTo(-16 + walkSwing, -10);
    ctx.moveTo(12, -88);
    ctx.lineTo(16 - walkSwing, -10);
    ctx.stroke();
  }

  // Cartoon rounded shoes
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(-18 + walkSwing, -8, 16, 8, 0, 0, Math.PI * 2);
  ctx.ellipse(20 - walkSwing, -8, 16, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Slim white/ink cartoon torso (classic @oianimation style oval stick body)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(0, -128, 22, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Arms based on action
  ctx.beginPath();
  if (action === 'knock_door') {
    const knockBump = Math.abs(Math.sin(globalT * 16)) * 22;
    // Left hand behind back / hip
    ctx.moveTo(-18, -158);
    ctx.lineTo(-36, -120);
    ctx.lineTo(-16, -98);
    // Right fist knocking forward
    ctx.moveTo(18, -158);
    ctx.lineTo(48, -182);
    ctx.lineTo(66 + knockBump, -206);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(68 + knockBump, -208, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (action === 'desperate_squeeze') {
    ctx.moveTo(-18, -156);
    ctx.lineTo(-34, -110);
    ctx.lineTo(-8, -94);
    ctx.moveTo(18, -156);
    ctx.lineTo(34, -110);
    ctx.lineTo(8, -94);
    ctx.stroke();
  } else if (action === 'hands_up' || action === 'shocked_jump') {
    ctx.moveTo(-18, -158);
    ctx.lineTo(-48, -210);
    ctx.moveTo(18, -158);
    ctx.lineTo(48, -210);
    ctx.stroke();
  } else if (action === 'facepalm') {
    ctx.moveTo(-18, -156);
    ctx.lineTo(-40, -116);
    ctx.moveTo(18, -156);
    ctx.lineTo(36, -196);
    ctx.lineTo(14, -226);
    ctx.stroke();
  } else if (action === 'point_laugh') {
    ctx.moveTo(-18, -156);
    ctx.lineTo(-42, -126);
    ctx.moveTo(18, -156);
    ctx.lineTo(68 * facing, -168);
    ctx.stroke();
  } else {
    ctx.moveTo(-18, -156);
    ctx.lineTo(-36, -112);
    ctx.moveTo(18, -156);
    ctx.lineTo(36, -112);
    ctx.stroke();
  }

  // Head! Special audio-reactive elongated jaw for 'scream_jaw'
  if (action === 'scream_jaw') {
    const audioDrop = lip.openness > 0.08 ? lip.openness * 38 : Math.abs(Math.sin(globalT * 18)) * 18;
    const jawDrop = 28 + audioDrop;
    ctx.save();
    ctx.translate(0, -228);

    // Tall screaming head outline
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(-34, -68, 68, 92 + jawDrop, 32);
    ctx.fill();
    ctx.stroke();

    // Popping panicked eyes at very top
    ctx.beginPath();
    ctx.arc(-14, -52, 13, 0, Math.PI * 2);
    ctx.arc(14, -52, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(-12, -52, 4, 0, Math.PI * 2);
    ctx.arc(12, -52, 4, 0, Math.PI * 2);
    ctx.fill();

    // Giant open audio-reactive screaming mouth
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.ellipse(0, -4 + jawDrop * 0.3, 24 * lip.width, 20 + jawDrop * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-16, -22, 32, 7);
    ctx.restore();
    ctx.restore();
    return;
  }

  // Normal expressive meme head
  const headY = -216;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(0, headY, 40, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Ear
  ctx.beginPath();
  ctx.arc(-40 * facing, headY + 4, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Expressive Eyes
  const eyeOffsetX = facing * 6;
  const pop = action === 'eye_pop' || char.expression === 'shocked' ? 1.35 : 1;

  if (char.expression === 'crying' || action === 'desperate_squeeze') {
    // Tightly squeezed shut >< crying eyes + sweat drops
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-20 + eyeOffsetX, headY - 12);
    ctx.lineTo(-8 + eyeOffsetX, headY - 6);
    ctx.lineTo(-20 + eyeOffsetX, headY);
    ctx.moveTo(20 + eyeOffsetX, headY - 12);
    ctx.lineTo(8 + eyeOffsetX, headY - 6);
    ctx.lineTo(20 + eyeOffsetX, headY);
    ctx.stroke();

    // Sweat drop
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    const dropY = headY - 26 + ((globalT * 24) % 14);
    ctx.beginPath();
    ctx.moveTo(32, dropY);
    ctx.quadraticCurveTo(40, dropY + 12, 32, dropY + 14);
    ctx.quadraticCurveTo(24, dropY + 12, 32, dropY);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.lineWidth = 3.5;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-13 + eyeOffsetX, headY - 8, 12 * pop, 0, Math.PI * 2);
    ctx.arc(13 + eyeOffsetX, headY - 8, 12 * pop, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(-11 + eyeOffsetX, headY - 8, 3.8, 0, Math.PI * 2);
    ctx.arc(15 + eyeOffsetX, headY - 8, 3.8, 0, Math.PI * 2);
    ctx.fill();

    // Eyebrows
    ctx.beginPath();
    if (char.expression === 'angry') {
      ctx.moveTo(-26 + eyeOffsetX, headY - 24);
      ctx.lineTo(-4 + eyeOffsetX, headY - 16);
      ctx.moveTo(26 + eyeOffsetX, headY - 24);
      ctx.lineTo(4 + eyeOffsetX, headY - 16);
    } else if (char.expression === 'shocked' || char.expression === 'confused') {
      ctx.moveTo(-22 + eyeOffsetX, headY - 26);
      ctx.lineTo(-4 + eyeOffsetX, headY - 26);
      ctx.moveTo(4 + eyeOffsetX, headY - 22);
      ctx.lineTo(22 + eyeOffsetX, headY - 22);
    }
    ctx.stroke();
  }

  // Audio-reactive multi-viseme mouth + subtle speech bounce
  const talkHeadLift = lip.openness > 0.15 ? -lip.openness * 3.5 : 0;
  drawAnimatedMouth(ctx, eyeOffsetX, headY + 20 + talkHeadLift, lip, char.expression, 15, 19);

  ctx.restore();
}

/* ============================================================================
 * 2. 2D COLORED CARTOON RENDERER (Procedural Vibrant Backdrops + Colored Characters)
 * ========================================================================== */

function drawImageFittedToFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  groundY: number
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw <= 0 || ih <= 0) return;

  // Builtin SVGs are authored with horizon at 72% height; preserve aspect ratio and horizon alignment in 9:16 & 1:1
  if (Math.abs(iw / ih - w / h) < 0.08) {
    ctx.drawImage(img, 0, 0, w, h);
    return;
  }

  const srcHorizon = Math.round(ih * 0.72);
  if (iw / ih < w / h) {
    const scaleX = w / iw;
    const neededSrcAbove = groundY / scaleX;
    const neededSrcBelow = (h - groundY) / scaleX;
    if (neededSrcAbove <= srcHorizon && neededSrcBelow <= ih - srcHorizon) {
      const srcAboveStart = Math.max(0, Math.round(srcHorizon - neededSrcAbove));
      const srcAboveH = srcHorizon - srcAboveStart;
      const srcBelowH = Math.min(ih - srcHorizon, Math.round(neededSrcBelow));
      ctx.drawImage(img, 0, srcAboveStart, iw, srcAboveH, 0, 0, w, groundY);
      ctx.drawImage(img, 0, srcHorizon, iw, srcBelowH, 0, groundY, w, h - groundY);
      return;
    }
  } else {
    const srcW = Math.min(iw, Math.round(ih * (w / h)));
    const srcX = Math.max(0, Math.round((iw - srcW) / 2));
    ctx.drawImage(img, srcX, 0, srcW, srcHorizon, 0, 0, w, groundY);
    ctx.drawImage(img, srcX, srcHorizon, srcW, ih - srcHorizon, 0, groundY, w, h - groundY);
    return;
  }

  ctx.drawImage(img, 0, 0, iw, srcHorizon, 0, 0, w, groundY);
  ctx.drawImage(img, 0, srcHorizon, iw, ih - srcHorizon, 0, groundY, w, h - groundY);
}

function drawHybridBackgroundImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  groundY: number,
  parallaxOffsetPx = 0
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw <= 0 || ih <= 0) return;

  if (Math.abs(parallaxOffsetPx) < 0.5) {
    drawImageFittedToFrame(ctx, img, w, h, groundY);
    return;
  }

  // Seamless alternating mirror-tiled horizontal scroll so any scene/sky/field pans smoothly with zero seams
  const period = w * 2;
  let shift = parallaxOffsetPx % period;
  if (shift < 0) shift += period;

  for (let tileIdx = -2; tileIdx <= 2; tileIdx++) {
    const tileX = tileIdx * w + shift;
    if (tileX + w < -2 || tileX > w + 2) continue;
    const isMirrored = Math.abs(tileIdx) % 2 === 1;
    ctx.save();
    if (isMirrored) {
      ctx.translate(tileX + w, 0);
      ctx.scale(-1, 1);
      drawImageFittedToFrame(ctx, img, w, h, groundY);
    } else {
      ctx.translate(tileX, 0);
      drawImageFittedToFrame(ctx, img, w, h, groundY);
    }
    ctx.restore();
  }
}

function computeSceneParallaxOffsetPx(
  scene: VideoScene,
  localT: number,
  w: number
): number {
  if (typeof scene.parallax === 'number' && Math.abs(scene.parallax) > 0.02) {
    // Background scrolls opposite to apparent travel direction
    return -scene.parallax * localT * (w * 0.14);
  }
  // Auto-detect strong horizontal running/chasing motion across scene
  let totalTravel = 0;
  let maxTravel = 0;
  for (const ch of scene.characters) {
    const kfs = Array.isArray(ch.keyframes) ? ch.keyframes : [];
    if (kfs.length >= 2) {
      const dx = kfs[kfs.length - 1].x - kfs[0].x;
      if (Math.abs(dx) > Math.abs(maxTravel)) {
        maxTravel = dx;
      }
      totalTravel += dx;
    }
  }
  if (Math.abs(maxTravel) >= 0.25) {
    const dir = Math.sign(totalTravel || maxTravel);
    return -dir * localT * (w * 0.11);
  }
  return 0;
}

function drawColoredCartoonBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: VideoScene,
  globalT: number,
  localT: number,
  groundY: number
) {
  const bgImg =
    getLoadedInlineSvgSync(scene.backgroundInlineSvg) ||
    getLoadedImageSync(findAssetByIdOrTheme(scene.backgroundAssetId)?.url) ||
    getLoadedImageSync(findAssetByIdOrTheme(scene.theme)?.url);

  if (bgImg) {
    const parallaxPx = computeSceneParallaxOffsetPx(scene, localT, w);
    drawHybridBackgroundImage(ctx, bgImg, w, h, groundY, parallaxPx);
    return;
  }

  const theme = scene.theme;
  const grad = ctx.createLinearGradient(0, 0, 0, groundY);
  let groundColor = '#1E293B';

  if (theme === 'rain_storm') {
    grad.addColorStop(0, '#0F172A');
    grad.addColorStop(1, '#334155');
  } else if (theme === 'desert_sun') {
    grad.addColorStop(0, '#EA580C');
    grad.addColorStop(1, '#FDE047');
    groundColor = '#D97706';
  } else if (theme === 'office_drama' || theme === 'exam_hall' || theme === 'room_door' || theme === 'bathroom_rush') {
    grad.addColorStop(0, '#E2E8F0');
    grad.addColorStop(1, '#CBD5E1');
    groundColor = '#64748B';
  } else if (theme === 'tea_stall' || theme === 'tea_stall_day') {
    grad.addColorStop(0, '#38BDF8');
    grad.addColorStop(1, '#FDE68A');
    groundColor = '#475569';
  } else if (theme === 'street_night' || theme === 'bedroom_night') {
    grad.addColorStop(0, '#0F172A');
    grad.addColorStop(1, '#1E293B');
  } else {
    // Daylight default fallback (never black void!)
    grad.addColorStop(0, '#38BDF8');
    grad.addColorStop(1, '#E0F2FE');
    groundColor = '#22C55E';
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, groundY);

  ctx.fillStyle = groundColor;
  ctx.fillRect(0, groundY, w, h - groundY);

  if (theme === 'rain_storm') {
    ctx.save();
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 48; i++) {
      const rx = ((i * 83 + globalT * 190) % (w + 80)) - 40;
      const ry = ((i * 117 + globalT * 740) % (groundY + 40)) - 20;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 8, ry + 24);
      ctx.stroke();
    }
    ctx.restore();
  } else if (theme === 'desert_sun') {
    ctx.save();
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.22, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (theme === 'tea_stall' || theme === 'tea_stall_day') {
    ctx.save();
    ctx.fillStyle = '#78350F';
    ctx.fillRect(w * 0.08, groundY - 90, w * 0.84, 90);
    ctx.fillStyle = '#92400E';
    ctx.fillRect(w * 0.05, groundY - 106, w * 0.9, 20);
    ctx.restore();
  }
}

function getCharacterAppearance(id: CharacterId) {
  switch (id) {
    case 'rafu':
      return { skin: '#FDBA74', shirt: '#2563EB', pants: '#1E293B' };
    case 'folk':
      return { skin: '#FED7AA', shirt: '#16A34A', pants: '#0F172A' };
    case 'boss':
      return { skin: '#FDE68A', shirt: '#334155', pants: '#0F172A' };
    case 'chacha':
      return { skin: '#FDBA74', shirt: '#D97706', pants: '#334155' };
    default:
      return { skin: '#FCD5B5', shirt: '#DB2777', pants: '#1E293B' };
  }
}

function drawColoredCartoonCharacter(
  ctx: CanvasRenderingContext2D,
  char: VideoCharacterState,
  baseX: number,
  groundY: number,
  facing: 1 | -1,
  lip: LipSyncSample
) {
  const look = getCharacterAppearance(char.id);
  ctx.save();
  ctx.translate(baseX, groundY);
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Legs
  ctx.fillStyle = look.pants;
  ctx.fillRect(-20, -90, 16, 82);
  ctx.strokeRect(-20, -90, 16, 82);
  ctx.fillRect(4, -90, 16, 82);
  ctx.strokeRect(4, -90, 16, 82);

  // Shirt torso
  ctx.fillStyle = look.shirt;
  drawRoundedRect(ctx, -28, -172, 56, 86, 14);
  ctx.fill();
  ctx.stroke();

  // Head
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(0, -214, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes
  const ex = facing * 6;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(-12 + ex, -220, 9, 0, Math.PI * 2);
  ctx.arc(12 + ex, -220, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.arc(-10 + ex, -220, 3.5, 0, Math.PI * 2);
  ctx.arc(14 + ex, -220, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Audio-reactive viseme mouth
  drawAnimatedMouth(ctx, ex, -196, lip, char.expression, 13, 16);

  ctx.restore();
}

/* ============================================================================
 * 3. UNIFIED VIDEO FRAME RENDERER
 * ========================================================================== */

export function renderVideoFrame(
  ctx: CanvasRenderingContext2D,
  script: VideoScript,
  branding: BrandingConfig,
  elapsedSec: number
) {
  const { width: w, height: h } = getVideoDimensions(script.aspectRatio);
  const { scene, sceneIndex, localT } = getSceneAtTime(script, elapsedSec);
  const renderStyle = script.renderStyle || 'stick_meme';
  const isStick = renderStyle === 'stick_meme';
  const groundY = Math.round(h * 0.72);
  const tNorm = Math.max(0, Math.min(1, localT / Math.max(0.5, scene.durationSec)));

  // Camera zoom / shake transforms (including timed screen_shake effects)
  let camScale = 1;
  let camFocusX = w / 2;
  let camFocusY = h / 2;
  let shakeX = 0;
  let shakeY = 0;

  if (scene.camera === 'zoom_left') {
    camScale = 1.18;
    camFocusX = w * 0.3;
    camFocusY = h * 0.56;
  } else if (scene.camera === 'zoom_right') {
    camScale = 1.18;
    camFocusX = w * 0.7;
    camFocusY = h * 0.56;
  } else if (scene.camera === 'zoom_center') {
    camScale = 1.14;
    camFocusX = w * 0.5;
    camFocusY = h * 0.54;
  } else if (scene.camera === 'shake') {
    shakeX = Math.sin(elapsedSec * 42) * 8;
    shakeY = Math.cos(elapsedSec * 36) * 6;
  }

  const hasEffectShake = Array.isArray(scene.effects)
    ? scene.effects.some((fx) => {
        if (fx.type !== 'screen_shake') return false;
        const dur = fx.duration ?? 0.25;
        return tNorm >= fx.t && tNorm <= fx.t + dur;
      })
    : false;
  if (hasEffectShake) {
    shakeX += Math.sin(elapsedSec * 58) * 14;
    shakeY += Math.cos(elapsedSec * 49) * 11;
  }

  ctx.save();
  ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
  ctx.scale(camScale, camScale);
  ctx.translate(-camFocusX, -camFocusY);

  if (isStick) {
    drawStickRoomBackdrop(
      ctx,
      w,
      h,
      scene.theme,
      Boolean(scene.splitScreen),
      groundY
    );
  } else {
    drawColoredCartoonBackground(ctx, w, h, scene, elapsedSec, localT, groundY);
  }

  // Active speaker tracking
  const activeSpeaker = getActiveSpeakerInScene(script, sceneIndex, localT, scene);

  // Render background props (doors, toilet, splat) behind characters in stick mode
  if (isStick) {
    const isAnyKnocking = scene.characters.some((c) => c.action === 'knock_door');
    scene.characters.forEach((char) => {
      if (char.prop === 'none') return;
      let px = w / 2;
      if (scene.splitScreen) {
        px = char.side === 'left' ? w * 0.25 : w * 0.75;
      } else if (char.side === 'left') {
        px = char.prop === 'door_closed' ? w * 0.44 : w * 0.28;
      } else if (char.side === 'right') {
        px = char.prop === 'door_open' ? w * 0.64 : w * 0.72;
      } else if (char.prop === 'door_closed') {
        px = w * 0.6;
      }
      drawStickProp(ctx, char.prop, px, groundY, elapsedSec, isAnyKnocking);
    });
  }

  // Render characters (Hybrid Sprite Actors for animals/vehicles + Modular Part-Based Rig for talking humans)
  const resolvedCharacterPositions: Array<{ xNorm: number; yPx: number }> = [];

  scene.characters.forEach((char, idx) => {
    let defaultXNorm = 0.5;
    let defaultFacing: 1 | -1 = 1;
    if (scene.splitScreen) {
      defaultXNorm = char.side === 'left' ? 0.25 : 0.75;
      defaultFacing = char.side === 'left' ? 1 : -1;
    } else if (scene.characters.length === 2) {
      defaultXNorm = char.side === 'left' ? 0.28 : 0.72;
      defaultFacing = char.side === 'left' ? 1 : -1;
    } else if (char.prop === 'door_closed') {
      defaultXNorm = 0.34;
      defaultFacing = 1;
    } else if (char.side === 'right') {
      defaultFacing = -1;
    }

    const isSpeaking = activeSpeaker?.charIndex === idx;
    const lip = sampleCharacterLipSync(script, sceneIndex, idx, localT, isSpeaking);
    let rigPose =
      char.action !== 'dramatic_closeup'
        ? interpolateCharacterKeyframes(char, tNorm, defaultXNorm, defaultFacing)
        : null;

    const hasIntentionalOffscreenMotion =
      Array.isArray(char.keyframes) &&
      char.keyframes.length >= 2 &&
      (char.keyframes[0].x < 0.05 ||
        char.keyframes[0].x > 0.95 ||
        char.keyframes[char.keyframes.length - 1].x < 0.05 ||
        char.keyframes[char.keyframes.length - 1].x > 0.95);

    // Keep static speaking character visible on stage unless entering/exiting/rolling offscreen
    if (
      rigPose &&
      isSpeaking &&
      !hasIntentionalOffscreenMotion &&
      rigPose.curlBall < 0.5 &&
      (rigPose.x < 0.1 || rigPose.x > 0.9)
    ) {
      rigPose = { ...rigPose, x: Math.max(0.14, Math.min(0.86, rigPose.x)) };
    }

    const effectiveXNorm = rigPose ? rigPose.x : defaultXNorm;
    const effectiveYPx = rigPose ? groundY - Math.max(0, rigPose.y) * (h * 0.42) : groundY;
    resolvedCharacterPositions.push({ xNorm: effectiveXNorm, yPx: effectiveYPx });

    const spriteAsset = resolveSpriteAssetForCharacter(char, scene.captionTop);
    const isSpriteActor =
      Boolean(spriteAsset) ||
      char.kind === 'sprite_actor' ||
      Boolean(char.inlineSvg);

    if (isSpriteActor) {
      const spriteImg =
        getLoadedInlineSvgSync(char.inlineSvg) ||
        getLoadedImageSync(spriteAsset?.url);
      const effectivePose = rigPose ?? {
        x: defaultXNorm,
        y: 0,
        facing: defaultFacing,
        rotationDeg: 0,
        curlBall: 0,
        torsoLeanDeg: 0,
        headTiltDeg: 0,
        leftArm: { shoulder: 0, elbow: 0 },
        rightArm: { shoulder: 0, elbow: 0 },
        leftLeg: { hip: 0, knee: 0 },
        rightLeg: { hip: 0, knee: 0 },
        vibrate: 0,
        scale: 1,
        heldProp: 'none' as const,
        expression: char.expression,
        isMoving: false,
      };
      drawSpriteSheetActor(
        ctx,
        char,
        spriteAsset,
        spriteImg,
        effectivePose,
        w,
        groundY,
        h,
        elapsedSec,
        tNorm,
        scene.splitScreen ? 0.9 : 1.05
      );
      return;
    }

    if (rigPose) {
      drawArticulatedRigCharacter(
        ctx,
        char,
        rigPose,
        w,
        groundY,
        h,
        elapsedSec,
        lip,
        isStick,
        scene.splitScreen ? 0.9 : 1.05
      );
      return;
    }

    if (isStick) {
      drawStickMemeCharacter(
        ctx,
        char,
        defaultXNorm * w,
        groundY,
        defaultFacing,
        elapsedSec,
        localT,
        scene.durationSec,
        lip,
        scene.splitScreen ? 0.9 : 1.05
      );
    } else {
      drawColoredCartoonCharacter(
        ctx,
        char,
        defaultXNorm * w,
        groundY,
        defaultFacing,
        lip
      );
    }
  });

  // Render scene visual effects anchored to target characters
  drawSceneVisualEffects(ctx, scene.effects, w, h, tNorm, isStick, resolvedCharacterPositions);

  ctx.restore();

  // Top Viral Hook Banner (Stick-Meme style: crisp white rounded box with black outline)
  const hookText = (script.hookBanner || script.title || '').trim();
  if (hookText) {
    ctx.save();
    ctx.font = '700 28px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';
    const boxW = Math.min(w - 56, Math.max(320, ctx.measureText(hookText).width + 64));
    const boxH = 64;
    const boxX = (w - boxW) / 2;
    const boxY = 34;

    if (isStick) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 3;
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#111827';
    } else {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 14);
      ctx.fill();
      ctx.fillStyle = '#FACC15';
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hookText, w / 2, boxY + boxH / 2 + 1);
    ctx.restore();
  }

  // Scene top label below hook (crisp legible pill for mobile 9:16 viewing)
  if (scene.captionTop) {
    ctx.save();
    ctx.font = '700 21px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!isStick) {
      const capW = Math.min(w - 56, ctx.measureText(scene.captionTop).width + 38);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      drawRoundedRect(ctx, (w - capW) / 2, 108, capW, 38, 999);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(scene.captionTop, w / 2, 128);
    } else {
      ctx.fillStyle = 'rgba(17, 24, 39, 0.72)';
      ctx.fillText(scene.captionTop, w / 2, 128);
    }
    ctx.restore();
  }

  // Watermark / Brand stamp
  const brandText = (branding.logoText || '@@RAFU FOLK@@').trim();
  if (brandText) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.2, Math.min(0.95, branding.logoOpacity ?? 0.45));
    ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isStick ? '#64748B' : '#FFFFFF';
    if (!isStick) {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.lineWidth = 4;
      ctx.strokeText(brandText, w / 2, groundY + 46);
    }
    ctx.fillText(brandText, w / 2, groundY + 46);
    ctx.restore();
  }

  // Bottom Subtitles
  if (activeSpeaker && activeSpeaker.speech) {
    ctx.save();
    const subStyle = script.subtitleStyle || (isStick ? 'meme_clean' : 'reels_bold');
    const speakingChar = scene.characters[activeSpeaker.charIndex];
    const lineText = speakingChar
      ? `${speakingChar.name}: ${activeSpeaker.speech}`
      : activeSpeaker.speech;

    ctx.font =
      subStyle === 'meme_clean'
        ? '600 25px "Hind Siliguri", "Plus Jakarta Sans", sans-serif'
        : '700 27px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';

    const lines = wrapTextLines(ctx, lineText, w - 84).slice(0, 3);
    const lineHeight = 36;
    const totalTextH = lines.length * lineHeight;
    const startY = h - 96 - totalTextH / 2;

    if (subStyle === 'reels_bold') {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      drawRoundedRect(ctx, 32, startY - 22, w - 64, totalTextH + 34, 16);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
    } else {
      // Clean high-contrast meme subtitle (dark ink on white with subtle white halo)
      ctx.fillStyle = isStick ? '#111827' : '#FFFFFF';
      if (!isStick) {
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 5;
      }
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((ln, idx) => {
      const ly = startY + idx * lineHeight;
      if (subStyle !== 'reels_bold' && !isStick) {
        ctx.strokeText(ln, w / 2, ly);
      }
      ctx.fillText(ln, w / 2, ly);
    });
    ctx.restore();
  }
}

/* ============================================================================
 * 4. HIGH-QUALITY VIDEO RECORDER + SERVER MP4 TRANSCODER
 * ========================================================================== */

export async function recordVideoFromScript(
  script: VideoScript,
  branding: BrandingConfig,
  onProgress?: (pct: number, stageLabel?: string) => void
): Promise<RenderedVideoResult> {
  const { width, height } = getVideoDimensions(script.aspectRatio);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }

  await Promise.all([
    prepareLipSyncForScript(script),
    preloadScriptAssets(script),
  ]);

  const totalSec = script.scenes.reduce(
    (sum, s) => sum + Math.max(1.5, s.durationSec),
    0
  );

  // Start silent-to-speaker audio session routed purely to MediaStream for clean capture
  const audioSession = await startVideoAudioSession(script, 0, true);
  const canvasStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioSession.stream.getAudioTracks(),
  ]);

  const preferredMimes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  const chosenMime =
    preferredMimes.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

  const recorder = new MediaRecorder(combinedStream, {
    mimeType: chosenMime,
    videoBitsPerSecond: 3_200_000,
    audioBitsPerSecond: 128_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  const stoppedPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: chosenMime }));
    };
  });

  recorder.start(250);
  const startTimeMs = performance.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsedSec = (performance.now() - startTimeMs) / 1000;
      if (elapsedSec >= totalSec) {
        renderVideoFrame(ctx, script, branding, totalSec - 0.01);
        onProgress?.(82, 'MP4 ফরম্যাটে প্রসেস হচ্ছে...');
        resolve();
        return;
      }
      renderVideoFrame(ctx, script, branding, elapsedSec);
      const pct = Math.min(80, Math.round((elapsedSec / totalSec) * 80));
      onProgress?.(pct, 'ভিডিও ফ্রেম রেকর্ড হচ্ছে...');
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  recorder.stop();
  const rawBlob = await stoppedPromise;
  audioSession.stop();
  canvasStream.getTracks().forEach((t) => t.stop());

  // Transcode to universal H.264 + AAC MP4 via FFmpeg on server
  try {
    const form = new FormData();
    form.append('video', rawBlob, 'recording.webm');
    const res = await fetch('/api/video/transcode-mp4', {
      method: 'POST',
      body: form,
    });
    if (res.ok) {
      const mp4Blob = await res.blob();
      onProgress?.(100, 'MP4 তৈরি ও সেইভ সম্পন্ন!');
      return {
        blob: mp4Blob,
        mimeType: 'video/mp4',
        extension: 'mp4',
        durationSec: totalSec,
      };
    }
  } catch (err) {
    console.warn('Server MP4 transcode skipped, returning WebM:', err);
  }

  onProgress?.(100, 'ভিডিও তৈরি সম্পন্ন!');
  return {
    blob: rawBlob,
    mimeType: chosenMime,
    extension: 'webm',
    durationSec: totalSec,
  };
}
