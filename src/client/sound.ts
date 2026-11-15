// Small synthesised sounds. Silent until the first tap, mutable, and suspended while the page is hidden.
// Placeholders: the final sounds are recorded or picked by a human (docs/04-GAME-SPEC.md A10).

let audio: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean): void {
  muted = value;
  if (!audio) return;
  if (muted) void audio.suspend();
  else void audio.resume();
}

export function isMuted(): boolean {
  return muted;
}

/** Call from a user gesture: browsers only allow audio after one. */
export function unlockAudio(): void {
  if (!audio) {
    try {
      audio = new AudioContext();
    } catch {
      audio = null;
    }
  }
  if (audio && audio.state === 'suspended' && !muted) void audio.resume();
}

document.addEventListener('visibilitychange', () => {
  if (!audio) return;
  if (document.hidden) void audio.suspend();
  else if (!muted) void audio.resume();
});

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.12,
  delay = 0
): void {
  if (!audio || muted) return;
  const t = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(audio.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

export const sound = {
  drop(): void {
    tone(196, 0.09, 'triangle', 0.22);
    tone(392, 0.05, 'sine', 0.05);
  },
  lift(): void {
    tone(560, 0.07, 'sine', 0.06);
  },
  purr(): void {
    tone(98, 0.22, 'triangle', 0.08);
    tone(104, 0.22, 'triangle', 0.05, 0.05);
  },
  chime(): void {
    tone(659, 0.7, 'sine', 0.11);
    tone(988, 0.8, 'sine', 0.07, 0.12);
    tone(1319, 0.9, 'sine', 0.045, 0.24);
  },
};
