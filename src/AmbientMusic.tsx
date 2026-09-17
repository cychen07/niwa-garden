import { Music2, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const MUSIC_KEY = "niwa-music-enabled";

interface Track {
  name: string;
  tempo: number;
  root: number;
  duration: number;
  melody: (number | null)[];
  breath: (number | null)[];
}

export const ambientTracks: Track[] = [
  {
    name: "溪桥初晴",
    tempo: 62,
    root: 220,
    duration: 72,
    melody: [0, null, 2, 4, null, 2, 1, null, 0, null, 4, 5, 4, null, 2, null],
    breath: [null, 4, null, null, 5, null, null, 2],
  },
  {
    name: "竹影午后",
    tempo: 56,
    root: 196,
    duration: 78,
    melody: [0, 2, null, 4, 5, null, 4, 2, null, 1, 2, null, 5, 4, null, 0],
    breath: [2, null, null, 5, null, 4, null, null],
  },
  {
    name: "石庭暮色",
    tempo: 50,
    root: 174.61,
    duration: 84,
    melody: [0, null, null, 4, 2, null, 1, null, 0, null, 5, null, 4, 2, null, null],
    breath: [null, 2, null, null, 4, null, 1, null],
  },
  {
    name: "月下水声",
    tempo: 46,
    root: 164.81,
    duration: 90,
    melody: [0, null, 4, null, 5, 4, null, 2, null, 0, null, 2, 1, null, 0, null],
    breath: [5, null, null, 4, null, 2, null, null],
  },
];

const pentatonic = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];

class GardenMusic {
  context: AudioContext;
  master: GainNode;
  timer = 0;
  trackIndex = 0;
  trackStarted = 0;
  nextStepAt = 0;
  step = 0;
  water: AudioBufferSourceNode | null = null;
  onTrack: (index: number) => void;

  constructor(onTrack: (index: number) => void) {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);
    this.onTrack = onTrack;
  }

  async start(index = this.trackIndex) {
    await this.context.resume();
    if (!this.water) this.startWater();
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(0.16, this.context.currentTime, 0.5);
    if (!this.timer) {
      this.select(index);
      this.timer = window.setInterval(() => this.schedule(), 90);
    }
  }

  mute() {
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.12);
  }

  select(index: number) {
    this.trackIndex = (index + ambientTracks.length) % ambientTracks.length;
    this.trackStarted = this.context.currentTime;
    this.nextStepAt = this.context.currentTime + 0.08;
    this.step = 0;
    this.onTrack(this.trackIndex);
  }

  next() {
    this.select(this.trackIndex + 1);
  }

  schedule() {
    if (this.context.state !== "running") return;
    const track = ambientTracks[this.trackIndex];
    if (this.context.currentTime - this.trackStarted >= track.duration) {
      this.select(this.trackIndex + 1);
      return;
    }
    const stepLength = 60 / track.tempo / 2;
    while (this.nextStepAt < this.context.currentTime + 0.45) {
      const note = track.melody[this.step % track.melody.length];
      if (note !== null) this.pluck(track.root * pentatonic[note], this.nextStepAt, this.step % 4 === 0 ? 0.9 : 0.62);
      if (this.step % 4 === 0) {
        const breath = track.breath[Math.floor(this.step / 4) % track.breath.length];
        if (breath !== null) this.flute(track.root * pentatonic[breath] / 2, this.nextStepAt + 0.18);
      }
      if (this.step % 16 === 12) this.bell(track.root * 2, this.nextStepAt + 0.1);
      this.step += 1;
      this.nextStepAt += stepLength;
    }
  }

  pluck(frequency: number, at: number, strength: number) {
    const oscillator = this.context.createOscillator();
    const overtone = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = "triangle";
    overtone.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, at);
    overtone.frequency.setValueAtTime(frequency * 2.01, at);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, at);
    filter.frequency.exponentialRampToValueAtTime(520, at + 1.3);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.09 * strength, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.45);
    oscillator.connect(filter);
    overtone.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscillator.start(at);
    overtone.start(at);
    oscillator.stop(at + 1.5);
    overtone.stop(at + 1.5);
  }

  flute(frequency: number, at: number) {
    const oscillator = this.context.createOscillator();
    const vibrato = this.context.createOscillator();
    const vibratoDepth = this.context.createGain();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, at);
    vibrato.frequency.value = 4.6;
    vibratoDepth.gain.value = 2.2;
    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(oscillator.frequency);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.028, at + 0.28);
    gain.gain.setValueAtTime(0.026, at + 1.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.1);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(at);
    vibrato.start(at);
    oscillator.stop(at + 2.15);
    vibrato.stop(at + 2.15);
  }

  bell(frequency: number, at: number) {
    [1, 2.04, 3.08].forEach((multiple, index) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency * multiple, at);
      gain.gain.setValueAtTime(0.026 / (index + 1), at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.8 - index * 0.45);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(at);
      oscillator.stop(at + 2.9);
    });
  }

  startWater() {
    const frameCount = this.context.sampleRate * 4;
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < frameCount; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.985 + white * 0.015;
      channel[index] = previous * 2.2;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const lfo = this.context.createOscillator();
    const lfoGain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = 720;
    filter.Q.value = 0.65;
    gain.gain.value = 0.075;
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    lfo.start();
    this.water = source;
  }

  dispose() {
    if (this.timer) window.clearInterval(this.timer);
    this.water?.stop();
    void this.context.close();
  }
}

export function AmbientMusic() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(MUSIC_KEY) !== "off");
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const engine = useRef<GardenMusic | null>(null);

  const play = useCallback(async () => {
    if (!engine.current) engine.current = new GardenMusic(setTrackIndex);
    try {
      await engine.current.start();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void play();
    const unlock = () => { void play(); };
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, [enabled, play]);

  useEffect(() => () => {
    const current = engine.current;
    current?.dispose();
    if (engine.current === current) engine.current = null;
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(MUSIC_KEY, next ? "on" : "off");
    if (next) void play();
    else {
      engine.current?.mute();
      setPlaying(false);
    }
  };

  const next = () => {
    if (!enabled) {
      setEnabled(true);
      localStorage.setItem(MUSIC_KEY, "on");
      void play();
      return;
    }
    engine.current?.next();
  };

  return (
    <aside
      className="music-control"
      data-track={trackIndex}
      data-playing={playing}
      aria-label="庭院音乐"
    >
      <span className="music-track" aria-live="polite">
        <small>庭音</small>
        <strong>{ambientTracks[trackIndex].name}</strong>
      </span>
      <button
        type="button"
        aria-label={enabled ? "关闭庭院音乐" : "播放庭院音乐"}
        title={enabled ? "关闭庭院音乐" : "播放庭院音乐"}
        onClick={toggle}
      >
        {enabled ? <Volume2 /> : <VolumeX />}
      </button>
      <button type="button" aria-label="下一首庭院音乐" title="下一首" onClick={next}>
        <SkipForward />
      </button>
      <Music2 className="music-mark" aria-hidden="true" />
    </aside>
  );
}
