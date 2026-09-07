import assert from "node:assert/strict";
import test from "node:test";
import { AudioManager } from "../src/audioManager.js";

function audioContext() {
  const node = () => ({ connect() {}, disconnect() {} });
  return {
    state: "running", currentTime: 0,
    createGain: () => ({ ...node(), gain: { value: 1 } }),
    createStereoPanner: () => ({ ...node(), pan: { value: 0 } }),
    createBufferSource: () => ({
      ...node(), playbackRate: { value: 1 }, starts: 0, stopped: false,
      start() { this.starts++; }, stop() { this.stopped = true; }
    }),
    decodeAudioData(data, resolve) { resolve({ duration: 2.8 }); },
    async suspend() { this.state = "suspended"; },
    async resume() { this.state = "running"; }
  };
}

function manager() {
  const audio = new AudioManager();
  audio.context = audioContext();
  audio.masterGain = audio.context.createGain();
  return audio;
}

test("concurrent preloads share work and retry only failed assets", async (t) => {
  const audio = manager();
  const calls = [];
  let fail = true;
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async (path) => {
    calls.push(path);
    return { ok: !(fail && path.endsWith("reload.mp3")), arrayBuffer: async () => new ArrayBuffer(1) };
  });
  await Promise.all([audio.ensureBuffers(), audio.ensureBuffers()]);
  assert.equal(new Set(calls).size, calls.length);
  const initialCount = calls.length;
  assert.ok(initialCount > 0);
  assert.equal(audio.buffers.size, initialCount - 1);
  fail = false;
  await audio.ensureBuffers();
  assert.equal(calls.length, initialCount + 1);
  assert.ok(calls.at(-1).endsWith("reload.mp3"));
  await audio.ensureBuffers();
  assert.equal(calls.length, initialCount + 1);
});

test("reload uses requested duration; pause preserves the voice; reset stops it", async () => {
  const audio = manager();
  audio.buffers.set("audio/sfx/reload.mp3", { duration: 2.8 });
  assert.equal(audio.playReload(1.4), true);
  const entry = [...audio.activeSources][0];
  assert.equal(entry.source.buffer.duration / entry.source.playbackRate.value, 1.4);
  audio.context.currentTime = 0.45;
  await audio.pause();
  assert.equal(audio.context.state, "suspended");
  assert.equal(audio.playReload(1.4), false);
  assert.equal(entry.source.stopped, false);
  await audio.resume();
  assert.equal(audio.context.currentTime, 0.45);
  assert.equal(entry.source.starts, 1);
  assert.equal(audio.activeSources.size, 1);
  audio.reset();
  assert.equal(entry.source.stopped, true);
  assert.equal(audio.activeSources.size, 0);
});

test("unlock returns immediately even while downloads and resume remain pending", async () => {
  const audio = manager();
  audio.context.resume = () => new Promise(() => {});
  audio.ensureBuffers = () => new Promise(() => {});
  assert.equal(audio.unlock(), undefined);
  audio.context.resume = async () => { throw new Error("autoplay blocked"); };
  audio.ensureBuffers = async () => { throw new Error("offline"); };
  audio.unlock();
  await new Promise((resolve) => setImmediate(resolve));
});

test("surface impacts use distinct buffers and clamp stereo pan", () => {
  const audio = manager();
  const concrete = { duration: 0.4 }, metal = { duration: 0.3 };
  audio.buffers.set("audio/sfx/impact-concrete.mp3", concrete);
  audio.buffers.set("audio/sfx/impact-metal.mp3", metal);
  audio.playImpact("metal", 2);
  audio.playImpact("concrete", -0.7);
  const [right, left] = [...audio.activeSources];
  assert.equal(right.source.buffer, metal);
  assert.equal(right.panner.pan.value, 1);
  assert.equal(left.source.buffer, concrete);
  assert.equal(left.panner.pan.value, -0.7);
});
