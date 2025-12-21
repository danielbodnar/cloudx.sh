/**
 * AI Analyzer Service
 * Uses Workers AI to analyze repositories and determine environment configuration
 */

import type {
  Env,
  AIAnalysisRequest,
  AIAnalysisResponse,
  EnvironmentConfig,
  EnvironmentType,
  RepoFileAnalysis,
} from '../types';

export class AIAnalyzer {
  private ai: Ai;

  constructor(env: Env) {
    this.ai = env.AI;
  }

  async analyzeRepository(request: AIAnalysisRequest): Promise<{
    environment: EnvironmentConfig;
    confidence: number;
    reasoning: string;
    fileAnalysis: RepoFileAnalysis;
  }> {
    // First, do static analysis
    const fileAnalysis = this.analyzeFiles(request.files, request.configContents);

    // Build context for AI
    const context = this.buildAnalysisContext(request, fileAnalysis);

    // Get AI analysis
    const aiResponse = await this.getAIAnalysis(context);

    // Merge static and AI analysis
    const environment = this.buildEnvironmentConfig(
      fileAnalysis,
      aiResponse,
      request.configContents
    );

    return {
      environment,
      confidence: aiResponse.confidence,
      reasoning: aiResponse.reasoning,
      fileAnalysis,
    };
  }

  private analyzeFiles(
    files: { path: string; name: string }[],
    configContents: Record<string, string>
  ): RepoFileAnalysis {
    const filePaths = files.map((f) => f.path);

    return {
      hasPackageJson: filePaths.some((p) => p === 'package.json' || p.endsWith('/package.json')),
      hasRequirementsTxt: filePaths.some(
        (p) => p === 'requirements.txt' || p.endsWith('/requirements.txt')
      ),
      hasCargoToml: filePaths.some((p) => p === 'Cargo.toml' || p.endsWith('/Cargo.toml')),
      hasGoMod: filePaths.some((p) => p === 'go.mod' || p.endsWith('/go.mod')),
      hasGemfile: filePaths.some((p) => p === 'Gemfile' || p.endsWith('/Gemfile')),
      hasComposerJson: filePaths.some(
        (p) => p === 'composer.json' || p.endsWith('/composer.json')
      ),
      hasPomXml: filePaths.some((p) => p === 'pom.xml' || p.endsWith('/pom.xml')),
      hasDockerfile: filePaths.some((p) => p === 'Dockerfile' || p.includes('Dockerfile')),
      hasDockerCompose: filePaths.some(
        (p) => p.includes('docker-compose.yml') || p.includes('docker-compose.yaml')
      ),
      configFiles: Object.keys(configContents),
      mainLanguage: this.detectMainLanguage(files, configContents),
    };
  }

  private detectMainLanguage(
    files: { path: string }[],
    configContents: Record<string, string>
  ): string | null {
    // Check config files first
    if (configContents['package.json']) return 'JavaScript';
    if (configContents['Cargo.toml']) return 'Rust';
    if (configContents['go.mod']) return 'Go';
    if (configContents['requirements.txt'] || configContents['pyproject.toml']) return 'Python';
    if (configContents['Gemfile']) return 'Ruby';
    if (configContents['composer.json']) return 'PHP';

    // Count file extensions
    const extCounts: Record<string, number> = {};
    for (const file of files) {
      const ext = file.path.split('.').pop()?.toLowerCase();
      if (ext) {
        extCounts[ext] = (extCounts[ext] || 0) + 1;
      }
    }

    // Map extensions to languages
    const extToLang: Record<string, string> = {
      ts: 'TypeScript',
      tsx: 'TypeScript',
      js: 'JavaScript',
      jsx: 'JavaScript',
      py: 'Python',
      rs: 'Rust',
      go: 'Go',
      rb: 'Ruby',
      php: 'PHP',
      java: 'Java',
    };

    let maxCount = 0;
    let mainLang: string | null = null;

    for (const [ext, count] of Object.entries(extCounts)) {
      if (extToLang[ext] && count > maxCount) {
        maxCount = count;
        mainLang = extToLang[ext];
      }
    }

    return mainLang;
  }

  private buildAnalysisContext(
    request: AIAnalysisRequest,
    fileAnalysis: RepoFileAnalysis
  ): string {
    const parts: string[] = [
      `Repository: ${request.repoInfo.fullName}`,
      `Description: ${request.repoInfo.description || 'No description'}`,
      `Primary Language: ${request.repoInfo.language || fileAnalysis.mainLanguage || 'Unknown'}`,
      `Topics: ${request.repoInfo.topics.join(', ') || 'None'}`,
      '',
      'Detected configuration files:',
    ];

    for (const [path, content] of Object.entries(request.configContents)) {
      // Truncate large files
      const truncatedContent =
        content.length > 2000 ? content.slice(0, 2000) + '\n... (truncated)' : content;
      parts.push(`\n--- ${path} ---\n${truncatedContent}`);
    }

    parts.push(
      '',
      'File structure summary:',
      `- Total files: ${request.files.length}`,
      `- Has package.json: ${fileAnalysis.hasPackageJson}`,
      `- Has requirements.txt: ${fileAnalysis.hasRequirementsTxt}`,
      `- Has Cargo.toml: ${fileAnalysis.hasCargoToml}`,
      `- Has go.mod: ${fileAnalysis.hasGoMod}`,
      `- Has Dockerfile: ${fileAnalysis.hasDockerfile}`
    );

    return parts.join('\n');
  }

  private async getAIAnalysis(context: string): Promise<AIAnalysisResponse> {
    const prompt = `You are an expert developer analyzing a GitHub repository to determine the best development environment configuration.

Based on the following repository information, determine:
1. The primary environment type (nodejs, python, rust, go, ruby, php, java, static, docker)
2. The specific commands needed to install dependencies, build, and start the project
3. The port the application likely runs on
4. Any potential issues or special considerations

Repository Information:
${context}

Respond in JSON format with this structure:
{
  "environmentType": "nodejs|python|rust|go|ruby|php|java|static|docker",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of your analysis",
  "config": {
    "installCommand": "command to install dependencies",
    "buildCommand": "command to build (if needed)",
    "startCommand": "command to start the application",
    "port": 3000,
    "envVars": {}
  },
  "potentialIssues": ["list of potential issues"]
}`;

    try {
      // Using Llama 3.1 70B model for analysis
      // @ts-expect-error - Workers AI type definitions may be outdated
      const response = await this.ai.run('@cf/meta/llama-3.1-70b-instruct', {
        messages: [
          {
            role: 'system',
            content:
              'You are an expert developer. Analyze repositories and provide environment configuration. Always respond with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1024,
      });

      // Parse the AI response
      const text = typeof response === 'string'
        ? response
        : (response as { response?: string }).response || '';

      // Extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as AIAnalysisResponse;
      }

      // Fallback if AI doesn't return valid JSON
      return this.getDefaultAnalysis();
    } catch (error) {
      console.error('AI analysis failed:', error);
      return this.getDefaultAnalysis();
    }
  }

  private getDefaultAnalysis(): AIAnalysisResponse {
    return {
      environmentType: 'unknown',
      confidence: 0.3,
      reasoning: 'Could not determine environment type from available information',
      config: {
        startCommand: 'echo "Please configure start command manually"',
        port: 3000,
      },
      potentialIssues: ['Unable to automatically detect environment configuration'],
    };
  }

  private buildEnvironmentConfig(
    fileAnalysis: RepoFileAnalysis,
    aiResponse: AIAnalysisResponse,
    configContents: Record<string, string>
  ): EnvironmentConfig {
    // Start with AI suggestions
    let type: EnvironmentType = aiResponse.environmentType as EnvironmentType;
    let installCommand = aiResponse.config.installCommand;
    let buildCommand = aiResponse.config.buildCommand;
    let startCommand = aiResponse.config.startCommand || 'echo "No start command"';
    let port = aiResponse.config.port || 3000;

    // Override with static analysis if more confident
    if (fileAnalysis.hasPackageJson && configContents['package.json']) {
      type = 'nodejs';
      const pkg = JSON.parse(configContents['package.json']);

      // Detect package manager
      if (configContents['bun.lockb']) {
        installCommand = 'bun install';
      } else if (configContents['pnpm-lock.yaml']) {
        installCommand = 'pnpm install';
      } else if (configContents['yarn.lock']) {
        installCommand = 'yarn install';
      } else {
        installCommand = 'npm install';
      }

      // Detect start script
      if (pkg.scripts) {
        if (pkg.scripts.dev) {
          startCommand = installCommand?.replace('install', 'run dev') || 'npm run dev';
        } else if (pkg.scripts.start) {
          startCommand = installCommand?.replace('install', 'start') || 'npm start';
        }

        if (pkg.scripts.build) {
          buildCommand = installCommand?.replace('install', 'run build') || 'npm run build';
        }
      }

      // Detect framework-specific ports
      if (pkg.dependencies) {
        if (pkg.dependencies.next) port = 3000;
        else if (pkg.dependencies.nuxt) port = 3000;
        else if (pkg.dependencies.vite) port = 5173;
        else if (pkg.dependencies['@angular/core']) port = 4200;
        else if (pkg.dependencies.vue) port = 5173;
        else if (pkg.dependencies.react) port = 3000;
        else if (pkg.dependencies.express) port = 3000;
        else if (pkg.dependencies.fastify) port = 3000;
        else if (pkg.dependencies.hono) port = 3000;
      }
    } else if (fileAnalysis.hasRequirementsTxt || configContents['pyproject.toml']) {
      type = 'python';
      installCommand = 'pip install -r requirements.txt';

      // Check for common Python frameworks
      const requirements = configContents['requirements.txt'] || '';
      if (requirements.includes('flask')) {
        startCommand = 'flask run --host=0.0.0.0';
        port = 5000;
      } else if (requirements.includes('fastapi')) {
        startCommand = 'uvicorn main:app --host 0.0.0.0 --port 8000';
        port = 8000;
      } else if (requirements.includes('django')) {
        startCommand = 'python manage.py runserver 0.0.0.0:8000';
        port = 8000;
      }
    } else if (fileAnalysis.hasCargoToml) {
      type = 'rust';
      installCommand = undefined;
      buildCommand = 'cargo build --release';
      startCommand = 'cargo run';
      port = 8080;
    } else if (fileAnalysis.hasGoMod) {
      type = 'go';
      installCommand = 'go mod download';
      buildCommand = 'go build -o app';
      startCommand = './app';
      port = 8080;
    } else if (fileAnalysis.hasGemfile) {
      type = 'ruby';
      installCommand = 'bundle install';
      startCommand = 'bundle exec ruby app.rb';
      port = 4567;
    } else if (fileAnalysis.hasComposerJson) {
      type = 'php';
      installCommand = 'composer install';
      startCommand = 'php -S 0.0.0.0:8000';
      port = 8000;
    }

    return {
      type,
      name: this.getEnvironmentName(type),
      port,
      installCommand,
      buildCommand,
      startCommand,
      envVars: aiResponse.config.envVars || {},
      previewable: ['nodejs', 'python', 'ruby', 'php', 'go', 'rust'].includes(type),
    };
  }

  private getEnvironmentName(type: EnvironmentType): string {
    const names: Record<EnvironmentType, string> = {
      nodejs: 'Node.js',
      python: 'Python',
      rust: 'Rust',
      go: 'Go',
      ruby: 'Ruby',
      php: 'PHP',
      java: 'Java',
      static: 'Static Site',
      docker: 'Docker',
      unknown: 'Unknown',
    };
    return names[type] || 'Unknown';
  }
}
