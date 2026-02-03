import TelegramBot from 'node-telegram-bot-api';
import type { Provider } from './base.js';
import type { ProviderType, SendResult } from '../types.js';

export class TelegramProvider implements Provider {
  readonly name: ProviderType = 'telegram';
  private bot: TelegramBot;
  private chatId: string;
  private pendingResponse: {
    resolve: (msg: string) => void;
    reject: (err: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(token: string, chatId: string) {
    this.chatId = chatId;
    console.log("Telete token", token)
    this.bot = new TelegramBot(token, { polling: true });

    // Handle incoming messages
    this.bot.on('message', (msg) => {
      // Only process messages from our configured chat
      if (msg.chat.id.toString() !== this.chatId) {
        return;
      }

      // If we're waiting for a response, resolve it
      if (this.pendingResponse && msg.text) {
        clearTimeout(this.pendingResponse.timeoutId);
        this.pendingResponse.resolve(msg.text);
        this.pendingResponse = null;
      }
    });

    // Handle polling errors
    this.bot.on('polling_error', (error) => {
      console.error('Telegram polling error ss:', error.message);
    });
  }

  async send(text: string): Promise<SendResult> {
    const message = await this.bot.sendMessage(this.chatId, text);
    return {
      messageId: message.message_id.toString(),
      timestamp: message.date * 1000,
    };
  }

  async sendAndWait(text: string, timeoutMs: number): Promise<string> {
    // Clear any existing pending response
    if (this.pendingResponse) {
      clearTimeout(this.pendingResponse.timeoutId);
      this.pendingResponse.reject(new Error('Cancelled by new request'));
      this.pendingResponse = null;
    }

    // Send the message
    await this.send(text);

    // Wait for response with timeout
    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingResponse = null;
        reject(new Error(`Response timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingResponse = { resolve, reject, timeoutId };
    });
  }

  async sendNoWait(text: string): Promise<void> {
    await this.bot.sendMessage(this.chatId, text);
  }

  dispose(): void {
    if (this.pendingResponse) {
      clearTimeout(this.pendingResponse.timeoutId);
      this.pendingResponse.reject(new Error('Provider disposed'));
      this.pendingResponse = null;
    }
    this.bot.stopPolling();
  }
}
