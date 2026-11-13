import type { Locator } from '@playwright/test';

export interface LabelMetrics {
  textLines: number;
  height: number;
  lineHeight: number;
  right: number;
  clipped: boolean;
  effectiveOpacity: number;
  contrast: number;
}

export function measureLabel(label: Locator): Promise<LabelMetrics> {
  return label.evaluate((el) => {
    const toRgba = (color: string): number[] => {
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) throw new Error('2D canvas unavailable for colour conversion');
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    };
    const luminance = ([r, g, b]: number[]) => {
      const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };

    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    const textTops: number[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) if (rect.width > 0) textTops.push(rect.top);
    }
    textTops.sort((a, b) => a - b);
    const textLines = textTops.filter((top, i) => i === 0 || top - textTops[i - 1] > lineHeight / 2).length;

    let effectiveOpacity = 1;
    const layers: number[][] = [];
    let opaqueFound = false;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      effectiveOpacity *= parseFloat(cs.opacity);
      const layer = toRgba(cs.backgroundColor);
      if (!opaqueFound && layer[3] > 0) layers.push(layer);
      if (layer[3] === 255) opaqueFound = true;
    }
    if (!opaqueFound) layers.push([255, 255, 255, 255]);
    const bg = layers.reduceRight((under, over) => {
      const a = over[3] / 255;
      return [...over.slice(0, 3).map((c, i) => c * a + under[i] * (1 - a)), 255];
    });
    const fg = toRgba(style.color);
    const alpha = (fg[3] / 255) * effectiveOpacity;
    const blended = fg.slice(0, 3).map((c, i) => c * alpha + bg[i] * (1 - alpha));
    const [hi, lo] = [luminance(blended), luminance(bg)].sort((a, b) => b - a);
    const box = el.getBoundingClientRect();

    return {
      textLines,
      height: box.height,
      lineHeight,
      right: box.right,
      clipped: el.scrollWidth > el.clientWidth + 1,
      effectiveOpacity,
      contrast: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
    };
  });
}
