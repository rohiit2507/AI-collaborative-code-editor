PART 3 — Interview Questions

Before moving forward, understand these.

Q1. Why PostgreSQL?

PostgreSQL is a relational database that provides structured data storage, relationships, constraints, transactions, and strong SQL support.

Q2. What is a primary key?

A primary key uniquely identifies each row in a table.

Example:

users.id
Q3. What is a foreign key?

A foreign key creates a relationship between tables by referencing a key from another table.

Example:

rooms.owner_id → users.id
Q4. Why shouldn't frontend directly connect to PostgreSQL?

It would expose database credentials and bypass backend authorization and business logic. The backend acts as a secure intermediary.

Frontend
   ↓
Backend
   ↓
Database
Q5. What is SQL injection?

SQL injection is an attack where malicious input is inserted into SQL queries to manipulate the database.

That's why we used:

$1, $2, $3, $4

instead of directly concatenating user input into SQL.

Q6. What is a parameterized query?

A parameterized query separates SQL instructions from user-provided values, making queries safer against SQL injection.

Q7. Why use Pool from pg?

A connection pool manages multiple reusable database connections instead of creating a new connection for every request.

Q8. What is async/await doing in our database code?

Database operations are asynchronous. await allows us to wait for the database result without blocking the Node.js event loop.

Q9. What does HTTP 404 mean?

The requested resource was not found.

We used it when:

/api/files/:id

doesn't find that file.

Q10. What does HTTP 201 mean?

201 Created means the server successfully created a new resource.

We use it when creating users, rooms, and files.

🔥 The most important Part 3 interview question

"Explain your database design."

Your answer should be:

"I designed a relational PostgreSQL database with three core entities: users, rooms, and files. A user can own rooms, and each room can contain multiple files. I used primary keys to uniquely identify records and foreign keys to maintain relationships between the tables. For example, rooms.owner_id references users.id, while files.room_id references rooms.id."

That's a solid placement-level answer.

🎯 Part 3 Status
✅ PostgreSQL
✅ Database
✅ Schema
✅ Tables
✅ Node → PostgreSQL
✅ Environment variables
✅ User API
✅ Room API
✅ File API
✅ Save
✅ Load
✅ GitHub

Part 3 = COMPLETE. ✅

Next major part is Part 4 — WebSockets + Real-Time Communication, where our project starts becoming a real collaborative editor. 🚀