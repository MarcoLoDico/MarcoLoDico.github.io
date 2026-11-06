import type { ControlInputs } from "../physics/aircraft";

/**
 * Mouse-yoke flying. With the pointer locked, mouse movement moves a virtual
 * yoke that stays where you leave it (up/down = pitch, left/right = roll).
 * Where the browser won't lock the pointer, the yoke follows the cursor's
 * position relative to the middle of the screen instead.
 * W/S throttle, A/D rudder, hold Space to look around, scroll to zoom.
 */

const YOKE_PIXELS = 380;
const THROTTLE_RATE = 0.55;
const RUDDER_RATE = 3.5;
const LOOK_SENSITIVITY = 0.0035;
/** Cursor mode: the yoke reaches full travel this fraction of the screen from the middle. */
const CURSOR_REACH = 0.36;
/**
 * Yoke response curve: mostly cubic near centre so small mouse movements make
 * small corrections, reaching full deflection at the stops (like sim "expo").
 */
const EXPO = 0.6;

export function shapeYoke(position: number): number {
  return (1 - EXPO) * position + EXPO * position ** 3;
}

/** How long to wait for the browser to grant pointer lock before falling back to cursor mode. */
const LOCK_GRACE_MS = 700;

export type InputAction = "toggle-view" | "pause" | "restart" | "warp" | "help" | "mute" | "menu";

export class FlightInput {
  readonly controls: ControlInputs = { elevator: 0, aileron: 0, rudder: 0, throttle: 0, flapNotch: 0, brake: 0 };
  /** Raw yoke position from the mouse, before the response curve. */
  private yokeX = 0;
  private yokeY = 0;
  /** Free-look offsets in radians while Space is held. */
  lookYaw = 0;
  lookPitch = 0;
  freeLook = false;
  locked = false;
  /** Flying with the cursor's position because pointer lock isn't available. */
  cursorMode = false;
  /** Field-of-view zoom from the mouse wheel: 1 is normal, up to 2.4× to read the gauges. */
  zoom = 1;
  private lockRequestedAt = 0;
  private lastCursor: { x: number; y: number } | null = null;

  private readonly held = new Set<string>();
  private readonly element: HTMLElement;
  private readonly onAction: (action: InputAction) => void;
  private readonly cleanups: (() => void)[] = [];

  constructor(element: HTMLElement, onAction: (action: InputAction) => void) {
    this.element = element;
    this.onAction = onAction;
    const listen = <K extends keyof DocumentEventMap>(type: K, handler: (event: DocumentEventMap[K]) => void) => {
      document.addEventListener(type, handler);
      this.cleanups.push(() => document.removeEventListener(type, handler));
    };
    listen("keydown", (event) => this.keyDown(event));
    listen("keyup", (event) => this.held.delete(event.code));
    listen("mousemove", (event) => this.mouseMove(event));
    listen("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.element;
      if (this.locked) {
        this.cursorMode = false;
      } else {
        this.held.clear();
      }
    });
    listen("pointerlockerror", () => this.fallBackToCursor());
    const wheel = (event: WheelEvent) => {
      if (!this.engaged) {
        return;
      }
      event.preventDefault();
      this.zoom = Math.max(1, Math.min(2.4, this.zoom * Math.exp(-event.deltaY * 0.0015)));
    };
    this.element.addEventListener("wheel", wheel, { passive: false });
    this.cleanups.push(() => this.element.removeEventListener("wheel", wheel));
    const blur = () => this.held.clear();
    window.addEventListener("blur", blur);
    this.cleanups.push(() => window.removeEventListener("blur", blur));
  }

  dispose(): void {
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.disengage();
  }

  /** True while the mouse is flying the aircraft, by either method. */
  get engaged(): boolean {
    return this.locked || this.cursorMode;
  }

  /** True just after asking for pointer lock, before the browser has answered. */
  get engaging(): boolean {
    return !this.engaged && performance.now() - this.lockRequestedAt < LOCK_GRACE_MS;
  }

  /** Hands the mouse to the yoke. Must be called from a click. */
  engage(): void {
    if (this.engaged) {
      return;
    }
    this.lockRequestedAt = performance.now();
    if (typeof this.element.requestPointerLock !== "function") {
      this.fallBackToCursor();
      return;
    }
    try {
      const request = this.element.requestPointerLock() as unknown;
      if (request instanceof Promise) {
        request.catch(() => this.fallBackToCursor());
      }
    } catch {
      this.fallBackToCursor();
      return;
    }
    // Some embedded browsers neither grant nor refuse: give up after a moment.
    window.setTimeout(() => {
      if (!this.locked) {
        this.fallBackToCursor();
      }
    }, LOCK_GRACE_MS);
  }

  disengage(): void {
    this.cursorMode = false;
    if (document.pointerLockElement === this.element) {
      document.exitPointerLock();
    }
    this.held.clear();
  }

  private fallBackToCursor(): void {
    if (this.locked) {
      return;
    }
    this.cursorMode = true;
    this.lastCursor = null;
  }

  /** Applies held keys over a frame. */
  update(dt: number): void {
    const c = this.controls;
    if (this.held.has("KeyW")) {
      c.throttle = Math.min(1, c.throttle + THROTTLE_RATE * dt);
    }
    if (this.held.has("KeyS")) {
      c.throttle = Math.max(0, c.throttle - THROTTLE_RATE * dt);
    }
    const rudderTarget = (this.held.has("KeyD") ? 1 : 0) - (this.held.has("KeyA") ? 1 : 0);
    c.rudder += Math.max(-RUDDER_RATE * dt, Math.min(RUDDER_RATE * dt, rudderTarget - c.rudder));
    c.brake = this.held.has("KeyB") ? 1 : 0;

    // Arrow keys nudge the yoke for anyone without a mouse.
    const nudge = 1.2 * dt;
    if (this.held.has("ArrowUp")) {
      this.yokeY = Math.max(-1, this.yokeY - nudge);
    }
    if (this.held.has("ArrowDown")) {
      this.yokeY = Math.min(1, this.yokeY + nudge);
    }
    if (this.held.has("ArrowLeft")) {
      this.yokeX = Math.max(-1, this.yokeX - nudge);
    }
    if (this.held.has("ArrowRight")) {
      this.yokeX = Math.min(1, this.yokeX + nudge);
    }
    c.aileron = shapeYoke(this.yokeX);
    c.elevator = shapeYoke(this.yokeY);

    this.freeLook = this.held.has("Space");
    if (!this.freeLook) {
      // Ease the view back to straight ahead.
      const k = Math.min(1, dt * 6);
      this.lookYaw -= this.lookYaw * k;
      this.lookPitch -= this.lookPitch * k;
    }
  }

  centerYoke(): void {
    this.setYoke(0, 0);
  }

  /** Places the yoke (raw positions, -1..1, before the response curve). */
  setYoke(x: number, y: number): void {
    this.yokeX = x;
    this.yokeY = y;
    this.controls.aileron = shapeYoke(x);
    this.controls.elevator = shapeYoke(y);
  }

  reset(throttle: number): void {
    Object.assign(this.controls, { elevator: 0, aileron: 0, rudder: 0, throttle, flapNotch: 0, brake: 0 });
    this.yokeX = 0;
    this.yokeY = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.zoom = 1;
  }

  private mouseMove(event: MouseEvent): void {
    if (this.cursorMode) {
      this.cursorMove(event);
      return;
    }
    if (!this.locked) {
      return;
    }
    if (this.held.has("Space")) {
      this.lookYaw = Math.max(-2.6, Math.min(2.6, this.lookYaw - event.movementX * LOOK_SENSITIVITY));
      this.lookPitch = Math.max(-1.2, Math.min(1.3, this.lookPitch - event.movementY * LOOK_SENSITIVITY));
      return;
    }
    this.yokeX = Math.max(-1, Math.min(1, this.yokeX + event.movementX / YOKE_PIXELS));
    // Mouse toward you pulls the yoke back (nose up), like a real yoke.
    this.yokeY = Math.max(-1, Math.min(1, this.yokeY + event.movementY / YOKE_PIXELS));
  }

  /** Cursor mode: the yoke sits where the cursor is, relative to the middle of the view. */
  private cursorMove(event: MouseEvent): void {
    const rect = this.element.getBoundingClientRect();
    if (this.held.has("Space")) {
      if (this.lastCursor) {
        this.lookYaw = Math.max(-2.6, Math.min(2.6, this.lookYaw - (event.clientX - this.lastCursor.x) * LOOK_SENSITIVITY * 1.5));
        this.lookPitch = Math.max(-1.2, Math.min(1.3, this.lookPitch - (event.clientY - this.lastCursor.y) * LOOK_SENSITIVITY * 1.5));
      }
      this.lastCursor = { x: event.clientX, y: event.clientY };
      return;
    }
    this.lastCursor = { x: event.clientX, y: event.clientY };
    const reach = Math.min(rect.width, rect.height) * CURSOR_REACH;
    const dx = (event.clientX - (rect.left + rect.width / 2)) / reach;
    const dy = (event.clientY - (rect.top + rect.height / 2)) / reach;
    const deadZone = (v: number) => (Math.abs(v) < 0.04 ? 0 : v);
    this.yokeX = Math.max(-1, Math.min(1, deadZone(dx)));
    this.yokeY = Math.max(-1, Math.min(1, deadZone(dy)));
  }

  private keyDown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) {
      if (event.code === "Space" || event.code === "Enter") {
        return;
      }
    }
    if (event.code === "Space" || event.code.startsWith("Arrow")) {
      event.preventDefault();
    }
    if (event.repeat) {
      this.held.add(event.code);
      return;
    }
    this.held.add(event.code);
    const c = this.controls;
    switch (event.code) {
      case "KeyF":
        c.flapNotch = Math.min(3, c.flapNotch + 1);
        break;
      case "KeyR":
        c.flapNotch = Math.max(0, c.flapNotch - 1);
        break;
      case "KeyC":
        this.centerYoke();
        break;
      case "KeyV":
        this.onAction("toggle-view");
        break;
      case "KeyP":
        this.onAction("pause");
        break;
      case "KeyT":
        this.onAction("warp");
        break;
      case "KeyH":
        this.onAction("help");
        break;
      case "KeyM":
        this.onAction("mute");
        break;
      case "Enter":
        this.onAction("restart");
        break;
      case "Escape":
        // Pointer lock releases itself on Esc; cursor mode needs letting go by hand.
        this.disengage();
        this.onAction("menu");
        break;
    }
  }
}
