import {
  BackSide,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Scene,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const HORIZON = new Color(0xcfe3f1);
const ZENITH = new Color(0x3b7fd0);
const GROUND_HAZE = new Color(0xa9bccb);

/** Direction toward the sun: south-east and fairly high, a clear early afternoon. */
export const SUN_DIRECTION = new Vector3(0.45, 0.72, 0.52).normalize();

/** Gradient sky dome, sun and fill lights, and distance haze. */
export class Sky {
  readonly dome: Mesh;
  readonly sun: DirectionalLight;
  readonly fill: HemisphereLight;
  private readonly fog: FogExp2;

  constructor(scene: Scene) {
    const material = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        zenith: { value: ZENITH },
        horizon: { value: HORIZON },
        below: { value: GROUND_HAZE },
        sunDirection: { value: SUN_DIRECTION },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 zenith;
        uniform vec3 horizon;
        uniform vec3 below;
        uniform vec3 sunDirection;
        varying vec3 vDirection;
        void main() {
          float h = vDirection.y;
          vec3 color = h > 0.0 ? mix(horizon, zenith, pow(min(1.0, h * 1.6), 0.6)) : mix(horizon, below, min(1.0, -h * 6.0));
          float sun = max(0.0, dot(normalize(vDirection), sunDirection));
          color += vec3(1.0, 0.92, 0.75) * (pow(sun, 900.0) * 3.0 + pow(sun, 12.0) * 0.18);
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.dome = new Mesh(new SphereGeometry(1000, 32, 16), material);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.fill = new HemisphereLight(0xdcecff, 0x6f7d58, 1.25);
    scene.add(this.fill);
    this.sun = new DirectionalLight(0xfff1dc, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -18;
    cam.right = 18;
    cam.top = 18;
    cam.bottom = -18;
    cam.near = 1;
    cam.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);

    this.fog = new FogExp2(HORIZON.getHex(), 1.0e-5);
    scene.fog = this.fog;
    scene.background = HORIZON;
  }

  /** Keeps the dome around the camera and the shadow frustum around the aircraft. */
  update(camera: Vector3, aircraft: Vector3, altitude: number): void {
    this.dome.position.copy(camera);
    this.sun.position.copy(aircraft).addScaledVector(SUN_DIRECTION, 200);
    this.sun.target.position.copy(aircraft);
    // Haze thins a little with height so the view opens up as you climb.
    this.fog.density = 1.15e-5 * Math.exp(-Math.max(0, altitude) / 9000);
  }
}

/**
 * Puffy low-poly cumulus in a field that wraps around the aircraft, so there
 * are always clouds about without simulating weather.
 */
export class Clouds {
  readonly group = new Group();
  private readonly puffs: { mesh: Mesh; base: Vector3 }[] = [];
  private readonly span = 70_000;
  private readonly offset = new Vector3();

  constructor(count = 70, seed = 7) {
    let s = seed;
    const random = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    const material = new MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x9aa6b4, emissiveIntensity: 0.18 });
    for (let i = 0; i < count; i++) {
      const parts: BufferGeometry[] = [];
      const size = 220 + random() * 420;
      const blobs = 4 + Math.floor(random() * 5);
      for (let k = 0; k < blobs; k++) {
        const r = size * (0.45 + random() * 0.45);
        const g = new IcosahedronGeometry(r, 1);
        g.scale(1, 0.55 + random() * 0.2, 1);
        g.translate((random() - 0.5) * size * 1.8, r * 0.2 + random() * size * 0.25, (random() - 0.5) * size * 1.1);
        parts.push(g.toNonIndexed());
      }
      const merged = mergeGeometries(parts);
      merged.computeVertexNormals();
      const mesh = new Mesh(merged, material);
      const base = new Vector3(random() * this.span, 1500 + random() * 900, random() * this.span);
      this.group.add(mesh);
      this.puffs.push({ mesh, base });
    }
  }

  /** Records a frame re-anchor so the field doesn't jump. */
  shift(dx: number, dz: number): void {
    this.offset.x += dx;
    this.offset.z += dz;
  }

  update(aircraft: Vector3, time: number): void {
    const half = this.span / 2;
    for (const { mesh, base } of this.puffs) {
      // Slow drift with a westerly breeze.
      const wx = base.x + time * 4 - (aircraft.x + this.offset.x);
      const wz = base.z - (aircraft.z + this.offset.z);
      const x = ((((wx + half) % this.span) + this.span) % this.span) - half;
      const z = ((((wz + half) % this.span) + this.span) % this.span) - half;
      mesh.position.set(aircraft.x + x, base.y - (x * x + z * z) / (2 * 6_371_000), aircraft.z + z);
    }
  }
}
