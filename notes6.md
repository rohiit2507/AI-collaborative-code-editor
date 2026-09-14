Level 1 — Basic Questions

1. What is live cursor collaboration?

Answer:

Live cursor collaboration means each user in the same room can see where other users are currently typing or selecting in the editor. It helps users understand who is editing which part of the code.

2. Why is live cursor important in a collaborative editor?

Answer:

It improves real-time coordination. If two users are editing the same file, they can see who is currently working on which region and avoid accidental overwrites or confusion.

3. What is presence in a collaborative application?

Answer:

Presence means knowing which users are currently online, active, and connected to the same room. This includes online/offline state, user identity, and maybe current cursor location.

4. Why do we need awareness in Yjs?

Answer:

Yjs syncs the document content, but awareness tracks metadata about clients such as cursor position, selected text, and user identity. This is separate from shared text content and is useful for collaboration UX.

5. What is awareness state?

Answer:

Awareness state is a map of client metadata in the Yjs document. Each client can store local fields like user name, id, cursor, and selection.

🟡 Level 2 — Core Interview Questions 6. What is the difference between document sync and awareness?

Answer:

Document sync is about the actual code content being shared across users.
Awareness is about metadata such as cursor position, active selection, and user identity.

Example:

- Document sync: actual text in the file
- Awareness: “User A is editing line 25, column 10”

7. How did we implement presence in this project?

Answer:

We used Yjs awareness inside the collaborative room. Each client sets a local awareness state containing the user id and username. We also send the current cursor position and selection range to the provider, and the UI listens for awareness changes.

8. How is a cursor sent to other users?

Answer:

The Monaco editor triggers an event when the cursor or selection changes. We then call a function that reads the current position from the editor and stores it in awareness using:

provider.awareness.setLocalStateField("cursor", {...})

Then all connected users receive the awareness update through Yjs.

9. Why do we store cursor data in awareness instead of the document?

Answer:

Cursor position is not part of the code content itself. It is a real-time UI state, not document state. Awareness is designed exactly for this kind of ephemeral, collaborative metadata.

10. How does Yjs awareness help with live collaboration?

Answer:

Yjs awareness allows clients to broadcast extra per-user metadata while still syncing the actual document. This makes it possible to build presence features without mixing UI metadata with the shared text model.

11. What is a remote selection highlight?

Answer:

A remote selection highlight is the visual indicator that shows another user is selecting text in the editor. It usually appears as a colored block or border around the selected portion of the document.

12. Why is a room-based cursor system important?

Answer:

Each room is independent. Users in Room A should not see the cursor or selection of users in Room B. The room-specific awareness state ensures a user only sees presence data for members of the same collaborative room.

13. How do we know which user is the current user?

Answer:

We compare the awareness client ID with the Yjs document client ID. If the IDs match, that user is the current local user and we can display them as “(you)”.

14. What is the role of the Monaco editor here?

Answer:

Monaco is the actual code editor. We use it to capture text changes, cursor movement, and selection changes. These events are then synchronized with Yjs awareness for collaborative presence.

15. Why are selection and cursor updates separate from text updates?

Answer:

Text updates are part of document state and must be synchronized as shared content. Cursor and selection are ephemeral and user-specific, so they are better suited to awareness metadata.

⚠️ Important Security / Design Questions 16. Does live cursor data need authentication?

Answer:

Yes. A user should only see presence for people in the same authorized room. In our current implementation, the Yjs server validates the JWT cookie and only allows the room owner into that room. This prevents unauthorized access to presence and document data.

17. Is presence data persisted in the database?

Answer:

No, not in the current phase. Presence is temporary and live; it exists only while users are connected. Database persistence belongs to later phases when we implement a more durable application state.

18. Why is presence not stored as part of the file content?

Answer:

This would pollute the code document with UI metadata. The actual file content should remain pure source code, while awareness data should remain separate and ephemeral.

🔴 Advanced Questions 19. What happens if a user disconnects while their cursor was visible?

Answer:

Their awareness state is removed when the connection closes. The server or Yjs awareness layer automatically clears the user’s cursor and selection state, so other users stop seeing them as active.

20. How do we ensure the remote cursor is updated quickly?

Answer:

We trigger the awareness update on every cursor or selection change and rely on Yjs awareness events to broadcast the update immediately to connected peers. This keeps the update latency low for real-time collaboration.

21. Why is awareness important for a professional collaboration experience?

Answer:

Without awareness, users feel disconnected. They cannot tell if someone is editing the same file, where they are, or if the file is currently being modified. Awareness makes the editor feel like a shared workspace instead of just a synced text box.

22. What is the difference between user presence and editing activity?

Answer:

User presence is whether the user is online and connected.
Editing activity is whether the user is currently modifying or selecting parts of the editor.
Both are part of the collaboration experience, but they represent different signals.

✅ Strong final answer for interviews

"For Phase 6, we implemented live cursor and presence in our collaborative editor. The application uses Yjs awareness to track each user’s cursor position, selected range, and identity within a room. Monaco listens to editor cursor events and updates the awareness state in real time. Other users receive those awareness updates and display a colored presence indicator and remote selection highlight. This makes the room feel collaborative instead of just synchronized, and it is an important step before adding more advanced collaboration and execution features."
