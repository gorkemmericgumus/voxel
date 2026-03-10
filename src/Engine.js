import * as THREE from 'three';
import { World }  from './World.js';
import { Player } from './Player.js';
import { Sky }    from './Sky.js';
import { UI }     from './UI.js';
import GiantSpider from './GiantSpider.js';
import { createOpaqueMaterial, createTransparentMaterial } from './Renderer.js';
import { HOTBAR_BLOCKS, KEYS } from './Constants.js';

export class Engine {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('game-canvas'),
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace   = THREE.SRGBColorSpace;
    this.renderer.toneMapping        = THREE.NoToneMapping;

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);

    this.opaqueMat      = createOpaqueMaterial();
    this.transparentMat = createTransparentMaterial();

    this.world  = new World(this.scene);
    this.sky    = new Sky(this.scene, this.renderer);
    this.player = new Player(this.camera, this.world, this.scene);
    this.ui     = new UI(this.player, { onRespawn: () => this._respawn() });

    this._dead = false;
    this._spawnPosition = null;

    this.scene.add(this.player.blockOutline);
    this.scene.add(this.player._particleGroup);
    this.scene.add(this.camera);

    this._clock = new THREE.Clock();
    this._inited = false;
    this._lampBlock = new THREE.Vector3();
    this.camera.position.set(0, 70, 0);

    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('beforeunload', () => this.world.saveAll());

    window.addEventListener('keydown', (e) => {
      if (e.code === KEYS.NIGHT_MODE) this.sky.toggleNightMode();
      if (e.code === KEYS.TOGGLE_DAY_NIGHT) this.sky.toggleDayNight();
    });

  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async init() {
    await this.world.init(this.opaqueMat, this.transparentMat);

    this.player.position.copy(this.world.getRainforestSpawn());
    this._spawnPosition = this.player.position.clone();

    const spawnCX = Math.floor(this.player.position.x / 16);
    const spawnCZ = Math.floor(this.player.position.z / 16);
    const loads = [];
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        loads.push(this.world.loadChunk(spawnCX + dx, spawnCZ + dz));
    await Promise.all(loads);

    for (const [, chunk] of this.world.chunks)
      this.world._rebuildChunkMesh(chunk);

    const spawnX = this.player.position.x;
    const spawnZ = this.player.position.z;
    const terrainY = this.world.getTerrainHeight(spawnX, spawnZ);
    if (terrainY != null) {
      this.player.position.y = terrainY;
      this._spawnPosition.y = terrainY;
    }

    this.giantSpider = new GiantSpider(this.scene, this.world);
    const spawn = this.player.position;
    this.giantSpider.setPosition(spawn.x + 12, spawn.z + 12);

    this._inited = true;
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const delta = Math.min(this._clock.getDelta(), 0.05);

    if (!this._inited) {
      this.sky.update(delta);
      this.sky.followCamera(this.camera.position);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.sky.update(delta);

    if (this.player.health <= 0) {
      if (!this._dead) {
        this._dead = true;
        document.exitPointerLock();
      }
    } else {
      this.player.update(delta, HOTBAR_BLOCKS);
      this.world.update(this.player.position.x, this.player.position.z, delta);
      if (this.giantSpider) this.giantSpider.update(delta, this.player.inLongGrass ? null : this.player);
    }

    this.ui.update(delta);
    this.sky.followCamera(this.camera.position);
    this._lampBlock.set(
      Math.floor(this.camera.position.x),
      Math.floor(this.camera.position.y),
      Math.floor(this.camera.position.z)
    );
    this.world.updateLampUniforms(
      this.sky.getSunDirection(),
      this._lampBlock,
      this.sky.isLampOn(),
      this.sky.isNight(),
      this.scene.fog
    );
    this.renderer.render(this.scene, this.camera);
  }

  _respawn() {
    if (!this._spawnPosition) return;
    this.player.health = this.player.maxHealth;
    this.player.position.copy(this._spawnPosition);
    this.player.velocity.set(0, 0, 0);
    this._dead = false;
    const canvas = document.getElementById('game-canvas');
    if (canvas) canvas.requestPointerLock();
  }
}
