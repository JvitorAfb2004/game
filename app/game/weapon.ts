import type * as Three from 'three';

/** Original MR-17 carbine. All dimensions are metres, with the muzzle facing -Z. */
export function createWeapon(
  THREE: typeof import('three'),
  camera: Three.PerspectiveCamera,
) {
  const group = new THREE.Group();
  group.name = 'MR17 / viewmodel';
  const viewScale = 0.87;
  group.scale.setScalar(viewScale);
  const rig = new THREE.Group();
  group.add(rig);
  camera.add(group);

  const finish = (base: string, grain = 11) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d')!;
    c.fillStyle = base;
    c.fillRect(0, 0, 256, 256);
    let n = 921;
    for (let i = 0; i < 4200; i++) {
      n = (n * 1664525 + 1013904223) >>> 0;
      const x = n % 256,
        y = (n >>> 8) % 256;
      c.fillStyle = `rgba(${i % 3 ? '255,255,255' : '0,0,0'},${(n % grain) / 500})`;
      c.fillRect(x, y, 1 + (n % 17), 1);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  const materials = {
    body: new THREE.MeshStandardMaterial({
      map: finish('#465148'),
      color: 0xbfc9b0,
      metalness: 0.61,
      roughness: 0.48,
    }),
    steel: new THREE.MeshStandardMaterial({
      map: finish('#293237'),
      color: 0xc2cbd0,
      metalness: 0.81,
      roughness: 0.32,
    }),
    edge: new THREE.MeshStandardMaterial({
      color: 0x737d79,
      metalness: 0.78,
      roughness: 0.31,
    }),
    polymer: new THREE.MeshStandardMaterial({
      map: finish('#252e28', 19),
      color: 0xa7b19a,
      roughness: 0.91,
      metalness: 0.02,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: 0x141b1a,
      roughness: 0.94,
    }),
    shadow: new THREE.MeshStandardMaterial({
      color: 0x080c0c,
      roughness: 0.81,
    }),
    bolt: new THREE.MeshStandardMaterial({
      color: 0x798181,
      metalness: 0.9,
      roughness: 0.3,
    }),
    cloth: new THREE.MeshStandardMaterial({
      map: finish('#55574a', 24),
      color: 0xbbb29a,
      roughness: 1,
    }),
    glove: new THREE.MeshStandardMaterial({
      map: finish('#454c43', 20),
      color: 0x949580,
      roughness: 0.95,
    }),
    gloveDark: new THREE.MeshStandardMaterial({
      color: 0x252d27,
      roughness: 1,
    }),
    glovePanel: new THREE.MeshStandardMaterial({
      map: finish('#4b5548', 25),
      color: 0xb0b5a1,
      roughness: 0.91,
    }),
    cuff: new THREE.MeshStandardMaterial({
      map: finish('#59614f', 30),
      color: 0xaaa992,
      roughness: 1,
    }),
    thread: new THREE.MeshStandardMaterial({ color: 0x737966, roughness: 1 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xa88262, roughness: 1 }),
  };
  const mat = materials;
  // Fine woven relief and low-contrast dye variation break up the large sleeve
  // surface without turning it into a conspicuous camouflage print.
  for (const material of [mat.cloth, mat.cuff, mat.glove, mat.glovePanel]) {
    const canvas = material.map!.image as HTMLCanvasElement,
      ctx = canvas.getContext('2d')!;
    for (let i = 0; i < 256; i += 4) {
      ctx.fillStyle = 'rgba(190,194,160,.035)';
      ctx.fillRect(i, 0, 1, 256);
      ctx.fillStyle = 'rgba(10,20,10,.04)';
      ctx.fillRect(0, i, 256, 1);
    }
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.moveTo(-20, i * 24);
      ctx.bezierCurveTo(45, i * 24 - 24, 160, i * 24 + 30, 276, i * 24 - 7);
      ctx.strokeStyle = 'rgba(14,22,14,.04)';
      ctx.lineWidth = 7 + (i % 3);
      ctx.stroke();
    }
    material.map!.needsUpdate = true;
    material.bumpMap = material.map;
    material.bumpScale = 0.00038;
  }
  // A neutral photographic reflection dome is local to the asset. This preserves
  // legible steel even when a host scene supplies lighting but no environment map.
  const reflections = Array.from({ length: 6 }, (_, face) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!,
      gradient = ctx.createLinearGradient(0, 0, 0, 128);
    gradient.addColorStop(0, face === 2 ? '#dce4db' : '#acbbb3');
    gradient.addColorStop(0.52, '#727f77');
    gradient.addColorStop(1, face === 3 ? '#303933' : '#535e53');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(246,237,205,.24)';
    ctx.fillRect(12, 8, 14, 92);
    return canvas;
  });
  const environment = new THREE.CubeTexture(reflections);
  environment.colorSpace = THREE.SRGBColorSpace;
  environment.needsUpdate = true;
  for (const m of [mat.body, mat.steel, mat.edge, mat.bolt]) {
    m.envMap = environment;
    m.envMapIntensity = 0.9;
  }
  const boxes = new Map<string, Three.BufferGeometry>();
  function mesh(
    g: Three.BufferGeometry,
    m: Three.Material,
    x: number,
    y: number,
    z: number,
    parent: Three.Object3D = rig,
  ) {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = false;
    o.receiveShadow = false;
    // Viewmodel cannot intersect distant environment geometry or get clipped by nearby walls.
    o.frustumCulled = false;
    parent.add(o);
    return o;
  }
  function box(
    w: number,
    h: number,
    d: number,
    m: Three.Material,
    x: number,
    y: number,
    z: number,
    parent: Three.Object3D = rig,
  ) {
    const key = `${w},${h},${d}`;
    if (!boxes.has(key)) boxes.set(key, new THREE.BoxGeometry(w, h, d));
    return mesh(boxes.get(key)!, m, x, y, z, parent);
  }
  function bevel(
    w: number,
    h: number,
    d: number,
    b: number,
    m: Three.Material,
    x: number,
    y: number,
    z: number,
    parent: Three.Object3D = rig,
  ) {
    const s = new THREE.Shape(),
      hw = w / 2 - b,
      hh = h / 2 - b;
    s.moveTo(-hw, -hh);
    s.lineTo(hw, -hh);
    s.lineTo(hw, hh);
    s.lineTo(-hw, hh);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: d - 2 * b,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: b,
      bevelThickness: b,
    });
    g.translate(0, 0, -d / 2 + b);
    return mesh(g, m, x, y, z, parent);
  }
  function softbox(
    w: number,
    h: number,
    d: number,
    r: number,
    m: Three.Material,
    x: number,
    y: number,
    z: number,
    parent: Three.Object3D = rig,
  ) {
    const geometry = new THREE.BoxGeometry(w, h, d, 6, 6, 6),
      p = geometry.getAttribute('position'),
      n = geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      const point = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      const core = new THREE.Vector3(
        THREE.MathUtils.clamp(point.x, -w / 2 + r, w / 2 - r),
        THREE.MathUtils.clamp(point.y, -h / 2 + r, h / 2 - r),
        THREE.MathUtils.clamp(point.z, -d / 2 + r, d / 2 - r),
      );
      const normal = point.clone().sub(core).normalize();
      point.copy(core).addScaledVector(normal, r);
      p.setXYZ(i, point.x, point.y, point.z);
      n.setXYZ(i, normal.x, normal.y, normal.z);
    }
    return mesh(geometry, m, x, y, z, parent);
  }
  function seam(
    points: Three.Vector3[],
    parent: Three.Object3D,
    closed = false,
  ) {
    return mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points, closed),
        24,
        0.00065,
        4,
        closed,
      ),
      mat.thread,
      0,
      0,
      0,
      parent,
    );
  }
  function profile(
    points: number[][],
    width: number,
    m: Three.Material,
    parent: Three.Object3D = rig,
  ) {
    const s = new THREE.Shape();
    points.forEach(([z, y], i) => (i ? s.lineTo(-z, y) : s.moveTo(-z, y)));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: width - 0.004,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.002,
      bevelThickness: 0.002,
      steps: 1,
    });
    g.rotateY(Math.PI / 2);
    g.translate(-width / 2 + 0.002, 0, 0);
    return mesh(g, m, 0, 0, 0, parent);
  }
  function cyl(
    radius: number,
    length: number,
    m: Three.Material,
    x: number,
    y: number,
    z: number,
    axis: 'x' | 'y' | 'z' = 'z',
    parent: Three.Object3D = rig,
    segments = 12,
  ) {
    const o = mesh(
      new THREE.CylinderGeometry(radius, radius, length, segments),
      m,
      x,
      y,
      z,
      parent,
    );
    if (axis === 'z') o.rotation.x = Math.PI / 2;
    if (axis === 'x') o.rotation.z = Math.PI / 2;
    return o;
  }
  function capsule(
    a: Three.Vector3,
    b: Three.Vector3,
    r1: number,
    r2: number,
    m: Three.Material,
    parent: Three.Object3D = rig,
  ) {
    const v = b.clone().sub(a),
      g = new THREE.CylinderGeometry(
        r2,
        r1,
        v.length(),
        m === mat.cloth ? 18 : 14,
        m === mat.cloth ? 16 : 1,
      );
    if (m === mat.cloth) {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i),
          theta = Math.atan2(z, x);
        const bulge =
          1 +
          0.021 * Math.sin(y * 88 + theta * 2) +
          0.012 * Math.sin(y * 172 - theta * 3);
        p.setXYZ(i, x * bulge, y, z * bulge);
      }
      g.computeVertexNormals();
    }
    const o = mesh(
      g,
      m,
      ...(a.clone().add(b).multiplyScalar(0.5).toArray() as [
        number,
        number,
        number,
      ]),
      parent,
    );
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    mesh(new THREE.SphereGeometry(r1, 16, 10), m, a.x, a.y, a.z, parent);
    mesh(new THREE.SphereGeometry(r2, 16, 10), m, b.x, b.y, b.z, parent);
    return o;
  }
  function screw(
    x: number,
    y: number,
    z: number,
    r = 0.005,
    parent: Three.Object3D = rig,
  ) {
    cyl(r, 0.003, mat.bolt, x, y, z, 'x', parent, 8);
    box(
      0.0035,
      0.0016,
      r * 1.2,
      mat.shadow,
      x - (x < 0 ? 0.002 : -0.002),
      y,
      z,
      parent,
    );
  }
  function sideLabel(
    text: string,
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    color = '#c4c7b4',
    parent: Three.Object3D = rig,
  ) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.font = '600 45px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const o = mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: t,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
      x,
      y,
      z,
      parent,
    );
    o.rotation.y = -Math.PI / 2;
    return o;
  }

  // Monolithic upper, stepped lower and forged magazine well.
  profile(
    [
      [0.115, 0.035],
      [0.07, 0.067],
      [-0.24, 0.067],
      [-0.269, 0.04],
      [-0.27, -0.055],
      [-0.16, -0.068],
      [0.083, -0.06],
      [0.118, -0.025],
    ],
    0.092,
    mat.body,
  );
  bevel(0.085, 0.025, 0.348, 0.008, mat.body, 0, 0.057, -0.073);
  // Narrow exposed metal strips pick out the machined upper instead of making
  // the complete cover one bright rectangular slab.
  for (const side of [-1, 1])
    bevel(0.003, 0.005, 0.292, 0.001, mat.edge, side * 0.041, 0.066, -0.082);
  bevel(0.105, 0.047, 0.19, 0.005, mat.body, 0, -0.055, -0.138);
  profile(
    [
      [-0.08, -0.048],
      [-0.205, -0.049],
      [-0.214, -0.111],
      [-0.069, -0.105],
    ],
    0.109,
    mat.body,
  );
  // Long separate charging-handle channel and controls on the visible side.
  bevel(0.006, 0.027, 0.212, 0.003, mat.steel, -0.048, 0.026, -0.087);
  bevel(0.007, 0.017, 0.151, 0.002, mat.shadow, -0.052, 0.027, -0.085);
  bevel(0.009, 0.011, 0.108, 0.002, mat.bolt, -0.057, 0.029, -0.077);
  bevel(0.027, 0.02, 0.044, 0.003, mat.steel, -0.06, 0.03, 0.036);
  box(0.013, 0.012, 0.018, mat.rubber, -0.077, 0.03, 0.036);
  bevel(0.006, 0.04, 0.09, 0.003, mat.steel, 0.049, 0.002, -0.036);
  bevel(0.006, 0.031, 0.077, 0.002, mat.shadow, 0.053, 0.003, -0.036);
  box(0.008, 0.009, 0.085, mat.edge, 0.056, -0.016, -0.036);
  screw(-0.049, -0.025, 0.066, 0.008);
  screw(-0.051, -0.031, -0.208, 0.006);
  screw(-0.052, 0.051, -0.21, 0.004);
  screw(-0.052, 0.051, 0.057, 0.004);
  cyl(0.014, 0.008, mat.steel, -0.053, -0.027, -0.019, 'x');
  const selector = bevel(
    0.009,
    0.009,
    0.039,
    0.002,
    mat.edge,
    -0.06,
    -0.028,
    -0.008,
  );
  selector.rotation.x = -0.24;
  cyl(0.008, 0.011, mat.edge, -0.058, -0.055, -0.06, 'x');
  sideLabel('MR—17', 0.1, 0.025, -0.053, -0.011, -0.128);
  sideLabel(
    '5.56 × 45   //   01742',
    0.143,
    0.016,
    -0.055,
    -0.034,
    -0.129,
    '#959c8d',
  );
  sideLabel('S   1   A', 0.05, 0.012, -0.059, -0.006, -0.002, '#d3cec0');

  // Free-floating ventilated handguard with segmented side plates.
  bevel(0.087, 0.112, 0.348, 0.015, mat.body, 0, 0.008, -0.431);
  for (const x of [-1, 1]) {
    bevel(0.007, 0.053, 0.305, 0.003, mat.steel, x * 0.046, 0.014, -0.429);
    for (let i = 0; i < 7; i++) {
      const z = -0.295 - i * 0.041;
      bevel(0.008, 0.019, 0.027, 0.004, mat.shadow, x * 0.051, 0.023, z);
      bevel(
        0.009,
        0.013,
        0.025,
        0.003,
        mat.shadow,
        x * 0.047,
        -0.034,
        z - 0.004,
      );
      box(0.002, 0.003, 0.021, mat.edge, x * 0.055, 0.034, z);
    }
    for (const z of [-0.289, -0.57]) screw(x * 0.052, -0.014, z, 0.005);
    bevel(0.008, 0.02, 0.133, 0.003, mat.polymer, x * 0.055, -0.013, -0.43);
    for (let i = 0; i < 10; i++)
      box(
        0.011,
        0.021,
        0.003,
        mat.rubber,
        x * 0.056,
        -0.013,
        -0.374 - i * 0.012,
      );
  }
  // Upper rail, individual recoil lugs, hardware and low-profile folded iron sights.
  bevel(0.055, 0.017, 0.666, 0.002, mat.steel, 0, 0.077, -0.241);
  for (let i = 0; i < 37; i++)
    bevel(0.061, 0.012, 0.008, 0.0015, mat.edge, 0, 0.09, 0.078 - i * 0.018);
  bevel(0.059, 0.018, 0.042, 0.003, mat.steel, 0, 0.101, -0.555);
  bevel(0.019, 0.021, 0.039, 0.003, mat.steel, 0, 0.116, -0.555);
  box(0.006, 0.022, 0.006, mat.shadow, 0, 0.125, -0.565);
  bevel(0.05, 0.009, 0.029, 0.003, mat.steel, 0, 0.099, 0.065);
  // Exposed barrel, gas block, collar and crown. Barrel dark bore is visibly recessed.
  cyl(0.019, 0.221, mat.steel, 0, 0.013, -0.676);
  cyl(0.024, 0.033, mat.edge, 0, 0.013, -0.602);
  cyl(0.024, 0.042, mat.steel, 0, 0.013, -0.775);
  cyl(0.025, 0.062, mat.steel, 0, 0.013, -0.825);
  for (let i = 0; i < 4; i++)
    cyl(0.0255, 0.003, mat.edge, 0, 0.013, -0.802 - i * 0.012);
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const slot = box(
      0.006,
      0.01,
      0.038,
      mat.shadow,
      Math.sin(angle) * 0.024,
      0.013 + Math.cos(angle) * 0.024,
      -0.826,
    );
    slot.rotation.z = -angle;
  }
  cyl(0.017, 0.003, mat.shadow, 0, 0.013, -0.857);
  cyl(0.01, 0.004, mat.rubber, 0, 0.013, -0.86);
  // Supple telescoping stock, open profile and textured shoulder pad.
  const shoulderStock = new THREE.Group();
  shoulderStock.name = 'shoulder-stock';
  rig.add(shoulderStock);
  // Shoulder furniture is retained for inspection, but excluded from the eye
  // view: its real-world position is beside/behind the player's cheek.
  shoulderStock.visible = false;
  cyl(0.023, 0.22, mat.steel, 0, 0.016, 0.21, 'z', shoulderStock);
  for (let i = 0; i < 4; i++)
    cyl(
      0.026,
      0.009,
      mat.edge,
      0,
      0.016,
      0.133 + i * 0.014,
      'z',
      shoulderStock,
    );
  profile(
    [
      [0.151, 0.051],
      [0.29, 0.059],
      [0.358, 0.043],
      [0.377, -0.094],
      [0.329, -0.104],
      [0.291, -0.051],
      [0.158, -0.029],
    ],
    0.081,
    mat.polymer,
    shoulderStock,
  );
  profile(
    [
      [0.207, -0.03],
      [0.282, -0.032],
      [0.325, -0.075],
      [0.286, -0.075],
    ],
    0.085,
    mat.shadow,
    shoulderStock,
  );
  bevel(0.078, 0.052, 0.144, 0.01, mat.polymer, 0, 0.059, 0.243, shoulderStock);
  const butt = bevel(
    0.089,
    0.162,
    0.027,
    0.009,
    mat.rubber,
    0,
    -0.016,
    0.367,
    shoulderStock,
  );
  butt.rotation.x = -0.14;
  for (let i = 0; i < 8; i++)
    box(
      0.086,
      0.004,
      0.031,
      mat.gloveDark,
      0,
      0.047 - i * 0.017,
      0.369,
      shoulderStock,
    );
  bevel(0.045, 0.012, 0.054, 0.003, mat.steel, 0, -0.058, 0.212, shoulderStock);
  cyl(0.008, 0.097, mat.bolt, 0, -0.059, 0.27, 'x', shoulderStock);
  // Grip and open trigger guard keep the receiver silhouette mechanically plausible.
  const grip = profile(
    [
      [0.021, -0.053],
      [0.081, -0.045],
      [0.126, -0.2],
      [0.051, -0.212],
      [0.004, -0.101],
    ],
    0.063,
    mat.polymer,
  );
  for (let i = 0; i < 8; i++) {
    const y = -0.109 - i * 0.011,
      z = 0.049 + i * 0.003;
    box(0.066, 0.003, 0.045, mat.rubber, 0, y, z);
  }
  profile(
    [
      [0.006, -0.066],
      [-0.073, -0.077],
      [-0.078, -0.121],
      [0.016, -0.129],
      [0.025, -0.111],
      [0.014, -0.108],
      [-0.06, -0.108],
      [-0.061, -0.083],
      [0.008, -0.079],
    ],
    0.014,
    mat.steel,
  );
  const trigger = bevel(
    0.009,
    0.038,
    0.009,
    0.002,
    mat.bolt,
    0,
    -0.088,
    -0.025,
  );
  trigger.rotation.x = -0.31;
  // Curved magazine, floorplate and stamped longitudinal ribs.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.084, -0.143);
  rig.add(magazine);
  profile(
    [
      [-0.059, 0.005],
      [0.06, 0.005],
      [0.068, -0.123],
      [0.091, -0.24],
      [-0.035, -0.253],
      [-0.056, -0.126],
    ],
    0.078,
    mat.polymer,
    magazine,
  );
  for (const x of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      const z = -0.034 + j * 0.036;
      const rib = bevel(
        0.009,
        0.17,
        0.009,
        0.003,
        mat.steel,
        x * 0.04,
        -0.125,
        z + 0.009,
        magazine,
      );
      rib.rotation.x = -0.1;
    }
    for (let j = 0; j < 4; j++)
      box(
        0.082,
        0.005,
        0.11,
        mat.steel,
        0,
        -0.051 - j * 0.046,
        0.002 + j * 0.004,
        magazine,
      );
  }
  const plate = bevel(
    0.092,
    0.018,
    0.14,
    0.004,
    mat.rubber,
    0,
    -0.247,
    0.027,
    magazine,
  );
  plate.rotation.x = -0.09;
  sideLabel('30', 0.024, 0.024, -0.047, -0.037, 0.032, '#8d9988', magazine);

  // Holographic optic: open window framed by a protective hood, not a solid cube.
  const optic = new THREE.Group();
  optic.position.set(0, 0.106, -0.128);
  rig.add(optic);
  bevel(0.071, 0.019, 0.101, 0.006, mat.steel, 0, 0, 0, optic);
  bevel(0.083, 0.014, 0.076, 0.005, mat.polymer, 0, 0.02, -0.004, optic);
  // A single cut-out protective hood gives the optic chamfered shoulders and
  // an uninterrupted silhouette, with a real empty aperture through it.
  const hoodShape = new THREE.Shape();
  const hoodOutline = [
    [-0.046, 0.026],
    [-0.046, 0.096],
    [-0.034, 0.112],
    [0.034, 0.112],
    [0.046, 0.096],
    [0.046, 0.026],
  ];
  hoodOutline.forEach(([x, y], i) =>
    i ? hoodShape.lineTo(x, y) : hoodShape.moveTo(x, y),
  );
  hoodShape.closePath();
  const aperture = new THREE.Path();
  [
    [-0.032, 0.035],
    [-0.032, 0.088],
    [-0.025, 0.098],
    [0.025, 0.098],
    [0.032, 0.088],
    [0.032, 0.035],
  ]
    .reverse()
    .forEach(([x, y], i) =>
      i ? aperture.lineTo(x, y) : aperture.moveTo(x, y),
    );
  aperture.closePath();
  hoodShape.holes.push(aperture);
  const hoodGeometry = new THREE.ExtrudeGeometry(hoodShape, {
    depth: 0.036,
    bevelEnabled: true,
    bevelSize: 0.0025,
    bevelThickness: 0.0025,
    bevelSegments: 2,
    steps: 1,
  });
  hoodGeometry.translate(0, 0, -0.018);
  mesh(hoodGeometry, mat.steel, 0, 0, 0, optic);
  for (const x of [-1, 1]) {
    bevel(
      0.008,
      0.026,
      0.046,
      0.003,
      mat.polymer,
      x * 0.05,
      0.034,
      -0.002,
      optic,
    );
  }
  // Fine metal rim catches illumination along the angled hood shoulders.
  for (let i = 0; i < hoodOutline.length - 1; i++) {
    const a = hoodOutline[i],
      b = hoodOutline[i + 1];
    const start = new THREE.Vector3(a[0], a[1], 0.021),
      end = new THREE.Vector3(b[0], b[1], 0.021);
    const direction = end.clone().sub(start);
    const trim = mesh(
      new THREE.CylinderGeometry(0.0009, 0.0009, direction.length(), 6),
      mat.edge,
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      0.021,
      optic,
    );
    trim.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
  }
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0x4c8a85,
    transparent: true,
    opacity: 0.075,
    roughness: 0.09,
    metalness: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  mesh(new THREE.PlaneGeometry(0.067, 0.068), lensMat, 0, 0.068, -0.014, optic);
  cyl(0.014, 0.017, mat.steel, 0.054, 0.034, 0.005, 'x', optic);
  cyl(0.01, 0.019, mat.rubber, 0.061, 0.034, 0.005, 'x', optic);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    box(
      0.02,
      0.003,
      0.003,
      mat.edge,
      0.061,
      0.034 + Math.cos(a) * 0.011,
      0.005 + Math.sin(a) * 0.011,
      optic,
    );
  }
  screw(-0.049, 0.028, 0.032, 0.005, optic);
  // Small etched reticle becomes crisp and central in ADS.
  const reticle = new THREE.Group();
  reticle.position.set(0, 0.068, -0.012);
  optic.add(reticle);
  const red = new THREE.MeshBasicMaterial({
    color: 0xff5943,
    transparent: true,
    opacity: 0.9,
    toneMapped: false,
    depthWrite: false,
  });
  mesh(new THREE.RingGeometry(0.0094, 0.01, 40), red, 0, 0, 0, reticle);
  mesh(new THREE.CircleGeometry(0.0015, 12), red, 0, 0, 0.0001, reticle);
  for (const x of [-1, 1])
    box(0.003, 0.0006, 0.0002, red, x * 0.011, 0, 0, reticle);
  box(0.0006, 0.003, 0.0002, red, 0, -0.011, 0, reticle);
  sideLabel('AURORA', 0.059, 0.012, -0.059, 0.046, -0.004, '#b3bca9', optic);

  // Purpose-shaped fabric sleeves, cuff layers and articulated gripping fingers.
  const hands = new THREE.Group();
  rig.add(hands);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Firing hand disappears naturally under the receiver and wraps the pistol grip.
  capsule(
    v(0.088, -0.36, 0.28),
    v(0.073, -0.219, 0.11),
    0.073,
    0.051,
    mat.cloth,
    hands,
  );
  capsule(
    v(0.073, -0.227, 0.12),
    v(0.066, -0.181, 0.079),
    0.051,
    0.044,
    mat.gloveDark,
    hands,
  );
  const palm = softbox(
    0.091,
    0.101,
    0.074,
    0.025,
    mat.glove,
    0.053,
    -0.147,
    0.071,
    hands,
  );
  palm.rotation.x = -0.29;
  palm.rotation.z = 0.17;
  for (let i = 0; i < 3; i++) {
    capsule(
      v(0.068, -0.126 - i * 0.022, 0.046),
      v(-0.022, -0.128 - i * 0.022, 0.034),
      0.014,
      0.012,
      mat.glove,
      hands,
    );
    capsule(
      v(-0.022, -0.128 - i * 0.022, 0.034),
      v(-0.022, -0.138 - i * 0.022, 0.067),
      0.012,
      0.011,
      mat.glove,
      hands,
    );
  }
  capsule(
    v(0.045, -0.092, 0.059),
    v(0.018, -0.084, -0.011),
    0.012,
    0.011,
    mat.glove,
    hands,
  );
  capsule(
    v(0.019, -0.084, -0.011),
    v(0.009, -0.099, -0.028),
    0.011,
    0.01,
    mat.glove,
    hands,
  );
  capsule(
    v(-0.018, -0.115, 0.087),
    v(-0.035, -0.066, 0.046),
    0.018,
    0.015,
    mat.glove,
    hands,
  );
  // Support hand has its thumb along the near rail and fingers under the handguard.
  capsule(
    v(-0.21, -0.36, 0.16),
    v(-0.097, -0.148, -0.331),
    0.078,
    0.045,
    mat.cloth,
    hands,
  );
  capsule(
    v(-0.097, -0.148, -0.326),
    v(-0.065, -0.086, -0.404),
    0.049,
    0.044,
    mat.gloveDark,
    hands,
  );
  const support = softbox(
    0.092,
    0.083,
    0.111,
    0.027,
    mat.glove,
    -0.042,
    -0.068,
    -0.419,
    hands,
  );
  support.rotation.z = -0.42;
  support.rotation.x = -0.25;
  // A softly padded dorsal panel follows the wrist axis. Its inset seam makes
  // the glove read as sewn fabric and leather instead of one polygonal mitten.
  const wristPanel = new THREE.Group();
  wristPanel.position.set(-0.081, -0.117, -0.365);
  wristPanel.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    v(0.032, 0.062, -0.078).normalize(),
  );
  hands.add(wristPanel);
  softbox(0.061, 0.067, 0.008, 0.0035, mat.glovePanel, 0, 0, 0.045, wristPanel);
  seam(
    [
      v(-0.022, -0.023, 0.05),
      v(-0.023, 0.022, 0.05),
      v(0.022, 0.023, 0.05),
      v(0.023, -0.022, 0.05),
    ],
    wristPanel,
    true,
  );
  for (let i = 0; i < 3; i++) {
    softbox(
      0.044,
      0.005,
      0.009,
      0.002,
      mat.gloveDark,
      0,
      0.012 - i * 0.012,
      0.05,
      wristPanel,
    );
  }
  for (let i = 0; i < 4; i++) {
    const z = -0.384 - i * 0.023;
    capsule(
      v(-0.069, -0.044, z),
      v(-0.017, -0.071, z - 0.003),
      0.012,
      0.012,
      mat.glove,
      hands,
    );
    capsule(
      v(-0.017, -0.071, z - 0.003),
      v(0.047, -0.044, z - 0.004),
      0.012,
      0.011,
      mat.glove,
      hands,
    );
    capsule(
      v(0.047, -0.044, z - 0.004),
      v(0.046, -0.008, z - 0.004),
      0.011,
      0.009,
      mat.glove,
      hands,
    );
  }
  capsule(
    v(-0.063, -0.058, -0.385),
    v(-0.067, 0.004, -0.428),
    0.017,
    0.014,
    mat.glove,
    hands,
  );
  capsule(
    v(-0.067, 0.004, -0.428),
    v(-0.06, 0.015, -0.469),
    0.014,
    0.011,
    mat.glove,
    hands,
  );
  // Stitch lines and knuckle padding supply small-scale detail without excess geometry.
  for (let i = 0; i < 3; i++) {
    const pad = softbox(
      0.026,
      0.014,
      0.022,
      0.005,
      mat.gloveDark,
      -0.071,
      -0.036,
      -0.392 - i * 0.024,
      hands,
    );
    pad.rotation.z = -0.6;
    seam(
      [
        v(-0.081, -0.038, -0.4 - i * 0.024),
        v(-0.082, -0.03, -0.392 - i * 0.024),
        v(-0.073, -0.026, -0.384 - i * 0.024),
      ],
      hands,
    );
  }
  const cuff = new THREE.Group();
  cuff.position.set(-0.104, -0.16, -0.312);
  cuff.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    v(0.113, 0.212, -0.491).normalize(),
  );
  hands.add(cuff);
  cyl(0.05, 0.024, mat.cuff, 0, 0, 0, 'y', cuff, 24);
  for (const y of [-0.009, 0.009]) {
    const stitch = mesh(
      new THREE.TorusGeometry(0.0503, 0.00065, 4, 40),
      mat.thread,
      0,
      y,
      0,
      cuff,
    );
    stitch.rotation.x = Math.PI / 2;
  }
  softbox(0.027, 0.019, 0.008, 0.003, mat.gloveDark, 0, 0, 0.049, cuff);
  seam(
    [
      v(-0.009, -0.005, 0.0535),
      v(-0.009, 0.005, 0.0535),
      v(0.009, 0.005, 0.0535),
      v(0.009, -0.005, 0.0535),
    ],
    cuff,
    true,
  );
  sideLabel('R / 07', 0.046, 0.014, -0.088, -0.081, -0.423, '#a7ad91', hands);

  // A soft viewmodel fill makes the machining legible in shade.
  const fill = new THREE.PointLight(0xdde9d9, 0.68, 2.4, 2);
  fill.position.set(-0.35, 0.45, 0.25);
  rig.add(fill);
  const rim = new THREE.PointLight(0xffc078, 0.27, 1.9, 2);
  rim.position.set(0.25, 0.12, -0.6);
  rig.add(rim);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.013, -0.872);
  rig.add(muzzle);
  const flashLight = new THREE.PointLight(0xffbb58, 0, 5, 2);
  muzzle.add(flashLight);
  const fc = document.createElement('canvas');
  fc.width = fc.height = 128;
  const fctx = fc.getContext('2d')!,
    grad = fctx.createRadialGradient(64, 64, 0, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,229,1)');
  grad.addColorStop(0.16, 'rgba(255,241,168,1)');
  grad.addColorStop(0.36, 'rgba(255,166,40,.75)');
  grad.addColorStop(1, 'rgba(255,88,4,0)');
  fctx.fillStyle = grad;
  fctx.fillRect(0, 0, 128, 128);
  const ft = new THREE.CanvasTexture(fc);
  ft.colorSpace = THREE.SRGBColorSpace;
  const flashSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: ft,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  flashSprite.scale.set(0.22, 0.22, 1);
  flashSprite.position.z = -0.03;
  flashSprite.visible = false;
  muzzle.add(flashSprite);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffd489,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const flame = mesh(
    new THREE.ConeGeometry(0.039, 0.16, 7),
    flameMat,
    0,
    0,
    -0.062,
    muzzle,
  );
  flame.rotation.x = -Math.PI / 2;
  flame.visible = false;

  let flashTime = 0,
    ads = 0,
    move = 0,
    sprint = 0,
    elapsed = 0;
  const basePosition = new THREE.Vector3(0.235, -0.265, -0.49);
  group.position.copy(basePosition);
  const lerp = THREE.MathUtils.lerp;
  return {
    group,
    muzzle,
    flash() {
      flashTime = 0.052;
      flashSprite.material.rotation = Math.random() * Math.PI;
      flashSprite.scale.setScalar(0.18 + Math.random() * 0.13);
    },
    update(
      dt: number,
      state: {
        time: number;
        moving: number;
        sprinting: boolean;
        aiming: boolean;
        reloading: number;
        recoil: number;
      },
    ) {
      elapsed += dt;
      const a = 1 - Math.exp(-dt * 13);
      ads = lerp(
        ads,
        state.aiming && !state.sprinting && state.reloading <= 0 ? 1 : 0,
        a,
      );
      move = lerp(move, Math.min(1, state.moving), a);
      sprint = lerp(sprint, state.sprinting ? 1 : 0, a);
      const t = state.time ?? elapsed,
        bob = Math.sin(t * (state.sprinting ? 13 : 9));
      const recoil = state.recoil || 0;
      const reload = THREE.MathUtils.clamp(state.reloading || 0, 0, 1);
      const reloadTilt = Math.sin(reload * Math.PI);
      group.position.set(
        lerp(basePosition.x, 0, ads) +
          Math.sin(t * 1.3) * 0.0014 +
          (1 - ads) * Math.sin(t * 4.5) * move * 0.005,
        lerp(basePosition.y, -0.174 * viewScale, ads) +
          Math.sin(t * 1.7) * 0.001 +
          (1 - ads) * Math.abs(bob) * move * 0.006 -
          reloadTilt * 0.07 -
          sprint * 0.06,
        lerp(basePosition.z, -0.41, ads) + recoil * 0.038 + sprint * 0.04,
      );
      group.rotation.set(
        recoil * 0.11 +
          (1 - ads) * bob * move * 0.008 +
          sprint * 0.2 +
          reloadTilt * 0.32,
        Math.sin(t * 0.9) * 0.002 * (1 - ads) +
          reloadTilt * 0.23 +
          sprint * 0.24,
        (1 - ads) * Math.sin(t * 4.5) * move * 0.009 +
          sprint * 0.36 -
          reloadTilt * 0.32,
      );
      magazine.position.y = -0.084 - reloadTilt * 0.11;
      magazine.position.z = -0.143 + reloadTilt * 0.048;
      magazine.rotation.x = reloadTilt * 0.23;
      reticle.visible = ads > 0.25;
      (red as Three.MeshBasicMaterial).opacity = 0.45 + ads * 0.45;
      flashTime = Math.max(0, flashTime - dt);
      const lit = flashTime > 0;
      flashSprite.visible = lit;
      flame.visible = lit;
      flashLight.intensity = lit ? 5.7 : 0;
    },
  };
}
