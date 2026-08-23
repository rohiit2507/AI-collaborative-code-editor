Perfect. 🔥 Part 1 officially complete.

🎤 Part 1 — Quick Interview Revision
Core concepts
React Component → reusable UI building block.
State → data that can change during component execution.
useState → React Hook used to manage state.
Controlled Component → UI value is controlled by React state.
Event Handler → function triggered by user action, e.g. onChange, onClick.
Monaco Editor → browser-based code editor component.
Next.js → React-based framework for building web applications.
TypeScript → JavaScript with static type checking.
Git → version-control system.
GitHub → platform for hosting and collaborating on Git repositories.
🎯 Questions you should be able to answer

Q1. Why did you use Next.js instead of plain React?

Q2. What is useState() and why did you use it here?

Q3. Why is your Monaco editor a controlled component?

Q4. What happens when the user types something in the editor?

Q5. What does this do?

onChange={(value) => setCode(value || "")}

Q6. Why are we NOT executing code directly in the browser/server right now?

That last question is especially important because later we'll introduce the backend + Docker sandbox.

🧠 One thing to remember

Our project has now officially started:

GitHub
↓
Next.js
↓
React
↓
Monaco Editor
↓
React State
↓
Basic UI
↓
GitHub Commit

Next → Part 2: Backend Setup 🚀

We'll create the backend separately and learn Node.js + Express + API + project architecture before connecting it to our editor.

part 2
Part 2 — Complete Interview Answers
Q1. What is Node.js?

Node.js is an open-source JavaScript runtime environment that allows us to run JavaScript outside the browser, mainly for building server-side and backend applications.

Q2. What is Express.js and why did you use it?

Express.js is a lightweight web framework for Node.js that makes it easier to build servers and APIs using routing, middleware, and request-response handling.

Q3. What is an API?

An API is an interface that allows different software components to communicate with each other using defined rules and formats.

Simple version:

API acts like a bridge between the frontend and backend.

Q4. What is a REST API?

A REST API is an API that follows REST architectural principles and uses HTTP methods such as GET, POST, PUT, and DELETE to interact with resources.

Q5. Difference between GET and POST?

GET:

Used to retrieve data from the server.

POST:

Used to send data to the server, usually to create or process something.

Our project:

GET /api/health
POST /api/execute
Q6. Explain what happens when you click Run.

When the user clicks Run, the React handleRun() function collects the code and selected language. It sends them through a POST request to /api/execute. Express receives the request, reads the data from req.body, validates it, and sends a JSON response back to the frontend. The frontend then displays that response.

Run
↓
handleRun()
↓
fetch()
↓
POST /api/execute
↓
Express
↓
req.body
↓
JSON response
↓
Frontend
Q7. Why POST instead of GET for /api/execute?

Because we need to send the user's code and language to the server for processing. POST is appropriate for sending data in the request body.

Q8. What is req.body?

req.body contains the data sent by the client to the server in the body of an HTTP request.

In our project:

{
code: 'print("Hello")',
language: "python"
}

is available through:

req.body
Q9. What does res.json() do?

res.json() sends a JSON-formatted response from the server back to the client.

Example:

res.json({
success: true,
message: "Backend is healthy"
});
Q10. What happens if the backend is down?

The frontend request fails, the catch block handles the error, and we display an appropriate message such as "Could not connect to backend."

This is called error handling.

Q11. What is CORS and why did we use it?

CORS stands for Cross-Origin Resource Sharing. It controls whether a browser allows requests between different origins.

Our frontend:

localhost:3000

Backend:

localhost:5000

These are different origins, so we enabled CORS in Express.

Q12. Difference between frontend and backend?

Frontend:

The part of the application that users interact with, such as the editor and buttons.

Backend:

The server-side part that handles business logic, APIs, authentication, database operations, and code execution.

Our architecture:

Frontend
↓
Backend
↓
Database / Services
Q13. Why shouldn't we execute user code directly inside Node.js?

Because users can submit malicious or resource-intensive code. Running arbitrary code directly on our backend could compromise the server or consume all its resources.

That's why later we'll use:

User Code
↓
Docker Sandbox
↓
CPU/Memory/Time limits
↓
Execution

🔥 This is one of the most important questions for this project.

Q14. What happens if the user sends empty code or language?

Our backend validates:

if (!code || !language)

and returns:

HTTP 400

with:

{
"success": false,
"message": "Code and language are required"
}

This is called input validation.

Q15. What is HTTP 400?

HTTP 400 means Bad Request. It indicates that the request sent by the client is invalid or cannot be properly processed by the server.

Example:

POST /api/execute

code = missing
language = missing

       ↓

400 Bad Request
🔥 5 Questions I REALLY Want You To Know

For this project, these are especially important:

Why Node.js + Express?
GET vs POST?
Explain frontend → backend flow.
Why can't we execute code directly on the server?
How will Docker make code execution safer?

And later, these will become much deeper when we build the actual system.

Now Part 2 is properly closed. ✅

Next we can start Part 3 — PostgreSQL & Database.
