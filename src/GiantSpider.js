import * as THREE from 'three';
import { createEdgeLineMaterial } from './Renderer.js';

const BODY_HEAD_SIZE = { x: 4.0, y: 3.0, z: 3.0 };   
const BODY_ABDOMEN_SIZE = { x: 3.0, y: 2.5, z: 6.0 }; 

const LEG_SPAN = 12.0;           
const STEP_HEIGHT = 4.5;         
const WALK_SPEED = 1.5;
const CHASE_SPEED = 2.8;            
const Y_LERP_FACTOR = 4.0; 
const BODY_OFFSET_ABOVE_TERRAIN = 4.5; 
const TERRAIN_SAMPLE_THROTTLE = 2;  
const WALL_HEIGHT_THRESHOLD = 5.0; 
const TURN_SPEED = 2.0;             
const CHASE_TURN_SPEED = 3.5;       

const ATTACK_RANGE = 7.5;
const ATTACK_DURATION = 0.6;

const JUMP_RANGE_MIN = 12.0;
const JUMP_RANGE_MAX = 35.0;
const JUMP_DURATION = 1.0;
const JUMP_COOLDOWN = 60.0;
const JUMP_LANDING_OFFSET = 6.0; 

const DEBRIS_GRAVITY = 22.0;

const _playerDir = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();
const _worldScale = new THREE.Vector3();

export default class GiantSpider {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    
    this.bodyPivot = new THREE.Group(); 
    this.group.add(this.bodyPivot);

    this._forward = new THREE.Vector3(0, 0, 1);
    this._right = new THREE.Vector3(1, 0, 0);
    this._tempVec = new THREE.Vector3();

    this._currentTerrainY = 0;
    this._frameCount = 0;

    this._heading = 0;           
    this._walking = true;

    this._isAttacking = false;
    this._attackTimer = 0;
    this._hasDealtDamage = false; 
    this._attackType = 'NONE';

    this._jumpCooldownTimer = Math.random() * 5.0; 
    this._jumpStart = new THREE.Vector3();
    this._jumpTarget = new THREE.Vector3();

    this._lastPosCheck = new THREE.Vector3();
    this._stuckTimer = 0;

    this.health = 50;
    this.maxHealth = 50;
    this.isDead = false;
    this._hitFlashTimer = 0;
    this._debris = null;

    this._buildBody();
    this._buildLegs();
    scene.add(this.group);
  }

  _buildBody() {
    this._bodyMaterial = new THREE.MeshBasicMaterial({
      color: 0x0a0a0a,
      depthWrite: true,
      depthTest: true
    });

    const edgeMat = createEdgeLineMaterial();
    
    const headGeo = new THREE.BoxGeometry(BODY_HEAD_SIZE.x, BODY_HEAD_SIZE.y, BODY_HEAD_SIZE.z);
    const headMesh = new THREE.Mesh(headGeo, this._bodyMaterial);
    headMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(headGeo.clone()), edgeMat));

    const abdomenGeo = new THREE.BoxGeometry(BODY_ABDOMEN_SIZE.x, BODY_ABDOMEN_SIZE.y, BODY_ABDOMEN_SIZE.z);
    const abdZ = -(BODY_HEAD_SIZE.z / 2 + BODY_ABDOMEN_SIZE.z / 2); 
    abdomenGeo.translate(0, 0, abdZ);
    const abdMesh = new THREE.Mesh(abdomenGeo, this._bodyMaterial);
    abdMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(abdomenGeo.clone()), edgeMat));
    
    headMesh.add(abdMesh);
    
    this.bodyPivot.add(headMesh);
    this._bodyMesh = headMesh;
  }

  _buildLegs() {
    this.legs = [];
    const thickness = 0.4; 
    const upperLen = LEG_SPAN * 0.5;
    const lowerLen = LEG_SPAN * 0.6; 
    
    this._legMaterial = new THREE.MeshBasicMaterial({
      color: 0x0a0a0a,
      depthWrite: true,
      depthTest: true
    });
    const legEdgeMat = createEdgeLineMaterial();

    const legConfigs = [
      { side: 1, zMount:  0.75, xMount: BODY_HEAD_SIZE.x/2, zRest:  4.5, xRest: 6.0, group: 1 },
      { side:-1, zMount:  0.75, xMount: BODY_HEAD_SIZE.x/2, zRest:  4.5, xRest: 6.0, group: 2 },
      { side: 1, zMount: -0.75, xMount: BODY_HEAD_SIZE.x/2, zRest:  1.0, xRest: 7.0, group: 2 },
      { side:-1, zMount: -0.75, xMount: BODY_HEAD_SIZE.x/2, zRest:  1.0, xRest: 7.0, group: 1 },
      { side: 1, zMount: -3.0, xMount: BODY_ABDOMEN_SIZE.x/2, zRest: -2.0, xRest: 7.0, group: 1 },
      { side:-1, zMount: -3.0, xMount: BODY_ABDOMEN_SIZE.x/2, zRest: -2.0, xRest: 7.0, group: 2 },
      { side: 1, zMount: -6.0, xMount: BODY_ABDOMEN_SIZE.x/2, zRest: -5.5, xRest: 6.0, group: 2 },
      { side:-1, zMount: -6.0, xMount: BODY_ABDOMEN_SIZE.x/2, zRest: -5.5, xRest: 6.0, group: 1 }
    ];

    for (let i = 0; i < legConfigs.length; i++) {
      const config = legConfigs[i];

      const hip = new THREE.Group();
      hip.position.set(config.side * config.xMount, -0.75, config.zMount);
      if (config.side === -1) hip.rotation.y = Math.PI;

      const shoulder = new THREE.Group();
      shoulder.rotation.order = 'YXZ'; 
      hip.add(shoulder);

      const upperGeo = new THREE.BoxGeometry(upperLen, thickness, thickness);
      upperGeo.translate(upperLen / 2, 0, 0);
      const upperMesh = new THREE.Mesh(upperGeo, this._legMaterial);
      upperMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(upperGeo.clone()), legEdgeMat));
      shoulder.add(upperMesh);

      const knee = new THREE.Group();
      knee.position.set(upperLen, 0, 0);
      shoulder.add(knee);

      const lowerGeo = new THREE.BoxGeometry(lowerLen, thickness, thickness);
      lowerGeo.translate(lowerLen / 2, 0, 0);
      const lowerMesh = new THREE.Mesh(lowerGeo, this._legMaterial);
      lowerMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(lowerGeo.clone()), legEdgeMat));
      knee.add(lowerMesh);

      this.bodyPivot.add(hip);

      this.legs.push({
        hip, shoulder, knee, side: config.side, 
        zRest: config.zRest, xRest: config.xRest, 
        group: config.group,
        stepTolerance: 3.5 + (Math.random() - 0.5) * 1.5, 
        isStepping: false, stepProgress: 0,
        startFootWorld: new THREE.Vector3(), footWorld: new THREE.Vector3(), targetFootWorld: new THREE.Vector3(),
        upperLen, lowerLen
      });
    }
  }

  _sampleTerrain() {
    const pos = this.group.position;
    this._forward.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this._heading);
    this._right.set(this._forward.z, 0, -this._forward.x);

    const samplePoints = [
      { x: pos.x, z: pos.z }, 
      { x: pos.x + this._forward.x * 2.0, z: pos.z + this._forward.z * 2.0 }, 
      { x: pos.x - this._forward.x * 6.0, z: pos.z - this._forward.z * 6.0 }, 
      { x: pos.x + this._right.x * 2.5, z: pos.z + this._right.z * 2.5 }, 
      { x: pos.x - this._right.x * 2.5, z: pos.z - this._right.z * 2.5 }  
    ];

    let maxTerrainY = -Infinity;
    for (const p of samplePoints) {
      const h = this.world.getTerrainHeight(p.x, p.z);
      if (h != null) {
        if (h - this._currentTerrainY < WALL_HEIGHT_THRESHOLD) {
            if (h > maxTerrainY) maxTerrainY = h;
        }
      }
    }

    if (maxTerrainY !== -Infinity) this._currentTerrainY = maxTerrainY;
  }

  _updateAI(delta, player) {
    if (this._isAttacking) {
        if (this._attackType === 'JUMP') {
            _playerDir.set(this._jumpTarget.x - this.group.position.x, 0, this._jumpTarget.z - this.group.position.z);
            if (_playerDir.lengthSq() > 0.1) {
                let desiredHeading = Math.atan2(_playerDir.x, _playerDir.z);
                let d = desiredHeading - this._heading;
                while (d > Math.PI) d -= Math.PI * 2;
                while (d < -Math.PI) d += Math.PI * 2;
                this._heading += Math.sign(d) * Math.min(Math.abs(d), CHASE_TURN_SPEED * delta);
            }
        }
        this._forward.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this._heading);
        this.group.rotation.y = this._heading;
        return;
    }

    if (this._stuckTimer > 0) {
        this._stuckTimer -= delta;
        this._heading += Math.PI * 0.8 * delta; 
        this._forward.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this._heading);
        this.group.rotation.y = this._heading;
        this.group.position.x += this._forward.x * WALK_SPEED * delta;
        this.group.position.z += this._forward.z * WALK_SPEED * delta;
        return;
    }

    if (this._frameCount % 60 === 0) {
        if (this.group.position.distanceToSquared(this._lastPosCheck) < 0.25) {
            this._stuckTimer = 1.2; 
        }
        this._lastPosCheck.copy(this.group.position);
    }

    const chasing = player != null;
    const NUM_RAYS = 12; 
    const RAY_LENGTH = 8.0; 
    
    let bestScore = -Infinity;
    let bestHeading = this._heading;
    let frontDanger = 0; 

    for (let i = 0; i < NUM_RAYS; i++) {
        const rayAngle = this._heading + (i / NUM_RAYS) * Math.PI * 2;
        
        let danger = 0;
        for (let d = 2.0; d <= RAY_LENGTH; d += 2.0) {
            const tx = this.group.position.x + Math.sin(rayAngle) * d;
            const tz = this.group.position.z + Math.cos(rayAngle) * d;
            let h = this.world.getTerrainHeight(tx, tz);
            let groundY = h != null ? h : this._currentTerrainY;
            
            if (groundY - this._currentTerrainY > WALL_HEIGHT_THRESHOLD * 0.8) {
                danger = 1.0 - (d / RAY_LENGTH); 
                break;
            }
        }
        
        if (i === 0) frontDanger = danger;
        if (danger > 0.85) continue; 
        
        let interest = 0;
        if (chasing) {
            const angleToPlayer = Math.atan2(player.position.x - this.group.position.x, player.position.z - this.group.position.z);
            let diff = Math.abs(rayAngle - angleToPlayer);
            while (diff > Math.PI) diff -= Math.PI * 2;
            interest = 1.0 - (Math.abs(diff) / Math.PI); 
        } else {
            let diff = Math.abs(rayAngle - this._heading);
            while (diff > Math.PI) diff -= Math.PI * 2;
            interest = 1.0 - (Math.abs(diff) / Math.PI);
        }
        
        const score = (interest * 2.0) - (danger * 5.0);
        
        if (score > bestScore) {
            bestScore = score;
            bestHeading = rayAngle;
        }
    }

    if (bestScore === -Infinity) {
        this._heading += Math.PI * delta; 
        frontDanger = 1.0;
    } else {
        let d = bestHeading - this._heading;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        
        const turnSpeed = chasing ? CHASE_TURN_SPEED : TURN_SPEED;
        this._heading += Math.sign(d) * Math.min(Math.abs(d), turnSpeed * delta);
    }

    this._forward.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this._heading);
    this.group.rotation.y = this._heading;
    
    let baseSpeed = chasing ? CHASE_SPEED : WALK_SPEED;
    let dynamicSpeed = baseSpeed * (1.0 - frontDanger * 0.7); 
    
    if (frontDanger < 0.9) {
        this.group.position.x += this._forward.x * dynamicSpeed * delta;
        this.group.position.z += this._forward.z * dynamicSpeed * delta;
    }
  }

  _updateBodyPosture(delta) {
    let avgFootY = 0;
    let frontY = 0, backY = 0, leftY = 0, rightY = 0;
    let fCount = 0, bCount = 0, lCount = 0, rCount = 0;

    for (const leg of this.legs) {
        avgFootY += leg.footWorld.y;
        
        if (leg.zRest > 0) { frontY += leg.footWorld.y; fCount++; }
        else { backY += leg.footWorld.y; bCount++; }
        
        if (leg.side === 1) { leftY += leg.footWorld.y; lCount++; }
        else { rightY += leg.footWorld.y; rCount++; }
    }
    
    avgFootY /= this.legs.length;
    frontY /= fCount; backY /= bCount; 
    leftY /= lCount; rightY /= rCount;

    let targetY = Math.max(this._currentTerrainY + 2.0, avgFootY + BODY_OFFSET_ABOVE_TERRAIN);
    
    const organicBreathing = Math.sin(Date.now() * 0.005) * 0.15;
    targetY += organicBreathing;

    const PITCH_SPREAD = 9.0; 
    const ROLL_SPREAD = 12.0; 

    let targetPitch = Math.atan2(backY - frontY, PITCH_SPREAD);
    let targetRoll = Math.atan2(leftY - rightY, ROLL_SPREAD);

    if (this._isAttacking) {
        if (this._attackType === 'MELEE') {
            const t = this._attackTimer / ATTACK_DURATION;
            const attackIntensity = Math.sin(t * Math.PI); 
            targetY += attackIntensity * 4.0; 
            targetPitch -= attackIntensity * 0.4; 
            
            this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, targetY, Y_LERP_FACTOR * delta);
        } 
        else if (this._attackType === 'JUMP') {
            const t = Math.min(this._attackTimer / JUMP_DURATION, 1.0);
            
            const easeXZ = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const currentX = THREE.MathUtils.lerp(this._jumpStart.x, this._jumpTarget.x, easeXZ);
            const currentZ = THREE.MathUtils.lerp(this._jumpStart.z, this._jumpTarget.z, easeXZ);
            
            const jumpHeight = 16.0; 
            const jumpBaseY = THREE.MathUtils.lerp(this._jumpStart.y, this._jumpTarget.y + BODY_OFFSET_ABOVE_TERRAIN, easeXZ);
            const currentY = jumpBaseY + Math.sin(t * Math.PI) * jumpHeight;
            
            this.group.position.set(currentX, currentY, currentZ);
            
            targetPitch -= Math.sin(t * Math.PI) * 0.6; 
            targetRoll = 0; 
        }
    } else {
        this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, targetY, Y_LERP_FACTOR * delta);
    }

    this.bodyPivot.rotation.x = THREE.MathUtils.lerp(this.bodyPivot.rotation.x, targetPitch, delta * 4.0);
    this.bodyPivot.rotation.z = THREE.MathUtils.lerp(this.bodyPivot.rotation.z, targetRoll, delta * 4.0);
  }

  _findBestFootPlacement(idealX, idealZ) {
      let bestX = idealX;
      let bestZ = idealZ;
      let bestY = this.world.getTerrainHeight(idealX, idealZ);
      if (bestY == null) bestY = this._currentTerrainY;

      const scanOffsets = [
          {x: 0, z: 0},
          {x: 1.5, z: 0}, {x: -1.5, z: 0},
          {x: 0, z: 1.5}, {x: 0, z: -1.5}
      ];
      
      let minDiff = Infinity;
      for (let off of scanOffsets) {
          const tx = idealX + off.x;
          const tz = idealZ + off.z;
          let ty = this.world.getTerrainHeight(tx, tz);
          if (ty == null) continue;
          
          const diff = Math.abs(ty - this._currentTerrainY);
          
          if (diff < minDiff && ty < this._currentTerrainY + WALL_HEIGHT_THRESHOLD) {
              minDiff = diff;
              bestX = tx;
              bestZ = tz;
              bestY = ty;
          }
      }
      
      return { x: bestX, y: bestY, z: bestZ };
  }

  _updateLegs(delta, player) {
    this._forward.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this._heading);
    this._right.set(this._forward.z, 0, -this._forward.x);
    this.group.updateMatrixWorld(true);

    const group1Stepping = this.legs.some(l => l.group === 1 && l.isStepping);
    const group2Stepping = this.legs.some(l => l.group === 2 && l.isStepping);
    
    const STEP_SPEED = 2.5; 

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];

      if (this._isAttacking && this._attackType === 'MELEE') {
          if (i === 0 || i === 1) {
              const t = Math.min(this._attackTimer / ATTACK_DURATION, 1.0);
              const playerPos = player ? player.position : this.group.position;
              
              if (t < 0.5) {
                  const nt = t / 0.5;
                  const easeIn = nt * nt;
                  this._tempVec.set(leg.side * 6.5, 12.0, 5.0); 
                  this.bodyPivot.localToWorld(this._tempVec); 
                  
                  leg.footWorld.x = THREE.MathUtils.lerp(leg.startFootWorld.x, this._tempVec.x, easeIn);
                  leg.footWorld.y = THREE.MathUtils.lerp(leg.startFootWorld.y, this._tempVec.y, easeIn);
                  leg.footWorld.z = THREE.MathUtils.lerp(leg.startFootWorld.z, this._tempVec.z, easeIn);
              } else {
                  const nt = (t - 0.5) / 0.5;
                  const easeOut = 1.0 - Math.pow(1.0 - nt, 3);
                  
                  this._tempVec.set(leg.side * 6.5, 12.0, 5.0); 
                  this.bodyPivot.localToWorld(this._tempVec); 
                  
                  const targetX = playerPos.x + this._right.x * (leg.side * 0.2); 
                  const targetZ = playerPos.z + this._right.z * (leg.side * 0.2);
                  let ty = this.world.getTerrainHeight(targetX, targetZ);
                  let groundY = ty != null ? ty : this._currentTerrainY;
                  const targetY = Math.max(playerPos.y + 1.0, groundY); 
                  
                  leg.footWorld.x = THREE.MathUtils.lerp(this._tempVec.x, targetX, easeOut);
                  leg.footWorld.y = THREE.MathUtils.lerp(this._tempVec.y, targetY, easeOut);
                  leg.footWorld.z = THREE.MathUtils.lerp(this._tempVec.z, targetZ, easeOut);
              }
              
              leg.targetFootWorld.copy(leg.footWorld);
              leg.isStepping = false; 
              continue; 
          }
      }

      if (this._isAttacking && this._attackType === 'JUMP') {
          const t = Math.min(this._attackTimer / JUMP_DURATION, 1.0);
          
          if (i === 0 || i === 1) {
              this._tempVec.set(leg.side * 8.0, 12.0, 8.0);
              this.bodyPivot.localToWorld(this._tempVec);
              const windX = this._tempVec.x;
              const windY = this._tempVec.y;
              const windZ = this._tempVec.z;

              if (t < 0.7) {
                  const nt = t / 0.7;
                  leg.footWorld.x = THREE.MathUtils.lerp(leg.startFootWorld.x, windX, nt);
                  leg.footWorld.y = THREE.MathUtils.lerp(leg.startFootWorld.y, windY, nt);
                  leg.footWorld.z = THREE.MathUtils.lerp(leg.startFootWorld.z, windZ, nt);
              } else {
                  const nt = (t - 0.7) / 0.3;
                  const easeOut = 1.0 - Math.pow(1.0 - nt, 3);
                  
                  const strikeTarget = player ? player.position : this._jumpTarget;
                  const targetX = strikeTarget.x + this._right.x * (leg.side * 0.2); 
                  const targetZ = strikeTarget.z + this._right.z * (leg.side * 0.2);
                  
                  let ty = this.world.getTerrainHeight(targetX, targetZ);
                  let groundY = ty != null ? ty : this._currentTerrainY;
                  const targetY = Math.max(strikeTarget.y + 1.0, groundY); 
                  
                  leg.footWorld.x = THREE.MathUtils.lerp(windX, targetX, easeOut);
                  leg.footWorld.y = THREE.MathUtils.lerp(windY, targetY, easeOut);
                  leg.footWorld.z = THREE.MathUtils.lerp(windZ, targetZ, easeOut);
              }
          } else {
              this._tempVec.set(leg.side * leg.xRest * 0.8, -4.0, leg.zRest * 0.8);
              this.bodyPivot.localToWorld(this._tempVec);
              leg.footWorld.lerp(this._tempVec, delta * 12.0);
          }
          
          leg.targetFootWorld.copy(leg.footWorld);
          leg.isStepping = false;
          continue;
      }

      const advance = this._walking ? 2.5 : 0; 
      const idealX = this.group.position.x + this._right.x * (leg.side * leg.xRest) + this._forward.x * (leg.zRest + advance);
      const idealZ = this.group.position.z + this._right.z * (leg.side * leg.xRest) + this._forward.z * (leg.zRest + advance);

      if (!leg.isStepping) {
        const dx = leg.footWorld.x - idealX;
        const dz = leg.footWorld.z - idealZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        let canStep = false;
        if (leg.group === 1 && !group2Stepping) canStep = true;
        if (leg.group === 2 && !group1Stepping) canStep = true;

        if (dist > leg.stepTolerance && canStep && !this._isAttacking) {
          leg.isStepping = true;
          leg.stepProgress = 0;
          leg.startFootWorld.copy(leg.footWorld);
          
          const bestPlacement = this._findBestFootPlacement(idealX, idealZ);
          const MAX_STEP_UP = 3.5; 
          bestPlacement.y = Math.min(bestPlacement.y, this._currentTerrainY + MAX_STEP_UP);
          
          leg.targetFootWorld.set(bestPlacement.x, bestPlacement.y, bestPlacement.z);
        }
      }

      if (leg.isStepping) {
        leg.stepProgress += delta * STEP_SPEED;
        
        if (leg.stepProgress >= 1) {
          leg.stepProgress = 1;
          leg.isStepping = false; 
        }

        const t = leg.stepProgress;
        const easeOutXZ = t * t * (3.0 - 2.0 * t);
        
        const midX = (leg.startFootWorld.x + leg.targetFootWorld.x) / 2;
        const midZ = (leg.startFootWorld.z + leg.targetFootWorld.z) / 2;
        const midTerrainY = this.world.getTerrainHeight(midX, midZ);
        let safeMidY = midTerrainY != null ? midTerrainY : this._currentTerrainY;
        
        if (safeMidY > this._currentTerrainY + WALL_HEIGHT_THRESHOLD) {
            safeMidY = this._currentTerrainY + 2.0; 
        }

        const maxFootY = Math.max(leg.startFootWorld.y, leg.targetFootWorld.y);
        const midClearance = Math.max(0, safeMidY - maxFootY);
        const dynamicStepHeight = Math.max(STEP_HEIGHT, midClearance + 1.5);
        const lift = Math.sin(t * Math.PI) * dynamicStepHeight; 
        
        leg.footWorld.x = THREE.MathUtils.lerp(leg.startFootWorld.x, leg.targetFootWorld.x, easeOutXZ);
        leg.footWorld.z = THREE.MathUtils.lerp(leg.startFootWorld.z, leg.targetFootWorld.z, easeOutXZ);
        leg.footWorld.y = THREE.MathUtils.lerp(leg.startFootWorld.y, leg.targetFootWorld.y, easeOutXZ) + lift;
      }
    }

    this._applyLegIK();
  }

  _applyLegIK() {
    this.group.updateMatrixWorld(true);

    for (const leg of this.legs) {
      leg.hip.worldToLocal(this._tempVec.copy(leg.footWorld));
      
      const x = this._tempVec.x;
      const y = this._tempVec.y;
      const z = this._tempVec.z;

      const yaw = Math.atan2(-z, x);
      leg.shoulder.rotation.y = yaw;

      let planarDist = Math.sqrt(x * x + z * z);
      let dist = Math.sqrt(planarDist * planarDist + y * y);
      const u = leg.upperLen;
      const l = leg.lowerLen;

      const minDist = Math.abs(u - l) + 0.25;
      if (dist < minDist) {
        dist = minDist; 
        planarDist = Math.sqrt(Math.max(0, dist * dist - y * y)) || 0.1; 
      }

      if (dist >= u + l - 0.05) {
        const angleTarget = Math.atan2(y, planarDist);
        leg.shoulder.rotation.z = angleTarget;
        leg.knee.rotation.z = 0;
        continue;
      }

      const cosB = (dist * dist - u * u - l * l) / (2 * u * l);
      const angleKnee = -Math.acos(THREE.MathUtils.clamp(cosB, -1, 1)); 
      
      const sinB = Math.sin(angleKnee);
      const k = u + l * Math.cos(angleKnee);
      const angleShoulder = Math.atan2(y, planarDist) - Math.atan2(l * sinB, k);

      leg.shoulder.rotation.z = angleShoulder;
      leg.knee.rotation.z = angleKnee;
    }
  }

  _spawnDeathDebris() {
    this.group.updateMatrixWorld(true);
    this._debris = [];
    const edgeMat = createEdgeLineMaterial();
    const debrisMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, depthWrite: true, depthTest: true });

    const rand = (a, b) => a + Math.random() * (b - a);

    this._bodyMesh.getWorldPosition(_worldPos);
    this._bodyMesh.getWorldQuaternion(_worldQuat);
    const headGeo = new THREE.BoxGeometry(BODY_HEAD_SIZE.x, BODY_HEAD_SIZE.y, BODY_HEAD_SIZE.z);
    const headMesh = new THREE.Mesh(headGeo, debrisMat.clone());
    headMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(headGeo.clone()), edgeMat));
    const headGroup = new THREE.Group();
    headGroup.position.copy(_worldPos);
    headGroup.quaternion.copy(_worldQuat);
    headGroup.add(headMesh);
    this.scene.add(headGroup);
    this._debris.push({
      object: headGroup,
      vel: new THREE.Vector3(rand(-3, 3), rand(2, 6), rand(-3, 3)),
      angVel: new THREE.Vector3(rand(-2, 2), rand(-2, 2), rand(-2, 2)),
      grounded: false
    });

    const abdMesh = this._bodyMesh.children[0];
    abdMesh.getWorldPosition(_worldPos);
    abdMesh.getWorldQuaternion(_worldQuat);
    const abdGeo = new THREE.BoxGeometry(BODY_ABDOMEN_SIZE.x, BODY_ABDOMEN_SIZE.y, BODY_ABDOMEN_SIZE.z);
    const abdDebris = new THREE.Mesh(abdGeo, debrisMat.clone());
    abdDebris.add(new THREE.LineSegments(new THREE.EdgesGeometry(abdGeo.clone()), edgeMat));
    const abdGroup = new THREE.Group();
    abdGroup.position.copy(_worldPos);
    abdGroup.quaternion.copy(_worldQuat);
    abdGroup.add(abdDebris);
    this.scene.add(abdGroup);
    this._debris.push({
      object: abdGroup,
      vel: new THREE.Vector3(rand(-4, 4), rand(1, 5), rand(-4, 4)),
      angVel: new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3)),
      grounded: false
    });

    const upperLen = LEG_SPAN * 0.5;
    const lowerLen = LEG_SPAN * 0.6;
    const totalLen = upperLen + lowerLen;
    const thickness = 0.4;
    const legGeo = new THREE.BoxGeometry(totalLen, thickness, thickness);
    legGeo.translate(totalLen / 2, 0, 0);

    for (const leg of this.legs) {
      leg.hip.getWorldPosition(_worldPos);
      leg.hip.getWorldQuaternion(_worldQuat);
      const legMesh = new THREE.Mesh(legGeo.clone(), debrisMat.clone());
      legMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(legGeo.clone()), edgeMat));
      const legGroup = new THREE.Group();
      legGroup.position.copy(_worldPos);
      legGroup.quaternion.copy(_worldQuat);
      legGroup.add(legMesh);
      this.scene.add(legGroup);
      this._debris.push({
        object: legGroup,
        vel: new THREE.Vector3(rand(-5, 5), rand(0, 4), rand(-5, 5)),
        angVel: new THREE.Vector3(rand(-4, 4), rand(-4, 4), rand(-4, 4)),
        grounded: false
      });
    }
    legGeo.dispose();
    this.group.visible = false;
  }

  _updateDebris(delta) {
    if (!this._debris || this._debris.length === 0) return;
    for (const d of this._debris) {
      if (d.grounded) continue;
      d.object.position.x += d.vel.x * delta;
      d.object.position.y += d.vel.y * delta;
      d.object.position.z += d.vel.z * delta;
      d.vel.y -= DEBRIS_GRAVITY * delta;
      d.object.rotation.x += d.angVel.x * delta;
      d.object.rotation.y += d.angVel.y * delta;
      d.object.rotation.z += d.angVel.z * delta;
      const cx = d.object.position.x;
      const cz = d.object.position.z;
      let groundY = this.world.getTerrainHeight(cx, cz);
      if (groundY == null) groundY = -100;
      const minY = groundY + 0.5;
      if (d.object.position.y <= minY) {
        d.object.position.y = minY;
        d.vel.set(0, 0, 0);
        d.angVel.set(0, 0, 0);
        d.grounded = true;
      }
    }
  }

  getHitTestPoints() {
    this.group.updateMatrixWorld(true);
    const points = [this.group.getWorldPosition(new THREE.Vector3())];
    for (const leg of this.legs) points.push(leg.footWorld.clone());
    return points;
  }

  takeDamage(amount) {
    if (this.isDead) return;
    this.health = Math.max(0, this.health - amount);
    this._hitFlashTimer = 0.12;
    if (this._bodyMaterial) this._bodyMaterial.color.setHex(0x333333);
    if (this._legMaterial) this._legMaterial.color.setHex(0x333333);
    if (this.health <= 0) {
      this.isDead = true;
      this._spawnDeathDebris();
    }
  }

  update(delta, player = null) {
    if (this.isDead) {
      this._updateDebris(delta);
      return;
    }
    if (this._hitFlashTimer > 0) {
      this._hitFlashTimer -= delta;
      if (this._hitFlashTimer <= 0) {
        if (this._bodyMaterial) this._bodyMaterial.color.setHex(0x0a0a0a);
        if (this._legMaterial) this._legMaterial.color.setHex(0x0a0a0a);
      }
    }
    this._frameCount++;
    if (this._frameCount % TERRAIN_SAMPLE_THROTTLE === 0) this._sampleTerrain();

    if (this._jumpCooldownTimer > 0) {
        this._jumpCooldownTimer -= delta;
    }

    if (player && !this._isAttacking) {
        _playerDir.set(player.position.x - this.group.position.x, 0, player.position.z - this.group.position.z);
        const distXZ = Math.sqrt(_playerDir.x * _playerDir.x + _playerDir.z * _playerDir.z);
        
        if (distXZ <= ATTACK_RANGE) {
            this._isAttacking = true;
            this._attackType = 'MELEE';
            this._attackTimer = 0;
            this._hasDealtDamage = false;
            
            this.legs[0].startFootWorld.copy(this.legs[0].footWorld);
            this.legs[1].startFootWorld.copy(this.legs[1].footWorld);
            
        } else if (distXZ >= JUMP_RANGE_MIN && distXZ <= JUMP_RANGE_MAX && this._jumpCooldownTimer <= 0) {
            
            let isPlayerLooking = false;
            if (player.camera && typeof player.camera.getWorldDirection === 'function') {
                const pDir = new THREE.Vector3();
                player.camera.getWorldDirection(pDir);
                pDir.y = 0;
                pDir.normalize();
                const toSpider = new THREE.Vector3(
                    this.group.position.x - player.position.x,
                    0,
                    this.group.position.z - player.position.z
                ).normalize();
                if (pDir.dot(toSpider) > 0.2) {
                    isPlayerLooking = true;
                }
            }

            let targetTerrainY = this.world.getTerrainHeight(player.position.x, player.position.z);
            if (targetTerrainY == null) targetTerrainY = player.position.y;
            
            const midX = (this.group.position.x + player.position.x) / 2;
            const midZ = (this.group.position.z + player.position.z) / 2;
            let midTerrainY = this.world.getTerrainHeight(midX, midZ);
            if (midTerrainY == null) midTerrainY = this._currentTerrainY;

            const isPlayerUnderTree = (targetTerrainY > player.position.y + 2.0);
            const isPathBlocked = (midTerrainY > Math.max(this._currentTerrainY, player.position.y) + 3.0);

            if (!isPlayerUnderTree && !isPathBlocked && isPlayerLooking) {
                if (Math.random() < 0.3) {
                    this._isAttacking = true;
                    this._attackType = 'JUMP';
                    this._attackTimer = 0;
                    this._hasDealtDamage = false;
                    this._jumpCooldownTimer = JUMP_COOLDOWN;
                    
                    this._jumpStart.copy(this.group.position);
                    
                    _playerDir.normalize();
                    this._jumpTarget.set(
                        player.position.x - _playerDir.x * JUMP_LANDING_OFFSET,
                        player.position.y,
                        player.position.z - _playerDir.z * JUMP_LANDING_OFFSET
                    );

                    for (let leg of this.legs) {
                        leg.startFootWorld.copy(leg.footWorld);
                    }
                } else {
                    this._jumpCooldownTimer = 3.0;
                }
            }
        }
    }

    if (this._isAttacking) {
        this._attackTimer += delta;
        
        if (this._attackType === 'MELEE') {
            if (this._attackTimer >= ATTACK_DURATION * 0.5 && !this._hasDealtDamage) {
                this._hasDealtDamage = true;
                if (player && typeof player.takeDamage === 'function') {
                    player.takeDamage(1); 
                }
            }
            if (this._attackTimer >= ATTACK_DURATION) {
                this._isAttacking = false;
            }
        } 
        else if (this._attackType === 'JUMP') {
            if (this._attackTimer >= JUMP_DURATION * 0.9 && !this._hasDealtDamage) {
                this._hasDealtDamage = true;
                if (player && typeof player.takeDamage === 'function') {
                    player.takeDamage(1); 
                }
            }
            if (this._attackTimer >= JUMP_DURATION) {
                this._isAttacking = false;
                this.setPosition(this.group.position.x, this.group.position.z);
            }
        }
    }

    this._updateAI(delta, player);
    this._updateBodyPosture(delta);
    this._updateLegs(delta, player);
  }

  setPosition(x, z) {
    this.group.position.x = x;
    this.group.position.z = z;
    const y = this.world.getTerrainHeight(x, z);
    this.group.position.y = y != null ? y + BODY_OFFSET_ABOVE_TERRAIN : 50;
    if (y != null) this._currentTerrainY = y;

    this._forward.set(0, 0, 1);
    this._right.set(1, 0, 0);

    for (const leg of this.legs) {
      const footX = x + leg.side * leg.xRest;
      const footZ = z + leg.zRest;
      const ty = this.world.getTerrainHeight(footX, footZ);
      
      leg.footWorld.set(
        footX,
        ty != null ? ty : this._currentTerrainY,
        footZ
      );
      leg.startFootWorld.copy(leg.footWorld);
      leg.targetFootWorld.copy(leg.footWorld);
      leg.isStepping = false;
      leg.stepProgress = 0;
    }
  }
}