import * as THREE from 'three';
import { CAST, DRIVER_TYPES, PED_TYPES, makeCar, makePed, makeSnuffle, mat, part } from './characters.js';
import { buildWorld, HALF, N, CELL, roadLine, blockCenter, isPark, groundY, blocked } from './world.js';
import { Sfx } from './audio.js';

const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

const SKY = 0x8fd3ff;
const LAPS = 3, START_TIME = 90, PED_COUNT = 160, MPH = 2.5;
const CPS = [[4, 1], [4, 3], [6, 3], [6, 6], [3, 6], [3, 4], [1, 4], [1, 1]].map(([i, j]) => ({ x: roadLine(i), z: roadLine(j) }));
const NUMWORD = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'];

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 160, 520);
const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 1200);
scene.add(new THREE.HemisphereLight(0xe6f4ff, 0x8a8f78, 1.7));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 320 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const world = buildWorld(scene);
const sfx = new Sfx();

// ---------------------------------------------------------------- particles
const PMAX = 900;
const pMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial(), PMAX);
pMesh.frustumCulled = false;
const P = Array.from({ length: PMAX }, () => ({ life: 0 }));
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
for (let i = 0; i < PMAX; i++) { pMesh.setColorAt(i, tmpC.set(0xffffff)); pMesh.setMatrixAt(i, tmpM.makeScale(0, 0, 0)); }
scene.add(pMesh);
let pNext = 0;

function spawnP(x, y, z, vx, vy, vz, color, size, life, grav = 22, grow = 0) {
  Object.assign(P[pNext], { x, y, z, vx, vy, vz, size, life, max: life, grav, grow });
  pMesh.setColorAt(pNext, tmpC.set(color));
  pMesh.instanceColor.needsUpdate = true;
  pNext = (pNext + 1) % PMAX;
}
function burst(x, y, z, color, n, speed, size = 0.25, bx = 0, bz = 0) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.28), s = rand(0.3, 1) * speed;
    spawnP(x, y, z, Math.cos(a) * s + bx, rand(0.3, 1.2) * speed, Math.sin(a) * s + bz, color, size * rand(0.6, 1.4), rand(0.6, 1.4));
  }
}
function updateParticles(dt) {
  for (let i = 0; i < PMAX; i++) {
    const p = P[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { pMesh.setMatrixAt(i, tmpM.makeScale(0, 0, 0)); continue; }
    p.vy -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.grav > 0 && p.y < p.size) { p.y = p.size; p.vy *= -0.4; p.vx *= 0.7; p.vz *= 0.7; }
    const k = p.life / p.max;
    const s = p.size * (p.grow ? 1 + p.grow * (1 - k) : Math.min(1, k * 3));
    pMesh.setMatrixAt(i, tmpM.compose(tmpV.set(p.x, p.y, p.z), tmpQ, tmpS.set(s, s, s)));
  }
  pMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- game state
let state = 'title';
let dyn = null, player = null, selected = 'cookie';
let cars = [], peds = [], props = [], pickups = [], debris = [], decals = [], emitters = [], pops = [], tags = [];
let timeLeft = 0, score = 0, combo = 0, comboT = 0, cpIndex = 0, lap = 1, pedsTotal = 0, pedsLeft = 0, kills = 0, wrecks = 0;
let countdownT = 0, lastCount = 0, elapsed = 0, camMode = 0, camH = 0, shake = 0, bannerT = 0, lastBeep = 0;
let cpMarker = null;
const fxT = { turbo: 0, giant: 0, magnet: 0, freeze: 0, slip: 0 };
const FX_LABEL = { turbo: 'TURBO TICKLES', giant: 'GIANT CAR', magnet: 'MONSTER MAGNET', freeze: 'FREEZE DANCE', slip: 'BANANA TYRES' };
const camPos = new THREE.Vector3(0, 80, -150);
const keys = {};

const POWERS = [
  { l: 'T', name: 'TURBO TICKLES!', color: '#e02020', apply: () => { fxT.turbo = 8; } },
  { l: 'G', name: 'GIANT CAR!', color: '#1e8a48', apply: () => { fxT.giant = 11; } },
  { l: 'M', name: 'MONSTER MAGNET!', color: '#a25ad6', apply: () => { fxT.magnet = 10; } },
  { l: 'F', name: 'FREEZE DANCE!', color: '#3aa0ff', apply: () => { fxT.freeze = 10; } },
  { l: 'C', name: 'COOKIE REPAIRS!', color: '#c68a3c', apply: () => { player.hp = 100; } },
  { l: 'N', name: 'THE NUMBER 20! (seconds)', color: '#ff8c1a', apply: () => { timeLeft += 20; } },
  { l: 'B', name: 'BANANA TYRES! Uh oh.', color: '#d9b800', bad: true, apply: () => { fxT.slip = 7; } },
];
const blockMats = new Map();
function blockMat(pw) {
  if (!blockMats.has(pw.l)) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#f5e6c0'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = pw.color; x.fillRect(12, 12, 104, 104);
    x.fillStyle = '#fff'; x.font = 'bold 92px "Arial Rounded MT Bold", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(pw.l, 64, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    blockMats.set(pw.l, new THREE.MeshLambertMaterial({ map: t }));
  }
  return blockMats.get(pw.l);
}

// ---------------------------------------------------------------- HUD helpers
function popup(text, x, y, z, cls = '') {
  const el = document.createElement('div');
  el.className = 'pop ' + cls; el.textContent = text;
  $('pops').appendChild(el);
  pops.push({ el, x, y, z, t: 0 });
}
function banner(main, sub = '', dur = 2) {
  $('bannerMain').textContent = main; $('bannerSub').textContent = sub;
  $('banner').classList.add('show'); bannerT = dur;
}
function feed(text) {
  const el = document.createElement('div');
  el.textContent = text;
  $('feed').appendChild(el);
  if ($('feed').children.length > 3) $('feed').firstChild.remove();
  setTimeout(() => el.remove(), 4000);
}
function toScreen(x, y, z) {
  tmpV.set(x, y, z).project(camera);
  if (tmpV.z > 1) return null;
  return [(tmpV.x * 0.5 + 0.5) * innerWidth, (-tmpV.y * 0.5 + 0.5) * innerHeight];
}
const fmtTime = t => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

// ---------------------------------------------------------------- cars
class Car {
  constructor(type, isPlayer) {
    this.type = type; this.cfg = CAST[type]; this.isPlayer = isPlayer;
    this.model = makeCar(type); this.mesh = this.model.group;
    this.x = 0; this.z = 0; this.y = 0; this.h = 0; this.vx = 0; this.vz = 0;
    this.steer = 0; this.steerVis = 0; this.throttle = 0; this.handbrake = false;
    this.hp = 100; this.wrecked = false; this.scale = 1; this.vr = 0; this.smokeT = 0; this.tauntT = rand(4, 10);
    this.ai = { ni: 1, nj: 1, pi: 0, pj: 1, mode: 'roam', modeT: rand(2, 6), stuckT: 0, reverseT: 0, direct: false };
  }
  get r() { return 1.9 * this.scale; }
  get mass() { return this.cfg.stats.mass * (this.wrecked ? 3 : 1) * this.scale * this.scale; }
  get speed() { return Math.hypot(this.vx, this.vz); }
}

function updateCar(car, dt) {
  const st = car.cfg.stats;
  let accelMul = 1, topMul = car.isPlayer ? 1 : 0.86, gripMul = 1;
  if (car.isPlayer) {
    if (fxT.turbo > 0) { accelMul = 1.9; topMul = 1.5; }
    if (fxT.slip > 0) gripMul = 0.12;
    car.scale += ((fxT.giant > 0 ? 1.8 : 1) - car.scale) * Math.min(1, dt * 5);
  }
  const top = st.top * 45 * topMul * (0.65 + 0.35 * car.hp / 100);
  car.steerVis += (car.steer - car.steerVis) * Math.min(1, dt * 9);

  let fx = Math.sin(car.h), fz = Math.cos(car.h);
  let vf = car.vx * fx + car.vz * fz;
  const sp = car.speed;
  if (!car.wrecked) {
    const yaw = clamp(vf / 6, -1, 1) * (2.3 / (1 + sp / 38)) * (car.handbrake ? 1.4 : 1);
    car.h += car.steerVis * yaw * dt;
  }
  fx = Math.sin(car.h); fz = Math.cos(car.h);
  const rx = fz, rz = -fx;
  vf = car.vx * fx + car.vz * fz;
  let vr = car.vx * rx + car.vz * rz;

  if (!car.wrecked) {
    if (car.throttle > 0) { if (vf < top) vf += car.throttle * st.accel * 20 * accelMul * dt; }
    else if (car.throttle < 0) { if (vf > 1) vf -= 42 * dt; else if (vf > -15) vf -= 16 * dt; }
    vf -= vf * (0.2 + (car.throttle === 0 ? 0.6 : 0)) * dt;
    if (vf > top) vf -= (vf - top) * 2 * dt;
    vr *= Math.exp(-(car.handbrake ? 1.5 : 6.5 * st.grip) * gripMul * dt);
    if (car.handbrake) vf *= Math.exp(-0.8 * dt);
  } else {
    vf *= Math.exp(-3 * dt); vr *= Math.exp(-3 * dt);
  }
  car.vr = vr;
  car.vx = fx * vf + rx * vr; car.vz = fz * vf + rz * vr;
  car.x += car.vx * dt; car.z += car.vz * dt;

  collideWorld(car);

  // visuals
  car.y += (groundY(car.x, car.z) - car.y) * Math.min(1, dt * 14);
  car.mesh.position.set(car.x, car.y, car.z);
  car.mesh.rotation.y = car.h;
  car.mesh.scale.setScalar(car.scale);
  car.model.body.rotation.z = clamp(vr * 0.012, -0.16, 0.16);
  for (const w of car.model.wheels) w.rotation.x += vf * dt / 0.5;
  for (const pv of car.model.pivots) pv.rotation.y = car.steerVis * 0.5;

  if (Math.abs(vr) > 9 && sp > 8 && Math.random() < dt * 30)
    spawnP(car.x - fx * 1.6, 0.3, car.z - fz * 1.6, rand(-1, 1), 1, rand(-1, 1), 0xdddddd, 0.18, 0.6, -1, 1.2);
  if (car.hp < 55 || car.wrecked) {
    car.smokeT -= dt;
    if (car.smokeT <= 0) {
      car.smokeT = car.wrecked ? 0.09 : 0.06 + car.hp / 300;
      const fire = car.wrecked && Math.random() < 0.35;
      spawnP(car.x + fx * 1.4, 1.3, car.z + fz * 1.4, rand(-1, 1), rand(2, 4), rand(-1, 1), fire ? 0xff7a1a : (car.hp < 25 ? 0x222222 : 0x888888), 0.28, fire ? 0.5 : 1.2, -2, 1.6);
    }
  }
}

function bounce(car, nx, nz, pen, e = 0.35) {
  car.x += nx * pen; car.z += nz * pen;
  const vn = car.vx * nx + car.vz * nz;
  if (vn >= 0) return;
  car.vx -= (1 + e) * vn * nx; car.vz -= (1 + e) * vn * nz;
  car.vx *= 0.97; car.vz *= 0.97;
  const imp = -vn;
  if (imp > 9) {
    damage(car, (imp - 9) * 0.9);
    burst(car.x - nx * car.r, 1, car.z - nz * car.r, 0xffd070, 8, 6, 0.12);
    if (car.isPlayer) { sfx.play('crash', imp); shake = Math.min(1, imp / 30); }
  } else if (imp > 3 && car.isPlayer) sfx.play('thud');
}

function collideWorld(car) {
  const r = car.r, lim = HALF - r;
  if (car.x > lim) bounce(car, -1, 0, car.x - lim);
  if (car.x < -lim) bounce(car, 1, 0, -lim - car.x);
  if (car.z > lim) bounce(car, 0, -1, car.z - lim);
  if (car.z < -lim) bounce(car, 0, 1, -lim - car.z);
  for (const b of world.boxes) {
    if (car.x < b.minX - r || car.x > b.maxX + r || car.z < b.minZ - r || car.z > b.maxZ + r) continue;
    const cx = clamp(car.x, b.minX, b.maxX), cz = clamp(car.z, b.minZ, b.maxZ);
    const dx = car.x - cx, dz = car.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) { const d = Math.sqrt(d2); bounce(car, dx / d, dz / d, r - d); continue; }
    // centre is inside the box: leave by the nearest face
    const l = car.x - b.minX, rr = b.maxX - car.x, t = car.z - b.minZ, bt = b.maxZ - car.z, m = Math.min(l, rr, t, bt);
    if (m === l) bounce(car, -1, 0, l + r); else if (m === rr) bounce(car, 1, 0, rr + r);
    else if (m === t) bounce(car, 0, -1, t + r); else bounce(car, 0, 1, bt + r);
  }
  for (const c of world.circles) {
    const dx = car.x - c.x, dz = car.z - c.z, d = Math.hypot(dx, dz), min = r + c.r;
    if (d < min && d > 1e-4) bounce(car, dx / d, dz / d, min - d);
  }
}

function collideCars() {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.r + b.r;
    if (d >= min || d < 1e-4) continue;
    const nx = dx / d, nz = dz / d, ma = a.mass, mb = b.mass, pen = min - d;
    a.x -= nx * pen * mb / (ma + mb); a.z -= nz * pen * mb / (ma + mb);
    b.x += nx * pen * ma / (ma + mb); b.z += nz * pen * ma / (ma + mb);
    const sa = a.vx * nx + a.vz * nz, sb = b.vx * nx + b.vz * nz, vrel = sa - sb;
    if (vrel <= 0) continue;
    const jimp = 1.5 * vrel / (1 / ma + 1 / mb);
    a.vx -= jimp / ma * nx; a.vz -= jimp / ma * nz;
    b.vx += jimp / mb * nx; b.vz += jimp / mb * nz;
    if (vrel < 5) continue;
    // Whoever was closing faster is the rammer and takes the smaller share.
    const pa = Math.max(0, sa), pb = Math.max(0, -sb), tot = pa + pb + 1e-3;
    // Rival-on-rival pile-ups are mostly for show, so the player still has someone to wreck.
    const base = (vrel - 4) * (a.isPlayer || b.isPlayer ? 1.1 : 0.3);
    const toB = base * (0.25 + 0.75 * pa / tot) * ma, toA = base * (0.25 + 0.75 * pb / tot) * mb;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    burst(mx, 1, mz, 0xffd070, 12, 8, 0.14);
    for (const [me, other, dealt] of [[a, b, toB], [b, a, toA]]) {
      if (!me.isPlayer || other.wrecked) continue;
      const pts = Math.round(dealt) * 10;
      score += pts; timeLeft += dealt * 0.1;
      popup('+' + pts, mx, 3, mz);
    }
    if (a.isPlayer || b.isPlayer) {
      sfx.play('crash', vrel); shake = Math.min(1, vrel / 30);
      // A rival that just landed a hit backs off for a while instead of pinning the player.
      const ai = (a.isPlayer ? b : a).ai;
      ai.mode = 'roam'; ai.modeT = rand(5, 9); ai.reverseT = 0.9;
    }
    damage(b, toB, a); damage(a, toA, b);
  }
}

function damage(car, amt, by) {
  if (car.wrecked || state !== 'play') return;
  amt /= car.cfg.stats.mass;
  if (car.isPlayer) amt *= fxT.giant > 0 ? 0.2 : 0.6;
  else if (!by) amt *= 0.2; // rivals are clumsy; don't let them total themselves on walls
  car.hp -= amt;
  if (car.hp > 0) return;
  car.hp = 0; car.wrecked = true;
  car.mesh.traverse(o => { if (o.isMesh && !o.userData.keep) o.material = mat(0x26221f); });
  burst(car.x, 1.5, car.z, 0xff7a1a, 40, 14, 0.5);
  burst(car.x, 1.5, car.z, 0x222222, 30, 9, 0.6);
  sfx.play('wreck'); shake = 1;
  if (car.isPlayer) return end(false, 'Your car is now a modern art installation.');
  wrecks++;
  const mine = by && by.isPlayer;
  score += mine ? 2500 : 500; timeLeft += mine ? 20 : 8;
  banner('WRECKED!', car.cfg.name + (mine ? ' is brought to you by the letter R.I.P.' : ' wrecked without your help.'), 2.5);
  if (cars.every(c => c.isPlayer || c.wrecked)) end(true, 'Every rival has been reduced to scrap.');
}

// ---------------------------------------------------------------- AI drivers
const nearestNode = v => clamp(Math.round((v - roadLine(0)) / CELL), 0, N);
function clearLine(ax, az, bx, bz) {
  for (let k = 1; k < 8; k++) if (blocked(ax + (bx - ax) * k / 8, az + (bz - az) * k / 8, 2)) return false;
  return true;
}
function nextNode(car) {
  const ai = car.ai;
  let opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [ai.ni + a, ai.nj + b])
    .filter(([i, j]) => i >= 0 && j >= 0 && i <= N && j <= N);
  const fwd = opts.filter(([i, j]) => i !== ai.pi || j !== ai.pj);
  if (fwd.length) opts = fwd;
  let choice = pick(opts);
  if (ai.mode === 'hunt' && Math.random() < 0.85) {
    let best = 1e9;
    for (const o of opts) {
      const d = Math.hypot(roadLine(o[0]) - player.x, roadLine(o[1]) - player.z);
      if (d < best) { best = d; choice = o; }
    }
  }
  ai.pi = ai.ni; ai.pj = ai.nj;
  [ai.ni, ai.nj] = choice;
}
function aiUpdate(car, dt) {
  const ai = car.ai;
  if (car.wrecked) { car.throttle = 0; car.steer = 0; return; }
  ai.modeT -= dt;
  if (ai.modeT <= 0) { ai.mode = Math.random() < car.cfg.aggro ? 'hunt' : 'roam'; ai.modeT = rand(6, 14); }
  car.tauntT -= dt;
  const dp = Math.hypot(player.x - car.x, player.z - car.z);
  if (car.tauntT <= 0) { car.tauntT = rand(10, 22); if (dp < 60) feed(car.cfg.name + ': ' + pick(car.cfg.taunts)); }

  let tx, tz;
  const direct = ai.mode === 'hunt' && !player.wrecked && dp < 55 && clearLine(car.x, car.z, player.x, player.z);
  if (direct) { tx = player.x + player.vx * 0.3; tz = player.z + player.vz * 0.3; }
  else {
    if (ai.direct) { ai.ni = nearestNode(car.x); ai.nj = nearestNode(car.z); ai.pi = -1; }
    if (Math.hypot(roadLine(ai.ni) - car.x, roadLine(ai.nj) - car.z) < 10) nextNode(car);
    tx = roadLine(ai.ni); tz = roadLine(ai.nj);
  }
  ai.direct = direct;

  const diff = wrap(Math.atan2(tx - car.x, tz - car.z) - car.h), sp = car.speed;
  car.handbrake = false;
  if (ai.reverseT > 0) { ai.reverseT -= dt; car.throttle = -1; car.steer = -Math.sign(diff); return; }
  car.steer = clamp(diff * 2.5, -1, 1);
  car.throttle = Math.abs(diff) > 0.5 && sp > 20 ? -1 : 1;
  ai.stuckT = sp < 2 ? ai.stuckT + dt : 0;
  if (ai.stuckT > 1.2) { ai.reverseT = 1.1; ai.stuckT = 0; }
}

// ---------------------------------------------------------------- pedestrians
function spawnPed(big) {
  const m = big ? makeSnuffle() : makePed(pick(PED_TYPES));
  const pt = big ? world.randomRoadPoint() : world.randomPedPoint();
  const p = {
    ...m, big, x: pt.x, z: pt.z, h: rand(0, 6.28), alive: true, tx: pt.x, tz: pt.z, idle: rand(0, 3),
    walk: big ? 1.3 : rand(1.4, 2.6), run: big ? 2.2 : rand(5, 7.5), phase: rand(0, 6), scare: 0, panic: 0,
  };
  p.r = m.radius * m.group.scale.x;
  m.group.position.set(p.x, groundY(p.x, p.z), p.z);
  dyn.add(m.group);
  peds.push(p);
}

function movePed(p, dx, dz) {
  const m = p.big ? 2 : 0.6, nx = p.x + dx, nz = p.z + dz;
  if (!blocked(nx, nz, m)) { p.x = nx; p.z = nz; return true; }
  if (!blocked(nx, p.z, m)) { p.x = nx; return true; }
  if (!blocked(p.x, nz, m)) { p.z = nz; return true; }
  return false;
}

function updatePeds(dt) {
  const frozen = fxT.freeze > 0;
  for (const p of peds) {
    if (!p.alive) continue;
    let mx = 0, mz = 0, speed = 0, fleeing = false;
    p.scare -= dt;

    // nearest car that is actually coming this way
    let threat = null, td = 16;
    for (const c of cars) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d < c.r + p.r) {
        const sp = c.speed;
        if (p.big && sp < 25) { // too slow: the big guy wins
          bounce(c, -dx / d, -dz / d, c.r + p.r - d, 0.8);
          if (c.isPlayer && sp > 6) { sfx.play('boing'); popup('TOO SLOW! Need 63 mph', p.x, 4, p.z, 'bad'); damage(c, 4); }
        } else if (sp > 5) { splat(p, c); break; }
        else { p.x += dx / d * dt * 6; p.z += dz / d * dt * 6; }
      }
      if (d < td && !c.wrecked && (c.speed > 4 && (c.vx * dx + c.vz * dz > 0 || d < 6))) { td = d; threat = c; }
    }
    if (!p.alive) continue;
    if (!threat && p.scare > 0) threat = player;

    if (frozen) { /* statue */ }
    else if (fxT.magnet > 0 && !p.big && Math.hypot(player.x - p.x, player.z - p.z) < 45) {
      mx = player.x - p.x; mz = player.z - p.z; speed = 8; fleeing = true;
    } else if (threat) {
      const dx = p.x - threat.x, dz = p.z - threat.z, d = Math.hypot(dx, dz) || 1;
      const sp = threat.speed || 1, side = Math.sign(threat.vx * dz - threat.vz * dx) || 1;
      mx = dx / d * 0.5 + (-threat.vz / sp) * side * 0.9;
      mz = dz / d * 0.5 + (threat.vx / sp) * side * 0.9;
      speed = p.run; fleeing = true; p.idle = 0; p.tx = p.x; p.tz = p.z;
    } else if (p.idle > 0) p.idle -= dt;
    else {
      mx = p.tx - p.x; mz = p.tz - p.z;
      if (Math.hypot(mx, mz) < 1) {
        p.idle = rand(0, 3);
        for (let k = 0; k < 6; k++) {
          const tx = p.x + rand(-22, 22), tz = p.z + rand(-22, 22);
          if (blocked(tx, tz, 2) || (groundY(tx, tz) === 0 && Math.random() > 0.35)) continue;
          p.tx = tx; p.tz = tz; break;
        }
        mx = mz = 0;
      } else speed = p.walk;
    }

    const len = Math.hypot(mx, mz);
    if (len > 0.01 && speed > 0) {
      mx /= len; mz /= len;
      if (!movePed(p, mx * speed * dt, mz * speed * dt)) { p.tx = p.x; p.tz = p.z; }
      p.h += wrap(Math.atan2(mx, mz) - p.h) * Math.min(1, dt * 10);
      p.phase += dt * speed * 2.2;
    }
    p.panic += ((fleeing ? 1 : 0) - p.panic) * Math.min(1, dt * 8);
    const g = p.group, moving = len > 0.01 && speed > 0;
    g.position.set(p.x, groundY(p.x, p.z) + (moving ? Math.abs(Math.sin(p.phase)) * 0.18 : 0), p.z);
    g.rotation.y = p.h;
    g.rotation.z = moving ? Math.sin(p.phase) * 0.09 : 0;
    if (p.parts.armL) {
      const flail = Math.sin(elapsed * 22 + p.phase) * 0.4 * p.panic;
      p.parts.armL.rotation.z = -0.35 - p.panic * 2.3 + flail;
      p.parts.armR.rotation.z = 0.35 + p.panic * 2.3 - flail;
    }
  }
}

function splat(p, car) {
  p.alive = false; pedsLeft--;
  const sp = car.speed, y = p.group.position.y;
  burst(p.x, 1.2, p.z, p.color, p.big ? 60 : 22, 7, p.big ? 0.5 : 0.28, car.vx * 0.5, car.vz * 0.5);
  for (let k = 0; k < 2; k++) { // the googly eyes always survive
    const e = new THREE.Group();
    part(e, 'sphere', 0xffffff, [0.2, 0.2, 0.2], [0, 0, 0]);
    part(e, 'sphere', 0x111111, [0.09, 0.09, 0.09], [0, 0.05, 0.15]);
    e.position.set(p.x, 1.5, p.z); dyn.add(e);
    debris.push({ obj: e, vx: car.vx * 0.8 + rand(-6, 6), vy: rand(8, 14), vz: car.vz * 0.8 + rand(-6, 6), sx: rand(-12, 12), sz: rand(-12, 12), life: 5, floor: 0.2, s0: 1 });
  }
  const grp = p.group, col = p.color, r = p.r;
  debris.push({
    obj: grp, vx: car.vx * 1.1 + rand(-3, 3), vy: 7 + sp * 0.22, vz: car.vz * 1.1 + rand(-3, 3), sx: rand(-9, 9), sz: rand(-9, 9),
    life: p.big ? 3 : 2.2, floor: y, s0: grp.scale.x,
    onEnd: () => { pancake(grp.position.x, grp.position.z, col, r); dyn.remove(grp); },
  });

  if (!car.isPlayer) { if (Math.random() < 0.3) feed(car.cfg.name + ' flattened a fuzzy.'); }
  else {
    kills++;
    combo = comboT > 0 ? combo + 1 : 1; comboT = 2.6;
    const pts = p.value * combo;
    score += pts; timeLeft += (p.big ? 10 : 3) + Math.min(combo - 1, 4);
    popup('+' + pts, p.x, 3, p.z, p.big ? 'big' : '');
    sfx.play('splat');
    if (p.big) banner('MAMMOTH MASH!', 'Nobody believed you could do it.', 2.5);
    if (combo >= 2) {
      sfx.play('combo', combo);
      $('combo').textContent = `${combo}! ${NUMWORD[combo] || 'SO MANY'} flattened fuzzies!${combo >= 3 ? ' AH AH AH!' : ''}`;
      $('combo').classList.add('show');
    }
  }
  if (pedsLeft <= 0) end(true, 'Every last fuzzy has been flattened.');
}

const pancakeGeo = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
function pancake(x, z, color, r) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(pancakeGeo, mat(color));
  m.scale.setScalar(r * 1.5); m.receiveShadow = true;
  g.add(m);
  for (const s of [-1, 1]) {
    part(g, 'cyl', 0xffffff, [0.2, 0.02, 0.2], [s * 0.3, 0.02, 0.1]).castShadow = false;
    part(g, 'cyl', 0x111111, [0.09, 0.03, 0.09], [s * 0.3 + rand(-0.08, 0.08), 0.03, 0.1 + rand(-0.08, 0.08)]).castShadow = false;
  }
  g.position.set(x, groundY(x, z) + 0.03 + decals.length * 0.0004, z);
  g.rotation.y = rand(0, 6.28);
  dyn.add(g); decals.push(g);
  if (decals.length > 90) dyn.remove(decals.shift());
}

// ---------------------------------------------------------------- props, pickups, debris
function updateProps(dt) {
  for (const p of props) {
    if (!p.alive) continue;
    if (p.kind === 'grouch') p.top.position.y = 1.12 + Math.max(-0.5, Math.sin(elapsed * 1.3 + p.phase) * 0.7) * 0.5 - 0.25;
    for (const c of cars) {
      const dx = p.x - c.x, dz = p.z - c.z;
      if (dx * dx + dz * dz > (p.r + c.r) ** 2 || c.speed < 3) continue;
      p.alive = false;
      debris.push({ obj: p.group, vx: c.vx * 1.15 + rand(-2, 2), vy: rand(5, 9) + c.speed * 0.15, vz: c.vz * 1.15 + rand(-2, 2), sx: rand(-7, 7), sz: rand(-7, 7), life: 4, floor: p.group.position.y + 0.3, s0: 1 });
      c.vx *= p.slow; c.vz *= p.slow;
      if (p.kind === 'hydrant') emitters.push({ x: p.x, z: p.z, t: 6 });
      if (p.kind === 'mailbox') burst(p.x, 1.5, p.z, 0xffffff, 14, 6, 0.15);
      if (!c.isPlayer) break;
      sfx.play('clank');
      if (p.kind === 'grouch') { score += 250; popup('GROUCH EVICTED +250', p.x, 3, p.z, 'big'); feed('Bin Grouch: HEY! I was SLEEPING in there!'); }
      else { score += 10; popup('+10', p.x, 2.5, p.z); }
      break;
    }
  }
  for (let i = emitters.length - 1; i >= 0; i--) {
    const e = emitters[i];
    e.t -= dt;
    for (let k = 0; k < 2; k++) spawnP(e.x, 0.3, e.z, rand(-1.5, 1.5), rand(12, 17), rand(-1.5, 1.5), 0x6ab8ff, 0.2, 1.4);
    if (e.t <= 0) emitters.splice(i, 1);
  }
}

function spawnPickup(kind) {
  const pt = world.randomRoadPoint();
  const g = new THREE.Group();
  let power = null;
  if (kind === 'cookie') {
    const c = part(g, 'cyl', 0xc68a3c, [0.7, 0.16, 0.7], [0, 0, 0], [Math.PI / 2, 0, 0]);
    for (const [x, z] of [[0.3, 0.2], [-0.35, 0.1], [0, -0.45]]) part(c, 'sphere', 0x4a2c10, [0.16, 0.7, 0.16], [x, 0, z]);
  } else {
    power = pick(POWERS);
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), blockMat(power));
    m.castShadow = true; g.add(m);
  }
  g.position.set(pt.x, 1.3, pt.z);
  dyn.add(g);
  pickups.push({ kind, power, group: g, x: pt.x, z: pt.z, phase: rand(0, 6) });
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.group.rotation.y += dt * 2;
    p.group.position.y = (p.kind === 'cookie' ? 1.1 : 1.7) + Math.sin(elapsed * 3 + p.phase) * 0.25;
    if (Math.hypot(p.x - player.x, p.z - player.z) > player.r + 1.3 || player.wrecked) continue;
    dyn.remove(p.group); pickups.splice(i, 1);
    if (p.kind === 'cookie') {
      score += 50; player.hp = Math.min(100, player.hp + 4);
      burst(p.x, 1.2, p.z, 0xc68a3c, 8, 4, 0.12);
      sfx.play('cookie'); popup('+50', p.x, 2.5, p.z);
    } else {
      p.power.apply();
      banner(p.power.name, 'Brought to you by the letter ' + p.power.l, 2.2);
      sfx.play(p.power.bad ? 'bad' : 'power');
      burst(p.x, 1.5, p.z, 0xffd21a, 20, 7, 0.2);
      spawnPickup('block');
    }
  }
}

function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i], o = d.obj;
    d.vy -= 30 * dt;
    o.position.x += d.vx * dt; o.position.y += d.vy * dt; o.position.z += d.vz * dt;
    o.rotation.x += d.sx * dt; o.rotation.z += d.sz * dt;
    if (o.position.y < d.floor) {
      o.position.y = d.floor;
      d.vy = d.vy < -4 ? d.vy * -0.45 : 0;
      d.vx *= 0.6; d.vz *= 0.6; d.sx *= 0.5; d.sz *= 0.5;
    }
    if (Math.abs(o.position.x) > HALF - 2) { d.vx *= -0.5; o.position.x = clamp(o.position.x, -HALF + 2, HALF - 2); }
    if (Math.abs(o.position.z) > HALF - 2) { d.vz *= -0.5; o.position.z = clamp(o.position.z, -HALF + 2, HALF - 2); }
    d.life -= dt;
    if (d.life < 0.3) o.scale.setScalar(d.s0 * Math.max(0.01, d.life / 0.3));
    if (d.life <= 0) { if (d.onEnd) d.onEnd(); else dyn.remove(o); debris.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- flow
function startGame(type) {
  selected = type;
  if (dyn) scene.remove(dyn);
  dyn = new THREE.Group(); scene.add(dyn);
  cars = []; peds = []; pickups = []; debris = []; decals = []; emitters = [];
  for (const p of P) p.life = 0;
  for (let i = 0; i < PMAX; i++) pMesh.setMatrixAt(i, tmpM.makeScale(0, 0, 0));
  $('pops').innerHTML = ''; $('tags').innerHTML = ''; $('feed').innerHTML = ''; pops = []; tags = [];
  for (const k in fxT) fxT[k] = 0;

  props = world.spawnProps(dyn);
  const order = [type, ...DRIVER_TYPES.filter(t => t !== type).sort(() => Math.random() - 0.5)];
  order.forEach((t, k) => {
    const c = new Car(t, k === 0);
    c.x = -164 - 12 * Math.floor(k / 2); c.z = roadLine(1) + (k % 2 ? 3.6 : -3.6); c.h = Math.PI / 2;
    c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.h;
    dyn.add(c.mesh); cars.push(c);
    if (k > 0) {
      const el = document.createElement('div');
      el.className = 'tagEl'; el.innerHTML = `${c.cfg.name}<i><b></b></i>`;
      $('tags').appendChild(el); tags.push({ el, bar: el.querySelector('b'), car: c });
    }
  });
  player = cars[0];

  for (let k = 0; k < PED_COUNT; k++) spawnPed(false);
  spawnPed(true); spawnPed(true);
  pedsTotal = pedsLeft = peds.length;
  for (let k = 0; k < 40; k++) spawnPickup('cookie');
  for (let k = 0; k < 10; k++) spawnPickup('block');

  cpMarker = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd21a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 30;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.35, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd21a }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.4;
  cpMarker.add(beam, ring); dyn.add(cpMarker);

  timeLeft = START_TIME; score = 0; combo = 0; comboT = 0; cpIndex = 0; lap = 1; kills = 0; wrecks = 0; elapsed = 0;
  camH = player.h; camPos.set(player.x - 14, 7, player.z);
  countdownT = 3.6; lastCount = 4; lastBeep = 0;
  state = 'countdown';
  for (const id of ['title', 'end', 'pause']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('combo').classList.remove('show');
  sfx.init();
}

function end(win, reason) {
  if (state === 'over') return;
  state = 'over';
  sfx.quiet(); sfx.play(win ? 'win' : 'lose');
  const bonus = win ? Math.round(timeLeft) * 25 : 0;
  score += bonus;
  $('endTitle').textContent = win ? 'SUNNY DAY!' : 'GAME OVER';
  $('endReason').textContent = reason;
  $('endStats').innerHTML =
    `Score <b>${score.toLocaleString()}</b>${bonus ? ` (includes ${bonus.toLocaleString()} time bonus)` : ''}<br>` +
    `Fuzzies flattened <b>${kills}</b> of ${pedsTotal} · Rivals wrecked <b>${wrecks}</b> of ${cars.length - 1}<br>` +
    `Lap <b>${Math.min(lap, LAPS)}</b> of ${LAPS} · Survived <b>${fmtTime(elapsed)}</b>`;
  setTimeout(() => { if (state === 'over') $('end').classList.remove('hidden'); }, 1400);
}

function toTitle() {
  state = 'title';
  sfx.quiet();
  for (const id of ['hud', 'end', 'pause']) $(id).classList.add('hidden');
  $('title').classList.remove('hidden');
}

function step(dt) {
  elapsed += dt;
  const playing = state === 'play';

  if (state === 'countdown') {
    countdownT -= dt;
    const n = Math.ceil(countdownT - 0.6);
    if (n !== lastCount && n >= 1) { lastCount = n; banner(n + '!', NUMWORD[n] + '! ' + 'Ah '.repeat(n).trim() + '!', 0.8); sfx.play('beep', 0); }
    if (countdownT <= 0.6 && lastCount !== 0) { lastCount = 0; state = 'play'; banner('GO!', 'Sunny day, sweeping the crowds away', 1.4); sfx.play('beep', 1); }
  }

  if (playing) {
    timeLeft -= dt;
    for (const k in fxT) fxT[k] = Math.max(0, fxT[k] - dt);
    comboT -= dt;
    if (comboT <= 0) $('combo').classList.remove('show');
    player.throttle = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    player.steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
    player.handbrake = !!keys.Space;
    for (const c of cars) if (!c.isPlayer) aiUpdate(c, dt);

    const cp = CPS[cpIndex];
    if (Math.hypot(cp.x - player.x, cp.z - player.z) < 11) {
      cpIndex++; score += 200; timeLeft += 8;
      sfx.play('checkpoint'); popup('CHECKPOINT +8s', player.x, 4, player.z, 'big');
      if (cpIndex === CPS.length) {
        cpIndex = 0; lap++;
        if (lap > LAPS) end(true, 'Three laps of the neighbourhood, and what a neighbourhood it was.');
        else banner('LAP ' + lap + '!', lap === LAPS ? 'Final lap' : '', 1.8);
      }
    }
    if (timeLeft <= 0 && state === 'play') end(false, 'Out of time! This game was brought to you by the number 0.');
    if (timeLeft < 10 && Math.ceil(timeLeft) !== lastBeep) { lastBeep = Math.ceil(timeLeft); sfx.play('beep', 0); }
  } else {
    for (const c of cars) { c.throttle = 0; c.steer = 0; c.handbrake = state === 'over'; }
  }

  if (state !== 'countdown') {
    for (const c of cars) updateCar(c, dt);
    collideCars();
  }
  updatePeds(dt);
  updateProps(dt);
  if (playing) updatePickups(dt);
  updateDebris(dt);

  const cp = CPS[cpIndex];
  cpMarker.position.set(cp.x, 0, cp.z);
  cpMarker.children[1].scale.setScalar(1 + Math.sin(elapsed * 5) * 0.06);

  if (playing) { sfx.engine(player.speed / 45, player.throttle); sfx.skid(Math.abs(player.vr)); }
  updateCamera(dt);
  updateHud(dt);
}

function updateCamera(dt) {
  const sp = player.speed, sc = player.scale;
  camH += wrap(player.h - camH) * Math.min(1, dt * 4.5);
  const fx = Math.sin(camH), fz = Math.cos(camH);
  const back = camMode === 0 ? (9.5 + sp * 0.07) * sc : 22, up = camMode === 0 ? 4.4 * sc : 46;
  tmpV.set(player.x - fx * back, up, player.z - fz * back);
  if (state === 'over') tmpV.set(player.x + Math.sin(elapsed * 0.3) * 16, 9, player.z + Math.cos(elapsed * 0.3) * 16);
  camPos.lerp(tmpV, Math.min(1, dt * (state === 'over' ? 2 : 7)));
  camera.position.copy(camPos);
  if (shake > 0.01) {
    camera.position.x += rand(-1, 1) * shake * 0.6; camera.position.y += rand(-1, 1) * shake * 0.6;
    shake *= Math.exp(-dt * 6);
  }
  if (state === 'over') camera.lookAt(player.x, 1.5, player.z);
  else camera.lookAt(player.x + fx * 5, 1.6 * sc, player.z + fz * 5);
  const fov = 62 + Math.min(22, sp * 0.33);
  if (Math.abs(fov - camera.fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  sun.target.position.set(player.x, 0, player.z);
  sun.position.set(player.x + 70, 120, player.z + 45);
}

// ---------------------------------------------------------------- HUD
const mapCtx = $('map').getContext('2d');
const mapBg = document.createElement('canvas');
mapBg.width = mapBg.height = 200;
const MS = 200 / (HALF * 2), mapX = x => (HALF - x) * MS, mapY = z => (HALF - z) * MS;
{
  const c = mapBg.getContext('2d');
  c.fillStyle = 'rgba(30,30,38,.88)'; c.fillRect(0, 0, 200, 200);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    c.fillStyle = isPark(i, j) ? '#3d8b3d' : '#8b6a55';
    c.fillRect(mapX(blockCenter(i) + 22), mapY(blockCenter(j) + 22), 44 * MS, 44 * MS);
  }
}
function drawMap() {
  const c = mapCtx;
  c.clearRect(0, 0, 200, 200);
  c.drawImage(mapBg, 0, 0);
  c.fillStyle = '#fff';
  for (const p of peds) if (p.alive) c.fillRect(mapX(p.x) - 1, mapY(p.z) - 1, p.big ? 4 : 2, p.big ? 4 : 2);
  c.fillStyle = '#ff5ad6';
  for (const p of pickups) if (p.kind === 'block') c.fillRect(mapX(p.x) - 2, mapY(p.z) - 2, 4, 4);
  const cp = CPS[cpIndex];
  c.strokeStyle = '#ffd21a'; c.lineWidth = 2;
  c.beginPath(); c.arc(mapX(cp.x), mapY(cp.z), 5 + Math.sin(elapsed * 6) * 1.5, 0, 6.3); c.stroke();
  for (const car of cars) {
    if (car.isPlayer) continue;
    c.fillStyle = car.wrecked ? '#555' : '#' + car.cfg.color.toString(16).padStart(6, '0');
    c.beginPath(); c.arc(mapX(car.x), mapY(car.z), 4, 0, 6.3); c.fill();
    c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke();
  }
  c.save();
  c.translate(mapX(player.x), mapY(player.z)); c.rotate(-player.h);
  c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2); c.lineTo(-5, 5); c.closePath(); c.fill(); c.stroke();
  c.restore();
}

function updateHud(dt) {
  $('timer').textContent = fmtTime(timeLeft);
  $('timer').classList.toggle('low', timeLeft < 15);
  $('score').textContent = score.toLocaleString();
  $('hPeds').textContent = (pedsTotal - pedsLeft) + '/' + pedsTotal;
  $('hRivals').textContent = wrecks + '/' + (cars.length - 1);
  $('hLap').textContent = Math.min(lap, LAPS) + '/' + LAPS;
  $('speed').firstChild.textContent = Math.round(player.speed * MPH) + ' ';
  $('hpFill').style.width = player.hp + '%';
  $('hpFill').style.background = player.hp > 50 ? '#6fdc4b' : player.hp > 25 ? '#ffb11a' : '#ff4a3a';
  $('powers').textContent = Object.keys(fxT).filter(k => fxT[k] > 0).map(k => FX_LABEL[k] + ' ' + Math.ceil(fxT[k]) + 's').join(' · ');

  const cp = CPS[cpIndex], dx = cp.x - player.x, dz = cp.z - player.z;
  $('arrow').style.transform = `rotate(${-wrap(Math.atan2(dx, dz) - camH)}rad)`;
  $('cpDist').textContent = `CHECKPOINT ${cpIndex + 1}/${CPS.length} · ${Math.round(Math.hypot(dx, dz))}m`;

  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('show'); }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t += dt; p.y += dt * 2.5;
    const s = toScreen(p.x, p.y, p.z);
    if (p.t > 1.4) { p.el.remove(); pops.splice(i, 1); continue; }
    p.el.style.display = s ? '' : 'none';
    if (s) { p.el.style.transform = `translate(${s[0]}px,${s[1]}px)`; p.el.style.opacity = Math.min(1, (1.4 - p.t) * 2.5); }
  }
  for (const t of tags) {
    const c = t.car, d = Math.hypot(c.x - player.x, c.z - player.z);
    const s = d < 110 && !c.wrecked ? toScreen(c.x, 4.4, c.z) : null;
    t.el.style.display = s ? '' : 'none';
    if (s) { t.el.style.transform = `translate(${s[0]}px,${s[1]}px) translate(-50%,-100%)`; t.bar.style.width = c.hp + '%'; }
  }
  drawMap();
}

// ---------------------------------------------------------------- input
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyM') sfx.toggleMute();
  if (state === 'title' && e.code === 'Enter') return startGame(selected);
  if (state === 'over' && e.code === 'Enter' && !$('end').classList.contains('hidden')) return startGame(selected);
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state === 'play') { state = 'paused'; sfx.quiet(); $('pause').classList.remove('hidden'); }
    else if (state === 'paused') { state = 'play'; $('pause').classList.add('hidden'); }
  }
  if (state === 'paused' && e.code === 'KeyQ') toTitle();
  if (state !== 'play') return;
  if (e.code === 'KeyC') camMode = 1 - camMode;
  if (e.code === 'KeyH') {
    sfx.play('horn');
    for (const p of peds) if (p.alive && Math.hypot(p.x - player.x, p.z - player.z) < 35) p.scare = 2.5;
  }
  if (e.code === 'KeyR') {
    if (player.hp >= 100) return;
    if (score < 300) return popup('Repairs cost 300!', player.x, 4, player.z, 'bad');
    score -= 300; player.hp = Math.min(100, player.hp + 30);
    sfx.play('repair'); popup('REPAIRED −300', player.x, 4, player.z);
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------------------------------------------------------------- title screen
function thumb(type) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0xbfe6ff);
  s.add(new THREE.HemisphereLight(0xffffff, 0x8a8f78, 2));
  const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(4, 8, 6); s.add(d);
  const car = makeCar(type).group; car.rotation.y = 0.75; s.add(car);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32), mat(0x3b3b42));
  floor.rotation.x = -Math.PI / 2; s.add(floor);
  const cam = new THREE.PerspectiveCamera(32, 1.5, 0.1, 60);
  cam.position.set(0, 4, 10.5); cam.lookAt(0, 1.2, 0);
  renderer.setSize(300, 200, false);
  renderer.render(s, cam);
  return renderer.domElement.toDataURL('image/jpeg', 0.85);
}
for (const t of DRIVER_TYPES) {
  const c = CAST[t], el = document.createElement('div');
  el.className = 'card' + (t === selected ? ' sel' : '');
  const bar = (label, v) => `<div class="stat"><span>${label}</span><i><b style="width:${clamp((v - 0.6) / 1.2, 0.08, 1) * 100}%"></b></i></div>`;
  el.innerHTML = `<img src="${thumb(t)}" alt=""><h3>${c.name}</h3><div class="carName">${c.car}</div>` +
    bar('ZOOM', c.stats.accel) + bar('TOP', c.stats.top + 0.3) + bar('HEFT', c.stats.mass) + bar('GRIP', c.stats.grip);
  el.onclick = () => { selected = t; document.querySelectorAll('.card').forEach(x => x.classList.toggle('sel', x === el)); };
  el.ondblclick = () => startGame(t);
  $('cards').appendChild(el);
}
resize();
$('startBtn').onclick = () => startGame(selected);
$('againBtn').onclick = () => startGame(selected);
$('menuBtn').onclick = toTitle;

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'title') {
    const a = now * 0.00007;
    camera.position.set(Math.sin(a) * 190, 95, Math.cos(a) * 190);
    camera.lookAt(0, 0, 0);
    sun.target.position.set(0, 0, 0); sun.position.set(70, 120, 45);
  } else if (state !== 'paused') {
    step(dt);
    updateParticles(dt);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// handy for poking at the game from the console
window.game = { start: startGame, get state() { return state; }, get player() { return player; }, get cars() { return cars; }, get peds() { return peds; }, keys, fxT };
