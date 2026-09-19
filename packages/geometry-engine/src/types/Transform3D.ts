import type {
    Point3,
  } from "./Point3";
  
  
  export interface Rotation3 {
  
    /**
     * Rotación alrededor del eje X.
     * Unidad: radianes.
     */
    readonly x: number;
  
  
    /**
     * Rotación alrededor del eje Y.
     * Unidad: radianes.
     */
    readonly y: number;
  
  
    /**
     * Rotación alrededor del eje Z.
     * Unidad: radianes.
     */
    readonly z: number;
  
  }
  
  
  export interface Transform3D {
  
    readonly position: Point3;
  
    readonly rotation: Rotation3;
  
  }
  
  
  export function createIdentityTransform3D():
    Transform3D {
  
    return {
  
      position: {
        x: 0,
        y: 0,
        z: 0,
      },
  
      rotation: {
        x: 0,
        y: 0,
        z: 0,
      },
  
    };
  
  }