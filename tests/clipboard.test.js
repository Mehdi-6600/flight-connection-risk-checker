import test from "node:test";
import assert from "node:assert/strict";
import { copyTextToClipboard } from "../src/lib/clipboard.js";

function makeFallbackDocument(execCommand) {
  const appended = [];
  let removed = false;
  const element = {
    style: {},
    value: "",
    setAttribute() {},
    select() {},
    remove() {
      removed = true;
    },
  };
  return {
    document: {
      body: { append: (child) => appended.push(child) },
      createElement: (tagName) => {
        assert.equal(tagName, "textarea");
        return element;
      },
      execCommand,
    },
    appended,
    element,
    wasRemoved: () => removed,
  };
}

test("uses the async clipboard API when available", async () => {
  let copiedText = "";
  await copyTextToClipboard("itinerary", {
    clipboard: { writeText: async (text) => { copiedText = text; } },
    document: null,
  });
  assert.equal(copiedText, "itinerary");
});

test("falls back when async clipboard access is denied", async () => {
  const fallback = makeFallbackDocument((command) => command === "copy");
  await copyTextToClipboard("itinerary", {
    clipboard: { writeText: async () => { throw new Error("permission denied"); } },
    document: fallback.document,
  });
  assert.equal(fallback.element.value, "itinerary");
  assert.deepEqual(fallback.appended, [fallback.element]);
  assert.equal(fallback.wasRemoved(), true);
});

test("removes the temporary textarea if the fallback copy command throws", async () => {
  const fallback = makeFallbackDocument(() => { throw new Error("copy failed"); });
  await assert.rejects(
    copyTextToClipboard("itinerary", { clipboard: null, document: fallback.document }),
    /copy failed/,
  );
  assert.equal(fallback.wasRemoved(), true);
});
