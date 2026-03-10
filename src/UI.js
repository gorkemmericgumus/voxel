import { HOTBAR_BLOCKS } from './Constants.js';

export class UI {
  constructor(player, options = {}) {
    this.player = player;
    this.inventoryOpen = false;
    this.onRespawn = options.onRespawn || (() => {});

    this._buildHealthBar();
    this._buildEnergyBar();
    this._buildHotbar();
    this._buildInventoryPanel();
    this._buildStealthIndicator();
    this._wireDeathScreen();

    document.addEventListener('mousedown', (e) => {
      if (e.button === 2 && document.pointerLockElement && !this.inventoryOpen) {
        e.preventDefault();
        this.player.placeBlock(HOTBAR_BLOCKS);
      }
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') {
        e.preventDefault();
        this.inventoryOpen = !this.inventoryOpen;
        const panel = document.getElementById('inventory-panel');
        if (panel) panel.classList.toggle('open', this.inventoryOpen);
      }
      if (!this.inventoryOpen && e.code >= 'Digit1' && e.code <= 'Digit9') {
        this.player.hotbarSlot = parseInt(e.code.replace('Digit', '')) - 1;
      }
    });
  }

  _buildHealthBar() {
    const container = document.getElementById('health-bar');
    if (!container) return;
    this.healthSegments = [];
    for (let i = 0; i < 10; i++) {
      const seg = document.createElement('div');
      seg.className = 'health-segment filled';
      container.appendChild(seg);
      this.healthSegments.push(seg);
    }
  }

  _buildEnergyBar() {
    const container = document.getElementById('energy-bar');
    if (!container) return;
    this.energySegments = [];
    for (let i = 0; i < 10; i++) {
      const seg = document.createElement('div');
      seg.className = 'energy-segment filled';
      container.appendChild(seg);
      this.energySegments.push(seg);
    }
  }

  _buildHotbar() {
    const hotbarEl = document.getElementById('hotbar');
    if (!hotbarEl) return;
    this.hotbarSlots = [];
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot hotbar-slot';
      slot.dataset.index = String(i);
      const inner = document.createElement('div');
      inner.className = 'slot-color';
      inner.style.background = 'rgba(255, 252, 245, 0.2)';
      slot.appendChild(inner);
      hotbarEl.appendChild(slot);
      this.hotbarSlots.push(slot);
    }
  }

  _buildInventoryPanel() {
    const grid = document.querySelector('#inventory-panel .inventory-grid');
    if (!grid) return;
    for (let i = 0; i < 24; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot inventory-slot';
      slot.dataset.index = String(i);
      const inner = document.createElement('div');
      inner.className = 'slot-color';
      inner.style.background = 'rgba(255, 252, 245, 0.2)';
      slot.appendChild(inner);
      grid.appendChild(slot);
    }
  }

  _buildStealthIndicator() {
    this.stealthEl = document.createElement('div');
    this.stealthEl.id = 'stealth-indicator';
    this.stealthEl.textContent = 'Hidden';
    this.stealthEl.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:15;font:14px "Courier New",monospace;color:rgba(34,34,34,0.9);background:rgba(248,246,240,0.7);padding:6px 12px;border:1px solid #222;border-radius:0;pointer-events:none;display:none;';
    document.body.appendChild(this.stealthEl);
  }

  _wireDeathScreen() {
    this.deathScreenEl = document.getElementById('death-screen');
    const respawnBtn = document.getElementById('respawn-btn');
    if (respawnBtn) respawnBtn.addEventListener('click', () => this.onRespawn());
  }

  update(_delta) {
    if (!this.hotbarSlots) return;
    const selected = this.player.hotbarSlot;
    this.hotbarSlots.forEach((slot, i) => {
      slot.classList.toggle('selected', i === selected);
    });
    if (this.stealthEl) this.stealthEl.style.display = this.player.inLongGrass ? 'block' : 'none';
    if (this.healthSegments) {
      const h = Math.max(0, Math.min(this.player.health, this.player.maxHealth));
      this.healthSegments.forEach((seg, i) => {
        seg.classList.toggle('filled', i < h);
      });
    }
    if (this.energySegments) {
      const e = Math.max(0, Math.min(this.player.energy, this.player.maxEnergy));
      this.energySegments.forEach((seg, i) => {
        seg.classList.toggle('filled', i < e);
      });
    }
    if (this.deathScreenEl) {
      this.deathScreenEl.classList.toggle('visible', this.player.health <= 0);
    }
  }
}
