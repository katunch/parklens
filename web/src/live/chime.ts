/**
 * Alarm chime (UX §4.3): Web Audio, no asset. Two sine tones, 880 Hz then 660 Hz, 160 ms each
 * with a 60 ms gap, gain 0.15, 10 ms attack and release. At most one chime per 3 s.
 */

let ctx: AudioContext | null = null;
let lastPlayed = 0;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

function tone(ac: AudioContext, freq: number, start: number, duration = 0.16, gain = 0.15) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.01);
  g.gain.setValueAtTime(gain, start + duration - 0.01);
  g.gain.linearRampToValueAtTime(0, start + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Play the chime. `force` bypasses the 3 s throttle (used when switching sound on). */
export function playChime(force = false): void {
  const now = Date.now();
  if (!force && now - lastPlayed < 3000) return;
  lastPlayed = now;
  const ac = audioContext();
  if (!ac) return;
  const play = () => {
    const t0 = ac.currentTime + 0.02;
    tone(ac, 880, t0);
    tone(ac, 660, t0 + 0.16 + 0.06);
  };
  if (ac.state === 'suspended') {
    ac.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}
