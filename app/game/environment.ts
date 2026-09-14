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
    roomId?: string;
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
  const devStations: { x: number; z: number; ry: number; mx: number }[] = [];
  // monitores das salas como meshes individuais (liga/desliga por máquina instalada)
  const roomMonitors: { roomId: string; group: ThreeType.Group }[] = [];

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
      mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    } else {
      mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
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
        ctx.clearRect(0, 0, 256, 64);
        ctx.font = 'bold 30px monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(120,255,190,0.9)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#d8fff0';
        ctx.fillText(t.slice(0, 14).toUpperCase(), 128, 42);
        ctx.shadowBlur = 0;
        const m = mat as ThreeType.MeshBasicMaterial;
        if (m.map) m.map.needsUpdate = true;
      },
    };
    plaques.push(entry);
    return entry;
  };

  const loader = typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
  const applyTex = (mat: ThreeType.MeshStandardMaterial, url: string, repeat: [number, number]) => {
    if (!loader) return;
    loader.load(
      url,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat[0], repeat[1]);
        t.colorSpace = THREE.SRGBColorSpace;
        mat.map = t;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
      },
      undefined,
      () => {},
    );
  };
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a0,
    roughness: 0.92,
  });
  applyTex(wallMat, '/tex/wall_brick_small_stone.png', [2, 1]);
  const corridorWallMat = new THREE.MeshStandardMaterial({
    color: 0x565c62,
    roughness: 0.92,
  });
  applyTex(corridorWallMat, '/tex/wall_timber_structure.png', [1.5, 1]);
  const baseboardMat = new THREE.MeshStandardMaterial({
    color: 0x353b3f,
    roughness: 0.7,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x5f6668,
    roughness: 0.95,
  });
  applyTex(floorMat, '/tex/floor_tiles_tan_small.png', [6, 9]);
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
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x6b4a2f,
    roughness: 0.85,
  });
  applyTex(woodMat, '/tex/door_wood.png', [1, 1]);
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

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 57), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -9.5);
  floor.receiveShadow = true;
  floor.matrixAutoUpdate = false;
  floor.updateMatrix();
  scene.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(40, 57), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, ceilingHeight, -9.5);
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
      // E1 (leste, perto do spawn) é a sala grande de devs: fundo a x=11
      const isDevRoom = side === 1 && ri === 0;
      const farAbs = isDevRoom ? 11 : xFar;
      const farX = side * farAbs;
      box(wallMat, farX, ceilingHeight / 2, center, 0.3, ceilingHeight, roomWidth);
      box(wallMat, xCenter, ceilingHeight / 2, z0, roomDepth, ceilingHeight, 0.3);
      box(wallMat, xCenter, ceilingHeight / 2, z1, roomDepth, ceilingHeight, 0.3);
      box(baseboardMat, side * (farAbs - 0.19), 0.07, center, 0.08, 0.14, roomWidth);
      box(baseboardMat, xCenter, 0.07, z0 + 0.19, roomDepth, 0.14, 0.08);
      box(baseboardMat, xCenter, 0.07, z1 - 0.19, roomDepth, 0.14, 0.08);
      collider(farX, center, 0.3, roomWidth);
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
      doors.push({ group: pivot, x: xFace, z: center, side, half: doorHalf, plane: 'x', roomId });

      // Switch on the lateral wall near the door.
      const swZ = z0 + 0.22;
      const sw = new THREE.Mesh(unitBox, switchMat);
      sw.scale.set(0.09, 0.14, 0.05);
      sw.position.set(side * 2.4, 1.25, swZ);
      scene.add(sw);

      const roomX = side * (halfCorridor + (farAbs - halfCorridor) / 2);
      const roomLight = new THREE.PointLight(0xffe9c8, 14, 18, 2);
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

      // Industrial desk with a notebook, pushed toward the back wall.
      // Notebook keyboard faces the room interior; the lid/back faces the door.
      const deskX = side * (halfCorridor + roomDepth - 2.0);
      box(woodMat, deskX, 0.72, center, 0.9, 0.06, 1.6);
      box(frameMat, deskX - 0.35, 0.36, center - 0.7, 0.08, 0.72, 0.08);
      box(frameMat, deskX + 0.35, 0.36, center - 0.7, 0.08, 0.72, 0.08);
      box(frameMat, deskX - 0.35, 0.36, center + 0.7, 0.08, 0.72, 0.08);
      box(frameMat, deskX + 0.35, 0.36, center + 0.7, 0.08, 0.72, 0.08);
      // monitor individual por sala (vermelho se quebrado, some sem máquina)
      const monGroup = new THREE.Group();
      const monBase = new THREE.Mesh(unitBox, frameMat);
      monBase.scale.set(0.34, 0.03, 0.42);
      monBase.position.set(deskX + side * 0.02, 0.78, center);
      const monScrMat = ledMat.clone();
      const monScr = new THREE.Mesh(unitBox, monScrMat);
      monScr.scale.set(0.03, 0.34, 0.42);
      monScr.position.set(deskX - side * 0.28, 0.99, center);
      monGroup.add(monBase, monScr);
      monGroup.userData.scrMat = monScrMat;
      monGroup.visible = roomId === 'W1'; // W1 vem com PC; demais compram
      scene.add(monGroup);
      roomMonitors.push({ roomId, group: monGroup });
      collider(deskX, center, 1.0, 1.7);
      // ponto de acesso na borda do teclado (lado da sala) — sem precisar atravessar a mesa
      notebooks.push({ roomId, x: deskX - side * 0.62, y: 0.95, z: center });
      // sala de devs: 2 mesas compridas, 6 postos cada (3 por lado) = 12
      if (isDevRoom) {
        for (const tx of [7.6, 9.6]) {
          box(woodMat, tx, 0.72, center, 1.2, 0.06, 4.4);
          for (const lx of [tx - 0.5, tx + 0.5])
            for (const lz of [center - 2, center + 2]) box(woodMat, lx, 0.36, lz, 0.12, 0.72, 0.12);
          box(woodMat, tx, 0.25, center, 1.0, 0.05, 4.0);
          collider(tx, center, 1.2, 4.4, 0.8);
          for (const sx of [tx - 1.0, tx + 1.0])
            for (const sz of [center - 1.6, center, center + 1.6]) {
              box(frameMat, sx, 0.225, sz, 0.45, 0.45, 0.45);
              devStations.push({
                x: sx,
                z: sz,
                ry: sx < tx ? Math.PI / 2 : -Math.PI / 2,
                mx: sx + (sx < tx ? 0.45 : -0.45),
              });
            }
        }
      }
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
  // Corridor end wall (south): single wall shared with reception, door gap.
  // Parede única — sem parede dupla na frente do balcão e sem fuga para fora.
  const southZ = roomCenters[roomCenters.length - 1] - roomWidth / 2 - 1.8;
  const southSegW = (corridorWidth + 0.6 - doorHalf * 2) / 2;
  box(corridorWallMat, -doorHalf - southSegW / 2, ceilingHeight / 2, southZ, southSegW, ceilingHeight, 0.3);
  box(corridorWallMat, doorHalf + southSegW / 2, ceilingHeight / 2, southZ, southSegW, ceilingHeight, 0.3);
  collider(-doorHalf - southSegW / 2, southZ, southSegW, 0.3);
  collider(doorHalf + southSegW / 2, southZ, southSegW, 0.3);
  // continua até as laterais da recepção (sela a fuga por fora)
  const southOuterW = 5 - (doorHalf + southSegW);
  box(corridorWallMat, doorHalf + southSegW + southOuterW / 2, ceilingHeight / 2, southZ, southOuterW, ceilingHeight, 0.3);
  box(corridorWallMat, -doorHalf - southSegW - southOuterW / 2, ceilingHeight / 2, southZ, southOuterW, ceilingHeight, 0.3);
  collider(doorHalf + southSegW + southOuterW / 2, southZ, southOuterW, 0.3);
  collider(-doorHalf - southSegW - southOuterW / 2, southZ, southOuterW, 0.3);
  box(frameMat, 0, panelH + (ceilingHeight - panelH) / 2, southZ, doorHalf * 2, ceilingHeight - panelH, 0.12);
  // porta da recepção (abre por proximidade, igual à do spawn)
  const recPivot = new THREE.Group();
  recPivot.position.set(-doorHalf, 0, southZ);
  const recLeaf = new THREE.Mesh(unitBox, woodMat);
  recLeaf.scale.set(doorHalf * 2, panelH, 0.06);
  recLeaf.position.set(doorHalf, panelH / 2, 0);
  const recHandle = new THREE.Mesh(unitBox, handleMat);
  recHandle.scale.set(0.16, 0.05, 0.03);
  recHandle.position.set(doorHalf * 2 - 0.22, 1.05, 0.06);
  recPivot.add(recLeaf, recHandle);
  scene.add(recPivot);
  doors.push({ group: recPivot, x: 0, z: southZ, side: 1, half: doorHalf, plane: 'z' });

  // --- Recepcao (sul, ponta oposta ao spawn) ---
  const recZ = -27;
  const recHalfX = 5;
  const recHalfZ = 3.5;
  // laterais vão da parede sul até o fundo (sem fresta para fora)
  const recSideD = (recZ - recHalfZ - southZ) * -1;
  const recSideZ = (southZ + (recZ - recHalfZ)) / 2;
  box(corridorWallMat, 0, ceilingHeight / 2, recZ - recHalfZ, recHalfX * 2, ceilingHeight, 0.3);
  box(corridorWallMat, -recHalfX, ceilingHeight / 2, recSideZ, 0.3, ceilingHeight, recSideD);
  box(corridorWallMat, recHalfX, ceilingHeight / 2, recSideZ, 0.3, ceilingHeight, recSideD);
  collider(0, recZ - recHalfZ, recHalfX * 2, 0.3);
  collider(-recHalfX, recSideZ, 0.3, recSideD);
  collider(recHalfX, recSideZ, 0.3, recSideD);
  // balcao largo: 3 postos (PC + interruptor cada)
  const recStations = [-1.8, 0, 1.8];
  box(woodMat, 0, 0.55, recZ - 1.6, 5.4, 1.1, 0.6);
  collider(0, recZ - 1.6, 5.4, 0.6, 1.1);
  for (const bx of [-2, 0, 2])
    box(frameMat, bx, 0.25, recZ + 0.6, 0.5, 0.5, 0.5);
  // luz + painel da recepcao
  box(ledMat, 0, ceilingHeight - 0.03, recZ, 1.8, 0.05, 1.2);
  const recLightMesh = new THREE.PointLight(0xfff2e0, 12, 14, 2);
  recLightMesh.position.set(0, ceilingHeight - 0.16, recZ);
  recLightMesh.visible = false;
  scene.add(recLightMesh);
  (scene as unknown as { __recLight?: ThreeType.PointLight }).__recLight = recLightMesh;
  // TV da senha na parede sul (vira para o balcao)
  const tvCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (tvCanvas) {
    tvCanvas.width = 256;
    tvCanvas.height = 96;
  }
  const tvCtx = tvCanvas?.getContext('2d') ?? null;
  const tvTex = tvCanvas ? new THREE.CanvasTexture(tvCanvas) : null;
  const tvMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.8),
    tvTex
      ? new THREE.MeshBasicMaterial({ map: tvTex, transparent: true })
      : new THREE.MeshBasicMaterial({ color: 0x0b0f12 }),
  );
  tvMesh.position.set(0, 2.1, recZ - recHalfZ + 0.2);
  tvMesh.rotation.y = 0;
  scene.add(tvMesh);
  const setReception = (serving: number | null, waiting: number) => {
    if (!tvCtx || !tvTex) return;
    tvCtx.clearRect(0, 0, 256, 96);
    tvCtx.fillStyle = '#0b0f12';
    tvCtx.fillRect(0, 0, 256, 96);
    tvCtx.fillStyle = '#7fd6c2';
    tvCtx.font = 'bold 40px monospace';
    tvCtx.textAlign = 'center';
    tvCtx.fillText(serving ? `SENHA ${serving}` : 'RECEPÇÃO', 128, 45);
    tvCtx.font = '20px monospace';
    tvCtx.fillStyle = '#d8fff0';
    tvCtx.fillText(`${waiting} NA FILA`, 128, 75);
    tvTex.needsUpdate = true;
  };
  setReception(null, 0);
  // spots da fila (4 banquinhos) + ponto do balcao
  const receptionSpots = [-2.2, -0.7, 0.8, 2.3].map((x) => ({ x, z: recZ + 0.6 }));
  const receptionCounter = { x: 0, z: recZ - 0.7 };
  // 3 interruptores físicos "chamar próximo", um por posto (0.75m do PC)
  const receptionSwitches = recStations.map((sx) => ({ x: sx - 0.75, y: 1.18, z: recZ - 1.32 }));
  for (const sw of receptionSwitches) {
    const swMesh = new THREE.Mesh(unitBox, switchMat);
    swMesh.scale.set(0.12, 0.1, 0.08);
    swMesh.position.set(sw.x, sw.y, sw.z);
    scene.add(swMesh);
    const swLed = new THREE.Mesh(unitBox, ledMat);
    swLed.scale.set(0.06, 0.04, 0.02);
    swLed.position.set(sw.x, sw.y + 0.09, sw.z);
    scene.add(swLed);
  }
  // 3 PCs da recepção (REC, REC2, REC3) em cima do balcão, acesso pela frente
  const recIds = ['REC', 'REC2', 'REC3'];
  recStations.forEach((sx, i) => {
    box(frameMat, sx, 1.12, recZ - 1.6, 0.4, 0.03, 0.3);
    box(ledMat, sx, 1.3, recZ - 1.72, 0.4, 0.35, 0.03);
    notebooks.push({ roomId: recIds[i], x: sx, y: 1.15, z: recZ - 1.32 });
  });
  // porta exclusiva dos bots-clientes na lateral leste (entram pelo lado, não atrás do balcão)
  const botDoorZ = recZ - 0.5;
  const botDoor = { x: recHalfX - 0.8, z: botDoorZ };
  box(frameMat, recHalfX - 0.18, panelH / 2, botDoorZ, 0.1, panelH, doorHalf * 2 + 0.2);
  box(woodMat, recHalfX - 0.26, panelH / 2, botDoorZ, 0.06, panelH, doorHalf * 2);

  // --- Sala de spawn (norte do corredor), porta de frente para o corredor ---
  // ponytail: sala larga (8m): spawnHalf dimensiona laterais + fundo + testeira
  const spawnZ = 16.6;
  const spawnHalf = 4;
  const wallZ = roomCenters[0] + roomWidth / 2 + 1.8;
  box(corridorWallMat, -spawnHalf, ceilingHeight / 2, spawnZ, 0.3, ceilingHeight, 4.2);
  // leste com vão da porta do beco/copa (z 14.9..16.1, alinhado à porta da copa)
  box(corridorWallMat, spawnHalf, ceilingHeight / 2, 14.7, 0.3, ceilingHeight, 0.4);
  box(corridorWallMat, spawnHalf, ceilingHeight / 2, 17.4, 0.3, ceilingHeight, 2.6);
  box(corridorWallMat, 0, ceilingHeight / 2, spawnZ + 2.1, 2 * spawnHalf + 0.3, ceilingHeight, 0.3);
  collider(-spawnHalf, spawnZ, 0.3, 4.2);
  collider(spawnHalf, 14.7, 0.3, 0.4);
  collider(spawnHalf, 17.4, 0.3, 2.6);
  collider(0, spawnZ + 2.1, 2 * spawnHalf + 0.3, 0.3);
  box(frameMat, spawnHalf, panelH + (ceilingHeight - panelH) / 2, 15.5, 0.12, ceilingHeight - panelH, doorHalf * 2);
  // porta leste do spawn → beco → copa (abre por proximidade, igual às outras)
  const spawnEastPivot = new THREE.Group();
  spawnEastPivot.position.set(spawnHalf, 0, 15.5 - doorHalf);
  const spawnEastLeaf = new THREE.Mesh(unitBox, woodMat);
  spawnEastLeaf.scale.set(0.06, panelH, doorHalf * 2);
  spawnEastLeaf.position.set(0, panelH / 2, doorHalf);
  const spawnEastHandle = new THREE.Mesh(unitBox, handleMat);
  spawnEastHandle.scale.set(0.06, 0.05, 0.16);
  spawnEastHandle.position.set(0.06, 1.05, doorHalf * 2 - 0.22);
  spawnEastPivot.add(spawnEastLeaf, spawnEastHandle);
  scene.add(spawnEastPivot);
  doors.push({ group: spawnEastPivot, x: spawnHalf, z: 15.5, side: 1, half: doorHalf, plane: 'x' });
  const segW = (2 * spawnHalf - doorHalf * 2) / 2;
  box(corridorWallMat, -doorHalf - segW / 2, ceilingHeight / 2, wallZ, segW, ceilingHeight, 0.3);
  box(corridorWallMat, doorHalf + segW / 2, ceilingHeight / 2, wallZ, segW, ceilingHeight, 0.3);
  collider(-doorHalf - segW / 2, wallZ, segW, 0.3);
  collider(doorHalf + segW / 2, wallZ, segW, 0.3);
  box(frameMat, 0, panelH + (ceilingHeight - panelH) / 2, wallZ, doorHalf * 2, ceilingHeight - panelH, 0.12);
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

  // --- Copa (nordeste, grande): 4 mesas x 6 cadeiras + TV + balcão da cozinha ---
  // copa x 6..16; beco x 4..6 entre a porta do spawn e a porta da copa
  const copa = { minX: 6, maxX: 16, minZ: 13.5, maxZ: 18.5 };
  const copaDoorZ = 15.5;
  // oeste com vão da porta
  box(corridorWallMat, 6, ceilingHeight / 2, (copa.minZ + copaDoorZ - doorHalf) / 2, 0.3, ceilingHeight, (copaDoorZ - doorHalf) - copa.minZ);
  box(corridorWallMat, 6, ceilingHeight / 2, (copaDoorZ + doorHalf + copa.maxZ) / 2, 0.3, ceilingHeight, copa.maxZ - (copaDoorZ + doorHalf));
  collider(6, (copa.minZ + copaDoorZ - doorHalf) / 2, 0.3, (copaDoorZ - doorHalf) - copa.minZ);
  collider(6, (copaDoorZ + doorHalf + copa.maxZ) / 2, 0.3, copa.maxZ - (copaDoorZ + doorHalf));
  box(frameMat, 6, panelH + (ceilingHeight - panelH) / 2, copaDoorZ, 0.12, ceilingHeight - panelH, doorHalf * 2);
  // leste / norte / sul fechadas
  box(corridorWallMat, 16, ceilingHeight / 2, 16, 0.3, ceilingHeight, 5.3);
  box(corridorWallMat, 11, ceilingHeight / 2, 18.5, 10.3, ceilingHeight, 0.3);
  // sul estendida até x=4: sela o beco (sem fuga para o vazio a leste da E1)
  box(corridorWallMat, 10, ceilingHeight / 2, 13.5, 12, ceilingHeight, 0.3);
  collider(16, 16, 0.3, 5.3);
  collider(11, 18.5, 10.3, 0.3);
  collider(10, 13.5, 12, 0.3);
  // porta da copa (abre por proximidade)
  const copaPivot = new THREE.Group();
  copaPivot.position.set(6, 0, copaDoorZ - doorHalf);
  const copaLeaf = new THREE.Mesh(unitBox, woodMat);
  copaLeaf.scale.set(0.06, panelH, doorHalf * 2);
  copaLeaf.position.set(0, panelH / 2, doorHalf);
  const copaHandle = new THREE.Mesh(unitBox, handleMat);
  copaHandle.scale.set(0.06, 0.05, 0.16);
  copaHandle.position.set(0.06, 1.05, doorHalf * 2 - 0.22);
  copaPivot.add(copaLeaf, copaHandle);
  scene.add(copaPivot);
  doors.push({ group: copaPivot, x: 6, z: copaDoorZ, side: 1, half: doorHalf, plane: 'x' });
  makePlaque('COPA', 5.82, 1.6, copaDoorZ + 1.2, -Math.PI / 2).setText('COPA');
  // sinalização: corredor (antes da porta do spawn) + dentro do spawn (parede leste)
  makePlaque('COPAVIA', -1.0, 1.6, 14.11, Math.PI).setText('COPA VIA SPAWN');
  makePlaque('COPALEST', 3.81, 1.6, 17.2, -Math.PI / 2).setText('COPA A LESTE');
  // 4 mesas grandes (2.4 x 1.2) + 6 cadeiras cada (3 por lado) = 24
  const copaChairs: { x: number; z: number; ry: number }[] = [];
  for (const [tx, tz] of [[8.5, 15], [12.5, 15], [8.5, 17.2], [12.5, 17.2]] as const) {
    box(woodMat, tx, 0.72, tz, 2.4, 0.08, 1.2);
    for (const lx of [tx - 0.9, tx + 0.9])
      for (const lz of [tz - 0.45, tz + 0.45]) box(woodMat, lx, 0.36, lz, 0.12, 0.72, 0.12);
    collider(tx, tz, 2.4, 1.2, 0.8);
    for (const cx of [tx - 0.7, tx, tx + 0.7]) {
      // lado sul (de frente p/ mesa)
      box(woodEdgeMat, cx, 0.225, tz - 0.95, 0.45, 0.45, 0.45);
      copaChairs.push({ x: cx, z: tz - 0.95, ry: 0 });
      // lado norte
      box(woodEdgeMat, cx, 0.225, tz + 0.95, 0.45, 0.45, 0.45);
      copaChairs.push({ x: cx, z: tz + 0.95, ry: Math.PI });
    }
  }
  // balcão da cozinha (leste) + ponto das cozinheiras — cantina viva
  box(woodMat, 14.6, 0.5, 16, 0.8, 1.0, 3.0);
  collider(14.6, 16, 0.8, 3.0, 1.0);
  // fogão (preto) + panelas + pilha de pratos no balcão
  box(frameMat, 14.6, 0.9, 15.2, 0.6, 0.2, 0.5);
  box(new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }), 14.6, 1.05, 15.2, 0.45, 0.08, 0.35);
  for (let i = 0; i < 3; i++) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 12), ceilMat);
    plate.position.set(14.6, 0.72 + i * 0.05, 16.6);
    scene.add(plate);
  }
  // vapor (partículas brancas que sobem — animadas no engine)
  const copaVapor = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }),
    );
    puff.position.set(14.6 + (Math.random() - 0.5) * 0.3, 1.2 + i * 0.18, 15.2 + (Math.random() - 0.5) * 0.2);
    puff.userData.baseY = puff.position.y;
    puff.userData.phase = Math.random() * Math.PI * 2;
    copaVapor.add(puff);
  }
  scene.add(copaVapor);
  const copaCounter = { x: 15.4, z: 16 };
  // TV grande na parede norte (tela de vídeo HTML5 + equalizador via engine)
  const tvFrame = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 2.0, 0.1),
    frameMat,
  );
  tvFrame.position.set(11, 1.9, 18.42);
  scene.add(tvFrame);

  // tela de vídeo (HTML5 <video> → CanvasTexture) — guard para SSR/verify
  let video: HTMLVideoElement | null = null;
  let videoCanvas: HTMLCanvasElement | null = null;
  let videoCtx: CanvasRenderingContext2D | null = null;
  let videoTex: ThreeType.CanvasTexture | null = null;
  let videoScreen: ThreeType.Mesh;
  if (typeof document !== 'undefined') {
    const v = document.createElement('video');
    v.src = '/copa-video.mp4';
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    video = v;
    const vc = document.createElement('canvas');
    vc.width = 512;
    vc.height = 288;
    videoCanvas = vc;
    videoCtx = vc.getContext('2d')!;
    videoTex = new THREE.CanvasTexture(vc);
    videoTex.colorSpace = THREE.SRGBColorSpace;
    videoScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 1.7),
      new THREE.MeshBasicMaterial({ map: videoTex, transparent: true }),
    );
    videoScreen.userData = { video, videoCanvas, videoCtx, videoTex, playing: false };
  } else {
    videoScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 1.7),
      new THREE.MeshBasicMaterial({ color: 0x0b0f12 }),
    );
    videoScreen.userData = { video: null, videoCanvas: null, videoCtx: null, videoTex: null, playing: false };
  }
  videoScreen.position.set(11, 1.9, 18.34);
  videoScreen.rotation.y = Math.PI;
  scene.add(videoScreen);

  // Switch ao lado da TV (direita) — liga/desliga vídeo + áudio
  const switchGroup = new THREE.Group();
  const switchBase = new THREE.Mesh(unitBox, frameMat);
  switchBase.scale.set(0.12, 0.18, 0.08);
  switchBase.position.set(0, 0, 0);
  const switchToggle = new THREE.Mesh(unitBox, ledMat);
  switchToggle.scale.set(0.06, 0.12, 0.06);
  switchToggle.position.set(0, 0.16, 0.06);
  switchGroup.add(switchBase, switchToggle);
  switchGroup.position.set(12.8, 1.9, 18.35);
  switchGroup.userData = { isSwitch: true, target: 'copaTV', toggle: switchToggle, state: false };
  scene.add(switchGroup);

  const copaTV = { x: 11, y: 1.9, z: 18.34, videoScreen, switchGroup };
  // luz da copa (acende por proximidade, igual corredor)
  box(ledMat, 11, ceilingHeight - 0.03, 16, 1.8, 0.05, 1.2);
  const copaLight = new THREE.PointLight(0xfff2e0, 14, 14, 2);
  copaLight.position.set(11, ceilingHeight - 0.16, 16);
  copaLight.visible = false;
  scene.add(copaLight);

  // Corridor ceiling lamps, each with its light directly beneath it.
  const corridorLights: { light: ThreeType.PointLight; z: number }[] = [];
  corridorLights.push({ light: copaLight, z: 16 });
  for (const z of [7, -4, -15]) {
    box(ledMat, 0, ceilingHeight - 0.03, z, 1.4, 0.05, 1.4);
    const p = new THREE.PointLight(0xfff2e0, 11, 13, 2);
    p.position.set(0, ceilingHeight - 0.16, z);
    p.visible = false;
    scene.add(p);
    corridorLights.push({ light: p, z });
  }
  // ponytail: luz do lobby spawn (estava escuro) + recepcao sul
  box(ledMat, 0, ceilingHeight - 0.03, spawnZ, 1.4, 0.05, 1.4);
  const spawnLight = new THREE.PointLight(0xfff2e0, 10, 12, 2);
  spawnLight.position.set(0, ceilingHeight - 0.16, spawnZ);
  spawnLight.visible = false;
  scene.add(spawnLight);
  corridorLights.push({ light: spawnLight, z: spawnZ });
  const recLight = (scene as unknown as { __recLight?: ThreeType.PointLight }).__recLight;
  if (recLight) corridorLights.push({ light: recLight, z: recZ });

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

  // --- Kit office 3D — loadOfficeKit (GLTF+DRACO, fallback caixa, colisores) ---
  // ponytail: colisores já aqui para física funcionar mesmo se GLB 404
  const officeEntries: {
    side: number;
    center: number;
    deskX: number;
    chairX: number;
    shelfX: number;
    shelfZ: number;
    plantX: number;
    plantZ: number;
  }[] = [];
  for (const side of [-1, 1] as const) {
    for (let ri = 0; ri < roomCenters.length; ri++) {
      const center = roomCenters[ri];
      const isDevRoom = side === 1 && ri === 0;
      if (isDevRoom) continue; // sala dev já tem 2 mesas longas próprias
      const farAbs = xFar; // 7m (halfCorridor+roomDepth)
      const deskX = side * (farAbs - 1.2); // farWall-1.2
      const chairX = deskX - side * 0.9; // cadeira +0.9 em frente ao tampo
      const shelfX = side * (halfCorridor + roomDepth * 0.32);
      const shelfZ = center + roomWidth / 2 - 0.75; // lateral
      const plantX = side * (farAbs - 0.5);
      const plantZ = center - roomWidth / 2 + 0.6; // canto
      officeEntries.push({ side, center, deskX, chairX, shelfX, shelfZ, plantX, plantZ });
      collider(deskX, center, 1.4, 0.9, 0.8);
      collider(chairX, center, 0.5, 0.5, 0.9);
      collider(shelfX, shelfZ, 1.2, 0.35, 1.8);
      collider(plantX, plantZ, 0.45, 0.45, 1.0);
    }
  }

  const loadOfficeKit = async () => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    let deskGltf: any = null;
    let chairGltf: any = null;
    let shelfGltf: any = null;
    let plantGltf: any = null;
    try {
      const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/loaders/DRACOLoader.js'),
      ]);
      const draco = new (DRACOLoader as any)();
      draco.setDecoderPath('/draco/');
      const gltfLoader = new (GLTFLoader as any)();
      gltfLoader.setDRACOLoader(draco);
      const load = (url: string) =>
        gltfLoader.loadAsync(url).catch(() => null);
      [deskGltf, chairGltf, shelfGltf, plantGltf] = await Promise.all([
        load('/models/office/desk_L.glb'),
        load('/models/office/chair.glb'),
        load('/models/office/shelf.glb'),
        load('/models/office/plant.glb'),
      ]);
    } catch {
      // rede falhou — fallback caixa abaixo cobre
    }

    const applyShadows = (root: ThreeType.Object3D) => {
      root.traverse((o: any) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
    };

    // Mesas e estantes — Mesh/Group clonado por sala (escala real ~1:1)
    for (const e of officeEntries) {
      // desk
      if (deskGltf?.scene) {
        const g = deskGltf.scene.clone(true) as ThreeType.Group;
        applyShadows(g);
        // GLB placeholder: 1.4x0.08x0.9 centrado; reposiciona topo 0.72
        g.position.set(e.deskX, 0.72, e.center);
        // Kenney kit original já vem orientado; mantem yaw lateral
        g.rotation.y = e.side === 1 ? Math.PI : 0;
        scene.add(g);
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.9), woodMat);
        m.position.set(e.deskX, 0.72, e.center);
        m.castShadow = true;
        m.receiveShadow = true;
        scene.add(m);
      }
      // shelf — encostada na parede lateral
      if (shelfGltf?.scene) {
        const g = shelfGltf.scene.clone(true) as ThreeType.Group;
        applyShadows(g);
        g.position.set(e.shelfX, 0.9, e.shelfZ);
        g.rotation.y = e.side === 1 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(g);
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.35), woodMat);
        m.position.set(e.shelfX, 0.9, e.shelfZ);
        m.castShadow = true;
        m.receiveShadow = true;
        scene.add(m);
      }
    }

    // Cadeiras — InstancedMesh (1 draw call)
    if (officeEntries.length) {
      const chairPos = officeEntries.map((e) => ({
        x: e.chairX,
        z: e.center,
        ry: e.side === 1 ? Math.PI : 0,
      }));
      let chairGeo: ThreeType.BufferGeometry | null = null;
      let chairMat: ThreeType.Material | null = null;
      if (chairGltf?.scene) {
        chairGltf.scene.traverse((o: any) => {
          if (o.isMesh && !chairGeo) {
            chairGeo = o.geometry as ThreeType.BufferGeometry;
            chairMat = o.material as ThreeType.Material;
          }
        });
      }
      if (chairGeo && chairMat) {
        const im = new THREE.InstancedMesh(chairGeo, chairMat, chairPos.length);
        chairPos.forEach((p, i) => {
          scratch.position.set(p.x, 0.25, p.z);
          scratch.rotation.set(0, p.ry, 0);
          scratch.scale.set(1, 1, 1);
          scratch.updateMatrix();
          im.setMatrixAt(i, scratch.matrix);
        });
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        scene.add(im);
      } else {
        const im = new THREE.InstancedMesh(unitBox, woodEdgeMat, chairPos.length);
        chairPos.forEach((p, i) => {
          scratch.position.set(p.x, 0.25, p.z);
          scratch.rotation.set(0, p.ry, 0);
          scratch.scale.set(0.5, 0.5, 0.5);
          scratch.updateMatrix();
          im.setMatrixAt(i, scratch.matrix);
        });
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        scene.add(im);
      }

      // Plantas — InstancedMesh canto
      const plantPos = officeEntries.map((e) => ({ x: e.plantX, z: e.plantZ }));
      let plantGeo: ThreeType.BufferGeometry | null = null;
      let plantMat: ThreeType.Material | null = null;
      if (plantGltf?.scene) {
        plantGltf.scene.traverse((o: any) => {
          if (o.isMesh && !plantGeo) {
            plantGeo = o.geometry as ThreeType.BufferGeometry;
            plantMat = o.material as ThreeType.Material;
          }
        });
      }
      const plantFallbackMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 });
      if (plantGeo && plantMat) {
        const im = new THREE.InstancedMesh(plantGeo, plantMat, plantPos.length);
        plantPos.forEach((p, i) => {
          scratch.position.set(p.x, 0.45, p.z);
          scratch.rotation.set(0, 0, 0);
          scratch.scale.set(1, 1, 1);
          scratch.updateMatrix();
          im.setMatrixAt(i, scratch.matrix);
        });
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        scene.add(im);
      } else {
        const im = new THREE.InstancedMesh(unitBox, plantFallbackMat, plantPos.length);
        plantPos.forEach((p, i) => {
          scratch.position.set(p.x, 0.45, p.z);
          scratch.rotation.set(0, 0, 0);
          scratch.scale.set(0.45, 0.9, 0.45);
          scratch.updateMatrix();
          im.setMatrixAt(i, scratch.matrix);
        });
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        scene.add(im);
      }
    }
  };
  loadOfficeKit().catch(() => {});

  scene.background = new THREE.Color(0x1b2126);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a4, 0.32));
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const lamp = new THREE.DirectionalLight(0xfff4e2, 0.22);
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
    receptionSpots,
    receptionCounter,
    receptionSwitches,
    botDoor,
    devStations,
    roomMonitors,
    copaChairs,
    copaTV,
    copaBounds: copa,
    copaCounter,
    copaVapor,
    setReception,
    spawn: { x: 0, z: 15.6, yaw: 0 },
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
