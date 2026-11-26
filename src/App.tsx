import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameSimulation } from "./game/simulation";
import { GameCanvas } from "./game/GameCanvas";
import type { GameConfig } from "./game/config";
import { loadConfig, OPTIONS_KEY, validOptions } from "./options";
import { Records } from "./features/Records";
import { NetworkPanel } from "./features/NetworkPanel";
import {
  enqueueMatch,
  useRegisterMatch,
  useRegistrationStatus,
  getLastMatch,
} from "./api/client";
import { PLAYER_ID, type MatchRecord } from "./api/contracts";

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
        );
        if (!controls?.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}

function Options({
  config,
  onSave,
  onClose,
}: {
  config: GameConfig;
  onSave: (config: GameConfig) => void;
  onClose: () => void;
}) {
  const [duration, setDuration] = useState(String(config.duration));
  const [spawn, setSpawn] = useState(String(config.spawnInterval));
  const [error, setError] = useState("");
  const durationInvalid =
    Boolean(error) && !validOptions(Number(duration), config.spawnInterval);
  const spawnInvalid =
    Boolean(error) && !validOptions(config.duration, Number(spawn));
  return (
    <Dialog title="Captain’s orders" onClose={onClose}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!validOptions(Number(duration), Number(spawn))) {
            setError(
              "Session time must be 60–180 seconds. Spawn time must be 1–15 seconds.",
            );
            return;
          }
          try {
            const next = {
              ...config,
              duration: Number(duration),
              spawnInterval: Number(spawn),
            };
            localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
            onSave(next);
          } catch {
            setError(
              "Your browser could not save these options. Please allow local storage.",
            );
          }
        }}
      >
        <p>Set the pace of your next expedition.</p>
        <label>
          Game session time <span>60–180 seconds</span>
          <input
            type="number"
            min="60"
            max="180"
            required
            aria-invalid={durationInvalid}
            aria-describedby={error ? "options-error" : undefined}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          />
        </label>
        <label>
          Enemy spawn time <span>1–15 seconds</span>
          <input
            type="number"
            min="1"
            max="15"
            step="0.5"
            required
            aria-invalid={spawnInvalid}
            aria-describedby={error ? "options-error" : undefined}
            value={spawn}
            onChange={(event) => setSpawn(event.target.value)}
          />
        </label>
        {error && (
          <p id="options-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="primary" type="submit">
            Save Options
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function Results({
  result,
  onPlay,
  onMenu,
}: {
  result: MatchRecord;
  onPlay: () => void;
  onMenu: () => void;
}) {
  const status = useRegistrationStatus(result.id);
  const registration = useRegisterMatch();
  return (
    <section className="result panel" aria-labelledby="result-title">
      <p className="eyebrow">Expedition complete</p>
      <h1 id="result-title">
        {result.reason === "time"
          ? "The seas are yours."
          : "A captain never quits."}
      </h1>
      <img
        className="result-ship"
        src="/assets/png/default/ships/ship_1.png"
        alt=""
      />
      <p className="score-total">
        {result.score}
        <span>ships defeated</span>
      </p>
      <p>
        {result.reason === "time" ? "Time completed" : "Ship sunk"} ·{" "}
        {result.duration.toFixed(1)} seconds at sea
      </p>
      <p role="status">
        {status === "confirmed"
          ? "Match registered"
          : registration.isPending
            ? "Registering match…"
            : status === "pending"
              ? "Registration pending — your result is saved on this device."
              : "Your result is only available in this session. Local storage could not save it. Retry before leaving or refreshing."}
      </p>
      {status !== "confirmed" && (
        <button
          disabled={registration.isPending}
          onClick={() => registration.mutate(result)}
        >
          Retry Registration
        </button>
      )}
      {registration.isError && (
        <p role="alert">
          Service unavailable. You can keep playing and retry later.
        </p>
      )}
      <div className="actions">
        <button className="primary" onClick={onPlay}>
          Play Again
        </button>
        <button onClick={onMenu}>Main Menu</button>
      </div>
    </section>
  );
}

function Combat({
  simulation,
  onComplete,
  onAbandon,
}: {
  simulation: GameSimulation;
  onComplete: () => void;
  onAbandon: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState(() => ({
    time: simulation.state.time,
    hp: simulation.state.player.hp,
    score: simulation.state.score,
    status: simulation.state.status,
  }));
  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = simulation.state;
      setHud({
        time: state.time,
        hp: state.player.hp,
        score: state.score,
        status: state.status,
      });
      if (state.status === "ended") onComplete();
    }, 100);
    return () => window.clearInterval(timer);
  }, [simulation, onComplete]);
  const pause = () => {
    simulation.pause();
    setHud((current) => ({ ...current, status: "paused" }));
  };
  const controls = [
    ["left", "Turn left", "A"],
    ["forward", "Forward", "W"],
    ["right", "Turn right", "D"],
    ["port", "Fire port", "Q"],
    ["front", "Fire front", "Space"],
    ["starboard", "Fire starboard", "E"],
  ] as const;
  return (
    <section className="combat" aria-label="Naval battle">
      <p className="sr-only" role="status" aria-label="Match status">
        {!ready
          ? "Loading battle"
          : hud.status === "paused"
            ? "Battle paused"
            : "Battle running"}
      </p>
      <header className="hud">
        <div>
          <span className="eyebrow">Black flag expedition</span>
          <strong>Captain’s ship</strong>
        </div>
        <div className="hud-stat">
          <span>Hull</span>
          <strong>
            {Math.max(0, Math.ceil(hud.hp))} / {simulation.state.player.maxHp}
          </strong>
          <meter
            aria-label="Hull health"
            min={0}
            max={simulation.state.player.maxHp}
            value={hud.hp}
          />
        </div>
        <div className="hud-stat" role="group" aria-label="Score">
          <span>Score</span>
          <strong>{hud.score}</strong>
        </div>
        <div className="hud-stat" role="group" aria-label="Time left">
          <span>Time left</span>
          <strong>
            {Math.ceil(Math.max(0, simulation.config.duration - hud.time))}s
          </strong>
        </div>
        <button onClick={pause}>Pause</button>
      </header>
      <div className="arena-frame">
        <GameCanvas
          simulation={simulation}
          onReady={() => setReady(true)}
          onError={() => setReady(false)}
        />
      </div>
      <div className="combat-footer">
        <span>W / A / D to sail · Q / Space / E to fire · Esc to pause</span>
        <div className="touch-controls">
          {controls.map(([action, label, key]) => (
            <button
              key={action}
              aria-label={label}
              disabled={!ready}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                if (simulation.state.status === "running")
                  simulation.input[action] = true;
              }}
              onPointerUp={() => {
                simulation.input[action] = false;
              }}
              onPointerCancel={() => {
                simulation.input[action] = false;
              }}
              onLostPointerCapture={() => {
                simulation.input[action] = false;
              }}
            >
              {label}
              <kbd>{key}</kbd>
            </button>
          ))}
        </div>
      </div>
      {hud.status === "paused" && (
        <Dialog
          title="Anchors down"
          onClose={() => {
            /* Resume requires the explicit button. */
          }}
        >
          <p>The battle is paused. Take a breath, captain.</p>
          <div className="actions">
            <button
              className="primary"
              onClick={() => {
                simulation.resume();
                setHud((current) => ({ ...current, status: "running" }));
              }}
            >
              Resume
            </button>
            <button onClick={onAbandon}>Abandon Match</button>
          </div>
          <p className="muted">Abandoned matches do not enter the records.</p>
        </Dialog>
      )}
    </section>
  );
}

export function App() {
  const [config, setConfig] = useState(loadConfig);
  const [screen, setScreen] = useState<"menu" | "game" | "result">("menu");
  const [options, setOptions] = useState(false);
  const [records, setRecords] = useState(false);
  const [result, setResult] = useState<MatchRecord | null>(getLastMatch);
  const [simulation, setSimulation] = useState<GameSimulation | null>(null);
  const matchId = useRef("");
  const completed = useRef(false);
  const registration = useRegisterMatch();
  const start = () => {
    simulation?.dispose();
    matchId.current = crypto.randomUUID();
    completed.current = false;
    setSimulation(
      new GameSimulation(
        config,
        new URLSearchParams(location.search).has("test") ? 42 : Date.now(),
      ),
    );
    setScreen("game");
  };
  const finish = () => {
    if (!simulation || completed.current || !simulation.state.reason) return;
    completed.current = true;
    const next: MatchRecord = {
      id: matchId.current,
      playerId: PLAYER_ID,
      playerName: "Captain",
      finishedAt: new Date().toISOString(),
      score: simulation.state.score,
      duration: simulation.state.time,
      reason: simulation.state.reason,
      config: structuredClone(simulation.config),
    };
    // Result navigation must succeed even when browser storage is full or blocked.
    // The mutation queues before HTTP and exposes failures without losing this session's result.
    try {
      enqueueMatch(next);
    } catch {
      /* Results reports the absence of a durable record. */
    }
    setResult(next);
    registration.mutate(next);
    setScreen("result");
    simulation.dispose();
    setSimulation(null);
  };
  return (
    <main className={screen === "game" ? "app in-battle" : "app"}>
      {screen !== "game" && (
        <header className="masthead">
          <a
            href="#"
            onClick={(event) => {
              event.preventDefault();
              setScreen("menu");
            }}
            aria-label="Pirate Battle home"
          >
            <img
              src="/assets/png/default/ui/menu/title_pirate_battle.png"
              alt="Pirate Battle"
            />
          </a>
          <span>THE BLACK FLAG EXPEDITION</span>
          <button onClick={() => setOptions(true)}>Options</button>
        </header>
      )}
      {screen === "menu" && (
        <>
          <section className="menu-layout">
            <div className="intro">
              <p className="eyebrow">Uncharted waters. Unforgiving rivals.</p>
              <h1>
                Make the sea
                <br />
                <em>remember you.</em>
              </h1>
              <p className="lead">
                Take the helm. Navigate the islands.
                <br />
                Send rival captains to the depths.
              </p>
              <div className="actions">
                <button className="primary play" onClick={start}>
                  Play
                </button>
                <button onClick={() => setOptions(true)}>Options</button>
              </div>
              <div className="voyage-details">
                <span>
                  <strong>{config.duration}s</strong> expedition
                </span>
                <span>
                  <strong>{config.spawnInterval}s</strong> enemy arrivals
                </span>
                <span>
                  <strong>3</strong> cannon batteries
                </span>
              </div>
              {result && (
                <button
                  className="text-button"
                  onClick={() => setScreen("result")}
                >
                  View Last Result · {result.score} points
                </button>
              )}
            </div>
            <aside className="captain-card">
              <div className="compass-ring">
                <img
                  src="/assets/png/retina/ships/ship_1.png"
                  alt="Your pirate ship"
                />
                <span>N</span>
              </div>
              <p className="eyebrow">Your ship. Your legend.</p>
              <h2>
                Fortune favors
                <br />
                the fearless.
              </h2>
              <p>
                Survive the expedition.
                <br />
                Every rival sunk earns one point.
              </p>
            </aside>
          </section>
          <section className="harbor">
            <div className="control-guide">
              <h2>Know your ship</h2>
              <p>
                <kbd>W</kbd> Forward <kbd>A</kbd>
                <kbd>D</kbd> Turn
              </p>
              <p>
                <kbd>Q</kbd> Port <kbd>Space</kbd> Bow <kbd>E</kbd> Starboard
              </p>
              <p className="muted">
                Touch controls available in battle. Landscape recommended.
              </p>
            </div>
            <div className="harbor-records">
              <p className="eyebrow">The captain’s ledger</p>
              <h2>Leave your mark.</h2>
              <button onClick={() => setRecords(true)}>
                Ranking &amp; Match History
              </button>
            </div>
          </section>
          <NetworkPanel />
        </>
      )}
      {screen === "game" && simulation && (
        <Combat
          simulation={simulation}
          onComplete={finish}
          onAbandon={() => {
            simulation.dispose();
            setSimulation(null);
            setScreen("menu");
          }}
        />
      )}
      {screen === "result" && result && (
        <Results
          result={result}
          onPlay={start}
          onMenu={() => setScreen("menu")}
        />
      )}
      {options && (
        <Options
          config={config}
          onSave={(next) => {
            setConfig(next);
            setOptions(false);
          }}
          onClose={() => setOptions(false)}
        />
      )}
      {records && (
        <Dialog title="Captain’s ledger" onClose={() => setRecords(false)}>
          <Records config={config} />
          <button onClick={() => setRecords(false)}>Close</button>
        </Dialog>
      )}
      {screen !== "game" && (
        <footer className="footer">
          <span>JUNGLE GAMING · PIRATE BATTLE</span>
          <span>One ship. Endless resolve.</span>
        </footer>
      )}
    </main>
  );
}
