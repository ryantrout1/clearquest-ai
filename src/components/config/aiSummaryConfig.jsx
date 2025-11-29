/**
 * AI Summary Configuration
 * 
 * Centralized configuration for which questions/categories/packs should get AI summaries.
 * To add more packs or categories, simply edit this config - no code changes needed.
 */

export const QUESTION_SUMMARY_CONFIG = {
  // Categories that should get question-level AI summaries
  // These map to Section.section_name values
  includedCategories: [
    'Law Enforcement Applications',  // Q001 - Applications with other LE agencies
    'Driving Record',                 // Driving questions
  ],
  
  // Specific packs that should get question-level AI summaries
  // These are checked independently of categories
  includedPacks: [
    // LE Applications
    'PACK_LE_APPS',
    'PACK_INTEGRITY_APPS',
    
    // Driving packs
    'PACK_DRIVING_COLLISION_STANDARD',
    'PACK_DRIVING_VIOLATIONS_STANDARD',
    'PACK_DRIVING_DUIDWI_STANDARD',
    'PACK_DRIVING_STANDARD',
  ],
  
  // Optional: Question code range (inclusive)
  // Use 'Q001' to 'Q999' to cover all questions by default
  // This is a safety filter; main filtering is by category/pack
  minQuestionCode: 'Q001',
  maxQuestionCode: 'Q999',
};

/**
 * Check if a question should get an AI summary based on config
 * @param {Object} params
 * @param {string} params.questionCode - Question code like 'Q001'
 * @param {string} params.sectionName - Section name from Section entity
 * @param {string} params.followupPackId - Pack ID if question triggered a follow-up
 * @returns {boolean}
 */
export function shouldSummarizeQuestion({ questionCode, sectionName, followupPackId }) {
  const config = QUESTION_SUMMARY_CONFIG;
  
  // Check question code range
  if (questionCode) {
    if (questionCode < config.minQuestionCode || questionCode > config.maxQuestionCode) {
      return false;
    }
  }
  
  // Check if category matches
  if (sectionName && config.includedCategories.includes(sectionName)) {
    return true;
  }
  
  // Check if pack matches
  if (followupPackId && config.includedPacks.includes(followupPackId)) {
    return true;
  }
  
  return false;
}