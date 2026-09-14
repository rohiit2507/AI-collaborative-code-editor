Level 1 — Basic Questions
1. What is WebSocket?

Answer:

WebSocket is a communication protocol that creates a persistent, two-way connection between client and server. Unlike normal HTTP request-response communication, both sides can send messages whenever required.

Our project:

Browser ↔ WebSocket Server
2. WebSocket vs HTTP?
HTTP	WebSocket
Request → Response	Two-way communication
Connection generally request-based	Persistent connection
Client normally initiates request	Both sides can send
Good for REST APIs	Good for real-time applications
3. Why did we use Socket.IO?

Socket.IO provides an easier abstraction over real-time communication and gives us features like events, rooms, reconnection and connection management.

4. What is socket.emit()?

It sends an event from one socket/client to the server or another listener.

Example:

socket.emit("join_room", roomId);
5. What is socket.on()?

It listens for an event.

socket.on("disconnect", () => {
  console.log("User disconnected");
});
6. What is a Socket.IO room?

A Socket.IO room is a logical channel where sockets can join and receive events targeted specifically to that group.

Our project:

Room 1
├── User A
├── User B
└── User C
7. Why do we need rooms?

Without rooms:

User A → code change → EVERYONE ❌

With rooms:

User A → Room 1 → User B + C

Users in Room 2 don't receive Room 1 events.

🟡 Level 2 — Yjs / CRDT

These are very important for your project.

8. What is CRDT?

CRDT stands for Conflict-free Replicated Data Type. It is a data structure designed so that multiple replicas can be modified independently and eventually converge to a consistent state.

9. Why did we need CRDT?

Our first implementation was:

User A
 ↓
Socket.IO
 ↓
Server
 ↓
User B

This works for basic synchronization but can have problems when two users edit simultaneously.

Example:

User A → "Hello A"
User B → "Hello B"

One update could overwrite another.

CRDT helps handle concurrent modifications.

10. Why Yjs?

Yjs is a CRDT framework designed for collaborative applications. Instead of implementing a complex CRDT algorithm ourselves, we use Yjs to manage shared document state and conflict resolution.

11. What is Y.Doc?

Y.Doc is the main Yjs document that contains shared data structures.

In our project:

Y.Doc
  ↓
Y.Text
  ↓
Shared code
12. What is Y.Text?

Y.Text is a shared text data structure in Yjs. We use it to represent the source code being edited collaboratively.

13. What is y-monaco?

y-monaco is the bridge between Monaco Editor and Yjs. It synchronizes Monaco's text model with a Yjs shared text structure.

Our architecture:

Monaco
   ↕
y-monaco
   ↕
Y.Text
14. What is y-websocket?

y-websocket provides the network transport that allows Yjs documents to synchronize between different clients through a WebSocket server.

Browser A
 ↓
Yjs
 ↓
y-websocket
 ↓
Yjs Server
 ↓
Browser B
🟠 Level 3 — Our Implementation
15. Explain the complete real-time architecture.

Strong interview answer:

"Our application uses two different real-time mechanisms for different responsibilities. Socket.IO handles application-level events such as room membership and user presence, while Yjs handles collaborative document synchronization. Monaco is connected to Yjs through y-monaco. Yjs communicates through a y-websocket server, allowing multiple users to edit the same document and resolve concurrent changes using CRDT."

🔥 This is one of your most important answers.

16. Why didn't we use Socket.IO for code synchronization?

We initially used Socket.IO for basic code synchronization, but it doesn't automatically solve concurrent editing conflicts. Yjs provides CRDT-based synchronization, which is more appropriate for collaborative document editing.

17. Why are we still using Socket.IO?

Because Yjs doesn't need to handle every application-level event.

We use Socket.IO for:

👥 Presence
🏠 Room events
💬 Future chat
🔔 Notifications

Yjs:

📝 Shared document
🔄 Collaborative editing
⚔️ Conflict resolution
18. Explain dynamic Yjs rooms.

Our URL:

/room/5

gives:

roomId = "5"

Then:

roomId
 ↓
createYjsProvider()
 ↓
codecollab-room-5

Therefore:

/room/1 → codecollab-room-1
/room/2 → codecollab-room-2

They are separate collaborative documents.

19. Why do we need separate Y.Doc for every room?

Each collaborative room should represent an independent document state. If all rooms shared the same Y.Doc, users from different rooms could accidentally synchronize the same content.

20. Explain PostgreSQL + Yjs together.

This is another very important placement question.

Yjs manages the live collaborative state, while PostgreSQL provides persistent storage. When users collaborate, Yjs handles real-time changes. When the user saves, the current Yjs content is stored in PostgreSQL. When a room is opened, the saved PostgreSQL content can initialize an empty Yjs document.

Architecture:

             LIVE STATE
                 ↓
               Yjs
                 ↓
             Monaco
                 │
               Save
                 ↓
            PostgreSQL
             PERSISTENCE
🔴 Advanced Questions
21. What happens if two users edit simultaneously?

Each client creates local changes in the CRDT. Yjs exchanges those changes and merges them according to its CRDT algorithm, allowing replicas to converge to a consistent state.

22. What happens if a user disconnects?

The user's WebSocket connection closes.

Socket.IO can detect:

socket.on("disconnect", ...)

and update presence.

Yjs can synchronize the document again when the user reconnects.

23. What happens when a new user opens an existing room?

Our current flow:

User opens room
      ↓
Yjs connects
      ↓
Yjs synchronization
      ↓
Check PostgreSQL
      ↓
If Yjs document empty
      ↓
Load saved content
      ↓
Y.Text
      ↓
Monaco

This prevents blindly overwriting an already synchronized Yjs document.

24. Why shouldn't PostgreSQL be used for every keystroke?

Excellent interview question.

Writing every keystroke directly to PostgreSQL would create unnecessary database traffic and add latency. Yjs is better suited for high-frequency collaborative changes, while PostgreSQL can be used for persistence through controlled saves or snapshots.

25. What happens if PostgreSQL is down but Yjs is working?

Existing users who already have the collaborative document can potentially continue editing through Yjs, but persistence operations such as saving to PostgreSQL would fail. A production system should handle this with retries, error states, and potentially durable server-side persistence.

26. What happens if the Yjs server goes down?

Existing WebSocket connections are lost and real-time synchronization stops. Clients can reconnect when the server becomes available. Persistent data in PostgreSQL remains available for recovery.

27. Why do we have both PostgreSQL and Yjs?

Simple answer:

Yjs       → real-time collaboration
PostgreSQL → long-term persistence

Don't say they do the same job.

🧠 Architecture Question
28. Explain this project in 1 minute.

You can say:

"I built a collaborative code editor using Next.js, Monaco Editor, Node.js, Express, PostgreSQL, Socket.IO and Yjs. Monaco provides the coding interface. PostgreSQL stores users, rooms and files. Express exposes REST APIs for database operations. Socket.IO handles application-level real-time events such as room membership and presence. For collaborative editing, I use Yjs CRDT with y-monaco and a y-websocket server. Each room has its own Yjs document, so users in different rooms don't interfere with each other. Saved code is persisted in PostgreSQL and can initialize the collaborative document when a room is opened."

🔥 Memorize the structure, not every word.

🎯 Terms You Must Know

For placement interviews, know these terms:

HTTP
WebSocket
Socket.IO
Event
emit
on
broadcast
Room
Connection
Disconnect
Presence

CRDT
Yjs
Y.Doc
Y.Text
y-monaco
y-websocket
Concurrent editing
Conflict resolution
Convergence
Replication

Monaco Editor
REST API
PostgreSQL
Persistence
Primary Key
Foreign Key
Parameterized Query
SQL Injection
Connection Pool

Client
Server
Real-time synchronization
State
Shared state
Dynamic routing
⭐ Questions Interviewer May Ask Specifically About YOUR Project

Be ready for these:

Why did you choose Yjs?
Why not implement your own CRDT?
Why Socket.IO and Yjs together?
How do you isolate different rooms?
How does Monaco communicate with Yjs?
Where is the persistent code stored?
What happens when two users edit simultaneously?
What happens when a user disconnects?
What happens when PostgreSQL is unavailable?
What happens when the Yjs server goes down?
Why not save every keystroke to PostgreSQL?
How would you scale the WebSocket/Yjs server?
How would you add authentication?
How would you prevent unauthorized users from joining a room?
How would you add live cursors?
How would you handle 1,000 users?
How would you persist Yjs updates automatically?
How would you support multiple files per room?
🏆 Part 4 Interview Challenge

Don't just read the answers. Try answering these without looking:

Q1

Explain why your project needs both Socket.IO and Yjs.

Q2

What problem does CRDT solve?

Q3

Explain the complete flow when User A types one character in Monaco.

Q4

How are Room 1 and Room 2 isolated?

Q5

How does PostgreSQL interact with Yjs?

Q6

What happens when two users type simultaneously?

Q7

Why shouldn't you store every keystroke directly in PostgreSQL?

Q8

What is the difference between Y.Doc and Y.Text?

Q9

What is y-monaco doing in your project?

Q10

Explain your entire Part 4 architecture in 1–2 minutes.

Send me your answers to these 10 questions, even if they're not perfect. I'll correct them like a real placement interviewer.

And yes — Part 4 is fully complete from the implementation roadmap we're following. We won't start Part 5 until you're satisfied with this interview round.