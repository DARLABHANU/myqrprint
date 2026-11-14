import type { DiscoveredPrinter } from '@printly/contracts';

export type PrintPayload = {
  id: string;
  options: {
    paperSize: string;
    colour: boolean;
    duplex: boolean;
    copies: number;
    orientation?: 'portrait' | 'landscape';
    pageRange?: string;
    photoLayout?: string;
  };
  files: Array<{ name: string; mediaType: string; data: string }>;
};

export type AgentStatus = {
  connected: boolean;
  deviceName?: string;
  shopName?: string;
  apiUrl?: string;
  agentVersion?: string;
  printersCount?: number;
  printers?: DiscoveredPrinter[];
  lastHeartbeat?: string;
  lastJob?: string;
  message?: string;
  error?: string;
};

export interface WindowPrintlyApi {
  getStatus: () => Promise<AgentStatus>;
  refresh: () => Promise<AgentStatus>;
  setShopOnline: (isOnline: boolean) => Promise<{ isOnline: boolean; agentOnline: boolean }>;
  pair: (code: string, apiUrl: string) => Promise<{ connected: boolean; deviceName: string; shopName?: string }>;
  disconnect: () => Promise<{ connected: boolean }>;
  openExternal: (url: string) => Promise<boolean>;
  onPrintPayload: (callback: (payload: PrintPayload) => void) => () => void;
  printReady: (id: string, error?: string) => Promise<void>;
  onStatus: (callback: (status: AgentStatus) => void) => () => void;
}

declare global {
  interface Window {
    printly: WindowPrintlyApi;
  }
}

