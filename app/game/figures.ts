// ponytail: paletas dos 4 personagens — FBX em public/characters/*.fbx (Kenney Blocky) tenta carregar via FBXLoader;
// falha silenciosa mantém o humanoide procedural (sem travar build). Troque por GLB otimizado quando quiser.
export const FIGURE_VARIANTS = [
  { id: 'azul', name: 'Azul', shirt: 0x35506b, pants: 0x1c2733, skin: 0xd9b48c },
  { id: 'verde', name: 'Verde', shirt: 0x4f7a5a, pants: 0x2a3325, skin: 0xb98a5e },
  { id: 'vermelho', name: 'Vermelho', shirt: 0x8f3e3e, pants: 0x2b2b33, skin: 0xe8b88a },
  { id: 'roxo', name: 'Roxo', shirt: 0x6b4a8f, pants: 0x23232b, skin: 0xc99878 },
] as const;
export type FigureVariantId = (typeof FIGURE_VARIANTS)[number]['id'];
export const FIGURE_IDS = FIGURE_VARIANTS.map((v) => v.id);
export function variantForId(id: string): FigureVariantId {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FIGURE_VARIANTS[h % FIGURE_VARIANTS.length].id;
}
