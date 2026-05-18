import RelativeTime from "@@/app/components/RelativeTime.vue";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";

describe("RelativeTime", () => {
  function msAgo(ms: number) {
    return new Date(Date.now() - ms);
  }

  it('shows "about a minute ago" for a time less than one minute ago', async () => {
    const wrapper = await mountSuspended(RelativeTime, {
      props: { date: msAgo(30_000) },
    });
    expect(wrapper.text()).toBe("about a minute ago");
  });

  it('shows "1 minute ago" (singular) for exactly one minute', async () => {
    // 1m 30s → minutes = 1
    const wrapper = await mountSuspended(RelativeTime, {
      props: { date: msAgo(90_000) },
    });
    expect(wrapper.text()).toBe("1 minute ago");
  });

  it('shows "N minutes ago" for times within the hour', async () => {
    // 5m 30s → minutes = 5
    const wrapper = await mountSuspended(RelativeTime, {
      props: { date: msAgo(5 * 60_000 + 30_000) },
    });
    expect(wrapper.text()).toBe("5 minutes ago");
  });

  it('shows "1 hour ago" (singular) for exactly one hour', async () => {
    // 1h 30m → hours = 1
    const wrapper = await mountSuspended(RelativeTime, {
      props: { date: msAgo(90 * 60_000) },
    });
    expect(wrapper.text()).toBe("1 hour ago");
  });

  it('shows "N hours ago" for times within a day', async () => {
    const wrapper = await mountSuspended(RelativeTime, {
      props: { date: msAgo(3 * 3600_000 + 5 * 60_000) },
    });
    expect(wrapper.text()).toBe("3 hours ago");
  });

  it('shows "1 day ago" (singular)', async () => {
    // 1.5 days → days = 1
    const wrapper = await mountSuspended(RelativeTime, {
      props: { date: msAgo(36 * 3600_000) },
    });
    expect(wrapper.text()).toBe("1 day ago");
  });

  it('shows "N days ago" for times within a week', async () => {
    const wrapper = await mountSuspended(RelativeTime, {
      props: { date: msAgo(3 * 86400_000 + 3600_000) },
    });
    expect(wrapper.text()).toBe("3 days ago");
  });

  it('shows "1 week ago" (singular)', async () => {
    // 10 days → weeks = 1
    const wrapper = await mountSuspended(RelativeTime, {
      props: { date: msAgo(10 * 86400_000) },
    });
    expect(wrapper.text()).toBe("1 week ago");
  });

  it('shows "N weeks ago" for times within a month', async () => {
    const wrapper = await mountSuspended(RelativeTime, {
      props: { date: msAgo(14 * 86400_000 + 3600_000) },
    });
    expect(wrapper.text()).toBe("2 weeks ago");
  });

  it('shows "1 month ago" (singular)', async () => {
    // 45 days → months = 1
    const wrapper = await mountSuspended(RelativeTime, {
      props: { date: msAgo(45 * 86400_000) },
    });
    expect(wrapper.text()).toBe("1 month ago");
  });

  it('shows "N months ago" for times within a year', async () => {
    const wrapper = await mountSuspended(RelativeTime, {
      props: { date: msAgo(90 * 86400_000 + 3600_000) },
    });
    expect(wrapper.text()).toBe("3 months ago");
  });

  it('shows "1 year ago" (singular)', async () => {
    // 400 days → years = 1
    const wrapper = await mountSuspended(RelativeTime, {
      props: { date: msAgo(400 * 86400_000) },
    });
    expect(wrapper.text()).toBe("1 year ago");
  });

  it('shows "N years ago" for old dates', async () => {
    const wrapper = await mountSuspended(RelativeTime, {
      props: { date: msAgo(2 * 365 * 86400_000 + 86400_000) },
    });
    expect(wrapper.text()).toBe("2 years ago");
  });
});
