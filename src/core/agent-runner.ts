import {
  createAgentSession,
  AuthStorage,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import type { Model } from '@mariozechner/pi-ai';
import type { AgentResult } from '../types/index.js';
import fs from 'fs';
import path from 'path';

export interface AgentSessionOptions {
  cwd: string;
  systemPrompt: string;
  maxTurns?: number;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * 简化版 PI Coding Agent 会话封装
 *
 * - 每次 run 创建新 session（不跨任务复用）
 * - 内置工具：Read, Write, Edit, Bash, Glob, Grep
 * - 自动加载项目 CLAUDE.md
 */
export class AgentRunner {
  private options: AgentSessionOptions;

  constructor(options: AgentSessionOptions) {
    this.options = {
      ...options,
      maxTurns: options.maxTurns ?? 40,
      apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY,
      model: options.model ?? 'claude-sonnet-4-5-20250514',
      timeoutMs: options.timeoutMs ?? 10 * 60 * 1000,
    };
  }

  async run(prompt: string): Promise<AgentResult> {
    const cwd = this.options.cwd;
    const agentDir = `${process.env.HOME}/.pi/agent`;

    // 加载项目上下文
    const contextContent = this.loadProjectContext(cwd);
    const fullSystemPrompt = contextContent
      ? `${contextContent}\n\n---\n\n${this.options.systemPrompt}`
      : this.options.systemPrompt;

    // 创建资源加载器
    const settingsManager = SettingsManager.create(cwd, agentDir);
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      systemPrompt: fullSystemPrompt,
      noContextFiles: true,
    });
    await resourceLoader.reload();

    // 构建 AuthStorage
    const authStorage = AuthStorage.inMemory();
    if (this.options.apiKey) {
      authStorage.set('anthropic', { type: 'api_key', key: this.options.apiKey });
      authStorage.setRuntimeApiKey('anthropic', this.options.apiKey);
    }

    // 构建 Model
    const model = {
      id: this.options.model!,
      provider: 'anthropic',
    } as Model<any>;

    // 创建 session
    const tools = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'];
    const result = await createAgentSession({
      cwd,
      model,
      tools,
      customTools: [],
      authStorage,
      sessionManager: SessionManager.create(cwd),
      settingsManager,
      resourceLoader,
      thinkingLevel: 'high',
      agentDir,
    });

    const session = result.session;
    session.setAutoCompactionEnabled(true);
    session.setAutoRetryEnabled(true);

    // 订阅事件追踪
    let startMessageCount = session.agent.state.messages.length;
    let resolveRun: ((value: AgentResult) => void) | null = null;
    let lastOutput = '';

    session.subscribe((event: AgentSessionEvent) => {
      // Agent 完成
      if (event.type === 'agent_end') {
        const allMessages = session.agent.state.messages;
        const newMessages = allMessages.slice(startMessageCount);

        // 计算 token
        let inputTokens = 0;
        let outputTokens = 0;
        for (const msg of newMessages) {
          if (msg.role === 'assistant' && 'usage' in msg) {
            const usage = (msg as any).usage;
            if (usage) {
              inputTokens += usage.input_tokens ?? 0;
              outputTokens += usage.output_tokens ?? 0;
            }
          }
        }

        // 获取最后的文本输出
        const lastAssistant = [...allMessages].reverse().find(
          (m) => m.role === 'assistant' || (m as any).role === 'assistant',
        ) as any;

        if (lastAssistant?.content) {
          const textBlocks = lastAssistant.content.filter(
            (b: any) => b.type === 'text',
          );
          if (textBlocks.length > 0) {
            lastOutput = textBlocks.map((b: any) => b.text).join('\n');
          }
        }

        const stopReason: string = lastAssistant?.stopReason ?? 'unknown';
        const success = stopReason === 'stop' || stopReason === 'toolUse';

        if (resolveRun) {
          resolveRun({
            success,
            output: lastOutput,
            inputTokens,
            outputTokens,
            error: success ? undefined : `Agent stopped: ${stopReason}`,
          });
          resolveRun = null;
        }
      }
    });

    // 执行 prompt（带超时保护，结束后释放会话）
    return new Promise<AgentResult>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (result: AgentResult) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolveRun = null;
        try {
          session.dispose();
        } catch {
          // 清理失败不影响结果返回
        }
        resolve(result);
      };

      resolveRun = finish;

      timer = setTimeout(() => {
        void session.abort().catch(() => {});
        finish({
          success: false,
          output: lastOutput,
          inputTokens: 0,
          outputTokens: 0,
          error: `Agent 执行超时（${this.options.timeoutMs}ms），已中止`,
        });
      }, this.options.timeoutMs);

      session.prompt(prompt).catch((err: Error) => {
        finish({
          success: false,
          output: '',
          inputTokens: 0,
          outputTokens: 0,
          error: err.message,
        });
      });
    });
  }

  private loadProjectContext(cwd: string): string {
    const files = ['CLAUDE.md', 'AGENTS.md'];
    const contents: string[] = [];
    for (const f of files) {
      const p = path.join(cwd, f);
      try {
        const content = fs.readFileSync(p, 'utf-8');
        if (content.trim()) {
          contents.push(`<!-- 项目上下文: ${f} -->\n\n${content}`);
        }
      } catch {
        // 文件不存在，跳过
      }
    }
    return contents.join('\n\n');
  }
}
