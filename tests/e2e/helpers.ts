import type { GenericMedia } from "@liase/core";

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

export const TEST_REQUEST = {
  source: "test-source",
  queryType: "test-handler",
};

export function makeImageMedia(
  overrides: Partial<GenericMedia> = {},
): GenericMedia {
  const id = overrides.id ?? Math.random().toString(36).slice(2);
  return {
    liaseSource: "test-source",
    id,
    files: [
      {
        type: "main",
        url: `https://picsum.photos/seed/${id}/800/600`,
        video: false,
        audio: false,
        image: true,
      },
    ],
    ...overrides,
  };
}

export function makeVideoMedia(
  overrides: Partial<GenericMedia> = {},
): GenericMedia {
  const id = overrides.id ?? Math.random().toString(36).slice(2);
  return {
    liaseSource: "test-source",
    id,
    files: [
      {
        type: "main",
        url: "https://media.w3.org/2010/05/sintel/trailer.mp4",
        video: true,
        audio: false,
        image: false,
        ext: "mp4",
        width: 1280,
        height: 720,
      },
    ],
    ...overrides,
  };
}

export async function setup(
  { request }: { request: import("@playwright/test").APIRequestContext },
  opts: {
    media?: GenericMedia[][];
    delay?: number;
    pageSize?: number;
    groups?: Array<{ name: string; parentId?: number }>;
  } = {},
) {
  const res = await request.post("/api/_test/setup", {
    data: {
      media: opts.media ?? [],
      delay: opts.delay ?? 0,
      pageSize: opts.pageSize,
      groups: opts.groups,
    },
  });
  if (!res.ok())
    throw new Error(`Test setup failed: ${res.status()} ${await res.text()}`);
}

export async function createQuery(
  { request }: { request: import("@playwright/test").APIRequestContext },
  opts: { title?: string } = {},
) {
  const res = await request.post("/api/admin/queries", {
    data: {
      title: opts.title ?? "Test Query",
      schedule: 0,
      requestOptions: TEST_REQUEST,
    },
  });
  if (!res.ok())
    throw new Error(
      `Failed to create query: ${res.status()} ${await res.text()}`,
    );
  return res.json() as Promise<{ id: number }>;
}

export async function waitForQueryCompletion({
  request,
}: { request: import("@playwright/test").APIRequestContext }) {
  await Promise.race([
    (async () => {
      while (true) {
        const tasksRes = await request.get("/api/tasks");
        if (!tasksRes.ok())
          throw new Error(`Failed to get tasks: ${tasksRes.status()}`);
        const tasks = (
          (await tasksRes.json()) as { json: Array<{ status: string }> }
        ).json;
        if (tasks.every((t) => t.status !== "running")) return;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    })(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Timed out waiting for query execution")),
        30_000,
      ),
    ),
  ]);
}

export async function createAndRunQuery(
  { request }: { request: import("@playwright/test").APIRequestContext },
  opts: { title?: string } = {},
) {
  const { id } = await createQuery({ request }, opts);

  const runRes = await request.post(`/api/admin/queries/${id}/run`);
  if (!runRes.ok())
    throw new Error(
      `Failed to run query: ${runRes.status()} ${await runRes.text()}`,
    );

  await waitForQueryCompletion({ request });

  return { queryId: id };
}
