import { Sandbox, Snapshot } from '@vercel/sandbox';

export interface CreateSnapshotResult {
  snapshotId: string;
  expiresAt: Date;
}

export interface InvokeFunctionResult {
  result: unknown;
  duration: number;
}

export interface LogEntry {
  stream: 'stdout' | 'stderr';
  data: string;
  timestamp: number;
}

export class SandboxClient {
  /**
   * Create a sandbox, write worker code, and create a snapshot
   */
  async createWorkerSnapshot(
    workerScript: string,
    functions: string[]
  ): Promise<CreateSnapshotResult> {
    const sandbox = await Sandbox.create({ runtime: 'node24' });

    try {
      // Write the worker script
      await sandbox.writeFiles([
        { path: 'worker.js', content: Buffer.from(workerScript) },
        { path: 'manifest.json', content: Buffer.from(JSON.stringify({ functions }, null, 2)) },
      ]);

      // Create snapshot - this also stops the sandbox
      const snapshot = await sandbox.snapshot();

      // Snapshots expire in 7 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      return {
        snapshotId: snapshot.snapshotId,
        expiresAt,
      };
    } catch (error) {
      // Clean up the sandbox on error
      await sandbox.stop();
      throw error;
    }
  }

  /**
   * Create a sandbox from snapshot, run function, and stream logs
   */
  async invokeFunction(
    snapshotId: string,
    functionName: string,
    payload: unknown,
    onLog: (log: LogEntry) => void
  ): Promise<InvokeFunctionResult> {
    const sandbox = await Sandbox.create({
      source: { type: 'snapshot', snapshotId },
    });

    const startTime = Date.now();

    try {
      // Run the worker script with function name and payload as arguments
      // Use detached mode so we can stream logs
      const command = await sandbox.runCommand({
        cmd: 'node',
        args: ['worker.js', functionName, JSON.stringify(payload)],
        detached: true,
      });

      // Stream logs in real-time
      let stdout = '';
      for await (const log of command.logs()) {
        // Collect stdout to parse result later
        if (log.stream === 'stdout') {
          stdout += log.data;
        }

        // Check if this is the result marker - don't send to client
        if (log.data.includes('__RESULT__')) {
          continue;
        }

        onLog({
          stream: log.stream,
          data: log.data.trimEnd(),
          timestamp: Date.now(),
        });
      }

      // Wait for command to finish
      await command.wait();
      const duration = Date.now() - startTime;

      // Parse result from stdout (use multiline matching)
      const resultMatch = stdout.match(/__RESULT__([\s\S]+)__END_RESULT__/);

      if (!resultMatch) {
        throw new Error('Function did not return a result');
      }

      const parsedResult = JSON.parse(resultMatch[1]);
      return { result: parsedResult, duration };
    } finally {
      await sandbox.stop();
    }
  }

  /**
   * Check if a snapshot exists and return its metadata
   */
  async getSnapshot(snapshotId: string): Promise<{ id: string } | null> {
    try {
      const snapshot = await Snapshot.get({ snapshotId });
      if (snapshot.status === 'created') {
        return { id: snapshotId };
      }
      return null;
    } catch {
      return null;
    }
  }
}

// Singleton
let sandboxClient: SandboxClient | null = null;

export function getSandboxClient(): SandboxClient {
  if (!sandboxClient) {
    sandboxClient = new SandboxClient();
  }
  return sandboxClient;
}
