const test = require("node:test");
const assert = require("node:assert/strict");

const { buildAiContext, getFallbackReply } = require("./aiService");

test("AI context includes the current file and nearby project metadata", () => {
  const context = buildAiContext({
    currentFile: "main.py",
    language: "python",
    selectedCode: "print('hello')",
    projectFiles: [
      { filename: "main.py", language: "python", content: "print('hello')\n" },
      { filename: "utils.py", language: "python", content: "def helper():\n    return 42\n" },
    ],
  });

  assert.match(context, /main\.py/);
  assert.match(context, /print\('hello'\)/);
  assert.match(context, /utils\.py/);
});

test("fallback AI explanation stays grounded in the code and language", () => {
  const response = getFallbackReply({
    prompt: "Explain this code",
    currentFile: "main.py",
    selectedCode: "print('hello')",
    language: "python",
  });

  assert.match(response.toLowerCase(), /python|print/);
  assert.ok(response.length > 20);
});
