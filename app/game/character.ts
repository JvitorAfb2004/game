import type * as ThreeType from 'three';
let operatorTemplate: ThreeType.Group | undefined;
let templateEngine: typeof ThreeType | undefined;

export function createCharacter(
  THREE: typeof ThreeType,
  scene: ThreeType.Scene,
  x: number,
  z: number,
  offset: number,
) {
  if (!operatorTemplate || templateEngine !== THREE) {
    templateEngine = THREE;
    const root = new THREE.Group();
    root.name = 'operator';
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#838d8a';
    ctx.fillRect(0, 0, 128, 128);
    let s = 8193;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 5000; i++) {
      const shade = 60 + Math.floor(rng() * 100);
      ctx.fillStyle = `rgba(${shade},${shade + 3},${shade + 1},.17)`;
      ctx.fillRect(rng() * 128, rng() * 128, rng() * 3 + 0.2, rng() * 2 + 0.2);
    }
    for (let i = 0; i < 55; i++) {
      ctx.fillStyle = i % 3 === 0 ? 'rgba(23,32,33,.18)' : 'rgba(75,82,75,.13)';
      ctx.beginPath();
      const px = rng() * 128,
        py = rng() * 128;
      ctx.ellipse(px, py, rng() * 12 + 2, rng() * 4 + 1, rng() * 6.28, 0, 6.28);
      ctx.fill();
    }
    const fabricTex = new THREE.CanvasTexture(c);
    fabricTex.colorSpace = THREE.SRGBColorSpace;
    fabricTex.wrapS = fabricTex.wrapT = THREE.RepeatWrapping;
    fabricTex.repeat.set(2, 2);
    fabricTex.anisotropy = 4;
    const cloth = new THREE.MeshStandardMaterial({
      color: 0x45504b,
      map: fabricTex,
      roughness: 0.72,
      metalness: 0.02,
    });
    const armor = new THREE.MeshStandardMaterial({
      color: 0x343d36,
      map: fabricTex,
      roughness: 0.63,
      metalness: 0.06,
    });
    const pouch = new THREE.MeshStandardMaterial({
      color: 0x55604c,
      map: fabricTex,
      roughness: 0.85,
      metalness: 0.01,
    });
    const seam = new THREE.MeshStandardMaterial({
      color: 0x191e1c,
      roughness: 0.83,
    });
    const boot = new THREE.MeshStandardMaterial({
      color: 0x1e2526,
      roughness: 0.61,
      metalness: 0.03,
    });
    const gun = new THREE.MeshStandardMaterial({
      color: 0x303738,
      roughness: 0.37,
      metalness: 0.78,
    });
    const gunDark = new THREE.MeshStandardMaterial({
      color: 0x141b1d,
      roughness: 0.49,
      metalness: 0.5,
    });
    const metal = new THREE.MeshStandardMaterial({
      color: 0x68716a,
      roughness: 0.41,
      metalness: 0.8,
    });
    const visor = new THREE.MeshStandardMaterial({
      color: 0x292c28,
      roughness: 0.16,
      metalness: 0.8,
    });
    const orange = new THREE.MeshStandardMaterial({
      color: 0xb25f32,
      map: fabricTex,
      roughness: 0.8,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: 0x7e6754,
      roughness: 0.82,
    });
    const unitBox = new THREE.BoxGeometry(1, 1, 1),
      unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 10),
      sphere = new THREE.SphereGeometry(1, 12, 8);
    type Bins = Map<ThreeType.Material, ThreeType.BufferGeometry[]>;
    const bins = new Map<ThreeType.Group, Bins>();
    const object = new THREE.Object3D();
    const put = (
      parent: ThreeType.Group,
      geo: ThreeType.BufferGeometry,
      material: ThreeType.Material,
      px: number,
      py: number,
      pz: number,
      sx = 1,
      sy = 1,
      sz = 1,
      rx = 0,
      ry = 0,
      rz = 0,
    ) => {
      object.position.set(px, py, pz);
      object.rotation.set(rx, ry, rz);
      object.scale.set(sx, sy, sz);
      object.updateMatrix();
      const g = geo.clone().applyMatrix4(object.matrix);
      let b = bins.get(parent);
      if (!b) {
        b = new Map();
        bins.set(parent, b);
      }
      let geometries = b.get(material);
      if (!geometries) {
        geometries = [];
        b.set(material, geometries);
      }
      geometries.push(g);
    };
    const box = (
      p: ThreeType.Group,
      m: ThreeType.Material,
      xx: number,
      yy: number,
      zz: number,
      w: number,
      h: number,
      d: number,
      rx = 0,
      ry = 0,
      rz = 0,
    ) => put(p, unitBox, m, xx, yy, zz, w, h, d, rx, ry, rz);
    const ellipsoid = (
      p: ThreeType.Group,
      m: ThreeType.Material,
      xx: number,
      yy: number,
      zz: number,
      w: number,
      h: number,
      d: number,
    ) => put(p, sphere, m, xx, yy, zz, w, h, d);
    function roundedBox(w: number, h: number, d: number, round = 0.018) {
      const r = Math.min(round, w * 0.24, h * 0.24, d * 0.24),
        shape = new THREE.Shape();
      shape.moveTo(-w / 2 + r, -h / 2);
      shape.lineTo(w / 2 - r, -h / 2);
      shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      shape.lineTo(w / 2, h / 2 - r);
      shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      shape.lineTo(-w / 2 + r, h / 2);
      shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      shape.lineTo(-w / 2, -h / 2 + r);
      shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: d - 2 * r,
        bevelEnabled: true,
        bevelSegments: 1,
        steps: 1,
        bevelSize: r * 0.6,
        bevelThickness: r,
        curveSegments: 3,
      });
      g.translate(0, 0, -d / 2 + r);
      return g;
    }
    const rb = (
      p: ThreeType.Group,
      m: ThreeType.Material,
      xx: number,
      yy: number,
      zz: number,
      w: number,
      h: number,
      d: number,
      r = 0.018,
      rx = 0,
      ry = 0,
      rz = 0,
    ) => {
      const g = roundedBox(w, h, d, r);
      put(p, g, m, xx, yy, zz, 1, 1, 1, rx, ry, rz);
      g.dispose();
    };
    const limb = (
      p: ThreeType.Group,
      m: ThreeType.Material,
      a: ThreeType.Vector3,
      b: ThreeType.Vector3,
      upperRadius: number,
      lowerRadius: number,
    ) => {
      const v = b.clone().sub(a);
      const g = new THREE.CylinderGeometry(
        upperRadius,
        lowerRadius,
        v.length(),
        10,
        1,
      );
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        v.clone().normalize(),
      );
      const matrix = new THREE.Matrix4().compose(
        a.clone().addScaledVector(v, 0.5),
        q,
        new THREE.Vector3(1, 1, 1),
      );
      g.applyMatrix4(matrix);
      let entries = bins.get(p);
      if (!entries) {
        entries = new Map();
        bins.set(p, entries);
      }
      let list = entries.get(m);
      if (!list) {
        list = [];
        entries.set(m, list);
      }
      list.push(g);
    };
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    const torso = new THREE.Group();
    torso.name = 'torso';
    root.add(torso);
    // Rounded wet-fabric shoulders, natural taper and a separate armored chest.
    ellipsoid(torso, cloth, 0, 1.205, 0, 0.218, 0.284, 0.139);
    rb(torso, armor, 0, 1.234, 0.063, 0.385, 0.375, 0.24, 0.033);
    rb(torso, armor, 0, 1.235, -0.109, 0.37, 0.385, 0.12, 0.025);
    rb(torso, cloth, 0, 0.944, 0, 0.343, 0.182, 0.218, 0.025);
    box(torso, seam, 0, 0.996, 0.02, 0.36, 0.059, 0.265);
    rb(torso, metal, 0.035, 0.998, 0.162, 0.052, 0.041, 0.02, 0.006);
    for (const side of [-1, 1]) {
      box(torso, pouch, side * 0.154, 1.435, -0.001, 0.074, 0.03, 0.235);
      box(torso, seam, side * 0.155, 1.359, 0.192, 0.055, 0.13, 0.024);
      rb(torso, pouch, side * 0.115, 1.128, 0.202, 0.099, 0.176, 0.07, 0.01);
      box(torso, armor, side * 0.115, 1.168, 0.246, 0.09, 0.04, 0.017);
      box(torso, seam, side * 0.115, 1.088, 0.247, 0.078, 0.011, 0.015);
      rb(torso, pouch, side * 0.224, 1.08, 0.021, 0.064, 0.152, 0.141, 0.008);
      box(torso, seam, side * 0.202, 1.019, 0, 0.038, 0.058, 0.29);
    }
    rb(torso, pouch, 0, 1.132, 0.205, 0.092, 0.178, 0.07, 0.01);
    for (const yy of [1.294, 1.322, 1.35])
      box(torso, pouch, 0, yy, 0.195, 0.286, 0.012, 0.015);
    // Upper chest patch, pull tabs and radio hardware make the silhouette read as equipment.
    rb(torso, seam, -0.085, 1.371, 0.205, 0.1, 0.052, 0.012, 0.004);
    box(torso, orange, -0.087, 1.372, 0.213, 0.065, 0.012, 0.007);
    rb(torso, gunDark, 0.17, 1.326, -0.148, 0.082, 0.186, 0.057, 0.006);
    put(
      torso,
      unitCylinder,
      seam,
      0.181,
      1.531,
      -0.15,
      0.004,
      0.233,
      0.004,
      0,
      0,
      -0.08,
    );
    for (let i = 0; i < 6; i++)
      box(torso, gun, 0.17, 1.28 + i * 0.015, -0.18, 0.047, 0.003, 0.006);
    rb(torso, armor, 0, 1.25, -0.192, 0.222, 0.305, 0.112, 0.021);
    for (const xx of [-0.082, 0.082])
      box(torso, seam, xx, 1.25, -0.254, 0.023, 0.26, 0.011);
    ellipsoid(torso, cloth, 0, 1.466, -0.016, 0.089, 0.09, 0.078);

    const head = new THREE.Group();
    head.name = 'head';
    root.add(head);
    ellipsoid(head, seam, 0, 1.596, 0.014, 0.103, 0.139, 0.097);
    ellipsoid(head, skin, 0, 1.59, 0.092, 0.076, 0.055, 0.026);
    rb(head, seam, 0, 1.553, 0.092, 0.152, 0.092, 0.04, 0.016);
    ellipsoid(head, seam, 0, 1.51, 0.04, 0.086, 0.031, 0.062);
    // Helmet is a low rounded shell with a brow, mount and rear retention webbing.
    ellipsoid(head, armor, 0, 1.704, -0.01, 0.135, 0.107, 0.139);
    rb(head, armor, 0, 1.658, 0.013, 0.246, 0.047, 0.232, 0.012);
    rb(head, seam, 0, 1.63, 0.107, 0.194, 0.068, 0.04, 0.012);
    for (const side of [-1, 1]) {
      rb(
        head,
        visor,
        side * 0.047,
        1.636,
        0.135,
        0.078,
        0.045,
        0.014,
        0.01,
        0,
        side * 0.1,
        0,
      );
      rb(
        head,
        gunDark,
        side * 0.125,
        1.641,
        -0.037,
        0.025,
        0.061,
        0.135,
        0.006,
      );
      ellipsoid(head, seam, side * 0.103, 1.573, 0.006, 0.029, 0.066, 0.045);
      box(
        head,
        seam,
        side * 0.094,
        1.539,
        0.026,
        0.011,
        0.075,
        0.013,
        0,
        0,
        side * -0.26,
      );
    }
    rb(head, gun, 0, 1.713, 0.127, 0.049, 0.048, 0.023, 0.006);
    box(head, armor, 0, 1.761, -0.022, 0.034, 0.015, 0.18);
    box(head, seam, 0, 1.707, -0.145, 0.156, 0.028, 0.013);

    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.name = side < 0 ? 'legL' : 'legR';
      leg.position.set(side * 0.103, 0.924, 0);
      root.add(leg);
      limb(
        leg,
        cloth,
        V(0, -0.025, 0),
        V(side * 0.012, -0.387, 0.012),
        0.088,
        0.105,
      );
      ellipsoid(leg, cloth, 0, -0.029, 0, 0.112, 0.118, 0.12);
      rb(leg, pouch, side * 0.079, -0.205, 0.02, 0.056, 0.15, 0.112, 0.012);
      for (const yy of [-0.17, -0.23])
        box(leg, seam, side * 0.109, yy, 0.022, 0.015, 0.01, 0.105);
      const shin = new THREE.Group();
      shin.name = 'shin';
      shin.position.set(side * 0.01, -0.39, 0.02);
      leg.add(shin);
      ellipsoid(shin, cloth, 0, 0, 0, 0.09, 0.104, 0.092);
      rb(shin, boot, 0, 0.002, 0.086, 0.125, 0.128, 0.045, 0.022, 0.1);
      box(shin, seam, 0, 0.017, -0.069, 0.151, 0.033, 0.022);
      limb(
        shin,
        cloth,
        V(0, -0.036, -0.006),
        V(0, -0.342, -0.006),
        0.064,
        0.079,
      );
      for (const yy of [-0.2, -0.275])
        ellipsoid(shin, cloth, 0, yy, -0.003, 0.073, 0.027, 0.078);
      rb(shin, boot, 0, -0.345, 0.013, 0.135, 0.155, 0.16, 0.023);
      rb(shin, boot, 0, -0.44, 0.058, 0.143, 0.115, 0.266, 0.03);
      rb(shin, seam, 0, -0.482, 0.056, 0.151, 0.031, 0.273, 0.007);
      for (let k = 0; k < 5; k++)
        box(
          shin,
          cloth,
          0,
          -0.361 - k * 0.012,
          0.104 + k * 0.006,
          0.068,
          0.009,
          0.014,
        );
      box(shin, seam, 0, -0.353, -0.076, 0.045, 0.083, 0.016);
    }

    function arm(side: number) {
      const g = new THREE.Group();
      g.name = side < 0 ? 'armL' : 'armR';
      g.position.set(side * 0.225, 1.374, 0);
      torso.add(g);
      const shoulder = V(0, 0, 0),
        elbow = V(side * 0.083, -0.264, 0.093),
        wrist = side > 0 ? V(-0.02, -0.55, 0.04) : V(0.02, -0.55, 0.04);
      ellipsoid(g, cloth, 0, -0.025, 0, 0.101, 0.112, 0.11);
      limb(g, cloth, shoulder, elbow, 0.077, 0.091);
      ellipsoid(g, cloth, elbow.x, elbow.y, elbow.z, 0.079, 0.084, 0.078);
      limb(g, cloth, elbow, wrist, 0.065, 0.071);
      rb(
        g,
        boot,
        elbow.x,
        elbow.y - 0.014,
        elbow.z - 0.049,
        0.108,
        0.103,
        0.035,
        0.018,
      );
      rb(g, armor, side * 0.061, -0.041, 0.018, 0.051, 0.111, 0.12, 0.009);
      rb(g, orange, side * 0.09, -0.035, 0.03, 0.016, 0.051, 0.083, 0.003);
      ellipsoid(g, boot, wrist.x, wrist.y, wrist.z, 0.05, 0.058, 0.056);
      for (let k = 0; k < 3; k++)
        rb(
          g,
          boot,
          wrist.x - 0.03 + k * 0.021,
          wrist.y - 0.037,
          wrist.z + 0.023,
          0.019,
          0.034,
          0.036,
          0.005,
        );
      return g;
    }
    arm(-1);
    arm(1);

    // Merge each articulated part by material; clones share all resulting GPU geometry.
    // ponytail: one material per articulated part (8 meshes/char); detail is hidden behind frosted glass anyway
    const dominant = (parent: ThreeType.Group): ThreeType.Material => {
      const n = parent.name;
      if (n === 'torso') return armor;
      if (n === 'head') return seam;
      if (n === 'shin') return boot;
      return cloth;
    };
    for (const [parent, materials] of bins) {
      const all: ThreeType.BufferGeometry[] = [];
      for (const source of materials.values()) all.push(...source);
      materials.clear();
      materials.set(dominant(parent), all);
    }
    for (const [parent, materials] of bins)
      for (const [material, source] of materials) {
        const geometries = source.map((g) => (g.index ? g.toNonIndexed() : g));
        const count = geometries.reduce(
          (total, g) => total + g.attributes.position.count,
          0,
        );
        const positions = new Float32Array(count * 3),
          normals = new Float32Array(count * 3),
          uvs = new Float32Array(count * 2);
        let offset = 0;
        for (const g of geometries) {
          positions.set(g.attributes.position.array, offset * 3);
          normals.set(g.attributes.normal.array, offset * 3);
          if (g.attributes.uv) uvs.set(g.attributes.uv.array, offset * 2);
          offset += g.attributes.position.count;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.BufferAttribute(positions, 3),
        );
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        source.forEach((g) => g.dispose());
        geometries.forEach((g, i) => {
          if (g !== source[i]) g.dispose();
        });
      }
    operatorTemplate = root;
  }
  const group = operatorTemplate.clone(true);
  group.position.set(x, 0, z);
  scene.add(group);
  const legs = [
    group.getObjectByName('legL')!,
    group.getObjectByName('legR')!,
  ] as ThreeType.Group[];
  const arms = [
    group.getObjectByName('armL')!,
    group.getObjectByName('armR')!,
  ] as ThreeType.Group[];
  const torso = group.getObjectByName('torso')!,
    head = group.getObjectByName('head')!;
  return {
    group,
    legs,
    arms,
    torso,
    head,
    update(time: number) {
      const phase = time * 1.6 + offset;
      torso.position.y = Math.sin(phase) * 0.004;
      head.position.y = torso.position.y;
      head.rotation.y = Math.sin(time * 0.63 + offset) * 0.023;
      arms.forEach((arm, i) => {
        arm.rotation.x = Math.sin(time * 1.6 + offset + i * 0.5) * 0.005;
      });
    },
  };
}
