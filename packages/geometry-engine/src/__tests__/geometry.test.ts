import {
    describe,
    expect,
    it,
  } from "vitest";
  
  import {
    directionBetweenPoints,
    distanceBetweenPoints,
    midpoint,
  } from "../index";
  
  
  describe(
    "FrameLogic Geometry Engine",
    () => {
  
      it(
        "calculates the distance between two 3D points",
        () => {
  
          const pointA = {
            x: 0,
            y: 0,
            z: 0,
          };
  
          const pointB = {
            x: 3,
            y: 4,
            z: 0,
          };
  
          const result =
            distanceBetweenPoints(
              pointA,
              pointB,
            );
  
          expect(result).toBe(5);
        },
      );
  
  
      it(
        "calculates the normalized direction between two points",
        () => {
  
          const pointA = {
            x: 0,
            y: 0,
            z: 0,
          };
  
          const pointB = {
            x: 3,
            y: 4,
            z: 0,
          };
  
          const result =
            directionBetweenPoints(
              pointA,
              pointB,
            );
  
          expect(result.x).toBeCloseTo(0.6);
          expect(result.y).toBeCloseTo(0.8);
          expect(result.z).toBeCloseTo(0);
        },
      );
  
  
      it(
        "calculates the midpoint between two points",
        () => {
  
          const pointA = {
            x: 0,
            y: 0,
            z: 0,
          };
  
          const pointB = {
            x: 3,
            y: 4,
            z: 0,
          };
  
          const result =
            midpoint(
              pointA,
              pointB,
            );
  
          expect(result).toEqual({
            x: 1.5,
            y: 2,
            z: 0,
          });
        },
      );
  
  
      it(
        "rejects direction calculation for coincident points",
        () => {
  
          const point = {
            x: 10,
            y: 20,
            z: 30,
          };
  
          expect(
            () =>
              directionBetweenPoints(
                point,
                point,
              ),
          ).toThrow();
        },
      );
  
    },
  );