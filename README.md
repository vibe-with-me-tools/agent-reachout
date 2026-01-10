# Agent Reachout

Let your AI agent message you on Telegram when it needs decisions or finishes work.

<p align="center">
  <img src="assets/agent-reachout-flow.png" alt="Agent Reachout – Claude Code to Telegram flow" width="800">
</p>

> Claude Code → Agent Reachout → Telegram → Human reply → Agent continues

---

## Why?

AI agents are great at doing work, but real workflows still need **human judgment**.

In practice, agents:
- hit ambiguous decisions
- need approval before destructive actions
- finish long tasks while you’re not watching the terminal

Dashboards assume you go check them.  
**Messaging flips the model** — the agent comes to you only when needed.

Agent Reachout turns agent workflows into something asynchronous and interrupt-driven, without babysitting the CLI.

---

## What it does

- Sends notifications to Telegram when an agent:
  - finishes a task
  - hits a blocker
  - needs a decision
- Supports one-way notifications or two-way conversations
- Lets the agent pause → ask → resume
- Designed for human-in-the-loop agent workflows

Currently implemented as a **Claude Code plugin**.

---

## Why Telegram first?

This started as a **personal workflow tool**, not a team platform.

Telegram was chosen because:
- it’s already on my phone
- fast setup and low friction
- feels like a push notification, not another dashboard
- works well for solo devs and small setups

The concept is **channel-agnostic** — Telegram is just the first integration.

---

## What it’s not

- Not a workflow engine
- Not a chatbot framework
- Not a full agent orchestration system

It’s a small bridge between agents and humans.

---

## Use cases

- Approving file changes or deletions
- Answering clarification questions mid-task
- Getting notified when long-running tasks complete
- Running agents asynchronously without monitoring logs

---

## Roadmap

- Slack integration
- WhatsApp / Discord support
- Model-agnostic agent support
- Better conversation state handling

Feedback will shape this.

---

## Feedback & Contributions

This is early and intentionally small.

If you:
- hit similar problems
- have strong opinions on human-in-the-loop agents
- want a specific notification channel

Issues, discussions, and PRs are very welcome.

---

## Repo

https://github.com/vibe-with-me-tools/agent-reachout
