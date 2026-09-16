# Part 11 + Part 12 — Version History + AI Coding Assistant

## Part 11 — Version History

### Why this phase matters

A collaborative editor is only truly useful when users can recover from bad edits, compare previous states, and understand how a file evolved over time.

Without version history, a single mistake can destroy valuable work. Version snapshots make the editor behave more like a real IDE and a serious product.

### Core architecture

We add a `file_versions` table to the database.

Important fields:

- `id` — snapshot record id
- `file_id` — which file this version belongs to
- `room_id` — which room owns the file
- `version_number` — ordered version counter for that file
- `filename` — file name at the time of snapshot
- `language` — language used
- `content` — saved code state
- `summary` — short note like "Saved main.py" or "Restored Version 2"
- `created_at` — timestamp

This makes each save effectively a durable checkpoint.

### Save flow

Save flow roughly looks like this:

User edits file
↓
Frontend sends PUT /api/files/:id
↓
Backend updates file content
↓
Backend inserts a new row in file_versions
↓
File is now versioned and recoverable

### Restore flow

Restore is also straightforward:

User selects a past version
↓
Frontend calls POST /api/files/:id/restore
↓
Backend loads the snapshot
↓
Backend updates the file contents
↓
Backend creates a new version entry for the restored state

This keeps the history continuous and auditable.

### Important project decisions

- Version numbers are per file, not global.
- Every restore creates a new version instead of mutating history.
- History is stored as immutable snapshots rather than only the latest value.
- The UI can show version labels like "Version 3" and a summary message.

### Why this is interview-worthy

Version history shows maturity, product thinking, and engineering discipline. It answers questions like:

- How do you protect user work from mistakes?
- How do you support rollback in collaborative tools?
- How do you structure state transitions in a database-backed editor?

### Part 11 interview questions

Q1. Why is version history important in a collaborative editor?

Because one user can accidentally overwrite a file, and the system should allow rollback and review.

Q2. What is stored in the version history table?

A file snapshot: version number, language, filename, content, summary, and timestamps.

Q3. Why use version numbers instead of just "latest"?

Because restore requires a deterministic point in time and a clear historical order.

Q4. Why is restore implemented as a new version?

So history remains traceable and users can see exactly what changed and when.

Q5. Why should version history be tied to a file rather than the whole room?

Because a room may contain many files, and each file should have independent revisions.

---

## Part 12 — AI Coding Assistant

### Why this phase matters

Once the real-time collaborative editor and execution system are mature, the next major step is making the editor genuinely useful as a development assistant.

The AI layer should help with:

- explaining code
- debugging failures
- generating code snippets
- refactoring or improving code
- suggesting safe fixes based on execution output

### AI backend architecture

The AI system is split into a dedicated backend service module.

Core elements:

- `aiService.js` — builds context and prepares the request
- `POST /api/ai` — protected endpoint for AI chat
- `OPENAI_API_KEY` or `AI_API_KEY` — required for live model access
- `AI_MODEL` — configurable model selection
- Request body — prompt, current file, selected code, language, project files
- Response body — success, mode, reply, context

### Project-aware context

This is the key idea that makes the assistant useful, not fake.

Instead of sending a prompt like:

"Explain this"

we send:

- current file name
- current language
- selected code
- relevant project files
- the user's actual request

Example context:

Current file: main.py
Language: python
Selected code:
print("hello")
User request: Explain this code
Relevant project files:

- main.py
- utils.py
- test.py

This makes the AI act like a coding assistant rather than a generic chatbot.

### Explain Code flow

A common workflow is:

User selects code
↓
Click "Explain"
↓
Frontend sends selected code + file context to AI
↓
AI returns explanation in plain English

This makes the editor feel much closer to a real IDE.

### AI debugging flow

This is one of the strongest features of the project.

Code
↓
Docker execution
↓
Error output
↓
AI analyzes error + file context
↓
Suggested fix or explanation

This is especially useful for runtime errors, syntax issues, and logic mistakes.

### AI code generation flow

Examples:

- "Create a Python function that checks if a number is prime"
- "Write a utility to parse JSON safely"
- "Generate a unit test for this function"

The AI generates code, the user reviews it, and then can insert or adapt it into Monaco.

### AI improvement actions

Useful actions include:

- Explain
- Fix
- Optimize
- Refactor
- Add comments
- Generate tests

This makes AI act like a coding co-pilot instead of only a chat box.

### Security and cost controls

A serious AI feature must be controlled.

Important safeguards:

- protected endpoint with authentication
- prompt size limits
- project file context size limits
- no API keys on the frontend
- fallback response if AI is unavailable
- error handling for API failures
- rate limiting and usage awareness later on

This matters because AI requests can become expensive and unreliable if left unchecked.

### Why AI is part of the roadmap at this stage

The collaborative editor is already mature. The real next step is turning it into an IDE assistant that understands:

- what file the user is editing
- what code is selected
- what language is active
- which files exist in the project
- what errors the execution engine produced

This is where the project transitions from collaboration software into an AI-enabled coding platform.

### Part 12 interview questions

Q1. Why do we need project-aware context for AI?

Because a generic prompt is not enough. The AI needs the current file, language, selected code, and project context to be useful.

Q2. What is the main difference between a chat bubble and an IDE assistant?

The assistant uses the code in the editor and the project structure, not just general conversation.

Q3. Why do we require authentication for the AI endpoint?

Because AI calls are paid and can expose user code or workspace context. Authentication prevents uncontrolled access.

Q4. Why do we keep a fallback response?

Because the AI service may be unavailable or an API key may not be configured. The app should still remain functional.

Q5. Why is AI debugging especially valuable in this project?

Because the project already has Docker execution and structured error output. AI can explain that output and suggest a fix quickly.

Q6. How is AI different from the execution engine?

Execution answers: "Did the code run and what happened?"
AI answers: "What does this code mean and how should this be fixed?"

### Final summary line

Part 11 gives the project version safety and rollback; Part 12 gives the project an actual coding assistant layer powered by context-aware prompts and safe API design.

---

## Important project-level summary

At this stage, the project has evolved from a basic editor into a serious collaborative IDE:

- real-time collaborative editing
- room ownership and secure access
- file management and multi-file workspace
- Yjs synchronization and live presence
- chat and collaboration signals
- Docker execution sandbox
- version snapshots and restore
- AI-backed coding assistance

This is the architecture a strong interview candidate can explain with confidence.
