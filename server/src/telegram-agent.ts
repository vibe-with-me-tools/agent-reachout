import TelegramBot from 'node-telegram-bot-api';

interface TaskJob {
  id: string;
  prompt: string;
  mode: 'task' | 'continue' | 'resume';
  sessionId?: string;
  createdAt: number;
}

interface TaskHistoryEntry {
  id: string;
  prompt: string;
  mode: TaskJob['mode'];
  sessionId?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: number;
  endedAt?: number;
  resultPreview?: string;
  error?: string;
}

const token = process.env.AGENT_REACHOUT_TELEGRAM_BOT_TOKEN;
const chatId = process.env.AGENT_REACHOUT_TELEGRAM_CHAT_ID;
const taskPrefix = process.env.AGENT_REACHOUT_TELEGRAM_TASK_PREFIX ?? '/task';
const claudeCommand = process.env.AGENT_REACHOUT_CLAUDE_COMMAND ?? 'claude';
let allowedTools = process.env.AGENT_REACHOUT_ALLOWED_TOOLS ?? '';
const historyLimit = Number.parseInt(process.env.AGENT_REACHOUT_HISTORY_LIMIT ?? '25', 10) || 25;

if (!token || !chatId) {
  console.error('Missing AGENT_REACHOUT_TELEGRAM_BOT_TOKEN or AGENT_REACHOUT_TELEGRAM_CHAT_ID');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const queue: TaskJob[] = [];
const history: TaskHistoryEntry[] = [];
let currentJob: TaskJob | null = null;
let currentProcess: ReturnType<typeof Bun.spawn> | null = null;
let lastSessionId: string | null = null;

function now(): number {
  return Date.now();
}

function trimForTelegram(message: string): string {
  const limit = 3500;
  if (message.length <= limit) {
    return message;
  }

  return `${message.slice(0, limit)}\n\n[truncated]`;
}

function send(text: string): Promise<void> {
  return bot.sendMessage(chatId, trimForTelegram(text)).then(() => undefined);
}

function isFromConfiguredChat(msg: TelegramBot.Message): boolean {
  return msg.chat.id.toString() === chatId;
}

function isCommand(text: string, command: string): boolean {
  if (text === command) {
    return true;
  }

  return text.startsWith(`${command} `) || text.startsWith(`${command}:`);
}

function parseCommand(text: string): { command: string; rest: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/^(\S+)(?:\s+|:)?(.*)$/s);
  if (!match) {
    return { command: trimmed, rest: '' };
  }

  return { command: match[1], rest: (match[2] ?? '').trim() };
}

function createJob(prompt: string, mode: TaskJob['mode'], sessionId?: string): TaskJob {
  return {
    id: `job_${now()}_${Math.random().toString(36).slice(2, 8)}`,
    prompt,
    mode,
    sessionId,
    createdAt: now(),
  };
}

function addHistory(entry: TaskHistoryEntry): void {
  history.unshift(entry);
  if (history.length > historyLimit) {
    history.splice(historyLimit);
  }
}

function updateHistory(id: string, updates: Partial<TaskHistoryEntry>): void {
  const entry = history.find((item) => item.id === id);
  if (entry) {
    Object.assign(entry, updates);
  }
}

async function runClaude(job: TaskJob): Promise<{ result: string; sessionId?: string } > {
  const args = [claudeCommand, '-p', job.prompt, '--output-format', 'json'];

  if (job.mode === 'continue') {
    if (lastSessionId) {
      args.push('--resume', lastSessionId);
    } else {
      args.push('--continue');
    }
  }

  if (job.mode === 'resume' && job.sessionId) {
    args.push('--resume', job.sessionId);
  }

  if (allowedTools.trim()) {
    args.push('--allowedTools', allowedTools.trim());
  }

  currentProcess = Bun.spawn(args, {
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });

  const stdoutText = await new Response(currentProcess.stdout).text();
  const stderrText = await new Response(currentProcess.stderr).text();
  const exitCode = await currentProcess.exited;
  currentProcess = null;

  if (exitCode !== 0) {
    const stderrSummary = stderrText.trim() || 'Unknown error';
    throw new Error(`Claude CLI failed: ${stderrSummary}`);
  }

  try {
    const parsed = JSON.parse(stdoutText);
    const sessionId = typeof parsed.session_id === 'string' ? parsed.session_id : undefined;
    if (typeof parsed.result === 'string' && parsed.result.trim()) {
      return { result: parsed.result.trim(), sessionId };
    }
    if (parsed.structured_output !== undefined) {
      if (typeof parsed.structured_output === 'string') {
        return { result: parsed.structured_output.trim(), sessionId };
      }
      return { result: JSON.stringify(parsed.structured_output, null, 2), sessionId };
    }
    return { result: stdoutText.trim(), sessionId };
  } catch {
    return { result: stdoutText.trim() };
  }
}

async function processNext(): Promise<void> {
  if (currentJob || queue.length === 0) {
    return;
  }

  const job = queue.shift();
  if (!job) {
    return;
  }

  currentJob = job;
  updateHistory(job.id, { status: 'running', startedAt: now() });

  try {
    await send(`Starting ${job.mode} job:\n${job.prompt}`);
    const { result, sessionId } = await runClaude(job);
    if (sessionId) {
      lastSessionId = sessionId;
    }

    updateHistory(job.id, {
      status: 'completed',
      endedAt: now(),
      resultPreview: result.slice(0, 500),
      sessionId: sessionId ?? job.sessionId,
    });
    await send(`Job complete:\n${result || 'No output returned.'}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    updateHistory(job.id, {
      status: 'failed',
      endedAt: now(),
      error: message,
    });
    await send(`Job failed:\n${message}`);
  } finally {
    currentJob = null;
    await processNext();
  }
}

async function enqueueJob(job: TaskJob): Promise<void> {
  queue.push(job);
  addHistory({
    id: job.id,
    prompt: job.prompt,
    mode: job.mode,
    sessionId: job.sessionId,
    status: 'queued',
  });

  const position = queue.length;
  await send(`Queued job (${position}):\n${job.prompt}`);
  await processNext();
}

async function handleTask(rest: string): Promise<void> {
  if (!rest) {
    await send(`Usage: ${taskPrefix} <task description>`);
    return;
  }

  await enqueueJob(createJob(rest, 'task'));
}

async function handleContinue(rest: string): Promise<void> {
  if (!rest) {
    await send('Usage: /continue <task description>');
    return;
  }

  await enqueueJob(createJob(rest, 'continue'));
}

async function handleResume(rest: string): Promise<void> {
  const parts = rest.split(/\s+/);
  const sessionId = parts.shift();
  const prompt = parts.join(' ').trim();

  if (!sessionId || !prompt) {
    await send('Usage: /resume <session_id> <task description>');
    return;
  }

  await enqueueJob(createJob(prompt, 'resume', sessionId));
}

async function handleHistory(rest: string): Promise<void> {
  const count = Math.min(Number.parseInt(rest || '5', 10) || 5, historyLimit);
  if (history.length === 0) {
    await send('No task history yet.');
    return;
  }

  const lines = history.slice(0, count).map((entry, index) => {
    const status = entry.status;
    const label = entry.mode === 'task' ? 'task' : entry.mode;
    const preview = entry.prompt.length > 80 ? `${entry.prompt.slice(0, 80)}...` : entry.prompt;
    return `${index + 1}. [${status}] ${label}: ${preview}`;
  });

  await send(`Recent jobs:\n${lines.join('\n')}`);
}

async function handleStatus(): Promise<void> {
  const running = currentJob ? `Running: ${currentJob.prompt}` : 'Idle';
  const queued = queue.length ? `Queued: ${queue.length}` : 'No queued jobs';
  const sessionInfo = lastSessionId ? `Last session: ${lastSessionId}` : 'No session yet';
  const toolsInfo = allowedTools.trim() ? `Allowed tools: ${allowedTools.trim()}` : 'Allowed tools: (none)';
  await send(`${running}\n${queued}\n${sessionInfo}\n${toolsInfo}`);
}

async function handleCancel(): Promise<void> {
  if (currentProcess && currentJob) {
    currentProcess.kill();
    updateHistory(currentJob.id, {
      status: 'cancelled',
      endedAt: now(),
      error: 'Cancelled by user',
    });
    currentProcess = null;
    currentJob = null;
  }

  if (queue.length > 0) {
    queue.splice(0, queue.length);
  }

  await send('Cancelled current job and cleared the queue.');
}

async function handleHelp(): Promise<void> {
  await send(
    [
      'Commands:',
      `${taskPrefix} <task description>`,
      '/continue <task description>',
      '/resume <session_id> <task description>',
      '/history [count]',
      '/status',
      '/allowed_tools <list>',
      '/cancel',
      '/help',
    ].join('\n')
  );
}

async function handleAllowedTools(rest: string): Promise<void> {
  if (!rest) {
    allowedTools = '';
    await send('Cleared allowed tools. Future tasks will require approvals.');
    return;
  }

  allowedTools = rest.trim();
  await send(`Allowed tools updated:\n${allowedTools}`);
}

bot.on('message', async (msg) => {
  if (!isFromConfiguredChat(msg)) {
    return;
  }

  if (msg.from?.is_bot || !msg.text) {
    return;
  }

  const { command, rest } = parseCommand(msg.text);

  if (isCommand(command, taskPrefix)) {
    await handleTask(rest);
    return;
  }

  switch (command) {
    case '/continue':
      await handleContinue(rest);
      return;
    case '/resume':
      await handleResume(rest);
      return;
    case '/history':
      await handleHistory(rest);
      return;
    case '/status':
      await handleStatus();
      return;
    case '/cancel':
      await handleCancel();
      return;
    case '/allowed_tools':
      await handleAllowedTools(rest);
      return;
    case '/help':
      await handleHelp();
      return;
    default:
      return;
  }
});

bot.on('polling_error', (error) => {
  console.error('Telegram polling error:', error.message);
});

console.error(`Telegram task runner started. Send "${taskPrefix} ..." to begin.`);
