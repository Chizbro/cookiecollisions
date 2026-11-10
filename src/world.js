import * as THREE from 'three';
import { mat, part, makeHead } from './characters.js';

// The city is an N x N grid of blocks separated by roads.
export const N = 7, CELL = 60, ROAD = 16, BLOCK = 44, INSET = 4;
export const HALF = (N * CELL + ROAD) / 2;
export const roadLine = i => -HALF + ROAD / 2 + i * CELL;
export const blockCenter = i => -HALF + ROAD + BLOCK / 2 + i * CELL;

const PARKS = new Set(['3,3', '1,5', '5,1', '5,4', '1,2']);
export const isPark = (i, j) => PARKS.has(i + ',' + j);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

export function blockAt(x, z) {
  const u = x + HALF - ROAD, v = z + HALF - ROAD;
  const i = Math.floor(u / CELL), j = Math.floor(v / CELL);
  if (i < 0 || j < 0 || i >= N || j >= N) return null;
  const lu = u - i * CELL, lv = v - j * CELL;
  if (lu > BLOCK || lv > BLOCK) return null;
  return { i, j, lu, lv, park: isPark(i, j) };
}
export const groundY = (x, z) => (blockAt(x, z) ? 0.2 : 0);

// True inside a building footprint (grown by margin m) or outside the city wall.
export function blocked(x, z, m = 0) {
  if (Math.abs(x) > HALF - 1 - m || Math.abs(z) > HALF - 1 - m) return true;
  const b = blockAt(x, z);
  if (!b || b.park) return false;
  const lo = INSET - m, hi = BLOCK - INSET + m;
  return b.lu > lo && b.lu < hi && b.lv > lo && b.lv < hi;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textTex(text, bg, fg, border) {
  return canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = border; c.fillRect(0, 0, w, h);
    c.fillStyle = bg; c.fillRect(8, 8, w - 16, h - 16);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 64px "Arial Rounded MT Bold", Arial, sans-serif';
    c.fillText(text, w / 2, h / 2 + 4, w - 40);
  });
}

const WALLS = [0x8b4a3a, 0xa0522d, 0xb5651d, 0x7a5c48, 0xc9a27c, 0x9c6b5a, 0x6e7f8a, 0xb23b3b, 0xd4b483, 0x93705a];
const DOORS = [0x1e8a48, 0xb01030, 0x2456b8, 0xffd21a, 0x5a3a1a];
const SHOPS = ["BLOOPER'S STORE", 'FIX-IT SHOP', 'LAUNDROMAT', 'COOKIES 24H', 'BIRDSEED & CO', 'RUBBER DUCK DEPOT', 'LETTER OF THE DAY', 'NUMBERS WHOLESALE'];

export function buildWorld(scene) {
  const boxes = [], circles = [];
  const dummy = new THREE.Object3D();

  // ---- ground, grass apron, perimeter wall ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), mat(0x3b3b42));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), mat(0x5a9a4a));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.05;
  scene.add(apron);
  for (const [x, z, w, d] of [[0, HALF + 1, HALF * 2 + 4, 2], [0, -HALF - 1, HALF * 2 + 4, 2], [HALF + 1, 0, 2, HALF * 2 + 4], [-HALF - 1, 0, 2, HALF * 2 + 4]]) {
    const wall = part(scene, 'box', 0xa0522d, [w, 5, d], [x, 2.5, z]);
    wall.receiveShadow = true;
    part(scene, 'box', 0xd8d0c0, [w + 0.4, 0.4, d + 0.4], [x, 5.2, z]);
  }

  // ---- road paint (instanced) ----
  const lines = Array.from({ length: N + 1 }, (_, i) => roadLine(i));
  const dashM = [], walkM = [];
  for (const L of lines) {
    for (let t = -HALF + 3; t < HALF; t += 7) {
      if (lines.some(o => Math.abs(o - t) < ROAD / 2 + 4)) continue;
      for (const along of [0, 1]) {
        dummy.position.set(along ? t : L, 0.02, along ? L : t);
        dummy.rotation.set(-Math.PI / 2, 0, along ? Math.PI / 2 : 0);
        dummy.updateMatrix(); dashM.push(dummy.matrix.clone());
      }
    }
  }
  for (const X of lines) for (const Z of lines) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = X + dx * (ROAD / 2 + 2.2), cz = Z + dz * (ROAD / 2 + 2.2);
      if (Math.abs(cx) > HALF - 2 || Math.abs(cz) > HALF - 2) continue;
      for (let k = -2; k <= 2; k++) {
        dummy.position.set(cx + (dz ? k * 2.8 : 0), 0.02, cz + (dx ? k * 2.8 : 0));
        dummy.rotation.set(-Math.PI / 2, 0, dx ? Math.PI / 2 : 0);
        dummy.updateMatrix(); walkM.push(dummy.matrix.clone());
      }
    }
  }
  const instanced = (geo, color, mats) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), mats.length);
    mats.forEach((mm, i) => m.setMatrixAt(i, mm));
    scene.add(m);
  };
  instanced(new THREE.PlaneGeometry(0.35, 3.2), 0xf2d94a, dashM);
  instanced(new THREE.PlaneGeometry(1.3, 3.4), 0xe8e8e8, walkM);

  // ---- buildings ----
  const winTex = canvasTex(128, 128, (c) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(0,0,0,.08)';
    for (let y = 0; y < 128; y += 8) c.fillRect(0, y, 128, 1);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const x = 14 + i * 64, y = 12 + j * 64;
      c.fillStyle = '#e8e0d0'; c.fillRect(x - 4, y - 4, 44, 48);
      c.fillStyle = (i + j) % 2 ? '#2a3a55' : '#3a4a66'; c.fillRect(x, y, 36, 40);
      c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(x, y, 36, 6);
      c.fillStyle = '#e8e0d0'; c.fillRect(x + 16, y, 3, 40);
    }
  });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const roofMat = mat(0x3a3530);
  const sideMats = new Map();
  const sideMat = color => {
    if (!sideMats.has(color)) sideMats.set(color, new THREE.MeshLambertMaterial({ color, map: winTex }));
    return sideMats.get(color);
  };
  const signMats = SHOPS.map(s => new THREE.MeshLambertMaterial({ map: textTex(s, '#fff8e0', '#b01030', '#1e8a48') }));

  function addBuilding(cx, cz, x, z, w, d, h, color) {
    const geo = new THREE.BoxGeometry(w - 0.3, h, d - 0.3);
    const uv = geo.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const su = (f < 2 ? d : w) / 7, sv = h / 7;
      for (let k = 0; k < 4; k++) uv.setXY(f * 4 + k, uv.getX(f * 4 + k) * su, uv.getY(f * 4 + k) * sv);
    }
    const side = sideMat(color);
    const m = new THREE.Mesh(geo, [side, side, roofMat, roofMat, side, side]);
    m.position.set(x, h / 2 + 0.2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    part(scene, 'box', 0xe8e0d0, [w + 0.3, 0.5, d + 0.3], [x, h + 0.2, z]);

    // Doors, awnings and the odd shop sign on faces that meet the street.
    const F = BLOCK / 2 - INSET;
    const faces = [];
    if (z + d / 2 > cz + F - 0.5) faces.push([x, z + d / 2, 0, 1, w]);
    if (z - d / 2 < cz - F + 0.5) faces.push([x, z - d / 2, 0, -1, w]);
    if (x + w / 2 > cx + F - 0.5) faces.push([x + w / 2, z, 1, 0, d]);
    if (x - w / 2 < cx - F + 0.5) faces.push([x - w / 2, z, -1, 0, d]);
    for (const [fx, fz, nx, nz, len] of faces) {
      const ry = nx ? Math.PI / 2 : 0;
      part(scene, 'box', pick(DOORS), [1.7, 2.8, 0.25], [fx, 1.6, fz], [0, ry, 0]);
      if (len > 12 && Math.random() < 0.6) {
        part(scene, 'box', pick([0xb01030, 0x1e8a48, 0x2456b8, 0xffd21a]), [Math.min(len - 4, 9), 0.25, 2.2], [fx + nx * 1, 3.5, fz + nz * 1], [nx ? 0 : nz * 0.25, ry, nx ? -nx * 0.25 : 0]);
        part(scene, 'box', pick(signMats), [6.5, 1.5, 0.2], [fx + nx * 0.15, 5.2, fz + nz * 0.15], [0, ry, 0]).castShadow = false;
      }
    }
  }

  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const cx = blockCenter(i), cz = blockCenter(j);
    if (isPark(i, j)) {
      const lawn = part(scene, 'box', 0x4fae4a, [BLOCK, 0.2, BLOCK], [cx, 0.1, cz]);
      lawn.castShadow = false; lawn.receiveShadow = true;
      const centre = i === 3 && j === 3;
      for (let k = 0; k < 9; k++) {
        const tx = cx + rand(-19, 19), tz = cz + rand(-19, 19);
        if (centre && Math.hypot(tx - cx, tz - cz) < 9) continue;
        const h = rand(2.5, 4);
        part(scene, 'cyl', 0x6b4a2a, [0.35, h, 0.35], [tx, h / 2, tz]);
        const s = rand(1.8, 2.8);
        part(scene, 'sphere', pick([0x2e8b3a, 0x3fa34a, 0x2a7a3a]), [s, s, s], [tx, h + s * 0.6, tz]);
        part(scene, 'sphere', 0x3fa34a, [s * 0.7, s * 0.7, s * 0.7], [tx + s * 0.5, h + s * 1.1, tz + s * 0.3]);
        circles.push({ x: tx, z: tz, r: 0.6 });
      }
      if (centre) { // the neighbourhood's pride: a giant rubber duck
        part(scene, 'cyl', 0xd8d0c0, [4, 1.6, 4], [cx, 0.8, cz]).receiveShadow = true;
        part(scene, 'sphere', 0xffe14a, [3, 2.4, 3.8], [cx, 3.8, cz]);
        part(scene, 'sphere', 0xffe14a, [1.9, 1.9, 1.9], [cx, 6.6, cz + 2]);
        part(scene, 'cone', 0xff8c1a, [0.8, 1.6, 0.4], [cx, 6.4, cz + 4.1], [Math.PI / 2, 0, 0]);
        part(scene, 'cone', 0xffe14a, [1.2, 2, 0.6], [cx, 5, cz - 3.6], [-0.9, 0, 0]);
        for (const s of [-1, 1]) part(scene, 'sphere', 0x111111, [0.25, 0.3, 0.25], [cx + s * 0.9, 7.2, cz + 3.5]);
        circles.push({ x: cx, z: cz, r: 4.2 });
      }
      continue;
    }
    const walk = part(scene, 'box', 0xb8b8b0, [BLOCK, 0.2, BLOCK], [cx, 0.1, cz]);
    walk.castShadow = false; walk.receiveShadow = true;
    const F = BLOCK - INSET * 2, r = Math.random(), col = () => pick(WALLS);
    const hgt = () => rand(9, 32);
    if (r < 0.2) addBuilding(cx, cz, cx, cz, F, F, rand(16, 42), col());
    else if (r < 0.55) {
      const a = F * rand(0.4, 0.6);
      addBuilding(cx, cz, cx - F / 2 + a / 2, cz, a, F, hgt(), col());
      addBuilding(cx, cz, cx + a / 2, cz, F - a, F, hgt(), col());
    } else if (r < 0.85) {
      const a = F * rand(0.4, 0.6);
      addBuilding(cx, cz, cx, cz - F / 2 + a / 2, F, a, hgt(), col());
      addBuilding(cx, cz, cx, cz + a / 2, F, F - a, hgt(), col());
    } else {
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        addBuilding(cx, cz, cx + sx * F / 4, cz + sz * F / 4, F / 2, F / 2, hgt(), col());
    }
    boxes.push({ minX: cx - F / 2, maxX: cx + F / 2, minZ: cz - F / 2, maxZ: cz + F / 2 });
  }

  // ---- clouds ----
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  for (let k = 0; k < 26; k++) {
    const x = rand(-500, 500), y = rand(110, 170), z = rand(-500, 500);
    for (let q = 0; q < 4; q++) {
      const s = rand(10, 20);
      const c = part(scene, 'sphere', cloudMat, [s * 1.5, s * 0.6, s], [x + q * 14 + rand(-4, 4), y + rand(-3, 3), z + rand(-8, 8)]);
      c.castShadow = false;
    }
  }

  // ---- knockable street furniture, rebuilt for every game ----
  const streetSign = new THREE.MeshLambertMaterial({ map: textTex('123 MAYHEM ST', '#1e8a48', '#ffffff', '#ffd21a') });
  function spawnProps(parent) {
    const props = [];
    const add = (kind, x, z, r, slow, build) => {
      const g = new THREE.Group();
      g.position.set(x, groundY(x, z), z);
      const extra = build(g) || {};
      parent.add(g);
      props.push({ kind, group: g, x, z, r, slow, alive: true, phase: rand(0, 6), ...extra });
    };
    const lamp = (x, z, sign) => add('lamp', x, z, 0.45, 0.85, g => {
      part(g, 'cyl', 0x2d5a3d, [0.14, 5.2, 0.14], [0, 2.6, 0]);
      part(g, 'cyl', 0x2d5a3d, [0.3, 0.4, 0.3], [0, 0.2, 0]);
      part(g, 'sphere', mat(0xfff2b0, 0x8a7a30), [0.4, 0.5, 0.4], [0, 5.5, 0]);
      if (sign) part(g, 'box', streetSign, [2.2, 0.55, 0.08], [1.1, 4.2, 0]).castShadow = false;
    });
    const can = (x, z, grouch) => add(grouch ? 'grouch' : 'can', x, z, 0.6, 0.95, g => {
      part(g, 'cyl', 0x9aa0a6, [0.48, 1.1, 0.48], [0, 0.55, 0]);
      for (const y of [0.3, 0.8]) part(g, 'cyl', 0x7a8086, [0.5, 0.06, 0.5], [0, y, 0]);
      const top = new THREE.Group();
      top.position.y = 1.12;
      part(top, 'cyl', 0x7a8086, [0.54, 0.08, 0.54], [0, grouch ? 0.42 : 0, 0], grouch ? [0.25, 0, 0] : undefined);
      if (grouch) { const h = makeHead('grouch'); h.scale.setScalar(0.85); top.add(h); }
      g.add(top);
      return { top };
    });
    const hydrant = (x, z) => add('hydrant', x, z, 0.4, 0.95, g => {
      part(g, 'cyl', 0xd92020, [0.22, 0.7, 0.22], [0, 0.35, 0]);
      part(g, 'sphere', 0xd92020, [0.24, 0.2, 0.24], [0, 0.72, 0]);
      part(g, 'cyl', 0xd92020, [0.1, 0.6, 0.1], [0, 0.45, 0], [0, 0, Math.PI / 2]);
    });
    const mailbox = (x, z) => add('mailbox', x, z, 0.5, 0.93, g => {
      part(g, 'box', 0x2456b8, [0.7, 1.0, 0.6], [0, 0.7, 0]);
      part(g, 'cyl', 0x2456b8, [0.3, 0.7, 0.35], [0, 1.2, 0], [0, 0, Math.PI / 2]);
    });
    const bench = (x, z) => add('bench', x, z, 1.0, 0.92, g => {
      part(g, 'box', 0x8b5a2b, [2.2, 0.12, 0.7], [0, 0.55, 0]);
      part(g, 'box', 0x8b5a2b, [2.2, 0.6, 0.1], [0, 0.95, -0.3]);
      for (const s of [-1, 1]) part(g, 'box', 0x333333, [0.1, 0.55, 0.6], [s * 0.9, 0.27, 0]);
    });

    const E = BLOCK / 2 - 1.6;
    const edge = (cx, cz) => {
      const t = rand(-15, 15), s = Math.random() < 0.5 ? -1 : 1;
      return Math.random() < 0.5 ? [cx + t, cz + s * E] : [cx + s * E, cz + t];
    };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const cx = blockCenter(i), cz = blockCenter(j), s = (i + j) % 2 ? 1 : -1;
      lamp(cx + E, cz + s * E, (i + j) % 3 === 0);
      lamp(cx - E, cz - s * E, false);
      if (isPark(i, j)) {
        bench(cx + rand(-12, 12), cz + E - 2);
        bench(cx + rand(-12, 12), cz - E + 2);
        can(cx + E - 3, cz + rand(-10, 10), true);
        continue;
      }
      can(...edge(cx, cz), Math.random() < 0.3);
      can(...edge(cx, cz), false);
      hydrant(...edge(cx, cz));
      if ((i + j) % 2) mailbox(...edge(cx, cz));
    }
    return props;
  }

  function randomRoadPoint() {
    const L = roadLine(Math.floor(Math.random() * (N + 1))) + rand(-5, 5), t = rand(-HALF + 10, HALF - 10);
    return Math.random() < 0.5 ? { x: L, z: t } : { x: t, z: L };
  }
  function randomPedPoint() {
    for (let k = 0; k < 300; k++) {
      const x = rand(-HALF + 3, HALF - 3), z = rand(-HALF + 3, HALF - 3);
      if (blocked(x, z, 1.2)) continue;
      if (!blockAt(x, z) && Math.random() > 0.3) continue;
      return { x, z };
    }
    return { x: roadLine(0), z: 0 };
  }

  return { boxes, circles, spawnProps, randomRoadPoint, randomPedPoint };
}
