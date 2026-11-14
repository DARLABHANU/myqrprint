import { app, BrowserWindow, ipcMain, Menu, nativeImage, safeStorage, session, shell, Tray } from 'electron';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pairAgentResponseSchema, leasedPrintJobSchema, type DiscoveredPrinter } from '@printly/contracts';

const execFileAsync = promisify(execFile);

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
const pauseJobPolling = process.env.PRINTLY_PAUSE_JOB_POLLING === '1';
function isAllowedOrigin(origin: string): boolean {
  if (!origin || origin === 'null' || origin.startsWith('file:') || origin.startsWith('vscode-webview:')) return true;
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host === 'myqrprint.vercel.app' || host.endsWith('.vercel.app');
  } catch { return false; }
}

async function loadConnection() {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      connection = JSON.parse(safeStorage.decryptString(await readFile(credentialsPath())));
      console.log(`[AGENT] Loaded credentials for device: ${connection?.deviceName}, shop: ${connection?.shopName}`);
    }
  } catch (err) {
    console.warn('[AGENT] Could not load saved connection:', err);
    connection = null;
  }
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
function probeTcpAlive(host: string, port: number, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: timeoutMs }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function parseNetworkTarget(str: string): { host: string; port: number } | null {
  if (!str) return null;
  const urlMatch = str.match(/(?:https?|ipp|ipps):\/\/([^\s\/\:]+)(?::(\d+))?/i);
  if (urlMatch) {
    const isHttps = urlMatch[0].toLowerCase().startsWith('https') || urlMatch[0].toLowerCase().startsWith('ipps');
    return {
      host: urlMatch[1],
      port: Number(urlMatch[2] || (isHttps ? 443 : 631)),
    };
  }
  const ipMatch = str.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d+))?\b/);
  if (ipMatch) {
    return {
      host: ipMatch[1],
      port: Number(ipMatch[2] || 631),
    };
  }
  return null;
}

async function getWindowsPrintersFallback(): Promise<DiscoveredPrinter[]> {
  if (process.platform !== 'win32') return [];
  try {
    const sysRoot = process.env.SystemRoot || 'C:\\Windows';
    const psPath = join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = `Get-CimInstance Win32_Printer | Select-Object Name, Default, PortName, WorkOffline, PrinterStatus | ConvertTo-Json -Compress`;
    const { stdout } = await execFileAsync(psPath, ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 5000,
      env: { ...process.env, PATH: `${join(sysRoot, 'System32')};${join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0')};${process.env.PATH || ''}` },
    });
    const trimmed = stdout.trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed);
    const list: Array<{ Name?: string; Default?: boolean; PortName?: string; WorkOffline?: boolean; PrinterStatus?: number }> = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .filter((p) => p && typeof p.Name === 'string' && p.Name.trim().length > 0)
      .map((p) => {
        const name = p.Name!.trim();
        const isVirtualPdf = name.toLowerCase().includes('pdf') || name.toLowerCase().includes('onenote') || name.toLowerCase().includes('xps');

        const isOnline = !p.WorkOffline && ![6, 7, 8, 9].includes(p.PrinterStatus ?? 0);
        const effectiveStatus = (isOnline || name.includes('://') || name.includes('\\\\') || name.toLowerCase().includes('virtual')) ? 'ready' : 'offline';

        return {
          systemName: name,
          displayName: name,
          isDefault: Boolean(p.Default),
          status: effectiveStatus,
          capabilities: {
            paperSizes: ['A3', 'A4', 'A5', 'Legal'],
            supportsColour: true,
            supportsDuplex: true,
          },
        } satisfies DiscoveredPrinter;
      });
  } catch (err) {
    // If PowerShell execution fails (e.g. process environment restrictions), silently fall back without throwing
    return [];
  }
}

async function discoverPrinters(): Promise<DiscoveredPrinter[]> {
  const map = new Map<string, DiscoveredPrinter>();

  // 1. First attempt: Electron getPrintersAsync
  try {
    const targetWin = mainWindow ?? BrowserWindow.getAllWindows()[0];
    const electronPrinters = await targetWin?.webContents.getPrintersAsync() ?? [];
    for (const printer of electronPrinters) {
      const options = (printer.options ?? {}) as Record<string, string | undefined>;
      const supported = (options['paper-sizes'] ?? options['media-supported'] ?? 'iso_a4_210x297mm').toLowerCase();
      const isVirtualPdf = printer.name.toLowerCase().includes('pdf') || printer.name.toLowerCase().includes('onenote');
      const detectedPaperSizes = (['A3','A4','A5','Legal'] as const).filter((size) => supported.includes(size.toLowerCase()) || (size === 'A4' && supported.includes('210x297')));

      // Electron's PrinterInfo does not report online state; enrich it from Windows below.
      const effectiveStatus = 'ready';

      map.set(printer.name.toLowerCase(), {
        systemName: printer.name,
        displayName: printer.displayName || printer.name,
        isDefault: /true|1/i.test(String(options['is-default'] ?? options.isDefault ?? '')),
        status: effectiveStatus,
        capabilities: {
          paperSizes: isVirtualPdf || detectedPaperSizes.length === 0 ? ['A3', 'A4', 'A5', 'Legal'] : detectedPaperSizes,
          supportsColour: isVirtualPdf || /true|color|colour/i.test(options.color ?? options['print-color-mode'] ?? ''),
          supportsDuplex: isVirtualPdf || /duplex|two-sided/i.test(options['sides'] ?? options.duplex ?? ''),
        },
      });
    }
  } catch (err) {
    console.warn('[AGENT] Electron getPrintersAsync error:', err);
  }

  // 2. Also run PowerShell WMI discovery to catch any printers Windows knows about
  // (e.g. freshly installed IPP/network printers that Electron's print cache hasn't refreshed yet)
  if (process.platform === 'win32') {
    try {
      const fallbackList = await getWindowsPrintersFallback();
      for (const p of fallbackList) {
        const existing = map.get(p.systemName.toLowerCase());
        if (!existing) {
          map.set(p.systemName.toLowerCase(), p);
        } else {
          map.set(p.systemName.toLowerCase(), { ...existing, isDefault: p.isDefault, status: p.status });
        }
      }
    } catch (err) {
      console.warn('[AGENT] Fallback printer merge error:', err);
    }
  }

  return Array.from(map.values());
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
  const printWindow = new BrowserWindow({
    show: false,
    width: 794,   // A4 at 96 DPI: 210mm * 3.7795 px/mm
    height: 1123, // A4 at 96 DPI: 297mm * 3.7795 px/mm
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  const printId = randomUUID();
  try {
    const rendered = new Promise<void>((resolve, reject) => {
      pendingPrints.set(printId, { window: printWindow, printerName: job.printerSystemName, options: job.options, resolve, reject });
      printWindow.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          if (!printWindow.isDestroyed()) {
            printWindow.webContents.send('agent:print-payload', { id: printId, options: job.options, files });
          }
        }, 500);
      });
    });
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) await printWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?print=1`);
    else await printWindow.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), { query: { print: '1' } });
    await rendered;
    await api(`/api/agent/jobs/${job.orderId}/result`, { method: 'POST', body: JSON.stringify({ leaseId: job.leaseId, outcome: 'submitted' }) });
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
    const nextJobUrl = new URL('/api/agent/jobs/next', connection.apiUrl);
    const response = await fetch(nextJobUrl, { headers: { Authorization: `Bearer ${connection.token}` } });
    if (response.status === 200) {
      const jobData = await response.json();
      console.log(`[AGENT] Picked up job order #${jobData.orderCode} for printer ${jobData.printerSystemName}`);
      await printJob(leasedPrintJobSchema.parse(jobData));
    }
  } catch (error) {
    console.error('[AGENT] Poll error:', error);
    emitStatus({ error: error instanceof Error ? error.message : 'Agent connection failed.' });
  }
  finally { busy = false; }
}
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  void poll();
  pollTimer = setInterval(() => void poll(), 5_000); // Poll every 5s for fast auto-printing
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string | undefined;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Printly',
    width: 1320,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#f4f7fa',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const webUrl = process.env.PRINTLY_WEB_URL ?? (app.isPackaged ? productionWebUrl : 'http://localhost:5173');
  void mainWindow.loadURL(webUrl);

  mainWindow.webContents.on('did-finish-load', () => {
    if (connection) {
      void heartbeat().catch((err) => console.warn('[AGENT] Post-load heartbeat failed:', err));
    }
  });

  mainWindow.webContents.on('did-fail-load', () => {
    // If client web server on 5173 is still compiling/starting, retry after 1.5s
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        void mainWindow.loadURL(webUrl);
      }
    }, 1500);
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    let origin = '';
    try { origin = new URL(url).origin; } catch { /* blocked below */ }
    if (isAllowedOrigin(origin)) return;
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
  await loadConnection();
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://*/*', 'http://*/*'] }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    try {
      const url = new URL(details.url);
      if (connection && url.pathname.startsWith('/api/') && isAllowedOrigin(url.origin)) {
        requestHeaders['X-Printly-Agent-Token'] = connection.token;
      }
    } catch { /* Ignore malformed or non-web request URLs. */ }
    callback({ requestHeaders });
  });
  createWindow();
  if (connection && !pauseJobPolling) startPolling();
  else if (connection && pauseJobPolling) console.warn('[AGENT] Automatic print-job polling is paused for this session.');
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
ipcMain.handle('agent:status', async () => {
  const printersList = await discoverPrinters();
  return {
    connected: Boolean(connection),
    deviceName: connection?.deviceName || hostname(),
    shopName: connection?.shopName,
    apiUrl: connection?.apiUrl,
    agentVersion: VERSION,
    printersCount: printersList.length,
    printers: printersList,
  };
});
ipcMain.handle('agent:refresh', async () => {
  if (connection) {
    try {
      await heartbeat();
      console.log('[AGENT] Manual refresh triggered successful heartbeat.');
    } catch (err) {
      console.error('[AGENT] Manual refresh heartbeat failed:', err);
      emitStatus({ error: err instanceof Error ? err.message : 'Heartbeat failed.' });
    }
  } else {
    console.warn('[AGENT] agent:refresh invoked but agent has no saved connection credentials.');
  }
  const printersList = await discoverPrinters();
  return {
    connected: Boolean(connection),
    deviceName: connection?.deviceName || hostname(),
    shopName: connection?.shopName,
    apiUrl: connection?.apiUrl,
    agentVersion: VERSION,
    printersCount: printersList.length,
    printers: printersList,
  };
});
ipcMain.handle('agent:shop-online', async (_event, isOnline: unknown) => {
  if (typeof isOnline !== 'boolean') throw new Error('Choose whether the shop is online.');
  return api('/api/agent/shop-online', { method: 'PATCH', body: JSON.stringify({ isOnline }) });
});
ipcMain.handle('agent:open-external', async (_event, url: string) => {
  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});
ipcMain.handle('agent:pair', async (event, input: { code: string; apiUrl: string }) => {
  let senderOrigin = '';
  try { senderOrigin = new URL(event.sender.getURL()).origin; } catch { /* reject below */ }
  if (!isAllowedOrigin(senderOrigin)) throw new Error('Pairing can only be started from Printly.');
  const apiUrl = input.apiUrl.trim().replace(/\/+$/, '');
  let parsedApiUrl: URL;
  try { parsedApiUrl = new URL(apiUrl); } catch { throw new Error('Enter the Printly backend URL (https://…).'); }
  if (parsedApiUrl.protocol !== 'https:' && !(parsedApiUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsedApiUrl.hostname))) throw new Error('Use a secure HTTPS Printly server URL or localhost.');
  const response = await fetch(new URL('/api/agent/pair', apiUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairingCode: input.code, deviceName: hostname(), agentVersion: VERSION }) });
  const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not pair this computer.');
  const paired = pairAgentResponseSchema.parse(body);
  connection = { apiUrl, token: paired.accessToken, deviceName: paired.deviceName, shopName: paired.shop.displayName, deviceId: paired.deviceId };
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable on this computer.');
  await writeFile(credentialsPath(), safeStorage.encryptString(JSON.stringify(connection)));
  await heartbeat();
  if (!pauseJobPolling) startPolling();
  else console.warn('[AGENT] Paired successfully, but automatic print-job polling is paused for this session.');
  emitStatus(); return { connected: true, deviceName: connection.deviceName, shopName: connection.shopName, agentVersion: VERSION };
});
ipcMain.handle('agent:disconnect', async () => { if (pollTimer) clearInterval(pollTimer); connection = null; await rm(credentialsPath(), { force: true }); emitStatus(); return { connected: false }; });
ipcMain.handle('agent:print-ready', async (event, input: { id: string; error?: string }) => {
  const pending = pendingPrints.get(input.id);
  if (!pending || pending.window.webContents.id !== event.sender.id) return;
  if (input.error) { pending.reject(new Error(input.error)); return; }
  const { options } = pending;
  const isVirtualPdf = pending.printerName.toLowerCase().includes('pdf') || pending.printerName.toLowerCase().includes('onenote');

  if (isVirtualPdf) {
    try {
      const pdfBuffer = await pending.window.webContents.printToPDF({
        landscape: options.orientation === 'landscape',
        pageSize: options.paperSize as 'A3'|'A4'|'A5'|'Legal',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        printBackground: true,
      });
      const pdfPath = join(app.getPath('downloads'), `printly-preview-${Date.now()}.pdf`);
      await writeFile(pdfPath, pdfBuffer);
      console.log(`[AGENT] Virtual PDF generated and saved to: ${pdfPath}`);
      void shell.openPath(pdfPath);
      pending.resolve();
    } catch (err) {
      pending.reject(err instanceof Error ? err : new Error('Could not generate PDF.'));
    }
    return;
  }

  pending.window.webContents.print(
    {
      silent: true,
      deviceName: pending.printerName,
      color: options.colour,
      copies: options.copies,
      landscape: options.orientation === 'landscape',
      duplexMode: options.duplex ? 'longEdge' : 'simplex',
      pageSize: options.paperSize as 'A3'|'A4'|'A5'|'Legal',
      // The rendered page already contains the exact paper canvas and @page
      // margins are zero. Asking the driver for its printable area applies a
      // second, device-specific offset/scale (some virtual printers report a
      // bad printable origin), which can shift the photo off the page.
      margins: { marginType: 'none' },
      printBackground: true,
    },
    (success, failureReason) => (success ? pending.resolve() : pending.reject(new Error(failureReason || 'Windows could not submit the print job.')))
  );
});
