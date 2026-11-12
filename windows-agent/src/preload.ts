import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('printly', {
  getStatus: () => ipcRenderer.invoke('agent:status'),
  pair: (code: string, apiUrl: string) => ipcRenderer.invoke('agent:pair', { code, apiUrl }),
  disconnect: () => ipcRenderer.invoke('agent:disconnect'),
  onPrintPayload: (callback: (payload: PrintPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: PrintPayload) => callback(payload);
    ipcRenderer.on('agent:print-payload', listener);
    return () => ipcRenderer.removeListener('agent:print-payload', listener);
  },
  printReady: (id: string, error?: string) => ipcRenderer.invoke('agent:print-ready', { id, error }),
  onStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
    ipcRenderer.on('agent:status-changed', listener);
    return () => ipcRenderer.removeListener('agent:status-changed', listener);
  },
});
