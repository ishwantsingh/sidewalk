import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Lovable } from "../lib/lovable";

const ref = "a".repeat(40);
const initial = {
  message_id: "message-1",
  agent_response: { status: "in_progress" },
};
const ready = {
  status: "completed",
  preview_url: "https://preview.example.com",
  latest_commit_sha: ref,
  project: { agentFinished: true, status: "ready" },
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Lovable build completion", () => {
  it("waits for the nested agent response instead of scaffold or user-message status", async () => {
    const lovable = new Lovable();
    const call = vi
      .spyOn(lovable, "call")
      .mockResolvedValueOnce({ status: "running" })
      .mockResolvedValueOnce({
        status: "running",
        response: { status: "completed", commit_sha: ref },
      })
      .mockResolvedValueOnce(ready);
    const waiting = lovable.waitForBuild("project-1", {
      ...initial,
      status: "completed",
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(waiting).resolves.toEqual({ url: ready.preview_url, ref });
    expect(call.mock.calls.map(([name]) => name)).toEqual([
      "get_message",
      "get_message",
      "get_project",
    ]);
    expect(call.mock.calls[0][1]).toMatchObject({
      project_id: "project-1",
      message_id: "message-1",
    });
  });
  it("waits for project readiness and the matching committed revision", async () => {
    const lovable = new Lovable();
    vi.spyOn(lovable, "call")
      .mockResolvedValueOnce({
        response: { status: "completed", commit_sha: ref },
      })
      .mockResolvedValueOnce({
        ...ready,
        latest_commit_sha: "b".repeat(40),
        project: { agentFinished: false },
      })
      .mockResolvedValueOnce({
        response: { status: "completed", commit_sha: ref },
      })
      .mockResolvedValueOnce(ready);
    const waiting = lovable.waitForBuild("project-1", initial);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(waiting).resolves.toEqual({ url: ready.preview_url, ref });
  });
  it.each(["awaiting_input", "stopped", "failed", "error"])(
    "stops on %s without replaying a build",
    async (status) => {
      const lovable = new Lovable();
      const call = vi
        .spyOn(lovable, "call")
        .mockResolvedValue({ response: { status } });
      await expect(lovable.waitForBuild("project-1", initial)).rejects.toThrow(
        /paused|did not complete/,
      );
      expect(call.mock.calls.map(([name]) => name)).toEqual(["get_message"]);
    },
  );
  it("stops for a queued human approval even when no terminal response exists", async () => {
    const lovable = new Lovable();
    vi.spyOn(lovable, "call").mockResolvedValue({
      status: "queued",
      queue_paused: true,
      queue_pause_reason: "hitl_tool",
    });
    await expect(lovable.waitForBuild("project-1", initial)).rejects.toThrow(
      "paused for input",
    );
  });
  it("times out a nonterminal message without issuing another paid command", async () => {
    const lovable = new Lovable();
    const call = vi
      .spyOn(lovable, "call")
      .mockResolvedValue({ status: "running" });
    const waiting = expect(
      lovable.waitForBuild("project-1", initial),
    ).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await waiting;
    expect(call.mock.calls.every(([name]) => name === "get_message")).toBe(
      true,
    );
  });
  it("rejects a build with no polling identity", async () => {
    const lovable = new Lovable();
    const call = vi.spyOn(lovable, "call");
    await expect(
      lovable.waitForBuild("project-1", { status: "in_progress" }),
    ).rejects.toThrow("no message ID");
    expect(call).not.toHaveBeenCalled();
  });
  it("accepts a synchronous completed response only after checking the project", async () => {
    const lovable = new Lovable();
    const call = vi.spyOn(lovable, "call").mockResolvedValue(ready);
    await expect(
      lovable.waitForBuild("project-1", {
        status: "completed",
        commit_sha: ref,
      }),
    ).resolves.toEqual({ url: ready.preview_url, ref });
    expect(call).toHaveBeenCalledExactlyOnceWith("get_project", {
      project_id: "project-1",
    });
  });
});
