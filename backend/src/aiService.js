const { jwtSecret } = require("./config/env");

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
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;

  if (!apiKey) {
    return {
      success: true,
      mode: "fallback",
      reply: getFallbackReply({ prompt, currentFile, selectedCode, language }),
    };
  }

  if (!jwtSecret) {
    return {
      success: true,
      mode: "fallback",
      reply: getFallbackReply({ prompt, currentFile, selectedCode, language }),
    };
  }

  const requestBody = {
    model: model || process.env.AI_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a helpful coding assistant for a collaborative IDE.",
      },
      {
        role: "user",
        content: buildAiContext({
          currentFile,
          language,
          selectedCode,
          projectFiles,
          prompt,
        }),
      },
    ],
    temperature: 0.3,
    max_tokens: 400,
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        mode: "error",
        reply: `AI service error: ${errorText.slice(0, 160) || "Unknown error"}`,
      };
    }

    const payload = await response.json();
    const message = payload.choices?.[0]?.message?.content;

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
