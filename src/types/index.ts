/**
 * Type definitions for cloudx.sh
 */

import type { Sandbox } from '@cloudflare/sandbox';

export interface Env {
  // Cloudflare Sandbox binding
  DEV_ENVIRONMENT: DurableObjectNamespace<Sandbox>;
  
  // Alternative binding name for compatibility with proxyToSandbox (optional)
  Sandbox?: DurableObjectNamespace<Sandbox>;

  // AI binding for Workers AI
  AI: Ai;

  // KV namespace for caching
  CACHE: KVNamespace;

  // Environment variables
  ENVIRONMENT: string;
  MAX_SESSION_LIFETIME_MINUTES: string;
  GITHUB_API_BASE: string;
  ALLOWED_ORIGINS?: string;

  // Secrets
  GITHUB_TOKEN?: string;
}

export interface GitHubRepo {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  description: string | null;
  language: string | null;
  topics: string[];
  size: number;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
}

export interface RepoFile {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size: number;
  content?: string;
}

export interface EnvironmentConfig {
  type: EnvironmentType;
  name: string;
  version?: string;
  port: number;
  installCommand?: string;
  buildCommand?: string;
  startCommand: string;
  envVars: Record<string, string>;
  previewable: boolean;
}

export type EnvironmentType =
  | 'nodejs'
  | 'python'
  | 'rust'
  | 'go'
  | 'ruby'
  | 'php'
  | 'java'
  | 'static'
  | 'docker'
  | 'unknown';

export interface AnalysisResult {
  repo: GitHubRepo;
  detectedEnvironment: EnvironmentConfig;
  confidence: number;
  analysisDetails: string;
  files: RepoFileAnalysis;
}

export interface RepoFileAnalysis {
  hasPackageJson: boolean;
  hasRequirementsTxt: boolean;
  hasCargoToml: boolean;
  hasGoMod: boolean;
  hasGemfile: boolean;
  hasComposerJson: boolean;
  hasPomXml: boolean;
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  configFiles: string[];
  mainLanguage: string | null;
}

export interface SessionInfo {
  id: string;
  repoOwner: string;
  repoName: string;
  repoFullName: string;
  status: SessionStatus;
  environment: EnvironmentConfig | null;
  previewUrl: string | null;
  createdAt: number;
  lastActivityAt: number;
  logs: LogEntry[];
  error: string | null;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export type SessionStatus =
  | 'initializing'
  | 'cloning'
  | 'analyzing'
  | 'installing'
  | 'building'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'error';

export interface AIAnalysisRequest {
  repoInfo: GitHubRepo;
  files: RepoFile[];
  configContents: Record<string, string>;
}

export interface AIAnalysisResponse {
  environmentType: EnvironmentType;
  confidence: number;
  reasoning: string;
  config: Partial<EnvironmentConfig>;
  potentialIssues: string[];
}

// GitHub API response types
export interface GitHubRepoResponse {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  default_branch: string;
  description: string | null;
  language: string | null;
  topics: string[];
  size: number;
  private: boolean;
  html_url: string;
  clone_url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubContentResponse {
  name: string;
  path: string;
  sha: string;
  size: number;
  encoding: string;
  content: string;
}
