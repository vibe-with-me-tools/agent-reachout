import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { Provider } from './providers/base.js';
import type { ProviderType } from './types.js';
import { TelegramProvider } from './providers/telegram.js';

import { sendMessageTool, handleSendMessage, type SendMessageInput } from './tools/send.js';
import { continueConversationTool, handleContinueConversation, type ContinueConversationInput } from './tools/continue.js';
import { notifyUserTool, handleNotifyUser, type NotifyUserInput } from './tools/notify.js';
import { endConversationTool, handleEndConversation, type EndConversationInput } from './tools/end.js';

// Provider registry
const providers = new Map<ProviderType, Provider>();

// Initialize providers from environment
function initializeProviders(): void {
  const telegramToken = process.env.AGENT_REACHOUT_TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.AGENT_REACHOUT_TELEGRAM_CHAT_ID;

  if (telegramToken && telegramChatId) {
    providers.set('telegram', new TelegramProvider(telegramToken, telegramChatId));
    console.error('Telegram provider initialized');
  } else {
    console.error('Telegram provider not configured: missing AGENT_REACHOUT_TELEGRAM_BOT_TOKEN or AGENT_REACHOUT_TELEGRAM_CHAT_ID');
  }

  // WhatsApp provider will be added here in Phase 2
}

function getProvider(type: ProviderType): Provider | undefined {
  return providers.get(type);
}

// Create MCP server
const server = new Server(
  {
    name: 'agent-reachout',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool listing handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      sendMessageTool,
      continueConversationTool,
      notifyUserTool,
      endConversationTool,
    ],
  };
});

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'send_message': {
        const result = await handleSendMessage(args as unknown as SendMessageInput, getProvider);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'continue_conversation': {
        const result = await handleContinueConversation(args as unknown as ContinueConversationInput, getProvider);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'notify_user': {
        const result = await handleNotifyUser(args as unknown as NotifyUserInput, getProvider);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'end_conversation': {
        const result = await handleEndConversation(args as unknown as EndConversationInput, getProvider);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Unknown tool: ${name}` }) }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      }],
      isError: true,
    };
  }
});

// Start the server
async function main(): Promise<void> {
  initializeProviders();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('agent-reachout MCP server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
