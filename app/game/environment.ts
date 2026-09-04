import type * as ThreeType from 'three';

type Collider = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY?: number;
};
export function createEnvironment(
  THREE: typeof ThreeType,
  scene: ThreeType.Scene,
) {
  const colliders: Collider[] = [];
  let seed = 18941;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const canvas = (w: number, h = w) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const texture = (c: HTMLCanvasElement, repeat = 1, srgb = true) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const mats: Record<string, ThreeType.MeshStandardMaterial> = {};
  const mat = (
    key: string,
    color: number,
    roughness = 0.6,
    metalness = 0.1,
  ) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    mats[key] = m;
    return m;
  };
  const steel = mat('steel', 0x23323a, 0.45, 0.8),
    rust = mat('rust', 0x553d32, 0.73, 0.55),
    edge = mat('edge', 0x46565c, 0.36, 0.8),
    black = mat('black', 0x111c25, 0.58, 0.6),
    concrete = mat('concrete', 0x4c5758, 0.84, 0.03),
    yellow = mat('yellow', 0xc79a37, 0.5, 0.35),
    wood = mat('wood', 0x675a42, 0.9, 0),
    rubber = mat('rubber', 0x10171c, 0.8, 0);
  const red = mat('red', 0x8a382e, 0.5, 0.7),
    blue = mat('blue', 0x23475c, 0.47, 0.7),
    grey = mat('grey', 0x4b605d, 0.55, 0.65),
    navy = mat('navy', 0x223442, 0.55, 0.6);

  // Real texture maps retain surface character at the player's eye height.
  const metalC = canvas(512),
    mc = metalC.getContext('2d')!;
  mc.fillStyle = '#bbc0b8';
  mc.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 18500; i++) {
    const a = rand() * 0.15;
    mc.fillStyle = `rgba(${rand() < 0.6 ? '18,27,30' : '235,232,203'},${a})`;
    mc.fillRect(
      rand() * 512,
      rand() * 512,
      rand() * 2 + 0.3,
      rand() * 16 + 0.3,
    );
  }
  for (let i = 0; i < 120; i++) {
    mc.fillStyle = `rgba(48,30,19,${rand() * 0.23})`;
    mc.fillRect(rand() * 512, rand() * 512, rand() * 8 + 1, rand() * 92 + 4);
  }
  const metalMap = texture(metalC, 1);
  [steel, rust, edge, red, blue, grey, navy, yellow].forEach((m) => {
    m.map = metalMap;
  });
  const concC = canvas(512),
    cc = concC.getContext('2d')!;
  cc.fillStyle = '#a8ada8';
  cc.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 30000; i++) {
    const shade = Math.floor(70 + rand() * 130);
    cc.fillStyle = `rgba(${shade},${shade},${shade},.22)`;
    cc.fillRect(rand() * 512, rand() * 512, rand() * 3 + 0.2, rand() * 3 + 0.2);
  }
  concrete.map = texture(concC, 2);
  const asphaltC = canvas(1024),
    ac = asphaltC.getContext('2d')!;
  ac.fillStyle = '#4b4d49';
  ac.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 95000; i++) {
    const s = Math.floor(rand() * 100 + 50);
    ac.fillStyle = `rgba(${s},${s + 7},${s + 9},${rand() * 0.25})`;
    ac.fillRect(
      rand() * 1024,
      rand() * 1024,
      rand() * 2 + 0.3,
      rand() * 2 + 0.3,
    );
  }
  for (let i = 0; i < 90; i++) {
    ac.strokeStyle = `rgba(11,22,29,${rand() * 0.22 + 0.08})`;
    ac.lineWidth = rand() * 2 + 0.4;
    ac.beginPath();
    let x = rand() * 1024,
      y = rand() * 1024;
    ac.moveTo(x, y);
    for (let j = 0; j < 12; j++) {
      x += rand() * 28 - 14;
      y += rand() * 25;
      ac.lineTo(x, y);
    }
    ac.stroke();
  }
  // Broad moisture gradients change roughness gently; only a few local puddles are glossy.
  const roughC = canvas(1024),
    rc = roughC.getContext('2d')!;
  rc.fillStyle = '#cacaca';
  rc.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 78; i++) {
    const px = rand() * 1024,
      py = rand() * 1024,
      r = rand() * 115 + 35,
      wet = rand() < 0.68;
    const moisture = rc.createRadialGradient(px, py, r * 0.06, px, py, r);
    moisture.addColorStop(
      0,
      wet ? 'rgba(100,100,100,.72)' : 'rgba(239,239,239,.45)',
    );
    moisture.addColorStop(
      0.44,
      wet ? 'rgba(110,110,110,.35)' : 'rgba(235,235,235,.18)',
    );
    moisture.addColorStop(1, 'rgba(128,128,128,0)');
    rc.fillStyle = moisture;
    rc.fillRect(px - r, py - r, r * 2, r * 2);
    const mottling = ac.createRadialGradient(px, py, 0, px, py, r);
    mottling.addColorStop(
      0,
      wet ? 'rgba(16,23,23,.065)' : 'rgba(139,130,109,.055)',
    );
    mottling.addColorStop(1, 'rgba(80,80,80,0)');
    ac.fillStyle = mottling;
    ac.fillRect(px - r, py - r, r * 2, r * 2);
  }
  for (let i = 0; i < 18000; i++) {
    const px = rand() * 1024,
      py = rand() * 1024,
      v = rand();
    ac.fillStyle = v > 0.65 ? 'rgba(153,150,133,.2)' : 'rgba(10,17,17,.22)';
    ac.fillRect(px, py, 0.7 + rand() * 2.7, 0.6 + rand() * 2);
  }
  for (let i = 0; i < 12; i++) {
    const px = rand() * 1024,
      py = rand() * 1024;
    ac.strokeStyle = 'rgba(9,15,17,.27)';
    ac.lineWidth = rand() * 1.8 + 0.5;
    ac.beginPath();
    ac.moveTo(px, py);
    for (let k = 1; k < 9; k++)
      ac.lineTo(px + k * 15 + rand() * 20, py + k * 8 + rand() * 30);
    ac.stroke();
  }
  const normalC = canvas(512),
    nc = normalC.getContext('2d')!;
  nc.fillStyle = '#8080ff';
  nc.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 42000; i++) {
    nc.fillStyle = `rgb(${118 + Math.floor(rand() * 20)},${118 + Math.floor(rand() * 20)},255)`;
    nc.fillRect(rand() * 512, rand() * 512, 1, 1);
  }
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0xa5a5a0,
    map: texture(asphaltC, 23),
    roughnessMap: texture(roughC, 23, false),
    normalMap: texture(normalC, 80, false),
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.91,
    metalness: 0.13,
  });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(170, 170),
    groundMaterial,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.025, -22);
  ground.receiveShadow = true;
  scene.add(ground);

  scene.background = new THREE.Color(0x102538);
  scene.fog = new THREE.FogExp2(0x183246, 0.014);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: `varying vec3 vSky; void main(){vSky=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
    varying vec3 vSky;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float f=0.,a=.55;for(int i=0;i<4;i++){f+=a*noise(p);p=p*2.07+vec2(21.1,7.3);a*=.5;}return f;}
    void main(){vec3 d=normalize(vSky);float h=max(d.y,0.);vec3 color=mix(vec3(.115,.206,.278),vec3(.022,.047,.084),smoothstep(0.,.8,h));vec2 uv=d.xz/max(.12,d.y+.19);float clouds=fbm(uv*1.35+vec2(7.2,1.4));float wisps=fbm(uv*3.+vec2(12.2,4.1));float cover=smoothstep(.30,.61,clouds*.7+wisps*.3);color=mix(color,vec3(.014,.027,.044),cover*.86);color+=vec3(.052,.064,.073)*pow(1.-h,4.)*(1.-cover);color+=vec3(.019,.025,.028)*smoothstep(.48,.63,wisps)*(1.-cover);gl_FragColor=vec4(color,1.);}
  `,
  });
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(145, 32, 16),
    skyMaterial,
  );
  skyDome.position.set(0, 0, -18);
  skyDome.renderOrder = -100;
  scene.add(skyDome);

  const skyC = canvas(1024, 512),
    sc = skyC.getContext('2d')!;
  const sg = sc.createLinearGradient(0, 0, 0, 512);
  sg.addColorStop(0, '#091828');
  sg.addColorStop(0.45, '#26475e');
  sg.addColorStop(0.65, '#4d6871');
  sg.addColorStop(1, '#172735');
  sc.fillStyle = sg;
  sc.fillRect(0, 0, 1024, 512);
  for (const p of [
    [165, 300, 130],
    [760, 280, 65],
  ]) {
    const g = sc.createRadialGradient(p[0], p[1], 1, p[0], p[1], p[2]);
    g.addColorStop(0, 'rgba(250,198,121,.6)');
    g.addColorStop(1, 'rgba(255,180,90,0)');
    sc.fillStyle = g;
    sc.fillRect(p[0] - p[2], p[1] - p[2], p[2] * 2, p[2] * 2);
  }
  const env = texture(skyC);
  env.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = env;
  scene.environmentIntensity = 0.76;
  scene.add(new THREE.HemisphereLight(0xaebdc4, 0x37332b, 1.23));
  const moon = new THREE.DirectionalLight(0xa2c2d1, 1.65);
  moon.position.set(-24, 38, -20);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -32;
  moon.shadow.camera.right = 32;
  moon.shadow.camera.top = 35;
  moon.shadow.camera.bottom = -35;
  moon.shadow.camera.far = 100;
  moon.shadow.normalBias = 0.04;
  moon.shadow.bias = -0.0003;
  moon.target.position.set(0, 0, -12);
  scene.add(moon, moon.target);

  // Every material's repeated geometry is instanced, keeping the terminal inexpensive.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1),
    cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
  const batches = new Map<
    ThreeType.Material,
    { geometry: ThreeType.BufferGeometry; matrices: ThreeType.Matrix4[] }[]
  >();
  const obj = new THREE.Object3D();
  const instance = (
    geo: ThreeType.BufferGeometry,
    m: ThreeType.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => {
    obj.position.set(x, y, z);
    obj.rotation.set(rx, ry, rz);
    obj.scale.set(sx, sy, sz);
    obj.updateMatrix();
    let entries = batches.get(m);
    if (!entries) {
      entries = [];
      batches.set(m, entries);
    }
    let b = entries.find((e) => e.geometry === geo);
    if (!b) {
      b = { geometry: geo, matrices: [] };
      entries.push(b);
    }
    b.matrices.push(obj.matrix.clone());
  };
  const box = (
    m: ThreeType.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    ry = 0,
  ) => instance(boxGeo, m, x, y, z, w, h, d, 0, ry, 0);
  const beam = (
    m: ThreeType.Material,
    a: ThreeType.Vector3,
    b: ThreeType.Vector3,
    r: number,
  ) => {
    const v = b.clone().sub(a);
    obj.position.copy(a).addScaledVector(v, 0.5);
    obj.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      v.clone().normalize(),
    );
    obj.scale.set(r, v.length(), r);
    obj.updateMatrix();
    let entries = batches.get(m);
    if (!entries) {
      entries = [];
      batches.set(m, entries);
    }
    let batch = entries.find((e) => e.geometry === cylGeo);
    if (!batch) {
      batch = { geometry: cylGeo, matrices: [] };
      entries.push(batch);
    }
    batch.matrices.push(obj.matrix.clone());
  };
  const collider = (x: number, z: number, w: number, d: number, maxY = 2.66) =>
    colliders.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      maxY,
    });
  const flat = (
    w: number,
    h: number,
    material: ThreeType.Material,
    x: number,
    y: number,
    z: number,
    ry = 0,
  ) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    scene.add(mesh);
    return mesh;
  };
  const label = (
    text: string,
    w: number,
    h: number,
    size = 86,
    color = '#d2d8ca',
    background = 'transparent',
  ) => {
    const c = canvas(1024, 256),
      ctx = c.getContext('2d')!;
    if (background !== 'transparent') {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, 1024, 256);
    }
    ctx.fillStyle = color;
    ctx.font = `700 ${size}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 128);
    for (let i = 0; i < 700; i++) {
      ctx.clearRect(rand() * 1024, rand() * 256, rand() * 4, rand() * 2);
    }
    const t = texture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.MeshStandardMaterial({
      map: t,
      transparent: true,
      roughness: 0.78,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
  };

  function container(
    x: number,
    z: number,
    length: number,
    m: ThreeType.MeshStandardMaterial,
    rot = 0,
    y = 0,
    brand = 'NORTHERN',
  ) {
    const local = (xx: number, yy: number, zz: number) =>
      new THREE.Vector3(
        x + Math.cos(rot) * xx + Math.sin(rot) * zz,
        y + yy,
        z - Math.sin(rot) * xx + Math.cos(rot) * zz,
      );
    const cb = (
      ma: ThreeType.Material,
      xx: number,
      yy: number,
      zz: number,
      w: number,
      h: number,
      d: number,
    ) => {
      const p = local(xx, yy, zz);
      box(ma, p.x, p.y, p.z, w, h, d, rot);
    };
    cb(m, 0, 1.32, 0, length, 2.64, 2.5);
    for (const side of [-1, 1]) {
      for (let k = -length / 2 + 0.16; k < length / 2 - 0.1; k += 0.28)
        cb(m, k, 1.3, side * 1.273, 0.082, 2.38, 0.068);
      cb(edge, 0, 0.1, side * 1.29, length, 0.16, 0.13);
      cb(m, 0, 2.58, side * 1.29, length, 0.15, 0.14);
      for (const end of [-1, 1])
        cb(edge, end * (length / 2 - 0.06), 1.32, side * 1.27, 0.14, 2.6, 0.16);
    }
    for (let k = -length / 2 + 0.25; k < length / 2; k += 0.4)
      cb(m, k, 2.658, 0, 0.06, 0.035, 2.34);
    for (const end of [-1, 1]) {
      cb(black, end * (length / 2 + 0.011), 1.33, 0, 0.015, 2.29, 0.032);
      for (const dz of [-0.78, -0.39, 0.39, 0.78])
        cb(edge, end * (length / 2 + 0.048), 1.35, dz, 0.06, 2.22, 0.038);
      for (const dy of [0.25, 2.36])
        for (const dz of [-0.95, 0.95])
          cb(edge, end * (length / 2 + 0.07), dy, dz, 0.12, 0.12, 0.17);
    }
    if (y < 0.2)
      collider(
        x,
        z,
        Math.abs(Math.cos(rot)) * length + Math.abs(Math.sin(rot)) * 2.5,
        Math.abs(Math.cos(rot)) * 2.5 + Math.abs(Math.sin(rot)) * length,
      );
    const p = local(0, 1.62, 1.32);
    flat(
      Math.min(length - 1, 5.5),
      1.1,
      label(brand, 5.5, 1.1, 94, '#c4cbc3'),
      p.x,
      p.y,
      p.z,
      rot,
    );
    const q = local(length / 2 - 1.1, 0.7, 1.326);
    flat(
      1.25,
      0.42,
      label('BWCU 601 284', 1.25, 0.42, 72, '#d4d6c5'),
      q.x,
      q.y,
      q.z,
      rot,
    );
    const r = local(-length / 2 + 0.45, 0.43, 1.33);
    flat(
      0.42,
      0.42,
      label('▲', 0.42, 0.42, 185, '#e0b356'),
      r.x,
      r.y,
      r.z,
      rot,
    );
  }
  container(-13, 1, 12.2, navy, Math.PI / 2, 0, 'KROSS');
  container(-13, 1, 12.2, grey, Math.PI / 2, 2.66, 'NORTHLINE');
  container(11.7, -6, 12.2, blue, 0, 0, 'NORTHLINE');
  container(14.5, -6, 6.1, navy, 0, 2.66, '');
  container(-12, -17, 12.2, red, 0, 0, 'BLACKWATER');
  container(-14.9, -17, 6.1, grey, 0, 2.66, 'KROSS');
  container(15.1, -24, 12.2, grey, Math.PI / 2, 0, 'NORTHERN');
  container(15.1, -24, 12.2, navy, Math.PI / 2, 2.66, 'NORTHLINE');
  container(-1.9, -29, 6.1, blue, 0, 0, 'KROSS');
  container(-15, -34, 12.2, navy, 0, 0, 'NORTHERN');
  container(-15, -34, 12.2, red, 0, 2.66, 'BLACKWATER');
  container(9, -36, 6.1, red, 0, 0, 'NORTHLINE');
  container(22, -13, 12.2, navy, Math.PI / 2, 0, 'KROSS');
  container(-27, -13, 12.2, grey, Math.PI / 2, 0, 'NORTHLINE');
  container(-27, -13, 12.2, navy, Math.PI / 2, 2.66, 'NORTHLINE');
  container(-27, -13, 12.2, red, Math.PI / 2, 5.32, 'KROSS');

  // Warehouse: relief ribs, recessed loading doors, glazing and loading dock fittings.
  box(navy, 0, 6.8, -49, 51, 13.6, 12);
  collider(0, -48.5, 52, 12);
  box(black, 0, 13.7, -48, 53, 0.42, 14);
  box(edge, 0, 13.45, -42.87, 52, 0.36, 0.3);
  for (let x = -24; x <= 24; x += 0.55)
    box(steel, x, 8.1, -42.96, 0.07, 10.8, 0.13);
  box(concrete, 0, 0.9, -42.6, 51, 1.8, 0.7);
  for (const x of [-17, -8, 1, 10, 19]) {
    box(black, x, 3.5, -42.12, 6.5, 6.1, 0.35);
    box(grey, x, 3.45, -41.91, 5.9, 5.7, 0.1);
    for (let y = 0.7; y < 6.2; y += 0.21)
      box(steel, x, y, -41.84, 5.9, 0.047, 0.06);
    for (const side of [-1, 1]) {
      box(black, x + side * 3.14, 2.5, -41.5, 0.3, 4.5, 0.6);
      box(yellow, x + side * 3.42, 1, -41.0, 0.15, 2, 0.15);
    }
    flat(
      1.35,
      0.6,
      label(`0${Math.round((x + 17) / 9) + 1}`, 1.35, 0.6, 120, '#c7cbb9'),
      x,
      7.17,
      -41.77,
    );
  }
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x82afbc,
    emissive: 0x608695,
    emissiveIntensity: 0.6,
    roughness: 0.21,
    metalness: 0.35,
  });
  for (let x = -23; x < 24; x += 3.3) {
    box(windowMat, x, 10.9, -42.82, 2.65, 1.55, 0.07);
    for (const dx of [-1.37, 0, 1.37])
      box(black, x + dx, 10.9, -42.72, 0.06, 1.7, 0.1);
    box(black, x, 10.9, -42.7, 2.8, 0.065, 0.1);
  }
  box(steel, 0, 14.9, -42.96, 20, 2.6, 0.2);
  for (const x of [-8, 8]) box(steel, x, 14, -43, 0.1, 2.8, 0.1);
  flat(
    18,
    2.4,
    label('BLACKWATER  /  TERMINAL 07', 18, 2.4, 77, '#c7d4cd'),
    0,
    14.9,
    -42.75,
  );
  for (const x of [-21, -5, 12, 23]) {
    box(steel, x, 14.7, -50, 2.3, 1.8, 2.3);
    box(black, x, 15.7, -50, 2.7, 0.2, 2.7);
  }

  for (const x of [-21.1, -12.5, 5.3, 14.5]) {
    beam(
      edge,
      new THREE.Vector3(x, 0.35, -41.3),
      new THREE.Vector3(x, 8.5, -41.3),
      0.095,
    );
    for (const y of [1.4, 3.8, 6.2, 8]) {
      instance(cylGeo, steel, x, y, -41.3, 0.124, 0.095, 0.124);
      box(black, x, y, -41.7, 0.18, 0.09, 0.8);
    }
    box(steel, x + 0.4, 3.2, -41.46, 0.72, 1.4, 0.35);
    for (let j = 0; j < 8; j++)
      box(black, x + 0.4, 2.7 + j * 0.13, -41.26, 0.56, 0.042, 0.08);
  }
  beam(
    edge,
    new THREE.Vector3(-23, 8.6, -41.4),
    new THREE.Vector3(23, 8.6, -41.4),
    0.13,
  );
  for (const [x, z] of [
    [-5.9, -15.25],
    [5.55, -4.45],
    [18, -4.45],
    [-8.7, -38.5],
    [4.9, -39.4],
  ]) {
    instance(cylGeo, yellow, x, 0.61, z, 0.12, 1.22, 0.12);
    instance(cylGeo, black, x, 0.73, z, 0.124, 0.2, 0.124);
    instance(cylGeo, concrete, x, 0.035, z, 0.24, 0.07, 0.24);
    collider(x, z, 0.3, 0.3);
  }
  for (const [x, z] of [
    [-17, -13.5],
    [16, -2.8],
    [-10, -39.4],
  ])
    for (let level = 0; level < 4; level++) {
      for (const dx of [-0.5, 0, 0.5])
        box(wood, x + dx, 0.075 + level * 0.15, z, 0.15, 0.13, 1.05);
      for (let dz = -0.48; dz < 0.55; dz += 0.19)
        box(wood, x, 0.145 + level * 0.15, z + dz, 1.24, 0.05, 0.15);
    }

  // Tower crane silhouettes form a large industrial composition above the combat space.
  function crane(x: number, z: number, h: number, span: number) {
    for (const dx of [-2.2, 2.2])
      for (const dz of [-2.2, 2.2]) {
        box(rust, x + dx, h / 2, z + dz, 0.43, h, 0.43);
        box(concrete, x + dx, 0.45, z + dz, 1.3, 0.9, 1.3);
      }
    for (let y = 3; y < h; y += 4.5)
      for (const dz of [-2.2, 2.2]) {
        beam(
          rust,
          new THREE.Vector3(x - 2.2, y - 3, z + dz),
          new THREE.Vector3(x + 2.2, y + 1.5, z + dz),
          0.09,
        );
        beam(
          rust,
          new THREE.Vector3(x + 2.2, y - 3, z + dz),
          new THREE.Vector3(x - 2.2, y + 1.5, z + dz),
          0.09,
        );
      }
    for (const dz of [-2.2, 2.2]) {
      box(rust, x + span * 0.26, h, z + dz, span, 1, 0.48);
      box(rust, x + span * 0.26, h + 3, z + dz, span, 0.35, 0.35);
      for (let i = 0; i < Math.ceil(span / 4); i++) {
        const dx = -span * 0.24 + (i * span) / Math.ceil(span / 4),
          end = dx + span / Math.ceil(span / 4);
        beam(
          rust,
          new THREE.Vector3(x + dx, h, z + dz),
          new THREE.Vector3(x + end, h + 3, z + dz),
          0.1,
        );
        beam(
          rust,
          new THREE.Vector3(x + end, h, z + dz),
          new THREE.Vector3(x + dx, h + 3, z + dz),
          0.1,
        );
      }
      for (const dx of [-span * 0.24, span * 0.76])
        box(rust, x + dx, h + 1.5, z + dz, 0.3, 3, 0.3);
    }
    box(steel, x - 4, h - 1.6, z, 4.5, 2.3, 4);
    box(windowMat, x + 2.5, h - 1.5, z + 2.4, 2.1, 1.8, 0.12);
    const hx = x + span * 0.6;
    for (const dx of [-1.1, 1.1])
      beam(
        black,
        new THREE.Vector3(hx + dx, h, z),
        new THREE.Vector3(hx + dx, h * 0.42, z),
        0.035,
      );
    box(yellow, hx, h * 0.42, z, 4.5, 0.25, 2.5);
    box(black, hx, h * 0.42 + 0.65, z, 1.6, 0.95, 0.85);
    for (const dx of [-0.45, 0.45])
      instance(
        cylGeo,
        edge,
        hx + dx,
        h * 0.42 + 0.7,
        z,
        0.31,
        0.16,
        0.31,
        Math.PI / 2,
      );
    for (const dz of [-1.2, 1.2])
      box(yellow, hx, h * 0.42 + 0.13, z + dz, 4.5, 0.25, 0.18);
    for (let dx = -span * 0.24; dx <= span * 0.76; dx += 4)
      beam(
        rust,
        new THREE.Vector3(x + dx, h + 3, z - 2.2),
        new THREE.Vector3(x + dx, h + 3, z + 2.2),
        0.095,
      );
    const hook = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.065, 6, 13, Math.PI * 1.7),
      edge,
    );
    hook.position.set(hx, h * 0.42 - 0.49, z);
    hook.rotation.z = -Math.PI * 0.25;
    scene.add(hook);
  }
  crane(-31, -48, 33, 41);
  crane(39, -67, 43, 47);
  for (const x of [-48, -39, 32, 46, 59]) {
    box(navy, x, rand() * 5 + 6, -78, rand() * 9 + 7, rand() * 10 + 9, 13);
  }
  const tankMat = mat('tank', 0x52666d, 0.4, 0.6);
  for (const x of [-36, -45]) {
    instance(cylGeo, tankMat, x, 6, -33, 4.2, 12, 4.2);
    box(edge, x, 12.1, -33, 7.6, 0.2, 1);
  }

  // Chain-link perimeter. A single alpha texture supplies the woven wire mesh.
  const fenceC = canvas(128),
    fc = fenceC.getContext('2d')!;
  fc.clearRect(0, 0, 128, 128);
  fc.strokeStyle = 'rgba(123,150,157,.66)';
  fc.lineWidth = 2;
  for (let p = -128; p < 256; p += 32) {
    fc.beginPath();
    fc.moveTo(p, 0);
    fc.lineTo(p + 128, 128);
    fc.moveTo(p, 128);
    fc.lineTo(p + 128, 0);
    fc.stroke();
  }
  const fenceT = texture(fenceC);
  fenceT.repeat.set(11, 1.8);
  const fenceMat = new THREE.MeshStandardMaterial({
    map: fenceT,
    transparent: true,
    alphaTest: 0.15,
    side: THREE.DoubleSide,
    roughness: 0.52,
    metalness: 0.7,
  });
  for (const x of [-24.5, 24.5]) {
    const fence = flat(63, 3.4, fenceMat, x, 1.7, -12, Math.PI / 2);
    for (let z = -42; z < 20; z += 4.5) {
      box(edge, x, 1.9, z, 0.09, 3.8, 0.09);
      beam(
        edge,
        new THREE.Vector3(x, 3.5, z),
        new THREE.Vector3(x - 0.4, 4, z),
        0.025,
      );
    }
    box(edge, x, 3.45, -11, 0.045, 0.045, 62);
    collider(x, -12, 0.3, 63);
  }
  collider(0, 19, 49, 0.3);

  // Timber cargo, palettes, drums and concrete Jersey barriers make close-range cover.
  function crate(x: number, z: number, w = 1.5, h = 1.3, d = 1.35, y = 0) {
    box(wood, x, y + h / 2, z, w, h, d);
    for (const dy of [0.12, h - 0.12]) {
      box(rust, x, y + dy, z + d / 2 + 0.012, w, 0.08, 0.035);
      box(rust, x, y + dy, z - d / 2 - 0.012, w, 0.08, 0.035);
    }
    for (const dx of [-w * 0.35, w * 0.35])
      box(steel, x + dx, y + h / 2, z + d / 2 + 0.025, 0.04, h, 0.024);
    for (let xx = -w / 2; xx < w / 2; xx += 0.18)
      box(wood, x + xx, y + h + 0.023, z, 0.012, 0.035, d);
    if (y === 0) collider(x, z, w, d, h);
  }
  crate(-4.2, -8, 1.75, 1.3, 1.4);
  crate(-4.2, -8, 1.5, 0.8, 1.25, 1.3);
  crate(-5.8, -8.3, 1.15, 0.85, 1.2);
  crate(7, -19.2, 1.75, 1.2, 1.5);
  crate(8.65, -20, 1.35, 1.45, 1.35);
  crate(7, -19.2, 1.45, 0.85, 1.2, 1.2);
  crate(-17, 9, 1.5, 1.4, 1.5);
  function barrier(x: number, z: number, ry = 0) {
    box(concrete, x, 0.43, z, 3.1, 0.86, 0.72, ry);
    box(concrete, x, 0.91, z, 3.1, 0.16, 0.42, ry);
    for (let k = -1.1; k < 1.3; k += 0.5) {
      obj.position.set(
        x + k * Math.cos(ry),
        0.66,
        z - k * Math.sin(ry) + 0.365,
      );
      obj.rotation.set(0, ry, -0.4);
      obj.scale.set(0.25, 0.5, 0.016);
      obj.updateMatrix();
      let b = batches.get(yellow);
      if (!b) {
        b = [];
        batches.set(yellow, b);
      }
      let bb = b.find((v) => v.geometry === boxGeo);
      if (!bb) {
        bb = { geometry: boxGeo, matrices: [] };
        b.push(bb);
      }
      bb.matrices.push(obj.matrix.clone());
    }
    collider(
      x,
      z,
      Math.abs(Math.cos(ry)) * 3.1 + Math.abs(Math.sin(ry)) * 0.72,
      Math.abs(Math.cos(ry)) * 0.72 + Math.abs(Math.sin(ry)) * 3.1,
      1.07,
    );
  }
  barrier(5.5, 4);
  barrier(-7.4, 7.3);
  barrier(4.7, -25.5, Math.PI / 2);
  barrier(-5, -36.5);
  const drumColors = [navy, rust, grey];
  for (const [x, z] of [
    [18, 5],
    [19, 4.9],
    [-17, -10],
    [-17.9, -10],
    [12, -33],
  ]) {
    instance(
      cylGeo,
      drumColors[Math.floor(rand() * 3)],
      x,
      0.52,
      z,
      0.37,
      1.04,
      0.37,
    );
    for (const y of [0.12, 0.9])
      instance(cylGeo, edge, x, y, z, 0.388, 0.035, 0.388);
    collider(x, z, 0.78, 0.78, 1.04);
  }
  for (let i = 0; i < 15; i++) {
    const x = (rand() < 0.5 ? -1 : 1) * (10 + rand() * 12),
      z = rand() * 58 - 40;
    for (let k = 0; k < 4; k++)
      box(wood, x + k * 0.24, 0.08, z, 0.19, 0.1, 1.1);
  }
  for (let i = 0; i < 80; i++) {
    const x = (rand() < 0.5 ? -1 : 1) * (7 + rand() * 16),
      z = rand() * 60 - 42;
    box(
      rand() < 0.65 ? black : wood,
      x,
      0.04,
      z,
      rand() * 0.23 + 0.03,
      0.06,
      rand() * 0.32 + 0.04,
      rand() * Math.PI,
    );
  }

  // Lane markings and stencils live on the asphalt, with worn alpha edges.
  const paintC = canvas(512, 64),
    pc = paintC.getContext('2d')!;
  pc.fillStyle = '#d6ba66';
  pc.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 3800; i++)
    pc.clearRect(rand() * 512, rand() * 64, rand() * 5 + 0.3, rand() * 3 + 0.2);
  const paintMat = new THREE.MeshStandardMaterial({
    map: texture(paintC),
    transparent: true,
    roughness: 0.48,
    metalness: 0.15,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const road = (
    x: number,
    z: number,
    w: number,
    d: number,
    m: ThreeType.Material = paintMat,
    rot = 0,
  ) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    p.rotation.set(-Math.PI / 2, 0, rot);
    p.position.set(x, 0.006, z);
    scene.add(p);
    return p;
  };
  for (const x of [-2.7, 2.7])
    for (let z = 13; z > -40; z -= 7.1) road(x, z, 0.075, 3.8);
  for (const z of [7.5, -11.5, -23.5, -34.5]) road(0, z, 5.5, 0.065);
  for (let x = -1.9; x < 2; x += 0.7) road(x, -11.5, 0.33, 1.3);
  road(0, 6, 2.8, 1.2, label('07', 2.8, 1.2, 195, '#ddc176'), 0);
  road(0, -5, 2.6, 1.2, label('SLOW', 2.6, 1.2, 125, '#c4c9bb'));
  for (const x of [-19, 19])
    for (let z = -35; z < 14; z += 8) road(x, z, 4.5, 0.07);
  const shadowC = canvas(128),
    shc = shadowC.getContext('2d')!;
  const shg = shc.createRadialGradient(64, 64, 24, 64, 64, 64);
  shg.addColorStop(0, 'rgba(0,0,0,.83)');
  shg.addColorStop(0.57, 'rgba(0,0,0,.5)');
  shg.addColorStop(1, 'rgba(0,0,0,0)');
  shc.fillStyle = shg;
  shc.fillRect(0, 0, 128, 128);
  const contactMat = new THREE.MeshBasicMaterial({
    map: texture(shadowC),
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
  });
  for (const c of colliders) {
    const w = c.maxX - c.minX,
      d = c.maxZ - c.minZ;
    if (w < 18 && d < 18 && w * d > 1) {
      const shadow = road(
        (c.minX + c.maxX) / 2,
        (c.minZ + c.maxZ) / 2,
        w + 1.1,
        d + 1.1,
        contactMat,
      );
      shadow.position.y = -0.012;
    }
  }
  const puddleC = canvas(256),
    puc = puddleC.getContext('2d')!;
  puc.fillStyle = '#000';
  puc.fillRect(0, 0, 256, 256);
  puc.filter = 'blur(7px)';
  puc.fillStyle = '#fff';
  puc.beginPath();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2,
      r = 85 + rand() * 26,
      xx = 128 + Math.cos(a) * r,
      yy = 128 + Math.sin(a) * r * 0.65;
    if (i === 0) puc.moveTo(xx, yy);
    else puc.lineTo(xx, yy);
  }
  puc.closePath();
  puc.fill();
  puc.filter = 'none';
  for (let i = 0; i < 180; i++) {
    puc.fillStyle = 'rgba(0,0,0,.25)';
    puc.fillRect(
      rand() * 256,
      rand() * 256,
      rand() * 24 + 3,
      0.7 + rand() * 1.5,
    );
  }
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x677774,
    alphaMap: texture(puddleC),
    transparent: true,
    opacity: 0.38,
    alphaTest: 0.012,
    roughness: 0.21,
    metalness: 0.44,
    depthWrite: false,
  });
  for (const [x, z, w, d] of [
    [-3.3, -10, 2.4, 4.2],
    [3.1, -20, 2.2, 3.4],
    [0.3, -34, 2.7, 3.1],
  ]) {
    const puddle = road(x, z, w, d, puddleMat, rand() * 0.7 - 0.35);
    puddle.position.y = -0.008;
  }
  // Drain covers have real slot relief and sit at pavement grade.
  for (const z of [-2, -21, -38]) {
    box(black, 3.75, 0.005, z, 0.55, 0.018, 1.35);
    for (let k = -0.55; k < 0.56; k += 0.12)
      box(edge, 3.75, 0.02, z + k, 0.49, 0.028, 0.037);
  }

  const glowC = canvas(128),
    gc = glowC.getContext('2d')!;
  const gg = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
  gg.addColorStop(0, 'rgba(255,255,255,1)');
  gg.addColorStop(0.13, 'rgba(255,247,222,.7)');
  gg.addColorStop(0.35, 'rgba(255,222,177,.15)');
  gg.addColorStop(1, 'rgba(255,220,150,0)');
  gc.fillStyle = gg;
  gc.fillRect(0, 0, 128, 128);
  const glowT = texture(glowC);
  const glowMat = new THREE.SpriteMaterial({
    map: glowT,
    color: 0xffc478,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coolGlowMat = glowMat.clone();
  coolGlowMat.color.setHex(0xaee5ff);
  const warmLamp = new THREE.MeshStandardMaterial({
      color: 0xffe5b0,
      emissive: 0xffba5b,
      emissiveIntensity: 5,
      roughness: 0.2,
    }),
    coolLamp = new THREE.MeshStandardMaterial({
      color: 0xdaefff,
      emissive: 0x99d4ff,
      emissiveIntensity: 4,
      roughness: 0.2,
    });
  function lamp(x: number, z: number, h: number, warm = true, shadow = false) {
    const pole = steel;
    box(pole, x, h / 2, z, 0.16, h, 0.16);
    box(pole, x, h, z, 0.8, 0.13, 0.14);
    box(black, x, h - 0.05, z, 0.76, 0.23, 0.43);
    box(warm ? warmLamp : coolLamp, x, h - 0.185, z, 0.65, 0.025, 0.34);
    const glow = new THREE.Sprite(warm ? glowMat : coolGlowMat);
    glow.position.set(x, h - 0.18, z);
    glow.scale.set(1.6, 1.6, 1);
    scene.add(glow);
    const l = new THREE.SpotLight(
      warm ? 0xffd6a7 : 0x96d7ff,
      warm ? 1825 : 420,
      28,
      Math.PI * 0.34,
      0.6,
      1.65,
    );
    l.position.set(x, h - 0.22, z);
    l.target.position.set(warm ? x * 0.4 : x * 0.76, 0, warm ? z + 2 : z - 1);
    l.castShadow = shadow;
    if (shadow) {
      l.shadow.mapSize.set(1024, 1024);
      l.shadow.normalBias = 0.035;
      l.shadow.bias = -0.0001;
    }
    scene.add(l, l.target);
  }
  lamp(-8.5, -12, 8.8, true, true);
  lamp(10, 1.7, 9.4, false, false);
  lamp(7, -32, 10, true, false);
  lamp(-20, -30, 10, false, false);
  lamp(21, -20, 12, true, false);
  for (const x of [-17, -8, 1, 10, 19]) {
    box(warmLamp, x, 6.85, -41.6, 1.15, 0.12, 0.22);
    const p = new THREE.PointLight(0xffb466, 72, 12, 1.7);
    p.position.set(x, 5.8, -40.9);
    scene.add(p);
  }
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff5029 });
  const beacons: ThreeType.Mesh[] = [];
  for (const [x, y, z] of [
    [-31, 36, -48],
    [39, 46, -67],
  ]) {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      beaconMat.clone(),
    );
    b.position.set(x, y, z);
    scene.add(b);
    beacons.push(b);
  }

  // Ground reflections: soft elongated pools help read water without an extra scene render.
  const reflectC = canvas(256, 512),
    refc = reflectC.getContext('2d')!;
  refc.save();
  refc.scale(1, 2);
  const rg = refc.createRadialGradient(128, 128, 5, 128, 128, 125);
  rg.addColorStop(0, 'rgba(255,255,255,.85)');
  rg.addColorStop(0.2, 'rgba(255,255,255,.47)');
  rg.addColorStop(0.7, 'rgba(255,255,255,.1)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  refc.fillStyle = rg;
  refc.fillRect(0, 0, 256, 256);
  refc.restore();
  for (let i = 0; i < 250; i++) {
    refc.clearRect(
      rand() * 256,
      rand() * 512,
      rand() * 75 + 8,
      rand() * 3 + 0.7,
    );
  }
  const reflectT = texture(reflectC);
  const reflectMat = new THREE.MeshBasicMaterial({
    map: reflectT,
    color: 0xeac69a,
    transparent: true,
    opacity: 0.19,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const [x, z, w, d] of [
    [-3.4, -9, 2.4, 8],
    [2.8, -28, 2.1, 7],
    [-17, -37, 1.2, 5],
    [1, -37, 1.2, 5],
    [8.4, -17, 1.8, 7],
  ]) {
    const reflection = road(x, z, w, d, reflectMat);
    reflection.position.y = 0.009;
  }
  const coolReflect = reflectMat.clone();
  coolReflect.color.setHex(0x92b2bf);
  coolReflect.opacity = 0.1;
  road(10, 5, 4, 12, coolReflect);

  // Tension cables use smooth curves with convincing sag.
  const cableMat = mat('cable', 0x121e25, 0.85, 0.4);
  function cable(a: ThreeType.Vector3, b: ThreeType.Vector3, sag: number) {
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.TubeGeometry(curve, 22, 0.025, 4, false);
    scene.add(new THREE.Mesh(geo, cableMat));
  }
  cable(
    new THREE.Vector3(-8.5, 8.4, -12),
    new THREE.Vector3(-20, 9.6, -30),
    1.4,
  );
  cable(new THREE.Vector3(10, 9, 1.7), new THREE.Vector3(21, 11.6, -20), 1.4);
  cable(new THREE.Vector3(-20, 9.7, -30), new THREE.Vector3(7, 9.6, -32), 2.3);

  // Animate light rain in one draw call. Its very low opacity keeps the view readable.
  const rainCount = 900,
    rainPositions = new Float32Array(rainCount * 6),
    rainData: { x: number; y: number; z: number; speed: number }[] = [];
  for (let i = 0; i < rainCount; i++)
    rainData.push({
      x: rand() * 62 - 31,
      y: rand() * 20,
      z: rand() * 70 - 46,
      speed: 9 + rand() * 6,
    });
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(rainPositions, 3),
  );
  const rain = new THREE.LineSegments(
    rainGeometry,
    new THREE.LineBasicMaterial({
      color: 0x9bbbcb,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    }),
  );
  rain.frustumCulled = false;
  scene.add(rain);

  // Flush shared geometry. Most visible surface detail costs only one draw per finish.
  for (const [material, entries] of batches)
    for (const b of entries) {
      const mesh = new THREE.InstancedMesh(
        b.geometry,
        material,
        b.matrices.length,
      );
      b.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
    }
  return {
    colliders,
    groundMaterial,
    spawnPoints: [
      { x: 1, z: -17 },
      { x: -8, z: -23 },
      { x: 7, z: -29 },
      { x: 10, z: -14 },
      { x: -6, z: -32 },
      { x: 0, z: -38 },
    ],
    update(dt: number, time: number) {
      for (let i = 0; i < rainCount; i++) {
        const p = rainData[i];
        p.y -= dt * p.speed;
        p.x -= dt * 0.9;
        if (p.y < 0) {
          p.y = 20;
          p.x = rand() * 62 - 31;
        }
        const k = i * 6;
        rainPositions[k] = p.x;
        rainPositions[k + 1] = p.y;
        rainPositions[k + 2] = p.z;
        rainPositions[k + 3] = p.x + 0.06;
        rainPositions[k + 4] = p.y + 0.52;
        rainPositions[k + 5] = p.z + 0.01;
      }
      (
        rainGeometry.attributes.position as ThreeType.BufferAttribute
      ).needsUpdate = true;
      beacons.forEach((b, i) => {
        (b.material as ThreeType.MeshBasicMaterial).color.setHex(
          Math.sin(time * 2.4 + i) > 0.3 ? 0xff6535 : 0x421a16,
        );
      });
    },
  };
}
