// Japanese text is drawn with Canvas 2D so any web-font glyph works (AI-generated keywords can't be pre-subset for MSDF).
import * as THREE from 'three';

export const PPU = 230 * Math.min(window.devicePixelRatio || 1, 2);
export const FONT_JP = '"Noto Sans JP", "Yu Gothic UI", "Hiragino Sans", system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';

const FONT_UNITS = 0.21;
const PAD_UNITS = 0.2;
const MIN_W = 1.0;
const MAX_W = 2.6;

const measure = document.createElement('canvas').getContext('2d')!;

export function blockWidth(text: string): number {
  measure.font = `900 ${FONT_UNITS * 100}px ${FONT_JP}`;
  const textW = measure.measureText(text).width / 100;
  return THREE.MathUtils.clamp(textW + PAD_UNITS * 2, MIN_W, MAX_W);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxW) out = out.slice(0, -1);
  return `${out}…`;
}

function toTexture(canvas: HTMLCanvasElement, anisotropy: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

/**
 * Face of a keyword block: only the keyword, fully opaque (the translucent body supplies the color).
 * Sticker style from wordblock-sample.glb: dark glyphs with a white outline.
 */
export function makeBlockTexture(text: string, width: number, height: number, anisotropy: number): THREE.CanvasTexture {
  const faceW = width - 0.04;
  const faceH = height - 0.04;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(faceW * PPU);
  canvas.height = Math.ceil(faceH * PPU);
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;

  let fontPx = FONT_UNITS * PPU;
  ctx.font = `900 ${fontPx}px ${FONT_JP}`;
  const maxTextW = W - PAD_UNITS * PPU * 1.2;
  const textW = ctx.measureText(text).width;
  if (textW > maxTextW) {
    fontPx *= maxTextW / textW;
    ctx.font = `900 ${fontPx}px ${FONT_JP}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const y = H / 2 + fontPx * 0.04;
  ctx.lineWidth = fontPx * 0.2;
  ctx.strokeStyle = '#FFFFFF';
  ctx.strokeText(text, W / 2, y);
  ctx.fillStyle = '#2F3130';
  ctx.fillText(text, W / 2, y);

  return toTexture(canvas, anisotropy);
}

export interface NameplateContent {
  label: string;
  color: string;
  glyph: string;
  count: number;
  /** Shown as "count/capacity" when the level reveals capacities. */
  capacity?: number;
  top: string;
  bottom: string;
  text: string;
  placeholder: string;
}

export function drawNameplate(canvas: HTMLCanvasElement, content: NameplateContent) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const u = PPU;
  const inset = Math.max(1, 0.01 * u);
  const radius = 0.07 * u;
  ctx.clearRect(0, 0, W, H);

  roundRect(ctx, inset, inset, W - inset * 2, H - inset * 2, radius);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, content.top);
  bg.addColorStop(1, content.bottom);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = Math.max(1, 0.012 * u);
  ctx.strokeStyle = withAlpha(content.color, 0.6);
  ctx.stroke();

  ctx.save();
  roundRect(ctx, inset, inset, W - inset * 2, H - inset * 2, radius);
  ctx.clip();
  ctx.fillStyle = content.color;
  ctx.fillRect(inset, inset, 0.035 * u, H);
  ctx.restore();

  const pad = 0.13 * u;
  const mid = H / 2 + 0.01 * u;
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  ctx.font = `700 ${0.17 * u}px ${FONT_JP}`;
  ctx.fillStyle = content.color;
  ctx.fillText(content.glyph, pad, mid);
  const glyphW = ctx.measureText(content.glyph).width;

  const countText =
    content.capacity !== undefined ? `${content.count}/${content.capacity}` : String(content.count).padStart(2, '0');
  ctx.textAlign = 'right';
  ctx.font = `700 ${0.19 * u}px ${FONT_MONO}`;
  ctx.fillText(countText, W - pad, mid);
  const countW = ctx.measureText(countText).width;

  const x0 = pad + glyphW + 0.08 * u;
  const maxW = W - pad - countW - 0.1 * u - x0;
  ctx.textAlign = 'left';
  const label = content.label.trim();
  if (label) {
    ctx.font = `700 ${0.19 * u}px ${FONT_JP}`;
    ctx.fillStyle = content.text;
    ctx.fillText(ellipsize(ctx, label, maxW), x0, mid);
  } else {
    ctx.font = `500 ${0.16 * u}px ${FONT_JP}`;
    ctx.fillStyle = content.placeholder;
    ctx.fillText(ellipsize(ctx, 'ラベル未入力', maxW), x0, mid);
  }
}

export function makeCanvasTexture(canvas: HTMLCanvasElement, anisotropy: number): THREE.CanvasTexture {
  return toTexture(canvas, anisotropy);
}
