/**
 * Session Handler
 * Manages the lifecycle of a development environment session
 */

import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import type { Env, SessionInfo, SessionStatus, EnvironmentConfig, LogEntry } from '../types';
import { GitHubService } from './github';
import { AIAnalyzer } from './ai-analyzer';

export class SessionHandler {
  private env: Env;
  private sessionId: string;
  private sandbox: Sandbox;
  private logs: LogEntry[] = [];
  private status: SessionStatus = 'initializing';
  private repoOwner: string = '';
  private repoName: string = '';
  private environment: EnvironmentConfig | null = null;
  private previewUrl: string | null = null;
  private error: string | null = null;
  private createdAt: number;
  private lastActivityAt: number;

  constructor(env: Env, sessionId: string) {
    this.env = env;
    this.sessionId = sessionId;
    this.sandbox = getSandbox(env.DEV_ENVIRONMENT, sessionId);
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
  }

  private log(level: LogEntry['level'], message: string): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
    };
    this.logs.push(entry);
    this.lastActivityAt = Date.now();
    console.log(`[${level.toUpperCase()}] ${message}`);
  }

  private setStatus(status: SessionStatus): void {
    this.status = status;
    this.log('info', `Status changed to: ${status}`);
  }

  getSessionInfo(): SessionInfo {
    return {
      id: this.sessionId,
      repoOwner: this.repoOwner,
      repoName: this.repoName,
      repoFullName: `${this.repoOwner}/${this.repoName}`,
      status: this.status,
      environment: this.environment,
      previewUrl: this.previewUrl,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      logs: this.logs.slice(-100), // Last 100 logs
      error: this.error,
    };
  }

  async initialize(owner: string, repo: string): Promise<void> {
    this.repoOwner = owner;
    this.repoName = repo;

    try {
      this.log('info', `Initializing session for ${owner}/${repo}`);

      // Step 1: Clone the repository
      await this.cloneRepository(owner, repo);

      // Step 2: Analyze the repository
      await this.analyzeRepository(owner, repo);

      // Step 3: Install dependencies
      if (this.environment?.installCommand) {
        await this.installDependencies();
      }

      // Step 4: Build if needed
      if (this.environment?.buildCommand) {
        await this.buildProject();
      }

      // Step 5: Start the application
      await this.startApplication();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unknown error';
      this.setStatus('error');
      this.log('error', `Session failed: ${this.error}`);
      throw error;
    }
  }

  private async cloneRepository(owner: string, repo: string): Promise<void> {
    this.setStatus('cloning');
    this.log('info', `Cloning repository: ${owner}/${repo}`);

    const github = new GitHubService(this.env);
    const cloneUrl = github.getCloneUrl(owner, repo);

    // Use sandbox to clone the repo
    const result = await this.sandbox.exec(
      `git clone --depth 1 ${cloneUrl} /workspace/repo`,
      { timeout: 120000 } // 2 minute timeout for clone
    );

    if (!result.success) {
      throw new Error(`Failed to clone repository: ${result.stderr}`);
    }

    this.log('info', 'Repository cloned successfully');
  }

  private async analyzeRepository(owner: string, repo: string): Promise<void> {
    this.setStatus('analyzing');
    this.log('info', 'Analyzing repository structure');

    const github = new GitHubService(this.env);
    const analyzer = new AIAnalyzer(this.env);

    // Fetch repo info and files
    const repoInfo = await github.getRepository(owner, repo);
    const files = await github.getRepositoryFiles(owner, repo);
    const configContents = await github.getConfigFileContents(owner, repo, files);

    // Run AI analysis
    const analysis = await analyzer.analyzeRepository({
      repoInfo,
      files,
      configContents,
    });

    this.environment = analysis.environment;
    this.log('info', `Detected environment: ${analysis.environment.name}`);
    this.log('info', `Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
    this.log('debug', `Reasoning: ${analysis.reasoning}`);
  }

  private async installDependencies(): Promise<void> {
    if (!this.environment?.installCommand) return;

    this.setStatus('installing');
    this.log('info', `Installing dependencies: ${this.environment.installCommand}`);

    const result = await this.sandbox.exec(
      `cd /workspace/repo && ${this.environment.installCommand}`,
      { timeout: 300000 } // 5 minute timeout for install
    );

    if (!result.success) {
      this.log('warn', `Install warning: ${result.stderr}`);
      // Don't fail on install warnings, some packages have warnings
    }

    this.log('info', 'Dependencies installed');
  }

  private async buildProject(): Promise<void> {
    if (!this.environment?.buildCommand) return;

    this.setStatus('building');
    this.log('info', `Building project: ${this.environment.buildCommand}`);

    const result = await this.sandbox.exec(
      `cd /workspace/repo && ${this.environment.buildCommand}`,
      { timeout: 300000 } // 5 minute timeout for build
    );

    if (!result.success) {
      throw new Error(`Build failed: ${result.stderr}`);
    }

    this.log('info', 'Build completed successfully');
  }

  private async startApplication(): Promise<void> {
    if (!this.environment) {
      throw new Error('No environment configuration');
    }

    this.setStatus('starting');
    this.log('info', `Starting application: ${this.environment.startCommand}`);

    // Set environment variables if any
    const envVarsStr = Object.entries(this.environment.envVars || {})
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');

    const startCmd = envVarsStr
      ? `cd /workspace/repo && ${envVarsStr} ${this.environment.startCommand}`
      : `cd /workspace/repo && ${this.environment.startCommand}`;

    // Start the application in the background
    await this.sandbox.exec(`${startCmd} &`, { timeout: 30000 });

    // Wait a moment for the server to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Expose the port to get a preview URL
    if (this.environment.previewable && this.environment.port) {
      try {
        const previewInfo = await this.sandbox.exposePort(this.environment.port);
        this.previewUrl = previewInfo.url;
        this.log('info', `Preview available at: ${this.previewUrl}`);
      } catch (error) {
        this.log('warn', `Could not expose port: ${error}`);
      }
    }

    this.setStatus('running');
    this.log('info', 'Application started successfully');
  }

  async executeCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    this.lastActivityAt = Date.now();
    this.log('debug', `Executing command: ${command}`);

    const result = await this.sandbox.exec(`cd /workspace/repo && ${command}`, {
      timeout: 60000,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  async stop(): Promise<void> {
    this.log('info', 'Stopping session');
    this.setStatus('stopped');

    // Kill any running processes
    try {
      await this.sandbox.exec('pkill -f "node\\|python\\|ruby\\|go\\|cargo" || true');
    } catch {
      // Ignore errors during cleanup
    }
  }

  async readFile(path: string): Promise<string> {
    const result = await this.sandbox.readFile(`/workspace/repo/${path}`);
    return result.content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.sandbox.writeFile(`/workspace/repo/${path}`, content);
  }

  async listFiles(path: string = ''): Promise<string[]> {
    const result = await this.sandbox.exec(
      `find /workspace/repo/${path} -maxdepth 2 -type f | head -100`
    );
    return result.stdout.split('\n').filter(Boolean);
  }
}
