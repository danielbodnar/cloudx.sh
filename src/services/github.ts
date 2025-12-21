/**
 * GitHub API Service
 * Handles repository fetching, file listing, and content retrieval
 */

import type {
  Env,
  GitHubRepo,
  RepoFile,
  GitHubRepoResponse,
  GitHubTreeResponse,
  GitHubContentResponse,
} from '../types';

export class GitHubService {
  private baseUrl: string;
  private token?: string;

  constructor(env: Env) {
    this.baseUrl = env.GITHUB_API_BASE || 'https://api.github.com';
    this.token = env.GITHUB_TOKEN;
  }

  private async fetch(path: string): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'cloudx-sh/1.0',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Repository not found: ${path}`);
      }
      if (response.status === 403) {
        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
        if (rateLimitRemaining === '0') {
          throw new Error('GitHub API rate limit exceeded. Please try again later.');
        }
        throw new Error('Access forbidden. Repository may be private.');
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepo> {
    const response = await this.fetch(`/repos/${owner}/${repo}`);
    const data = (await response.json()) as GitHubRepoResponse;

    return {
      owner: data.owner.login,
      name: data.name,
      fullName: data.full_name,
      defaultBranch: data.default_branch,
      description: data.description,
      language: data.language,
      topics: data.topics || [],
      size: data.size,
      private: data.private,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
    };
  }

  async getRepositoryFiles(
    owner: string,
    repo: string,
    branch?: string
  ): Promise<RepoFile[]> {
    // Get the repository info to find default branch if not specified
    const repoInfo = branch ? { defaultBranch: branch } : await this.getRepository(owner, repo);

    const response = await this.fetch(
      `/repos/${owner}/${repo}/git/trees/${repoInfo.defaultBranch}?recursive=1`
    );
    const data = (await response.json()) as GitHubTreeResponse;

    return data.tree
      .filter((item) => item.type === 'blob')
      .map((item) => ({
        path: item.path,
        name: item.path.split('/').pop() || item.path,
        type: 'file' as const,
        size: item.size || 0,
      }));
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    branch?: string
  ): Promise<string> {
    const ref = branch ? `?ref=${branch}` : '';
    const response = await this.fetch(`/repos/${owner}/${repo}/contents/${path}${ref}`);
    const data = (await response.json()) as GitHubContentResponse;

    if (data.encoding === 'base64') {
      return atob(data.content.replace(/\n/g, ''));
    }

    return data.content;
  }

  async getConfigFileContents(
    owner: string,
    repo: string,
    files: RepoFile[]
  ): Promise<Record<string, string>> {
    // List of important config files to fetch
    const configFileNames = [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'bun.lockb',
      'requirements.txt',
      'pyproject.toml',
      'setup.py',
      'Pipfile',
      'Cargo.toml',
      'go.mod',
      'go.sum',
      'Gemfile',
      'composer.json',
      'pom.xml',
      'build.gradle',
      'Dockerfile',
      'docker-compose.yml',
      'docker-compose.yaml',
      '.env.example',
      'wrangler.toml',
      'wrangler.jsonc',
      'vercel.json',
      'netlify.toml',
      'tsconfig.json',
      'vite.config.ts',
      'vite.config.js',
      'next.config.js',
      'next.config.mjs',
      'nuxt.config.ts',
      'astro.config.mjs',
      'remix.config.js',
      'svelte.config.js',
      '.nvmrc',
      '.node-version',
      '.python-version',
      '.ruby-version',
      '.tool-versions',
      'Procfile',
      'Makefile',
      'justfile',
    ];

    const contents: Record<string, string> = {};

    // Filter to only files that exist in the repo
    const configFiles = files.filter((f) =>
      configFileNames.some(
        (name) => f.path === name || f.path.endsWith(`/${name}`)
      )
    );

    // Fetch contents in parallel (limit to 10 concurrent requests)
    const batchSize = 10;
    for (let i = 0; i < configFiles.length; i += batchSize) {
      const batch = configFiles.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          try {
            const content = await this.getFileContent(owner, repo, file.path);
            return { path: file.path, content };
          } catch {
            return null;
          }
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          contents[result.value.path] = result.value.content;
        }
      }
    }

    return contents;
  }

  getCloneUrl(owner: string, repo: string, useHttps = true): string {
    if (useHttps) {
      return `https://github.com/${owner}/${repo}.git`;
    }
    return `git@github.com:${owner}/${repo}.git`;
  }
}
