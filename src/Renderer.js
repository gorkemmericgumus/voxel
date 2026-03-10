import * as THREE from 'three';
import { BLOCK, BLOCK_COLORS, TRANSPARENT, AO_STRENGTH } from './Constants.js';

function makeToonGradient() {
  const data = new Uint8Array([
    200, 200, 200, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(data, 2, 1);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const TOON_GRADIENT = makeToonGradient();

export function createOpaqueMaterial() {
  return new THREE.MeshToonMaterial({
    vertexColors: true,
    side: THREE.FrontSide,
    gradientMap: TOON_GRADIENT,
  });
}

export function createToonColorMaterial(colorHex) {
  return new THREE.MeshToonMaterial({
    color: colorHex,
    side: THREE.FrontSide,
    gradientMap: TOON_GRADIENT,
  });
}

export function createTransparentMaterial() {
  return new THREE.MeshToonMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    gradientMap: TOON_GRADIENT,
  });
}

export function createEdgeLineMaterial() {
  return new THREE.LineBasicMaterial({
    color: 0x222222,
    linewidth: 1,
  });
}

export function createSparklyExtensionMaterial() {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
  });
}

export function createWaterMaterial() {
  return new THREE.MeshToonMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.90,
    side: THREE.DoubleSide,
    depthWrite: true,
    gradientMap: TOON_GRADIENT,
  });
}

function getFaceColor(blockId, dir) {
  const def = BLOCK_COLORS[blockId];
  if (!def) return [0.5, 0.5, 0.5];
  if (dir === 'top'    && def.top)    return def.top;
  if (dir === 'bottom' && def.bottom) return def.bottom;
  if (def.side) return def.side;
  return def.all || [0.5, 0.5, 0.5];
}

const FACES = [
  { n: [1,0,0], dir: 'side',   v: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
  { n: [-1,0,0], dir: 'side',  v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  { n: [0,1,0], dir: 'top',    v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { n: [0,-1,0], dir: 'bottom',v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { n: [0,0,1], dir: 'side',   v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { n: [0,0,-1], dir: 'side',  v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
];

const FACE_AO = [
  { t1:[0,0,1], t2:[0,1,0], signs:[[1,-1],[-1,-1],[-1,1],[1,1]] },
  { t1:[0,0,1], t2:[0,1,0], signs:[[-1,-1],[1,-1],[1,1],[-1,1]] },
  { t1:[1,0,0], t2:[0,0,1], signs:[[-1,1],[1,1],[1,-1],[-1,-1]] },
  { t1:[1,0,0], t2:[0,0,1], signs:[[-1,-1],[1,-1],[1,1],[-1,1]] },
  { t1:[1,0,0], t2:[0,1,0], signs:[[-1,-1],[1,-1],[1,1],[-1,1]] },
  { t1:[1,0,0], t2:[0,1,0], signs:[[1,-1],[-1,-1],[-1,1],[1,1]] },
];

function computeAO(isSolid, wx, wy, wz, faceIdx) {
  const [nx, ny, nz] = FACES[faceIdx].n;
  const { t1, t2, signs } = FACE_AO[faceIdx];
  const fx = wx + nx, fy = wy + ny, fz = wz + nz;
  return signs.map(([s1, s2]) => {
    const a = isSolid(fx + t1[0]*s1, fy + t1[1]*s1, fz + t1[2]*s1) ? 1 : 0;
    const b = isSolid(fx + t2[0]*s2, fy + t2[1]*s2, fz + t2[2]*s2) ? 1 : 0;
    const c = isSolid(fx + t1[0]*s1 + t2[0]*s2,
                      fy + t1[1]*s1 + t2[1]*s2,
                      fz + t1[2]*s1 + t2[2]*s2) ? 1 : 0;
    const occ = (a && b) ? 3 : a + b + c;
    return 1.0 - occ * AO_STRENGTH;
  });
}

const EDGE_NEIGHBORS = [
  [[0,-1,0], [0,0,-1], [0,1,0], [0,0,1]],
  [[0,-1,0], [0,0,1], [0,1,0], [0,0,-1]],
  [[0,0,1], [1,0,0], [0,0,-1], [-1,0,0]],
  [[0,0,-1], [1,0,0], [0,0,1], [-1,0,0]],
  [[0,-1,0], [1,0,0], [0,1,0], [-1,0,0]],
  [[0,-1,0], [-1,0,0], [0,1,0], [1,0,0]],
];

const SHADOW_DARKEN = 0.42;

function grassHash(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h ^ (h >> 16)) | 0;
}

function hashFrac(h) {
  return ((h & 0x7FFFFFFF) % 10000) / 10000;
}

const GRASS_GRID = [];
for (let gz = 0; gz < 4; gz++)
  for (let gx = 0; gx < 4; gx++)
    GRASS_GRID.push([0.10 + gx * 0.225, 0.10 + gz * 0.225]);

function emitGrassBlades(wx, wy, wz, sf, positions, normals, colors, indices, vcIn, edgePositions, blockId = BLOCK.TALL_GRASS, emissiveOut = null) {
  let vc = vcIn;
  const h0 = grassHash(wx, wz);
  const isRainforest = blockId === BLOCK.RAINFOREST_TALL_GRASS;
  const isLongGrass = blockId === BLOCK.LONG_GRASS;
  const isSparkly = blockId === BLOCK.SPARKLY_GRASS;
  const baseColor = isSparkly ? BLOCK_COLORS[BLOCK.GRASS].top : BLOCK_COLORS[blockId].all;

  const slots = [];
  for (let s = 0; s < 16; s++) slots.push(s);
  for (let s = 15; s > 0; s--) {
    const j = (Math.abs(grassHash(wx + s, wz + s * 3)) % (s + 1));
    [slots[s], slots[j]] = [slots[j], slots[s]];
  }
  const count = isLongGrass ? Math.min(16, 14 + (Math.abs(h0) % 6)) : isRainforest ? (9 + (Math.abs(h0) % 4)) : (7 + (Math.abs(h0) % 4));

  for (let i = 0; i < count; i++) {
    const hi = grassHash(wx + i * 7, wz + i * 13);
    const [gx, gz] = GRASS_GRID[slots[i]];
    const jitter = isLongGrass ? 0.06 : isRainforest ? 0.08 : 0.06;
    const bw = isLongGrass ? (0.07 + hashFrac(hi) * 0.08) : isRainforest ? (0.08 + hashFrac(hi) * 0.10) : (0.06 + hashFrac(hi) * 0.08);
    const bd = isLongGrass ? (0.07 + hashFrac(hi >> 5) * 0.08) : isRainforest ? (0.08 + hashFrac(hi >> 5) * 0.10) : (0.06 + hashFrac(hi >> 5) * 0.08);
    const bh = isLongGrass ? (1.35 + hashFrac(hi >> 10) * 1.1) : isRainforest ? (0.50 + hashFrac(hi >> 10) * 0.50) : (0.20 + hashFrac(hi >> 10) * 0.60);
    const ox = gx + (hashFrac(hi >> 15) - 0.5) * jitter;
    const oz = gz + (hashFrac(hi >> 20) - 0.5) * jitter;
    const cv = 0.85 + hashFrac(hi >> 25) * 0.30;

    const cr = baseColor[0] * cv * sf;
    const cg = baseColor[1] * cv * sf;
    const cb = baseColor[2] * cv * sf;

    const x0 = wx + ox, y0 = wy, z0 = wz + oz;
    const x1 = x0 + bw, y1 = y0 + bh, z1 = z0 + bd;

    const bladeFaces = [
      { n: [1,0,0],  v: [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]] },
      { n: [-1,0,0], v: [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]] },
      { n: [0,1,0],  v: [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]] },
      { n: [0,0,1],  v: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]] },
      { n: [0,0,-1], v: [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]] },
    ];

    for (const f of bladeFaces) {
      const base = vc;
      for (let vi = 0; vi < 4; vi++) {
        positions.push(f.v[vi][0], f.v[vi][1], f.v[vi][2]);
        normals.push(f.n[0], f.n[1], f.n[2]);
        colors.push(cr, cg, cb);
      }
      indices.push(base, base+1, base+2, base, base+2, base+3);
      vc += 4;
    }

    const c = [
      [x0,y0,z0], [x1,y0,z0], [x1,y0,z1], [x0,y0,z1],
      [x0,y1,z0], [x1,y1,z0], [x1,y1,z1], [x0,y1,z1],
    ];
    const edges = [
      [0,1],[1,2],[2,3],[3,0],
      [4,5],[5,6],[6,7],[7,4],
      [0,4],[1,5],[2,6],[3,7],
    ];
    for (const [a, b] of edges) {
      edgePositions.push(c[a][0],c[a][1],c[a][2], c[b][0],c[b][1],c[b][2]);
    }

    if (isSparkly && emissiveOut) {
      const extH = 0.14;
      const ey0 = y1, ey1 = y1 + extH;
      const wr = 1.0, wg = 1.0, wb = 1.0;
      const ep = emissiveOut.positions, en = emissiveOut.normals, ec = emissiveOut.colors, ei = emissiveOut.indices;
      let evc = emissiveOut.vc;
      const extFaces = [
        { n: [1,0,0],  v: [[x1,ey0,z1],[x1,ey0,z0],[x1,ey1,z0],[x1,ey1,z1]] },
        { n: [-1,0,0], v: [[x0,ey0,z0],[x0,ey0,z1],[x0,ey1,z1],[x0,ey1,z0]] },
        { n: [0,1,0],  v: [[x0,ey1,z1],[x1,ey1,z1],[x1,ey1,z0],[x0,ey1,z0]] },
        { n: [0,-1,0], v: [[x0,ey0,z0],[x1,ey0,z0],[x1,ey0,z1],[x0,ey0,z1]] },
        { n: [0,0,1],  v: [[x0,ey0,z1],[x1,ey0,z1],[x1,ey1,z1],[x0,ey1,z1]] },
        { n: [0,0,-1], v: [[x1,ey0,z0],[x0,ey0,z0],[x0,ey1,z0],[x1,ey1,z0]] },
      ];
      for (const f of extFaces) {
        const base = evc;
        for (let vi = 0; vi < 4; vi++) {
          ep.push(f.v[vi][0], f.v[vi][1], f.v[vi][2]);
          en.push(f.n[0], f.n[1], f.n[2]);
          ec.push(wr, wg, wb);
        }
        ei.push(base, base+1, base+2, base, base+2, base+3);
        evc += 4;
      }
      emissiveOut.vc = evc;
    }
  }

  return vc;
}

function emitSugarCane(wx, wy, wz, sf, positions, normals, colors, indices, vcIn, edgePositions) {
  let vc = vcIn;
  const h0 = grassHash(wx, wz);
  const baseColor = BLOCK_COLORS[BLOCK.SUGAR_CANE].all;
  const numStalks = 4 + (Math.abs(h0) % 2);
  const stalkOffsets = [[0.22, 0.48], [0.48, 0.26], [0.72, 0.52], [0.32, 0.74], [0.68, 0.72]];

  for (let s = 0; s < numStalks; s++) {
    const [sx, sz] = stalkOffsets[s];
    const cx = wx + sx, cz = wz + sz;
    const stalkHash = grassHash(wx + s * 7, wz + s * 13);
    const totalHeight = 3.2 + hashFrac(stalkHash) * 2.2;
    const numSegments = 8 + (Math.abs(stalkHash >> 10) % 6);
    const segHeight = totalHeight / numSegments;
    const bw = 0.10 + hashFrac(stalkHash >> 4) * 0.04;
    const bd = 0.10 + hashFrac(stalkHash >> 8) * 0.04;

    for (let i = 0; i < numSegments; i++) {
      const hi = grassHash(wx + i * 11 + s * 5, wz + i * 19 + s * 3);
      const y0 = wy + i * segHeight;
      const y1 = wy + (i + 1) * segHeight;
      const ox = (hashFrac(hi) - 0.5) * 0.06;
      const oz = (hashFrac(hi >> 6) - 0.5) * 0.06;
      const cv = 0.88 + hashFrac(hi >> 12) * 0.24;
      const cr = baseColor[0] * cv * sf;
      const cg = baseColor[1] * cv * sf;
      const cb = baseColor[2] * cv * sf;

      const x0 = cx - bw * 0.5 + ox;
      const z0 = cz - bd * 0.5 + oz;
      const x1 = x0 + bw;
      const z1 = z0 + bd;

      const faceList = [
        { n: [1,0,0],  v: [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]] },
        { n: [-1,0,0], v: [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]] },
        { n: [0,1,0],  v: [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]] },
        { n: [0,-1,0], v: [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]] },
        { n: [0,0,1],  v: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]] },
        { n: [0,0,-1], v: [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]] },
      ];
      for (const f of faceList) {
        const base = vc;
        for (let vi = 0; vi < 4; vi++) {
          positions.push(f.v[vi][0], f.v[vi][1], f.v[vi][2]);
          normals.push(f.n[0], f.n[1], f.n[2]);
          colors.push(cr, cg, cb);
        }
        indices.push(base, base+1, base+2, base, base+2, base+3);
        vc += 4;
      }
      const c = [
        [x0,y0,z0], [x1,y0,z0], [x1,y0,z1], [x0,y0,z1],
        [x0,y1,z0], [x1,y1,z0], [x1,y1,z1], [x0,y1,z1],
      ];
      const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      for (const [a, b] of edges) {
        edgePositions.push(c[a][0], c[a][1], c[a][2], c[b][0], c[b][1], c[b][2]);
      }
    }
  }
  return vc;
}

const ROSE_OFFSETS = [[0.18, 0.20], [0.48, 0.52], [0.78, 0.24], [0.24, 0.76], [0.62, 0.78]];
const STEM_EDGES = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

function emitRose(wx, wy, wz, sf, positions, normals, colors, indices, vcIn, edgePositions) {
  let vc = vcIn;
  const stemColor = BLOCK_COLORS[BLOCK.ROSE].stem;
  const flowerColor = BLOCK_COLORS[BLOCK.ROSE].flower;
  const h0 = grassHash(wx, wz);
  const numStems = 4 + (Math.abs(h0) % 2);

  for (let s = 0; s < numStems; s++) {
    const [ox, oz] = ROSE_OFFSETS[s];
    const hi = grassHash(wx + s * 7, wz + s * 13);
    const stemW = 0.09;
    const stemH = 0.38 + hashFrac(hi) * 0.30;
    const x0 = wx + ox - stemW * 0.5, x1 = x0 + stemW;
    const z0 = wz + oz - stemW * 0.5, z1 = z0 + stemW;
    const y0 = wy, y1 = wy + stemH;

    const stemFaces = [
      { n: [1,0,0],  v: [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]] },
      { n: [-1,0,0], v: [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]] },
      { n: [0,1,0],  v: [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]] },
      { n: [0,0,1],  v: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]] },
      { n: [0,0,-1], v: [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]] },
    ];
    const [sr, sg, sb] = stemColor;
    for (const f of stemFaces) {
      const base = vc;
      for (let vi = 0; vi < 4; vi++) {
        positions.push(f.v[vi][0], f.v[vi][1], f.v[vi][2]);
        normals.push(f.n[0], f.n[1], f.n[2]);
        colors.push(sr * sf, sg * sf, sb * sf);
      }
      indices.push(base, base+1, base+2, base, base+2, base+3);
      vc += 4;
    }
    const stemCorners = [
      [x0,y0,z0], [x1,y0,z0], [x1,y0,z1], [x0,y0,z1],
      [x0,y1,z0], [x1,y1,z0], [x1,y1,z1], [x0,y1,z1],
    ];
    for (const [a, b] of STEM_EDGES) {
      edgePositions.push(stemCorners[a][0], stemCorners[a][1], stemCorners[a][2], stemCorners[b][0], stemCorners[b][1], stemCorners[b][2]);
    }

    const flowerSize = 0.16;
    const fy0 = wy + stemH;
    const fy1 = fy0 + flowerSize;
    const fx0 = wx + ox - flowerSize * 0.5;
    const fx1 = fx0 + flowerSize;
    const fz0 = wz + oz - flowerSize * 0.5;
    const fz1 = fz0 + flowerSize;

    const flowerFaces = [
      { n: [1,0,0],  v: [[fx1,fy0,fz1],[fx1,fy0,fz0],[fx1,fy1,fz0],[fx1,fy1,fz1]] },
      { n: [-1,0,0], v: [[fx0,fy0,fz0],[fx0,fy0,fz1],[fx0,fy1,fz1],[fx0,fy1,fz0]] },
      { n: [0,1,0],  v: [[fx0,fy1,fz1],[fx1,fy1,fz1],[fx1,fy1,fz0],[fx0,fy1,fz0]] },
      { n: [0,-1,0], v: [[fx0,fy0,fz0],[fx1,fy0,fz0],[fx1,fy0,fz1],[fx0,fy0,fz1]] },
      { n: [0,0,1],  v: [[fx0,fy0,fz1],[fx1,fy0,fz1],[fx1,fy1,fz1],[fx0,fy1,fz1]] },
      { n: [0,0,-1], v: [[fx1,fy0,fz0],[fx0,fy0,fz0],[fx0,fy1,fz0],[fx1,fy1,fz0]] },
    ];
    const [fr, fg, fb] = flowerColor;
    for (const f of flowerFaces) {
      const base = vc;
      for (let vi = 0; vi < 4; vi++) {
        positions.push(f.v[vi][0], f.v[vi][1], f.v[vi][2]);
        normals.push(f.n[0], f.n[1], f.n[2]);
        colors.push(fr * sf, fg * sf, fb * sf);
      }
      indices.push(base, base+1, base+2, base, base+2, base+3);
      vc += 4;
    }
    const flowerCorners = [
      [fx0,fy0,fz0], [fx1,fy0,fz0], [fx1,fy0,fz1], [fx0,fy0,fz1],
      [fx0,fy1,fz0], [fx1,fy1,fz0], [fx1,fy1,fz1], [fx0,fy1,fz1],
    ];
    for (const [a, b] of STEM_EDGES) {
      edgePositions.push(flowerCorners[a][0], flowerCorners[a][1], flowerCorners[a][2], flowerCorners[b][0], flowerCorners[b][1], flowerCorners[b][2]);
    }
  }

  return vc;
}

export function buildChunkGeometry(blocks, cx, cz, getWorldBlock, pass = 'opaque') {
  const W = 16, H = 128;
  const wx0 = cx * W, wz0 = cz * W;

  const positions = [], normals = [], colors = [], indices = [];
  let vc = 0;

  const edgePositions = [];
  const emissiveOut = pass === 'transparent' ? { positions: [], normals: [], colors: [], indices: [], vc: 0 } : null;

  const skyHeight = new Int32Array(W * W).fill(-1);
  for (let lz = 0; lz < W; lz++) {
    for (let lx = 0; lx < W; lx++) {
      for (let ly = H - 1; ly >= 0; ly--) {
        const b = blocks[lx + lz * W + ly * W * W];
        if (b !== BLOCK.AIR && b !== BLOCK.TALL_GRASS && b !== BLOCK.RAINFOREST_TALL_GRASS && b !== BLOCK.LONG_GRASS && b !== BLOCK.SPARKLY_GRASS && b !== BLOCK.SUGAR_CANE && b !== BLOCK.ROSE) {
          skyHeight[lx + lz * W] = ly;
          break;
        }
      }
    }
  }

  function hasSkyAccess(awx, awy, awz) {
    const lx = awx - wx0, lz = awz - wz0;
    if (lx >= 0 && lx < W && lz >= 0 && lz < W) {
      return awy > skyHeight[lx + lz * W];
    }
    for (let y = awy + 1; y < H; y++) {
      const b = getWorldBlock(awx, y, awz);
      if (b !== BLOCK.AIR && b !== BLOCK.TALL_GRASS && b !== BLOCK.RAINFOREST_TALL_GRASS && b !== BLOCK.LONG_GRASS && b !== BLOCK.SPARKLY_GRASS && b !== BLOCK.SUGAR_CANE && b !== BLOCK.ROSE) return false;
    }
    return true;
  }

  function blockAt(lx, ly, lz) {
    if (lx < 0 || lx >= W || lz < 0 || lz >= W || ly < 0 || ly >= H)
      return getWorldBlock(wx0 + lx, ly, wz0 + lz);
    return blocks[lx + lz * W + ly * W * W];
  }

  function isSolid(wx, wy, wz) {
    const b = getWorldBlock(wx, wy, wz);
    return b !== BLOCK.AIR && !TRANSPARENT.has(b);
  }

  for (let ly = 0; ly < H; ly++) {
    for (let lz = 0; lz < W; lz++) {
      for (let lx = 0; lx < W; lx++) {
        const blockId = blocks[lx + lz * W + ly * W * W];
        if (blockId === BLOCK.AIR) continue;

        const isWater  = blockId === BLOCK.WATER;
        const isTransp = TRANSPARENT.has(blockId) && !isWater;
        if (pass === 'opaque'      && (isTransp || isWater)) continue;
        if (pass === 'water'       && !isWater)              continue;
        if (pass === 'transparent' && (!isTransp || isWater)) continue;

        const wx = wx0 + lx, wy = ly, wz = wz0 + lz;

        if (blockId === BLOCK.TALL_GRASS || blockId === BLOCK.RAINFOREST_TALL_GRASS || blockId === BLOCK.LONG_GRASS || blockId === BLOCK.SPARKLY_GRASS) {
          const sf = hasSkyAccess(wx, wy, wz) ? 1.0 : SHADOW_DARKEN;
          vc = emitGrassBlades(wx, wy, wz, sf, positions, normals, colors, indices, vc, edgePositions, blockId, emissiveOut);
          continue;
        }
        if (blockId === BLOCK.SUGAR_CANE) {
          const sf = hasSkyAccess(wx, wy, wz) ? 1.0 : SHADOW_DARKEN;
          vc = emitSugarCane(wx, wy, wz, sf, positions, normals, colors, indices, vc, edgePositions);
          continue;
        }
        if (blockId === BLOCK.ROSE) {
          const sf = hasSkyAccess(wx, wy, wz) ? 1.0 : SHADOW_DARKEN;
          vc = emitRose(wx, wy, wz, sf, positions, normals, colors, indices, vc, edgePositions);
          continue;
        }

        for (let fi = 0; fi < FACES.length; fi++) {
          const face = FACES[fi];
          const [nx, ny, nz] = face.n;
          const nId = blockAt(lx + nx, ly + ny, lz + nz);

          if (!TRANSPARENT.has(nId)) continue;
          if ((isTransp || isWater) && nId === blockId) continue;

          const ao = computeAO(isSolid, wx, wy, wz, fi);
          const sf = hasSkyAccess(wx + nx, wy + ny, wz + nz) ? 1.0 : SHADOW_DARKEN;

          const isGrassLike = blockId === BLOCK.GRASS || blockId === BLOCK.RAINFOREST_GRASS;
          if (isGrassLike && face.dir === 'side') {
            const cutY = 0.75;
            const greenCol = getFaceColor(blockId, 'side');
            const dCol = blockId === BLOCK.RAINFOREST_GRASS
              ? BLOCK_COLORS[BLOCK.RAINFOREST_DIRT].all
              : BLOCK_COLORS[BLOCK.DIRT].all;
            const v0 = face.v[0], v1 = face.v[1];

            const strips = [
              { yLo: 0, yHi: cutY, col: dCol },
              { yLo: cutY, yHi: 1, col: greenCol },
            ];
            for (const s of strips) {
              const a0 = ao[0] + (ao[3] - ao[0]) * s.yLo;
              const a1 = ao[1] + (ao[2] - ao[1]) * s.yLo;
              const a2 = ao[1] + (ao[2] - ao[1]) * s.yHi;
              const a3 = ao[0] + (ao[3] - ao[0]) * s.yHi;
              const sa = [a0, a1, a2, a3];
              const b = vc;
              positions.push(
                wx+v0[0], wy+s.yLo, wz+v0[2],
                wx+v1[0], wy+s.yLo, wz+v1[2],
                wx+v1[0], wy+s.yHi, wz+v1[2],
                wx+v0[0], wy+s.yHi, wz+v0[2]
              );
              for (let k = 0; k < 4; k++) normals.push(nx, ny, nz);
              for (let k = 0; k < 4; k++)
                colors.push(s.col[0]*sa[k]*sf, s.col[1]*sa[k]*sf, s.col[2]*sa[k]*sf);
              indices.push(b,b+1,b+2, b,b+2,b+3);
              vc += 4;
            }

            if (pass === 'opaque') {
              const edgeN = EDGE_NEIGHBORS[fi];
              const off = 0.002;
              for (let ei = 0; ei < 4; ei++) {
                const [enx, eny, enz] = edgeN[ei];
                const neighborId = blockAt(lx + enx, ly + eny, lz + enz);
                if (neighborId === blockId) continue;
                const [ax, ay, az] = face.v[ei];
                const [bx, by, bz] = face.v[(ei + 1) % 4];
                edgePositions.push(
                  wx+ax+nx*off, wy+ay+ny*off, wz+az+nz*off,
                  wx+bx+nx*off, wy+by+ny*off, wz+bz+nz*off
                );
              }
              edgePositions.push(
                wx + v0[0] + nx * off, wy + cutY + ny * off, wz + v0[2] + nz * off,
                wx + v1[0] + nx * off, wy + cutY + ny * off, wz + v1[2] + nz * off
              );
            }
            continue;
          }

          if (blockId === BLOCK.COAL_ORE) {
            const N = 8;
            const bgCol = getFaceColor(blockId, face.dir);
            const coalCol = [0.14, 0.12, 0.10];
            const pixelEdgeOff = 0.003;
            const fv = face.v;
            const duX = (fv[1][0] - fv[0][0]) / N, duY = (fv[1][1] - fv[0][1]) / N, duZ = (fv[1][2] - fv[0][2]) / N;
            const dvX = (fv[3][0] - fv[0][0]) / N, dvY = (fv[3][1] - fv[0][1]) / N, dvZ = (fv[3][2] - fv[0][2]) / N;

            const COAL_PATTERN = [
              0,0,0,0,0,0,0,0, 0,0,0,1,1,1,0,0, 0,0,1,1,1,1,1,0, 0,1,1,1,1,1,1,0,
              0,0,1,1,1,1,0,0, 0,0,1,1,1,0,0,0, 0,0,0,1,1,0,0,0, 0,0,0,0,0,0,0,0,
            ];
            const coalMap = Array.from({ length: N }, (_, gj) =>
              Array.from({ length: N }, (_, gi) => COAL_PATTERN[gj * N + gi] !== 0));

            for (let gj = 0; gj < N; gj++) {
              for (let gi = 0; gi < N; gi++) {
                const isCoal = coalMap[gj][gi];
                const col = isCoal ? coalCol : bgCol;

                const bx0 = fv[0][0] + duX * gi + dvX * gj;
                const by0 = fv[0][1] + duY * gi + dvY * gj;
                const bz0 = fv[0][2] + duZ * gi + dvZ * gj;

                positions.push(
                  wx + bx0,             wy + by0,             wz + bz0,
                  wx + bx0 + duX,       wy + by0 + duY,       wz + bz0 + duZ,
                  wx + bx0 + duX + dvX, wy + by0 + duY + dvY, wz + bz0 + duZ + dvZ,
                  wx + bx0 + dvX,       wy + by0 + dvY,       wz + bz0 + dvZ
                );
                for (let k = 0; k < 4; k++) normals.push(nx, ny, nz);

                const u0 = gi / N, u1 = (gi + 1) / N, w0 = gj / N, w1 = (gj + 1) / N;
                const cAo = [
                  ao[0]*(1-u0)*(1-w0) + ao[1]*u0*(1-w0) + ao[2]*u0*w0 + ao[3]*(1-u0)*w0,
                  ao[0]*(1-u1)*(1-w0) + ao[1]*u1*(1-w0) + ao[2]*u1*w0 + ao[3]*(1-u1)*w0,
                  ao[0]*(1-u1)*(1-w1) + ao[1]*u1*(1-w1) + ao[2]*u1*w1 + ao[3]*(1-u1)*w1,
                  ao[0]*(1-u0)*(1-w1) + ao[1]*u0*(1-w1) + ao[2]*u0*w1 + ao[3]*(1-u0)*w1,
                ];
                for (let k = 0; k < 4; k++)
                  colors.push(col[0] * cAo[k] * sf, col[1] * cAo[k] * sf, col[2] * cAo[k] * sf);

                const b = vc;
                indices.push(b, b+1, b+2, b, b+2, b+3);
                vc += 4;

                if (pass === 'opaque' && isCoal) {
                  const px0 = wx + bx0 + nx * pixelEdgeOff;
                  const py0 = wy + by0 + ny * pixelEdgeOff;
                  const pz0 = wz + bz0 + nz * pixelEdgeOff;
                  const px1 = wx + bx0 + duX + nx * pixelEdgeOff;
                  const py1 = wy + by0 + duY + ny * pixelEdgeOff;
                  const pz1 = wz + bz0 + duZ + nz * pixelEdgeOff;
                  const px2 = wx + bx0 + duX + dvX + nx * pixelEdgeOff;
                  const py2 = wy + by0 + duY + dvY + ny * pixelEdgeOff;
                  const pz2 = wz + bz0 + duZ + dvZ + nz * pixelEdgeOff;
                  const px3 = wx + bx0 + dvX + nx * pixelEdgeOff;
                  const py3 = wy + by0 + dvY + ny * pixelEdgeOff;
                  const pz3 = wz + bz0 + dvZ + nz * pixelEdgeOff;
                  const drawBottom = gj === 0 || !coalMap[gj - 1][gi];
                  const drawRight = gi === N - 1 || !coalMap[gj][gi + 1];
                  const drawTop = gj === N - 1 || !coalMap[gj + 1][gi];
                  const drawLeft = gi === 0 || !coalMap[gj][gi - 1];
                  if (drawBottom) edgePositions.push(px0, py0, pz0, px1, py1, pz1);
                  if (drawRight) edgePositions.push(px1, py1, pz1, px2, py2, pz2);
                  if (drawTop) edgePositions.push(px2, py2, pz2, px3, py3, pz3);
                  if (drawLeft) edgePositions.push(px3, py3, pz3, px0, py0, pz0);
                }
              }
            }

            if (pass === 'opaque') {
              const edgeN = EDGE_NEIGHBORS[fi];
              const off = 0.002;
              for (let ei = 0; ei < 4; ei++) {
                const [enx, eny, enz] = edgeN[ei];
                const neighborId = blockAt(lx + enx, ly + eny, lz + enz);
                if (neighborId === blockId) continue;
                const [ax, ay, az] = face.v[ei];
                const [bx, by, bz] = face.v[(ei + 1) % 4];
                edgePositions.push(
                  wx + ax + nx * off, wy + ay + ny * off, wz + az + nz * off,
                  wx + bx + nx * off, wy + by + ny * off, wz + bz + nz * off
                );
              }
            }
            continue;
          }

          const [br, bg, bb] = getFaceColor(blockId, face.dir);

          const isDirtLike = blockId === BLOCK.DIRT || blockId === BLOCK.RAINFOREST_DIRT;
          const dirtTop = isDirtLike && face.dir === 'top'
            && blockAt(lx, ly + 1, lz) === BLOCK.AIR;
          const dirtGreen = dirtTop
            ? (blockId === BLOCK.RAINFOREST_DIRT ? [0.22, 0.48, 0.16] : [0.38, 0.58, 0.22])
            : null;

          const base = vc;
          for (let vi = 0; vi < 4; vi++) {
            const [vx, vy, vz] = face.v[vi];
            positions.push(wx + vx, wy + vy, wz + vz);
            normals.push(nx, ny, nz);
            let cr = br, cg = bg, cb = bb;
            if (dirtGreen) {
              cr = dirtGreen[0]; cg = dirtGreen[1]; cb = dirtGreen[2];
            }
            colors.push(cr * ao[vi] * sf, cg * ao[vi] * sf, cb * ao[vi] * sf);
          }
          if (ao[0] + ao[2] > ao[1] + ao[3]) {
            indices.push(base, base+1, base+2,  base, base+2, base+3);
          } else {
            indices.push(base+1, base+2, base+3,  base, base+1, base+3);
          }
          vc += 4;

          if (pass === 'opaque' || pass === 'transparent') {
            const edgeN = EDGE_NEIGHBORS[fi];
            const off = 0.002;
            for (let ei = 0; ei < 4; ei++) {
              const [enx, eny, enz] = edgeN[ei];
              const neighborId = blockAt(lx + enx, ly + eny, lz + enz);
              if (neighborId === blockId) continue;
              const [ax, ay, az] = face.v[ei];
              const [bx, by, bz] = face.v[(ei + 1) % 4];
              edgePositions.push(
                wx + ax + nx * off, wy + ay + ny * off, wz + az + nz * off,
                wx + bx + nx * off, wy + by + ny * off, wz + bz + nz * off
              );
            }
          }
        }
      }
    }
  }

  const result = { geo: null, edgeGeo: null, emissiveGeo: null };

  if (vc > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    result.geo = geo;
  }

  if (edgePositions.length > 0) {
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    result.edgeGeo = edgeGeo;
  }

  if (emissiveOut && emissiveOut.vc > 0) {
    const emissiveGeo = new THREE.BufferGeometry();
    emissiveGeo.setAttribute('position', new THREE.Float32BufferAttribute(emissiveOut.positions, 3));
    emissiveGeo.setAttribute('normal',   new THREE.Float32BufferAttribute(emissiveOut.normals, 3));
    emissiveGeo.setAttribute('color',    new THREE.Float32BufferAttribute(emissiveOut.colors, 3));
    emissiveGeo.setIndex(emissiveOut.indices);
    result.emissiveGeo = emissiveGeo;
  }

  return result;
}
