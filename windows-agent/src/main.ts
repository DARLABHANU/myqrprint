import { app, BrowserWindow, ipcMain, Menu, nativeImage, safeStorage, shell, Tray } from 'electron';
import { join } from 'node:path';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { pairAgentResponseSchema, leasedPrintJobSchema, type DiscoveredPrinter } from '@printly/contracts';

const VERSION = app.getVersion();
const credentialsPath = () => join(app.getPath('userData'), 'connection.bin');
type Connection = { apiUrl: string; token: string; deviceName: string; shopName: string; deviceId: string };
let mainWindow: BrowserWindow | null = null;
let connection: Connection | null = null;
let pollTimer: NodeJS.Timeout | undefined;
let busy = false;
let tray: Tray | null = null;
let isQuitting = false;
const pendingPrints = new Map<string, { window: BrowserWindow; printerName: string; options: ReturnType<typeof leasedPrintJobSchema.parse>['options']; resolve: () => void; reject: (error: Error) => void }>();
const productionWebUrl = 'https://myqrprint.vercel.app';
const allowedWebOrigins = new Set([new URL(productionWebUrl).origin, 'http://localhost:5173', 'http://127.0.0.1:5173']);

async function loadConnection() {
  try {
    if (safeStorage.isEncryptionAvailable()) connection = JSON.parse(safeStorage.decryptString(await readFile(credentialsPath())));
  } catch { connection = null; }
}
function emitStatus(extra: Record<string, unknown> = {}) {
  mainWindow?.webContents.send('agent:status-changed', { connected: Boolean(connection), deviceName: connection?.deviceName, shopName: connection?.shopName, agentVersion: VERSION, ...extra });
}
async function api(path: string, init: RequestInit = {}) {
  if (!connection) throw new Error('Pair this computer with your shop first.');
  const response = await fetch(new URL(path, connection.apiUrl), { ...init, headers: { Authorization: `Bearer ${connection.token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  if (!response.ok && response.status !== 204) {
    const message = (await response.json().catch(() => ({})) as {error?:string}).error ?? `Printly server returned ${response.status}.`;
    if (response.status === 401) { connection = null; if (pollTimer) clearInterval(pollTimer); await rm(credentialsPath(), { force: true }); emitStatus({ error: message }); }
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}
async function discoverPrinters(): Promise<DiscoveredPrinter[]> {
  const printers = await mainWindow?.webContents.getPrintersAsync() ?? [];
  return printers.map((printer) => {
    const options = printer.options as Record<string, string | undefined>;
    const supported = (options['paper-sizes'] ?? options['media-supported'] ?? 'iso_a4_210x297mm').toLowerCase();
    return {
      systemName: printer.name,
      displayName: printer.displayName || printer.name,
      isDefault: /true|1/i.test(String(options['is-default'] ?? options.isDefault ?? '')),
      capabilities: {
        paperSizes: (['A3','A4','A5','Legal'] as const).filter((size) => supported.includes(size.toLowerCase()) || (size === 'A4' && supported.includes('210x297'))).length ? (['A3','A4','A5','Legal'] as const).filter((size) => supported.includes(size.toLowerCase()) || (size === 'A4' && supported.includes('210x297'))) : ['A4'],
        supportsColour: /true|color|colour/i.test(options.color ?? options['print-color-mode'] ?? ''),
        supportsDuplex: /duplex|two-sided/i.test(options['sides'] ?? options.duplex ?? ''),
      },
    } satisfies DiscoveredPrinter;
  });
}
async function heartbeat() {
  const printers = await discoverPrinters();
  await api('/api/agent/heartbeat', { method: 'POST', body: JSON.stringify({ agentVersion: VERSION, printers }) });
  emitStatus({ printers: printers.length, lastHeartbeat: new Date().toISOString() });
}
async function printJob(job: ReturnType<typeof leasedPrintJobSchema.parse>) {
  const files: Array<{ name: string; mediaType: string; data: string }> = [];
  for (const file of job.files) {
    const response = await fetch(new URL(file.downloadUrl, connection!.apiUrl), { headers: { Authorization: `Bearer ${connection!.token}` } });
    if (!response.ok) throw new Error(`Could not download ${file.name} (${response.status}).`);
    const data = Buffer.from(await response.arrayBuffer()).toString('base64');
    files.push({ name: file.name, mediaType: file.mediaType, data });
  }
  const printWindow = new BrowserWindow({ show: false, webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const printId = randomUUID();
  try {
    const rendered = new Promise<void>((resolve, reject) => {
      pendingPrints.set(printId, { window: printWindow, printerName: job.printerSystemName, options: job.options, resolve, reject });
      printWindow.webContents.once('did-finish-load', () => printWindow.webContents.send('agent:print-payload', { id: printId, options: job.options, files }));
    });
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) await printWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?print=1`);
    else await printWindow.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), { query: { print: '1' } });
    await rendered;
    await api(`/api/agent/jobs/${job.orderId}/result`, { method: 'POST', body: JSON.stringify({ leaseId: job.leaseId, outcome: 'printed' }) });
    emitStatus({ lastJob: `Order ${job.orderCode} submitted to ${job.printerSystemName}.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Print failed.';
    await api(`/api/agent/jobs/${job.orderId}/result`, { method: 'POST', body: JSON.stringify({ leaseId: job.leaseId, outcome: 'failed', errorMessage: message.slice(0, 240) }) }).catch(() => undefined);
    throw error;
  } finally { pendingPrints.delete(printId); if (!printWindow.isDestroyed()) printWindow.destroy(); }
}
async function poll() {
  if (!connection || busy) return;
  busy = true;
  try {
    await heartbeat();
    const response = await fetch(new URL('/api/agent/jobs/next', connection.apiUrl), { headers: { Authorization: `Bearer ${connection.token}` } });
    if (response.status === 200) await printJob(leasedPrintJobSchema.parse(await response.json()));
  } catch (error) { emitStatus({ error: error instanceof Error ? error.message : 'Agent connection failed.' }); }
  finally { busy = false; }
}
function startPolling() { if (pollTimer) clearInterval(pollTimer); void poll(); pollTimer = setInterval(() => void poll(), 20_000); }

function createWindow() {
  mainWindow = new BrowserWindow({ title: 'Printly', width: 1320, height: 900, minWidth: 980, minHeight: 680, backgroundColor: '#f4f7fa', autoHideMenuBar: true, webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const webUrl = process.env.PRINTLY_WEB_URL ?? (app.isPackaged ? productionWebUrl : 'http://localhost:5173');
  void mainWindow.loadURL(webUrl);
  mainWindow.webContents.on('will-navigate', (event, url) => {
    let origin = '';
    try { origin = new URL(url).origin; } catch { /* blocked below */ }
    if (allowedWebOrigins.has(origin)) return;
    event.preventDefault();
    if (url.startsWith('https://')) void shell.openExternal(url);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('close', (event) => { if (!isQuitting) { event.preventDefault(); mainWindow?.hide(); } });
  mainWindow.on('closed', () => { mainWindow = null; });
}
app.whenReady().then(async () => {
  await loadConnection(); createWindow(); if (connection) startPolling();
  app.setLoginItemSettings({ openAtLogin: true });
  const iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#079c73"/><path fill="#fff" d="M8 8h6v6H8zm10 0h6v6h-6zM8 18h6v6H8zm10 10V18h6v6h-6z"/></svg>';
  tray = new Tray(nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg)}`));
  tray.setToolTip('Printly Agent');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Printly Agent', click: () => { if (!mainWindow) createWindow(); mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Quit Printly Agent', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { if (!mainWindow) createWindow(); mainWindow?.show(); mainWindow?.focus(); });
  app.on('activate', () => { if (!mainWindow) createWindow(); });
});
app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && isQuitting) app.quit(); });
ipcMain.handle('agent:status', async () => ({ connected: Boolean(connection), deviceName: connection?.deviceName, shopName: connection?.shopName, agentVersion: VERSION, printers: connection ? (await discoverPrinters()).length : 0 }));
ipcMain.handle('agent:pair', async (event, input: { code: string; apiUrl: string }) => {
  let senderOrigin = '';
  try { senderOrigin = new URL(event.sender.getURL()).origin; } catch { /* reject below */ }
  if (!allowedWebOrigins.has(senderOrigin)) throw new Error('Pairing can only be started from Printly.');
  const apiUrl = input.apiUrl.trim().replace(/\/+$/, '');
  let parsedApiUrl: URL;
  try { parsedApiUrl = new URL(apiUrl); } catch { throw new Error('Enter the Printly backend URL (https://…).'); }
  if (parsedApiUrl.protocol !== 'https:' && !(parsedApiUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsedApiUrl.hostname))) throw new Error('Use a secure HTTPS Printly server URL.');
  if (parsedApiUrl.protocol === 'https:' && parsedApiUrl.hostname !== 'printly-api.onrender.com') throw new Error('Use the official Printly server address.');
  const response = await fetch(new URL('/api/agent/pair', apiUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairingCode: input.code, deviceName: hostname(), agentVersion: VERSION }) });
  const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not pair this computer.');
  const paired = pairAgentResponseSchema.parse(body);
  connection = { apiUrl, token: paired.accessToken, deviceName: paired.deviceName, shopName: paired.shop.displayName, deviceId: paired.deviceId };
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable on this computer.');
  await writeFile(credentialsPath(), safeStorage.encryptString(JSON.stringify(connection)));
  await heartbeat();
  startPolling(); emitStatus(); return { connected: true, deviceName: connection.deviceName, shopName: connection.shopName, agentVersion: VERSION };
});
ipcMain.handle('agent:disconnect', async () => { if (pollTimer) clearInterval(pollTimer); connection = null; await rm(credentialsPath(), { force: true }); emitStatus(); return { connected: false }; });
ipcMain.handle('agent:print-ready', async (event, input: { id: string; error?: string }) => {
  const pending = pendingPrints.get(input.id);
  if (!pending || pending.window.webContents.id !== event.sender.id) return;
  if (input.error) { pending.reject(new Error(input.error)); return; }
  const { options } = pending;
  pending.window.webContents.print({ silent: true, deviceName: pending.printerName, color: options.colour, copies: options.copies, landscape: options.orientation === 'landscape', duplexMode: options.duplex ? 'longEdge' : 'simplex', pageSize: options.paperSize as 'A3'|'A4'|'A5'|'Legal', printBackground: true }, (success, failureReason) => success ? pending.resolve() : pending.reject(new Error(failureReason || 'Windows could not submit the print job.')));
});
