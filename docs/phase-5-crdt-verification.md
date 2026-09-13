# Phase 5: CRDT verification

Start the three local services in separate terminals:

```powershell
cd frontend
npm run dev
```

```powershell
cd backend
npm run dev
```

```powershell
cd backend
npm run yjs
```

The Yjs terminal must report that it is running on port `1234`. The frontend,
backend, and Yjs service are intentionally separate services on ports `3000`,
`5000`, and `1234`.

## Test checklist

1. Log in in two different browser profiles with the room owner's account. Room-member roles will be added in the authentication phase.
2. Open the same URL in both profiles: `http://localhost:3000/room/<roomId>`.
3. Type different text in both editors at nearly the same time. Both editors must converge on the same content.
4. Open a different room in one profile. Its content must not appear in the original room.
5. Disconnect one browser from the network, edit in the other browser, then reconnect it. The disconnected browser must converge after reconnecting.
6. Save the content, refresh both browser pages, then use **Load** in one browser. Confirm the other browser receives the loaded document through Yjs. Do not press Load in both browsers at the same time.

## Expected behaviour

- Yjs handles high-frequency shared document changes and concurrent edits.
- PostgreSQL remains the explicit long-term persistence layer through Save and Load. A later persistence phase will make loading and saving automatic without race conditions.
- Socket.IO remains reserved for authenticated room and presence events; it is not the document-sync transport.

## Current security boundary

The Yjs server verifies the HTTP-only JWT cookie and allows only the room owner to connect to that room. It is still an in-memory development server; room-member roles and durable Yjs persistence belong to later phases.
