/**
 * Clarifier Question Builder
 * Builds BI-style factual clarifier questions from fact anchors.
 * NO narrative framing, NO "for your investigator" language.
 */

/**
 * Question templates for different anchor types
 * These are BI-style, direct, factual questions.
 */
const ANCHOR_QUESTION_TEMPLATES = {
  // Agency-related
  agency_type: {
    micro: "What type of agency was it (city police, sheriff's office, state agency, or federal agency)?",
    combined: "what type of agency was it"
  },
  agency_name: {
    micro: "What was the name of that agency?",
    combined: "what was the agency name"
  },
  
  // Position/role
  position: {
    micro: "What position did you apply for?",
    combined: "what position did you apply for"
  },
  
  // Date/time
  month_year: {
    micro: "About what month and year was that?",
    combined: "about what month and year"
  },
  approx_date: {
    micro: "About what month and year did that happen?",
    combined: "about what month and year"
  },
  date: {
    micro: "When did that occur?",
    combined: "when it occurred"
  },
  
  // Location
  location: {
    micro: "Where did that happen?",
    combined: "where it happened"
  },
  location_general: {
    micro: "What city and state was that in?",
    combined: "what city and state"
  },
  
  // Outcome/result
  outcome: {
    micro: "What was the outcome?",
    combined: "what was the outcome"
  },
  consequences: {
    micro: "What were the consequences?",
    combined: "what were the consequences"
  },
  
  // Description
  what_happened: {
    micro: "What happened?",
    combined: "what happened"
  },
  description: {
    micro: "Can you briefly describe what occurred?",
    combined: "what occurred"
  },
  
  // Generic fallback
  default: {
    micro: "Can you provide that information?",
    combined: "that information"
  }
};

/**
 * Multi-instance prefix options
 */
const MULTI_INSTANCE_PREFIXES = [
  "For this incident, ",
  "For this situation, ",
  "Regarding this, "
];

/**
 * Get a random multi-instance prefix
 */
function getMultiInstancePrefix() {
  return MULTI_INSTANCE_PREFIXES[Math.floor(Math.random() * MULTI_INSTANCE_PREFIXES.length)];
}

/**
 * Get question template for an anchor key
 */
function getTemplate(anchorKey, mode = "micro") {
  const template = ANCHOR_QUESTION_TEMPLATES[anchorKey] || ANCHOR_QUESTION_TEMPLATES.default;
  return template[mode] || template.micro;
}

/**
 * Build a micro clarifier question for a single anchor
 * @param {Object} anchor - The anchor definition
 * @param {Object} context - { multiInstance: boolean }
 * @returns {string} The clarifier question
 */
export function buildMicroClarifier(anchor, context = {}) {
  const template = getTemplate(anchor.key, "micro");
  
  if (context.multiInstance && anchor.multiInstanceAware) {
    return getMultiInstancePrefix() + template.toLowerCase();
  }
  
  return template;
}

/**
 * Build a combined clarifier question for multiple anchors
 * @param {Array} anchors - Array of anchor definitions (max 3 recommended)
 * @param {Object} context - { multiInstance: boolean }
 * @returns {string} The combined clarifier question
 */
export function buildCombinedClarifier(anchors, context = {}) {
  if (!anchors || anchors.length === 0) {
    return null;
  }
  
  if (anchors.length === 1) {
    return buildMicroClarifier(anchors[0], context);
  }
  
  // Get combined fragments for each anchor
  const fragments = anchors.map(a => getTemplate(a.key, "combined"));
  
  // Build combined question
  let question;
  if (fragments.length === 2) {
    question = `${fragments[0]} and ${fragments[1]}?`;
  } else {
    // 3+ anchors: use Oxford comma style
    const lastFragment = fragments.pop();
    question = `${fragments.join(", ")}, and ${lastFragment}?`;
  }
  
  // Capitalize first letter
  question = question.charAt(0).toUpperCase() + question.slice(1);
  
  // Add multi-instance prefix if needed
  const hasMultiInstanceAnchor = anchors.some(a => a.multiInstanceAware);
  if (context.multiInstance && hasMultiInstanceAnchor) {
    return getMultiInstancePrefix() + question.charAt(0).toLowerCase() + question.slice(1);
  }
  
  return question;
}

/**
 * Build a clarifier question from anchors based on mode
 * @param {Object} pack - Pack config with factAnchors
 * @param {Array} anchorKeys - Array of anchor keys to ask about (already sorted by priority)
 * @param {string} mode - "micro" or "combined"
 * @param {Object} context - { multiInstance: boolean, topic: string }
 * @returns {string} The clarifier question
 */
export function buildClarifierQuestionFromAnchors(pack, anchorKeys, mode, context = {}) {
  if (!pack?.fact_anchors || !anchorKeys || anchorKeys.length === 0) {
    return null;
  }
  
  // Get anchor definitions for the requested keys
  const anchors = anchorKeys
    .map(key => pack.fact_anchors.find(a => a.key === key))
    .filter(Boolean);
  
  if (anchors.length === 0) {
    return null;
  }
  
  if (mode === "micro") {
    return buildMicroClarifier(anchors[0], context);
  }
  
  // Combined mode - take up to 3 anchors
  const toAsk = anchors.slice(0, 3);
  return buildCombinedClarifier(toAsk, context);
}

/**
 * Compute which anchors are collected and which are missing
 * @param {Object} pack - Pack config with factAnchors
 * @param {Object} instanceState - Current instance state with anchor values
 * @returns {{ collectedAnchors: Object, missingAnchors: Array }}
 */
export function computeAnchorState(pack, instanceState = {}) {
  if (!pack?.fact_anchors || pack.fact_anchors.length === 0) {
    return { collectedAnchors: {}, missingAnchors: [] };
  }
  
  const anchorValues = instanceState.anchors || {};
  const collectedAnchors = {};
  const missingAnchors = [];
  
  // Sort by priority
  const sortedAnchors = [...pack.fact_anchors].sort((a, b) => a.priority - b.priority);
  
  for (const anchor of sortedAnchors) {
    const value = anchorValues[anchor.key];
    if (value !== undefined && value !== null && value !== "") {
      collectedAnchors[anchor.key] = value;
    } else {
      missingAnchors.push(anchor.key);
    }
  }
  
  return { collectedAnchors, missingAnchors };
}

/**
 * Get the topic for a pack (for discretion engine)
 */
export function getPackTopic(packId) {
  if (!packId) return "general";
  
  const topicMap = {
    "PACK_PRIOR_LE_APPS_STANDARD": "prior_apps",
    "PACK_LE_APPS": "prior_apps",
    "PACK_INTEGRITY_APPS": "honesty_integrity",
    "PACK_DOMESTIC_VIOLENCE_STANDARD": "violence_dv",
    "PACK_ASSAULT_STANDARD": "violence_dv",
    "PACK_CHILD_ABUSE_STANDARD": "violence_dv",
    "PACK_DRIVING_DUIDWI_STANDARD": "dui_drugs",
    "PACK_DRUG_USE_STANDARD": "dui_drugs",
    "PACK_DRUG_SALE_STANDARD": "dui_drugs",
    "PACK_PRESCRIPTION_MISUSE_STANDARD": "dui_drugs",
    "PACK_ALCOHOL_STANDARD": "dui_drugs",
    "PACK_DRIVING_COLLISION_STANDARD": "driving",
    "PACK_DRIVING_VIOLATIONS_STANDARD": "driving",
    "PACK_DRIVING_STANDARD": "driving"
  };
  
  return topicMap[packId] || "general";
}

export default {
  buildMicroClarifier,
  buildCombinedClarifier,
  buildClarifierQuestionFromAnchors,
  computeAnchorState,
  getPackTopic
};