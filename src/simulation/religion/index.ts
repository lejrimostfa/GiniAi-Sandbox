// ============================================================
// Religion Layer — barrel exports
// ============================================================

export type { ReligiousAffiliation, ReligionProfile, ReligionConfig } from './types'
export { AFFILIATIONS, AFFILIATION_EMOJI, AFFILIATION_COLORS, DEFAULT_RELIGION_CONFIG } from './types'
export {
  assignAffiliation,
  initReligionProfile,
  defaultReligionProfile,
  computeDiscriminationExposure,
  updateDiscriminationExposure,
  computeReligionCompatibility,
  computeFertilityModifier,
  transmitReligion,
  getHiringDiscriminationFactor,
  getNetworkSupportBonus,
  processReligionEvolution,
} from './ReligionSystem'
