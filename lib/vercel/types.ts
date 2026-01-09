// Vercel API types

export interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  createdAt: number;
  updatedAt: number;
}

export interface VercelDeployment {
  id: string;
  url: string;
  name: string;
  readyState: 'QUEUED' | 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'READY' | 'CANCELED';
  createdAt: number;
  buildingAt?: number;
  ready?: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface VercelFile {
  file: string;  // file path
  data: string;  // file content (will be base64 encoded if binary)
}

export interface CreateDeploymentRequest {
  name: string;
  files: VercelFile[];
  project?: string;
  projectSettings?: {
    buildCommand?: string | null;
    installCommand?: string | null;
    outputDirectory?: string | null;
    framework?: string | null;
  };
  target?: 'production' | 'staging' | 'preview';
}

export interface RuntimeLog {
  level: 'error' | 'warning' | 'info';
  message: string;
  rowId: string;
  source: 'delimiter' | 'edge-function' | 'edge-middleware' | 'serverless' | 'request';
  timestampInMs: number;
  domain: string;
  messageTruncated: boolean;
  requestMethod?: string;
  requestPath?: string;
  responseStatusCode?: number;
}

export interface VercelError {
  error: {
    code: string;
    message: string;
  };
}
