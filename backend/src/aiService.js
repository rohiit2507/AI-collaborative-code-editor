const { geminiApiKey } = require("./config/env");
const { GoogleGenAI } = require("@google/genai");

function buildAiContext({
  currentFile,
  language,
  selectedCode,
  projectFiles = [],
  prompt,
}) {
  const files = projectFiles.slice(0, 8).map((file) => {
    const fileName = file.filename || "untitled";
    const fileLanguage = file.language || language || "text";
    const fileContent = typeof file.content === "string" ? file.content : "";

    return `- ${fileName} (${fileLanguage})\n${fileContent.slice(0, 180)}`;
  });

  return [
    "You are acting as a helpful coding assistant for a collaborative IDE.",
    `Current file: ${currentFile || "unknown"}`,
    `Language: ${language || "unknown"}`,
    `Selected code:\n${selectedCode || "No code selected"}`,
    `User request: ${prompt || "General coding help"}`,
    `Relevant project files:\n${files.join("\n\n") || "No additional project files available"}`,
    "Keep explanations concise, practical, and specific to the code shown.",
  ].join("\n\n");
}

function getFallbackReply({ prompt, currentFile, selectedCode, language }) {
  const code = (selectedCode || "").trim();
  const activeFile = currentFile || "this file";
  const languageName = language || "code";
  const request = (prompt || "").toLowerCase();

  if (/(sum|addition|add two|calculator)/.test(request)) {
    if (languageName === "python") {
      return [
        "Here is a simple sum function:",
        "",
        "```python",
        "def sum_numbers(first, second):",
        "    return first + second",
        "",
        "print(sum_numbers(2, 3))",
        "```",
      ].join("\n");
    }

    if (languageName === "javascript") {
      return [
        "Here is a simple sum function:",
        "",
        "```javascript",
        "function sumNumbers(first, second) {",
        "  return first + second;",
        "}",
        "",
        "console.log(sumNumbers(2, 3));",
        "```",
      ].join("\n");
    }
  }

  if (/(alphabet|alphabets|a to z|a-z)/.test(request)) {
    if (languageName === "python") {
      return [
        "Here is Python code that writes the English alphabet:",
        "",
        "```python",
        "import string",
        "",
        "print(string.ascii_lowercase)",
        "print(string.ascii_uppercase)",
        "```",
      ].join("\n");
    }

    if (languageName === "javascript") {
      return [
        "Here is JavaScript code that writes the English alphabet:",
        "",
        "```javascript",
        "const lowercase = 'abcdefghijklmnopqrstuvwxyz';",
        "const uppercase = lowercase.toUpperCase();",
        "",
        "console.log(lowercase);",
        "console.log(uppercase);",
        "```",
      ].join("\n");
    }
  }

  if (/(generate|create|write|make|implement)/.test(request)) {
    return [
      `Here is a starter ${languageName} function for ${activeFile}:`,
      "",
      `\`\`\`${languageName}`,
      languageName === "python"
        ? "def helper(value):\n    return value"
        : "function helper(value) {\n  return value;\n}",
      "```",
      "",
      "Review the preview and insert it only when you are happy with it.",
    ].join("\n");
  }

  if (!code) {
    return `I can help with ${activeFile}. Share a snippet or ask for a feature, fix, or explanation in ${languageName}.`;
  }

  return `This ${languageName} snippet in ${activeFile} is doing a simple task: it prints or evaluates the content you provided. The key idea is that the code runs the provided instruction directly, which makes it useful for quick output, debugging, or prototype logic. If you want, I can explain it line by line, improve it, or turn it into a safer version.`;
}

async function generateAiReply({
  prompt,
  currentFile,
  language,
  selectedCode,
  projectFiles,
  model,
}) {
  const apiKey = geminiApiKey;

  if (!apiKey) {
    return {
      success: true,
      mode: "fallback",
      reply: getFallbackReply({ prompt, currentFile, selectedCode, language }),
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: model || "gemini-2.5-flash",
      contents: buildAiContext({
        currentFile,
        language,
        selectedCode,
        projectFiles,
        prompt,
      }),
      config: {
        systemInstruction: "You are a helpful coding assistant for a collaborative IDE. Keep responses concise, practical, and safe. Use fenced code blocks with the relevant language when returning code.",
        temperature: 0.3,
        maxOutputTokens: 400,
      },
    });
    const message = response.text || "";

    return {
      success: true,
      mode: "live",
      reply: message || getFallbackReply({ prompt, currentFile, selectedCode, language }),
    };
  } catch (error) {
    return {
      success: false,
      mode: "error",
      reply: `AI request failed: ${error.message || "Unknown error"}`,
    };
  }
}

module.exports = {
  buildAiContext,
  generateAiReply,
  getFallbackReply,
};
