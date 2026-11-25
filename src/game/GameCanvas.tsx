import { useEffect, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import type { GameSimulation, GameState } from './simulation';
import { attachInput } from './input';
import { BattleRenderer, loadTextures } from './rendering';

export interface FrameMetrics {
  frames: number; fps: number; p95FrameMs: number; maxEntities: number;
  activeCanvases: number; activeInputBindings: number; resolution: number;
}

declare global {
  interface Window {
    __pirateTest?: {
      snapshot: () => GameState;
      advance: (seconds: number) => void;
      setManualClock: (manual: boolean) => void;
      metrics: () => FrameMetrics;
    };
  }
}

let activeCanvases = 0;
let activeInputBindings = 0;

interface Props {
  simulation: GameSimulation;
  onReady?: () => void;
  onError?: (error: Error) => void;
  sound?: boolean;
}

export function GameCanvas({ simulation, onReady, onError, sound = true }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onError });
  const rendererRef = useRef<BattleRenderer | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { callbacks.current = { onReady, onError }; }, [onReady, onError]);
  useEffect(() => { rendererRef.current?.setSound(sound); }, [sound, loadState]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let initialized = false;
    let application: Application | undefined;
    let scene: BattleRenderer | undefined;
    let detachInput: (() => void) | undefined;
    let testApi: Window['__pirateTest'];
    const testMode = new URLSearchParams(window.location.search).get('test') === '1';
    let manualClock = testMode;
    const frameTimes: number[] = [];
    let maxEntities = 0;
    let elapsed = 0;
    let frames = 0;
    const resolution = Math.min(window.devicePixelRatio || 1, 2);

    const dispose = () => {
      if (detachInput) { detachInput(); detachInput = undefined; activeInputBindings--; }
      if (testApi && window.__pirateTest === testApi) delete window.__pirateTest;
      if (scene) { scene.destroy(); scene = undefined; rendererRef.current = null; }
      if (application && initialized) {
        application.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
        application = undefined; initialized = false; activeCanvases--;
      }
    };

    void (async () => {
      try {
        const textures = await loadTextures();
        if (disposed) return;
        application = new Application();
        await application.init({
          width: simulation.config.arena.width, height: simulation.config.arena.height,
          resolution, autoDensity: true, antialias: true, background: 0x168da8,
          preference: 'webgl', autoStart: false, sharedTicker: false,
        });
        initialized = true; activeCanvases++;
        if (disposed) { dispose(); return; }
        const canvas = application.canvas;
        canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';
        canvas.setAttribute('aria-label', 'Naval battle arena. Health, score, and time are available in the HUD.');
        canvas.setAttribute('role', 'img');
        element.appendChild(canvas);
        scene = new BattleRenderer(application, simulation, textures);
        rendererRef.current = scene;
        simulation.clearInput();
        detachInput = attachInput(simulation); activeInputBindings++;
        // Focus can be lost while assets are still loading, before listeners exist.
        if (document.hidden || !document.hasFocus()) simulation.pause();
        const draw = () => { scene?.render(); application?.render(); };
        testApi = {
          snapshot: () => simulation.snapshot(),
          advance: (seconds: number) => {
            if (!Number.isFinite(seconds) || seconds < 0 || seconds > 180) throw new Error('Test clock advance must be between 0 and 180 seconds.');
            const steps = Math.round(seconds / simulation.config.physics.timestep);
            for (let step = 0; step < steps; step++) simulation.step();
            draw();
          },
          setManualClock: (manual: boolean) => {
            manualClock = manual;
            if (manual) application?.stop(); else application?.start();
          },
          metrics: () => {
            const sorted = [...frameTimes].sort((a, b) => a - b);
            return { frames, fps: elapsed ? frames * 1000 / elapsed : 0, p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0, maxEntities, activeCanvases, activeInputBindings, resolution };
          },
        };
        if (testMode) window.__pirateTest = testApi;
        application.ticker.add((ticker) => {
          if (!manualClock) simulation.advance(ticker.deltaMS / 1000);
          if (simulation.state.status === 'running') {
            frames++; elapsed += ticker.elapsedMS;
            if (frameTimes.length < 15000) frameTimes.push(ticker.elapsedMS);
            maxEntities = Math.max(maxEntities, 1 + simulation.state.enemies.length + simulation.state.projectiles.length + simulation.state.effects.length);
          }
          scene?.render();
        });
        draw();
        // A controlled clock renders explicitly after advancing; idle frames must not
        // consume GPU time or contaminate real-time profiling samples.
        if (!manualClock) application.start();
        setLoadState('ready'); callbacks.current.onReady?.();
      } catch (cause: unknown) {
        // Failed async initialization may not have reached Application's normal destroy contract.
        if (application && !initialized) {
          application.ticker?.destroy();
          application.stage.destroy({ children: true });
          application.renderer?.destroy({ removeView: true });
          application = undefined;
        }
        dispose();
        if (disposed) return;
        setLoadState('error');
        callbacks.current.onError?.(cause instanceof Error ? cause : new Error('Failed to load the battle arena.'));
      }
    })();
    return () => { disposed = true; dispose(); };
  }, [simulation, attempt]);

  return <div className="arena-shell" style={{ position: 'relative', aspectRatio: `${simulation.config.arena.width}/${simulation.config.arena.height}`, width: '100%', overflow: 'hidden' }}>
    <div ref={host} data-testid="arena" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    {loadState === 'loading' && <div className="arena-status" role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', background: '#103d49' }}>Preparing the fleet…</div>}
    {loadState === 'error' && <div className="arena-status" role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', background: '#103d49', textAlign: 'center', padding: 24 }}>
      <p>The arena could not load. Check your connection and try again.</p>
      <button type="button" onClick={() => { setLoadState('loading'); setAttempt((value) => value + 1); }}>Retry assets</button>
    </div>}
  </div>;
}
