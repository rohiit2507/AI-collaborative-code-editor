function createVersionSnapshot({
  id,
  filename,
  language,
  content,
  versionNumber,
  summary,
}) {
  return {
    id,
    versionNumber,
    filename,
    language,
    content: typeof content === "string" ? content : "",
    summary: summary || `Saved ${filename}`,
  };
}

function buildVersionLabel(version) {
  const number = version?.versionNumber ?? version?.version_number ?? null;
  return number === null ? "Latest" : `Version ${number}`;
}

module.exports = {
  createVersionSnapshot,
  buildVersionLabel,
};
