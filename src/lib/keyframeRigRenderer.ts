import type {
  CharacterId,
  CharacterKeyframe,
  ExpressionType,
  HeldPropType,
  SceneVisualEffect,
  VideoCharacterState,
} from '../types/comic';
import type { LipSyncSample } from './lipSyncAnalyzer';

export interface InterpolatedPose {
  x: number;
  y: number;
  facing: 1 | -1;
  rotationDeg: number;
  curlBall: number;
  torsoLeanDeg: number;
  headTiltDeg: number;
  leftArm: { shoulder: number; elbow: number };
  rightArm: { shoulder: number; elbow: number };
  leftLeg: { hip: number; knee: number };
  rightLeg: { hip: number; knee: number };
  vibrate: number;
  scale: number;
  heldProp: HeldPropType;
  expression: ExpressionType | 'exhausted';
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothStep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function drawAnimatedMouth(
  ctx: CanvasRenderingContext2D,
  mx: number,
  my: number,
  lip: LipSyncSample,
  expression: ExpressionType | 'exhausted',
  baseWidth = 15,
  maxOpen = 16
) {
  ctx.save();
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = '#111827';

  if (lip.openness > 0.08 && lip.viseme !== 'closed') {
    const rx = baseWidth * lip.width;
    const ry = Math.max(4, lip.openness * maxOpen);

    if (lip.viseme === 'wide_shout') {
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.ellipse(mx, my + ry * 0.25, rx * 1.15, ry * 1.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(mx - rx * 0.78, my - ry * 0.85, rx * 1.56, Math.max(4, ry * 0.34), 2);
      ctx.fill();

      ctx.fillStyle = '#94A3B8';
      ctx.beginPath();
      ctx.ellipse(mx, my + ry * 0.9, rx * 0.58, Math.max(3, ry * 0.3), 0, Math.PI, Math.PI * 2);
      ctx.fill();
    } else if (lip.viseme === 'round_o') {
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.ellipse(mx, my + 2, rx * 0.72, Math.max(7, ry * 1.05), 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (lip.viseme === 'consonant') {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(mx - rx, my - 4, rx * 2, Math.max(7, ry * 0.65), 4);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - rx + 2, my);
      ctx.lineTo(mx + rx - 2, my);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.ellipse(mx, my + 2, rx, Math.max(5, ry * 0.85), 0, 0, Math.PI * 2);
      ctx.fill();
      if (ry > 7) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(mx - rx * 0.65, my - ry * 0.55, rx * 1.3, 3.5);
      }
    }
    ctx.restore();
    return;
  }

  if (expression === 'laughing' || expression === 'shocked') {
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.ellipse(mx, my + 2, baseWidth * 0.95, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    if (expression === 'laughing') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(mx - baseWidth * 0.6, my - 6, baseWidth * 1.2, 4);
    }
  } else if (expression === 'crying' || expression === 'angry') {
    ctx.beginPath();
    ctx.arc(mx, my + 9, baseWidth * 0.85, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (expression === 'happy' || expression === 'smug') {
    ctx.beginPath();
    ctx.arc(mx, my - 4, baseWidth * 0.85, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(mx - baseWidth * 0.72, my + 2);
    ctx.lineTo(mx + baseWidth * 0.72, my + 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function interpolateCharacterKeyframes(
  char: VideoCharacterState,
  tNorm: number,
  defaultX: number,
  defaultFacing: 1 | -1
): InterpolatedPose | null {
  const kfs = Array.isArray(char.keyframes) ? char.keyframes : [];
  if (kfs.length === 0) return null;

  const sorted = [...kfs].sort((a, b) => a.t - b.t);
  const tClamped = Math.max(0, Math.min(1, tNorm));

  let a: CharacterKeyframe = sorted[0];
  let b: CharacterKeyframe = sorted[sorted.length - 1];
  let alpha = 0;

  if (tClamped <= sorted[0].t) {
    a = sorted[0];
    b = sorted[0];
    alpha = 0;
  } else if (tClamped >= sorted[sorted.length - 1].t) {
    a = sorted[sorted.length - 1];
    b = sorted[sorted.length - 1];
    alpha = 0;
  } else {
    for (let i = 0; i < sorted.length - 1; i++) {
      if (tClamped >= sorted[i].t && tClamped <= sorted[i + 1].t) {
        a = sorted[i];
        b = sorted[i + 1];
        const span = Math.max(0.001, b.t - a.t);
        alpha = smoothStep((tClamped - a.t) / span);
        break;
      }
    }
  }

  const facingA = a.facing ?? defaultFacing;
  const facingB = b.facing ?? facingA;
  const activeFacing: 1 | -1 = alpha < 0.5 ? facingA : facingB;

  const expA = a.expression ?? char.expression;
  const expB = b.expression ?? expA;
  const activeExp = alpha < 0.5 ? expA : expB;

  const propA = a.heldProp ?? 'none';
  const propB = b.heldProp ?? propA;
  const activeProp = alpha < 0.5 ? propA : propB;

  return {
    x: lerp(a.x ?? defaultX, b.x ?? defaultX, alpha),
    y: lerp(a.y ?? 0, b.y ?? 0, alpha),
    facing: activeFacing,
    rotationDeg: lerp(a.rotationDeg ?? 0, b.rotationDeg ?? a.rotationDeg ?? 0, alpha),
    curlBall: lerp(a.curlBall ?? 0, b.curlBall ?? a.curlBall ?? 0, alpha),
    torsoLeanDeg: lerp(a.torsoLeanDeg ?? 0, b.torsoLeanDeg ?? a.torsoLeanDeg ?? 0, alpha),
    headTiltDeg: lerp(a.headTiltDeg ?? 0, b.headTiltDeg ?? a.headTiltDeg ?? 0, alpha),
    leftArm: {
      shoulder: lerp(a.leftArmDeg?.shoulder ?? -16, b.leftArmDeg?.shoulder ?? -16, alpha),
      elbow: lerp(a.leftArmDeg?.elbow ?? 12, b.leftArmDeg?.elbow ?? 12, alpha),
    },
    rightArm: {
      shoulder: lerp(a.rightArmDeg?.shoulder ?? 20, b.rightArmDeg?.shoulder ?? 20, alpha),
      elbow: lerp(a.rightArmDeg?.elbow ?? 16, b.rightArmDeg?.elbow ?? 16, alpha),
    },
    leftLeg: {
      hip: lerp(a.leftLegDeg?.hip ?? -8, b.leftLegDeg?.hip ?? -8, alpha),
      knee: lerp(a.leftLegDeg?.knee ?? 0, b.leftLegDeg?.knee ?? 0, alpha),
    },
    rightLeg: {
      hip: lerp(a.rightLegDeg?.hip ?? 10, b.rightLegDeg?.hip ?? 10, alpha),
      knee: lerp(a.rightLegDeg?.knee ?? 0, b.rightLegDeg?.knee ?? 0, alpha),
    },
    vibrate: lerp(a.vibrate ?? 0, b.vibrate ?? a.vibrate ?? 0, alpha),
    scale: lerp(a.scale ?? 1, b.scale ?? 1, alpha),
    heldProp: activeProp,
    expression: activeExp,
  };
}

function getColoredLook(id: CharacterId) {
  switch (id) {
    case 'rafu':
      return { skin: '#FDBA74', shirt: '#2563EB', pants: '#1E293B', hair: '#0F172A' };
    case 'folk':
      return { skin: '#FED7AA', shirt: '#16A34A', pants: '#0F172A', hair: '#1E293B' };
    case 'boss':
      return { skin: '#FDE68A', shirt: '#334155', pants: '#0F172A', hair: '#475569' };
    case 'chacha':
      return { skin: '#FDBA74', shirt: '#D97706', pants: '#334155', hair: '#94A3B8' };
    default:
      return { skin: '#FCD5B5', shirt: '#DB2777', pants: '#1E293B', hair: '#0F172A' };
  }
}

function drawHeldPropAtHand(
  ctx: CanvasRenderingContext2D,
  prop: HeldPropType,
  hx: number,
  hy: number,
  dir: 1 | -1,
  globalT: number,
  isStick: boolean
) {
  if (prop === 'none') return;
  ctx.save();
  ctx.translate(hx, hy);

  if (prop === 'smartphone') {
    ctx.rotate(dir * -0.22);
    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-10, -24, 20, 34, 4);
    ctx.fill();
    ctx.stroke();

    const glow = 0.75 + Math.sin(globalT * 10) * 0.2;
    ctx.fillStyle = `rgba(56, 189, 248, ${glow})`;
    ctx.fillRect(-7, -20, 14, 24);
    if (isStick) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -14);
      ctx.lineTo(-22 * dir, -22);
      ctx.moveTo(-10, -4);
      ctx.lineTo(-24 * dir, -4);
      ctx.stroke();
    }
  } else if (prop === 'tea_cup') {
    ctx.fillStyle = isStick ? '#FFFFFF' : '#F8FAFC';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-10, -12, 20, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(10 * dir, -3, 5, -Math.PI / 2, Math.PI / 2, dir < 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(100,116,139,0.7)';
    ctx.lineWidth = 2;
    const sOff = Math.sin(globalT * 6) * 3;
    ctx.beginPath();
    ctx.moveTo(-3, -16);
    ctx.quadraticCurveTo(-3 + sOff, -25, -2, -33);
    ctx.moveTo(4, -16);
    ctx.quadraticCurveTo(4 - sOff, -24, 5, -31);
    ctx.stroke();
  } else if (prop === 'money') {
    ctx.fillStyle = isStick ? '#FFFFFF' : '#22C55E';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.fillRect(-14, -10, 28, 16);
    ctx.strokeRect(-14, -10, 28, 16);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('৳', 0, -2);
  } else if (prop === 'stick') {
    ctx.strokeStyle = isStick ? '#111827' : '#78350F';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(dir * 38, -42);
    ctx.stroke();
  } else if (prop === 'football') {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop === 'book') {
    ctx.fillStyle = isStick ? '#FFFFFF' : '#3B82F6';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.fillRect(-14, -14, 28, 22);
    ctx.strokeRect(-14, -14, 28, 22);
  } else if (prop === 'bucket') {
    ctx.fillStyle = isStick ? '#FFFFFF' : '#38BDF8';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-14, -10);
    ctx.lineTo(14, -10);
    ctx.lineTo(10, 16);
    ctx.lineTo(-10, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (prop === 'umbrella') {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(0, -48);
    ctx.stroke();
    ctx.fillStyle = isStick ? '#FFFFFF' : '#EF4444';
    ctx.beginPath();
    ctx.arc(0, -48, 34, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function drawArticulatedRigCharacter(
  ctx: CanvasRenderingContext2D,
  char: VideoCharacterState,
  pose: InterpolatedPose,
  w: number,
  groundY: number,
  h: number,
  globalT: number,
  lip: LipSyncSample,
  isStick: boolean,
  baseScale = 1
) {
  const dir = pose.facing;
  const vibAmp = pose.vibrate * 6.5;
  const vibX = vibAmp > 0.1 ? Math.sin(globalT * 52) * vibAmp : 0;
  const vibY = vibAmp > 0.1 ? Math.cos(globalT * 46) * (vibAmp * 0.7) : 0;

  const worldX = pose.x * w + vibX;
  const worldY = groundY - pose.y * (h * 0.42) + vibY;
  const totalScale = baseScale * pose.scale;

  ctx.save();
  const pivotHeight = 108 * totalScale;
  ctx.translate(worldX, worldY - pivotHeight);
  ctx.rotate((pose.rotationDeg * Math.PI) / 180);
  ctx.scale(totalScale, totalScale);

  if (pose.curlBall > 0.55) {
    const tuck = pose.curlBall;
    const r = lerp(52, 42, (tuck - 0.55) / 0.45);
    const look = getColoredLook(char.id);

    ctx.strokeStyle = isStick ? 'rgba(17,24,39,0.45)' : 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 14, 0.2, Math.PI * 1.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r + 22, Math.PI, Math.PI * 1.85);
    ctx.stroke();

    ctx.fillStyle = isStick ? '#FFFFFF' : look.shirt;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-10, 12, r * 0.55, Math.PI * 0.7, Math.PI * 1.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(14, -8, r * 0.48, -Math.PI * 0.3, Math.PI * 0.8);
    ctx.stroke();

    ctx.fillStyle = isStick ? '#FFFFFF' : look.skin;
    ctx.beginPath();
    ctx.arc(0, -8, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(-8, -11, 5, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(8, -11, 5, 0, Math.PI * 1.5);
    ctx.stroke();

    drawAnimatedMouth(ctx, 0, 5, lip, 'shocked', 11, 13);

    ctx.restore();
    return;
  }

  ctx.translate(0, 108);

  const look = getColoredLook(char.id);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111827';

  const hipX = 0;
  const hipY = -88;
  const torsoLen = 68;
  const leanRad = (pose.torsoLeanDeg * Math.PI) / 180;
  const shoulderX = hipX + dir * Math.sin(leanRad) * torsoLen;
  const shoulderY = hipY - Math.cos(leanRad) * torsoLen;

  const thighLen = 42;
  const shinLen = 40;
  const upperArmLen = 36;
  const forearmLen = 34;

  const drawLeg = (hipDeg: number, kneeDeg: number, isBackLimb: boolean) => {
    const hRad = (hipDeg * Math.PI) / 180;
    const kRad = ((hipDeg + kneeDeg) * Math.PI) / 180;
    const kx = hipX + (isBackLimb ? -6 * dir : 6 * dir) + dir * Math.sin(hRad) * thighLen;
    const ky = hipY + Math.cos(hRad) * thighLen;
    const fx = kx + dir * Math.sin(kRad) * shinLen;
    const fy = ky + Math.cos(kRad) * shinLen;

    ctx.lineWidth = isStick ? 5 : 13;
    ctx.strokeStyle = isStick ? '#111827' : look.pants;
    ctx.beginPath();
    ctx.moveTo(hipX + (isBackLimb ? -6 * dir : 6 * dir), hipY);
    ctx.lineTo(kx, ky);
    ctx.lineTo(fx, fy);
    ctx.stroke();

    if (!isStick) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0F172A';
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(-dir * ((hipDeg + kneeDeg) * 0.25 * Math.PI) / 180);
    ctx.fillStyle = isStick ? '#FFFFFF' : '#1E293B';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(dir * 6, 2, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  const computeArmEnd = (shoulderDeg: number, elbowDeg: number, sideOffset: number) => {
    const sRad = (shoulderDeg * Math.PI) / 180;
    const fRad = ((shoulderDeg + elbowDeg) * Math.PI) / 180;
    const sx = shoulderX + sideOffset;
    const sy = shoulderY + 6;
    const ex = sx + dir * Math.sin(sRad) * upperArmLen;
    const ey = sy + Math.cos(sRad) * upperArmLen;
    const hx = ex + dir * Math.sin(fRad) * forearmLen;
    const hy = ey + Math.cos(fRad) * forearmLen;
    return { sx, sy, ex, ey, hx, hy, fRad };
  };

  const drawArm = (
    geom: ReturnType<typeof computeArmEnd>,
    vibHands: boolean,
    propToDraw: HeldPropType
  ) => {
    const jx = vibHands ? Math.sin(globalT * 60) * 5 : 0;
    const jy = vibHands ? Math.cos(globalT * 54) * 4 : 0;

    ctx.lineWidth = isStick ? 4.5 : 10;
    ctx.strokeStyle = isStick ? '#111827' : look.skin;
    ctx.beginPath();
    ctx.moveTo(geom.sx, geom.sy);
    ctx.lineTo(geom.ex, geom.ey);
    ctx.lineTo(geom.hx + jx, geom.hy + jy);
    ctx.stroke();

    if (!isStick) {
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = '#0F172A';
      ctx.stroke();
    }

    ctx.fillStyle = isStick ? '#FFFFFF' : look.skin;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(geom.hx + jx, geom.hy + jy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (propToDraw !== 'none') {
      drawHeldPropAtHand(
        ctx,
        propToDraw,
        geom.hx + jx,
        geom.hy + jy,
        dir,
        globalT,
        isStick
      );
    }
  };

  const backArmGeom = computeArmEnd(pose.leftArm.shoulder, pose.leftArm.elbow, -10 * dir);
  const frontArmGeom = computeArmEnd(pose.rightArm.shoulder, pose.rightArm.elbow, 10 * dir);
  const vibHands = pose.vibrate > 0.35;

  drawLeg(pose.leftLeg.hip, pose.leftLeg.knee, true);
  drawArm(backArmGeom, vibHands, 'none');

  ctx.save();
  ctx.translate((hipX + shoulderX) / 2, (hipY + shoulderY) / 2);
  ctx.rotate(dir * leanRad);
  ctx.fillStyle = isStick ? '#FFFFFF' : look.shirt;
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  if (isStick) {
    ctx.ellipse(0, 0, 21, 42, 0, 0, Math.PI * 2);
  } else {
    ctx.roundRect(-25, -42, 50, 84, 14);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  drawLeg(pose.rightLeg.hip, pose.rightLeg.knee, false);

  const neckLen = 46;
  const headTotalRad = ((pose.torsoLeanDeg + pose.headTiltDeg) * Math.PI) / 180;
  const headX = shoulderX + dir * Math.sin(headTotalRad) * neckLen;
  const headY = shoulderY - Math.cos(headTotalRad) * neckLen;

  ctx.save();
  ctx.translate(headX, headY);
  ctx.rotate(dir * ((pose.headTiltDeg * 0.7 * Math.PI) / 180));

  ctx.fillStyle = isStick ? '#FFFFFF' : look.skin;
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 38, 42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (!isStick) {
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.arc(0, -14, 37, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = isStick ? '#FFFFFF' : look.skin;
  ctx.beginPath();
  ctx.arc(-38 * dir, 4, 8.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const eyeOffsetX = dir * 7;
  const exp = pose.expression;
  const pop = exp === 'shocked' ? 1.32 : 1;

  if (exp === 'crying' || exp === 'exhausted') {
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-20 + eyeOffsetX, -12);
    ctx.lineTo(-8 + eyeOffsetX, -6);
    ctx.lineTo(-20 + eyeOffsetX, 0);
    ctx.moveTo(20 + eyeOffsetX, -12);
    ctx.lineTo(8 + eyeOffsetX, -6);
    ctx.lineTo(20 + eyeOffsetX, 0);
    ctx.stroke();
  } else {
    ctx.lineWidth = 3.4;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-13 + eyeOffsetX, -8, 11.5 * pop, 0, Math.PI * 2);
    ctx.arc(13 + eyeOffsetX, -8, 11.5 * pop, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(-11 + eyeOffsetX, -8, 3.8, 0, Math.PI * 2);
    ctx.arc(15 + eyeOffsetX, -8, 3.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    if (exp === 'angry') {
      ctx.moveTo(-25 + eyeOffsetX, -24);
      ctx.lineTo(-4 + eyeOffsetX, -15);
      ctx.moveTo(25 + eyeOffsetX, -24);
      ctx.lineTo(4 + eyeOffsetX, -15);
    } else if (exp === 'shocked' || exp === 'confused') {
      ctx.moveTo(-22 + eyeOffsetX, -26);
      ctx.lineTo(-4 + eyeOffsetX, -26);
      ctx.moveTo(4 + eyeOffsetX, -22);
      ctx.lineTo(22 + eyeOffsetX, -22);
    }
    ctx.stroke();
  }

  const talkLift = lip.openness > 0.15 ? -lip.openness * 3.2 : 0;
  drawAnimatedMouth(ctx, eyeOffsetX, 19 + talkLift, lip, exp, 14, 18);

  ctx.restore();

  drawArm(frontArmGeom, vibHands, pose.heldProp);

  ctx.restore();
}

export function drawSceneVisualEffects(
  ctx: CanvasRenderingContext2D,
  effects: SceneVisualEffect[] | undefined,
  w: number,
  h: number,
  tNorm: number,
  isStick: boolean
) {
  if (!Array.isArray(effects) || effects.length === 0) return;

  for (const fx of effects) {
    const start = Math.max(0, Math.min(1, Number(fx.t) || 0));
    const dur = Math.max(0.08, Math.min(0.8, Number(fx.duration) || 0.28));
    if (tNorm < start || tNorm > start + dur) continue;

    const p = (tNorm - start) / dur;
    const alpha = p < 0.2 ? p / 0.2 : Math.max(0, 1 - (p - 0.2) / 0.8);
    const cx = fx.x * w;
    const cy = fx.y * h;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (fx.type === 'impact_star') {
      const radius = 42 + p * 56;
      const spikes = 10;
      ctx.fillStyle = isStick ? '#FEF08A' : '#FACC15';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const ang = (i * Math.PI) / spikes;
        const r = i % 2 === 0 ? radius : radius * 0.48;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (fx.text) {
        ctx.fillStyle = '#DC2626';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.font = '900 26px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(fx.text, cx, cy);
        ctx.fillText(fx.text, cx, cy);
      }
    } else if (fx.type === 'speed_lines') {
      ctx.strokeStyle = isStick ? '#111827' : '#FFFFFF';
      ctx.lineWidth = 3.5;
      for (let i = -2; i <= 2; i++) {
        const ly = cy + i * 24;
        const len = 70 + Math.abs(i) * 20;
        ctx.beginPath();
        ctx.moveTo(cx - len - p * 40, ly);
        ctx.lineTo(cx + 10 - p * 40, ly);
        ctx.stroke();
      }
    } else if (fx.type === 'tickle_sparks') {
      ctx.strokeStyle = isStick ? '#111827' : '#F59E0B';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + p * 4;
        const r1 = 22 + p * 18;
        const r2 = 38 + p * 26;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
        ctx.stroke();
      }
      if (fx.text) {
        ctx.fillStyle = isStick ? '#111827' : '#FACC15';
        ctx.font = '700 20px "Hind Siliguri", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(fx.text, cx, cy - 46 - p * 16);
      }
    } else if (fx.type === 'dust_puff') {
      ctx.fillStyle = isStick ? '#E2E8F0' : 'rgba(255,255,255,0.85)';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2.5;
      const spread = p * 38;
      [-1, 0, 1].forEach((k) => {
        ctx.beginPath();
        ctx.arc(cx + k * (18 + spread * 0.5), cy - p * 14, 16 + (1 - p) * 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    } else if (fx.type === 'sweat_burst') {
      ctx.fillStyle = '#38BDF8';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2.5;
      for (let i = -1; i <= 1; i += 2) {
        const sx = cx + i * (26 + p * 32);
        const sy = cy - 20 - p * 28 + p * p * 35;
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (fx.type === 'laugh_burst') {
      ctx.fillStyle = isStick ? '#111827' : '#FACC15';
      ctx.font = '800 22px "Hind Siliguri", "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fx.text || 'হা হা!', cx + Math.sin(p * 8) * 10, cy - 35 - p * 34);
    }

    ctx.restore();
  }
}
