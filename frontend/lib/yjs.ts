import * as Y from "yjs";

export function createYjsDocument() {
  const doc = new Y.Doc();
  const text = doc.getText("code");

  return {
    doc,
    text,
  };
}