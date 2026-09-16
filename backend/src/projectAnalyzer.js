const LANGUAGE_BY_EXTENSION = {
  c: "c",
  cpp: "cpp",
  css: "css",
  go: "go",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  md: "markdown",
  py: "python",
  sql: "sql",
  ts: "typescript",
  tsx: "typescript",
  jsx: "javascript",
};

const IGNORED_FILES = new Set([".env", ".env.local", "package-lock.json", "yarn.lock"]);

function detectLanguage(filename = "") {
  const extension = filename.split(".").pop()?.toLowerCase();
  return LANGUAGE_BY_EXTENSION[extension] || "text";
}

function extractSymbols(content = "", language = "text") {
  const symbols = [];
  const patterns = language === "python"
    ? [/^\s*(?:async\s+)?def\s+([A-Za-z_$][\w$]*)/gm, /^\s*class\s+([A-Za-z_$][\w$]*)/gm]
    : [/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g, /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(content)) !== null && symbols.length < 40) {
      if (!symbols.includes(match[1])) symbols.push(match[1]);
    }
  });

  return symbols;
}

function extractImports(content = "", language = "text") {
  const imports = [];
  const pattern = language === "python"
    ? /^\s*(?:from\s+([^\s]+)\s+)?import\s+([^\s]+)/gm
    : /^\s*import\s+(?:.+?\s+from\s+)?["']([^"']+)["']/gm;
  let match;

  while ((match = pattern.exec(content)) !== null && imports.length < 40) {
    imports.push(language === "python" ? (match[1] || match[2]) : match[1]);
  }

  return [...new Set(imports)];
}

function analyzeProject(projectFiles = []) {
  return projectFiles
    .filter((file) => file && typeof file.filename === "string" && !IGNORED_FILES.has(file.filename))
    .slice(0, 100)
    .map((file) => {
      const language = file.language || detectLanguage(file.filename);
      const content = typeof file.content === "string" ? file.content : "";
      return {
        filename: file.filename,
        language,
        bytes: Buffer.byteLength(content, "utf8"),
        lines: content ? content.split("\n").length : 0,
        symbols: extractSymbols(content, language),
        imports: extractImports(content, language),
      };
    });
}

function searchProject(question, projectFiles = [], limit = 5) {
  const query = String(question || "").toLowerCase();
  const terms = query.split(/[^a-z0-9_$.-]+/).filter((term) => term.length > 1);

  return analyzeProject(projectFiles)
    .map((metadata) => {
      const haystack = [metadata.filename, metadata.language, ...metadata.symbols, ...metadata.imports]
        .join(" ")
        .toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { ...metadata, score };
    })
    .filter((file) => file.score > 0)
    .sort((left, right) => right.score - left.score || left.filename.localeCompare(right.filename))
    .slice(0, limit);
}

module.exports = { analyzeProject, detectLanguage, extractImports, extractSymbols, searchProject };