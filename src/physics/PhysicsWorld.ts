import RAPIER from '@dimforge/rapier3d-compat';

export interface CoinInstance {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  id: number;
  passedGate?: boolean;
  hitChucker?: boolean;
}

export interface BallInstance {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  id: number;
}

export interface CrounBallInstance {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

export interface CrounPocket {
  index: number;
  type: '50' | '100_tower' | 'jp';
  position: { x: number; y: number; z: number };
  collider: RAPIER.Collider;
}

export class PhysicsWorld {
  public world!: RAPIER.World;
  private isInitialized = false;
  private static readonly FIXED_DT = 1.0 / 60.0;
  private stepAccumulator = 0;

  // Trackers
  public coins: Map<number, CoinInstance> = new Map();
  public balls: Map<number, BallInstance> = new Map();
  private nextEntityId = 1;
  public readonly maxFieldCoins = 120; // Hard cap to guarantee 60fps without WASM thread lock
  private gateCooldown = 0;

  // Kinematic Pusher
  public pusherBody!: RAPIER.RigidBody;
  private pusherBaseZ = -1.35;
  private pusherStroke = 0.85;
  private pusherSpeed = 1.6;
  private pusherTime = 0;
  public isFeverSpeed = false;

  // Side Guard Walls (Fever Shield)
  public leftShieldBody!: RAPIER.RigidBody;
  public rightShieldBody!: RAPIER.RigidBody;
  private currentShieldY = -1.0;
  private targetShieldY = -1.0;

  // Multiplier 2x Gate
  public gateBody!: RAPIER.RigidBody;
  public gateCollider!: RAPIER.Collider;
  private gateTime = 0;
  public gateX = 0;

  // Chucker Sensor
  public chuckerCollider!: RAPIER.Collider;

  // Croun Mechanism
  public crounCenter = { x: 0, y: 7.0, z: -1.0 };
  public crounPockets: CrounPocket[] = [];
  public crounBall: CrounBallInstance | null = null;
  public isCrounActive = false;
  public crounTimer = 0;
  public crounWinner: CrounPocket | null = null;
  public crounLockTimer = 0;

  // Event callbacks
  public onPayoutCoin: ((count: number) => void) | null = null;
  public onSideLostCoin: ((count: number) => void) | null = null;
  public onChuckerHit: (() => void) | null = null;
  public onGateHit: ((pos: { x: number; y: number; z: number }) => void) | null = null;
  public onBallPayout: (() => void) | null = null;
  public onCrounLockIn: ((type: '50' | '100_tower' | 'jp', pocketIndex: number) => void) | null = null;
  public onCrounResult: ((type: '50' | '100_tower' | 'jp') => void) | null = null;

  public async init() {
    await RAPIER.init();
    const gravity = new RAPIER.Vector3(0.0, -9.81 * 2.4, 0.0); // Crisp arcade gravity
    this.world = new RAPIER.World(gravity);
    this.world.integrationParameters.dt = 1.0 / 60.0;

    this.createField();
    this.createPusher();
    this.createShields();
    this.create2xGate();
    this.createChucker();
    this.createCroun();

    this.isInitialized = true;
  }

  /**
   * Field Geometry Setup
   * Shortened lower deck and visible moving pusher upper deck
   */
  private createField() {
    // Upper stationary rear pusher back-wall (pushes coins off the moving pusher deck when it retracts)
    const upperBackDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.8, -1.95);
    const upperBackBody = this.world.createRigidBody(upperBackDesc);
    const upperBackColliderDesc = RAPIER.ColliderDesc.cuboid(1.6, 0.4, 0.1)
      .setFriction(0.2)
      .setRestitution(0.05);
    this.world.createCollider(upperBackColliderDesc, upperBackBody);

    // Upper back containment slope / guide
    const backSlopeDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, 1.4, -2.4)
      .setRotation({ x: 0.35, y: 0, z: 0, w: 0.936 });
    const backSlopeBody = this.world.createRigidBody(backSlopeDesc);
    const backSlopeColDesc = RAPIER.ColliderDesc.cuboid(1.6, 0.05, 0.6)
      .setFriction(0.15)
      .setRestitution(0.1);
    this.world.createCollider(backSlopeColDesc, backSlopeBody);

    // Rear boundary wall
    const backWallDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 2.0, -3.0);
    const backWall = this.world.createRigidBody(backWallDesc);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(1.8, 2.0, 0.1), backWall);

    // Lower stationary deck (compact length so coins fall quickly!)
    // Center at Z = -0.05, length = 1.7m (Z: -0.90 to +0.80)
    const lowerDeckDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.0, -0.05);
    const lowerDeckBody = this.world.createRigidBody(lowerDeckDesc);
    const lowerDeckColliderDesc = RAPIER.ColliderDesc.cuboid(1.5, 0.15, 0.85)
      .setFriction(0.26) // Difficulty: medals pile up more before avalanching (was 0.15)
      .setRestitution(0.08);
    this.world.createCollider(lowerDeckColliderDesc, lowerDeckBody);

    // Side outer containment walls
    const leftOuterWall = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-1.85, 0.8, -0.7));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.08, 1.2, 2.4).setRestitution(0.2), leftOuterWall);

    const rightOuterWall = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(1.85, 0.8, -0.7));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.08, 1.2, 2.4).setRestitution(0.2), rightOuterWall);
  }

  /**
   * Kinematic Pusher Setup
   * Moving upper deck where coins are dropped directly onto
   */
  private createPusher() {
    const pusherDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.38, this.pusherBaseZ);
    this.pusherBody = this.world.createRigidBody(pusherDesc);
    // Pusher box: width 3.0m, height 0.44m, length 1.2m
    const pusherCollider = RAPIER.ColliderDesc.cuboid(1.5, 0.22, 0.6)
      .setFriction(0.85) // High top friction moves coins forward
      .setRestitution(0.05);
    this.world.createCollider(pusherCollider, this.pusherBody);
  }

  /**
   * Side Fever Shield Walls
   */
  private createShields() {
    // Left shield
    const leftDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-1.54, this.currentShieldY, -0.05);
    this.leftShieldBody = this.world.createRigidBody(leftDesc);
    const shieldColliderDesc = RAPIER.ColliderDesc.cuboid(0.06, 0.4, 0.85)
      .setRestitution(0.1)
      .setFriction(0.2);
    this.world.createCollider(shieldColliderDesc, this.leftShieldBody);

    // Right shield
    const rightDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(1.54, this.currentShieldY, -0.05);
    this.rightShieldBody = this.world.createRigidBody(rightDesc);
    this.world.createCollider(shieldColliderDesc, this.rightShieldBody);
  }

  /**
   * Moving 2x Gate Trigger (Directly above the moving pusher deck)
   */
  private create2xGate() {
    const gateDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.15, -1.35);
    this.gateBody = this.world.createRigidBody(gateDesc);
    const gateColDesc = RAPIER.ColliderDesc.cuboid(0.35, 0.3, 0.2)
      .setSensor(true);
    this.gateCollider = this.world.createCollider(gateColDesc, this.gateBody);
  }

  /**
   * Chucker Sensor (Center-lower deck)
   */
  private createChucker() {
    const chuckerDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.18, 0.35);
    const chuckerBody = this.world.createRigidBody(chuckerDesc);
    const chuckerColDesc = RAPIER.ColliderDesc.cuboid(0.16, 0.12, 0.10)
      .setSensor(true);
    this.chuckerCollider = this.world.createCollider(chuckerColDesc, chuckerBody);
  }

  /**
   * Croun Bowl & 6 Pockets (Funnel, 6 Depressed Physical Cups, & Center Spindle)
   */
  private createCroun() {
    const c = this.crounCenter;
    const segments = 32;
    const rOuter = 2.4;
    const yWall = 1.20;
    const yOuter = 0.70;
    const rMid = 1.10;
    const yMid = 0.15;
    const rCenter = 0.55;
    const yCenterBase = 0.10;
    const yApex = 0.45;

    const vertices: number[] = [];
    const indices: number[] = [];

    // 1. Outer Wall & Funnel Slope
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // V0: Outer wall top
      vertices.push(cos * rOuter, yWall, sin * rOuter);
      // V1: Funnel top
      vertices.push(cos * rOuter, yOuter, sin * rOuter);
      // V2: Funnel bottom / pocket rim
      vertices.push(cos * rMid, yMid, sin * rMid);
    }

    for (let i = 0; i < segments; i++) {
      const b = i * 3;
      const n = (i + 1) * 3;
      indices.push(b + 0, b + 1, n + 1);
      indices.push(b + 0, n + 1, n + 0);
      indices.push(b + 1, b + 2, n + 2);
      indices.push(b + 1, n + 2, n + 1);
    }

    // 2. Central Spindle Cone
    const coneStartIdx = vertices.length / 3;
    const apexIdx = coneStartIdx;
    vertices.push(0, yApex, 0); // Apex

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      vertices.push(Math.cos(angle) * rCenter, yCenterBase, Math.sin(angle) * rCenter);
    }

    for (let i = 0; i < segments; i++) {
      indices.push(apexIdx, coneStartIdx + 1 + i, coneStartIdx + 1 + i + 1);
    }

    const vArray = new Float32Array(vertices);
    const iArray = new Uint32Array(indices);
    const bowlBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, c.y, c.z));
    const colDesc = RAPIER.ColliderDesc.trimesh(vArray, iArray).setFriction(0.12).setRestitution(0.20);
    this.world.createCollider(colDesc, bowlBody);

    // 6 Pockets configuration:
    // Index 0: GRAND JACKPOT (1/6)
    // Index 1, 4: 100枚+タワー (2/6)
    // Index 2, 3, 5: 50枚 (3/6)
    const pocketTypes: Array<'50' | '100_tower' | 'jp'> = [
      'jp',        // 0: Rainbow JP
      '100_tower', // 1: Yellow
      '50',        // 2: Blue
      '50',        // 3: Blue
      '100_tower', // 4: Yellow
      '50',        // 5: Blue
    ];

    const rPocket = 0.85;
    this.crounPockets = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const px = c.x + Math.cos(angle) * rPocket;
      const pz = c.z + Math.sin(angle) * rPocket;

      // 3. Physical Recessed Cup Floor (depth Y = c.y - 0.22, ball drops into hole!)
      const cupFloorBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(px, c.y - 0.22, pz));
      this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.04, 0.25).setFriction(0.4).setRestitution(0.1), cupFloorBody);

      // 4. Physical Divider Wedges between adjacent pockets
      const divAngle = (i + 0.5) * (Math.PI * 2 / 6);
      const dx = c.x + Math.cos(divAngle) * rPocket;
      const dz = c.z + Math.sin(divAngle) * rPocket;
      const dividerBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(dx, c.y + 0.08, dz));
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.06, 0.16, 0.24)
          .setRotation({ x: 0, y: Math.sin(divAngle / 2), z: 0, w: Math.cos(divAngle / 2) })
          .setFriction(0.2)
          .setRestitution(0.3),
        dividerBody
      );

      // 5. Pocket Detection Sensor (Inside the cup hole)
      const pBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(px, c.y - 0.05, pz));
      const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.24, 0.18, 0.24).setSensor(true), pBody);

      this.crounPockets.push({
        index: i,
        type: pocketTypes[i],
        position: { x: px, y: c.y - 0.05, z: pz },
        collider: col,
      });
    }
  }

  /**
   * Set Fever Wall Mode
   */
  public setFeverActive(active: boolean) {
    this.targetShieldY = active ? 0.45 : -1.0;
    this.isFeverSpeed = active;
  }

  /**
   * Spawn a standard medal
   * Placed right above the moving pusher deck (Z ~ -1.45, Y ~ 1.35)
   */
  public spawnCoin(x: number, y: number = 1.35, z: number = -1.45, isBonus = false): CoinInstance | null {
    if (!this.isInitialized) return null;

    // Safety hard cap: if reaching limit, smoothly prune the most advanced front coin
    if (this.coins.size >= this.maxFieldCoins) {
      let oldestId: number | null = null;
      let maxZ = -999;
      for (const [id, c] of this.coins.entries()) {
        const cz = c.body.translation().z;
        if (cz > maxZ) {
          maxZ = cz;
          oldestId = id;
        }
      }
      if (oldestId !== null) {
        const c = this.coins.get(oldestId)!;
        try {
          this.world.removeCollider(c.collider, false);
        } catch (_) {}
        try {
          this.world.removeRigidBody(c.body);
        } catch (_) {}
        this.coins.delete(oldestId);
        // Automatically credit payout if pruned from front edge
        if (maxZ > 0.6 && this.onPayoutCoin) {
          this.onPayoutCoin(1);
        }
      }
    }

    // Spec parameters: Mass 1.0kg, Restitution 0.10, Friction 0.16 (smooth sliding avalanche)
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.2)
      .setAngularDamping(0.3);
    const body = this.world.createRigidBody(bodyDesc);

    // Thick round cylinder (eliminates contact manifold sharp-edge explosions)
    // Radius 0.172 + 0.008 = 0.18m, half-height 0.038 + 0.008 = 0.046m
    const colliderDesc = RAPIER.ColliderDesc.roundCylinder(0.038, 0.172, 0.008)
      .setRestitution(0.10)
      .setFriction(0.16)
      .setMass(1.0);
    const collider = this.world.createCollider(colliderDesc, body);

    // Slight forward/downward nudge
    body.applyImpulse({ x: (Math.random() - 0.5) * 0.04, y: -0.15, z: 0.08 }, true);

    const instance: CoinInstance = {
      body,
      collider,
      id: this.nextEntityId++,
      passedGate: isBonus,
    };
    this.coins.set(instance.id, instance);
    return instance;
  }

  /**
   * Spawn a Color Ball (Sphere) directly on moving pusher deck
   */
  public spawnBall(x: number = 0, y: number = 1.5, z: number = -1.4): BallInstance | null {
    if (!this.isInitialized) return null;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.08)
      .setAngularDamping(0.08);
    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(0.40)
      .setRestitution(0.15)
      .setFriction(0.20)
      .setMass(4.5);
    const collider = this.world.createCollider(colliderDesc, body);

    const instance: BallInstance = {
      body,
      collider,
      id: this.nextEntityId++,
    };
    this.balls.set(instance.id, instance);
    return instance;
  }

  /**
   * Spawn Medal Tower (50 vertical stacked thick coins)
   * Collapses in dramatic avalanche once pusher moves
   */
  public spawnMedalTower(centerX: number = 0, centerZ: number = -1.35) {
    if (!this.isInitialized) return;

    // Prune excess coins first if field is full
    const coinsNeeded = 50;
    while (this.coins.size + coinsNeeded > this.maxFieldCoins && this.coins.size > 0) {
      let oldestId: number | null = null;
      let maxZ = -999;
      for (const [id, c] of this.coins.entries()) {
        const cz = c.body.translation().z;
        if (cz > maxZ) {
          maxZ = cz;
          oldestId = id;
        }
      }
      if (oldestId !== null) {
        const c = this.coins.get(oldestId)!;
        try { this.world.removeCollider(c.collider, false); } catch (_) {}
        try { this.world.removeRigidBody(c.body); } catch (_) {}
        this.coins.delete(oldestId);
      } else {
        break;
      }
    }

    const layers = 10;
    const coinsPerLayer = 5;
    const layerRadius = 0.32; // Non-overlapping radius (2 * 0.32 * sin(36deg) = 0.376m > 0.36m coin diameter)
    const startY = 0.65; // Pusher top is Y=0.60, coin half-height 0.046 → bottom layer rests on deck
    for (let l = 0; l < layers; l++) {
      const y = startY + l * 0.094;
      for (let c = 0; c < coinsPerLayer; c++) {
        const angle = (c / coinsPerLayer) * Math.PI * 2 + (l % 2) * 0.3;
        const x = centerX + Math.cos(angle) * layerRadius;
        const z = centerZ + Math.sin(angle) * layerRadius;

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, y, z)
          .setLinearDamping(0.25)
          .setAngularDamping(0.3);
        const body = this.world.createRigidBody(bodyDesc);

        // Tower thick round coins
        const colliderDesc = RAPIER.ColliderDesc.roundCylinder(0.038, 0.172, 0.008)
          .setRestitution(0.05)
          .setFriction(0.35)
          .setMass(1.0);
        const collider = this.world.createCollider(colliderDesc, body);
        // Note: not forcing sleep — Rapier auto-sleeps settled bodies, and a forced
        // sleep left the tower floating if it wasn't exactly resting on the deck.

        const instance: CoinInstance = {
          body,
          collider,
          id: this.nextEntityId++,
          passedGate: true,
        };
        this.coins.set(instance.id, instance);
      }
    }
  }

  /**
   * Export board coin/ball positions for complete LocalStorage field state persistence
   */
  public exportBoardState(): { coins: Array<{ x: number; y: number; z: number }>; balls: Array<{ x: number; y: number; z: number }> } {
    const coinsData: Array<{ x: number; y: number; z: number }> = [];
    this.coins.forEach(coin => {
      const p = coin.body.translation();
      // Only persist active field coins
      if (p.y > -0.5 && p.y < 3.0 && p.z > -2.5 && p.z < 0.9) {
        coinsData.push({ x: p.x, y: p.y, z: p.z });
      }
    });

    const ballsData: Array<{ x: number; y: number; z: number }> = [];
    this.balls.forEach(ball => {
      const p = ball.body.translation();
      if (p.y > -0.5 && p.z > -2.5 && p.z < 0.9) {
        ballsData.push({ x: p.x, y: p.y, z: p.z });
      }
    });

    return { coins: coinsData, balls: ballsData };
  }

  /**
   * Restore board state from saved LocalStorage data
   */
  public restoreBoardState(savedState: { coins?: Array<{ x: number; y: number; z: number }>; balls?: Array<{ x: number; y: number; z: number }> }) {
    // Clear existing
    this.coins.forEach(c => {
      try { this.world.removeCollider(c.collider, false); } catch (_) {}
      try { this.world.removeRigidBody(c.body); } catch (_) {}
    });
    this.coins.clear();

    this.balls.forEach(b => {
      try { this.world.removeCollider(b.collider, false); } catch (_) {}
      try { this.world.removeRigidBody(b.body); } catch (_) {}
    });
    this.balls.clear();

    if (savedState.coins && savedState.coins.length > 0) {
      savedState.coins.forEach(c => {
        const coin = this.spawnCoin(c.x, c.y, c.z, true);
        if (coin) {
          coin.hitChucker = true; // Pre-placed coins must not award chucker stock on load
          coin.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
      });
    } else {
      this.seedInitialMedals(70);
    }

    if (savedState.balls) {
      savedState.balls.forEach(b => {
        this.spawnBall(b.x, b.y, b.z);
      });
    }
  }

  /**
   * Start Croun Roulette Ball Drop
   */
  public launchCrounBall() {
    if (!this.isInitialized) return;
    this.isCrounActive = true;
    this.crounTimer = 0;
    this.crounWinner = null;
    this.crounLockTimer = 0;

    // Remove previous ball if any
    if (this.crounBall) {
      try { this.world.removeCollider(this.crounBall.collider, false); } catch (_) {}
      try { this.world.removeRigidBody(this.crounBall.body); } catch (_) {}
      this.crounBall = null;
    }

    const c = this.crounCenter;
    const launchAngle = Math.random() * Math.PI * 2;
    const spawnX = c.x + Math.cos(launchAngle) * 2.15;
    const spawnZ = c.z + Math.sin(launchAngle) * 2.15;
    const spawnY = c.y + 0.85;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnX, spawnY, spawnZ)
      .setLinearDamping(0.08)
      .setAngularDamping(0.05);
    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(0.22)
      .setRestitution(0.25)
      .setFriction(0.10)
      .setMass(2.0);
    const collider = this.world.createCollider(colliderDesc, body);

    // Give high tangential velocity for orbital rotation
    const tangentX = -Math.sin(launchAngle) * 4.2;
    const tangentZ = Math.cos(launchAngle) * 4.2;
    body.setLinvel({ x: tangentX, y: -0.3, z: tangentZ }, true);

    this.crounBall = { body, collider };
  }

  /**
   * Apply Shake Impulse to Field
   */
  public applyShakeImpulse() {
    if (!this.isInitialized) return;

    // Apply forward and slight upward impulse to all dynamic coins and balls
    this.coins.forEach(c => {
      const impulse = {
        x: (Math.random() - 0.5) * 0.4,
        y: 0.8 + Math.random() * 0.4,
        z: 2.2 + Math.random() * 0.8,
      };
      c.body.applyImpulse(impulse, true);
    });

    this.balls.forEach(b => {
      b.body.applyImpulse({ x: 0, y: 1.5, z: 4.5 }, true);
    });
  }

  /**
   * Physics Update Step (Fixed 60Hz)
   */
  public step(dt: number) {
    if (!this.isInitialized) return;

    // Fixed-timestep accumulator: world.step() always advances 1/60s, so we must
    // run exactly as many sub-steps as real time elapsed. Otherwise the game runs
    // 2x speed on 120Hz displays and slow-motion on 30fps devices.
    this.stepAccumulator += dt;
    let subSteps = 0;
    while (this.stepAccumulator >= PhysicsWorld.FIXED_DT && subSteps < 4) {
      this.fixedStep(PhysicsWorld.FIXED_DT);
      this.stepAccumulator -= PhysicsWorld.FIXED_DT;
      subSteps++;
    }
    if (subSteps >= 4) {
      this.stepAccumulator = 0; // Drop backlog instead of spiralling
    }
  }

  private fixedStep(dt: number) {
    // 1. Move Pusher (Sinusoidal oscillation)
    const speedMultiplier = this.isFeverSpeed ? 2.0 : 1.0;
    this.pusherTime += dt * this.pusherSpeed * speedMultiplier;
    const pusherOffset = Math.sin(this.pusherTime) * this.pusherStroke * 0.5;
    const newPusherZ = this.pusherBaseZ + pusherOffset;
    this.pusherBody.setNextKinematicTranslation({ x: 0, y: 0.38, z: newPusherZ });

    // 2. Move 2x Multiplier Gate
    this.gateTime += dt * 1.5;
    this.gateX = Math.sin(this.gateTime) * 0.95;
    this.gateBody.setNextKinematicTranslation({ x: this.gateX, y: 1.15, z: -1.35 });

    // 3. Smoothly Animate Fever Shield
    this.currentShieldY += (this.targetShieldY - this.currentShieldY) * 0.1;
    this.leftShieldBody.setNextKinematicTranslation({ x: -1.54, y: this.currentShieldY, z: -0.05 });
    this.rightShieldBody.setNextKinematicTranslation({ x: 1.54, y: this.currentShieldY, z: -0.05 });

    // 4. Run Physics Step
    this.world.step();

    // 5. Check Gate Collisions (Sensor Intersection right above pusher)
    if (this.gateCooldown > 0) {
      this.gateCooldown -= dt;
    }
    const gatePos = this.gateBody.translation();
    const gateSpawns: Array<{ x: number; y: number; z: number }> = [];
    this.coins.forEach(coin => {
      if (coin.passedGate) return;
      const pos = coin.body.translation();
      const dist = Math.hypot(pos.x - gatePos.x, pos.y - gatePos.y, pos.z - gatePos.z);
      if (dist < 0.26) { // Difficulty: tighter gate window (was 0.40)
        coin.passedGate = true;
        if (this.gateCooldown <= 0) {
          this.gateCooldown = 0.60; // Difficulty: 600ms cooldown (was 200ms)
          if (this.onGateHit) {
            this.onGateHit({ x: pos.x, y: pos.y, z: pos.z });
          }
          gateSpawns.push({ x: pos.x, y: pos.y, z: pos.z });
        }
      }
    });
    // Spawn duplicate coins after iteration (spawnCoin may prune entries from this.coins)
    gateSpawns.forEach(p => {
      this.spawnCoin(p.x + (Math.random() - 0.5) * 0.1, p.y + 0.08, p.z, true);
    });

    // 6. Check Chucker Hit (at Z ~ 0.35 on shortened lower deck)
    const chuckerPos = { x: 0, y: 0.18, z: 0.35 };
    this.coins.forEach(coin => {
      if (coin.hitChucker) return;
      const pos = coin.body.translation();
      if (Math.abs(pos.x - chuckerPos.x) < 0.16 && Math.abs(pos.z - chuckerPos.z) < 0.10 && Math.abs(pos.y - chuckerPos.y) < 0.25) {
        coin.hitChucker = true;
        if (this.onChuckerHit) {
          this.onChuckerHit();
        }
      }
    });

    // 7. Check Croun Ball Pocket Landing
    if (this.isCrounActive && this.crounBall) {
      this.crounTimer += dt;
      const bPos = this.crounBall.body.translation();
      const vel = this.crounBall.body.linvel();
      const speed = Math.hypot(vel.x, vel.y, vel.z);

      if (!this.crounWinner) {
        // 7a. Natural pocket collision check:
        // Ball drops down into the hollow cup (depth Y <= pocket.y + 0.22, distance < 0.28, settled speed < 2.2)
        for (const pocket of this.crounPockets) {
          const dist = Math.hypot(bPos.x - pocket.position.x, bPos.z - pocket.position.z);
          if (dist < 0.28 && bPos.y <= pocket.position.y + 0.22 && speed < 2.2) {
            this.crounWinner = pocket;
            this.crounLockTimer = 2.4;
            if (this.onCrounLockIn) {
              this.onCrounLockIn(pocket.type, pocket.index);
            }
            break;
          }
        }

        // 7b. Settled or timeout safety check (roulette completes naturally in 4-8s)
        if (!this.crounWinner && (this.crounTimer > 8.0 || (this.crounTimer > 3.5 && speed < 0.30))) {
          let minDist = 999;
          let closestPocket = this.crounPockets[0];
          for (const pocket of this.crounPockets) {
            const dist = Math.hypot(bPos.x - pocket.position.x, bPos.z - pocket.position.z);
            if (dist < minDist) {
              minDist = dist;
              closestPocket = pocket;
            }
          }
          this.crounWinner = closestPocket;
          this.crounLockTimer = 2.4;
          if (this.onCrounLockIn) {
            this.onCrounLockIn(closestPocket.type, closestPocket.index);
          }
        }

        // 7c. Fallback if ball somehow escapes
        if (!this.crounWinner && bPos.y < this.crounCenter.y - 1.5) {
          const randomPocket = this.crounPockets[Math.floor(Math.random() * this.crounPockets.length)];
          this.crounWinner = randomPocket;
          this.crounLockTimer = 2.4;
          if (this.onCrounLockIn) {
            this.onCrounLockIn(randomPocket.type, randomPocket.index);
          }
        }
      } else {
        // Winner is locked in! The ball visibly rests and settles inside the pocket cup!
        this.crounLockTimer -= dt;
        if (this.crounLockTimer <= 0) {
          const resultType = this.crounWinner.type;
          this.isCrounActive = false;
          if (this.crounBall) {
            try { this.world.removeCollider(this.crounBall.collider, false); } catch (_) {}
            try { this.world.removeRigidBody(this.crounBall.body); } catch (_) {}
            this.crounBall = null;
          }
          this.crounWinner = null;
          if (this.onCrounResult) {
            this.onCrounResult(resultType);
          }
        }
      }
    }

    // 8. Process Payouts, Side Losses, and Cleanups
    let payoutCount = 0;
    let sideLostCount = 0;
    const coinsToRemove: number[] = [];

    this.coins.forEach(coin => {
      const pos = coin.body.translation();

      // Front Payout zone: pushed forward off the shortened lower deck edge (Z > 0.8)
      if (pos.z > 0.82 && pos.y < 0.15) {
        payoutCount++;
        coinsToRemove.push(coin.id);
      }
      // Left/Right Side Lost Gutter
      else if ((pos.x < -1.56 || pos.x > 1.56) && pos.y < 0.05 && pos.z > -0.9) {
        sideLostCount++;
        coinsToRemove.push(coin.id);
      }
      // Void fall cleanup
      else if (pos.y < -2.0) {
        coinsToRemove.push(coin.id);
      }
    });

    coinsToRemove.forEach(id => {
      const c = this.coins.get(id);
      if (c) {
        try { this.world.removeCollider(c.collider, false); } catch (_) {}
        try { this.world.removeRigidBody(c.body); } catch (_) {}
        this.coins.delete(id);
      }
    });

    if (payoutCount > 0 && this.onPayoutCoin) {
      this.onPayoutCoin(payoutCount);
    }
    if (sideLostCount > 0 && this.onSideLostCoin) {
      this.onSideLostCoin(sideLostCount);
    }

    // Process Balls Payout
    const ballsToRemove: number[] = [];
    this.balls.forEach(ball => {
      const pos = ball.body.translation();
      if (pos.z > 0.82 && pos.y < 0.25) {
        ballsToRemove.push(ball.id);
        if (this.onBallPayout) {
          this.onBallPayout();
        }
      } else if (pos.y < -2.0) {
        ballsToRemove.push(ball.id);
      }
    });

    ballsToRemove.forEach(id => {
      const b = this.balls.get(id);
      if (b) {
        try { this.world.removeCollider(b.collider, false); } catch (_) {}
        try { this.world.removeRigidBody(b.body); } catch (_) {}
        this.balls.delete(id);
      }
    });
  }

  /**
   * Seed field with an initial bed of thick medals across lower deck and pusher deck
   */
  public seedInitialMedals(count = 70) {
    // 1. Lower deck bed (Z = -0.5 to +0.6). Deck top is Y=0.15, coin half-height 0.046.
    const lowerCount = Math.floor(count * 0.65);
    for (let i = 0; i < lowerCount; i++) {
      const x = (Math.random() - 0.5) * 2.4;
      const z = -0.5 + Math.random() * 1.1;
      const y = 0.20 + (i % 4) * 0.10;
      const coin = this.spawnCoin(x, y, z, true);
      if (coin) {
        coin.hitChucker = true; // Seeded coins must not award chucker stock
        coin.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }

    // 2. Moving pusher deck bed (Z = -1.6 to -1.1). Pusher top is Y=0.60.
    const pusherCount = count - lowerCount;
    for (let i = 0; i < pusherCount; i++) {
      const x = (Math.random() - 0.5) * 2.2;
      const z = -1.6 + Math.random() * 0.5;
      const y = 0.66 + (i % 3) * 0.10;
      const coin = this.spawnCoin(x, y, z, true);
      if (coin) {
        coin.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }
}
