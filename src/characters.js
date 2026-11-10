import * as THREE from 'three';

// Everything is built from a handful of unit primitives, scaled per part.
const G = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cone: new THREE.ConeGeometry(1, 1, 10),
  wheel: new THREE.CylinderGeometry(1, 1, 1, 16).rotateZ(Math.PI / 2),
  torus: new THREE.TorusGeometry(1, 0.18, 6, 14),
};

const mats = new Map();
export function mat(color, emissive = 0) {
  const k = color + ':' + emissive;
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color, emissive }));
  return mats.get(k);
}

export function part(parent, geo, color, s, p, r) {
  const m = new THREE.Mesh(G[geo], color.isMaterial ? color : mat(color));
  m.scale.set(s[0], s[1], s[2]);
  m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// The drivers. Stats are multipliers around 1.
export const CAST = {
  cookie: {
    name: 'Cookie Fiend', car: 'The Crumbler', head: 'cookie', color: 0x2b6fd6, carColor: 0x2456b8, trim: 0xc68a3c,
    stats: { accel: 1, top: 1, mass: 1.25, grip: 1 }, aggro: 0.6,
    taunts: ['ME WANT BUMPER!', 'OM NOM NOM NOM!', 'C IS FOR COLLISION!'],
  },
  red: {
    name: 'Ticklish Red', car: 'Tickle Rocket', head: 'red', color: 0xe02020, carColor: 0xd91e1e, trim: 0xff8c1a,
    stats: { accel: 1.25, top: 1.05, mass: 0.8, grip: 1.1 }, aggro: 0.45,
    taunts: ['Ha ha ha! That tickles!', 'Red LOVES you! (to pieces)', 'Hee hee hee!'],
  },
  bird: {
    name: 'Large Bird', car: 'Big Yellow Taxi', head: 'bird', color: 0xffd91a, carColor: 0xf2c200, trim: 0xff8fb0,
    stats: { accel: 0.9, top: 1.1, mass: 1.1, grip: 0.9 }, aggro: 0.35,
    taunts: ['Oh dear! Was that your fender?', 'Everybody makes mistakes!', 'Golly!'],
  },
  grouch: {
    name: 'Trash Grouch', car: 'Garbage Scow', head: 'grouch', color: 0x4c8c2b, carColor: 0x55683a, trim: 0x9aa0a6,
    stats: { accel: 0.8, top: 0.92, mass: 1.7, grip: 0.9 }, aggro: 0.85,
    taunts: ['SCRAM!', 'Now THAT is a lovely wreck.', 'Have a rotten day!'],
  },
  count: {
    name: 'The Counter', car: 'Count-ach', head: 'count', color: 0x8a5bc4, carColor: 0x3a2060, trim: 0xffd700,
    stats: { accel: 1.1, top: 1.15, mass: 0.9, grip: 1.2 }, aggro: 0.6,
    taunts: ['ONE! One dented door! Ah ah ah!', 'TWO! Two broken headlights!', 'I LOVE to count crashes!'],
  },
  duo: {
    name: 'Burt & Ernst', car: 'Ducky Roadster', head: 'duo', color: 0xff9a1a, carColor: 0x2e9c5a, trim: 0xffe14a,
    stats: { accel: 1, top: 1, mass: 1, grip: 1.3 }, aggro: 0.5,
    taunts: ['Ernst, you are driving on the sidewalk!', 'Hey Burt! Watch this! Khhhehehe!', 'My pigeons could drive better.'],
  },
};
export const DRIVER_TYPES = Object.keys(CAST);
export const PED_TYPES = ['cookie', 'red', 'bird', 'count', 'bert', 'ernie', 'monster', 'monster', 'monster'];
const MONSTER_COLORS = [0xa25ad6, 0x1fb5a8, 0xff6fb5, 0xff8c1a, 0x8fd62b, 0x3aa0ff];

function eyes(parent, y, z, gap, size) {
  for (const s of [-1, 1]) {
    const e = part(parent, 'sphere', 0xffffff, [size, size, size], [s * gap, y, z]);
    const a = Math.random() * 6.28;
    // Pupils sit off-centre at a random angle: googly.
    part(e, 'sphere', 0x111111, [0.4, 0.4, 0.22], [Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0.85]).castShadow = false;
  }
}

// Head centred on the origin, facing +z.
export function makeHead(type, color) {
  const g = new THREE.Group();
  const up = [Math.PI, 0, 0];
  switch (type) {
    case 'cookie':
      part(g, 'sphere', 0x2b6fd6, [0.55, 0.5, 0.5], [0, 0, 0]);
      part(g, 'sphere', 0x1a0a0a, [0.4, 0.14, 0.25], [0, -0.12, 0.33]);
      eyes(g, 0.48, 0.18, 0.2, 0.19);
      break;
    case 'red':
      part(g, 'sphere', 0xe02020, [0.42, 0.48, 0.42], [0, 0, 0]);
      part(g, 'sphere', 0xff8c1a, [0.13, 0.16, 0.13], [0, 0.1, 0.42]);
      part(g, 'sphere', 0x1a0a0a, [0.3, 0.1, 0.2], [0, -0.17, 0.28]);
      eyes(g, 0.5, 0.15, 0.15, 0.15);
      break;
    case 'bird':
      part(g, 'sphere', 0xffd91a, [0.42, 0.42, 0.42], [0, 0, 0]);
      part(g, 'cone', 0xffa51a, [0.2, 0.65, 0.16], [0, -0.05, 0.6], [Math.PI / 2, 0, 0]);
      eyes(g, 0.18, 0.32, 0.2, 0.13);
      for (const [x, r] of [[-0.12, 0.4], [0, 0], [0.12, -0.4]])
        part(g, 'cone', 0xffd91a, [0.07, 0.35, 0.07], [x, 0.5, 0], [0, 0, r]);
      break;
    case 'grouch':
      part(g, 'sphere', 0x4c8c2b, [0.52, 0.46, 0.48], [0, 0, 0]);
      part(g, 'box', 0x4a2c10, [0.7, 0.12, 0.15], [0, 0.33, 0.36]);
      part(g, 'sphere', 0x1a0a0a, [0.42, 0.12, 0.2], [0, -0.15, 0.34]);
      eyes(g, 0.2, 0.38, 0.2, 0.13);
      break;
    case 'count':
      part(g, 'sphere', 0xb9a3e3, [0.42, 0.48, 0.42], [0, 0, 0]);
      part(g, 'sphere', 0x111111, [0.45, 0.42, 0.45], [0, 0.14, -0.1]);
      part(g, 'cone', 0x111111, [0.12, 0.25, 0.05], [0, 0.3, 0.38], up);
      part(g, 'sphere', 0x8a5bc4, [0.09, 0.14, 0.12], [0, 0, 0.42]);
      part(g, 'torus', 0xffd700, [0.13, 0.13, 0.13], [0.17, 0.12, 0.45]);
      for (const s of [-1, 1]) part(g, 'cone', 0xffffff, [0.035, 0.1, 0.035], [s * 0.08, -0.24, 0.36], up);
      eyes(g, 0.12, 0.36, 0.17, 0.1);
      break;
    case 'bert':
      part(g, 'sphere', 0xffd21a, [0.36, 0.6, 0.36], [0, 0, 0]);
      part(g, 'cone', 0x111111, [0.12, 0.28, 0.12], [0, 0.68, 0]);
      part(g, 'box', 0x111111, [0.5, 0.07, 0.1], [0, 0.32, 0.28]);
      part(g, 'sphere', 0xff8c1a, [0.09, 0.13, 0.12], [0, 0.02, 0.36]);
      part(g, 'box', 0x551111, [0.2, 0.03, 0.05], [0, -0.22, 0.32]);
      eyes(g, 0.2, 0.3, 0.13, 0.1);
      break;
    case 'ernie':
      part(g, 'sphere', 0xff9a1a, [0.56, 0.42, 0.45], [0, 0, 0]);
      part(g, 'sphere', 0x111111, [0.4, 0.15, 0.35], [0, 0.36, -0.02]);
      part(g, 'sphere', 0xe02020, [0.11, 0.11, 0.11], [0, -0.02, 0.45]);
      part(g, 'sphere', 0x551111, [0.3, 0.07, 0.1], [0, -0.2, 0.36]);
      eyes(g, 0.12, 0.38, 0.16, 0.1);
      break;
    case 'duo': {
      const b = makeHead('bert'), e = makeHead('ernie');
      b.position.set(-0.45, 0.1, 0); e.position.set(0.45, -0.05, 0);
      b.scale.setScalar(0.8); e.scale.setScalar(0.8);
      g.add(b, e);
      break;
    }
    default: // generic neighbourhood monster
      part(g, 'sphere', color, [0.5, 0.5, 0.5], [0, 0, 0]);
      part(g, 'sphere', 0x1a0a0a, [0.34, 0.12, 0.2], [0, -0.15, 0.36]);
      for (const s of [-1, 1]) part(g, 'cone', 0xfff2c0, [0.08, 0.25, 0.08], [s * 0.3, 0.5, 0], [0, 0, -s * 0.4]);
      eyes(g, 0.42, 0.25, 0.17, 0.16);
  }
  return g;
}

// Pedestrian with origin at the feet, facing +z.
export function makePed(type) {
  const g = new THREE.Group();
  const p = {};
  let height = 2.2, radius = 0.65, color = CAST[type]?.color ?? 0xffffff, value = 100;

  const arms = (y, x, col, len = 0.55) => {
    for (const s of [-1, 1]) {
      const pv = new THREE.Group();
      pv.position.set(s * x, y, 0);
      pv.rotation.z = s * 0.35;
      part(pv, 'cyl', col, [0.11, len, 0.11], [0, -len / 2, 0]);
      part(pv, 'sphere', col, [0.15, 0.15, 0.15], [0, -len, 0]);
      g.add(pv);
      p[s < 0 ? 'armL' : 'armR'] = pv;
    }
  };
  const legs = (col, len, gap = 0.2, w = 0.13) => {
    for (const s of [-1, 1]) {
      part(g, 'cyl', col, [w, len, w], [s * gap, len / 2, 0]);
      part(g, 'sphere', col, [w * 1.6, 0.08, w * 2.4], [s * gap, 0.06, 0.1]);
    }
  };
  const head = (t, y, c) => { const h = makeHead(t, c); h.position.y = y; g.add(h); p.head = h; };

  switch (type) {
    case 'cookie':
      legs(color, 0.5);
      part(g, 'sphere', color, [0.55, 0.6, 0.48], [0, 1.0, 0]);
      arms(1.3, 0.5, color);
      part(p.armR, 'cyl', 0xc68a3c, [0.2, 0.05, 0.2], [0, -0.62, 0.15], [Math.PI / 2, 0, 0]);
      head('cookie', 1.85);
      break;
    case 'red':
      legs(color, 0.4, 0.15, 0.1);
      part(g, 'sphere', color, [0.38, 0.5, 0.36], [0, 0.85, 0]);
      arms(1.1, 0.35, color, 0.45);
      head('red', 1.6);
      height = 1.9; radius = 0.55;
      break;
    case 'bird':
      legs(0xffa51a, 1.3, 0.22, 0.07);
      part(g, 'sphere', color, [0.65, 0.9, 0.65], [0, 2.0, 0]);
      part(g, 'cone', color, [0.35, 0.9, 0.2], [0, 1.7, -0.7], [-1.9, 0, 0]);
      part(g, 'cyl', color, [0.2, 0.6, 0.2], [0, 3.0, 0]);
      arms(2.4, 0.62, color, 0.8);
      head('bird', 3.5);
      height = 4; radius = 0.8; value = 250;
      break;
    case 'count':
      color = 0x8a5bc4;
      part(g, 'cone', 0x151515, [0.6, 1.5, 0.6], [0, 0.75, 0]);
      part(g, 'cone', 0xb01030, [0.3, 0.3, 0.3], [0, 1.4, 0], [Math.PI, 0, 0]);
      arms(1.2, 0.35, 0x151515);
      head('count', 1.8);
      value = 150;
      break;
    case 'bert':
      color = 0xffd21a;
      legs(0x6b7a2a, 0.7, 0.14);
      for (let i = 0; i < 4; i++) part(g, 'cyl', i % 2 ? 0xf5f0d0 : 0x2e8b57, [0.3, 0.2, 0.3], [0, 0.8 + i * 0.2, 0]);
      arms(1.45, 0.36, 0x2e8b57);
      head('bert', 2.1);
      height = 2.8;
      break;
    case 'ernie':
      color = 0xff9a1a;
      legs(0x2a4a9a, 0.5);
      for (let i = 0; i < 4; i++) part(g, 'cyl', i % 2 ? 0x2a6ae0 : 0xe02020, [0.4, 0.19, 0.38], [0, 0.6 + i * 0.19, 0]);
      arms(1.2, 0.46, 0xe02020);
      head('ernie', 1.7);
      break;
    default:
      color = MONSTER_COLORS[Math.floor(Math.random() * MONSTER_COLORS.length)];
      legs(color, 0.45);
      part(g, 'sphere', color, [0.5, 0.6, 0.45], [0, 0.95, 0]);
      arms(1.25, 0.46, color);
      head('monster', 1.75, color);
      g.scale.setScalar(0.8 + Math.random() * 0.45);
  }
  return { group: g, parts: p, height, radius, color, value };
}

// The big slow shaggy one. Only goes splat if you are properly speeding.
export function makeSnuffle() {
  const g = new THREE.Group();
  const c = 0x8b5a2b;
  part(g, 'sphere', c, [1.5, 1.3, 2.3], [0, 1.5, 0]);
  part(g, 'sphere', c, [1.0, 0.95, 1.0], [0, 2.1, 2.0]);
  for (let i = 0; i < 6; i++) {
    const s = 0.42 - i * 0.045;
    part(g, 'sphere', c, [s, s, s], [0, 1.75 - i * 0.28, 2.85 + Math.sin(i * 0.6) * 0.45]);
  }
  part(g, 'cone', c, [0.2, 1.2, 0.2], [0, 1.4, -2.4], [-2.2, 0, 0]);
  eyes(g, 2.65, 2.72, 0.45, 0.22);
  return { group: g, parts: {}, height: 3, radius: 2.3, color: c, value: 1000 };
}

// Car with origin on the ground at its centre, nose toward +z.
export function makeCar(type) {
  const c = CAST[type];
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const col = c.carColor, trim = c.trim;

  part(body, 'box', col, [2.1, 0.7, 4.3], [0, 0.78, 0]);
  part(body, 'box', col, [1.9, 0.25, 3.9], [0, 1.22, 0]);
  part(body, 'box', 0x223344, [1.75, 0.6, 1.9], [0, 1.6, -0.3]);
  part(body, 'box', col, [1.82, 0.1, 1.7], [0, 1.93, -0.3]);
  part(body, 'box', trim, [2.25, 0.25, 0.3], [0, 0.5, 2.2]);
  part(body, 'box', trim, [2.25, 0.25, 0.3], [0, 0.5, -2.2]);
  for (const s of [-1, 1]) {
    part(body, 'sphere', mat(0xfff7b0, 0x9a8a30), [0.2, 0.2, 0.1], [s * 0.7, 0.9, 2.15]);
    part(body, 'box', mat(0xcc1111, 0x550000), [0.4, 0.2, 0.06], [s * 0.7, 0.9, -2.16]);
  }

  const head = makeHead(c.head);
  head.scale.setScalar(1.15);
  head.position.set(0, 2.5, -0.3);
  head.traverse(o => { o.userData.keep = true; });
  body.add(head);

  switch (type) {
    case 'cookie': { // giant cookie spare on the boot, crumbs on the hood
      const ck = part(body, 'cyl', 0xc68a3c, [0.8, 0.2, 0.8], [0, 1.25, -2.28], [Math.PI / 2, 0, 0]);
      for (const [x, z] of [[0.3, 0.3], [-0.4, 0.1], [0.1, -0.5], [-0.2, -0.3]])
        part(ck, 'sphere', 0x4a2c10, [0.14, 0.6, 0.14], [x, 0.3, z]);
      break;
    }
    case 'red': // a nose for a grille
      part(body, 'sphere', 0xff8c1a, [0.35, 0.3, 0.3], [0, 0.95, 2.2]);
      part(body, 'box', 0xff8c1a, [0.3, 0.05, 4.31], [0, 1.14, 0]);
      break;
    case 'bird': // tail feathers and a taxi light
      for (const [x, r] of [[-0.5, 0.35], [0, 0], [0.5, -0.35]])
        part(body, 'cone', 0xffd91a, [0.25, 1.3, 0.1], [x, 1.7, -2.1], [-0.5, 0, r]);
      part(body, 'box', mat(0xffffff, 0x666655), [0.7, 0.22, 0.3], [0, 2.05, 0.35]);
      break;
    case 'grouch': // carries its own bin
      part(body, 'cyl', 0x9aa0a6, [0.55, 1.1, 0.55], [0, 1.9, -1.55]);
      part(body, 'cyl', 0x7a8086, [0.62, 0.08, 0.62], [0, 2.48, -1.55], [0.3, 0, 0]);
      part(body, 'box', 0x3d4a2a, [2.14, 0.3, 1.2], [0, 0.6, 1.0]);
      break;
    case 'count': // bat fins
      for (const s of [-1, 1])
        part(body, 'cone', 0x111111, [0.08, 1.2, 0.7], [s * 0.95, 1.7, -1.7], [-0.4, 0, 0]);
      part(body, 'box', 0xffd700, [0.12, 0.05, 4.31], [0, 1.14, 0]);
      break;
    case 'duo': { // rubber ducky hood ornament and sweater stripes
      part(body, 'sphere', 0xffe14a, [0.28, 0.22, 0.34], [0, 1.5, 1.5]);
      part(body, 'sphere', 0xffe14a, [0.18, 0.18, 0.18], [0, 1.8, 1.68]);
      part(body, 'cone', 0xff8c1a, [0.08, 0.2, 0.05], [0, 1.78, 1.9], [Math.PI / 2, 0, 0]);
      for (const z of [-1.2, -0.4, 0.4, 1.2]) part(body, 'box', 0xe02020, [2.12, 0.5, 0.3], [0, 0.8, z]);
      break;
    }
  }

  const wheels = [], pivots = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pv = new THREE.Group();
    pv.position.set(sx * 1.1, 0.5, sz * 1.4);
    g.add(pv);
    const w = part(pv, 'wheel', 0x1a1a1a, [0.4, 0.5, 0.5], [0, 0, 0]);
    part(w, 'wheel', trim, [1.08, 0.55, 0.55], [0, 0, 0]);
    part(w, 'box', 0x1a1a1a, [1.12, 0.2, 1.0], [0, 0, 0]);
    wheels.push(w);
    if (sz > 0) pivots.push(pv);
  }
  return { group: g, body, wheels, pivots, head };
}
