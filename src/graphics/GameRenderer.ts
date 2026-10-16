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

  private ballMeshes: Map<number, THREE.Mesh> = new Map();
  private crounBallMesh: THREE.Mesh | null = null;

  // Field Meshes
  private pusherMesh!: THREE.Mesh;
  private leftShieldMesh!: THREE.Mesh;
  private rightShieldMesh!: THREE.Mesh;
  private gateMesh!: THREE.Group;
  private chuckerMesh!: THREE.Mesh;
  private crounGroup!: THREE.Group;

  // Camera animation
  private targetCameraPos = new THREE.Vector3(0, 5.2, 5.8);
  private targetCameraLookAt = new THREE.Vector3(0, 0.4, -0.6);
  private currentCameraLookAt = new THREE.Vector3(0, 0.4, -0.6);
  public isCrounView = false;
  private shakeOffset = new THREE.Vector3();
  private shakeDuration = 0;

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
      48,
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
    this.setupCrounVisual();
    this.setupParticles();

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private setupLights() {
    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);

    // Main golden spotlight from above front
    const mainSpot = new THREE.SpotLight(0xffdf80, 2.5);
    mainSpot.position.set(0, 9, 3);
    mainSpot.angle = Math.PI / 4;
    mainSpot.penumbra = 0.5;
    mainSpot.castShadow = true;
    mainSpot.shadow.mapSize.width = 1024;
    mainSpot.shadow.mapSize.height = 1024;
    mainSpot.shadow.camera.near = 2;
    mainSpot.shadow.camera.far = 16;
    this.scene.add(mainSpot);

    // Neon accent edge rim lights
    const blueRim = new THREE.PointLight(0x00d4ff, 1.8, 10);
    blueRim.position.set(-2.8, 2.0, 0);
    this.scene.add(blueRim);

    const magentaRim = new THREE.PointLight(0xff007f, 1.8, 10);
    magentaRim.position.set(2.8, 2.0, 0);
    this.scene.add(magentaRim);

    // Croun upper spotlight
    const crounSpot = new THREE.SpotLight(0xffd700, 3.0);
    crounSpot.position.set(0, 11, -1.0);
    crounSpot.target.position.set(0, 7.0, -1.0);
    crounSpot.angle = Math.PI / 3;
    crounSpot.penumbra = 0.3;
    this.scene.add(crounSpot);
    this.scene.add(crounSpot.target);
  }

  private setupStaticDecorations() {
    // Lower Deck platform
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x181c2e,
      roughness: 0.25,
      metalness: 0.85,
    });
    const lowerDeck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 3.6), deckMat);
    lowerDeck.position.set(0, -0.2, 0.8);
    lowerDeck.receiveShadow = true;
    this.scene.add(lowerDeck);

    // Lower deck glowing side trims
    const trimMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const leftTrim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 3.6), trimMat);
    leftTrim.position.set(-1.7, 0.02, 0.8);
    this.scene.add(leftTrim);
    const rightTrim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 3.6), trimMat);
    rightTrim.position.set(1.7, 0.02, 0.8);
    this.scene.add(rightTrim);

    // Upper Deck platform
    const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.4, 2.4), deckMat);
    upperDeck.position.set(0, 0.3, -3.2);
    upperDeck.receiveShadow = true;
    this.scene.add(upperDeck);

    // Slope feeder
    const slopeMat = new THREE.MeshStandardMaterial({
      color: 0x111625,
      roughness: 0.3,
      metalness: 0.6,
    });
    const slope = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 2.0), slopeMat);
    slope.position.set(0, 1.8, -4.6);
    slope.rotation.x = 0.72;
    this.scene.add(slope);

    // Deflector pins (nails)
    const pinGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.4, 12);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1 });
    const pinPositions = [
      [-1.0, 1.5, -4.4], [-0.3, 1.5, -4.4], [0.4, 1.5, -4.4], [1.1, 1.5, -4.4],
      [-0.7, 1.2, -4.0], [0.0, 1.2, -4.0], [0.7, 1.2, -4.0],
      [-1.2, 0.9, -3.6], [-0.4, 0.9, -3.6], [0.4, 0.9, -3.6], [1.2, 0.9, -3.6],
    ];
    for (const [px, py, pz] of pinPositions) {
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(px, py, pz);
      this.scene.add(pin);
    }

    // Outer Cabinet Frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a0f1d, roughness: 0.4, metalness: 0.7 });
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.5, 7.5), frameMat);
    leftWall.position.set(-2.2, 1.2, -1.2);
    this.scene.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.5, 7.5), frameMat);
    rightWall.position.set(2.2, 1.2, -1.2);
    this.scene.add(rightWall);

    // Background arcade neon pillars
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0xff00aa });
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.0), pillarMat);
    p1.position.set(-2.1, 1.8, -3.5);
    this.scene.add(p1);
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.0), pillarMat);
    p2.position.set(2.1, 1.8, -3.5);
    this.scene.add(p2);
  }

  private setupInstancedCoins() {
    // Shiny gold coin geometry: cylinder radius 0.16, height 0.04
    const coinGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 20);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      metalness: 0.92,
      roughness: 0.18,
      bumpScale: 0.05,
    });

    this.coinInstancedMesh = new THREE.InstancedMesh(coinGeo, coinMat, this.maxCoins);
    this.coinInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinInstancedMesh.castShadow = true;
    this.coinInstancedMesh.receiveShadow = true;
    this.scene.add(this.coinInstancedMesh);
  }

  private setupPusherAndShields() {
    // Kinematic Pusher body
    const pusherGeo = new THREE.BoxGeometry(3.4, 0.5, 1.8);
    const pusherMat = new THREE.MeshStandardMaterial({
      color: 0x242a42,
      metalness: 0.8,
      roughness: 0.3,
    });
    this.pusherMesh = new THREE.Mesh(pusherGeo, pusherMat);
    this.pusherMesh.position.set(0, 0.45, -1.8);
    this.pusherMesh.castShadow = true;
    this.pusherMesh.receiveShadow = true;

    // Glowing front LED strip on pusher
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff9900 });
    const frontLed = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 0.04), ledMat);
    frontLed.position.set(0, 0.1, 0.91);
    this.pusherMesh.add(frontLed);
    this.scene.add(this.pusherMesh);

    // Fever Golden Shields (Left & Right)
    const shieldGeo = new THREE.BoxGeometry(0.12, 0.8, 3.6);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.95,
      roughness: 0.1,
      emissive: 0x664400,
    });

    this.leftShieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.leftShieldMesh.position.set(-1.75, -1.0, 0.8);
    this.scene.add(this.leftShieldMesh);

    this.rightShieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.rightShieldMesh.position.set(1.75, -1.0, 0.8);
    this.scene.add(this.rightShieldMesh);
  }

  private setup2xGate() {
    this.gateMesh = new THREE.Group();

    // Emerald glowing gate arch
    const archMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.6,
      metalness: 0.8,
      roughness: 0.2,
    });

    const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), archMat);
    leftPost.position.set(-0.35, 0, 0);
    const rightPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), archMat);
    rightPost.position.set(0.35, 0, 0);
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.08, 0.08), archMat);
    topBar.position.set(0, 0.3, 0);

    // Glowing badge in center
    const badgeMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.02), badgeMat);
    sign.position.set(0, 0.3, 0.04);

    this.gateMesh.add(leftPost);
    this.gateMesh.add(rightPost);
    this.gateMesh.add(topBar);
    this.gateMesh.add(sign);
    this.gateMesh.position.set(0, 1.3, -3.2);
    this.scene.add(this.gateMesh);
  }

  private setupChucker() {
    const chuckerGeo = new THREE.BoxGeometry(0.7, 0.1, 0.4);
    const chuckerMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });
    this.chuckerMesh = new THREE.Mesh(chuckerGeo, chuckerMat);
    this.chuckerMesh.position.set(0, 0.1, 1.1);

    // Top indicator light
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16), lampMat);
    lamp.position.set(0, 0.06, 0);
    this.chuckerMesh.add(lamp);
    this.scene.add(this.chuckerMesh);
  }

  private setupCrounVisual() {
    this.crounGroup = new THREE.Group();
    const c = { x: 0, y: 7.0, z: -1.0 };
    this.crounGroup.position.set(c.x, c.y, c.z);

    // Golden Bowl
    const bowlGeo = new THREE.CylinderGeometry(2.5, 1.2, 1.0, 32, 1, true);
    const bowlMat = new THREE.MeshStandardMaterial({
      color: 0x221a0a,
      metalness: 0.9,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });
    const bowl = new THREE.Mesh(bowlGeo, bowlMat);
    bowl.position.set(0, 0.5, 0);
    this.crounGroup.add(bowl);

    // Golden Rim
    const rimGeo = new THREE.TorusGeometry(2.5, 0.08, 16, 48);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 1.0, 0);
    this.crounGroup.add(rim);

    // 6 Pocket Visual Indicators
    const pocketColors = [
      0xff00ff, // 0: GRAND JACKPOT Rainbow
      0xfbbf24, // 1: 100+Tower Yellow
      0x38bdf8, // 2: 50 Blue
      0x38bdf8, // 3: 50 Blue
      0xfbbf24, // 4: 100+Tower Yellow
      0x38bdf8, // 5: 50 Blue
    ];

    const pocketRadius = 0.85;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const px = Math.cos(angle) * pocketRadius;
      const pz = Math.sin(angle) * pocketRadius;

      const pRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.2, 0.03, 12, 24),
        new THREE.MeshBasicMaterial({ color: pocketColors[i] })
      );
      pRing.rotation.x = Math.PI / 2;
      pRing.position.set(px, 0.05, pz);
      this.crounGroup.add(pRing);

      // Hole cup
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.14, 0.3, 16),
        new THREE.MeshStandardMaterial({ color: 0x050711, roughness: 0.8 })
      );
      cup.position.set(px, -0.1, pz);
      this.crounGroup.add(cup);
    }

    this.scene.add(this.crounGroup);

    // Croun Ball Mesh (Chrome Ball)
    const crounBallGeo = new THREE.SphereGeometry(0.24, 24, 24);
    const crounBallMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      metalness: 0.98,
      roughness: 0.05,
    });
    this.crounBallMesh = new THREE.Mesh(crounBallGeo, crounBallMat);
    this.crounBallMesh.castShadow = true;
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
    this.shakeDuration = duration;
  }

  /**
   * Switch Camera between Main Playfield and Croun Roulette View
   */
  public setCrounCamera(active: boolean) {
    this.isCrounView = active;
    if (active) {
      // Croun bird-eye dramatic angled view
      this.targetCameraPos.set(0, 10.4, 1.6);
      this.targetCameraLookAt.set(0, 7.0, -1.0);
    } else {
      // Main Playfield view
      this.targetCameraPos.set(0, 5.2, 5.8);
      this.targetCameraLookAt.set(0, 0.4, -0.6);
    }
  }

  /**
   * Update and Render Frame
   */
  public render(dt: number, physics: PhysicsWorld) {
    // 1. Update Camera Position and Smooth Transition
    this.camera.position.lerp(this.targetCameraPos, 0.08);
    this.currentCameraLookAt.lerp(this.targetCameraLookAt, 0.08);

    // Apply Screen Shake if active
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      this.shakeOffset.set(
        (Math.random() - 0.5) * 0.25,
        (Math.random() - 0.5) * 0.25,
        (Math.random() - 0.5) * 0.15
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

    // Hide unused coin instances beneath ground
    for (let i = coinIdx; i < this.maxCoins; i++) {
      this.dummyTransform.position.set(0, -999, 0);
      this.dummyTransform.updateMatrix();
      this.coinInstancedMesh.setMatrixAt(i, this.dummyTransform.matrix);
    }
    this.coinInstancedMesh.instanceMatrix.needsUpdate = true;

    // 4. Update Color Balls
    physics.balls.forEach((ball, id) => {
      let bObj = this.ballMeshes.get(id);
      if (!bObj) {
        // Spec: "透明球体オブジェクト" (Transparent crystal sphere with inner energetic core)
        const group = new THREE.Group();

        // Outer transparent crystal sphere
        const outerGeo = new THREE.SphereGeometry(0.42, 32, 32);
        const outerMat = new THREE.MeshPhysicalMaterial({
          color: 0xcc88ff,
          transmission: 0.85,
          opacity: 1.0,
          transparent: true,
          roughness: 0.1,
          metalness: 0.05,
          ior: 1.52,
          reflectivity: 0.8,
          clearcoat: 1.0,
          clearcoatRoughness: 0.1,
        });
        const outerMesh = new THREE.Mesh(outerGeo, outerMat);
        outerMesh.castShadow = true;
        group.add(outerMesh);

        // Inner glowing core
        const innerGeo = new THREE.SphereGeometry(0.22, 20, 20);
        const innerMat = new THREE.MeshStandardMaterial({
          color: 0xff00ff,
          emissive: 0xd946ef,
          emissiveIntensity: 1.2,
          roughness: 0.2,
        });
        const innerMesh = new THREE.Mesh(innerGeo, innerMat);
        group.add(innerMesh);

        this.scene.add(group);
        this.ballMeshes.set(id, group as unknown as THREE.Mesh);
        bObj = group as unknown as THREE.Mesh;
      }
      const t = ball.body.translation();
      const r = ball.body.rotation();
      bObj.position.set(t.x, t.y, t.z);
      bObj.quaternion.set(r.x, r.y, r.z, r.w);
    });

    // Clean removed balls
    this.ballMeshes.forEach((mesh, id) => {
      if (!physics.balls.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
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
