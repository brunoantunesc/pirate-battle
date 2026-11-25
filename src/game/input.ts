import type { GameSimulation } from './simulation';

const keyActions = {
  KeyW: 'forward', ArrowUp: 'forward', KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right', Space: 'front', KeyQ: 'port', KeyE: 'starboard',
} as const;

export function attachInput(simulation: GameSimulation): () => void {
  const held = new Set<string>();
  const clear = () => {
    held.clear();
    for (const action of Object.values(keyActions)) simulation.input[action] = false;
  };
  const pause = () => { clear(); simulation.pause(); };
  const onVisibility = () => { if (document.hidden) pause(); };
  const onKey = (event: KeyboardEvent) => {
    if (event.code === 'Escape' && event.type === 'keydown') {
      if (simulation.state.status === 'running') { event.preventDefault(); pause(); }
      return;
    }
    if (!(event.code in keyActions)) return;
    if (simulation.state.status !== 'running') { clear(); return; }
    const target = event.target;
    if (event.type === 'keydown' && target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
    if (event.type === 'keydown' && event.code === 'Space' && target instanceof HTMLElement && target.closest('button, a, [role="button"]')) return;
    event.preventDefault();
    // A UI pause clears normalized input; discard the corresponding keyboard holds as well.
    for (const code of held) {
      if (!simulation.input[keyActions[code as keyof typeof keyActions]]) held.delete(code);
    }
    if (event.type === 'keydown' && event.repeat) return;
    if (event.type === 'keydown') held.add(event.code); else held.delete(event.code);
    const action = keyActions[event.code as keyof typeof keyActions];
    simulation.input[action] = Object.entries(keyActions).some(([code, mapped]) => mapped === action && held.has(code));
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    clear();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    window.removeEventListener('blur', pause);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
