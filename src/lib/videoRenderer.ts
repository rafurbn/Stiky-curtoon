import type {
  BrandingConfig,
  CharacterId,
  VideoAspectRatio,
  VideoCharacterState,
  VideoProp,
  VideoScene,
  VideoScript,
  VideoTheme,
  VideoVoiceClip,
} from '../types/comic';
import { startVideoAudioSession } from './videoAudioEngine';

const THEME_IMAGE_URLS: Record<VideoTheme, string> = {
  rain_storm: '/src/assets/images/bg_rain_storm_1795593943423.jpg',
  desert_sun: '/src/assets/images/bg_desert_sun_1795593944376.jpg',
  office_drama: '/src/assets/images/bg_office_drama_1795593941381.jpg',
  tea_stall: '/src/assets/images/bg_tea_stall_1795593941870.jpg',
  street_night: '/src/assets/images/bg_street_night_1795593944503.jpg',
};

const bgImageCache = new Map<VideoTheme, HTMLImageElement>();

export function preloadThemeBackgrounds(): Promise<void> {
  const entries = Object.entries(THEME_IMAGE_URLS) as Array<[VideoTheme, string]>;
  return Promise.all(
    entries.map(
      ([theme, src]) =>
        new Promise<void>((resolve) => {
          const existing = bgImageCache.get(theme);
          if (existing && existing.complete && existing.naturalWidth > 0) {
            resolve();
            return;
          }
          const img = new Image();
          img.onload = () => {
            bgImageCache.set(theme, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = src;
        })
    )
  ).then(() => undefined);
}

// Kick off background preloading immediately in browser
if (typeof window !== 'undefined') {
  preloadThemeBackgrounds().catch(() => {});
}

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

function drawFallbackGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: VideoTheme,
  groundY: number
) {
  const grad = ctx.createLinearGradient(0, 0, 0, groundY);
  if (theme === 'rain_storm') {
    grad.addColorStop(0, '#0F172A');
    grad.addColorStop(1, '#334155');
  } else if (theme === 'desert_sun') {
    grad.addColorStop(0, '#EA580C');
    grad.addColorStop(1, '#FDE047');
  } else if (theme === 'office_drama') {
    grad.addColorStop(0, '#E2E8F0');
    grad.addColorStop(1, '#CBD5E1');
  } else if (theme === 'tea_stall') {
    grad.addColorStop(0, '#431407');
    grad.addColorStop(1, '#D97706');
  } else {
    grad.addColorStop(0, '#090D16');
    grad.addColorStop(1, '#1E1B4B');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, groundY);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, groundY, w, h - groundY);
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
  const img = bgImageCache.get(theme);
  if (img && img.complete && img.naturalWidth > 0) {
    // Cover-crop onto canvas
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const canvasRatio = w / h;
    let drawW = w;
    let drawH = h;
    let offsetX = 0;
    let offsetY = 0;

    if (imgRatio > canvasRatio) {
      drawH = h;
      drawW = h * imgRatio;
      offsetX = (w - drawW) / 2;
    } else {
      drawW = w;
      drawH = w / imgRatio;
      offsetY = (h - drawH) / 2;
    }

    // Subtle Ken Burns ambient drift so background feels alive
    const kenScale = 1.03 + Math.sin(globalT * 0.5) * 0.025;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(kenScale, kenScale);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    ctx.restore();

    // Subtle ground stage vignette so characters stand out clearly
    const stageGrad = ctx.createLinearGradient(0, groundY - 220, 0, h);
    stageGrad.addColorStop(0, 'rgba(15, 23, 42, 0)');
    stageGrad.addColorStop(0.55, 'rgba(15, 23, 42, 0.26)');
    stageGrad.addColorStop(1, 'rgba(15, 23, 42, 0.72)');
    ctx.fillStyle = stageGrad;
    ctx.fillRect(0, groundY - 220, w, h - (groundY - 220));
  } else {
    drawFallbackGradient(ctx, w, h, theme, groundY);
  }

  // Animated atmospheric FX overlays
  if (theme === 'rain_storm') {
    const flashPhase = localT % 2.1;
    if (flashPhase > 0.45 && flashPhase < 0.6) {
      ctx.fillStyle = 'rgba(241, 245, 249, 0.25)';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.58)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 42; i++) {
      const rx = ((i * 89 + Math.floor(globalT * 260)) % (w + 100)) - 50;
      const ry = ((i * 137 + globalT * 960) % (groundY + 120)) - 60;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 12, ry + 34);
      ctx.stroke();
    }
    ctx.restore();
  } else if (theme === 'desert_sun') {
    const heatAlpha = 0.07 + Math.sin(globalT * 5) * 0.03;
    ctx.fillStyle = `rgba(251, 146, 60, ${heatAlpha})`;
    ctx.fillRect(0, 0, w, h);
  } else if (theme === 'street_night') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
    ctx.fillRect(0, 0, w, h);
  }
}

interface CharacterAppearance {
  skin: string;
  shirt: string;
  shirtShade: string;
  pants: string;
  shoe: string;
  badgeColor: string;
}

function getCharacterAppearance(id: CharacterId): CharacterAppearance {
  switch (id) {
    case 'rafu':
      return {
        skin: '#FCD5B5',
        shirt: '#FACC15',
        shirtShade: '#EAB308',
        pants: '#1E293B',
        shoe: '#DC2626',
        badgeColor: '#FACC15',
      };
    case 'folk':
      return {
        skin: '#F8CAA5',
        shirt: '#0EA5E9',
        shirtShade: '#0284C7',
        pants: '#334155',
        shoe: '#0F172A',
        badgeColor: '#38BDF8',
      };
    case 'boss':
      return {
        skin: '#F5C6A5',
        shirt: '#1E293B',
        shirtShade: '#0F172A',
        pants: '#0F172A',
        shoe: '#020617',
        badgeColor: '#F87171',
      };
    case 'chacha':
      return {
        skin: '#E6B18A',
        shirt: '#F8FAFC',
        shirtShade: '#CBD5E1',
        pants: '#0F766E',
        shoe: '#78350F',
        badgeColor: '#34D399',
      };
    case 'friend':
      return {
        skin: '#FCD5B5',
        shirt: '#EC4899',
        shirtShade: '#DB2777',
        pants: '#1D4ED8',
        shoe: '#F8FAFC',
        badgeColor: '#F472B6',
      };
  }
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  prop: VideoProp,
  hx: number,
  hy: number,
  t: number
) {
  if (prop === 'none') return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (prop === 'umbrella_normal') {
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx, hy - 145);
    ctx.stroke();

    ctx.fillStyle = '#EF4444';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(hx, hy - 140, 86, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (prop === 'umbrella_upside_down') {
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx, hy - 108);
    ctx.stroke();

    ctx.fillStyle = '#0284C7';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(hx, hy - 110, 78, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#7DD3FC';
    ctx.beginPath();
    ctx.ellipse(hx, hy - 108, 66, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop === 'broken_umbrella') {
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - 14, hy - 125);
    ctx.stroke();

    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(hx - 54, hy - 96);
    ctx.lineTo(hx - 14, hy - 128);
    ctx.lineTo(hx + 34, hy - 98);
    ctx.stroke();
  } else if (prop === 'water_tap_glass') {
    ctx.fillStyle = '#E0F2FE';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(hx - 20, hy - 34);
    ctx.lineTo(hx + 20, hy - 34);
    ctx.lineTo(hx + 15, hy + 18);
    ctx.lineTo(hx - 15, hy + 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(hx - 14, hy - 12, 28, 26);
  } else if (prop === 'tea_cup') {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    ctx.fillRect(hx - 18, hy - 14, 34, 28);
    ctx.strokeRect(hx - 18, hy - 14, 34, 28);

    ctx.beginPath();
    ctx.arc(hx + 18, hy, 8, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    const steamY = (t * 28) % 16;
    ctx.beginPath();
    ctx.moveTo(hx - 6, hy - 22 - steamY);
    ctx.quadraticCurveTo(hx + 4, hy - 34 - steamY, hx - 4, hy - 44 - steamY);
    ctx.stroke();
  } else if (prop === 'smartphone') {
    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, hx - 14, hy - 26, 28, 46, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7DD3FC';
    ctx.fillRect(hx - 10, hy - 20, 20, 32);
  } else if (prop === 'money') {
    ctx.fillStyle = '#22C55E';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.5;
    ctx.fillRect(hx - 24, hy - 14, 48, 28);
    ctx.strokeRect(hx - 24, hy - 14, 48, 28);
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('৳', hx, hy + 1);
  } else if (prop === 'laptop') {
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    ctx.fillRect(hx - 32, hy - 34, 64, 42);
    ctx.strokeRect(hx - 32, hy - 34, 64, 42);
    ctx.fillStyle = '#93C5FD';
    ctx.fillRect(hx - 26, hy - 28, 52, 30);
    ctx.fillStyle = '#64748B';
    ctx.fillRect(hx - 40, hy + 8, 80, 9);
  } else if (prop === 'clock') {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(hx, hy - 18, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx, hy - 18);
    ctx.lineTo(hx, hy - 34);
    ctx.moveTo(hx, hy - 18);
    ctx.lineTo(hx + 12, hy - 18);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLayeredCartoonCharacter(
  ctx: CanvasRenderingContext2D,
  char: VideoCharacterState,
  baseX: number,
  groundY: number,
  facing: 1 | -1,
  globalT: number,
  localT: number,
  sceneDur: number,
  isSpeaking: boolean
) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const look = getCharacterAppearance(char.id);

  let x = baseX;
  let yOffset = 0;
  let tilt = 0;
  let breathe = Math.sin(globalT * 3.4 + baseX * 0.02) * 3;

  if (char.action === 'walk_in') {
    const p = easeInOutCubic(Math.min(1, localT / Math.min(1.4, sceneDur * 0.5)));
    x = baseX + facing * -200 * (1 - p);
    yOffset = -Math.abs(Math.sin(localT * 10)) * 12 * (1 - p);
  } else if (char.action === 'run') {
    const p = Math.min(1, localT / Math.max(0.8, sceneDur));
    x = baseX - facing * p * 180;
    yOffset = -Math.abs(Math.sin(localT * 18)) * 18;
    tilt = -facing * 0.16;
  } else if (char.action === 'shocked_jump') {
    const jumpP = Math.sin(Math.min(1, localT * 2.4) * Math.PI);
    yOffset = -jumpP * 68;
  } else if (char.action === 'laugh' || char.action === 'point_laugh') {
    yOffset = -Math.abs(Math.sin(globalT * 12)) * 9;
    tilt = Math.sin(globalT * 10) * 0.04;
  } else if (char.action === 'panting') {
    breathe = Math.sin(globalT * 11) * 7;
    tilt = facing * 0.09;
  } else if (char.action === 'sip_tea') {
    tilt = Math.sin(globalT * 2.5) * 0.03;
  }

  const hipY = groundY - 124 + yOffset + breathe * 0.35;
  const shoulderY = hipY - 96;
  const headY = shoulderY - 56;
  const headR = 46;

  // Ground drop shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.beginPath();
  ctx.ellipse(x, groundY + 4, 52, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(x, groundY);
  ctx.rotate(tilt);
  ctx.translate(-x, -groundY);

  // Legs + shoes
  const legStride =
    char.action === 'run'
      ? Math.sin(globalT * 22) * 32
      : char.action === 'walk_in'
        ? Math.sin(localT * 12) * 20
        : 0;

  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(x - 16, hipY);
  ctx.lineTo(x - 24 - legStride, groundY - 8);
  ctx.moveTo(x + 16, hipY);
  ctx.lineTo(x + 24 + legStride, groundY - 8);
  ctx.stroke();

  ctx.strokeStyle = look.pants;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(x - 16, hipY);
  ctx.lineTo(x - 24 - legStride, groundY - 8);
  ctx.moveTo(x + 16, hipY);
  ctx.lineTo(x + 24 + legStride, groundY - 8);
  ctx.stroke();

  // Shoes
  ctx.fillStyle = look.shoe;
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 3.5;
  [-1, 1].forEach((dir, idx) => {
    const sx = x + dir * 24 + (idx === 0 ? -legStride : legStride);
    ctx.beginPath();
    ctx.ellipse(sx + facing * 6, groundY - 4, 17, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Layered Torso / Outfit
  ctx.fillStyle = look.shirt;
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - 32, shoulderY + 6);
  ctx.quadraticCurveTo(x, shoulderY - 8, x + 32, shoulderY + 6);
  ctx.lineTo(x + 38, hipY + 8);
  ctx.quadraticCurveTo(x, hipY + 14, x - 38, hipY + 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Outfit shading & details
  ctx.fillStyle = look.shirtShade;
  ctx.beginPath();
  ctx.moveTo(x + 6, shoulderY + 4);
  ctx.lineTo(x + 30, shoulderY + 8);
  ctx.lineTo(x + 35, hipY + 6);
  ctx.lineTo(x + 10, hipY + 8);
  ctx.closePath();
  ctx.fill();

  if (char.id === 'boss') {
    // White shirt V-collar + red tie
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(x - 12, shoulderY);
    ctx.lineTo(x + 12, shoulderY);
    ctx.lineTo(x, shoulderY + 34);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#EF4444';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - 5, shoulderY + 4);
    ctx.lineTo(x + 5, shoulderY + 4);
    ctx.lineTo(x + 7, shoulderY + 52);
    ctx.lineTo(x, shoulderY + 64);
    ctx.lineTo(x - 7, shoulderY + 52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (char.id === 'chacha') {
    // Traditional vest lines
    ctx.fillStyle = '#334155';
    ctx.fillRect(x - 24, shoulderY + 6, 16, 72);
    ctx.fillRect(x + 8, shoulderY + 6, 16, 72);
  }

  // Arms + Hands
  let leftHand = { x: x - 52, y: hipY - 12 };
  let rightHand = { x: x + 52, y: hipY - 12 };

  if (char.action === 'point_laugh') {
    if (facing === 1) {
      rightHand = { x: x + 84, y: shoulderY + 4 + Math.sin(globalT * 14) * 7 };
      leftHand = { x: x - 38, y: hipY - 22 };
    } else {
      leftHand = { x: x - 84, y: shoulderY + 4 + Math.sin(globalT * 14) * 7 };
      rightHand = { x: x + 38, y: hipY - 22 };
    }
  } else if (char.action === 'hands_up' || char.action === 'shocked_jump') {
    leftHand = { x: x - 64, y: headY - 24 };
    rightHand = { x: x + 64, y: headY - 24 };
  } else if (char.action === 'facepalm') {
    rightHand = { x: x + facing * 12, y: headY + 4 };
    leftHand = { x: x - 48, y: hipY - 10 };
  } else if (char.action === 'sip_tea') {
    const sip = Math.sin(globalT * 3) * 14;
    rightHand = { x: x + facing * 48, y: shoulderY - 14 + sip };
  } else if (char.action === 'pour_water') {
    rightHand = { x: x + facing * 64, y: shoulderY - 22 };
    leftHand = { x: x - facing * 46, y: hipY - 16 };
  } else if (char.action === 'run') {
    leftHand = { x: x - 54 - legStride * 0.5, y: shoulderY + 34 };
    rightHand = { x: x + 54 + legStride * 0.5, y: shoulderY + 34 };
  } else if (char.prop !== 'none') {
    if (facing === 1) {
      rightHand = { x: x + 62, y: shoulderY + 18 };
    } else {
      leftHand = { x: x - 62, y: shoulderY + 18 };
    }
  }

  // Draw arms with shirt sleeves + skin hands
  [
    { sx: x - 28, sy: shoulderY + 14, hx: leftHand.x, hy: leftHand.y },
    { sx: x + 28, sy: shoulderY + 14, hx: rightHand.x, hy: rightHand.y },
  ].forEach((arm) => {
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(arm.sx, arm.sy);
    ctx.lineTo(arm.hx, arm.hy);
    ctx.stroke();

    ctx.strokeStyle = look.shirt;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(arm.sx, arm.sy);
    ctx.lineTo((arm.sx + arm.hx) / 2, (arm.sy + arm.hy) / 2);
    ctx.stroke();

    ctx.strokeStyle = look.skin;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo((arm.sx + arm.hx) / 2, (arm.sy + arm.hy) / 2);
    ctx.lineTo(arm.hx, arm.hy);
    ctx.stroke();

    ctx.fillStyle = look.skin;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(arm.hx, arm.hy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Props held in active hand
  const activeHand = facing === 1 ? rightHand : leftHand;
  drawProp(ctx, char.prop, activeHand.x, activeHand.y, globalT);

  // Head
  ctx.fillStyle = look.skin;
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Character hair & accessories
  if (char.id === 'rafu') {
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.moveTo(x - 36, headY - 22);
    ctx.lineTo(x - 24, headY - 58);
    ctx.lineTo(x - 6, headY - 40);
    ctx.lineTo(x + 8, headY - 64);
    ctx.lineTo(x + 22, headY - 40);
    ctx.lineTo(x + 38, headY - 52);
    ctx.lineTo(x + 36, headY - 20);
    ctx.quadraticCurveTo(x, headY - 38, x - 36, headY - 22);
    ctx.fill();
  } else if (char.id === 'folk') {
    // Neat hair + glasses
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.arc(x, headY - 12, headR - 2, Math.PI * 1.1, Math.PI * 1.9);
    ctx.fill();
  } else if (char.id === 'chacha') {
    // Topi
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, x - 30, headY - headR - 12, 60, 22, 8);
    ctx.fill();
    ctx.stroke();
  } else if (char.id === 'friend') {
    // Baseball cap
    ctx.fillStyle = '#DC2626';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, headY - 18, 42, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + facing * 12, headY - 18);
    ctx.lineTo(x + facing * 58, headY - 12);
    ctx.lineWidth = 7;
    ctx.stroke();
  }

  // Facial Expressions + Blinking + Lip-sync!
  const eyeY = headY - 6;
  const eyeL = x - 16 + facing * 5;
  const eyeR = x + 16 + facing * 5;
  const blinkPhase = (globalT + baseX * 0.01) % 3.4;
  const isBlinking = blinkPhase > 3.26 && char.expression !== 'shocked';

  const isPopping =
    char.action === 'eye_pop' || char.expression === 'shocked';
  const eyeRSize = isPopping ? 13 : 8;

  if (isBlinking || char.expression === 'laughing') {
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    [eyeL, eyeR].forEach((ex) => {
      ctx.beginPath();
      if (char.expression === 'laughing') {
        ctx.arc(ex, eyeY + 3, 9, Math.PI * 1.1, Math.PI * 1.9);
      } else {
        ctx.moveTo(ex - 7, eyeY);
        ctx.lineTo(ex + 7, eyeY);
      }
      ctx.stroke();
    });
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3;
    [eyeL, eyeR].forEach((ex) => {
      ctx.beginPath();
      ctx.arc(ex, eyeY, eyeRSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(ex + facing * 2.5, eyeY, isPopping ? 4.5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
    });
  }

  // Glasses for Folk
  if (char.id === 'folk') {
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(eyeL - 12, eyeY - 10, 24, 20);
    ctx.strokeRect(eyeR - 12, eyeY - 10, 24, 20);
    ctx.beginPath();
    ctx.moveTo(eyeL + 12, eyeY);
    ctx.lineTo(eyeR - 12, eyeY);
    ctx.stroke();
  }

  // Eyebrows
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 4;
  if (char.expression === 'angry') {
    ctx.beginPath();
    ctx.moveTo(eyeL - 10, eyeY - 16);
    ctx.lineTo(eyeL + 8, eyeY - 10);
    ctx.moveTo(eyeR + 10, eyeY - 16);
    ctx.lineTo(eyeR - 8, eyeY - 10);
    ctx.stroke();
  } else if (char.expression === 'shocked' || char.expression === 'confused') {
    ctx.beginPath();
    ctx.arc(eyeL, eyeY - 17, 10, Math.PI * 1.15, Math.PI * 1.85);
    ctx.arc(eyeR, eyeY - 17, 10, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  // Chacha mustache
  if (char.id === 'chacha') {
    ctx.fillStyle = '#E2E8F0';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(x + facing * 4 - 8, headY + 12, 10, 5, -0.2, 0, Math.PI * 2);
    ctx.ellipse(x + facing * 4 + 8, headY + 12, 10, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Real-time Lip-Sync Mouth!
  const mouthX = x + facing * 4;
  const mouthY = headY + 21;
  if (isSpeaking) {
    const openAmt = 4 + Math.abs(Math.sin(globalT * 24)) * 10;
    ctx.fillStyle = '#991B1B';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY, 13, openAmt, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tongue
    ctx.fillStyle = '#F87171';
    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY + openAmt * 0.35, 7, openAmt * 0.4, 0, 0, Math.PI);
    ctx.fill();
  } else if (char.expression === 'laughing' || char.expression === 'happy') {
    ctx.fillStyle = '#991B1B';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(mouthX, mouthY - 4, 15, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (char.expression === 'shocked') {
    ctx.fillStyle = '#991B1B';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY + 2, 10, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (char.expression === 'angry' || char.expression === 'crying') {
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(mouthX, mouthY + 12, 13, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(mouthX - 11, mouthY);
    ctx.lineTo(mouthX + 11, mouthY);
    ctx.stroke();
  }

  // Sweat drops for exhausted / shocked
  if (char.expression === 'exhausted' || char.expression === 'shocked') {
    const dropY = (globalT * 28) % 16;
    ctx.fillStyle = '#38BDF8';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x - 36, headY - 18 + dropY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function drawReelsSubtitle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  speakerName: string,
  badgeColor: string,
  text: string,
  subtitleStyle: 'reels_bold' | 'comic_bubble'
) {
  if (!text.trim()) return;
  ctx.save();

  if (subtitleStyle === 'comic_bubble') {
    ctx.font = '700 28px "Hind Siliguri", "Noto Sans Bengali", sans-serif';
    const lines = wrapLines(ctx, text, w - 120);
    const boxW = Math.min(w - 64, Math.max(240, ...lines.map((l) => ctx.measureText(l).width + 64)));
    const boxH = lines.length * 36 + 40;
    const bx = (w - boxW) / 2;
    const by = 135;

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 5;
    drawRoundedRect(ctx, bx, by, boxW, boxH, 22);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((ln, i) => {
      ctx.fillText(ln, w / 2, by + 34 + i * 36);
    });
    ctx.restore();
    return;
  }

  // Modern Reels Bold Subtitle Card at lower-third
  ctx.font = '700 32px "Hind Siliguri", "Noto Sans Bengali", sans-serif';
  const lines = wrapLines(ctx, text, w - 100);
  const boxW = w - 64;
  const boxH = lines.length * 42 + 64;
  const bx = 32;
  const by = h - boxH - 58;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = badgeColor;
  ctx.lineWidth = 3.5;
  drawRoundedRect(ctx, bx, by, boxW, boxH, 18);
  ctx.fill();
  ctx.stroke();

  // Speaker pill tag on top edge of subtitle card
  ctx.font = '700 20px "Hind Siliguri", "Noto Sans Bengali", sans-serif';
  const nameW = Math.max(88, ctx.measureText(speakerName).width + 28);
  ctx.fillStyle = badgeColor;
  drawRoundedRect(ctx, bx + 20, by - 16, nameW, 30, 8);
  ctx.fill();

  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(speakerName, bx + 20 + nameW / 2, by - 1);

  // Bold high-contrast Bangla caption lines
  ctx.font = '700 32px "Hind Siliguri", "Noto Sans Bengali", sans-serif';
  ctx.fillStyle = '#F8FAFC';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((ln, i) => {
    ctx.fillText(ln, w / 2, by + 44 + i * 42);
  });

  ctx.restore();
}

function drawVideoWatermark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  branding: BrandingConfig
) {
  const text = (branding.logoText || '@@RAFU FOLK@@').trim();
  if (!text) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0.25, Math.min(1, branding.logoOpacity));
  ctx.font = '800 22px "Plus Jakarta Sans", "Hind Siliguri", sans-serif';
  const tw = ctx.measureText(text).width + 28;
  const padX = w - tw - 24;
  const padY = 26;

  ctx.fillStyle = '#0F172A';
  ctx.strokeStyle = '#FACC15';
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, padX, padY, tw, 38, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FACC15';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, padX + tw / 2, padY + 19);
  ctx.restore();
}

export function getSceneAtTime(
  script: VideoScript,
  timeSec: number
): { scene: VideoScene; localT: number; sceneStart: number } {
  let cursor = 0;
  for (const sc of script.scenes) {
    if (timeSec <= cursor + sc.durationSec) {
      return { scene: sc, localT: Math.max(0, timeSec - cursor), sceneStart: cursor };
    }
    cursor += sc.durationSec;
  }
  const last = script.scenes[script.scenes.length - 1];
  return {
    scene: last,
    localT: last ? last.durationSec : 0,
    sceneStart: Math.max(0, cursor - (last?.durationSec || 0)),
  };
}

function getActiveSpeakerAtTime(
  script: VideoScript,
  scene: VideoScene,
  localT: number
): { charIndex: number; text: string } {
  const voiceClips: VideoVoiceClip[] = (script.voiceClips || []).filter(
    (c) => c.sceneIndex === scene.sceneIndex
  );
  if (voiceClips.length > 0) {
    const active = voiceClips.find(
      (c) => localT >= c.offsetInSceneSec && localT <= c.offsetInSceneSec + c.durationSec + 0.15
    );
    if (active) {
      return { charIndex: active.charIndex, text: active.text };
    }
    // Between clips: show latest clip up to localT
    const past = voiceClips.filter((c) => localT >= c.offsetInSceneSec);
    if (past.length > 0) {
      const last = past[past.length - 1];
      return { charIndex: -1, text: last.text };
    }
    return { charIndex: -1, text: '' };
  }

  // Fallback without voiceClips: alternate characters across scene duration
  const speakers = scene.characters
    .map((c, idx) => ({ idx, speech: (c.speech || '').trim() }))
    .filter((s) => s.speech.length > 0);
  if (speakers.length === 0) return { charIndex: -1, text: '' };

  const slice = scene.durationSec / speakers.length;
  const pickIdx = Math.min(speakers.length - 1, Math.floor(localT / Math.max(0.1, slice)));
  return { charIndex: speakers[pickIdx].idx, text: speakers[pickIdx].speech };
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

  const { scene, localT } = getSceneAtTime(script, timeSec);
  if (!scene) return;

  const groundY = Math.round(h * 0.74);

  // Camera transform
  ctx.save();
  let camScale = 1;
  let camFocusX = w / 2;
  let camFocusY = h * 0.56;
  let shakeX = 0;
  let shakeY = 0;

  if (scene.camera === 'zoom_left') {
    camScale = 1 + 0.18 * easeInOutCubic(Math.min(1, localT / Math.max(0.8, scene.durationSec * 0.7)));
    camFocusX = w * 0.34;
  } else if (scene.camera === 'zoom_right') {
    camScale = 1 + 0.18 * easeInOutCubic(Math.min(1, localT / Math.max(0.8, scene.durationSec * 0.7)));
    camFocusX = w * 0.66;
  } else if (scene.camera === 'zoom_center') {
    camScale = 1 + 0.14 * easeInOutCubic(Math.min(1, localT / Math.max(0.8, scene.durationSec * 0.7)));
  } else if (scene.camera === 'shake') {
    shakeX = Math.sin(timeSec * 44) * 9;
    shakeY = Math.cos(timeSec * 38) * 6;
  }

  ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
  ctx.scale(camScale, camScale);
  ctx.translate(-camFocusX, -camFocusY);

  drawThemeBackground(ctx, w, h, scene.theme, timeSec, localT, groundY);

  const activeSpeaker = getActiveSpeakerAtTime(script, scene, localT);

  // Draw layered cartoon characters
  scene.characters.forEach((ch, idx) => {
    const posX =
      ch.side === 'left'
        ? w * 0.3
        : ch.side === 'right'
          ? w * 0.7
          : w * 0.5;
    const facing: 1 | -1 = ch.side === 'right' ? -1 : 1;
    const isSpeaking = activeSpeaker.charIndex === idx;
    drawLayeredCartoonCharacter(
      ctx,
      ch,
      posX,
      groundY,
      facing,
      timeSec,
      localT,
      scene.durationSec,
      isSpeaking
    );
  });

  ctx.restore();

  // Top-left Scene Caption Badge
  if (scene.captionTop && scene.captionTop.trim()) {
    ctx.save();
    ctx.font = '700 22px "Hind Siliguri", "Noto Sans Bengali", sans-serif';
    const capText = scene.captionTop.trim();
    const tw = Math.min(w - 220, ctx.measureText(capText).width + 36);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.96)';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, 24, 26, tw, 40, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(capText, 24 + tw / 2, 46);
    ctx.restore();
  }

  // Reels Bold Subtitle or Comic Bubble
  if (activeSpeaker.text) {
    const speakingChar =
      activeSpeaker.charIndex >= 0
        ? scene.characters[activeSpeaker.charIndex]
        : scene.characters.find((c) => c.speech === activeSpeaker.text) || scene.characters[0];
    const badgeColor = speakingChar
      ? getCharacterAppearance(speakingChar.id).badgeColor
      : '#FACC15';
    drawReelsSubtitle(
      ctx,
      w,
      h,
      speakingChar?.name || '@@RAFU FOLK@@',
      badgeColor,
      activeSpeaker.text,
      script.subtitleStyle || 'reels_bold'
    );
  }

  // Top Progress Bar
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(24, h - 18, w - 48, 5);
  ctx.fillStyle = '#FACC15';
  const progRatio = Math.min(1, timeSec / Math.max(0.1, script.totalDurationSec));
  ctx.fillRect(24, h - 18, (w - 48) * progRatio, 5);
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
  recorderMime: string;
  baseMime: 'video/mp4' | 'video/webm';
  extension: 'mp4' | 'webm';
} {
  const candidates: Array<{
    recorderMime: string;
    baseMime: 'video/mp4' | 'video/webm';
    extension: 'mp4' | 'webm';
  }> = [
    { recorderMime: 'video/mp4;codecs=avc1,mp4a.40.2', baseMime: 'video/mp4', extension: 'mp4' },
    { recorderMime: 'video/mp4', baseMime: 'video/mp4', extension: 'mp4' },
    { recorderMime: 'video/webm;codecs=vp9,opus', baseMime: 'video/webm', extension: 'webm' },
    { recorderMime: 'video/webm;codecs=vp8,opus', baseMime: 'video/webm', extension: 'webm' },
    { recorderMime: 'video/webm', baseMime: 'video/webm', extension: 'webm' },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.recorderMime)) {
      return c;
    }
  }
  return { recorderMime: 'video/webm', baseMime: 'video/webm', extension: 'webm' };
}

export async function recordVideoFromScript(
  script: VideoScript,
  branding: BrandingConfig,
  onProgress?: (pct: number) => void
): Promise<RenderedVideoResult> {
  await preloadThemeBackgrounds();
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const canvas = document.createElement('canvas');
  const { width, height } = getVideoDimensions(script.aspectRatio);
  canvas.width = width;
  canvas.height = height;

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

  const { recorderMime, baseMime, extension } = pickSupportedRecorderMime();
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(combinedStream, {
    mimeType: recorderMime,
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
      // Use clean baseMime (no unquoted ;codecs= parameter!) so FormData/Multer always preserves valid MIME
      const blob = new Blob(chunks, { type: baseMime });
      const objectUrl = URL.createObjectURL(blob);
      onProgress?.(100);
      resolve({
        blob,
        mimeType: baseMime,
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

      if (elapsedMs < totalMs + 160) {
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
