# PART 5 — CRDT Collaboration, Authentication & Security

Part 5 mein humne collaborative editor ko reliable aur secure banaya. Yjs CRDT shared code ko synchronize karta hai, aur JWT + room authorization ensure karte hain ki koi unauthorized user room access na kar sake.

## Level 1 — Authentication Basics

### 1. JWT kya hota hai?

JWT ka full form JSON Web Token hai. Yeh ek signed token hota hai jo prove karta hai ki user login kar chuka hai.

Hamare project mein login ke baad JWT mein user id, username aur email store hote hain. Backend har protected request par JWT verify karta hai.

### 2. JWT ko HTTP-only cookie mein kyun store kiya?

HTTP-only cookie ko browser JavaScript read nahi kar sakta. Isliye agar XSS attack ho bhi jaye, attacker `document.cookie` se token chura nahi sakta.

Hamare flow mein:

Login
↓
Backend JWT banata hai
↓
HTTP-only cookie mein set karta hai
↓
Browser automatically protected request ke saath bhejta hai

### 3. `authenticateToken` middleware kya karta hai?

`authenticateToken` request ki cookie se token leta hai, `jwt.verify()` se verify karta hai, aur valid user data ko `req.user` mein attach karta hai.

Invalid ya missing token par backend `401 Unauthorized` return karta hai.

### 4. `401` aur `403` mein difference kya hai?

`401 Unauthorized` ka meaning hai user authenticated nahi hai, ya token invalid/expired hai.

`403 Forbidden` ka meaning hai user logged in hai, lekin uske paas requested resource access karne ki permission nahi hai.

Example:

- No login cookie → `401`
- Login hai, but doosre owner ka room open karna hai → `403`

### 5. Client se `ownerId` kyun nahi lena chahiye?

Client-controlled data trust nahi karna chahiye. User browser request change karke kisi aur ka `ownerId` bhej sakta hai.

Secure approach:

JWT
↓
Verified `req.user.userId`
↓
Backend sets `owner_id`

Isliye room ka owner request body se nahi, verified JWT se aata hai.

### 6. `authorizeRoomOwner` middleware kya karta hai?

Yeh middleware room id se database query karta hai, room ka `owner_id` check karta hai, aur usko authenticated user ki id se compare karta hai.

Match hua → request allowed.

Match nahi hua → `403 Forbidden`.

### 7. `credentials: "include"` frontend fetch mein kyun zaroori hai?

Frontend `localhost:3000` par hai aur backend `localhost:5000` par. Ports different hain, so browser request cross-origin treat karta hai.

`credentials: "include"` browser ko bolta hai ki HTTP-only login cookie backend request ke saath bhejo.

Without it, protected Save aur Load APIs `401` return kar sakti hain.

### 8. CORS mein `credentials: true` kyun diya?

Browser cookies ko cross-origin request ke saath bhejne ke liye dono sides ready hone chahiye:

Frontend fetch → `credentials: "include"`

Backend CORS → `credentials: true`

Aur backend ko exact frontend origin allow karna hota hai, for example `http://localhost:3000`.

## Level 2 — Securing Real-Time Collaboration

### 9. REST authentication aur WebSocket authentication same kyun nahi hote?

Dono ka purpose identity verify karna hai, but transport different hai.

- REST request → `authenticateToken` middleware
- Socket.IO handshake → `socketAuth` middleware
- Yjs WebSocket upgrade → Yjs server JWT and room authorization check

Ek protected REST API secure hona enough nahi hai. Agar Yjs WebSocket open ho, unauthorized user direct collaborative document join kar sakta hai.

### 10. Yjs server ko bhi authenticate kyun kiya?

Yjs code synchronization ka actual transport hai. Agar sirf Express aur Socket.IO protected ho, but port `1234` open ho, koi attacker direct WebSocket connection try kar sakta hai.

Isliye hamara Yjs server cookie JWT verify karta hai aur confirm karta hai ki requested room authenticated user ka hi hai.

### 11. WebSocket upgrade kya hota hai?

Browser normal HTTP request se WebSocket connection start karta hai. Server request accept kare to connection HTTP se persistent WebSocket mein upgrade ho jata hai.

Hamare secure flow mein:

Browser requests Yjs room
↓
Yjs server reads cookie
↓
JWT verify
↓
Room owner database check
↓
Only then WebSocket upgrade

### 12. Unauthorized Yjs connection par `403` kyun return hota hai?

`403 Forbidden` clearly indicates that user authenticated room access criteria satisfy nahi kar raha, ya valid login cookie nahi bhej raha.

Important point: WebSocket connection establish hone se pehle hi reject ho jata hai, so shared document sync start nahi hota.

### 13. Socket.IO aur Yjs dono kyun use kar rahe hain?

In dono ki responsibilities different hain.

Socket.IO:

- Room join/leave events
- Presence events
- Future chat and notifications

Yjs:

- Shared code document
- Concurrent text changes
- CRDT conflict resolution
- Future cursor awareness

### 14. Yjs `sync` event kya batata hai?

`sync` event tab fire hota hai jab provider aur server ka document synchronization complete hota hai.

Hamne incorrect `synced` event ke instead valid `sync` event use kiya. `sync` event reliable status message dikhata hai ki current room ka CRDT document connected and synchronized hai.

### 15. Database content automatically har client sync par load kyun nahi karte?

Agar do clients empty CRDT document dekh kar same PostgreSQL content ek saath insert karein, duplicate content create ho sakta hai.

Example:

Client A inserts `print("Hi")`

Client B bhi same time inserts `print("Hi")`

CRDT dono valid inserts merge karega, so code duplicate ho sakta hai.

Isliye current version mein Save/Load explicit action hai. Automatic durable Yjs persistence later persistence phase mein safely implement hoga.

### 16. CRDT concurrent edits kaise handle karta hai?

CRDT means Conflict-free Replicated Data Type. Har client local change immediately apply karta hai, then updates exchange karta hai. Yjs operations ko merge karta hai so all clients eventually same final document state par aa jaate hain.

Example:

User A → `A`

User B → `B`

Final value order `AB` ya `BA` ho sakta hai, but important baat: dono users ke changes survive karte hain aur all clients same result dekhte hain.

### 17. Room isolation kaise work karti hai?

Frontend room id ko Yjs document name mein convert karta hai:

`/room/5` → `codecollab-room-5`

Har document ka separate Yjs state hota hai. Isliye Room 1 ka code Room 2 mein leak nahi hota.

### 18. Yjs server memory mein documents kab tak rakhta hai?

Current development server active connections ke liye documents memory mein rakhta hai. Jab last client disconnect karta hai, document memory se remove ho sakta hai.

Long-term persistence ke liye PostgreSQL Save/Load currently available hai. Server-side durable Yjs persistence later phase mein add hoga.

## Level 3 — Testing & Reliability

### 19. Part 5 mein humne kya test kiya?

- Frontend lint and TypeScript checks
- Backend syntax check
- Yjs server health response
- Unauthenticated Yjs room connection rejected with `403`
- Two concurrent Yjs clients converge to same text
- Different Yjs room names stay isolated

### 20. Two-client CRDT test mein expected result kya hai?

Dono clients same room join karein aur near-same time text type karein.

Expected:

- Dono editors same final content dikhayein
- Kisi user ka update silently overwrite na ho
- Different room ka editor empty ya independent rahe

### 21. Reconnect test kyun important hai?

Network unstable ho sakta hai. Client disconnect hone ke baad provider reconnect karega aur missing Yjs updates receive karke current document state se converge karega.

Interview answer:

"Yjs provider reconnect ke baad server se document updates synchronize karta hai. CRDT model replicas ko eventual consistency tak laata hai."

### 22. Current authorization model ki limitation kya hai?

Abhi only room owner Yjs room join kar sakta hai. Ye secure default hai, but true multi-user collaboration ke liye later `RoomMember` table aur roles chahiye:

- Owner
- Editor
- Viewer

### 23. Viewer role future mein kaise enforce hoga?

Viewer ko room read karne dena hoga, but Yjs update messages accept nahi karne honge. Editor aur owner updates bhej sakenge.

Iske liye server-side membership and role validation required hogi; frontend button disable karna security ke liye enough nahi hai.

### 24. Docker sandbox aur authentication ka relation kya hai?

Authentication decide karta hai kaun room aur execution feature use kar sakta hai. Docker sandbox decide karta hai submitted code safely kaise run hoga.

Dono security layers hain, but different threats solve karte hain:

- Auth → unauthorized access prevent karta hai
- Docker sandbox → malicious/infinite code se server protect karta hai

## Strong 1-Minute Interview Answer

"Part 5 mein maine collaborative editor ko secure and reliable banaya. Login ke baad backend JWT ko HTTP-only cookie mein store karta hai. Express protected APIs mein token verify karta hai, aur room creation mein owner id client se accept nahi hoti; verified JWT se aati hai. Real-time layer mein Socket.IO room events ke liye use hota hai, while Yjs CRDT shared code synchronization ke liye use hota hai. Maine Yjs WebSocket server par bhi JWT cookie aur room ownership validation add ki, so user direct port 1234 connect karke unauthorized document access nahi kar sakta. Concurrent edits Yjs CRDT merge karta hai, aur PostgreSQL currently explicit Save/Load persistence provide karta hai."

## Terms You Must Know

JWT

HTTP-only cookie

Authentication

Authorization

Middleware

401 Unauthorized

403 Forbidden

CORS

Credentials

WebSocket upgrade

Socket.IO handshake

CRDT

Yjs

Y.Doc

Y.Text

Convergence

Eventual consistency

Room isolation

Owner / Editor / Viewer

## Part 5 Interview Challenge

Try answering these without reading above answers:

1. JWT ko localStorage ke instead HTTP-only cookie mein kyun store kiya?
2. `401` aur `403` mein exact difference kya hai?
3. Client-provided `ownerId` security problem kyun hai?
4. Yjs port `1234` ko authenticate karna kyun necessary hai?
5. Socket.IO aur Yjs ki responsibilities kaise different hain?
6. Do users simultaneous typing karein to Yjs kya guarantee deta hai?
7. Automatic database loading current CRDT document mein duplicate code kyun create kar sakti hai?
8. Room 1 aur Room 2 ka document state separate kaise rehta hai?
9. Reconnect ke baad document consistency kaise return hoti hai?
10. Owner, editor aur viewer roles ko server side par enforce karna kyun necessary hai?

Part 5 complete hone ke baad next phase: Live Cursor & Presence. 🚀
