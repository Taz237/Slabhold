import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLIP, clipFileName, clipType } from "./clip";
import { MAX_TRIANGLES, boltMesh, pixelMesh, shardMesh } from "./engine";

describe("hit effect geometry", () => {
  it("stays under the triangle cap at every strength, so an iPhone 12 holds 60 fps", () => {
    for (const strength of [1, 2, 3] as const) {
      assert.ok(shardMesh(strength).triangles <= MAX_TRIANGLES);
      assert.ok(pixelMesh(strength).triangles <= MAX_TRIANGLES);
      assert.ok(boltMesh(390, { x: 99, y: 100, w: 192, h: 269 }, strength).triangles <= 200);
    }
  });

  it("a bigger hit gets more shards and more pixels", () => {
    assert.ok(shardMesh(3).triangles > shardMesh(1).triangles);
    assert.ok(pixelMesh(3).triangles > pixelMesh(1).triangles);
  });

  it("is the same every time, so the replay and the clip match the reveal", () => {
    assert.deepEqual(shardMesh(3).data, shardMesh(3).data);
    assert.deepEqual(boltMesh(390, { x: 99, y: 100, w: 192, h: 269 }, 2).data, boltMesh(390, { x: 99, y: 100, w: 192, h: 269 }, 2).data);
  });

  it("the pixels are square on a 5:7 card and cover all of it", () => {
    const mesh = pixelMesh(2);
    assert.ok(Math.abs(mesh.rows / mesh.cols - 1.4) < 0.05);
    assert.equal(mesh.data.length, mesh.cols * mesh.rows * 6 * 11);
  });

  it("the crystal pane only overhangs the card a little", () => {
    const { data } = shardMesh(3);
    for (let index = 0; index < data.length; index += 11) {
      assert.ok(data[index] >= -0.04 && data[index] <= 1.04);
      assert.ok(data[index + 1] >= -0.04 && data[index + 1] <= 1.04);
    }
  });
});

describe("share clip", () => {
  it("is 4 seconds, vertical 9:16", () => {
    assert.equal(CLIP.ms, 4000);
    assert.equal(CLIP.width / CLIP.height, 9 / 16);
  });

  it("records mp4 when the phone can, webm otherwise, nothing when it can't record", () => {
    assert.equal(clipType(() => true), "video/mp4;codecs=avc1.42E01E");
    assert.equal(clipType((type) => type.startsWith("video/webm")), "video/webm;codecs=vp9");
    assert.equal(clipType(() => false), null);
    assert.equal(clipFileName("video/mp4;codecs=avc1.42E01E"), "slabhold-hit.mp4");
    assert.equal(clipFileName("video/webm"), "slabhold-hit.webm");
  });
});
