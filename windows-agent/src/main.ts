import { app, BrowserWindow, ipcMain, Menu, nativeImage, safeStorage, session, shell, Tray } from 'electron';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { leasedPrintJobSchema, type DiscoveredPrinter } from '@printly/contracts';

const execFileAsync = promisify(execFile);

if (process.platform === 'win32') app.setAppUserModelId('com.squirrel.UrQrPrintAgent.UrQrPrintAgent');

const VERSION = app.getVersion();
const credentialsPath = () => join(app.getPath('userData'), 'connection.bin');
type Connection = { apiUrl: string; token: string; deviceName: string; shopName: string; deviceId: string };
let mainWindow: BrowserWindow | null = null;
let connection: Connection | null = null;
let sessionAuthenticated = false;
let pollTimer: NodeJS.Timeout | undefined;
let busy = false;
let tray: Tray | null = null;
let isQuitting = false;
const pendingPrints = new Map<string, { window: BrowserWindow; printerName: string; options: ReturnType<typeof leasedPrintJobSchema.parse>['options']; resolve: () => void; reject: (error: Error) => void }>();
const productionWebUrl = 'https://www.urqrprint.shop';
const apiServerUrl = 'https://api-aws.urqrprint.shop';
const pauseJobPolling = process.env.PRINTLY_PAUSE_JOB_POLLING === '1';
function isAllowedOrigin(origin: string): boolean {
  if (!origin || origin === 'null' || origin.startsWith('file:') || origin.startsWith('vscode-webview:')) return true;
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host === 'www.urqrprint.shop' || host === 'urqrprint.shop' || host === 'myqrprint.vercel.app';
  } catch { return false; }
}

async function loadConnection() {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const savedConnection = JSON.parse(safeStorage.decryptString(await readFile(credentialsPath()))) as Connection;
      connection = { ...savedConnection, apiUrl: apiServerUrl };
      if (savedConnection.apiUrl !== apiServerUrl) {
        await writeFile(credentialsPath(), safeStorage.encryptString(JSON.stringify(connection)));
      }
      console.log(`[AGENT] Loaded credentials for device: ${connection?.deviceName}, shop: ${connection?.shopName}`);
    }
  } catch (err) {
    console.warn('[AGENT] Could not load saved connection:', err);
    connection = null;
  }
}

async function resumeSavedConnection() {
  if (!connection) return;
  // The device token is stored encrypted by Electron safeStorage. Validate it
  // with the backend on every app launch; the embedded website login cookie
  // can then remain independent from the print agent's device credentials.
  sessionAuthenticated = true;
  try {
    await api('/api/agent/me');
    await heartbeat();
    if (!pauseJobPolling) startPolling();
    console.log(`[AGENT] Resumed saved connection for ${connection.deviceName}.`);
  } catch (error) {
    console.warn('[AGENT] Saved connection could not be resumed:', error);
    // Keep valid local credentials and let the normal poll loop retry transient
    // network/server failures. api() clears the saved token on an explicit 401.
    if (connection && sessionAuthenticated && !pauseJobPolling) startPolling();
  }
}
function emitStatus(extra: Record<string, unknown> = {}) {
  mainWindow?.webContents.send('agent:status-changed', { connected: Boolean(connection && sessionAuthenticated), deviceName: connection?.deviceName, shopName: connection?.shopName, agentVersion: VERSION, ...extra });
}
async function api(path: string, init: RequestInit = {}) {
  if (!connection || !sessionAuthenticated) throw new Error('Sign in to UrQrPrint in this desktop app to connect this computer.');
  const response = await fetch(new URL(path, connection.apiUrl), { ...init, headers: { Authorization: `Bearer ${connection.token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  if (!response.ok && response.status !== 204) {
    const message = (await response.json().catch(() => ({})) as {error?:string}).error ?? `UrQrPrint server returned ${response.status}.`;
    if (response.status === 401) { connection = null; sessionAuthenticated = false; if (pollTimer) clearInterval(pollTimer); await rm(credentialsPath(), { force: true }); emitStatus({ error: message }); }
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
    await api(`/api/agent/jobs/${job.orderId}/result`, { method: 'POST', body: JSON.stringify({ leaseId: job.leaseId, outcome: 'printed' }) });
    emitStatus({ lastJob: `Order ${job.orderCode} printed on ${job.printerSystemName}.` });
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
  const appIconPath = join(app.getAppPath(), 'assets', 'urqrprint-icon.ico');
  mainWindow = new BrowserWindow({
    title: 'UrQrPrint — Print orders, made simple',
    icon: appIconPath,
    width: 1320,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#ffffff',
    ...(process.platform === 'win32' ? {
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: { color: '#ffffff', symbolColor: '#314137', height: 36 },
    } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const webUrl = process.env.PRINTLY_WEB_URL ?? (app.isPackaged ? productionWebUrl : 'http://localhost:5173');
  const launchUrl = new URL(webUrl);
  if (launchUrl.pathname === '/' || launchUrl.pathname === '') {
    launchUrl.pathname = connection && sessionAuthenticated ? '/dashboard' : '/login';
  }
  void mainWindow.loadURL(launchUrl.toString());

  mainWindow.webContents.on('did-finish-load', () => {
    if (process.platform === 'win32') {
      const iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#237b53"/><path fill="#fff" d="M7 7h7v7H7zm11 0h7v7h-7zM7 18h7v7H7zm11 0h7v7h-7zM15 15h3v3h-3z"/></svg>';
      const iconDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg)}`;
      void mainWindow?.webContents.executeJavaScript(`(() => {
        if (document.getElementById('urqrprint-native-titlebar')) return;
        const titlebar = document.createElement('div');
        titlebar.id = 'urqrprint-native-titlebar';
        titlebar.innerHTML = '<img alt="" src="${iconDataUrl}"><span>UrQrPrint — Print orders, made simple</span>';
        titlebar.style.cssText = 'position:fixed;top:0;left:env(titlebar-area-x,0px);width:env(titlebar-area-width,100%);height:36px;box-sizing:border-box;display:flex;align-items:center;gap:9px;padding:0 12px;background:#fff;border-bottom:1px solid #edf0ed;color:#26332c;font:600 13px Segoe UI,Arial,sans-serif;z-index:2147483647;-webkit-app-region:drag;user-select:none';
        titlebar.querySelector('img').style.cssText = 'width:20px;height:20px;display:block';
        document.body.prepend(titlebar);
        const appRoot = document.getElementById('root');
        if (appRoot) { appRoot.style.paddingTop = '36px'; appRoot.style.boxSizing = 'border-box'; }
      })()`);
    }
    if (connection && sessionAuthenticated) {
      void heartbeat().catch((err) => console.warn('[AGENT] Post-load heartbeat failed:', err));
    }
  });

  mainWindow.webContents.on('did-fail-load', () => {
    // If client web server on 5173 is still compiling/starting, retry after 1.5s
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        void mainWindow.loadURL(launchUrl.toString());
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
  await resumeSavedConnection();
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://*/*', 'http://*/*'] }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    try {
      const url = new URL(details.url);
      if (connection && sessionAuthenticated && url.pathname.startsWith('/api/') && isAllowedOrigin(url.origin)) {
        requestHeaders['X-Printly-Agent-Token'] = connection.token;
      }
    } catch { /* Ignore malformed or non-web request URLs. */ }
    callback({ requestHeaders });
  });
  createWindow();
  if (connection) console.log('[AGENT] Saved desktop token found; waiting for shop sign-in in the app before reconnecting.');
  app.setLoginItemSettings({ openAtLogin: true });
  tray = new Tray(nativeImage.createFromPath(join(app.getAppPath(), 'assets', 'urqrprint-tray.png')));
  tray.setToolTip('UrQrPrint Agent');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open UrQrPrint Agent', click: () => { if (!mainWindow) createWindow(); mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Quit UrQrPrint Agent', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { if (!mainWindow) createWindow(); mainWindow?.show(); mainWindow?.focus(); });
  app.on('activate', () => { if (!mainWindow) createWindow(); });
});
app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && isQuitting) app.quit(); });
ipcMain.handle('agent:status', async () => {
  const printersList = await discoverPrinters();
  return {
    connected: Boolean(connection && sessionAuthenticated),
    deviceName: connection?.deviceName || hostname(),
    shopName: connection?.shopName,
    apiUrl: connection?.apiUrl,
    agentVersion: VERSION,
    printersCount: printersList.length,
    printers: printersList,
  };
});
ipcMain.handle('agent:refresh', async () => {
  if (connection && sessionAuthenticated) {
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
    connected: Boolean(connection && sessionAuthenticated),
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
ipcMain.handle('agent:google-login', async () => {
  if (connection && sessionAuthenticated) {
    return { connected: true, deviceName: connection.deviceName, shopName: connection.shopName, agentVersion: VERSION };
  }
  const startResponse = await fetch(new URL('/api/agent/login/start', apiServerUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceName: hostname(), agentVersion: VERSION }),
  });
  const startBody = await startResponse.json().catch(() => ({})) as { error?: string; state?: string; pollToken?: string };
  if (!startResponse.ok || !startBody.state || !startBody.pollToken) {
    throw new Error(startBody.error ?? 'Could not start Google sign-in. Please try again.');
  }

  const signInUrl = new URL('/desktop-login', productionWebUrl);
  signInUrl.searchParams.set('state', startBody.state);
  await shell.openExternal(signInUrl.toString());
  const expiresAt = Date.now() + 5 * 60 * 1000;
  while (Date.now() < expiresAt) {
    let pollResponse: Response;
    try {
      pollResponse = await fetch(new URL('/api/agent/login/poll', apiServerUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: startBody.state, pollToken: startBody.pollToken }),
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      if (Date.now() >= expiresAt) break;
      console.warn('[AGENT] Desktop sign-in poll had a temporary network failure; retrying:', error);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      continue;
    }
    const pollBody = await pollResponse.json().catch(() => ({})) as {
      error?: string; status?: string; accessToken?: string; deviceId?: string; deviceName?: string; shop?: { displayName?: string };
    };
    if ((pollResponse.status === 202 && pollBody.status === 'pending') || pollResponse.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }
    if (!pollResponse.ok) throw new Error(pollBody.error ?? 'Google sign-in could not be completed.');
    if (pollBody.status !== 'complete' || !pollBody.accessToken || !pollBody.deviceId || !pollBody.deviceName || !pollBody.shop?.displayName) {
      throw new Error('UrQrPrint returned incomplete desktop sign-in details.');
    }
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable on this computer.');
    const nextConnection: Connection = {
      apiUrl: apiServerUrl,
      token: pollBody.accessToken,
      deviceName: pollBody.deviceName,
      shopName: pollBody.shop.displayName,
      deviceId: pollBody.deviceId,
    };
    await writeFile(credentialsPath(), safeStorage.encryptString(JSON.stringify(nextConnection)));
    connection = nextConnection;
    sessionAuthenticated = true;
    await heartbeat().catch((error) => console.warn('[AGENT] Initial Google sign-in heartbeat failed; background polling will retry:', error));
    if (!pauseJobPolling) startPolling();
    emitStatus({ message: 'Google sign-in complete.' });
    return { connected: true, deviceName: connection.deviceName, shopName: connection.shopName, agentVersion: VERSION };
  }
  throw new Error('Google sign-in timed out. Finish sign-in in your browser, then try again.');
});

ipcMain.handle('agent:connect', async (event) => {
  let senderOrigin = '';
  try { senderOrigin = new URL(event.sender.getURL()).origin; } catch { /* reject below */ }
  if (!isAllowedOrigin(senderOrigin) || !senderOrigin) throw new Error('Desktop sign-in can only connect from UrQrPrint.');
  if (connection && sessionAuthenticated) {
    return { connected: true, deviceName: connection.deviceName, shopName: connection.shopName, agentVersion: VERSION };
  }
  const apiUrl = apiServerUrl;
  const cookieUrl = new URL('/', senderOrigin).toString();
  const cookies = await session.defaultSession.cookies.get({ url: cookieUrl });
  const sessionCookie = cookies.find((cookie) => cookie.name === 'printly.sid');
  if (!sessionCookie) throw new Error('Sign in to your shop account in the desktop app first.');
  const response = await fetch(new URL('/api/agent/connect', apiUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `printly.sid=${sessionCookie.value}`,
      Origin: senderOrigin,
    },
    body: JSON.stringify({ deviceName: hostname(), agentVersion: VERSION }),
  });
  const body = await response.json() as { error?: string; deviceId?: string; deviceName?: string; accessToken?: string; shop?: { displayName?: string } };
  if (!response.ok) throw new Error(body.error ?? 'Could not connect this desktop to your shop.');
  if (!body.deviceId || !body.accessToken || !body.deviceName || !body.shop?.displayName) throw new Error('UrQrPrint returned incomplete desktop connection details.');
  connection = { apiUrl, token: body.accessToken, deviceName: body.deviceName, shopName: body.shop.displayName, deviceId: body.deviceId };
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable on this computer.');
  await writeFile(credentialsPath(), safeStorage.encryptString(JSON.stringify(connection)));
  sessionAuthenticated = true;
  await heartbeat().catch((error) => console.warn('[AGENT] Initial heartbeat failed; background polling will retry:', error));
  if (!pauseJobPolling) startPolling();
  else console.warn('[AGENT] Connected, but automatic print-job polling is paused for this session.');
  emitStatus(); return { connected: true, deviceName: connection.deviceName, shopName: connection.shopName, agentVersion: VERSION };
});
ipcMain.handle('agent:disconnect', async () => {
  if (pollTimer) clearInterval(pollTimer);
  if (connection && sessionAuthenticated) await api('/api/agent/disconnect', { method: 'POST' }).catch((error) => console.warn('[AGENT] Could not revoke the signed-in desktop session:', error));
  connection = null;
  sessionAuthenticated = false;
  await rm(credentialsPath(), { force: true });
  emitStatus();
  return { connected: false };
});
ipcMain.handle('agent:print-ready', async (event, input: { id: string; error?: string }) => {
  const pending = pendingPrints.get(input.id);
  if (!pending || pending.window.webContents.id !== event.sender.id) return;
  if (input.error) { pending.reject(new Error(input.error)); return; }
  const { options } = pending;
  const isVirtualPdf = pending.printerName.toLowerCase().includes('pdf') || pending.printerName.toLowerCase().includes('onenote');

  if (isVirtualPdf) {
    try {
      // Electron's printToPDF does not accept a copies option. Repeat the
      // rendered document pages here so virtual-PDF output honors the same
      // copy count as a physical Windows printer.
      const copies = Math.max(1, Math.min(100, Math.trunc(options.copies)));
      await pending.window.webContents.executeJavaScript(`(() => {
        const root = document.getElementById('print-root');
        if (!root) throw new Error('The rendered print document is missing.');
        const originalPages = Array.from(root.children);
        if (!originalPages.length) throw new Error('The rendered print document has no pages.');
        for (let copy = 1; copy < ${copies}; copy++) {
          for (const page of originalPages) root.appendChild(page.cloneNode(true));
        }
        return originalPages.length * ${copies};
      })()`);
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

  try {
    // Submit one spool request per purchased copy. Some Windows and mobile
    // printer drivers silently ignore Electron's copies option, so do not
    // delegate copy counting to the driver.
    const copies = Math.max(1, Math.min(100, Math.trunc(options.copies)));
    for (let copy = 1; copy <= copies; copy++) {
      await new Promise<void>((resolve, reject) => {
        pending.window.webContents.print(
          {
            silent: true,
            deviceName: pending.printerName,
            color: options.colour,
            copies: 1,
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
          (success, failureReason) => success
            ? resolve()
            : reject(new Error(`Copy ${copy} of ${copies}: ${failureReason || 'Windows could not submit the print job.'}`)),
        );
      });
      if (copy < copies) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    console.log(`[AGENT] Submitted ${copies} print request${copies === 1 ? '' : 's'} for order ${options.copies} copies.`);
    pending.resolve();
  } catch (err) {
    pending.reject(err instanceof Error ? err : new Error('Windows could not submit every print copy.'));
  }
});
