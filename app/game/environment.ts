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
  const doors: {
    group: ThreeType.Object3D;
    x: number;
    z: number;
    side: number;
    half: number;
    plane: 'x' | 'z';
  }[] = [];
  const rooms: {
    roomId: string;
    light: ThreeType.PointLight;
    led: ThreeType.Mesh;
    on: boolean;
    side: number;
    x: number;
    z: number;
    switch: { x: number; y: number; z: number };
  }[] = [];
  const notebooks: { roomId: string; x: number; y: number; z: number }[] = [];

  const corridorWidth = 3;
  const roomDepth = 5.5;
  const roomWidth = 7;
  const ceilingHeight = 3;
  const panelH = 2.4;
  const doorHalf = 0.6;
  const roomCenters = [9, -4, -17];
  const ROOM_IDS = ['W1', 'W2', 'W3', 'E1', 'E2', 'E3'];

  const plaques: {
    roomId: string;
    text: string;
    x: number;
    y: number;
    z: number;
    setText(t: string): void;
  }[] = [];
  const makePlaque = (
    roomId: string,
    x: number,
    y: number,
    z: number,
    rotY: number,
  ) => {
    let ctx: CanvasRenderingContext2D | null = null;
    let mat: ThreeType.Material;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      ctx = canvas.getContext('2d');
      const tex = new THREE.CanvasTexture(canvas);
      mat = new THREE.MeshBasicMaterial({ map: tex });
    } else {
      mat = new THREE.MeshBasicMaterial({ color: 0x0b3d2e });
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.4), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
    const entry = {
      roomId,
      text: '',
      x,
      y,
      z,
      setText(t: string) {
        entry.text = t;
        if (!ctx) return;
        ctx.fillStyle = '#04120d';
        ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = '#5cffb0';
        ctx.font = 'bold 30px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(t.slice(0, 14).toUpperCase(), 128, 42);
        const m = mat as ThreeType.MeshBasicMaterial;
        if (m.map) m.map.needsUpdate = true;
      },
    };
    plaques.push(entry);
    return entry;
  };

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a0,
    roughness: 0.92,
  });
  const corridorWallMat = new THREE.MeshStandardMaterial({
    color: 0x565c62,
    roughness: 0.92,
  });
  const baseboardMat = new THREE.MeshStandardMaterial({
    color: 0x353b3f,
    roughness: 0.7,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x5f6668,
    roughness: 0.95,
  });
  const ceilMat = new THREE.MeshStandardMaterial({
    color: 0xd7dad8,
    roughness: 0.96,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x232c30,
    transparent: true,
    opacity: 0.72,
    roughness: 0.45,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x6b4a2f,
    roughness: 0.85,
  });
  const woodEdgeMat = new THREE.MeshStandardMaterial({
    color: 0x4a2f1c,
    roughness: 0.8,
  });
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0xc8c2b4,
    roughness: 0.35,
    metalness: 0.85,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x24282c,
    roughness: 0.45,
    metalness: 0.6,
  });
  const switchMat = new THREE.MeshStandardMaterial({
    color: 0xf2f3ee,
    roughness: 0.5,
    metalness: 0.05,
  });
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.6,
  });

  const collider = (
    x: number,
    z: number,
    w: number,
    d: number,
    maxY = ceilingHeight,
  ) =>
    colliders.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      maxY,
    });

  // Static boxes are batched per material into one InstancedMesh each.
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const batches = new Map<ThreeType.Material, ThreeType.Matrix4[]>();
  const scratch = new THREE.Object3D();
  const box = (
    material: ThreeType.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    ry = 0,
  ) => {
    scratch.position.set(x, y, z);
    scratch.rotation.set(0, ry, 0);
    scratch.scale.set(w, h, d);
    scratch.updateMatrix();
    let list = batches.get(material);
    if (!list) {
      list = [];
      batches.set(material, list);
    }
    list.push(scratch.matrix.clone());
  };

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 54), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -11);
  floor.receiveShadow = true;
  floor.matrixAutoUpdate = false;
  floor.updateMatrix();
  scene.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(40, 54), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, ceilingHeight, -11);
  ceil.matrixAutoUpdate = false;
  ceil.updateMatrix();
  scene.add(ceil);

  const halfCorridor = corridorWidth / 2;
  const xFar = halfCorridor + roomDepth;

  for (const side of [-1, 1]) {
    for (let ri = 0; ri < roomCenters.length; ri++) {
      const center = roomCenters[ri];
      const roomId = ROOM_IDS[side === 1 ? ri + 3 : ri];
      const z0 = center - roomWidth / 2;
      const z1 = center + roomWidth / 2;
      const xCenter = side * (halfCorridor + roomDepth / 2);
      box(wallMat, side * xFar, ceilingHeight / 2, center, 0.3, ceilingHeight, roomWidth);
      box(wallMat, xCenter, ceilingHeight / 2, z0, roomDepth, ceilingHeight, 0.3);
      box(wallMat, xCenter, ceilingHeight / 2, z1, roomDepth, ceilingHeight, 0.3);
      box(baseboardMat, side * (xFar - 0.19), 0.07, center, 0.08, 0.14, roomWidth);
      box(baseboardMat, xCenter, 0.07, z0 + 0.19, roomDepth, 0.14, 0.08);
      box(baseboardMat, xCenter, 0.07, z1 - 0.19, roomDepth, 0.14, 0.08);
      collider(side * xFar, center, 0.3, roomWidth);
      collider(xCenter, z0, roomDepth, 0.3);
      collider(xCenter, z1, roomDepth, 0.3);

      // Glass facade with a central hinged door.
      const xFace = side * halfCorridor;
      const panelWidth = roomWidth / 2 - doorHalf;
      const pz0 = center - (doorHalf + panelWidth / 2);
      const pz1 = center + (doorHalf + panelWidth / 2);
      const upperH = ceilingHeight - panelH;
      const upperY = panelH + upperH / 2;

      box(glassMat, xFace, panelH / 2, pz0, 0.05, panelH, panelWidth);
      box(glassMat, xFace, panelH / 2, pz1, 0.05, panelH, panelWidth);
      collider(xFace, pz0, 0.12, panelWidth);
      collider(xFace, pz1, 0.12, panelWidth);
      // Baseboard hides the glass/floor junction.
      box(baseboardMat, xFace, 0.07, pz0, 0.14, 0.14, panelWidth);
      box(baseboardMat, xFace, 0.07, pz1, 0.14, 0.14, panelWidth);
      // Solid wall above the glass, up to the ceiling.
      box(corridorWallMat, xFace, upperY, pz0, 0.3, upperH, panelWidth);
      box(corridorWallMat, xFace, upperY, pz1, 0.3, upperH, panelWidth);
      box(frameMat, xFace, upperY, center, 0.12, upperH, doorHalf * 2);
      box(frameMat, xFace, panelH / 2, center - doorHalf, 0.12, panelH, 0.08);
      box(frameMat, xFace, panelH / 2, center + doorHalf, 0.12, panelH, 0.08);
      box(frameMat, xFace, panelH / 2, z0 + 0.05, 0.18, panelH, 0.18);
      box(frameMat, xFace, panelH / 2, z1 - 0.05, 0.18, panelH, 0.18);

      // Wooden door with a handle.
      const pivot = new THREE.Group();
      pivot.position.set(xFace, 0, center - doorHalf);
      const leaf = new THREE.Mesh(unitBox, woodMat);
      leaf.scale.set(0.06, panelH, doorHalf * 2);
      leaf.position.set(0, panelH / 2, doorHalf);
      const leafEdge = new THREE.Mesh(unitBox, woodEdgeMat);
      leafEdge.scale.set(0.08, 0.09, doorHalf * 2);
      leafEdge.position.set(0, panelH - 0.05, doorHalf);
      const handle = new THREE.Mesh(unitBox, handleMat);
      handle.scale.set(0.03, 0.05, 0.16);
      handle.position.set(-side * 0.06, 1.05, doorHalf * 2 - 0.22);
      pivot.add(leaf, leafEdge, handle);
      scene.add(pivot);
      doors.push({ group: pivot, x: xFace, z: center, side, half: doorHalf, plane: 'x' });

      // Switch on the lateral wall near the door.
      const swZ = z0 + 0.22;
      const sw = new THREE.Mesh(unitBox, switchMat);
      sw.scale.set(0.09, 0.14, 0.05);
      sw.position.set(side * 2.4, 1.25, swZ);
      scene.add(sw);

      const roomX = side * (halfCorridor + roomDepth / 2);
      const roomLight = new THREE.PointLight(0xffe9c8, 7, 9, 2);
      roomLight.position.set(roomX, ceilingHeight - 0.3, center);
      roomLight.visible = false;
      scene.add(roomLight);

      const led = new THREE.Mesh(unitBox, ledMat);
      led.scale.set(0.9, 0.05, 1.8);
      led.position.set(roomX, ceilingHeight - 0.03, center);
      scene.add(led);

      rooms.push({
        roomId,
        light: roomLight,
        led,
        on: true,
        side,
        x: roomX,
        z: center,
        switch: { x: side * 2.4, y: 1.25, z: swZ },
      });

      // Industrial desk with a notebook, facing the door.
      const deskX = roomX;
      box(woodMat, deskX, 0.72, center, 0.9, 0.06, 1.6);
      box(frameMat, deskX - 0.35, 0.36, center - 0.7, 0.08, 0.72, 0.08);
      box(frameMat, deskX + 0.35, 0.36, center - 0.7, 0.08, 0.72, 0.08);
      box(frameMat, deskX - 0.35, 0.36, center + 0.7, 0.08, 0.72, 0.08);
      box(frameMat, deskX + 0.35, 0.36, center + 0.7, 0.08, 0.72, 0.08);
      box(frameMat, deskX - side * 0.05, 0.8, center, 0.3, 0.04, 0.42);
      box(ledMat, deskX + side * 0.1, 0.99, center, 0.03, 0.34, 0.42);
      collider(deskX, center, 1.0, 1.7);
      notebooks.push({ roomId, x: deskX + side * 0.1, y: 0.99, z: center });
      makePlaque(
        roomId,
        side * (halfCorridor - 0.04),
        1.6,
        center + doorHalf + 1.0,
        side === 1 ? -Math.PI / 2 : Math.PI / 2,
      );
    }
    // Corridor side wall segments fill the gaps between rooms.
    for (let i = 0; i < roomCenters.length - 1; i++) {
      const zTop = roomCenters[i] - roomWidth / 2;
      const zBottom = roomCenters[i + 1] + roomWidth / 2;
      box(
        corridorWallMat,
        side * halfCorridor,
        ceilingHeight / 2,
        (zTop + zBottom) / 2,
        0.3,
        ceilingHeight,
        zTop - zBottom,
      );
      collider(side * halfCorridor, (zTop + zBottom) / 2, 0.3, zTop - zBottom);
    }
    // End caps above the first and below the last room.
    const zTopEnd = roomCenters[0] + roomWidth / 2;
    const zBottomEnd = roomCenters[roomCenters.length - 1] - roomWidth / 2;
    box(corridorWallMat, side * halfCorridor, ceilingHeight / 2, zTopEnd + 0.75, 0.3, ceilingHeight, 1.8);
    box(corridorWallMat, side * halfCorridor, ceilingHeight / 2, zBottomEnd - 0.75, 0.3, ceilingHeight, 1.8);
    collider(side * halfCorridor, zTopEnd + 0.75, 0.3, 1.8);
    collider(side * halfCorridor, zBottomEnd - 0.75, 0.3, 1.8);
  }
  // Corridor end wall (south). The north end opens into the spawn room.
  box(corridorWallMat, 0, ceilingHeight / 2, roomCenters[roomCenters.length - 1] - roomWidth / 2 - 1.8, corridorWidth + 0.6, ceilingHeight, 0.3);
  collider(0, roomCenters[roomCenters.length - 1] - roomWidth / 2 - 1.8, corridorWidth + 0.6, 0.3);

  // --- Sala de spawn (norte do corredor), porta de frente para o corredor ---
  const spawnZ = 16.6;
  const spawnHalf = 2;
  const wallZ = roomCenters[0] + roomWidth / 2 + 1.8;
  box(corridorWallMat, -spawnHalf, ceilingHeight / 2, spawnZ, 0.3, ceilingHeight, 4.2);
  box(corridorWallMat, spawnHalf, ceilingHeight / 2, spawnZ, 0.3, ceilingHeight, 4.2);
  box(corridorWallMat, 0, ceilingHeight / 2, spawnZ + 2.1, 2 * spawnHalf + 0.3, ceilingHeight, 0.3);
  collider(-spawnHalf, spawnZ, 0.3, 4.2);
  collider(spawnHalf, spawnZ, 0.3, 4.2);
  collider(0, spawnZ + 2.1, 2 * spawnHalf + 0.3, 0.3);
  const segW = (2 * spawnHalf - doorHalf * 2) / 2;
  box(corridorWallMat, -doorHalf - segW / 2, ceilingHeight / 2, wallZ, segW, ceilingHeight, 0.3);
  box(corridorWallMat, doorHalf + segW / 2, ceilingHeight / 2, wallZ, segW, ceilingHeight, 0.3);
  collider(-doorHalf - segW / 2, wallZ, segW, 0.3);
  collider(doorHalf + segW / 2, wallZ, segW, 0.3);
  box(frameMat, 0, panelH + (ceilingHeight - panelH) / 2, wallZ, doorHalf * 2, ceilingHeight - panelH, 0.12);
  const spawnFloor = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), floorMat);
  spawnFloor.rotation.x = -Math.PI / 2;
  spawnFloor.position.set(0, 0, spawnZ);
  spawnFloor.receiveShadow = true;
  spawnFloor.matrixAutoUpdate = false;
  spawnFloor.updateMatrix();
  scene.add(spawnFloor);
  const spawnCeil = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), ceilMat);
  spawnCeil.rotation.x = Math.PI / 2;
  spawnCeil.position.set(0, ceilingHeight, spawnZ);
  spawnCeil.matrixAutoUpdate = false;
  spawnCeil.updateMatrix();
  scene.add(spawnCeil);
  const spawnPivot = new THREE.Group();
  spawnPivot.position.set(-doorHalf, 0, wallZ);
  const spawnLeaf = new THREE.Mesh(unitBox, woodMat);
  spawnLeaf.scale.set(doorHalf * 2, panelH, 0.06);
  spawnLeaf.position.set(doorHalf, panelH / 2, 0);
  const spawnHandle = new THREE.Mesh(unitBox, handleMat);
  spawnHandle.scale.set(0.16, 0.05, 0.03);
  spawnHandle.position.set(doorHalf * 2 - 0.22, 1.05, 0.06);
  spawnPivot.add(spawnLeaf, spawnHandle);
  scene.add(spawnPivot);
  doors.push({ group: spawnPivot, x: 0, z: wallZ, side: 1, half: doorHalf, plane: 'z' });

  // Corridor ceiling lamps, each with its light directly beneath it.
  const corridorLights: { light: ThreeType.PointLight; z: number }[] = [];
  for (const z of [7, -4, -15]) {
    box(ledMat, 0, ceilingHeight - 0.03, z, 1.4, 0.05, 1.4);
    const p = new THREE.PointLight(0xfff2e0, 7, 13, 2);
    p.position.set(0, ceilingHeight - 0.16, z);
    p.visible = false;
    scene.add(p);
    corridorLights.push({ light: p, z });
  }

  // Flush one InstancedMesh per material.
  for (const [material, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(unitBox, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = material !== glassMat && material !== ledMat;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }

  scene.background = new THREE.Color(0x1b2126);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a4, 0.7));
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const lamp = new THREE.DirectionalLight(0xfff4e2, 0.6);
  lamp.position.set(6, 12, 8);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.camera.left = -30;
  lamp.shadow.camera.right = 30;
  lamp.shadow.camera.top = 30;
  lamp.shadow.camera.bottom = -30;
  lamp.shadow.camera.far = 80;
  scene.add(lamp);

  const spawnPoints = roomCenters.flatMap((center) =>
    [-1, 1].map((side) => ({ x: side * (halfCorridor + roomDepth / 2), z: center })),
  );

  return {
    colliders,
    doors,
    rooms,
    corridorLights,
    notebooks,
    plaques,
    spawn: { x: 0, z: 16.5, yaw: 0 },
    spawnPoints,
    setRainCount(_count: number) {
      // Rain is removed in the office scene.
    },
    setShadowMapSize(size: number) {
      scene.traverse((o) => {
        if (o instanceof THREE.Light && o.castShadow)
          o.shadow.mapSize.set(size, size);
      });
    },
    update(_dt: number, _time: number) {
      // The office is static.
    },
  };
}
