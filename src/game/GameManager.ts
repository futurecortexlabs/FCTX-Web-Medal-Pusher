import confetti from 'canvas-confetti';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { GameRenderer } from '../graphics/GameRenderer';
import { SoundManager } from '../audio/SoundManager';

export interface GameSaveState {
  credits: number;
  jackpot: number;
  feverCount: number;
  ballCount: number;
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
  private rouletteReelSymbols = ['💀', '🪙', '🔮', '🔥', '🏰', '🪙', '💀', '🔮', '🔥', '🏰'];

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
  private elTiltScreen!: HTMLElement;
  private elTiltTimer!: HTMLElement;

  // Save Timer
  private saveTimer = 0;

  constructor(physics: PhysicsWorld, renderer: GameRenderer, sound: SoundManager) {
    this.physics = physics;
    this.renderer = renderer;
    this.sound = sound;

    this.cacheDOMElements();
    this.loadState();
    this.bindPhysicsEvents();
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
    this.elTiltScreen = document.getElementById('tilt-screen')!;
    this.elTiltTimer = document.getElementById('tilt-timer')!;
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
      this.collectedBalls++;
      this.sound.playOrbDrop();
      this.showAlert('ORB GET!', `カラーボール獲得！(${this.collectedBalls}/3)`);
      if (this.collectedBalls >= 3) {
        this.collectedBalls = 0;
        setTimeout(() => {
          this.triggerCrounChallenge('BALL 3個獲得！');
        }, 1200);
      }
      this.updateHUD();
    };

    // 6. Croun Result
    this.physics.onCrounResult = type => {
      this.handleCrounResult(type);
    };
  }

  /**
   * Main Drop Coin Action
   */
  public dropCoin() {
    if (this.isTiltLocked) return;
    if (this.credits <= 0) {
      this.showAlert('MEDAL EMPTY', 'メダルがありません！補充してください。');
      return;
    }

    this.credits--;
    this.sound.playCoinDrop();
    this.physics.spawnCoin(this.shooterX, 2.5, -4.6);
    this.updateHUD();
  }

  public setAutoDrop(active: boolean) {
    this.isAutoDropping = active;
  }

  public setShooterX(normX: number) {
    // normX is -1.0 to 1.0 from UI swipe
    this.shooterX = normX * 1.35;
    const pct = ((normX + 1.0) / 2.0) * 100;
    this.elAimNeedle.style.left = `${pct}%`;
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
    if (this.physics.isCrounActive) return;

    this.renderer.setCrounCamera(true);
    this.elCrounOverlay.classList.remove('hidden');
    this.elCrounStatus.textContent = `${cause} 物理クルーン抽選中...`;
    this.sound.playRouletteTick();

    setTimeout(() => {
      this.physics.launchCrounBall();
    }, 1500);
  }

  private handleCrounResult(type: '50' | '100_tower' | 'jp') {
    this.sound.playRouletteWin();

    if (type === 'jp') {
      const winJp = Math.floor(this.jackpotAmount);
      this.elCrounStatus.textContent = `🌈 GRAND JACKPOT 獲得!! (${winJp}枚)`;
      this.sound.playGrandJackpot();

      // Launch Confetti
      confetti({
        particleCount: 180,
        spread: 90,
        origin: { y: 0.5 },
      });

      // Spawn massive waterfall of medals over 4 seconds
      let spawned = 0;
      const waterfallInterval = setInterval(() => {
        for (let i = 0; i < 4; i++) {
          const rx = (Math.random() - 0.5) * 2.4;
          this.physics.spawnCoin(rx, 2.8, -4.4, true);
          spawned++;
        }
        if (spawned >= 60) {
          clearInterval(waterfallInterval);
        }
      }, 70);

      this.credits += winJp;
      this.jackpotAmount = 300.0; // Reset JP
    } else if (type === '100_tower') {
      this.elCrounStatus.textContent = '🟨 100枚 ＋ 🏰 50枚メダルタワー召喚!!';
      this.credits += 100;
      this.physics.spawnMedalTower(0, -2.5);
      this.sound.playTowerCollapse();
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    } else {
      this.elCrounStatus.textContent = '🟦 50枚払い出し獲得!!';
      this.credits += 50;
      for (let i = 0; i < 15; i++) {
        const rx = (Math.random() - 0.5) * 2.0;
        this.physics.spawnCoin(rx, 2.5, -4.0, true);
      }
    }

    // Return to main playfield after 3.5s
    setTimeout(() => {
      this.elCrounOverlay.classList.add('hidden');
      this.renderer.setCrounCamera(false);
      this.updateHUD();
    }, 3800);
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
    const roll = Math.random();

    // Probabilities per spec (DOC-MP-EV-02):
    // 💀 ハズレ (45%)
    // 🪙 小当たり15枚 (25%) / 🏰 タワー召喚マス (5%) [合計30%]
    // 🔮 ボール出現 (15%)
    // 🔥 JPチャレンジ突入 (10%)
    if (roll < 0.45) {
      // 💀 ハズレ
      this.setReelSymbols('💀', '💀', '💀');
      this.elRouletteMsg.textContent = '💀 ハズレ (フィーバー+1)';
      this.feverCount++;
      if (this.feverCount >= 10 && !this.isFeverActive) {
        this.triggerFeverMode();
      }
    } else if (roll < 0.70) {
      // 🪙 小当たり15枚
      this.setReelSymbols('🪙', '🪙', '🪙');
      this.elRouletteMsg.textContent = '🪙 小当たり15枚！';
      this.sound.playRouletteWin();
      this.credits += 15;
      for (let i = 0; i < 6; i++) {
        this.physics.spawnCoin((Math.random() - 0.5) * 1.5, 2.5, -4.2, true);
      }
    } else if (roll < 0.75) {
      // 🏰 タワー召喚マス (Spec Page 1: "ルーレットのタワー召喚マス")
      this.setReelSymbols('🏰', '🏰', '🏰');
      this.elRouletteMsg.textContent = '🏰 タワー召喚マス当選！';
      this.sound.playTowerCollapse();
      this.physics.spawnMedalTower(0, -2.5);
      this.showAlert('🏰 TOWER SUMMON!', '中央に50枚メダルタワーを召喚！');
    } else if (roll < 0.90) {
      // 🔮 カラーボール出現 (15%)
      this.setReelSymbols('🔮', '🔮', '🔮');
      this.elRouletteMsg.textContent = '🔮 カラーボール落下！';
      this.sound.playOrbDrop();
      this.physics.spawnBall(0, 2.8, -4.5);
    } else {
      // 🔥 JPチャレンジ突入 (10%)
      this.setReelSymbols('🔥', '🔥', '🔥');
      this.elRouletteMsg.textContent = '🔥 JPチャレンジ突入!!';
      this.sound.playRouletteWin();
      setTimeout(() => {
        this.triggerCrounChallenge('スロット当選！');
      }, 1000);
    }

    this.isRouletteSpinning = false;
    this.updateHUD();
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
      this.elFeverTimerText.textContent = `FEVER: ${Math.ceil(this.feverRemainingTime)}秒`;
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
    this.elFeverCountText.textContent = this.isFeverActive ? 'ACTIVE' : `${this.feverCount} / 10`;

    // Stock Dots
    this.elStockDots.forEach((dot, idx) => {
      if (idx < this.chuckerStock) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  /**
   * Big Center Toast Notification
   */
  public showAlert(title: string, desc: string, duration = 2200) {
    this.elAlertTitle.textContent = title;
    this.elAlertDesc.textContent = desc;
    this.elAlertBanner.classList.remove('hidden');

    setTimeout(() => {
      this.elAlertBanner.classList.add('hidden');
    }, duration);
  }

  /**
   * LocalStorage Save & Load (Spec: 5秒自動セーブ ＆ 盤面状態保持)
   */
  private saveState() {
    try {
      const state: GameSaveState = {
        credits: this.credits,
        jackpot: this.jackpotAmount,
        feverCount: this.feverCount,
        ballCount: this.collectedBalls,
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
        if (state.credits != null) this.credits = state.credits;
        if (state.jackpot != null) this.jackpotAmount = Math.max(state.jackpot, 300.0);
        if (state.feverCount != null) this.feverCount = state.feverCount;
        if (state.ballCount != null) this.collectedBalls = state.ballCount;

        if (state.boardState && state.boardState.coins && state.boardState.coins.length > 0) {
          this.physics.restoreBoardState(state.boardState);
        } else {
          this.physics.seedInitialMedals(80);
        }
      } else {
        this.physics.seedInitialMedals(80);
      }
    } catch (e) {
      this.physics.seedInitialMedals(80);
    }
    this.updateHUD();
  }
}
