import * as THREE from 'three';
import { Noise3D } from './Noise.js';
import { buildChunkGeometry, createWaterMaterial, createEdgeLineMaterial, createSparklyExtensionMaterial } from './Renderer.js';
import {
  BLOCK, CHUNK_WIDTH, CHUNK_HEIGHT, RENDER_DISTANCE,
  WATER_LEVEL, BEDROCK_Y, TERRAIN, TRANSPARENT, PASSABLE, INDESTRUCTIBLE,
} from './Constants.js';

const DB_NAME    = 'VoxelGame';
const DB_VERSION = 1;
const STORE_NAME = 'chunks';

class ChunkDB {
  constructor() {
    this.db = null;
  }

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  save(key, data) {
    if (!this.db) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(data, key);
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);
    });
  }

  load(key) {
    if (!this.db) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror   = (e) => reject(e.target.error);
    });
  }
}

class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.key = `${cx},${cz}`;

    this.blocks = new Uint8Array(CHUNK_WIDTH * CHUNK_WIDTH * CHUNK_HEIGHT);

    this.opaqueMesh      = null;
    this.edgeMesh        = null;
    this.transparentMesh = null;
    this.transEdgeMesh   = null;
    this.waterMesh       = null;

    this.dirty = true;
    this.modifications = new Map();
  }

  blockIndex(lx, ly, lz) {
    return lx + lz * CHUNK_WIDTH + ly * CHUNK_WIDTH * CHUNK_WIDTH;
  }

  getBlock(lx, ly, lz) {
    if (lx < 0 || lx >= CHUNK_WIDTH || lz < 0 || lz >= CHUNK_WIDTH ||
        ly < 0 || ly >= CHUNK_HEIGHT) return BLOCK.AIR;
    return this.blocks[this.blockIndex(lx, ly, lz)];
  }

  setBlock(lx, ly, lz, id) {
    if (lx < 0 || lx >= CHUNK_WIDTH || lz < 0 || lz >= CHUNK_WIDTH ||
        ly < 0 || ly >= CHUNK_HEIGHT) return;
    this.blocks[this.blockIndex(lx, ly, lz)] = id;
    this.dirty = true;
  }
}

export class World {
  constructor(scene, seed = Math.floor(Math.random() * 999999)) {
    this.scene    = scene;
    this.seed     = seed;
    this.chunks   = new Map();
    this.db       = new ChunkDB();

    this.opaqueMat = null;
    this.edgeLineMat    = null;
    this.fireflyEdgeMat = null;
    this.transparentMat = null;
    this.sparklyExtensionMat = null;
    this.waterMat       = null;

    this.terrainNoise  = new Noise3D(seed);
    this.caveNoise     = new Noise3D(seed + 1337);
    this.biomeNoise    = new Noise3D(seed + 2674);
    this.decorNoise    = new Noise3D(seed + 4011);

    this.waterUVOffset = 0;

    this.firefliesGroup = new THREE.Group();
    this.scene.add(this.firefliesGroup);
    this._fireflyTime = 0;
    this._frameCount = 0;

    this._loading = new Set();
    this._lastLampBlock = new THREE.Vector3(Infinity, Infinity, Infinity);
    this._lastLampOn = false;
    this._toUnloadBuffer = [];
    this._dirtyChunksBuffer = [];
  }

  async init(opaqueMat, transparentMat) {
    this.opaqueMat      = opaqueMat;
    this.edgeLineMat    = createEdgeLineMaterial();
    this.fireflyEdgeMat = new THREE.LineBasicMaterial({ color: 0x886622, fog: false });
    this.transparentMat = transparentMat;
    this.sparklyExtensionMat = createSparklyExtensionMaterial();
    this.waterMat       = createWaterMaterial();
    await this.db.open();
  }

  updateLampUniforms(sunDir, lampBlock, lampOn, isNight, fog) {
    const lampChanged =
      this._lastLampBlock.x !== lampBlock.x ||
      this._lastLampBlock.y !== lampBlock.y ||
      this._lastLampBlock.z !== lampBlock.z ||
      this._lastLampOn !== lampOn;
    if (lampChanged) {
      this._lastLampBlock.copy(lampBlock);
      this._lastLampOn = lampOn;
    }

    const mats = [this.opaqueMat, this.transparentMat, this.waterMat];
    for (const mat of mats) {
      if (!mat.uniforms) continue;
      mat.uniforms.uSunDir.value.copy(sunDir);
      if (lampChanged) {
        mat.uniforms.uLampBlock.value.copy(lampBlock);
        mat.uniforms.uLampOn.value = lampOn ? 1 : 0;
      }
      mat.uniforms.uNight.value = isNight ? 1 : 0;
      if (fog) {
        mat.uniforms.uFogColor.value.copy(fog.color);
        mat.uniforms.uFogDensity.value = fog.density;
      }
    }
  }

  getRainforestSpawn() {
    const range = 320;
    const step = 16;
    for (let wx = -range; wx <= range; wx += step) {
      for (let wz = -range; wz <= range; wz += step) {
        const temperature = this.biomeNoise.fbm2(wx * 0.003, wz * 0.003, 3);
        const moisture    = this.biomeNoise.fbm2(wx * 0.003 + 500, wz * 0.003 + 500, 3);
        const isRainforest = moisture > 0.28 && temperature > 0.2 && temperature < 0.88;
        if (!isRainforest) continue;

        const baseHeight = this.terrainNoise.warpedFbm2(wx * 0.008, wz * 0.008);
        const surfaceY = Math.floor(
          TERRAIN.BASE_HEIGHT + (baseHeight - 0.5) * 2 * TERRAIN.HEIGHT_VARIANCE
        );
        const y = Math.max(1, Math.min(CHUNK_HEIGHT - 2, surfaceY + 1));
        return new THREE.Vector3(wx + 8, y, wz + 8);
      }
    }
    return new THREE.Vector3(8, 70, 8);
  }

  worldToChunk(wx, wz) {
    return [Math.floor(wx / CHUNK_WIDTH), Math.floor(wz / CHUNK_WIDTH)];
  }

  worldToLocal(wx, wz) {
    return [
      ((wx % CHUNK_WIDTH) + CHUNK_WIDTH) % CHUNK_WIDTH,
      ((wz % CHUNK_WIDTH) + CHUNK_WIDTH) % CHUNK_WIDTH,
    ];
  }

  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BLOCK.AIR;
    const [cx, cz] = this.worldToChunk(wx, wz);
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (!chunk) return BLOCK.AIR;
    const [lx, lz] = this.worldToLocal(wx, wz);
    return chunk.getBlock(lx, wy, lz);
  }

  setBlock(wx, wy, wz, id) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const [cx, cz] = this.worldToChunk(wx, wz);
    const key = `${cx},${cz}`;
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    const [lx, lz] = this.worldToLocal(wx, wz);

    if (id === BLOCK.AIR && INDESTRUCTIBLE.has(chunk.getBlock(lx, wy, lz))) return;
    chunk.setBlock(lx, wy, lz, id);
    chunk.modifications.set(`${lx},${wy},${lz}`, id);

    if (lx === 0)               this._markDirty(cx - 1, cz);
    if (lx === CHUNK_WIDTH - 1) this._markDirty(cx + 1, cz);
    if (lz === 0)               this._markDirty(cx, cz - 1);
    if (lz === CHUNK_WIDTH - 1) this._markDirty(cx, cz + 1);

    this._saveChunk(chunk);
  }

  _markDirty(cx, cz) {
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (chunk) chunk.dirty = true;
  }

  _generateChunk(chunk) {
    const { cx, cz } = chunk;
    const W = CHUNK_WIDTH, H = CHUNK_HEIGHT;

    for (let lx = 0; lx < W; lx++) {
      for (let lz = 0; lz < W; lz++) {
        const wx = cx * W + lx;
        const wz = cz * W + lz;

        const temperature = this.biomeNoise.fbm2(wx * 0.003, wz * 0.003, 3);
        const moisture    = this.biomeNoise.fbm2(wx * 0.003 + 500, wz * 0.003 + 500, 3);

        const isDesert    = temperature > 0.65 && moisture < 0.4;
        const isForest    = moisture > 0.55 && temperature < 0.7;
        const isRainforest = moisture > 0.28 && temperature > 0.2 && temperature < 0.88;

        const baseHeight = this.terrainNoise.warpedFbm2(wx * 0.008, wz * 0.008);
        const surfaceY = Math.floor(
          TERRAIN.BASE_HEIGHT + (baseHeight - 0.5) * 2 * TERRAIN.HEIGHT_VARIANCE
        );

        for (let ly = 0; ly < H; ly++) {
          let blockId = BLOCK.AIR;

          if (ly === BEDROCK_Y) {
            blockId = BLOCK.BEDROCK;
          } else if (ly < surfaceY) {
            if (ly < TERRAIN.CAVE_MAX_Y && ly > 2) {
              const cave1 = this.caveNoise.perlin3(wx * 0.05, ly * 0.05, wz * 0.05);
              const cave2 = this.caveNoise.perlin3(wx * 0.08 + 100, ly * 0.08, wz * 0.08 + 100);
              const caveDensity = Math.abs(cave1) + Math.abs(cave2);
              if (caveDensity < 0.12) {
                blockId = BLOCK.AIR;
              } else {
                blockId = ly < 5 ? BLOCK.BEDROCK : BLOCK.STONE;
              }
            } else {
              blockId = ly < 5 ? BLOCK.BEDROCK : BLOCK.STONE;
            }
          } else if (ly === surfaceY) {
            if (surfaceY <= WATER_LEVEL + 1) {
              blockId = BLOCK.SAND;
            } else if (isDesert) {
              blockId = BLOCK.SAND;
            } else if (isRainforest) {
              blockId = BLOCK.RAINFOREST_GRASS;
            } else {
              blockId = BLOCK.GRASS;
            }
          } else if (ly > surfaceY && ly <= WATER_LEVEL) {
            blockId = BLOCK.WATER;
          } else {
            const overhang = this.terrainNoise.perlin3(wx * 0.04, ly * 0.04, wz * 0.04);
            const distAbove = ly - surfaceY;
            if (overhang > 0.35 && distAbove < 8 && ly > WATER_LEVEL) {
              blockId = BLOCK.STONE;
            }
          }

          if (blockId === BLOCK.STONE) {
            const oreVal = this.decorNoise.perlin3(wx * 0.15 + 1000, ly * 0.15 + 1000, wz * 0.15 + 1000);
            if (oreVal > 0.55) blockId = BLOCK.COAL_ORE;
          }

          chunk.setBlock(lx, ly, lz, blockId);
        }

        const surfaceBlock = chunk.getBlock(lx, surfaceY, lz);
        if (surfaceBlock === BLOCK.GRASS) {
          for (let d = 1; d <= 3; d++) {
            const dy = surfaceY - d;
            if (dy > 0 && chunk.getBlock(lx, dy, lz) === BLOCK.STONE) {
              chunk.setBlock(lx, dy, lz, BLOCK.DIRT);
            }
          }
        } else if (surfaceBlock === BLOCK.RAINFOREST_GRASS) {
          for (let d = 1; d <= 3; d++) {
            const dy = surfaceY - d;
            if (dy > 0 && chunk.getBlock(lx, dy, lz) === BLOCK.STONE) {
              chunk.setBlock(lx, dy, lz, BLOCK.RAINFOREST_DIRT);
            }
          }
        }
      }
    }

    this._decorateChunk(chunk);
  }

  _decorateChunk(chunk) {
    const { cx, cz } = chunk;
    const W = CHUNK_WIDTH;
    chunk.rainforestTrees = [];

    const chunkSeed = (cx * 374761393 + cz * 668265263 + this.seed) | 0;
    const rng = seededRandom(chunkSeed);

    for (let lx = 0; lx < W; lx++) {
      for (let lz = 0; lz < W; lz++) {
        const wx = cx * W + lx;
        const wz = cz * W + lz;

        let surfaceY = -1;
        for (let ly = CHUNK_HEIGHT - 1; ly >= 0; ly--) {
          const b = chunk.getBlock(lx, ly, lz);
          if (b !== BLOCK.AIR && b !== BLOCK.WATER) {
            surfaceY = ly;
            break;
          }
        }
        if (surfaceY < 0) continue;

        const surfaceBlock = chunk.getBlock(lx, surfaceY, lz);

        if (surfaceBlock === BLOCK.SAND && surfaceY <= WATER_LEVEL + 2 && surfaceY >= WATER_LEVEL - 3) {
          const hasWaterNeighbor =
            this.getBlock(wx + 1, surfaceY + 1, wz) === BLOCK.WATER ||
            this.getBlock(wx - 1, surfaceY + 1, wz) === BLOCK.WATER ||
            this.getBlock(wx, surfaceY + 1, wz + 1) === BLOCK.WATER ||
            this.getBlock(wx, surfaceY + 1, wz - 1) === BLOCK.WATER ||
            this.getBlock(wx + 1, surfaceY, wz) === BLOCK.WATER ||
            this.getBlock(wx - 1, surfaceY, wz) === BLOCK.WATER ||
            this.getBlock(wx, surfaceY, wz + 1) === BLOCK.WATER ||
            this.getBlock(wx, surfaceY, wz - 1) === BLOCK.WATER;
          if (hasWaterNeighbor && chunk.getBlock(lx, surfaceY + 1, lz) === BLOCK.AIR && rng() < 0.32) {
            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            const [dx, dz] = dirs[Math.floor(rng() * 4)];
            const numBlocks = 3 + Math.floor(rng() * 2);
            for (let k = 0; k < numBlocks; k++) {
              const nx = lx + dx * k, nz = lz + dz * k;
              if (nx < 0 || nx >= W || nz < 0 || nz >= W) break;
              if (chunk.getBlock(nx, surfaceY, nz) !== BLOCK.SAND || chunk.getBlock(nx, surfaceY + 1, nz) !== BLOCK.AIR) break;
              chunk.setBlock(nx, surfaceY + 1, nz, BLOCK.SUGAR_CANE);
            }
          }
        }

        const isGrassLike = surfaceBlock === BLOCK.GRASS || surfaceBlock === BLOCK.RAINFOREST_GRASS;
        if (!isGrassLike) continue;
        if (surfaceY <= WATER_LEVEL) continue;

        const temperature = this.biomeNoise.fbm2(wx * 0.003, wz * 0.003, 3);
        const moisture    = this.biomeNoise.fbm2(wx * 0.003 + 500, wz * 0.003 + 500, 3);
        const isRainforest = moisture > 0.28 && temperature > 0.2 && temperature < 0.88;

        const r = rng();

        if (isRainforest && lx % 2 === 0 && lz % 2 === 0 && lx <= W - 2 && lz <= W - 2 &&
            r < 0.03) {
          const canPlace = [0, 1].every(dx => [0, 1].every(dz => {
            const nx = lx + dx, nz = lz + dz;
            const surf = chunk.getBlock(nx, surfaceY, nz);
            const airAbove = chunk.getBlock(nx, surfaceY + 1, nz) === BLOCK.AIR;
            return (surf === BLOCK.GRASS || surf === BLOCK.RAINFOREST_GRASS) && airAbove;
          }));
          if (canPlace) {
            const maxHeight = CHUNK_HEIGHT - 4 - surfaceY;
            const treeHeight = Math.min(14 + Math.floor(rng() * 11), Math.max(10, maxHeight));
            const topY = surfaceY + treeHeight;

            for (let ty = 1; ty <= treeHeight; ty++) {
              chunk.setBlock(lx,     surfaceY + ty, lz,     BLOCK.WOOD);
              chunk.setBlock(lx + 1, surfaceY + ty, lz,     BLOCK.WOOD);
              chunk.setBlock(lx,     surfaceY + ty, lz + 1, BLOCK.WOOD);
              chunk.setBlock(lx + 1, surfaceY + ty, lz + 1, BLOCK.WOOD);
            }

            const numBranches = 1 + Math.floor(rng() * 3);
            const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]];
            for (let b = 0; b < numBranches; b++) {
              const branchHeight = 3 + Math.floor(rng() * (treeHeight - 6));
              if (branchHeight < 3) continue;
              const [dx, dz] = dirs[Math.floor(rng() * dirs.length)];
              const len = 2 + Math.floor(rng() * 2);
              const baseX = lx + (dx > 0 ? 1 : 0);
              const baseZ = lz + (dz > 0 ? 1 : 0);
              const by = surfaceY + branchHeight;
              for (let s = 1; s <= len; s++) {
                const bx = baseX + dx * s, bz = baseZ + dz * s;
                if (by < 1 || by >= CHUNK_HEIGHT) break;
                if (bx < 0 || bx >= W || bz < 0 || bz >= W) break;
                if (chunk.getBlock(bx, by, bz) !== BLOCK.AIR) continue;
                chunk.setBlock(bx, by, bz, s === len ? BLOCK.LEAVES : BLOCK.WOOD);
              }
              const endX = baseX + dx * len, endZ = baseZ + dz * len;
              if (endX >= 0 && endX < W && endZ >= 0 && endZ < W) {
                for (let ex = -1; ex <= 1; ex++) {
                  for (let ez = -1; ez <= 1; ez++) {
                    if (rng() > 0.6) continue;
                    const tx = endX + ex, tz = endZ + ez;
                    if (tx >= 0 && tx < W && tz >= 0 && tz < W &&
                        chunk.getBlock(tx, by, tz) === BLOCK.AIR)
                      chunk.setBlock(tx, by, tz, BLOCK.LEAVES);
                  }
                }
              }
            }

            const canopyRadius = 3 + Math.floor(rng() * 2);
            chunk.rainforestTrees.push({ lx, lz, surfaceY, treeHeight, canopyRadius, topY });
            for (let ly = topY - 2; ly <= topY + 3; ly++) {
              if (ly >= CHUNK_HEIGHT) break;
              const distFromTop = topY + 2 - ly;
              const radius = Math.min(canopyRadius + (distFromTop > 0 ? 1 : 0), 5);
              for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                  if (dx * dx + dz * dz > radius * radius + 1) continue;
                  const nx = lx + dx, nz = lz + dz;
                  if (nx >= 0 && nx < W && nz >= 0 && nz < W) {
                    if (chunk.getBlock(nx, ly, nz) === BLOCK.AIR)
                      chunk.setBlock(nx, ly, nz, BLOCK.LEAVES);
                  }
                }
              }
            }
          }
        } else if (!isRainforest && r < 0.02 && lx >= 2 && lx < W - 2 && lz >= 2 && lz < W - 2) {
          const treeHeight = 4 + Math.floor(rng() * 3);
          for (let ty = 1; ty <= treeHeight; ty++)
            chunk.setBlock(lx, surfaceY + ty, lz, BLOCK.WOOD);
          const topY = surfaceY + treeHeight;
          for (let ly = topY - 1; ly <= topY + 1; ly++) {
            const radius = ly >= topY ? 1 : 2;
            for (let dx = -radius; dx <= radius; dx++) {
              for (let dz = -radius; dz <= radius; dz++) {
                if (Math.abs(dx) === radius && Math.abs(dz) === radius) continue;
                const nlx = lx + dx, nlz = lz + dz;
                if (nlx >= 0 && nlx < W && nlz >= 0 && nlz < W &&
                    chunk.getBlock(nlx, ly, nlz) === BLOCK.AIR)
                  chunk.setBlock(nlx, ly, nlz, BLOCK.LEAVES);
              }
            }
          }
        } else if (r < 0.08) {
          if (chunk.getBlock(lx, surfaceY + 1, lz) !== BLOCK.AIR) continue;
          const r2 = rng();
          const placeRose = r2 < (isRainforest ? 0.06 : 0.12);
          const placeLongGrass = !placeRose && r2 < 0.12;
          if (placeRose) {
            chunk.setBlock(lx, surfaceY + 1, lz, BLOCK.ROSE);
          } else if (placeLongGrass) {
            chunk.setBlock(lx, surfaceY + 1, lz, BLOCK.LONG_GRASS);
            const neighbors = [];
            for (let dx = -1; dx <= 1; dx++) {
              for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue;
                const nlx = lx + dx, nlz = lz + dz;
                if (nlx < 0 || nlx >= W || nlz < 0 || nlz >= W) continue;
                const nSurf = chunk.getBlock(nlx, surfaceY, nlz);
                const airAbove = chunk.getBlock(nlx, surfaceY + 1, nlz) === BLOCK.AIR;
                if ((nSurf === BLOCK.GRASS || nSurf === BLOCK.RAINFOREST_GRASS) && airAbove)
                  neighbors.push([nlx, nlz]);
              }
            }
            const want = 1 + Math.floor(rng() * 2);
            for (let i = neighbors.length - 1; i > 0; i--) {
              const j = Math.floor(rng() * (i + 1));
              [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
            }
            for (let k = 0; k < Math.min(want, neighbors.length); k++) {
              const [nx, nz] = neighbors[k];
              chunk.setBlock(nx, surfaceY + 1, nz, BLOCK.LONG_GRASS);
            }
          } else {
            const placeSparkly = rng() < 0.018;
            chunk.setBlock(lx, surfaceY + 1, lz, placeSparkly
              ? BLOCK.SPARKLY_GRASS
              : (isRainforest ? BLOCK.RAINFOREST_TALL_GRASS : BLOCK.TALL_GRASS));
          }
        }
      }
    }
  }

  _fillCanopyFromNeighbor(ourChunk, neighborChunk, edgeX, edgeZ) {
    const W = CHUNK_WIDTH;
    const list = neighborChunk.rainforestTrees;
    if (!list || list.length === 0) return;

    const ncx = neighborChunk.cx;
    const ncz = neighborChunk.cz;
    const ourCx = ourChunk.cx;
    const ourCz = ourChunk.cz;

    for (const t of list) {
      const nearEdgeX = (edgeX === 0) || (edgeX === 1 && t.lx >= W - 5) || (edgeX === -1 && t.lx <= 5);
      const nearEdgeZ = (edgeZ === 0) || (edgeZ === 1 && t.lz >= W - 5) || (edgeZ === -1 && t.lz <= 5);
      if (!nearEdgeX || !nearEdgeZ) continue;

      const { lx: tlx, lz: tlz, topY, canopyRadius } = t;
      for (let ly = topY - 2; ly <= topY + 3; ly++) {
        if (ly < 0 || ly >= CHUNK_HEIGHT) continue;
        const distFromTop = topY + 2 - ly;
        const radius = Math.min(canopyRadius + (distFromTop > 0 ? 1 : 0), 5);
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (dx * dx + dz * dz > radius * radius + 1) continue;
            const wx = ncx * W + tlx + dx;
            const wz = ncz * W + tlz + dz;
            const ourLx = wx - ourCx * W;
            const ourLz = wz - ourCz * W;
            if (ourLx >= 0 && ourLx < W && ourLz >= 0 && ourLz < W &&
                ourChunk.getBlock(ourLx, ly, ourLz) === BLOCK.AIR)
              ourChunk.setBlock(ourLx, ly, ourLz, BLOCK.LEAVES);
          }
        }
      }
    }
  }

  async loadChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (this.chunks.has(key)) return this.chunks.get(key);

    const chunk = new Chunk(cx, cz);
    this._generateChunk(chunk);

    const saved = await this.db.load(key);
    if (saved && saved.modifications) {
      for (const [modKey, blockId] of Object.entries(saved.modifications)) {
        const [lx, ly, lz] = modKey.split(',').map(Number);
        chunk.setBlock(lx, ly, lz, blockId);
        chunk.modifications.set(modKey, blockId);
      }
    }

    chunk.dirty = true;
    this.chunks.set(key, chunk);

    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nb = this.chunks.get(`${cx + dx},${cz + dz}`);
      if (nb) {
        this._fillCanopyFromNeighbor(chunk, nb, -dx, -dz);
        this._fillCanopyFromNeighbor(nb, chunk, dx, dz);
        nb.dirty = true;
      }
    }

    return chunk;
  }

  unloadChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    if (chunk.opaqueMesh) {
      this.scene.remove(chunk.opaqueMesh);
      chunk.opaqueMesh.geometry.dispose();
      chunk.opaqueMesh = null;
    }
    if (chunk.edgeMesh) {
      this.scene.remove(chunk.edgeMesh);
      chunk.edgeMesh.geometry.dispose();
      chunk.edgeMesh = null;
    }
    if (chunk.waterMesh) {
      this.scene.remove(chunk.waterMesh);
      chunk.waterMesh.geometry.dispose();
      chunk.waterMesh = null;
    }
    if (chunk.transparentMesh) {
      this.scene.remove(chunk.transparentMesh);
      chunk.transparentMesh.geometry.dispose();
      chunk.transparentMesh = null;
    }
    if (chunk.transEdgeMesh) {
      this.scene.remove(chunk.transEdgeMesh);
      chunk.transEdgeMesh.geometry.dispose();
      chunk.transEdgeMesh = null;
    }
    if (chunk.sparklyExtensionMesh) {
      this.scene.remove(chunk.sparklyExtensionMesh);
      chunk.sparklyExtensionMesh.geometry.dispose();
      chunk.sparklyExtensionMesh = null;
    }
    if (chunk.sparklyExtensionEdgeMesh) {
      this.scene.remove(chunk.sparklyExtensionEdgeMesh);
      chunk.sparklyExtensionEdgeMesh.geometry.dispose();
      chunk.sparklyExtensionEdgeMesh = null;
    }
    if (chunk.fireflyMeshes) {
      for (const f of chunk.fireflyMeshes) {
        this.firefliesGroup.remove(f.group);
        f.group.traverse((c) => {
          if (c.geometry) c.geometry.dispose();
          if (c.material && c.material !== this.fireflyEdgeMat) c.material.dispose();
        });
      }
      chunk.fireflyMeshes = null;
    }
    this.chunks.delete(key);
  }

  async _saveChunk(chunk) {
    const data = {
      modifications: Object.fromEntries(chunk.modifications),
    };
    await this.db.save(chunk.key, data);
  }

  _rebuildChunkMesh(chunk) {
    if (!chunk.dirty) return;
    chunk.dirty = false;

    const getWorldBlock = (wx, wy, wz) => this.getBlock(wx, wy, wz);

    const { geo: opaqueGeo, edgeGeo } = buildChunkGeometry(
      chunk.blocks, chunk.cx, chunk.cz, getWorldBlock, 'opaque'
    );

    if (chunk.opaqueMesh) {
      this.scene.remove(chunk.opaqueMesh);
      chunk.opaqueMesh.geometry.dispose();
      chunk.opaqueMesh = null;
    }
    if (opaqueGeo) {
      chunk.opaqueMesh = new THREE.Mesh(opaqueGeo, this.opaqueMat);
      this.scene.add(chunk.opaqueMesh);
    }

    if (chunk.edgeMesh) {
      this.scene.remove(chunk.edgeMesh);
      chunk.edgeMesh.geometry.dispose();
      chunk.edgeMesh = null;
    }
    if (edgeGeo) {
      chunk.edgeMesh = new THREE.LineSegments(edgeGeo, this.edgeLineMat);
      this.scene.add(chunk.edgeMesh);
    }

    const { geo: waterGeo } = buildChunkGeometry(
      chunk.blocks, chunk.cx, chunk.cz, getWorldBlock, 'water'
    );

    if (chunk.waterMesh) {
      this.scene.remove(chunk.waterMesh);
      chunk.waterMesh.geometry.dispose();
      chunk.waterMesh = null;
    }
    if (waterGeo) {
      chunk.waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
      chunk.waterMesh.renderOrder = 1;
      this.scene.add(chunk.waterMesh);
    }

    const { geo: transGeo, edgeGeo: transEdgeGeo, emissiveGeo } = buildChunkGeometry(
      chunk.blocks, chunk.cx, chunk.cz, getWorldBlock, 'transparent'
    );

    if (chunk.transparentMesh) {
      this.scene.remove(chunk.transparentMesh);
      chunk.transparentMesh.geometry.dispose();
      chunk.transparentMesh = null;
    }
    if (transGeo) {
      chunk.transparentMesh = new THREE.Mesh(transGeo, this.transparentMat);
      chunk.transparentMesh.renderOrder = 2;
      this.scene.add(chunk.transparentMesh);
    }

    if (chunk.transEdgeMesh) {
      this.scene.remove(chunk.transEdgeMesh);
      chunk.transEdgeMesh.geometry.dispose();
      chunk.transEdgeMesh = null;
    }
    if (transEdgeGeo) {
      chunk.transEdgeMesh = new THREE.LineSegments(transEdgeGeo, this.edgeLineMat);
      chunk.transEdgeMesh.renderOrder = 3;
      this.scene.add(chunk.transEdgeMesh);
    }

    if (chunk.sparklyExtensionMesh) {
      this.scene.remove(chunk.sparklyExtensionMesh);
      chunk.sparklyExtensionMesh.geometry.dispose();
      chunk.sparklyExtensionMesh = null;
    }
    if (chunk.sparklyExtensionEdgeMesh) {
      this.scene.remove(chunk.sparklyExtensionEdgeMesh);
      chunk.sparklyExtensionEdgeMesh.geometry.dispose();
      chunk.sparklyExtensionEdgeMesh = null;
    }
    if (emissiveGeo) {
      chunk.sparklyExtensionMesh = new THREE.Mesh(emissiveGeo, this.sparklyExtensionMat);
      chunk.sparklyExtensionMesh.renderOrder = 4;
      this.scene.add(chunk.sparklyExtensionMesh);
      const sparklyEdgeGeo = new THREE.EdgesGeometry(emissiveGeo);
      chunk.sparklyExtensionEdgeMesh = new THREE.LineSegments(sparklyEdgeGeo, this.edgeLineMat);
      chunk.sparklyExtensionEdgeMesh.renderOrder = 5;
      this.scene.add(chunk.sparklyExtensionEdgeMesh);
    }

    this._addFirefliesForChunk(chunk);
  }

  _fireflyHash(wx, wy, wz, i) {
    let h = (wx * 374761393 + wz * 668265263 + wy * 1274126177 + i * 4011) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return (h ^ (h >> 16)) | 0;
  }

  _addFirefliesForChunk(chunk) {
    if (chunk.fireflyMeshes) {
      for (const f of chunk.fireflyMeshes) {
        this.firefliesGroup.remove(f.group);
        f.group.traverse((c) => {
          if (c.geometry) c.geometry.dispose();
          if (c.material && c.material !== this.fireflyEdgeMat) c.material.dispose();
        });
      }
      chunk.fireflyMeshes = null;
    }

    const W = CHUNK_WIDTH;
    const H = CHUNK_HEIGHT;
    const wx0 = chunk.cx * W;
    const wz0 = chunk.cz * W;
    chunk.fireflyMeshes = [];

    for (let ly = 0; ly < H; ly++) {
      for (let lz = 0; lz < W; lz++) {
        for (let lx = 0; lx < W; lx++) {
          const blockId = chunk.getBlock(lx, ly, lz);
          const isNormalGrass = blockId === BLOCK.TALL_GRASS || blockId === BLOCK.RAINFOREST_TALL_GRASS;
          if (!isNormalGrass) continue;
          const wx = wx0 + lx, wz = wz0 + lz;
          if ((Math.abs(this._fireflyHash(wx, ly, wz, 99)) % 100) >= 8) continue;
          const baseX = wx + 0.5;
          const baseY = ly + 0.5;
          const baseZ = wz + 0.5;
          const numFireflies = 2 + (Math.abs(this._fireflyHash(wx, ly, wz, 0)) % 2);
          for (let i = 0; i < numFireflies; i++) {
            const hi = this._fireflyHash(wx, ly, wz, i + 1);
            const phase = ((hi & 0x7FFFFFFF) % 6283) / 1000;
            const radius = 0.35 + ((hi >> 10) & 0x7FF) / 2048 * 0.2;
            const speed = 0.8 + ((hi >> 21) & 0x3FF) / 1024 * 0.6;
            const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
            const mat = new THREE.MeshBasicMaterial({
              color: 0xffdd44,
              transparent: true,
              opacity: 0.95,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.renderOrder = 10;
            const edgeLines = new THREE.LineSegments(
              new THREE.EdgesGeometry(geo),
              this.fireflyEdgeMat
            );
            const group = new THREE.Group();
            group.add(mesh);
            group.add(edgeLines);
            group.position.set(baseX, baseY, baseZ);
            this.firefliesGroup.add(group);
            chunk.fireflyMeshes.push({
              group,
              baseX, baseY, baseZ,
              phase,
              radius,
              speed,
              bobbingPhase: phase * 2,
            });
          }
        }
      }
    }
  }

  update(playerX, playerZ, delta) {
    const [pcx, pcz] = this.worldToChunk(playerX, playerZ);
    const R = RENDER_DISTANCE;

    const needed = new Set();
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        if (dx * dx + dz * dz <= R * R) {
          needed.add(`${pcx + dx},${pcz + dz}`);
        }
      }
    }

    for (const key of needed) {
      if (!this.chunks.has(key) && !this._loading.has(key)) {
        const [cx, cz] = key.split(',').map(Number);
        this._loading.add(key);
        this.loadChunk(cx, cz).then(() => this._loading.delete(key));
        break;
      }
    }

    const toUnload = this._toUnloadBuffer;
    toUnload.length = 0;
    for (const [key, chunk] of this.chunks) {
      if (!needed.has(key)) toUnload.push([chunk.cx, chunk.cz]);
    }
    for (let u = 0; u < toUnload.length; u++) {
      const [cx, cz] = toUnload[u];
      this.unloadChunk(cx, cz);
    }

    const dirtyChunks = this._dirtyChunksBuffer;
    dirtyChunks.length = 0;
    for (const [, chunk] of this.chunks) {
      if (chunk.dirty) {
        const d = (chunk.cx - pcx) ** 2 + (chunk.cz - pcz) ** 2;
        dirtyChunks.push({ chunk, d });
      }
    }
    dirtyChunks.sort((a, b) => a.d - b.d);
    const rebuildsPerFrame = 2;
    for (let i = 0; i < Math.min(rebuildsPerFrame, dirtyChunks.length); i++) {
      this._rebuildChunkMesh(dirtyChunks[i].chunk);
    }

    this.waterUVOffset = (this.waterUVOffset + delta * 0.5) % 1;

    this._fireflyTime += delta;
    this._frameCount++;
    if (this._frameCount % 2 === 0) {
      const fireflyRadiusSq = Math.floor(R / 2) ** 2;
      for (const [, chunk] of this.chunks) {
        const distSq = (chunk.cx - pcx) ** 2 + (chunk.cz - pcz) ** 2;
        if (distSq > fireflyRadiusSq || !chunk.fireflyMeshes) continue;
        for (const f of chunk.fireflyMeshes) {
          const angle = f.phase + this._fireflyTime * f.speed;
          const bob = Math.sin(this._fireflyTime * 2.5 + f.bobbingPhase) * 0.06;
          f.group.position.x = f.baseX + Math.cos(angle) * f.radius;
          f.group.position.y = f.baseY + 0.25 + bob;
          f.group.position.z = f.baseZ + Math.sin(angle) * f.radius;
        }
      }
    }
  }

  raycast(origin, direction, maxDist = 5) {
    let [x, y, z] = [Math.floor(origin.x), Math.floor(origin.y), Math.floor(origin.z)];
    const [dx, dy, dz] = [direction.x, direction.y, direction.z];

    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / dx);
    const tDeltaY = Math.abs(1 / dy);
    const tDeltaZ = Math.abs(1 / dz);

    let tMaxX = dx !== 0 ? Math.abs((dx > 0 ? (x + 1 - origin.x) : (origin.x - x)) / dx) : Infinity;
    let tMaxY = dy !== 0 ? Math.abs((dy > 0 ? (y + 1 - origin.y) : (origin.y - y)) / dy) : Infinity;
    let tMaxZ = dz !== 0 ? Math.abs((dz > 0 ? (z + 1 - origin.z) : (origin.z - z)) / dz) : Infinity;

    let lastNormal = [0, 0, 0];
    let t = 0;

    while (t < maxDist) {
      const block = this.getBlock(x, y, z);
      if (!PASSABLE.has(block)) {
        return { pos: [x, y, z], normal: lastNormal };
      }

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        t = tMaxX; tMaxX += tDeltaX;
        x += stepX;
        lastNormal = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        t = tMaxY; tMaxY += tDeltaY;
        y += stepY;
        lastNormal = [0, -stepY, 0];
      } else {
        t = tMaxZ; tMaxZ += tDeltaZ;
        z += stepZ;
        lastNormal = [0, 0, -stepZ];
      }
    }

    return null;
  }

  getTerrainHeight(wx, wz) {
    const origin = { x: wx + 0.5, y: CHUNK_HEIGHT - 0.5, z: wz + 0.5 };
    const direction = { x: 0, y: -1, z: 0 };
    const hit = this.raycast(origin, direction, CHUNK_HEIGHT);
    if (!hit) return null;
    return hit.pos[1] + 1;
  }

  getLoadedChunkCount() {
    return this.chunks.size;
  }

  isAABBSolid(minX, minY, minZ, maxX, maxY, maxZ) {
    const x0 = Math.floor(minX), x1 = Math.floor(maxX);
    const y0 = Math.floor(minY), y1 = Math.floor(maxY);
    const z0 = Math.floor(minZ), z1 = Math.floor(maxZ);

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const b = this.getBlock(x, y, z);
          if (!PASSABLE.has(b)) return true;
        }
      }
    }
    return false;
  }

  isAABBInLongGrass(minX, minY, minZ, maxX, maxY, maxZ) {
    const x0 = Math.floor(minX), x1 = Math.floor(maxX);
    const y0 = Math.floor(minY), y1 = Math.floor(maxY);
    const z0 = Math.floor(minZ), z1 = Math.floor(maxZ);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (this.getBlock(x, y, z) === BLOCK.LONG_GRASS) return true;
        }
      }
    }
    return false;
  }

  isAABBInWater(minX, minY, minZ, maxX, maxY, maxZ) {
    const x0 = Math.floor(minX), x1 = Math.floor(maxX);
    const y0 = Math.floor(minY), y1 = Math.floor(maxY);
    const z0 = Math.floor(minZ), z1 = Math.floor(maxZ);

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (this.getBlock(x, y, z) === BLOCK.WATER) return true;
        }
      }
    }
    return false;
  }

  async saveAll() {
    const promises = [];
    for (const [, chunk] of this.chunks) {
      if (chunk.modifications.size > 0) {
        promises.push(this._saveChunk(chunk));
      }
    }
    await Promise.all(promises);
  }
}

function seededRandom(seed) {
  let s = seed | 0;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
