export const GARDEN_GROWTH_STAGES = ['growing', 'medium', 'mature'] as const;
export type GardenGrowthStage = typeof GARDEN_GROWTH_STAGES[number];

type GrowthProfile = {
  trunkHeight: number; thickness: number; mainExtension: number; shootExtension: number;
  leafLength: number; trailingTips: number;
  mainBranches: readonly number[] | null;
  shoots: Readonly<Record<number, readonly number[]>> | null;
};

// Stages expose nested parts of one deterministic branch family, not scaled copies.
export const GARDEN_GROWTH: Record<GardenGrowthStage, GrowthProfile> = {
  growing: {
    trunkHeight: .72, thickness: .67, mainExtension: .62, shootExtension: .72,
    leafLength: .92, trailingTips: 1,
    mainBranches: [0, 2, 3, 4, 5, 6, 7, 9], shoots: { 2: [0, 2, 3, 6, 7], 3: [1, 2, 4], 4: [0, 1] },
  },
  medium: {
    trunkHeight: .86, thickness: .84, mainExtension: .81, shootExtension: .86,
    leafLength: .96, trailingTips: 1,
    mainBranches: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11],
    shoots: { 2: [0, 1, 2, 3, 6, 7], 3: [0, 1, 2, 4], 4: [0, 1, 2] },
  },
  mature: {
    trunkHeight: 1, thickness: 1, mainExtension: 1, shootExtension: 1,
    leafLength: 1, trailingTips: 2,
    mainBranches: null, shoots: null,
  },
};

// Approved mature bounds, rounded to 0.001 model units. A shared frame makes growth visible.
export const GARDEN_REFERENCE_FRAME = { width: 9.056, height: 7.633, depth: 6.001, centerY: 3.8054 } as const;
