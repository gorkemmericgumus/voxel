import * as THREE from 'three';
import { PLAYER, KEYS, BLOCK, BREAK_TIME, INDESTRUCTIBLE } from './Constants.js';
import { playFootstep, playBlockBreak, playBlockPlace, playJump, playSplash } from './Audio.js';

export const STATE = {
  WALKING:  'walking',
  SPRINTING: 'sprinting',
  SNEAKING: 'sneaking',
  SWIMMING: 'swimming',
  FLYING:   'flying',
  FALLING:  'falling',
};

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world  = world;

    this.position = new THREE.Vector3(8, 70, 8);
    this.velocity = new THREE.Vector3(0, 0, 0);

    this.yaw   = 0;
    this.pitch = 0;

    this.state       = STATE.FALLING;
    this.onGround    = false;
    this.inWater     = false;
    this.flying      = false;
    this.inLongGrass = false;

    this.keys = {};
    this.mouseButtons = {};

    this.hotbarSlot = 0;
    this.health = 10;
    this.maxHealth = 10;
    this.energy = 10;
    this.maxEnergy = 10;

    this.breakTarget   = null;
    this.breakProgress = 0;
    this.breakTime     = 0;

    this._bobTime   = 0;
    this._bobOffset = 0;

    this._footstepTimer = 0;

    this._lastWKeyDownTime = 0;
    this._boostRemaining = 0;

    this._targetFOV = PLAYER.FOV_NORMAL;
    this._currentFOV = PLAYER.FOV_NORMAL;

    this.blockOutline = this._buildBlockOutline();

    this.particles = [];
    this._particleGroup = new THREE.Group();

    this._setupInput();
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  _setupInput() {
    document.addEventListener('keydown', (e) => {
      if (this.health <= 0) return;
      this.keys[e.code] = true;

      if (e.code === KEYS.FORWARD && !e.repeat) {
        const now = Date.now();
        if (now - this._lastWKeyDownTime < PLAYER.DOUBLE_TAP_MS) {
          this._boostRemaining = 1;
        }
        this._lastWKeyDownTime = now;
      }

      if (e.code === KEYS.FLY) {
        this.flying = !this.flying;
        this.velocity.y = 0;
      }
    });

    document.addEventListener('keyup', (e) => {
      if (this.health <= 0) return;
      this.keys[e.code] = false;
      if (e.code === KEYS.FORWARD) this._boostRemaining = 0;
    });

    document.addEventListener('mousedown', (e) => {
      if (this.health <= 0) return;
      this.mouseButtons[e.button] = true;
    });

    document.addEventListener('mouseup', (e) => {
      if (this.health <= 0) return;
      this.mouseButtons[e.button] = false;
      if (e.button === 0) {
        this._cancelBreaking();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (this.health <= 0 || !document.pointerLockElement) return;
      const sensitivity = 0.002;
      this.yaw   -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });

    document.addEventListener('wheel', (e) => {
      if (this.health <= 0) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      this.hotbarSlot = ((this.hotbarSlot + dir) + 9) % 9;
    });
  }

  _buildBlockOutline() {
    const geo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({
      color: 0x000000,
      linewidth: 1,
      depthTest: true,
    });
    const outline = new THREE.LineSegments(edges, mat);
    outline.visible = false;
    return outline;
  }

  _spawnBreakParticles(x, y, z) {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const mat = new THREE.MeshLambertMaterial({ color: 0x888855 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        x + 0.5 + (Math.random() - 0.5) * 0.8,
        y + 0.5 + (Math.random() - 0.5) * 0.8,
        z + 0.5 + (Math.random() - 0.5) * 0.8
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 5 + 1,
        (Math.random() - 0.5) * 4
      );
      this.particles.push({ mesh, vel, life: 0.6 });
      this._particleGroup.add(mesh);
    }
  }

  _updateParticles(delta) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      if (p.life <= 0) {
        this._particleGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 18 * delta;
      p.mesh.position.addScaledVector(p.vel, delta);
      p.mesh.material.opacity = p.life / 0.6;
      p.mesh.material.transparent = true;
    }
  }

  _resolveAxis(dx, dy, dz) {
    const hw = PLAYER.WIDTH  / 2;
    const hh = PLAYER.HEIGHT;
    const { x, y, z } = this.position;

    const nx = x + dx;
    const ny = y + dy;
    const nz = z + dz;

    const collides = this.world.isAABBSolid(
      nx - hw, ny,      nz - hw,
      nx + hw, ny + hh, nz + hw
    );

    if (!collides) {
      this.position.x = nx;
      this.position.y = ny;
      this.position.z = nz;
      return false;
    }
    return true;
  }

  _updatePhysics(delta) {
    const hw = PLAYER.WIDTH / 2;
    const hh = PLAYER.HEIGHT;
    const { x, y, z } = this.position;
    const wasOnGround = this.onGround;

    const wasInWater = this.inWater;
    this.inWater = this.world.isAABBInWater(
      x - hw, y,      z - hw,
      x + hw, y + hh, z + hw
    );

    if (!wasInWater && this.inWater) playSplash();

    this.inLongGrass = this.world.isAABBInLongGrass(
      x - hw, y,      z - hw,
      x + hw, y + hh, z + hw
    );

    if (this.flying) {
      this.velocity.y *= 0.8;
    } else if (this.inWater) {
      this.velocity.y += PLAYER.WATER_GRAVITY * delta;
      this.velocity.y *= 0.9;
    } else {
      this.velocity.y += PLAYER.GRAVITY * delta;
    }

    let sneakBlockX = dx => {
      if (!this.keys[KEYS.SNEAK]) return false;
      const testX = x + dx;
      return !this.world.isAABBSolid(
        testX - hw, y - 0.1, z - hw,
        testX + hw, y - 0.1, z + hw
      );
    };
    let sneakBlockZ = dz => {
      if (!this.keys[KEYS.SNEAK]) return false;
      const testZ = z + dz;
      return !this.world.isAABBSolid(
        x - hw, y - 0.1, testZ - hw,
        x + hw, y - 0.1, testZ + hw
      );
    };

    const moveX = this.velocity.x * delta;
    if (!sneakBlockX(moveX)) {
      if (this._resolveAxis(moveX, 0, 0)) {
        if (this.onGround && !this._resolveAxis(moveX, 1, 0)) {
        } else {
          this.velocity.x = 0;
        }
      }
    } else {
      this.velocity.x = 0;
    }

    const moveZ = this.velocity.z * delta;
    if (!sneakBlockZ(moveZ)) {
      if (this._resolveAxis(0, 0, moveZ)) {
        if (this.onGround && !this._resolveAxis(0, 1, moveZ)) {
        } else {
          this.velocity.z = 0;
        }
      }
    } else {
      this.velocity.z = 0;
    }

    const prevVelY = this.velocity.y;
    const moveY = this.velocity.y * delta;
    const hitY  = this._resolveAxis(0, moveY, 0);
    if (hitY) {
      if (prevVelY < 0) {
        this.onGround = true;
        if (!wasOnGround && !this.inWater && !this.flying) {
          const impactSpeed = -prevVelY;
          const damageThreshold = 18;
          if (impactSpeed > damageThreshold) {
            const damage = Math.floor((impactSpeed - damageThreshold) * 0.25);
            if (damage > 0) this.takeDamage(damage);
          }
        }
      }
      this.velocity.y = 0;
    } else {
      this.onGround = false;
    }

    const drag = this.inWater ? 0.85 : (this.onGround ? 0.75 : 0.98);
    this.velocity.x *= drag;
    this.velocity.z *= drag;

    if (this.position.y < -20) {
      this.position.set(8, 70, 8);
      this.velocity.set(0, 0, 0);
    }
  }

  _updateMovement(delta) {
    let speed = PLAYER.WALK_SPEED;
    const isSprinting = this.keys[KEYS.SPRINT] && !this.keys[KEYS.SNEAK];
    const isSneaking  = this.keys[KEYS.SNEAK];
    const isBoost     = this._boostRemaining > 0 && this.keys[KEYS.FORWARD];

    if (this.flying) {
      speed = PLAYER.SPRINT_SPEED * 1.5;
    } else if (this.inWater) {
      speed = PLAYER.SWIM_SPEED;
      this._targetFOV = PLAYER.FOV_NORMAL;
    } else if (isBoost) {
      speed = PLAYER.BOOST_SPEED;
      this._targetFOV = PLAYER.FOV_BOOST;
    } else if (isSprinting) {
      speed = PLAYER.SPRINT_SPEED;
      this._targetFOV = PLAYER.FOV_SPRINT;
    } else if (isSneaking) {
      speed = PLAYER.SNEAK_SPEED;
      this._targetFOV = PLAYER.FOV_SNEAK;
    } else {
      this._targetFOV = PLAYER.FOV_NORMAL;
    }

    const isMoving = this.keys[KEYS.FORWARD] || this.keys[KEYS.BACKWARD] ||
                     this.keys[KEYS.LEFT]    || this.keys[KEYS.RIGHT];

    if (this.inWater)       this.state = STATE.SWIMMING;
    else if (this.flying)   this.state = STATE.FLYING;
    else if (isSneaking)    this.state = STATE.SNEAKING;
    else if (isBoost)       this.state = STATE.SPRINTING;
    else if (isSprinting)   this.state = STATE.SPRINTING;
    else if (!this.onGround) this.state = STATE.FALLING;
    else if (isMoving)      this.state = STATE.WALKING;
    else                    this.state = STATE.WALKING;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right   = new THREE.Vector3( Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const moveDir = new THREE.Vector3();

    if (this.keys[KEYS.FORWARD])  moveDir.addScaledVector(forward, 1);
    if (this.keys[KEYS.BACKWARD]) moveDir.addScaledVector(forward, -1);
    if (this.keys[KEYS.RIGHT])    moveDir.addScaledVector(right, 1);
    if (this.keys[KEYS.LEFT])     moveDir.addScaledVector(right, -1);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(speed);
      this.velocity.x = moveDir.x;
      this.velocity.z = moveDir.z;
    }

    if (this.flying) {
      if (this.keys[KEYS.JUMP])  this.velocity.y =  speed;
      if (this.keys[KEYS.SNEAK]) this.velocity.y = -speed;
    } else {
      if (this.keys[KEYS.JUMP]) {
        if (this.onGround) {
          this.velocity.y = PLAYER.JUMP_FORCE;
          this.onGround = false;
          playJump();
        } else if (this.inWater) {
          this.velocity.y = PLAYER.SWIM_SPEED;
        }
      }
    }

    if (isMoving && this.onGround && !this.inWater) {
      this._footstepTimer -= delta;
      if (this._footstepTimer <= 0) {
        playFootstep();
        this._footstepTimer = (isSprinting || isBoost) ? 0.35 : 0.5;
      }
    }
  }

  _updateHeadBob(delta) {
    const isMoving = this.keys[KEYS.FORWARD] || this.keys[KEYS.BACKWARD] ||
                     this.keys[KEYS.LEFT]    || this.keys[KEYS.RIGHT];
    const shouldBob = isMoving && this.onGround && !this.inWater;

    if (shouldBob) {
      const bobSpeed = this.state === STATE.SPRINTING
        ? PLAYER.HEAD_BOB_SPEED * 1.4
        : PLAYER.HEAD_BOB_SPEED;
      this._bobTime += delta * bobSpeed;
      this._bobOffset = Math.sin(this._bobTime) * PLAYER.HEAD_BOB_AMP;
    } else {
      this._bobTime   *= 0.85;
      this._bobOffset *= 0.85;
    }
  }

  _updateBlockInteraction(delta, hotbarBlocks) {
    const origin = this.camera.position.clone();
    const direction = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.camera.quaternion)
      .normalize();

    const hit = this.world.raycast(origin, direction, PLAYER.REACH);

    if (hit) {
      const [hx, hy, hz] = hit.pos;
      this.blockOutline.position.set(hx + 0.5, hy + 0.5, hz + 0.5);
      this.blockOutline.visible = true;
    } else {
      this.blockOutline.visible = false;
    }

    if (this.mouseButtons[0] && hit) {
      const [hx, hy, hz] = hit.pos;
      const targetKey = `${hx},${hy},${hz}`;

      if (!this.breakTarget || this.breakTarget.key !== targetKey) {
        this._cancelBreaking();
        const blockId = this.world.getBlock(hx, hy, hz);
        if (!INDESTRUCTIBLE.has(blockId)) {
          this.breakTarget = { key: targetKey, pos: hit.pos, blockId };
          this.breakTime = 0;
          this.breakProgress = 0;
        }
      }

      if (this.breakTarget) {
        const breakDuration = BREAK_TIME[this.breakTarget.blockId] || 1000;
        this.breakTime += delta * 1000;
        this.breakProgress = Math.min(1, this.breakTime / breakDuration);

        if (this.breakProgress >= 1) {
          const [bx, by, bz] = this.breakTarget.pos;
          this._spawnBreakParticles(bx, by, bz);
          this.world.setBlock(bx, by, bz, BLOCK.AIR);
          playBlockBreak(this.breakTarget.blockId);
          this._cancelBreaking();
        }
      }
    }
  }

  _cancelBreaking() {
    this.breakTarget   = null;
    this.breakProgress = 0;
    this.breakTime     = 0;
  }

  placeBlock(hotbarBlocks) {
    const origin = this.camera.position.clone();
    const direction = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.camera.quaternion)
      .normalize();

    const hit = this.world.raycast(origin, direction, PLAYER.REACH);
    if (!hit) return;

    const [nx, ny, nz] = hit.normal;
    const [hx, hy, hz] = hit.pos;
    const px = hx + nx, py = hy + ny, pz = hz + nz;

    const hw = PLAYER.WIDTH / 2;
    const px0 = this.position.x - hw, px1 = this.position.x + hw;
    const py0 = this.position.y,      py1 = this.position.y + PLAYER.HEIGHT;
    const pz0 = this.position.z - hw, pz1 = this.position.z + hw;

    if (px + 1 > px0 && px < px1 && py + 1 > py0 && py < py1 && pz + 1 > pz0 && pz < pz1) return;

    const blockToPlace = hotbarBlocks[this.hotbarSlot];
    if (typeof blockToPlace !== 'number' || blockToPlace === 0) return;
    this.world.setBlock(px, py, pz, blockToPlace);
    playBlockPlace(blockToPlace);
  }

  _updateCamera() {
    const sneakOffset = this.keys[KEYS.SNEAK] ? -0.15 : 0;
    const eyeY = this.position.y + PLAYER.EYE_HEIGHT + sneakOffset + this._bobOffset;

    this.camera.position.set(
      this.position.x,
      eyeY,
      this.position.z
    );

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    this._currentFOV += (this._targetFOV - this._currentFOV) * 0.1;
    this.camera.fov = this._currentFOV;
    this.camera.updateProjectionMatrix();
  }

  update(delta, hotbarBlocks) {
    this._updateMovement(delta);
    this._updatePhysics(delta);
    this._updateHeadBob(delta);
    this._updateBlockInteraction(delta, hotbarBlocks);
    this._updateCamera();
    this._updateParticles(delta);
  }

  getPosition() {
    return this.position.clone();
  }

  getChunkCoords() {
    return [
      Math.floor(this.position.x / 16),
      Math.floor(this.position.z / 16),
    ];
  }

  isInWater() {
    return this.inWater;
  }
}
