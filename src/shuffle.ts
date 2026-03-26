/**
 * Fisher-Yates (Durstenfeld) shuffle.
 * Returns a new uniformly-random permutation of the input array
 * using the provided RNG function.
 *
 * @param array - The array to shuffle (not mutated)
 * @param rng - A function returning a uniform float in [0, 1)
 * @returns A new shuffled array
 */
export function shuffle<T>(array: readonly T[], rng: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
