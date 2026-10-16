import { PhysicsWorld } from './physics/PhysicsWorld';
import { GameRenderer } from './graphics/GameRenderer';
import { SoundManager } from './audio/SoundManager';
import { GameManager } from './game/GameManager';

async function bootstrap() {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  // 1. Initialize Subsystems
  const sound = new SoundManager();
  const physics = new PhysicsWorld();
  await physics.init();

  const renderer = new GameRenderer(canvas);
  const game = new GameManager(physics, renderer, sound);

  // 2. Bind UI & Touch / Mouse Controls
  setupControls(game, sound, physics);

  // 4. Main Animation Loop
  let lastTime = performance.now();
  function animate(now: number) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Fixed / clamped physics step
    physics.step(dt);
    game.update(dt);
    renderer.render(dt, physics);

    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

function setupControls(game: GameManager, sound: SoundManager, physics: PhysicsWorld) {
  const btnDrop = document.getElementById('btn-drop')!;
  const btnShake = document.getElementById('btn-shake')!;
  const btnSound = document.getElementById('btn-sound')!;
  const btnAddCredits = document.getElementById('btn-add-credits')!;
  const btnTower = document.getElementById('btn-tower')!;
  const btnHelp = document.getElementById('btn-help')!;
  const helpModal = document.getElementById('help-modal')!;
  const modalClose = document.getElementById('modal-close')!;
  const aimContainer = document.getElementById('aim-container')!;
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  // Aim track swipe handling (Pointer Events)
  let isAimDragging = false;
  function updateAimFromPointer(clientX: number) {
    const rect = aimContainer.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const norm = (x / rect.width) * 2 - 1; // -1 to 1
    game.setShooterX(norm);
  }

  aimContainer.addEventListener('pointerdown', e => {
    isAimDragging = true;
    aimContainer.setPointerCapture(e.pointerId);
    updateAimFromPointer(e.clientX);
  });

  aimContainer.addEventListener('pointermove', e => {
    if (isAimDragging) {
      updateAimFromPointer(e.clientX);
    }
  });

  aimContainer.addEventListener('pointerup', e => {
    isAimDragging = false;
  });

  aimContainer.addEventListener('pointercancel', e => {
    isAimDragging = false;
  });

  // Tap or Hold to drop coins (Continuous rapid drop)
  const startDrop = (e: Event) => {
    e.preventDefault();
    game.dropCoin();
    game.setAutoDrop(true);
  };

  const stopDrop = (e: Event) => {
    e.preventDefault();
    game.setAutoDrop(false);
  };

  btnDrop.addEventListener('pointerdown', startDrop);
  btnDrop.addEventListener('pointerup', stopDrop);
  btnDrop.addEventListener('pointerleave', stopDrop);
  btnDrop.addEventListener('pointercancel', stopDrop);

  // Canvas Tap/Click Drop support
  canvas.addEventListener('pointerdown', e => {
    // Only drop if clicked in middle or upper field, not clicking hud
    if (e.clientY > 160 && e.clientY < window.innerHeight - 140) {
      // Map horizontal tap position to shooter X
      const norm = (e.clientX / window.innerWidth) * 2 - 1;
      game.setShooterX(norm);
      game.dropCoin();
    }
  });

  // Shake Button
  btnShake.addEventListener('click', () => {
    game.performShake();
  });

  // Sound Toggle
  btnSound.addEventListener('click', () => {
    const isMuted = sound.toggleMute();
    btnSound.textContent = isMuted ? '🔇' : '🔊';
  });

  // Add Credits (Cheat / Replenish)
  btnAddCredits.addEventListener('click', () => {
    game.credits += 50;
    game.updateHUD();
    game.showAlert('🪙 メダル補充', '+50枚チャージしました！');
  });

  // Tower Summon Button
  btnTower.addEventListener('click', () => {
    physics.spawnMedalTower(0, -2.6);
    sound.playTowerCollapse();
    game.showAlert('🏰 メダルタワー召喚', '中央に50枚タワーを召喚しました！');
  });

  // Help Modal Toggle
  btnHelp.addEventListener('click', () => {
    helpModal.classList.remove('hidden');
  });
  modalClose.addEventListener('click', () => {
    helpModal.classList.add('hidden');
  });
  helpModal.addEventListener('click', e => {
    if (e.target === helpModal) {
      helpModal.classList.add('hidden');
    }
  });

  // Keyboard controls
  window.addEventListener('keydown', e => {
    if (e.repeat && e.code !== 'Space') return;

    if (e.code === 'Space') {
      e.preventDefault();
      game.dropCoin();
      game.setAutoDrop(true);
    } else if (e.code === 'KeyS') {
      game.performShake();
    } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      game.setShooterX(Math.max(-1.0, game.shooterX / 1.35 - 0.15));
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      game.setShooterX(Math.min(1.0, game.shooterX / 1.35 + 0.15));
    }
  });

  window.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      game.setAutoDrop(false);
    }
  });
}

// Start game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch(err => {
    console.error('Failed to start Grand Fortune Pusher:', err);
  });
});
