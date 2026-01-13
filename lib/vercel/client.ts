import { VercelDeployment, VercelFile } from './types';

const VERCEL_API_BASE = 'https://api.vercel.com';

export class VercelClient {
  private token: string;
  private teamId: string;
  private projectId: string;

  constructor() {
    this.token = process.env.VERCEL_API_TOKEN!;
    this.teamId = process.env.VERCEL_TEAM_ID!;
    this.projectId = process.env.VERCEL_WORKER_PROJECT_ID!;

    if (!this.token || !this.teamId || !this.projectId) {
      throw new Error('VERCEL_API_TOKEN, VERCEL_TEAM_ID, and VERCEL_WORKER_PROJECT_ID are required');
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

    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  }

  /**
   * Create a deployment in the shared worker project
   */
  async createDeployment(files: VercelFile[]): Promise<VercelDeployment> {
    return this.request<VercelDeployment>('/v13/deployments', {
      method: 'POST',
      body: JSON.stringify({
        name: 'worker-deployments',
        files,
        project: this.projectId,
        projectSettings: {
          buildCommand: 'next build',
          installCommand: 'npm install',
          outputDirectory: '.next',
          framework: 'nextjs',
        },
        target: 'production',
      }),
    });
  }

  /**
   * Get deployment status
   */
  async getDeployment(deploymentId: string): Promise<VercelDeployment> {
    return this.request<VercelDeployment>(`/v13/deployments/${deploymentId}`);
  }

  /**
   * Wait for deployment to be ready
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
   * Get project ID (for logs API)
   */
  getProjectId(): string {
    return this.projectId;
  }

  /**
   * Get token for direct API calls
   */
  getToken(): string {
    return this.token;
  }

  /**
   * Get team ID
   */
  getTeamId(): string {
    return this.teamId;
  }

}

// Singleton
let vercelClient: VercelClient | null = null;

export function getVercelClient(): VercelClient {
  if (!vercelClient) {
    vercelClient = new VercelClient();
  }
  return vercelClient;
}
