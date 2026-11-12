import type { IpcRendererEvent } from 'electron';
export {};
declare global {
  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
  const MAIN_WINDOW_VITE_NAME: string;
  interface PrintPayload { id: string; options: { paperSize: string; orientation?: string; colour: boolean; duplex: boolean; copies: number; pageRange?: string; photoLayout?: string }; files: Array<{ name: string; mediaType: string; data: string }> }
  interface Window {
    printly: {
      getStatus(): Promise<AgentStatus>;
      pair(code: string, apiUrl: string): Promise<AgentStatus>;
      disconnect(): Promise<AgentStatus>;
      onPrintPayload(callback: (payload: PrintPayload) => void): () => void;
      printReady(id: string, error?: string): Promise<void>;
      onStatus(callback: (status: AgentStatus) => void): () => void;
    };
  }
  interface AgentStatus { connected: boolean; deviceName?: string; shopName?: string; agentVersion?: string; printers?: number; lastHeartbeat?: string; lastJob?: string; error?: string }
}
