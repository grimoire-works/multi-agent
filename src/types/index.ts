// ── 项目配置 ──

export interface ProjectConfig {
  name: string;
  codename: string;
  language: string;
  framework?: string;
  sourceDir: string;
  buildCommand?: string;
  testCommand?: string;
  installCommand?: string;
  agents: AgentRole[];
  projectPath: string;
  orchestration?: OrchestrationConfig;
}

// ── 编排可调参数（缺省时使用内置默认值）──

export interface OrchestrationConfig {
  maxCorrectionRounds?: number;
  /** Wave 并行模式：按文件冲突分组，Wave 内并行开发（默认 false 串行） */
  parallel?: boolean;
  agentModel?: string;
  agentMaxTurns?: number;
  agentTimeoutMs?: number;
  buildTimeoutMs?: number;
}

export type AgentRole = 'dev' | 'tester' | 'frontend' | 'pm' | 'designer';

// ── 任务与验收标准 ──

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'needs_human';

export interface AcceptanceCriterion {
  id: string;       // AC-1, AC-2, ...
  operation: string;
  expected: string;
}

export interface Task {
  id: number;
  title: string;
  status: TaskStatus;
  files: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  description?: string;
  attempts: number;
}

// ── 运行状态 ──

export interface RunState {
  currentTaskId: number;
  tasks: Task[];
  startedAt: string;
  updatedAt: string;
  totalInputTokens: number;
  totalOutputTokens: number;
}

// ── Agent 会话结果 ──

export interface AgentResult {
  success: boolean;
  output: string;
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

// ── 测试判定 ──

export type TestVerdict = 'PASS' | 'FAIL' | 'SKIP';

export interface TestResult {
  verdict: TestVerdict;
  reportPath: string;
  summary: string;
}
