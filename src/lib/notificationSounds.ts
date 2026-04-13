// Sound generation using Web Audio API
type SoundType = 'chime' | 'bell' | 'alert' | 'cash';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error('Web Audio API is not supported in this browser');
    audioContext = new AudioContextCtor();
  }
  return audioContext;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.3) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  osc.frequency.value = freq;
  osc.type = type;
  gainNode.gain.setValueAtTime(gain, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
  
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export function playChime() {
  const ctx = getAudioContext();
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.3, 'sine', 0.2), i * 100);
  });
}

export function playBell() {
  playTone(830.61, 0.8, 'sine', 0.3);
  setTimeout(() => playTone(622.25, 0.6, 'sine', 0.2), 50);
}

export function playAlert() {
  playTone(880, 0.15, 'square', 0.2);
  setTimeout(() => playTone(880, 0.15, 'square', 0.2), 200);
  setTimeout(() => playTone(880, 0.15, 'square', 0.2), 400);
}

export function playCash() {
  const ctx = getAudioContext();
  [1318.51, 1567.98, 2093.00].forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.2, 'triangle', 0.25), i * 80);
  });
}

export function playSound(type: SoundType) {
  try {
    switch (type) {
      case 'chime': playChime(); break;
      case 'bell': playBell(); break;
      case 'alert': playAlert(); break;
      case 'cash': playCash(); break;
    }
  } catch (e) {
    console.warn('Audio playback failed:', e);
  }
}

export function testSound(type: SoundType) {
  playSound(type);
}
