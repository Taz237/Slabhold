import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUploadAborted, uploadPostVideo, UploadAborted, type UploadRequest, type UploadTransport } from "./video-upload";
import { VIDEO_UPLOAD_ERROR } from "./videos";

const ORIGIN = "https://knuwflptobyutrauxblj.supabase.co";
const USER = "11111111-1111-4111-8111-111111111111";
const IDS = ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];

function input(transport: UploadTransport, over: { signal?: AbortSignal; progress?: number[]; removed?: string[][] } = {}) {
  let next = 0;
  return {
    origin: ORIGIN,
    anonKey: "anon",
    accessToken: "token",
    userId: USER,
    file: new Blob([new Uint8Array(900)], { type: "video/quicktime" }),
    mime: "video/quicktime" as const,
    poster: new Blob([new Uint8Array(100)], { type: "image/jpeg" }),
    width: 1080,
    height: 1920,
    duration: 12.345,
    signal: over.signal ?? new AbortController().signal,
    onProgress: (value: number) => over.progress?.push(value),
    remove: async (paths: string[]) => {
      over.removed?.push(paths);
    },
    transport,
    newId: () => IDS[next++]!,
  };
}

describe("video upload", () => {
  it("sends the poster then the video into the user's folder, with real progress", async () => {
    const sent: UploadRequest[] = [];
    const progress: number[] = [];
    const transport: UploadTransport = async (request) => {
      sent.push(request);
      request.onProgress(request.body.size / 2);
      request.onProgress(request.body.size);
      return { status: 200, body: "{}" };
    };
    const video = await uploadPostVideo(input(transport, { progress }));
    assert.deepEqual(
      sent.map((request) => request.url),
      [
        `${ORIGIN}/storage/v1/object/post-videos/${USER}/${IDS[1]}.jpg`,
        `${ORIGIN}/storage/v1/object/post-videos/${USER}/${IDS[0]}.mov`,
      ],
    );
    assert.equal(sent[1]!.headers["content-type"], "video/quicktime");
    assert.equal(sent[1]!.headers["x-upsert"], "false");
    assert.equal(sent[1]!.headers.authorization, "Bearer token");
    assert.deepEqual(progress, [0.05, 0.1, 0.1, 0.55, 1, 1]);
    assert.deepEqual(video, {
      url: `${ORIGIN}/storage/v1/object/public/post-videos/${USER}/${IDS[0]}.mov`,
      poster: `${ORIGIN}/storage/v1/object/public/post-videos/${USER}/${IDS[1]}.jpg`,
      width: 1080,
      height: 1920,
      duration: 12.35,
      mime: "video/quicktime",
    });
  });

  it("a cancel mid-upload stops it and removes the poster already stored", async () => {
    const controller = new AbortController();
    const removed: string[][] = [];
    const transport: UploadTransport = (request) =>
      new Promise((resolve, reject) => {
        if (request.url.endsWith(".jpg")) {
          resolve({ status: 200, body: "{}" });
          return;
        }
        request.onProgress(300);
        request.signal.addEventListener("abort", () => reject(new UploadAborted()));
        controller.abort();
      });
    await assert.rejects(uploadPostVideo(input(transport, { signal: controller.signal, removed })), (error) =>
      isUploadAborted(error),
    );
    assert.deepEqual(removed, [[`${USER}/${IDS[1]}.jpg`]]);
  });

  it("a refused upload says so plainly and leaves nothing behind", async () => {
    const removed: string[][] = [];
    const transport: UploadTransport = async (request) =>
      request.url.endsWith(".jpg") ? { status: 200, body: "{}" } : { status: 500, body: "oops" };
    await assert.rejects(uploadPostVideo(input(transport, { removed })), { message: VIDEO_UPLOAD_ERROR });
    assert.deepEqual(removed, [[`${USER}/${IDS[1]}.jpg`]]);
  });

  it("a file over the bucket limit gets the size message", async () => {
    const transport: UploadTransport = async () => ({ status: 413, body: "Payload too large" });
    await assert.rejects(uploadPostVideo(input(transport)), /too large/);
  });
});
