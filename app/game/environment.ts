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
  }[] = [];

  const corridorWidth = 3;
  const roomDepth = 5.5;
  const roomWidth = 7;
  const ceilingHeight = 3;
  const panelH = 2.4;
  const doorHalf = 0.6;
  const roomCenters = [10, 1.5, -7, -15.5, -24, -32.5];

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xbfc4c2,
    roughness: 0.92,
  });
  const corridorWallMat = new THREE.MeshStandardMaterial({
    color: 0x565c62,
    roughness: 0.92,
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
    color: 0xbfe3df,
    transparent: true,
    opacity: 0.16,
    roughness: 0.04,
    metalness: 0,
    envMapIntensity: 1.4,
    side: THREE.DoubleSide,
    depthWrite: false,
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
    for (const center of roomCenters) {
      const z0 = center - roomWidth / 2;
      const z1 = center + roomWidth / 2;
      const xCenter = side * (halfCorridor + roomDepth / 2);
      box(wallMat, side * xFar, ceilingHeight / 2, center, 0.3, ceilingHeight, roomWidth);
      box(wallMat, xCenter, ceilingHeight / 2, z0, roomDepth, ceilingHeight, 0.3);
      box(wallMat, xCenter, ceilingHeight / 2, z1, roomDepth, ceilingHeight, 0.3);
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
      // Solid wall above the glass, up to the ceiling.
      box(corridorWallMat, xFace, upperY, pz0, 0.3, upperH, panelWidth);
      box(corridorWallMat, xFace, upperY, pz1, 0.3, upperH, panelWidth);
      box(frameMat, xFace, upperY, center, 0.12, upperH, doorHalf * 2);
      box(frameMat, xFace, panelH / 2, center - doorHalf, 0.12, panelH, 0.08);
      box(frameMat, xFace, panelH / 2, center + doorHalf, 0.12, panelH, 0.08);
      box(frameMat, xFace, panelH / 2, z0 + 0.04, 0.12, panelH, 0.08);
      box(frameMat, xFace, panelH / 2, z1 - 0.04, 0.12, panelH, 0.08);
      // Small light switch inside the room, on the back wall.
      box(switchMat, side * (xFar - 0.2), 1.25, center, 0.05, 0.14, 0.09);

      const pivot = new THREE.Group();
      pivot.position.set(xFace, 0, center - doorHalf);
      const leaf = new THREE.Mesh(unitBox, glassMat);
      leaf.scale.set(0.05, panelH, doorHalf * 2);
      leaf.position.set(0, panelH / 2, doorHalf);
      const leafFrame = new THREE.Mesh(unitBox, frameMat);
      leafFrame.scale.set(0.07, 0.08, doorHalf * 2);
      leafFrame.position.set(0, panelH - 0.05, doorHalf);
      pivot.add(leaf, leafFrame);
      scene.add(pivot);
      doors.push({ group: pivot, x: xFace, z: center, side, half: doorHalf });
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
  // Corridor end walls.
  box(corridorWallMat, 0, ceilingHeight / 2, roomCenters[0] + roomWidth / 2 + 1.8, corridorWidth + 0.6, ceilingHeight, 0.3);
  box(corridorWallMat, 0, ceilingHeight / 2, roomCenters[roomCenters.length - 1] - roomWidth / 2 - 1.8, corridorWidth + 0.6, ceilingHeight, 0.3);
  collider(0, roomCenters[0] + roomWidth / 2 + 1.8, corridorWidth + 0.6, 0.3);
  collider(0, roomCenters[roomCenters.length - 1] - roomWidth / 2 - 1.8, corridorWidth + 0.6, 0.3);

  // Ceiling LED panels.
  for (const center of roomCenters) {
    box(ledMat, 3.4, ceilingHeight - 0.03, center, 0.7, 0.05, 1.4);
    box(ledMat, -3.4, ceilingHeight - 0.03, center, 0.7, 0.05, 1.4);
  }
  for (let z = 10; z > -34; z -= 11)
    box(ledMat, 0, ceilingHeight - 0.03, z, 1.4, 0.05, 1.4);

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
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a4, 2.2));
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  for (const z of [8, -6, -20]) {
    const p = new THREE.PointLight(0xfff2e0, 12, 16, 2);
    p.position.set(0, ceilingHeight - 0.2, z);
    scene.add(p);
  }
  const lamp = new THREE.DirectionalLight(0xfff4e2, 1.2);
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
