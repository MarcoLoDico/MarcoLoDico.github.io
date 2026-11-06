import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from "three";
import { getCategory } from "../../content/categories";
import { isFlyable } from "../../content/flight";
import { places } from "../../content/places";
import type { Place } from "../../content/types";
import { distanceMeters, LocalFrame } from "../sim/geo";
import type { Terrain } from "./terrain";

const BEAM_HEIGHT = 320;
const SHOW_WITHIN = 45_000;

interface Marker {
  readonly place: Place;
  readonly lat: number;
  readonly lon: number;
  readonly frame: LocalFrame;
  readonly root: Object3D;
  readonly label: Sprite;
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  base: number;
  groundZoom: number;
  shownKm: number;
}

/**
 * A glowing beam and a name tag over each place from the main site, so you
 * can find where Marco worked and studied from the air.
 */
export class Waypoints {
  readonly group = new Group();
  private readonly markers: Marker[];
  private frame: LocalFrame;
  private readonly matrix = new Matrix4();
  private readonly lift = new Matrix4();

  constructor(frame: LocalFrame) {
    this.frame = frame;
    this.group.name = "waypoints";
    this.markers = places.filter(isFlyable).map((place) => {
      const [lon, lat] = place.site.coordinates;
      const color = getCategory(place.category).color;
      const root = new Object3D();
      root.matrixAutoUpdate = false;

      const beam = new Mesh(
        new CylinderGeometry(2.5, 2.5, BEAM_HEIGHT, 8, 1, true).translate(0, BEAM_HEIGHT / 2, 0),
        new MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, blending: AdditiveBlending, fog: false }),
      );
      const halo = new Mesh(
        new CylinderGeometry(14, 14, 1.5, 24, 1, true).translate(0, 1, 0),
        new MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, fog: false }),
      );
      root.add(beam, halo);

      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 128;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const label = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, sizeAttenuation: false, fog: false }));
      label.scale.set(0.27, 0.048, 1);
      label.position.y = BEAM_HEIGHT + 20;
      label.renderOrder = 20;
      root.add(label);
      this.group.add(root);
      return { place, lat, lon, frame: new LocalFrame(lat, lon), root, label, canvas, texture, base: 0, groundZoom: -1, shownKm: -1 };
    });
  }

  setFrame(frame: LocalFrame): void {
    this.frame = frame;
    for (const marker of this.markers) {
      this.place(marker);
    }
  }

  update(terrain: Terrain, aircraftLat: number, aircraftLon: number): void {
    for (const marker of this.markers) {
      const distance = distanceMeters({ lat: aircraftLat, lon: aircraftLon }, marker);
      marker.root.visible = distance < SHOW_WITHIN && marker.groundZoom >= 0;
      if (distance < SHOW_WITHIN) {
        const ground = terrain.sample(marker.lat, marker.lon);
        if (ground && ground.zoom > marker.groundZoom) {
          marker.base = ground.height;
          marker.groundZoom = ground.zoom;
          this.place(marker);
        }
      }
      const km = Math.round(distance / 100) / 10;
      if (marker.root.visible && km !== marker.shownKm) {
        marker.shownKm = km;
        this.drawLabel(marker, km);
      }
    }
  }

  private drawLabel(marker: Marker, km: number): void {
    const ctx = marker.canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const { width, height } = marker.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(14, 17, 23, 0.78)";
    ctx.beginPath();
    ctx.roundRect(4, 14, width - 8, height - 28, 30);
    ctx.fill();
    ctx.fillStyle = getCategory(marker.place.category).color;
    ctx.beginPath();
    ctx.arc(52, height / 2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f3f4f6";
    ctx.font = "700 40px 'Inter Variable', Helvetica, Arial, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const distance = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
    ctx.fillText(marker.place.name, 84, height / 2 - 2, width - 280);
    ctx.fillStyle = "rgba(243, 244, 246, 0.65)";
    ctx.font = "600 30px 'Inter Variable', Helvetica, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(distance, width - 30, height / 2);
    marker.texture.needsUpdate = true;
  }

  private place(marker: Marker): void {
    this.matrix.fromArray(this.frame.matrixFrom(marker.frame));
    this.lift.makeTranslation(0, marker.base, 0);
    marker.root.matrix.multiplyMatrices(this.matrix, this.lift);
    marker.root.matrixWorldNeedsUpdate = true;
  }
}
