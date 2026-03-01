/**
 * Seeded PRNG for deterministic simulations.
 * Uses xoshiro128** with splitmix32 seed derivation.
 */

/**
 * splitmix32: derive 32-bit state values from a single seed.
 * @param {number} seed
 * @returns {function} Generator returning successive 32-bit values
 */
function splitmix32(seed) {
  let state = seed | 0;
  return function () {
    state = (state + 0x9e3779b9) | 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/**
 * Convert a string to a numeric seed via simple hash.
 * @param {string} str
 * @returns {number}
 */
function stringToSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Seeded PRNG using xoshiro128** algorithm.
 * Fast, small state (128 bits), well-tested for simulations.
 */
export class SeededRNG {
  /**
   * @param {number|string} seed - Numeric or string seed
   */
  constructor(seed) {
    this._originalSeed = seed;
    const numericSeed = typeof seed === 'string' ? stringToSeed(seed) : seed | 0;
    const gen = splitmix32(numericSeed);
    this._s0 = gen();
    this._s1 = gen();
    this._s2 = gen();
    this._s3 = gen();
    // Ensure non-zero state
    if ((this._s0 | this._s1 | this._s2 | this._s3) === 0) {
      this._s0 = 1;
    }
  }

  /**
   * Get the original seed used to create this RNG.
   * @returns {number|string}
   */
  get seed() {
    return this._originalSeed;
  }

  /**
   * Generate next random float in [0, 1).
   * Replaces Math.random().
   * @returns {number}
   */
  next() {
    const result = Math.imul(this._rotl(Math.imul(this._s1, 5), 7), 9);
    const t = this._s1 << 9;

    this._s2 ^= this._s0;
    this._s3 ^= this._s1;
    this._s1 ^= this._s2;
    this._s0 ^= this._s3;
    this._s2 ^= t;
    this._s3 = this._rotl(this._s3, 11);

    return (result >>> 0) / 4294967296;
  }

  /**
   * Generate a random integer in [0, n).
   * @param {number} n - Upper bound (exclusive)
   * @returns {number}
   */
  nextInt(n) {
    return Math.floor(this.next() * n);
  }

  /**
   * Fisher-Yates in-place shuffle using this RNG.
   * @param {any[]} array - Array to shuffle in place
   * @returns {any[]} The same array, shuffled
   */
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * @private
   */
  _rotl(x, k) {
    return ((x << k) | (x >>> (32 - k))) | 0;
  }
}

/**
 * Create a SeededRNG instance.
 * If no seed is provided, generates a random seed using Math.random()
 * (only for the initial seed generation — all subsequent randomness is deterministic).
 * @param {number|string} [seed] - Optional seed
 * @returns {SeededRNG}
 */
export function createRNG(seed) {
  if (seed === undefined || seed === null) {
    seed = (Math.random() * 2147483647) | 0;
  }
  return new SeededRNG(seed);
}
