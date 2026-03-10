import * as THREE from 'three';
import { DAY_CYCLE, SKY_COLORS, FOG } from './Constants.js';

const SKY_VERT = `
varying vec3 vWorldDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldDir = wp.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = `
uniform vec3 uSkyColor;
varying vec3 vWorldDir;
void main() {
  gl_FragColor = vec4(uSkyColor, 1.0);
}
`;

export class Sky {
  constructor(scene, renderer) {
    this.scene    = scene;
    this.renderer = renderer;
    this.time     = 0;
    this.lampOn   = false;

    this._skyUniforms = {
      uSkyColor:       { value: new THREE.Color() },
      uSunDir:         { value: new THREE.Vector3(0, 1, 0) },
    };

    this._skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: this._skyUniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      })
    );
    scene.add(this._skyDome);

    this.sunLight = new THREE.DirectionalLight(0xfff8e0, 1.2);
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.ambientLight = new THREE.AmbientLight(0xfff4e0, 0.65);
    scene.add(this.ambientLight);
    this.hemiLight = new THREE.HemisphereLight(0x88ccee, 0x6b4a1a, 0.35);
    scene.add(this.hemiLight);

    scene.fog = new THREE.FogExp2(0xb8d8f5, FOG.DAY_DENSITY);

    this.lampLight = new THREE.PointLight(0xffcc66, 1.8, 22, 1.8);
    this.lampLight.visible = false;
    scene.add(this.lampLight);

    this.sunGroup  = this._buildSun();
    this.moonGroup = this._buildMoon();
    scene.add(this.sunGroup);
    scene.add(this.moonGroup);

    this._cloudGroup = this._buildVoxelClouds();
    scene.add(this._cloudGroup);

    this._skyColor = new THREE.Color();
    this._sunDir   = new THREE.Vector3();
    this._cloudDrift = 0;
  }

  _buildSun() {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(14, 14);
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xfffff0, fog: false, side: THREE.DoubleSide,
    })));
    g.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0xccaa44, fog: false })
    ));
    return g;
  }

  _buildMoon() {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(28, 28);
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xe8eef5, fog: false, side: THREE.DoubleSide,
    })));
    g.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x334455, fog: false })
    ));
    return g;
  }

  _buildVoxelClouds() {
    const group = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const edgeMat  = new THREE.LineBasicMaterial({ color: 0xdddddd, fog: false });

    const patterns = [
      [[0,0],[1,0],[2,0],[3,0],[0,1],[1,1]],
      [[0,0],[1,0],[2,0],[3,0],[4,0],[1,1],[2,1],[3,1]],
      [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],
      [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]],
      [[0,0],[1,0],[2,0],[3,0],[1,1],[2,1]],
      [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[3,1]],
      [[0,0],[1,0],[2,0]],
      [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[2,1],[3,1],[4,1]],
    ];

    const CLOUD_SCALE = 6;
    const CLOUD_HEIGHT = 3;
    const cloudPositions = [
      [0, 80, 0], [120, 78, -80], [-100, 77, 60], [80, 79, 100], [-150, 76, -40],
      [200, 78, 50], [-80, 77, -120], [50, 80, -180], [-200, 76, 80], [140, 79, 40],
      [-60, 78, 150], [180, 77, -100], [-120, 79, -80], [90, 76, 120], [-180, 80, 30],
      [30, 77, -200], [-90, 78, 90], [160, 79, -60], [-140, 76, 140], [70, 78, -90],
      [0, 81, 150], [-70, 77, -150], [130, 80, 70], [-110, 79, 100], [40, 76, -120],
      [190, 78, -30], [-50, 77, 180], [100, 79, -140], [-160, 76, -70], [20, 80, 90],
      [-130, 78, 50], [150, 77, 130], [-30, 79, -160], [110, 76, -50], [-190, 80, 110],
      [60, 78, 160], [-100, 77, -100], [170, 79, 20], [-40, 76, -190], [80, 80, -70],
    ];

    for (let ci = 0; ci < cloudPositions.length; ci++) {
      const pattern = patterns[ci % patterns.length];
      const cloudObj = new THREE.Group();
      const [cx, cy, cz] = cloudPositions[ci];

      for (const [dx, dz] of pattern) {
        const boxGeo = new THREE.BoxGeometry(CLOUD_SCALE, CLOUD_HEIGHT, CLOUD_SCALE);
        const box = new THREE.Mesh(boxGeo, cloudMat);
        box.position.set(dx * CLOUD_SCALE, 0, dz * CLOUD_SCALE);
        cloudObj.add(box);

        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(boxGeo),
          edgeMat
        );
        edges.position.copy(box.position);
        cloudObj.add(edges);
      }

      cloudObj.position.set(cx, cy, cz);
      group.add(cloudObj);
    }
    group.userData.cloudMat = cloudMat;
    group.userData.cloudEdgeMat = edgeMat;
    return group;
  }

  _getSkyColor(t) {
    const keys = SKY_COLORS;
    let k0 = keys[keys.length - 1], k1 = keys[0];
    for (let i = 0; i < keys.length - 1; i++) {
      if (t >= keys[i].t && t < keys[i+1].t) { k0 = keys[i]; k1 = keys[i+1]; break; }
    }
    const span = k1.t - k0.t;
    const a = span > 0 ? (t - k0.t) / span : 0;
    return [
      k0.color[0] + (k1.color[0] - k0.color[0]) * a,
      k0.color[1] + (k1.color[1] - k0.color[1]) * a,
      k0.color[2] + (k1.color[2] - k0.color[2]) * a,
    ];
  }

  update(delta) {
    this.time = (this.time + delta / (DAY_CYCLE.DURATION_MS / 1000)) % 1;
    const t = this.time;

    const [r, g, b] = this._getSkyColor(t);
    this._skyColor.setRGB(r, g, b);
    this.renderer.setClearColor(this._skyColor);
    this._skyUniforms.uSkyColor.value.setRGB(r, g, b);

    const isNight = t > 0.78 || t < 0.22;
    if (isNight) {
      this._skyColor.setRGB(0.004, 0.004, 0.01);
      this.renderer.setClearColor(this._skyColor);
      this._skyUniforms.uSkyColor.value.copy(this._skyColor);
      this.scene.fog.density = FOG.NIGHT_DENSITY;
      this.scene.fog.color.setRGB(0.01, 0.01, 0.02);
    } else {
      this.scene.fog.density = 0;
    }

    const sunAngle = (t - 0.25) * Math.PI * 2;
    const R = 300;
    const sx = R * Math.sin(sunAngle), sy = R * Math.cos(sunAngle), sz = R * 0.25;
    this._sunDir.set(sx, sy, sz).normalize();
    this._skyUniforms.uSunDir.value.copy(this._sunDir);

    this.sunLight.position.set(sx, sy, sz);
    this.sunLight.target.position.set(0, 0, 0);

    const sunPos = this._sunDir.clone().multiplyScalar(380);
    this.sunGroup.position.copy(sunPos);
    this.sunGroup.lookAt(0, 0, 0);
    this.moonGroup.position.copy(sunPos).negate();
    this.moonGroup.lookAt(0, 0, 0);

    const sunElev = Math.sin(sunAngle);
    const dayF = Math.max(0, sunElev);
    const nightF = Math.max(0, -sunElev);

    if (isNight) {
      this.sunLight.intensity = 0;
      this.ambientLight.intensity = 0.0002;
      this.ambientLight.color.setRGB(0.001, 0.001, 0.002);
      this.hemiLight.color.setRGB(0.002, 0.002, 0.004);
      this.hemiLight.intensity = 0.0;
    } else {
      const warm = (t > 0.2 && t < 0.35) || (t > 0.65 && t < 0.8);
      this.sunLight.color.setRGB(1.0, warm ? 0.78 : 0.96, warm ? 0.45 : 0.88);
      this.sunLight.intensity = dayF * 1.3;
      this.ambientLight.color.setRGB(1.0, 0.96, 0.88);
      this.ambientLight.intensity = 0.25 + dayF * 0.50 + nightF * 0.08;
      this.hemiLight.color.copy(this._skyColor);
      this.hemiLight.intensity = 0.12 + dayF * 0.28;
    }

    this.sunGroup.visible  = dayF > 0.02;
    this.moonGroup.visible = nightF > 0.02;

    this.lampLight.visible = false;

    this._cloudGroup.visible = true;
    if (this._cloudGroup.userData.cloudMat) {
      const cloudNight = isNight;
      if (cloudNight) {
        this._cloudGroup.userData.cloudMat.color.setHex(0x030306);
        this._cloudGroup.userData.cloudEdgeMat.color.setHex(0x020204);
      } else {
        this._cloudGroup.userData.cloudMat.color.setHex(0xffffff);
        this._cloudGroup.userData.cloudEdgeMat.color.setHex(0xdddddd);
      }
    }
    this._cloudDrift += delta * 1.5;
    if (this._cloudDrift > 300) this._cloudDrift -= 600;
  }

  followCamera(cameraPos) {
    this._skyDome.position.copy(cameraPos);
    this._cloudGroup.position.set(cameraPos.x + this._cloudDrift, cameraPos.y, cameraPos.z);
    this.lampLight.position.copy(cameraPos);
  }

  toggleNightMode() { this.lampOn = !this.lampOn; }
  toggleDayNight() {
    const night = this.time > 0.78 || this.time < 0.22;
    this.time = night ? 0.5 : 0;
  }
  isLampOn() { return this.lampOn; }
  getSunDirection() { return this._sunDir; }
  getTimeOfDay() { return this.time; }
  isNight() { const t = this.time; return t > 0.78 || t < 0.22; }
}
