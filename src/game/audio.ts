/** A bounded sound pool; playback failures (including autoplay policy) never affect combat. */
export class BattleAudio {
  private voices: HTMLAudioElement[] = [];
  private lastPlayed = new Map<string, number>();
  enabled = true;

  play(name: 'cannon_fire_1' | 'ship_explosion_1' | 'ship_wood_hit_1', time: number) {
    if (!this.enabled || time - (this.lastPlayed.get(name) ?? -1) < 0.12) return;
    this.lastPlayed.set(name, time);
    this.voices = this.voices.filter((voice) => !voice.ended);
    if (this.voices.length >= 8) return;
    const voice = new Audio(`/assets/sounds/${name}.wav`);
    voice.volume = name === 'cannon_fire_1' ? 0.15 : 0.2;
    this.voices.push(voice);
    void voice.play().catch(() => { this.voices = this.voices.filter((item) => item !== voice); });
  }

  stop() {
    for (const voice of this.voices) { voice.pause(); voice.removeAttribute('src'); voice.load(); }
    this.voices = [];
  }
}
