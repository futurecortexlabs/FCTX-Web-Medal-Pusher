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

  // Trackers
  public coins: Map<number, CoinInstance> = new Map();
  public balls: Map<number, BallInstance> = new Map();
  private nextEntityId = 1;

  // Kinematic Pusher
  public pusherBody!: RAPIER.RigidBody;
  private pusherBaseZ = -1.8;
  private pusherStroke = 1.0;
  private pusherSpeed = 1.5;
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

  // Event callbacks
  public onPayoutCoin: ((count: number) => void) | null = null;
  public onSideLostCoin: ((count: number) => void) | null = null;
  public onChuckerHit: (() => void) | null = null;
  public onGateHit: ((pos: { x: number; y: number; z: number }) => void) | null = null;
  public onBallPayout: (() => void) | null = null;
  public onCrounResult: ((type: '50' | '100_tower' | 'jp') => void) | null = null;

  public async init() {
    await RAPIER.init();
    const gravity = new RAPIER.Vector3(0.0, -9.81 * 2.2, 0.0); // Slightly amplified gravity for arcade snappy feel
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
   */
  private createField() {
    // Upper stationary deck (behind pusher)
    const upperDeckDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.5, -3.2);
    const upperDeckBody = this.world.createRigidBody(upperDeckDesc);
    const upperDeckColliderDesc = RAPIER.ColliderDesc.cuboid(1.8, 0.2, 1.2)
      .setFriction(0.4)
      .setRestitution(0.05);
    this.world.createCollider(upperDeckColliderDesc, upperDeckBody);

    // Lower stationary deck (in front of pusher)
    const lowerDeckDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.0, 0.8);
    const lowerDeckBody = this.world.createRigidBody(lowerDeckDesc);
    const lowerDeckColliderDesc = RAPIER.ColliderDesc.cuboid(1.7, 0.2, 1.8)
      .setFriction(0.4)
      .setRestitution(0.05);
    this.world.createCollider(lowerDeckColliderDesc, lowerDeckBody);

    // Slope feeder at top back
    const slopeDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, 1.8, -4.6)
      .setRotation({ x: 0.35, y: 0, z: 0, w: 0.936 });
    const slopeBody = this.world.createRigidBody(slopeDesc);
    const slopeColliderDesc = RAPIER.ColliderDesc.cuboid(1.8, 0.05, 1.0)
      .setFriction(0.2)
      .setRestitution(0.1);
    this.world.createCollider(slopeColliderDesc, slopeBody);

    // Rear wall
    const backWallDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 2.5, -5.5);
    const backWall = this.world.createRigidBody(backWallDesc);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(2.2, 2.5, 0.1), backWall);

    // Side outer containment walls
    const leftOuterWall = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-2.2, 1.0, -1.5));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 2.0, 4.0).setRestitution(0.2), leftOuterWall);

    const rightOuterWall = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(2.2, 1.0, -1.5));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 2.0, 4.0).setRestitution(0.2), rightOuterWall);

    // Slope deflector pins (nails) for realistic pachinko drop scatter
    const pinPositions = [
      { x: -1.0, y: 1.5, z: -4.4 }, { x: -0.3, y: 1.5, z: -4.4 }, { x: 0.4, y: 1.5, z: -4.4 }, { x: 1.1, y: 1.5, z: -4.4 },
      { x: -0.7, y: 1.2, z: -4.0 }, { x: 0.0, y: 1.2, z: -4.0 }, { x: 0.7, y: 1.2, z: -4.0 },
      { x: -1.2, y: 0.9, z: -3.6 }, { x: -0.4, y: 0.9, z: -3.6 }, { x: 0.4, y: 0.9, z: -3.6 }, { x: 1.2, y: 0.9, z: -3.6 },
    ];
    for (const p of pinPositions) {
      const pinBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z));
      this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.2, 0.04).setRestitution(0.5), pinBody);
    }
  }

  /**
   * Kinematic Pusher Setup
   */
  private createPusher() {
    const pusherDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.45, this.pusherBaseZ);
    this.pusherBody = this.world.createRigidBody(pusherDesc);
    // Pusher box: high top friction 0.85 per spec
    const pusherCollider = RAPIER.ColliderDesc.cuboid(1.7, 0.25, 0.9)
      .setFriction(0.85)
      .setRestitution(0.05);
    this.world.createCollider(pusherCollider, this.pusherBody);
  }

  /**
   * Side Fever Shield Walls
   */
  private createShields() {
    // Left shield
    const leftDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-1.75, this.currentShieldY, 0.8);
    this.leftShieldBody = this.world.createRigidBody(leftDesc);
    const shieldColliderDesc = RAPIER.ColliderDesc.cuboid(0.08, 0.5, 1.8)
      .setRestitution(0.1)
      .setFriction(0.3);
    this.world.createCollider(shieldColliderDesc, this.leftShieldBody);

    // Right shield
    const rightDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(1.75, this.currentShieldY, 0.8);
    this.rightShieldBody = this.world.createRigidBody(rightDesc);
    this.world.createCollider(shieldColliderDesc, this.rightShieldBody);
  }

  /**
   * Moving 2x Gate Trigger
   */
  private create2xGate() {
    const gateDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.3, -3.2);
    this.gateBody = this.world.createRigidBody(gateDesc);
    const gateColDesc = RAPIER.ColliderDesc.cuboid(0.35, 0.35, 0.2)
      .setSensor(true);
    this.gateCollider = this.world.createCollider(gateColDesc, this.gateBody);
  }

  /**
   * Chucker Sensor (Center-lower deck)
   */
  private createChucker() {
    const chuckerDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.25, 1.1);
    const chuckerBody = this.world.createRigidBody(chuckerDesc);
    const chuckerColDesc = RAPIER.ColliderDesc.cuboid(0.35, 0.15, 0.2)
      .setSensor(true);
    this.chuckerCollider = this.world.createCollider(chuckerColDesc, chuckerBody);
  }

  /**
   * Croun Bowl & 6 Pockets (Physical Jackpot Roulette)
   */
  private createCroun() {
    const c = this.crounCenter;
    // Bowl base bowl collider rings
    const segments = 24;
    const radius = 2.4;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = c.x + Math.cos(angle) * radius;
      const z = c.z + Math.sin(angle) * radius;
      const rimBody = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(x, c.y + 0.6, z)
          .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
      );
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.35, 0.6, 0.1).setRestitution(0.4).setFriction(0.1), rimBody);
    }

    // Sloped bowl floor plates
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const rInner = 1.3;
      const px = c.x + Math.cos(angle) * rInner;
      const pz = c.z + Math.sin(angle) * rInner;
      const plateBody = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(px, c.y + 0.1, pz)
          .setRotation({ x: -Math.cos(angle) * 0.15, y: 0, z: -Math.sin(angle) * 0.15, w: 0.98 })
      );
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.05, 0.3).setFriction(0.1).setRestitution(0.2), plateBody);
    }

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

    const pocketRadius = 0.85;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const px = c.x + Math.cos(angle) * pocketRadius;
      const py = c.y - 0.2;
      const pz = c.z + Math.sin(angle) * pocketRadius;

      const pBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(px, py, pz));
      const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.22, 0.15, 0.22).setSensor(true), pBody);

      this.crounPockets.push({
        index: i,
        type: pocketTypes[i],
        position: { x: px, y: py, z: pz },
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
   */
  public spawnCoin(x: number, y: number = 2.4, z: number = -4.8, isBonus = false): CoinInstance | null {
    if (!this.isInitialized) return null;

    // Spec parameters: Mass 1.0kg, Restitution 0.05, Friction 0.50
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.2)
      .setAngularDamping(0.3);
    const body = this.world.createRigidBody(bodyDesc);

    // Radius 0.16m, half-height 0.02m (thick coin cylinder)
    const colliderDesc = RAPIER.ColliderDesc.cylinder(0.02, 0.16)
      .setRestitution(0.05)
      .setFriction(0.5)
      .setMass(1.0);
    const collider = this.world.createCollider(colliderDesc, body);

    // Initial slight random nudge
    body.applyImpulse({ x: (Math.random() - 0.5) * 0.1, y: -0.2, z: 0.1 }, true);

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
   * Spawn a Color Ball (Sphere)
   * Spec: Mass 4.5kg, Radius 0.45m, Restitution 0.15, Friction 0.30
   */
  public spawnBall(x: number = 0, y: number = 2.6, z: number = -4.5): BallInstance | null {
    if (!this.isInitialized) return null;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.1)
      .setAngularDamping(0.1);
    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(0.42)
      .setRestitution(0.15)
      .setFriction(0.3)
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
   * Spawn Medal Tower (50 vertical stacked coins)
   * Spec: 50 coins stack, collapses in dramatic avalanche
   */
  public spawnMedalTower(centerX: number = 0, centerZ: number = -2.6) {
    if (!this.isInitialized) return;

    const layers = 10;
    const coinsPerLayer = 5;
    const layerRadius = 0.28;
    const startY = 0.7;

    for (let l = 0; l < layers; l++) {
      const y = startY + l * 0.055;
      for (let c = 0; c < coinsPerLayer; c++) {
        const angle = (c / coinsPerLayer) * Math.PI * 2 + (l % 2) * 0.3;
        const x = centerX + Math.cos(angle) * layerRadius;
        const z = centerZ + Math.sin(angle) * layerRadius;

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, y, z)
          .setLinearDamping(0.3)
          .setAngularDamping(0.4);
        const body = this.world.createRigidBody(bodyDesc);

        // Tower coins tuning: Friction 0.6, Restitution 0.02, Mass 1.0kg
        const colliderDesc = RAPIER.ColliderDesc.cylinder(0.02, 0.16)
          .setRestitution(0.02)
          .setFriction(0.6)
          .setMass(1.0);
        const collider = this.world.createCollider(colliderDesc, body);

        // Put to sleep until disturbed by pusher or impact (per spec: "スリープ状態でドスンと落下。重心崩壊で一気に拡散")
        body.sleep();

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
      if (p.y > -0.5 && p.y < 3.0 && p.z > -4.5 && p.z < 2.5) {
        coinsData.push({ x: p.x, y: p.y, z: p.z });
      }
    });

    const ballsData: Array<{ x: number; y: number; z: number }> = [];
    this.balls.forEach(ball => {
      const p = ball.body.translation();
      if (p.y > -0.5 && p.z > -4.5 && p.z < 2.5) {
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
      this.world.removeCollider(c.collider, false);
      this.world.removeRigidBody(c.body);
    });
    this.coins.clear();

    this.balls.forEach(b => {
      this.world.removeCollider(b.collider, false);
      this.world.removeRigidBody(b.body);
    });
    this.balls.clear();

    if (savedState.coins && savedState.coins.length > 0) {
      savedState.coins.forEach(c => {
        const coin = this.spawnCoin(c.x, c.y, c.z, true);
        if (coin) coin.body.sleep();
      });
    } else {
      this.seedInitialMedals(80);
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
    if (!this.isInitialized || this.isCrounActive) return;
    this.isCrounActive = true;

    // Remove previous ball if any
    if (this.crounBall) {
      this.world.removeCollider(this.crounBall.collider, false);
      this.world.removeRigidBody(this.crounBall.body);
      this.crounBall = null;
    }

    const c = this.crounCenter;
    const launchAngle = Math.random() * Math.PI * 2;
    const spawnX = c.x + Math.cos(launchAngle) * 2.2;
    const spawnZ = c.z + Math.sin(launchAngle) * 2.2;
    const spawnY = c.y + 0.9;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnX, spawnY, spawnZ)
      .setLinearDamping(0.08)
      .setAngularDamping(0.05);
    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(0.24)
      .setRestitution(0.5)
      .setFriction(0.08)
      .setMass(2.0);
    const collider = this.world.createCollider(colliderDesc, body);

    // Give high tangential velocity for orbital rotation
    const tangentX = -Math.sin(launchAngle) * 4.2;
    const tangentZ = Math.cos(launchAngle) * 4.2;
    body.setLinvel({ x: tangentX, y: -0.5, z: tangentZ }, true);

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
        z: 1.8 + Math.random() * 0.6,
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

    // 1. Move Pusher
    const speedMultiplier = this.isFeverSpeed ? 2.0 : 1.0;
    this.pusherTime += dt * this.pusherSpeed * speedMultiplier;
    const pusherOffset = Math.sin(this.pusherTime) * this.pusherStroke * 0.5;
    const newPusherZ = this.pusherBaseZ + pusherOffset;
    this.pusherBody.setNextKinematicTranslation({ x: 0, y: 0.45, z: newPusherZ });

    // 2. Move 2x Multiplier Gate
    this.gateTime += dt * 1.4;
    this.gateX = Math.sin(this.gateTime) * 1.1;
    this.gateBody.setNextKinematicTranslation({ x: this.gateX, y: 1.3, z: -3.2 });

    // 3. Smoothly Animate Fever Shield
    this.currentShieldY += (this.targetShieldY - this.currentShieldY) * 0.1;
    this.leftShieldBody.setNextKinematicTranslation({ x: -1.75, y: this.currentShieldY, z: 0.8 });
    this.rightShieldBody.setNextKinematicTranslation({ x: 1.75, y: this.currentShieldY, z: 0.8 });

    // 4. Run Physics Step
    this.world.step();

    // 5. Check Gate Collisions (Sensor Intersection)
    const gatePos = this.gateBody.translation();
    this.coins.forEach(coin => {
      if (coin.passedGate) return;
      const pos = coin.body.translation();
      const dist = Math.hypot(pos.x - gatePos.x, pos.y - gatePos.y, pos.z - gatePos.z);
      if (dist < 0.45) {
        coin.passedGate = true;
        if (this.onGateHit) {
          this.onGateHit({ x: pos.x, y: pos.y, z: pos.z });
        }
        // Spawn additional duplicate coin immediately
        this.spawnCoin(pos.x + (Math.random() - 0.5) * 0.1, pos.y + 0.05, pos.z, true);
      }
    });

    // 6. Check Chucker Hit
    const chuckerPos = { x: 0, y: 0.25, z: 1.1 };
    this.coins.forEach(coin => {
      if (coin.hitChucker) return;
      const pos = coin.body.translation();
      if (Math.abs(pos.x - chuckerPos.x) < 0.35 && Math.abs(pos.z - chuckerPos.z) < 0.22 && Math.abs(pos.y - chuckerPos.y) < 0.25) {
        coin.hitChucker = true;
        if (this.onChuckerHit) {
          this.onChuckerHit();
        }
      }
    });

    // 7. Check Croun Ball Pocket Landing
    if (this.isCrounActive && this.crounBall) {
      const bPos = this.crounBall.body.translation();
      const vel = this.crounBall.body.linvel();
      const speed = Math.hypot(vel.x, vel.y, vel.z);

      for (const pocket of this.crounPockets) {
        const dist = Math.hypot(bPos.x - pocket.position.x, bPos.z - pocket.position.z);
        if (dist < 0.24 && bPos.y <= pocket.position.y + 0.22 && speed < 1.8) {
          // Ball settled in pocket!
          const resultType = pocket.type;
          this.isCrounActive = false;
          if (this.onCrounResult) {
            this.onCrounResult(resultType);
          }
          break;
        }
      }

      // Safeguard: if Croun ball stalls or falls outside
      if (bPos.y < this.crounCenter.y - 1.5) {
        this.isCrounActive = false;
        // Fallback to random pocket result
        const fallback = this.crounPockets[Math.floor(Math.random() * this.crounPockets.length)].type;
        if (this.onCrounResult) this.onCrounResult(fallback);
      }
    }

    // 8. Process Payouts, Side Losses, and Cleanups
    let payoutCount = 0;
    let sideLostCount = 0;
    const coinsToRemove: number[] = [];

    this.coins.forEach(coin => {
      const pos = coin.body.translation();

      // Front Payout zone: pushed forward off the bottom deck
      if (pos.z > 2.6 && pos.y < 0.1) {
        payoutCount++;
        coinsToRemove.push(coin.id);
      }
      // Left/Right Side Lost Gutter
      else if ((pos.x < -1.78 || pos.x > 1.78) && pos.y < -0.1 && pos.z > -1.5) {
        sideLostCount++;
        coinsToRemove.push(coin.id);
      }
      // Void fall cleanup
      else if (pos.y < -2.5) {
        coinsToRemove.push(coin.id);
      }
    });

    coinsToRemove.forEach(id => {
      const c = this.coins.get(id);
      if (c) {
        this.world.removeCollider(c.collider, false);
        this.world.removeRigidBody(c.body);
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
      if (pos.z > 2.6 && pos.y < 0.2) {
        ballsToRemove.push(ball.id);
        if (this.onBallPayout) {
          this.onBallPayout();
        }
      } else if (pos.y < -2.5) {
        ballsToRemove.push(ball.id);
      }
    });

    ballsToRemove.forEach(id => {
      const b = this.balls.get(id);
      if (b) {
        this.world.removeCollider(b.collider, false);
        this.world.removeRigidBody(b.body);
        this.balls.delete(id);
      }
    });
  }

  /**
   * Seed field with an initial bed of medals for instant fun
   */
  public seedInitialMedals(count = 70) {
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 2.8;
      const z = -0.8 + Math.random() * 2.8;
      const y = 0.2 + (i % 3) * 0.05;
      const coin = this.spawnCoin(x, y, z, true);
      if (coin) {
        coin.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }
}
