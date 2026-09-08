import { assetPath } from "./assetPath.js";
import { randomBetween } from "./random.js";

const SOUND_BANK = {
  footstep: {
    paths: [
      "audio/sfx/footstep-01.mp3",
      "audio/sfx/footstep-02.mp3",
      "audio/sfx/footstep-03.mp3",
      "audio/sfx/footstep-04.mp3",
      "audio/sfx/footstep-05.mp3"
    ],
    volume: 0.42,
    playbackRateRange: [0.94, 1.04]
  },
  landing: {
    paths: ["audio/sfx/landing.mp3"],
    volume: 0.3,
    playbackRateRange: [0.98, 1.02]
  },
  shot: {
    paths: ["audio/sfx/shot-01.mp3", "audio/sfx/shot-02.mp3"],
    volume: 0.48,
    playbackRateRange: [0.97, 1.01]
  },
  reload: {
    paths: ["audio/sfx/reload.mp3"],
    volume: 0.35,
    playbackRateRange: [0.99, 1.01]
  },
  concrete: {
    paths: ["audio/sfx/impact-concrete.mp3"],
    volume: 0.24,
    playbackRateRange: [0.95, 1.05]
  },
  metal: {
    paths: ["audio/sfx/impact-metal.mp3"],
    volume: 0.24,
    playbackRateRange: [0.95, 1.05]
  },
  hit: {
    paths: [
      "audio/sfx/hit-01.mp3",
      "audio/sfx/hit-02.mp3",
      "audio/sfx/hit-03.mp3"
    ],
    volume: 0.36,
    playbackRateRange: [0.96, 1.04]
  }
};

export class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.buffers = new Map();
    this.loadingPromise = null;
    this.activeSources = new Set();
    this.lastPlayedIndex = new Map();
    this.stepTimer = 0;
    this.paused = false;
  }

  unlock() {
    // Audio is optional: neither autoplay rejection nor downloads gate gameplay.
    this.resume();
    void this.ensureBuffers().catch(() => {});
  }

  pause() {
    this.paused = true;
    // Suspending the audio clock preserves every voice, including reload position.
    return this.context?.suspend().catch(() => {});
  }

  resume() {
    this.paused = false;
    const context = this.getContext();
    return context?.resume().catch(() => {});
  }

  reset() {
    this.stepTimer = 0;
    this.stopAll();
  }

  updateMovement(deltaSeconds, movementAmount, isOnGround) {
    if (!this.getRunningContext() || !isOnGround || movementAmount < 0.24) {
      this.stepTimer = 0;
      return;
    }

    this.stepTimer -= deltaSeconds;

    if (this.stepTimer > 0) {
      return;
    }

    this.stepTimer = Math.max(0.2, 0.46 - movementAmount * 0.17);
    this.play("footstep", {
      volumeMultiplier: 0.9 + movementAmount * 0.12
    });
  }

  playLanding() {
    this.play("landing");
  }

  playShot() {
    this.play("shot");
  }

  playReload(duration = 1.4) {
    return this.play("reload", { duration });
  }

  playHit() {
    this.play("hit");
  }

  playImpact(surface, pan = 0) {
    return this.play(surface === "metal" ? "metal" : "concrete", { pan });
  }

  play(key, { volumeMultiplier = 1, duration, pan = 0 } = {}) {
    const context = this.getRunningContext();
    const config = SOUND_BANK[key];

    if (!context || !config) {
      return false;
    }

    const selection = this.pickBuffer(key, config.paths);

    if (!selection) {
      return false;
    }

    const source = context.createBufferSource();
    source.buffer = selection.buffer;
    source.playbackRate.value = Number.isFinite(duration) && duration > 0
      ? selection.buffer.duration / duration
      : randomBetween(
          config.playbackRateRange[0],
          config.playbackRateRange[1]
        );

    const gain = context.createGain();
    gain.gain.value =
      config.volume * volumeMultiplier * randomBetween(0.97, 1.03);

    source.connect(gain);
    const panner = context.createStereoPanner();
    panner.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
    gain.connect(panner);
    panner.connect(this.masterGain);

    const activeEntry = { source, gain, panner };
    this.activeSources.add(activeEntry);

    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
      this.activeSources.delete(activeEntry);
    };

    source.start();
    return true;
  }

  stopAll() {
    this.activeSources.forEach(({ source, gain, panner }) => {
      try {
        source.stop();
      } catch {
        // Ignore sources that already ended.
      }

      source.disconnect();
      gain.disconnect();
      panner.disconnect();
    });

    this.activeSources.clear();
  }

  pickBuffer(key, paths) {
    const available = paths
      .map((path, index) => ({
        index,
        buffer: this.buffers.get(path)
      }))
      .filter((entry) => Boolean(entry.buffer));

    if (available.length === 0) {
      return null;
    }

    const previousIndex = this.lastPlayedIndex.get(key);
    let pool = available;

    if (available.length > 1 && previousIndex !== undefined) {
      pool = available.filter((entry) => entry.index !== previousIndex);
    }

    const selected = pool[Math.floor(Math.random() * pool.length)];
    this.lastPlayedIndex.set(key, selected.index);
    return selected;
  }

  async ensureBuffers() {
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    const context = this.getContext();

    if (!context) {
      return;
    }

    const uniquePaths = [...new Set(Object.values(SOUND_BANK).flatMap(({ paths }) => paths))]
      .filter((path) => !this.buffers.has(path));

    this.loadingPromise = Promise.allSettled(
      uniquePaths.map(async (path) => {
        const response = await fetch(assetPath(path));

        if (!response.ok) {
          throw new Error(`Failed to fetch ${path}`);
        }

        const audioData = await response.arrayBuffer();
        const buffer = await this.decodeAudioData(context, audioData);
        this.buffers.set(path, buffer);
      })
    ).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn(`Unable to load audio asset: ${uniquePaths[index]}`, result.reason);
        }
      });
    }).finally(() => {
      this.loadingPromise = null;
    });

    return this.loadingPromise;
  }

  decodeAudioData(context, audioData) {
    return new Promise((resolve, reject) => {
      context.decodeAudioData(audioData.slice(0), resolve, reject);
    });
  }

  getRunningContext() {
    const context = this.getContext();

    if (this.paused || !context || context.state !== "running") {
      return null;
    }

    return context;
  }

  getContext() {
    if (this.context) {
      return this.context;
    }

    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    try {
      this.context = new AudioContextClass();
    } catch {
      return null;
    }
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.65;
    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 6;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;
    this.masterGain.connect(compressor);
    compressor.connect(this.context.destination);

    return this.context;
  }
}
