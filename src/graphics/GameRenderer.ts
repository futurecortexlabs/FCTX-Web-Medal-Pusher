import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';

export class GameRenderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement;

  // Visual Meshes
  private coinInstancedMesh!: THREE.InstancedMesh;
  private maxCoins = 400;
  private dummyTransform = new THREE.Object3D();

  private ballMeshes: Map<number, THREE.Group> = new Map();
  private crounBallMesh: THREE.Mesh | null = null;
  private ballOuterGeo = new THREE.SphereGeometry(0.40, 24, 24);
  private ballOuterMat = new THREE.MeshStandardMaterial({
    color: 0xd946ef,
    metalness: 0.85,
    roughness: 0.15,
    emissive: 0xa855f7,
    emissiveIntensity: 0.5,
  });
  private ballInnerGeo = new THREE.SphereGeometry(0.20, 16, 16);
  private ballInnerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // Field Meshes
  private pusherMesh!: THREE.Mesh;
  private leftShieldMesh!: THREE.Mesh;
  private rightShieldMesh!: THREE.Mesh;
  private gateMesh!: THREE.Group;
  private chuckerMesh!: THREE.Mesh;
  private crounGroup!: THREE.Group;
  private shooterGuideMesh!: THREE.Mesh;
  private crounPocketRings: THREE.Mesh[] = [];
  private crounPocketFloors: THREE.Mesh[] = [];
  private crounPocketColors: number[] = [
    0xff00ff, // 0: GRAND JACKPOT Rainbow
    0xfbbf24, // 1: 100+Tower Yellow
    0x38bdf8, // 2: 50 Blue
    0x38bdf8, // 3: 50 Blue
    0xfbbf24, // 4: 100+Tower Yellow
    0x38bdf8, // 5: 50 Blue
  ];
  private winningPocketIndex: number | null = null;
  private crounAnimTime = 0;

  // Camera animation: positioned closer and wider for an immersive full-screen arcade perspective
  private targetCameraPos = new THREE.Vector3(0, 3.3, 2.1);
  private targetCameraLookAt = new THREE.Vector3(0, 0.2, -0.65);
  private currentCameraLookAt = new THREE.Vector3(0, 0.2, -0.65);
  public isCrounView = false;
  private shakeOffset = new THREE.Vector3();
  private shakeDuration = 0;
  private shakeIntensity = 0.35;

  // Particle systems
  private sparkles: THREE.Points | null = null;
  private sparklePositions: Float32Array = new Float32Array(300 * 3);
  private sparkleVelocities: Float32Array = new Float32Array(300 * 3);
  private sparkleLifetimes: Float32Array = new Float32Array(300);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060814);
    this.scene.fog = new THREE.FogExp2(0x060814, 0.04);

    this.camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / window.innerHeight,
      0.1,
      50
    );
    this.camera.position.copy(this.targetCameraPos);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.setupLights();
    this.setupStaticDecorations();
    this.setupInstancedCoins();
    this.setupPusherAndShields();
    this.setup2xGate();
    this.setupChucker();
    this.setupShooterGuide();
    this.setupCrounVisual();
    this.setupParticles();

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private setupLights() {
    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambient);

    // Main golden spotlight from above front onto pusher deck
    const mainSpot = new THREE.SpotLight(0xffe28a, 2.8);
    mainSpot.position.set(0, 7.5, 1.5);
    mainSpot.angle = Math.PI / 3.5;
    mainSpot.penumbra = 0.4;
    mainSpot.castShadow = true;
    mainSpot.shadow.mapSize.width = 1024;
    mainSpot.shadow.mapSize.height = 1024;
    this.scene.add(mainSpot);

    // Neon accent edge rim lights
    const blueRim = new THREE.PointLight(0x00d4ff, 2.0, 8);
    blueRim.position.set(-2.2, 1.5, -0.4);
    this.scene.add(blueRim);

    const magentaRim = new THREE.PointLight(0xff007f, 2.0, 8);
    magentaRim.position.set(2.2, 1.5, -0.4);
    this.scene.add(magentaRim);

    // Croun Stage High-Intensity Multi-Angle Lighting
    const crounSpot = new THREE.SpotLight(0xfff8e7, 6.5);
    crounSpot.position.set(0, 12.0, -0.6);
    crounSpot.target.position.set(0, 7.0, -1.0);
    crounSpot.angle = Math.PI / 2.6;
    crounSpot.penumbra = 0.2;
    this.scene.add(crounSpot);
    this.scene.add(crounSpot.target);

    // Warm golden flood light in center of Croun bowl
    const crounCenterLight = new THREE.PointLight(0xffe28a, 4.5, 9);
    crounCenterLight.position.set(0, 7.8, -1.0);
    this.scene.add(crounCenterLight);

    // Cyan and Rose accent lights for rim sparkle and pocket clarity
    const crounCyan = new THREE.PointLight(0x38bdf8, 3.5, 8);
    crounCyan.position.set(-2.5, 8.5, -1.0);
    this.scene.add(crounCyan);

    const crounRose = new THREE.PointLight(0xf43f5e, 3.5, 8);
    crounRose.position.set(2.5, 8.5, -1.0);
    this.scene.add(crounRose);
  }

  private setupStaticDecorations() {
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x181c2e,
      roughness: 0.25,
      metalness: 0.85,
    });

    // Lower Deck platform (matches physics cuboid 1.5 x 0.15 x 0.85 at Y=0 → top surface Y=0.15)
    const lowerDeck = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.3, 1.7), deckMat);
    lowerDeck.position.set(0, 0.0, -0.05);
    lowerDeck.receiveShadow = true;
    this.scene.add(lowerDeck);

    // Lower deck glowing side trims
    const trimMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const leftTrim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 1.7), trimMat);
    leftTrim.position.set(-1.5, 0.16, -0.05);
    this.scene.add(leftTrim);
    const rightTrim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 1.7), trimMat);
    rightTrim.position.set(1.5, 0.16, -0.05);
    this.scene.add(rightTrim);

    // Front Payout Edge Glow Bar
    const payoutGlowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const payoutBar = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.04, 0.04), payoutGlowMat);
    payoutBar.position.set(0, 0.15, 0.8);
    this.scene.add(payoutBar);

    // Upper stationary rear pusher back-wall (matches physics cuboid 1.6 x 0.4 x 0.1 at Y=0.8)
    const upperBack = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.8, 0.2), deckMat);
    upperBack.position.set(0, 0.8, -1.95);
    upperBack.receiveShadow = true;
    this.scene.add(upperBack);

    // Upper back slope / feeder guide (matches physics quaternion x=0.35 → ~0.715 rad)
    const slopeMat = new THREE.MeshStandardMaterial({ color: 0x111625, roughness: 0.3, metalness: 0.6 });
    const backSlope = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 1.2), slopeMat);
    backSlope.position.set(0, 1.4, -2.4);
    backSlope.rotation.x = 2 * Math.asin(0.35);
    this.scene.add(backSlope);

    // Outer Cabinet Frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a0f1d, roughness: 0.4, metalness: 0.7 });
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.5, 4.5), frameMat);
    leftWall.position.set(-1.85, 0.8, -0.7);
    this.scene.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.5, 4.5), frameMat);
    rightWall.position.set(1.85, 0.8, -0.7);
    this.scene.add(rightWall);
  }

  private setupInstancedCoins() {
    // Thick substantial shiny gold coin geometry: radius 0.18, height 0.09!
    const coinGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.09, 24);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xffc800,
      metalness: 0.92,
      roughness: 0.16,
    });

    this.coinInstancedMesh = new THREE.InstancedMesh(coinGeo, coinMat, this.maxCoins);
    this.coinInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinInstancedMesh.castShadow = true;
    this.coinInstancedMesh.receiveShadow = true;
    this.scene.add(this.coinInstancedMesh);
  }

  private setupPusherAndShields() {
    // Kinematic Pusher body (width 3.0m, height 0.44m, length 1.2m)
    const pusherGeo = new THREE.BoxGeometry(3.0, 0.44, 1.2);
    const pusherMat = new THREE.MeshStandardMaterial({
      color: 0x22283e,
      metalness: 0.8,
      roughness: 0.3,
    });
    this.pusherMesh = new THREE.Mesh(pusherGeo, pusherMat);
    this.pusherMesh.position.set(0, 0.38, -1.35);
    this.pusherMesh.castShadow = true;
    this.pusherMesh.receiveShadow = true;

    // Glowing front LED strip on pusher
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    const frontLed = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.06, 0.04), ledMat);
    frontLed.position.set(0, 0.12, 0.61);
    this.pusherMesh.add(frontLed);
    this.scene.add(this.pusherMesh);

    // Fever Golden Shields (Left & Right)
    const shieldGeo = new THREE.BoxGeometry(0.12, 0.8, 1.7);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.95,
      roughness: 0.1,
      emissive: 0x664400,
    });

    this.leftShieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.leftShieldMesh.position.set(-1.54, -1.0, -0.05);
    this.scene.add(this.leftShieldMesh);

    this.rightShieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.rightShieldMesh.position.set(1.54, -1.0, -0.05);
    this.scene.add(this.rightShieldMesh);
  }

  private setup2xGate() {
    this.gateMesh = new THREE.Group();

    const archMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.6,
      metalness: 0.8,
      roughness: 0.2,
    });

    const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5), archMat);
    leftPost.position.set(-0.35, 0, 0);
    const rightPost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5), archMat);
    rightPost.position.set(0.35, 0, 0);
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.08, 0.08), archMat);
    topBar.position.set(0, 0.25, 0);

    // Glowing badge in center
    const badgeMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.02), badgeMat);
    sign.position.set(0, 0.25, 0.04);

    this.gateMesh.add(leftPost);
    this.gateMesh.add(rightPost);
    this.gateMesh.add(topBar);
    this.gateMesh.add(sign);
    this.gateMesh.position.set(0, 1.15, -1.35);
    this.scene.add(this.gateMesh);
  }

  private setupShooterGuide() {
    // 3D Coin Drop Chute / Nozzle directly visible above the moving pusher deck
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      metalness: 0.7,
      roughness: 0.2,
    });
    this.shooterGuideMesh = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 16), nozzleMat);
    this.shooterGuideMesh.rotation.x = Math.PI; // point downwards
    this.shooterGuideMesh.position.set(0, 1.45, -1.45);
    this.scene.add(this.shooterGuideMesh);
  }

  public updateShooterPosition(x: number) {
    if (this.shooterGuideMesh) {
      this.shooterGuideMesh.position.x = x;
    }
  }

  private setupChucker() {
    const chuckerGeo = new THREE.BoxGeometry(0.32, 0.08, 0.2);
    const chuckerMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });
    this.chuckerMesh = new THREE.Mesh(chuckerGeo, chuckerMat);
    this.chuckerMesh.position.set(0, 0.13, 0.35); // Nearly flush with deck top (Y=0.15)

    const lampMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16), lampMat);
    lamp.position.set(0, 0.05, 0);
    this.chuckerMesh.add(lamp);
    this.scene.add(this.chuckerMesh);
  }

  private setupCrounVisual() {
    this.crounGroup = new THREE.Group();
    const c = { x: 0, y: 7.0, z: -1.0 };
    this.crounGroup.position.set(c.x, c.y, c.z);

    // 1. Outer Rim Vertical Wall (Y = 0.70 to 1.20, radius 2.4m)
    const rimWallGeo = new THREE.CylinderGeometry(2.4, 2.4, 0.50, 36, 1, true);
    const rimWallMat = new THREE.MeshStandardMaterial({
      color: 0x4a2e72,
      metalness: 0.3,
      roughness: 0.35,
      side: THREE.DoubleSide,
    });
    const rimWall = new THREE.Mesh(rimWallGeo, rimWallMat);
    rimWall.position.set(0, 0.95, 0);
    this.crounGroup.add(rimWall);

    // 2. Sloped Funnel Bowl Surface (Radius 2.4 at Y=0.70 down to radius 1.10 at Y=0.15)
    const bowlGeo = new THREE.CylinderGeometry(2.4, 1.10, 0.55, 36, 1, true);
    const bowlMat = new THREE.MeshStandardMaterial({
      color: 0x381f5c,
      metalness: 0.35,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });
    const bowl = new THREE.Mesh(bowlGeo, bowlMat);
    bowl.position.set(0, 0.425, 0);
    this.crounGroup.add(bowl);

    // 3. Decorative Under-Floor Base (Below cup bottoms, at Y = -0.23)
    const underFloorGeo = new THREE.CylinderGeometry(1.15, 0.55, 0.02, 36, 1, false);
    const underFloorMat = new THREE.MeshStandardMaterial({
      color: 0x120c1f,
      roughness: 0.6,
      metalness: 0.2,
    });
    const underFloor = new THREE.Mesh(underFloorGeo, underFloorMat);
    underFloor.position.set(0, -0.23, 0);
    this.crounGroup.add(underFloor);

    // 4. Central Golden Spindle Cone (Radius 0.55, base at Y=0.10, apex at Y=0.45)
    const spindleGeo = new THREE.ConeGeometry(0.55, 0.35, 36);
    const spindleMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.85,
      roughness: 0.15,
      emissive: 0x664400,
      emissiveIntensity: 0.6,
    });
    const spindle = new THREE.Mesh(spindleGeo, spindleMat);
    spindle.position.set(0, 0.275, 0);
    this.crounGroup.add(spindle);

    // Center Spindle Gem Cap (Glowing Ruby)
    const gemGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const gemMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.position.set(0, 0.45, 0);
    this.crounGroup.add(gem);

    // 5. Golden Outer Rim & Neon LED Halo Ring (At Y = 1.20)
    const rimGeo = new THREE.TorusGeometry(2.4, 0.08, 16, 48);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xffea00,
      metalness: 0.85,
      roughness: 0.12,
      emissive: 0x664400,
      emissiveIntensity: 0.5,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 1.20, 0);
    this.crounGroup.add(rim);

    // Glowing Neon Edge Strip
    const neonStripMat = new THREE.MeshBasicMaterial({ color: 0xfff066 });
    const neonStrip = new THREE.Mesh(new THREE.TorusGeometry(2.38, 0.03, 8, 48), neonStripMat);
    neonStrip.rotation.x = Math.PI / 2;
    neonStrip.position.set(0, 1.21, 0);
    this.crounGroup.add(neonStrip);

    // 6. 6 Recessed Pockets with Deep Hollow Cups, Vivid Glow Rings & Illuminations
    this.crounPocketRings = [];
    this.crounPocketFloors = [];
    const pocketRadius = 0.85;

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const px = Math.cos(angle) * pocketRadius;
      const pz = Math.sin(angle) * pocketRadius;

      // 6a. Bright glowing neon entrance ring (At Y = 0.10)
      const ringMat = new THREE.MeshBasicMaterial({ color: this.crounPocketColors[i] });
      const pRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.24, 0.038, 12, 32),
        ringMat
      );
      pRing.rotation.x = Math.PI / 2;
      pRing.position.set(px, 0.10, pz);
      this.crounGroup.add(pRing);
      this.crounPocketRings.push(pRing);

      // 6b. Deep hollow cup tube (Y = 0.10 down to -0.22, height = 0.32, center Y = -0.06)
      const cupTubeGeo = new THREE.CylinderGeometry(0.24, 0.22, 0.32, 24, 1, true);
      const cupTubeMat = new THREE.MeshStandardMaterial({
        color: 0x18102a,
        metalness: 0.6,
        roughness: 0.25,
        side: THREE.DoubleSide,
      });
      const cupTube = new THREE.Mesh(cupTubeGeo, cupTubeMat);
      cupTube.position.set(px, -0.06, pz);
      this.crounGroup.add(cupTube);

      // 6c. Inner illuminated floor disk at base of cup (depth Y = -0.21)
      const floorMat = new THREE.MeshBasicMaterial({ color: this.crounPocketColors[i] });
      const cupFloor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.21, 0.02, 24),
        floorMat
      );
      cupFloor.position.set(px, -0.21, pz);
      this.crounGroup.add(cupFloor);
      this.crounPocketFloors.push(cupFloor);

      // 6d. Physical Golden Divider Wedges between adjacent pockets
      const divAngle = (i + 0.5) * (Math.PI * 2 / 6);
      const dx = Math.cos(divAngle) * pocketRadius;
      const dz = Math.sin(divAngle) * pocketRadius;
      const wedgeGeo = new THREE.BoxGeometry(0.10, 0.28, 0.44);
      const wedgeMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        metalness: 0.9,
        roughness: 0.12,
        emissive: 0x664400,
        emissiveIntensity: 0.3,
      });
      const wedge = new THREE.Mesh(wedgeGeo, wedgeMat);
      wedge.position.set(dx, 0.08, dz);
      wedge.rotation.y = -divAngle + Math.PI / 2;
      this.crounGroup.add(wedge);

      // Decorative top pin on wedge
      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.15, 12),
        wedgeMat
      );
      pin.position.set(dx, 0.26, dz);
      this.crounGroup.add(pin);
    }

    this.scene.add(this.crounGroup);

    // 7. Croun Ball Mesh (Ultra-Bright High-Contrast Luminous Sphere, R=0.22 matching physics)
    const crounBallGeo = new THREE.SphereGeometry(0.22, 24, 24);
    const crounBallMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x99ddff,
      emissiveIntensity: 0.65,
      metalness: 0.3,
      roughness: 0.1,
    });
    this.crounBallMesh = new THREE.Mesh(crounBallGeo, crounBallMat);
    this.crounBallMesh.castShadow = true;

    // Attach a bright moving point light to the roulette ball
    const ballLight = new THREE.PointLight(0xa5f3fc, 5.5, 3.5);
    this.crounBallMesh.add(ballLight);

    this.crounBallMesh.visible = false;
    this.scene.add(this.crounBallMesh);
  }

  private setupParticles() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparklePositions, 3));

    // Particle texture (soft glow circle)
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,220,100,0.8)');
    grad.addColorStop(1, 'rgba(255,200,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.PointsMaterial({
      size: 0.22,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.sparkles = new THREE.Points(geo, mat);
    this.scene.add(this.sparkles);

    // Initialize all lifetimes to 0
    for (let i = 0; i < 300; i++) {
      this.sparkleLifetimes[i] = 0;
      this.sparklePositions[i * 3 + 1] = -999;
    }
  }

  /**
   * Spawn Sparkle Explosion
   */
  public emitSparkles(pos: { x: number; y: number; z: number }, count = 20) {
    let emitted = 0;
    for (let i = 0; i < 300 && emitted < count; i++) {
      if (this.sparkleLifetimes[i] <= 0) {
        this.sparkleLifetimes[i] = 0.8 + Math.random() * 0.4;
        this.sparklePositions[i * 3] = pos.x + (Math.random() - 0.5) * 0.2;
        this.sparklePositions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.2;
        this.sparklePositions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.2;

        this.sparkleVelocities[i * 3] = (Math.random() - 0.5) * 2.5;
        this.sparkleVelocities[i * 3 + 1] = 1.0 + Math.random() * 3.0;
        this.sparkleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 2.5;
        emitted++;
      }
    }
  }

  /**
   * Screen Shake Effect
   */
  public triggerShake(intensity = 0.35, duration = 0.5) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
  }

  /**
   * Set winning pocket to strobe/flash celebration light while ball is locked in
   */
  public setWinningPocket(index: number | null) {
    this.winningPocketIndex = index;
    if (index === null) {
      for (let i = 0; i < this.crounPocketRings.length; i++) {
        (this.crounPocketRings[i].material as THREE.MeshBasicMaterial).color.setHex(this.crounPocketColors[i]);
        (this.crounPocketFloors[i].material as THREE.MeshBasicMaterial).color.setHex(this.crounPocketColors[i]);
        this.crounPocketRings[i].scale.set(1.0, 1.0, 1.0);
      }
    }
  }

  /**
   * Switch Camera between Main Playfield and Croun Roulette View
   */
  public setCrounCamera(active: boolean) {
    this.isCrounView = active;
    if (active) {
      // Croun bird-eye dramatic angled view - fully centered and clear
      this.targetCameraPos.set(0, 11.2, 1.6);
      this.targetCameraLookAt.set(0, 7.3, -1.0);
    } else {
      // Main Playfield view (focused directly on moving deck and shortened playfield)
      this.targetCameraPos.set(0, 3.3, 2.1);
      this.targetCameraLookAt.set(0, 0.2, -0.65);
    }
  }

  /**
   * Update and Render Frame
   */
  public render(dt: number, physics: PhysicsWorld) {
    // 1. Update Camera Position and Smooth Transition
    const camAlpha = 1 - Math.pow(0.92, dt * 60); // Same feel as 0.08/frame at 60fps, on any refresh rate
    this.camera.position.lerp(this.targetCameraPos, camAlpha);
    this.currentCameraLookAt.lerp(this.targetCameraLookAt, camAlpha);

    // Apply Screen Shake if active
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      const s = this.shakeIntensity;
      this.shakeOffset.set(
        (Math.random() - 0.5) * s * 0.7,
        (Math.random() - 0.5) * s * 0.7,
        (Math.random() - 0.5) * s * 0.4
      );
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    this.camera.position.add(this.shakeOffset);
    this.camera.lookAt(this.currentCameraLookAt);

    // 2. Update Kinematic Meshes
    if (physics.pusherBody) {
      const pTrans = physics.pusherBody.translation();
      this.pusherMesh.position.set(pTrans.x, pTrans.y, pTrans.z);
    }
    if (physics.leftShieldBody && physics.rightShieldBody) {
      const lTrans = physics.leftShieldBody.translation();
      const rTrans = physics.rightShieldBody.translation();
      this.leftShieldMesh.position.set(lTrans.x, lTrans.y, lTrans.z);
      this.rightShieldMesh.position.set(rTrans.x, rTrans.y, rTrans.z);
    }
    if (physics.gateBody) {
      const gTrans = physics.gateBody.translation();
      this.gateMesh.position.set(gTrans.x, gTrans.y, gTrans.z);
    }

    // 3. Update Instanced Coins
    let coinIdx = 0;
    physics.coins.forEach(coin => {
      if (coinIdx >= this.maxCoins) return;
      const t = coin.body.translation();
      const r = coin.body.rotation();

      this.dummyTransform.position.set(t.x, t.y, t.z);
      this.dummyTransform.quaternion.set(r.x, r.y, r.z, r.w);
      this.dummyTransform.updateMatrix();

      this.coinInstancedMesh.setMatrixAt(coinIdx, this.dummyTransform.matrix);
      coinIdx++;
    });

    this.coinInstancedMesh.count = coinIdx;
    this.coinInstancedMesh.instanceMatrix.needsUpdate = true;

    // 4. Update Color Balls
    physics.balls.forEach((ball, id) => {
      let bGroup = this.ballMeshes.get(id);
      if (!bGroup) {
        // Spec: "透明球体オブジェクト" (Crystal sphere with inner energetic core)
        const group = new THREE.Group();

        const outerMesh = new THREE.Mesh(this.ballOuterGeo, this.ballOuterMat);
        outerMesh.castShadow = true;
        group.add(outerMesh);

        const innerMesh = new THREE.Mesh(this.ballInnerGeo, this.ballInnerMat);
        group.add(innerMesh);

        this.scene.add(group);
        this.ballMeshes.set(id, group);
        bGroup = group;
      }
      const t = ball.body.translation();
      const r = ball.body.rotation();
      bGroup.position.set(t.x, t.y, t.z);
      bGroup.quaternion.set(r.x, r.y, r.z, r.w);
    });

    // Clean removed balls safely
    this.ballMeshes.forEach((group, id) => {
      if (!physics.balls.has(id)) {
        this.scene.remove(group);
        this.ballMeshes.delete(id);
      }
    });

    // 5. Update Croun Ball
    if (physics.crounBall && this.crounBallMesh) {
      const cbTrans = physics.crounBall.body.translation();
      this.crounBallMesh.position.set(cbTrans.x, cbTrans.y, cbTrans.z);
      this.crounBallMesh.visible = true;
    } else if (this.crounBallMesh) {
      this.crounBallMesh.visible = false;
    }

    // 5b. Update Croun Pocket Celebration Strobe
    if (this.winningPocketIndex !== null && this.winningPocketIndex >= 0 && this.winningPocketIndex < this.crounPocketRings.length) {
      this.crounAnimTime += dt * 9.0;
      const flash = Math.sin(this.crounAnimTime) > 0;
      const ring = this.crounPocketRings[this.winningPocketIndex];
      const floor = this.crounPocketFloors[this.winningPocketIndex];
      const origColor = this.crounPocketColors[this.winningPocketIndex];

      if (flash) {
        (ring.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
        (floor.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
        ring.scale.set(1.15, 1.15, 1.15);
      } else {
        (ring.material as THREE.MeshBasicMaterial).color.setHex(origColor);
        (floor.material as THREE.MeshBasicMaterial).color.setHex(origColor);
        ring.scale.set(1.0, 1.0, 1.0);
      }
    }

    // 6. Update Sparkle Particles
    if (this.sparkles) {
      let activeCount = 0;
      for (let i = 0; i < 300; i++) {
        if (this.sparkleLifetimes[i] > 0) {
          this.sparkleLifetimes[i] -= dt;
          this.sparklePositions[i * 3] += this.sparkleVelocities[i * 3] * dt;
          this.sparklePositions[i * 3 + 1] += this.sparkleVelocities[i * 3 + 1] * dt;
          this.sparklePositions[i * 3 + 2] += this.sparkleVelocities[i * 3 + 2] * dt;
          this.sparkleVelocities[i * 3 + 1] -= 9.8 * dt; // Particle gravity
          activeCount++;
        } else {
          this.sparklePositions[i * 3 + 1] = -999;
        }
      }
      if (activeCount > 0) {
        this.sparkles.geometry.attributes.position.needsUpdate = true;
      }
    }

    // Render WebGL
    this.renderer.render(this.scene, this.camera);
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
