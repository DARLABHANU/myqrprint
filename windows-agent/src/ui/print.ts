import type { PrintPayload } from '../types';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function selectedPages(value: string | undefined, count: number) {
  if (!value?.trim()) return Array.from({ length: count }, (_, i) => i + 1);
  const chosen = new Set<number>();
  for (const part of value.split(',')) {
    const [startRaw, endRaw] = part.trim().split('-', 2);
    const start = Number(startRaw);
    const end = endRaw === undefined ? start : Number(endRaw);
    if (Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start) {
      for (let p = start; p <= Math.min(end, count); p++) chosen.add(p);
    }
  }
  return [...chosen].sort((a, b) => a - b);
}

function photoSlots(layout?: string): { count: number; columns: number; rows: number } {
  switch (layout) {
    case 'two_stack':       return { count: 2, columns: 1, rows: 2 };
    case 'two_side_by_side': return { count: 2, columns: 2, rows: 1 };
    case 'four':            return { count: 4, columns: 2, rows: 2 };
    case 'six':             return { count: 6, columns: 2, rows: 3 };
    case 'nine':            return { count: 9, columns: 3, rows: 3 };
    case 'single':
    default:                return { count: 1, columns: 1, rows: 1 };
  }
}

function paperPx(size: string, orientation?: string): { w: number; h: number } {
  // 300 DPI equivalents for standard paper sizes
  const dims: Record<string, [number, number]> = {
    A3:    [3508, 4961],
    A4:    [2480, 3508],
    A5:    [1748, 2480],
    Legal: [2550, 4200],
  };
  const [pw, ph] = dims[size] ?? dims['A4'];
  return orientation === 'landscape' ? { w: ph, h: pw } : { w: pw, h: ph };
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image`));
    img.src = src;
  });
}

async function renderPhotoPageCanvas(
  imageFiles: Array<{ name: string; mediaType: string; data: string }>,
  slots: { count: number; columns: number; rows: number },
  px: { w: number; h: number },
  colour: boolean,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = px.w;
  canvas.height = px.h;
  const ctx = canvas.getContext('2d')!;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, px.w, px.h);

  // Keep the physical page grid in step with CustomerOrderPage's 136 × 192
  // preview paper: 1px border + 3px padding, and a 2px grid gap. The image
  // itself uses object-fit: contain there, which is the centered contain fit
  // performed below.
  const mx = Math.round(px.w * (4 / 136));
  const my = Math.round(px.h * (4 / 192));
  const gx = Math.round(px.w * (2 / 136));
  const gy = Math.round(px.h * (2 / 192));
  const printW = px.w - 2 * mx;
  const printH = px.h - 2 * my;
  const slotW = (printW - (slots.columns - 1) * gx) / slots.columns;
  const slotH = (printH - (slots.rows - 1) * gy) / slots.rows;

  for (let i = 0; i < slots.count; i++) {
    const file = imageFiles[i];
    if (!file) continue; // empty slot stays white

    const col = i % slots.columns;
    const row = Math.floor(i / slots.columns);
    const sx = mx + col * (slotW + gx);
    const sy = my + row * (slotH + gy);

    const img = await loadImage(`data:${file.mediaType};base64,${file.data}`);
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const slotAspect = slotW / slotH;

    let dw: number, dh: number;
    if (imgAspect > slotAspect) {
      dw = slotW; dh = slotW / imgAspect;
    } else {
      dh = slotH; dw = slotH * imgAspect;
    }
    const dx = sx + (slotW - dw) / 2;
    const dy = sy + (slotH - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // Grayscale conversion (pixel-level, guaranteed)
  if (!colour) {
    const imgData = ctx.getImageData(0, 0, px.w, px.h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const luma = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      d[i] = d[i + 1] = d[i + 2] = luma;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  return canvas.toDataURL('image/png');
}

export async function renderPrintPayload(payload: PrintPayload): Promise<void> {
  const root = document.getElementById('print-root') ?? document.body.appendChild(document.createElement('main'));
  root.id = 'print-root';
  root.replaceChildren();

  // Remove any previously injected print styles
  document.getElementById('printly-style')?.remove();

  const imageFiles = payload.files.filter(f => f.mediaType.startsWith('image/'));
  const pdfFiles   = payload.files.filter(f => f.mediaType === 'application/pdf');
  const px = paperPx(payload.options.paperSize, payload.options.orientation);

  // Paper dimensions in mm for exact @page sizing
  const paperMm: Record<string, [number, number]> = {
    A3: [297, 420], A4: [210, 297], A5: [148, 210], Legal: [215.9, 355.6],
  };
  const [mmW, mmH] = paperMm[payload.options.paperSize] ?? paperMm['A4'];
  const pageWidthMm  = payload.options.orientation === 'landscape' ? mmH : mmW;
  const pageHeightMm = payload.options.orientation === 'landscape' ? mmW : mmH;

  // ── Global print styles (injected first so they apply before content) ───────
  const style = document.createElement('style');
  style.id = 'printly-style';
  style.textContent = `
    @page {
      size: ${pageWidthMm}mm ${pageHeightMm}mm;
      margin: 0mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0; padding: 0;
      width: ${pageWidthMm}mm;
      background: #ffffff;
    }
    #print-root {
      width: ${pageWidthMm}mm;
    }
    .print-page {
      width: ${pageWidthMm}mm;
      height: ${pageHeightMm}mm;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #ffffff;
      display: block;
      page-break-after: always;
      break-after: page;
    }
    .print-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .print-page img {
      display: block;
      width: ${pageWidthMm}mm;
      height: ${pageHeightMm}mm;
      object-fit: fill;
    }
  `;
  document.head.appendChild(style);

  // ── PDFs ────────────────────────────────────────────────────────────────────
  for (const file of pdfFiles) {
    const bytes = Uint8Array.from(atob(file.data), c => c.charCodeAt(0));
    const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
    const pages = selectedPages(payload.options.pageRange, pdf.numPages);
    if (payload.options.pageRange?.trim() && !pages.length) {
      throw new Error('The selected page range does not match this PDF.');
    }
    for (const pageNumber of pages) {
      const pdfPage = await pdf.getPage(pageNumber);
      const viewport = pdfPage.getViewport({
        scale: 2.5,
        rotation: payload.options.orientation === 'landscape' ? 90 : 0,
      });
      const canvas = document.createElement('canvas');
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;

      if (!payload.options.colour) {
        const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
          const luma = Math.round(0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]);
          d[i] = d[i+1] = d[i+2] = luma;
        }
        ctx.putImageData(id, 0, 0);
      }

      // Render PDF page into full-paper canvas for pixel-exact output
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width  = px.w;
      pageCanvas.height = px.h;
      const pCtx = pageCanvas.getContext('2d')!;
      pCtx.fillStyle = '#ffffff';
      pCtx.fillRect(0, 0, px.w, px.h);
      // Scale/center the rendered PDF within the paper canvas
      const srcAspect = canvas.width / canvas.height;
      const dstAspect = px.w / px.h;
      let dw: number, dh: number;
      if (srcAspect > dstAspect) { dw = px.w; dh = px.w / srcAspect; }
      else { dh = px.h; dw = px.h * srcAspect; }
      pCtx.drawImage(canvas, (px.w - dw) / 2, (px.h - dh) / 2, dw, dh);

      const img = document.createElement('img');
      img.src = pageCanvas.toDataURL('image/jpeg', 0.95);
      const page = document.createElement('section');
      page.className = 'print-page';
      page.appendChild(img);
      root.appendChild(page);
    }
  }

  // ── Photos (canvas-rendered, pixel-perfect) ─────────────────────────────────
  if (imageFiles.length > 0) {
    const slots = photoSlots(payload.options.photoLayout);
    for (let offset = 0; offset < imageFiles.length; offset += slots.count) {
      const pageFiles = imageFiles.slice(offset, offset + slots.count);
      // pad to slots.count with undefined so empty slots render white
      while (pageFiles.length < slots.count) pageFiles.push(undefined as any);

      const dataUrl = await renderPhotoPageCanvas(pageFiles, slots, px, payload.options.colour);
      const img = document.createElement('img');
      img.src = dataUrl;

      const page = document.createElement('section');
      page.className = 'print-page';
      page.appendChild(img);
      root.appendChild(page);
    }
  }

  // Wait for images to load + 2 rAF for layout to settle
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map(
      img => img.complete ? Promise.resolve() : new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); })
    )
  );
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise(r => setTimeout(r, 200));
}
