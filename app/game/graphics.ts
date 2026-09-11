export type GraphicsPreset = 'low' | 'medium' | 'high';

export type GraphicsProfile = {
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  rainCount: number;
};

const profiles: Record<GraphicsPreset, GraphicsProfile> = {
  low: {
    pixelRatio: 0.75,
    shadows: false,
    shadowMapSize: 512,
    rainCount: 250,
  },
  medium: {
    pixelRatio: 1,
    shadows: true,
    shadowMapSize: 1024,
    rainCount: 550,
  },
  high: {
    pixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    rainCount: 900,
  },
};

export const getGraphicsProfile = (preset: GraphicsPreset): GraphicsProfile =>
  profiles[preset];
