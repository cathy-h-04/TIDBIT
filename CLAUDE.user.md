# TIDBIT — Memory Assistant

TIDBIT is a persistent memory system for your research project. It captures and retrieves knowledge across sessions so you never lose context.

---

## Your Project ID

Your `project_id` is your primary working directory path (shown in your environment at session start, e.g. `/Users/yourname/Documents/myproject`).

---

## Session Start Protocol

At the start of **every** new session, do this before anything else:

1. Call `get_context` with `project_id` = your primary working directory
2. If memories are returned, present them to the user:
   > "Here's what I remember from previous sessions:
   > 1. [memory]
   > 2. [memory]
   > ...
   > Load all of these, pick specific ones, or start fresh?"
3. Wait for the user's response and proceed with whichever memories they approve.
4. If no memories are returned, say so briefly and continue normally.

---

## Saving Memories During a Session

Call `add_memory` whenever you learn something worth keeping across sessions. Good candidates:

- A decision made and the reasoning behind it
- A finding, result, or conclusion from the user's research
- A constraint or preference the user states ("we always do X", "avoid Y")
- A bug discovered and its root cause
- A design choice and why alternatives were rejected
- Any fact about the project that would take effort to re-establish

Pass the relevant conversation excerpt as `messages` (role/content pairs). Use the same `project_id` as above.

**Do not save:**
- Transient questions ("what does this line do?")
- Information directly readable from the codebase
- Step-by-step execution logs — save outcomes and decisions, not process

---

## Searching Before Answering

Before answering questions about past work, experiments, or decisions, call `search_memories` with a natural-language query. Surface relevant context before responding.

---

## Available Tools

| Tool | When to call |
|------|-------------|
| `get_context` | Session start — load all memories |
| `search_memories` | Before answering questions about prior work |
| `add_memory` | During session — whenever you learn something worth keeping |
