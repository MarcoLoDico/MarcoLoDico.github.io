import { ArrowLeft, Plane, Video, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Simulation, type Telemetry, type ViewMode } from "./sim/Simulation";
import { findStart, START_GROUPS, STARTS, type Start } from "./sim/starts";
import "./flight.css";

const CONTROLS: readonly [string, string][] = [
  ["Mouse", "Yoke: pitch and roll"],
  ["W / S", "Throttle"],
  ["A / D", "Rudder"],
  ["Hold Space", "Look around"],
  ["F / R", "Flaps down / up"],
  ["B", "Brakes"],
  ["V", "Cockpit / chase view"],
  ["C", "Centre the yoke"],
  ["T", "Time speed-up"],
  ["P", "Pause"],
  ["H", "Hide the flight data"],
  ["M", "Mute"],
  ["Scroll", "Zoom in on the panel"],
  ["Esc", "Release the mouse"],
];

function supportsWebGL(): boolean {
  try {
    return document.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

function format(value: number, digits = 0): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function FlightApp() {
  const hostRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [menuOpen, setMenuOpen] = useState(true);
  const [view, setView] = useState<ViewMode>("cockpit");
  // A "Fly here" link from the main site preselects that place: ?start=place-shopify.
  const [selected, setSelected] = useState<Start>(
    () =>
      findStart(new URLSearchParams(window.location.search).get("start")) ?? findStart("cytz") ?? (STARTS[0] as Start),
  );
  const [error] = useState<string | null>(() =>
    supportsWebGL() ? null : "This browser can't run WebGL, which the flight sim needs.",
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || error) {
      return;
    }
    const sim = new Simulation(host, setTelemetry);
    simRef.current = sim;
    if (import.meta.env.DEV) {
      (window as unknown as { flightSim?: Simulation }).flightSim = sim;
    }
    return () => {
      sim.dispose();
      simRef.current = null;
    };
  }, [error]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Escape" && !menuOpen && telemetry && telemetry.status !== "flying") {
        setMenuOpen(true);
        simRef.current?.openMenu();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, telemetry]);

  const fly = () => {
    const sim = simRef.current;
    if (!sim) {
      return;
    }
    sim.setView(view);
    sim.begin(selected);
    sim.resume();
    setMenuOpen(false);
  };

  const t = telemetry;
  const showHud = !menuOpen && t !== null && t.status !== "menu";

  return (
    <div className={telemetry?.cursorMode && telemetry.status === "flying" ? "flight flight--cursor" : "flight"}>
      <div ref={hostRef} className="flight__canvas" />

      {showHud && (
        <>
          <header className="flight__top">
            <a className="flight-chip" href={import.meta.env.BASE_URL}>
              <ArrowLeft size={16} aria-hidden="true" />
              Back to site
            </a>
            <span className="flight-chip flight-chip--quiet">
              <Plane size={15} aria-hidden="true" />
              {t.place}
            </span>
            <span className="flight__spacer" />
            {t.warp > 1 && <span className="flight-chip flight-chip--accent">{t.warp}× time</span>}
            <button
              type="button"
              className="flight-chip"
              onClick={() => simRef.current?.setView(t.view === "cockpit" ? "chase" : "cockpit")}
            >
              <Video size={15} aria-hidden="true" />
              {t.view === "cockpit" ? "Cockpit" : "Chase"}
            </button>
            <span className="flight-chip flight-chip--icon" aria-label={t.muted ? "Muted" : "Sound on"}>
              {t.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </span>
            <button
              type="button"
              className="flight-chip"
              onClick={() => {
                setMenuOpen(true);
                simRef.current?.openMenu();
              }}
            >
              Menu
            </button>
          </header>

          <section
            className={t.view === "cockpit" ? "flight-hud flight-hud--top" : "flight-hud"}
            aria-label="Flight data"
            hidden={!t.hud}
          >
            <Readout label="IAS" value={format(t.indicatedKt)} unit="kt" />
            <Readout label="ALT" value={format(Math.round(t.altitudeFt / 10) * 10)} unit="ft" />
            <Readout
              label="AGL"
              value={t.aglFt === null ? "—" : format(Math.max(0, Math.round(t.aglFt / 10) * 10))}
              unit="ft"
            />
            <Readout
              label="V/S"
              value={`${t.verticalSpeedFpm >= 0 ? "+" : ""}${format(Math.round(t.verticalSpeedFpm / 10) * 10)}`}
              unit="fpm"
            />
            <Readout label="HDG" value={String(Math.round(t.headingDeg) % 360).padStart(3, "0")} unit="°" />
            <div className="flight-hud__gauge">
              <span className="flight-hud__label">THR</span>
              <span className="flight-hud__bar">
                <span style={{ width: `${t.throttle * 100}%` }} />
              </span>
              <span className="flight-hud__small">{format(t.rpm)} rpm</span>
            </div>
            <Readout label="FLAPS" value={`${Math.round(t.flapDeg)}°`} unit="" />
            <div className="flight-hud__yoke" aria-label="Yoke and rudder position">
              <span className="flight-hud__yoke-box">
                <span
                  className="flight-hud__yoke-dot"
                  style={{ left: `${50 + t.yokeX * 46}%`, top: `${50 + t.yokeY * 46}%` }}
                />
              </span>
              <span className="flight-hud__rudder">
                <span style={{ left: `${50 + t.rudder * 46}%` }} />
              </span>
            </div>
          </section>

          {t.cursorMode && t.status === "flying" && (
            <>
              <span className="flight-cursor-ring" aria-hidden="true" />
              <span className="flight-cursor-hint">Yoke follows the cursor · centre is neutral · Esc to stop</span>
            </>
          )}

          <div className="flight__alerts">
            {t.stall && <span className="flight-alert flight-alert--danger">STALL</span>}
            {t.brake && <span className="flight-alert">BRAKES</span>}
          </div>

          {t.status === "loading" && (
            <div className="flight-overlay flight-overlay--soft">
              <p className="flight-overlay__title">Loading terrain…</p>
              <p className="flight-overlay__text">{t.tilesLoading} tiles on the way</p>
            </div>
          )}
          {t.status === "paused" && (
            <button
              type="button"
              className="flight-overlay flight-overlay--soft flight-overlay--button"
              onClick={() => simRef.current?.resume()}
            >
              <span className="flight-overlay__title">Click to fly</span>
              <span className="flight-overlay__text">
                The mouse becomes the yoke: toward you is nose up. Press Esc to let go.
              </span>
            </button>
          )}
          {t.status === "crashed" && (
            <div className="flight-overlay">
              <p className="flight-overlay__title">Crashed</p>
              <p className="flight-overlay__text">{t.crash}</p>
              <div className="flight-overlay__actions">
                <button
                  type="button"
                  className="flight-button flight-button--primary"
                  onClick={() => simRef.current?.restart()}
                >
                  Try again (Enter)
                </button>
                <button
                  type="button"
                  className="flight-button"
                  onClick={() => {
                    setMenuOpen(true);
                    simRef.current?.openMenu();
                  }}
                >
                  Choose another start
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {menuOpen && (
        <div className="flight-menu">
          <div className="flight-menu__panel">
            <a className="flight-menu__back" href={import.meta.env.BASE_URL}>
              <ArrowLeft size={16} aria-hidden="true" />
              Back to site
            </a>
            <h1 className="flight-menu__title">Flight sim</h1>
            <p className="flight-menu__lead">
              A Cessna 172 at real-world scale over Toronto, Waterloo, and San Francisco. Terrain and buildings stream
              in from open map data as you fly.
            </p>
            {error && <p className="flight-menu__error">{error}</p>}

            {START_GROUPS.map((group) => (
              <section key={group.id}>
                <h2 className="flight-menu__heading">{group.label}</h2>
                <div className="flight-menu__starts">
                  {STARTS.filter((start) => start.group === group.id).map((start) => (
                    <button
                      key={start.id}
                      type="button"
                      className={start.id === selected.id ? "flight-start flight-start--active" : "flight-start"}
                      aria-pressed={start.id === selected.id}
                      onClick={() => setSelected(start)}
                    >
                      <span className="flight-start__name">{start.name}</span>
                      <span className="flight-start__detail">{start.detail}</span>
                      <span className="flight-start__tag">{start.airborne ? "In the air" : "On the runway"}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}

            <div className="flight-menu__row">
              <div className="flight-menu__views" role="radiogroup" aria-label="View">
                {(["cockpit", "chase"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={view === mode}
                    className={view === mode ? "flight-segment flight-segment--active" : "flight-segment"}
                    onClick={() => setView(mode)}
                  >
                    {mode === "cockpit" ? "Cockpit" : "Chase camera"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="flight-button flight-button--primary flight-button--large"
                onClick={fly}
                disabled={error !== null}
              >
                Fly
              </button>
            </div>

            <h2 className="flight-menu__heading">Controls</h2>
            <dl className="flight-menu__controls">
              {CONTROLS.map(([key, action]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{action}</dd>
                </div>
              ))}
            </dl>
            <p className="flight-menu__hint">
              On the runway: full throttle (hold W), keep it straight with A/D, and gently pull back (mouse toward you)
              around 55 knots.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Readout({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flight-hud__readout">
      <span className="flight-hud__label">{label}</span>
      <span className="flight-hud__value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
    </div>
  );
}
