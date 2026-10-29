import * as THREE from 'three';
import { fogChunk, toColors, type World, type WorldContext } from './shared';

/*
 * Looking down on a dense forest canopy, after an aerial photo. Each crown is a
 * cloud of irregular leaf clumps (point sprites), lit as a rounded volume, with
 * cloud shadows drifting across. A flock of egrets — drawn sprites with
 * flapping frames — circles overhead and scatters from the pointer.
 */

const L = 74; // canopy depth (wraps while scrolling)
const NEAR = 12; // canopy spans z in [NEAR - L, NEAR]
const HALF_W = 40;
const BIRD_Y = 10.5;

const DAY = {
  deep: '#051a0a',
  mid: '#2b6a1f',
  bright: '#a3dc55',
  fog: '#0b2410',
  floor: '#020a04',
  bird: '#ffffff',
};
const NIGHT = {
  deep: '#020c0b',
  mid: '#12372f',
  bright: '#6aa59c', // moonlight
  fog: '#05110f',
  floor: '#010605',
  bird: '#8a9ba0',
};

// rolling hills, with a long diagonal ridge like a forested mountainside
const hill = (x: number, z: number) =>
  3.2 * Math.sin(x * 0.035 - z * 0.045) +
  2.0 * Math.sin(x * 0.08 + z * 0.05) +
  1.2 * Math.cos(z * 0.11 - x * 0.04) +
  0.6 * Math.sin((x + z) * 0.2);

const rng = (a: number, b: number) => a + Math.random() * (b - a);

const noiseChunk = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
    return v;
  }
`;

// ---------- Egret ----------
const WRIST = 0.24; // distance from the body to the wrist joint
const HALF_SPAN = 0.6;

/**
 * A small egret in 3D: head along +z, wings along ±x. Each wing is a tapered
 * strip with a bend at the wrist; `aSpan` (0 at the body, 1 at the tip) lets
 * the shader fold the inner and outer wing separately as it flaps.
 */
function egretGeometry() {
  const pos: number[] = [];
  const col: number[] = [];
  const span: number[] = [];
  const WHITE = [1, 1, 1];
  const tri = (a: number[], b: number[], c: number[], color = WHITE, spans = [0, 0, 0]) => {
    pos.push(...a, ...b, ...c);
    col.push(...color, ...color, ...color);
    span.push(...spans);
  };

  // wings: leading edge pushes forward to the wrist, then sweeps back to a
  // rounded tip; the chord narrows from the body outward
  const steps = 8;
  // (broad, rounded egret wings rather than a swift's narrow blades)
  const lead = (t: number) => (t < 0.4 ? 0.05 + 0.07 * (t / 0.4) : 0.12 - 0.2 * ((t - 0.4) / 0.6) ** 1.6);
  const chord = (t: number) => 0.25 * (1 - t ** 2.6) + 0.06;
  for (const s of [-1, 1]) {
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const a = [s * t0 * HALF_SPAN, 0, lead(t0)];
      const b = [s * t1 * HALF_SPAN, 0, lead(t1)];
      const c = [s * t1 * HALF_SPAN, 0, lead(t1) - chord(t1)];
      const d = [s * t0 * HALF_SPAN, 0, lead(t0) - chord(t0)];
      tri(a, b, c, WHITE, [t0, t1, t1]);
      tri(a, c, d, WHITE, [t0, t1, t0]);
    }
  }

  // body: a slim spindle, with the neck folded into an S and a yellow bill
  const nose = [0, 0.02, 0.16];
  const tail = [0, 0, -0.24];
  const l = [-0.045, 0, 0];
  const r = [0.045, 0, 0];
  const top = [0, 0.045, 0];
  const bot = [0, -0.04, 0];
  for (const [a, b] of [[l, top], [top, r], [r, bot], [bot, l]]) {
    tri(nose, a, b);
    tri(tail, b, a);
  }
  tri([-0.02, 0.03, 0.12], [0.02, 0.03, 0.12], [0, 0.07, 0.2]); // neck
  tri([-0.022, 0.06, 0.19], [0.022, 0.06, 0.19], [0, 0.065, 0.26]); // head
  tri([-0.008, 0.06, 0.25], [0.008, 0.06, 0.25], [0, 0.055, 0.38], [0.89, 0.69, 0.17]); // bill
  for (const s of [-1, 1]) {
    // long dark legs trailing behind
    tri([s * 0.015, -0.02, -0.16], [s * 0.028, -0.02, -0.16], [s * 0.022, -0.03, -0.46], [0.18, 0.18, 0.16]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
  return geo;
}

export function buildCanopyWorld({ scene, shared, small }: WorldContext): World {
  // ---------- Crowns as clouds of leaf clumps ----------
  const spacing = small ? 2.5 : 2.05;
  const density = small ? 11 : 17; // leaf clumps per unit² of crown
  const pos: number[] = [];
  const nrm: number[] = [];
  const data: number[] = []; // clump size, rand, tint, tree brightness
  const n = new THREE.Vector3();
  const crownN = new THREE.Vector3();
  for (let x = -HALF_W; x < HALF_W; x += spacing) {
    for (let z = NEAR - L; z < NEAR; z += spacing) {
      const cx = x + rng(-0.4, 0.4) * spacing;
      const cz = z + rng(-0.4, 0.4) * spacing;
      // mostly mid-sized crowns, a few big emergent trees towering over the rest
      const R = Math.random() < 0.08 ? rng(2.2, 2.7) : rng(1.0, 1.9);
      const cy = hill(cx, cz) + 1.6 + R * 0.45 + rng(0, 0.9);
      const tint = Math.random() < 0.4 ? 0 : 1 + Math.floor(Math.random() * 5);
      const shade = rng(0.78, 1.15);
      // a crown is a main dome plus a few lobes around it
      const lobes = [{ x: 0, y: 0, z: 0, r: R * 0.8 }];
      const lobeCount = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < lobeCount; k++) {
        const a = rng(0, Math.PI * 2);
        lobes.push({ x: Math.cos(a) * R * 0.5, y: rng(-0.35, 0.1) * R, z: Math.sin(a) * R * 0.5, r: R * rng(0.5, 0.7) });
      }
      const count = Math.round(density * R * R);
      for (let i = 0; i < count; i++) {
        const lobe = lobes[i % lobes.length];
        // a point on the upper part of the lobe's surface
        const u = rng(0, Math.PI * 2);
        const y = rng(-0.2, 1);
        const ring = Math.sqrt(1 - y * y);
        n.set(Math.cos(u) * ring, y, Math.sin(u) * ring);
        const d = lobe.r * rng(0.8, 1);
        const px = lobe.x + n.x * d;
        const py = lobe.y + n.y * d * 0.75;
        const pz = lobe.z + n.z * d;
        pos.push(cx + px, cy + py, cz + pz);
        // light by the whole crown's dome, so each tree reads as one rounded form
        crownN.set(px, py + R * 0.35, pz).normalize().lerp(n, 0.35).normalize();
        nrm.push(crownN.x, crownN.y, crownN.z);
        data.push(R * rng(0.42, 0.62), Math.random(), tint, shade);
      }
    }
  }
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  leafGeo.setAttribute('aNormal', new THREE.Float32BufferAttribute(nrm, 3));
  leafGeo.setAttribute('aData', new THREE.Float32BufferAttribute(data, 4));

  const canopyUniforms = {
    ...shared,
    uDeep: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uBright: { value: new THREE.Color() },
    uSun: { value: 1 },
    uSunDir: { value: new THREE.Vector3(0.45, 0.8, -0.4).normalize() },
    uViewportH: { value: innerHeight },
  };
  const leaves = new THREE.Points(
    leafGeo,
    new THREE.ShaderMaterial({
      uniforms: canopyUniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uScroll;
        uniform vec3 uMouse;
        uniform vec2 uMouseVel;
        uniform vec3 uDeep;
        uniform vec3 uMid;
        uniform vec3 uBright;
        uniform vec3 uSunDir;
        uniform float uSun;
        uniform float uViewportH;
        attribute vec3 aNormal;
        attribute vec4 aData; // size, rand, tint
        varying vec3 vColor;
        varying float vRand;
        varying float vDepth;
        varying float vRadius;
        varying float vSize;
        varying vec2 vProj;
        ${noiseChunk}
        void main() {
          vec3 p = position;
          p.z = mod(p.z + uScroll, ${L.toFixed(1)}) - ${(L - NEAR).toFixed(1)};

          // crowns sway in the wind and rustle where the pointer passes
          float up = aNormal.y * 0.5 + 0.5;
          float sway = noise(p.xz * 0.12 + uTime * 0.3) - 0.5;
          float fall = 1.0 - smoothstep(0.0, 4.5, length(p.xz - uMouse.xz));
          p.xz += (vec2(sway * 0.18, sway * 0.08) + uMouseVel * fall * 0.1) * up;

          // light the clump as part of a rounded crown
          float diff = clamp(dot(aNormal, uSunDir) * 0.8 + 0.2, 0.0, 1.0);
          vec2 ground = p.xz - vec2(0.0, uScroll);
          float cloud = fbm(ground * 0.026 + vec2(uTime * 0.012, uTime * 0.006));
          float sun = smoothstep(0.36, 0.56, cloud) * uSun;

          vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.75, diff));
          col = mix(col, uBright, diff * diff * sun);
          col *= mix(0.22, 1.0, smoothstep(-0.15, 0.9, aNormal.y)); // crown edges fall into deep shade
          int t = int(aData.z);
          col *= t == 1 ? vec3(1.18, 1.1, 0.7)    // yellow-green
               : t == 2 ? vec3(0.82, 1.0, 0.98)   // blue-green
               : t == 3 ? vec3(0.7, 0.78, 0.7)    // dark
               : t == 4 ? vec3(1.08, 1.16, 0.84)  // fresh lime
               : t == 5 ? vec3(0.98, 0.92, 0.72)  // olive
               : vec3(1.0);
          col *= aData.w;
          col *= 0.3 + 0.95 * sun + 0.3 * (1.0 - uSun); // deep shade under clouds, glowing in sun
          col *= 0.85 + aData.y * 0.3;
          vColor = col;
          vRand = aData.y;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDepth = -mv.z;
          vRadius = aData.x * 0.5;
          vProj = vec2(projectionMatrix[2][2], projectionMatrix[3][2]);
          gl_PointSize = aData.x * projectionMatrix[1][1] * uViewportH * 0.5 / vDepth;
          vSize = gl_PointSize;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${fogChunk}
        ${noiseChunk}
        varying vec3 vColor;
        varying float vRand;
        varying float vDepth;
        varying float vRadius;
        varying float vSize;
        varying vec2 vProj;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float r = length(uv);
          float a = atan(uv.y, uv.x);
          // an irregular clump of leaves: ragged outline, gaps near the edge
          float edge = 0.5 * (0.7 + 0.3 * noise(vec2(a * 1.6 + vRand * 40.0, vRand * 9.0)));
          float holes = noise(uv * 11.0 + vRand * 31.0);
          // (tiny, distant clumps skip the holes, which would only shimmer)
          if (r > edge || (vSize > 7.0 && r > edge * 0.6 && holes < 0.42)) discard;

          // Give each clump the depth of a little dome, so overlapping clumps
          // intersect in a stable way instead of flickering as they sway.
          float bulge = sqrt(max(0.0, 1.0 - 4.0 * r * r));
          float z = -(vDepth - bulge * vRadius);
          gl_FragDepth = ((vProj.x * z + vProj.y) / -z) * 0.5 + 0.5;
          // lit from the top-right of the screen, with fine leaf speckle
          float lit = 0.82 + 0.4 * dot(uv, vec2(0.7, -0.7));
          lit *= 0.72 + 0.5 * noise(uv * 16.0 + vRand * 13.0);
          lit *= mix(1.0, 0.7, smoothstep(0.2, 0.5, r / (edge * 2.0))); // darker toward the clump edge
          gl_FragColor = vec4(applyFog(vColor * lit, vDepth), 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  leaves.frustumCulled = false;
  scene.add(leaves);

  // the dark forest floor, glimpsed through gaps between crowns
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x020a04 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), floorMat);
  floor.position.y = -3.5;
  scene.add(floor);

  // ---------- Egrets ----------
  const birdCount = small ? 18 : 30;
  const birdGeo = egretGeometry();
  const flapAttr = new THREE.InstancedBufferAttribute(new Float32Array(birdCount), 1);
  flapAttr.setUsage(THREE.DynamicDrawUsage);
  birdGeo.setAttribute('aFlap', flapAttr);
  const birdUniforms = {
    ...shared,
    uBird: { value: new THREE.Color() },
    uSunDir: canopyUniforms.uSunDir,
  };
  const birdMesh = new THREE.InstancedMesh(
    birdGeo,
    new THREE.ShaderMaterial({
      uniforms: birdUniforms,
      side: THREE.DoubleSide,
      vertexColors: true,
      vertexShader: /* glsl */ `
        attribute float aSpan;
        attribute float aFlap; // wingbeat phase, radians
        varying vec3 vColor;
        varying vec3 vWorld;
        varying float vDepth;
        void main() {
          vec3 p = position;
          // Shoulder swings through a deep, slow stroke; the outer wing hinges
          // at the wrist and trails the inner wing, so the stroke ripples out.
          // At rest (gliding) the wings hold a shallow V.
          float shoulder = 0.12 + 0.55 * sin(aFlap);
          float hand = shoulder + 0.3 * sin(aFlap - 0.9);
          float d = abs(p.x);
          float side = sign(p.x);
          if (aSpan > 0.0 || d > 0.05) {
            float inner = min(d, ${WRIST.toFixed(2)});
            float outer = max(d - ${WRIST.toFixed(2)}, 0.0);
            p.x = side * (inner * cos(shoulder) + outer * cos(hand));
            p.y += inner * sin(shoulder) + outer * sin(hand);
          }
          p.y -= 0.025 * sin(aFlap); // the body bobs against each stroke

          vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          vColor = color;
          vec4 mv = viewMatrix * world;
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBird;
        uniform vec3 uFog;
        uniform vec3 uSunDir;
        varying vec3 vColor;
        varying vec3 vWorld;
        varying float vDepth;
        void main() {
          // flat shading from screen-space derivatives; undersides go soft grey
          vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
          float light = 0.62 + 0.38 * abs(dot(n, uSunDir));
          vec3 col = vColor * uBird * light;
          gl_FragColor = vec4(mix(col, uFog, smoothstep(30.0, 75.0, vDepth) * 0.8), 1.0);
          #include <colorspace_fragment>
        }`,
    }),
    birdCount,
  );
  birdMesh.frustumCulled = false;
  scene.add(birdMesh);

  const birds = Array.from({ length: birdCount }, () => ({
    p: new THREE.Vector3(rng(-24, 24), BIRD_Y + rng(-1.5, 1.5), rng(-24, 2)),
    v: new THREE.Vector3(rng(-1, 1), 0, rng(-1, 1)).setLength(1.5),
    flap: Math.random(), // wingbeat progress; level wings at whole and half beats
    seed: Math.random() * 10,
    yaw: 0,
    bank: 0,
  }));
  const dummy = new THREE.Object3D();
  const goal = new THREE.Vector3();
  const steer = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const center = new THREE.Vector3();
  const heading = new THREE.Vector3();
  const birdPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BIRD_Y);
  const euler = new THREE.Euler();
  const scare = new THREE.Vector3();
  let scared = false;
  let lastTime = 0;

  function flock(time: number) {
    const dt = Math.min(Math.max(time - lastTime, 0), 0.05);
    lastTime = time;
    // the flock wanders in slow loops, lingering on either side of the page
    goal.set(Math.sin(time * 0.05) * 17, BIRD_Y, -20 + Math.sin(time * 0.07 + 1.3) * 8);
    for (const b of birds) {
      steer.set(0, 0, 0);
      center.set(0, 0, 0);
      heading.set(0, 0, 0);
      let near = 0;
      for (const o of birds) {
        if (o === b) continue;
        const d = b.p.distanceTo(o.p);
        if (d < 4.5) {
          center.add(o.p);
          heading.add(o.v);
          near++;
          if (d < 1.8) steer.add(tmp.subVectors(b.p, o.p).setLength((1.8 - d) * 3)); // separation
        }
      }
      if (near) {
        steer.add(center.divideScalar(near).sub(b.p).multiplyScalar(0.15)); // loose cohesion
        steer.add(heading.divideScalar(near).sub(b.v).multiplyScalar(0.5)); // alignment
      }
      steer.add(tmp.subVectors(goal, b.p).setLength(0.35)); // wander with the flock
      if (scared) {
        const d = tmp.subVectors(b.p, scare).setY(0).length();
        if (d < 6) {
          steer.addScaledVector(tmp.normalize(), (6 - d) * 2.5); // scatter
          steer.y += (6 - d) * 0.6;
        }
      }
      steer.y += (BIRD_Y - b.p.y) * 0.5; // hold altitude
      b.v.addScaledVector(steer, dt * 0.6);
      // unhurried cruising; only a scare pushes them faster
      b.v.setLength(THREE.MathUtils.clamp(b.v.length(), 1.1, scared ? 3.6 : 2.0));
      b.p.addScaledVector(b.v, dt);

      // Slow, deep wingbeats. To glide, a bird finishes its beat and holds its
      // wings in a shallow V, then sails on for a while.
      const glide = Math.sin(time * 0.22 + b.seed) > -0.25 && !scared; // gliding ~60% of the time
      const level = b.flap % 1 < 0.03; // wings at the top of a calm glide pose
      if (!(glide && level)) b.flap += dt * (scared ? 0.9 : 0.5); // one slow beat every two seconds
    }
    birds.forEach((b, i) => {
      // face the heading, pitch with climbs and dives, and bank into turns
      const yaw = Math.atan2(b.v.x, b.v.z);
      let turn = yaw - b.yaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      b.yaw = yaw;
      if (dt > 0) b.bank += (THREE.MathUtils.clamp((-turn / dt) * 0.6, -0.5, 0.5) - b.bank) * Math.min(1, dt * 2);
      const pitch = -Math.atan2(b.v.y, Math.hypot(b.v.x, b.v.z)) * 0.6;
      euler.set(pitch, yaw, b.bank, 'YXZ');
      dummy.position.copy(b.p);
      dummy.quaternion.setFromEuler(euler);
      dummy.scale.setScalar(0.55); // tiny, as in the photo
      dummy.updateMatrix();
      birdMesh.setMatrixAt(i, dummy.matrix);
      flapAttr.setX(i, (b.flap % 1) * Math.PI * 2);
    });
    birdMesh.instanceMatrix.needsUpdate = true;
    flapAttr.needsUpdate = true;
  }

  // ---------- Palette ----------
  const day = toColors(DAY);
  const night = toColors(NIGHT);
  return {
    groundY: 4,
    surfaceAt: (x, z) => hill(x, z) + 4.2, // roughly the tops of the crowns
    wrap: { length: L, near: NEAR },
    applyPalette(t) {
      canopyUniforms.uDeep.value.lerpColors(day.deep, night.deep, t);
      canopyUniforms.uMid.value.lerpColors(day.mid, night.mid, t);
      canopyUniforms.uBright.value.lerpColors(day.bright, night.bright, t);
      canopyUniforms.uSun.value = 1 - 0.3 * t;
      birdUniforms.uBird.value.lerpColors(day.bird, night.bird, t);
      shared.uFog.value.lerpColors(day.fog, night.fog, t);
      floorMat.color.lerpColors(day.floor, night.floor, t);
    },
    update(time) {
      canopyUniforms.uViewportH.value = innerHeight * shared.uPixelRatio.value;
      flock(time);
    },
    pointer(ray) {
      scared = !!ray && !!ray.intersectPlane(birdPlane, scare);
    },
  };
}
