import confetti from 'canvas-confetti';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { GameRenderer } from '../graphics/GameRenderer';
import { SoundManager } from '../audio/SoundManager';

export interface GameSaveState {
  version?: number;
  credits: number;
  jackpot: number;
  feverCount: number;
  ballCount: number;
  chuckerStock?: number;
  boardState?: {
    coins: Array<{ x: number; y: number; z: number }>;
    balls: Array<{ x: number; y: number; z: number }>;
  };
}

export class GameManager {
  private physics: PhysicsWorld;
  private renderer: GameRenderer;
  private sound: SoundManager;

  // Game States
  public credits: number = 200;
  public jackpotAmount: number = 300.0;
  public feverCount: number = 0; // 0 to 10
  public isFeverActive: boolean = false;
  public feverRemainingTime: number = 0; // 45s
  public collectedBalls: number = 0; // 0 to 3

  // Shake & Tilt System
  public shakeCooldownRemaining: number = 0; // 180 seconds
  public isTiltLocked: boolean = false;
  public tiltLockRemaining: number = 0;
  private shakeSpamCounter: number = 0;

  // Digital Roulette System
  public chuckerStock: number = 0; // 0 to 8
  private isRouletteSpinning: boolean = false;
  private rouletteReelSymbols = ['💀', '🪙', '💀', '🪙', '🔮', '💀', '🏰', '🪙', '💀', '🔥', '🪙', '🔮'];

  // Croun sequence guard (covers intro → roll → lock-in → payout camera return)
  private isCrounSequenceActive = false;
  private isCrounCameraOn = false;
  private pendingCrounCauses: string[] = [];

  public isCrounActive(): boolean {
    return this.isCrounSequenceActive;
  }

  // Input & Shooter
  public shooterX: number = 0; // -1.3 to +1.3
  private isAutoDropping: boolean = false;
  private dropCooldown: number = 0;

  // UI Element Caches
  private elJpCounter!: HTMLElement;
  private elCreditCount!: HTMLElement;
  private elOrbSlots: HTMLElement[] = [];
  private elFeverBar!: HTMLElement;
  private elFeverCountText!: HTMLElement;
  private elFeverTimerText!: HTMLElement;
  private elStockDots: HTMLElement[] = [];
  private elReels: HTMLElement[] = [];
  private elRouletteMsg!: HTMLElement;
  private elAimNeedle!: HTMLElement;
  private elShakeBtn!: HTMLElement;
  private elShakeCooldown!: HTMLElement;
  private elAlertBanner!: HTMLElement;
  private elAlertTitle!: HTMLElement;
  private elAlertDesc!: HTMLElement;
  private elCrounOverlay!: HTMLElement;
  private elCrounStatus!: HTMLElement;
  private elBtnCrounSkip!: HTMLElement;
  private elBtnCrounView!: HTMLElement;
  private crounIntroTimer: number | null = null;
  private crounReturnTimer: number | null = null;
  private elTiltScreen!: HTMLElement;
  private elTiltTimer!: HTMLElement;

  // Save Timer
  private saveTimer = 0;

  constructor(physics: PhysicsWorld, renderer: GameRenderer, sound: SoundManager) {
    this.physics = physics;
    this.renderer = renderer;
    this.sound = sound;

    this.cacheDOMElements();
    this.syncResponsiveHudLayout();
    window.addEventListener('resize', () => this.syncResponsiveHudLayout());
    this.loadState();
    this.bindPhysicsEvents();
  }

  private syncResponsiveHudLayout() {
    const isMobile = window.innerWidth <= 640;
    const hudLeft = document.querySelector('.hud-left') as HTMLElement | null;
    const hudRight = document.querySelector('.hud-right') as HTMLElement | null;
    const rouletteContainer = document.getElementById('roulette-container');
    const rouletteFrame = document.getElementById('roulette-frame');
    const feverPill = document.getElementById('fever-box');
    const stockContainer = document.querySelector('.stock-container') as HTMLElement | null;

    if (!hudLeft || !hudRight || !rouletteContainer || !feverPill || !stockContainer) return;

    if (isMobile) {
      // Mobile: Move STOCK next to CREDIT & BALLS inside hud-left
      if (stockContainer.parentElement !== hudLeft) {
        hudLeft.appendChild(stockContainer);
      }
      // Mobile: Move FEVER onto rouletteContainer above rouletteFrame
      if (feverPill.parentElement !== rouletteContainer) {
        if (rouletteFrame) {
          rouletteContainer.insertBefore(feverPill, rouletteFrame);
        } else {
          rouletteContainer.appendChild(feverPill);
        }
      }
    } else {
      // Desktop: Restore STOCK above rouletteFrame in rouletteContainer
      if (stockContainer.parentElement !== rouletteContainer) {
        if (rouletteFrame) {
          rouletteContainer.insertBefore(stockContainer, rouletteFrame);
        } else {
          rouletteContainer.appendChild(stockContainer);
        }
      }
      // Desktop: Restore FEVER to top-hud hud-right
      if (feverPill.parentElement !== hudRight) {
        hudRight.appendChild(feverPill);
      }
    }
  }

  private cacheDOMElements() {
    this.elJpCounter = document.getElementById('jp-counter')!;
    this.elCreditCount = document.getElementById('credit-count')!;
    this.elOrbSlots = [
      document.querySelector('.orb-slot.slot-0')!,
      document.querySelector('.orb-slot.slot-1')!,
      document.querySelector('.orb-slot.slot-2')!,
    ];
    this.elFeverBar = document.getElementById('fever-bar')!;
    this.elFeverCountText = document.getElementById('fever-count-text')!;
    this.elFeverTimerText = document.getElementById('fever-timer-text')!;
    this.elStockDots = Array.from(document.querySelectorAll('.stock-dot'));
    this.elReels = [
      document.getElementById('reel-1')!,
      document.getElementById('reel-2')!,
      document.getElementById('reel-3')!,
    ];
    this.elRouletteMsg = document.getElementById('roulette-result-msg')!;
    this.elAimNeedle = document.getElementById('aim-needle')!;
    this.elShakeBtn = document.getElementById('btn-shake')!;
    this.elShakeCooldown = document.getElementById('shake-cooldown')!;
    this.elAlertBanner = document.getElementById('alert-banner')!;
    this.elAlertTitle = document.getElementById('alert-title')!;
    this.elAlertDesc = document.getElementById('alert-desc')!;
    this.elCrounOverlay = document.getElementById('croun-overlay')!;
    this.elCrounStatus = document.getElementById('croun-status')!;
    this.elBtnCrounSkip = document.getElementById('btn-croun-skip')!;
    this.elBtnCrounView = document.getElementById('btn-croun-view')!;
    this.elTiltScreen = document.getElementById('tilt-screen')!;
    this.elTiltTimer = document.getElementById('tilt-timer')!;

    if (this.elBtnCrounSkip) {
      this.elBtnCrounSkip.addEventListener('click', (e) => {
        e.stopPropagation();
        this.skipCrounChallenge();
      });
    }
    if (this.elBtnCrounView) {
      this.elBtnCrounView.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCrounCameraView();
      });
    }
  }

  private bindPhysicsEvents() {
    // 1. Payout (Front Edge Drop)
    this.physics.onPayoutCoin = count => {
      this.credits += count;
      this.sound.playCoinClink();
      this.renderer.emitSparkles({ x: 0, y: 0.2, z: 2.2 }, count * 3);
      this.updateHUD();
    };

    // 2. Side Loss (Gutter Fall -> Add 0.5 to JP Counter)
    this.physics.onSideLostCoin = count => {
      this.jackpotAmount += count * 0.5;
      this.updateHUD();
    };

    // 3. Chucker Entrance
    this.physics.onChuckerHit = () => {
      this.sound.playChuckerHit();
      this.renderer.emitSparkles({ x: 0, y: 0.4, z: 1.1 }, 15);
      if (this.chuckerStock < 8) {
        this.chuckerStock++;
        this.updateHUD();
      }
    };

    // 4. 2x Gate Multiplier Passing
    this.physics.onGateHit = pos => {
      this.sound.playGatePass();
      this.renderer.emitSparkles(pos, 25);
      this.showAlert('2x GATE HIT!', 'メダルが2倍に分裂！');
    };

    // 5. Ball Payout (Collect 3 for JP Challenge)
    this.physics.onBallPayout = () => {
      try {
        this.collectedBalls++;
        this.sound.playOrbDrop();
        this.renderer.emitSparkles({ x: 0, y: 0.3, z: 0.8 }, 30);
        this.showAlert('ORB GET!', `カラーボール獲得！(${this.collectedBalls}/3)`);
        if (this.collectedBalls >= 3) {
          this.collectedBalls = 0;
          setTimeout(() => {
            try {
              this.triggerCrounChallenge('BALL 3個獲得！');
            } catch (err) {
              console.error('Error triggering croun challenge:', err);
            }
          }, 1200);
        }
        this.updateHUD();
      } catch (e) {
        console.error('Error in onBallPayout:', e);
      }
    };

    // 6. Croun Events
    this.physics.onCrounLockIn = (type, pocketIndex) => {
      this.handleCrounLockIn(type, pocketIndex);
    };
    this.physics.onCrounResult = type => {
      this.handleCrounResult(type);
    };
  }

  /**
   * Main Drop Coin Action
   * Drops directly onto the moving upper pusher deck!
   */
  public dropCoin() {
    if (this.isTiltLocked) return;
    if (this.credits <= 0) {
      this.showAlert('MEDAL EMPTY', 'メダルがありません！補充してください。');
      return;
    }

    this.credits--;
    this.sound.playCoinDrop();
    this.physics.spawnCoin(this.shooterX, 1.35, -1.65);
    this.updateHUD();
  }

  public setAutoDrop(active: boolean) {
    this.isAutoDropping = active;
  }

  public setShooterX(normX: number) {
    // normX is -1.0 to 1.0 from UI swipe (width of pusher ~ 4.20m)
    this.shooterX = normX * 1.70;
    const pct = ((normX + 1.0) / 2.0) * 100;
    this.elAimNeedle.style.left = `${pct}%`;
    this.renderer.updateShooterPosition(this.shooterX);
  }

  /**
   * Shake (Tilt) Action
   */
  public performShake() {
    if (this.isTiltLocked) return;

    // Check if on cooldown or spammed
    if (this.shakeCooldownRemaining > 0) {
      this.shakeSpamCounter++;
      if (this.shakeSpamCounter >= 2) {
        this.triggerTiltPenalty();
      }
      return;
    }

    // Successful shake!
    this.shakeCooldownRemaining = 180; // 3 minutes cooldown
    this.shakeSpamCounter = 0;
    this.sound.playTilt();
    this.physics.applyShakeImpulse();
    this.renderer.triggerShake(0.5, 0.45);
    this.showAlert('SHAKE!', '台を揺らして塊を崩しました！');
  }

  /**
   * Tilt Penalty Trigger
   */
  private triggerTiltPenalty() {
    this.isTiltLocked = true;
    this.tiltLockRemaining = 6.0;
    this.isAutoDropping = false;
    this.sound.playTilt();
    this.elTiltScreen.classList.remove('hidden');
  }

  /**
   * Fever Mode Trigger (45 seconds)
   */
  public triggerFeverMode() {
    this.isFeverActive = true;
    this.feverRemainingTime = 45;
    this.physics.setFeverActive(true);
    this.sound.startFeverBgm();
    this.showAlert('🔥 FEVER TIME START! 🔥', '45秒間 金色フェンス全防御 ＆ 2倍速！');
    document.getElementById('fever-box')?.classList.add('fever-active');
  }

  public endFeverMode() {
    this.isFeverActive = false;
    this.feverRemainingTime = 0;
    this.feverCount = 0;
    this.physics.setFeverActive(false);
    this.sound.stopFeverBgm();
    document.getElementById('fever-box')?.classList.remove('fever-active');
    this.showAlert('FEVER TIME END', '通常モードへ復帰しました');
    this.updateHUD();
  }

  /**
   * Croun Challenge (Physical Roulette Stage 2)
   */
  public triggerCrounChallenge(cause: string) {
    if (this.isCrounSequenceActive) {
      this.pendingCrounCauses.push(cause);
      return;
    }
    this.isCrounSequenceActive = true;
    this.isCrounCameraOn = true;

    this.renderer.setWinningPocket(null);
    this.renderer.setCrounCamera(true);
    document.body.classList.add('croun-active');
    this.elCrounOverlay.classList.remove('hidden');
    this.updateCrounViewButtonText();
    if (this.elBtnCrounSkip) {
      this.elBtnCrounSkip.removeAttribute('disabled');
      this.elBtnCrounSkip.textContent = '▶▶ スキップ (X)';
    }
    this.elCrounStatus.textContent = `${cause} 物理クルーン抽選中...`;
    this.sound.playRouletteTick();

    if (this.crounIntroTimer !== null) {
      clearTimeout(this.crounIntroTimer);
    }
    // Snappy launch (400ms instead of 1500ms)
    this.crounIntroTimer = window.setTimeout(() => {
      this.crounIntroTimer = null;
      this.physics.launchCrounBall();
    }, 400);
  }

  public toggleCrounCameraView() {
    if (!this.isCrounSequenceActive) return;
    this.isCrounCameraOn = !this.isCrounCameraOn;
    this.renderer.setCrounCamera(this.isCrounCameraOn);
    this.updateCrounViewButtonText();
  }

  private updateCrounViewButtonText() {
    if (this.elBtnCrounView) {
      this.elBtnCrounView.textContent = this.isCrounCameraOn
        ? '👁️ 盤面視点へ (C)'
        : '🎡 クルーン視点へ (C)';
    }
  }

  public skipCrounChallenge() {
    if (!this.isCrounSequenceActive) return;

    if (this.crounIntroTimer !== null) {
      clearTimeout(this.crounIntroTimer);
      this.crounIntroTimer = null;
    }

    if (this.elBtnCrounSkip) {
      this.elBtnCrounSkip.setAttribute('disabled', 'true');
      this.elBtnCrounSkip.textContent = 'スキップ中...';
    }

    const type = this.physics.forceResolveCroun();
    this.handleCrounResult(type, true);
  }

  private handleCrounLockIn(type: '50' | '100_tower' | 'jp', pocketIndex: number) {
    this.renderer.setWinningPocket(pocketIndex);
    this.sound.playRouletteWin();
    if (type === 'jp') {
      this.elCrounStatus.textContent = '🎯【GRAND JACKPOT】入賞確定！';
    } else if (type === '100_tower') {
      this.elCrounStatus.textContent = '🎯【100枚 ＋ 🏰 50枚タワー】入賞確定！';
    } else {
      this.elCrounStatus.textContent = '🎯【50枚】入賞確定！';
    }
  }

  private handleCrounResult(type: '50' | '100_tower' | 'jp', isSkipped = false) {
    if (this.crounIntroTimer !== null) {
      clearTimeout(this.crounIntroTimer);
      this.crounIntroTimer = null;
    }
    if (this.crounReturnTimer !== null) {
      clearTimeout(this.crounReturnTimer);
      this.crounReturnTimer = null;
    }

    this.sound.playRouletteWin();

    if (type === 'jp') {
      const winJp = Math.floor(this.jackpotAmount);
      this.elCrounStatus.textContent = isSkipped
        ? `🌈 GRAND JACKPOT 獲得!! (${winJp}枚) [即時確定]`
        : `🌈 GRAND JACKPOT 獲得!! (${winJp}枚)`;
      this.sound.playGrandJackpot();

      // Launch Confetti safely
      try {
        confetti({
          particleCount: 180,
          spread: 90,
          origin: { y: 0.5 },
        });
      } catch (_) {}

      // Spawn massive waterfall of medals directly onto moving deck
      let spawned = 0;
      const waterfallInterval = setInterval(() => {
        for (let i = 0; i < 4; i++) {
          const rx = (Math.random() - 0.5) * 2.5;
          this.physics.spawnCoin(rx, 1.4, -1.65, true);
          spawned++;
        }
        if (spawned >= 60) {
          clearInterval(waterfallInterval);
        }
      }, 70);

      this.credits += winJp;
      this.jackpotAmount = 300.0; // Reset JP
    } else if (type === '100_tower') {
      this.elCrounStatus.textContent = isSkipped
        ? '🟨 100枚 ＋ 🏰 50枚メダルタワー召喚!! [即時確定]'
        : '🟨 100枚 ＋ 🏰 50枚メダルタワー召喚!!';
      this.credits += 100;
      this.physics.spawnMedalTower(0, -1.65);
      this.sound.playTowerCollapse();
      try {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      } catch (_) {}
    } else {
      this.elCrounStatus.textContent = isSkipped
        ? '🟦 50枚払い出し獲得!! [即時確定]'
        : '🟦 50枚払い出し獲得!!';
      this.credits += 50;
      for (let i = 0; i < 15; i++) {
        const rx = (Math.random() - 0.5) * 2.2;
        this.physics.spawnCoin(rx, 1.35, -1.65, true);
      }
    }

    // Return to main playfield: 600ms if skipped, 1800ms otherwise (cut down from 3800ms)
    const returnDelay = isSkipped ? 600 : 1800;

    this.crounReturnTimer = window.setTimeout(() => {
      this.crounReturnTimer = null;
      this.elCrounOverlay.classList.add('hidden');
      document.body.classList.remove('croun-active');
      this.renderer.setCrounCamera(false);
      this.renderer.setWinningPocket(null);
      this.isCrounCameraOn = false;
      this.updateHUD();
      this.isCrounSequenceActive = false;

      // Run queued challenge (e.g. JP slot hit while a croun was already rolling)
      const next = this.pendingCrounCauses.shift();
      if (next) {
        window.setTimeout(() => this.triggerCrounChallenge(next), 500);
      }
    }, returnDelay);
  }

  /**
   * Process Digital Roulette (Stage 1)
   */
  private stepRoulette(dt: number) {
    if (this.isRouletteSpinning || this.chuckerStock <= 0) return;

    this.isRouletteSpinning = true;
    this.chuckerStock--;
    this.updateHUD();

    this.elRouletteMsg.textContent = '抽選中...';
    let spinCount = 0;
    const spinInterval = setInterval(() => {
      spinCount++;
      this.sound.playRouletteTick();
      this.elReels.forEach(reel => {
        const sym = this.rouletteReelSymbols[Math.floor(Math.random() * this.rouletteReelSymbols.length)];
        reel.querySelector('.reel-symbol')!.textContent = sym;
      });

      if (spinCount > 18) {
        clearInterval(spinInterval);
        this.resolveRouletteResult();
      }
    }, 100);
  }

  private resolveRouletteResult() {
    try {
      const roll = Math.random();

      // Balanced arcade odds:
      // 💀 ハズレ (48%)
      // 🪙 小当たり15枚 (32%)
      // 🏰 タワー召喚マス (6%)
      // 🔮 ボール出現 (11%) - capped at 2 balls on field! Excess awards 25 coins bonus
      // 🔥 JPチャレンジ突入 (3%) - rare arcade thrill
      if (roll < 0.48) {
        // 💀 ハズレ
        this.setReelSymbols('💀', '💀', '💀');
        this.elRouletteMsg.textContent = '💀 ハズレ (フィーバー+1)';
        if (!this.isFeverActive) {
          this.feverCount = Math.min(this.feverCount + 1, 10);
          if (this.feverCount >= 10) {
            this.triggerFeverMode();
          }
        }
      } else if (roll < 0.80) {
        // 🪙 小当たり15枚 (32%)
        this.setReelSymbols('🪙', '🪙', '🪙');
        this.elRouletteMsg.textContent = '🪙 小当たり15枚！';
        this.sound.playRouletteWin();
        this.credits += 15;
        for (let i = 0; i < 6; i++) {
          this.physics.spawnCoin((Math.random() - 0.5) * 2.4, 1.35, -1.65, true);
        }
      } else if (roll < 0.86) {
        // 🏰 タワー召喚マス (6%)
        this.setReelSymbols('🏰', '🏰', '🏰');
        this.elRouletteMsg.textContent = '🏰 タワー召喚マス当選！';
        this.sound.playTowerCollapse();
        this.physics.spawnMedalTower(0, -1.65);
        this.showAlert('🏰 TOWER SUMMON!', '中央に50枚メダルタワーを召喚！');
      } else if (roll < 0.97) {
        // 🔮 カラーボール出現 (11%)
        // Cap to max 2 balls on the field simultaneously
        if (this.physics.balls.size >= 2) {
          this.setReelSymbols('🪙', '🪙', '🪙');
          this.elRouletteMsg.textContent = '🪙 ボーナス25枚！(ボール満杯)';
          this.sound.playRouletteWin();
          this.credits += 25;
          for (let i = 0; i < 10; i++) {
            this.physics.spawnCoin((Math.random() - 0.5) * 2.4, 1.35, -1.65, true);
          }
        } else {
          this.setReelSymbols('🔮', '🔮', '🔮');
          this.elRouletteMsg.textContent = '🔮 カラーボール落下！';
          this.sound.playOrbDrop();
          this.physics.spawnBall(0, 1.45, -1.65);
        }
      } else {
        // 🔥 JPチャレンジ突入 (3%)
        this.setReelSymbols('🔥', '🔥', '🔥');
        this.elRouletteMsg.textContent = '🔥 奇跡のJP直撃チャレンジ!!';
        this.sound.playRouletteWin();
        window.setTimeout(() => {
          this.triggerCrounChallenge('スロット直撃！');
        }, 600);
      }
    } finally {
      this.isRouletteSpinning = false;
      this.updateHUD();
    }
  }

  private setReelSymbols(s1: string, s2: string, s3: string) {
    this.elReels[0].querySelector('.reel-symbol')!.textContent = s1;
    this.elReels[1].querySelector('.reel-symbol')!.textContent = s2;
    this.elReels[2].querySelector('.reel-symbol')!.textContent = s3;
  }

  /**
   * Main Game Loop Update
   */
  public update(dt: number) {
    // 1. Auto Drop Logic
    if (this.isAutoDropping && !this.isTiltLocked) {
      this.dropCooldown -= dt;
      if (this.dropCooldown <= 0) {
        this.dropCoin();
        this.dropCooldown = 0.22; // rapid shoot rate
      }
    }

    // 2. Step Digital Roulette
    this.stepRoulette(dt);

    // 3. Fever Timer
    if (this.isFeverActive) {
      this.feverRemainingTime -= dt;
      this.elFeverTimerText.textContent = `${Math.ceil(this.feverRemainingTime)}秒`;
      if (this.feverRemainingTime <= 0) {
        this.endFeverMode();
      }
    }

    // 4. Shake Cooldown & Tilt Lock
    if (this.shakeCooldownRemaining > 0) {
      this.shakeCooldownRemaining -= dt;
      const mins = Math.floor(this.shakeCooldownRemaining / 60);
      const secs = Math.floor(this.shakeCooldownRemaining % 60);
      this.elShakeCooldown.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      this.elShakeBtn.classList.add('cooling');
    } else {
      this.elShakeCooldown.textContent = 'READY';
      this.elShakeBtn.classList.remove('cooling');
    }

    if (this.isTiltLocked) {
      this.tiltLockRemaining -= dt;
      this.elTiltTimer.textContent = `${this.tiltLockRemaining.toFixed(1)}s`;
      if (this.tiltLockRemaining <= 0) {
        this.isTiltLocked = false;
        this.elTiltScreen.classList.add('hidden');
      }
    }

    // 5. Auto Save Every 5 Seconds
    this.saveTimer += dt;
    if (this.saveTimer >= 5.0) {
      this.saveTimer = 0;
      this.saveState();
    }
  }

  /**
   * Update HUD Elements
   */
  public updateHUD() {
    this.elCreditCount.textContent = this.credits.toString();
    this.elJpCounter.textContent = this.jackpotAmount.toFixed(1).padStart(6, '0');

    // Orb slots
    this.elOrbSlots.forEach((slot, idx) => {
      if (idx < this.collectedBalls) {
        slot.classList.add('active');
      } else {
        slot.classList.remove('active');
      }
    });

    // Fever Bar
    const feverPct = this.isFeverActive ? 100 : Math.min((this.feverCount / 10) * 100, 100);
    this.elFeverBar.style.width = `${feverPct}%`;
    if (!this.isFeverActive) {
      this.elFeverTimerText.textContent = `${this.feverCount}/10`;
    }

    // Stock Dots
    this.elStockDots.forEach((dot, idx) => {
      if (idx < this.chuckerStock) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  private alertTimeout: number | null = null;

  /**
   * Big Center Toast Notification
   */
  public showAlert(title: string, desc: string, duration = 2200) {
    if (this.alertTimeout !== null) {
      clearTimeout(this.alertTimeout);
    }
    this.elAlertTitle.textContent = title;
    this.elAlertDesc.textContent = desc;
    this.elAlertBanner.classList.remove('hidden');

    this.alertTimeout = window.setTimeout(() => {
      this.elAlertBanner.classList.add('hidden');
      this.alertTimeout = null;
    }, duration);
  }

  /**
   * LocalStorage Save & Load (Spec: 5秒自動セーブ ＆ 盤面状態保持)
   */
  public saveState() {
    try {
      const state: GameSaveState = {
        version: 3,
        credits: this.credits,
        jackpot: this.jackpotAmount,
        feverCount: this.feverCount,
        ballCount: this.collectedBalls,
        chuckerStock: this.chuckerStock,
        boardState: this.physics.exportBoardState(),
      };
      localStorage.setItem('fortune_pusher_save', JSON.stringify(state));
    } catch (e) {
      // LocalStorage might be restricted
    }
  }

  private loadState() {
    try {
      const raw = localStorage.getItem('fortune_pusher_save');
      if (raw) {
        const state: GameSaveState = JSON.parse(raw);
        const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
        this.credits = Math.max(0, Math.floor(num(state.credits, this.credits)));
        this.jackpotAmount = Math.max(num(state.jackpot, 300.0), 300.0);
        this.feverCount = Math.min(Math.max(0, Math.floor(num(state.feverCount, 0))), 9);
        this.collectedBalls = Math.min(Math.max(0, Math.floor(num(state.ballCount, 0))), 2);
        this.chuckerStock = Math.min(Math.max(0, Math.floor(num(state.chuckerStock, 0))), 8);

        // If saved under version 3 (matching sealed floor and deep pusher), restore directly; otherwise seed clean bed
        if (state.version === 3 && state.boardState && state.boardState.coins && state.boardState.coins.length > 0) {
          this.physics.restoreBoardState(state.boardState);
        } else {
          this.physics.seedInitialMedals(100);
        }
      } else {
        this.physics.seedInitialMedals(100);
      }
    } catch (e) {
      this.physics.seedInitialMedals(100);
    }
    this.updateHUD();
  }
}
