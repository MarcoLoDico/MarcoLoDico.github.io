import { MeshStandardMaterial } from "three";

/** Shared by every hand-made landmark: flat colours carried in the vertices. */
export const landmarkMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05 });
