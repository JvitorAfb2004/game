# SDD progress — kit completo (2026-09-14)

Task 1: complete (commits d868a07..e64e553, review clean) — portas trancadas não animam/atravessam
Task 2: complete (commit 3e80136) — luz: texturas sem escurecer (color 0xffffff) + intensidades 2x
Task 3: complete (commit 64e7afd) — kit office GLB com colliders + fallback caixa
Task 3b: complete (commit 6642b34) — laptop procedural 3D, sai 2 retângulos
Task 4: complete (commit eb74034) — NPC não atravessa móveis; raio do player reduz ao agachar
Task 5: complete (commit 7d60bfe) — Blocky FBX a/e/i/m com normalização/cache/fallback; NPC por hash
Task 6: complete (commit pendente) — notices sincronizados, build+tsc+testes verdes

## Pendências conhecidas (verificar visualmente)
- FBX_FACE_OFFSET=0: se os bonecos nascerem de costas, trocar para Math.PI em app/game/figures.ts
- FBX blocky é rígido (sem animação de andar/sentar); humanoide procedural anima. Upgrade: AnimationMixer
- Colisão server-side de móveis não foi adicionada (cliente já bloqueia; server mantém bounds+MAX_STEP)
- public/copa-video.mp4 ausente → TV mostra "Carregando vídeo…"
