# Agent Reachout

A minimal Claude Code plugin that lets Claude message you on Telegram.

Start a task, walk away from your computer, and get notified on your phone when Claude finishes work, hits a blocker, or needs a decision. Reply directly from Telegram to keep things moving.

![Agent Reachout – Claude Code to Telegram flow](assets/agent-reachout-flow.png)

## Features

- **Mobile-first**: Get notifications and respond from your phone, smartwatch, or any Telegram client
- **Multi-turn conversations**: Have natural back-and-forth dialogue with Claude via Telegram
- **Smart hooks**: Automatically redirects CLI questions to Telegram and notifies you on task completion
- **Simple setup**: Just a Telegram bot - no paid services or complex infrastructure required

## Setup

### 1. Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/botfather)
2. Send `/newbot` and follow the prompts to create your bot
3. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Get Your Chat ID

1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It will reply with your user ID (a number like `123456789`)
3. Start a conversation with your new bot (search for it and send any message)

### 3. Set Environment Variables

Add these to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export TELEGRAM_BOT_TOKEN="your_bot_token_here"
export TELEGRAM_CHAT_ID="your_chat_id_here"
```

Then reload your shell or run `source ~/.zshrc`.

## Installation

Install via Claude Code:

```
/plugin marketplace add vibe-with-me-tools/agent-reachout
/plugin install agent-reachout@agent-reachout
```

Restart Claude Code to activate.

## Tools

| Tool | Description |
|------|-------------|
| `send_message` | Send a message and optionally wait for a response |
| `continue_conversation` | Send follow-up in an existing conversation |
| `notify_user` | Send one-way notification (no response expected) |
| `end_conversation` | Send final message and close conversation |

### send_message

Starts a new conversation. By default, waits for your reply.

```
message (required)     Message to send
wait_for_response      Wait for reply (default: true)
timeout_ms             How long to wait in ms (default: 300000 = 5 min)
provider               'telegram' or 'whatsapp' (default: 'telegram')
```

### continue_conversation

Continues an existing conversation. Always waits for response.

```
conversation_id (required)   ID from previous send_message
message (required)           Message to send
timeout_ms                   How long to wait in ms (default: 300000)
```

### notify_user

Fire-and-forget notification. Does not wait for response.

```
message (required)     Message to send
conversation_id        Optional: use existing conversation
provider               'telegram' or 'whatsapp' (default: 'telegram')
```

### end_conversation

Sends a final message and marks conversation as ended.

```
conversation_id (required)   ID of conversation to end
message (required)           Final message to send
```

## Hooks

The plugin includes two hooks that enhance Claude's behavior:

| Hook | What it does |
|------|--------------|
| **Stop** | When Claude stops, evaluates if you should be notified about completed work or blockers |
| **PreToolCall: AskUserQuestion** | Redirects questions to Telegram instead of the CLI, so you can respond from your phone |

## Example Usage

**Claude needs confirmation:**
```
Claude: I found 15 unused files. Let me ask if I should delete them.
→ Sends Telegram: "Found 15 unused files. Should I delete them? (yes/no)"
← You reply: "yes"
Claude: User confirmed. Deleting files...
```

**Multi-step conversation:**
```
→ "Which database should I use for this project?"
← "postgres"
→ "Got it. Should I set up with Docker or install locally?"
← "docker"
→ "Done! PostgreSQL is running in Docker on port 5432."
```

**Task completion notification:**
```
Claude: Build completed.
→ Sends Telegram: "Build finished! All 42 tests passed."
(You see notification on your phone)
```

## Configuration Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Yes | Your Telegram user ID |

## Project Structure

```
agent-reachout/
├── .claude-plugin/
│   └── plugin.json      # Plugin metadata, MCP config, hooks
├── .env.example         # Environment variable template
├── README.md
└── server/
    ├── package.json
    └── src/
        ├── index.ts     # MCP server entry point
        ├── types.ts     # TypeScript types
        ├── state.ts     # Conversation state
        ├── providers/
        │   ├── base.ts  # Provider interface
        │   └── telegram.ts
        └── tools/
            ├── send.ts
            ├── continue.ts
            ├── notify.ts
            └── end.ts
```

## Troubleshooting

**Tools not appearing?**
- Verify environment variables are set: `echo $TELEGRAM_BOT_TOKEN`
- Restart Claude Code after installation

**Not receiving messages?**
- Make sure you started a conversation with your bot first
- Verify your chat ID is correct
- Check that your bot token is valid

**Responses not being received?**
- Ensure you're replying in the correct chat with your bot
- Check the timeout hasn't expired (default: 5 minutes)

## Development

```bash
cd server
bun install
bun run dev      # Run with hot reload
bun run start    # Run normally
```

## Roadmap

- [ ] WhatsApp support via WhatsApp Business API
- [ ] Multiple chat ID support (notify different people)
- [ ] Message formatting (markdown, buttons)

## License

MIT
