import { contextBridge, ipcRenderer } from 'electron';
import type { AgentStatus, PrintPayload } from './types';

contextBridge.exposeInMainWorld('printly', {
  getStatus: (): Promise<AgentStatus> => ipcRenderer.invoke('agent:status'),
  refresh: (): Promise<AgentStatus> => ipcRenderer.invoke('agent:refresh'),
  pair: (code: string, apiUrl: string) => ipcRenderer.invoke('agent:pair', { code, apiUrl }),
  disconnect: () => ipcRenderer.invoke('agent:disconnect'),
  openExternal: (url: string) => ipcRenderer.invoke('agent:open-external', url),
  onPrintPayload: (callback: (payload: PrintPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: PrintPayload) => callback(payload);
    ipcRenderer.on('agent:print-payload', listener);
    return () => ipcRenderer.removeListener('agent:print-payload', listener);
  },
  printReady: (id: string, error?: string) => ipcRenderer.invoke('agent:print-ready', { id, error }),
  onStatus: (callback: (status: AgentStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AgentStatus) => callback(status);
    ipcRenderer.on('agent:status-changed', listener);
    return () => ipcRenderer.removeListener('agent:status-changed', listener);
  },
});
