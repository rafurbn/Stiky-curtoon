import type {
  BrandingConfig,
  CharacterId,
  VideoAspectRatio,
  VideoCharacterState,
  VideoProp,
  VideoScene,
  VideoScript,
  VideoTheme,
} from '../types/comic';
import { startVideoAudioSession } from './videoAudioEngine';

export function getVideoDimensions(aspectRatio: VideoAspectRatio): {
  width: number;
  height: number;
} {
  if (aspectRatio === '1:1') {
    return { width: 900, height: 900 };
  }
  return { width: 720, height: 1280 };
}

function easeInOutCubic(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutBack(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function drawThemeBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: VideoTheme,
  globalT: number,
  localT: number,
  groundY: number
) {
  if (theme === 'rain_storm') {
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#0F172A');
    sky.addColorStop(0.55, '#1E293B');
    sky.addColorStop(1, '#334155');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, groundY);

    // Periodic lightning flash
    const flashPhase = localT % 2.1;
    const isFlash = flashPhase > 0.45 && flashPhase < 0.62;
    if (isFlash) {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.25)';
      ctx.fillRect(0, 0, w, groundY);
      ctx.save();
      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w * 0.26, 40);
      ctx.lineTo(w * 0.21, 170);
      ctx.lineTo(w * 0.29, 200);
      ctx.lineTo(w * 0.22, 360);
      ctx.stroke();
      ctx.restore();
    }

    // Drifting storm clouds
    ctx.fillStyle = '#0F172A';
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 230 + globalT * 18) % (w + 260)) - 130;
      const cy = 90 + (i % 2) * 42;
      ctx.beginPath();
      ctx.arc(cx, cy, 65, 0, Math.PI * 2);
      ctx.arc(cx + 55, cy - 12, 74, 0, Math.PI * 2);
      ctx.arc(cx + 115, cy + 5, 58, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distant silhouette & road
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, groundY - 90, w, 90);
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, groundY, w, 14);

    // Animated rain streaks
    ctx.save();
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 65; i++) {
      const rx = ((i * 73 + globalT * 110) % (w + 80)) - 40;
      const ry = ((i * 137 + globalT * 820) % (groundY + 60)) - 40;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 10, ry + 34);
      ctx.stroke();
    }

    // Puddle splash rings on ground
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const p = ((globalT * 1.8 + i * 0.37) % 1);
      const px = w * (0.12 + i * 0.16);
      const py = groundY + 34 + (i % 2) * 26;
      ctx.beginPath();
      ctx.ellipse(px, py, 8 + p * 26, 3 + p * 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (theme === 'desert_sun') {
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#EA580C');
    sky.addColorStop(0.48, '#F97316');
    sky.addColorStop(1, '#FDE047');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, groundY);

    // Blazing pulsing sun
    const sunX = w * 0.22;
    const sunY = h * 0.17;
    const pulse = Math.sin(globalT * 4) * 8;
    ctx.fillStyle = 'rgba(254, 240, 138, 0.25)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 108 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FEF9C3';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 66, 0, Math.PI * 2);
    ctx.fill();

    // Distant desert dunes
    ctx.fillStyle = '#D97706';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.quadraticCurveTo(w * 0.28, groundY - 90, w * 0.56, groundY - 25);
    ctx.quadraticCurveTo(w * 0.82, groundY - 75, w, groundY - 15);
    ctx.lineTo(w, groundY);
    ctx.closePath();
    ctx.fill();

    // Cacti silhouettes
    const drawCactus = (cx: number, cy: number, scale: number) => {
      ctx.save();
      ctx.fillStyle = '#B45309';
      ctx.beginPath();
      ctx.roundRect(cx - 8 * scale, cy - 72 * scale, 16 * scale, 72 * scale, 8 * scale);
      ctx.roundRect(cx - 28 * scale, cy - 52 * scale, 22 * scale, 11 * scale, 5 * scale);
      ctx.roundRect(cx - 28 * scale, cy - 66 * scale, 11 * scale, 24 * scale, 5 * scale);
      ctx.roundRect(cx + 6 * scale, cy - 42 * scale, 20 * scale, 11 * scale, 5 * scale);
      ctx.roundRect(cx + 15 * scale, cy - 58 * scale, 11 * scale, 26 * scale, 5 * scale);
      ctx.fill();
      ctx.restore();
    };
    drawCactus(w * 0.14, groundY - 10, 0.85);
    drawCactus(w * 0.86, groundY - 14, 1.05);

    // Cracked dry desert ground
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.strokeStyle = '#92400E';
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 7; i++) {
      const sx = w * (0.08 + i * 0.14);
      ctx.beginPath();
      ctx.moveTo(sx, groundY + 12);
      ctx.lineTo(sx - 20, groundY + 55);
      ctx.lineTo(sx + 18, groundY + 98);
      ctx.stroke();
    }

    // Heat shimmer lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const y = groundY - 30 - i * 48;
      const offset = Math.sin(globalT * 5 + i) * 14;
      ctx.beginPath();
      ctx.moveTo(w * 0.15 + offset, y);
      ctx.quadraticCurveTo(w * 0.5, y - 10, w * 0.85 - offset, y);
      ctx.stroke();
    }
    return;
  }

  if (theme === 'office_drama') {
    ctx.fillStyle = '#EEF2FF';
    ctx.fillRect(0, 0, w, groundY);

    // Big office window
    ctx.fillStyle = '#BAE6FD';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(w * 0.12, h * 0.14, w * 0.76, h * 0.24, 12);
    ctx.fill();
    ctx.stroke();

    // Window pane divider
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.14);
    ctx.lineTo(w * 0.5, h * 0.38);
    ctx.stroke();

    // Wall clock
    const clockX = w * 0.8;
    const clockY = h * 0.09;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(clockX, clockY, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(clockX, clockY);
    ctx.lineTo(clockX + Math.cos(globalT * 2) * 20, clockY + Math.sin(globalT * 2) * 20);
    ctx.stroke();

    // Floor
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(0, groundY, w, 10);
    return;
  }

  if (theme === 'tea_stall') {
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#312E81');
    sky.addColorStop(0.6, '#7C2D12');
    sky.addColorStop(1, '#F59E0B');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, groundY);

    // Striped tea stall awning at top
    const stripeCount = 8;
    const sw = w / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#DC2626' : '#FEF3C7';
      ctx.fillRect(i * sw, 0, sw + 1, h * 0.085);
      ctx.beginPath();
      ctx.arc(i * sw + sw / 2, h * 0.085, sw / 2, 0, Math.PI);
      ctx.fill();
    }

    // Swinging warm bulb
    const sway = Math.sin(globalT * 2.4) * 8;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.085);
    ctx.lineTo(w * 0.5 + sway, h * 0.16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(253, 224, 71, 0.25)';
    ctx.beginPath();
    ctx.arc(w * 0.5 + sway, h * 0.17, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(w * 0.5 + sway, h * 0.17, 15, 0, Math.PI * 2);
    ctx.fill();

    // Wooden tea bench at back
    ctx.fillStyle = '#78350F';
    ctx.fillRect(w * 0.12, groundY - 46, w * 0.76, 14);
    ctx.fillRect(w * 0.18, groundY - 32, 12, 32);
    ctx.fillRect(w * 0.8, groundY - 32, 12, 32);

    // Ground
    ctx.fillStyle = '#451A03';
    ctx.fillRect(0, groundY, w, h - groundY);
    return;
  }

  // street_night
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, '#020617');
  sky.addColorStop(1, '#1E1B4B');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, groundY);

  // Moon & stars
  ctx.fillStyle = '#FEF9C3';
  ctx.beginPath();
  ctx.arc(w * 0.8, h * 0.14, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#020617';
  ctx.beginPath();
  ctx.arc(w * 0.8 + 14, h * 0.14 - 8, 36, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#E2E8F0';
  for (let i = 0; i < 18; i++) {
    const sx = (i * 97 + 41) % w;
    const sy = (i * 59 + 30) % (groundY * 0.55);
    const alpha = 0.4 + 0.5 * Math.sin(globalT * 3 + i);
    ctx.globalAlpha = Math.max(0.2, alpha);
    ctx.fillRect(sx, sy, 3, 3);
  }
  ctx.globalAlpha = 1;

  // Glowing streetlamp
  ctx.fillStyle = '#334155';
  ctx.fillRect(w * 0.48, h * 0.18, 12, groundY - h * 0.18);
  ctx.fillStyle = 'rgba(253, 224, 71, 0.16)';
  ctx.beginPath();
  ctx.moveTo(w * 0.48 + 6, h * 0.18);
  ctx.lineTo(w * 0.18, groundY);
  ctx.lineTo(w * 0.82, groundY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, groundY, w, h - groundY);
}

function drawCharacterTrait(
  ctx: CanvasRenderingContext2D,
  id: CharacterId,
  hx: number,
  hy: number,
  r: number
) {
  ctx.save();
  ctx.strokeStyle = '#0F172A';
  ctx.fillStyle = '#0F172A';
  if (id === 'rafu') {
    // Spiky hair
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.45, hy - r * 0.86);
    ctx.lineTo(hx - r * 0.28, hy - r * 1.24);
    ctx.lineTo(hx - r * 0.04, hy - r * 0.96);
    ctx.lineTo(hx + r * 0.14, hy - r * 1.32);
    ctx.lineTo(hx + r * 0.34, hy - r * 0.92);
    ctx.stroke();
  } else if (id === 'folk') {
    // Cool round glasses
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(hx - r * 0.26, hy - r * 0.12, r * 0.24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx + r * 0.26, hy - r * 0.12, r * 0.24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.02, hy - r * 0.12);
    ctx.lineTo(hx + r * 0.02, hy - r * 0.12);
    ctx.stroke();
  } else if (id === 'chacha') {
    // White topi
    ctx.fillStyle = '#F8FAFC';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.78, r * 0.68, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (id === 'friend') {
    // Baseball cap
    ctx.fillStyle = '#2563EB';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.72, r * 0.78, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx + r * 0.4, hy - r * 0.72);
    ctx.lineTo(hx + r * 1.1, hy - r * 0.65);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAnimatedProp(
  ctx: CanvasRenderingContext2D,
  prop: VideoProp,
  handX: number,
  handY: number,
  hx: number,
  hy: number,
  facing: 1 | -1,
  t: number
) {
  if (prop === 'none') return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (prop === 'umbrella_normal') {
    const ux = handX;
    const uy = hy - 98;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(ux, uy);
    ctx.stroke();

    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.arc(ux, uy + 8, 92, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (prop === 'umbrella_upside_down') {
    // Upside-down umbrella filled with sloshing blue water!
    const ux = handX;
    const uy = handY - 12;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(handX, handY + 28);
    ctx.lineTo(ux, uy - 78);
    ctx.stroke();
    // J-handle at top
    ctx.beginPath();
    ctx.arc(ux + 12, uy - 78, 12, Math.PI, 0);
    ctx.stroke();

    // Bowl canopy
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.arc(ux, uy - 24, 82, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Sloshing blue water inside
    const ripple = Math.sin(t * 7) * 4;
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.ellipse(ux, uy - 22 + ripple * 0.3, 72, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#BAE6FD';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(ux, uy - 22 + ripple * 0.3, 34 + ripple, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (prop === 'broken_umbrella') {
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(handX + facing * 34, handY + 58);
    ctx.stroke();
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(handX + facing * 18, handY + 46);
    ctx.lineTo(handX + facing * 66, handY + 72);
    ctx.lineTo(handX + facing * 8, handY + 84);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (prop === 'water_tap_glass') {
    // Upside-down umbrella overhead + golden tap pouring water into a glass!
    const ux = handX;
    const uy = hy - 68;
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(ux, uy - 20, 74, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.ellipse(ux, uy - 18, 64, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Golden tap
    const tapX = ux - 14;
    const tapY = uy + 56;
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(tapX, tapY, 26, 11);
    ctx.strokeRect(tapX, tapY, 26, 11);
    ctx.fillRect(tapX + 18, tapY + 8, 9, 14);

    // Animated pouring water stream
    const streamW = 5 + Math.sin(t * 22) * 1.6;
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(tapX + 20, tapY + 22, streamW, 66);

    // Glass held in hand
    ctx.fillStyle = 'rgba(186, 230, 253, 0.85)';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(handX - 18, handY - 12, 36, 44, 4);
    ctx.fill();
    ctx.stroke();
  } else if (prop === 'tea_cup') {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(handX - 14, handY - 16, 28, 26, 5);
    ctx.fill();
    ctx.stroke();
    // Rising steam
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 2; i++) {
      const sx = handX - 5 + i * 10;
      const wave = Math.sin(t * 6 + i) * 5;
      ctx.beginPath();
      ctx.moveTo(sx, handY - 22);
      ctx.quadraticCurveTo(sx + wave, handY - 38, sx - wave, handY - 54);
      ctx.stroke();
    }
  } else if (prop === 'smartphone') {
    const vib = Math.sin(t * 36) * 2.5;
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(handX - 11 + vib, handY - 24, 22, 38, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(handX - 8 + vib, handY - 20, 16, 28);
  } else if (prop === 'money') {
    const flutter = Math.sin(t * 8) * 5;
    ctx.fillStyle = '#22C55E';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(handX - 20, handY - 14 + flutter, 42, 22, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#DCFCE7';
    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillText('৳৳', handX - 8, handY + 2 + flutter);
  } else if (prop === 'laptop') {
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3;
    ctx.fillRect(handX - 24, handY - 20, 48, 30);
    ctx.strokeRect(handX - 24, handY - 20, 48, 30);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(handX - 28, handY + 10, 56, 8);
  } else if (prop === 'clock') {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(handX, handY - 12, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawAnimatedCharacter(
  ctx: CanvasRenderingContext2D,
  char: VideoCharacterState,
  baseX: number,
  groundY: number,
  facing: 1 | -1,
  t: number,
  localT: number
) {
  ctx.save();

  // Compute animated body offsets from action
  let walkOffsetX = 0;
  let bobY = Math.sin(t * 4) * 3;
  let bodyTilt = 0;
  let leftArmAngle = -0.3;
  let rightArmAngle = 0.5;
  let legSpread = 22;
  let legStep = 0;

  if (char.action === 'walk_in') {
    const prog = easeInOutCubic(Math.min(1, localT / 1.2));
    walkOffsetX = (1 - prog) * facing * -180;
    bobY = Math.abs(Math.sin(t * 11)) * -10;
    legStep = Math.sin(t * 11) * 26;
  } else if (char.action === 'run') {
    bobY = Math.abs(Math.sin(t * 16)) * -18;
    bodyTilt = facing * 0.18;
    legStep = Math.sin(t * 16) * 36;
    leftArmAngle = -0.8 + Math.sin(t * 16) * 0.7;
    rightArmAngle = 0.8 - Math.sin(t * 16) * 0.7;
  } else if (char.action === 'laugh' || char.action === 'point_laugh') {
    bobY = Math.sin(t * 18) * 6;
    bodyTilt = facing * -0.07;
    rightArmAngle = char.action === 'point_laugh' ? -0.15 : 0.7;
    leftArmAngle = -0.7;
  } else if (char.action === 'panting') {
    bobY = Math.sin(t * 9) * 5;
    bodyTilt = facing * 0.15;
    leftArmAngle = 1.1;
    rightArmAngle = 1.2;
  } else if (char.action === 'shocked_jump' || char.action === 'eye_pop') {
    const jump = Math.max(0, Math.sin(Math.min(Math.PI, localT * 7))) * 26;
    bobY = -jump;
    leftArmAngle = -1.2;
    rightArmAngle = -1.2;
  } else if (char.action === 'hands_up') {
    leftArmAngle = -1.35 + Math.sin(t * 8) * 0.1;
    rightArmAngle = -1.35 - Math.sin(t * 8) * 0.1;
  } else if (char.action === 'facepalm') {
    rightArmAngle = -1.6;
  } else if (char.action === 'pour_water' || char.action === 'sip_tea') {
    rightArmAngle = -0.25 + Math.sin(t * 5) * 0.08;
  }

  const cx = baseX + walkOffsetX;
  const hipY = groundY - 82 + bobY;
  const shoulderY = hipY - 86;
  const neckX = cx + bodyTilt * 40;
  const hx = neckX;
  const hy = shoulderY - 56;
  const headR = 48;

  // Ground shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
  ctx.beginPath();
  ctx.ellipse(cx, groundY + 4, 38, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 9.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, hipY);
  ctx.lineTo(cx - legSpread + legStep, groundY);
  ctx.moveTo(cx, hipY);
  ctx.lineTo(cx + legSpread - legStep, groundY);
  ctx.stroke();

  // Torso
  ctx.beginPath();
  ctx.moveTo(cx, hipY);
  ctx.lineTo(neckX, shoulderY);
  ctx.stroke();

  // Boss red tie
  if (char.id === 'boss') {
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.moveTo(neckX, shoulderY + 6);
    ctx.lineTo(neckX - 9, shoulderY + 50);
    ctx.lineTo(neckX, shoulderY + 62);
    ctx.lineTo(neckX + 9, shoulderY + 50);
    ctx.closePath();
    ctx.fill();
  }

  // Arms
  const armLen = 72;
  const lx = neckX - Math.cos(leftArmAngle) * armLen * facing;
  const ly = shoulderY + 12 + Math.sin(leftArmAngle) * armLen;
  const rx = neckX + Math.cos(rightArmAngle) * armLen * facing;
  const ry = shoulderY + 12 + Math.sin(rightArmAngle) * armLen;

  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(neckX, shoulderY + 10);
  ctx.lineTo(lx, ly);
  ctx.moveTo(neckX, shoulderY + 10);
  if (char.action === 'facepalm') {
    ctx.lineTo(hx + facing * 14, hy + 8);
  } else {
    ctx.lineTo(rx, ry);
  }
  ctx.stroke();

  // Draw character prop at active hand
  drawAnimatedProp(ctx, char.prop, rx, ry, hx, hy, facing, t);

  // Expressive circular white head
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.arc(hx, hy, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  drawCharacterTrait(ctx, char.id, hx, hy, headR);

  // Eyes (with natural blink + eye_pop gag!)
  const blink = (t % 2.8) > 2.68;
  const eyeX1 = hx + facing * 12 - 14;
  const eyeX2 = hx + facing * 12 + 14;
  const eyeY = hy - 8;

  if (char.action === 'eye_pop') {
    // Giant popping cartoon eyes (inspired by reference Short!)
    const popFactor = Math.min(1, localT * 3);
    const bulge = 12 + popFactor * 26;
    [eyeX1, eyeX2].forEach((ex, idx) => {
      const targetX = ex + facing * (idx === 1 ? bulge : bulge * 0.45);
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(targetX, eyeY - 4, 17 + popFactor * 9, 20 + popFactor * 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Red panic veins
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(targetX - 10, eyeY - 8);
      ctx.lineTo(targetX - 4, eyeY - 4);
      ctx.stroke();

      // Tiny terrified pupil
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(targetX + facing * 4, eyeY - 4, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (blink) {
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(eyeX1 - 7, eyeY);
    ctx.lineTo(eyeX1 + 7, eyeY);
    ctx.moveTo(eyeX2 - 7, eyeY);
    ctx.lineTo(eyeX2 + 7, eyeY);
    ctx.stroke();
  } else if (char.expression === 'exhausted') {
    // Half-lidded red tired eyes
    [eyeX1, eyeX2].forEach((ex) => {
      ctx.fillStyle = '#FEE2E2';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ex, eyeY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(ex + facing * 2, eyeY + 2, 3, 0, Math.PI * 2);
      ctx.fill();
      // Heavy eyelid line
      ctx.beginPath();
      ctx.moveTo(ex - 10, eyeY - 3);
      ctx.lineTo(ex + 10, eyeY - 1);
      ctx.stroke();
    });
  } else if (char.expression === 'laughing') {
    // Happy curved closed laughing eyes + tear drops
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    [eyeX1, eyeX2].forEach((ex) => {
      ctx.beginPath();
      ctx.arc(ex, eyeY + 4, 8, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    });
    // Laughing tear drops
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(eyeX1 - 12, eyeY + 5, 4, 0, Math.PI * 2);
    ctx.arc(eyeX2 + 12, eyeY + 5, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Expressive round eyes with pupil
    [eyeX1, eyeX2].forEach((ex) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ex, eyeY, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(ex + facing * 3, eyeY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Smug or angry eyelid
      if (char.expression === 'smug') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(ex - 10, eyeY - 11, 20, 8);
        ctx.beginPath();
        ctx.moveTo(ex - 10, eyeY - 3);
        ctx.lineTo(ex + 10, eyeY - 3);
        ctx.stroke();
      }
    });
  }

  // Eyebrows
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 3.5;
  if (char.expression === 'angry') {
    ctx.beginPath();
    ctx.moveTo(eyeX1 - 8, eyeY - 18);
    ctx.lineTo(eyeX1 + 8, eyeY - 11);
    ctx.moveTo(eyeX2 + 8, eyeY - 18);
    ctx.lineTo(eyeX2 - 8, eyeY - 11);
    ctx.stroke();
  } else if (char.expression === 'shocked' || char.action === 'eye_pop') {
    ctx.beginPath();
    ctx.arc(eyeX1, eyeY - 16, 8, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(eyeX2, eyeY - 16, 8, Math.PI, 0);
    ctx.stroke();
  }

  // Animated Mouth
  const mouthX = hx + facing * 8;
  const mouthY = hy + 19;
  const talkingPulse = char.speech ? Math.abs(Math.sin(t * 14)) * 7 : 0;

  if (char.expression === 'laughing') {
    const open = 15 + Math.sin(t * 20) * 4;
    ctx.fillStyle = '#991B1B';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(mouthX, mouthY - 4, 20, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(mouthX - 15, mouthY - 4, 30, Math.min(7, open * 0.4));
  } else if (char.action === 'eye_pop' || char.expression === 'shocked') {
    ctx.fillStyle = '#7F1D1D';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY + 4, 15, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#F87171';
    ctx.beginPath();
    ctx.arc(mouthX, mouthY + 14, 9, Math.PI, 0);
    ctx.fill();
  } else if (char.expression === 'exhausted') {
    // Open mouth + panting pink tongue!
    const pant = Math.sin(t * 12) * 3;
    ctx.fillStyle = '#7F1D1D';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FB7185';
    ctx.beginPath();
    ctx.roundRect(mouthX - 6, mouthY + 2, 12, 20 + pant, 6);
    ctx.fill();
    ctx.stroke();
  } else if (char.expression === 'smug' || char.expression === 'happy') {
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (talkingPulse > 2) {
      ctx.ellipse(mouthX, mouthY, 11, talkingPulse, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(mouthX, mouthY - 4, 15, 0.15 * Math.PI, 0.85 * Math.PI);
    }
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (talkingPulse > 2) {
      ctx.ellipse(mouthX, mouthY, 10, talkingPulse * 0.9, 0, 0, Math.PI * 2);
    } else {
      ctx.moveTo(mouthX - 12, mouthY);
      ctx.lineTo(mouthX + 12, mouthY);
    }
    ctx.stroke();
  }

  // Sweat drop when exhausted/shocked
  if (char.expression === 'exhausted' || char.expression === 'shocked') {
    const dropY = (t * 45) % 24;
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(hx - facing * 34, hy - 14 + dropY, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  tailX: number,
  tailY: number,
  maxW: number,
  popProgress: number
) {
  if (!text.trim() || popProgress <= 0) return;
  const scale = easeOutBack(Math.min(1, popProgress));

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  ctx.font = '700 26px "Hind Siliguri", "Noto Sans Bengali", sans-serif';
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= maxW - 36) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);

  const lineH = 34;
  const textW = Math.max(
    110,
    ...lines.map((l) => ctx.measureText(l).width)
  );
  const bw = Math.min(maxW, textW + 42);
  const bh = lines.length * lineH + 26;
  const bx = cx - bw / 2;
  const by = cy - bh / 2;

  // Crisp comic bubble
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 20);
  ctx.fill();
  ctx.stroke();

  // Pointer tail
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(cx - 12, by + bh - 2);
  ctx.lineTo(tailX, tailY);
  ctx.lineTo(cx + 14, by + bh - 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 12, by + bh);
  ctx.lineTo(tailX, tailY);
  ctx.lineTo(cx + 14, by + bh);
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, idx) => {
    ctx.fillText(line, cx, by + 13 + lineH * (idx + 0.5));
  });

  ctx.restore();
}

function drawVideoWatermark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  branding: BrandingConfig
) {
  ctx.save();
  ctx.globalAlpha = Math.max(0.45, Math.min(1, branding.logoOpacity ?? 0.9));
  const label = branding.logoText || '@@RAFU FOLK@@';
  ctx.font = '800 20px "Plus Jakarta Sans", "Hind Siliguri", sans-serif';
  const tw = ctx.measureText(label).width;
  const padX = 16;
  const boxW = tw + padX * 2;
  const boxH = 38;
  const x = w - boxW - 24;
  const y = h - boxH - 28;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 10);
  ctx.fill();

  ctx.fillStyle = '#FACC15';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + boxW / 2, y + boxH / 2 + 1);
  ctx.restore();
}

export function getSceneAtTime(
  script: VideoScript,
  timeSec: number
): { scene: VideoScene; localT: number; progress: number } {
  let cursor = 0;
  for (const scene of script.scenes) {
    const end = cursor + scene.durationSec;
    if (timeSec <= end || scene === script.scenes[script.scenes.length - 1]) {
      const localT = Math.max(0, timeSec - cursor);
      const progress = Math.max(0, Math.min(1, localT / Math.max(0.1, scene.durationSec)));
      return { scene, localT, progress };
    }
    cursor = end;
  }
  const fallback = script.scenes[0];
  return { scene: fallback, localT: 0, progress: 0 };
}

export function renderVideoFrame(
  canvas: HTMLCanvasElement,
  script: VideoScript,
  branding: BrandingConfig,
  timeSec: number
) {
  const { width: w, height: h } = getVideoDimensions(script.aspectRatio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { scene, localT, progress } = getSceneAtTime(script, timeSec);
  const groundY = Math.round(h * 0.77);

  ctx.clearRect(0, 0, w, h);

  // Camera zoom & shake transform
  ctx.save();
  const zoomEase = easeInOutCubic(Math.min(1, progress * 1.35));
  let zoom = 1;
  let focusX = w * 0.5;
  let focusY = groundY - 180;
  let shakeX = 0;
  let shakeY = 0;

  if (scene.camera === 'zoom_left') {
    zoom = 1 + 0.28 * zoomEase;
    focusX = w * 0.3;
  } else if (scene.camera === 'zoom_right') {
    zoom = 1 + 0.28 * zoomEase;
    focusX = w * 0.7;
  } else if (scene.camera === 'zoom_center') {
    zoom = 1 + 0.22 * zoomEase;
    focusX = w * 0.5;
  } else if (scene.camera === 'shake') {
    zoom = 1.06;
    shakeX = Math.sin(timeSec * 45) * 6;
    shakeY = Math.cos(timeSec * 38) * 4;
  }

  ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
  ctx.scale(zoom, zoom);
  ctx.translate(-focusX, -focusY);

  drawThemeBackground(ctx, w, h, scene.theme, timeSec, localT, groundY);

  // Draw characters
  const chars = scene.characters.slice(0, 2);
  const charMeta: Array<{ char: VideoCharacterState; cx: number }> = [];
  chars.forEach((char, idx) => {
    let cx = w * 0.5;
    let facing: 1 | -1 = 1;
    if (chars.length === 2) {
      if (char.side === 'left' || (char.side !== 'right' && idx === 0)) {
        cx = w * 0.29;
        facing = 1;
      } else {
        cx = w * 0.71;
        facing = -1;
      }
    } else if (char.side === 'left') {
      cx = w * 0.34;
      facing = 1;
    } else if (char.side === 'right') {
      cx = w * 0.66;
      facing = -1;
    }

    drawAnimatedCharacter(ctx, char, cx, groundY, facing, timeSec, localT);
    charMeta.push({ char, cx });
  });

  // Draw speech bubbles inside camera space (clamped so they remain crisp)
  const speakers = charMeta.filter((m) => m.char.speech && m.char.speech.trim());
  speakers.forEach((m, sIdx) => {
    const bubbleDelay = sIdx * 0.45;
    const popProg = (localT - bubbleDelay) / 0.28;
    const bubbleW = speakers.length === 2 ? w * 0.44 : w * 0.76;
    const bx =
      speakers.length === 2
        ? sIdx === 0
          ? w * 0.27
          : w * 0.73
        : Math.max(w * 0.24, Math.min(w * 0.76, m.cx));
    const by = sIdx === 1 ? groundY - 360 : groundY - 395;
    drawSpeechBubble(
      ctx,
      m.char.speech!,
      bx,
      by,
      m.cx,
      groundY - 275,
      bubbleW,
      popProg
    );
  });

  ctx.restore();

  // Top scene caption banner (non-zoomed HUD layer)
  if (scene.captionTop && scene.captionTop.trim()) {
    ctx.save();
    ctx.font = '700 22px "Hind Siliguri", "Noto Sans Bengali", sans-serif';
    const capText = scene.captionTop.trim();
    const capW = Math.min(w - 48, ctx.measureText(capText).width + 38);
    const capX = (w - capW) / 2;
    const capY = 34;

    ctx.fillStyle = '#FEF08A';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(capX, capY, capW, 44, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(capText, w / 2, capY + 23);
    ctx.restore();
  }

  // Bottom progress subtle hairline + watermark
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fillRect(24, h - 14, w - 48, 4);
  ctx.fillStyle = '#FACC15';
  const progRatio = Math.min(1, timeSec / Math.max(0.1, script.totalDurationSec));
  ctx.fillRect(24, h - 14, (w - 48) * progRatio, 4);
  ctx.restore();

  drawVideoWatermark(ctx, w, h, branding);
}

export interface RenderedVideoResult {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
  objectUrl: string;
  durationSec: number;
}

function pickSupportedRecorderMime(): {
  mimeType: string;
  extension: 'mp4' | 'webm';
} {
  const candidates: Array<{ mimeType: string; extension: 'mp4' | 'webm' }> = [
    { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: 'video/webm', extension: 'webm' };
}

export async function recordVideoFromScript(
  script: VideoScript,
  branding: BrandingConfig,
  onProgress?: (pct: number) => void
): Promise<RenderedVideoResult> {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const canvas = document.createElement('canvas');
  const { width, height } = getVideoDimensions(script.aspectRatio);
  canvas.width = width;
  canvas.height = height;

  // Render first frame before capture starts
  renderVideoFrame(canvas, script, branding, 0);

  const canvasStream = canvas.captureStream(30);
  const audioSession = startVideoAudioSession(script, {
    outputToSpeakers: false,
    outputToStream: true,
    startOffsetSec: 0,
  });

  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioSession.stream.getAudioTracks(),
  ]);

  const { mimeType, extension } = pickSupportedRecorderMime();
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 3_500_000,
  });

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  return new Promise<RenderedVideoResult>((resolve, reject) => {
    let rafId = 0;
    const totalMs = Math.max(2000, script.totalDurationSec * 1000);
    const startWall = performance.now();

    recorder.onerror = () => {
      cancelAnimationFrame(rafId);
      audioSession.stop();
      reject(new Error('ভিডিও রেকর্ড করতে ব্রাউজার সমস্যা করেছে।'));
    };

    recorder.onstop = () => {
      cancelAnimationFrame(rafId);
      audioSession.stop();
      combinedStream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      onProgress?.(100);
      resolve({
        blob,
        mimeType,
        extension,
        objectUrl,
        durationSec: script.totalDurationSec,
      });
    };

    recorder.start(250);

    const step = (now: number) => {
      const elapsedMs = now - startWall;
      const elapsedSec = Math.min(script.totalDurationSec, elapsedMs / 1000);
      renderVideoFrame(canvas, script, branding, elapsedSec);
      onProgress?.(Math.min(99, Math.round((elapsedMs / totalMs) * 100)));

      if (elapsedMs < totalMs + 120) {
        rafId = requestAnimationFrame(step);
      } else {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }
    };

    rafId = requestAnimationFrame(step);
  });
}
