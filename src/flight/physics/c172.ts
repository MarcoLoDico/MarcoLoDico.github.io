/**
 * Cessna 172S airframe and aerodynamic data. Stability derivatives follow the
 * widely used JSBSim c172p model (per radian, rates non-dimensionalised by
 * b/2V or c/2V); mass, geometry, and engine figures come from the POH.
 */

const DEG = Math.PI / 180;

export const C172 = {
  mass: 1_050, // kg, two people and 3/4 fuel
  /** Moments of inertia about the body's right, up, and forward axes (pitch, yaw, roll), kg·m². */
  inertia: { pitch: 1_825, yaw: 2_667, roll: 1_285 },
  wingArea: 16.17,
  wingSpan: 11.0,
  chord: 1.494,

  lift: {
    zeroAlpha: 0.31,
    perAlpha: 5.143,
    perPitchRate: 3.9,
    perElevator: 0.43,
    /** Extra lift at full (30°) flaps. */
    fullFlaps: 0.55,
    maxClean: 1.55,
    maxFullFlaps: 2.25,
    minimum: -1.05,
  },
  drag: {
    parasite: 0.03,
    /** 1 / (π · e · AR) with AR 7.48 and Oswald e 0.74. */
    induced: 0.0575,
    fullFlaps: 0.065,
  },
  side: { perBeta: -0.393, perRudder: 0.187 },
  roll: { perBeta: -0.0923, perRollRate: -0.484, perYawRate: 0.0798, perAileron: 0.229, perRudder: 0.0147 },
  pitch: { zero: 0.1, perAlpha: -1.8, perPitchRate: -12.4, perElevator: -1.28, fullFlaps: -0.07 },
  yaw: { perBeta: 0.0587, perRollRate: -0.0278, perYawRate: -0.0937, perAileron: -0.0216, perRudder: -0.0645 },

  /** Surface throws in radians and how fast the controls can move them. */
  elevatorUp: 28 * DEG,
  elevatorDown: 23 * DEG,
  aileronThrow: 18 * DEG,
  rudderThrow: 16 * DEG,
  flapRateDegPerSecond: 5,
  flapNotches: [0, 10, 20, 30],

  engine: {
    /** Lycoming IO-360-L2A, 180 hp. */
    maxPower: 134_000,
    propEfficiency: 0.8,
    staticThrust: 2_500,
    propDiameter: 1.93,
    idleRpm: 650,
    maxRpm: 2_700,
  },

  /** Gear contact points in body coordinates (x right, y up, z aft), metres from the centre of gravity. */
  gear: {
    mainLeft: [-1.25, -1.15, 0.25] as const,
    mainRight: [1.25, -1.15, 0.25] as const,
    nose: [0, -1.12, -1.72] as const,
    mainStiffness: 52_000,
    mainDamping: 5_200,
    noseStiffness: 34_000,
    noseDamping: 3_400,
    maxCompression: 0.4,
    rollingFriction: 0.025,
    brakeFriction: 0.65,
    lateralFriction: 0.85,
    noseSteerDeg: 10,
  },

  /** Points that must never touch the ground. */
  hardPoints: {
    leftWingtip: [-5.45, 1.2, 0.4] as const,
    rightWingtip: [5.45, 1.2, 0.4] as const,
    propTip: [0, -0.92, -2.42] as const,
    tail: [0, -0.08, 5.5] as const,
    belly: [0, -0.72, 0.6] as const,
    nose: [0, -0.36, -2.15] as const,
  },
} as const;
