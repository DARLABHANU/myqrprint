import type { PrintPayload } from '../types';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function selectedPages(value: string | undefined, count: number) {
  if (!value?.trim()) return Array.from({ length: count }, (_, index) => index + 1);
  const chosen = new Set<number>();
  for (const part of value.split(',')) {
    const [startRaw, endRaw] = part.trim().split('-', 2);
    const start = Number(startRaw); const end = endRaw === undefined ? start : Number(endRaw);
    if (Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start) {
      for (let page = start; page <= Math.min(end, count); page += 1) chosen.add(page);
    }
  }
  return [...chosen].sort((a, b) => a - b);
}

function photoSlots(layout?: string) {
  switch (layout) {
    case 'two_stack': return { count: 2, columns: 1 };
    case 'two_side_by_side': return { count: 2, columns: 2 };
    case 'four': return { count: 4, columns: 2 };
    case 'six': return { count: 6, columns: 2 };
    case 'nine': return { count: 9, columns: 3 };
    default: return { count: 1, columns: 1 };
  }
}

export async function renderPrintPayload(payload: PrintPayload) {
  const root = document.getElementById('print-root') ?? document.body.appendChild(document.createElement('main'));
  root.id = 'print-root';
  root.replaceChildren();
  const imageFiles = payload.files.filter((file) => file.mediaType.startsWith('image/'));
  const pdfFiles = payload.files.filter((file) => file.mediaType === 'application/pdf');
  for (const file of pdfFiles) {
    const bytes = Uint8Array.from(atob(file.data), (char) => char.charCodeAt(0));
    const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
    const pages = selectedPages(payload.options.pageRange, pdf.numPages);
    if (payload.options.pageRange?.trim() && !pages.length) throw new Error('The selected page range does not match this PDF.');
    for (const pageNumber of pages) {
      const pdfPage = await pdf.getPage(pageNumber);
      const viewport = pdfPage.getViewport({ scale: 1.8, rotation: payload.options.orientation === 'landscape' ? 90 : 0 });
      const page = document.createElement('section'); page.className = 'print-page pdf-page';
      const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
      await pdfPage.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext('2d')!, viewport }).promise;
      page.append(canvas); root.append(page);
    }
  }
  if (imageFiles.length) {
    const slots = photoSlots(payload.options.photoLayout);
    for (let offset = 0; offset < imageFiles.length; offset += slots.count) {
      const page = document.createElement('section'); page.className = 'print-page photo-page';
      const grid = document.createElement('div'); grid.className = 'photo-grid'; grid.style.gridTemplateColumns = `repeat(${slots.columns},1fr)`;
      grid.style.gridTemplateRows = `repeat(${Math.ceil(Math.min(slots.count, imageFiles.length - offset) / slots.columns)},1fr)`;
      for (const file of imageFiles.slice(offset, offset + slots.count)) {
        const image = document.createElement('img'); image.src = `data:${file.mediaType};base64,${file.data}`; image.alt = file.name;
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(`Could not open ${file.name}.`)); });
        grid.append(image);
      }
      page.append(grid); root.append(page);
    }
  }
  const style = document.createElement('style');
  style.textContent = `@page{size:${payload.options.paperSize} ${payload.options.orientation ?? 'portrait'};margin:8mm}html,body{margin:0;padding:0}.print-page{width:100%;height:calc(100vh - 16mm);page-break-after:always;break-after:page;overflow:hidden}.print-page:last-child{page-break-after:auto;break-after:auto}.pdf-page{display:flex;align-items:center;justify-content:center}.pdf-page canvas{max-width:100%;max-height:100%;object-fit:contain}.photo-grid{height:100%;display:grid;grid-template-rows:repeat(auto-fit,minmax(0,1fr));gap:4mm;align-items:stretch;justify-items:stretch}.photo-grid img{width:100%;height:100%;max-height:100%;object-fit:contain;min-height:0}${payload.options.colour ? '' : 'body{filter:grayscale(1)}'}`;
  document.head.append(style);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
