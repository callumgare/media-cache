/**
 * Collects console errors and warnings emitted during a test.
 * Call before page.goto() and assert the returned array is empty at the end.
 */
export function collectConsoleProblems(page: import("@playwright/test").Page) {
  const messages: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      messages.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  return messages;
}
