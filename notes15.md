# Part 15 Notes - Advanced AI and Intelligent Development Platform

## Status

Part 15 now has a real project-understanding foundation. The larger autonomous-agent, test-fix loop, Git integration, dashboard, and public end-to-end workflow remain staged work and are not presented as complete.

## Implemented

### Project understanding and search

`backend/src/projectAnalyzer.js` indexes room files without reading the host filesystem. It detects common languages, records bytes and line counts, extracts Python and JavaScript/TypeScript symbols, extracts imports, ignores common secret/lock files, and ranks relevant files against a natural-language question.

### Project-aware Q&A

`POST /api/ai/project` is protected by authentication, AI limits, and room-owner authorization. It searches the supplied room project, sends only the best matching files to the existing AI service, and returns the answer plus ranked matches and indexed metadata. The frontend exposes this through the `Ask project` action.

### Approval-gated change proposals

`POST /api/ai/proposal` returns a structured change proposal with filename, language, operation, old text, new text, explanation, and `requiresApproval: true`. The endpoint never writes a file. A later UI step should render a Monaco diff and call the existing save path only after explicit approval.

### Usage tracking

Migration `003_ai_usage.sql` adds `ai_usage_events` for user, room, feature, model, prompt/response sizes, latency, success, and timestamp. Assistant, project Q&A, and proposal requests record telemetry without exposing model credentials.

## Safety boundaries

- Project files are supplied from an authorized room and are capped before analysis.
- Secret-like `.env` files and lockfiles are excluded from the index.
- AI output is treated as an untrusted proposal.
- No AI endpoint silently edits files or executes generated code.
- Existing authentication, room authorization, rate limits, context limits, and Docker execution boundary remain in force.
- AI answers are suggestions, not guaranteed security findings or correctness proofs.

## Remaining implementation order

1. Add a frontend diff viewer with Accept and Reject actions.
2. Add multi-file proposal validation and atomic approval transactions.
3. Connect generated tests to the bounded Docker queue with a maximum of three fix iterations.
4. Add security and performance scanners that return review findings, not claims.
5. Add Git status/commit-message generation without granting the model arbitrary Git execution.
6. Add project documentation generation with preview and approval.
7. Add an AI workspace dashboard backed by usage and task tables.
8. Add authenticated multi-user browser tests and execution/AI cost dashboards.

## Interview summary

The key design decision is separating analysis from mutation. The analyzer finds relevant context, the model proposes a structured change, the user reviews a diff, and only an explicit approval can persist it. This prevents an AI response from becoming an unreviewed write or execution primitive.
