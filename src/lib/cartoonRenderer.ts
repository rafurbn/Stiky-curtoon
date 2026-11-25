import type {
  BrandingConfig,
  ComicCharacter,
  ComicPanel,
  ComicScript,
  ExpressionType,
  PaperTheme,
  PoseType,
  PropType,
} from '../types/comic';

function createRng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function drawSketchLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rng: () => number,
  wobble = 1.1
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(2, Math.floor(dist / 18));
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const nx = x1 + dx * t + (rng() - 0.5) * wobble * 2;
    const ny = y1 + dy * t + (rng() - 0.5) * wobble * 2;
    ctx.lineTo(nx, ny);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawSketchCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rng: () => number,
  fill?: string,
  wobble = 0.9
) {
  const segs = 22;
  ctx.beginPath();
  for (let i = 0; i <= segs; i++) {
    const angle = (i / segs) * Math.PI * 2;
    const rad = r + (rng() - 0.5) * wobble;
    const px = cx + Math.cos(angle) * rad;
    const py = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.stroke();
}

function drawPaperBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: PaperTheme,
  rng: () => number
) {
  const palette: Record<PaperTheme, { bg: string; dot: string; line?: string }> = {
    cream_sketch: { bg: '#FCF8EE', dot: 'rgba(120, 100, 70, 0.05)' },
    studio_white: { bg: '#FFFFFF', dot: 'rgba(15, 23, 42, 0.035)' },
    notebook_grid: {
      bg: '#FAF9F4',
      dot: 'rgba(15, 23, 42, 0.03)',
      line: 'rgba(59, 130, 246, 0.11)',
    },
    sunny_tint: { bg: '#FFFBEB', dot: 'rgba(180, 130, 20, 0.05)' },
    chalk_mint: { bg: '#F4FAF7', dot: 'rgba(20, 83, 45, 0.04)' },
  };

  const p = palette[theme] || palette.cream_sketch;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, width, height);

  if (p.line) {
    ctx.save();
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    for (let y = 36; y < height; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.16)';
    ctx.beginPath();
    ctx.moveTo(54, 0);
    ctx.lineTo(54, height);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = p.dot;
  for (let i = 0; i < 240; i++) {
    const x = rng() * width;
    const y = rng() * height;
    const size = 1 + rng() * 1.6;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      if (ctx.measureText(word).width > maxWidth) {
        let partial = '';
        for (const ch of word) {
          if (ctx.measureText(partial + ch).width <= maxWidth) {
            partial += ch;
          } else {
            if (partial) lines.push(partial);
            partial = ch;
          }
        }
        current = partial;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  anchorY: number,
  targetX: number,
  targetY: number,
  maxBubbleW: number,
  isThought: boolean,
  rng: () => number
) {
  ctx.save();
  const fontSize = maxBubbleW > 320 ? 22 : 19;
  ctx.font = `600 ${fontSize}px "Hind Siliguri", "Noto Sans Bengali", "Plus Jakarta Sans", sans-serif`;
  const paddingX = 18;
  const paddingY = 12;
  const lineHeight = fontSize * 1.35;

  const lines = wrapTextLines(ctx, text, maxBubbleW - paddingX * 2);
  let longestLine = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > longestLine) longestLine = w;
  }

  const boxW = Math.max(100, Math.min(maxBubbleW, longestLine + paddingX * 2));
  const boxH = Math.max(46, lines.length * lineHeight + paddingY * 2);

  const bx = Math.max(14, anchorX - boxW / 2);
  const by = Math.max(12, anchorY - boxH / 2);

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (isThought) {
    // Cloud style thought bubble
    const r = 18;
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, r);
    ctx.fill();
    ctx.stroke();

    const midX = bx + boxW * 0.5;
    const startY = by + boxH;
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const cx = midX + (targetX - midX) * t;
      const cy = startY + (targetY - startY) * t;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(3, 8 - i * 1.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    // Classic rounded comic bubble with pointer tail
    const r = 16;
    const tailBaseX = Math.max(bx + 22, Math.min(bx + boxW - 22, targetX));
    const tailTipX = Math.max(bx + 10, Math.min(bx + boxW - 10, targetX));
    const tailTipY = Math.min(by + boxH + 22, targetY - 6);

    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + boxW - r, by);
    ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + r);
    ctx.lineTo(bx + boxW, by + boxH - r);
    ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - r, by + boxH);
    ctx.lineTo(tailBaseX + 10, by + boxH);
    ctx.lineTo(tailTipX, tailTipY);
    ctx.lineTo(tailBaseX - 8, by + boxH);
    ctx.lineTo(bx + r, by + boxH);
    ctx.quadraticCurveTo(bx, by + boxH, bx, by + boxH - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();

    // Subtle comic drop offset
    ctx.save();
    ctx.translate(3, 3);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const startTextY = by + boxH / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, idx) => {
    const wobbleX = (rng() - 0.5) * 0.2;
    ctx.fillText(line, bx + boxW / 2 + wobbleX, startTextY + idx * lineHeight);
  });

  ctx.restore();
}

function drawExpression(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  expression: ExpressionType
) {
  ctx.save();
  ctx.strokeStyle = '#0F172A';
  ctx.fillStyle = '#0F172A';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const eyeY = cy - r * 0.12;
  const eyeOffset = r * 0.34;
  const mouthY = cy + r * 0.36;

  switch (expression) {
    case 'happy': {
      ctx.beginPath();
      ctx.arc(cx - eyeOffset, eyeY, 2.8, 0, Math.PI * 2);
      ctx.arc(cx + eyeOffset, eyeY, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, mouthY - 3, r * 0.36, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      break;
    }
    case 'laughing': {
      // ^ ^ eyes
      [-1, 1].forEach((dir) => {
        const ex = cx + dir * eyeOffset;
        ctx.beginPath();
        ctx.moveTo(ex - 5, eyeY + 2);
        ctx.lineTo(ex, eyeY - 4);
        ctx.lineTo(ex + 5, eyeY + 2);
        ctx.stroke();
      });
      // Open D laugh mouth
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.42, mouthY - 4);
      ctx.lineTo(cx + r * 0.42, mouthY - 4);
      ctx.arc(cx, mouthY - 4, r * 0.42, 0, Math.PI);
      ctx.closePath();
      ctx.fillStyle = '#EF4444';
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'shocked': {
      // Wide O eyes + raised brows
      [-1, 1].forEach((dir) => {
        const ex = cx + dir * eyeOffset;
        ctx.beginPath();
        ctx.arc(ex, eyeY, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, eyeY, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = '#0F172A';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex, eyeY - 9, 5, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.ellipse(cx, mouthY + 2, 5.5, 7.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#0F172A';
      ctx.fill();
      break;
    }
    case 'angry': {
      [-1, 1].forEach((dir) => {
        const ex = cx + dir * eyeOffset;
        ctx.beginPath();
        ctx.arc(ex, eyeY + 1, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ex - dir * 6, eyeY - 7);
        ctx.lineTo(ex + dir * 5, eyeY - 2);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.arc(cx, mouthY + 8, r * 0.34, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
      break;
    }
    case 'deadpan': {
      [-1, 1].forEach((dir) => {
        const ex = cx + dir * eyeOffset;
        ctx.beginPath();
        ctx.moveTo(ex - 5, eyeY);
        ctx.lineTo(ex + 5, eyeY);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, eyeY + 2, 2.1, 0, Math.PI);
        ctx.fill();
      });
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.28, mouthY + 2);
      ctx.lineTo(cx + r * 0.28, mouthY + 2);
      ctx.stroke();
      break;
    }
    case 'confused': {
      ctx.beginPath();
      ctx.arc(cx - eyeOffset, eyeY, 3.2, 0, Math.PI * 2);
      ctx.arc(cx + eyeOffset, eyeY, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - eyeOffset - 5, eyeY - 8);
      ctx.quadraticCurveTo(cx - eyeOffset, eyeY - 12, cx - eyeOffset + 5, eyeY - 7);
      ctx.moveTo(cx + eyeOffset - 5, eyeY - 5);
      ctx.lineTo(cx + eyeOffset + 5, eyeY - 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, mouthY + 2);
      ctx.quadraticCurveTo(cx - r * 0.1, mouthY - 3, cx, mouthY + 2);
      ctx.quadraticCurveTo(cx + r * 0.1, mouthY + 7, cx + r * 0.3, mouthY + 2);
      ctx.stroke();
      break;
    }
    case 'crying': {
      [-1, 1].forEach((dir) => {
        const ex = cx + dir * eyeOffset;
        ctx.beginPath();
        ctx.moveTo(ex - 4, eyeY);
        ctx.quadraticCurveTo(ex, eyeY - 5, ex + 4, eyeY);
        ctx.stroke();
        // Tear streams
        ctx.save();
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ex, eyeY + 3);
        ctx.lineTo(ex + dir * 2, eyeY + 18);
        ctx.stroke();
        ctx.restore();
      });
      ctx.beginPath();
      ctx.arc(cx, mouthY + 8, r * 0.32, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
      break;
    }
    case 'smug': {
      [-1, 1].forEach((dir) => {
        const ex = cx + dir * eyeOffset;
        ctx.beginPath();
        ctx.moveTo(ex - 5, eyeY - 2);
        ctx.lineTo(ex + 5, eyeY - 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex + 1, eyeY + 1, 2.4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.25, mouthY + 2);
      ctx.quadraticCurveTo(cx + r * 0.1, mouthY + 6, cx + r * 0.38, mouthY - 3);
      ctx.stroke();
      break;
    }
    case 'wink': {
      ctx.beginPath();
      ctx.arc(cx - eyeOffset, eyeY, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + eyeOffset - 5, eyeY - 3);
      ctx.lineTo(cx + eyeOffset + 4, eyeY);
      ctx.lineTo(cx + eyeOffset - 5, eyeY + 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, mouthY - 2, r * 0.34, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawCharacterDetails(
  ctx: CanvasRenderingContext2D,
  id: ComicCharacter['id'],
  hx: number,
  hy: number,
  r: number,
  bodyTopY: number,
  facing: 1 | -1
) {
  ctx.save();
  ctx.strokeStyle = '#0F172A';
  ctx.fillStyle = '#0F172A';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (id === 'rafu') {
    // Spiky comic tuft
    ctx.beginPath();
    ctx.moveTo(hx - 10, hy - r + 2);
    ctx.lineTo(hx - 14, hy - r - 12);
    ctx.lineTo(hx - 3, hy - r - 4);
    ctx.lineTo(hx + 3, hy - r - 16);
    ctx.lineTo(hx + 9, hy - r - 3);
    ctx.lineTo(hx + 16, hy - r - 10);
    ctx.lineTo(hx + 12, hy - r + 3);
    ctx.stroke();
  } else if (id === 'folk') {
    // Round comic glasses
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(hx - r * 0.34, hy - r * 0.12, 8.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx + r * 0.34, hy - r * 0.12, 8.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.34 + 8.5, hy - r * 0.12);
    ctx.lineTo(hx + r * 0.34 - 8.5, hy - r * 0.12);
    ctx.stroke();
    // Curly top
    ctx.beginPath();
    ctx.arc(hx - 6, hy - r - 2, 5, Math.PI, 0);
    ctx.arc(hx + 4, hy - r - 3, 6, Math.PI, 0);
    ctx.stroke();
  } else if (id === 'boss') {
    // Tie at chest
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.moveTo(hx, bodyTopY + 2);
    ctx.lineTo(hx - 5, bodyTopY + 18);
    ctx.lineTo(hx, bodyTopY + 26);
    ctx.lineTo(hx + 5, bodyTopY + 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Side hair sweep
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.7, hy - r * 0.55);
    ctx.quadraticCurveTo(hx, hy - r - 10, hx + r * 0.75, hy - r * 0.45);
    ctx.stroke();
  } else if (id === 'chacha') {
    // Classic mustache
    ctx.beginPath();
    ctx.moveTo(hx, hy + r * 0.16);
    ctx.quadraticCurveTo(hx - 10, hy + r * 0.08, hx - 14, hy + r * 0.25);
    ctx.moveTo(hx, hy + r * 0.16);
    ctx.quadraticCurveTo(hx + 10, hy + r * 0.08, hx + 14, hy + r * 0.25);
    ctx.stroke();
    // Cap / Topi
    ctx.fillStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.52, r * 0.72, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (id === 'friend') {
    // Backwards cap
    ctx.fillStyle = '#2563EB';
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.45, r * 0.78, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx - facing * r * 0.75, hy - r * 0.45);
    ctx.lineTo(hx - facing * (r * 0.75 + 16), hy - r * 0.38);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  char: ComicCharacter,
  x: number,
  groundY: number,
  scale: number,
  facing: 1 | -1,
  rng: () => number
) {
  ctx.save();
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const legH = 54 * scale;
  const torsoH = 56 * scale;
  const headR = 26 * scale;

  const hipY = groundY - legH;
  const shoulderY = hipY - torsoH + 10 * scale;
  const neckY = hipY - torsoH;
  const headY = neckY - headR;
  const leanX = char.pose === 'running' ? facing * 12 * scale : 0;

  // Ground shadow
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.09)';
  ctx.beginPath();
  ctx.ellipse(x, groundY + 3, 28 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Legs
  if (char.pose === 'sitting_desk') {
    drawSketchLine(ctx, x, hipY, x + facing * 24 * scale, hipY + 12 * scale, rng);
    drawSketchLine(
      ctx,
      x + facing * 24 * scale,
      hipY + 12 * scale,
      x + facing * 24 * scale,
      groundY,
      rng
    );
  } else if (char.pose === 'running') {
    drawSketchLine(ctx, x, hipY, x - facing * 24 * scale, groundY - 4, rng);
    drawSketchLine(ctx, x, hipY, x + facing * 22 * scale, groundY - 12, rng);
    // Speed lines
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 2;
    drawSketchLine(ctx, x - facing * 48, shoulderY, x - facing * 24, shoulderY, rng);
    drawSketchLine(ctx, x - facing * 54, hipY - 10, x - facing * 26, hipY - 10, rng);
    ctx.restore();
  } else {
    drawSketchLine(ctx, x, hipY, x - 16 * scale, groundY, rng);
    drawSketchLine(ctx, x, hipY, x + 16 * scale, groundY, rng);
  }

  // Torso
  drawSketchLine(ctx, x, hipY, x + leanX, neckY, rng);

  // Arms by pose
  const pose: PoseType = char.pose;
  const sx = x + leanX * 0.8;
  if (pose === 'pointing') {
    drawSketchLine(ctx, sx, shoulderY, sx + facing * 42 * scale, shoulderY - 8 * scale, rng);
    drawSketchLine(ctx, sx, shoulderY, sx - facing * 18 * scale, shoulderY + 28 * scale, rng);
  } else if (pose === 'facepalm') {
    drawSketchLine(ctx, sx, shoulderY, sx + facing * 20 * scale, shoulderY - 10 * scale, rng);
    drawSketchLine(
      ctx,
      sx + facing * 20 * scale,
      shoulderY - 10 * scale,
      x + leanX + facing * 6 * scale,
      headY + 4 * scale,
      rng
    );
    drawSketchLine(ctx, sx, shoulderY, sx - facing * 16 * scale, shoulderY + 30 * scale, rng);
  } else if (pose === 'hands_up') {
    drawSketchLine(ctx, sx, shoulderY, sx - 26 * scale, shoulderY - 34 * scale, rng);
    drawSketchLine(ctx, sx, shoulderY, sx + 26 * scale, shoulderY - 34 * scale, rng);
  } else if (pose === 'shrugging') {
    drawSketchLine(ctx, sx, shoulderY, sx - 20 * scale, shoulderY + 14 * scale, rng);
    drawSketchLine(ctx, sx - 20 * scale, shoulderY + 14 * scale, sx - 32 * scale, shoulderY - 2 * scale, rng);
    drawSketchLine(ctx, sx, shoulderY, sx + 20 * scale, shoulderY + 14 * scale, rng);
    drawSketchLine(ctx, sx + 20 * scale, shoulderY + 14 * scale, sx + 32 * scale, shoulderY - 2 * scale, rng);
  } else if (pose === 'holding_phone') {
    drawSketchLine(ctx, sx, shoulderY, sx - facing * 16 * scale, shoulderY + 26 * scale, rng);
    drawSketchLine(ctx, sx, shoulderY, sx + facing * 22 * scale, shoulderY + 12 * scale, rng);
    const px = sx + facing * 24 * scale;
    const py = shoulderY - 4 * scale;
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(px - 5, py, 11, 18);
    ctx.strokeRect(px - 5, py, 11, 18);
  } else if (pose === 'holding_tea') {
    drawSketchLine(ctx, sx, shoulderY, sx - facing * 16 * scale, shoulderY + 26 * scale, rng);
    drawSketchLine(ctx, sx, shoulderY, sx + facing * 26 * scale, shoulderY + 10 * scale, rng);
    const tx = sx + facing * 28 * scale;
    const ty = shoulderY + 4 * scale;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(tx - 6, ty, 13, 13);
    ctx.strokeRect(tx - 6, ty, 13, 13);
    ctx.beginPath();
    ctx.moveTo(tx - 2, ty - 4);
    ctx.quadraticCurveTo(tx + 2, ty - 10, tx - 2, ty - 15);
    ctx.moveTo(tx + 4, ty - 4);
    ctx.quadraticCurveTo(tx + 7, ty - 10, tx + 3, ty - 15);
    ctx.stroke();
  } else if (pose === 'sitting_desk') {
    drawSketchLine(ctx, sx, shoulderY, sx + facing * 22 * scale, shoulderY + 18 * scale, rng);
    drawSketchLine(ctx, sx, shoulderY, sx + facing * 16 * scale, shoulderY + 22 * scale, rng);
  } else {
    drawSketchLine(ctx, sx, shoulderY, sx - 20 * scale, shoulderY + 30 * scale, rng);
    drawSketchLine(ctx, sx, shoulderY, sx + 20 * scale, shoulderY + 30 * scale, rng);
  }

  // Head
  const hx = x + leanX;
  drawSketchCircle(ctx, hx, headY, headR, rng, '#FFFFFF');
  drawExpression(ctx, hx, headY, headR, char.expression);
  drawCharacterDetails(ctx, char.id, hx, headY, headR, neckY, facing);

  // Small character name pill-free label at bottom
  ctx.font = `600 12px "Hind Siliguri", "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.textAlign = 'center';
  ctx.fillText(char.name, x, groundY + 18);

  ctx.restore();
  return { headX: hx, headY, headR };
}

function drawSceneProp(
  ctx: CanvasRenderingContext2D,
  prop: PropType,
  x: number,
  groundY: number
) {
  if (prop === 'none') return;
  ctx.save();
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (prop === 'laptop') {
    // Desk + laptop
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(x - 42, groundY - 36, 84, 8);
    ctx.strokeRect(x - 42, groundY - 36, 84, 8);
    ctx.beginPath();
    ctx.moveTo(x - 34, groundY - 28);
    ctx.lineTo(x - 34, groundY);
    ctx.moveTo(x + 34, groundY - 28);
    ctx.lineTo(x + 34, groundY);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 16, groundY - 58, 32, 22);
    ctx.strokeRect(x - 16, groundY - 58, 32, 22);
  } else if (prop === 'tea_cup') {
    // Tea stall bench + cup
    ctx.fillStyle = '#FEF3C7';
    ctx.fillRect(x - 18, groundY - 22, 36, 22);
    ctx.strokeRect(x - 18, groundY - 22, 36, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 7, groundY - 36, 14, 14);
    ctx.strokeRect(x - 7, groundY - 36, 14, 14);
  } else if (prop === 'money') {
    ctx.fillStyle = '#BBF7D0';
    [-16, 0, 14].forEach((ox, i) => {
      ctx.save();
      ctx.translate(x + ox, groundY - 55 - i * 14);
      ctx.rotate((i - 1) * 0.25);
      ctx.fillRect(-13, -7, 26, 14);
      ctx.strokeRect(-13, -7, 26, 14);
      ctx.restore();
    });
  } else if (prop === 'clock') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x, groundY - 125, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, groundY - 125);
    ctx.lineTo(x, groundY - 137);
    ctx.moveTo(x, groundY - 125);
    ctx.lineTo(x + 10, groundY - 125);
    ctx.stroke();
  } else if (prop === 'book') {
    ctx.fillStyle = '#DBEAFE';
    ctx.fillRect(x - 20, groundY - 14, 40, 14);
    ctx.strokeRect(x - 20, groundY - 14, 40, 14);
    ctx.fillStyle = '#FEE2E2';
    ctx.fillRect(x - 17, groundY - 26, 34, 12);
    ctx.strokeRect(x - 17, groundY - 26, 34, 12);
  } else if (prop === 'heart') {
    ctx.fillStyle = '#FB7185';
    ctx.beginPath();
    ctx.moveTo(x, groundY - 82);
    ctx.bezierCurveTo(x - 16, groundY - 98, x - 24, groundY - 74, x, groundY - 62);
    ctx.bezierCurveTo(x + 24, groundY - 74, x + 16, groundY - 98, x, groundY - 82);
    ctx.fill();
    ctx.stroke();
  } else if (prop === 'smartphone') {
    ctx.fillStyle = '#E0F2FE';
    ctx.fillRect(x - 9, groundY - 34, 18, 30);
    ctx.strokeRect(x - 9, groundY - 34, 18, 30);
  }
  ctx.restore();
}

function drawMoodFx(
  ctx: CanvasRenderingContext2D,
  fx: ComicPanel['moodFx'],
  headX: number,
  headY: number,
  headR: number
) {
  if (!fx || fx === 'none') return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (fx === 'sweat') {
    const sx = headX + headR + 10;
    const sy = headY - headR * 0.4;
    ctx.fillStyle = '#38BDF8';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 10);
    ctx.quadraticCurveTo(sx + 8, sy + 2, sx, sy + 8);
    ctx.quadraticCurveTo(sx - 8, sy + 2, sx, sy - 10);
    ctx.fill();
    ctx.stroke();
  } else if (fx === 'anger_vein') {
    const vx = headX + headR * 0.7;
    const vy = headY - headR * 0.75;
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(vx - 7, vy - 2);
    ctx.quadraticCurveTo(vx - 2, vy - 2, vx - 2, vy - 7);
    ctx.moveTo(vx + 7, vy - 2);
    ctx.quadraticCurveTo(vx + 2, vy - 2, vx + 2, vy - 7);
    ctx.moveTo(vx - 7, vy + 4);
    ctx.quadraticCurveTo(vx - 2, vy + 4, vx - 2, vy + 9);
    ctx.moveTo(vx + 7, vy + 4);
    ctx.quadraticCurveTo(vx + 2, vy + 4, vx + 2, vy + 9);
    ctx.stroke();
  } else if (fx === 'lightbulb') {
    const lx = headX;
    const ly = headY - headR - 22;
    ctx.fillStyle = '#FACC15';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(lx, ly, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    [-15, 0, 15].forEach((dx, idx) => {
      ctx.beginPath();
      ctx.moveTo(lx + dx * 0.8, ly - 13 - (idx === 1 ? 4 : 0));
      ctx.lineTo(lx + dx * 1.1, ly - 19 - (idx === 1 ? 4 : 0));
      ctx.stroke();
    });
  } else if (fx === 'question' || fx === 'exclamation') {
    ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = fx === 'exclamation' ? '#DC2626' : '#2563EB';
    ctx.textAlign = 'center';
    ctx.fillText(fx === 'exclamation' ? '!' : '?', headX + headR + 14, headY - headR * 0.4);
  } else if (fx === 'sparkles') {
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 2.2;
    [
      [headX - headR - 14, headY - 12],
      [headX + headR + 14, headY - 16],
    ].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy);
      ctx.lineTo(sx + 6, sy);
      ctx.moveTo(sx, sy - 6);
      ctx.lineTo(sx, sy + 6);
      ctx.stroke();
    });
  }
  ctx.restore();
}

export function drawRafuFolkLogoOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  branding: BrandingConfig
) {
  const text = (branding.logoText || '@@RAFU FOLK@@').trim();
  ctx.save();
  ctx.globalAlpha = Math.max(0.25, Math.min(1, branding.logoOpacity));

  const badgeW = 248;
  const badgeH = 44;
  let x = width - badgeW - 28;
  let y = height - badgeH - 22;

  if (branding.logoPlacement === 'bottom-left') {
    x = 28;
    y = height - badgeH - 22;
  } else if (branding.logoPlacement === 'top-banner') {
    x = width - badgeW - 28;
    y = 18;
  } else if (branding.logoPlacement === 'watermark-center') {
    x = width / 2 - badgeW / 2;
    y = height / 2 - badgeH / 2;
  }

  if (branding.logoStyle === 'stamp-dark') {
    // Comic offset shadow + crisp black seal
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(x + 4, y + 4, badgeW, badgeH);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(x, y, badgeW, badgeH);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, badgeW, badgeH);

    // Tiny stick-face icon inside seal
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 24, y + badgeH / 2, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(x + 20, y + badgeH / 2 - 2, 1.7, 0, Math.PI * 2);
    ctx.arc(x + 28, y + badgeH / 2 - 2, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 24, y + badgeH / 2 + 1, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    ctx.font = '800 17px "Plus Jakarta Sans", "JetBrains Mono", sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + badgeW / 2 + 14, y + badgeH / 2 + 1);
  } else if (branding.logoStyle === 'comic-badge') {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.roundRect(x, y, badgeW, badgeH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 4, badgeW - 8, badgeH - 8, 7);
    ctx.stroke();

    ctx.font = '800 17px "Plus Jakarta Sans", "JetBrains Mono", sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + badgeW / 2, y + badgeH / 2 + 1);
  } else {
    // minimal-mono
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.roundRect(x + 12, y + 6, badgeW - 24, badgeH - 12, 6);
    ctx.fill();

    ctx.font = '700 15px "JetBrains Mono", "Plus Jakarta Sans", monospace';
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + badgeW / 2, y + badgeH / 2);
  }

  ctx.restore();
}

export function getComicDimensions(layout: ComicScript['layout']) {
  if (layout === '2-panel') return { width: 1200, height: 760 };
  if (layout === '3-panel') return { width: 1200, height: 680 };
  return { width: 1200, height: 1120 };
}

export function renderComicToCanvas(
  canvas: HTMLCanvasElement,
  script: ComicScript,
  branding: BrandingConfig
) {
  const { width, height } = getComicDimensions(script.layout);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rng = createRng(script.seed || 104729);
  drawPaperBackground(ctx, width, height, script.paperTheme, rng);

  // Header Strip
  const headerH = 82;
  ctx.save();
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 28px "Hind Siliguri", "Noto Sans Bengali", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(script.title, 34, headerH / 2 + 4);
  ctx.restore();

  // Panel grid math
  const pad = 28;
  const gap = 22;
  const footerReserve = branding.logoPlacement === 'top-banner' ? 28 : 74;
  const areaX = pad;
  const areaY = headerH + 6;
  const areaW = width - pad * 2;
  const areaH = height - areaY - footerReserve;

  const panels = script.panels;
  const panelRects: Array<{ x: number; y: number; w: number; h: number }> = [];

  if (script.layout === '1-panel') {
    panelRects.push({ x: areaX, y: areaY, w: areaW, h: areaH });
  } else if (script.layout === '2-panel') {
    const pw = (areaW - gap) / 2;
    panelRects.push({ x: areaX, y: areaY, w: pw, h: areaH });
    panelRects.push({ x: areaX + pw + gap, y: areaY, w: pw, h: areaH });
  } else if (script.layout === '3-panel') {
    const pw = (areaW - gap * 2) / 3;
    for (let i = 0; i < 3; i++) {
      panelRects.push({ x: areaX + i * (pw + gap), y: areaY, w: pw, h: areaH });
    }
  } else {
    // 4-panel 2x2
    const pw = (areaW - gap) / 2;
    const ph = (areaH - gap) / 2;
    panelRects.push({ x: areaX, y: areaY, w: pw, h: ph });
    panelRects.push({ x: areaX + pw + gap, y: areaY, w: pw, h: ph });
    panelRects.push({ x: areaX, y: areaY + ph + gap, w: pw, h: ph });
    panelRects.push({ x: areaX + pw + gap, y: areaY + ph + gap, w: pw, h: ph });
  }

  panelRects.forEach((rect, idx) => {
    const panel = panels[idx];
    if (!panel) return;

    // Panel backdrop & hand-inked border
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.4;
    drawSketchLine(ctx, rect.x, rect.y, rect.x + rect.w, rect.y, rng, 0.8);
    drawSketchLine(ctx, rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h, rng, 0.8);
    drawSketchLine(ctx, rect.x + rect.w, rect.y + rect.h, rect.x, rect.y + rect.h, rng, 0.8);
    drawSketchLine(ctx, rect.x, rect.y + rect.h, rect.x, rect.y, rng, 0.8);

    // Clip to panel bounds
    ctx.beginPath();
    ctx.rect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
    ctx.clip();

    // Optional narrator box at top
    let topUsed = rect.y + 16;
    if (panel.captionTop && panel.captionTop.trim()) {
      ctx.font = '600 16px "Hind Siliguri", "Noto Sans Bengali", sans-serif';
      const capText = panel.captionTop.trim();
      const capW = Math.min(rect.w - 28, ctx.measureText(capText).width + 26);
      const capH = 30;
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(rect.x + 12, rect.y + 10, capW, capH);
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x + 12, rect.y + 10, capW, capH);
      ctx.fillStyle = '#0F172A';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(capText, rect.x + 24, rect.y + 10 + capH / 2 + 1);
      topUsed = rect.y + 52;
    }

    // Subtle ground horizon line
    const groundY = rect.y + rect.h - 32;
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
    ctx.lineWidth = 1.6;
    drawSketchLine(ctx, rect.x + 22, groundY + 1, rect.x + rect.w - 22, groundY + 1, rng, 0.6);
    ctx.restore();

    // Scale characters cleanly to panel height
    const charScale = Math.min(1.12, Math.max(0.76, rect.h / 410));
    const chars = panel.characters.slice(0, 2);

    // Draw scene prop in center or side
    const propX =
      chars.length === 1
        ? rect.x + rect.w * 0.68
        : rect.x + rect.w * 0.5;
    drawSceneProp(ctx, panel.sceneProp, propX, groundY);

    const heads: Array<{ char: ComicCharacter; headX: number; headY: number; headR: number }> = [];

    chars.forEach((char, cIdx) => {
      let cx = rect.x + rect.w * 0.5;
      let facing: 1 | -1 = 1;
      if (chars.length === 2) {
        if (char.side === 'left' || (char.side !== 'right' && cIdx === 0)) {
          cx = rect.x + rect.w * 0.29;
          facing = 1;
        } else {
          cx = rect.x + rect.w * 0.71;
          facing = -1;
        }
      } else if (char.side === 'left') {
        cx = rect.x + rect.w * 0.34;
        facing = 1;
      } else if (char.side === 'right') {
        cx = rect.x + rect.w * 0.66;
        facing = -1;
      }

      const pos = drawCharacter(ctx, char, cx, groundY, charScale, facing, rng);
      heads.push({ char, ...pos });
    });

    if (heads.length > 0 && panel.moodFx && panel.moodFx !== 'none') {
      const targetHead = heads[heads.length - 1];
      drawMoodFx(ctx, panel.moodFx, targetHead.headX, targetHead.headY, targetHead.headR);
    }

    // Draw speech bubbles without colliding
    const speechItems = heads.filter((h) => h.char.speech && h.char.speech.trim());
    speechItems.forEach((item, sIdx) => {
      const isTwo = speechItems.length === 2;
      const bubbleMaxW = isTwo ? rect.w * 0.48 : rect.w * 0.78;
      const anchorX = isTwo
        ? sIdx === 0
          ? rect.x + rect.w * 0.27
          : rect.x + rect.w * 0.73
        : Math.max(
            rect.x + bubbleMaxW * 0.45,
            Math.min(rect.x + rect.w - bubbleMaxW * 0.45, item.headX)
          );
      const anchorY =
        isTwo && sIdx === 1
          ? Math.max(topUsed + 56, item.headY - item.headR - 72)
          : Math.max(topUsed + 38, item.headY - item.headR - 92);

      drawSpeechBubble(
        ctx,
        item.char.speech!.trim(),
        anchorX,
        anchorY,
        item.headX,
        item.headY - item.headR - 4,
        bubbleMaxW,
        Boolean(item.char.thought),
        rng
      );
    });

    ctx.restore();
  });

  // Footer micro handle + @@RAFU FOLK@@ logo stamp
  ctx.save();
  ctx.font = '600 14px "JetBrains Mono", "Hind Siliguri", monospace';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (branding.logoPlacement !== 'bottom-left') {
    ctx.fillText(`#${script.category} · Original Stick Comic`, 32, height - 42);
  }
  ctx.restore();

  drawRafuFolkLogoOnCanvas(ctx, width, height, branding);
}

export async function renderOffscreenPng(
  script: ComicScript,
  branding: BrandingConfig
): Promise<string> {
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font wait failure
    }
  }
  const canvas = document.createElement('canvas');
  renderComicToCanvas(canvas, script, branding);
  return canvas.toDataURL('image/png');
}

