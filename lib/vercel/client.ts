import {
  VercelProject,
  VercelDeployment,
  VercelFile,
  RuntimeLog
} from './types';

const VERCEL_API_BASE = 'https://api.vercel.com';

export class VercelClient {
  private token: string;
  private teamId: string;

  constructor() {
    this.token = process.env.VERCEL_API_TOKEN!;
    this.teamId = process.env.VERCEL_TEAM_ID!;

    if (!this.token || !this.teamId) {
      throw new Error('VERCEL_API_TOKEN and VERCEL_TEAM_ID are required');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = new URL(`${VERCEL_API_BASE}${endpoint}`);
    url.searchParams.set('teamId', this.teamId);

    const response = await fetch(url.toString(), {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Vercel API error: ${response.status} - ${error.error?.message || error.message || response.statusText}`
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  }

  /**
   * Create a new Vercel project
   */
  async createProject(name: string): Promise<VercelProject> {
    return this.request<VercelProject>('/v11/projects', {
      method: 'POST',
      body: JSON.stringify({
        name,
        framework: 'nextjs',
        buildCommand: 'next build',
        outputDirectory: '.next',
      }),
    });
  }

  /**
   * Update project settings (e.g., disable SSO protection)
   */
  async updateProject(projectId: string, settings: Record<string, unknown>): Promise<VercelProject> {
    return this.request<VercelProject>(`/v9/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  }

  /**
   * Create a deployment with inline files
   */
  async createDeployment(
    projectId: string,
    files: VercelFile[]
  ): Promise<VercelDeployment> {
    const request = {
      name: projectId,
      files,
      project: projectId,
      projectSettings: {
        buildCommand: 'next build',
        installCommand: 'npm install',
        outputDirectory: '.next',
        framework: 'nextjs',
      },
      target: 'production',
    };

    return this.request<VercelDeployment>('/v13/deployments', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Get deployment status by ID
   */
  async getDeployment(deploymentId: string): Promise<VercelDeployment> {
    return this.request<VercelDeployment>(`/v13/deployments/${deploymentId}`);
  }

  /**
   * Poll deployment until ready or error
   */
  async waitForDeployment(
    deploymentId: string,
    maxAttempts = 60,
    intervalMs = 5000
  ): Promise<VercelDeployment> {
    for (let i = 0; i < maxAttempts; i++) {
      const deployment = await this.getDeployment(deploymentId);

      if (deployment.readyState === 'READY') {
        return deployment;
      }

      if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
        throw new Error(
          `Deployment failed: ${deployment.error?.message || deployment.readyState}`
        );
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Deployment timed out');
  }

  /**
   * Delete a project and all its deployments
   */
  async deleteProject(projectIdOrName: string): Promise<void> {
    await this.request(`/v9/projects/${projectIdOrName}`, {
      method: 'DELETE',
    });
  }

  /**
   * Get runtime logs for a deployment
   * Returns an async generator for streaming logs
   */
  async *streamRuntimeLogs(
    projectId: string,
    deploymentId: string
  ): AsyncGenerator<RuntimeLog> {
    const url = new URL(
      `${VERCEL_API_BASE}/v1/projects/${projectId}/deployments/${deploymentId}/runtime-logs`
    );
    url.searchParams.set('teamId', this.teamId);

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/x-ndjson',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to stream logs: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const log = JSON.parse(line) as RuntimeLog;
            yield log;
          } catch {
            // Skip malformed lines
          }
        }
      }
    }
  }

  /**
   * Get historic logs (collects from stream)
   */
  async getHistoricLogs(
    projectId: string,
    deploymentId: string,
    options: {
      since?: number;
      until?: number;
      limit?: number;
    } = {}
  ): Promise<RuntimeLog[]> {
    const logs: RuntimeLog[] = [];
    const limit = options.limit || 100;

    try {
      for await (const log of this.streamRuntimeLogs(projectId, deploymentId)) {
        // Filter by time if specified
        if (options.since && log.timestampInMs < options.since) continue;
        if (options.until && log.timestampInMs > options.until) continue;

        logs.push(log);
        if (logs.length >= limit) break;
      }
    } catch (error) {
      // Log streaming may fail if no logs exist yet, return empty array
      console.error('Error fetching logs:', error);
    }

    return logs;
  }
}

// Singleton instance
let vercelClient: VercelClient | null = null;

export function getVercelClient(): VercelClient {
  if (!vercelClient) {
    vercelClient = new VercelClient();
  }
  return vercelClient;
}
