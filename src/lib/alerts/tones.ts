"use client";

/**
 * Sons curtos gerados no browser (sem ficheiros). Só tocam depois de um gesto
 * do utilizador ter desbloqueado o áudio (exigência dos browsers).
 */
let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {}
}

function play(tones: { freq: number; at: number; dur: number }[], volume = 0.2, type: OscillatorType = "square") {
  if (!ctx || ctx.state !== "running") return;
  for (const { freq, at, dur } of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + at;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }
}

/** "Pode falar": dois bips a subir. */
export const talkPermitTone = () => play([{ freq: 1200, at: 0, dur: 0.07 }, { freq: 1600, at: 0.09, dur: 0.07 }]);
/** Fim de transmissão ("roger beep"). */
export const rogerTone = () => play([{ freq: 1600, at: 0, dur: 0.06 }, { freq: 1100, at: 0.08, dur: 0.1 }], 0.15);
/** Canal ocupado / negado. */
export const busyTone = () => play([{ freq: 330, at: 0, dur: 0.18 }, { freq: 330, at: 0.24, dur: 0.18 }], 0.2, "sawtooth");
/** Alguém começou a falar. */
export const incomingTone = () => play([{ freq: 900, at: 0, dur: 0.05 }], 0.12, "sine");
