import assert from 'node:assert/strict';
import { getGraphicsProfile } from './app/game/graphics.ts';

const low = getGraphicsProfile('low');
const medium = getGraphicsProfile('medium');
const high = getGraphicsProfile('high');

assert(low.pixelRatio < medium.pixelRatio && medium.pixelRatio < high.pixelRatio);
assert(
  low.shadowMapSize < medium.shadowMapSize &&
    medium.shadowMapSize < high.shadowMapSize,
);
assert(!low.shadows && medium.shadows && high.shadows);
assert(low.rainCount < medium.rainCount && medium.rainCount < high.rainCount);
assert.equal(getGraphicsProfile('medium').bloomStrength, medium.bloomStrength);
console.log('graphics profiles: ok');
