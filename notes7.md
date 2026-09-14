Level 1 — Basic Questions

1. What is Part 7 about?

Answer:

Part 7 is about moving from a single collaborative file to a proper project workspace. Instead of only one shared document, the room contains multiple files and the user can create, open, rename, delete, and switch between them.

2. Why do we need a file explorer?

Answer:

A collaborative editor is much more useful when users can work on different files in the same project. A file explorer gives structure to the codebase and makes the workspace feel like a real project, not just one textarea.

3. What is a project workspace in our app?

Answer:

A room is treated like a workspace, and each file inside that room is a separate collaborative document. The user can open one file at a time, while the room itself still acts as the project container.

4. What does “open a file” mean here?

Answer:

Opening a file means loading that file’s content into Monaco and switching the active editor state to match that file. Only one file is active at a time, but multiple files are stored in the room.

5. What is the difference between a room and a file?

Answer:

The room is the project container. The file is the actual source document inside that project. Multiple files can exist in one room, but each file has its own file-level content and collaboration state.

🟡 Level 2 — Core Interview Questions 6. Why do we need multiple files instead of one shared file?

Answer:

Real projects are structured into many files such as main.py, utils.py, test.py, config.py, and README.md. A single file is not enough for real development workflows, especially when multiple developers are collaborating.

7. How is file management implemented in our project?

Answer:

The frontend loads files from the room by calling the backend file API. Each file is stored in the PostgreSQL files table and linked to a room through room_id. The frontend displays them in a sidebar and opens whichever file the user selects.

8. What is the role of PostgreSQL in this phase?

Answer:

PostgreSQL stores the persistent file metadata and content. It acts as the durable source of truth for the project files. The frontend reads from it when loading the room and writes to it when a user creates or saves a file.

9. Why do we still use Yjs even when files are stored in PostgreSQL?

Answer:

Yjs handles live collaborative editing. PostgreSQL is for persistence, not for instant multi-user sync. Yjs ensures real-time document updates between users, while PostgreSQL ensures the latest saved state survives refreshes and restarts.

10. What is dynamic Yjs per file?

Answer:

Instead of one shared Yjs document for the whole room, each file can have its own Yjs document and WebSocket room. Conceptually this becomes something like:

room-1-file-main
room-1-file-test
room-1-file-utils

This prevents different files from mixing content and allows each file to be edited independently.

11. Why is dynamic Yjs per file better than one shared doc for the room?

Answer:

If all files share one document, then one file’s content could accidentally overwrite or mix with another file’s content. By using a separate collaborative room per file, each file has isolated live state.

12. How does our file switching work?

Answer:

The sidebar lists all room files. When a user clicks a file, the current active file state changes. The editor loads that file’s content, updates the active language, and connects the collaborative Yjs provider for that file-specific room.

13. What is the difference between file-level persistence and live collaboration?

Answer:

Persistence is saving data to the database so it remains after refresh.
Live collaboration is syncing edits immediately between users in the active file.

Both are necessary, but they solve different problems.

14. How do we create a new file?

Answer:

The user clicks “+ New File,” then we send a POST request to the backend file API with the roomId, filename, language, and initial content. The backend stores it in the database and returns the created file object.

15. How do we rename a file?

Answer:

The user selects a file, chooses rename, and submits the new filename. We send a PUT request to the file API with the updated filename while preserving the existing content.

16. How do we delete a file safely?

Answer:

We confirm the action in the UI and send a DELETE request to the file API. The backend deletes the row only if it belongs to the owner’s room, preventing unauthorized file deletion.

17. Why is room owner validation important for file operations?

Answer:

A file is part of a room, so only the room owner should be allowed to create, rename, or delete files in the current security model. This avoids unauthorized project modifications.

⚠️ Design / Architecture Questions 18. What is the architecture of file collaboration in this phase?

Answer:

Frontend file explorer → file API → PostgreSQL for persistence
Frontend editor → Yjs provider → file-specific Yjs room for real-time sync

This separation gives us a clean architecture: persistent storage and live collaboration are handled separately.

19. Are we doing full multi-file CRDT synchronization yet?

Answer:

Not fully in the advanced sense, but we are moving toward the correct model. Each file is being treated as a separate collaborative unit, and the provider is now file-scoped by room + file id. This is the correct architecture for the next step.

20. What is the main challenge in Part 7?

Answer:

The main challenge is keeping file metadata and file content organized while also maintaining isolated live collaborative state for each file. This is where project structure starts becoming more realistic.

21. Why is the project model important for interviews?

Answer:

Interviewers want to see that you understand the difference between a single document and an actual software project. A file-based workspace demonstrates architecture thinking, modularity, and scaling awareness.

🔴 Advanced Questions 22. What would happen if all files shared the same Yjs document?

Answer:

All file contents would be merged into a single shared state, causing mixing of unrelated code. This would make project editing unpredictable and would not reflect a realistic codebase.

23. What is the ideal future version of this phase?

Answer:

The ideal version is a full project explorer with:

- room-owned files
- per-file Yjs sync rooms
- file rename/delete/create actions
- save/load persistence
- per-file presence indicators
- open tabs and active file management

24. How is this phase different from Phase 6?

Answer:

Phase 6 focused on people awareness in a single file. Phase 7 focuses on project structure: multiple files, file switching, and a workspace model around the shared editor.

✅ Strong final answer for interviews

"Part 7 is the transition from a single collaborative editor to a real project workspace. We moved from one shared document to a room with multiple files, each file linked to the room and stored in PostgreSQL. On the frontend, the user can create, rename, delete, switch, and save files, while Yjs handles the live document collaboration for each file. The architectural idea is to treat every file as its own collaborative document, which is important for avoiding content mixing and building a realistic coding environment."
